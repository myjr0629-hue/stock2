// Portfolio Batch API - Optimized multi-ticker analysis
// Single request for multiple tickers to reduce HTTP overhead
// [V3.2] Uses Alpha Engine V3 (calculateAlphaScore) - SAME engine as Watchlist
// [PERF] Uses lightweight stock data (no chart/minute data) for faster response


import { getOptionsData } from '@/services/stockApi';
import { calculateAlphaScore, calculateWhaleIndex, type AlphaSession } from '@/services/alphaEngine';
import { getStructureData } from '@/services/structureService';
import { fetchMassive } from '@/services/massiveClient';
import { getAnalysisCacheForTickers, type AnalysisCacheEntry, writeAnalysisCache } from '@/services/analysisCache';
import { recordAlphaDaily } from '@/lib/aws/historyMiddleware';

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



// ============================================================================
// CORE BATCH PROCESSING LOGIC
// Exported separately so it can be called seamlessly during SSR (Server Components)
// without creating mock Request objects or failing on absolute URL resolution
// ============================================================================
export async function processPortfolioBatch(tickers: string[], mode: 'full' | 'price' | 'ssr' = 'full') {
    const startTime = Date.now();
    if (!tickers || tickers.length === 0) return { results: [], meta: { count: 0, elapsed: 0, source: 'empty' } };

    // 1. Fetch Cache for all requested tickers
    const cached = await getAnalysisCacheForTickers(tickers).catch(() => ({} as Record<string, any>));
    const missingTickers = tickers.filter(t => !cached[t]);

    // 2. Fetch Snapshot for ALL tickers
    const snapshotData = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers`, { tickers: tickers.join(',') }).catch(() => null);
    const snapshotMap: Record<string, any> = {};
    (snapshotData?.tickers || []).forEach((t: any) => { snapshotMap[t.ticker] = t; });

    const { getMarketStatusSSOT } = await import('@/services/marketStatusProvider');
    const marketStatus = await getMarketStatusSSOT();
    const currentSession = marketStatus.session;

    const results = await Promise.all(tickers.map(async (ticker) => {
        const analysis = cached[ticker];
        const snap = snapshotMap[ticker];

        const buildBasePrice = () => {
            if (!snap) return { displayPrice: 0, changePct: 0, extendedPrice: null, extendedLabel: undefined, vwap: null, volume: 0, prevDayClose: 0, liveLast: 0, dayClose: 0, change: 0, isExtended: false };

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
                if (dayClose > 0 && prevDayClose > 0) {
                    changePct = ((dayClose - prevDayClose) / prevDayClose) * 100;
                }
            }

            const change = displayPrice - prevDayClose;

            let extendedPrice: number | null = null;
            let extendedLabel = undefined;
            if (currentSession === 'pre') {
                const prePrice = snap.min?.c || liveLast;
                if (prePrice > 0) { extendedPrice = prePrice; extendedLabel = 'PRE'; }
            } else if (currentSession === 'post' || currentSession === 'closed') {
                const postPrice = snap.afterHours?.p || snap.min?.c || liveLast;
                if (postPrice > 0) { extendedPrice = postPrice; extendedLabel = 'POST'; }
            }

            return { displayPrice, changePct, extendedPrice, extendedLabel, vwap, volume, prevDayClose, liveLast, dayClose, change, isExtended: currentSession !== 'regular' };
        };

        // A. CACHE HIT: V4.6 RECALCULATION (ONE ENGINE, ONE RESULT)
        // [V8 UNIFIED] Lambda alphaSnapshot 무시, V4.6 엔진으로 재계산
        if (analysis) {
            const base = buildBasePrice();

            let finalChangePct = base.changePct;
            if (currentSession === 'regular') {
                if (base.changePct === 0 && base.liveLast > 0 && base.prevDayClose > 0) {
                    finalChangePct = ((base.liveLast - base.prevDayClose) / base.prevDayClose) * 100;
                }
            }

            const extendedChangePct = (base.extendedPrice && base.extendedPrice > 0 && base.displayPrice > 0)
                ? ((base.extendedPrice - base.displayPrice) / base.displayPrice) * 100 : null;
            const refPrice = base.extendedPrice || base.displayPrice;

            // [V8] V4.6 Alpha Score — 항상 재계산
            const sessionMap: Record<string, AlphaSession> = { pre: 'PRE', regular: 'REG', post: 'POST', closed: 'CLOSED' };
            const alphaSession: AlphaSession = sessionMap[currentSession] || 'CLOSED';
            let alphaSnapshotV4: any = analysis.alphaSnapshot; // fallback

            try {
                const alphaResult = calculateAlphaScore({
                    ticker: ticker.toUpperCase(),
                    session: alphaSession,
                    price: base.displayPrice,
                    prevClose: base.prevDayClose || 0,
                    changePct: finalChangePct,
                    vwap: base.vwap ?? null,
                    return3D: analysis.return3d ?? null,
                    rsi14: analysis.rsi ?? null,
                    pcr: analysis.pcr ?? null,
                    gex: analysis.gex ?? null,
                    callWall: analysis.callWall ?? null,
                    putFloor: analysis.putFloor ?? null,
                    gammaFlipLevel: analysis.gammaFlipLevel ?? null,
                    squeezeScore: analysis.squeezeScore ?? null,
                    atmIv: analysis.iv ?? null,
                    whaleIndex: analysis.whaleIndex ?? 0,
                    darkPoolPct: analysis.darkPoolPct ?? 0,
                    relVol: analysis.relVol ?? null,
                    netFlow: analysis.netPremium ?? null,
                    impliedMovePct: analysis.impliedMovePct ?? null,
                    ivSkew: analysis.ivSkew ?? null,
                    optionsDataAvailable: analysis.gex !== null,
                });
                alphaSnapshotV4 = {
                    score: alphaResult.score,
                    grade: alphaResult.grade,
                    action: alphaResult.action,
                    actionKR: alphaResult.actionKR,
                    confidence: Math.round(alphaResult.dataCompleteness),
                    triggers: alphaResult.triggerCodes,
                    engineVersion: alphaResult.engineVersion,
                    capturedAt: new Date().toISOString(),
                };
            } catch (e) {
                console.warn(`[Portfolio CACHE HIT] V4.6 recalc failed for ${ticker}, using cached:`, e);
            }

            const tripleA = {
                direction: finalChangePct > 0,
                acceleration: Math.abs(finalChangePct) > 1,
                accumulation: analysis.gex !== null ? analysis.gex > 0 : false
            };

            return {
                ticker,
                alphaSnapshot: alphaSnapshotV4,
                realtime: {
                    price: base.displayPrice,
                    change: base.change,
                    changePct: finalChangePct,
                    session: currentSession === 'regular' ? 'reg' : currentSession,
                    extPrice: base.extendedPrice,
                    extChangePercent: extendedChangePct,
                    isExtended: base.isExtended,
                    rvol: analysis.relVol || 1.0,
                    sparkline: analysis.sparkline,
                    threeDay: analysis.return3d || 0,
                    rsi: analysis.rsi,
                    maxPain: analysis.maxPain,
                    maxPainDist: (analysis.maxPain && refPrice) ? Number(((analysis.maxPain - refPrice) / refPrice * 100).toFixed(2)) : null,
                    gex: analysis.gex,
                    gexM: analysis.gexM,
                    gammaFlipLevel: analysis.gammaFlipLevel,
                    pcr: analysis.pcr,
                    tripleA
                }
            };
        }

        // B. CACHE MISS & FAST MODE
        if (mode === 'price' || mode === 'ssr') {
            const base = buildBasePrice();
            const extendedChangePct = (base.extendedPrice && base.extendedPrice > 0 && base.displayPrice > 0)
                ? ((base.extendedPrice - base.displayPrice) / base.displayPrice) * 100 : null;

            return {
                ticker,
                realtime: {
                    price: base.displayPrice,
                    change: base.change,
                    changePct: base.changePct,
                    session: currentSession === 'regular' ? 'reg' : 'post',
                    isExtended: base.isExtended,
                    extPrice: base.extendedPrice,
                    extChangePercent: extendedChangePct
                }
            };
        }

        // C. FULL MODE COMPUTE
        try {
            const [stockData, optionsData, structureRes] = await Promise.all([
                getStockDataLight(ticker).catch(() => null),
                getOptionsData(ticker).catch(() => null),
                getStructureData(ticker).catch(() => null)
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
                if (lastBar?.close && prevBar?.close) { changePct = ((lastBar.close - prevBar.close) / prevBar.close) * 100; }
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
                if (lastClose && close4dAgo) { return3D = ((lastClose - close4dAgo) / close4dAgo) * 100; }
            }

            const opts = optionsData as any;
            const alphaGex = structureRes?.netGex ?? opts?.gems?.gex ?? opts?.gex ?? null;
            const alphaPcr = opts?.putCallRatio ?? null;
            const alphaCallWall = structureRes?.callWall ?? opts?.callWall ?? null;
            const alphaPutFloor = structureRes?.putFloor ?? opts?.putFloor ?? null;
            const alphaGammaFlip = structureRes?.gammaFlipLevel ?? opts?.gems?.gammaFlipLevel ?? null;
            const alphaSqueezeScore = structureRes?.squeezeScore ?? null;

            // [V8] Flow pillar data for Composite WhaleIndex
            const darkPoolPct = (structureRes as any)?.darkPoolPct ?? null;
            const blockTradesCount = (structureRes as any)?.blockTrades ?? null;
            const netPremium = structureRes?.netPremium ?? null;
            const whaleIndex = calculateWhaleIndex(alphaGex, darkPoolPct, blockTradesCount, netPremium);

            let alphaResult;
            try {
                alphaResult = calculateAlphaScore({
                    ticker: ticker.toUpperCase(), session: alphaSession, price: stockData.price || 0,
                    prevClose: stockData.prevClose || 0, changePct, vwap: stockData.vwap ?? null,
                    return3D, rsi14: stockData.rsi ?? null, pcr: alphaPcr, gex: alphaGex,
                    callWall: alphaCallWall, putFloor: alphaPutFloor, gammaFlipLevel: alphaGammaFlip,
                    rawChain: opts?.rawChain || [], squeezeScore: alphaSqueezeScore, relVol,
                    darkPoolPct, blockTrades: blockTradesCount, whaleIndex, netFlow: netPremium,
                    optionsDataAvailable: !!opts, preMarketChangePct: (stockData as any).extendedChangePct ?? null,
                });
            } catch (e) {
                console.error(`[Portfolio Batch] Engine failed for ${ticker}:`, e);
                alphaResult = calculateAlphaScore({
                    ticker: ticker.toUpperCase(), session: alphaSession, price: stockData.price || 0,
                    prevClose: stockData.prevClose || 0, changePct, preMarketChangePct: (stockData as any).extendedChangePct ?? null,
                });
            }

            const { score, grade, action, triggerCodes: triggers, dataCompleteness: confidence } = alphaResult;

            const currentPrice = stockData.price || 0;
            const maxPain = structureRes?.maxPain ?? opts?.maxPain ?? null;
            const rawGex = opts?.gems?.gex || opts?.gex;
            const gex = structureRes?.netGex ?? rawGex ?? null;
            const gexM = gex !== null ? Number((gex / 1000000).toFixed(2)) : null;
            const gammaFlipLevel = structureRes?.gammaFlipLevel ?? null;

            const tripleA = { direction: changePct > 0, acceleration: Math.abs(changePct) > 1, accumulation: gex !== null ? gex > 0 : false };

            const fullObj = {
                ticker,
                alphaSnapshot: { score, grade, action, confidence: Math.round(confidence), triggers, engineVersion: alphaResult.engineVersion, capturedAt: new Date().toISOString() },
                realtime: {
                    price: stockData.price || 0, change: stockData.change || 0, changePct, session: stockData.session || 'reg',
                    extPrice: stockData.extPrice, extChangePercent: stockData.extChangePercent, isExtended: stockData.isExtended,
                    rvol: relVol || 1.0, sparkline: stockData.history?.slice(-20).map((h: any) => h.close) || [],
                    threeDay: return3D || 0, rsi: stockData.rsi || null, maxPain,
                    maxPainDist: (maxPain && currentPrice) ? Number(((maxPain - currentPrice) / currentPrice * 100).toFixed(2)) : null,
                    gex, gexM, gammaFlipLevel, pcr: opts?.putCallRatio || null, tripleA
                }
            };

            // 🔥 CACHE SYNC 🔥
            writeAnalysisCache(ticker, {
                ticker, timestamp: Date.now(), alphaSnapshot: fullObj.alphaSnapshot,
                rsi: fullObj.realtime.rsi, return3d: fullObj.realtime.threeDay, sparkline: fullObj.realtime.sparkline,
                relVol: fullObj.realtime.rvol, expiration: structureRes?.expiration ?? null,
                maxPain: fullObj.realtime.maxPain, gex: fullObj.realtime.gex,
                gexM: fullObj.realtime.gexM, pcr: fullObj.realtime.pcr, gammaFlipLevel: fullObj.realtime.gammaFlipLevel,
                whaleIndex, whaleConfidence: whaleIndex >= 70 ? 'HIGH' : whaleIndex >= 40 ? 'MED' : whaleIndex >= 15 ? 'LOW' : 'NONE',
                putFloor: alphaPutFloor, callWall: alphaCallWall, netPremium,
                vwapDist: null, volume: stockData.volume || null, squeezeScore: alphaSqueezeScore, iv: structureRes?.atmIv ?? null, darkPoolPct: darkPoolPct || 0,
                ivSkew: null, impliedMovePct: null,
                // [V3 FIX] Dashboard card fields
                shortVolPct: null,
                vwap: stockData.vwap ?? null,
                volumePcr: null, volumePcrCallVol: null, volumePcrPutVol: null,
                zeroDtePct: null, impliedMoveDir: null,
            }).catch(e => console.error(`Failed to cache ${ticker}`, e));

            // 🔥 [V4.6 WRITE-BACK] Record accurate SSR Alpha Score to DynamoDB
            recordAlphaDaily(ticker, {
                alphaScore: alphaResult.score,
                qualityTier: 'SSR_V46',
                changePct,
                gex: alphaGex ?? 0,
                pcr: alphaPcr ?? 0,
                grade: alphaResult.grade,
                momentum: alphaResult.pillars.momentum.score,
                structure: alphaResult.pillars.structure.score,
                flow: alphaResult.pillars.flow.score,
                regime: alphaResult.pillars.regime.score,
                catalyst: alphaResult.pillars.catalyst.score,
                engineVersion: alphaResult.engineVersion,
                price: currentPrice,
                // [V5.0] Full input vector for future re-calculation
                rsi14: stockData.rsi ?? null,
                atmIv: structureRes?.atmIv ?? null,
                darkPoolPct: darkPoolPct ?? null,
                whaleIndex: Math.round(whaleIndex),
                squeezeScore: alphaSqueezeScore ?? null,
                relVol: relVol ?? null,
                shortVolPct: null,
                callWall: alphaCallWall ?? null,
                putFloor: alphaPutFloor ?? null,
                gammaFlipLevel: alphaGammaFlip ?? null,
                return3D: return3D ?? null,
                netPremium: netPremium ?? null,
            });

            return fullObj;
        } catch (error) {
            console.error(`Portfolio batch error for ${ticker}:`, error);
            return { ticker, error: 'Analysis failed' };
        }
    }));

    return { results, meta: { count: tickers.length, elapsed: Date.now() - startTime, source: missingTickers.length === 0 ? 'analysis_cache' : 'hybrid_compute', cached: missingTickers.length === 0 } };
}
