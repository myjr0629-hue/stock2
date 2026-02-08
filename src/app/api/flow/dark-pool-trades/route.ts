// API Route: /api/flow/dark-pool-trades
// Returns individual dark pool (off-exchange) trades for a ticker
// Data Source: Polygon.io /v3/trades/{ticker}

import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const POLYGON_BASE = "https://api.polygon.io";

// FINRA TRF/ADF Exchange IDs = Dark Pool (off-exchange)
const DARK_POOL_EXCHANGES: Set<number> = new Set([4, 15, 16, 19]);

// Dark Pool Condition Codes
// 12 = Average Price, 41 = Price Variation, 52 = Contingent
const DARK_POOL_CONDITIONS: Set<number> = new Set([12, 41, 52]);

interface DarkPoolTrade {
    id: string;
    price: number;
    size: number;
    timestamp: number;
    timeET: string;
    exchange: number;
    exchangeName: string;
    premium: number;       // size * price (total dollar value)
    conditions: number[];
    isBlock: boolean;      // size >= 10000
    type: 'DARK_POOL';
}

function getExchangeName(exchangeId: number): string {
    switch (exchangeId) {
        case 4: return 'FINRA ADF';
        case 15: return 'FINRA TRF (NYSE)';
        case 16: return 'FINRA TRF (Nasdaq)';
        case 19: return 'FINRA ORF';
        default: return `Exchange ${exchangeId}`;
    }
}

function formatTimeET(timestamp: number): string {
    const date = new Date(timestamp / 1000000); // Polygon uses nanosecond timestamps
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'America/New_York'
    });
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker')?.toUpperCase() || 'NVDA';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    try {
        // Fetch recent trades (last 5000 to filter for dark pool)
        const url = `${POLYGON_BASE}/v3/trades/${ticker}?limit=5000&order=desc&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url, { next: { revalidate: 15 } });

        if (!res.ok) {
            console.error(`[dark-pool-trades] API error: ${res.status}`);
            return NextResponse.json({ error: `API error: ${res.status}`, items: [] }, { status: res.status });
        }

        const data = await res.json();
        const allTrades = data.results || [];

        // Filter: Dark Pool exchanges OR dark pool condition codes
        const darkPoolTrades: DarkPoolTrade[] = [];
        let totalDarkPoolVolume = 0;
        let totalDarkPoolValue = 0;

        for (const trade of allTrades) {
            const exchangeId = trade.exchange;
            const conditions = trade.conditions || [];
            const size = trade.size || 0;
            const price = trade.price || 0;

            // Is this a dark pool trade?
            const isDarkExchange = DARK_POOL_EXCHANGES.has(exchangeId);
            const hasDarkCondition = conditions.some((c: number) => DARK_POOL_CONDITIONS.has(c));

            if (isDarkExchange || hasDarkCondition) {
                totalDarkPoolVolume += size;
                totalDarkPoolValue += size * price;

                // Only keep significant trades (>= 1000 shares for display)
                if (size >= 1000) {
                    darkPoolTrades.push({
                        id: `dp-${trade.sip_timestamp}-${size}`,
                        price,
                        size,
                        timestamp: trade.sip_timestamp,
                        timeET: formatTimeET(trade.sip_timestamp),
                        exchange: exchangeId,
                        exchangeName: getExchangeName(exchangeId),
                        premium: size * price,
                        conditions,
                        isBlock: size >= 10000,
                        type: 'DARK_POOL',
                    });
                }
            }
        }

        // Sort by size descending (biggest dark pool trades first)
        darkPoolTrades.sort((a, b) => b.size - a.size);

        // Take top N
        const topTrades = darkPoolTrades.slice(0, limit);

        return NextResponse.json({
            ticker,
            timestamp: new Date().toISOString(),
            totalDarkPoolVolume,
            totalDarkPoolValue: Math.round(totalDarkPoolValue),
            tradeCount: darkPoolTrades.length,
            items: topTrades,
        });
    } catch (error) {
        console.error('[dark-pool-trades] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch dark pool trades', items: [] },
            { status: 500 }
        );
    }
}
