/**
 * 4단계 — 정적 판정. LLM 없음. 3단계 out/sim-{T}.json + 저장 봉만 읽는다.
 *
 *   npx tsx scripts/backtests/v8/4-evaluate.ts   → out/report.json, out/report.md
 *
 * 판정 항목
 *   - 매매: 건수·승률·평균/중앙 수익률·청산 사유 분포·보유일·레벨 출처(ai/fallback)
 *   - 진입 판단: 후보일의 enter/wait/avoid별 이후 FWD 거래일 수익률(avoid 적중 = 하락)
 *   - AI 매도(ai_exit): 매도 뒤 FWD 거래일 수익률(매도가 맞았나 = 이후 하락)
 *   - 기준선: 같은 기간 종목 보유, SPY 보유
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EntryDecision, TimelineEntry, Trade } from './3-run-ai';
import { OUT_DIR, SIM_START, TICKERS, loadBars, toIsoDate } from './lib';

const FWD = 10;
/** 추세 파악 일치율의 창(거래일). */
const RECOGNITION_DAYS = 10;
const MODE = process.env.ENTRY_MODE ?? 'with-wait';

const mean = (xs: number[]): number =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const median = (xs: number[]): number => {
    if (!xs.length) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (n: number, d: number): number => (d ? (n / d) * 100 : NaN);
const r2 = (x: number): number => Number(x.toFixed(2));

function fwdReturn(ticker: string, date: string, n: number): number | null {
    const bars = loadBars(ticker).bars;
    const i = bars.findIndex(b => toIsoDate(b.time) === date);
    if (i < 0 || i + n >= bars.length) return null;
    return ((bars[i + n].close - bars[i].close) / bars[i].close) * 100;
}
function pastReturn(ticker: string, date: string, n: number): number | null {
    const bars = loadBars(ticker).bars;
    const i = bars.findIndex(b => toIsoDate(b.time) === date);
    if (i < n) return null;
    return ((bars[i].close - bars[i - n].close) / bars[i - n].close) * 100;
}
function buyHold(ticker: string): number {
    const bars = loadBars(ticker).bars;
    const i = bars.findIndex(b => toIsoDate(b.time) >= SIM_START);
    return ((bars[bars.length - 1].close - bars[i].close) / bars[i].close) * 100;
}

function tradeStats(ts: Trade[]) {
    const closed = ts.filter(t => !t.exitReason.includes('open'));
    const rets = closed.map(t => t.returnPct);
    const reasons = [...new Set(ts.map(t => t.exitReason))].sort();
    const byReason = Object.fromEntries(
        reasons.map(r => {
            const g = ts.filter(t => t.exitReason === r);
            return [r, { n: g.length, meanRet: r2(mean(g.map(t => t.returnPct))) }];
        })
    );
    const legReasons = [...new Set(ts.flatMap(t => t.legs.map(l => `${l.name}:${l.reason}`)))].sort();
    const byLeg = Object.fromEntries(
        legReasons.map(k => {
            const g = ts.flatMap(t => t.legs.filter(l => `${l.name}:${l.reason}` === k));
            return [k, { n: g.length, meanRet: r2(mean(g.map(l => l.returnPct))) }];
        })
    );
    return {
        trades: ts.length,
        closed: closed.length,
        winRate: r2(pct(closed.filter(t => t.returnPct > 0).length, closed.length)),
        meanRet: r2(mean(rets)),
        medianRet: r2(median(rets)),
        sumRet: r2(rets.reduce((a, b) => a + b, 0)),
        meanHoldDays: r2(mean(closed.map(t => t.holdingDays))),
        byReason,
        byLeg,
        byEntryType: Object.fromEntries(['enter_close', 'enter_selloff', 'wait_limit'].map(k => {
            const g = closed.filter(t => t.entryType === k);
            return [k, { n: g.length, winRate: r2(pct(g.filter(t => t.returnPct > 0).length, g.length)), meanRet: r2(mean(g.map(t => t.returnPct))) }];
        })),
        planSource: {
            ai: ts.filter(t => t.initialPlan.source === 'ai').length,
            fallback: ts.filter(t => t.initialPlan.source === 'fallback').length,
        },
        reviewsPerTrade: r2(mean(ts.map(t => t.reviews.length))),
        planUpdatedOnReview: ts.reduce((a, t) => a + t.reviews.filter(r => r.planUpdated).length, 0),
    };
}

/**
 * 한 종목을 한 계좌로 굴린 곡선. 매매는 그 종목 안에서 겹치지 않으므로 청산일마다 복리로 반영한다
 * (보유 중 평가손익은 반영하지 않는 청산 기준 곡선 — MDD가 장중·평가 기준보다 작게 나올 수 있다).
 */
function equityCurve(ticker: string, ts: Trade[]): { dates: string[]; curve: number[] } {
    const bars = loadBars(ticker).bars;
    const i0 = bars.findIndex(b => toIsoDate(b.time) >= SIM_START);
    const dates = bars.slice(i0).map(b => toIsoDate(b.time));
    const byExit = new Map<string, number>();
    for (const t of ts) byExit.set(t.exitDate, (byExit.get(t.exitDate) ?? 1) * (1 + t.returnPct / 100));
    let eq = 1;
    const curve = dates.map(d => (eq *= byExit.get(d) ?? 1));
    return { dates, curve };
}
function maxDrawdownPct(curve: readonly number[]): number {
    let peak = -Infinity;
    let mdd = 0;
    for (const v of curve) {
        peak = Math.max(peak, v);
        mdd = Math.min(mdd, v / peak - 1);
    }
    return r2(mdd * 100);
}
function buyHoldCurve(ticker: string): number[] {
    const bars = loadBars(ticker).bars;
    const i0 = bars.findIndex(b => toIsoDate(b.time) >= SIM_START);
    return bars.slice(i0).map(b => b.close / bars[i0].close);
}

function main(): void {
    const sims = TICKERS.filter(t => existsSync(resolve(OUT_DIR, `sim-${MODE}-${t}.json`))).map(
        t => JSON.parse(readFileSync(resolve(OUT_DIR, `sim-${MODE}-${t}.json`), 'utf-8')) as {
            ticker: string;
            trades: Trade[];
            decisions: EntryDecision[];
            timeline?: TimelineEntry[];
        }
    );
    const trades = sims.flatMap(s => s.trades);
    const decisions = sims.flatMap(s => s.decisions);

    const decisionStats = Object.fromEntries(
        ['enter', 'wait', 'avoid', 'ERROR', '?'].map(rec => {
            const g = decisions.filter(d => d.rec === rec);
            const f = g.map(d => fwdReturn(d.ticker, d.date, FWD)).filter((x): x is number => x !== null);
            return [rec, {
                n: g.length,
                [`fwd${FWD}MeanRet`]: r2(mean(f)),
                [`fwd${FWD}UpRate`]: r2(pct(f.filter(x => x > 0).length, f.length)),
            }];
        })
    );

    const curves = sims.map(s => equityCurve(s.ticker, s.trades));
    /**
     * 추세 파악 일치율. AI의 `trend`(bullish/bearish)가 판단 **직전** RECOGNITION_DAYS 거래일의 실제
     * 흐름과 같은 방향이었는지 센다. `trend`는 지금까지의 흐름을 설명하는 값이라(앞으로의 방향
     * 적중은 약 50%로 기준선 이하) 공개 자료에는 이 값을 싣는다. neutral은 방향을 말하지 않아
     * 일치율 분모에서 빼고, 라벨별 표에는 넣는다.
     */
    const timeline = sims.flatMap(s => s.timeline ?? []);
    const recognized = timeline
        .map(e => ({ e, p: pastReturn(e.ticker, e.date, RECOGNITION_DAYS) }))
        .filter((x): x is { e: TimelineEntry; p: number } => x.p !== null);
    const directional = recognized.filter(x => x.e.trend === 'bullish' || x.e.trend === 'bearish');
    const trendRecognition =
        timeline.length > 0
            ? {
                  windowDays: RECOGNITION_DAYS,
                  directionalCalls: directional.length,
                  matchRatePct: r2(pct(directional.filter(x => (x.p > 0) === (x.e.trend === 'bullish')).length, directional.length)),
                  byTrend: Object.fromEntries(
                      ['bullish', 'bearish', 'neutral'].map(tr => {
                          const g = recognized.filter(x => x.e.trend === tr);
                          return [tr, { calls: g.length, priorMeanPct: r2(mean(g.map(x => x.p))), priorUpRatePct: r2(pct(g.filter(x => x.p > 0).length, g.length)) }];
                      })
                  ),
              }
            : null;

    const perTicker = sims.map((s, k) => {
        const { dates, curve } = curves[k];
        const bh = buyHoldCurve(s.ticker);
        return {
            ticker: s.ticker,
            ...tradeStats(s.trades),
            decisions: s.decisions.length,
            strategyPct: r2((curve[curve.length - 1] - 1) * 100),
            strategyMaxDrawdownPct: maxDrawdownPct(curve),
            exposurePct: r2(pct(s.trades.reduce((a, t) => a + t.holdingDays, 0), dates.length)),
            buyHoldPct: r2(buyHold(s.ticker)),
            buyHoldMaxDrawdownPct: maxDrawdownPct(bh),
        };
    });
    // 같은 금액을 종목 수만큼 나눠 각 종목 계좌에 넣은 포트폴리오(리밸런싱 없음).
    const n = Math.min(...curves.map(c => c.curve.length));
    const portfolio = Array.from({ length: n }, (_, i) => mean(curves.map(c => c.curve[i])));
    const spyCurve = sims.some(s => s.ticker === 'SPY') ? buyHoldCurve('SPY') : null;
    const report = {
        generatedAt: new Date().toISOString(),
        tickers: sims.length,
        simStart: SIM_START,
        fwdDays: FWD,
        portfolio: {
            method: 'equal-weight sleeves (1/N capital per ticker, no rebalancing, closed-trade equity)',
            returnPct: r2((portfolio[n - 1] - 1) * 100),
            maxDrawdownPct: maxDrawdownPct(portfolio),
            meanExposurePct: r2(mean(perTicker.map(p => p.exposurePct))),
        },
        overall: tradeStats(trades),
        entryDecisions: decisionStats,
        trendRecognition,
        sellOffDecisions: decisions.filter(d => d.sellOff).length,
        benchmark: {
            spyBuyHoldPct: sims.length ? r2(buyHold('SPY')) : NaN,
            spyBuyHoldMaxDrawdownPct: spyCurve ? maxDrawdownPct(spyCurve) : null,
            meanTickerBuyHoldPct: r2(mean(perTicker.map(p => p.buyHoldPct))),
        },
        perTicker,
    };
    writeFileSync(resolve(OUT_DIR, `report-${MODE}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, perTicker: undefined }, null, 2));
    console.table(perTicker.map(p => ({ t: p.ticker, n: p.trades, win: p.winRate, mean: p.meanRet, strat: p.strategyPct, mdd: p.strategyMaxDrawdownPct, expo: p.exposurePct, bh: p.buyHoldPct, bhMdd: p.buyHoldMaxDrawdownPct })));
}

main();
