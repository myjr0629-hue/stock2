const fs = require('fs');
const path = require('path');

const PORTFOLIO_FILE = path.join('c:', 'Users', 'seamo', 'backup', 'stock2', 'src', 'services', 'portfolioBatchService.ts');
let portfolioContent = fs.readFileSync(PORTFOLIO_FILE, 'utf8');

// Ensure writeAnalysisCache is imported
if (!portfolioContent.includes('writeAnalysisCache')) {
    portfolioContent = portfolioContent.replace(
        /getAnalysisCacheForTickers([^}]*)} from '@\/services\/analysisCache'/,
        'getAnalysisCacheForTickers$1, writeAnalysisCache } from \'@/services/analysisCache\''
    );
}

const newBatchLogic = `export async function processPortfolioBatch(tickers: string[], mode: 'full' | 'price' | 'ssr' = 'full') {
    const startTime = Date.now();
    if (!tickers || tickers.length === 0) return { results: [], meta: { count: 0, elapsed: 0, source: 'empty' } };

    // 1. Fetch Cache for all requested tickers
    const cached = await getAnalysisCacheForTickers(tickers).catch(() => ({}));
    const missingTickers = tickers.filter(t => !cached[t]);

    // 2. Fetch Snapshot for ALL tickers
    const snapshotData = await fetchMassive(\`/v2/snapshot/locale/us/markets/stocks/tickers\`, { tickers: tickers.join(',') }).catch(() => null);
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

        // A. CACHE HIT
        if (analysis) {
            const base = buildBasePrice();
            
            let finalChangePct = base.changePct;
            if (currentSession !== 'regular' && analysis.sparkline && analysis.sparkline.length >= 2) {
                const lastClose = analysis.sparkline[analysis.sparkline.length - 1];
                const prevClose2 = analysis.sparkline[analysis.sparkline.length - 2];
                if (prevClose2 > 0 && lastClose > 0) {
                    finalChangePct = ((lastClose - prevClose2) / prevClose2) * 100;
                }
            } else if (currentSession === 'regular') {
                if (base.changePct === 0 && base.liveLast > 0 && base.prevDayClose > 0) {
                     finalChangePct = ((base.liveLast - base.prevDayClose) / base.prevDayClose) * 100;
                }
            }

            const extendedChangePct = (base.extendedPrice && base.extendedPrice > 0 && base.displayPrice > 0)
                ? ((base.extendedPrice - base.displayPrice) / base.displayPrice) * 100 : null;
            const refPrice = base.extendedPrice || base.displayPrice;
            
            // Triple A fallback calculation
            const tripleA = {
                direction: finalChangePct > 0,
                acceleration: Math.abs(finalChangePct) > 1,
                accumulation: analysis.gex !== null ? analysis.gex > 0 : false
            };

            return {
                ticker,
                alphaSnapshot: analysis.alphaSnapshot,
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

            let alphaResult;
            try {
                alphaResult = calculateAlphaScore({
                    ticker: ticker.toUpperCase(), session: alphaSession, price: stockData.price || 0,
                    prevClose: stockData.prevClose || 0, changePct, vwap: stockData.vwap ?? null,
                    return3D, rsi14: stockData.rsi ?? null, pcr: alphaPcr, gex: alphaGex,
                    callWall: alphaCallWall, putFloor: alphaPutFloor, gammaFlipLevel: alphaGammaFlip,
                    rawChain: opts?.rawChain || [], squeezeScore: alphaSqueezeScore, relVol,
                    optionsDataAvailable: !!opts, preMarketChangePct: (stockData as any).extendedChangePct ?? null,
                });
            } catch (e) {
                console.error(\`[Portfolio Batch] Engine failed for \${ticker}:\`, e);
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
                relVol: fullObj.realtime.rvol, maxPain: fullObj.realtime.maxPain, gex: fullObj.realtime.gex,
                gexM: fullObj.realtime.gexM, pcr: fullObj.realtime.pcr, gammaFlipLevel: fullObj.realtime.gammaFlipLevel,
                whaleIndex: 0, whaleConfidence: 'NONE', putFloor: null, callWall: null, netPremium: null,
                vwapDist: null, volume: null, squeezeScore: null, iv: null
            }).catch(e => console.error(\`Failed to cache \${ticker}\`, e));

            return fullObj;
        } catch (error) {
            console.error(\`Portfolio batch error for \${ticker}:\`, error);
            return { ticker, error: 'Analysis failed' };
        }
    }));

    return { results, meta: { count: tickers.length, elapsed: Date.now() - startTime, source: missingTickers.length === 0 ? 'analysis_cache' : 'hybrid_compute', cached: missingTickers.length === 0 } };
}
`;

const startIndex = portfolioContent.indexOf('export async function processPortfolioBatch');
portfolioContent = portfolioContent.substring(0, startIndex) + newBatchLogic;
fs.writeFileSync(PORTFOLIO_FILE, portfolioContent);

console.log('Portfolio refactor successful!');
