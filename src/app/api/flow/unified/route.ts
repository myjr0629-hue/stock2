import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getFlowCache } from '@/lib/aws/flowCacheProvider';

// Import individual route GET handlers directly to bypass HTTP overhead
// DO NOT MODIFY external data-fetching logic inside these files.
import { GET as getLiveTicker } from '@/app/api/live/ticker/route';
import { GET as getDarkPool } from '@/app/api/flow/dark-pool-trades/route';
import { GET as getRealtimeMetrics } from '@/app/api/flow/realtime-metrics/route';

// Configuration
// v2 = PRE 기준선 수정(2026-08-31). 값이 바뀌므로 옛 캐시를 폐기해야 한다.
const CACHE_KEY_PREFIX = 'cache:flow:unified:v2:';

/**
 * 이 페이로드를 캐시로 써도 되는가.
 *
 * ⚠️ [2026-09-03] 원래 조건이 `if (freshData && freshData.liveQuote)` 였다.
 *    **빈 객체 `{}` 는 truthy 다.** 그래서 수집이 한 번 실패해 `liveQuote:{}` 가
 *    나오면 그게 그대로 캐시에 앉고, TTL 내내 **40/40 종목이 전부 빈 화면**이 됐다
 *    (실측: dataSource=NONE · price=null · rawChain=0 — 그런데 200 OK).
 *    마케팅용 스크린샷을 찍다가 발견했다. 화면만 봐서는 「로딩 중」과 구별이 안 된다.
 *
 *    가격이 플로우 화면의 머리글이다. 가격이 없으면 캐시로서 무효고, 막아야
 *    다음 요청이 새로 가져올 기회를 얻는다(막지 않으면 스스로 낫지 못한다).
 */
function isUsableFlow(d: any): boolean {
    const q = d?.liveQuote;
    if (!q || typeof q !== 'object') return false;
    return q.price != null || q.prevClose != null;
}
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
        darkPoolStats: darkPool ? { totalDarkPoolVolume: darkPool.totalDarkPoolVolume, totalVolume: darkPool.totalVolume, darkPoolPercent: darkPool.darkPoolPercent, tradesScanned: darkPool.tradesScanned } : null,
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
        // === TIER 1: Redis Cache (warm-flow cron pre-warmed) ===
        let cachedData = await getFromCache<any>(cacheKey);
        if (cachedData && !isUsableFlow(cachedData)) {
            console.warn(`[Flow Unified] 캐시에 값이 없다(빈 liveQuote) — 무시하고 새로 가져온다: ${ticker}`);
            cachedData = null;
        }

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
            console.log(`[Flow Unified] Redis Miss for ${ticker} - Trying DynamoDB Tier 2`);
        }

        const baseUrl = getBaseUrl(request);

        // === TIER 2: DynamoDB Fallback (permanent, ~50ms) ===
        if (!cachedData) {
            try {
                const dynamoData = await getFlowCache(ticker, 600000); // max 10 min old
                if (dynamoData && isUsableFlow(dynamoData)) {
                    console.log(`[Flow Unified] DynamoDB Hit for ${ticker} (${dynamoData._ageMs}ms old)`);
                    // Re-warm Redis from DynamoDB data
                    await setInCache(cacheKey, dynamoData, CACHE_TTL_SEC).catch(() => {});
                    cachedData = dynamoData;
                    needsRefresh = true; // Trigger background refresh to get latest
                }
            } catch (e) {
                console.warn(`[Flow Unified] DynamoDB Tier 2 failed for ${ticker}`, e);
            }
        }

        // === TIER 3: Polygon Live API (slowest, ~3-5s) ===
        if (!cachedData) {
            console.log(`[Flow Unified] Full Cache Miss for ${ticker} - Fetching from Polygon`);
            const freshData = await buildUnifiedFlowData(ticker, baseUrl);

            // 값이 실제로 들어 있을 때만 캐시한다 (`liveQuote` 존재만으론 부족하다 — 위 주석)
            if (isUsableFlow(freshData)) {
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
                    if (isUsableFlow(newData)) {
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
