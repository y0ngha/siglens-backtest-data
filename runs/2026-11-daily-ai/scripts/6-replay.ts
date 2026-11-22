/**
 * 6단계 — 저장된 AI 응답만으로 다시 돌리는 리플레이(LLM 호출 없음).
 *
 * 3단계와 같은 시뮬레이션을 돌리되 AI 호출 대신 data/ai/{T}.json의 저장분을 쓴다.
 *   1) 같은 키(날짜|보유 구간|이전 이력 해시) — 원래 실행과 프롬프트가 같다.
 *   2) 같은 날·같은 종류(entry/review) — 이력이나 보유 구간만 다르다.
 *   3) 같은 날·다른 종류 — 보유 재분석 자리에 신규 진입 분석(또는 반대)을 쓴다.
 *   4) 그날 저장분 없음 — 진입 판단이면 건너뛰고, 보유 재분석이면 기존 계획을 유지한다.
 * 1이 아닌 건수가 정확한 재실행 때 새로 불러야 할 호출 수의 추정치다.
 *
 * RECONCILE=1이면 계획을 만들기 전에 손절·목표 간격 보정을 입힌다(손절은 진입 구간 하단에서
 * RECONCILE_ATR×ATR 이상 아래의 첫 지지선, 없으면 하단−ATR; 그보다 가까운 첫 목표가는 뺀다).
 *
 *   TAG=base npx tsx scripts/backtests/v8/6-replay.ts
 *   TAG=rec RECONCILE=1 npx tsx scripts/backtests/v8/6-replay.ts
 *   ENTRY_MODE=replay-rec npx tsx scripts/backtests/v8/4-evaluate.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import {
    US_EQUITY_SESSION,
    analysisHistoryQuery,
    bucketizePosition,
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
    type StoredBars,
    type TickerDataset,
} from './lib';


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

const origLog = console.log.bind(console);
console.info = () => {};

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
const RECONCILE = process.env.RECONCILE === '1';
const RECONCILE_ATR = Number(process.env.RECONCILE_ATR ?? '1');
/** 'below200'이면 그날 종가가 200일 이동평균 아래일 때만 보정한다(약세 구간 한정). */
const RECONCILE_WHEN = process.env.RECONCILE_WHEN ?? 'always';
let belowMa200Today = false;
/** 손절·목표 간격 보정(core 후보안). AI 원문은 건드리지 않고 사본을 돌려준다. */
function reconcile(r: AnalysisResponse | undefined, atr: number | null): AnalysisResponse | undefined {
    const a = r?.actionRecommendation;
    if (!RECONCILE || !r || !a || atr === null) return r;
    if (RECONCILE_WHEN === 'below200' && !belowMa200Today) return r;
    const ep = (a.entryPrices ?? []).filter(finite);
    if (ep.length < 2) return r;
    const lo = Math.min(...ep);
    const hi = Math.max(...ep);
    const gap = atr * RECONCILE_ATR;
    let stopLoss = a.stopLoss;
    if (!finite(stopLoss) || lo - stopLoss < gap) {
        const far = (r.keyLevels?.support ?? []).map(x => x.price).filter(finite).filter(p => p <= lo - gap);
        stopLoss = far.length > 0 ? Math.max(...far) : lo - gap;
    }
    let takeProfitPrices = a.takeProfitPrices;
    const tps = (a.takeProfitPrices ?? []).filter(finite).toSorted((x, y) => x - y);
    const farTps = tps.filter(x => x >= hi + gap);
    if (tps.length > 0 && farTps.length !== tps.length) takeProfitPrices = farTps.length > 0 ? farTps : [Math.max(tps[tps.length - 1], hi + gap)];
    return { ...r, actionRecommendation: { ...a, stopLoss, takeProfitPrices, reconciledLevels: undefined } };
}
function derivePlan(rIn: AnalysisResponse | undefined, ref: number, atr: number | null): Plan | null {
    const r = reconcile(rIn, atr);
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
): Promise<{ calls: number; reused: number; tiers: { sameKind: number; otherKind: number; none: number }; trades: Trade[]; decisions: EntryDecision[] }> {
    const file = resolve(AI_DIR, `${ds.ticker}.json`);
    const store: AiFile = existsSync(file)
        ? (JSON.parse(readFileSync(file, 'utf-8')) as AiFile)
        : { ticker: ds.ticker, model: 'stored', tier: 'member', reviewEvery: REVIEW_EVERY, maxHold: MAX_HOLD, calls: {} };
    let calls = 0;
    let reused = 0;
    const tiers = { sameKind: 0, otherKind: 0, none: 0 };

    // 이 종목에서 시뮬레이션이 지금까지 낸 분석(운영 analysis_history 역할). 시간순.
    const history: { generatedAt: Date; result: AnalysisResponse }[] = [];
    const promptDir = resolve(AI_DIR, 'prompts', ds.ticker);
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
        // 정확한 키가 없다: 같은 날의 가장 가까운 저장분으로 대신한다.
        calls++;
        const sameDay = Object.values(store.calls).filter(c => c.date === day.date && c.result);
        const pick = sameDay.find(c => c.kind === kind) ?? sameDay[0];
        if (!pick) {
            tiers.none++;
            return { sellOff: false };
        }
        if (pick.kind === kind) tiers.sameKind++;
        else tiers.otherKind++;
        remember(pick.result);
        const so = sellOffOf(pick);
        log(pick, so);
        return { r: pick.result, sellOff: so };
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
        belowMa200Today = day.barIndex >= 199 && day.close < closes.slice(day.barIndex - 199, day.barIndex + 1).reduce((x, y) => x + y, 0) / 200;
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
    writeFileSync(resolve(OUT_DIR, `sim-replay-${TAG}-${ds.ticker}.json`), JSON.stringify({ ticker: ds.ticker, entryMode: `replay-${TAG}`, reviewEvery: REVIEW_EVERY, maxHold: MAX_HOLD, trades, decisions, timeline }, null, 1));
    return { calls, reused, tiers, trades, decisions };
}

const TAG = process.env.TAG ?? (RECONCILE ? 'rec' : 'base');
async function main(): Promise<void> {
    ensureDirs();
    const only = process.env.TICKERS?.split(',');
    const tickers = (only ?? [...TICKERS]).filter(t =>
        existsSync(resolve(process.cwd(), `scripts/backtests/v8/data/dataset/${t}.json.gz`))
    );
    origLog(`[replay ${TAG}] reconcile=${RECONCILE} atr×${RECONCILE_ATR} tickers=${tickers.length}`);
    const results = await mapLimit(tickers, 4, async t => {
        const r = await simulateTicker(loadDataset(t), loadBars(t), false);
        origLog(`[${t}] exact=${r.reused} sameKind=${r.tiers.sameKind} otherKind=${r.tiers.otherKind} none=${r.tiers.none} trades=${r.trades.length}`);
        return r;
    });
    const sum = (f: (r: (typeof results)[number]) => number) => results.reduce((a, r) => a + f(r), 0);
    origLog(`[done ${TAG}] exact=${sum(r => r.reused)} sameKind=${sum(r => r.tiers.sameKind)} otherKind=${sum(r => r.tiers.otherKind)} none=${sum(r => r.tiers.none)} → 정확 재실행 시 새 호출 추정 ${sum(r => r.calls)}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
