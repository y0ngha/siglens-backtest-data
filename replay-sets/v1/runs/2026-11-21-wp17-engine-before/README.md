# WP-17 engine evaluation, arm `before` (core main 58f14663)

Placebo-controlled evaluation of the candle and chart-pattern engine before the WP-17 fixes, one run per G1 gate (`c9`, `pivots`, `geometry`). B = `replay-sets/v1` (65 symbols), A = `runs/2026-11-daily-ai/data/bars` (40 US tickers). Only `run.json` and `summary.json` are kept; `events.jsonl` (~90 MB per run) is reproducible byte-for-byte with:

    npx tsx scripts/replay/engineEval.ts --set <replay-sets/v1> --out <dir> --arm before --gate <gate>
    npx tsx scripts/replay/engineEval.ts --bars <runs/2026-11-daily-ai/data/bars> --out <dir> --arm before --gate <gate>

All six runs exit 2 (G1 fails before the fixes, as expected).
