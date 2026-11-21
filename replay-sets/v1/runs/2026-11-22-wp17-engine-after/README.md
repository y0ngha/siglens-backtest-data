# WP-17 engine evaluation — after arms

Placebo-controlled engine evaluation (siglens-core `scripts/replay/engineEval*.ts`) after each WP-17 core PR. Only `run.json`, `summary.json` and `compare.json` are kept; `events.jsonl` is reproducible from the recorded core SHA and dirty-diff hash.

- `after-c9/{A,B}`: candles after core-1 (core #354), gate c9; `compare-*` against `2026-11-21-wp17-engine-before/*-c9`.
- `after-pivots/{A,B}`: after core-2 (core #355), gate pivots; `cmp-*` against `before/*-pivots`.
- `before-geometry/{A,B}`: main after core-2 (`0ff32229`), gate geometry (attribution baseline for core-3).
- `after-geometry/{A,B}`: after core-3 (core #356), gate geometry; `cmp-attr-*` against `before-geometry`, `cmp-total-*` against `before/*-geometry`.

All after arms: G1 counters 0 on both sets, G2 upper bounds ≥ 0.
