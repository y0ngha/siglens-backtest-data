/**
 * 1단계 — 일봉·회사명 수집. 종목당 1회만 받고 data/bars/{T}.json에 저장한다.
 * 이미 파일이 있으면 건너뛴다(REFETCH=1이면 다시 받음).
 *
 *   npx tsx scripts/backtests/v8/1-fetch.ts
 */
import { config } from 'dotenv';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Bar } from '@y0ngha/siglens-core';
import {
    BARS_DIR,
    FETCH_FROM,
    FETCH_TO,
    TICKERS,
    ensureDirs,
    type StoredBars,
} from './lib';

config({ path: resolve(process.cwd(), '.env.local') });
// 시세 API의 기준 URL과 키. 저장된 일봉(data/bars)을 쓰면 이 단계는 돌릴 필요가 없다.
const API_KEY = process.env.MARKET_DATA_API_KEY ?? '';
const BASE = process.env.MARKET_DATA_BASE_URL ?? '';
if (!API_KEY || !BASE) throw new Error('MARKET_DATA_API_KEY and MARKET_DATA_BASE_URL are required in .env.local');

interface RawOhlcv {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

async function getJson<T>(path: string, query: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams({ ...query, apikey: API_KEY });
    for (let attempt = 1; ; attempt++) {
        const res = await fetch(`${BASE}/${path}?${qs}`);
        if (res.ok) return (await res.json()) as T;
        if (res.status === 429 && attempt < 4) {
            await new Promise(r => setTimeout(r, 5_000 * attempt));
            continue;
        }
        throw new Error(`market data ${path} ${query.symbol}: HTTP ${res.status}`);
    }
}

async function main(): Promise<void> {
    ensureDirs();
    for (const ticker of TICKERS) {
        const file = resolve(BARS_DIR, `${ticker}.json`);
        if (existsSync(file) && process.env.REFETCH !== '1') {
            console.log(`[${ticker}] exists — skip`);
            continue;
        }
        const raw = await getJson<RawOhlcv[]>('historical-price-eod/full', {
            symbol: ticker,
            from: FETCH_FROM,
            to: FETCH_TO,
        });
        const profile = await getJson<{ companyName?: string }[]>('profile', {
            symbol: ticker,
        });
        // 운영 시세 provider의 일봉 매핑과 같다. 응답이 최신순이라 뒤집는다.
        const bars: Bar[] = raw
            .map(r => ({
                time: Math.floor(Date.parse(`${r.date}T00:00:00Z`) / 1000),
                open: r.open,
                high: r.high,
                low: r.low,
                close: r.close,
                volume: r.volume,
            }))
            .reverse();
        const stored: StoredBars = {
            ticker,
            companyName: profile[0]?.companyName ?? ticker,
            fetchedAt: new Date().toISOString(),
            from: raw.at(-1)?.date ?? '',
            to: raw[0]?.date ?? '',
            bars,
        };
        writeFileSync(file, JSON.stringify(stored));
        console.log(
            `[${ticker}] ${bars.length} bars ${stored.from}~${stored.to} (${stored.companyName})`
        );
        await new Promise(r => setTimeout(r, 300));
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
