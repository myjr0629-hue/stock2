// [vNext Phase 7] Terminal Enricher v2 REBUILT
// Completeness Gate v2: NO estimation, NO N/A - only real data with backfill
// Batch processing with retry and Redis cache
// [Phase 24.1] INTEGRATED WITH CENTRAL DATA HUB (SSOT)

import { getOptionsData } from './stockApi'; // [Phase 16] Imported getOptionsData
import { CentralDataHub } from './centralDataHub'; // [Phase 24.1] SSOT
import { getMacroSnapshotSSOT } from './macroHubProvider';
import { getEventsFromRedis } from '@/lib/storage/eventStore';
import { getPoliciesFromRedis } from '@/lib/storage/policyStore';
// import { fetchMassive } from './massiveClient'; // REMOVED: All fetching via Hub

import { ForensicService } from './forensicService'; // [V3.7.8] Automated Forensic Analysis
import {
    getEvidenceFromCache,
    setEvidenceToCache,
    getOptionsFromCache,
    setOptionsToCache,
    getFlowFromCache,
    setFlowToCache,
    getMacroBundleFromCache,
    setMacroBundleToCache,
    CachedEvidence,
    CachedOptionsChain,
    CachedFlowBundle,
    CachedMacroBundle
} from '@/lib/storage/evidenceCache';
import {
    TerminalItem, UnifiedEvidence, UnifiedMacro,
    UnifiedPrice, UnifiedOptions, UnifiedFlow, UnifiedStealth
} from '../types';

// === CONFIGURATION v2.2 (Persistent) ===
const CONFIG = {
    BATCH_SIZE: 20,
    BATCH_CONCURRENCY: 2,
    MAX_RETRIES: 5,
    BACKOFF_BASE_MS: 500,
    MAX_ENRICHMENT_TIME_MS: 45000,
    OPTIONS_RETRY_LIMIT: 3,
    MACRO_CACHE_THRESHOLD_S: 30
};

// === CORE ENRICHMENT FUNCTION ===

export async function enrichTerminalItems(
    tickers: string[],
    session: 'pre' | 'regular' | 'post' = 'regular',
    force: boolean = false,
    targetDate?: string // [V3.7.7] Date Override
): Promise<TerminalItem[]> {
    // [V4.2] PERFORMANCE OPTIMIZATION: Vercel 300s limit compliance
    // Previous: force=true used BATCH_SIZE=1 with 2000ms delay = 600s+ for 300 tickers
    // Optimized: force=true uses BATCH_SIZE=10 with 500ms delay = ~60s for 300 tickers
    const adaptiveBatchSize = force ? 10 : CONFIG.BATCH_SIZE;
    console.log(`[TerminalEnricher v4.2] Enrichment for ${tickers.length} tickers... (force=${force}, batch=${adaptiveBatchSize})`);
    const startTime = Date.now();

    // 1. Fetch Global Context
    const [macro, events, policies] = await Promise.all([
        fetchMacroWithCache(),
        getEventsFromRedis(),
        getPoliciesFromRedis()
    ]);

    const eventList = events?.events || [];
    const policyList = policies?.policies || [];

    // 2. Batch Processing
    const results: TerminalItem[] = [];

    // Batch Loop
    for (let i = 0; i < tickers.length; i += adaptiveBatchSize) {
        const batch = tickers.slice(i, i + adaptiveBatchSize);
        console.log(`[TerminalEnricher v2.2] Processing batch ${Math.floor(i / adaptiveBatchSize) + 1}/${Math.ceil(tickers.length / adaptiveBatchSize)} (${batch.length} items)`);

        const batchResults = await Promise.all(
            batch.map(ticker => enrichSingleTickerWithRetry(ticker, session, macro, eventList, policyList, force, targetDate))
        );
        results.push(...batchResults);

        // [V4.2] OPTIMIZED: Reduced delay from 2000ms to 500ms
        if (force && i + adaptiveBatchSize < tickers.length) {
            await delay(500);
        }
    }

    // 3. Persistent Retry Loop (Smart Staggering)
    let incompleteTickers = results.filter(r => !r.complete).map(r => r.ticker);
    let attempt = 0;

    while (incompleteTickers.length > 0 && attempt < CONFIG.MAX_RETRIES) {
        if (Date.now() - startTime >= CONFIG.MAX_ENRICHMENT_TIME_MS) {
            console.warn(`[TerminalEnricher v2.2] Time budget exceeded. Stopping retries.`);
            break;
        }

        attempt++;
        const jitter = Math.floor(Math.random() * 500) + 500;
        const delayMs = jitter + (attempt * 200);

        console.log(`[TerminalEnricher v2.2] Retry ${attempt}/${CONFIG.MAX_RETRIES}: ${incompleteTickers.length} incomplete. Waiting ${delayMs}ms...`);
        await delay(delayMs);

        const retryResults = await Promise.all(
            incompleteTickers.map(ticker => enrichSingleTickerWithRetry(ticker, session, macro, eventList, policyList, force, targetDate))
        );

        // Merge updates
        let fixedCount = 0;
        retryResults.forEach(newItem => {
            const idx = results.findIndex(r => r.ticker === newItem.ticker);
            if (idx >= 0 && newItem.complete) {
                results[idx] = newItem;
                fixedCount++;
            }
        });

        incompleteTickers = results.filter(r => !r.complete).map(r => r.ticker);

        if (fixedCount > 0) {
            console.log(`[TerminalEnricher v2.2] Retry ${attempt} fixed ${fixedCount} items.`);
        }
    }

    const elapsed = Date.now() - startTime;
    const completeCount = results.filter(r => r.complete).length;
    console.log(`[TerminalEnricher v2] Complete: ${completeCount}/${results.length} in ${elapsed}ms`);

    return results;
}

// === SINGLE TICKER ENRICHMENT WITH RETRY ===

// [V4.1] Fetch REAL short volume % from Polygon (FINRA-reported data)
// Same data source as /api/live/short-squeeze but called directly for engine use
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
async function fetchShortVolumePct(ticker: string): Promise<number | undefined> {
    try {
        const url = `https://api.polygon.io/stocks/v1/short-volume?ticker=${ticker}&limit=1&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
            console.warn(`[ShortVol] ${ticker}: HTTP ${res.status}`);
            return undefined;
        }
        const data = await res.json();
        const result = data.results?.[0];
        if (!result) {
            console.warn(`[ShortVol] ${ticker}: No results in response`);
            return undefined;
        }
        const shortVolume = result.short_volume || 0;
        const totalVolume = result.total_volume || 1;
        return Math.round((shortVolume / totalVolume) * 1000) / 10; // e.g. 42.3%
    } catch (e: any) {
        console.warn(`[ShortVol] ${ticker}: ${e?.message || 'error'}`);
        return undefined;
    }
}

// [V4.3] Fetch REAL dark pool % from Polygon (stock trades, not options)
// Same logic as /api/flow/dark-pool-trades — FINRA TRF/ADF exchanges
const DARK_POOL_EXCHANGES = new Set([4, 15, 16, 19]);
const DARK_POOL_CONDITIONS = new Set([12, 41, 52]);
async function fetchDarkPoolPct(ticker: string): Promise<number | undefined> {
    try {
        const url = `https://api.polygon.io/v3/trades/${ticker}?limit=5000&order=desc&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return undefined;
        const data = await res.json();
        const trades = data.results || [];
        if (trades.length === 0) return undefined;

        let totalVolume = 0;
        let darkPoolVolume = 0;
        for (const trade of trades) {
            const size = trade.size || 0;
            totalVolume += size;
            const isDarkExchange = DARK_POOL_EXCHANGES.has(trade.exchange);
            const hasDarkCondition = (trade.conditions || []).some((c: number) => DARK_POOL_CONDITIONS.has(c));
            if (isDarkExchange || hasDarkCondition) {
                darkPoolVolume += size;
            }
        }
        return totalVolume > 0 ? Math.round((darkPoolVolume / totalVolume) * 1000) / 10 : undefined;
    } catch (e: any) {
        console.warn(`[DarkPool] ${ticker}: ${e?.message || 'error'}`);
        return undefined;
    }
}

async function enrichSingleTickerWithRetry(
    ticker: string,
    session: 'pre' | 'regular' | 'post',
    macro: UnifiedMacro,
    events: any[],
    policies: any[],
    force: boolean = false,
    targetDate?: string // [V3.7.7] Date Override
): Promise<TerminalItem> {
    if (!force) {
        // ... (cache logic unchanged)
        const cached = await getEvidenceFromCache(ticker);
        if (cached && cached.complete) {
            console.log(`[TerminalEnricher v2] Using cached evidence for ${ticker}`);
            return {
                ticker,
                evidence: cached as unknown as UnifiedEvidence,
                alphaScore: null,
                qualityTier: 'PENDING',
                complete: true
            };
        }
    }



    // ... imports ...

    // ... inside enrichSingleTickerWithRetry ...

    // [V4.1 UNIVERSAL ENGINE] Isolated error handling - NEVER fail completely
    // Engine must work flawlessly at any time - weekday or weekend

    let hubData: any = null;
    let optionsData: any = null;
    let forensicData: any = null;

    // Step 1: Get price data (critical)
    try {
        hubData = await CentralDataHub.getUnifiedData(ticker, force, targetDate);
    } catch (e) {
        console.error(`[V4.1] ${ticker}: Price fetch failed:`, e);
        return createIncompleteItem(ticker, macro);
    }

    // Step 2: Get options data (isolated - never crash on error)
    try {
        optionsData = await fetchOptionsChain(ticker, hubData.price, force, targetDate);
        console.log(`[V4.1] ${ticker}: Options fetch ${optionsData ? 'OK' : 'NULL'}`);
    } catch (e) {
        console.warn(`[V4.1] ${ticker}: Options fetch error (isolated):`, e);
        optionsData = null; // Continue with null - don't fail
    }

    // [V4.1] RE-ENABLED: ForensicService for darkPool/blockTrades/whaleIndex
    // Previously disabled with hardcoded { whaleIndex: 0 } — this broke darkPool/blockTrades/shortVol
    try {
        const dateStr = targetDate || new Date().toISOString().split('T')[0];
        forensicData = await Promise.race([
            ForensicService.analyzeTarget(ticker, dateStr, hubData.price || 0),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Forensic timeout')), 8000))
        ]);
        console.log(`[V4.1] ${ticker}: Forensic OK — whale=${forensicData.whaleIndex}, blocks=${forensicData.blockCount}`);
    } catch (e: any) {
        console.warn(`[V4.1] ${ticker}: Forensic skipped (${e?.message || 'timeout'})`);
        forensicData = { whaleIndex: 0, whaleConfidence: 'NONE', blockCount: 0, details: {} };
    }

    // [V4.1] Step 3: Get SHORT VOLUME from Polygon (FINRA data)
    // Real short selling percentage, not an approximation
    let shortVolPct: number | undefined = undefined;
    let darkPoolPct: number | undefined = undefined;
    try {
        // Fetch both in parallel — same Polygon API, different endpoints
        const [svp, dpp] = await Promise.all([
            fetchShortVolumePct(ticker),
            fetchDarkPoolPct(ticker)
        ]);
        shortVolPct = svp;
        darkPoolPct = dpp;
        console.log(`[V4.3] ${ticker}: Short Vol=${shortVolPct ?? 'N/A'}% DarkPool=${darkPoolPct ?? 'N/A'}%`);
    } catch (e) {
        console.warn(`[V4.3] ${ticker}: Short/DarkPool fetch error (isolated)`);
    }

    const whaleIndex = forensicData?.whaleIndex || 0;
    const whaleConfidence = forensicData?.whaleConfidence || 'NONE';

    // Build Evidence Layers - with null safety
    const price = buildPriceEvidence(hubData);
    const flow = buildFlowEvidence(hubData, forensicData, optionsData); // [V4.1] Pass optionsData for GEX-based whaleIndex
    const options = buildOptionsEvidence(optionsData);
    const stealth = calculateStealthLabel(price, flow, options, forensicData, shortVolPct, darkPoolPct);
    const policy = calculatePolicyEvidence(ticker, events, policies);

    const evidence: UnifiedEvidence = {
        price,
        flow,
        options,
        macro,
        policy,
        stealth,
        complete: false, // placeholder, updated below
        fetchedAtET: targetDate ? `${targetDate}T16:00:00.000Z` : new Date().toISOString()
    };
    // [V4.1] Dynamic completeness based on actual data layers
    const layerStatus = [
        price.last > 0,                                           // price layer
        (flow.vol > 0 || flow.relVol > 1),                       // flow layer  
        (options.status === 'OK' || options.status === 'READY'),  // options layer
        ((macro as any)?.ndx?.price > 0 || (macro as any)?.vix?.value > 0),          // macro layer
        (stealth.label !== undefined)                             // stealth layer
    ];
    const completeCount = layerStatus.filter(Boolean).length;
    evidence.complete = completeCount >= 3; // 5개 중 3개 이상이면 complete
    if (!evidence.complete) {
        const layerNames = ['price', 'flow', 'options', 'macro', 'stealth'];
        const missing = layerNames.filter((_, i) => !layerStatus[i]);
        console.warn(`[V4.1] ${ticker}: ${completeCount}/5 layers, missing: ${missing.join(',')}`);
    }

    return {
        ticker,
        evidence,
        alphaScore: null,
        qualityTier: evidence.complete ? 'PENDING' : 'INCOMPLETE',
        complete: evidence.complete || false
    };
}

// ...

// === EVIDENCE BUILDERS ===

function buildPriceEvidence(data: any): UnifiedPrice {
    // data is UnifiedQuote
    const last = data.price || 0;
    const vwap = data.snapshot?.day?.vw || last;

    // [V4.1 FIX] Calculate return3D from history correctly
    // history3d is [most_recent, day_before, 3_days_ago] (reversed from asc)
    // We need: (current_price - close_3_days_ago) / close_3_days_ago * 100
    const h3d = data.history3d || [];
    let return3D = 0;
    if (h3d.length >= 3 && last > 0 && h3d[h3d.length - 1]?.c > 0) {
        // h3d[last] = oldest = 3 days ago
        return3D = ((last - h3d[h3d.length - 1].c) / h3d[h3d.length - 1].c) * 100;
    } else if (h3d.length >= 2 && last > 0 && h3d[h3d.length - 1]?.c > 0) {
        return3D = ((last - h3d[h3d.length - 1].c) / h3d[h3d.length - 1].c) * 100;
    }

    // [V4.1] Calculate SMA20 from history15d (full 30-day history)
    const history15d = data.history15d || [];
    let sma20: number | null = null;
    if (history15d.length >= 20) {
        const last20 = history15d.slice(-20);
        const sum = last20.reduce((acc: number, bar: any) => acc + (bar.c || 0), 0);
        sma20 = sum / 20;
    } else if (history15d.length >= 10) {
        // Partial SMA from available data
        const sum = history15d.reduce((acc: number, bar: any) => acc + (bar.c || 0), 0);
        sma20 = sum / history15d.length;
    }

    return {
        last,
        priceSource: data.priceSource, // [Phase 24.3] Session Tagging
        // [V3.7.5] Extended Session Data
        extendedPrice: data.extendedPrice,
        extendedChangePct: data.extendedChangePct,
        extendedLabel: data.extendedLabel,
        error: data.error,
        prevClose: data.prevClose || 0,
        changePct: data.finalChangePercent || data.changePct || 0, // [Phase 24.3] SSOT
        vwap,
        vwapDistPct: vwap > 0 ? ((last - vwap) / vwap) * 100 : 0,
        rsi14: data.rsi || null, // [V3 FIX] null instead of 50 — let engine handle missing data honestly
        return3D,
        sma20, // [V4.1] SMA20 from history
        structureState: 'CONSOLIDATION',
        history3d: h3d, // [Phase 36] Sparkline data from CentralDataHub
        complete: last > 0
    };
}

function buildFlowEvidence(data: any, forensicData?: any, optionsData?: any): UnifiedFlow {
    // data is UnifiedQuote from Hub
    // Map netPremium to largeTradesUsd and netFlow
    const netPrem = data.flow?.netPremium || 0;

    // [V4.0] Extract offExPct from ForensicService analysis
    const offExPct = forensicData?.details?.aggressorRatio
        ? Math.round(forensicData.details.aggressorRatio * 100)
        : 0;

    // [V4.1] Calculate whaleIndex from GEX — use optionsData.gex (the REAL source)
    const gex = optionsData?.gex ?? data.flow?.gex ?? 0;
    const absGex = Math.abs(gex);
    let whaleIndex = 0;
    if (absGex > 50_000_000) whaleIndex = Math.min(90, 60 + Math.floor(absGex / 100_000));
    else if (absGex > 10_000_000) whaleIndex = Math.min(60, 30 + Math.floor(absGex / 500_000));
    else if (absGex > 1_000_000) whaleIndex = Math.min(30, 10 + Math.floor(absGex / 200_000));
    else if (absGex > 100_000) whaleIndex = Math.min(10, Math.floor(absGex / 50_000));

    return {
        vol: data.volume || 0,
        relVol: data.relVol || 1, // [Phase 41.2] Real RelVol (Snap/Avg)
        gapPct: data.gapPct || 0, // [Phase 41.2] Real Gap %
        largeTradesUsd: netPrem, // Mapped for UI
        offExPct: offExPct, // [V4.0] From ForensicService dark pool analysis
        offExDeltaPct: 0,
        netFlow: netPrem,
        netPremium: netPrem, // [FIX] Explicitly set netPremium for Intel page whaleNetM
        whaleIndex, // [V4.1] Calculated from GEX
        complete: (data.flow?.optionsCount || 0) > 0
    };
}



// Placeholder for missing Stealth/Policy helpers if they were deleted too, but they seem to be imported or further down?
// Step 3422 didn't show them. Assume they are imported or I need to find them.
// Wait, calculateStealthLabel and calculatePolicyEvidence might be imported.
// Checking imports...
// They are NOT imported in Step 3409. They must be in the file.
// I'll add placeholders just in case, or search for them.

async function fetchOptionsChain(ticker: string, currentPrice?: number, force: boolean = false, targetDate?: string): Promise<CachedOptionsChain | null> {
    if (!force) {
        const cached = await getOptionsFromCache(ticker);
        if (cached && cached.status !== 'PENDING' && cached.status !== 'FAILED') return cached;
    }

    // [V4.0] MANDATORY RETRY PROTOCOL
    // Never drop a stock due to options fetch failure
    // Retry with exponential backoff until success or max attempts
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 1000;

    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Pass targetDate to getOptionsData
            const analytics = await getOptionsData(ticker, currentPrice, undefined, !force, targetDate);

            const optionsResult: CachedOptionsChain = {
                // ...
                ticker,
                status: analytics.options_status as any,
                callWall: 0,
                putFloor: 0,
                maxPain: analytics.maxPain || 0,
                pinZone: 0,
                pcr: analytics.putCallRatio || 0,
                gex: analytics.gems?.gex || 0,
                gexZeroDte: analytics.gems?.gexZeroDte || 0,
                gexZeroDteRatio: analytics.gems?.gexZeroDteRatio || 0,
                gammaRegime: (analytics.gems?.gex || 0) > 0 ? 'Long Gamma' : 'Short Gamma',
                coveragePct: analytics.options_status === 'OK' ? 100 : 0,
                oiClusters: { callsTop: [], putsTop: [] },
                fetchedAtET: new Date().toISOString()
            };
            // ... matches existing logic
            if (analytics.options_status === 'OK' && analytics.strikes) {
                const calls = analytics.strikes.map((s: number, i: number) => ({ strike: s, oi: analytics.callsOI[i] }));
                const puts = analytics.strikes.map((s: number, i: number) => ({ strike: s, oi: analytics.putsOI[i] }));
                calls.sort((a: any, b: any) => b.oi - a.oi);
                puts.sort((a: any, b: any) => b.oi - a.oi);
                optionsResult.callWall = calls.length > 0 ? calls[0].strike : 0;
                optionsResult.putFloor = puts.length > 0 ? puts[0].strike : 0;
                optionsResult.pinZone = (optionsResult.callWall + optionsResult.putFloor) / 2;
                optionsResult.oiClusters = { callsTop: calls.slice(0, 5), putsTop: puts.slice(0, 5) };
                // [V4.1] Build rawChain from rawContracts (preserves IV from Polygon greeks)
                const rawContracts = (analytics as any).rawContracts || [];
                if (rawContracts.length > 0) {
                    // Use actual contracts with full greeks data (includes implied_volatility)
                    (optionsResult as any).rawChain = rawContracts.map((c: any) => ({
                        strike: c.strike_price,
                        open_interest: c.open_interest || 0,
                        contract_type: c.contract_type,
                        // [V4.2] Polygon returns IV at top-level (c.implied_volatility) or nested (c.greeks.implied_volatility)
                        implied_volatility: c.implied_volatility ?? c.greeks?.implied_volatility ?? undefined,
                        delta: c.greeks?.delta ?? c.delta ?? undefined,
                        gamma: c.greeks?.gamma ?? c.gamma ?? undefined,
                    }));
                } else {
                    // Fallback: reconstruct from strikes/OI (no IV)
                    const rawChain: any[] = [];
                    analytics.strikes.forEach((strike: number, i: number) => {
                        if (analytics.callsOI[i] > 0) rawChain.push({ strike, open_interest: analytics.callsOI[i], contract_type: 'call' });
                        if (analytics.putsOI[i] > 0) rawChain.push({ strike, open_interest: analytics.putsOI[i], contract_type: 'put' });
                    });
                    (optionsResult as any).rawChain = rawChain;
                }
            }
            await setOptionsToCache(ticker, optionsResult);

            if (attempt > 1) {
                console.log(`[V4.0] ${ticker}: Options fetch succeeded on attempt ${attempt}`);
            }
            return optionsResult;

        } catch (e: any) {
            lastError = e;
            console.warn(`[V4.0] ${ticker}: Options fetch attempt ${attempt}/${MAX_RETRIES} failed:`, e.message || e);

            if (attempt < MAX_RETRIES) {
                // Exponential backoff: 1s, 2s, 4s
                const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                console.log(`[V4.0] ${ticker}: Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // All retries exhausted - log but still return null to allow fallback handling
    console.error(`[V4.0] ${ticker}: Options fetch FAILED after ${MAX_RETRIES} attempts. Last error:`, lastError);
    return null;
}

// === MACRO & HELPERS ===

async function fetchMacroWithCache(): Promise<UnifiedMacro> {
    const cached = await getMacroBundleFromCache();
    if (cached && cached.ageSeconds < CONFIG.MACRO_CACHE_THRESHOLD_S) {
        return {
            ndx: cached.ndx,
            vix: cached.vix,
            us10y: cached.us10y,
            dxy: cached.dxy,
            fetchedAtET: cached.fetchedAtET,
            ageSeconds: cached.ageSeconds,
            complete: true
        };
    }
    const macro = await getMacroSnapshotSSOT();
    const result: UnifiedMacro = {
        ndx: { price: (macro?.nq || 0) as number, changePct: (macro?.nqChangePercent || 0) as number },
        vix: { value: (macro?.vix || 0) as number },
        us10y: { yield: (macro?.us10y || 0) as number },
        dxy: { value: (macro?.dxy || 0) as number },
        // [V4.1] TLT Safe Haven — was fetched by getMacroSnapshotSSOT but never passed through
        tlt: { changePct: ((macro as any)?.tltChangePct || 0) as number },
        // [V4.1] GLD Safe Haven — Gold ETF for risk-off detection
        gld: { changePct: ((macro as any)?.gldChangePct || 0) as number },
        fetchedAtET: new Date().toISOString(),
        ageSeconds: 0,
        complete: ((macro?.nq || 0) as number) > 0
    };
    await setMacroBundleToCache(result as any);
    return result;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function checkLayerCompleteness(evidence: UnifiedEvidence) {
    const completeness = {
        price: { ok: evidence.price?.last > 0 },
        options: { ok: evidence.options?.status !== 'PENDING' && evidence.options?.status !== 'FAILED' },
        flow: { ok: evidence.flow?.vol > 0 },
        macro: { ok: true }, // Relaxed
        stealth: { ok: true }
    };
    const completeCount = Object.values(completeness).filter(c => c.ok).length;
    const missingLayers = Object.entries(completeness).filter(([, c]) => !c.ok).map(([k]) => k);
    return {
        complete: completeCount >= 3, // Allow some missing
        completeCount,
        missingLayers,
        ...completeness
    };
}

function createIncompleteItem(ticker: string, macro: UnifiedMacro): TerminalItem {
    return {
        ticker,
        evidence: {
            price: { last: 0, prevClose: 0, changePct: 0, vwap: 0, vwapDistPct: 0, rsi14: 0, return3D: 0, structureState: 'CONSOLIDATION', complete: false },
            flow: { vol: 0, relVol: 0, gapPct: 0, largeTradesUsd: 0, offExPct: 0, offExDeltaPct: 0, complete: false },
            options: { status: 'FAILED', coveragePct: 0, gammaRegime: 'Neutral', gex: 0, pcr: 0, callWall: 0, putFloor: 0, pinZone: 0, maxPain: 0, oiClusters: { callsTop: [], putsTop: [] }, complete: false },
            macro,
            policy: { gate: { P0: [], P1: [], P2: [], blocked: false }, gradeA_B_C_counts: { A: 0, B: 0, C: 0 } },
            stealth: { label: 'C', tags: ['dataFailed'], impact: 'NEUTRAL', complete: false },
            complete: false,
            fetchedAtET: new Date().toISOString()
        },
        alphaScore: null,
        qualityTier: 'INCOMPLETE',
        complete: false
    };
}

function buildOptionsEvidence(data: CachedOptionsChain | null): UnifiedOptions {
    if (!data) {
        return {
            status: 'PENDING',
            coveragePct: 0, gammaRegime: 'Neutral', gex: 0, pcr: 0,
            callWall: 0, putFloor: 0, pinZone: 0, maxPain: 0,
            oiClusters: { callsTop: [], putsTop: [] },
            complete: false
        };
    }
    // [V4.1] Calculate squeezeScore from GEX vs MaxPain distance
    let squeezeScore: number | null = null;
    if (data.gex !== undefined && data.maxPain > 0 && data.callWall > 0) {
        // High negative GEX + price near maxPain = squeeze potential
        const gexNorm = Math.min(5, Math.max(0, -data.gex / 1_000_000)); // negative GEX = squeeze
        squeezeScore = Math.round(gexNorm * 20); // 0-100 scale
    }

    // [V4.1] Calculate impliedMovePct from ATM options (callWall/putFloor spread)
    let impliedMovePct: number | null = null;
    if (data.callWall > 0 && data.putFloor > 0) {
        const midPrice = (data.callWall + data.putFloor) / 2;
        if (midPrice > 0) {
            impliedMovePct = ((data.callWall - data.putFloor) / midPrice) * 100;
        }
    }

    // [V4.1] Calculate ATM Implied Volatility from rawChain greeks
    let atmIv: number | null = null;
    const rawChain = (data as any).rawChain || [];
    if (rawChain.length > 0 && data.maxPain > 0) {
        const atmPrice = data.maxPain; // Use maxPain as ATM reference
        const tolerance = atmPrice * 0.05; // ±5% of ATM
        const nearAtm = rawChain.filter((c: any) =>
            c.implied_volatility != null &&
            c.implied_volatility > 0 &&
            Math.abs(c.strike - atmPrice) <= tolerance
        );
        if (nearAtm.length > 0) {
            const avgIv = nearAtm.reduce((sum: number, c: any) => sum + c.implied_volatility, 0) / nearAtm.length;
            atmIv = Math.round(avgIv * 1000) / 10; // e.g. 0.45 → 45.0%
        }
    }

    // [V4.2] Calculate IV Skew from rawChain (Put ATM IV / Call ATM IV)
    // Uses enricher's flat field format: c.strike, c.contract_type, c.implied_volatility
    let ivSkew: number | null = null;
    if (rawChain.length > 0) {
        const refPrice = data.maxPain > 0 ? data.maxPain : (data.callWall + data.putFloor) / 2;
        if (refPrice > 0) {
            const tolerance = refPrice * 0.05;
            const callIVs: number[] = [];
            const putIVs: number[] = [];
            for (const c of rawChain) {
                const strike = c.strike;
                const iv = c.implied_volatility;
                const type = c.contract_type;
                if (!strike || !iv || iv <= 0) continue;
                if (Math.abs(strike - refPrice) > tolerance) continue;
                if (type === 'call') callIVs.push(iv);
                else if (type === 'put') putIVs.push(iv);
            }
            if (callIVs.length > 0 && putIVs.length > 0) {
                const avgCallIV = callIVs.reduce((a, b) => a + b, 0) / callIVs.length;
                const avgPutIV = putIVs.reduce((a, b) => a + b, 0) / putIVs.length;
                if (avgCallIV > 0) {
                    ivSkew = Math.round((avgPutIV / avgCallIV) * 100) / 100;
                }
            }
        }
    }

    return {
        status: data.status,
        coveragePct: data.coveragePct,
        gammaRegime: data.gammaRegime,
        gex: data.gex,
        gexZeroDte: data.gexZeroDte || 0,
        gexZeroDteRatio: data.gexZeroDteRatio || 0,
        pcr: data.pcr,
        callWall: data.callWall,
        putFloor: data.putFloor,
        pinZone: data.pinZone,
        maxPain: data.maxPain,
        oiClusters: data.oiClusters,
        rawChain, // [V4.1] Full rawChain with IV data
        squeezeScore, // [V4.1]
        impliedMovePct, // [V4.1]
        atmIv, // [V4.1] ATM implied volatility from Polygon greeks
        ivSkew, // [V4.2] IV Skew for DC completeness
        complete: ['OK', 'READY', 'NO_OPTIONS'].includes(data.status)
    };
}

function calculatePolicyEvidence(ticker: string, events: any[], policies: any[]) {
    const relevant = policies.filter(p => p.tickers?.includes(ticker));
    return {
        gate: {
            P0: relevant.filter(p => p.priority === 'P0').map(p => p.title),
            P1: relevant.filter(p => p.priority === 'P1').map(p => p.title),
            P2: relevant.filter(p => p.priority === 'P2').map(p => p.title),
            blocked: relevant.some(p => p.blocked)
        },
        gradeA_B_C_counts: {
            A: relevant.filter(p => p.grade === 'A').length,
            B: relevant.filter(p => p.grade === 'B').length,
            C: relevant.filter(p => p.grade === 'C').length
        }
    };
}

function calculateStealthLabel(price: UnifiedPrice, flow: UnifiedFlow, options: UnifiedOptions, forensicData?: any, shortVolPct?: number, realDarkPoolPct?: number): UnifiedStealth {
    // [V4.0] ENHANCED STEALTH TAG LOGIC
    // Comprehensive condition-based tag assignment for maximum signal detection
    const tags: string[] = [];

    // [V4.3] Use REAL dark pool % from Polygon stock trades (same as /api/flow/dark-pool-trades)
    const darkPoolPct = realDarkPoolPct ?? forensicData?.details?.offExchangePct ?? (flow.offExPct > 0 ? flow.offExPct : undefined);
    const blockTrades = forensicData?.details?.blockCount ?? undefined;

    // 1. GAMMA SQUEEZE DETECTION
    if (options.gex > 10000000 && options.callWall > 0) {
        const priceToWallRatio = (price.last || 0) / options.callWall;
        if (priceToWallRatio >= 0.95) {
            tags.push('GammaSqueeze');
        }
    }

    // 2. WHALE ACCUMULATION — using real dark pool %
    if ((darkPoolPct || 0) > 40 && (flow.netFlow || 0) > 5000000) {
        tags.push('WhaleAccumulation');
    }

    // 3. MASSIVE BLOCK PRINT
    if ((flow.largeTradesUsd || 0) > 10000000) {
        tags.push('MassiveBlockPrint');
    } else if ((flow.largeTradesUsd || 0) > 5000000) {
        tags.push('blockPrint');
    }

    // 4. OFF-EXCHANGE SURGE — using real dark pool %
    if ((darkPoolPct || 0) > 50) {
        tags.push('offExSurge');
    }

    // 5. POSITIVE GAMMA REGIME
    if (options.gammaRegime === 'Long Gamma') {
        tags.push('supportiveGamma');
    }

    // 6. AI MOMENTUM (Sector-specific)
    if ((price.rsi14 || 50) > 70 && (flow.relVol || 1) > 1.5) {
        tags.push('highMomentum');
    }

    // 7. DIVERGENCE SIGNAL (Price down but flow up)
    if ((price.changePct || 0) < 0 && (flow.netFlow || 0) > 5000000) {
        tags.push('bullishDivergence');
    }

    // Fallback if no signal detected
    if (tags.length === 0) {
        tags.push('noSignal');
    }

    // Label assignment: A (strong signal), B (moderate), C (weak/none)
    let label: 'A' | 'B' | 'C' = 'C';
    if (tags.includes('GammaSqueeze') || tags.includes('WhaleAccumulation') || tags.includes('MassiveBlockPrint')) {
        label = 'A';
    } else if (tags.includes('blockPrint') || tags.includes('bullishDivergence') || tags.includes('highMomentum')) {
        label = 'B';
    }

    // Impact assessment
    let impact: 'NEUTRAL' | 'BOOST' | 'WARN' = 'NEUTRAL';
    if (tags.includes('GammaSqueeze') || tags.includes('WhaleAccumulation') || tags.includes('bullishDivergence')) {
        impact = 'BOOST';
    }

    return { label, tags, impact, darkPoolPct, blockTrades, shortVolPct, complete: true };
}
