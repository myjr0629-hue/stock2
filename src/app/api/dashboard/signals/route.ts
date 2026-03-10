import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { queryItems } from '@/lib/aws/dynamoClient';

/**
 * GET /api/dashboard/signals
 * Fetch recent signals (24h) from DynamoDB signum-pattern-db
 * Uses ElastiCache as fast layer (60s TTL)
 */
export async function GET(request: NextRequest) {
    const cacheKey = 'dashboard:signals:latest';

    // Fast path: ElastiCache
    try {
        const cached = await getFromCache<any[]>(cacheKey);
        if (cached && Array.isArray(cached) && cached.length > 0) {
            return NextResponse.json({ signals: cached, _cached: true });
        }
    } catch { /* continue to DynamoDB */ }

    // DynamoDB query: last 24 hours
    try {
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;

        const items = await queryItems<any>(
            'signum-pattern-db',
            'pk = :pk AND #ts > :since',
            { ':pk': 'SIGNAL', ':since': oneDayAgo },
            { limit: 50, scanForward: false, expressionNames: { '#ts': 'timestamp' } }
        );

        const signals = (items || []).map((item: any) => {
            const data = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
            return {
                ticker: item.ticker || data?.ticker || '—',
                type: item.signalType || data?.type || 'UNKNOWN',
                timestamp: item.timestamp || data?.ts || now,
                gex: data?.gex,
                prevGex: data?.prevGex,
            };
        });

        // Cache to ElastiCache (60s TTL)
        if (signals.length > 0) {
            try { await setInCache(cacheKey, signals, 60); } catch { /* non-critical */ }
        }

        return NextResponse.json({ signals, _cached: false });
    } catch (error: any) {
        console.error('[Signals API] Error:', error);
        return NextResponse.json({ signals: [], error: error.message }, { status: 500 });
    }
}
