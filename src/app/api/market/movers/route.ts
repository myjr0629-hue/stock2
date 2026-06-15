import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache, setInCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic';

const getSpark = (up: boolean) => {
  return up 
    ? [5, 6, 5.5, 7, 7.5, 9, 8.5, 10, 11]
    : [11, 10, 10.5, 9, 8.5, 7.5, 8, 6.5, 5];
};

const mapTicker = (t: any) => {
  const price = t.lastTrade?.p ?? t.day?.c ?? t.prevDay?.c ?? 0;
  const changePercent = t.todaysChangePerc ?? 0;
  const volume = t.day?.v ?? t.prevDay?.v ?? 0;
  const value = volume * price;
  return {
    ticker: t.ticker,
    price,
    changePercent,
    volume,
    value,
    up: changePercent >= 0,
    spark: getSpark(changePercent >= 0)
  };
};

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    try {
        // We will try to fetch the cache of all movers.
        const cacheKey = 'market:movers:all';
        let cachedData = await getFromCache<any>(cacheKey);

        if (!cachedData) {
            // Fetch everything concurrently from Polygon/Massive Client
            // Use cache for full tickers list to avoid massive payloads too frequently, but fresh snapshots for movers
            const [gainersRes, losersRes, tickersRes] = await Promise.all([
                fetchMassive('/v2/snapshot/locale/us/markets/stocks/gainers', {}, false).catch(() => null),
                fetchMassive('/v2/snapshot/locale/us/markets/stocks/losers', {}, false).catch(() => null),
                fetchMassive('/v2/snapshot/locale/us/markets/stocks/tickers', {}, true).catch(() => null)
            ]);

            const rawGainers = gainersRes?.tickers || [];
            const rawLosers = losersRes?.tickers || [];
            const rawTickers = tickersRes?.tickers || [];

            // Process Gainers & Losers
            const gainers = rawGainers.map(mapTicker).slice(0, 30);
            const losers = rawLosers.map(mapTicker).slice(0, 30);

            // Process Trading Value Movers (from full tickers list)
            const value = rawTickers
                .filter((t: any) => {
                    const price = t.lastTrade?.p ?? t.day?.c ?? t.prevDay?.c ?? 0;
                    const volume = t.day?.v ?? t.prevDay?.v ?? 0;
                    // Filter: standard tickers, price >= 1.0, volume >= 10,000
                    return (
                        t.ticker &&
                        /^[A-Z]{1,5}$/.test(t.ticker) &&
                        price >= 1.0 &&
                        volume >= 10000
                    );
                })
                .map(mapTicker)
                .sort((a: any, b: any) => b.value - a.value)
                .slice(0, 30);

            cachedData = { gainers, losers, value, ts: Date.now() };
            
            // Cache in Redis for 60 seconds (with jitter applied inside setInCache)
            await setInCache(cacheKey, cachedData, 60);
        }

        if (type === 'value') {
            return NextResponse.json({ movers: cachedData.value.slice(0, limit) });
        } else if (type === 'gainers') {
            return NextResponse.json({ movers: cachedData.gainers.slice(0, limit) });
        } else if (type === 'losers') {
            return NextResponse.json({ movers: cachedData.losers.slice(0, limit) });
        } else {
            // Return all three arrays
            return NextResponse.json({
                value: cachedData.value.slice(0, limit),
                gainers: cachedData.gainers.slice(0, limit),
                losers: cachedData.losers.slice(0, limit),
                ts: cachedData.ts
            });
        }
    } catch (err: any) {
        console.error('[Movers API Error]:', err);
        return NextResponse.json({ error: 'Failed to fetch movers data' }, { status: 500 });
    }
}
