// Intel M7 Unified API Endpoint
// Combines price data + watchlist analysis for all M7 tickers
// [PERF] Reduces 14+ API calls to 1 single request
// Caching: 15s for realtime data

import { NextResponse } from 'next/server';
import { getStockData, getOptionsData } from '@/services/stockApi';
import { analyzeGemsTicker } from '@/services/stockTypes';

// M7 Tickers (fixed list)
const M7_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];

// Edge cache for 15 seconds (realtime data)
export const revalidate = 15;

export interface M7Quote {
    ticker: string;
    price: number;
    changePct: number;
    prevClose: number;
    volume: number;
    extendedPrice: number;
    extendedChangePct: number;
    extendedLabel: string;
    session: string;
    alphaScore: number;
    grade: string;
    maxPain: number;
    callWall: number;
    putFloor: number;
    gex: number;
    pcr: number;
    gammaRegime: string;
    sparkline: number[];
    netPremium: number;
}

export async function GET(request: Request) {
    const startTime = Date.now();
    const baseUrl = request.url.split('/api/')[0];

    try {
        // Parallel fetch: Price data + Watchlist batch analysis
        const [priceResults, watchlistRes] = await Promise.all([
            // Fetch live price data for each ticker
            Promise.all(M7_TICKERS.map(async (ticker) => {
                try {
                    const res = await fetch(`${baseUrl}/api/live/ticker?t=${ticker}`, {
                        cache: 'no-store'
                    });
                    if (!res.ok) return { ticker, data: null };
                    const t = await res.text();
                    if (!t) return { ticker, data: null };
                    try { return { ticker, data: JSON.parse(t) }; } catch { return { ticker, data: null }; }
                } catch {
                    return { ticker, data: null };
                }
            })),
            // Fetch watchlist batch data
            fetch(`${baseUrl}/api/watchlist/batch?tickers=${M7_TICKERS.join(',')}`, {
                cache: 'no-store'
            }).then(async r => {
                if (!r.ok) return null;
                const t = await r.text();
                if (!t) return null;
                try { return JSON.parse(t); } catch { return null; }
            }).catch(() => null)
        ]);

        // Build watchlist lookup map
        const watchlistData: Record<string, any> = {};
        watchlistRes?.results?.forEach((r: any) => {
            watchlistData[r.ticker] = r;
        });

        // Transform to unified M7Quote format
        const quotes: M7Quote[] = [];

        priceResults.forEach(({ ticker, data }) => {
            if (!data) {
                // Return placeholder for failed tickers
                quotes.push({
                    ticker,
                    price: 0,
                    changePct: 0,
                    prevClose: 0,
                    volume: 0,
                    extendedPrice: 0,
                    extendedChangePct: 0,
                    extendedLabel: '',
                    session: 'CLOSED',
                    alphaScore: 0,
                    grade: '-',
                    maxPain: 0,
                    callWall: 0,
                    putFloor: 0,
                    gex: 0,
                    pcr: 1,
                    gammaRegime: 'NEUTRAL',
                    sparkline: [],
                    netPremium: 0
                });
                return;
            }

            const wl = watchlistData[ticker] || {};
            const session = data.session || 'CLOSED';

            // Session-aware price logic
            let displayPrice = data.display?.price || data.prices?.prevRegularClose || data.prevClose || 0;
            let displayChangePct = data.display?.changePctPct || 0;

            if (session === 'POST' || session === 'CLOSED') {
                const regularClose = data.prices?.regularCloseToday;
                const prevClose = data.prices?.prevRegularClose || data.prevClose;
                if (regularClose && regularClose > 0) {
                    displayPrice = regularClose;
                    const isNewTradingDay = prevClose && Math.abs(regularClose - prevClose) > 0.001;
                    if (isNewTradingDay && prevClose > 0) {
                        displayChangePct = ((regularClose - prevClose) / prevClose) * 100;
                    } else {
                        displayChangePct = data.prices?.prevChangePct || data.display?.changePctPct || 0;
                    }
                }
            }

            if (session === 'PRE') {
                const staticClose = data.prices?.prevRegularClose || data.prevClose;
                if (staticClose) {
                    displayPrice = staticClose;
                    displayChangePct = data.prices?.prevChangePct ?? 0;
                }
            }

            // Extended hours pricing
            let extendedPrice = 0;
            let extendedChangePct = 0;
            let extendedLabel = '';

            if (session === 'PRE') {
                extendedPrice = data.extended?.prePrice || data.prices?.prePrice || 0;
                extendedLabel = 'PRE';
                extendedChangePct = data.extended?.preChangePct ? data.extended.preChangePct * 100 : 0;
            } else if (session === 'POST' || session === 'CLOSED') {
                extendedPrice = data.extended?.postPrice || data.prices?.postPrice || 0;
                extendedLabel = 'POST';
                if (extendedPrice > 0 && displayPrice > 0) {
                    extendedChangePct = ((extendedPrice - displayPrice) / displayPrice) * 100;
                }
            }

            // Options data from watchlist
            const rt = wl.realtime || {};
            const gex = rt.gex || 0;
            let gammaRegime = 'NEUTRAL';
            if (gex > 0) gammaRegime = 'LONG';
            else if (gex < 0) gammaRegime = 'SHORT';

            quotes.push({
                ticker,
                price: displayPrice,
                changePct: displayChangePct,
                prevClose: data.prices?.prevRegularClose || data.prevClose || 0,
                volume: data.day?.v || 0,
                extendedPrice,
                extendedChangePct,
                extendedLabel,
                session,
                alphaScore: wl.alphaSnapshot?.score || 0,
                grade: wl.alphaSnapshot?.grade || '-',
                maxPain: rt.maxPain || 0,
                callWall: rt.callWall || 0,
                putFloor: rt.putFloor || 0,
                gex,
                pcr: rt.pcr || 1,
                gammaRegime,
                sparkline: rt.sparkline || [],
                netPremium: rt.netPremium || 0
            });
        });

        // Sort by change percentage (descending) for session summary
        quotes.sort((a, b) => b.changePct - a.changePct);

        const elapsed = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            data: quotes,
            meta: {
                tickers: M7_TICKERS,
                count: quotes.length,
                elapsedMs: elapsed,
                cachedFor: '15s'
            }
        });

    } catch (error) {
        console.error('[/api/intel/m7] Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to fetch M7 data',
            data: []
        }, { status: 500 });
    }
}
