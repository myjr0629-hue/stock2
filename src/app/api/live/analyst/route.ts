import { NextRequest, NextResponse } from 'next/server';
import { swrFetch } from '@/lib/cache/redisSWR';

const FMP_API_KEY = process.env.FMP_API_KEY || '';

/**
 * GET /api/live/analyst?t=NVDA
 * Returns analyst recommendation consensus from FMP grades-consensus.
 * (Previously used Finnhub — switched to FMP for consistency with Lambda v7.1)
 */
export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('t');
    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker parameter' }, { status: 400 });
    }

    try {
        const result = await swrFetch(
            `analyst:${ticker.toUpperCase()}`,
            async () => {
                if (!FMP_API_KEY) throw new Error('FMP_API_KEY not set');

                const res = await fetch(
                    `https://financialmodelingprep.com/stable/grades-consensus?symbol=${ticker.toUpperCase()}&apikey=${FMP_API_KEY}`,
                    { signal: AbortSignal.timeout(8000) }
                );
                if (!res.ok) throw new Error(`FMP ${res.status}`);
                const data = await res.json();
                const grade = Array.isArray(data) ? data[0] : data;

                if (!grade || (!grade.strongBuy && !grade.buy && !grade.hold)) {
                    return {
                        ticker: ticker.toUpperCase(),
                        consensus: 'N/A' as const,
                        totalAnalysts: 0,
                        bullishPct: 0,
                        breakdown: { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 },
                        priceTarget: null,
                    };
                }

                const strongBuy = grade.strongBuy || 0;
                const buy = grade.buy || 0;
                const hold = grade.hold || 0;
                const sell = grade.sell || 0;
                const strongSell = grade.strongSell || 0;
                const totalAnalysts = strongBuy + buy + hold + sell + strongSell;
                const bullishPct = totalAnalysts > 0 ? Math.round(((strongBuy + buy) / totalAnalysts) * 100) : 0;

                let consensus: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL' | 'N/A' = 'N/A';
                // Use FMP's consensus if available, otherwise calculate
                if (grade.consensus) {
                    const fmpCon = grade.consensus.toUpperCase();
                    if (fmpCon === 'STRONG BUY') consensus = 'STRONG BUY';
                    else if (fmpCon === 'BUY') consensus = 'BUY';
                    else if (fmpCon === 'HOLD') consensus = 'HOLD';
                    else if (fmpCon === 'SELL') consensus = 'SELL';
                    else if (fmpCon === 'STRONG SELL') consensus = 'STRONG SELL';
                    else consensus = fmpCon as any;
                }
                if (consensus === 'N/A' && totalAnalysts > 0) {
                    const ws = (strongBuy * 5 + buy * 4 + hold * 3 + sell * 2 + strongSell) / totalAnalysts;
                    if (ws >= 4.3) consensus = 'STRONG BUY';
                    else if (ws >= 3.5) consensus = 'BUY';
                    else if (ws >= 2.5) consensus = 'HOLD';
                    else if (ws >= 1.7) consensus = 'SELL';
                    else consensus = 'STRONG SELL';
                }

                return {
                    ticker: ticker.toUpperCase(),
                    consensus,
                    totalAnalysts,
                    bullishPct,
                    breakdown: { strongBuy, buy, hold, sell, strongSell },
                    priceTarget: null,
                };
            },
            { ttlSeconds: 3600, keyPrefix: 'swr' }
        );

        return NextResponse.json({ ...result.data, _cache: result._cache });
    } catch (err) {
        console.error('[API /live/analyst] Error:', err);
        return NextResponse.json({ error: 'Failed to fetch analyst data' }, { status: 500 });
    }
}
