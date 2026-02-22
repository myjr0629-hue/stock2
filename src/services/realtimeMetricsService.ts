// [PERF] Shared Realtime Metrics Service
// Extracted from /api/flow/realtime-metrics/route.ts to enable direct import
// Eliminates HTTP self-fetch (loopback) overhead for dashboard warming

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const POLYGON_BASE = "https://api.polygon.io";

// Dark Pool Exchange Codes (FINRA TRF/ADF = Dark Pool)
const DARK_POOL_EXCHANGES: Set<number> = new Set([4, 15, 16, 19]);

export interface TradeData {
    darkPoolPercent: number;
    darkPoolVolume: number;
    totalVolume: number;
    blockTrades: number;
    blockVolume: number;
    largestTrade: { size: number; price: number };
    avgTradeSize: number;
    buyPct: number;
    sellPct: number;
    buyVolume: number;
    sellVolume: number;
    buyVwap: number;
    sellVwap: number;
    netBuyValue: number;
}

export interface ShortVolumeData {
    shortVolPercent: number;
    shortVolume: number;
    totalVolume: number;
}

// Fetch Trades for Dark Pool & Block Trade analysis + Buy/Sell classification (Quote Rule)
export async function fetchTradeData(ticker: string): Promise<TradeData | null> {
    try {
        const [tradesRes, quotesRes] = await Promise.all([
            fetch(`${POLYGON_BASE}/v3/trades/${ticker}?limit=5000&apiKey=${POLYGON_API_KEY}`, { next: { revalidate: 30 } } as any),
            fetch(`${POLYGON_BASE}/v3/quotes/${ticker}?limit=5000&order=desc&apiKey=${POLYGON_API_KEY}`, { next: { revalidate: 30 } } as any),
        ]);

        if (!tradesRes.ok) {
            console.error(`[realtime-metrics] Trades API error: ${tradesRes.status}`);
            return null;
        }

        const tradesData = await tradesRes.json();
        const trades = tradesData.results || [];

        const quotes = quotesRes.ok
            ? ((await quotesRes.json()).results || []).reverse()
            : [];

        if (trades.length === 0) return null;

        let totalVolume = 0;
        let darkPoolVolume = 0;
        let blockTrades = 0;
        let blockVolume = 0;
        let largestTrade = { size: 0, price: 0 };

        let dpBuyVol = 0, dpSellVol = 0, dpNeutralVol = 0;
        let dpBuyVal = 0, dpSellVal = 0;

        for (const trade of trades) {
            const size = trade.size || 0;
            const price = trade.price || 0;
            const exchangeId = trade.exchange;

            totalVolume += size;

            if (DARK_POOL_EXCHANGES.has(exchangeId)) {
                darkPoolVolume += size;

                if (quotes.length > 0) {
                    let bestQ: any = null, bestDiff = Infinity;
                    for (const q of quotes) {
                        const diff = Math.abs(Number(BigInt(q.sip_timestamp) - BigInt(trade.sip_timestamp)));
                        if (diff < bestDiff) { bestDiff = diff; bestQ = q; }
                    }

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

            if (size >= 10000) {
                blockTrades++;
                blockVolume += size;
            }

            if (size > largestTrade.size) {
                largestTrade = { size, price };
            }
        }

        const darkPoolPercent = totalVolume > 0 ? (darkPoolVolume / totalVolume) * 100 : 0;
        const avgTradeSize = trades.length > 0 ? totalVolume / trades.length : 0;

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

// Fetch Short Volume (daily)
export async function fetchShortVolumeData(ticker: string): Promise<ShortVolumeData | null> {
    try {
        const url = `${POLYGON_BASE}/stocks/v1/short-volume?ticker=${ticker}&limit=1&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url, { next: { revalidate: 60 } } as any);

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

// Convenience: fetch all metrics at once (matches API route response shape)
export async function fetchRealtimeMetrics(ticker: string) {
    const [tradeData, shortVolumeData] = await Promise.all([
        fetchTradeData(ticker),
        fetchShortVolumeData(ticker),
    ]);

    return {
        darkPool: tradeData ? {
            percent: tradeData.darkPoolPercent,
            volume: tradeData.darkPoolVolume,
            totalVolume: tradeData.totalVolume,
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
        shortVolume: shortVolumeData ? {
            percent: shortVolumeData.shortVolPercent,
            volume: shortVolumeData.shortVolume,
            totalVolume: shortVolumeData.totalVolume,
        } : null,
    };
}
