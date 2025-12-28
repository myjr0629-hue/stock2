import { NextRequest, NextResponse } from 'next/server';

import { fetchMassive } from '@/services/massiveClient';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('t')?.toUpperCase();
    if (!ticker) return NextResponse.json({ overview: null });

    const startTime = Date.now();
    try {
        // Overview data is stable, cache for 24 hours (86400 seconds)
        let data;
        try {
            data = await fetchMassive(`/v3/reference/tickers/${ticker}`, {}, true, undefined, { next: { revalidate: 86400 } });
        } catch (e) {
            return NextResponse.json({
                ticker,
                source: `Massive /v3/reference/tickers/${ticker}`,
                sourceGrade: "C",
                overview: {
                    name: null,
                    sector: null,
                    industry: null,
                    marketCap: null,
                    exchange: null,
                    homepage: null
                },
                debug: { latencyMs: Date.now() - startTime }
            });
        }
        const results = data.results || {};

        return NextResponse.json({
            ticker,
            source: `Massive /v3/reference/tickers/${ticker}`,
            sourceGrade: "A",
            overview: {
                name: results.name || null,
                sector: results.sic_description || null,
                industry: results.industry || null,
                marketCap: results.market_cap || null,
                exchange: results.primary_exchange || null,
                homepage: results.homepage_url || null
            },
            debug: { latencyMs: Date.now() - startTime }
        });
    } catch (e) {
        console.error("Overview API Error:", e);
        return NextResponse.json({
            ticker,
            sourceGrade: "C",
            overview: null,
            error: "Failed to fetch overview",
            debug: { latencyMs: Date.now() - startTime }
        });
    }
}
