// Quantum Edge Calendar Data API - Earnings & Recommendations
import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendar, getRecommendationTrends, EarningsEvent, RecommendationTrend } from '@/services/finnhubClient';
import { unifyEarningsList } from '@/services/earningsCalendarService';
import { swrFetch } from '@/lib/cache/redisSWR';

// ★ 2026-09-30 실적일은 공용 규칙(lib/earningsDate — FMP 실적 캘린더 우선, 없을 때만 Finnhub)으로 — 앱 실적 캘린더·Command 와 같은 날짜.
//   예전엔 Finnhub 행 그대로라 NKE 류(분기 건너뜀)·ADR 해외 원주 행(2330.TW, EPS 가 TWD)이 섞였다.
const QUANTUM_EDGE_TICKERS = ['SMCI', 'SNOW', 'IONQ', 'DELL', 'AI', 'PATH', 'TWLO'];

export async function GET(req: NextRequest) {
    try {
        const result = await swrFetch(
            'intel:quantumedge-calendar',
            async () => {
                const today = new Date();
                const fromDate = today.toISOString().split('T')[0];
                const toDate = new Date(today.getFullYear(), today.getMonth() + 4, today.getDate()).toISOString().split('T')[0];

                const [earningsResults, recommendationResults] = await Promise.all([
                    Promise.all(QUANTUM_EDGE_TICKERS.map(async (symbol) => {
                        try {
                            return await getEarningsCalendar(symbol, fromDate, toDate);
                        } catch (e) {
                            console.error(`[QuantumEdge API] Earnings error for ${symbol}:`, e);
                            return [];
                        }
                    })),
                    Promise.all(QUANTUM_EDGE_TICKERS.map(async (symbol) => {
                        try {
                            const trends = await getRecommendationTrends(symbol);
                            return { symbol, trend: trends[0] || null };
                        } catch (e) {
                            console.error(`[QuantumEdge API] Recommendation error for ${symbol}:`, e);
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

                return { earnings: allEarnings, recommendations, tickers: QUANTUM_EDGE_TICKERS, timestamp: new Date().toISOString() };
            },
            { ttlSeconds: 3600, keyPrefix: 'swr' }
        );

        return NextResponse.json({ ...result.data, earnings: await unifyEarningsList(QUANTUM_EDGE_TICKERS, result.data?.earnings, { waitMs: 3000 }), _cache: result._cache });
    } catch (error) {
        console.error('[QuantumEdge Calendar API] Error:', error);
        return NextResponse.json({
            earnings: [], recommendations: {}, tickers: QUANTUM_EDGE_TICKERS,
            error: 'Failed to fetch calendar data'
        }, { status: 500 });
    }
}
