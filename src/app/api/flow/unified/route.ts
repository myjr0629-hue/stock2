import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

// Import individual route GET handlers directly to bypass HTTP overhead
// DO NOT MODIFY external data-fetching logic inside these files.
import { GET as getLiveTicker } from '@/app/api/live/ticker/route';
import { GET as getDarkPool } from '@/app/api/flow/dark-pool-trades/route';
import { GET as getRealtimeMetrics } from '@/app/api/flow/realtime-metrics/route';

// Configuration
const CACHE_KEY_PREFIX = 'cache:flow:unified:';
const CACHE_TTL_SEC = 300; // 5 minutes solid cache (Redis TTL)
const REFRESH_THRESHOLD_MS = 60 * 1000; // 1 minute (trigger background refresh if older)

// Helper to reliably get the localhost URL for internal API calls
function getBaseUrl(request: NextRequest) {
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    const host = request.headers.get('host');
    if (host) return `${host.includes('localhost') ? 'http' : 'https'}://${host}`;
    return `http://localhost:${process.env.PORT || '3000'}`;
}

// Bypasses Next.js HTTP routing entirely by calling the GET handler as a standard async function
async function callInternalGet(handler: Function, url: string) {
    try {
        const mockReq = new NextRequest(url);
        const res = await handler(mockReq);
        if (!res || !res.ok) return null;
        return await res.json();
    } catch (e) {
        console.warn(`[Flow Unified] Direct functional call failed: ${url}`, e);
        return null;
    }
}

// Core Aggregation Function
async function buildUnifiedFlowData(ticker: string, baseUrl: string) {
    const start = Date.now();

    // 3 Parallel Internal Fetches (Whale Trades removed for async Progressive Loading)
    const [
        liveQuote,
        darkPool,
        realtimeMetrics
    ] = await Promise.all([
        callInternalGet(getLiveTicker, `${baseUrl}/api/live/ticker?t=${ticker}`),
        callInternalGet(getDarkPool, `${baseUrl}/api/flow/dark-pool-trades?ticker=${ticker}&limit=30`),
        callInternalGet(getRealtimeMetrics, `${baseUrl}/api/flow/realtime-metrics?ticker=${ticker}`)
    ]);

    const data = {
        liveQuote,
        whaleTrades: null, // Client will fetch this heavy data independently (Progressive Loading)
        darkPoolTrades: darkPool?.items || [],
        realtimeMetrics: realtimeMetrics || { darkPool: null, shortVolume: null, bidAsk: null, blockTrade: null },
        timestamp: Date.now()
    };

    console.log(`[Flow Unified] Built aggregation for ${ticker} in ${Date.now() - start}ms execution time`);
    return data;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker')?.toUpperCase() || searchParams.get('t')?.toUpperCase();

    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });
    }

    const cacheKey = `${CACHE_KEY_PREFIX}${ticker}`;

    try {
        // 1. Check Redis Cache First
        let cachedData = await getFromCache<any>(cacheKey);

        let needsRefresh = false;
        if (cachedData) {
            const ageMs = Date.now() - (cachedData.timestamp || 0);
            needsRefresh = ageMs > REFRESH_THRESHOLD_MS;

            if (needsRefresh) {
                console.log(`[Flow Unified] Returning Stale Cache (${Math.round(ageMs / 1000)}s old) - Triggering Background Update for ${ticker}`);
            } else {
                console.log(`[Flow Unified] Returning Fresh Cache (${Math.round(ageMs / 1000)}s old) for ${ticker}`);
            }
        } else {
            console.log(`[Flow Unified] Cache Miss for ${ticker} - Fetching synchronous data`);
            cachedData = null; // Ensure null if not found
        }

        const baseUrl = getBaseUrl(request);

        // 2. Cache Miss: We MUST wait for the fresh data (Zero-Latency SSR relies on this first fetch)
        if (!cachedData) {
            const freshData = await buildUnifiedFlowData(ticker, baseUrl);

            // Only cache if the critical data (liveQuote) was successfully fetched
            if (freshData && freshData.liveQuote) {
                await setInCache(cacheKey, freshData, CACHE_TTL_SEC);
            }

            return NextResponse.json(freshData);
        }

        // 3. Cache Hit but Stale: Return cache immediately, trigger background promise to update Redis
        if (needsRefresh) {
            // Background execution (Async Fire-and-Forget) -> Won't block the current response
            (async () => {
                try {
                    console.log(`[Flow Unified] Executing Background Refresh for ${ticker}`);
                    const newData = await buildUnifiedFlowData(ticker, baseUrl);
                    if (newData && newData.liveQuote) {
                        await setInCache(cacheKey, newData, CACHE_TTL_SEC);
                    }
                } catch (err) {
                    console.error(`[Flow Unified] Background Refresh Failed for ${ticker}`, err);
                }
            })(); // Invoke immediately
        }

        // Return the cached data instantly (Zero-Latency)
        return NextResponse.json(cachedData);

    } catch (error) {
        console.error('[Flow Unified] Unhandled Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch Unified Flow Data' },
            { status: 500 }
        );
    }
}
