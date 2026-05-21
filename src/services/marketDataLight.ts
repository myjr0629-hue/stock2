import { fetchMassive } from '@/services/massiveClient';
import { getETNow, getETDateNDaysAgo, getETOffset } from '@/services/timezoneUtils';
import { getFromCache, setInCache } from '@/services/redisClient';

// [V5.5 FIX] Robust Pre-Market fetcher to bypass Polygon's Snapshot bug
export async function fetchTruePreMarket(symbol: string): Promise<number | null> {
    const et = getETNow();
    const cacheKey = `pm_true_close:${symbol}:${et.dateString}`;

    try {
        const cached = await getFromCache<number>(cacheKey);
        if (cached) return cached;
    } catch { }

    // [PERF] Parallel scan: check all 4 days simultaneously instead of sequential for-loop
    const candidates = Array.from({ length: 4 }, (_, i) => {
        const checkDateStr = getETDateNDaysAgo(i);
        const etOffset = getETOffset(checkDateStr);
        const startTs = new Date(`${checkDateStr}T04:00:00${etOffset}`).getTime();
        const endTs = new Date(`${checkDateStr}T09:29:59${etOffset}`).getTime();
        const url = `/v2/aggs/ticker/${symbol}/range/1/minute/${startTs}/${endTs}?adjusted=true&sort=desc&limit=1`;
        return fetchMassive(url).catch(() => null);
    });

    const results = await Promise.allSettled(candidates);

    for (const result of results) {
        if (result.status === 'fulfilled' && result.value?.results?.length > 0) {
            const pmClose = result.value.results[0].c;
            const etTime = et.hour + et.minute / 60;
            const preMarketEnded = etTime >= 9.5 || et.isWeekend;
            if (preMarketEnded) {
                await setInCache(cacheKey, pmClose, 24 * 60 * 60).catch(() => { });
            }
            return pmClose;
        }
    }
    return null;
}

// [PERF] Core data fetcher — called by Polygon APIs
async function _fetchStockDataLight(symbol: string) {
    const to = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];

    const [snapRes, rsiRes, dailyAggs, truePmRes] = await Promise.all([
        fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`),
        fetchMassive(`/v1/indicators/rsi/${symbol}`, { timespan: 'day', window: '14', limit: '1' }).catch(() => null),
        fetchMassive(`/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${to}`, { limit: '5000', adjust: 'true', sort: 'asc' }).catch(() => null),
        fetchTruePreMarket(symbol)  // Parallel fetch for true PM price
    ]);

    const t = snapRes?.ticker;
    if (!t) return null;

    const et = getETNow();
    const etTime = et.hour + et.minute / 60;

    let session: 'pre' | 'reg' | 'post' | 'closed' = 'reg';
    if (!et.isWeekend) {
        if (etTime >= 4 && etTime < 9.5) session = 'pre';
        else if (etTime >= 16 && etTime < 20) session = 'post';
        else if (etTime >= 9.5 && etTime < 16) session = 'reg';
        else session = 'closed'; // 20:00-04:00 ET → market fully closed
    } else {
        session = 'closed';
    }

    const prevClose = t?.prevDay?.c || 0;
    const todayClose = t?.day?.c || prevClose;
    const latestPrice = t?.lastTrade?.p || t?.min?.c || t?.day?.c || t?.prevDay?.c || 0;

    const isExtended = session !== 'reg';
    const regChangePercent = t?.todaysChangePerc || (prevClose !== 0 ? ((todayClose - prevClose) / prevClose) * 100 : 0);

    const rsi = rsiRes?.results?.values?.[0]?.value ?? null;
    const dailyResults = (dailyAggs?.results || []).map((r: any) => ({ close: r.c, volume: r.v || 0 }));
    let return3d = 0;
    if (dailyResults.length >= 4) {
        const recentCandles = dailyResults.slice(-4);
        const price3dAgo = recentCandles[0].close;
        const currentClose = recentCandles[recentCandles.length - 1].close;
        return3d = ((currentClose - price3dAgo) / price3dAgo) * 100;
    }

    const sparkline = dailyResults.slice(-20).map((d: any) => d.close);

    // --- True Pre-Market Resolver ---
    let prePriceToStore: number | null = null;
    if (session === 'pre') {
        prePriceToStore = latestPrice;
    } else if (truePmRes !== null) {
        prePriceToStore = truePmRes;
    } else {
        const prePriceStr = String(t?.preMarket?.p || t?.prevDay?.c || 0);
        prePriceToStore = parseFloat(prePriceStr);
    }

    return {
        symbol,
        price: latestPrice,
        todayClose: todayClose > 0 ? todayClose : null, // [FIX] regular session close (day.c) — separate from latestPrice which may be POST trade
        changePercent: isExtended ? (prevClose !== 0 ? ((latestPrice - prevClose) / prevClose) * 100 : 0) : regChangePercent,
        volume: t?.day?.v,
        prevClose,
        prevDayVolume: t?.prevDay?.v || 0,
        session,
        extended: {
            prePrice: prePriceToStore && prePriceToStore > 0 ? prePriceToStore : null,
            postPrice: (session === 'post' || session === 'closed') ? latestPrice : null,
        },
        rsi,
        return3d,
        vwap: t?.day?.vw,
        sparkline,
        dailyResults,
    };
}

// [PERF] Redis SWR-cached wrapper — SSR hits cache first (~50ms), avoids 4 Polygon calls (~800ms)
const STOCK_LIGHT_CACHE_PREFIX = 'cache:stockLight:';
const STOCK_LIGHT_TTL_REG = 30;    // 30s during market hours (fresh data)
const STOCK_LIGHT_TTL_EXT = 120;   // 2min during extended/closed (lower API pressure)

export async function getStockDataLight(symbol: string) {
    const cacheKey = `${STOCK_LIGHT_CACHE_PREFIX}${symbol}`;

    // 1. Try cache first (0ms vs 800ms)
    try {
        const cached = await getFromCache<any>(cacheKey);
        if (cached && cached.price > 0) {
            // SWR: Return cached data instantly, trigger background refresh
            const age = Date.now() - (cached._cachedAt || 0);
            const ttlMs = (cached.session === 'reg' ? STOCK_LIGHT_TTL_REG : STOCK_LIGHT_TTL_EXT) * 1000;
            if (age > ttlMs) {
                // Stale → background refresh (fire and forget)
                _fetchStockDataLight(symbol).then(fresh => {
                    if (fresh) setInCache(cacheKey, { ...fresh, _cachedAt: Date.now() }, STOCK_LIGHT_TTL_EXT * 2).catch(() => { });
                }).catch(() => { });
            }
            return cached;
        }
    } catch { }

    // 2. Cache miss: fetch fresh (first load only)
    const fresh = await _fetchStockDataLight(symbol);
    if (fresh) {
        const ttl = fresh.session === 'reg' ? STOCK_LIGHT_TTL_REG : STOCK_LIGHT_TTL_EXT;
        await setInCache(cacheKey, { ...fresh, _cachedAt: Date.now() }, ttl * 2).catch(() => { });
    }
    return fresh;
}
