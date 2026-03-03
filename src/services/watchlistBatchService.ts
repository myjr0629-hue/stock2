// Watchlist Batch Analyze API - Optimized multi-ticker analysis
// Single request for multiple tickers to reduce HTTP overhead
// [V5] Uses Alpha Engine V5 (calculateAlphaScore) with FULL data enrichment
// [V5] Macro + Flow + Catalyst data = absolute alpha scores identical to reports

import { NextResponse } from 'next/server';
import { getOptionsData } from '@/services/stockApi';
import { calculateAlphaScore, calculateWhaleIndex, computeIVSkew, computeImpliedMovePct, type AlphaSession } from '@/services/alphaEngine';
import { getStructureData } from '@/services/structureService';
import { fetchMassive } from '@/services/massiveClient';
import { getAnalysisCacheForTickers, type AnalysisCacheEntry, writeAnalysisCache } from '@/services/analysisCache';
import { getMacroSnapshotSSOT } from '@/services/macroHubProvider';
import { fetchTradeData, fetchShortVolumeData } from '@/services/realtimeMetricsService';
import { getFromCache } from '@/services/redisClient';

// [S-76] Edge cache for 30 seconds - faster repeat loads
export const revalidate = 30;

// [PERF] Lightweight stock data fetcher - skips chart data entirely
// Same data sources as getStockData(), minus getStockChartData() (which downloads 1000+ minute bars)
// All prices, RSI, 3D return, VWAP are identical to getStockData()
async function getStockDataLight(symbol: string) {
    const to = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]; // 30 days for SMA20

    // [PERF] All 4 calls in parallel (getStockData does snapshot+chart+RSI parallel, then 3D return SEQUENTIAL)
    const [snapRes, rsiRes, dailyAggs, macdRes] = await Promise.all([
        // 1. Snapshot: price, change, volume, VWAP, prevClose (same as getStockData)
        fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`),
        // 2. RSI: same API as getTechnicalRSI()
        fetchMassive(`/v1/indicators/rsi/${symbol}`, { timespan: 'day', window: '14', limit: '1' }).catch(() => null),
        // 3. Daily aggregates: for 3D return + sparkline (same as getAggregates in getStockData)
        fetchMassive(`/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${to}`, { limit: '5000', adjust: 'true', sort: 'asc' }).catch(() => null),
        // 4. [V5.5+] MACD: for trend crossover detection in Momentum pillar
        fetchMassive(`/v1/indicators/macd/${symbol}`, { timespan: 'day', short_window: '12', long_window: '26', signal_window: '9', limit: '1' }).catch(() => null)
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
    const dailyResults = (dailyAggs?.results || []).map((r: any) => ({ close: r.c, volume: r.v || 0 }));
    let return3d = 0;
    if (dailyResults.length >= 4) {
        const recentCandles = dailyResults.slice(-4);
        const price3dAgo = recentCandles[0].close;
        const currentClose = recentCandles[recentCandles.length - 1].close;
        return3d = ((currentClose - price3dAgo) / price3dAgo) * 100;
    }

    // Sparkline: last 20 daily closes (shows ~1 month trend at watchlist scale)
    const sparkline = dailyResults.slice(-20).map((d: any) => d.close);

    // [V5] PM extended change calculation for PM Gate 11
    // PRE session: PM price vs previous regular close (prevClose)
    // POST session: PM price vs today's close
    let extendedChangePct: number | null = null;
    if (session === 'pre' && prevClose > 0) {
        extendedChangePct = ((latestPrice - prevClose) / prevClose) * 100;
    } else if (session === 'post' && todayClose > 0) {
        extendedChangePct = ((latestPrice - todayClose) / todayClose) * 100;
    }

    return {
        symbol,
        price: latestPrice,
        change: isExtended ? (extChange || 0) : (regChange || 0),
        changePercent: isExtended ? (extChangePercent || 0) : (regChangePercent || 0),
        volume: t?.day?.v,
        prevClose,
        prevDayVolume: t?.prevDay?.v || 0, // [V3.2] For relVol calculation
        session,
        rsi,
        return3d,
        vwap: t?.day?.vw,
        history: sparkline.map((close: number) => ({ close })), // Compatible format
        dailyResults, // [V3.2] For session-aware changePct/relVol
        extendedChangePct, // [V5] For PM Gate 11 (preMarketChangePct)
        // [V5.5+] MACD histogram for trend crossover
        macdHistogram: macdRes?.results?.values?.[0]?.histogram ?? null,
    };
}



// ============================================================================
// CORE BATCH PROCESSING LOGIC
// Exported separately so it can be called seamlessly during SSR (Server Components)
// without creating mock Request objects or failing on absolute URL resolution
// ============================================================================
export async function processWatchlistBatch(tickers: string[], mode: 'full' | 'price' | 'ssr' = 'full') {
    const startTime = Date.now();
    if (!tickers || tickers.length === 0) return { results: [], meta: { count: 0, elapsed: 0, source: 'empty' } };

    // 1. Fetch Cache for all requested tickers (Non-blocking fallback to empty if Redis fails)
    const cached = await getAnalysisCacheForTickers(tickers).catch(() => ({} as Record<string, any>));
    const missingTickers = tickers.filter(t => !cached[t]);

    // 2. Fetch Snapshot for ALL tickers (we need live prices for Cached ones AND Missing ones in 'ssr'/'price' mode)
    // In 'full' mode, getStockDataLight also fetches snapshots, but we need it here for the cached ones anyway.
    const snapshotData = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers`, { tickers: tickers.join(',') }).catch(() => null);
    const snapshotMap: Record<string, any> = {};
    (snapshotData?.tickers || []).forEach((t: any) => { snapshotMap[t.ticker] = t; });

    const { getMarketStatusSSOT } = await import('@/services/marketStatusProvider');
    const marketStatus = await getMarketStatusSSOT();
    const currentSession = marketStatus.session; // 'pre', 'regular', 'post', 'closed'

    let macroData: any = null;
    let fearGreedScore: number | null = null;

    // Optional: Fetch Macro & F&G only if we need to do full compute
    if (missingTickers.length > 0 && mode === 'full') {
        try {
            const macro = await getMacroSnapshotSSOT();
            macroData = {
                ndxChangePct: macro.nqChangePercent ?? null,
                vixValue: macro.vix ?? null,
                vixChangePct: macro.factors?.vix?.chgPct ?? null,
                tltChangePct: macro.tltChangePct ?? null,
                gldChangePct: macro.gldChangePct ?? null,
                dxy: macro.dxy ?? null,
                realYieldStance: macro.realYield?.stance ?? null,
            };
        } catch (e) { console.warn('[Watchlist Batch] Macro fetch failed:', e); }

        try {
            const fgData = await getFromCache<{ score: number; rating: string }>('cnn:feargreed');
            fearGreedScore = fgData?.score ?? null;
        } catch { /* ignore */ }

        // [V5.5+] Read VIX3M from Redis for term structure analysis
        try {
            const vix3mData = await getFromCache<{ price: number; changePct: number }>('yahoo:vix3m');
            if (vix3mData?.price) {
                if (macroData) macroData.vix3mValue = vix3mData.price;
            }
        } catch { /* ignore */ }
    }

    const results = await Promise.all(tickers.map(async (ticker) => {
        const analysis = cached[ticker];
        const snap = snapshotMap[ticker];

        // --- Helper to build Base Price Object from Snapshot ---
        const buildBasePrice = () => {
            if (!snap) return { displayPrice: 0, changePct: 0, extendedPrice: null, extendedLabel: undefined, vwap: null, volume: 0, prevDayClose: 0 };

            const liveLast = snap.lastTrade?.p || 0;
            const dayClose = snap.day?.c || 0;
            const prevDayClose = snap.prevDay?.c || 0;
            const volume = snap.day?.v || 0;
            const vwap = snap.day?.vw || null;

            let displayPrice = 0;
            if (currentSession === 'regular') displayPrice = liveLast || dayClose || prevDayClose;
            else if (currentSession === 'pre') displayPrice = prevDayClose;
            else displayPrice = dayClose || prevDayClose;

            let changePct = snap.todaysChangePerc || 0;
            if (currentSession !== 'regular') {
                // For cached items, we'll try to override this with sparkline later, but this is the snapshot fallback
                if (dayClose > 0 && prevDayClose > 0) {
                    changePct = ((dayClose - prevDayClose) / prevDayClose) * 100;
                }
            }

            let extendedPrice: number | null = null;
            let extendedLabel = undefined;
            if (currentSession === 'pre') {
                const prePrice = snap.min?.c || liveLast;
                if (prePrice > 0) { extendedPrice = prePrice; extendedLabel = 'PRE'; }
            } else if (currentSession === 'post' || currentSession === 'closed') {
                const postPrice = snap.afterHours?.p || snap.min?.c || liveLast;
                if (postPrice > 0) { extendedPrice = postPrice; extendedLabel = 'POST'; }
            }

            return { displayPrice, changePct, extendedPrice, extendedLabel, vwap, volume, prevDayClose };
        };

        // ============================================
        // A. CACHE HIT: FAST RETURN (Instant)
        // ============================================
        if (analysis) {
            const base = buildBasePrice();

            // [FIX] Live dark pool enrichment when cache has stale 0 value
            let liveDarkPoolPct = analysis.darkPoolPct ?? 0;
            if (liveDarkPoolPct === 0) {
                try {
                    const tradeData = await fetchTradeData(ticker);
                    if (tradeData && tradeData.darkPoolPercent > 0) {
                        liveDarkPoolPct = tradeData.darkPoolPercent;
                    }
                } catch { /* silent */ }
            }

            // Override changePct with sparkline if NOT in regular session
            let finalChangePct = base.changePct;
            if (currentSession !== 'regular' && analysis.sparkline && analysis.sparkline.length >= 2) {
                const lastClose = analysis.sparkline[analysis.sparkline.length - 1];
                const prevClose2 = analysis.sparkline[analysis.sparkline.length - 2];
                if (prevClose2 > 0 && lastClose > 0) {
                    finalChangePct = ((lastClose - prevClose2) / prevClose2) * 100;
                }
            } else if (currentSession === 'regular') {
                // If liveLast exists and we have prevDayClose
                const liveLast = snap?.lastTrade?.p || 0;
                if (base.changePct === 0 && liveLast > 0 && base.prevDayClose > 0) {
                    finalChangePct = ((liveLast - base.prevDayClose) / base.prevDayClose) * 100;
                }
            }

            const extendedChangePct = (base.extendedPrice && base.extendedPrice > 0 && base.displayPrice > 0)
                ? ((base.extendedPrice - base.displayPrice) / base.displayPrice) * 100
                : null;

            const refPrice = base.extendedPrice || base.displayPrice;

            return {
                ticker,
                alphaSnapshot: analysis.alphaSnapshot,
                realtime: {
                    price: base.displayPrice,
                    changePct: finalChangePct,
                    session: currentSession === 'regular' ? 'reg' : currentSession,
                    rsi: analysis.rsi,
                    return3d: analysis.return3d,
                    sparkline: analysis.sparkline,
                    maxPain: analysis.maxPain,
                    maxPainDist: (analysis.maxPain && refPrice) ? Number(((analysis.maxPain - refPrice) / refPrice * 100).toFixed(2)) : null,
                    gex: analysis.gex,
                    gexM: analysis.gexM,
                    pcr: analysis.pcr,
                    whaleIndex: analysis.whaleIndex,
                    whaleConfidence: analysis.whaleConfidence,
                    darkPoolPct: liveDarkPoolPct,
                    squeezeScore: analysis.squeezeScore,
                    ivSkew: analysis.ivSkew ?? null,
                    impliedMovePct: analysis.impliedMovePct ?? null,
                    gammaFlipLevel: analysis.gammaFlipLevel,
                    iv: analysis.iv,
                    vwap: base.vwap,
                    vwapDist: (base.vwap && refPrice) ? Number(((refPrice - base.vwap) / base.vwap * 100).toFixed(2)) : null,
                    callWall: analysis.callWall,
                    putFloor: analysis.putFloor,
                    netPremium: analysis.netPremium,
                    volume: base.volume,
                    relVol: analysis.relVol ?? 0,
                    extendedPrice: (base.extendedPrice && base.extendedPrice > 0 && base.extendedPrice !== base.displayPrice) ? base.extendedPrice : null,
                    extendedChangePct,
                    extendedLabel: base.extendedLabel,
                }
            };
        }

        // ============================================
        // B. CACHE MISS & FAST MODE (PRICE | SSR)
        // ============================================
        if (mode === 'price' || mode === 'ssr') {
            const base = buildBasePrice();
            const extendedChangePct = (base.extendedPrice && base.extendedPrice > 0 && base.displayPrice > 0)
                ? ((base.extendedPrice - base.displayPrice) / base.displayPrice) * 100 : null;

            return {
                ticker,
                realtime: {
                    price: base.displayPrice,
                    changePct: base.changePct,
                    session: currentSession === 'regular' ? 'reg' : currentSession,
                    extendedPrice: base.extendedPrice || null,
                    extendedChangePct,
                    extendedLabel: base.extendedLabel,
                    volume: base.volume,
                    vwap: base.vwap
                }
            };
        }

        // ============================================
        // C. CACHE MISS & FULL MODE (HEAVY COMPUTE)
        // ============================================
        try {
            const [stockData, optionsData, structureRes, tradeData, shortVolData] = await Promise.all([
                getStockDataLight(ticker).catch(() => null),
                getOptionsData(ticker).catch(() => null),
                getStructureData(ticker).catch(() => null),
                fetchTradeData(ticker).catch(() => null),
                fetchShortVolumeData(ticker).catch(() => null)
            ]);

            if (!stockData) return { ticker, error: 'Stock data unavailable' };

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

            let return3D = stockData.return3d ?? null;
            if (!isREG && dailyResults.length >= 4) {
                const lastClose = dailyResults[dailyResults.length - 1]?.close;
                const close4dAgo = dailyResults[dailyResults.length - 4]?.close;
                if (lastClose && close4dAgo) {
                    return3D = ((lastClose - close4dAgo) / close4dAgo) * 100;
                }
            }

            let sma20: number | null = null;
            const dailyCloses = dailyResults.map((d: any) => d.close).filter(Boolean);
            if (dailyCloses.length >= 20) {
                const last20 = dailyCloses.slice(-20);
                sma20 = parseFloat((last20.reduce((a: number, b: number) => a + b, 0) / 20).toFixed(2));
            }

            const opts = optionsData as any;
            const alphaGex = structureRes?.netGex ?? opts?.gems?.gex ?? opts?.gex ?? null;
            const alphaPcr = opts?.putCallRatio ?? null;
            const alphaGammaFlip = structureRes?.gammaFlipLevel ?? opts?.gems?.gammaFlipLevel ?? null;

            let alphaSqueezeScore = structureRes?.squeezeScore ?? null;
            if (alphaSqueezeScore === null && alphaGex !== null) {
                let sq = 25;
                const absGex = Math.abs(alphaGex);
                if (alphaGex < 0) sq += 15;
                if (absGex > 50_000_000) sq += 15;
                else if (absGex > 10_000_000) sq += 10;
                else if (absGex > 1_000_000) sq += 5;
                const pcr = alphaPcr ?? 1;
                if (pcr <= 0.4 || pcr >= 1.8) sq += 10;
                else if (pcr <= 0.6 || pcr >= 1.5) sq += 5;
                alphaSqueezeScore = Math.min(100, Math.max(0, sq));
            }

            const rawContracts = opts?.rawContracts || [];
            const currentPrice = stockData.price || 0;
            const ivSkew = computeIVSkew(rawContracts, currentPrice);

            let maxCallOI = 0, maxPutOI = 0;
            let directCallWall = 0, directPutFloor = 0;
            for (const c of rawContracts) {
                const oi = c.open_interest || 0;
                const strike = c.strike_price || 0;
                if (c.contract_type === 'call' && oi > maxCallOI) { maxCallOI = oi; directCallWall = strike; }
                if (c.contract_type === 'put' && oi > maxPutOI) { maxPutOI = oi; directPutFloor = strike; }
            }

            let impliedMovePct = null;
            if (directCallWall > 0 && directPutFloor > 0 && currentPrice > 0) {
                impliedMovePct = ((directCallWall - directPutFloor) / currentPrice) * 100;
            } else {
                impliedMovePct = computeImpliedMovePct(rawContracts, currentPrice);
            }

            const whaleIndex = calculateWhaleIndex(alphaGex);
            const darkPoolPct = tradeData?.darkPoolPercent ?? null;
            const shortVolPct = shortVolData?.shortVolPercent ?? null;
            const blockTradesCount = tradeData?.blockTrades ?? null;
            const netPremium = structureRes?.netPremium ?? null;

            let alphaResult;
            try {
                alphaResult = calculateAlphaScore({
                    ticker: ticker.toUpperCase(),
                    session: alphaSession,
                    price: currentPrice,
                    prevClose: stockData.prevClose || 0,
                    changePct,
                    vwap: stockData.vwap ?? null,
                    return3D,
                    rsi14: stockData.rsi ?? null,
                    pcr: alphaPcr,
                    gex: alphaGex,
                    rawChain: rawContracts,
                    callWall: directCallWall || structureRes?.callWall || null,
                    putFloor: directPutFloor || structureRes?.putFloor || null,
                    gammaFlipLevel: alphaGammaFlip,
                    squeezeScore: alphaSqueezeScore,
                    relVol,
                    optionsDataAvailable: !!opts,
                    preMarketChangePct: (stockData as any).extendedChangePct ?? null,
                    ndxChangePct: macroData?.ndxChangePct ?? null,
                    vixValue: macroData?.vixValue ?? null,
                    vixChangePct: macroData?.vixChangePct ?? null,
                    tltChangePct: macroData?.tltChangePct ?? null,
                    gldChangePct: macroData?.gldChangePct ?? null,
                    dxy: macroData?.dxy ?? null,
                    realYieldStance: macroData?.realYieldStance ?? null,
                    darkPoolPct, shortVolPct, blockTrades: blockTradesCount,
                    whaleIndex, netFlow: netPremium, sma20, ivSkew, impliedMovePct,
                    atmIv: structureRes?.atmIv ?? null, fearGreedScore,
                    // [V5.5+] MACD + VIX Term Structure
                    macdHistogram: (stockData as any).macdHistogram ?? null,
                    vix3mValue: macroData?.vix3mValue ?? null,
                });
            } catch (e) {
                console.error(`[Watchlist Batch] V5 Engine failed for ${ticker}:`, e);
                alphaResult = calculateAlphaScore({
                    ticker: ticker.toUpperCase(), session: alphaSession, price: currentPrice,
                    prevClose: stockData.prevClose || 0, changePct,
                    preMarketChangePct: (stockData as any).extendedChangePct ?? null,
                    ndxChangePct: macroData?.ndxChangePct ?? null, vixValue: macroData?.vixValue ?? null,
                    tltChangePct: macroData?.tltChangePct ?? null, gldChangePct: macroData?.gldChangePct ?? null,
                });
            }

            const { score, grade, action, actionKR, whyKR, triggerCodes: triggers, dataCompleteness: confidence } = alphaResult;

            const hasOptionsData = opts && (opts?.maxPain || opts?.gems?.gex || opts?.gex);
            const maxPain = hasOptionsData ? (opts?.maxPain || null) : null;
            const rawGex = opts?.gems?.gex || opts?.gex;
            const gex = hasOptionsData ? (rawGex || null) : null;

            let whaleConfidence: 'HIGH' | 'MED' | 'LOW' | 'NONE' = 'NONE';
            const pcr = opts?.putCallRatio || 1;
            if (gex !== null && gex !== undefined) {
                if (gex > 0 && pcr < 0.8) whaleConfidence = 'HIGH';
                else if (gex > 0 && pcr <= 1.2) whaleConfidence = 'MED';
                else whaleConfidence = 'LOW';
            }

            const gammaFlipLevel = structureRes?.gammaFlipLevel ?? null;
            const structureGexM = structureRes?.netGex ? Number((structureRes.netGex / 1000000).toFixed(2)) : null;
            const structureMaxPain = structureRes?.maxPain ?? null;
            const iv = structureRes?.atmIv ?? opts?.gems?.iv ?? opts?.iv ?? null;

            const finalMaxPain = structureMaxPain ?? maxPain;
            const finalMaxPainDist = (finalMaxPain && currentPrice) ? Number(((finalMaxPain - currentPrice) / currentPrice * 100).toFixed(2)) : null;

            const fullObj = {
                ticker,
                alphaSnapshot: {
                    score, grade, action, actionKR, whyKR, confidence: Math.round(confidence),
                    triggers, pillars: alphaResult.pillars, gatesApplied: alphaResult.gatesApplied,
                    engineVersion: alphaResult.engineVersion, capturedAt: new Date().toISOString()
                },
                realtime: {
                    price: stockData.price || 0, changePct, session: stockData.session || 'reg',
                    rsi: stockData.rsi || null, return3d: stockData.return3d || null,
                    sparkline: stockData.history?.slice(-20).map((h: any) => h.close) || [],
                    maxPain: finalMaxPain, maxPainDist: finalMaxPainDist,
                    gex: structureRes?.netGex ?? null, gexM: structureGexM,
                    pcr: opts?.putCallRatio || null, whaleIndex: Math.round(whaleIndex),
                    whaleConfidence, gammaFlipLevel, iv, vwap: stockData.vwap || null,
                    vwapDist: (stockData.vwap && stockData.price) ? Number(((stockData.price - stockData.vwap) / stockData.vwap * 100).toFixed(2)) : null,
                    callWall: structureRes?.levels?.callWall ?? null, putFloor: structureRes?.levels?.putFloor ?? null,
                    netPremium: structureRes?.netPremium ?? null, volume: stockData.volume || 0,
                    relVol: relVol ?? 0,
                    extendedPrice: (stockData as any).extendedPrice || null,
                    extendedChangePct: (stockData as any).extendedChangePct || null,
                    extendedLabel: (stockData as any).extendedLabel || undefined,
                    ivSkew: typeof ivSkew === 'number' ? ivSkew : (typeof ivSkew === 'object' && ivSkew !== null ? (ivSkew as any).value ?? null : null),
                    impliedMovePct: impliedMovePct ?? null,
                }
            };

            // 🔥 [GLOBAL CACHE WARMMER] Instantly write ANY custom ticker to Cache for future Zero-Latency SSR
            writeAnalysisCache(ticker, {
                ticker,
                timestamp: Date.now(),
                alphaSnapshot: fullObj.alphaSnapshot,
                rsi: fullObj.realtime.rsi,
                return3d: fullObj.realtime.return3d,
                sparkline: fullObj.realtime.sparkline,
                relVol: fullObj.realtime.relVol,
                maxPain: fullObj.realtime.maxPain,
                gex: fullObj.realtime.gex,
                gexM: fullObj.realtime.gexM,
                pcr: fullObj.realtime.pcr,
                callWall: fullObj.realtime.callWall,
                putFloor: fullObj.realtime.putFloor,
                gammaFlipLevel: fullObj.realtime.gammaFlipLevel,
                squeezeScore: alphaSqueezeScore,
                iv: fullObj.realtime.iv,
                whaleIndex: fullObj.realtime.whaleIndex,
                whaleConfidence: fullObj.realtime.whaleConfidence,
                netPremium: fullObj.realtime.netPremium,
                vwapDist: fullObj.realtime.vwapDist,
                volume: fullObj.realtime.volume,
                darkPoolPct: darkPoolPct ?? 0,
                ivSkew: typeof ivSkew === 'number' ? ivSkew : (typeof ivSkew === 'object' && ivSkew !== null ? (ivSkew as any).value ?? null : null),
                impliedMovePct: impliedMovePct ?? null
            }).catch(e => console.error(`Failed to write analysis cache for ${ticker}`, e));

            return fullObj;

        } catch (error) {
            console.error(`Batch analyze error for ${ticker}:`, error);
            return { ticker, error: 'Analysis failed' };
        }
    }));

    return {
        results,
        meta: {
            count: tickers.length,
            elapsed: Date.now() - startTime,
            source: mode === 'full' ? (missingTickers.length === 0 ? 'analysis_cache' : 'hybrid_compute') : 'polygon_snapshot_fast',
            cached: missingTickers.length === 0
        }
    };
}
