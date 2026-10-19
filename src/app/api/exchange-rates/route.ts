import { NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { YAHOO_CACHE_KEYS, type YahooQuote } from '@/services/yahooFinanceHub';

/**
 * GET /api/exchange-rates
 * Returns current USD→KRW and USD→JPY exchange rates from Redis cache.
 * Data is populated by the market-feed cron every minute.
 */
export async function GET() {
    const [krwQuote, jpyQuote] = await Promise.all([
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.USDKRW),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.USDJPY),
    ]);

    return NextResponse.json({
        usdkrw: krwQuote?.price ?? null,
        usdjpy: jpyQuote?.price ?? null,
        usdkrwChange: krwQuote?.changePct ?? null,
        usdjpyChange: jpyQuote?.changePct ?? null,
        updatedAt: krwQuote?.updatedAt ?? jpyQuote?.updatedAt ?? null,
    });
}
