// Silicon Core Calendar Data API - Earnings & Recommendations
import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendar, getRecommendationTrends, EarningsEvent, RecommendationTrend } from '@/services/finnhubClient';

const SILICON_CORE_TICKERS = ['AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL'];

export async function GET(req: NextRequest) {
    try {
        const today = new Date();
        const fromDate = today.toISOString().split('T')[0];
        const toDate = new Date(today.getFullYear(), today.getMonth() + 4, today.getDate()).toISOString().split('T')[0];

        const [earningsResults, recommendationResults] = await Promise.all([
            Promise.all(SILICON_CORE_TICKERS.map(async (symbol) => {
                try {
                    const earnings = await getEarningsCalendar(symbol, fromDate, toDate);
                    return earnings;
                } catch (e) {
                    console.error(`[SiliconCore API] Earnings error for ${symbol}:`, e);
                    return [];
                }
            })),
            Promise.all(SILICON_CORE_TICKERS.map(async (symbol) => {
                try {
                    const trends = await getRecommendationTrends(symbol);
                    return { symbol, trend: trends[0] || null };
                } catch (e) {
                    console.error(`[SiliconCore API] Recommendation error for ${symbol}:`, e);
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
            tickers: SILICON_CORE_TICKERS,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[SiliconCore Calendar API] Error:', error);
        return NextResponse.json({
            earnings: [], recommendations: {}, tickers: SILICON_CORE_TICKERS,
            error: 'Failed to fetch calendar data'
        }, { status: 500 });
    }
}
