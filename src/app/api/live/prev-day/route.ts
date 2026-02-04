import { NextRequest, NextResponse } from 'next/server';

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('ticker') || searchParams.get('t');

    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });
    }

    const startTime = Date.now();

    try {
        // Fetch previous day data for the ticker
        const prevUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${MASSIVE_API_KEY}`;
        const prevRes = await fetch(prevUrl, { next: { revalidate: 3600 } });

        if (!prevRes.ok) {
            return NextResponse.json({
                ticker,
                prevClose: null,
                status: 'unavailable'
            });
        }

        const prevData = await prevRes.json();
        const prevResults = prevData.results?.[0];

        if (!prevResults) {
            return NextResponse.json({
                ticker,
                prevClose: null,
                status: 'no_data'
            });
        }

        return NextResponse.json({
            ticker,
            prevClose: prevResults.c,
            prevHigh: prevResults.h,
            prevLow: prevResults.l,
            prevOpen: prevResults.o,
            prevVolume: prevResults.v,
            prevVwap: prevResults.vw,
            date: new Date(prevResults.t).toISOString().split('T')[0],
            debug: {
                latencyMs: Date.now() - startTime
            }
        });

    } catch (e) {
        console.error('Previous Day API Error:', e);
        return NextResponse.json({
            ticker,
            prevClose: null,
            status: 'error',
            error: String(e)
        });
    }
}
