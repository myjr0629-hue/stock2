import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';

/**
 * GET /api/dashboard/daily-history?t=TSLA&days=5
 * Returns daily OHLC data with calculated metrics for the past N trading days
 */
export async function GET(request: NextRequest) {
    const ticker = request.nextUrl.searchParams.get('t')?.toUpperCase();
    const days = parseInt(request.nextUrl.searchParams.get('days') || '5');

    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker parameter' }, { status: 400 });
    }

    try {
        // Calculate date range (go back extra days to account for weekends/holidays)
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - (days * 2 + 5));

        const toStr = to.toISOString().split('T')[0];
        const fromStr = from.toISOString().split('T')[0];

        // Fetch one extra day for Gap% calculation
        const data = await fetchMassive(
            `/v2/aggs/ticker/${ticker}/range/1/day/${fromStr}/${toStr}`,
            { adjusted: 'true', sort: 'desc', limit: String(days + 2) },
            true
        );

        const results = data.results || [];

        // Format and calculate metrics
        const dailyData = results.slice(0, days).map((bar: any, idx: number) => {
            const prevBar = results[idx + 1];
            const prevClose = prevBar?.c || bar.o;

            // Calculate metrics
            const changePct = prevClose > 0 ? ((bar.c - prevClose) / prevClose) * 100 : 0;
            const gapPct = prevClose > 0 ? ((bar.o - prevClose) / prevClose) * 100 : 0;
            const rangePct = bar.c > 0 ? ((bar.h - bar.l) / bar.c) * 100 : 0;

            return {
                date: new Date(bar.t).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }),
                close: bar.c,
                changePct,
                volume: bar.v,
                gapPct,
                rangePct,
                vwap: bar.vw
            };
        });

        return NextResponse.json({ ticker, data: dailyData });

    } catch (error: any) {
        console.error('[daily-history] Error:', error);
        return NextResponse.json({
            error: error?.reasonKR || 'Failed to fetch daily history',
            ticker,
            data: []
        }, { status: 500 });
    }
}
