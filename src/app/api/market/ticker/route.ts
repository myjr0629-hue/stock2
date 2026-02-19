import { NextRequest, NextResponse } from 'next/server';
import { getYahooDataSSOT } from '@/services/yahooFinanceHub';

/**
 * [V8.0] Individual ticker fetch for real-time round-robin polling.
 * GET /api/market/ticker?s=NQ=F
 * 
 * Reads from Redis via getYahooDataSSOT (NO Yahoo direct calls).
 */

const SYMBOL_MAP: Record<string, string> = {
    'NQ=F': 'nq',
    'ES=F': 'spx',
    '^VIX': 'vix',
    '^TNX': 'tnx',
    'BTC-USD': 'btc',
    'GC=F': 'gold',
    'CL=F': 'oil',
    'RTY=F': 'rut'
};

export async function GET(req: NextRequest) {
    const symbol = req.nextUrl.searchParams.get('s');

    if (!symbol || !SYMBOL_MAP[symbol]) {
        return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
    }

    try {
        const data = await getYahooDataSSOT();
        const key = SYMBOL_MAP[symbol] as keyof typeof data;
        const quote = data[key];

        if (!quote || !quote.price) {
            return NextResponse.json({ error: 'No market data' }, { status: 502 });
        }

        return NextResponse.json({
            symbol,
            price: quote.price,
            changePct: Math.round(quote.changePct * 100) / 100,
            source: quote.source,
            ts: Date.now()
        }, {
            headers: { 'Cache-Control': 'no-store' }
        });
    } catch {
        return NextResponse.json({ error: 'Data unavailable' }, { status: 504 });
    }
}
