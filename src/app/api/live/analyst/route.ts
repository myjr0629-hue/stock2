import { NextRequest, NextResponse } from 'next/server';
import { getRecommendationTrends } from '@/services/finnhubClient';
import { swrFetch } from '@/lib/cache/redisSWR';

/**
 * GET /api/live/analyst?t=NVDA
 * Returns analyst recommendation consensus + price target from Finnhub.
 */
export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('t');
    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker parameter' }, { status: 400 });
    }

    try {
        const result = await swrFetch(
            `analyst:${ticker.toUpperCase()}`,
            async () => {
                const trends = await getRecommendationTrends(ticker);
                const latest = trends.length > 0 ? trends[0] : null;

                const strongBuy = latest?.strongBuy || 0;
                const buy = latest?.buy || 0;
                const hold = latest?.hold || 0;
                const sell = latest?.sell || 0;
                const strongSell = latest?.strongSell || 0;
                const totalAnalysts = strongBuy + buy + hold + sell + strongSell;
                const bullish = strongBuy + buy;
                const bullishPct = totalAnalysts > 0 ? Math.round((bullish / totalAnalysts) * 100) : 0;

                let consensus: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL' | 'N/A' = 'N/A';
                if (totalAnalysts > 0) {
                    const weightedScore = (strongBuy * 5 + buy * 4 + hold * 3 + sell * 2 + strongSell * 1) / totalAnalysts;
                    if (weightedScore >= 4.3) consensus = 'STRONG BUY';
                    else if (weightedScore >= 3.5) consensus = 'BUY';
                    else if (weightedScore >= 2.5) consensus = 'HOLD';
                    else if (weightedScore >= 1.7) consensus = 'SELL';
                    else consensus = 'STRONG SELL';
                }

                return {
                    ticker,
                    consensus,
                    totalAnalysts,
                    bullishPct,
                    breakdown: { strongBuy, buy, hold, sell, strongSell },
                    period: latest?.period || null,
                    priceTarget: null,
                };
            },
            { ttlSeconds: 3600, keyPrefix: 'swr' }
        );

        return NextResponse.json({ ...result.data, _cache: result._cache });
    } catch (err) {
        console.error('[API /live/analyst] Error:', err);
        return NextResponse.json({ error: 'Failed to fetch analyst data' }, { status: 500 });
    }
}
