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
            const currentPrice = t.day?.c || t.lastTrade?.p || t.prevDay?.c || 0;
            const prevClose = t.prevDay?.c || 0;
            const change = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

            return {
                symbol: t.ticker,
                price: currentPrice,
                change: +change.toFixed(2),
                volume: t.day?.v || 0
            };
        });

        return NextResponse.json({ prices });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
