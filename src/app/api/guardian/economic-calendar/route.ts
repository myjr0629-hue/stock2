import { NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';

/**
 * [V8.3] Guardian Economic Calendar — Redis Reader
 * 
 * Reads FMP economic calendar data from Redis.
 * POLICY: No external API calls. Redis only.
 */

const REDIS_KEY = 'fmp:econ-calendar';

export async function GET() {
    try {
        const cached = await getFromCache(REDIS_KEY);

        if (!cached) {
            return NextResponse.json({
                events: [],
                source: 'EMPTY',
                message: 'No data in Redis. Run /api/cron/economic-calendar first.',
                ts: new Date().toISOString(),
            });
        }

        return NextResponse.json({
            ...cached,
            source: 'REDIS',
        });
    } catch (err: any) {
        console.error('[guardian/econ-cal] Redis error:', err.message);
        return NextResponse.json({
            events: [],
            source: 'ERROR',
            error: err.message,
            ts: new Date().toISOString(),
        }, { status: 500 });
    }
}
