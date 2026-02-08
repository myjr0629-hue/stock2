// Watchlist Batch Analyze API - Optimized multi-ticker analysis
// Single request for multiple tickers to reduce HTTP overhead
// [V3.0] Uses Alpha Engine V3 (calculateAlphaScore) for unified alpha calculation
// [PERF] Uses lightweight stock data (no chart/minute data) for faster response

import { NextResponse } from 'next/server';
import { getOptionsData } from '@/services/stockApi';
import { calculateAlphaScore, type AlphaSession } from '@/services/alphaEngine';
import { getStructureData } from '@/services/structureService';
import { fetchMassive } from '@/services/massiveClient';

// [S-76] Edge cache for 30 seconds - faster repeat loads
export const revalidate = 30;

// [PERF] Lightweight stock data fetcher - skips chart data entirely
// Same data sources as getStockData(), minus getStockChartData() (which downloads 1000+ minute bars)
// All prices, RSI, 3D return, VWAP are identical to getStockData()
async function getStockDataLight(symbol: string) {
    const to = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];

    // [PERF] All 3 calls in parallel (getStockData does snapshot+chart+RSI parallel, then 3D return SEQUENTIAL)
    const [snapRes, rsiRes, dailyAggs] = await Promise.all([
        // 1. Snapshot: price, change, volume, VWAP, prevClose (same as getStockData)
        fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`),
        // 2. RSI: same API as getTechnicalRSI()
        fetchMassive(`/v1/indicators/rsi/${symbol}`, { timespan: 'day', window: '14', limit: '1' }).catch(() => null),
        // 3. Daily aggregates: for 3D return + sparkline (same as getAggregates in getStockData)
        fetchMassive(`/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${to}`, { limit: '5000', adjust: 'true', sort: 'asc' }).catch(() => null)
    ]);

    const t = snapRes?.ticker;
    if (!t) return null;

    // Session detection (same logic as getStockData lines 800-838)
    const { getETNow } = await import('@/services/timezoneUtils');
    const et = getETNow();
    const etTime = et.hour + et.minute / 60;

    let session: 'pre' | 'reg' | 'post' = 'reg';
    if (!et.isWeekend) {
        if (etTime >= 4 && etTime < 9.5) session = 'pre';
        else if (etTime >= 16 && etTime < 20) session = 'post';
        else if (etTime >= 9.5 && etTime < 16) session = 'reg';
        else session = (etTime >= 20 || etTime < 4) ? 'post' : 'reg';
    }

    // Price calculation (same logic as getStockData lines 842-868)
    const prevClose = t?.prevDay?.c || 0;
    const todayClose = t?.day?.c || prevClose;
    const latestPrice = t?.lastTrade?.p || t?.min?.c || t?.day?.c || t?.prevDay?.c || 0;

    let changeBase = prevClose;
    if (session === 'post') changeBase = todayClose;

    const isExtended = session !== 'reg';
    const extChange = isExtended ? (latestPrice - changeBase) : undefined;
    const extChangePercent = isExtended ? (changeBase !== 0 ? ((latestPrice - changeBase) / changeBase) * 100 : 0) : undefined;
    const regChange = t?.todaysChange || (todayClose - prevClose);
    const regChangePercent = t?.todaysChangePerc || (prevClose !== 0 ? ((todayClose - prevClose) / prevClose) * 100 : 0);

    // RSI (same as getTechnicalRSI)
    const rsi = rsiRes?.results?.values?.[0]?.value ?? null;

    // 3D Return + Sparkline from daily aggregates (same calculation as getStockData lines 870-908)
    const dailyResults = (dailyAggs?.results || []).map((r: any) => ({ close: r.c }));
    let return3d = 0;
    if (dailyResults.length >= 4) {
        const recentCandles = dailyResults.slice(-4);
        const price3dAgo = recentCandles[0].close;
        const currentClose = recentCandles[recentCandles.length - 1].close;
        return3d = ((currentClose - price3dAgo) / price3dAgo) * 100;
    }

    // Sparkline: last 20 daily closes (shows ~1 month trend at watchlist scale)
    const sparkline = dailyResults.slice(-20).map((d: any) => d.close);

    return {
        symbol,
        price: latestPrice,
        change: isExtended ? (extChange || 0) : (regChange || 0),
        changePercent: isExtended ? (extChangePercent || 0) : (regChangePercent || 0),
        volume: t?.day?.v,
        prevClose,
        session,
        rsi,
        return3d,
        vwap: t?.day?.vw,
        history: sparkline.map((close: number) => ({ close })), // Compatible format
    };
}

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

    if (tickers.length > 20) {
        return NextResponse.json({ error: 'Max 20 tickers per request' }, { status: 400 });
    }

    const startTime = Date.now();
    const baseUrl = request.url.split('/api/')[0];

    // Process all tickers in parallel
    const results = await Promise.all(tickers.map(async (ticker) => {
        try {
            // [PERF] Use lightweight stock data (no chart download) + options + structure in parallel
            const [stockData, optionsData, structureRes] = await Promise.all([
                getStockDataLight(ticker).catch(() => null),
                getOptionsData(ticker).catch(() => null),
                getStructureData(ticker).catch(() => null)
            ]);

            if (!stockData) {
                return { ticker, error: 'Stock data unavailable' };
            }

            // [V3.0] Alpha Engine V3 — Unified absolute scoring
            const opts = optionsData as any;
            const changePct = stockData.changePercent || 0;

            // Map session string to AlphaSession type
            const sessionMap: Record<string, AlphaSession> = { pre: 'PRE', reg: 'REG', post: 'POST' };
            const alphaSession: AlphaSession = sessionMap[stockData.session] || 'CLOSED';

            // Prepare V3 input from available data
            const alphaGex = structureRes?.netGex ?? opts?.gems?.gex ?? opts?.gex ?? null;
            const alphaPcr = opts?.putCallRatio ?? null;
            const alphaCallWall = structureRes?.callWall ?? opts?.callWall ?? null;
            const alphaPutFloor = structureRes?.putFloor ?? opts?.putFloor ?? null;
            const alphaGammaFlip = structureRes?.gammaFlipLevel ?? opts?.gems?.gammaFlipLevel ?? null;
            const alphaSqueezeScore = structureRes?.squeezeScore ?? null;

            // Calculate volume ratio for relVol
            const relVol = stockData.volume && stockData.volume > 0 ? stockData.volume / (stockData.volume || 1) : null;

            // Call V3 Engine — single source of truth
            let alphaResult;
            try {
                alphaResult = calculateAlphaScore({
                    ticker: ticker.toUpperCase(),
                    session: alphaSession,
                    price: stockData.price || 0,
                    prevClose: stockData.prevClose || 0,
                    changePct,
                    vwap: stockData.vwap ?? null,
                    return3D: stockData.return3d ?? null,
                    rsi14: stockData.rsi ?? null,
                    pcr: alphaPcr,
                    gex: alphaGex,
                    callWall: alphaCallWall,
                    putFloor: alphaPutFloor,
                    gammaFlipLevel: alphaGammaFlip,
                    rawChain: opts?.rawChain || [],
                    squeezeScore: alphaSqueezeScore,
                    optionsDataAvailable: !!opts,
                });
            } catch (e) {
                console.error(`[Watchlist Batch] V3 Engine failed for ${ticker}:`, e);
                // Graceful fallback — still returns a valid result
                alphaResult = calculateAlphaScore({
                    ticker: ticker.toUpperCase(),
                    session: alphaSession,
                    price: stockData.price || 0,
                    prevClose: stockData.prevClose || 0,
                    changePct,
                });
            }

            const { score, grade, action, actionKR, whyKR, triggerCodes: triggers, dataCompleteness: confidence } = alphaResult;

            // === OPTIONS INDICATORS ===
            const hasOptionsData = opts && (opts?.maxPain || opts?.gems?.gex || opts?.gex);
            const maxPain = hasOptionsData ? (opts?.maxPain || null) : null;
            const currentPrice = stockData.price || 0;
            const maxPainDist = (maxPain && currentPrice)
                ? Number(((maxPain - currentPrice) / currentPrice * 100).toFixed(2))
                : null;

            const rawGex = opts?.gems?.gex || opts?.gex;
            const gex = hasOptionsData ? (rawGex || null) : null;
            const gexM = gex !== null ? Number((gex / 1000000).toFixed(2)) : null;

            // === WHALE INDEX ===
            let whaleIndex = 0;
            let whaleConfidence: 'HIGH' | 'MED' | 'LOW' | 'NONE' = 'NONE';
            const pcr = opts?.putCallRatio || 1;

            if (gex !== null && gex !== undefined) {
                if (gex > 0 && pcr < 0.8) {
                    whaleIndex = Math.min(90, 60 + Math.abs(gex / 100000));
                    whaleConfidence = 'HIGH';
                } else if (gex > 0 && pcr <= 1.2) {
                    whaleIndex = Math.min(70, 40 + Math.abs(gex / 200000));
                    whaleConfidence = 'MED';
                } else if (gex < 0 || pcr > 1.3) {
                    whaleIndex = Math.max(10, 30 - Math.abs(gex / 500000));
                    whaleConfidence = 'LOW';
                } else {
                    whaleIndex = 35;
                    whaleConfidence = 'LOW';
                }
            }

            // === GAMMA FLIP & OPTIONS (Unified Pipeline from Structure API) ===
            // [S-76] Use structure API as primary source for consistency with Command page
            const gammaFlipLevel = structureRes?.gammaFlipLevel ?? null;
            const structureGexM = structureRes?.netGex ? Number((structureRes.netGex / 1000000).toFixed(2)) : null;
            const structureMaxPain = structureRes?.maxPain ?? null;
            // [S-76] ATM IV from structure API (primary) or fallback to getOptionsData
            const iv = structureRes?.atmIv ?? opts?.gems?.iv ?? opts?.iv ?? null;

            // Use structure API first (same data source as Command page)
            const finalMaxPain = structureMaxPain ?? maxPain;
            const finalMaxPainDist = (finalMaxPain && currentPrice)
                ? Number(((finalMaxPain - currentPrice) / currentPrice * 100).toFixed(2))
                : null;

            return {
                ticker,
                alphaSnapshot: {
                    score,
                    grade,
                    action,
                    actionKR,
                    whyKR,
                    confidence: Math.round(confidence),
                    triggers,
                    pillars: alphaResult.pillars,
                    gatesApplied: alphaResult.gatesApplied,
                    engineVersion: alphaResult.engineVersion,
                    capturedAt: new Date().toISOString()
                },
                realtime: {
                    price: stockData.price || 0,
                    changePct,
                    session: stockData.session || 'reg',
                    rsi: stockData.rsi || null,
                    return3d: stockData.return3d || null,
                    sparkline: stockData.history?.slice(-20).map((h: any) => h.close) || [],
                    maxPain: finalMaxPain,
                    maxPainDist: finalMaxPainDist,
                    // [S-77] Use Structure API only for GEX consistency across pages
                    gex: structureRes?.netGex ?? null,
                    gexM: structureGexM,
                    pcr: opts?.putCallRatio || null,
                    whaleIndex: Math.round(whaleIndex),
                    whaleConfidence,
                    gammaFlipLevel,
                    iv,
                    // [S-76] VWAP for price column
                    vwap: stockData.vwap || null,
                    vwapDist: (stockData.vwap && stockData.price)
                        ? Number(((stockData.price - stockData.vwap) / stockData.vwap * 100).toFixed(2))
                        : null
                }
            };
        } catch (error) {
            console.error(`Batch analyze error for ${ticker}:`, error);
            return { ticker, error: 'Analysis failed' };
        }
    }));

    const elapsed = Date.now() - startTime;

    return NextResponse.json({
        results,
        meta: {
            count: tickers.length,
            elapsed,
            source: 'watchlist_batch_light' // [PERF] Mark as optimized version
        }
    });
}
