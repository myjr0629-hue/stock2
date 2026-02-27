// Intel Shared Data Hook - Centralized data fetching for all sector reports
// [PERF v2] Two-Phase Loading: fast API (prices ~1s) → full API (options/alpha ~15s)
// Phase 1: Polygon batch snapshot → instant price display
// Phase 2: Full watchlist/batch → complete data with options
// [FIXED] Keeps existing data during refresh, no page reset
'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';

// Ticker lists
const M7_TICKERS = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'];
const PHYSICAL_AI_TICKERS = ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'];
const SILICON_CORE_TICKERS = ['AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL'];
const POWER_MATRIX_TICKERS = ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN'];
const BIO_PULSE_TICKERS = ['LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD'];
const CYBER_SHIELD_TICKERS = ['CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA', 'NET'];
const ORBIT_DEFENSE_TICKERS = ['LMT', 'RTX', 'AXON', 'KTOS', 'LDOS', 'ASTS', 'LUNR'];
const QUANTUM_EDGE_TICKERS = ['SMCI', 'SNOW', 'IONQ', 'DELL', 'AI', 'PATH', 'TWLO'];
const FINTECH_PULSE_TICKERS = ['XYZ', 'PYPL', 'COIN', 'SOFI', 'AFRM', 'HOOD', 'UPST'];
const CLOUD_FORTRESS_TICKERS = ['CRM', 'NOW', 'DDOG', 'WDAY', 'MDB', 'TEAM', 'HUBS'];

// Types for shared data
export interface IntelQuote {
    ticker: string;
    price: number;
    changePct: number;
    prevClose: number;
    volume: number;
    extendedPrice: number;
    extendedChangePct: number;
    extendedLabel: string;
    session: string;
    alphaScore: number;
    grade: string;
    maxPain: number;
    callWall: number;
    putFloor: number;
    gex: number;
    pcr: number;
    gammaRegime: string;
    sparkline: number[];
    netPremium: number;
    rsi: number;
    rvol: number;
    whaleIndex: number;
    darkPoolPct: number;
    priceFlash?: 'up' | 'down' | null; // flash animation direction
}

export interface IntelSharedData {
    m7: IntelQuote[];
    physicalAI: IntelQuote[];
    siliconCore: IntelQuote[];
    powerMatrix: IntelQuote[];
    bioPulse: IntelQuote[];
    cyberShield: IntelQuote[];
    orbitDefense: IntelQuote[];
    quantumEdge: IntelQuote[];
    fintechPulse: IntelQuote[];
    cloudFortress: IntelQuote[];
    loading: boolean;
    refreshing: boolean;
    optionsLoading: boolean;
    fetchedAt: string | null;
}

// Helper: safe JSON fetch
async function safeFetch(url: string): Promise<any> {
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        const text = await res.text();
        if (!text) return null;
        try { return JSON.parse(text); } catch { return null; }
    } catch { return null; }
}

export function useIntelSharedData(
    initialM7Data?: IntelQuote[],
    initialPAIData?: IntelQuote[],
    initialSCData?: IntelQuote[],
    initialPMData?: IntelQuote[],
    initialBPData?: IntelQuote[],
    initialCSData?: IntelQuote[],
    initialODData?: IntelQuote[]
): IntelSharedData & { refresh: () => void } {
    const [m7Data, setM7Data] = useState<IntelQuote[]>(initialM7Data || []);
    const [physicalAIData, setPhysicalAIData] = useState<IntelQuote[]>(initialPAIData || []);
    const [siliconCoreData, setSiliconCoreData] = useState<IntelQuote[]>(initialSCData || []);
    const [powerMatrixData, setPowerMatrixData] = useState<IntelQuote[]>(initialPMData || []);
    const [bioPulseData, setBioPulseData] = useState<IntelQuote[]>(initialBPData || []);
    const [cyberShieldData, setCyberShieldData] = useState<IntelQuote[]>(initialCSData || []);
    const [orbitDefenseData, setOrbitDefenseData] = useState<IntelQuote[]>(initialODData || []);
    const [quantumEdgeData, setQuantumEdgeData] = useState<IntelQuote[]>([]);
    const [fintechPulseData, setFintechPulseData] = useState<IntelQuote[]>([]);
    const [cloudFortressData, setCloudFortressData] = useState<IntelQuote[]>([]);
    const [loading, setLoading] = useState(!(initialM7Data?.length && initialPAIData?.length));
    const [refreshing, setRefreshing] = useState(false);
    const [optionsLoading, setOptionsLoading] = useState(true);
    const [fetchedAt, setFetchedAt] = useState<string | null>(null);

    const isFastFetching = useRef(false);
    const isFullFetching = useRef(false);
    const isInitialized = useRef(false);
    const hasFullData = useRef(false);

    // ── Phase 1: Fast API — instant prices (~1-2s) ──
    const fetchFast = useCallback(async () => {
        if (isFastFetching.current) return;
        isFastFetching.current = true;

        try {
            const [m7Res, paiRes, scRes, pmRes, bpRes, csRes, odRes, qeRes, fpRes, cfRes] = await Promise.all([
                safeFetch('/api/intel/fast?sector=m7'),
                safeFetch('/api/intel/fast?sector=physical_ai'),
                safeFetch('/api/intel/fast?sector=silicon_core'),
                safeFetch('/api/intel/fast?sector=power_matrix'),
                safeFetch('/api/intel/fast?sector=bio_pulse'),
                safeFetch('/api/intel/fast?sector=cyber_shield'),
                safeFetch('/api/intel/fast?sector=orbit_defense'),
                safeFetch('/api/intel/fast?sector=quantum_edge'),
                safeFetch('/api/intel/fast?sector=fintech_pulse'),
                safeFetch('/api/intel/fast?sector=cloud_fortress'),
            ]);

            const mergeOrSet = (res: any, setter: React.Dispatch<React.SetStateAction<IntelQuote[]>>) => {
                if (res?.data?.length > 0) {
                    setter(prev => {
                        if (hasFullData.current && prev.length > 0) {
                            return mergeFastIntoFull(prev, res.data);
                        }
                        return res.data;
                    });
                }
            };

            mergeOrSet(m7Res, setM7Data);
            mergeOrSet(paiRes, setPhysicalAIData);
            mergeOrSet(scRes, setSiliconCoreData);
            mergeOrSet(pmRes, setPowerMatrixData);
            mergeOrSet(bpRes, setBioPulseData);
            mergeOrSet(csRes, setCyberShieldData);
            mergeOrSet(odRes, setOrbitDefenseData);
            mergeOrSet(qeRes, setQuantumEdgeData);
            mergeOrSet(fpRes, setFintechPulseData);
            mergeOrSet(cfRes, setCloudFortressData);

            setFetchedAt(new Date().toISOString());
            setLoading(false);
        } catch (e) {
            console.error('[IntelSharedData] Fast fetch failed:', e);
            setLoading(false);
        } finally {
            isFastFetching.current = false;
        }
    }, []);

    // ── Phase 2: Options/Alpha via watchlist/batch — much faster (~3-5s) ──
    // Instead of calling /api/intel/m7 (which calls 7× /api/live/ticker individually),
    // we call /api/watchlist/batch directly — it uses getStockDataLight + parallel options fetch
    const fetchFull = useCallback(async () => {
        if (isFullFetching.current) return;
        isFullFetching.current = true;
        setOptionsLoading(true);

        try {
            const [m7Batch, paiBatch, scBatch, pmBatch, bpBatch, csBatch, odBatch, qeBatch, fpBatch, cfBatch] = await Promise.all([
                safeFetch(`/api/watchlist/batch?tickers=${M7_TICKERS.join(',')}`),
                safeFetch(`/api/watchlist/batch?tickers=${PHYSICAL_AI_TICKERS.join(',')}`),
                safeFetch(`/api/watchlist/batch?tickers=${SILICON_CORE_TICKERS.join(',')}`),
                safeFetch(`/api/watchlist/batch?tickers=${POWER_MATRIX_TICKERS.join(',')}`),
                safeFetch(`/api/watchlist/batch?tickers=${BIO_PULSE_TICKERS.join(',')}`),
                safeFetch(`/api/watchlist/batch?tickers=${CYBER_SHIELD_TICKERS.join(',')}`),
                safeFetch(`/api/watchlist/batch?tickers=${ORBIT_DEFENSE_TICKERS.join(',')}`),
                safeFetch(`/api/watchlist/batch?tickers=${QUANTUM_EDGE_TICKERS.join(',')}`),
                safeFetch(`/api/watchlist/batch?tickers=${FINTECH_PULSE_TICKERS.join(',')}`),
                safeFetch(`/api/watchlist/batch?tickers=${CLOUD_FORTRESS_TICKERS.join(',')}`),
            ]);

            // Merge batch results into existing Phase 1 data
            const mergeIfPresent = (batch: any, setter: React.Dispatch<React.SetStateAction<IntelQuote[]>>) => {
                if (batch?.results) setter(prev => mergeWatchlistBatchIntoQuotes(prev, batch.results));
            };

            mergeIfPresent(m7Batch, setM7Data);
            mergeIfPresent(paiBatch, setPhysicalAIData);
            mergeIfPresent(scBatch, setSiliconCoreData);
            mergeIfPresent(pmBatch, setPowerMatrixData);
            mergeIfPresent(bpBatch, setBioPulseData);
            mergeIfPresent(csBatch, setCyberShieldData);
            mergeIfPresent(odBatch, setOrbitDefenseData);
            mergeIfPresent(qeBatch, setQuantumEdgeData);
            mergeIfPresent(fpBatch, setFintechPulseData);
            mergeIfPresent(cfBatch, setCloudFortressData);

            hasFullData.current = true;
            setOptionsLoading(false);
            setFetchedAt(new Date().toISOString());
            const elapsed = m7Batch?.meta?.elapsed || 0;
            console.log(`[IntelSharedData] ✅ Full data loaded via watchlist/batch (${elapsed}ms)`);
        } catch (e) {
            console.error('[IntelSharedData] Full fetch failed:', e);
            setOptionsLoading(false);
        } finally {
            isFullFetching.current = false;
        }
    }, []);

    // ── Phase 0: Ultra-fast price-only polling (5s) via /api/live/quotes ──
    const isPriceFetching = useRef(false);
    const fetchPriceOnly = useCallback(async () => {
        if (isPriceFetching.current) return;
        isPriceFetching.current = true;

        try {
            const allTickers = [...M7_TICKERS, ...PHYSICAL_AI_TICKERS, ...SILICON_CORE_TICKERS, ...POWER_MATRIX_TICKERS, ...BIO_PULSE_TICKERS, ...CYBER_SHIELD_TICKERS, ...ORBIT_DEFENSE_TICKERS, ...QUANTUM_EDGE_TICKERS, ...FINTECH_PULSE_TICKERS, ...CLOUD_FORTRESS_TICKERS].join(',');
            const res = await safeFetch(`/api/live/quotes?symbols=${allTickers}`);
            if (!res?.data) return;

            const priceMap = res.data as Record<string, any>;

            const updateFn = (prev: IntelQuote[]) => {
                if (prev.length === 0) return prev;
                let hasAnyChange = false;
                const updated = prev.map(q => {
                    const p = priceMap[q.ticker];
                    if (!p || !p.price) return q; // same reference — no re-render

                    // Skip update if price is identical
                    if (p.price === q.price) return q;

                    hasAnyChange = true;

                    // [FIX] During PRE/POST, don't override changePct from fast API
                    const isRegular = (p.session === 'regular' || p.session === 'REG');
                    const newChangePct = isRegular ? (p.changePercent ?? q.changePct) : q.changePct;

                    // Flash direction
                    const flash: 'up' | 'down' | null = p.price > q.price ? 'up' : 'down';

                    return {
                        ...q,
                        price: p.price,
                        changePct: newChangePct,
                        prevClose: p.prevClose ?? q.prevClose,
                        volume: p.volume ?? q.volume,
                        extendedPrice: (p.extendedPrice && p.extendedPrice > 0) ? p.extendedPrice : q.extendedPrice,
                        extendedChangePct: (p.extendedPrice && p.extendedPrice > 0) ? (p.extendedChangePercent ?? q.extendedChangePct) : q.extendedChangePct,
                        extendedLabel: (p.extendedPrice && p.extendedPrice > 0) ? (p.extendedLabel ?? q.extendedLabel) : q.extendedLabel,
                        session: p.session ?? q.session,
                        priceFlash: flash,
                    };
                });
                return hasAnyChange ? updated : prev; // same array ref if nothing changed
            };

            setM7Data(updateFn);
            setPhysicalAIData(updateFn);
            setSiliconCoreData(updateFn);
            setPowerMatrixData(updateFn);
            setBioPulseData(updateFn);
            setCyberShieldData(updateFn);
            setOrbitDefenseData(updateFn);
            setQuantumEdgeData(updateFn);
            setFintechPulseData(updateFn);
            setCloudFortressData(updateFn);
        } catch (e) {
            // silent fail — prices will refresh on next cycle
        } finally {
            isPriceFetching.current = false;
        }
    }, []);

    // Combined refresh: fast first, then full
    const refresh = useCallback(async () => {
        setRefreshing(true);
        await fetchFast();
        setRefreshing(false);
        // Full data refresh in background
        fetchFull();
    }, [fetchFast, fetchFull]);

    // Initial load + intervals
    useEffect(() => {

        if (initialM7Data?.length && initialPAIData?.length) {
            // [SSR HYDRATED] Skip redundant Phase 1 fetch
            setFetchedAt(new Date().toISOString());
        } else {
            // Phase 1: Instant prices (Fallback if CSR)
            fetchFast();
        }

        // Phase 2: Full data in background (non-blocking)
        fetchFull();

        // Price-only refresh every 2 seconds (ultra-fast, lightweight snapshot)
        const priceInterval = setInterval(() => {
            if (!isPriceFetching.current) {
                fetchPriceOnly();
            }
        }, 2000);

        // Fast refresh every 30 seconds (sparklines, extended prices stay fresh)
        const fastInterval = setInterval(() => {
            if (!isFastFetching.current) {
                fetchFast();
            }
        }, 30000);

        // Full refresh every 2 minutes (keeps Redis cache + options/alpha alive)
        const fullInterval = setInterval(() => {
            if (!isFullFetching.current) {
                fetchFull();
            }
        }, 120000);

        return () => {
            clearInterval(priceInterval);
            clearInterval(fastInterval);
            clearInterval(fullInterval);
        };
    }, []); // Empty deps - runs once on mount

    return {
        m7: m7Data,
        physicalAI: physicalAIData,
        siliconCore: siliconCoreData,
        powerMatrix: powerMatrixData,
        bioPulse: bioPulseData,
        cyberShield: cyberShieldData,
        orbitDefense: orbitDefenseData,
        quantumEdge: quantumEdgeData,
        fintechPulse: fintechPulseData,
        cloudFortress: cloudFortressData,
        loading,
        refreshing,
        optionsLoading,
        fetchedAt,
        refresh
    };
}

/**
 * Merge fast API data (prices only) into existing full data (with options).
 * Updates prices/change% while preserving alpha/options fields.
 */
function mergeFastIntoFull(full: IntelQuote[], fast: IntelQuote[]): IntelQuote[] {
    const fastMap = new Map(fast.map(q => [q.ticker, q]));

    return full.map(existing => {
        const updated = fastMap.get(existing.ticker);
        if (!updated) return existing;

        return {
            ...existing,
            // Update price fields from fast API
            price: updated.price,
            changePct: updated.changePct,
            prevClose: updated.prevClose,
            volume: updated.volume,
            extendedPrice: (updated.extendedPrice && updated.extendedPrice > 0) ? updated.extendedPrice : existing.extendedPrice,
            extendedChangePct: (updated.extendedPrice && updated.extendedPrice > 0) ? updated.extendedChangePct : existing.extendedChangePct,
            extendedLabel: (updated.extendedPrice && updated.extendedPrice > 0) ? updated.extendedLabel : existing.extendedLabel,
            session: updated.session,
            // Keep options/alpha from full data (don't overwrite with 0s)
        };
    });
}

// Export ticker constants for components
export { M7_TICKERS, PHYSICAL_AI_TICKERS, SILICON_CORE_TICKERS, POWER_MATRIX_TICKERS, BIO_PULSE_TICKERS, CYBER_SHIELD_TICKERS, ORBIT_DEFENSE_TICKERS, QUANTUM_EDGE_TICKERS, FINTECH_PULSE_TICKERS, CLOUD_FORTRESS_TICKERS };

/**
 * Merge watchlist/batch results (alpha + options) into existing Phase 1 quotes.
 * Preserves Phase 1 prices while enriching with options/alpha data.
 */
function mergeWatchlistBatchIntoQuotes(existingQuotes: IntelQuote[], batchResults: any[]): IntelQuote[] {
    const batchMap = new Map<string, any>();
    batchResults.forEach((r: any) => {
        if (r.ticker && !r.error) batchMap.set(r.ticker, r);
    });

    return existingQuotes.map(existing => {
        const batch = batchMap.get(existing.ticker);
        if (!batch) return existing;

        const rt = batch.realtime || {};
        const alpha = batch.alphaSnapshot || {};
        const gex = rt.gex || 0;

        return {
            ...existing,
            // Options data from watchlist/batch
            alphaScore: alpha.score || existing.alphaScore,
            grade: alpha.grade || existing.grade,
            maxPain: rt.maxPain || existing.maxPain,
            callWall: rt.callWall || existing.callWall,
            putFloor: rt.putFloor || existing.putFloor,
            gex: gex || existing.gex,
            pcr: rt.pcr || existing.pcr,
            gammaRegime: gex > 0 ? 'LONG' : gex < 0 ? 'SHORT' : existing.gammaRegime,
            sparkline: rt.sparkline?.length > 0 ? rt.sparkline : existing.sparkline,
            netPremium: rt.netPremium || existing.netPremium,
            rsi: rt.rsi || existing.rsi || 0,
            rvol: rt.relVol || existing.rvol || 0,
            whaleIndex: rt.whaleIndex || existing.whaleIndex || 0,
            darkPoolPct: rt.darkPoolPct || existing.darkPoolPct || 0,
        };
    });
}
