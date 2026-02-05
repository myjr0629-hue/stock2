import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';

/**
 * GET /api/dashboard/daily-history?t=TSLA&days=5
 * Returns daily OHLC data for the past N trading days
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
        from.setDate(from.getDate() - (days * 2 + 5)); // Extra buffer for weekends

        const toStr = to.toISOString().split('T')[0];
        const fromStr = from.toISOString().split('T')[0];

        // Use fetchMassive for consistent error handling
        const data = await fetchMassive(
            `/v2/aggs/ticker/${ticker}/range/1/day/${fromStr}/${toStr}`,
            { adjusted: 'true', sort: 'desc', limit: String(days + 1) },
            true
        );

        const results = data.results || [];

        // Format for table display
        const dailyData = results.slice(0, days).map((bar: any) => ({
            date: new Date(bar.t).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }),
            dateRaw: bar.t,
            open: bar.o,
            high: bar.h,
            low: bar.l,
            close: bar.c,
            volume: bar.v,
            vwap: bar.vw,
            changePct: null as number | null
        }));

        // Calculate daily change % (using prev day close)
        for (let i = 0; i < dailyData.length; i++) {
            if (i < results.length - 1) {
                const prevClose = results[i + 1]?.c;
                if (prevClose && prevClose > 0) {
                    dailyData[i].changePct = ((dailyData[i].close - prevClose) / prevClose) * 100;
                }
            }
        }

        return NextResponse.json({
            ticker,
            data: dailyData
        });

    } catch (error: any) {
        console.error('[daily-history] Error:', error);
        return NextResponse.json({
            error: error?.reasonKR || 'Failed to fetch daily history',
            ticker,
            data: []
        }, { status: 500 });
    }
}
