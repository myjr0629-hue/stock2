// Power Matrix Calendar Data API - Earnings & Recommendations
import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendar, getRecommendationTrends, EarningsEvent, RecommendationTrend } from '@/services/finnhubClient';

const POWER_MATRIX_TICKERS = ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN'];

export async function GET(req: NextRequest) {
    try {
        const today = new Date();
        const fromDate = today.toISOString().split('T')[0];
        const toDate = new Date(today.getFullYear(), today.getMonth() + 4, today.getDate()).toISOString().split('T')[0];

        const [earningsResults, recommendationResults] = await Promise.all([
            Promise.all(POWER_MATRIX_TICKERS.map(async (symbol) => {
                try {
                    const earnings = await getEarningsCalendar(symbol, fromDate, toDate);
                    return earnings;
                } catch (e) {
                    console.error(`[PowerMatrix API] Earnings error for ${symbol}:`, e);
                    return [];
                }
            })),
            Promise.all(POWER_MATRIX_TICKERS.map(async (symbol) => {
                try {
                    const trends = await getRecommendationTrends(symbol);
                    return { symbol, trend: trends[0] || null };
                } catch (e) {
                    console.error(`[PowerMatrix API] Recommendation error for ${symbol}:`, e);
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

        return NextResponse.json({
            earnings: allEarnings,
            recommendations,
            tickers: POWER_MATRIX_TICKERS,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[PowerMatrix Calendar API] Error:', error);
        return NextResponse.json({
            earnings: [], recommendations: {}, tickers: POWER_MATRIX_TICKERS,
            error: 'Failed to fetch calendar data'
        }, { status: 500 });
    }
}
