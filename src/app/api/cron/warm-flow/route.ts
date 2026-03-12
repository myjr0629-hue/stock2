// Cron: Warm Flow Unified Cache
//
// Runs every 3 minutes during market hours (UTC 14-21, Mon-Fri).
// Pre-warms cache:flow:unified:* keys in Redis for top 30 tickers.
//
// Architecture:
//   1. Calls realtime-metrics + dark-pool-trades + options/trades (whale) in parallel
//   2. Writes combined data to Redis (hot cache, 4-min TTL)
//   3. Writes to DynamoDB signum-flow-history (permanent, Tier 2 fallback)
//
// Result: FLOW page loads from Redis (~10ms) instead of Polygon (~3-5s)
//
// Vercel Cron schedule: every 3 min, 14-21 UTC, Mon-Fri

import { NextResponse, NextRequest } from 'next/server';
import { setInCache, getFromCache } from '@/services/redisClient';
import { putFlowCache } from '@/lib/aws/flowCacheProvider';
import { GET as getRealtimeMetrics } from '@/app/api/flow/realtime-metrics/route';
import { GET as getDarkPoolTrades } from '@/app/api/flow/dark-pool-trades/route';
import { GET as getWhaleTrades } from '@/app/api/live/options/trades/route';

// Top 30 high-traffic tickers (M7 + major flow tickers)
const FLOW_TICKERS = [
    "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA",
    "AMD", "AVGO", "PLTR", "SMCI", "ARM", "COIN", "AI", "MRVL",
    "CRM", "NFLX", "JPM", "BAC", "GS",
    "SPY", "QQQ", "IWM",
    "SOFI", "HOOD", "MSTR", "MARA",
    "BA", "DIS", "UBER"
];

const CACHE_KEY_PREFIX = 'cache:flow:unified:';
const CACHE_TTL = 240; // 4 min — slightly longer than 3-min cron interval

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

async function buildFlowData(ticker: string, baseUrl: string) {
    const start = Date.now();

    const [realtimeMetrics, darkPoolTrades, whaleTrades] = await Promise.all([
        callInternalGet(getRealtimeMetrics, `${baseUrl}/api/flow/realtime-metrics?t=${ticker}`),
        callInternalGet(getDarkPoolTrades, `${baseUrl}/api/flow/dark-pool-trades?t=${ticker}`),
        callInternalGet(getWhaleTrades, `${baseUrl}/api/live/options/trades?t=${ticker}`),
    ]);

    return {
        timestamp: Date.now(),
        latencyMs: Date.now() - start,
        realtimeMetrics,
        darkPoolTrades,
        whaleTrades,
        _source: 'warm-flow-cron',
    };
}

export async function GET(request: Request) {
    const start = Date.now();
    const baseUrl = request.url.split('/api/')[0];

    let warmed = 0;
    let skipped = 0;
    let failed = 0;

    try {
        // Process 3 tickers concurrently to avoid Polygon rate limits
        const CONCURRENCY = 3;
        for (let i = 0; i < FLOW_TICKERS.length; i += CONCURRENCY) {
            const chunk = FLOW_TICKERS.slice(i, i + CONCURRENCY);

            await Promise.all(chunk.map(async (ticker) => {
                const cacheKey = `${CACHE_KEY_PREFIX}${ticker}`;

                // Skip if cache is still fresh (< 2 min old)
                try {
                    const existing = await getFromCache<any>(cacheKey);
                    if (existing?.timestamp && (Date.now() - existing.timestamp) < 120_000) {
                        skipped++;
                        return;
                    }
                } catch { /* continue */ }

                try {
                    const data = await buildFlowData(ticker, baseUrl);
                    if (data.realtimeMetrics || data.darkPoolTrades) {
                        // Dual-write: Redis (fast) + DynamoDB (permanent)
                        await Promise.all([
                            setInCache(cacheKey, data, CACHE_TTL),
                            putFlowCache(ticker, data),
                        ]);
                        warmed++;
                    } else {
                        failed++;
                    }
                } catch {
                    failed++;
                }
            }));
        }

        const duration = Date.now() - start;
        return NextResponse.json({
            success: true,
            tickers: FLOW_TICKERS.length,
            warmed,
            skipped,
            failed,
            duration: `${duration}ms`,
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
