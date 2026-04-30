// [SECTOR INTEL] Lightweight batch price endpoint
// Returns just price + change for multiple tickers (max 10)
import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive } from "@/services/massiveClient";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

        const prices = (res.tickers || []).map((t: any) => {
            const prevClose = t.prevDay?.c || 0;
            const dayClose = t.day?.c || 0;
            const lastTradePrice = t.lastTrade?.p || 0;

            // [FIX] Session-aware price selection
            // During PRE/POST, day.c often equals prevDay.c (no regular session yet)
            // which would produce change ≈ 0%. Use lastTrade.p (ext-hours price) instead.
            let currentPrice: number;
            if (dayClose > 0 && Math.abs(dayClose - prevClose) > 0.001) {
                // Regular session is active or has ended → day.c has real intraday data
                currentPrice = dayClose;
            } else if (lastTradePrice > 0) {
                // PRE/POST: day.c is stale/equal to prevClose → use latest trade
                currentPrice = lastTradePrice;
            } else {
                currentPrice = dayClose || prevClose || 0;
            }

            const change = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

            return {
                symbol: t.ticker,
                price: currentPrice,
                change: +change.toFixed(2),
                volume: t.day?.v || 0
            };
        });

        return NextResponse.json({ prices }, {
            headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
