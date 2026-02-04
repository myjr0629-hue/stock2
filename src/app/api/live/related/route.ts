// [S-124.6] Related Tickers API Endpoint for Command Quick Intel Gauges
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
        // Fetch Related Companies from Polygon/Massive API
        const url = `${MASSIVE_BASE_URL}/v1/related-companies/${ticker}?apiKey=${MASSIVE_API_KEY}`;
        const data = await fetchMassive(url, {}, false, undefined, CACHE_POLICY.LIVE);

        const results = data?.results || [];
        const count = results.length;

        // Get top 2 related tickers and fetch their prices
        const top2Tickers = results.slice(0, 2).map((item: any) => item.ticker);

        // Fetch prices and logos for top 2 related tickers in parallel
        const pricePromises = top2Tickers.map(async (relTicker: string) => {
            try {
                // Fetch snapshot for price
                const snapshotUrl = `${MASSIVE_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${relTicker}?apiKey=${MASSIVE_API_KEY}`;
                const snapshot = await fetchMassive(snapshotUrl, {}, false, undefined, CACHE_POLICY.LIVE);
                const tickerData = snapshot?.ticker || {};
                const price = tickerData.lastTrade?.p || tickerData.day?.c || tickerData.prevDay?.c || 0;
                const change = tickerData.todaysChangePerc || 0;

                // Fetch ticker details for logo
                const detailsUrl = `${MASSIVE_BASE_URL}/v3/reference/tickers/${relTicker}?apiKey=${MASSIVE_API_KEY}`;
                const details = await fetchMassive(detailsUrl, {}, false, undefined, CACHE_POLICY.LIVE);
                const iconUrl = details?.results?.branding?.icon_url;
                const logo = iconUrl && MASSIVE_API_KEY
                    ? `${iconUrl}?apiKey=${MASSIVE_API_KEY}`
                    : null;

                return {
                    ticker: relTicker,
                    price: Math.round(price * 100) / 100,
                    change: Math.round(change * 100) / 100,
                    logo
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
