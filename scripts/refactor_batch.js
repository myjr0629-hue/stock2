const fs = require('fs');
const path = require('path');

const WATCHLIST_FILE = path.join('c:', 'Users', 'seamo', 'backup', 'stock2', 'src', 'services', 'watchlistBatchService.ts');
let watchlistContent = fs.readFileSync(WATCHLIST_FILE, 'utf8');

// Ensure writeAnalysisCache is imported
if (!watchlistContent.includes('writeAnalysisCache')) {
    watchlistContent = watchlistContent.replace(
        /getAnalysisCacheForTickers([^}]*)} from '@\/services\/analysisCache'/,
        'getAnalysisCacheForTickers$1, writeAnalysisCache } from \'@/services/analysisCache\''
    );
}

const newBatchLogic = `export async function processWatchlistBatch(tickers: string[], mode: 'full' | 'price' | 'ssr' = 'full') {
    const startTime = Date.now();
    if (!tickers || tickers.length === 0) return { results: [], meta: { count: 0, elapsed: 0, source: 'empty' } };

    // 1. Fetch Cache for all requested tickers (Non-blocking fallback to empty if Redis fails)
    const cached = await getAnalysisCacheForTickers(tickers).catch(() => ({}));
    const missingTickers = tickers.filter(t => !cached[t]);

    // 2. Fetch Snapshot for ALL tickers (we need live prices for Cached ones AND Missing ones in 'ssr'/'price' mode)
    // In 'full' mode, getStockDataLight also fetches snapshots, but we need it here for the cached ones anyway.
    const snapshotData = await fetchMassive(\`/v2/snapshot/locale/us/markets/stocks/tickers\`, { tickers: tickers.join(',') }).catch(() => null);
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
                });
            } catch (e) {
                console.error(\`[Watchlist Batch] V5 Engine failed for \${ticker}:\`, e);
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
                    extendedLabel: (stockData as any).extendedLabel || undefined
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
                volume: fullObj.realtime.volume
            }).catch(e => console.error(\`Failed to write analysis cache for \${ticker}\`, e));

            return fullObj;

        } catch (error) {
            console.error(\`Batch analyze error for \${ticker}:\`, error);
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
`;

const startIndex = watchlistContent.indexOf('export async function processWatchlistBatch');
let lastIndex = watchlistContent.lastIndexOf('}');
// find the correct closing brace by counting 
// Actually, it's just the end of the file. No wait, there could be other exports.
// Lets just replace from export async function processWatchlistBatch to end of file, assuming it's the last function.

watchlistContent = watchlistContent.substring(0, startIndex) + newBatchLogic;
fs.writeFileSync(WATCHLIST_FILE, watchlistContent);

console.log('Watchlist refactor successful!');
