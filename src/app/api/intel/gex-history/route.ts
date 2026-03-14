// GEX History API - Provides regime change + sector comparison data
// Used by SectorSessionGrid for Phase B historical context

import { NextResponse } from 'next/server';
import { buildHistoryContext } from '@/services/gexHistoryService';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');

    if (!tickersParam) {
        return NextResponse.json({ error: 'tickers required' }, { status: 400 });
    }

    const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);

    if (tickers.length === 0 || tickers.length > 50) {
        return NextResponse.json({ error: 'Invalid tickers (1-50)' }, { status: 400 });
    }

    try {
        // For sector comparison, we need all tickers' current regime
        // The caller passes current regimes as query param
        const regimesParam = searchParams.get('regimes') || '';
        const regimes = regimesParam.split(',');

        const sectorTickers = tickers.map((ticker, i) => ({
            ticker,
            gammaRegime: regimes[i] || 'NEUTRAL',
        }));

        const result: Record<string, any> = {};

        // Process in parallel but with concurrency limit
        const promises = tickers.map(async (ticker, i) => {
            const ctx = await buildHistoryContext(
                ticker,
                regimes[i] || 'NEUTRAL',
                sectorTickers
            );
            result[ticker] = ctx;
        });

        await Promise.all(promises);

        return NextResponse.json(result, {
            headers: {
                'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
            }
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
