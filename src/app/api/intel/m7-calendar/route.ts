// API Route: /api/intel/m7-calendar
// Returns M7 earnings calendar and analyst recommendations

import { NextResponse } from 'next/server';
import { getM7EarningsCalendar, getM7Recommendations, EarningsEvent, RecommendationTrend } from '@/services/finnhubClient';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // 1 hour cache

export interface M7CalendarResponse {
    earnings: EarningsEvent[];
    recommendations: Record<string, RecommendationTrend>;
    fetchedAt: string;
}

export async function GET() {
    try {
        // Fetch both in parallel
        const [earnings, recommendationsMap] = await Promise.all([
            getM7EarningsCalendar(),
            getM7Recommendations()
        ]);

        // Convert Map to Record
        const recommendations: Record<string, RecommendationTrend> = {};
        recommendationsMap.forEach((value, key) => {
            recommendations[key] = value;
        });

        const response: M7CalendarResponse = {
            earnings,
            recommendations,
            fetchedAt: new Date().toISOString()
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error('[M7 Calendar API] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch M7 calendar data', earnings: [], recommendations: {} },
            { status: 500 }
        );
    }
}
