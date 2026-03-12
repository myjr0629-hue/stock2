// API Route: /api/flow/dark-pool-trades
// Returns individual dark pool (off-exchange) block trades for a ticker
// Data Source: Polygon.io /v3/trades/{ticker}
// Block Trade: 10,000+ shares (FINRA standard)
// Coverage: up to 50,000 trades + 1 pagination follow for full-day coverage
// Buy/Sell Classification: Quote Rule (trade price vs bid/ask midpoint)

import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const POLYGON_BASE = "https://api.polygon.io";

// FINRA TRF/ADF Exchange IDs = Dark Pool (off-exchange)
const DARK_POOL_EXCHANGES: Set<number> = new Set([4, 15, 16, 19]);

// Dark Pool Condition Codes
const DARK_POOL_CONDITIONS: Set<number> = new Set([12, 41, 52]);

// ── Redis cache key pattern: darkpool:{TICKER} ──
const REDIS_TTL = 300; // 5 minutes

// Block trade threshold (FINRA standard)
const BLOCK_TRADE_MIN = 10000;

interface DarkPoolTrade {
    id: string;
    price: number;
    size: number;
    timestamp: number;
    timeET: string;
    exchange: number;
    exchangeName: string;
    premium: number;
    conditions: number[];
    isBlock: boolean;
    side: 'BUY' | 'SELL' | 'NEUTRAL';
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
    const date = new Date(timestamp / 1000000);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'America/New_York'
    });
}

/** Binary search: find quote with nearest timestamp */
function findNearestQuote(quotes: any[], targetTs: bigint): any {
    if (quotes.length === 0) return null;
    let lo = 0, hi = quotes.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const midTs = BigInt(quotes[mid].sip_timestamp);
        if (midTs < targetTs) lo = mid + 1;
        else hi = mid;
    }
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

/** Classify trade as BUY/SELL using Quote Rule */
function classifyTrade(tradePrice: number, quotes: any[], tradeTimestamp: number): 'BUY' | 'SELL' | 'NEUTRAL' {
    if (quotes.length === 0) return 'NEUTRAL';
    const bestQ = findNearestQuote(quotes, BigInt(tradeTimestamp));
    if (!bestQ || bestQ.bid_price <= 0 || bestQ.ask_price <= 0) return 'NEUTRAL';
    const mid = (bestQ.bid_price + bestQ.ask_price) / 2;
    if (tradePrice >= bestQ.ask_price) return 'BUY';
    if (tradePrice <= bestQ.bid_price) return 'SELL';
    if (tradePrice > mid) return 'BUY';
    if (tradePrice < mid) return 'SELL';
    return 'NEUTRAL';
}

/** Temporary storage for block trade raw data before classification */
interface RawBlockTrade {
    trade: any;
    exchangeId: number;
    conditions: number[];
    size: number;
    price: number;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker')?.toUpperCase() || 'NVDA';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const cacheKey = `darkpool:${ticker}`;

    try {
        // ── Fetch trades AND quotes in parallel ──
        const [tradesRes, quotesRes] = await Promise.all([
            fetch(`${POLYGON_BASE}/v3/trades/${ticker}?limit=50000&order=desc&apiKey=${POLYGON_API_KEY}`, { next: { revalidate: 15 } }),
            fetch(`${POLYGON_BASE}/v3/quotes/${ticker}?limit=5000&order=desc&apiKey=${POLYGON_API_KEY}`, { next: { revalidate: 15 } }),
        ]);

        if (!tradesRes.ok) {
            console.error(`[dark-pool-trades] API error: ${tradesRes.status}`);
            const cached = await getFromCache<any>(cacheKey);
            if (cached) {
                return NextResponse.json({ ...cached, _cached: true });
            }
            return NextResponse.json({ error: `API error: ${tradesRes.status}`, items: [] }, { status: tradesRes.status });
        }

        const data = await tradesRes.json();

        // Parse quotes for Quote Rule classification — sort ascending for binary search
        const quotesRaw = quotesRes.ok ? ((await quotesRes.json()).results || []) : [];
        const quotes = quotesRaw.sort((a: any, b: any) => {
            const ta = BigInt(a.sip_timestamp);
            const tb = BigInt(b.sip_timestamp);
            return ta < tb ? -1 : ta > tb ? 1 : 0;
        });

        const rawBlockTrades: RawBlockTrade[] = [];
        const stats = { totalDarkPoolVolume: 0, totalDarkPoolValue: 0, totalVolume: 0 };

        // Process page 1
        function processTradesPage(trades: any[]) {
            for (const trade of trades) {
                const exchangeId = trade.exchange;
                const conditions = trade.conditions || [];
                const size = trade.size || 0;
                const price = trade.price || 0;

                stats.totalVolume += size;

                const isDarkExchange = DARK_POOL_EXCHANGES.has(exchangeId);
                const hasDarkCondition = conditions.some((c: number) => DARK_POOL_CONDITIONS.has(c));

                if (isDarkExchange || hasDarkCondition) {
                    stats.totalDarkPoolVolume += size;
                    stats.totalDarkPoolValue += size * price;

                    if (size >= BLOCK_TRADE_MIN) {
                        rawBlockTrades.push({ trade, exchangeId, conditions, size, price });
                    }
                }
            }
        }

        processTradesPage(data.results || []);
        let tradesScanned = (data.results || []).length;

        // ── Page 2: follow next_url ──
        if (data.next_url) {
            try {
                const nextUrl = `${data.next_url}&apiKey=${POLYGON_API_KEY}`;
                const res2 = await fetch(nextUrl, { next: { revalidate: 15 } });
                if (res2.ok) {
                    const data2 = await res2.json();
                    processTradesPage(data2.results || []);
                    tradesScanned += (data2.results || []).length;
                }
            } catch (e) {
                console.warn(`[dark-pool-trades] next_url follow failed:`, e);
            }
        }

        // ── Classify each block trade as BUY/SELL using Quote Rule ──
        const darkPoolTrades: DarkPoolTrade[] = rawBlockTrades.map(({ trade, exchangeId, conditions, size, price }) => ({
            id: `dp-${trade.sip_timestamp}-${size}`,
            price, size,
            timestamp: trade.sip_timestamp,
            timeET: formatTimeET(trade.sip_timestamp),
            exchange: exchangeId,
            exchangeName: getExchangeName(exchangeId),
            premium: size * price,
            conditions,
            isBlock: true,
            side: classifyTrade(price, quotes, trade.sip_timestamp),
            type: 'DARK_POOL' as const,
        }));

        darkPoolTrades.sort((a, b) => b.timestamp - a.timestamp);
        const topTrades = darkPoolTrades.slice(0, limit);

        const response = {
            ticker,
            timestamp: new Date().toISOString(),
            totalDarkPoolVolume: stats.totalDarkPoolVolume,
            totalDarkPoolValue: Math.round(stats.totalDarkPoolValue),
            totalVolume: stats.totalVolume,
            darkPoolPercent: stats.totalVolume > 0
                ? Math.round((stats.totalDarkPoolVolume / stats.totalVolume) * 1000) / 10
                : 0,
            tradeCount: darkPoolTrades.length,
            tradesScanned,
            items: topTrades,
        };

        console.log(`[dark-pool-trades] ${ticker}: scanned ${response.tradesScanned} trades, DP=${response.darkPoolPercent}%, blocks=${darkPoolTrades.length}`);

        // ── Save to Redis if we have data ──
        if (stats.totalVolume > 0) {
            setInCache(cacheKey, response, REDIS_TTL).catch(() => { }); // fire-and-forget
        } else {
            const cached = await getFromCache<any>(cacheKey);
            if (cached) {
                return NextResponse.json({ ...cached, _cached: true });
            }
        }

        return NextResponse.json(response);
    } catch (error) {
        console.error('[dark-pool-trades] Error:', error);
        const cached = await getFromCache<any>(cacheKey);
        if (cached) {
            return NextResponse.json({ ...cached, _cached: true });
        }
        return NextResponse.json(
            { error: 'Failed to fetch dark pool trades', items: [] },
            { status: 500 }
        );
    }
}
