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
    } catch { /* continue to Polygon */ }

    try {
        const data = await getStockChartData(symbol, range as Range);

        // [S-53.5] Extract sessionMaskDebug from data if present
        const sessionMaskDebug = (data as any).sessionMaskDebug || null;
        const buildId = getBuildId();

        // [S-55.10a] Enforce SSOT: Overwrite sessionMaskDebug.buildId with API buildId
        if (sessionMaskDebug) {
            sessionMaskDebug.buildId = buildId;
        }

        // [AWS] Cache to ElastiCache (60s TTL — reduces Polygon API pressure)
        try { await setInCache(cacheKey, { data, sessionMaskDebug }, CHART_CACHE_TTL); } catch { /* non-critical */ }

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

        return new Response(JSON.stringify(response), {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                // [S-78] Allow edge cache (CDN cache) but prevent browser cache
                'Cache-Control': 's-maxage=30, stale-while-revalidate=15'
            }
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 });
    }
}

