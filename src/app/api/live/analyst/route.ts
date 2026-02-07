import { NextRequest, NextResponse } from 'next/server';
import { getRecommendationTrends, getPriceTarget } from '@/services/finnhubClient';

/**
 * GET /api/live/analyst?t=NVDA
 * Returns analyst recommendation consensus + price target from Finnhub.
 * Two API calls parallelized: /stock/recommendation + /stock/price-target
 */
export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('t');
    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker parameter' }, { status: 400 });
    }

    try {
        const [trends, priceTarget] = await Promise.all([
            getRecommendationTrends(ticker),
            getPriceTarget(ticker),
        ]);

        // Use most recent recommendation period
        const latest = trends.length > 0 ? trends[0] : null;

        const strongBuy = latest?.strongBuy || 0;
        const buy = latest?.buy || 0;
        const hold = latest?.hold || 0;
        const sell = latest?.sell || 0;
        const strongSell = latest?.strongSell || 0;
        const totalAnalysts = strongBuy + buy + hold + sell + strongSell;
        const bullish = strongBuy + buy;
        const bullishPct = totalAnalysts > 0 ? Math.round((bullish / totalAnalysts) * 100) : 0;

        // Determine consensus label
        let consensus: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL' | 'N/A' = 'N/A';
        if (totalAnalysts > 0) {
            const weightedScore = (strongBuy * 5 + buy * 4 + hold * 3 + sell * 2 + strongSell * 1) / totalAnalysts;
            if (weightedScore >= 4.3) consensus = 'STRONG BUY';
            else if (weightedScore >= 3.5) consensus = 'BUY';
            else if (weightedScore >= 2.5) consensus = 'HOLD';
            else if (weightedScore >= 1.7) consensus = 'SELL';
            else consensus = 'STRONG SELL';
        }

        return NextResponse.json({
            ticker,
            consensus,
            totalAnalysts,
            bullishPct,
            breakdown: { strongBuy, buy, hold, sell, strongSell },
            period: latest?.period || null,
            priceTarget: priceTarget ? {
                mean: priceTarget.targetMean,
                median: priceTarget.targetMedian,
                high: priceTarget.targetHigh,
                low: priceTarget.targetLow,
                lastUpdated: priceTarget.lastUpdated,
            } : null,
        });
    } catch (err) {
        console.error('[API /live/analyst] Error:', err);
        return NextResponse.json({ error: 'Failed to fetch analyst data' }, { status: 500 });
    }
}
