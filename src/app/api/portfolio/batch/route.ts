// Portfolio Batch API - Optimized multi-ticker analysis
// Single request for multiple tickers to reduce HTTP overhead
// [V3.2] Uses Alpha Engine V3 (calculateAlphaScore) - SAME engine as Watchlist
// [PERF] Uses lightweight stock data (no chart/minute data) for faster response

import { NextResponse } from 'next/server';
import { getOptionsData } from '@/services/stockApi';
import { calculateAlphaScore, type AlphaSession } from '@/services/alphaEngine';
import { getStructureData } from '@/services/structureService';
import { fetchMassive } from '@/services/massiveClient';

// [PERF] Lightweight stock data fetcher - same as watchlist batch
async function getStockDataLight(symbol: string) {
    const to = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];

    const [snapRes, rsiRes, dailyAggs] = await Promise.all([
        fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`),
        fetchMassive(`/v1/indicators/rsi/${symbol}`, { timespan: 'day', window: '14', limit: '1' }).catch(() => null),
        fetchMassive(`/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${to}`, { limit: '5000', adjust: 'true', sort: 'asc' }).catch(() => null)
    ]);

    const t = snapRes?.ticker;
    if (!t) return null;

    // Session detection (same as watchlist batch)
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

    // Price calculation (same as watchlist batch)
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

    const rsi = rsiRes?.results?.values?.[0]?.value ?? null;

    const dailyResults = (dailyAggs?.results || []).map((r: any) => ({ close: r.c, volume: r.v || 0 }));
    let return3d = 0;
    if (dailyResults.length >= 4) {
        const recentCandles = dailyResults.slice(-4);
        const price3dAgo = recentCandles[0].close;
        const currentClose = recentCandles[recentCandles.length - 1].close;
        return3d = ((currentClose - price3dAgo) / price3dAgo) * 100;
    }

    const sparkline = dailyResults.slice(-20).map((d: any) => d.close);

    return {
        symbol,
        price: latestPrice,
        change: isExtended ? (extChange || 0) : (regChange || 0),
        changePercent: isExtended ? (extChangePercent || 0) : (regChangePercent || 0),
        volume: t?.day?.v,
        prevClose,
        prevDayVolume: t?.prevDay?.v || 0,
        session,
        isExtended,
        extPrice: isExtended ? latestPrice : undefined,
        extChangePercent: isExtended ? extChangePercent : undefined,
        rsi,
        return3d,
        vwap: t?.day?.vw,
        history: sparkline.map((close: number) => ({ close })),
        dailyResults,
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

    if (tickers.length > 30) {
        return NextResponse.json({ error: 'Max 30 tickers per request' }, { status: 400 });
    }

    const mode = searchParams.get('mode') || 'full'; // 'full' | 'price'

    const startTime = Date.now();

    // Process all tickers in parallel
    const results = await Promise.all(tickers.map(async (ticker) => {
        try {
            // ── PRICE-ONLY MODE (fast, 5s interval) ──
            if (mode === 'price') {
                const stockData = await getStockDataLight(ticker).catch(() => null);
                if (!stockData) return { ticker, error: 'Stock data unavailable' };

                const dailyResults = stockData.dailyResults || [];
                const { getETNow } = await import('@/services/timezoneUtils');
                const et = getETNow();
                const etTime = et.hour + et.minute / 60;
                const isREG = !et.isWeekend && etTime >= 9.5 && etTime < 16;

                let changePct = stockData.changePercent || 0;
                if (!isREG && dailyResults.length >= 2) {
                    const lastBar = dailyResults[dailyResults.length - 1];
                    const prevBar = dailyResults[dailyResults.length - 2];
                    if (lastBar?.close && prevBar?.close) {
                        changePct = ((lastBar.close - prevBar.close) / prevBar.close) * 100;
                    }
                }

                return {
                    ticker,
                    realtime: {
                        price: stockData.price || 0,
                        change: stockData.change || 0,
                        changePct,
                        session: stockData.session || 'reg',
                        isExtended: stockData.isExtended,
                        sparkline: stockData.history?.slice(-20).map((h: any) => h.close) || [],
                    }
                };
            }

            // ── FULL MODE (alpha/signal/action, 30s interval) ──
            // Parallel fetch: lightweight stock data + options + structure
            const [stockData, optionsData, structureRes] = await Promise.all([
                getStockDataLight(ticker).catch(() => null),
                getOptionsData(ticker).catch(() => null),
                getStructureData(ticker).catch(() => null)
            ]);

            if (!stockData) {
                return { ticker, error: 'Stock data unavailable' };
            }

            // [V3.2] SESSION DATA RULE (same as watchlist)
            const sessionMap: Record<string, AlphaSession> = { pre: 'PRE', reg: 'REG', post: 'POST' };
            const alphaSession: AlphaSession = sessionMap[stockData.session] || 'CLOSED';
            const isREG = alphaSession === 'REG';
            const dailyResults = stockData.dailyResults || [];

            let changePct = stockData.changePercent || 0;
            if (!isREG && dailyResults.length >= 2) {
                const lastBar = dailyResults[dailyResults.length - 1];
                const prevBar = dailyResults[dailyResults.length - 2];
                if (lastBar?.close && prevBar?.close) {
                    changePct = ((lastBar.close - prevBar.close) / prevBar.close) * 100;
                }
            }

            // [V3.2] relVol: REG → real-time, NOT REG → last session
            let relVol: number | null = null;
            if (isREG) {
                const dayVol = stockData.volume || 0;
                const prevVol = stockData.prevDayVolume || 1;
                relVol = dayVol > 0 ? dayVol / prevVol : null;
            } else if (dailyResults.length >= 2) {
                const lastVol = dailyResults[dailyResults.length - 1]?.volume || 0;
                const prevVol = dailyResults[dailyResults.length - 2]?.volume || 1;
                relVol = lastVol > 0 ? lastVol / prevVol : null;
            }

            // [V3.2] return3D: NOT REG → last session close
            let return3D = stockData.return3d ?? null;
            if (!isREG && dailyResults.length >= 4) {
                const lastClose = dailyResults[dailyResults.length - 1]?.close;
                const close4dAgo = dailyResults[dailyResults.length - 4]?.close;
                if (lastClose && close4dAgo) {
                    return3D = ((lastClose - close4dAgo) / close4dAgo) * 100;
                }
            }

            const opts = optionsData as any;
            const alphaGex = structureRes?.netGex ?? opts?.gems?.gex ?? opts?.gex ?? null;
            const alphaPcr = opts?.putCallRatio ?? null;
            const alphaCallWall = structureRes?.callWall ?? opts?.callWall ?? null;
            const alphaPutFloor = structureRes?.putFloor ?? opts?.putFloor ?? null;
            const alphaGammaFlip = structureRes?.gammaFlipLevel ?? opts?.gems?.gammaFlipLevel ?? null;
            const alphaSqueezeScore = structureRes?.squeezeScore ?? null;

            // [V3.2] Call SAME Alpha Engine as Watchlist
            let alphaResult;
            try {
                alphaResult = calculateAlphaScore({
                    ticker: ticker.toUpperCase(),
                    session: alphaSession,
                    price: stockData.price || 0,
                    prevClose: stockData.prevClose || 0,
                    changePct,
                    vwap: stockData.vwap ?? null,
                    return3D,
                    rsi14: stockData.rsi ?? null,
                    pcr: alphaPcr,
                    gex: alphaGex,
                    callWall: alphaCallWall,
                    putFloor: alphaPutFloor,
                    gammaFlipLevel: alphaGammaFlip,
                    rawChain: opts?.rawChain || [],
                    squeezeScore: alphaSqueezeScore,
                    relVol,
                    optionsDataAvailable: !!opts,
                    preMarketChangePct: (stockData as any).extendedChangePct ?? null,
                });
            } catch (e) {
                console.error(`[Portfolio Batch] V3.2 Engine failed for ${ticker}:`, e);
                alphaResult = calculateAlphaScore({
                    ticker: ticker.toUpperCase(),
                    session: alphaSession,
                    price: stockData.price || 0,
                    prevClose: stockData.prevClose || 0,
                    changePct,
                    preMarketChangePct: (stockData as any).extendedChangePct ?? null,
                });
            }

            const { score, grade, action, triggerCodes: triggers, dataCompleteness: confidence } = alphaResult;

            // === OPTIONS INDICATORS ===
            const currentPrice = stockData.price || 0;
            const maxPain = structureRes?.maxPain ?? opts?.maxPain ?? null;
            const maxPainDist = (maxPain && currentPrice)
                ? Number(((maxPain - currentPrice) / currentPrice * 100).toFixed(2))
                : null;

            const rawGex = opts?.gems?.gex || opts?.gex;
            const gex = structureRes?.netGex ?? rawGex ?? null;
            const gexM = gex !== null ? Number((gex / 1000000).toFixed(2)) : null;
            const gammaFlipLevel = structureRes?.gammaFlipLevel ?? null;

            // === TRIPLE-A ===
            const tripleA = {
                direction: changePct > 0,
                acceleration: Math.abs(changePct) > 1,
                accumulation: gex !== null ? gex > 0 : false
            };

            return {
                ticker,
                alphaSnapshot: {
                    score,
                    grade,
                    action,
                    confidence: Math.round(confidence),
                    triggers,
                    engineVersion: alphaResult.engineVersion,
                    capturedAt: new Date().toISOString()
                },
                realtime: {
                    price: stockData.price || 0,
                    change: stockData.change || 0,
                    changePct,
                    session: stockData.session || 'reg',
                    extPrice: stockData.extPrice,
                    extChangePercent: stockData.extChangePercent,
                    isExtended: stockData.isExtended,
                    rvol: relVol || 1.0,
                    sparkline: stockData.history?.slice(-20).map((h: any) => h.close) || [],
                    threeDay: return3D || 0,
                    rsi: stockData.rsi || null,
                    maxPain,
                    maxPainDist,
                    gex,
                    gexM,
                    gammaFlipLevel,
                    pcr: opts?.putCallRatio || null,
                    tripleA
                }
            };
        } catch (error) {
            console.error(`Portfolio batch error for ${ticker}:`, error);
            return { ticker, error: 'Analysis failed' };
        }
    }));

    const elapsed = Date.now() - startTime;

    return NextResponse.json({
        results,
        meta: {
            count: tickers.length,
            elapsed,
            source: 'portfolio_batch_v3.2' // Now using same V3.2 engine as watchlist
        }
    });
}
