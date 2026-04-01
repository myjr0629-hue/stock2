// [S-124.6] Related Tickers API Endpoint for Command Quick Intel Gauges
// V10: Polygon snapshot with manual changePct calculation — works for ALL tickers
import { NextRequest } from 'next/server';
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// [V10] Calculate changePct from Polygon snapshot — NEVER trust todaysChangePerc
// Uses prevDay.c (yesterday's close) and current price to calculate accurate change
function calcChangeFromSnapshot(tickerData: any): { price: number; change: number } {
    const currentPrice = tickerData?.lastTrade?.p || tickerData?.day?.c || 0;
    const prevClose = tickerData?.prevDay?.c || 0;
    if (currentPrice > 0 && prevClose > 0) {
        const change = ((currentPrice - prevClose) / prevClose) * 100;
        return {
            price: Math.round(currentPrice * 100) / 100,
            change: Math.round(change * 100) / 100,
        };
    }
    return { price: Math.round(currentPrice * 100) / 100, change: 0 };
}

export async function GET(req: NextRequest) {
    const t = req.nextUrl.searchParams.get('t');
    if (!t) {
        return new Response(JSON.stringify({ error: "Missing ticker" }), {
            status: 400,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }

    const ticker = t.toUpperCase();

    try {
        // Step 1: Get related ticker LIST (DynamoDB first, Polygon fallback)
        let relatedTickers: string[] = [];
        let source = 'polygon';

        try {
            const { getRelatedData } = await import('@/lib/aws/dynamoDataProvider');
            const dynRelated = await getRelatedData(ticker);
            if (dynRelated?.tickers && dynRelated.tickers.length > 0) {
                relatedTickers = dynRelated.tickers.slice(0, 10);
                source = 'dynamodb';
            }
        } catch {}

        // Polygon fallback for ticker list
        if (relatedTickers.length === 0) {
            try {
                const data = await fetchMassive(
                    `/v1/related-companies/${ticker}`,
                    {}, true, undefined, CACHE_POLICY.LIVE
                );
                relatedTickers = (data?.results || []).map((item: any) => item.ticker).slice(0, 10);
            } catch {}
        }

        if (relatedTickers.length === 0) {
            return new Response(JSON.stringify({
                ticker, count: 0, label: '없음', topRelated: [], allTickers: [], _source: source,
            }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
        }

        // Step 2: Fetch LIVE prices for top 4 via Polygon snapshot
        // Calculate changePct manually from prevDay.c — NEVER use todaysChangePerc
        const top4 = relatedTickers.slice(0, 4);
        const snapPromises = top4.map((relT: string) =>
            fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${relT}`, {}, true)
                .then((snap: any) => {
                    const { price, change } = calcChangeFromSnapshot(snap?.ticker);
                    return { ticker: relT, price, change, logo: null };
                })
                .catch(() => ({ ticker: relT, price: 0, change: 0, logo: null }))
        );

        const topRelated = await Promise.race([
            Promise.all(snapPromises),
            new Promise<{ ticker: string; price: number; change: number; logo: null }[]>(
                r => setTimeout(() => r(top4.map((relT: string) => ({ ticker: relT, price: 0, change: 0, logo: null }))), 3000)
            )
        ]);

        return new Response(JSON.stringify({
            ticker,
            count: relatedTickers.length,
            label: relatedTickers.length >= 10 ? '다수' : relatedTickers.length >= 5 ? '보통' : '소수',
            topRelated,
            allTickers: relatedTickers,
            _source: source,
        }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

    } catch (error: any) {
        console.error('[Related Tickers API] Error:', error);
        return new Response(JSON.stringify({
            ticker, count: 0, label: '오류', topRelated: [], allTickers: [], error: error.message
        }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
}
