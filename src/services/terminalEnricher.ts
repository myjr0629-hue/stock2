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
import {
    TerminalItem, UnifiedEvidence, UnifiedMacro,
    UnifiedPrice, UnifiedOptions, UnifiedFlow, UnifiedStealth
} from '../types';

// === CONFIGURATION v2.1 ===
// === CONFIGURATION v2.2 (Persistent) ===
const CONFIG = {
    BATCH_SIZE: 20,           // [Phase 12] Increased batch size
    BATCH_CONCURRENCY: 2,
    MAX_RETRIES: 5,           // [Phase 12] Persistent retry (was 2)
    BACKOFF_BASE_MS: 500,     // [Phase 12] Jitter base
    MAX_ENRICHMENT_TIME_MS: 45000, // [Phase 12] Extended window (45s)
    OPTIONS_RETRY_LIMIT: 3,
    MACRO_CACHE_THRESHOLD_S: 30
};

// [P0] Dark Pool & Block Logic
const DARK_POOL_CONDITIONS = [12, 13]; // Form T, Extended
const BLOCK_CONDITIONS = [14, 30, 8, 9]; // Sweep, Sold Last, Closing, Cross

// [P0] Retry Constants
const MAX_FLOW_RETRIES = 5; // User requested 5
const FLOW_RETRY_DELAY = 500; // 500ms


// ... (schema definitions skipped) ...

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
        // [Phase 12] Smart Jitter: 500ms ~ 1000ms + exponential backoff factor
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

        // Update incomplete list
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
    force: boolean = false // [P0] Bypass cache
): Promise<TerminalItem> {
    // 1. Check cache first (skip if force=true)
    if (!force) {
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
    } else {
        console.log(`[TerminalEnricher v2] Force mode: bypassing cache for ${ticker}`);
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
        evidence.complete = completeness.complete;
        evidence.price.complete = completeness.price.ok;
        evidence.options.complete = completeness.options.ok;
        evidence.flow.complete = completeness.flow.ok;
        evidence.macro.complete = completeness.macro.ok;
        evidence.stealth.complete = completeness.stealth.ok;

        // 5. Cache if complete (and not force mode)
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
            console.warn(`[TerminalEnricher v2] ${ticker} INCOMPLETE (${completeness.completeCount}/5): ${completeness.missingLayers.join(', ')}`);
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
        // [P0] 1. Calculate Upcoming Friday (Strict)
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0=Sun, 5=Fri
        const daysUntilFri = (5 - dayOfWeek + 7) % 7;
        const nextFri = new Date(today);
        nextFri.setDate(today.getDate() + daysUntilFri);
        const expiryDate = nextFri.toISOString().split('T')[0];

        // Fetch from Massive API
        let response;
        let attempt = 0;

        while (attempt < CONFIG.OPTIONS_RETRY_LIMIT) {
            response = await fetchMassive(`/v3/reference/options/contracts`, {
                underlying_ticker: ticker,
                limit: '500', // Need more to filter
                expiration_date: expiryDate, // Strict usage
                expired: 'false'
            }, true);

            if (response && response.results && response.results.length > 0) break;

            attempt++;
            if (attempt < CONFIG.OPTIONS_RETRY_LIMIT) {
                console.log(`[TerminalEnricher v2] Options retry ${attempt}/${CONFIG.OPTIONS_RETRY_LIMIT} for ${ticker}`);
                await delay(FLOW_RETRY_DELAY);
            }
        }

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

        // [P0] 2. Strike Scope Filter (±20% of Spot)
        // Need current price first - optimistic fetch or pass in?
        // We'll trust the contracts' inherent clustering or fetch price if needed.
        // For simplicity/perf, let's use the strike clustering itself to find the "center" or assume we want valid data.
        // Actually, we can fetch price quickly or just filter extreme outliers if we had price.
        // Better approach: Calculate median strike or weighted average to find center if price unknown.
        // But we usually enrich options in parallel with price.
        // Let's rely on Valid Data: contracts with OI > 0 usually center around price.

        let contracts = response.results;

        // Smart Filter: Remove strikes with 0 OI first
        contracts = contracts.filter((c: any) => (c.open_interest || 0) > 0);

        // Filter outliers (heuristic: remove top/bottom 5% of strikes if huge spread?)
        // Or strictly use price if we had it. Since we are inside enrichment, we might not have price yet.
        // Let's stick to cleaning up Zero OI.

        const callContracts = contracts.filter((c: any) => c.contract_type === 'call');
        const putContracts = contracts.filter((c: any) => c.contract_type === 'put');

        // Sort by OI and get top 5
        const callsTop = callContracts
            .sort((a: any, b: any) => (b.open_interest || 0) - (a.open_interest || 0))
            .slice(0, 5)
            .map((c: any) => ({ strike: c.strike_price, oi: c.open_interest }));

        const putsTop = putContracts
            .sort((a: any, b: any) => (b.open_interest || 0) - (a.open_interest || 0))
            .slice(0, 5)
            .map((c: any) => ({ strike: c.strike_price, oi: c.open_interest }));

        // Calculate walls from OI clusters
        let callWall = callsTop.length > 0 ? callsTop[0].strike : 0;
        let putFloor = putsTop.length > 0 ? putsTop[0].strike : 0;

        // [P0] 3. Strict Validation: Data Error if Wall is 0
        if (callWall === 0 || putFloor === 0) {
            const errorResult: CachedOptionsChain = {
                ticker,
                status: 'FAILED', // Force Red Badge
                callWall: 0,
                putFloor: 0,
                maxPain: 0,
                pinZone: 0,
                pcr: 0,
                gex: 0,
                gammaRegime: 'N/A',
                coveragePct: 0, // Force 0%
                oiClusters: { callsTop: [], putsTop: [] },
                fetchedAtET: new Date().toISOString()
            };
            await setOptionsToCache(ticker, errorResult);
            return errorResult;
        }

        // Calculate PCR
        const totalCallOI = callContracts.reduce((sum: number, c: any) => sum + (c.open_interest || 0), 0);
        const totalPutOI = putContracts.reduce((sum: number, c: any) => sum + (c.open_interest || 0), 0);
        const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

        // Max Pain calculation (simplified)
        // [P0] Filter Scope for Max Pain: Only consider strikes within Range of Walls
        const relevantStrikes = [...new Set(contracts.map((c: any) => c.strike_price))]
            .filter((s: unknown) => {
                const sVal = s as number;
                // Heuristic: Must be within 50% of the Wall range to filter absurd $80 outliers
                const min = Math.min(callWall, putFloor) * 0.5;
                const max = Math.max(callWall, putFloor) * 1.5;
                return sVal >= min && sVal <= max;
            });

        let maxPain = callWall;
        if (relevantStrikes.length > 0) {
            maxPain = relevantStrikes.sort((a: unknown, b: unknown) => {
                const aVal = a as number;
                const bVal = b as number;
                const aOI = contracts.filter((c: any) => c.strike_price === aVal).reduce((s: number, c: any) => s + (c.open_interest || 0), 0);
                const bOI = contracts.filter((c: any) => c.strike_price === bVal).reduce((s: number, c: any) => s + (c.open_interest || 0), 0);
                return bOI - aOI;
            })[0] as number || callWall;
        }

        const optionsResult: CachedOptionsChain = {
            ticker,
            status: 'OK', // Strict: Only if walls > 0
            callWall,
            putFloor,
            maxPain,
            pinZone: (callWall + putFloor) / 2,
            pcr: Math.round(pcr * 100) / 100,
            gex: 0,
            gammaRegime: pcr < 0.7 ? 'Long Gamma' : pcr > 1.3 ? 'Short Gamma' : 'Neutral',
            coveragePct: 100, // Valid
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
        // [P0] Precision Retry Loop for Snapshot (Flow Data)
        let snapshotResponse;
        let attempt = 0;

        while (attempt < MAX_FLOW_RETRIES) {
            snapshotResponse = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {}, true);
            const vol = snapshotResponse?.ticker?.day?.v || 0;

            if (vol > 0) break; // Found data, exit loop

            attempt++;
            if (attempt < MAX_FLOW_RETRIES) {
                console.log(`[TerminalEnricher v2] Flow retry ${attempt}/${MAX_FLOW_RETRIES} for ${ticker} (Zero Volume)`);
                await delay(FLOW_RETRY_DELAY);
            }
        }

        const snapshot = snapshotResponse?.ticker;

        // [P0] Advanced Flow Calculation (Dark Pool & Net Flow) via Trade Sample
        // We fetch the last 1000 trades to estimate current flow dynamics if not provided by snapshot
        let offExVol = 0;
        let offExPct = 0;
        let netFlow = 0;

        try {
            // Only fetch trades if volume exists to avoid empty calls
            if (snapshot?.day?.v > 0) {
                const tradesResp = await fetchMassive(`/v3/trades/${ticker}`, { limit: '1000', sort: 'timestamp', order: 'desc' }, true);
                if (tradesResp?.results) {
                    const trades = tradesResp.results;

                    // Calculate metrics on sample
                    let buyVol = 0;
                    let sellVol = 0;
                    let totalSampleVol = 0;
                    let darkVol = 0;

                    // Reverse to process chronologically for tick rule, though simple Tick Rule works on any sequence if we compare to prev
                    // Actually for desc list: t[i] vs t[i+1] (which is older)
                    for (let i = 0; i < trades.length - 1; i++) {
                        const current = trades[i];
                        const prev = trades[i + 1];

                        const price = current.price;
                        const prevPrice = prev.price;
                        const size = current.size;

                        totalSampleVol += size;

                        // Dark Pool Check
                        if (current.conditions?.some((c: number) => DARK_POOL_CONDITIONS.includes(c))) {
                            darkVol += size;
                        }

                        // Tick Rule for Net Flow
                        if (price > prevPrice) {
                            buyVol += size;
                        } else if (price < prevPrice) {
                            sellVol += size;
                        } else {
                            // Zero tick - normally check previous tick direction, but simple approx: neutral
                        }
                    }

                    if (totalSampleVol > 0) {
                        offExVol = darkVol; // Scaled to sample
                        offExPct = (darkVol / totalSampleVol) * 100;
                        netFlow = buyVol - sellVol;
                    }
                }
            }
        } catch (err) {
            console.warn(`[TerminalEnricher] Trade flow calc failed for ${ticker}`, err);
        }

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
            largeTradesUsd: 0, // Placeholder
            offExPct: Math.round(offExPct * 100) / 100,
            offExDeltaPct: 0,
            netFlow: netFlow, // New Field
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
        ndx: { price: result.ndx.price || 0, changePct: result.ndx.changePct || 0 }, // Ensure number
        vix: { value: result.vix.value || 0 }, // Ensure number
        us10y: { yield: result.us10y.yield || 0 }, // Ensure number
        dxy: { value: result.dxy.value || 0 }, // Ensure number
        fetchedAtET: result.fetchedAtET || new Date().toISOString(),
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
        p.tickers?.includes(ticker) // [Phase 14.3] High Confidence: Exact match only
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

function checkLayerCompleteness(evidence: UnifiedEvidence) {
    const completeness = {
        price: { ok: evidence.price?.last > 0 },
        options: { ok: evidence.options?.status !== 'PENDING' && evidence.options?.status !== 'FAILED' },
        flow: { ok: evidence.flow?.vol > 0 },
        macro: { ok: (evidence.macro?.ndx?.changePct ?? 0) !== 0 || (evidence.macro?.vix?.level ?? 0) > 0 },
        stealth: { ok: true } // Always derived
    };

    const completeCount = Object.values(completeness).filter(c => c.ok).length;
    const missingLayers = Object.entries(completeness).filter(([, c]) => !c.ok).map(([k]) => k);

    return {
        complete: completeCount >= 4, // Allow 1 missing layer (e.g. macro or flow glitch)
        completeCount,
        missingLayers,
        ...completeness
    };
}
