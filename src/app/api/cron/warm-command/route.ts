/**
 * [Phase 2] Cron: Warm Command Unified Cache
 * 
 * Runs every 3 minutes during market hours (UTC 14-21, Mon-Fri).
 * Pre-warms the cache:command:unified:* keys in Redis for popular tickers,
 * so users ALWAYS get instant cache hits (~50ms) instead of cold starts (~3s).
 * 
 * Vercel Cron: *​/3 14-21 * * 1-5
 */

import { NextResponse } from 'next/server';
import { setInCache, getFromCache } from '@/services/redisClient';
import { GET as getStructure } from '@/app/api/live/options/structure/route';
import { GET as getAtm } from '@/app/api/live/options/atm/route';
import { GET as getEarnings } from '@/app/api/live/earnings/route';
import { GET as getSma } from '@/app/api/live/sma/route';
import { GET as getRelated } from '@/app/api/live/related/route';
import { GET as getAnalyst } from '@/app/api/live/analyst/route';
import { GET as getVolatility } from '@/app/api/live/volatility-regime/route';
import { GET as getSqueeze } from '@/app/api/live/short-squeeze/route';
import { GET as getInstitutional } from '@/app/api/flow/realtime-metrics/route';
import { GET as getFundamentals } from '@/app/api/live/fundamentals/route';
import { GET as getOverview } from '@/app/api/live/overview/route';
import { NextRequest } from 'next/server';

// Same config as command/unified/route.ts to match cache keys
const CACHE_KEY_PREFIX = 'cache:command:unified:';
const CACHE_TTL_SEC = 300;

// Top popular tickers to pre-warm (M7 + most-viewed)
const WARM_TICKERS = [
    'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META',
    'AMD', 'AVGO', 'PLTR', 'SMCI', 'ARM', 'COIN', 'MU',
    'SPY', 'QQQ', 'SOFI', 'MARA', 'RIOT', 'MSTR',
];

// Locales to warm
const LOCALES = ['ko', 'en'];

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Same internal call pattern as command/unified/route.ts
async function callInternalGet(handler: Function, url: string) {
    try {
        const mockReq = new NextRequest(url);
        const res = await handler(mockReq);
        if (!res || !res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function buildUnifiedData(ticker: string, baseUrl: string, locale: string) {
    const start = Date.now();
    const [
        structure, optionsAtm, earnings, sma, related,
        analyst, volatility, squeeze, institutional, fundamentals, overview
    ] = await Promise.all([
        callInternalGet(getStructure, `${baseUrl}/api/live/options/structure?t=${ticker}`),
        callInternalGet(getAtm, `${baseUrl}/api/live/options/atm?t=${ticker}`),
        callInternalGet(getEarnings, `${baseUrl}/api/live/earnings?t=${ticker}`),
        callInternalGet(getSma, `${baseUrl}/api/live/sma?t=${ticker}`),
        callInternalGet(getRelated, `${baseUrl}/api/live/related?t=${ticker}`),
        callInternalGet(getAnalyst, `${baseUrl}/api/live/analyst?t=${ticker}`),
        callInternalGet(getVolatility, `${baseUrl}/api/live/volatility-regime?t=${ticker}`),
        callInternalGet(getSqueeze, `${baseUrl}/api/live/short-squeeze?t=${ticker}`),
        callInternalGet(getInstitutional, `${baseUrl}/api/flow/realtime-metrics?t=${ticker}`),
        callInternalGet(getFundamentals, `${baseUrl}/api/live/fundamentals?t=${ticker}`),
        callInternalGet(getOverview, `${baseUrl}/api/live/overview?t=${ticker}&lang=${locale}`),
    ]);

    return {
        timestamp: Date.now(),
        latencyMs: Date.now() - start,
        structure, options: optionsAtm, earnings, sma, related,
        analyst, volatility, squeeze, institutional, fundamentals, overview,
    };
}

export async function GET(request: Request) {
    const start = Date.now();
    const baseUrl = request.url.split('/api/')[0];
    const results: string[] = [];
    let warmed = 0;
    let skipped = 0;

    try {
        // Process tickers in batches of 5 to avoid overwhelming external APIs
        const BATCH_SIZE = 5;

        for (let i = 0; i < WARM_TICKERS.length; i += BATCH_SIZE) {
            const batch = WARM_TICKERS.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (ticker) => {
                for (const locale of LOCALES) {
                    const cacheKey = `${CACHE_KEY_PREFIX}${ticker}:${locale}`;

                    // Check if cache is still fresh enough (skip if < 2 min old)
                    try {
                        const existing = await getFromCache<any>(cacheKey);
                        if (existing?.timestamp && (Date.now() - existing.timestamp) < 120_000) {
                            skipped++;
                            return; // Still fresh, skip
                        }
                    } catch { /* continue */ }

                    try {
                        const data = await buildUnifiedData(ticker, baseUrl, locale);
                        if (data.structure || data.options) {
                            await setInCache(cacheKey, data, CACHE_TTL_SEC);
                            warmed++;
                            results.push(`${ticker}:${locale}:✅`);
                        } else {
                            results.push(`${ticker}:${locale}:⚠️`);
                        }
                    } catch {
                        results.push(`${ticker}:${locale}:❌`);
                    }
                }
            }));
        }

        const duration = Date.now() - start;
        return NextResponse.json({
            success: true,
            duration: `${duration}ms`,
            warmed,
            skipped,
            total: WARM_TICKERS.length * LOCALES.length,
            tickers: WARM_TICKERS,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
            warmed,
            skipped,
        }, { status: 500 });
    }
}
