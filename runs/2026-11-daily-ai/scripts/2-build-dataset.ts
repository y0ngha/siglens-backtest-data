/**
 * 2단계 — 저장 봉으로 데이터셋을 만든다. **LLM을 부르지 않는다.**
 *
 * 시뮬레이션 구간의 매 거래일 D마다(시계를 D 장마감 뒤로 돌린 상태에서):
 *   - 운영 `fetchBarsWithIndicators`(730일 창)로 봉·지표 계산 → 지표 마지막 값 스냅샷
 *   - `detectSignals` → 신호 목록, 후보 판정(강세 신호 ≥3 ∧ 새 강세 신호 ≥1 ∧ 종가 > MA50)
 *   - 운영 `runAnalysis`(회원 tier, 보유 없음)로 실제 조립된 프롬프트를 캡처하고 프로바이더
 *     호출 직전에 abort. 차트 패턴·추세선·피보나치/피벗(Market Reference)·SMC·캔들·지표 상태는
 *     core가 이 조립 안에서만 계산하므로(패턴 탐지기는 export되지 않음) 프롬프트가 그 계산의
 *     정본이다. dynamic 전문 + 계산 섹션 분해본을 함께 저장한다.
 * 안전장치로 이 프로세스의 LLM 키는 더미로 덮는다(abort가 새도 401, 과금 불가).
 *
 * 출력: data/dataset/{T}.json.gz
 *   npx tsx scripts/backtests/v8/2-build-dataset.ts                 # 전 종목(있는 파일은 건너뜀)
 *   TICKERS=AAPL,NVDA npx tsx scripts/backtests/v8/2-build-dataset.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
    DEEPSEEK_V4_1_FLASH_MODEL,
    calculateMA,
    detectSignals,
    fetchBarsWithIndicators,
    runAnalysis,
} from '@y0ngha/siglens-core';
import type { AssembledPromptRecord, Bar } from '@y0ngha/siglens-core';
import {
    BARS_DIR,
    DATASET_DIR,
    SIM_START,
    TICKERS,
    TAIL_BARS,
    closeInstantOf,
    ensureDirs,
    promptHash,
    runAt,
    storedProvider,
    toIsoDate,
    type DayRecord,
    type StoredBars,
    type TickerDataset,
} from './lib';

process.env.DEEPSEEK_API_KEY = 'dataset-build-no-llm-call';
process.env.GEMINI_API_KEY = 'dataset-build-no-llm-call';

const MIN_CONFLUENCE = 3;
/** 이 제목부터는 스킬 가이드·출력 규칙(정적 텍스트)이다. 그 앞까지가 계산된 데이터 섹션. */
const FIRST_GUIDE_HEADING = '## Indicator Signal Guides';

function lastOf(v: unknown): unknown {
    if (Array.isArray(v)) return v.length > 0 ? lastOf(v[v.length - 1]) : null;
    if (v !== null && typeof v === 'object') {
        return Object.fromEntries(
            Object.entries(v).map(([k, x]) => [k, lastOf(x)])
        );
    }
    return v;
}

/** dynamic 프롬프트의 계산 섹션을 `## 제목` → 본문으로 나눈다. */
function splitComputedSections(dynamic: string): Record<string, string> {
    const cut = dynamic.indexOf(FIRST_GUIDE_HEADING);
    const head = cut >= 0 ? dynamic.slice(0, cut) : dynamic;
    const out: Record<string, string> = {};
    let title = '_preamble';
    let buf: string[] = [];
    for (const line of head.split('\n')) {
        if (line.startsWith('## ')) {
            out[title] = buf.join('\n').trim();
            title = line.slice(3).trim();
            buf = [];
        } else buf.push(line);
    }
    out[title] = buf.join('\n').trim();
    return out;
}

async function capturePrompt(
    s: StoredBars,
    date: string
): Promise<AssembledPromptRecord> {
    const ac = new AbortController();
    let captured: AssembledPromptRecord | undefined;
    await runAt(closeInstantOf(date), async () => {
        try {
            await runAnalysis(s.ticker, s.companyName, '1Day', true, undefined, {
                modelId: DEEPSEEK_V4_1_FLASH_MODEL,
                skipEnqueueIfMiss: false,
                marketDataProvider: storedProvider(s.bars, date),
                assetClass: 'equity',
                currency: 'USD',
                tierContext: { userId: null, tier: 'member' },
                reasoning: false,
                providerFallback: false,
                positionBucket: undefined,
                cache: null,
                signal: ac.signal,
                onPromptAssembled: record => {
                    captured = record;
                    ac.abort();
                },
            });
        } catch {
            // abort로 인한 실패는 정상 경로다.
        }
    });
    if (captured === undefined)
        throw new Error(`[${s.ticker} ${date}] prompt not captured`);
    return captured;
}

async function buildTicker(s: StoredBars): Promise<TickerDataset> {
    const simIdx = s.bars.findIndex(b => toIsoDate(b.time) >= SIM_START);
    const lastCandidateIdx = s.bars.length - 1 - TAIL_BARS;
    const ma50 = calculateMA(s.bars as Bar[], 50);
    const systems: Record<string, string> = {};
    const days: DayRecord[] = [];
    let prevBullish = new Set<string>();

    for (let i = simIdx - 1; i <= s.bars.length - 1; i++) {
        const date = toIsoDate(s.bars[i].time);
        const { bars, indicators } = await runAt(closeInstantOf(date), () =>
            fetchBarsWithIndicators(storedProvider(s.bars, date), s.ticker, '1Day')
        );
        const signals = detectSignals(bars, indicators).map(x => ({
            type: x.type,
            direction: x.direction,
            phase: x.phase,
            detectedAt: toIsoDate(bars[x.detectedAt].time),
        }));
        const bullish = new Set(
            signals.filter(x => x.direction === 'bullish').map(x => x.type)
        );
        const fresh = [...bullish].filter(t => !prevBullish.has(t));
        prevBullish = bullish;
        if (i < simIdx) continue; // 첫 날의 "새 신호" 기준선만 잡는다.

        const rec = await capturePrompt(s, date);
        const sysHash = promptHash(rec.system, '');
        systems[sysHash] ??= rec.system;
        const m = ma50[i];
        const closeAboveMa50 =
            m !== null && m !== undefined && s.bars[i].close > m;
        days.push({
            date,
            barIndex: i,
            close: s.bars[i].close,
            windowBars: bars.length,
            indicators: lastOf(indicators),
            signals,
            bullishTypes: [...bullish],
            freshBullish: fresh,
            closeAboveMa50,
            isCandidate:
                i <= lastCandidateIdx &&
                bullish.size >= MIN_CONFLUENCE &&
                fresh.length >= 1 &&
                closeAboveMa50,
            prompt: {
                promptVersion: rec.promptVersion,
                systemHash: sysHash,
                dynamic: rec.dynamic,
                hash: promptHash(rec.system, rec.dynamic),
                sections: splitComputedSections(rec.dynamic),
            },
        });
    }
    return {
        ticker: s.ticker,
        companyName: s.companyName,
        simStart: SIM_START,
        builtAt: new Date().toISOString(),
        tier: 'member',
        model: DEEPSEEK_V4_1_FLASH_MODEL,
        systems,
        days,
    };
}

async function main(): Promise<void> {
    ensureDirs();
    const only = process.env.TICKERS?.split(',');
    for (const ticker of only ?? TICKERS) {
        const out = resolve(DATASET_DIR, `${ticker}.json.gz`);
        if (existsSync(out) && process.env.REBUILD !== '1') {
            console.log(`[${ticker}] exists — skip`);
            continue;
        }
        const s = JSON.parse(
            readFileSync(resolve(BARS_DIR, `${ticker}.json`), 'utf-8')
        ) as StoredBars;
        const t0 = Date.now();
        const ds = await buildTicker(s);
        writeFileSync(out, gzipSync(JSON.stringify(ds)));
        console.log(
            `[${ticker}] days=${ds.days.length} candidates=${ds.days.filter(d => d.isCandidate).length} ` +
                `systems=${Object.keys(ds.systems).length} ${((Date.now() - t0) / 1000).toFixed(0)}s`
        );
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
