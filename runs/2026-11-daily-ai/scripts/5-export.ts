/**
 * 5단계 — 공개용 산출물 내보내기. LLM·시세 API 호출 없음.
 *
 * 입력: out/sim-with-wait-{T}.json(trades·decisions·timeline), out/report-with-wait.json, data/ai/*, data/bars/*
 * 출력: export/public/backtest-results/<RUN_ID>/  → siglens 공개 레포에 커밋할 채점 기록표
 *         trades.csv, decisions.csv, summary.json
 *       export/release/<RUN_ID>-prompts-and-responses.tar.gz  → GitHub Release 첨부파일
 *         system-prompt.txt, prompts/{T}/{date}_{kind}[_{bucket}].json(이전 분석·dynamic 프롬프트),
 *         responses/{T}/... (core 후처리 응답 전문)
 *
 *   RUN_ID=2026-11-daily-ai TICKERS=NVDA,AAPL npx tsx scripts/backtests/v8/5-export.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { AiFile, TimelineEntry, Trade } from './3-run-ai';
import { AI_DIR, OUT_DIR, ROOT, loadBars, toIsoDate } from './lib';

const RUN_ID = process.env.RUN_ID ?? '2026-11-daily-ai';
/** 페이지용 data.json(BacktestRunData)을 추가로 쓸 경로. 예: ../siglens-backtest-v8/src/entities/backtest-case/data/data.json */
const PAGE_DATA_OUT = process.env.PAGE_DATA_OUT;
const RESULTS_URL = `https://github.com/y0ngha/siglens/tree/master/backtest-results/${RUN_ID}`;
const RELEASE_URL = `https://github.com/y0ngha/siglens/releases/tag/backtest-${RUN_ID}`;
const SUMMARY_MAX = 250;
const round2 = (x: number): number => Math.round(x * 100) / 100;
/** 문장 경계(. ! ?)에서 자른다. 경계가 절반보다 앞이면 말줄임표를 붙인다. */
function truncateSummary(text: string): string {
    // "**현재 상황**: …" 같은 굵은 소제목 라벨은 문장이 아니라서 통째로 지운다. 목록 기호도 지운다.
    const clean = text
        .replace(/\*\*[^*\n]{1,30}\*\*\s*[:：]?\s*/g, '')
        .replace(/\*\*/g, '')
        .replace(/(^|\n)\s*[-•]\s+/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    if (clean.length <= SUMMARY_MAX) return clean;
    // 문장 끝 = 마침표류 뒤에 공백이 오는 자리. "34.17"의 소수점은 문장 끝이 아니다.
    const cut = clean.slice(0, SUMMARY_MAX + 1);
    const ends = [...cut.matchAll(/[.!?](?=\s)/g)].map(m => m.index);
    const end = ends.length > 0 ? ends[ends.length - 1] : -1;
    return end > SUMMARY_MAX / 2 ? cut.slice(0, end + 1) : `${cut.slice(0, SUMMARY_MAX).trimEnd()}…`;
}
const TICKERS = (process.env.TICKERS ?? 'NVDA,AAPL,MSFT,AMZN,GOOGL,META,AVGO,TSLA,SPY,QQQ').split(',');
const PUB = resolve(ROOT, 'export/public/backtest-results', RUN_ID);
const REL_ROOT = resolve(ROOT, 'export/release');
const REL = resolve(REL_ROOT, `${RUN_ID}-prompts-and-responses`);

const csvCell = (v: unknown): string => {
    if (v === undefined || v === null) return '';
    const s = typeof v === 'number' ? String(Number(v.toFixed(4))) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header: string[], rows: unknown[][]): string =>
    [header.join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n') + '\n';
const gunzipJson = <T>(path: string): T => JSON.parse(gunzipSync(readFileSync(path)).toString('utf-8')) as T;

function main(): void {
    rmSync(PUB, { recursive: true, force: true });
    rmSync(REL, { recursive: true, force: true });
    mkdirSync(PUB, { recursive: true });
    mkdirSync(REL, { recursive: true });

    const tradeRows: unknown[][] = [];
    const pageTrades: Record<string, unknown>[] = [];
    const baselines: Record<string, unknown>[] = [];
    const report = JSON.parse(readFileSync(resolve(OUT_DIR, 'report-with-wait.json'), 'utf-8')) as {
        simStart: string;
        trendRecognition: unknown;
        perTicker: { ticker: string; buyHoldPct: number; buyHoldMaxDrawdownPct: number }[];
    };
    let periodEnd = '';
    const decisionRows: unknown[][] = [];
    let systemHash: string | null = null;

    for (const t of TICKERS) {
        const simPath = resolve(OUT_DIR, `sim-with-wait-${t}.json`);
        if (!existsSync(simPath)) throw new Error(`missing ${simPath}`);
        const sim = JSON.parse(readFileSync(simPath, 'utf-8')) as { trades: Trade[]; timeline: TimelineEntry[] };
        if (!Array.isArray(sim.timeline)) throw new Error(`${t}: sim has no timeline — rerun 3-run-ai (all reused, no new calls)`);
        const store = JSON.parse(readFileSync(resolve(AI_DIR, `${t}.json`), 'utf-8')) as AiFile;
        const bars = loadBars(t).bars;
        const idxOf = new Map(bars.map((b, i) => [toIsoDate(b.time), i]));
        const fwd = (date: string, n: number): number | null => {
            const i = idxOf.get(date);
            if (i === undefined || i + n >= bars.length) return null;
            return ((bars[i + n].close - bars[i].close) / bars[i].close) * 100;
        };

        const simIdx = bars.findIndex(x => toIsoDate(x.time) >= report.simStart);
        periodEnd = toIsoDate(bars[bars.length - 1].time);
        const base = report.perTicker.find(p => p.ticker === t);
        if (!base) throw new Error(`${t}: missing perTicker in report`);
        baselines.push({ ticker: t, buyHoldPct: base.buyHoldPct, buyHoldMaxDrawdownPct: base.buyHoldMaxDrawdownPct, tradingDays: bars.length - simIdx });
        const entryByDate = new Map(sim.timeline.filter(e => e.kind === 'entry').map(e => [e.date, e]));
        for (const tr of sim.trades) {
            const opener = entryByDate.get(tr.decisionDate);
            const openerCall = opener ? store.calls[opener.key] : undefined;
            if (!openerCall?.result) throw new Error(`${t} ${tr.decisionDate}: opening analysis not found`);
            const openerBase = `${tr.decisionDate}_entry`;
            pageTrades.push({
                ticker: tr.ticker,
                entryType: tr.entryType,
                decisionDate: tr.decisionDate,
                entryDate: tr.entryDate,
                entryPrice: tr.entryPrice,
                exitDate: tr.exitDate,
                holdingDays: tr.holdingDays,
                returnPct: tr.returnPct,
                legs: tr.legs.map(l => ({ name: l.name, size: l.size, exitDate: l.exitDate, exitPrice: round2(l.exitPrice), reason: l.reason, returnPct: l.returnPct })),
                initialPlan: {
                    tp1: round2(tr.initialPlan.tp1),
                    tpFinal: round2(tr.initialPlan.tpFinal),
                    sl1: round2(tr.initialPlan.sl1),
                    sl2: round2(tr.initialPlan.sl2),
                    source: tr.initialPlan.source,
                },
                holdingReviews: tr.reviews.length,
                summary: truncateSummary(openerCall.result.summary ?? ''),
                ...(openerCall.promptFile ? { promptFile: `prompts/${t}/${openerBase}.json` } : {}),
                responseFile: `responses/${t}/${openerBase}.json`,
            });
        }
        for (const tr of sim.trades) {
            const [a, b] = tr.legs;
            tradeRows.push([
                tr.ticker, tr.entryType, tr.decisionDate, tr.entryDate, tr.entryPrice, tr.exitDate, tr.holdingDays, tr.returnPct, tr.exitReason,
                a.exitDate, a.exitPrice, a.reason, a.returnPct,
                b.exitDate, b.exitPrice, b.reason, b.returnPct,
                tr.initialPlan.tp1, tr.initialPlan.tpFinal, tr.initialPlan.sl1, tr.initialPlan.sl2, tr.initialPlan.source,
                tr.reviews.length,
            ]);
        }

        mkdirSync(resolve(REL, 'prompts', t), { recursive: true });
        mkdirSync(resolve(REL, 'responses', t), { recursive: true });
        for (const e of sim.timeline) {
            const call = store.calls[e.key];
            const base = `${e.date}_${e.kind}${e.bucket ? `_${e.bucket}` : ''}`;
            const promptRel = `prompts/${t}/${base}.json`;
            const responseRel = `responses/${t}/${base}.json`;
            if (call?.promptFile) {
                const p = gunzipJson<{ systemHash: string; promptVersion: string; dynamic: string }>(resolve(AI_DIR, call.promptFile));
                if (systemHash === null) {
                    systemHash = p.systemHash;
                    writeFileSync(resolve(REL, 'system-prompt.txt'), gunzipSync(readFileSync(resolve(AI_DIR, 'prompts', `system-${p.systemHash}.txt.gz`))));
                } else if (systemHash !== p.systemHash) {
                    // system 프롬프트가 둘 이상이면 별도 파일로 남긴다(같은 core·스킬이면 하나여야 정상).
                    const extra = resolve(REL, `system-prompt-${p.systemHash.slice(0, 12)}.txt`);
                    if (!existsSync(extra)) writeFileSync(extra, gunzipSync(readFileSync(resolve(AI_DIR, 'prompts', `system-${p.systemHash}.txt.gz`))));
                }
                writeFileSync(resolve(REL, promptRel), JSON.stringify({
                    date: e.date, ticker: t, kind: e.kind, positionBucket: e.bucket, promptVersion: p.promptVersion, systemPromptHash: p.systemHash,
                    priorAnalyses: call.priorAnalyses, dynamic: p.dynamic,
                }, null, 1));
            }
            if (call?.result) writeFileSync(resolve(REL, responseRel), JSON.stringify({ date: e.date, ticker: t, kind: e.kind, positionBucket: e.bucket, result: call.result }, null, 1));
            const ep = e.entryPrices ?? [];
            const tps = e.takeProfitPrices ?? [];
            decisionRows.push([
                e.date, t, e.kind, e.bucket ?? '', e.rec, e.sellOff ? 1 : 0, e.trend, e.riskLevel,
                ep.length ? Math.min(...ep) : null, ep.length ? Math.max(...ep) : null, e.stopLoss, tps[0], tps[tps.length - 1],
                e.priorCount, bars[idxOf.get(e.date) ?? 0]?.close, fwd(e.date, 5), fwd(e.date, 10),
                call?.promptFile ? promptRel : '', call?.result ? responseRel : '',
            ]);
        }
    }

    writeFileSync(resolve(PUB, 'trades.csv'), toCsv(
        ['ticker', 'entry_type', 'decision_date', 'entry_date', 'entry_price', 'exit_date', 'holding_days', 'return_pct', 'exit_reason',
            'leg_a_exit_date', 'leg_a_exit_price', 'leg_a_reason', 'leg_a_return_pct',
            'leg_b_exit_date', 'leg_b_exit_price', 'leg_b_reason', 'leg_b_return_pct',
            'initial_tp1', 'initial_tp_final', 'initial_sl1', 'initial_sl2', 'plan_source', 'holding_reviews'],
        tradeRows.sort((x, y) => String(x[3]).localeCompare(String(y[3])) || String(x[0]).localeCompare(String(y[0])))
    ));
    writeFileSync(resolve(PUB, 'decisions.csv'), toCsv(
        ['date', 'ticker', 'kind', 'position_bucket', 'recommendation', 'sell_off_rule', 'trend', 'risk_level',
            'entry_low', 'entry_high', 'stop_loss', 'take_profit_1', 'take_profit_last',
            'prior_analyses', 'close', 'fwd5_pct', 'fwd10_pct', 'prompt_file', 'response_file'],
        decisionRows.sort((x, y) => String(x[0]).localeCompare(String(y[0])) || String(x[1]).localeCompare(String(y[1])))
    ));
    const reportPath = resolve(OUT_DIR, 'report-with-wait.json');
    if (existsSync(reportPath)) writeFileSync(resolve(PUB, 'summary.json'), readFileSync(reportPath));

    if (PAGE_DATA_OUT) {
        const spy = baselines.find(x => x.ticker === 'SPY');
        if (!spy) throw new Error('SPY baseline required');
        const runData = {
            run: {
                runId: RUN_ID,
                periodStart: report.simStart,
                periodEnd,
                tickers: TICKERS,
                model: 'deepseek-v4.1-flash',
                coreVersion: '2.29.0',
                promptVersion: 'p32',
                siglensVersion: '0.114.1',
                generatedAt: new Date().toISOString(),
                resultsUrl: RESULTS_URL,
                releaseUrl: RELEASE_URL,
            },
            baselines,
            spy,
            trendRecognition: report.trendRecognition,
            trades: pageTrades.sort((x, y) => String(x.entryDate).localeCompare(String(y.entryDate)) || String(x.ticker).localeCompare(String(y.ticker))),
        };
        writeFileSync(PAGE_DATA_OUT, JSON.stringify(runData, null, 4) + '\n');
        console.log(`[export] page data → ${PAGE_DATA_OUT} (${pageTrades.length} trades)`);
    }

    const tarPath = resolve(REL_ROOT, `${RUN_ID}-prompts-and-responses.tar.gz`);
    execFileSync('tar', ['-czf', tarPath, '-C', REL_ROOT, `${RUN_ID}-prompts-and-responses`]);
    console.log(`[export] trades=${tradeRows.length} decisions=${decisionRows.length}`);
    console.log(`[export] public → ${PUB}`);
    console.log(`[export] release → ${tarPath}`);
}

main();
