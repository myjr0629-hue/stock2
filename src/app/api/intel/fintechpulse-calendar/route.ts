// Fintech Pulse Calendar Data API - Earnings & Recommendations
import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendar, getRecommendationTrends, EarningsEvent, RecommendationTrend } from '@/services/finnhubClient';
import { swrFetch } from '@/lib/cache/redisSWR';

const FINTECH_PULSE_TICKERS = ['XYZ', 'PYPL', 'COIN', 'SOFI', 'AFRM', 'HOOD', 'UPST'];

export async function GET(req: NextRequest) {
    try {
        const result = await swrFetch(
            'intel:fintechpulse-calendar',
            async () => {
                const today = new Date();
                const fromDate = today.toISOString().split('T')[0];
                const toDate = new Date(today.getFullYear(), today.getMonth() + 4, today.getDate()).toISOString().split('T')[0];

                const [earningsResults, recommendationResults] = await Promise.all([
                    Promise.all(FINTECH_PULSE_TICKERS.map(async (symbol) => {
                        try {
                            return await getEarningsCalendar(symbol, fromDate, toDate);
                        } catch (e) {
                            console.error(`[FintechPulse API] Earnings error for ${symbol}:`, e);
                            return [];
                        }
                    })),
                    Promise.all(FINTECH_PULSE_TICKERS.map(async (symbol) => {
                        try {
                            const trends = await getRecommendationTrends(symbol);
                            return { symbol, trend: trends[0] || null };
                        } catch (e) {
                            console.error(`[FintechPulse API] Recommendation error for ${symbol}:`, e);
                            return { symbol, trend: null };
                        }
                    }))
                ]);

                const allEarnings: EarningsEvent[] = earningsResults.flat().sort((a, b) =>
                    new Date(a.date).getTime() - new Date(b.date).getTime()
                );

                const recommendations: Record<string, RecommendationTrend> = {};
                recommendationResults.forEach(({ symbol, trend }) => {
                    if (trend) recommendations[symbol] = trend;
                });

                return { earnings: allEarnings, recommendations, tickers: FINTECH_PULSE_TICKERS, timestamp: new Date().toISOString() };
            },
            { ttlSeconds: 3600, keyPrefix: 'swr' }
        );

        return NextResponse.json({ ...result.data, _cache: result._cache });
    } catch (error) {
        console.error('[FintechPulse Calendar API] Error:', error);
        return NextResponse.json({
            earnings: [], recommendations: {}, tickers: FINTECH_PULSE_TICKERS,
            error: 'Failed to fetch calendar data'
        }, { status: 500 });
    }
}
