# Replay report

A (/Users/y0ngha/Project/siglens-backtest-data/replay-sets/v1/runs/2026-11-21-variance-p34): set replay-v1, core 9894ebd4cb94e771dff24000c819ecfd1514d722, prompt p34, model deepseek-v4.1-flash, tier member, skills 06d331ecd541, repeat 3
Rows: 300 in the run; the headline sections use repeat 1 of each case only (100 rows, 100 headline), because repeats of one case are not independent observations. Repeats are used only in the variance section. Labels are measurements with their n, never a performance claim.

## Run-to-run noise (used by the comparison section)

Pairwise flip rate per label, measured on the repeated runs in this run. A difference between two runs (--compare) smaller than the flip rate of its label is printed as "within run-to-run noise".

| label | flips | comparisons n | flip rate |
| --- | --- | --- | --- |
| trend | 22 | 300 | 7.3% |
| entryRecommendation | 0 | 300 | 0.0% |
| planOutcome | 89 | 300 | 29.7% |
| levelOutcome | 0 | 2546 | 0.0% |
| patternOutcome | 0 | 51 | 0.0% |

## Checks

Excluded bucket (generated_at or unobserved anchor): 0 rows. Expected 0 in a replay.

No warnings.

## 1. Rows, failures and missing plans

Failed: the model call failed or returned nothing. Unlabelled: the result could not be labelled (invalid analysis or no usable window). Missing plan: the analysis carried no recommendation at all.

| group | rows n | failed | unlabelled | excluded | headline | missing plan (of headline) |
| --- | --- | --- | --- | --- | --- | --- |
| all | 100 | 0/100 (0.0%) | 0/100 (0.0%) | 0/100 (0.0%) | 100/100 (100.0%) | 0/100 (0.0%) |
| crash | 25 | 0/25 (0.0%) | 0/25 (0.0%) | 0/25 (0.0%) | 25/25 (100.0%) | 0/25 (0.0%) |
| downtrend | 25 | 0/25 (0.0%) | 0/25 (0.0%) | 0/25 (0.0%) | 25/25 (100.0%) | 0/25 (0.0%) |
| uptrend | 25 | 0/25 (0.0%) | 0/25 (0.0%) | 0/25 (0.0%) | 25/25 (100.0%) | 0/25 (0.0%) |
| range | 25 | 0/25 (0.0%) | 0/25 (0.0%) | 0/25 (0.0%) | 25/25 (100.0%) | 0/25 (0.0%) |
| us | 79 | 0/79 (0.0%) | 0/79 (0.0%) | 0/79 (0.0%) | 79/79 (100.0%) | 0/79 (0.0%) |
| kr | 21 | 0/21 (0.0%) | 0/21 (0.0%) | 0/21 (0.0%) | 21/21 (100.0%) | 0/21 (0.0%) |
| crash/us | 16 | 0/16 (0.0%) | 0/16 (0.0%) | 0/16 (0.0%) | 16/16 (100.0%) | 0/16 (0.0%) |
| crash/kr | 9 | 0/9 (0.0%) | 0/9 (0.0%) | 0/9 (0.0%) | 9/9 (100.0%) | 0/9 (0.0%) |
| downtrend/us | 19 | 0/19 (0.0%) | 0/19 (0.0%) | 0/19 (0.0%) | 19/19 (100.0%) | 0/19 (0.0%) |
| downtrend/kr | 6 | 0/6 (0.0%) | 0/6 (0.0%) | 0/6 (0.0%) | 6/6 (100.0%) | 0/6 (0.0%) |
| uptrend/us | 22 | 0/22 (0.0%) | 0/22 (0.0%) | 0/22 (0.0%) | 22/22 (100.0%) | 0/22 (0.0%) |
| uptrend/kr | 3 | 0/3 (0.0%) | 0/3 (0.0%) | 0/3 (0.0%) | 3/3 (100.0%) | 0/3 (0.0%) |
| range/us | 22 | 0/22 (0.0%) | 0/22 (0.0%) | 0/22 (0.0%) | 22/22 (100.0%) | 0/22 (0.0%) |
| range/kr | 3 | 0/3 (0.0%) | 0/3 (0.0%) | 0/3 (0.0%) | 3/3 (100.0%) | 0/3 (0.0%) |

## 2. Plan outcomes

Per group and plan recommendation, headline rows. Cells are `count (share of n)`.

| group | verdict | n | no_plan | not_triggered | void_at_entry | target_first | stop_first | ambiguous | open_at_horizon |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | enter | 6 | 0 (0%) | 0 (0%) | 1 (17%) | 2 (33%) | 1 (17%) | 2 (33%) | 0 (0%) |
| all | wait | 94 | 0 (0%) | 8 (9%) | 9 (10%) | 31 (33%) | 40 (43%) | 5 (5%) | 1 (1%) |
| crash | enter | 4 | 0 (0%) | 0 (0%) | 1 (25%) | 2 (50%) | 0 (0%) | 1 (25%) | 0 (0%) |
| crash | wait | 21 | 0 (0%) | 1 (5%) | 2 (10%) | 8 (38%) | 9 (43%) | 1 (5%) | 0 (0%) |
| downtrend | wait | 25 | 0 (0%) | 2 (8%) | 5 (20%) | 5 (20%) | 12 (48%) | 1 (4%) | 0 (0%) |
| uptrend | enter | 2 | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 1 (50%) | 1 (50%) | 0 (0%) |
| uptrend | wait | 23 | 0 (0%) | 4 (17%) | 1 (4%) | 9 (39%) | 8 (35%) | 1 (4%) | 0 (0%) |
| range | wait | 25 | 0 (0%) | 1 (4%) | 1 (4%) | 9 (36%) | 11 (44%) | 2 (8%) | 1 (4%) |
| us | enter | 5 | 0 (0%) | 0 (0%) | 1 (20%) | 2 (40%) | 1 (20%) | 1 (20%) | 0 (0%) |
| us | wait | 74 | 0 (0%) | 7 (9%) | 5 (7%) | 26 (35%) | 30 (41%) | 5 (7%) | 1 (1%) |
| kr | enter | 1 | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 1 (100%) | 0 (0%) |
| kr | wait | 20 | 0 (0%) | 1 (5%) | 4 (20%) | 5 (25%) | 10 (50%) | 0 (0%) | 0 (0%) |
| crash/us | enter | 3 | 0 (0%) | 0 (0%) | 1 (33%) | 2 (67%) | 0 (0%) | 0 (0%) | 0 (0%) |
| crash/us | wait | 13 | 0 (0%) | 1 (8%) | 1 (8%) | 5 (38%) | 5 (38%) | 1 (8%) | 0 (0%) |
| crash/kr | enter | 1 | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 1 (100%) | 0 (0%) |
| crash/kr | wait | 8 | 0 (0%) | 0 (0%) | 1 (13%) | 3 (38%) | 4 (50%) | 0 (0%) | 0 (0%) |
| downtrend/us | wait | 19 | 0 (0%) | 2 (11%) | 2 (11%) | 5 (26%) | 9 (47%) | 1 (5%) | 0 (0%) |
| downtrend/kr | wait | 6 | 0 (0%) | 0 (0%) | 3 (50%) | 0 (0%) | 3 (50%) | 0 (0%) | 0 (0%) |
| uptrend/us | enter | 2 | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 1 (50%) | 1 (50%) | 0 (0%) |
| uptrend/us | wait | 20 | 0 (0%) | 3 (15%) | 1 (5%) | 8 (40%) | 7 (35%) | 1 (5%) | 0 (0%) |
| uptrend/kr | wait | 3 | 0 (0%) | 1 (33%) | 0 (0%) | 1 (33%) | 1 (33%) | 0 (0%) | 0 (0%) |
| range/us | wait | 22 | 0 (0%) | 1 (5%) | 1 (5%) | 8 (36%) | 9 (41%) | 2 (9%) | 1 (5%) |
| range/kr | wait | 3 | 0 (0%) | 0 (0%) | 0 (0%) | 1 (33%) | 2 (67%) | 0 (0%) | 0 (0%) |

## 3. target_first against the random-walk null

Compared over ALL triggered plans (target_first, stop_first, ambiguous, open_at_horizon): the null has no horizon, so open and ambiguous plans stay in the denominator. not_triggered, void_at_entry and no_plan are shown apart and never counted as wins. The difference is the mean of `1[target_first] − rwNullTargetFirst` over the triggered plans, with its sampling standard error (cases treated as independent).

| group | verdict | triggered n | target_first | null (mean rwNullTargetFirst) | difference ± se | not_triggered | void_at_entry | no_plan |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | enter | 5 | 2/5 (40.0%) | +0.52 ±0.03 (n=5) | -12.4pp ±24.5 (n=5) | 0/6 (0.0%) | 1/6 (16.7%) | 0/6 (0.0%) |
| all | wait | 77 | 31/77 (40.3%) | +0.47 ±0.02 (n=77) | -7.0pp ±5.8 (n=77) | 8/94 (8.5%) | 9/94 (9.6%) | 0/94 (0.0%) |
| crash | enter | 3 | 2/3 (66.7%) | +0.52 ±0.05 (n=3) | +14.6pp ±32.7 (n=3) | 0/4 (0.0%) | 1/4 (25.0%) | 0/4 (0.0%) |
| crash | wait | 18 | 8/18 (44.4%) | +0.57 ±0.04 (n=18) | -12.4pp ±12.3 (n=18) | 1/21 (4.8%) | 2/21 (9.5%) | 0/21 (0.0%) |
| downtrend | wait | 18 | 5/18 (27.8%) | +0.48 ±0.04 (n=18) | -19.8pp ±11.6 (n=18) | 2/25 (8.0%) | 5/25 (20.0%) | 0/25 (0.0%) |
| uptrend | enter | 2 | 0/2 (0.0%) | +0.53 ±0.06 (n=2) | -53.0pp ±6.2 (n=2) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) |
| uptrend | wait | 18 | 9/18 (50.0%) | +0.41 ±0.03 (n=18) | +9.2pp ±12.6 (n=18) | 4/23 (17.4%) | 1/23 (4.3%) | 0/23 (0.0%) |
| range | wait | 23 | 9/23 (39.1%) | +0.45 ±0.04 (n=23) | -5.4pp ±10.2 (n=23) | 1/25 (4.0%) | 1/25 (4.0%) | 0/25 (0.0%) |
| us | enter | 4 | 2/4 (50.0%) | +0.53 ±0.04 (n=4) | -3.0pp ±29.1 (n=4) | 0/5 (0.0%) | 1/5 (20.0%) | 0/5 (0.0%) |
| us | wait | 62 | 26/62 (41.9%) | +0.46 ±0.02 (n=62) | -3.9pp ±6.7 (n=62) | 7/74 (9.5%) | 5/74 (6.8%) | 0/74 (0.0%) |
| kr | enter | 1 | 0/1 (0.0%) | +0.50 (n=1) | -50.0pp (n=1) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) |
| kr | wait | 15 | 5/15 (33.3%) | +0.53 ±0.05 (n=15) | -19.9pp ±10.5 (n=15) | 1/20 (5.0%) | 4/20 (20.0%) | 0/20 (0.0%) |
| crash/us | enter | 2 | 2/2 (100.0%) | +0.53 ±0.08 (n=2) | +47.0pp ±8.1 (n=2) | 0/3 (0.0%) | 1/3 (33.3%) | 0/3 (0.0%) |
| crash/us | wait | 11 | 5/11 (45.5%) | +0.55 ±0.05 (n=11) | -9.5pp ±17.3 (n=11) | 1/13 (7.7%) | 1/13 (7.7%) | 0/13 (0.0%) |
| crash/kr | enter | 1 | 0/1 (0.0%) | +0.50 (n=1) | -50.0pp (n=1) | 0/1 (0.0%) | 0/1 (0.0%) | 0/1 (0.0%) |
| crash/kr | wait | 7 | 3/7 (42.9%) | +0.60 ±0.08 (n=7) | -17.0pp ±17.9 (n=7) | 0/8 (0.0%) | 1/8 (12.5%) | 0/8 (0.0%) |
| downtrend/us | wait | 15 | 5/15 (33.3%) | +0.48 ±0.04 (n=15) | -14.4pp ±13.4 (n=15) | 2/19 (10.5%) | 2/19 (10.5%) | 0/19 (0.0%) |
| downtrend/kr | wait | 3 | 0/3 (0.0%) | +0.47 ±0.12 (n=3) | -47.1pp ±12.1 (n=3) | 0/6 (0.0%) | 3/6 (50.0%) | 0/6 (0.0%) |
| uptrend/us | enter | 2 | 0/2 (0.0%) | +0.53 ±0.06 (n=2) | -53.0pp ±6.2 (n=2) | 0/2 (0.0%) | 0/2 (0.0%) | 0/2 (0.0%) |
| uptrend/us | wait | 16 | 8/16 (50.0%) | +0.39 ±0.03 (n=16) | +10.6pp ±13.9 (n=16) | 3/20 (15.0%) | 1/20 (5.0%) | 0/20 (0.0%) |
| uptrend/kr | wait | 2 | 1/2 (50.0%) | +0.52 ±0.17 (n=2) | -2.1pp ±32.7 (n=2) | 1/3 (33.3%) | 0/3 (0.0%) | 0/3 (0.0%) |
| range/us | wait | 20 | 8/20 (40.0%) | +0.45 ±0.05 (n=20) | -4.6pp ±11.4 (n=20) | 1/22 (4.5%) | 1/22 (4.5%) | 0/22 (0.0%) |
| range/kr | wait | 3 | 1/3 (33.3%) | +0.44 ±0.09 (n=3) | -11.2pp ±24.4 (n=3) | 0/3 (0.0%) | 0/3 (0.0%) | 0/3 (0.0%) |

### Plan exit returns

Mean return of exits (target_first, stop_first, open_at_horizon) and its excess over the same-symbol mean return of the same length (exposure-matched). Gap exits (a bar that opened through the level) are shown apart from level exits.

| group | verdict | return, level exits | return, gap exits | excess, level exits | excess, gap exits |
| --- | --- | --- | --- | --- | --- |
| all | enter | +5.10% ±2.34 (n=2) | -5.26% (n=1) | +4.65% ±2.15 (n=2) | -6.07% (n=1) |
| all | wait | -0.58% ±0.54 (n=59) | -0.03% ±1.80 (n=13) | -0.62% ±0.51 (n=59) | +0.59% ±2.05 (n=13) |
| crash | enter | +5.10% ±2.34 (n=2) | – (n=0) | +4.65% ±2.15 (n=2) | – (n=0) |
| crash | wait | -1.62% ±1.42 (n=13) | +0.30% ±4.71 (n=4) | -0.91% ±1.56 (n=13) | +2.31% ±5.32 (n=4) |
| downtrend | wait | -2.62% ±0.84 (n=14) | +6.50% ±1.49 (n=3) | -1.78% ±0.73 (n=14) | +7.37% ±1.67 (n=3) |
| uptrend | enter | – (n=0) | -5.26% (n=1) | – (n=0) | -6.07% (n=1) |
| uptrend | wait | +1.27% ±1.07 (n=16) | -2.24% (n=1) | -0.17% ±1.01 (n=16) | -3.11% (n=1) |
| range | wait | +0.21% ±0.73 (n=16) | -3.77% ±1.12 (n=5) | +0.17% ±0.80 (n=16) | -4.11% ±1.10 (n=5) |
| us | enter | +5.10% ±2.34 (n=2) | -5.26% (n=1) | +4.65% ±2.15 (n=2) | -6.07% (n=1) |
| us | wait | -0.36% ±0.62 (n=46) | +0.86% ±2.00 (n=11) | -0.45% ±0.59 (n=46) | +1.54% ±2.31 (n=11) |
| kr | enter | – (n=0) | – (n=0) | – (n=0) | – (n=0) |
| kr | wait | -1.34% ±1.08 (n=13) | -4.92% ±2.24 (n=2) | -1.24% ±1.07 (n=13) | -4.60% ±1.35 (n=2) |
| crash/us | enter | +5.10% ±2.34 (n=2) | – (n=0) | +4.65% ±2.15 (n=2) | – (n=0) |
| crash/us | wait | -2.36% ±2.15 (n=7) | +2.79% ±5.65 (n=3) | -1.22% ±2.50 (n=7) | +5.06% ±6.44 (n=3) |
| crash/kr | enter | – (n=0) | – (n=0) | – (n=0) | – (n=0) |
| crash/kr | wait | -0.77% ±1.95 (n=6) | -7.16% (n=1) | -0.55% ±1.97 (n=6) | -5.95% (n=1) |
| downtrend/us | wait | -2.21% ±0.93 (n=11) | +6.50% ±1.49 (n=3) | -1.35% ±0.78 (n=11) | +7.37% ±1.67 (n=3) |
| downtrend/kr | wait | -4.12% ±2.03 (n=3) | – (n=0) | -3.33% ±1.81 (n=3) | – (n=0) |
| uptrend/us | enter | – (n=0) | -5.26% (n=1) | – (n=0) | -6.07% (n=1) |
| uptrend/us | wait | +1.50% ±1.19 (n=14) | -2.24% (n=1) | +0.03% ±1.11 (n=14) | -3.11% (n=1) |
| uptrend/kr | wait | -0.31% ±1.99 (n=2) | – (n=0) | -1.53% ±2.83 (n=2) | – (n=0) |
| range/us | wait | +0.22% ±0.82 (n=14) | -4.04% ±1.40 (n=4) | +0.17% ±0.90 (n=14) | -4.32% ±1.40 (n=4) |
| range/kr | wait | +0.07% ±1.60 (n=2) | -2.67% (n=1) | +0.13% ±1.69 (n=2) | -3.26% (n=1) |

### Why a plan was not evaluated or voided (headline rows, per verdict)

| verdict | outcome:reason | n |
| --- | --- | --- |
| enter | void_at_entry:gap_below_zone | 1 |
| wait | void_at_entry:gap_below_stop | 1 |
| wait | void_at_entry:gap_below_zone | 8 |

## 4. Levels against the placebo

respected / evaluated levels, compared with the same level moved by the shift (in ATR units; + is farther from the price) only where both the real level and the placebo were evaluated (neither skipped). The placebo list is the base rate: a level set is informative only if it beats it. `resolved` counts touches that were respected or broken.

| group | verdict | shift | pairs n | real respected | placebo respected | difference ± se | real resolved: respected | placebo resolved: respected | real broken by gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | enter | +0.5 | 54 | 24/54 (44.4%) | 23/54 (42.6%) | +1.9pp ±9.7 (n=54) | 24/43 (55.8%) | 23/36 (63.9%) | 16 |
| all | enter | -0.5 | 32 | 14/32 (43.8%) | 12/32 (37.5%) | +6.3pp ±10.9 (n=32) | 14/22 (63.6%) | 12/23 (52.2%) | 7 |
| all | wait | +0.5 | 879 | 337/879 (38.3%) | 266/879 (30.3%) | +8.1pp ±1.9 (n=879) | 337/648 (52.0%) | 266/526 (50.6%) | 100 |
| all | wait | -0.5 | 540 | 177/540 (32.8%) | 205/540 (38.0%) | -5.2pp ±2.4 (n=540) | 177/334 (53.0%) | 205/403 (50.9%) | 45 |
| crash | enter | +0.5 | 34 | 15/34 (44.1%) | 16/34 (47.1%) | -2.9pp ±12.3 (n=34) | 15/30 (50.0%) | 16/25 (64.0%) | 12 |
| crash | enter | -0.5 | 18 | 7/18 (38.9%) | 7/18 (38.9%) | +0.0pp ±14.0 (n=18) | 7/14 (50.0%) | 7/15 (46.7%) | 6 |
| crash | wait | +0.5 | 183 | 67/183 (36.6%) | 53/183 (29.0%) | +7.7pp ±4.3 (n=183) | 67/137 (48.9%) | 53/108 (49.1%) | 29 |
| crash | wait | -0.5 | 104 | 32/104 (30.8%) | 41/104 (39.4%) | -8.7pp ±5.8 (n=104) | 32/64 (50.0%) | 41/80 (51.2%) | 15 |
| downtrend | wait | +0.5 | 237 | 82/237 (34.6%) | 81/237 (34.2%) | +0.4pp ±3.5 (n=237) | 82/171 (48.0%) | 81/143 (56.6%) | 27 |
| downtrend | wait | -0.5 | 147 | 49/147 (33.3%) | 53/147 (36.1%) | -2.7pp ±4.6 (n=147) | 49/89 (55.1%) | 53/108 (49.1%) | 10 |
| uptrend | enter | +0.5 | 20 | 9/20 (45.0%) | 7/20 (35.0%) | +10.0pp ±16.1 (n=20) | 9/13 (69.2%) | 7/11 (63.6%) | 4 |
| uptrend | enter | -0.5 | 14 | 7/14 (50.0%) | 5/14 (35.7%) | +14.3pp ±17.7 (n=14) | 7/8 (87.5%) | 5/8 (62.5%) | 1 |
| uptrend | wait | +0.5 | 226 | 86/226 (38.1%) | 55/226 (24.3%) | +13.7pp ±3.4 (n=226) | 86/160 (53.8%) | 55/128 (43.0%) | 14 |
| uptrend | wait | -0.5 | 145 | 46/145 (31.7%) | 50/145 (34.5%) | -2.8pp ±4.1 (n=145) | 46/87 (52.9%) | 50/105 (47.6%) | 5 |
| range | wait | +0.5 | 233 | 102/233 (43.8%) | 77/233 (33.0%) | +10.7pp ±4.0 (n=233) | 102/180 (56.7%) | 77/147 (52.4%) | 30 |
| range | wait | -0.5 | 144 | 50/144 (34.7%) | 61/144 (42.4%) | -7.6pp ±5.0 (n=144) | 50/94 (53.2%) | 61/110 (55.5%) | 15 |
| us | enter | +0.5 | 44 | 17/44 (38.6%) | 17/44 (38.6%) | +0.0pp ±10.8 (n=44) | 17/34 (50.0%) | 17/28 (60.7%) | 14 |
| us | enter | -0.5 | 26 | 11/26 (42.3%) | 8/26 (30.8%) | +11.5pp ±11.5 (n=26) | 11/17 (64.7%) | 8/18 (44.4%) | 5 |
| us | wait | +0.5 | 698 | 271/698 (38.8%) | 207/698 (29.7%) | +9.2pp ±2.1 (n=698) | 271/516 (52.5%) | 207/413 (50.1%) | 79 |
| us | wait | -0.5 | 433 | 146/433 (33.7%) | 174/433 (40.2%) | -6.5pp ±2.7 (n=433) | 146/270 (54.1%) | 174/325 (53.5%) | 34 |
| kr | enter | +0.5 | 10 | 7/10 (70.0%) | 6/10 (60.0%) | +10.0pp ±23.3 (n=10) | 7/9 (77.8%) | 6/8 (75.0%) | 2 |
| kr | enter | -0.5 | 6 | 3/6 (50.0%) | 4/6 (66.7%) | -16.7pp ±30.7 (n=6) | 3/5 (60.0%) | 4/5 (80.0%) | 2 |
| kr | wait | +0.5 | 181 | 66/181 (36.5%) | 59/181 (32.6%) | +3.9pp ±4.2 (n=181) | 66/132 (50.0%) | 59/113 (52.2%) | 21 |
| kr | wait | -0.5 | 107 | 31/107 (29.0%) | 31/107 (29.0%) | +0.0pp ±5.8 (n=107) | 31/64 (48.4%) | 31/78 (39.7%) | 11 |
| crash/us | enter | +0.5 | 24 | 8/24 (33.3%) | 10/24 (41.7%) | -8.3pp ±14.6 (n=24) | 8/21 (38.1%) | 10/17 (58.8%) | 10 |
| crash/us | enter | -0.5 | 12 | 4/12 (33.3%) | 3/12 (25.0%) | +8.3pp ±14.9 (n=12) | 4/9 (44.4%) | 3/10 (30.0%) | 4 |
| crash/us | wait | +0.5 | 111 | 43/111 (38.7%) | 34/111 (30.6%) | +8.1pp ±5.9 (n=111) | 43/80 (53.8%) | 34/61 (55.7%) | 19 |
| crash/us | wait | -0.5 | 65 | 21/65 (32.3%) | 29/65 (44.6%) | -12.3pp ±7.4 (n=65) | 21/37 (56.8%) | 29/49 (59.2%) | 9 |
| crash/kr | enter | +0.5 | 10 | 7/10 (70.0%) | 6/10 (60.0%) | +10.0pp ±23.3 (n=10) | 7/9 (77.8%) | 6/8 (75.0%) | 2 |
| crash/kr | enter | -0.5 | 6 | 3/6 (50.0%) | 4/6 (66.7%) | -16.7pp ±30.7 (n=6) | 3/5 (60.0%) | 4/5 (80.0%) | 2 |
| crash/kr | wait | +0.5 | 72 | 24/72 (33.3%) | 19/72 (26.4%) | +6.9pp ±6.0 (n=72) | 24/57 (42.1%) | 19/47 (40.4%) | 10 |
| crash/kr | wait | -0.5 | 39 | 11/39 (28.2%) | 12/39 (30.8%) | -2.6pp ±9.4 (n=39) | 11/27 (40.7%) | 12/31 (38.7%) | 6 |
| downtrend/us | wait | +0.5 | 182 | 59/182 (32.4%) | 58/182 (31.9%) | +0.5pp ±4.0 (n=182) | 59/133 (44.4%) | 58/110 (52.7%) | 22 |
| downtrend/us | wait | -0.5 | 111 | 35/111 (31.5%) | 41/111 (36.9%) | -5.4pp ±5.1 (n=111) | 35/69 (50.7%) | 41/82 (50.0%) | 8 |
| downtrend/kr | wait | +0.5 | 55 | 23/55 (41.8%) | 23/55 (41.8%) | +0.0pp ±7.3 (n=55) | 23/38 (60.5%) | 23/33 (69.7%) | 5 |
| downtrend/kr | wait | -0.5 | 36 | 14/36 (38.9%) | 12/36 (33.3%) | +5.6pp ±10.5 (n=36) | 14/20 (70.0%) | 12/26 (46.2%) | 2 |
| uptrend/us | enter | +0.5 | 20 | 9/20 (45.0%) | 7/20 (35.0%) | +10.0pp ±16.1 (n=20) | 9/13 (69.2%) | 7/11 (63.6%) | 4 |
| uptrend/us | enter | -0.5 | 14 | 7/14 (50.0%) | 5/14 (35.7%) | +14.3pp ±17.7 (n=14) | 7/8 (87.5%) | 5/8 (62.5%) | 1 |
| uptrend/us | wait | +0.5 | 197 | 79/197 (40.1%) | 46/197 (23.4%) | +16.8pp ±3.5 (n=197) | 79/143 (55.2%) | 46/113 (40.7%) | 10 |
| uptrend/us | wait | -0.5 | 127 | 43/127 (33.9%) | 49/127 (38.6%) | -4.7pp ±4.6 (n=127) | 43/79 (54.4%) | 49/96 (51.0%) | 4 |
| uptrend/kr | wait | +0.5 | 29 | 7/29 (24.1%) | 9/29 (31.0%) | -6.9pp ±11.0 (n=29) | 7/17 (41.2%) | 9/15 (60.0%) | 4 |
| uptrend/kr | wait | -0.5 | 18 | 3/18 (16.7%) | 1/18 (5.6%) | +11.1pp ±7.6 (n=18) | 3/8 (37.5%) | 1/9 (11.1%) | 1 |
| range/us | wait | +0.5 | 208 | 90/208 (43.3%) | 69/208 (33.2%) | +10.1pp ±4.2 (n=208) | 90/160 (56.3%) | 69/129 (53.5%) | 28 |
| range/us | wait | -0.5 | 130 | 47/130 (36.2%) | 55/130 (42.3%) | -6.2pp ±5.1 (n=130) | 47/85 (55.3%) | 55/98 (56.1%) | 13 |
| range/kr | wait | +0.5 | 25 | 12/25 (48.0%) | 8/25 (32.0%) | +16.0pp ±13.8 (n=25) | 12/20 (60.0%) | 8/18 (44.4%) | 2 |
| range/kr | wait | -0.5 | 14 | 3/14 (21.4%) | 6/14 (42.9%) | -21.4pp ±21.4 (n=14) | 3/9 (33.3%) | 6/12 (50.0%) | 2 |

## 5. Patterns

Per detected pattern. Raced = a breakout happened and the target / invalidation race ran; target_first is compared with the mean no-horizon null over all raced patterns that have an invalidation. `target_reached` (already at the target when analysed) and `target_reached_on_breakout` are separate skip reasons.

| group | verdict | patterns n | geometry_invalid | target_reached | target_reached_on_breakout | no_breakout | invalidated_before_breakout | raced n | target_first | null | difference ± se | gap exits |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | wait | 17 | 1 | 0 | 0 | 1 | 7 | 8 | 2/8 (25.0%) | +0.49 ±0.05 (n=8) | -24.4pp ±16.2 (n=8) | 1 |
| crash | wait | 3 | 1 | 0 | 0 | 0 | 0 | 2 | 0/2 (0.0%) | +0.59 ±0.04 (n=2) | -59.2pp ±4.4 (n=2) | 0 |
| downtrend | wait | 6 | 0 | 0 | 0 | 1 | 2 | 3 | 1/3 (33.3%) | +0.52 ±0.05 (n=3) | -18.2pp ±29.2 (n=3) | 0 |
| uptrend | wait | 5 | 0 | 0 | 0 | 0 | 4 | 1 | 0/1 (0.0%) | +0.57 (n=1) | -57.0pp (n=1) | 0 |
| range | wait | 3 | 0 | 0 | 0 | 0 | 1 | 2 | 1/2 (50.0%) | +0.33 ±0.15 (n=2) | +17.5pp ±35.3 (n=2) | 1 |
| us | wait | 15 | 1 | 0 | 0 | 1 | 7 | 6 | 1/6 (16.7%) | +0.49 ±0.07 (n=6) | -32.0pp ±18.2 (n=6) | 1 |
| kr | wait | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 1/2 (50.0%) | +0.52 ±0.08 (n=2) | -1.7pp ±41.8 (n=2) | 0 |
| crash/us | wait | 3 | 1 | 0 | 0 | 0 | 0 | 2 | 0/2 (0.0%) | +0.59 ±0.04 (n=2) | -59.2pp ±4.4 (n=2) | 0 |
| downtrend/us | wait | 4 | 0 | 0 | 0 | 1 | 2 | 1 | 0/1 (0.0%) | +0.51 (n=1) | -51.3pp (n=1) | 0 |
| downtrend/kr | wait | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 1/2 (50.0%) | +0.52 ±0.08 (n=2) | -1.7pp ±41.8 (n=2) | 0 |
| uptrend/us | wait | 5 | 0 | 0 | 0 | 0 | 4 | 1 | 0/1 (0.0%) | +0.57 (n=1) | -57.0pp (n=1) | 0 |
| range/us | wait | 3 | 0 | 0 | 0 | 0 | 1 | 2 | 1/2 (50.0%) | +0.33 ±0.15 (n=2) | +17.5pp ±35.3 (n=2) | 1 |

## 6. Forward returns against the baselines

Mean return `h` bars after the analysis, minus (a) the mean `h`-bar return of the symbol over the window's own closes and (b) the symbol's mean `h`-bar return over its whole bars file (the audit-style period baseline). Standard error is of the mean of the per-case excess.

| group | verdict | h | return | excess over window baseline | excess over period baseline |
| --- | --- | --- | --- | --- | --- |
| all | enter | 1 | +0.75% ±2.45 (n=6) | +0.12% ±2.39 (n=6) | +0.56% ±2.41 (n=6) |
| all | enter | 5 | +6.63% ±3.75 (n=6) | +3.61% ±4.79 (n=6) | +5.65% ±3.64 (n=6) |
| all | enter | 10 | +10.54% ±3.86 (n=6) | +4.21% ±4.29 (n=6) | +8.54% ±3.72 (n=6) |
| all | enter | 20 | +6.53% ±8.93 (n=6) | -7.89% ±7.92 (n=6) | +2.07% ±9.16 (n=6) |
| all | wait | 1 | -0.55% ±0.37 (n=94) | -0.54% ±0.36 (n=94) | -0.69% ±0.37 (n=94) |
| all | wait | 5 | +0.68% ±0.88 (n=94) | +0.71% ±0.88 (n=94) | -0.05% ±0.88 (n=94) |
| all | wait | 10 | -0.35% ±1.02 (n=94) | -0.16% ±1.05 (n=94) | -1.83% ±1.03 (n=94) |
| all | wait | 20 | +2.12% ±1.53 (n=94) | +2.76% ±1.62 (n=94) | -0.95% ±1.53 (n=94) |
| crash | enter | 1 | +2.63% ±3.38 (n=4) | +1.82% ±3.37 (n=4) | +2.41% ±3.34 (n=4) |
| crash | enter | 5 | +9.35% ±5.11 (n=4) | +5.45% ±7.16 (n=4) | +8.21% ±5.00 (n=4) |
| crash | enter | 10 | +14.08% ±4.87 (n=4) | +5.77% ±6.59 (n=4) | +11.73% ±4.83 (n=4) |
| crash | enter | 20 | +8.55% ±13.69 (n=4) | -11.22% ±12.01 (n=4) | +3.21% ±14.13 (n=4) |
| crash | wait | 1 | -1.06% ±1.22 (n=21) | -0.78% ±1.21 (n=21) | -1.20% ±1.22 (n=21) |
| crash | wait | 5 | +0.66% ±2.23 (n=21) | +2.11% ±2.27 (n=21) | -0.08% ±2.23 (n=21) |
| crash | wait | 10 | +0.28% ±2.71 (n=21) | +3.59% ±2.71 (n=21) | -1.20% ±2.73 (n=21) |
| crash | wait | 20 | +2.81% ±2.53 (n=21) | +11.07% ±3.24 (n=21) | -0.27% ±2.66 (n=21) |
| downtrend | wait | 1 | -1.68% ±0.47 (n=25) | -1.36% ±0.47 (n=25) | -1.82% ±0.47 (n=25) |
| downtrend | wait | 5 | +0.88% ±1.99 (n=25) | +2.46% ±2.01 (n=25) | +0.15% ±2.01 (n=25) |
| downtrend | wait | 10 | -1.99% ±1.72 (n=25) | +1.44% ±1.71 (n=25) | -3.46% ±1.79 (n=25) |
| downtrend | wait | 20 | +0.75% ±2.05 (n=25) | +8.03% ±2.15 (n=25) | -2.28% ±2.12 (n=25) |
| uptrend | enter | 1 | -3.00% ±0.18 (n=2) | -3.28% ±0.31 (n=2) | -3.13% ±0.16 (n=2) |
| uptrend | enter | 5 | +1.19% ±3.11 (n=2) | -0.08% ±3.99 (n=2) | +0.53% ±3.03 (n=2) |
| uptrend | enter | 10 | +3.46% ±2.38 (n=2) | +1.10% ±0.71 (n=2) | +2.16% ±2.54 (n=2) |
| uptrend | enter | 20 | +2.50% ±6.89 (n=2) | -1.24% ±3.02 (n=2) | -0.19% ±7.28 (n=2) |
| uptrend | wait | 1 | +0.37% ±0.61 (n=23) | -0.16% ±0.61 (n=23) | +0.21% ±0.61 (n=23) |
| uptrend | wait | 5 | +2.94% ±1.84 (n=23) | +0.31% ±1.69 (n=23) | +2.14% ±1.82 (n=23) |
| uptrend | wait | 10 | +0.22% ±2.41 (n=23) | -5.19% ±2.25 (n=23) | -1.38% ±2.37 (n=23) |
| uptrend | wait | 20 | +4.35% ±4.85 (n=23) | -7.53% ±3.82 (n=23) | +1.05% ±4.73 (n=23) |
| range | wait | 1 | +0.17% ±0.52 (n=25) | +0.12% ±0.52 (n=25) | +0.04% ±0.52 (n=25) |
| range | wait | 5 | -1.58% ±0.83 (n=25) | -1.85% ±0.85 (n=25) | -2.26% ±0.85 (n=25) |
| range | wait | 10 | +0.24% ±1.45 (n=25) | -0.28% ±1.49 (n=25) | -1.14% ±1.48 (n=25) |
| range | wait | 20 | +0.87% ±2.24 (n=25) | -0.01% ±2.42 (n=25) | -2.03% ±2.30 (n=25) |
| us | enter | 1 | +1.95% ±2.61 (n=5) | +1.27% ±2.56 (n=5) | +1.74% ±2.58 (n=5) |
| us | enter | 5 | +6.14% ±4.55 (n=5) | +2.76% ±5.78 (n=5) | +5.06% ±4.40 (n=5) |
| us | enter | 10 | +10.88% ±4.70 (n=5) | +3.51% ±5.18 (n=5) | +8.65% ±4.55 (n=5) |
| us | enter | 20 | +4.07% ±10.51 (n=5) | -13.48% ±6.87 (n=5) | -0.91% ±10.61 (n=5) |
| us | wait | 1 | -0.55% ±0.39 (n=74) | -0.57% ±0.38 (n=74) | -0.70% ±0.39 (n=74) |
| us | wait | 5 | +0.58% ±0.99 (n=74) | +0.51% ±1.01 (n=74) | -0.18% ±0.99 (n=74) |
| us | wait | 10 | -0.91% ±1.06 (n=74) | -0.95% ±1.17 (n=74) | -2.44% ±1.07 (n=74) |
| us | wait | 20 | +1.03% ±1.44 (n=74) | +1.15% ±1.81 (n=74) | -2.14% ±1.45 (n=74) |
| kr | enter | 1 | -5.23% (n=1) | -5.62% (n=1) | -5.32% (n=1) |
| kr | enter | 5 | +9.09% (n=1) | +7.84% (n=1) | +8.64% (n=1) |
| kr | enter | 10 | +8.86% (n=1) | +7.71% (n=1) | +7.96% (n=1) |
| kr | enter | 20 | +18.86% (n=1) | +20.05% (n=1) | +16.98% (n=1) |
| kr | wait | 1 | -0.53% ±0.98 (n=20) | -0.45% ±0.97 (n=20) | -0.65% ±0.98 (n=20) |
| kr | wait | 5 | +1.03% ±2.01 (n=20) | +1.43% ±1.79 (n=20) | +0.40% ±2.01 (n=20) |
| kr | wait | 10 | +1.71% ±2.81 (n=20) | +2.77% ±2.34 (n=20) | +0.42% ±2.80 (n=20) |
| kr | wait | 20 | +6.19% ±4.80 (n=20) | +8.73% ±3.35 (n=20) | +3.48% ±4.73 (n=20) |

## 7. Price provenance

Ungrounded = a price the model wrote that no number of the prompt grounds. The control checks the same results against another symbol's prompt: a rate near it means the check cannot tell grounded from coincidence. Rows of every bucket with a result are included (provenance does not depend on the bars). Korean prices are tick-snapped before they reach the stored result, so a made-up Korean price can look grounded: read the kr rows with that bias in mind.

| group | verdict | rows n | plan prices ungrounded | control: same plans, other prompt | other prices ungrounded | key prices ungrounded |
| --- | --- | --- | --- | --- | --- | --- |
| all | enter | 6 | 0/37 (0.0%) | 30/37 (81.1%) | 0/113 (0.0%) | 0/2 (0.0%) |
| all | wait | 94 | 4/571 (0.7%) | 564/571 (98.8%) | 6/1676 (0.4%) | 0/175 (0.0%) |
| crash | enter | 4 | 0/25 (0.0%) | 18/25 (72.0%) | 0/75 (0.0%) | 0/2 (0.0%) |
| crash | wait | 21 | 3/127 (2.4%) | 126/127 (99.2%) | 2/365 (0.5%) | 0/30 (0.0%) |
| downtrend | wait | 25 | 1/155 (0.6%) | 152/155 (98.1%) | 1/462 (0.2%) | 0/63 (0.0%) |
| uptrend | enter | 2 | 0/12 (0.0%) | 12/12 (100.0%) | 0/38 (0.0%) | – (n=0) |
| uptrend | wait | 23 | 0/137 (0.0%) | 134/137 (97.8%) | 1/418 (0.2%) | 0/42 (0.0%) |
| range | wait | 25 | 0/152 (0.0%) | 152/152 (100.0%) | 2/431 (0.5%) | 0/40 (0.0%) |
| us | enter | 5 | 0/30 (0.0%) | 30/30 (100.0%) | 0/94 (0.0%) | 0/2 (0.0%) |
| us | wait | 74 | 4/451 (0.9%) | 447/451 (99.1%) | 6/1334 (0.4%) | 0/146 (0.0%) |
| kr | enter | 1 | 0/7 (0.0%) | 0/7 (0.0%) | 0/19 (0.0%) | – (n=0) |
| kr | wait | 20 | 0/120 (0.0%) | 117/120 (97.5%) | 0/342 (0.0%) | 0/29 (0.0%) |

## 8. Plan invariants

Rows with a result: 100. Rows breaking each rule:

| rule | rows | share |
| --- | --- | --- |

## 9. Variance across repeats

Cases with at least two runs: 100. Usable runs per case (a run counts when it carries an analysis): 100 cases with 3. A case with fewer runs than the run's repeat count is still used, with the runs it has; its agreement and flips are over those runs.

| label | cases whose runs all agree | flip rate (pairwise) | comparisons n |
| --- | --- | --- | --- |
| trend | 89/100 (89.0%) | 7.3% | 300 |
| entryRecommendation | 100/100 (100.0%) | 0.0% | 300 |
| planOutcome | 57/100 (57.0%) | 29.7% | 300 |
| levelOutcome | 100/100 (100.0%) | 0.0% | 2546 |
| patternOutcome | 17/17 (100.0%) | 0.0% | 51 |

| plan price spread (max − min, ATR units) | median | p90 | cases n |
| --- | --- | --- | --- |
| stop | 0.21 | 1.23 | 100 |
| entry zone high | 0.37 | 1.11 | 100 |
| first target | 0.01 | 0.83 | 100 |

Mean Jaccard overlap of the key-level sets over run pairs: +0.70 ±0.01 (n=300).

