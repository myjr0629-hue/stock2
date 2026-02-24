import { fetchMassive } from '@/services/massiveClient';
import { getETNow } from '@/services/timezoneUtils';

export async function getStockDataLight(symbol: string) {
    const to = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];

    const [snapRes, rsiRes, dailyAggs] = await Promise.all([
        fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`),
        fetchMassive(`/v1/indicators/rsi/${symbol}`, { timespan: 'day', window: '14', limit: '1' }).catch(() => null),
        fetchMassive(`/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${to}`, { limit: '5000', adjust: 'true', sort: 'asc' }).catch(() => null)
    ]);

    const t = snapRes?.ticker;
    if (!t) return null;

    const et = getETNow();
    const etTime = et.hour + et.minute / 60;

    let session: 'pre' | 'reg' | 'post' = 'reg';
    if (!et.isWeekend) {
        if (etTime >= 4 && etTime < 9.5) session = 'pre';
        else if (etTime >= 16 && etTime < 20) session = 'post';
        else if (etTime >= 9.5 && etTime < 16) session = 'reg';
        else session = (etTime >= 20 || etTime < 4) ? 'post' : 'reg';
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

    return {
        symbol,
        price: latestPrice,
        changePercent: isExtended ? 0 : regChangePercent,
        volume: t?.day?.v,
        prevClose,
        prevDayVolume: t?.prevDay?.v || 0,
        session,
        extended: {
            prePrice: session === 'pre' ? latestPrice : null,
            postPrice: (session === 'post' || session === 'closed') ? latestPrice : null,
        },
        rsi,
        return3d,
        vwap: t?.day?.vw,
        sparkline,
        dailyResults,
    };
}
