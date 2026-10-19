import { NextResponse } from 'next/server';
import { readIndexArchive } from '@/services/indexArchiveStore';
import { getFromCache } from '@/services/redisClient';
import { YAHOO_CACHE_KEYS } from '@/services/yahooFinanceHub';
import { indexLastGoodKey, resolveIndexClose, type IndexCloseQuote } from '@/lib/indexCloseSnapshot';

export const dynamic = 'force-dynamic';

// Durable copies are written by market-feed. This endpoint only reads.
const remembered: Record<string, IndexCloseQuote | null> = {};
export async function GET() {
    const entries = await Promise.all([
        ['nasdaq', YAHOO_CACHE_KEYS.IDX_NASDAQ],
        ['dow', YAHOO_CACHE_KEYS.IDX_DOW],
        ['spx', YAHOO_CACHE_KEYS.IDX_SPX],
    ].map(async ([name, key]) => {
        const reads = await Promise.allSettled([getFromCache(key), getFromCache(indexLastGoodKey(key)), readIndexArchive(key)]);
        const current = reads[0].status === 'fulfilled' ? reads[0].value : null;
        const saved = reads[1].status === 'fulfilled' ? reads[1].value : null;
        const atomic = reads[2].status === 'fulfilled' ? reads[2].value : null;
        const quote = resolveIndexClose(current, resolveIndexClose(atomic, resolveIndexClose(saved, remembered[name])));
        if (quote) remembered[name] = quote;
        return [name, quote];
    }));
    return NextResponse.json(Object.fromEntries(entries), {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
}
