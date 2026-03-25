// API Route: /api/flow/realtime-metrics
// Fetches Dark Pool %, Short Volume %, Bid-Ask Spread, Block Trades
// Uses Polygon.io APIs

import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const POLYGON_BASE = "https://api.polygon.io";

// Dark Pool Exchange Codes (FINRA TRF/ADF = Dark Pool)
const DARK_POOL_EXCHANGES: Set<number> = new Set([4, 15, 16, 19]);

interface TradeData {
    darkPoolPercent: number;
    darkPoolVolume: number;
    totalVolume: number;
    blockTrades: number;
    blockVolume: number;
    largestTrade: { size: number; price: number };
    avgTradeSize: number;
    // Buy/Sell classification (Quote Rule)
    buyPct: number;
    sellPct: number;
    buyVolume: number;
    sellVolume: number;
    buyVwap: number;
    sellVwap: number;
    netBuyValue: number;
}

interface QuoteData {
    bidAskSpread: number;
    bid: number;
    ask: number;
    spreadLabel: string;
}

interface ShortVolumeData {
    shortVolPercent: number;
    shortVolume: number;
    totalVolume: number;
}

// Fetch Trades for Dark Pool & Block Trade analysis + Buy/Sell classification (Quote Rule)
async function fetchTradeData(ticker: string): Promise<TradeData | null> {
    try {
        // Fetch trades AND quotes in parallel for Quote Rule classification
        // limit=50000 for broad coverage + next_url follow for full-day accuracy
        const [tradesRes, quotesRes] = await Promise.all([
            fetch(`${POLYGON_BASE}/v3/trades/${ticker}?limit=50000&apiKey=${POLYGON_API_KEY}`),
            fetch(`${POLYGON_BASE}/v3/quotes/${ticker}?limit=5000&order=desc&apiKey=${POLYGON_API_KEY}`),
        ]);

        if (!tradesRes.ok) {
            console.error(`[realtime-metrics] Trades API error: ${tradesRes.status}`);
            return null;
        }

        const tradesData = await tradesRes.json();
        let trades = tradesData.results || [];

        // Follow next_url once for broader coverage (~100K trades total)
        if (tradesData.next_url) {
            try {
                const nextRes = await fetch(`${tradesData.next_url}&apiKey=${POLYGON_API_KEY}`);
                if (nextRes.ok) {
                    const nextData = await nextRes.json();
                    trades = trades.concat(nextData.results || []);
                }
            } catch (e) {
                console.warn(`[realtime-metrics] next_url follow failed:`, e);
            }
        }

        // Parse quotes for Quote Rule — sort ascending by timestamp for binary search
        const quotesRaw = quotesRes.ok
            ? ((await quotesRes.json()).results || [])
            : [];
        // Pre-sort quotes by sip_timestamp (ascending) for O(log N) binary search
        const quotes = quotesRaw.sort((a: any, b: any) => {
            const ta = BigInt(a.sip_timestamp);
            const tb = BigInt(b.sip_timestamp);
            return ta < tb ? -1 : ta > tb ? 1 : 0;
        });

        if (trades.length === 0) return null;

        // Binary search: find quote with nearest timestamp to target
        function findNearestQuote(targetTs: bigint): any {
            if (quotes.length === 0) return null;
            let lo = 0, hi = quotes.length - 1;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                const midTs = BigInt(quotes[mid].sip_timestamp);
                if (midTs < targetTs) lo = mid + 1;
                else hi = mid;
            }
            // Compare lo and lo-1 to find the absolute nearest
            let best = lo;
            if (lo > 0) {
                const diffLo = targetTs - BigInt(quotes[lo - 1].sip_timestamp);
                const diffHi = BigInt(quotes[lo].sip_timestamp) - targetTs;
                if ((diffLo < BigInt(0) ? -diffLo : diffLo) < (diffHi < BigInt(0) ? -diffHi : diffHi)) {
                    best = lo - 1;
                }
            }
            return quotes[best];
        }

        let totalVolume = 0;
        let darkPoolVolume = 0;
        let blockTrades = 0;
        let blockVolume = 0;
        let largestTrade = { size: 0, price: 0 };

        // Buy/Sell classification accumulators
        let dpBuyVol = 0, dpSellVol = 0, dpNeutralVol = 0;
        let dpBuyVal = 0, dpSellVal = 0;

        for (const trade of trades) {
            const size = trade.size || 0;
            const price = trade.price || 0;
            const exchangeId = trade.exchange;

            totalVolume += size;

            // Dark Pool detection
            if (DARK_POOL_EXCHANGES.has(exchangeId)) {
                darkPoolVolume += size;

                // Quote Rule classification: binary search for nearest quote O(log N)
                if (quotes.length > 0) {
                    const bestQ = findNearestQuote(BigInt(trade.sip_timestamp));

                    if (bestQ && bestQ.bid_price > 0 && bestQ.ask_price > 0) {
                        const mid = (bestQ.bid_price + bestQ.ask_price) / 2;
                        if (price >= bestQ.ask_price) { dpBuyVol += size; dpBuyVal += size * price; }
                        else if (price <= bestQ.bid_price) { dpSellVol += size; dpSellVal += size * price; }
                        else if (price > mid) { dpBuyVol += size; dpBuyVal += size * price; }
                        else if (price < mid) { dpSellVol += size; dpSellVal += size * price; }
                        else { dpNeutralVol += size; }
                    } else {
                        dpNeutralVol += size;
                    }
                }
            }

            // Block Trade (≥10,000 shares)
            if (size >= 10000) {
                blockTrades++;
                blockVolume += size;
            }

            // Track largest
            if (size > largestTrade.size) {
                largestTrade = { size, price };
            }
        }

        const darkPoolPercent = totalVolume > 0 ? (darkPoolVolume / totalVolume) * 100 : 0;
        const avgTradeSize = trades.length > 0 ? totalVolume / trades.length : 0;

        // Buy/Sell percentages
        const dpTotal = dpBuyVol + dpSellVol + dpNeutralVol;
        const buyPct = dpTotal > 0 ? Math.round((dpBuyVol / dpTotal) * 1000) / 10 : 0;
        const sellPct = dpTotal > 0 ? Math.round((dpSellVol / dpTotal) * 1000) / 10 : 0;

        return {
            darkPoolPercent: Math.round(darkPoolPercent * 10) / 10,
            darkPoolVolume,
            totalVolume,
            blockTrades,
            blockVolume,
            largestTrade,
            avgTradeSize: Math.round(avgTradeSize),
            // Buy/Sell classification
            buyPct,
            sellPct,
            buyVolume: dpBuyVol,
            sellVolume: dpSellVol,
            buyVwap: dpBuyVol > 0 ? Math.round((dpBuyVal / dpBuyVol) * 100) / 100 : 0,
            sellVwap: dpSellVol > 0 ? Math.round((dpSellVal / dpSellVol) * 100) / 100 : 0,
            netBuyValue: Math.round(dpBuyVal - dpSellVal),
        };
    } catch (error) {
        console.error('[realtime-metrics] fetchTradeData error:', error);
        return null;
    }
}

// Fetch Quotes for Bid-Ask Spread
async function fetchQuoteData(ticker: string): Promise<QuoteData | null> {
    try {
        const url = `${POLYGON_BASE}/v3/quotes/${ticker}?limit=1&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url);

        if (!res.ok) {
            console.error(`[realtime-metrics] Quotes API error: ${res.status}`);
            return null;
        }

        const data = await res.json();
        const quote = data.results?.[0];

        if (!quote) return null;

        const bid = quote.bid_price || 0;
        const ask = quote.ask_price || 0;
        const spread = ask - bid;

        // Spread interpretation
        let spreadLabel = "보통";
        if (spread <= 0.01) spreadLabel = "매우 타이트";
        else if (spread <= 0.05) spreadLabel = "타이트";
        else if (spread <= 0.20) spreadLabel = "보통";
        else spreadLabel = "넓음";

        return {
            bidAskSpread: Math.round(spread * 100) / 100,
            bid,
            ask,
            spreadLabel,
        };
    } catch (error) {
        console.error('[realtime-metrics] fetchQuoteData error:', error);
        return null;
    }
}

// Fetch Short Volume (daily)
async function fetchShortVolumeData(ticker: string): Promise<ShortVolumeData | null> {
    try {
        const url = `${POLYGON_BASE}/stocks/v1/short-volume?ticker=${ticker}&limit=1&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url);

        if (!res.ok) {
            console.error(`[realtime-metrics] Short Volume API error: ${res.status}`);
            return null;
        }

        const data = await res.json();
        const result = data.results?.[0];

        if (!result) return null;

        const shortVolume = result.short_volume || 0;
        const totalVolume = result.total_volume || 1;
        const shortVolPercent = (shortVolume / totalVolume) * 100;

        return {
            shortVolPercent: Math.round(shortVolPercent * 10) / 10,
            shortVolume,
            totalVolume,
        };
    } catch (error) {
        console.error('[realtime-metrics] fetchShortVolumeData error:', error);
        return null;
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker')?.toUpperCase() || 'TSLA';
    const cacheKey = `rt-metrics:${ticker}`;
    const REDIS_TTL = 60; // 1 minute

    try {
        // Fetch all data in parallel
        const [tradeData, quoteData, shortVolumeData] = await Promise.all([
            fetchTradeData(ticker),
            fetchQuoteData(ticker),
            fetchShortVolumeData(ticker),
        ]);

        // If all fetches failed, serve from Redis cache
        if (!tradeData && !quoteData && !shortVolumeData) {
            const cached = await getFromCache<any>(cacheKey);
            if (cached) {
                return NextResponse.json({ ...cached, _cached: true });
            }
        }

        const response = {
            ticker,
            timestamp: new Date().toISOString(),
            darkPool: tradeData ? {
                percent: tradeData.darkPoolPercent,
                volume: tradeData.darkPoolVolume,
                totalVolume: tradeData.totalVolume,
                // Buy/Sell classification
                buyPct: tradeData.buyPct,
                sellPct: tradeData.sellPct,
                buyVolume: tradeData.buyVolume,
                sellVolume: tradeData.sellVolume,
                buyVwap: tradeData.buyVwap,
                sellVwap: tradeData.sellVwap,
                netBuyValue: tradeData.netBuyValue,
            } : null,
            blockTrade: tradeData ? {
                count: tradeData.blockTrades,
                volume: tradeData.blockVolume,
                largestTrade: tradeData.largestTrade,
            } : null,
            bidAsk: quoteData ? {
                spread: quoteData.bidAskSpread,
                bid: quoteData.bid,
                ask: quoteData.ask,
                label: quoteData.spreadLabel,
            } : null,
            shortVolume: shortVolumeData ? {
                percent: shortVolumeData.shortVolPercent,
                volume: shortVolumeData.shortVolume,
                totalVolume: shortVolumeData.totalVolume,
            } : null,
        };

        // Save to Redis for fallback
        if (tradeData || quoteData || shortVolumeData) {
            setInCache(cacheKey, response, REDIS_TTL).catch(() => { }); // fire-and-forget
        }

        return NextResponse.json(response);
    } catch (error) {
        console.error('[realtime-metrics] Error:', error);
        // On error → serve Redis cached data
        const cached = await getFromCache<any>(cacheKey);
        if (cached) {
            return NextResponse.json({ ...cached, _cached: true });
        }
        return NextResponse.json(
            { error: 'Failed to fetch metrics' },
            { status: 500 }
        );
    }
}
