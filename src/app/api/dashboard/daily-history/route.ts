import { NextRequest, NextResponse } from 'next/server';

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
const MASSIVE_BASE_URL = process.env.MASSIVE_BASE_URL || 'https://api.polygon.io';

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

    if (!MASSIVE_API_KEY) {
        return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    try {
        // Calculate date range (go back extra days to account for weekends/holidays)
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - (days * 2 + 5)); // Extra buffer for weekends

        const toStr = to.toISOString().split('T')[0];
        const fromStr = from.toISOString().split('T')[0];

        const url = `${MASSIVE_BASE_URL}/v2/aggs/ticker/${ticker}/range/1/day/${fromStr}/${toStr}?adjusted=true&sort=desc&limit=${days}&apiKey=${MASSIVE_API_KEY}`;

        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            next: { revalidate: 300 } // Cache 5 min
        });

        if (!response.ok) {
            throw new Error(`Polygon API error: ${response.status}`);
        }

        const data = await response.json();
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
            change: results.length > 1 ? null : null // Will calculate in client
        }));

        // Calculate daily change % (using prev day close)
        for (let i = 0; i < dailyData.length; i++) {
            if (i < dailyData.length - 1) {
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

    } catch (error) {
        console.error('[daily-history] Error:', error);
        return NextResponse.json({
            error: 'Failed to fetch daily history',
            ticker,
            data: []
        }, { status: 500 });
    }
}
