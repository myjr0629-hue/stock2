// Intel Silicon Core Unified API Endpoint
// Cloned from M7 route — combines price data + watchlist analysis
// Caching: 15s for realtime data

import { NextRequest, NextResponse } from 'next/server';
import { GET as getLiveTicker } from '@/app/api/live/ticker/route';
import { getStockData, getOptionsData } from '@/services/stockApi';
import { analyzeGemsTicker } from '@/services/stockTypes';
import { fetchMassive } from '@/services/massiveClient';
import { getAnalysisCacheForTickers } from '@/services/analysisCache';
import { CentralDataHub } from '@/services/centralDataHub';

const SECTOR_TICKERS = ['AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL'];
const SECTOR_LABEL = 'SiliconCore';

export const revalidate = 15;

export interface SectorQuote {
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
    rsi: number;
    rvol: number;
    whaleIndex: number;
    darkPoolPct: number;
}

// [FIX] Internal API call helper
async function callInternalGet(handler: Function, url: string): Promise<any> {
    try {
        const mockReq = new NextRequest(url);
        const res = await Promise.race([handler(mockReq), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))]) as Response;
        if (!res || typeof res.json !== 'function') return null;
        return await res.json();
    } catch { return null; }
}

export async function GET(request: Request) {
    const startTime = Date.now();
    const baseUrl = request.url.split('/api/')[0];

    try {
        // ═══ [CACHE WARMER] Cache-first fast path ═══
        const cached = await getAnalysisCacheForTickers(SECTOR_TICKERS);
        const cachedCount = Object.keys(cached).length;

        if (cachedCount === SECTOR_TICKERS.length) {
            const [snapshotData, marketStatus] = await Promise.all([
                fetchMassive(
                    `/v2/snapshot/locale/us/markets/stocks/tickers`,
                    { tickers: SECTOR_TICKERS.join(',') }
                ).catch(() => null),
                CentralDataHub.getMarketStatus().catch(() => ({ session: 'closed' })),
            ]);

            const sRaw = (marketStatus as any)?.session || 'closed';
            const session = sRaw === 'pre' ? 'PRE' :
                sRaw === 'regular' ? 'REG' :
                    sRaw === 'post' ? 'POST' : 'CLOSED';

            const snapshotMap: Record<string, any> = {};
            (snapshotData?.tickers || []).forEach((t: any) => {
                snapshotMap[t.ticker] = t;
            });

            const quotes: SectorQuote[] = SECTOR_TICKERS.map(ticker => {
                const analysis = cached[ticker];
                const snap = snapshotMap[ticker];

                const prevClose = snap?.prevDay?.c || 0;
                const todayClose = snap?.day?.c || prevClose;
                const latestPrice = snap?.lastTrade?.p || snap?.min?.c || todayClose || prevClose;

                let displayPrice = latestPrice;
                let displayChangePct = snap?.todaysChangePerc || 0;
                let extendedPrice = 0;
                let extendedChangePct = 0;
                let extendedLabel = '';

                if (session === 'POST' || session === 'CLOSED') {
                    if (todayClose > 0 && prevClose > 0) {
                        displayPrice = todayClose;
                        displayChangePct = ((todayClose - prevClose) / prevClose) * 100;
                    }
                    const postPrice = snap?.afterHours?.p || latestPrice || 0;
                    if (postPrice > 0 && displayPrice > 0) {
                        extendedPrice = postPrice;
                        extendedLabel = 'POST';
                        extendedChangePct = ((postPrice - displayPrice) / displayPrice) * 100;
                    }
                } else if (session === 'PRE') {
                    displayPrice = prevClose;
                    displayChangePct = 0;
                    extendedPrice = latestPrice;
                    extendedLabel = 'PRE';
                    if (prevClose > 0) {
                        extendedChangePct = ((latestPrice - prevClose) / prevClose) * 100;
                    }
                }

                const gex = analysis.gex || 0;
                let gammaRegime = 'NEUTRAL';
                if (gex > 0) gammaRegime = 'LONG';
                else if (gex < 0) gammaRegime = 'SHORT';

                return {
                    ticker,
                    price: displayPrice,
                    changePct: displayChangePct,
                    prevClose,
                    volume: snap?.day?.v || 0,
                    extendedPrice,
                    extendedChangePct,
                    extendedLabel,
                    session,
                    alphaScore: analysis.alphaSnapshot.score,
                    grade: analysis.alphaSnapshot.grade,
                    maxPain: analysis.maxPain || 0,
                    callWall: analysis.callWall || 0,
                    putFloor: analysis.putFloor || 0,
                    gex,
                    pcr: analysis.pcr || 1,
                    gammaRegime,
                    sparkline: analysis.sparkline || [],
                    netPremium: analysis.netPremium || 0,
                    rsi: analysis.rsi || 0,
                    rvol: analysis.relVol || 0,
                    whaleIndex: analysis.whaleIndex || 0,
                    darkPoolPct: analysis.darkPoolPct || 0,
                };
            });

            quotes.sort((a, b) => b.changePct - a.changePct);

            const elapsed = Date.now() - startTime;
            return NextResponse.json({
                success: true,
                data: quotes,
                meta: {
                    tickers: SECTOR_TICKERS,
                    count: quotes.length,
                    elapsedMs: elapsed,
                    cachedFor: '15s',
                    source: 'analysis_cache',
                }
            });
        }

        // ═══ Fallback: Original HTTP-based fetch ═══
        const [priceResults, watchlistRes] = await Promise.all([
            Promise.all(SECTOR_TICKERS.map(async (ticker) => {
                try {
                    const data = await callInternalGet(getLiveTicker, `${baseUrl}/api/live/ticker?t=${ticker}`);
                    return { ticker, data };
                } catch { return { ticker, data: null }; }
            })),
            fetch(`${baseUrl}/api/watchlist/batch?tickers=${SECTOR_TICKERS.join(',')}`, { cache: 'no-store' })
                .then(async r => {
                    if (!r.ok) return null;
                    const t = await r.text();
                    if (!t) return null;
                    try { return JSON.parse(t); } catch { return null; }
                }).catch(() => null)
        ]);

        const watchlistData: Record<string, any> = {};
        watchlistRes?.results?.forEach((r: any) => { watchlistData[r.ticker] = r; });

        const quotes: SectorQuote[] = [];

        priceResults.forEach(({ ticker, data }) => {
            if (!data) {
                quotes.push({
                    ticker, price: 0, changePct: 0, prevClose: 0, volume: 0,
                    extendedPrice: 0, extendedChangePct: 0, extendedLabel: '',
                    session: 'CLOSED', alphaScore: 0, grade: '-',
                    maxPain: 0, callWall: 0, putFloor: 0, gex: 0, pcr: 1,
                    gammaRegime: 'NEUTRAL', sparkline: [], netPremium: 0, rsi: 0, rvol: 0,
                    whaleIndex: 0, darkPoolPct: 0
                });
                return;
            }

            const wl = watchlistData[ticker] || {};
            const session = data.session || 'CLOSED';

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
                volume: rt.volume || 0,
                extendedPrice, extendedChangePct, extendedLabel,
                session,
                alphaScore: wl.alphaSnapshot?.score || 0,
                grade: wl.alphaSnapshot?.grade || '-',
                maxPain: rt.maxPain || 0,
                callWall: rt.callWall || 0,
                putFloor: rt.putFloor || 0,
                gex, pcr: rt.pcr || 1, gammaRegime,
                sparkline: rt.sparkline || [],
                netPremium: rt.netPremium || 0,
                rsi: rt.rsi || 0,
                rvol: rt.relVol || 0,
                whaleIndex: rt.whaleIndex || 0,
                darkPoolPct: rt.darkPoolPct || 0
            });
        });

        quotes.sort((a, b) => b.changePct - a.changePct);

        const elapsed = Date.now() - startTime;
        return NextResponse.json({
            success: true,
            data: quotes,
            meta: { tickers: SECTOR_TICKERS, count: quotes.length, elapsedMs: elapsed, cachedFor: '15s' }
        });

    } catch (error) {
        console.error(`[/api/intel/${SECTOR_LABEL}] Error:`, error);
        return NextResponse.json({ success: false, error: `Failed to fetch ${SECTOR_LABEL} data`, data: [] }, { status: 500 });
    }
}
