// ============================================================================
// /api/cron/warm-analysis — Analysis Cache Warmer (Vercel Cron)
// [CACHE WARMER] Pre-computes analysis data for ~50 popular tickers → Redis
// Schedule: Every 2 min (Mon-Fri, market hours) via Vercel Cron
// ============================================================================

import { NextResponse } from 'next/server';
import { getOptionsData } from '@/services/stockApi';
import { calculateAlphaScore, type AlphaSession } from '@/services/alphaEngine';
import { getStructureData } from '@/services/structureService';
import { fetchMassive } from '@/services/massiveClient';
import { writeAnalysisCache, type AnalysisCacheEntry } from '@/services/analysisCache';

// ── Ticker Lists ──
const M7_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
const PHYSICAL_AI_TICKERS = ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'];

// Popular tickers that are frequently viewed (top dashboard/watchlist selections)
const POPULAR_TICKERS = [
    'SPY', 'QQQ', 'IWM', 'AMD', 'INTC', 'SOFI', 'COIN', 'MSTR',
    'SMCI', 'ARM', 'AVGO', 'CRM', 'SNOW', 'NET', 'UBER', 'SQ',
    'SHOP', 'SE', 'BABA', 'JD', 'NIO', 'LI', 'RIVN', 'LCID',
    'BA', 'DIS', 'NFLX', 'PYPL', 'V', 'MA', 'JPM', 'GS',
    'XOM', 'CVX', 'LLY', 'UNH',
];

// Deduplicated unified list
const ALL_TICKERS = [...new Set([...M7_TICKERS, ...PHYSICAL_AI_TICKERS, ...POPULAR_TICKERS])];

// Concurrency control — max 5 tickers in parallel to avoid API rate limits
const CONCURRENCY = 5;

// ── Lightweight stock data fetcher (same logic as watchlist/batch getStockDataLight) ──
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

    // Session detection
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

    // Price calculation
    const prevClose = t?.prevDay?.c || 0;
    const todayClose = t?.day?.c || prevClose;
    const latestPrice = t?.lastTrade?.p || t?.min?.c || t?.day?.c || t?.prevDay?.c || 0;

    const isExtended = session !== 'reg';
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
        changePercent: isExtended ? 0 : regChangePercent,
        volume: t?.day?.v,
        prevClose,
        prevDayVolume: t?.prevDay?.v || 0,
        session,
        rsi,
        return3d,
        vwap: t?.day?.vw,
        sparkline,
        dailyResults,
    };
}

// ── Compute and cache analysis for a single ticker ──
async function warmTicker(ticker: string): Promise<{ ticker: string; ok: boolean; ms: number }> {
    const start = Date.now();
    try {
        // Parallel: stock data + options + structure (same as watchlist/batch)
        const [stockData, optionsData, structureRes] = await Promise.all([
            getStockDataLight(ticker).catch(() => null),
            getOptionsData(ticker).catch(() => null),
            getStructureData(ticker).catch(() => null)
        ]);

        if (!stockData) {
            return { ticker, ok: false, ms: Date.now() - start };
        }

        // Session mapping
        const sessionMap: Record<string, AlphaSession> = { pre: 'PRE', reg: 'REG', post: 'POST' };
        const alphaSession: AlphaSession = sessionMap[stockData.session] || 'CLOSED';
        const isREG = alphaSession === 'REG';
        const dailyResults = stockData.dailyResults || [];

        // Session-aware changePct
        let changePct = stockData.changePercent || 0;
        if (!isREG && dailyResults.length >= 2) {
            const lastBar = dailyResults[dailyResults.length - 1];
            const prevBar = dailyResults[dailyResults.length - 2];
            if (lastBar?.close && prevBar?.close) {
                changePct = ((lastBar.close - prevBar.close) / prevBar.close) * 100;
            }
        }

        // Session-aware relVol
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

        // Session-aware return3D
        let return3D = stockData.return3d ?? null;
        if (!isREG && dailyResults.length >= 4) {
            const lastClose = dailyResults[dailyResults.length - 1]?.close;
            const close4dAgo = dailyResults[dailyResults.length - 4]?.close;
            if (lastClose && close4dAgo) {
                return3D = ((lastClose - close4dAgo) / close4dAgo) * 100;
            }
        }

        // Options data extraction
        const opts = optionsData as any;
        const alphaGex = structureRes?.netGex ?? opts?.gems?.gex ?? opts?.gex ?? null;
        const alphaPcr = opts?.putCallRatio ?? null;
        const alphaCallWall = structureRes?.callWall ?? opts?.callWall ?? null;
        const alphaPutFloor = structureRes?.putFloor ?? opts?.putFloor ?? null;
        const alphaGammaFlip = structureRes?.gammaFlipLevel ?? opts?.gems?.gammaFlipLevel ?? null;
        const alphaSqueezeScore = structureRes?.squeezeScore ?? null;

        // Alpha Engine call
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
                preMarketChangePct: null,
            });
        } catch {
            alphaResult = calculateAlphaScore({
                ticker: ticker.toUpperCase(),
                session: alphaSession,
                price: stockData.price || 0,
                prevClose: stockData.prevClose || 0,
                changePct,
                preMarketChangePct: null,
            });
        }

        // Options indicators
        const hasOptionsData = opts && (opts?.maxPain || opts?.gems?.gex || opts?.gex);
        const maxPain = hasOptionsData ? (opts?.maxPain || null) : null;
        const currentPrice = stockData.price || 0;
        const rawGex = opts?.gems?.gex || opts?.gex;
        const gex = hasOptionsData ? (rawGex || null) : null;
        const gexM = gex !== null ? Number((gex / 1000000).toFixed(2)) : null;

        // Whale Index
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

        // Structure data (unified with watchlist/batch)
        const gammaFlipLevel = structureRes?.gammaFlipLevel ?? null;
        const structureGexM = structureRes?.netGex ? Number((structureRes.netGex / 1000000).toFixed(2)) : null;
        const structureMaxPain = structureRes?.maxPain ?? null;
        const iv = structureRes?.atmIv ?? opts?.gems?.iv ?? opts?.iv ?? null;
        const finalMaxPain = structureMaxPain ?? maxPain;

        // Build cache entry
        const cacheEntry: AnalysisCacheEntry = {
            ticker: ticker.toUpperCase(),
            timestamp: Date.now(),
            alphaSnapshot: {
                score: alphaResult.score,
                grade: alphaResult.grade,
                action: alphaResult.action,
                actionKR: alphaResult.actionKR,
                whyKR: alphaResult.whyKR,
                confidence: Math.round(alphaResult.dataCompleteness),
                triggers: alphaResult.triggerCodes,
                pillars: alphaResult.pillars,
                gatesApplied: alphaResult.gatesApplied,
                engineVersion: alphaResult.engineVersion,
                capturedAt: new Date().toISOString(),
            },
            rsi: stockData.rsi,
            return3d: return3D,
            sparkline: stockData.sparkline || [],
            relVol,
            maxPain: finalMaxPain,
            gex: structureRes?.netGex ?? gex,
            gexM: structureGexM ?? gexM,
            pcr: alphaPcr,
            callWall: structureRes?.levels?.callWall ?? null,
            putFloor: structureRes?.levels?.putFloor ?? null,
            gammaFlipLevel,
            squeezeScore: alphaSqueezeScore,
            iv,
            whaleIndex: Math.round(whaleIndex),
            whaleConfidence,
            netPremium: structureRes?.netPremium ?? null,
            vwapDist: (stockData.vwap && stockData.price)
                ? Number(((stockData.price - stockData.vwap) / stockData.vwap * 100).toFixed(2))
                : null,
            volume: stockData.volume || null,
        };

        await writeAnalysisCache(ticker, cacheEntry);

        return { ticker, ok: true, ms: Date.now() - start };
    } catch (e) {
        console.error(`[WARM] ❌ ${ticker} failed:`, e);
        return { ticker, ok: false, ms: Date.now() - start };
    }
}

// ── Chunked parallel processing ──
async function processInChunks<T>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<any>
): Promise<any[]> {
    const results: any[] = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const chunk = items.slice(i, i + concurrency);
        const chunkResults = await Promise.all(chunk.map(fn));
        results.push(...chunkResults);
    }
    return results;
}

// ── GET handler (Vercel Cron calls this) ──
export async function GET(request: Request) {
    // Cron secret verification
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startTime = Date.now();
    console.log(`[WARM] 🔥 Starting analysis cache warm for ${ALL_TICKERS.length} tickers...`);

    const results = await processInChunks(ALL_TICKERS, CONCURRENCY, warmTicker);

    const succeeded = results.filter((r: any) => r.ok).length;
    const failed = results.filter((r: any) => !r.ok).length;
    const totalMs = Date.now() - startTime;
    const avgMs = succeeded > 0 ? Math.round(totalMs / succeeded) : 0;

    console.log(`[WARM] ✅ Complete: ${succeeded}/${ALL_TICKERS.length} tickers cached (${failed} failed) in ${totalMs}ms (avg ${avgMs}ms/ticker)`);

    return NextResponse.json({
        success: true,
        cached: succeeded,
        failed,
        total: ALL_TICKERS.length,
        elapsedMs: totalMs,
        avgMs,
        failedTickers: results.filter((r: any) => !r.ok).map((r: any) => r.ticker),
    });
}
