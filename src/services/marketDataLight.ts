import { fetchMassive } from '@/services/massiveClient';
import { getETNow, getETDateNDaysAgo } from '@/services/timezoneUtils';
import { getFromCache, setInCache } from '@/services/redisClient';

// [V5.5 FIX] Robust Pre-Market fetcher to bypass Polygon's Snapshot bug
export async function fetchTruePreMarket(symbol: string): Promise<number | null> {
    const et = getETNow();
    const cacheKey = `pm_true_close:${symbol}:${et.dateString}`;

    try {
        const cached = await getFromCache<number>(cacheKey);
        if (cached) return cached;
    } catch { }

    // Scan backwards up to 3 days to find the last valid trading day's PM close
    for (let i = 0; i < 4; i++) {
        const checkDateStr = getETDateNDaysAgo(i);
        // Using strict ET offset (-05:00) for exact 09:29:59 boundary
        const startTs = new Date(`${checkDateStr}T04:00:00-05:00`).getTime();
        const endTs = new Date(`${checkDateStr}T09:29:59-05:00`).getTime();

        try {
            const url = `/v2/aggs/ticker/${symbol}/range/1/minute/${startTs}/${endTs}?adjusted=true&sort=desc&limit=1`;
            const res = await fetchMassive(url).catch(() => null);
            if (res && res.results && res.results.length > 0) {
                const pmClose = res.results[0].c;
                await setInCache(cacheKey, pmClose, 24 * 60 * 60); // cache for 24 hours
                return pmClose;
            }
        } catch (e) {
            console.error(`Error fetching true PM close for ${symbol}`, e);
        }
    }
    return null;
}

export async function getStockDataLight(symbol: string) {
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
        else session = (etTime >= 20 || etTime < 4) ? 'post' : 'reg';
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

    // --- NEW: True Pre-Market Resolver ---
    // If we are currently in PRE session, true PM is just the live price
    // If PRE has closed (REG/POST), we strictly rely on the true 09:29 aggregated close
    let prePriceToStore: number | null = null;
    if (session === 'pre') {
        prePriceToStore = latestPrice;
    } else if (truePmRes !== null) {
        prePriceToStore = truePmRes;
    } else {
        // Absolute fallback if everything fails
        const prePriceStr = String(t?.preMarket?.p || t?.prevDay?.c || 0);
        prePriceToStore = parseFloat(prePriceStr);
    }

    return {
        symbol,
        price: latestPrice,
        changePercent: isExtended ? 0 : regChangePercent,
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
