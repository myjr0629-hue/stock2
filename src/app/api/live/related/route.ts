// [S-124.6] Related Tickers API Endpoint for Command Quick Intel Gauges
// V10: Polygon snapshot with manual changePct calculation — works for ALL tickers
import { NextRequest } from 'next/server';
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// [V10] Calculate changePct from Polygon snapshot — NEVER trust todaysChangePerc
// Uses prevDay.c (yesterday's close) and current price to calculate accurate change
function calcChangeFromSnapshot(tickerData: any): { price: number; change: number, prevClose: number } {
    const currentPrice = tickerData?.lastTrade?.p || tickerData?.day?.c || 0;
    
    // [V13 FIX] Pre-Market detection: only when today's trading data is completely absent.
    // todaysChangePerc===0 happens BOTH in pre-market AND after-hours/weekends, so it cannot be used.
    // True pre-market = no day.o (today's open) AND no day.v (today's volume).
    const isPreMarket = !tickerData?.day?.o && !tickerData?.day?.v;
    const prevClose = tickerData?.prevDay?.c || 0;

    if (isPreMarket) {
        return { price: Math.round(currentPrice * 100) / 100, change: 0, prevClose };
    }

    if (currentPrice > 0 && prevClose > 0) {
        const manualChange = ((currentPrice - prevClose) / prevClose) * 100;
        return {
            price: Math.round(currentPrice * 100) / 100,
            change: Math.round(manualChange * 100) / 100,
            prevClose
        };
    }

    return { price: Math.round(currentPrice * 100) / 100, change: 0, prevClose };
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
        // [V10] GOOG→GOOGL alias: Polygon snapshot for GOOG has broken prevDay.c
        // GOOG (Class C) and GOOGL (Class A) are same company with same price movement
        // [V11] Weekend/after-hours fallback: if snapshot returns price=0, use v2/aggs 2-day bar
        const SNAPSHOT_ALIAS: Record<string, string> = { 'GOOG': 'GOOGL' };
        const top4 = relatedTickers.slice(0, 4);
        const snapPromises = top4.map((relT: string) => {
            const snapTicker = SNAPSHOT_ALIAS[relT] || relT;
            return fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${snapTicker}`, {}, true)
                .then(async (snap: any) => {
                    const { price, change, prevClose } = calcChangeFromSnapshot(snap?.ticker);
                    if (price > 0) return { ticker: relT, price, change, logo: null, prevClose };
                    // [V11] Snapshot failed (weekend/after-hours) — fallback to v2/aggs 2-day bar
                    try {
                        const today = new Date();
                        const from = new Date(today.getTime() - 10 * 86400000).toISOString().split('T')[0]; // 10 days back
                        const to = today.toISOString().split('T')[0];
                        const aggs = await fetchMassive(
                            `/v2/aggs/ticker/${snapTicker}/range/1/day/${from}/${to}?adjusted=true&sort=desc&limit=2`,
                            {}, true
                        );
                        if (aggs?.results?.length >= 2) {
                            const lastBar = aggs.results[0];
                            const prevBar = aggs.results[1];
                            const aggChange = prevBar.c > 0
                                ? Math.round(((lastBar.c - prevBar.c) / prevBar.c) * 10000) / 100
                                : 0;
                            return { ticker: relT, price: Math.round(lastBar.c * 100) / 100, change: aggChange, logo: null, prevClose: prevBar.c };
                        }
                    } catch {}
                    return { ticker: relT, price: 0, change: 0, logo: null, prevClose: 0 };
                })
                .catch(() => ({ ticker: relT, price: 0, change: 0, logo: null, prevClose: 0 }));
        });

        const topRelated = await Promise.race([
            Promise.all(snapPromises),
            new Promise<{ ticker: string; price: number; change: number; logo: null; prevClose?: number }[]>(
                r => setTimeout(() => r(top4.map((relT: string) => ({ ticker: relT, price: 0, change: 0, logo: null, prevClose: 0 }))), 3000)
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
