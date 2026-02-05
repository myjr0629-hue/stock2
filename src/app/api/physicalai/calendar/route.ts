// Physical AI Calendar Data API - Earnings & Recommendations
import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendar, getRecommendationTrends, EarningsEvent, RecommendationTrend } from '@/services/finnhubClient';

const PHYSICAL_AI_TICKERS = ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'];

export async function GET(req: NextRequest) {
    try {
        const today = new Date();
        const fromDate = today.toISOString().split('T')[0];
        const toDate = new Date(today.getFullYear(), today.getMonth() + 4, today.getDate()).toISOString().split('T')[0];

        // Fetch earnings and recommendations in parallel
        const [earningsResults, recommendationResults] = await Promise.all([
            Promise.all(PHYSICAL_AI_TICKERS.map(async (symbol) => {
                try {
                    const earnings = await getEarningsCalendar(symbol, fromDate, toDate);
                    return earnings;
                } catch (e) {
                    console.error(`[PhysicalAI API] Earnings error for ${symbol}:`, e);
                    return [];
                }
            })),
            Promise.all(PHYSICAL_AI_TICKERS.map(async (symbol) => {
                try {
                    const trends = await getRecommendationTrends(symbol);
                    return { symbol, trend: trends[0] || null };
                } catch (e) {
                    console.error(`[PhysicalAI API] Recommendation error for ${symbol}:`, e);
                    return { symbol, trend: null };
                }
            }))
        ]);

        // Flatten and sort earnings
        const allEarnings: EarningsEvent[] = earningsResults.flat().sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Build recommendations map
        const recommendations: Record<string, RecommendationTrend> = {};
        recommendationResults.forEach(({ symbol, trend }) => {
            if (trend) {
                recommendations[symbol] = trend;
            }
        });

        return NextResponse.json({
            earnings: allEarnings,
            recommendations,
            tickers: PHYSICAL_AI_TICKERS,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[PhysicalAI Calendar API] Error:', error);
        return NextResponse.json({
            earnings: [],
            recommendations: {},
            tickers: PHYSICAL_AI_TICKERS,
            error: 'Failed to fetch calendar data'
        }, { status: 500 });
    }
}
