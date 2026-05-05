import { NextResponse } from 'next/server';
import { getStockChartData, Range } from '@/services/stockApi';
import { getBuildId } from '@/services/buildIdSSOT'; // [S-56.4.6e]
import { getFromCache, setInCache } from '@/services/redisClient';

// [S-78] Edge cache for 30 seconds - faster chart load while maintaining accuracy
export const revalidate = 30;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const range = searchParams.get('range') || '1d';

    if (!symbol) {
        return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    // [AWS] Redis cache first (300s TTL — chart visualization doesn't need sub-minute freshness)
    // [PERF] Increased from 60s→300s to maximize cache hits and reduce Polygon API pressure
    const CHART_CACHE_TTL = range === '1d' ? 300 : 600; // 5min for intraday, 10min for historical
    const cacheKey = `chart:${symbol}:${range}`;
    try {
        const cached = await getFromCache<any>(cacheKey);
        if (cached) {
            // [SESSION-AWARE CACHE] For 1D charts, detect session transitions (e.g. REG→POST)
            // If the cached data was built during a different session, bypass cache and fetch fresh.
            // This ensures POST-market chart appears immediately when entering from REG session.
            if (range === '1d' && cached.sessionMaskDebug?.currentSession) {
                const { getETNow, getSessionType } = await import('@/services/timezoneUtils');
                const et = getETNow();
                const liveSession = getSessionType(et.hour, et.minute, et.isWeekend);
                const cachedSession = cached.sessionMaskDebug.currentSession;

                if (liveSession !== 'CLOSED' && cachedSession !== liveSession) {
                    // Session mismatch — skip cache, fetch fresh from Polygon
                    console.log(`[Chart] Session mismatch for ${symbol}: cached=${cachedSession}, live=${liveSession} — bypassing cache`);
                    // Fall through to Polygon fetch below
                } else {
                    // Same session — serve from cache
                    const buildId = getBuildId();
                    return new Response(JSON.stringify({
                        data: cached.data,
                        meta: { buildId, timestampISO: new Date().toISOString(), sessionMaskDebug: cached.sessionMaskDebug, _cached: true },
                        range, symbol, count: cached.data?.length || 0
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 's-maxage=30, stale-while-revalidate=15' }
                    });
                }
            } else {
                // Non-1D range or no session info — always serve from cache
                const buildId = getBuildId();
                return new Response(JSON.stringify({
                    data: cached.data,
                    meta: { buildId, timestampISO: new Date().toISOString(), sessionMaskDebug: cached.sessionMaskDebug, _cached: true },
                    range, symbol, count: cached.data?.length || 0
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 's-maxage=30, stale-while-revalidate=15' }
                });
            }
        }
    } catch { /* continue to Polygon */ }

    try {
        const data = await getStockChartData(symbol, range as Range);

        // [SMART CACHE BYPASS] Check if data is sparse (e.g. < 5 points, usually just a synthetic anchor)
        const isSparseData = data.length < 5;

        // [S-53.5] Extract sessionMaskDebug from data if present
        const sessionMaskDebug = (data as any).sessionMaskDebug || null;
        const buildId = getBuildId();

        // [S-55.10a] Enforce SSOT: Overwrite sessionMaskDebug.buildId with API buildId
        if (sessionMaskDebug) {
            sessionMaskDebug.buildId = buildId;
        }

        // [AWS] Cache to ElastiCache ONLY if data is sufficient (Prevents 5-minute trap)
        if (!isSparseData) {
            try { await setInCache(cacheKey, { data, sessionMaskDebug }, CHART_CACHE_TTL); } catch { /* non-critical */ }
        }

        // [S-52.2.3] Inject build metadata for staleness detection
        const response = {
            data,
            meta: {
                buildId,
                timestampISO: new Date().toISOString(),
                sessionMaskDebug // [S-53.5] Chart session masking diagnostic
            },
            range,
            symbol,
            count: data.length
        };

        // [SMART CACHE BYPASS] If data is sparse, DO NOT cache at the CDN Edge!
        const cacheControlHeader = isSparseData 
            ? 'no-store, max-age=0'
            : 's-maxage=30, stale-while-revalidate=15';

        return new Response(JSON.stringify(response), {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': cacheControlHeader
            }
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 });
    }
}

