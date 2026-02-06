// API Route: /api/flow/realtime-metrics
// Fetches Dark Pool %, Short Volume %, Bid-Ask Spread, Block Trades
// Uses Polygon.io APIs

import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "";
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

// Fetch Trades for Dark Pool & Block Trade analysis
async function fetchTradeData(ticker: string): Promise<TradeData | null> {
    try {
        const url = `${POLYGON_BASE}/v3/trades/${ticker}?limit=1000&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url, { next: { revalidate: 30 } });

        if (!res.ok) {
            console.error(`[realtime-metrics] Trades API error: ${res.status}`);
            return null;
        }

        const data = await res.json();
        const trades = data.results || [];

        if (trades.length === 0) return null;

        let totalVolume = 0;
        let darkPoolVolume = 0;
        let blockTrades = 0;
        let blockVolume = 0;
        let largestTrade = { size: 0, price: 0 };

        for (const trade of trades) {
            const size = trade.size || 0;
            const price = trade.price || 0;
            const exchangeId = trade.exchange;

            totalVolume += size;

            // Dark Pool detection
            if (DARK_POOL_EXCHANGES.has(exchangeId)) {
                darkPoolVolume += size;
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

        return {
            darkPoolPercent: Math.round(darkPoolPercent * 10) / 10,
            darkPoolVolume,
            totalVolume,
            blockTrades,
            blockVolume,
            largestTrade,
            avgTradeSize: Math.round(avgTradeSize),
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
        const res = await fetch(url, { next: { revalidate: 10 } });

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
        const res = await fetch(url, { next: { revalidate: 60 } });

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

    try {
        // Fetch all data in parallel
        const [tradeData, quoteData, shortVolumeData] = await Promise.all([
            fetchTradeData(ticker),
            fetchQuoteData(ticker),
            fetchShortVolumeData(ticker),
        ]);

        return NextResponse.json({
            ticker,
            timestamp: new Date().toISOString(),
            darkPool: tradeData ? {
                percent: tradeData.darkPoolPercent,
                volume: tradeData.darkPoolVolume,
                totalVolume: tradeData.totalVolume,
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
        });
    } catch (error) {
        console.error('[realtime-metrics] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch metrics' },
            { status: 500 }
        );
    }
}
