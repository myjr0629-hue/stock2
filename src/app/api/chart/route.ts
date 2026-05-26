import { NextResponse } from 'next/server';
import { getStockChartData, Range } from '@/services/stockApi';
import { getBuildId } from '@/services/buildIdSSOT'; // [S-56.4.6e]
import { getFromCache, setInCache } from '@/services/redisClient';

// [FIX] force-dynamic — 차트는 시간/세션에 따라 결과가 달라지므로 CDN 정적 캐시 불가
// 이전 revalidate=30이 브라우저 디스크 캐시와 결합되어 Ctrl+Shift+R 없이는 구 데이터 표시되는 버그 유발
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const range = searchParams.get('range') || '1d';

    if (!symbol) {
        return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    // [FIX] Redis cache — 1D는 60초 (가격 실시간 추적과 동기화), 장기 차트는 10분
    // 이전 300초는 WebSocket 실시간 가격과 차트 데이터 불일치를 유발했음
    const CHART_CACHE_TTL = range === '1d' ? 60 : 600;
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
                // [FIX] Check holidays so chart API doesn't think it's POST on Memorial Day etc.
                const CHART_HOLIDAYS: Record<string, boolean> = {
                    '01-01': true, '01-19': true, '02-16': true, '04-03': true,
                    '05-25': true, '06-19': true, '07-03': true, '09-07': true,
                    '11-26': true, '12-25': true
                };
                const etDateKey = `${String(et.month).padStart(2,'0')}-${String(et.day).padStart(2,'0')}`;
                const isHoliday = !!CHART_HOLIDAYS[etDateKey];
                const liveSession = getSessionType(et.hour, et.minute, et.isWeekend, isHoliday);
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
                        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': range === '1d' ? 'no-store, no-cache, must-revalidate' : 's-maxage=60, stale-while-revalidate=30' }
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
                    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': range === '1d' ? 'no-store, no-cache, must-revalidate' : 's-maxage=60, stale-while-revalidate=30' }
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

        // [FIX] 1D 차트는 브라우저/CDN 캐시 금지 — 항상 신선한 데이터
        // 장기 차트(5D+)만 CDN 캐시 허용
        const cacheControlHeader = (isSparseData || range === '1d')
            ? 'no-store, no-cache, must-revalidate'
            : 's-maxage=60, stale-while-revalidate=30';

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

