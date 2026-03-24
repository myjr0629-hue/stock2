import { NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { YAHOO_CACHE_KEYS, type YahooQuote } from '@/services/yahooFinanceHub';

/**
 * GET /api/market/index-close
 * Returns actual index closing prices (NASDAQ, DOW, S&P 500) from Redis.
 * These are regular session values (not futures).
 */
export async function GET() {
    try {
        const [nasdaq, dow, spx] = await Promise.all([
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.IDX_NASDAQ),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.IDX_DOW),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.IDX_SPX),
        ]);

        return NextResponse.json({
            nasdaq: nasdaq ? { price: nasdaq.price, changePct: Math.round(nasdaq.changePct * 100) / 100, updatedAt: nasdaq.updatedAt } : null,
            dow: dow ? { price: dow.price, changePct: Math.round(dow.changePct * 100) / 100, updatedAt: dow.updatedAt } : null,
            spx: spx ? { price: spx.price, changePct: Math.round(spx.changePct * 100) / 100, updatedAt: spx.updatedAt } : null,
        }, {
            headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }
        });
    } catch {
        return NextResponse.json({ nasdaq: null, dow: null, spx: null });
    }
}
