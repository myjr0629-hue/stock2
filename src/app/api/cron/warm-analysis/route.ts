// ============================================================================
// /api/cron/warm-analysis — Analysis Cache Warmer (Vercel Cron)
// [CACHE WARMER] Pre-computes analysis data for ~50 popular tickers → Redis
// Schedule: Every 2 min (Mon-Fri, market hours) via Vercel Cron
// ============================================================================

import { NextResponse } from 'next/server';
import { getOptionsData } from '@/services/stockApi';
import { calculateAlphaScore, calculateWhaleIndex, computeIVSkew, computeImpliedMovePct, type AlphaSession } from '@/services/alphaEngine';
import { getStructureData } from '@/services/structureService';
import { fetchMassive } from '@/services/massiveClient';
import { writeAnalysisCache, type AnalysisCacheEntry } from '@/services/analysisCache';
import { getMacroSnapshotSSOT } from '@/services/macroHubProvider';
import { fetchTradeData, fetchShortVolumeData } from '@/services/realtimeMetricsService';
import { getFromCache } from '@/services/redisClient';

// ── Ticker Lists ──
const M7_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
const PHYSICAL_AI_TICKERS = ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'];
const SILICON_CORE_TICKERS = ['AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL'];
const POWER_MATRIX_TICKERS = ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN'];
const BIO_PULSE_TICKERS = ['LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD'];
const CYBER_SHIELD_TICKERS = ['CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA', 'NET'];
const ORBIT_DEFENSE_TICKERS = ['LMT', 'RTX', 'AXON', 'KTOS', 'LDOS', 'ASTS', 'LUNR'];
const QUANTUM_EDGE_TICKERS = ['SMCI', 'SNOW', 'IONQ', 'DELL', 'AI', 'PATH', 'TWLO'];
const FINTECH_PULSE_TICKERS = ['XYZ', 'PYPL', 'COIN', 'SOFI', 'AFRM', 'HOOD', 'UPST'];
const CLOUD_FORTRESS_TICKERS = ['CRM', 'NOW', 'DDOG', 'WDAY', 'MDB', 'TEAM', 'HUBS'];

// Popular tickers that are frequently viewed (top dashboard/watchlist selections)
const POPULAR_TICKERS = [
    'SPY', 'QQQ', 'IWM', 'INTC', 'SOFI', 'COIN', 'MSTR',
    'SMCI', 'CRM', 'SNOW', 'UBER', 'XYZ',
    'SHOP', 'SE', 'BABA', 'JD', 'NIO', 'LI', 'RIVN', 'LCID',
    'BA', 'DIS', 'NFLX', 'PYPL', 'V', 'MA', 'JPM', 'GS',
    'XOM', 'CVX', 'UNH', 'WDC', 'MCD',
];

// Deduplicated unified list (all 7 sectors + popular)
const ALL_TICKERS = [...new Set([...M7_TICKERS, ...PHYSICAL_AI_TICKERS, ...SILICON_CORE_TICKERS, ...POWER_MATRIX_TICKERS, ...BIO_PULSE_TICKERS, ...CYBER_SHIELD_TICKERS, ...ORBIT_DEFENSE_TICKERS, ...QUANTUM_EDGE_TICKERS, ...FINTECH_PULSE_TICKERS, ...CLOUD_FORTRESS_TICKERS, ...POPULAR_TICKERS])];

// Concurrency control — max 5 tickers in parallel to avoid API rate limits
const CONCURRENCY = 5;

// ── Lightweight stock data fetcher (same logic as watchlist/batch getStockDataLight) ──
async function getStockDataLight(symbol: string) {
    const to = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];

    const [snapRes, rsiRes, dailyAggs, macdRes] = await Promise.all([
        fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`),
        fetchMassive(`/v1/indicators/rsi/${symbol}`, { timespan: 'day', window: '14', limit: '1' }).catch(() => null),
        fetchMassive(`/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${to}`, { limit: '5000', adjust: 'true', sort: 'asc' }).catch(() => null),
        fetchMassive(`/v1/indicators/macd/${symbol}`, { timespan: 'day', short_window: '12', long_window: '26', signal_window: '9', limit: '1' }).catch(() => null)
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

    // [V5.5+] MACD histogram from Polygon indicator API
    const macdValues = macdRes?.results?.values;
    const latestMacd = macdValues && macdValues.length > 0 ? macdValues[0] : null;
    const macdHistogram = latestMacd?.histogram ?? null;

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
        macdHistogram,  // [V5.5+] MACD histogram for trend crossover
    };
}

// ── Shared macro data (fetched ONCE per warm cycle, reused by all tickers) ──
let _sharedMacro: { ndxChangePct: number | null; vixValue: number | null; vixChangePct: number | null; vix3mValue: number | null; tltChangePct: number | null; gldChangePct: number | null; dxy: number | null; realYieldStance: 'TIGHT' | 'NEUTRAL' | 'EASY' | null } | null = null;

async function getSharedMacro() {
    if (_sharedMacro) return _sharedMacro;
    try {
        const macro = await getMacroSnapshotSSOT();
        _sharedMacro = {
            ndxChangePct: macro.nqChangePercent ?? null,
            vixValue: macro.vix ?? null,
            vixChangePct: macro.factors?.vix?.chgPct ?? null,
            vix3mValue: null as number | null,  // filled below from Redis
            tltChangePct: macro.tltChangePct ?? null,
            gldChangePct: macro.gldChangePct ?? null,
            dxy: macro.dxy ?? null,
            realYieldStance: (macro.realYield?.stance === 'LOOSE' ? 'EASY' : macro.realYield?.stance ?? null) as 'TIGHT' | 'NEUTRAL' | 'EASY' | null,
        };

        // [V5.5+] Read VIX3M from Redis (written by market-feed cron every 1min)
        try {
            const vix3mData = await getFromCache<{ price: number; changePct: number }>('yahoo:vix3m');
            if (vix3mData?.price) {
                _sharedMacro.vix3mValue = vix3mData.price;
            }
        } catch { /* VIX3M is optional, regime still works without it */ }

        console.log(`[WARM] Macro loaded: NQ=${_sharedMacro.ndxChangePct?.toFixed(2)}% VIX=${_sharedMacro.vixValue} VIX3M=${_sharedMacro.vix3mValue || 'N/A'}`);
    } catch (e) {
        console.warn('[WARM] Macro fetch failed, regime data will be missing:', e);
        _sharedMacro = { ndxChangePct: null, vixValue: null, vixChangePct: null, vix3mValue: null, tltChangePct: null, gldChangePct: null, dxy: null, realYieldStance: null };
    }
    return _sharedMacro;
}

// ── Compute and cache analysis for a single ticker ──
async function warmTicker(ticker: string): Promise<{ ticker: string; ok: boolean; ms: number }> {
    const start = Date.now();
    try {
        // Parallel: stock data + options + structure + flow (same as watchlist/batch)
        const [stockData, optionsData, structureRes, tradeData, shortVolData] = await Promise.all([
            getStockDataLight(ticker).catch(() => null),
            getOptionsData(ticker).catch(() => null),
            getStructureData(ticker).catch(() => null),
            fetchTradeData(ticker).catch(() => null),       // [FIX] Dark Pool + Block Trades
            fetchShortVolumeData(ticker).catch(() => null),  // [FIX] Short Volume
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
        let alphaSqueezeScore = structureRes?.squeezeScore ?? null;
        // squeezeScore fallback from GEX + PCR (same as watchlist/batch)
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

        // [FIX] SMA20 from daily aggs (same as watchlist/batch)
        let sma20: number | null = null;
        const dailyCloses = dailyResults.map((d: any) => d.close).filter(Boolean);
        if (dailyCloses.length >= 20) {
            const last20 = dailyCloses.slice(-20);
            sma20 = parseFloat((last20.reduce((a: number, b: number) => a + b, 0) / 20).toFixed(2));
        }

        // [FIX] rawContracts for IV calculations
        const rawContracts = opts?.rawContracts || [];
        const currentPrice = stockData.price || 0;
        const ivSkew = computeIVSkew(rawContracts, currentPrice);

        // [FIX] impliedMovePct (same as watchlist/batch)
        let directCallWall = 0, directPutFloor = 0;
        let maxCallOI = 0, maxPutOI = 0;
        for (const c of rawContracts) {
            const oi = c.open_interest || 0;
            const strike = c.strike_price || 0;
            if (c.contract_type === 'call' && oi > maxCallOI) { maxCallOI = oi; directCallWall = strike; }
            if (c.contract_type === 'put' && oi > maxPutOI) { maxPutOI = oi; directPutFloor = strike; }
        }
        let impliedMovePct: number | null = null;
        if (directCallWall > 0 && directPutFloor > 0 && currentPrice > 0) {
            impliedMovePct = ((directCallWall - directPutFloor) / currentPrice) * 100;
        } else {
            impliedMovePct = computeImpliedMovePct(rawContracts, currentPrice);
        }

        // [FIX] Flow data (same as watchlist/batch)
        const darkPoolPct = tradeData?.darkPoolPercent ?? null;
        const shortVolPct = shortVolData?.shortVolPercent ?? null;
        const blockTradesCount = tradeData?.blockTrades ?? null;
        const netPremium = structureRes?.netPremium ?? null;
        const whaleIdx = calculateWhaleIndex(alphaGex);

        // [FIX] Fetch shared macro + Fear & Greed data
        const macroData = await getSharedMacro();
        const fgData = await getFromCache<{ score: number; rating: string }>('cnn:feargreed');

        // Alpha Engine call — FULL DATA (identical to watchlist/batch)
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
                sma20,
                pcr: alphaPcr,
                gex: alphaGex,
                callWall: directCallWall || alphaCallWall,
                putFloor: directPutFloor || alphaPutFloor,
                gammaFlipLevel: alphaGammaFlip,
                rawChain: rawContracts,
                squeezeScore: alphaSqueezeScore,
                atmIv: structureRes?.atmIv ?? null,
                ivSkew,
                relVol,
                optionsDataAvailable: !!opts,
                preMarketChangePct: null,
                // [V5.5+] MACD Trend Crossover
                macdHistogram: stockData.macdHistogram ?? null,
                // Macro Regime
                ndxChangePct: macroData?.ndxChangePct ?? null,
                vixValue: macroData?.vixValue ?? null,
                vixChangePct: macroData?.vixChangePct ?? null,
                vix3mValue: macroData?.vix3mValue ?? null,  // [V5.5+] VIX Term Structure
                tltChangePct: macroData?.tltChangePct ?? null,
                gldChangePct: macroData?.gldChangePct ?? null,
                dxy: macroData?.dxy ?? null,
                realYieldStance: macroData?.realYieldStance ?? null,
                fearGreedScore: fgData?.score ?? null,
                // Flow data
                darkPoolPct,
                shortVolPct,
                blockTrades: blockTradesCount,
                whaleIndex: whaleIdx,
                netFlow: netPremium,
                // Catalyst
                impliedMovePct,
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
            darkPoolPct: darkPoolPct ?? 0,
            netPremium: structureRes?.netPremium ?? null,
            vwapDist: (stockData.vwap && stockData.price)
                ? Number(((stockData.price - stockData.vwap) / stockData.vwap * 100).toFixed(2))
                : null,
            volume: stockData.volume || null,
            ivSkew: typeof ivSkew === 'object' && ivSkew !== null ? (ivSkew as any).value ?? null : null,
            impliedMovePct: impliedMovePct ?? null,
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

    // ================================================================
    // [V6.0] Entry Zone Detection — Check today's recommendations
    // After warming, check if any recommended stock entered entry zone
    // Store flags in Redis for real-time AlphaCard badge display
    // ================================================================
    let entryCheckCount = 0;
    try {
        const { createClient } = await import('@supabase/supabase-js');
        const { setInCache } = await import('@/services/redisClient');

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // Get today's date in ET
        const { getETNow } = await import('@/services/timezoneUtils');
        const et = getETNow();
        const todayStr = `${et.year}-${String(et.month).padStart(2, '0')}-${String(et.day).padStart(2, '0')}`;

        // Only check during trading hours (9:30-16:00 ET)
        const etTime = et.hour + et.minute / 60;
        if (etTime >= 9.5 && etTime < 16) {
            const { data: todayRecords } = await supabase
                .from('alpha_track_records')
                .select('ticker, entry_zone_lower, entry_zone_upper, is_entry_triggered')
                .eq('recorded_date', todayStr)
                .eq('outcome', 'PENDING');

            if (todayRecords && todayRecords.length > 0) {
                for (const rec of todayRecords) {
                    try {
                        // Fetch current price from Polygon snapshot
                        const snap = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${rec.ticker}`);
                        const currentPrice = snap?.ticker?.lastTrade?.p || snap?.ticker?.min?.c || snap?.ticker?.day?.c || 0;

                        if (currentPrice > 0) {
                            const inZone = currentPrice >= rec.entry_zone_lower && currentPrice <= rec.entry_zone_upper;
                            const belowZone = currentPrice < rec.entry_zone_lower;

                            if (inZone || belowZone) {
                                // Price entered or dropped below entry zone → triggered
                                await setInCache(`entry_triggered:${rec.ticker}:${todayStr}`, true, 86400);
                                entryCheckCount++;
                                console.log(`[WARM] 🟢 ${rec.ticker}: Entry zone triggered! Price=$${currentPrice.toFixed(2)} Zone=$${rec.entry_zone_lower}~$${rec.entry_zone_upper}`);

                                // Also update Supabase if not already triggered
                                if (!rec.is_entry_triggered) {
                                    await supabase
                                        .from('alpha_track_records')
                                        .update({ is_entry_triggered: true })
                                        .eq('ticker', rec.ticker)
                                        .eq('recorded_date', todayStr);
                                }
                            }
                        }
                    } catch (e) { /* skip individual ticker errors */ }
                }
            }
        }
    } catch (e) {
        console.warn('[WARM] Entry zone check failed (non-critical):', e);
    }

    return NextResponse.json({
        success: true,
        cached: succeeded,
        failed,
        total: ALL_TICKERS.length,
        elapsedMs: totalMs,
        avgMs,
        entryZoneTriggered: entryCheckCount,
        failedTickers: results.filter((r: any) => !r.ok).map((r: any) => r.ticker),
    });
}
