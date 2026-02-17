import { NextRequest, NextResponse } from 'next/server';

/**
 * Individual ticker fetch for real-time round-robin polling.
 * GET /api/market/ticker?s=NQ=F
 * 
 * Returns a single Yahoo Finance quote for the given symbol.
 * No caching — called every ~7s per symbol (8 symbols × 7s = 56s cycle).
 * Yahoo rate limit: safe at ~8-9 calls/min.
 */

const VALID_SYMBOLS = new Set([
    'NQ=F', 'ES=F', '^VIX', '^TNX', 'BTC-USD', 'GC=F', 'CL=F', 'RTY=F'
]);

export async function GET(req: NextRequest) {
    const symbol = req.nextUrl.searchParams.get('s');

    if (!symbol || !VALID_SYMBOLS.has(symbol)) {
        return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
    }

    try {
        const encodedSymbol = encodeURIComponent(symbol);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1m&range=1d`;

        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            signal: AbortSignal.timeout(5000)
        });

        if (!res.ok) {
            return NextResponse.json({ error: `Yahoo returned ${res.status}` }, { status: 502 });
        }

        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;

        if (!meta?.regularMarketPrice) {
            return NextResponse.json({ error: 'No market data' }, { status: 502 });
        }

        const price = meta.regularMarketPrice;
        const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
        const change = price - prevClose;
        const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

        return NextResponse.json({
            symbol,
            price,
            changePct: Math.round(changePct * 100) / 100,
            ts: Date.now()
        }, {
            headers: { 'Cache-Control': 'no-store' }
        });
    } catch {
        return NextResponse.json({ error: 'Fetch timeout' }, { status: 504 });
    }
}
