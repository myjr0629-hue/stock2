// API Route: /api/intel/m7-calendar
// Returns M7 earnings calendar and analyst recommendations

import { NextResponse } from 'next/server';
import { getM7EarningsCalendar, getM7Recommendations, EarningsEvent, RecommendationTrend } from '@/services/finnhubClient';
import { swrFetch } from '@/lib/cache/redisSWR';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export interface M7CalendarResponse {
    earnings: EarningsEvent[];
    recommendations: Record<string, RecommendationTrend>;
    fetchedAt: string;
}

export async function GET() {
    try {
        const result = await swrFetch(
            'intel:m7-calendar',
            async () => {
                const [earnings, recommendationsMap] = await Promise.all([
                    getM7EarningsCalendar(),
                    getM7Recommendations()
                ]);

                const recommendations: Record<string, RecommendationTrend> = {};
                recommendationsMap.forEach((value, key) => {
                    recommendations[key] = value;
                });

                return { earnings, recommendations, fetchedAt: new Date().toISOString() };
            },
            { ttlSeconds: 3600, keyPrefix: 'swr' }
        );

        return NextResponse.json({ ...result.data, _cache: result._cache });
    } catch (error) {
        console.error('[M7 Calendar API] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch M7 calendar data', earnings: [], recommendations: {} },
            { status: 500 }
        );
    }
}
