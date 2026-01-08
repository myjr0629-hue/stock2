
import { NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';

export const dynamic = 'force-dynamic'; // No caching allowed

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');

    if (!symbolsParam) {
        return NextResponse.json({ error: 'Symbols required' }, { status: 400 });
    }

    try {
        // [S-56] Massive Batch Snapshot
        // Uses Polygon /v2/snapshot/locale/us/markets/stocks/tickers?tickers=...
        const snapRes = await fetchMassive(
            '/v2/snapshot/locale/us/markets/stocks/tickers',
            { tickers: symbolsParam },
            false // No cache (Live)
        );

        if (!snapRes || !snapRes.tickers) {
            return NextResponse.json({ data: {} });
        }

        const data: Record<string, any> = {};

        snapRes.tickers.forEach((t: any) => {
            const sym = t.ticker;

            // Standard Price Logic (similar to stockApi.ts)
            const prevClose = t.prevDay?.c || 0;
            const dayClose = t.day?.c || prevClose;
            const currentPrice = t.lastTrade?.p || t.min?.c || dayClose;

            // Calculate change vs Prev Close (Standard)
            const change = currentPrice - prevClose;
            const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

            // [Phase 23] Extended Hours Logic (Basic)
            // We need volume to approximate Flow activity
            const volume = t.day?.v || 0;
            const prevVolume = t.prevDay?.v || 0;
            const dollarVolume = currentPrice * volume; // Approx Flow

            data[sym] = {
                price: currentPrice,
                change: change,
                changePercent: changePercent,
                volume: volume,
                flowApprox: dollarVolume,
                lastUpdate: t.lastTrade?.t || Date.now() * 1000000
            };
        });

        return NextResponse.json({ data }, {
            headers: {
                'Cache-Control': 'no-store, max-age=0',
            }
        });

    } catch (error) {
        console.error('[LiveAPI] Failed to fetch quotes:', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
