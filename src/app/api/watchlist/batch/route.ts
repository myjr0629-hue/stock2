// Watchlist Batch Analyze API - Optimized multi-ticker analysis
// Single request for multiple tickers to reduce HTTP overhead
// [V5] Uses Alpha Engine V5 (calculateAlphaScore) with FULL data enrichment
// [V5] Macro + Flow + Catalyst data = absolute alpha scores identical to reports

import { NextResponse } from 'next/server';
import { processWatchlistBatch } from '@/services/watchlistBatchService';

// ============================================================================
// API ROUTE HANDLER (HTTP GET)
// ============================================================================
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');

    if (!tickersParam) {
        return NextResponse.json({ error: 'tickers required (comma-separated)' }, { status: 400 });
    }

    const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);

    if (tickers.length === 0) {
        return NextResponse.json({ error: 'No valid tickers provided' }, { status: 400 });
    }

    if (tickers.length > 50) {
        return NextResponse.json({ error: 'Max 50 tickers per request' }, { status: 400 });
    }

    const payload = await processWatchlistBatch(tickers);
    return NextResponse.json(payload, {
        headers: {
            // [PERF] Browser can serve stale data for 5s while revalidating in background
            'Cache-Control': 'private, max-age=5, stale-while-revalidate=25',
        }
    });
}
