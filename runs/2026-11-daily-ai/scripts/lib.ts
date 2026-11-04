/**
 * 백테스트 v8 공용 모듈 — 종목 목록, 저장 경로, 과거 시점 시계, 저장 봉 provider.
 *
 * 파이프라인 (각 단계는 앞 단계의 저장 파일만 읽는다):
 *   1-fetch.ts          일봉·회사명을 한 번 받아 data/bars/{T}.json 저장 (이미 있으면 건너뜀)
 *   2-build-dataset.ts  저장 봉으로 지표·신호·후보일 계산 + 후보일 프롬프트(운영 runAnalysis 경로) 캡처
 *                       → data/dataset/{T}.json  (LLM 호출 없음)
 *   3-run-ai.ts         종목별 시간순 시뮬레이션. 신호일 분석 → enter면 매수(메모리 보유) →
 *                       보유 중 정기 재분석(positionBucket) → 청산. 응답은 data/ai/{T}.json에 누적
 *   4-evaluate.ts       정적 판정(승률·수익·청산 사유 등) + 화면용 data.json 생성 + 보고서
 *
 * 운영 재현 원칙: AI 호출은 core `runAnalysis`를 운영 prewarm과 같은 옵션으로 부른다
 * (`src/entities/analysis/api.ts` prewarmTechnical — DeepSeek V4.1 Flash, tier free, reasoning off).
 * 다른 점은 (1) 봉을 저장 파일에서 진입일까지만 공급, (2) 시계를 진입일 장마감 뒤로 돌림,
 * (3) 캐시 null(운영 Redis 미접촉), (4) 이력·이벤트·실적일 없음(시점 재현 불가).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Bar, MarketDataProvider } from '@y0ngha/siglens-core';

// ─── 종목 ──────────────────────────────────────────────────────────────────────
// siglens-trader 감시 40종목 기준(2026-10 운영 목록). IONQ 제외, ORCL로 40 채움.
export const TICKERS = [
    // 핵심 성장·지수
    'NVDA', 'TSLA', 'PLTR', 'AMD', 'AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'AVGO',
    'COIN', 'MSTR', 'SMCI', 'RKLB', 'HOOD', 'SPY', 'QQQ',
    // 반도체 9
    'MU', 'TSM', 'ASML', 'MRVL', 'LRCX', 'AMAT', 'QCOM', 'ARM', 'ANET',
    // 소프트웨어 13 + ORCL
    'NFLX', 'CRM', 'ADBE', 'NOW', 'SHOP', 'UBER', 'CRWD', 'PANW', 'SNOW', 'NET',
    'DDOG', 'ZS', 'APP', 'ORCL',
] as const;

// ─── 기간 ──────────────────────────────────────────────────────────────────────
/** 시세 수집 시작. 공포·탐욕 지수 창(1,830일) + 지표 창(730일)을 첫 진입일 앞에 확보한다. */
export const FETCH_FROM = '2019-06-01';
export const FETCH_TO = '2026-11-02';
/** 시뮬레이션(진입 가능) 구간 시작. 끝은 저장 봉 마지막 날까지. */
export const SIM_START = '2024-11-01';

// ─── 경로 ──────────────────────────────────────────────────────────────────────
export const ROOT = resolve(process.cwd(), 'scripts/backtests/v8');
export const BARS_DIR = resolve(ROOT, 'data/bars');
export const DATASET_DIR = resolve(ROOT, 'data/dataset');
export const AI_DIR = resolve(ROOT, 'data/ai');
export const OUT_DIR = resolve(ROOT, 'out');
export function ensureDirs(): void {
    for (const d of [BARS_DIR, DATASET_DIR, AI_DIR, OUT_DIR])
        mkdirSync(d, { recursive: true });
}

// ─── 저장 형태 ─────────────────────────────────────────────────────────────────
export interface StoredBars {
    ticker: string;
    companyName: string;
    fetchedAt: string;
    from: string;
    to: string;
    /** 오래된 → 최신. 운영 시세 provider의 일봉 매핑과 같다(UTC 자정). */
    bars: Bar[];
}

export const toIsoDate = (timeSec: number): string =>
    new Date(timeSec * 1000).toISOString().slice(0, 10);

/** 마지막 진입 후보 뒤로 결과를 볼 최소 거래일 수. */
export const TAIL_BARS = 10;

export interface DayRecord {
    date: string;
    /** StoredBars.bars 안의 인덱스. */
    barIndex: number;
    close: number;
    /** 운영 730일 창 안의 봉 수. */
    windowBars: number;
    /** 운영 창으로 계산한 지표의 마지막 값(시리즈는 마지막 원소, 중첩 객체는 재귀). */
    indicators: unknown;
    signals: { type: string; direction: string; phase: string; detectedAt: string }[];
    bullishTypes: string[];
    freshBullish: string[];
    closeAboveMa50: boolean;
    isCandidate: boolean;
    /** 보유 없음(positionBucket 없음) 상태의 운영 프롬프트. */
    prompt: {
        promptVersion: string;
        systemHash: string;
        dynamic: string;
        /** sha256(system + "\n\n" + dynamic). 3단계 재조립 대조용. */
        hash: string;
        /** 계산 섹션(지표·캔들·SMC·차트 패턴·추세선·Market Reference(피보나치·피벗)·공포탐욕 등). */
        sections: Record<string, string>;
    };
}
export interface TickerDataset {
    ticker: string;
    companyName: string;
    simStart: string;
    builtAt: string;
    tier: 'member';
    model: string;
    /** systemHash → system 프롬프트 전문. */
    systems: Record<string, string>;
    days: DayRecord[];
}

export const promptHash = (system: string, dynamic: string): string =>
    createHash('sha256').update(`${system}\n\n${dynamic}`).digest('hex');

export function loadDataset(ticker: string): TickerDataset {
    return JSON.parse(
        gunzipSync(readFileSync(resolve(DATASET_DIR, `${ticker}.json.gz`))).toString(
            'utf-8'
        )
    ) as TickerDataset;
}
export function loadBars(ticker: string): StoredBars {
    return JSON.parse(
        readFileSync(resolve(BARS_DIR, `${ticker}.json`), 'utf-8')
    ) as StoredBars;
}

// ─── 과거 시점 시계 ────────────────────────────────────────────────────────────
// core `fetchBarsWithIndicators`는 `new Date()` 기준 730일 창으로 봉을 자른다. 과거 진입일을
// 운영과 같은 창으로 보려면 시계를 그날로 돌려야 한다. 후보마다 다른 시각이 동시에 돌기
// 때문에 전역 고정 대신 AsyncLocalStorage로 비동기 체인마다 오프셋을 둔다.
const RealDate = Date;
const clock = new AsyncLocalStorage<{ offsetMs: number }>();
class ShiftedDate extends RealDate {
    constructor(...args: unknown[]) {
        if (args.length === 0) {
            super(RealDate.now() + (clock.getStore()?.offsetMs ?? 0));
        } else {
            // @ts-expect-error — Date 생성자 오버로드를 그대로 넘긴다.
            super(...args);
        }
    }
    static now(): number {
        return RealDate.now() + (clock.getStore()?.offsetMs ?? 0);
    }
}
globalThis.Date = ShiftedDate as DateConstructor;

/** 미국 정규장 마감(최대 21:00 UTC) 뒤 — 그날 일봉이 확정된 시점. */
export function closeInstantOf(isoDate: string): number {
    return RealDate.parse(`${isoDate}T22:00:00Z`);
}
export function runAt<T>(instantMs: number, fn: () => Promise<T>): Promise<T> {
    return clock.run({ offsetMs: instantMs - RealDate.now() }, fn);
}

// ─── 저장 봉 provider ──────────────────────────────────────────────────────────
/**
 * 진입일(asOf)까지의 봉만 돌려준다 — look-ahead 차단. 운영 시세 provider처럼 `limit`은
 * 무시하고 `from` 날짜로만 자른다(운영 provider의 getBars 주석).
 */
export function storedProvider(
    bars: readonly Bar[],
    asOfDate: string
): MarketDataProvider {
    const asOfSec = RealDate.parse(`${asOfDate}T00:00:00Z`) / 1000;
    return {
        async getBars({ from }) {
            const fromSec =
                from !== undefined ? RealDate.parse(from) / 1000 : -Infinity;
            return bars.filter(b => b.time >= fromSec && b.time <= asOfSec);
        },
        async getQuote() {
            return null;
        },
    };
}

export async function mapLimit<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    const workers = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            while (next < items.length) {
                const i = next++;
                out[i] = await fn(items[i], i);
            }
        }
    );
    await Promise.all(workers);
    return out;
}
