/**
 * [Phase 2] Batch Price API — Instant multi-ticker prices from DynamoDB
 * 
 * POST /api/history/batch-price
 * Body: { tickers: ["AAPL", "NVDA", ...], days?: 1 }
 * 
 * Returns cached prices from DynamoDB (written by Lambda every 5 min)
 * Response time: ~100-300ms for 150 tickers (vs ~30s with Polygon API)
 */

import { NextResponse } from 'next/server';
import { getLatestPricesBatch, getBatchPriceHistories } from '@/lib/aws/priceCacheStore';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const tickers: string[] = body.tickers || [];
        const days: number = body.days || 1;
        const includeHistory: boolean = body.includeHistory || false;

        if (!tickers.length) {
            return NextResponse.json({ error: 'tickers required' }, { status: 400 });
        }

        if (tickers.length > 300) {
            return NextResponse.json({ error: 'max 300 tickers' }, { status: 400 });
        }

        const start = Date.now();

        // Latest prices (single most recent entry per ticker)
        const prices = await getLatestPricesBatch(tickers);

        // Optional: price history for sparklines
        let histories: Map<string, any[]> | undefined;
        if (includeHistory && days > 1) {
            histories = await getBatchPriceHistories(tickers, days);
        }

        const result: Record<string, any> = {};
        for (const ticker of tickers) {
            const price = prices.get(ticker);
            result[ticker] = {
                ...price,
                found: !!price,
                ...(histories?.get(ticker) ? { history: histories.get(ticker) } : {}),
            };
        }

        return NextResponse.json({
            success: true,
            count: prices.size,
            total: tickers.length,
            latencyMs: Date.now() - start,
            data: result,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// GET shorthand for quick testing
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');

    if (!tickersParam) {
        return NextResponse.json({
            error: 'tickers required',
            usage: '/api/history/batch-price?tickers=AAPL,NVDA,TSLA',
        }, { status: 400 });
    }

    const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    const start = Date.now();
    const prices = await getLatestPricesBatch(tickers);

    const result: Record<string, any> = {};
    for (const ticker of tickers) {
        result[ticker] = prices.get(ticker) || { found: false };
    }

    return NextResponse.json({
        success: true,
        count: prices.size,
        latencyMs: Date.now() - start,
        data: result,
    });
}
