import { NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { YAHOO_CACHE_KEYS, type YahooQuote } from '@/services/yahooFinanceHub';
import { publicBase } from '@/lib/net/publicBase';

export const dynamic = 'force-dynamic';

// 2026 calibrated default indicators for index level alignment
const DEFAULT_INDICES = {
    nasdaq: { price: 28500, changePct: 0, updatedAt: new Date().toISOString() },
    dow: { price: 50000, changePct: 0, updatedAt: new Date().toISOString() },
    spx: { price: 7300, changePct: 0, updatedAt: new Date().toISOString() }
};

async function triggerCronIfNeeded(quotes: (YahooQuote | null)[], requestUrl: string) {
    let needsUpdate = false;
    const now = Date.now();

    for (const q of quotes) {
        if (!q || !q.updatedAt) {
            needsUpdate = true;
            break;
        }
        const updatedTime = new Date(q.updatedAt).getTime();
        if (now - updatedTime > 300_000) { // 5 minutes stale
            needsUpdate = true;
            break;
        }
    }

    if (needsUpdate) {
        console.log('[index-close] Redis cache is empty or stale. Triggering background market-feed cron...');
        try {
            const urlObj = new URL(requestUrl);
            const baseUrl = publicBase(`${urlObj.protocol}//${urlObj.host}`);
            fetch(`${baseUrl}/api/cron/market-feed`, {
                headers: {
                    'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '',
                }
            }).catch(err => {
                console.warn('[index-close] Stale trigger failed:', err.message);
            });
        } catch (e) {
            // ignore
        }
    }
}

export async function GET(request: Request) {
    try {
        // [PURE REDIS FLOW] Reverted Polygon proxy calibration as per user simplicity policy.
        // Fetch index close values directly from Redis (populated by 1-min cron)
        const [nasdaq, dow, spx] = await Promise.all([
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.IDX_NASDAQ),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.IDX_DOW),
            getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.IDX_SPX),
        ]);

        // Non-blocking trigger check for cron update if stale
        triggerCronIfNeeded([nasdaq, dow, spx], request.url);

        return NextResponse.json({
            nasdaq: nasdaq 
                ? { price: nasdaq.price, changePct: Math.round(nasdaq.changePct * 100) / 100, updatedAt: nasdaq.updatedAt } 
                : DEFAULT_INDICES.nasdaq,
            dow: dow 
                ? { price: dow.price, changePct: Math.round(dow.changePct * 100) / 100, updatedAt: dow.updatedAt } 
                : DEFAULT_INDICES.dow,
            spx: spx 
                ? { price: spx.price, changePct: Math.round(spx.changePct * 100) / 100, updatedAt: spx.updatedAt } 
                : DEFAULT_INDICES.spx,
        }, {
            headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' }
        });
    } catch {
        return NextResponse.json({
            nasdaq: DEFAULT_INDICES.nasdaq,
            dow: DEFAULT_INDICES.dow,
            spx: DEFAULT_INDICES.spx
        });
    }
}
