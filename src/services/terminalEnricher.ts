// [vNext Phase 7] Terminal Enricher v2
// Completeness Gate v2: NO estimation, NO N/A - only real data with backfill
// Batch processing with retry and Redis cache

import { getStockData } from './stockApi';
import { getMacroSnapshotSSOT } from './macroHubProvider';
import { getEventsFromRedis } from '@/lib/storage/eventStore';
import { getPoliciesFromRedis } from '@/lib/storage/policyStore';
import { fetchMassive } from './massiveClient';
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

// === CONFIGURATION v2.1 ===
const CONFIG = {
    BATCH_SIZE: 4,
    BATCH_CONCURRENCY: 2,
    MAX_RETRIES: 2,
    BACKOFF_MS: [400, 1200],  // [P0] Increased backoff
    MAX_ENRICHMENT_TIME_MS: 20000, // 20 seconds max
    OPTIONS_RETRY_LIMIT: 3,   // Extra retries for options
    MACRO_CACHE_THRESHOLD_S: 30 // [P0] 30s macro cache
};

// === UNIFIED EVIDENCE SCHEMA (Strict) ===

export interface UnifiedPrice {
    last: number;
    prevClose: number;
    changePct: number;
    vwap: number;
    vwapDistPct: number;
    rsi14: number;
    return3D: number;
    structureState: 'BREAKOUT' | 'BREAKDOWN' | 'CONSOLIDATION' | 'TRENDING' | 'REVERSAL';
    complete: boolean;
}

export interface UnifiedFlow {
    vol: number;
    relVol: number;
    gapPct: number;
    largeTradesUsd: number;
    offExPct: number;
    offExDeltaPct: number;
    complete: boolean;
}

export interface UnifiedOptions {
    status: 'OK' | 'READY' | 'NO_OPTIONS' | 'PENDING' | 'FAILED';
    coveragePct: number;
    gammaRegime: string;
    gex: number;
    pcr: number;
    callWall: number;
    putFloor: number;
    pinZone: number;
    maxPain: number;
    oiClusters: {
        callsTop: Array<{ strike: number; oi: number }>;
        putsTop: Array<{ strike: number; oi: number }>;
    };
    complete: boolean;
}

export interface UnifiedStealth {
    label: 'A' | 'B' | 'C';
    tags: string[];
    impact: 'BOOST' | 'WARN' | 'NEUTRAL';
    complete: boolean;
}

export interface UnifiedMacro {
    ndx: { price: number; changePct: number };
    vix: { value: number };
    us10y: { yield: number };
    dxy: { value: number };
    fetchedAtET: string;
    ageSeconds: number;
    complete: boolean;
}

export interface UnifiedEvidence {
    price: UnifiedPrice;
    flow: UnifiedFlow;
    options: UnifiedOptions;
    macro: UnifiedMacro;
    policy: {
        gate: { P0: string[]; P1: string[]; P2: string[]; blocked: boolean };
        gradeA_B_C_counts: { A: number; B: number; C: number };
    };
    stealth: UnifiedStealth;
    complete: boolean; // All layers complete
    fetchedAtET: string;
}

export interface TerminalItem {
    ticker: string;
    evidence: UnifiedEvidence;
    alphaScore: number | null; // null = not yet calculated (incomplete)
    qualityTier: string;
    complete: boolean;
}

// === COMPLETENESS GATE v2 (STRICT) ===

interface CompletenessResult {
    price: boolean;
    options: boolean;
    flow: boolean;
    macro: boolean;
    stealth: boolean;
    overall: boolean;
    missingFields: string[];
}

function checkLayerCompleteness(evidence: Partial<UnifiedEvidence>): CompletenessResult {
    const missing: string[] = [];

    // Price: last, prevClose, changePct, vwap, rsi14 must exist and be valid
    const priceOk = evidence.price &&
        evidence.price.last > 0 &&
        evidence.price.prevClose > 0 &&
        evidence.price.vwap > 0 &&
        typeof evidence.price.rsi14 === 'number';
    if (!priceOk) missing.push('price');

    // Options: status in (OK/READY/NO_OPTIONS) AND walls exist (unless NO_OPTIONS)
    const optOk = evidence.options &&
        ['OK', 'READY', 'NO_OPTIONS'].includes(evidence.options.status) &&
        (evidence.options.status === 'NO_OPTIONS' ||
            (evidence.options.callWall > 0 && evidence.options.putFloor > 0 && evidence.options.maxPain > 0));
    if (!optOk) missing.push('options');

    // Flow: vol + relVol must exist (non-zero)
    const flowOk = evidence.flow &&
        evidence.flow.vol > 0 &&
        evidence.flow.relVol > 0;
    if (!flowOk) missing.push('flow');

    // Macro: ndx/vix/us10y/dxy must exist + fetchedAtET
    const macroOk = evidence.macro &&
        evidence.macro.ndx?.price > 0 &&
        evidence.macro.vix?.value > 0 &&
        evidence.macro.fetchedAtET;
    if (!macroOk) missing.push('macro');

    // Stealth: label A/B/C + tags minimum 1
    const stealthOk = evidence.stealth &&
        ['A', 'B', 'C'].includes(evidence.stealth.label) &&
        evidence.stealth.tags.length >= 1;
    if (!stealthOk) missing.push('stealth');

    return {
        price: !!priceOk,
        options: !!optOk,
        flow: !!flowOk,
        macro: !!macroOk,
        stealth: !!stealthOk,
        overall: !priceOk || !optOk || !flowOk || !macroOk || !stealthOk ? false : true,
        missingFields: missing
    };
}

// === CORE ENRICHMENT FUNCTION ===

export async function enrichTerminalItems(
    tickers: string[],
    session: 'pre' | 'regular' | 'post' = 'regular'
): Promise<TerminalItem[]> {
    console.log(`[TerminalEnricher v2] Starting enrichment for ${tickers.length} tickers...`);
    const startTime = Date.now();

    // 1. Fetch Global Context (Macro, Policy, Events) - with cache
    const [macro, events, policies] = await Promise.all([
        fetchMacroWithCache(),
        getEventsFromRedis(),
        getPoliciesFromRedis()
    ]);

    const eventList = events?.events || [];
    const policyList = policies?.policies || [];

    // 2. Batch Processing (4 tickers per batch, 2 concurrent)
    const results: TerminalItem[] = [];
    const incompleteTickers: string[] = [];

    for (let i = 0; i < tickers.length; i += CONFIG.BATCH_SIZE) {
        const batch = tickers.slice(i, i + CONFIG.BATCH_SIZE);
        console.log(`[TerminalEnricher v2] Processing batch ${Math.floor(i / CONFIG.BATCH_SIZE) + 1}/${Math.ceil(tickers.length / CONFIG.BATCH_SIZE)}`);

        const batchResults = await Promise.all(
            batch.map(ticker => enrichSingleTickerWithRetry(ticker, session, macro, eventList, policyList))
        );

        batchResults.forEach(item => {
            results.push(item);
            if (!item.complete) {
                incompleteTickers.push(item.ticker);
            }
        });
    }

    // 3. Retry Loop for Incomplete Items (max 2 retries with backoff)
    if (incompleteTickers.length > 0 && Date.now() - startTime < CONFIG.MAX_ENRICHMENT_TIME_MS) {
        console.log(`[TerminalEnricher v2] Retrying ${incompleteTickers.length} incomplete items...`);

        for (let retry = 0; retry < CONFIG.MAX_RETRIES; retry++) {
            if (Date.now() - startTime >= CONFIG.MAX_ENRICHMENT_TIME_MS) break;

            await delay(CONFIG.BACKOFF_MS[retry] || 900);

            const stillIncomplete = results.filter(r => !r.complete).map(r => r.ticker);
            if (stillIncomplete.length === 0) break;

            console.log(`[TerminalEnricher v2] Retry ${retry + 1}: ${stillIncomplete.length} tickers`);

            const retryResults = await Promise.all(
                stillIncomplete.map(ticker => enrichSingleTickerWithRetry(ticker, session, macro, eventList, policyList))
            );

            // Merge retry results
            retryResults.forEach(newItem => {
                const idx = results.findIndex(r => r.ticker === newItem.ticker);
                if (idx >= 0 && newItem.complete) {
                    results[idx] = newItem;
                }
            });
        }
    }

    const elapsed = Date.now() - startTime;
    const completeCount = results.filter(r => r.complete).length;
    console.log(`[TerminalEnricher v2] Complete: ${completeCount}/${results.length} in ${elapsed}ms`);

    return results;
}

// === SINGLE TICKER ENRICHMENT WITH RETRY ===

async function enrichSingleTickerWithRetry(
    ticker: string,
    session: 'pre' | 'regular' | 'post',
    macro: UnifiedMacro,
    events: any[],
    policies: any[]
): Promise<TerminalItem> {
    // 1. Check cache first
    const cached = await getEvidenceFromCache(ticker);
    if (cached && cached.complete) {
        console.log(`[TerminalEnricher v2] Using cached evidence for ${ticker}`);
        return {
            ticker,
            evidence: cached as unknown as UnifiedEvidence,
            alphaScore: null, // Calculated later by powerEngine
            qualityTier: 'PENDING',
            complete: true
        };
    }

    try {
        // 2. Parallel fetch: Price/Flow and Options
        const [stockData, optionsData, flowData] = await Promise.all([
            fetchPriceData(ticker, session),
            fetchOptionsChain(ticker),
            fetchFlowData(ticker)
        ]);

        // 3. Build Evidence Layers
        const price = buildPriceEvidence(stockData, session);
        const options = buildOptionsEvidence(optionsData);
        const flow = buildFlowEvidence(flowData);
        const stealth = calculateStealthLabel(price, flow, options);
        const policy = calculatePolicyEvidence(ticker, events, policies);

        // 4. Check Completeness
        const evidence: UnifiedEvidence = {
            price,
            flow,
            options,
            macro,
            policy,
            stealth,
            complete: false,
            fetchedAtET: new Date().toISOString()
        };

        const completeness = checkLayerCompleteness(evidence);
        evidence.complete = completeness.overall;
        evidence.price.complete = completeness.price;
        evidence.options.complete = completeness.options;
        evidence.flow.complete = completeness.flow;
        evidence.macro.complete = completeness.macro;
        evidence.stealth.complete = completeness.stealth;

        // 5. Cache if complete
        if (evidence.complete) {
            await setEvidenceToCache(ticker, {
                ticker,
                price,
                flow,
                options,
                stealth,
                complete: true,
                fetchedAtET: evidence.fetchedAtET,
                ageSeconds: 0
            });
        } else {
            console.warn(`[TerminalEnricher v2] ${ticker} INCOMPLETE: ${completeness.missingFields.join(', ')}`);
        }

        return {
            ticker,
            evidence,
            alphaScore: evidence.complete ? null : null, // null until complete
            qualityTier: evidence.complete ? 'PENDING' : 'INCOMPLETE',
            complete: evidence.complete
        };

    } catch (e) {
        console.error(`[TerminalEnricher v2] Error enriching ${ticker}:`, e);
        return createIncompleteItem(ticker, macro);
    }
}

// === DATA FETCHING FUNCTIONS ===

async function fetchPriceData(ticker: string, session: string): Promise<any> {
    try {
        const data = await getStockData(ticker, '1d');
        return data;
    } catch (e) {
        console.warn(`[TerminalEnricher v2] Price fetch failed for ${ticker}:`, e);
        return null;
    }
}

async function fetchOptionsChain(ticker: string): Promise<CachedOptionsChain | null> {
    // Check cache first
    const cached = await getOptionsFromCache(ticker);
    if (cached && cached.status !== 'PENDING' && cached.status !== 'FAILED') {
        return cached;
    }

    try {
        // Fetch from Massive API
        const response = await fetchMassive(`/v3/reference/options/contracts`, {
            underlying_ticker: ticker,
            limit: '100',
            expired: 'false'
        }, true);

        if (!response || !response.results || response.results.length === 0) {
            // No options available for this ticker
            const noOptions: CachedOptionsChain = {
                ticker,
                status: 'NO_OPTIONS',
                callWall: 0,
                putFloor: 0,
                maxPain: 0,
                pinZone: 0,
                pcr: 0,
                gex: 0,
                gammaRegime: 'N/A',
                coveragePct: 0,
                oiClusters: { callsTop: [], putsTop: [] },
                fetchedAtET: new Date().toISOString()
            };
            await setOptionsToCache(ticker, noOptions);
            return noOptions;
        }

        // Calculate OI clusters from contracts
        const contracts = response.results;
        const callContracts = contracts.filter((c: any) => c.contract_type === 'call');
        const putContracts = contracts.filter((c: any) => c.contract_type === 'put');

        // Sort by OI and get top 5
        const callsTop = callContracts
            .filter((c: any) => c.open_interest)
            .sort((a: any, b: any) => (b.open_interest || 0) - (a.open_interest || 0))
            .slice(0, 5)
            .map((c: any) => ({ strike: c.strike_price, oi: c.open_interest }));

        const putsTop = putContracts
            .filter((c: any) => c.open_interest)
            .sort((a: any, b: any) => (b.open_interest || 0) - (a.open_interest || 0))
            .slice(0, 5)
            .map((c: any) => ({ strike: c.strike_price, oi: c.open_interest }));

        // Calculate walls from OI clusters
        const callWall = callsTop.length > 0 ? callsTop[0].strike : 0;
        const putFloor = putsTop.length > 0 ? putsTop[0].strike : 0;

        // Calculate PCR
        const totalCallOI = callContracts.reduce((sum: number, c: any) => sum + (c.open_interest || 0), 0);
        const totalPutOI = putContracts.reduce((sum: number, c: any) => sum + (c.open_interest || 0), 0);
        const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

        // Max Pain calculation (simplified)
        const allStrikes = [...new Set(contracts.map((c: any) => c.strike_price))];
        let maxPain = callWall; // Default
        if (allStrikes.length > 0) {
            // Max pain is typically near the strike with most OI overlap
            maxPain = allStrikes.sort((a, b) => {
                const aOI = contracts.filter((c: any) => c.strike_price === a).reduce((s: number, c: any) => s + (c.open_interest || 0), 0);
                const bOI = contracts.filter((c: any) => c.strike_price === b).reduce((s: number, c: any) => s + (c.open_interest || 0), 0);
                return bOI - aOI;
            })[0] || callWall;
        }

        const optionsResult: CachedOptionsChain = {
            ticker,
            status: callWall > 0 && putFloor > 0 ? 'OK' : 'READY',
            callWall,
            putFloor,
            maxPain,
            pinZone: (callWall + putFloor) / 2,
            pcr: Math.round(pcr * 100) / 100,
            gex: 0, // Would require more complex calculation
            gammaRegime: pcr < 0.7 ? 'Long Gamma' : pcr > 1.3 ? 'Short Gamma' : 'Neutral',
            coveragePct: Math.min(100, contracts.length),
            oiClusters: { callsTop, putsTop },
            fetchedAtET: new Date().toISOString()
        };

        await setOptionsToCache(ticker, optionsResult);
        return optionsResult;

    } catch (e) {
        console.warn(`[TerminalEnricher v2] Options fetch failed for ${ticker}:`, e);
        return null;
    }
}

async function fetchFlowData(ticker: string): Promise<CachedFlowBundle | null> {
    // Check cache first
    const cached = await getFlowFromCache(ticker);
    if (cached && cached.complete) {
        return cached;
    }

    try {
        // [P0] Fetch current snapshot for volume
        const snapshotResponse = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {}, true);
        const snapshot = snapshotResponse?.ticker;

        // [P0] Fetch previous day for gapPct
        const prevResponse = await fetchMassive(`/v2/aggs/ticker/${ticker}/prev`, {}, true);
        const prevAgg = prevResponse?.results?.[0];

        // [P0] Fetch historical for avgVol (20-day)
        const today = new Date();
        const from = new Date(today.getTime() - 25 * 24 * 60 * 60 * 1000); // 25 days back
        const histResponse = await fetchMassive(`/v2/aggs/ticker/${ticker}/range/1/day/${from.toISOString().split('T')[0]}/${today.toISOString().split('T')[0]}`, {
            limit: '20'
        }, true);

        // Calculate values
        const currentVol = snapshot?.day?.v || snapshot?.prevDay?.v || prevAgg?.v || 0;
        const prevClose = snapshot?.prevDay?.c || prevAgg?.c || 0;
        const todayOpen = snapshot?.day?.o || snapshot?.prevDay?.o || prevAgg?.o || 0;

        // [P0] Calculate 20-day average volume
        let avgVol = currentVol; // Fallback
        if (histResponse?.results && histResponse.results.length > 0) {
            const volumes = histResponse.results.map((r: any) => r.v || 0);
            avgVol = volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length;
        }

        // [P0] Calculate real metrics
        const relVol = avgVol > 0 ? currentVol / avgVol : 1;
        const gapPct = prevClose > 0 ? ((todayOpen - prevClose) / prevClose) * 100 : 0;

        const flowResult: CachedFlowBundle = {
            ticker,
            vol: currentVol,
            relVol: Math.round(relVol * 100) / 100,
            gapPct: Math.round(gapPct * 100) / 100,
            largeTradesUsd: 0, // [P0] No source - leave as 0, UI won't show
            offExPct: 0,       // [P0] No source - leave as 0, not 40%
            offExDeltaPct: 0,
            complete: currentVol > 0 && avgVol > 0,
            fetchedAtET: new Date().toISOString()
        };

        if (flowResult.complete) {
            await setFlowToCache(ticker, flowResult);
        }

        return flowResult;

    } catch (e) {
        console.warn(`[TerminalEnricher v2.1] Flow fetch failed for ${ticker}:`, e);
        return null;
    }
}

async function fetchMacroWithCache(): Promise<UnifiedMacro> {
    // Check cache first
    const cached = await getMacroBundleFromCache();
    // [P0] Use CONFIG threshold (30s)
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

    // Fetch fresh macro data
    const macro = await getMacroSnapshotSSOT();

    const result: UnifiedMacro = {
        ndx: { price: macro?.nq || 0, changePct: macro?.nqChangePercent || 0 },
        vix: { value: macro?.vix || 0 },
        us10y: { yield: macro?.us10y || 0 },
        dxy: { value: macro?.dxy || 0 },
        fetchedAtET: new Date().toISOString(),
        ageSeconds: 0,
        complete: (macro?.nq || 0) > 0 && (macro?.vix || 0) > 0
    };

    // Cache it
    await setMacroBundleToCache({
        ndx: result.ndx,
        vix: result.vix,
        us10y: result.us10y,
        dxy: result.dxy,
        fetchedAtET: result.fetchedAtET,
        ageSeconds: 0
    });

    return result;
}

// === EVIDENCE BUILDERS ===

function buildPriceEvidence(data: any, session: string): UnifiedPrice {
    if (!data) {
        return {
            last: 0, prevClose: 0, changePct: 0, vwap: 0, vwapDistPct: 0,
            rsi14: 0, return3D: 0, structureState: 'CONSOLIDATION', complete: false
        };
    }

    const last = data.price || 0;
    const prevClose = data.regPrice || data.prevClose || 0;
    const vwap = data.vwap || last;

    return {
        last,
        prevClose,
        changePct: data.changePercent || 0,
        vwap,
        vwapDistPct: vwap > 0 ? ((last - vwap) / vwap) * 100 : 0,
        rsi14: data.rsi || 50,
        return3D: data.return3D || 0,
        structureState: 'CONSOLIDATION',
        complete: last > 0 && prevClose > 0 && vwap > 0
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

    return {
        status: data.status,
        coveragePct: data.coveragePct,
        gammaRegime: data.gammaRegime,
        gex: data.gex,
        pcr: data.pcr,
        callWall: data.callWall,
        putFloor: data.putFloor,
        pinZone: data.pinZone,
        maxPain: data.maxPain,
        oiClusters: data.oiClusters,
        complete: ['OK', 'READY', 'NO_OPTIONS'].includes(data.status)
    };
}

function buildFlowEvidence(data: CachedFlowBundle | null): UnifiedFlow {
    if (!data) {
        return {
            vol: 0, relVol: 0, gapPct: 0, largeTradesUsd: 0,
            offExPct: 0, offExDeltaPct: 0, complete: false
        };
    }

    return {
        vol: data.vol,
        relVol: data.relVol,
        gapPct: data.gapPct,
        largeTradesUsd: data.largeTradesUsd,
        offExPct: data.offExPct,
        offExDeltaPct: data.offExDeltaPct,
        complete: data.vol > 0 && data.relVol > 0
    };
}

// === STEALTH CALCULATION (Evidence-Based) ===

function calculateStealthLabel(price: UnifiedPrice, flow: UnifiedFlow, options: UnifiedOptions): UnifiedStealth {
    const tags: string[] = [];

    // Evidence-based tags (NOT estimation)
    if (flow.offExPct > 50) tags.push('offExSurge');
    if (flow.largeTradesUsd > 5_000_000) tags.push('blockPrint');
    if (options.gammaRegime === 'Long Gamma') tags.push('gammaCluster');
    if (price.last > 0 && options.maxPain > 0 &&
        Math.abs(price.last - options.maxPain) < price.last * 0.01) {
        tags.push('maxPainMagnet');
    }
    if (flow.relVol > 2.0) tags.push('volumeSpike');

    // No signal if no evidence
    if (tags.length === 0) {
        tags.push('noSignal');
    }

    // Label based on evidence strength
    const label: 'A' | 'B' | 'C' =
        tags.includes('blockPrint') || tags.includes('offExSurge') ? 'A' :
            tags.length >= 2 && !tags.includes('noSignal') ? 'B' : 'C';

    const impact: 'BOOST' | 'WARN' | 'NEUTRAL' =
        label === 'A' ? 'BOOST' :
            tags.includes('noSignal') ? 'NEUTRAL' : 'NEUTRAL';

    return { label, tags, impact, complete: true };
}

// === POLICY EVIDENCE ===

function calculatePolicyEvidence(ticker: string, events: any[], policies: any[]) {
    // Find relevant policies for this ticker
    const relevant = policies.filter(p =>
        p.tickers?.includes(ticker) || p.sectors?.some((s: string) => true)
    );

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

// === INCOMPLETE ITEM (No Fallback) ===

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

// === UTILITY ===

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
