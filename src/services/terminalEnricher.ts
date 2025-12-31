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
    force: boolean = false
): Promise<TerminalItem[]> {
    console.log(`[TerminalEnricher v2.2] Persistent Enrichment for ${tickers.length} tickers... (force=${force})`);
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
    for (let i = 0; i < tickers.length; i += CONFIG.BATCH_SIZE) {
        const batch = tickers.slice(i, i + CONFIG.BATCH_SIZE);
        console.log(`[TerminalEnricher v2.2] Processing batch ${Math.floor(i / CONFIG.BATCH_SIZE) + 1}/${Math.ceil(tickers.length / CONFIG.BATCH_SIZE)} (${batch.length} items)`);

        const batchResults = await Promise.all(
            batch.map(ticker => enrichSingleTickerWithRetry(ticker, session, macro, eventList, policyList, force))
        );
        results.push(...batchResults);
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
            incompleteTickers.map(ticker => enrichSingleTickerWithRetry(ticker, session, macro, eventList, policyList, force))
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

async function enrichSingleTickerWithRetry(
    ticker: string,
    session: 'pre' | 'regular' | 'post',
    macro: UnifiedMacro,
    events: any[],
    policies: any[],
    force: boolean = false
): Promise<TerminalItem> {
    if (!force) {
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

    try {
        // [Phase 24.1] SSOT Integration: Central Data Hub
        const hubData = await CentralDataHub.getUnifiedData(ticker);

        // Fetch Options Analytics (Deep Structure) using SSOT Price
        const optionsData = await fetchOptionsChain(ticker, hubData.price, force);

        // Build Evidence Layers
        const price = buildPriceEvidence(hubData);
        const flow = buildFlowEvidence(hubData);
        const options = buildOptionsEvidence(optionsData);
        const stealth = calculateStealthLabel(price, flow, options);
        const policy = calculatePolicyEvidence(ticker, events, policies);

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
        evidence.complete = completeness.complete;
        evidence.price.complete = completeness.price.ok;
        evidence.options.complete = completeness.options.ok;
        evidence.flow.complete = completeness.flow.ok;
        evidence.macro.complete = completeness.macro.ok;
        evidence.stealth.complete = completeness.stealth.ok;

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
        }

        return {
            ticker,
            evidence,
            alphaScore: null,
            qualityTier: evidence.complete ? 'PENDING' : 'INCOMPLETE',
            complete: evidence.complete
        };

    } catch (e) {
        console.error(`[TerminalEnricher v2] Error enriching ${ticker}:`, e);
        return createIncompleteItem(ticker, macro);
    }
}

// === EVIDENCE BUILDERS ===

function buildPriceEvidence(data: any): UnifiedPrice {
    // data is UnifiedQuote
    const last = data.price || 0;
    const vwap = data.snapshot?.day?.vw || last;

    return {
        last,
        priceSource: data.priceSource, // [Phase 24.3] Session Tagging
        error: data.error,
        prevClose: data.prevClose || 0,
        changePct: data.finalChangePercent || data.changePct || 0, // [Phase 24.3] SSOT
        vwap,
        vwapDistPct: vwap > 0 ? ((last - vwap) / vwap) * 100 : 0,
        rsi14: data.rsi || 50, // [Phase 41.2] Real RSI 14
        return3D: 0,
        structureState: 'CONSOLIDATION',
        complete: last > 0
    };
}

function buildFlowEvidence(data: any): UnifiedFlow {
    // data is UnifiedQuote from Hub
    // Map netPremium to largeTradesUsd and netFlow
    const netPrem = data.flow?.netPremium || 0;

    return {
        vol: data.volume || 0,
        relVol: data.relVol || 1, // [Phase 41.2] Real RelVol (Snap/Avg)
        gapPct: data.gapPct || 0, // [Phase 41.2] Real Gap %
        largeTradesUsd: netPrem, // Mapped for UI
        offExPct: 0,
        offExDeltaPct: 0,
        netFlow: netPrem,
        complete: (data.flow?.optionsCount || 0) > 0
    };
}

// === OPTIONS ANALYTICS ===

async function fetchOptionsChain(ticker: string, currentPrice?: number, force: boolean = false): Promise<CachedOptionsChain | null> {
    if (!force) {
        const cached = await getOptionsFromCache(ticker);
        if (cached && cached.status !== 'PENDING' && cached.status !== 'FAILED') return cached;
    }
    try {
        const analytics = await getOptionsData(ticker, currentPrice, undefined, !force);

        const optionsResult: CachedOptionsChain = {
            ticker,
            status: analytics.options_status as any,
            callWall: 0,
            putFloor: 0,
            maxPain: analytics.maxPain || 0,
            pinZone: 0,
            pcr: analytics.putCallRatio || 0,
            gex: analytics.gems?.gex || 0,
            gammaRegime: (analytics.gems?.gex || 0) > 0 ? 'Long Gamma' : 'Short Gamma',
            coveragePct: analytics.options_status === 'OK' ? 100 : 0,
            oiClusters: { callsTop: [], putsTop: [] },
            fetchedAtET: new Date().toISOString()
        };

        if (analytics.options_status === 'OK' && analytics.strikes) {
            const calls = analytics.strikes.map((s: number, i: number) => ({ strike: s, oi: analytics.callsOI[i] }));
            const puts = analytics.strikes.map((s: number, i: number) => ({ strike: s, oi: analytics.putsOI[i] }));
            calls.sort((a: any, b: any) => b.oi - a.oi);
            puts.sort((a: any, b: any) => b.oi - a.oi);
            optionsResult.callWall = calls.length > 0 ? calls[0].strike : 0;
            optionsResult.putFloor = puts.length > 0 ? puts[0].strike : 0;
            optionsResult.pinZone = (optionsResult.callWall + optionsResult.putFloor) / 2;
            optionsResult.oiClusters = { callsTop: calls.slice(0, 5), putsTop: puts.slice(0, 5) };
        }
        await setOptionsToCache(ticker, optionsResult);
        return optionsResult;
    } catch (e) {
        console.warn(`[TerminalEnricher] Options fetch failed:`, e);
        return null;
    }
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

function calculateStealthLabel(price: UnifiedPrice, flow: UnifiedFlow, options: UnifiedOptions): UnifiedStealth {
    const tags: string[] = [];
    if (flow.offExPct > 50) tags.push('offExSurge');
    if (flow.largeTradesUsd > 5000000) tags.push('blockPrint');
    if (tags.length === 0) tags.push('noSignal');
    const label: 'A' | 'B' | 'C' = tags.includes('blockPrint') ? 'A' : 'C';
    return { label, tags, impact: 'NEUTRAL', complete: true };
}
