// API Route: /api/intel/m7-calendar
// Returns M7 earnings calendar and analyst recommendations

import { NextResponse } from 'next/server';
import { getM7EarningsCalendar, getM7Recommendations, EarningsEvent, RecommendationTrend } from '@/services/finnhubClient';
import { swrFetch } from '@/lib/cache/redisSWR';
import { unifyEarningsList } from '@/services/earningsCalendarService';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

// ★ 2026-09-30 실적일은 공용 규칙(lib/earningsDate — FMP 실적 캘린더 우선, 없을 때만 Finnhub)으로 — 앱 실적 캘린더·Command 와 같은 날짜.
//   예전엔 Finnhub 행 그대로라 NKE 류(분기 건너뜀)·ADR 해외 원주 행(2330.TW, EPS 가 TWD)이 섞였다.
const M7_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'];   // finnhubClient.getM7EarningsCalendar 와 같은 목록

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

        return NextResponse.json({ ...result.data, earnings: await unifyEarningsList(M7_TICKERS, result.data?.earnings, { waitMs: 3000 }), _cache: result._cache });
    } catch (error) {
        console.error('[M7 Calendar API] Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch M7 calendar data', earnings: [], recommendations: {} },
            { status: 500 }
        );
    }
}
