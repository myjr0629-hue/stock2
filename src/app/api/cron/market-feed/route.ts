import { NextResponse } from 'next/server';
import { setInCache } from '@/services/redisClient';
import { YAHOO_CACHE_KEYS, type YahooQuote } from '@/services/yahooFinanceHub';

/**
 * [V8.0] Yahoo → Redis Writer (Cron Only)
 * 
 * This is the ONLY place that calls Yahoo Finance directly.
 * Runs every 1 minute via Vercel Cron.
 * Fetches all 8 symbols and writes to Redis.
 * All other services read from Redis only.
 */

const SYMBOLS = [
    { yahoo: '^VIX', key: YAHOO_CACHE_KEYS.VIX },
    { yahoo: 'NQ=F', key: YAHOO_CACHE_KEYS.NQ },
    { yahoo: '^TNX', key: YAHOO_CACHE_KEYS.TNX },
    { yahoo: 'ES=F', key: YAHOO_CACHE_KEYS.SPX },
    { yahoo: 'BTC-USD', key: YAHOO_CACHE_KEYS.BTC },
    { yahoo: 'GC=F', key: YAHOO_CACHE_KEYS.GOLD },
    { yahoo: 'CL=F', key: YAHOO_CACHE_KEYS.OIL },
    { yahoo: 'RTY=F', key: YAHOO_CACHE_KEYS.RUT },
];

async function fetchOneQuote(symbol: string): Promise<YahooQuote | null> {
    try {
        const encoded = encodeURIComponent(symbol);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1m&range=1d`;

        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) return null;

        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice) return null;

        const price = meta.regularMarketPrice;
        const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
        const change = price - prevClose;
        const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

        return {
            symbol,
            price,
            prevClose,
            change,
            changePct,
            updatedAt: new Date().toISOString(),
            source: 'YAHOO',
            isStale: false,
        };
    } catch {
        return null;
    }
}

export async function GET() {
    const results: string[] = [];
    let ok = 0;
    let fail = 0;

    // Fetch sequentially to avoid rate limiting
    for (const { yahoo, key } of SYMBOLS) {
        const quote = await fetchOneQuote(yahoo);
        if (quote) {
            await setInCache(key, quote);
            results.push(`${yahoo}=${quote.price}`);
            ok++;
        } else {
            results.push(`${yahoo}=FAIL`);
            fail++;
        }
    }

    console.log(`[market-feed] ${ok}/${SYMBOLS.length} updated: ${results.join(', ')}`);

    return NextResponse.json({
        ok,
        fail,
        results,
        ts: new Date().toISOString(),
    });
}
