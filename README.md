# siglens-backtest-data

SIGLENS 백테스트의 원본 데이터 보관소입니다. 공개 요약과 채점 기록은 siglens 레포의
[`backtest-results/`](https://github.com/y0ngha/siglens/tree/master/backtest-results)에 있습니다.

## 실행 목록

| 실행 | 기간 | 종목 | 모델 | 요약 |
|---|---|---|---|---|
| [`runs/2026-11-daily-ai`](./runs/2026-11-daily-ai) | 2024-11-01 ~ 2026-11-02 | NVDA, AAPL, MSFT, AMZN, GOOGL, META, AVGO, TSLA, SPY, QQQ | DeepSeek V4.1 Flash (reasoning off, member tier) | 매매 690건, 승률 57.4%, 10종목 균등 포트폴리오 +29.1% (최대 낙폭 −9.3%), 추세 파악 일치율 89.2% |

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
| `usage.log` | 본실행 토큰 사용량(`[Usage]` 로그) |
| `scripts/` | 파이프라인 스크립트(1-fetch → 2-build-dataset → 3-run-ai → 4-evaluate → 5-export). siglens 레포 루트에서 `scripts/backtests/v8/`에 두고 실행 |

## 재현

1. siglens v0.114.1(`50da57f`) 체크아웃, `@y0ngha/siglens-core` 2.29.0(프롬프트 `p32`).
2. `scripts/`를 `scripts/backtests/v8/`에, `data/`를 `scripts/backtests/v8/data/`에 둔다.
3. `3-run-ai.ts`를 `RUN=1 ENTRY_MODE=with-wait`로 다시 돌리면 저장된 응답을 전부 재사용해 같은 경로가 나온다(새 호출 0건).
4. `4-evaluate.ts`, `5-export.ts`로 판정과 공개 산출물을 다시 만든다.
