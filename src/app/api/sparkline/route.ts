import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';

/**
 * Lightweight sparkline API for landing page ticker cards.
 * Returns last 10 daily close prices for a given symbol.
 * GET /api/sparkline?t=NVDA
 */
export async function GET(req: NextRequest) {
    const symbol = req.nextUrl.searchParams.get('t');
    if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
        return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
    }

    try {
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
        const data = await fetchMassive(
            `/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}`,
            { limit: '30', adjusted: 'true', sort: 'asc' }
        );

        if (!data?.results?.length) {
            return NextResponse.json({ closes: [] });
        }

        const closes = data.results.slice(-10).map((d: any) => d.c);
        return NextResponse.json({ closes }, {
            headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
        });
    } catch {
        return NextResponse.json({ closes: [] });
    }
}
