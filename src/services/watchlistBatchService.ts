// Watchlist Batch Analyze API - Optimized multi-ticker analysis
// Single request for multiple tickers to reduce HTTP overhead
// [V5] Uses Alpha Engine V5 (calculateAlphaScore) with FULL data enrichment
// [V5] Macro + Flow + Catalyst data = absolute alpha scores identical to reports

import { NextResponse } from 'next/server';
import { getOptionsData } from '@/services/stockApi';
import { calculateAlphaScore, calculateWhaleIndex, computeIVSkew, computeImpliedMovePct, type AlphaSession } from '@/services/alphaEngine';
import { getStructureData } from '@/services/structureService';
import { fetchMassive } from '@/services/massiveClient';
import { getAnalysisCacheForTickers, type AnalysisCacheEntry } from '@/services/analysisCache';
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
    };
}



// ============================================================================
// CORE BATCH PROCESSING LOGIC
// Exported separately so it can be called seamlessly during SSR (Server Components)
// without creating mock Request objects or failing on absolute URL resolution
// ============================================================================
export async function processWatchlistBatch(tickers: string[]) {
    const startTime = Date.now();

    if (!tickers || tickers.length === 0) return { results: [], meta: { count: 0, elapsed: 0, source: 'empty' } };

    // ═══ [CACHE WARMER] Cache-first fast path ═══
    // If all tickers have pre-warmed analysis in Redis, return cached analysis + live prices
    try {
        const cached = await getAnalysisCacheForTickers(tickers);
        const cachedCount = Object.keys(cached).length;

        if (cachedCount === tickers.length) {
            // Full cache hit — fetch only live prices from Polygon snapshot (1 call, ~200ms)
            const snapshotData = await fetchMassive(
                `/v2/snapshot/locale/us/markets/stocks/tickers`,
                { tickers: tickers.join(',') }
            ).catch(() => null);

            const snapshotMap: Record<string, any> = {};
            (snapshotData?.tickers || []).forEach((t: any) => {
                snapshotMap[t.ticker] = t;
            });

            // [UNIFIED] Use getMarketStatusSSOT — same as /api/live/quotes (SSOT for session)
            const { getMarketStatusSSOT } = await import('@/services/marketStatusProvider');
            const marketStatus = await getMarketStatusSSOT();
            const currentSession = marketStatus.session; // 'pre', 'regular', 'post', 'closed'

            const results = tickers.map(ticker => {
                const analysis = cached[ticker];
                const snap = snapshotMap[ticker];

                // ── Price calculation — IDENTICAL to /api/live/quotes ──
                const liveLast = snap?.lastTrade?.p || 0;
                const dayClose = snap?.day?.c || 0;
                const prevDayClose = snap?.prevDay?.c || 0;
                const prevClose = prevDayClose;
                const volume = snap?.day?.v || 0;
                const vwap = snap?.day?.vw || null;

                // ── changePct: previous regular session performance ──
                // REG: live todaysChangePerc
                // PRE/POST/CLOSED: sparkline-based (last 2 daily closes = yesterday vs day-before-yesterday)
                let changePct: number;
                if (currentSession === 'regular') {
                    const todaysChangePerc = snap?.todaysChangePerc || 0;
                    changePct = todaysChangePerc !== 0 ? todaysChangePerc
                        : ((liveLast > 0 && prevDayClose > 0) ? ((liveLast - prevDayClose) / prevDayClose) * 100 : 0);
                } else {
                    // Try sparkline first (always accurate for previous session change)
                    const sparkline = analysis.sparkline || [];
                    if (sparkline.length >= 2) {
                        const lastClose = sparkline[sparkline.length - 1];
                        const prevClose2 = sparkline[sparkline.length - 2];
                        changePct = (prevClose2 > 0 && lastClose > 0)
                            ? ((lastClose - prevClose2) / prevClose2) * 100 : 0;
                    } else {
                        // Fallback: dayClose vs prevDayClose
                        changePct = (dayClose > 0 && prevDayClose > 0 && dayClose !== prevDayClose)
                            ? ((dayClose - prevDayClose) / prevDayClose) * 100 : 0;
                    }
                }

                // ── Session-aware price & extended price ──
                // price = base reference (prevClose for PRE, dayClose for POST)
                // extendedPrice = current actual trade price (pre/post-market)
                let displayPrice = 0;
                let extendedPrice: number | null = null;
                let extendedLabel = '';

                if (currentSession === 'regular') {
                    displayPrice = liveLast || dayClose || prevClose;
                } else if (currentSession === 'pre') {
                    displayPrice = prevClose; // base = yesterday's close
                    const prePrice = snap?.min?.c || liveLast || 0;
                    if (prePrice > 0) {
                        extendedPrice = prePrice;
                        extendedLabel = 'PRE';
                    }
                } else if (currentSession === 'post') {
                    displayPrice = dayClose || prevClose; // base = today's close
                    const postPrice = snap?.min?.c || liveLast || 0;
                    if (postPrice > 0 && postPrice !== displayPrice) {
                        extendedPrice = postPrice;
                        extendedLabel = 'POST';
                    }
                } else {
                    // CLOSED
                    displayPrice = dayClose || prevClose;
                    if (snap?.afterHours?.p && snap.afterHours.p > 0) {
                        extendedPrice = snap.afterHours.p;
                        extendedLabel = 'POST';
                    }
                }

                const extendedChangePct = (extendedPrice && extendedPrice > 0 && displayPrice > 0)
                    ? ((extendedPrice - displayPrice) / displayPrice) * 100
                    : null;

                // Use displayPrice for maxPainDist calculation
                const refPrice = extendedPrice || displayPrice;

                return {
                    ticker,
                    alphaSnapshot: analysis.alphaSnapshot,
                    realtime: {
                        price: displayPrice,
                        changePct,
                        session: currentSession === 'regular' ? 'reg' : currentSession,
                        rsi: analysis.rsi,
                        return3d: analysis.return3d,
                        sparkline: analysis.sparkline,
                        maxPain: analysis.maxPain,
                        maxPainDist: (analysis.maxPain && refPrice)
                            ? Number(((analysis.maxPain - refPrice) / refPrice * 100).toFixed(2))
                            : null,
                        gex: analysis.gex,
                        gexM: analysis.gexM,
                        pcr: analysis.pcr,
                        whaleIndex: analysis.whaleIndex,
                        whaleConfidence: analysis.whaleConfidence,
                        gammaFlipLevel: analysis.gammaFlipLevel,
                        iv: analysis.iv,
                        vwap,
                        vwapDist: (vwap && refPrice)
                            ? Number(((refPrice - vwap) / vwap * 100).toFixed(2))
                            : null,
                        callWall: analysis.callWall,
                        putFloor: analysis.putFloor,
                        netPremium: analysis.netPremium,
                        volume,
                        relVol: analysis.relVol ?? 0,
                        extendedPrice: (extendedPrice && extendedPrice > 0 && extendedPrice !== displayPrice) ? extendedPrice : null,
                        extendedChangePct,
                        extendedLabel: extendedLabel || undefined,
                    }
                };
            });

            const elapsed = Date.now() - startTime;
            return {
                results,
                meta: {
                    count: tickers.length,
                    elapsed,
                    source: 'analysis_cache',
                    cached: true,
                }
            };
        }
    } catch (e) {
        // Cache check failed — fall through to full computation
        console.warn('[Watchlist Batch] Cache check failed, using fallback:', e);
    }

    // ═══ [V5] Fetch macro data ONCE for all tickers (shared) ═══
    let macroData: any = null;
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
    } catch (e) {
        console.warn('[Watchlist Batch] Macro fetch failed, using defaults:', e);
    }

    // ═══ [V8.3] Fear & Greed from Redis (written by market-feed cron) ═══
    let fearGreedScore: number | null = null;
    try {
        const fgData = await getFromCache<{ score: number; rating: string }>('cnn:feargreed');
        fearGreedScore = fgData?.score ?? null;
    } catch { /* ignore */ }

    // ═══ Fallback: Full computation with COMPLETE data ═══
    // Process all tickers in parallel
    const results = await Promise.all(tickers.map(async (ticker) => {
        try {
            // [V5] Full data pipeline — identical to dashboard/unified
            const [stockData, optionsData, structureRes, tradeData, shortVolData] = await Promise.all([
                getStockDataLight(ticker).catch(() => null),
                getOptionsData(ticker).catch(() => null),
                getStructureData(ticker).catch(() => null),
                fetchTradeData(ticker).catch(() => null),     // [V5] Dark Pool + Block Trades
                fetchShortVolumeData(ticker).catch(() => null) // [V5] Short Volume
            ]);

            if (!stockData) {
                return { ticker, error: 'Stock data unavailable' };
            }

            // [V3.2] SESSION DATA RULE:
            // REG → 실시간 데이터, NOT REG → 직전 정규장 데이터
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

            // [V3.2] relVol: REG → 실시간 거래량/전일, NOT REG → 직전장/전전장
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

            // [V3.2] return3D: NOT REG → 직전장 종가 기준
            let return3D = stockData.return3d ?? null;
            if (!isREG && dailyResults.length >= 4) {
                const lastClose = dailyResults[dailyResults.length - 1]?.close;
                const close4dAgo = dailyResults[dailyResults.length - 4]?.close;
                if (lastClose && close4dAgo) {
                    return3D = ((lastClose - close4dAgo) / close4dAgo) * 100;
                }
            }

            // [V5] SMA20 from daily aggs (same as dashboard/unified fetchTechnicalIndicators)
            let sma20: number | null = null;
            const dailyCloses = dailyResults.map((d: any) => d.close).filter(Boolean);
            if (dailyCloses.length >= 20) {
                const last20 = dailyCloses.slice(-20);
                sma20 = parseFloat((last20.reduce((a: number, b: number) => a + b, 0) / 20).toFixed(2));
            }

            const opts = optionsData as any;
            const alphaGex = structureRes?.netGex ?? opts?.gems?.gex ?? opts?.gex ?? null;
            const alphaPcr = opts?.putCallRatio ?? null;
            const alphaCallWall = structureRes?.callWall ?? opts?.callWall ?? null;
            const alphaPutFloor = structureRes?.putFloor ?? opts?.putFloor ?? null;
            const alphaGammaFlip = structureRes?.gammaFlipLevel ?? opts?.gems?.gammaFlipLevel ?? null;
            let alphaSqueezeScore = structureRes?.squeezeScore ?? null;
            // [V5 FIX] squeezeScore fallback from GEX + PCR when structureRes unavailable
            if (alphaSqueezeScore === null && alphaGex !== null) {
                let sq = 25; // base
                const absGex = Math.abs(alphaGex);
                if (alphaGex < 0) sq += 15; // negative GEX = squeeze-prone
                if (absGex > 50_000_000) sq += 15;
                else if (absGex > 10_000_000) sq += 10;
                else if (absGex > 1_000_000) sq += 5;
                const pcr = alphaPcr ?? 1;
                if (pcr <= 0.4 || pcr >= 1.8) sq += 10;
                else if (pcr <= 0.6 || pcr >= 1.5) sq += 5;
                alphaSqueezeScore = Math.min(100, Math.max(0, sq));
            }

            // [V5 FIX] rawContracts (not rawChain!) — oiHeat + IV calculations
            const rawContracts = opts?.rawContracts || [];
            const currentPrice = stockData.price || 0;
            const ivSkew = computeIVSkew(rawContracts, currentPrice);

            // [V5 FIX] Extract callWall/putFloor from rawContracts directly
            // structureRes may be null — ensure walls are always available
            let maxCallOI = 0, maxPutOI = 0;
            let directCallWall = 0, directPutFloor = 0;
            for (const c of rawContracts) {
                const oi = c.open_interest || 0;
                const strike = c.strike_price || 0;
                if (c.contract_type === 'call' && oi > maxCallOI) { maxCallOI = oi; directCallWall = strike; }
                if (c.contract_type === 'put' && oi > maxPutOI) { maxPutOI = oi; directPutFloor = strike; }
            }

            // [V5 FIX] impliedMovePct from wall spread (no dependency on last_trade.price)
            let impliedMovePct: number | null = null;
            if (directCallWall > 0 && directPutFloor > 0 && currentPrice > 0) {
                impliedMovePct = ((directCallWall - directPutFloor) / currentPrice) * 100;
            } else {
                impliedMovePct = computeImpliedMovePct(rawContracts, currentPrice);
            }

            // [V5] Whale Index from GEX (same as dashboard/unified)
            const whaleIndex = calculateWhaleIndex(alphaGex);

            // [V5] Flow data from realtimeMetrics
            const darkPoolPct = tradeData?.darkPoolPercent ?? null;
            const shortVolPct = shortVolData?.shortVolPercent ?? null;
            const blockTradesCount = tradeData?.blockTrades ?? null;
            const netPremium = structureRes?.netPremium ?? null;

            // Call V5 Engine with FULL data
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
                    // [V5] Pre-Market Validation
                    preMarketChangePct: (stockData as any).extendedChangePct ?? null,
                    // [V5] Macro Regime — shared across all tickers
                    ndxChangePct: macroData?.ndxChangePct ?? null,
                    vixValue: macroData?.vixValue ?? null,
                    vixChangePct: macroData?.vixChangePct ?? null,
                    tltChangePct: macroData?.tltChangePct ?? null,
                    gldChangePct: macroData?.gldChangePct ?? null,
                    dxy: macroData?.dxy ?? null,
                    realYieldStance: macroData?.realYieldStance ?? null,
                    // [V5] Flow data — identical to dashboard/unified
                    darkPoolPct,
                    shortVolPct,
                    blockTrades: blockTradesCount,
                    whaleIndex,
                    netFlow: netPremium,
                    // [V5] Momentum SMA20
                    sma20,
                    // [V5] Catalyst data
                    ivSkew,
                    impliedMovePct,
                    atmIv: structureRes?.atmIv ?? null,
                    // [V8.3] Fear & Greed
                    fearGreedScore,
                });
            } catch (e) {
                console.error(`[Watchlist Batch] V5 Engine failed for ${ticker}:`, e);
                alphaResult = calculateAlphaScore({
                    ticker: ticker.toUpperCase(),
                    session: alphaSession,
                    price: currentPrice,
                    prevClose: stockData.prevClose || 0,
                    changePct,
                    preMarketChangePct: (stockData as any).extendedChangePct ?? null,
                    ndxChangePct: macroData?.ndxChangePct ?? null,
                    vixValue: macroData?.vixValue ?? null,
                    tltChangePct: macroData?.tltChangePct ?? null,
                    gldChangePct: macroData?.gldChangePct ?? null,
                });
            }

            const { score, grade, action, actionKR, whyKR, triggerCodes: triggers, dataCompleteness: confidence } = alphaResult;

            // === OPTIONS INDICATORS ===
            const hasOptionsData = opts && (opts?.maxPain || opts?.gems?.gex || opts?.gex);
            const maxPain = hasOptionsData ? (opts?.maxPain || null) : null;
            const maxPainDist = (maxPain && currentPrice)
                ? Number(((maxPain - currentPrice) / currentPrice * 100).toFixed(2))
                : null;

            const rawGex = opts?.gems?.gex || opts?.gex;
            const gex = hasOptionsData ? (rawGex || null) : null;
            const gexM = gex !== null ? Number((gex / 1000000).toFixed(2)) : null;

            // === WHALE INDEX (uses V5 calculateWhaleIndex above) ===
            let whaleConfidence: 'HIGH' | 'MED' | 'LOW' | 'NONE' = 'NONE';
            const pcr = opts?.putCallRatio || 1;

            if (gex !== null && gex !== undefined) {
                if (gex > 0 && pcr < 0.8) whaleConfidence = 'HIGH';
                else if (gex > 0 && pcr <= 1.2) whaleConfidence = 'MED';
                else whaleConfidence = 'LOW';
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
                        : null,
                    // [FIX] Include callWall/putFloor for M7/PhysicalAI Session Grid
                    callWall: structureRes?.levels?.callWall ?? null,
                    putFloor: structureRes?.levels?.putFloor ?? null,
                    // [RANKING] Net premium flow for Money Flow ranking
                    netPremium: structureRes?.netPremium ?? null,
                    // [FIX] Volume + RelVol for snapshot pipeline
                    volume: stockData.volume || 0,
                    relVol: relVol ?? 0
                }
            };
        } catch (error) {
            console.error(`Batch analyze error for ${ticker}:`, error);
            return { ticker, error: 'Analysis failed' };
        }
    }));

    const elapsed = Date.now() - startTime;

    return {
        results,
        meta: {
            count: tickers.length,
            elapsed,
            source: 'watchlist_batch_light' // [PERF] Mark as optimized version
        }
    };
}


