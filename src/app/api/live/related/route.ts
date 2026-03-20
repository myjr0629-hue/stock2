// [S-124.6] Related Tickers API Endpoint for Command Quick Intel Gauges
// V8: DynamoDB-first — Lambda stores related tickers daily
import { NextRequest } from 'next/server';
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
const MASSIVE_BASE_URL = process.env.MASSIVE_BASE_URL || "https://api.polygon.io";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
        // ====== V8: DynamoDB-first — check if Lambda already has related tickers ======
        try {
            const { getRelatedData } = await import('@/lib/aws/dynamoDataProvider');
            const dynRelated = await getRelatedData(ticker);
            if (dynRelated?.tickers && dynRelated.tickers.length > 0) {
                const relTickers = dynRelated.tickers.slice(0, 10);
                const top4 = relTickers.slice(0, 4);

                // [FIX] 4개 종목 changePct를 한번에 가져오기 (2초 timeout)
                let topRelated = top4.map((t: string) => ({ ticker: t, price: 0, change: 0, logo: null }));
                try {
                    const snapPromises = top4.map((relT: string) =>
                        fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${relT}`, {}, true)
                            .then((snap: any) => ({
                                ticker: relT,
                                price: Math.round((snap?.ticker?.lastTrade?.p || snap?.ticker?.day?.c || 0) * 100) / 100,
                                change: Math.round((snap?.ticker?.todaysChangePerc || 0) * 100) / 100,
                                logo: null
                            }))
                            .catch(() => ({ ticker: relT, price: 0, change: 0, logo: null }))
                    );
                    topRelated = await Promise.race([
                        Promise.all(snapPromises),
                        new Promise<typeof topRelated>(r => setTimeout(() => r(topRelated), 2000))
                    ]);
                } catch {}

                return new Response(JSON.stringify({
                    ticker, count: relTickers.length,
                    label: relTickers.length >= 10 ? '다수' : relTickers.length >= 5 ? '보통' : '소수',
                    topRelated,
                    allTickers: relTickers,
                    _source: 'dynamodb',
                }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
            }
        } catch {}

        // ====== Polygon fallback ======
        // Fetch Related Companies from Polygon/Massive API
        const url = `${MASSIVE_BASE_URL}/v1/related-companies/${ticker}?apiKey=${MASSIVE_API_KEY}`;
        const data = await fetchMassive(url, {}, true, undefined, CACHE_POLICY.LIVE);

        const results = data?.results || [];
        const count = results.length;

        // Get top 4 related tickers — snapshot for prices only, NO logo fetch
        const top4Tickers = results.slice(0, 4).map((item: any) => item.ticker);

        const pricePromises = top4Tickers.map(async (relTicker: string) => {
            try {
                // Fetch snapshot for price only (로고는 프론트에서 parqet.com 사용)
                const snapshot = await fetchMassive(
                    `/v2/snapshot/locale/us/markets/stocks/tickers/${relTicker}`,
                    {}, true  // useCache=true for speed
                );
                const tickerData = snapshot?.ticker || {};
                const price = tickerData.lastTrade?.p || tickerData.day?.c || tickerData.prevDay?.c || 0;
                const change = tickerData.todaysChangePerc || 0;

                return {
                    ticker: relTicker,
                    price: Math.round(price * 100) / 100,
                    change: Math.round(change * 100) / 100,
                    logo: null  // 프론트에서 parqet.com 로고 사용
                };
            } catch (e) {
                return { ticker: relTicker, price: 0, change: 0, logo: null };
            }
        });

        const topRelatedWithPrices = await Promise.all(pricePromises);

        return new Response(JSON.stringify({
            ticker,
            count,
            label: count >= 10 ? '다수' : count >= 5 ? '보통' : '소수',
            topRelated: topRelatedWithPrices,
            allTickers: results.map((item: any) => item.ticker)
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });

    } catch (error: any) {
        console.error('[Related Tickers API] Error:', error);
        return new Response(JSON.stringify({
            ticker,
            count: 0,
            label: '오류',
            topRelated: [],
            allTickers: [],
            error: error.message
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }
}
