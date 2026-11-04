/**
 * 3단계 — AI 매매 시뮬레이션(종목별 시간순, 보유 상태는 메모리).
 *
 * 규칙
 *   포지션 없음: 신호와 무관하게 ENTRY_EVERY 거래일마다 일반 분석(positionBucket 없음). 청산 뒤에도
 *     ENTRY_EVERY일이 지나야 다음 판단. 마지막 TAIL_BARS일은 결과를 볼 수 없어 진입 판단 안 함.
 *     프롬프트 해시를 2단계 저장본과 대조.
 *     entryRecommendation === 'enter' → 그날 종가 매수. SL/TP는 운영 화면 값
 *     (reconciledLevels 우선, 없으면 stopLoss / takeProfitPrices[0]), 무효면 ATR 대체(2×/3×).
 *   보유 중 매일: 장중 SL/TP 판정(같은 봉 동시 도달은 SL 우선, 갭이면 시가 체결).
 *     REVIEW_EVERY 거래일마다 보유 재분석(positionBucket = bucketizePosition(평단, 종가)) —
 *     'avoid'면 종가 AI 매도, 아니면 유효한 새 SL/TP로 갱신. MAX_HOLD 거래일이면 종가 청산.
 *   마지막 날까지 보유 중이면 'open'(종가 평가).
 *
 * AI 호출은 운영 prewarm과 같은 `runAnalysis` 옵션(DeepSeek V4.1 Flash, reasoning off)에
 * 회원 tier(스킬 게이트 전부 활성), cache null(운영 Redis 미접촉), 저장 봉 provider.
 * 응답은 호출마다 data/ai/{T}.json에 저장 — 재실행 시 저장된 응답을 재사용(재개 가능).
 *
 *   npx tsx scripts/backtests/v8/3-run-ai.ts                    # 계획만(호출 없음)
 *   RUN=1 TICKERS=AAPL npx tsx scripts/backtests/v8/3-run-ai.ts # 실행
 *   RUN=1 CONCURRENCY=8 npx tsx scripts/backtests/v8/3-run-ai.ts
 */
import { config } from 'dotenv';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import {
    DEEPSEEK_V4_1_FLASH_MODEL,
    US_EQUITY_SESSION,
    analysisHistoryQuery,
    bucketizePosition,
    runAnalysis,
} from '@y0ngha/siglens-core';
import { toPriorAnalysis } from '@/entities/analysis/lib/toPriorAnalysis';
import type {
    AnalysisResponse,
    AssembledPromptRecord,
    PositionBucket,
    PriorAnalysis,
} from '@y0ngha/siglens-core';
import {
    AI_DIR,
    OUT_DIR,
    TAIL_BARS,
    TICKERS,
    closeInstantOf,
    ensureDirs,
    loadBars,
    loadDataset,
    mapLimit,
    promptHash,
    runAt,
    storedProvider,
    type StoredBars,
    type TickerDataset,
} from './lib';

config({ path: resolve(process.cwd(), '.env.local'), quiet: true });

export const REVIEW_EVERY = Number(process.env.REVIEW_EVERY ?? '1');
export const ENTRY_EVERY = Number(process.env.ENTRY_EVERY ?? '1');
/**
 * 'enter-only': enter일 때만 종가 매수.
 * 'with-wait' : 위 + wait의 조건부 진입 구간(entryPrices)에 지정가 주문. 다음 진입 판단(ENTRY_EVERY일)
 *               전까지 유효. 체결가 = 시가가 구간 안이면 시가, 시가가 구간 위면 구간 상단, 구간 아래로
 *               갭이면 시가. 체결 봉에서 SL에 닿으면 그 봉에 손절(보수적). 운영 프롬프트가 wait에도
 *               조건부 진입가·SL·TP를 강제하므로(Contingent Plan Mandate) 화면 의미와 같다.
 */
export const ENTRY_MODE = (process.env.ENTRY_MODE ?? 'with-wait') as 'enter-only' | 'with-wait';
export const MAX_HOLD = Number(process.env.MAX_HOLD ?? '60');
const CONCURRENCY = Number(process.env.CONCURRENCY ?? '8');
const MAX_ATTEMPTS = 3;

// ─── 저장 형태 ─────────────────────────────────────────────────────────────────
export interface AiCall {
    key: string; // `${date}|${bucket ?? 'none'}|${historyKey}`
    date: string;
    kind: 'entry' | 'review';
    bucket: PositionBucket | null;
    promptHash: string;
    /** entry 호출에서 2단계 저장 프롬프트와 같았는지(review는 null). */
    promptMatchesDataset: boolean | null;
    /** 프롬프트에 결정적 급락 매수 판정("Entry verdict (computed): enter — sell-off path")이 있었는지. */
    sellOffVerdict?: boolean;
    latencyMs: number;
    attempts: number;
    /** 이 호출 프롬프트 후보로 넘긴 이전 분석(운영 DB 조회와 같은 창·개수). core가 이 중 최대 7건을 렌더한다. */
    priorAnalyses: { generatedAt: string; trend: string; riskLevel: string; entryPrices?: readonly number[]; stopLoss?: number; takeProfitPrices?: readonly number[] }[];
    /** 프롬프트 전문 위치: data/ai/prompts/{T}/{promptHash}.json.gz ({ systemHash, dynamic }). */
    promptFile?: string;
    /** DeepSeek HTTP 원문(요청 본문 + 스트림 응답, 재시도 포함): data/ai/raw/{T}/{promptHash16}.json.gz. */
    rawFile?: string;
    error?: string;
    result?: AnalysisResponse;
}
export interface AiFile {
    ticker: string;
    model: string;
    tier: 'member';
    reviewEvery: number;
    maxHold: number;
    calls: Record<string, AiCall>;
}

// [Usage] 로그(core가 토큰 사용량을 찍는다)를 비용 집계용 파일로 뺀다. 패턴 중재 info는 숨김.
const usageLog = resolve(OUT_DIR, 'usage.log');
const origLog = console.log.bind(console);
// core `logUsage`는 console.info('[Usage]', json)로 찍는다(infrastructure/ai/usage.js).
console.info = (...args: unknown[]) => {
    if (String(args[0] ?? '').startsWith('[Usage]'))
        appendFileSync(usageLog, `${String(args[1] ?? '')}\n`);
};

// ─── DeepSeek 원문 요청·응답 캡처 ──────────────────────────────────────────────
// core가 정규화·보정하기 전의 실제 HTTP 요청 본문과 스트림 응답 원문을 남긴다. SDK(openai)는 클라이언트를
// 처음 만들 때 전역 fetch를 잡는데, 클라이언트는 첫 호출 때 만들어지므로 여기서 감싸 두면 된다.
// 어느 분석에서 나간 요청인지는 AsyncLocalStorage로 구분한다(동시 10개가 섞이지 않게).
interface RawExchange {
    url: string;
    method: string;
    requestBody: unknown;
    status: number;
    responseText: string;
    startedAt: string;
    durationMs: number;
}
const rawCtx = new AsyncLocalStorage<{ exchanges: RawExchange[]; pending: Promise<void>[] }>();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const t0 = Date.now();
    const res = await realFetch(input, init);
    const ctx = rawCtx.getStore();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (ctx !== undefined && url.includes('api.deepseek.com')) {
        const clone = res.clone();
        ctx.pending.push(
            clone.text().then(text => {
                let body: unknown = init?.body ?? null;
                if (typeof body === 'string') {
                    try { body = JSON.parse(body); } catch { /* 원문 그대로 */ }
                }
                ctx.exchanges.push({ url, method: init?.method ?? 'GET', requestBody: body, status: res.status, responseText: text, startedAt: new Date(t0).toISOString(), durationMs: Date.now() - t0 });
            }).catch(() => {})
        );
    }
    return res;
}) as typeof fetch;

// ─── 레벨 ──────────────────────────────────────────────────────────────────────
/**
 * 분할 매매 계획. 포지션을 절반(A·B) 둘로 나눈다.
 *   A: tp1(가장 가까운 목표가) 또는 sl1(AI 손절가) 중 먼저 닿는 쪽에서 청산.
 *   B: tpFinal(마지막 목표가)까지 보유. B의 손절선은 A가 열려 있으면 sl1,
 *      A가 tp1에서 익절했으면 max(sl1, 평단)(본전 방어), A가 sl1에서 손절했으면 sl2.
 *   sl2 = AI keyLevels.support 중 sl1 바로 아래 지지선(없으면 sl1 − 1×ATR).
 * AI가 보유자에게 주는 지시("1차에서 부분 익절, 2·3차 목표, 손익분기 방어")를 따른 것이다.
 */
interface Plan {
    tp1: number;
    tpFinal: number;
    sl1: number;
    sl2: number;
    source: 'ai' | 'fallback';
}
function atrOf(indicators: unknown): number | null {
    const v = (indicators as { atr?: unknown } | null)?.atr;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
function derivePlan(r: AnalysisResponse | undefined, ref: number, atr: number | null): Plan | null {
    const a = r?.actionRecommendation;
    const rawTps = a?.reconciledLevels?.takeProfitPrices ?? a?.takeProfitPrices ?? [];
    const tps = [...rawTps].filter(finite).filter(x => x > ref).sort((x, y) => x - y);
    const slRaw = a?.reconciledLevels?.stopLoss ?? a?.stopLoss;
    const sl1Ok = finite(slRaw) && slRaw < ref;
    const supports = (r?.keyLevels?.support ?? []).map(x => x.price).filter(finite);
    if (tps.length > 0 && sl1Ok) {
        const below = supports.filter(p => p < slRaw);
        const sl2 = below.length > 0 ? Math.max(...below) : atr !== null ? slRaw - atr : slRaw * 0.97;
        return { tp1: tps[0], tpFinal: tps[tps.length - 1], sl1: slRaw, sl2, source: 'ai' };
    }
    if (atr === null) return null;
    const sl1 = sl1Ok ? slRaw : ref - 2 * atr;
    return {
        tp1: tps[0] ?? ref + 2 * atr,
        tpFinal: tps[tps.length - 1] ?? ref + 4 * atr,
        sl1,
        sl2: sl1 - atr,
        source: 'fallback',
    };
}
/** 프롬프트의 결정적 급락 매수 판정(LLM이 복사하라고 지시받는 줄). */
const SELL_OFF_VERDICT = 'Entry verdict (computed): enter — sell-off path';
/** 급락 매수 규칙의 청산 창(프롬프트: "first daily close above MA5, or after about 10 trading days"). */
const SELL_OFF_MAX_DAYS = 10;

// ─── AI 호출 ───────────────────────────────────────────────────────────────────
async function analyze(
    s: StoredBars,
    date: string,
    bucket: PositionBucket | null,
    priorAnalyses: readonly PriorAnalysis[]
): Promise<{ result?: AnalysisResponse; prompt?: AssembledPromptRecord; error?: string; attempts: number; latencyMs: number; raw: RawExchange[] }> {
    const t0 = Date.now();
    let lastErr = '';
    const ctx = { exchanges: [] as RawExchange[], pending: [] as Promise<void>[] };
    const raw = async (): Promise<RawExchange[]> => {
        await Promise.all(ctx.pending);
        return ctx.exchanges;
    };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let prompt: AssembledPromptRecord | undefined;
        try {
            const res = await rawCtx.run(ctx, () => runAt(closeInstantOf(date), () =>
                runAnalysis(s.ticker, s.companyName, '1Day', true, undefined, {
                    modelId: DEEPSEEK_V4_1_FLASH_MODEL,
                    skipEnqueueIfMiss: false,
                    marketDataProvider: storedProvider(s.bars, date),
                    assetClass: 'equity',
                    currency: 'USD',
                    tierContext: { userId: null, tier: 'member' },
                    reasoning: false,
                    providerFallback: false,
                    positionBucket: bucket ?? undefined,
                    // 운영 회원 경로(handleTechnicalStream)와 같이 세션·이전 분석을 넘긴다.
                    // 뉴스 이벤트·실적일은 과거 시점 데이터가 없어(시세 API 플랜) 넘기지 않는다.
                    session: US_EQUITY_SESSION,
                    priorAnalyses,
                    cache: null,
                    onPromptAssembled: rec => {
                        prompt = rec;
                    },
                })
            ));
            if (res.status === 'done')
                return { result: res.unfilteredResult, prompt, attempts: attempt, latencyMs: Date.now() - t0, raw: await raw() };
            lastErr = `status=${res.status} ${JSON.stringify((res as { error?: unknown }).error ?? '')}`;
        } catch (e) {
            lastErr = e instanceof Error ? e.message : String(e);
        }
        await new Promise(r => setTimeout(r, 5_000 * attempt));
    }
    return { error: lastErr, attempts: MAX_ATTEMPTS, latencyMs: Date.now() - t0, raw: await raw() };
}

// ─── 시뮬레이션 ────────────────────────────────────────────────────────────────
type LegReason = 'tp1' | 'tp_final' | 'sl1' | 'sl2' | 'breakeven' | 'selloff_ma5' | 'selloff_time' | 'selloff_stop' | 'max_hold' | 'open';
interface Leg {
    name: 'A' | 'B';
    size: number;
    exitIdx?: number;
    exitPrice?: number;
    reason?: LegReason;
}
type EntryType = 'enter_close' | 'enter_selloff' | 'wait_limit';
interface Holding {
    entryIdx: number; // dataset days 인덱스
    entryPrice: number;
    entryType: EntryType;
    /** 진입을 만든 판단일(wait 지정가면 주문일). */
    decisionDate: string;
    plan: Plan;
    initialPlan: Plan;
    legs: [Leg, Leg];
    lastReviewIdx: number;
    reviews: { date: string; bucket: PositionBucket | null; rec: string; planUpdated: boolean }[];
}
export interface Trade {
    ticker: string;
    entryDate: string;
    entryPrice: number;
    entryType: EntryType;
    decisionDate: string;
    /** 마지막 다리가 청산된 날. */
    exitDate: string;
    holdingDays: number;
    /** 두 다리 가중 평균 수익률(%). */
    returnPct: number;
    /** 예: "tp1+tp_final", "sl1+sl2", "tp1+breakeven", "selloff_ma5". */
    exitReason: string;
    legs: { name: 'A' | 'B'; size: number; exitDate: string; exitPrice: number; reason: LegReason; returnPct: number }[];
    initialPlan: Plan;
    finalPlan: Plan;
    reviews: Holding['reviews'];
}
/** 최종 경로에서 실제로 쓰인 AI 호출 한 건(진입 판단·보유 재분석 모두). 공개용 decisions.csv의 원천. */
export interface TimelineEntry {
    date: string;
    ticker: string;
    kind: 'entry' | 'review';
    bucket: PositionBucket | null;
    key: string;
    rec: string;
    sellOff: boolean;
    trend?: string;
    riskLevel?: string;
    entryPrices?: readonly number[];
    stopLoss?: number;
    takeProfitPrices?: readonly number[];
    priorCount: number;
    promptFile?: string;
    rawFile?: string;
    error?: string;
}
/** 포지션 없음 상태의 판단(진입 여부와 무관하게 전부). 4단계가 enter/wait/avoid 적중을 잰다. */
export interface EntryDecision {
    ticker: string;
    date: string;
    close: number;
    rec: string;
    sellOff: boolean;
    error?: string;
}

async function simulateTicker(
    ds: TickerDataset,
    s: StoredBars,
    plan: boolean
): Promise<{ calls: number; reused: number; trades: Trade[]; decisions: EntryDecision[] }> {
    const file = resolve(AI_DIR, `${ds.ticker}.json`);
    const store: AiFile = existsSync(file)
        ? (JSON.parse(readFileSync(file, 'utf-8')) as AiFile)
        : { ticker: ds.ticker, model: DEEPSEEK_V4_1_FLASH_MODEL, tier: 'member', reviewEvery: REVIEW_EVERY, maxHold: MAX_HOLD, calls: {} };
    let calls = 0;
    let reused = 0;

    // 이 종목에서 시뮬레이션이 지금까지 낸 분석(운영 analysis_history 역할). 시간순.
    const history: { generatedAt: Date; result: AnalysisResponse }[] = [];
    const promptDir = resolve(AI_DIR, 'prompts', ds.ticker);
    mkdirSync(promptDir, { recursive: true });
    /** 운영 DrizzleAnalysisHistoryRepository.findRecentForPrompt와 같은 창·개수·제외 규칙. */
    const priorFor = (date: string): PriorAnalysis[] => {
        const now = new Date(closeInstantOf(date));
        const { limit, sinceMs, generatedBeforeMs } = analysisHistoryQuery('1Day', 'technical', now, US_EQUITY_SESSION);
        const since = now.getTime() - sinceMs;
        return history
            .filter(x => x.generatedAt.getTime() >= since && x.generatedAt.getTime() < generatedBeforeMs)
            .toSorted((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())
            .slice(0, limit)
            .map(x => toPriorAnalysis({ result: x.result, generatedAt: x.generatedAt }))
            .filter((x): x is PriorAnalysis => x !== null);
    };
    const sellOffOf = (c: AiCall): boolean => {
        if (c.sellOffVerdict !== undefined) return c.sellOffVerdict;
        if (!c.promptFile) return false;
        const dyn = (JSON.parse(gunzipSync(readFileSync(resolve(AI_DIR, c.promptFile))).toString('utf-8')) as { dynamic: string }).dynamic;
        c.sellOffVerdict = dyn.includes(SELL_OFF_VERDICT);
        return c.sellOffVerdict;
    };

    const timeline: TimelineEntry[] = [];
    const log = (c: AiCall, sellOff: boolean): void => {
        const a = c.result?.actionRecommendation;
        timeline.push({
            date: c.date,
            ticker: ds.ticker,
            kind: c.kind,
            bucket: c.bucket,
            key: c.key,
            rec: a?.entryRecommendation ?? (c.error ? 'ERROR' : '?'),
            sellOff,
            trend: c.result?.trend,
            riskLevel: c.result?.riskLevel,
            entryPrices: a?.entryPrices,
            stopLoss: a?.reconciledLevels?.stopLoss ?? a?.stopLoss,
            takeProfitPrices: a?.reconciledLevels?.takeProfitPrices ?? a?.takeProfitPrices,
            priorCount: c.priorAnalyses.length,
            ...(c.promptFile ? { promptFile: c.promptFile } : {}),
            ...(c.rawFile ? { rawFile: c.rawFile } : {}),
            ...(c.error ? { error: c.error } : {}),
        });
    };
    const call = async (dayIdx: number, kind: 'entry' | 'review', bucket: PositionBucket | null): Promise<{ r?: AnalysisResponse; sellOff: boolean; error?: string }> => {
        const day = ds.days[dayIdx];
        const prior = priorFor(day.date);
        const priorJson = prior.map(x => ({ ...x, generatedAt: x.generatedAt.toISOString() }));
        const historyKey = createHash('sha256').update(JSON.stringify(priorJson)).digest('hex').slice(0, 12);
        const key = `${day.date}|${bucket ?? 'none'}|${historyKey}`;
        const remember = (result: AnalysisResponse | undefined): void => {
            if (result) history.push({ generatedAt: new Date(closeInstantOf(day.date)), result });
        };
        const prev = store.calls[key];
        if (prev?.result) {
            reused++;
            remember(prev.result);
            const so = sellOffOf(prev);
            log(prev, so);
            return { r: prev.result, sellOff: so };
        }
        calls++;
        if (plan) return { sellOff: false };
        const r = await analyze(s, day.date, bucket, prior);
        const hash = r.prompt ? promptHash(r.prompt.system, r.prompt.dynamic) : '';
        let promptFile: string | undefined;
        if (r.prompt) {
            const sysHash = promptHash(r.prompt.system, '');
            const sysFile = resolve(AI_DIR, 'prompts', `system-${sysHash}.txt.gz`);
            if (!existsSync(sysFile)) writeFileSync(sysFile, gzipSync(r.prompt.system));
            promptFile = `prompts/${ds.ticker}/${hash.slice(0, 16)}.json.gz`;
            writeFileSync(resolve(AI_DIR, promptFile), gzipSync(JSON.stringify({ key, systemHash: sysHash, promptVersion: r.prompt.promptVersion, dynamic: r.prompt.dynamic })));
        }
        let rawFile: string | undefined;
        if (r.raw.length > 0) {
            mkdirSync(resolve(AI_DIR, 'raw', ds.ticker), { recursive: true });
            rawFile = `raw/${ds.ticker}/${(hash || createHash('sha256').update(key).digest('hex')).slice(0, 16)}.json.gz`;
            writeFileSync(resolve(AI_DIR, rawFile), gzipSync(JSON.stringify({ key, exchanges: r.raw })));
        }
        const rec: AiCall = {
            key,
            date: day.date,
            kind,
            bucket,
            promptHash: hash,
            // 이력이 들어가면 데이터셋(이력 없음) 프롬프트와 다른 게 정상이다. 이력이 비었을 때만 대조한다.
            promptMatchesDataset: kind === 'entry' && prior.length === 0 ? hash === day.prompt.hash : null,
            sellOffVerdict: r.prompt ? r.prompt.dynamic.includes(SELL_OFF_VERDICT) : false,
            latencyMs: r.latencyMs,
            attempts: r.attempts,
            priorAnalyses: priorJson,
            ...(promptFile !== undefined ? { promptFile } : {}),
            ...(rawFile !== undefined ? { rawFile } : {}),
            ...(r.error !== undefined ? { error: r.error } : {}),
            ...(r.result !== undefined ? { result: r.result } : {}),
        };
        store.calls[key] = rec;
        writeFileSync(file, JSON.stringify(store));
        const rec2 = r.result?.actionRecommendation?.entryRecommendation ?? (r.error ? 'ERROR' : '?');
        origLog(`  [${ds.ticker}] ${day.date} ${kind}${bucket ? `(${bucket})` : ''} prior=${prior.length} → ${rec2}${rec.sellOffVerdict ? '(sell-off)' : ''} ${(r.latencyMs / 1000).toFixed(0)}s${rec.promptMatchesDataset === false ? ' ⚠ prompt drift' : ''}`);
        remember(r.result);
        log(rec, rec.sellOffVerdict ?? false);
        return { r: r.result, sellOff: rec.sellOffVerdict ?? false, ...(r.error !== undefined ? { error: r.error } : {}) };
    };

    const closes = s.bars.map(b => b.close);
    const ma5At = (barIdx: number): number => closes.slice(barIdx - 4, barIdx + 1).reduce((x, y) => x + y, 0) / 5;

    const trades: Trade[] = [];
    const decisions: EntryDecision[] = [];
    const exitLeg = (leg: Leg, i: number, price: number, reason: LegReason): void => {
        leg.exitIdx = i;
        leg.exitPrice = price;
        leg.reason = reason;
    };
    const finish = (hh: Holding): void => {
        const legs = hh.legs.map(l => ({
            name: l.name,
            size: l.size,
            exitDate: ds.days[l.exitIdx as number].date,
            exitPrice: Number((l.exitPrice as number).toFixed(4)),
            reason: l.reason as LegReason,
            returnPct: Number(((((l.exitPrice as number) - hh.entryPrice) / hh.entryPrice) * 100).toFixed(2)),
        }));
        const lastIdx = Math.max(...hh.legs.map(l => l.exitIdx as number));
        trades.push({
            ticker: ds.ticker,
            entryDate: ds.days[hh.entryIdx].date,
            entryPrice: hh.entryPrice,
            entryType: hh.entryType,
            decisionDate: hh.decisionDate,
            exitDate: ds.days[lastIdx].date,
            holdingDays: lastIdx - hh.entryIdx,
            returnPct: Number(legs.reduce((acc, l) => acc + l.size * l.returnPct, 0).toFixed(2)),
            exitReason: hh.entryType === 'enter_selloff' ? (legs[0].reason as string) : `${legs[0].reason}+${legs[1].reason}`,
            legs,
            initialPlan: hh.initialPlan,
            finalPlan: hh.plan,
            reviews: hh.reviews,
        });
        lastFlatMarkIdx = lastIdx;
    };
    const isDone = (hh: Holding): boolean => hh.legs.every(l => l.reason !== undefined);
    /** B 다리의 현재 손절선. */
    const stopB = (hh: Holding): { price: number; reason: LegReason } => {
        const a = hh.legs[0];
        if (a.reason === undefined) return { price: hh.plan.sl1, reason: 'sl1' };
        if (a.reason === 'tp1') return { price: Math.max(hh.plan.sl1, hh.entryPrice), reason: hh.plan.sl1 >= hh.entryPrice ? 'sl1' : 'breakeven' };
        return { price: hh.plan.sl2, reason: 'sl2' };
    };
    /**
     * 한 봉의 장중 판정. 순서: A 손절 → B 손절(A 결과 반영) → A 익절 → B 익절. 같은 봉에서 손절과 익절이
     * 모두 닿으면 손절 우선(보수적). 갭이면 시가 체결. `fromOpen=false`(지정가 체결 봉)면 시가 갭 판정은
     * 하지 않는다 — 체결가 자체가 이미 그 봉 안의 가격이다.
     */
    const runBar = (hh: Holding, i: number, fromOpen: boolean): void => {
        const bar = s.bars[ds.days[i].barIndex];
        const [A, B] = hh.legs;
        const hitStop = (price: number): number | null => (fromOpen && bar.open <= price ? bar.open : bar.low <= price ? price : null);
        const hitTarget = (price: number): number | null => (fromOpen && bar.open >= price ? bar.open : bar.high >= price ? price : null);
        if (hh.entryType === 'enter_selloff') {
            // 규칙형 진입: 재난 손절(AI sl1)만 장중, 나머지는 종가 규칙(MA5 위 마감 / 10거래일).
            const st = hitStop(hh.plan.sl1);
            if (st !== null) { exitLeg(A, i, st, 'selloff_stop'); exitLeg(B, i, st, 'selloff_stop'); return; }
            const day = ds.days[i];
            if (day.close > ma5At(day.barIndex)) { exitLeg(A, i, day.close, 'selloff_ma5'); exitLeg(B, i, day.close, 'selloff_ma5'); return; }
            if (i - hh.entryIdx >= SELL_OFF_MAX_DAYS) { exitLeg(A, i, day.close, 'selloff_time'); exitLeg(B, i, day.close, 'selloff_time'); }
            return;
        }
        let stopped = false;
        if (A.reason === undefined) {
            const st = hitStop(hh.plan.sl1);
            if (st !== null) { exitLeg(A, i, st, 'sl1'); stopped = true; }
        }
        if (B.reason === undefined) {
            const sb = stopB(hh);
            const st = hitStop(sb.price);
            if (st !== null) { exitLeg(B, i, st, sb.reason); stopped = true; }
        }
        if (stopped) return; // 이 봉에서 손절이 났으면 같은 봉 익절은 보지 않는다(순서 불명 → 보수적).
        if (A.reason === undefined) {
            const tp = hitTarget(hh.plan.tp1);
            if (tp !== null) exitLeg(A, i, tp, 'tp1');
        }
        if (B.reason === undefined) {
            const tp = hitTarget(hh.plan.tpFinal);
            if (tp !== null) exitLeg(B, i, tp, 'tp_final');
        }
    };
    const newHolding = (i: number, price: number, entryType: EntryType, decisionDate: string, p: Plan): Holding => ({
        entryIdx: i,
        entryPrice: price,
        entryType,
        decisionDate,
        plan: p,
        initialPlan: p,
        legs: [{ name: 'A', size: 0.5 }, { name: 'B', size: 0.5 }],
        lastReviewIdx: i,
        reviews: [],
    });

    let h: Holding | null = null;
    let pending: { lo: number; hi: number; r: AnalysisResponse; decisionDate: string; placedIdx: number } | null = null;
    // 마지막 진입 판단(또는 청산)일. 처음엔 첫날 바로 판단하도록 충분히 과거로 둔다.
    let lastFlatMarkIdx = -ENTRY_EVERY;
    const lastEntryIdx = ds.days.length - 1 - TAIL_BARS;
    // 파일럿용: MAX_DAYS=60이면 앞 60거래일만 돈다.
    const dayLimit = Math.min(ds.days.length, Number(process.env.MAX_DAYS ?? ds.days.length));
    for (let i = 0; i < dayLimit; i++) {
        const day = ds.days[i];
        const bar = s.bars[day.barIndex];
        if (h !== null && i > h.entryIdx) {
            runBar(h, i, true);
            if (!isDone(h) && i - h.entryIdx >= MAX_HOLD) {
                for (const l of h.legs) if (l.reason === undefined) exitLeg(l, i, day.close, 'max_hold');
            }
            if (isDone(h)) { finish(h); h = null; continue; }
            if (i - h.lastReviewIdx >= REVIEW_EVERY) {
                const bucket = bucketizePosition(h.entryPrice, day.close);
                const { r } = await call(i, 'review', bucket);
                h.lastReviewIdx = i;
                const rec = r?.actionRecommendation?.entryRecommendation ?? (r ? '?' : 'ERROR');
                // 보유자 재분석의 entryRecommendation은 "신규 진입" 판단이라 매도 신호로 쓰지 않는다.
                // AI의 보유자 지시(exit 문구)는 갱신된 목표가·손절가로 반영한다. 급락 매수 포지션은 규칙 청산이라 갱신 안 함.
                let planUpdated = false;
                if (h.entryType !== 'enter_selloff') {
                    const next = derivePlan(r, day.close, atrOf(day.indicators));
                    if (next?.source === 'ai') {
                        // A가 열려 있으면 새 계획 전체. A가 끝났으면 B에는 AI의 최신 손절가를 쓴다:
                        // tp1 뒤엔 stopB가 max(sl1, 평단)으로, sl1 뒤엔 sl2 자리에 새 sl1을 넣는다.
                        const aReason = h.legs[0].reason;
                        h.plan = aReason === undefined || aReason === 'tp1' ? next : { ...next, sl2: next.sl1 };
                        planUpdated = true;
                    }
                }
                h.reviews.push({ date: day.date, bucket, rec, planUpdated });
            }
            continue;
        }
        // 대기 중인 wait 지정가 주문. 낸 날 종가 뒤에 들어가므로 다음 봉부터, 그날 종가 분석이 새 주문으로
        // 바꾸기 전까지 유효하다.
        if (h === null && pending !== null && i > pending.placedIdx) {
            const { lo, hi } = pending;
            let fill: number | null = null;
            if (bar.open <= hi) fill = bar.open; // 구간 안 또는 구간 아래로 갭 → 시가
            else if (bar.low <= hi) fill = hi; // 위에서 내려와 구간 상단 터치
            if (fill !== null && fill >= lo * 0.98) {
                const p = derivePlan(pending.r, fill, atrOf(day.indicators));
                if (p !== null) {
                    h = newHolding(i, fill, 'wait_limit', pending.decisionDate, p);
                    pending = null;
                    runBar(h, i, false); // 체결 봉에서도 손절·익절 모두 판정(손절 우선)
                    if (isDone(h)) { finish(h); h = null; }
                    continue;
                }
            }
        }
        if (h === null && i <= lastEntryIdx && i - lastFlatMarkIdx >= ENTRY_EVERY) {
            lastFlatMarkIdx = i;
            pending = null;
            const { r, sellOff, error } = await call(i, 'entry', null);
            if (plan) continue;
            const rec = r?.actionRecommendation?.entryRecommendation ?? (r ? '?' : 'ERROR');
            decisions.push({ ticker: ds.ticker, date: day.date, close: day.close, rec, sellOff, ...(error ? { error } : {}) });
            if (rec === 'enter') {
                const p = derivePlan(r, day.close, atrOf(day.indicators));
                if (p !== null) h = newHolding(i, day.close, sellOff ? 'enter_selloff' : 'enter_close', day.date, p);
            } else if (rec === 'wait' && ENTRY_MODE === 'with-wait') {
                const z = r?.actionRecommendation?.entryPrices ?? [];
                if (z.length >= 1 && z.every(finite))
                    pending = { lo: Math.min(...z), hi: Math.max(...z), r: r as AnalysisResponse, decisionDate: day.date, placedIdx: i };
            }
        }
    }
    if (h !== null) {
        for (const l of h.legs) if (l.reason === undefined) exitLeg(l, dayLimit - 1, ds.days[dayLimit - 1].close, 'open');
        finish(h);
    }
    if (!plan) {
        writeFileSync(file, JSON.stringify(store)); // sellOffVerdict 역채움 저장
        writeFileSync(resolve(OUT_DIR, `sim-${ENTRY_MODE}-${ds.ticker}.json`), JSON.stringify({ ticker: ds.ticker, entryMode: ENTRY_MODE, reviewEvery: REVIEW_EVERY, maxHold: MAX_HOLD, trades, decisions, timeline }, null, 1));
    }
    return { calls, reused, trades, decisions };
}

async function main(): Promise<void> {
    ensureDirs();
    const plan = process.env.RUN !== '1';
    const only = process.env.TICKERS?.split(',');
    const tickers = (only ?? [...TICKERS]).filter(t =>
        existsSync(resolve(process.cwd(), `scripts/backtests/v8/data/dataset/${t}.json.gz`))
    );
    if (!plan && !process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY is required');
    origLog(`[${plan ? 'plan' : 'run'}] tickers=${tickers.length} mode=${ENTRY_MODE} entryEvery=${ENTRY_EVERY} reviewEvery=${REVIEW_EVERY} maxHold=${MAX_HOLD} concurrency=${CONCURRENCY}`);
    const results = await mapLimit(tickers, plan ? 1 : CONCURRENCY, async t => {
        const r = await simulateTicker(loadDataset(t), loadBars(t), plan);
        origLog(`[${t}] ${plan ? 'entry candidates (upper bound)' : 'new calls'}=${r.calls} reused=${r.reused}`);
        return r;
    });
    const total = results.reduce((a, r) => a + r.calls, 0);
    origLog(`[${plan ? 'plan' : 'done'}] ${plan ? 'entry-candidate calls (upper bound, no holding)' : 'new calls'}=${total}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
