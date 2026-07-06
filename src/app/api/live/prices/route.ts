// [SECTOR INTEL] Lightweight batch price endpoint
// Returns just price + change for multiple tickers (max 10)
import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive } from "@/services/massiveClient";
import { getMarketSession } from "@/services/guardian/rlsiEngine";
import { getFromCache, setInCache } from "@/services/redisClient";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// [LAST SESSION CHANGE] While no session is live (weekend/holiday/overnight)
// the snapshot's prevDay IS the last session, so change-vs-prevClose collapses
// to 0.00% and Sector Intel looks like it has no data. Reconstruct each
// ticker's last completed session change from daily bars instead.
async function lastSessionChanges(tickers: string[]): Promise<Record<string, number>> {
    const cacheKey = `lastchg:prices:${[...tickers].sort().join(',')}`;
    try {
        const cached = await getFromCache<Record<string, number>>(cacheKey);
        if (cached && Object.keys(cached).length > 0) return cached;
    } catch { /* fall through */ }

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 12);
    const from = start.toISOString().split('T')[0];
    const to = end.toISOString().split('T')[0];

    const out: Record<string, number> = {};
    await Promise.all(tickers.map(async (t) => {
        try {
            const d = await fetchMassive(
                `/v2/aggs/ticker/${t}/range/1/day/${from}/${to}`,
                { adjusted: 'true', sort: 'asc', limit: '15' }
            );
            const bars = d.results || [];
            if (bars.length >= 2) {
                const c1 = bars[bars.length - 1].c;
                const c0 = bars[bars.length - 2].c;
                if (c0 > 0 && c1 > 0) out[t] = ((c1 - c0) / c0) * 100;
            }
        } catch { /* per-ticker failure: keep snapshot value */ }
    }));

    if (Object.keys(out).length > 0) {
        try { await setInCache(cacheKey, out, 3600); } catch { /* non-critical */ }
    }
    return out;
}

export async function GET(req: NextRequest) {
    const tickers = req.nextUrl.searchParams.get('t');
    if (!tickers) {
        return NextResponse.json({ error: 'Missing t param' }, { status: 400 });
    }

    const tickerList = tickers.split(',').slice(0, 10); // Max 10
    const tickerString = tickerList.join(',');

    try {
        const res = await fetchMassive(
            `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerString}`,
            {}
        );

        // Stale regime: no live session anywhere (PRE excluded — premarket
        // moves vs prev close are live data and must stay untouched).
        const session = getMarketSession();
        const dayDataCount = (res.tickers || []).filter((t: any) => t.day?.c && t.day?.v).length;
        const staleRegime = session === 'CLOSED' || (session !== 'PRE' && dayDataCount === 0);
        const lastChg = staleRegime ? await lastSessionChanges(tickerList) : {};

        const prices = (res.tickers || []).map((t: any) => {
            const currentPrice = t.day?.c || t.lastTrade?.p || t.prevDay?.c || 0;
            const prevClose = t.prevDay?.c || 0;
            const change = (staleRegime && lastChg[t.ticker] != null)
                ? lastChg[t.ticker]
                : (prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0);

            return {
                symbol: t.ticker,
                price: currentPrice,
                change: +change.toFixed(2),
                volume: t.day?.v || 0
            };
        }).filter((p: any) => p.price > 0); // degraded snapshot rows (price 0) would
                                            // overwrite good client-side values — omit them

        return NextResponse.json({ prices }, {
            headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
