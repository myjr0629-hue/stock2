import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

// ── Redis cache key pattern: whale:{TICKER} ──
const REDIS_TTL = 300; // 5 minutes

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('t')?.toUpperCase();

    if (!ticker) {
        return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
    }

    const cacheKey = `whale:${ticker}`;

    try {
        const { getOptionSnapshot, fetchMarketStatus } = await import('@/services/massiveClient');

        const rawChain = await getOptionSnapshot(ticker);

        if (!rawChain || rawChain.length === 0) {
            // ── Polygon returned empty → serve Redis cached data ──
            const cached = await getFromCache<any>(cacheKey);
            if (cached) {
                return NextResponse.json({ ...cached, _cached: true });
            }
            return NextResponse.json({
                ticker, count: 0, items: [],
                debug: { note: "No snapshot data found, no cache available" }
            });
        }

        const now = new Date();

        let hoursBack = 20;
        let marketStatus = 'unknown';

        try {
            const status = await fetchMarketStatus();
            if (status) {
                const nyseStatus = (status as any).exchanges?.nyse || 'unknown';
                const nasdaqStatus = (status as any).exchanges?.nasdaq || 'unknown';
                marketStatus = nyseStatus;
                if (nyseStatus === 'closed' || nasdaqStatus === 'closed') {
                    hoursBack = 72;
                }
            }
        } catch {
            const dayOfWeek = now.getUTCDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                hoursBack = 72;
                marketStatus = 'closed (fallback)';
            }
        }

        const cutoffTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
        const fourteenDaysFromNow = new Date();
        fourteenDaysFromNow.setDate(now.getDate() + 14);

        const whaleTrades: any[] = [];

        for (const contract of rawChain) {
            const trade = contract.last_trade?.last_trade_sip || contract.last_trade;
            if (!trade || !trade.price || !trade.size) continue;

            const timestampNs = trade.sip_timestamp || trade.t || 0;
            const timestampMs = timestampNs / 1000000;
            const tradeDate = new Date(timestampMs);

            if (tradeDate < cutoffTime) continue;

            const details = contract.details;
            if (!details || !details.expiration_date) continue;

            const expiryStr = details.expiration_date;
            const expiry = new Date(expiryStr);

            if (expiry > fourteenDaysFromNow || expiry < cutoffTime) continue;

            const price = trade.price;
            const size = trade.size;
            const premium = price * size * 100;

            if (premium < 50000) continue;

            whaleTrades.push({
                id: `${details.ticker}-${timestampNs}`,
                ticker: details.ticker,
                underlying: ticker,
                strike: details.strike_price,
                expiry: expiryStr,
                type: details.contract_type?.toUpperCase() || 'UNKNOWN',
                price, size, premium,
                iv: contract.implied_volatility,
                greeks: contract.greeks,
                timestamp: timestampNs,
                tradeDate,
                timeET: tradeDate.toLocaleTimeString('en-US', {
                    timeZone: 'America/New_York',
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                }),
                isWhale: true
            });
        }

        whaleTrades.sort((a, b) => b.timestamp - a.timestamp);

        const response = {
            ticker,
            count: whaleTrades.length,
            items: whaleTrades,
            debug: {
                totalContractsScanned: rawChain.length,
                filteredCount: whaleTrades.length,
                marketStatus, hoursBack,
                criteria: `Premium >= $50k, Expiry <= 14d, Last ${hoursBack}h`
            }
        };

        // ── Always save to Redis (even 0 results to prevent perpetual cold starts) ──
        // [FIX] Before: 0 whale trades → no cache → every call = 5s cold start
        // After: 0 results cached → 2nd call returns instantly from Redis
        setInCache(cacheKey, response, REDIS_TTL).catch(() => { });

        return NextResponse.json(response);

    } catch (error: any) {
        console.error(`[API] Whale feed error for ${ticker}:`, error);

        // ── On error → serve Redis cached data ──
        const cached = await getFromCache<any>(cacheKey);
        if (cached) {
            return NextResponse.json({ ...cached, _cached: true, _error: error.message });
        }

        return NextResponse.json({
            error: error.message || 'Internal Server Error',
            items: [], details: error
        }, { status: 500 });
    }
}
