# siglens-backtest-data

SIGLENS 백테스트의 원본 데이터 보관소입니다. 공개 요약과 채점 기록은 siglens 레포의
[`backtest-results/`](https://github.com/y0ngha/siglens/tree/master/backtest-results)에 있습니다.

## 실행 목록

| 실행 | 기간 | 종목 | 모델 | 요약 |
|---|---|---|---|---|
| [`runs/2026-11-daily-ai`](./runs/2026-11-daily-ai) | 2024-11-01 ~ 2026-11-02 | NVDA, AAPL, MSFT, AMZN, GOOGL, META, AVGO, TSLA, SPY, QQQ | DeepSeek V4.1 Flash (reasoning off, member tier) | 매매 690건, 승률 57.4% (수익률 0 초과 비율, 1차 목표가가 먼저 닿은 비율과는 다른 값: 처음 세운 가격 기준 52.7%, 같은 거리를 임의의 날에 둔 경우 49.1%, 같은 판정 규칙), 10종목 균등 포트폴리오 +29.1% (청산된 매매만 기준 최대 낙폭 −9.3%, 매일 종가 평가 −12.4%), 추세 파악 일치율 89.2%. 같은 일봉 기준 비교: 투자 비중만큼만 보유 +27.5%, 계속 보유 시 매일 종가 평가 최대 낙폭 −30.0%, 임의 날짜 2,000회 시험에서 AI보다 수익률이 높았던 경우 50.9%, 거래당 진입 시점 효과 −0.06% (95% 범위 −0.40% ~ +0.30%) |

## `runs/2026-11-daily-ai` 구성

| 경로 | 내용 |
|---|---|
| `data/bars/{T}.json` | 일봉 원본(2019-06 ~ 2026-11, 운영 시세 provider와 같은 매핑)과 회사명 |
| `data/dataset/{T}.json.gz` | 시뮬레이션 구간 매 거래일의 계산 결과: 운영 730일 창 지표 마지막 값, 신호, 운영 `runAnalysis`가 조립한 dynamic 프롬프트 전문과 계산 섹션(캔들·SMC·차트 패턴 후보·추세선·피보나치/피벗·공포탐욕 등). 모두 이력·보유 없는 상태 |
| `data/ai/{T}.json` | AI 호출 기록. 키 `날짜\|보유구간\|이력해시`마다 넘긴 이전 분석, 응답(core 후처리 결과), 프롬프트·원문 파일 경로 |
| `data/ai/prompts/` | 호출별 dynamic 프롬프트(`{T}/*.json.gz`)와 system 프롬프트(`system-*.txt.gz`, 해시로 1벌) |
| `data/ai/raw/{T}/*.json.gz` | DeepSeek HTTP 원문: 요청 본문(모델·스키마·reasoning·입력)과 스트림 응답 전문. 인증 헤더는 저장하지 않음 |
| `sim/sim-with-wait-{T}.json` | 최종 경로의 매매(절반별 청산), 진입 판단, 호출 타임라인 |
| `summary.json` | 4단계 판정 결과 |
| `benchmarks/` | 기준선 측정 결과(core `scripts/replay/backtestBenchmarks.ts`): `benchmarks.json`(계속 보유, 투자 비중 맞춘 보유, 매일 평가 최대 낙폭, 같은 날수 보유 대비 거래당 차이, 임의 진입 2,000회, 목표가·손절가 비교), `per-trade.csv`, `perTicker.json`, `diagnostics.json`. `5-export.ts`가 `BENCHMARKS_IN`으로 읽는다 |
| `usage.log` | 본실행 토큰 사용량(`[Usage]` 로그) |
| `scripts/` | 파이프라인 스크립트(1-fetch → 2-build-dataset → 3-run-ai → 4-evaluate → 5-export, 저장된 응답만 쓰는 6-replay). siglens 레포 루트에서 `scripts/backtests/v8/`에 두고 실행 |

## 재현

1. siglens v0.114.1(`50da57f`) 체크아웃, `@y0ngha/siglens-core` 2.29.0(프롬프트 `p32`).
2. `scripts/`를 `scripts/backtests/v8/`에, `data/`를 `scripts/backtests/v8/data/`에 둔다.
3. `3-run-ai.ts`를 `RUN=1 ENTRY_MODE=with-wait`로 다시 돌리면 저장된 응답을 전부 재사용해 같은 경로가 나온다(새 호출 0건).
4. `4-evaluate.ts`, `5-export.ts`로 판정과 공개 산출물을 다시 만든다.
5. 기준선은 siglens-core 레포의 main에서 `npx tsx scripts/replay/backtestBenchmarks.ts --run <이 레포>/runs/2026-11-daily-ai --page-data <data.json> --out <레포 밖 디렉터리>`로 잰다(커밋된 깨끗한 체크아웃만, 네트워크·모델 없음). 같은 입력이면 파일이 바이트까지 같다. 이 레포에는 결과가 `benchmarks/`에 있다.
6. `BENCHMARKS_IN=<위 --out 디렉터리> GENERATED_AT=<ISO 시각> PAGE_DATA_OUT=<data.json 경로> CANONICAL_JSON_MODULE=<core 빌드의 domain/canonicalJson.js> npx tsx scripts/backtests/v8/5-export.ts`로 `data.json`·`trades.csv`·`summary.json`에 기준선을 넣는다. 내보내는 매매의 sha256(canonicalJson(trades))가 `benchmarks.tradesSha256`과 다르면 종료 코드 2로 멈춘다. `CANONICAL_JSON_MODULE`을 생략하면 `@y0ngha/siglens-core`에서 가져오므로, `canonicalJson`이 들어 있는 배포본이 설치돼 있어야 한다.

## 기준선(benchmarks) 정의

AI 전략의 수익률 옆에 놓는 비교 수치다. 모두 저장된 일봉으로만 계산하고, 정의는 core 스크립트 머리말에 실행 전에 적어 둔 것을 따른다.

| 항목 | 정의 |
|---|---|
| 계속 보유 | 종목당 1/N 자본, 리밸런싱 없음, 일별 종가 평가. 수익률 +44.29%, 최대 낙폭 −30.00% |
| 투자 비중 맞춘 보유 | 종목마다 `e × 계속 보유 + (1−e) × 현금`(e는 보유일 합 / 거래일). 포트폴리오 e = 62.5%. 수익률 +27.50%, 최대 낙폭 −19.65% |
| 매일 평가 최대 낙폭 | 열린 포지션은 그날 종가로, 청산된 절반은 청산가로 평가한 곡선. AI 전략 −12.39%(청산된 매매만 −9.29%) |
| 거래당 진입 시점 효과 | 매매마다 같은 종목을 같은 날수만큼 들고 있었을 때의 모든 구간 평균을 뺀 값. 평균 −0.06%, 진입 주 단위 군집 부트스트랩 95% 범위 −0.40% ~ +0.30%(690건) |
| 임의 진입 | 종목별 보유 기간 목록은 그대로 두고 겹치지 않게 임의 날짜에 배치, 2,000회. 수익률 가운데 90% +12.70% ~ +49.92%(중앙값 +29.48%), AI보다 높았던 경우 50.9%. 최대 낙폭 중앙값 −19.67%, AI(−12.39%)보다 작았던 경우 0.6%. 이 시험에는 손절가 즉시 청산 규칙이 없어서 낙폭 비교에는 그 규칙의 영향이 섞여 있다 |
| 목표가·손절가 (짝 비교) | `bracket.initialPlan.targetFirstShare`(처음 세운 1차 목표가·손절가를 같은 판정 규칙으로 다시 돌린 값, 641건 중 52.73%)와 `bracket.placebo.targetFirstShare`(같은 거리를 같은 종목의 임의 날 3곳에 둔 값, 49.14%)만 견줄 수 있다. `storedTargetFirstShare`(56.63%)는 보유 중 재분석이 올린 가격이 섞여 있어 견줄 수 없다 |

`trades.csv`에는 `same_length_drift_pct`와 `excess_pct` 두 열이 끝에 붙고, `data.json`에는 `benchmarks`와 종목별 `exposureMatchedHoldPct`·`markToMarketMaxDrawdownPct`가, `summary.json`에는 `benchmarks`가 들어간다.
