import { NextRequest, NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';

/**
 * GET /api/dashboard/signals
 * Fetch recent signals (daily session) from ElastiCache
 * No longer uses DynamoDB signum-pattern-db as signals are ephemeral (current day only)
 */
export async function GET(request: NextRequest) {
    const cacheKey = 'dashboard:signals:daily';

    try {
        const cached = await getFromCache<any[]>(cacheKey);
        
        if (cached && Array.isArray(cached) && cached.length > 0) {
            // Keep only signals from the last 12 hours (same-day principle)
            const now = Date.now();
            const valid = cached.filter(s => {
                if (!s.time && !s.timestamp && !s.ts) return false;
                const ts = new Date(s.time || s.timestamp || s.ts).getTime();
                return (now - ts) < 12 * 60 * 60 * 1000;
            });
            
            return NextResponse.json({ signals: valid, _cached: true });
        }
        
        return NextResponse.json({ signals: [], _cached: false });
    } catch (error: any) {
        console.error('[Signals API] Redis fetch error:', error);
        return NextResponse.json({ signals: [], error: error.message }, { status: 500 });
    }
}
