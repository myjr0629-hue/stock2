// Intel Shared Data Hook - Centralized data fetching for all sector reports
// [PERF v2] Two-Phase Loading: fast API (prices ~1s) → full API (options/alpha ~15s)
// Phase 1: Polygon batch snapshot → instant price display
// Phase 2: Full watchlist/batch → complete data with options
// [FIXED] Keeps existing data during refresh, no page reset
'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { computeOnePipe, type MarketSession } from '@/hooks/useOnePipe';

// Ticker lists
const M7_TICKERS = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'];
const PHYSICAL_AI_TICKERS = ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'];
const SILICON_CORE_TICKERS = ['AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL'];
const POWER_MATRIX_TICKERS = ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN'];
const BIO_PULSE_TICKERS = ['LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD'];
const CYBER_SHIELD_TICKERS = ['CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA', 'NET'];
const ORBIT_DEFENSE_TICKERS = ['LMT', 'RTX', 'AXON', 'SPCX', 'LDOS', 'ASTS', 'LUNR'];
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
    squeezeScore: number;
    ivSkew: number;
    impliedMovePct: number;
    whaleIndex: number;
    darkPoolPct: number;
    priceFlash?: 'up' | 'down' | null; // flash animation direction
    regularCloseToday?: number | null;  // [ONE-PIPE] 정규장 종가 잠금용
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

interface IntelSharedDataRuntimeOptions {
    fullData?: 'all' | 'manual' | 'staggered';
    batchMode?: 'full' | 'price' | 'price-dp' | 'ssr';
    pricePollMs?: number;
    fastPollMs?: number;
    fullPollMs?: number;
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
    initialODData?: IntelQuote[],
    initialQEData?: IntelQuote[],
    initialFPData?: IntelQuote[],
    initialCFData?: IntelQuote[],
    runtimeOptions?: IntelSharedDataRuntimeOptions
): IntelSharedData & { refresh: () => void } {
    const fullDataMode = runtimeOptions?.fullData ?? 'all';
    const batchMode = runtimeOptions?.batchMode ?? 'full';
    const shouldAutoFull = fullDataMode !== 'manual';
    const shouldStaggerFull = fullDataMode === 'staggered';
    const pricePollMs = runtimeOptions?.pricePollMs ?? 2000;
    const fastPollMs = runtimeOptions?.fastPollMs ?? 30000;
    const fullPollMs = runtimeOptions?.fullPollMs ?? 120000;

    const [m7Data, setM7Data] = useState<IntelQuote[]>(initialM7Data || []);
    const [physicalAIData, setPhysicalAIData] = useState<IntelQuote[]>(initialPAIData || []);
    const [siliconCoreData, setSiliconCoreData] = useState<IntelQuote[]>(initialSCData || []);
    const [powerMatrixData, setPowerMatrixData] = useState<IntelQuote[]>(initialPMData || []);
    const [bioPulseData, setBioPulseData] = useState<IntelQuote[]>(initialBPData || []);
    const [cyberShieldData, setCyberShieldData] = useState<IntelQuote[]>(initialCSData || []);
    const [orbitDefenseData, setOrbitDefenseData] = useState<IntelQuote[]>(initialODData || []);
    const [quantumEdgeData, setQuantumEdgeData] = useState<IntelQuote[]>(initialQEData || []);
    const [fintechPulseData, setFintechPulseData] = useState<IntelQuote[]>(initialFPData || []);
    const [cloudFortressData, setCloudFortressData] = useState<IntelQuote[]>(initialCFData || []);
    const [loading, setLoading] = useState(!(initialM7Data?.length && initialPAIData?.length));
    const [refreshing, setRefreshing] = useState(false);
    const [optionsLoading, setOptionsLoading] = useState(shouldAutoFull);
    const [fetchedAt, setFetchedAt] = useState<string | null>(null);

    const isFastFetching = useRef(false);
    const isFullFetching = useRef(false);
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
            const mergeIfPresent = (batch: any, setter: React.Dispatch<React.SetStateAction<IntelQuote[]>>) => {
                if (batch?.results) setter(prev => mergeWatchlistBatchIntoQuotes(prev, batch.results));
            };

            const batchJobs: Array<{ url: string; setter: React.Dispatch<React.SetStateAction<IntelQuote[]>> }> = [
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${M7_TICKERS.join(',')}`, setter: setM7Data },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${PHYSICAL_AI_TICKERS.join(',')}`, setter: setPhysicalAIData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${SILICON_CORE_TICKERS.join(',')}`, setter: setSiliconCoreData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${POWER_MATRIX_TICKERS.join(',')}`, setter: setPowerMatrixData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${BIO_PULSE_TICKERS.join(',')}`, setter: setBioPulseData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${CYBER_SHIELD_TICKERS.join(',')}`, setter: setCyberShieldData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${ORBIT_DEFENSE_TICKERS.join(',')}`, setter: setOrbitDefenseData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${QUANTUM_EDGE_TICKERS.join(',')}`, setter: setQuantumEdgeData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${FINTECH_PULSE_TICKERS.join(',')}`, setter: setFintechPulseData },
                { url: `/api/watchlist/batch?mode=${batchMode}&tickers=${CLOUD_FORTRESS_TICKERS.join(',')}`, setter: setCloudFortressData },
            ];

            if (shouldStaggerFull) {
                const chunkSize = 3;
                for (let i = 0; i < batchJobs.length; i += chunkSize) {
                    const chunk = batchJobs.slice(i, i + chunkSize);
                    const batches = await Promise.all(chunk.map(job => safeFetch(job.url)));
                    batches.forEach((batch, index) => mergeIfPresent(batch, chunk[index].setter));
                }
            } else {
                const batches = await Promise.all(batchJobs.map(job => safeFetch(job.url)));
                batches.forEach((batch, index) => mergeIfPresent(batch, batchJobs[index].setter));
            }

            hasFullData.current = true;
            setOptionsLoading(false);
            setFetchedAt(new Date().toISOString());
            console.log(`[IntelSharedData] ✅ Full data loaded via watchlist/batch (${shouldStaggerFull ? 'staggered' : 'parallel'})`);
        } catch (e) {
            console.error('[IntelSharedData] Full fetch failed:', e);
            setOptionsLoading(false);
        } finally {
            isFullFetching.current = false;
        }
    }, [batchMode, shouldStaggerFull]);

    // ── Phase 0: Ultra-fast price-only polling (5s) via /api/live/quotes ──
    // [ONE-PIPE] calcUnifiedPrice 적용 — regularCloseToday 잠금으로 Polygon 불안정 차단
    const isPriceFetching = useRef(false);
    const fetchPriceOnly = useCallback(async () => {
        if (isPriceFetching.current) return;
        isPriceFetching.current = true;

        try {
            const allTickers = [...M7_TICKERS, ...PHYSICAL_AI_TICKERS, ...SILICON_CORE_TICKERS, ...POWER_MATRIX_TICKERS, ...BIO_PULSE_TICKERS, ...CYBER_SHIELD_TICKERS, ...ORBIT_DEFENSE_TICKERS, ...QUANTUM_EDGE_TICKERS, ...FINTECH_PULSE_TICKERS, ...CLOUD_FORTRESS_TICKERS].join(',');
            const res = await safeFetch(`/api/live/quotes?symbols=${allTickers}`);
            if (!res?.data) return;

            const priceMap = res.data as Record<string, any>;

            const toSession = (s: string): MarketSession => {
                if (!s) return 'CLOSED';
                const u = s.toUpperCase();
                if (u === 'PRE' || u === 'PRE_MARKET' || u === 'PREMARKET') return 'PRE';
                if (u === 'REG' || u === 'REGULAR' || u === 'OPEN') return 'REG';
                if (u === 'POST' || u === 'POST_MARKET' || u === 'POSTMARKET') return 'POST';
                return 'CLOSED';
            };

            const updateFn = (prev: IntelQuote[]) => {
                if (prev.length === 0) return prev;
                let hasAnyChange = false;
                const updated = prev.map(q => {
                    const p = priceMap[q.ticker];
                    if (!p || !p.price) return q;

                    const session = toSession(p.session);
                    const prevCl = q.prevClose || p.prevClose || 0;

                    // [ONE-PIPE] regularCloseToday: 최초 설정 후 유지
                    const regCloseToday = q.regularCloseToday && q.regularCloseToday > 0
                        ? q.regularCloseToday
                        : (p.price > 0 ? p.price : null);

                    const pipe = computeOnePipe({
                        session,
                        pollPrice: p.price,
                        pollPrevClose: prevCl,
                        pollExtPrice: p.extendedPrice || 0,
                        pollExtLabel: p.extendedLabel || '',
                        pollChangePct: p.changePercent ?? null,
                        wsPrice: null,
                        regularCloseToday: regCloseToday,
                    });

                    const hasIncomingRegularChange = typeof p.changePercent === 'number' && Number.isFinite(p.changePercent);
                    const nextChangePct = !hasIncomingRegularChange
                        && (session === 'CLOSED' || session === 'PRE' || session === 'POST')
                        && q.changePct !== 0
                        && Math.abs(pipe.changePct) < 0.001
                        ? q.changePct
                        : pipe.changePct;

                    // Skip if price unchanged
                    if (pipe.price === q.price && nextChangePct === q.changePct) return q;

                    hasAnyChange = true;
                    const flash: 'up' | 'down' | null = pipe.price > q.price ? 'up'
                        : pipe.price < q.price ? 'down' : null;

                    return {
                        ...q,
                        price: pipe.price,
                        changePct: nextChangePct,
                        prevClose: pipe.prevClose || q.prevClose,
                        volume: p.volume ?? q.volume,
                        regularCloseToday: regCloseToday,
                        extendedPrice: pipe.extPrice || q.extendedPrice,
                        extendedChangePct: pipe.extChangePct || q.extendedChangePct,
                        extendedLabel: pipe.extLabel || q.extendedLabel,
                        session: p.session ?? q.session,
                        priceFlash: flash,
                    };
                });
                return hasAnyChange ? updated : prev;
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
        } catch {
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
        if (shouldAutoFull) {
            // Full data refresh in background
            fetchFull();
        } else {
            setOptionsLoading(false);
        }
    }, [fetchFast, fetchFull, shouldAutoFull]);

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
        if (shouldAutoFull) {
            fetchFull();
        } else {
            setOptionsLoading(false);
        }

        // Price-only refresh. App screens can request a slower cadence to avoid
        // hammering all sector tickers while a detail view fetches its own batch.
        const priceInterval = setInterval(() => {
            if (!isPriceFetching.current) {
                fetchPriceOnly();
            }
        }, pricePollMs);

        // Fast refresh (sparklines, extended prices stay fresh)
        const fastInterval = setInterval(() => {
            if (!isFastFetching.current) {
                fetchFast();
            }
        }, fastPollMs);

        // Full refresh every 2 minutes (keeps Redis cache + options/alpha alive)
        const fullInterval = shouldAutoFull
            ? setInterval(() => {
                if (!isFullFetching.current) {
                    fetchFull();
                }
            }, fullPollMs)
            : null;

        return () => {
            clearInterval(priceInterval);
            clearInterval(fastInterval);
            if (fullInterval) clearInterval(fullInterval);
        };
    }, [
        fetchFast,
        fetchFull,
        fetchPriceOnly,
        fastPollMs,
        fullPollMs,
        initialM7Data?.length,
        initialPAIData?.length,
        pricePollMs,
        shouldAutoFull,
    ]);

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

export function useIntelSharedDataForApp(): IntelSharedData & { refresh: () => void } {
    return useIntelSharedData(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
            fullData: 'staggered',
            batchMode: 'price-dp',
            pricePollMs: 10000,
            fastPollMs: 45000,
            fullPollMs: 240000,
        }
    );
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

        // [ONE-PIPE] regularCloseToday 잠금 유지
        const regCloseToday = existing.regularCloseToday && existing.regularCloseToday > 0
            ? existing.regularCloseToday
            : (updated.price > 0 ? updated.price : null);

        return {
            ...existing,
            price: updated.price > 0 ? updated.price : existing.price,
            changePct: updated.changePct || existing.changePct,
            prevClose: updated.prevClose || existing.prevClose,
            volume: updated.volume || existing.volume,
            regularCloseToday: regCloseToday,
            extendedPrice: (updated.extendedPrice && updated.extendedPrice > 0) ? updated.extendedPrice : existing.extendedPrice,
            extendedChangePct: (updated.extendedPrice && updated.extendedPrice > 0) ? updated.extendedChangePct : existing.extendedChangePct,
            extendedLabel: (updated.extendedPrice && updated.extendedPrice > 0) ? updated.extendedLabel : existing.extendedLabel,
            session: updated.session || existing.session,
        };
    });
}

function pickFiniteNumber<T extends number | null | undefined>(value: T, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function quoteFromBatchResult(batch: any): IntelQuote | null {
    if (!batch?.ticker || batch.error) return null;

    const rt = batch.realtime || {};
    const alpha = batch.alphaSnapshot || {};
    const gex = pickFiniteNumber(rt.gex, 0);

    return {
        ticker: batch.ticker,
        price: pickFiniteNumber(rt.price, 0),
        changePct: pickFiniteNumber(rt.changePct, 0),
        prevClose: pickFiniteNumber(rt.prevClose, 0),
        volume: pickFiniteNumber(rt.volume, 0),
        extendedPrice: pickFiniteNumber(rt.extendedPrice, 0),
        extendedChangePct: pickFiniteNumber(rt.extendedChangePct, 0),
        extendedLabel: rt.extendedLabel || '',
        session: rt.session || '',
        alphaScore: pickFiniteNumber(alpha.score, 50),
        grade: alpha.grade || 'B',
        maxPain: pickFiniteNumber(rt.maxPain, 0),
        callWall: pickFiniteNumber(rt.callWall, 0),
        putFloor: pickFiniteNumber(rt.putFloor, 0),
        gex,
        pcr: pickFiniteNumber(rt.pcr, 0),
        gammaRegime: gex > 0 ? 'LONG' : gex < 0 ? 'SHORT' : (rt.gammaRegime || 'NEUTRAL'),
        sparkline: rt.sparkline?.length > 0 ? rt.sparkline : [],
        netPremium: pickFiniteNumber(rt.netPremium, 0),
        rsi: pickFiniteNumber(rt.rsi, 0),
        rvol: pickFiniteNumber(rt.relVol ?? rt.rvol, 0),
        squeezeScore: pickFiniteNumber(rt.squeezeScore, 0),
        ivSkew: pickFiniteNumber(rt.ivSkew, 0),
        impliedMovePct: pickFiniteNumber(rt.impliedMovePct, 0),
        whaleIndex: pickFiniteNumber(rt.whaleIndex, 0),
        darkPoolPct: pickFiniteNumber(rt.darkPoolPct, 0),
        regularCloseToday: pickFiniteNumber(rt.regularCloseToday, 0) || null,
    };
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

    if (existingQuotes.length === 0) {
        return batchResults
            .map(quoteFromBatchResult)
            .filter((quote): quote is IntelQuote => quote !== null);
    }

    return existingQuotes.map(existing => {
        const batch = batchMap.get(existing.ticker);
        if (!batch) return existing;

        const rt = batch.realtime || {};
        const alpha = batch.alphaSnapshot || {};
        const gex = pickFiniteNumber(rt.gex, existing.gex);

        return {
            ...existing,
            price: pickFiniteNumber(rt.price, existing.price),
            changePct: pickFiniteNumber(rt.changePct, existing.changePct),
            prevClose: pickFiniteNumber(rt.prevClose, existing.prevClose),
            volume: pickFiniteNumber(rt.volume, existing.volume),
            regularCloseToday: pickFiniteNumber(rt.regularCloseToday, existing.regularCloseToday ?? 0) || existing.regularCloseToday,
            extendedPrice: pickFiniteNumber(rt.extendedPrice, existing.extendedPrice),
            extendedChangePct: pickFiniteNumber(rt.extendedChangePct, existing.extendedChangePct),
            extendedLabel: rt.extendedLabel || existing.extendedLabel,
            session: rt.session || existing.session,
            // Options data from watchlist/batch
            alphaScore: pickFiniteNumber(alpha.score, existing.alphaScore),
            grade: alpha.grade || existing.grade,
            maxPain: pickFiniteNumber(rt.maxPain, existing.maxPain),
            callWall: pickFiniteNumber(rt.callWall, existing.callWall),
            putFloor: pickFiniteNumber(rt.putFloor, existing.putFloor),
            gex,
            pcr: pickFiniteNumber(rt.pcr, existing.pcr),
            gammaRegime: gex > 0 ? 'LONG' : gex < 0 ? 'SHORT' : existing.gammaRegime,
            sparkline: rt.sparkline?.length > 0 ? rt.sparkline : existing.sparkline,
            netPremium: pickFiniteNumber(rt.netPremium, existing.netPremium),
            rsi: pickFiniteNumber(rt.rsi, existing.rsi || 0),
            rvol: pickFiniteNumber(rt.relVol ?? rt.rvol, existing.rvol || 0),
            squeezeScore: pickFiniteNumber(rt.squeezeScore, existing.squeezeScore || 0),
            ivSkew: pickFiniteNumber(rt.ivSkew, existing.ivSkew || 0),
            impliedMovePct: pickFiniteNumber(rt.impliedMovePct, existing.impliedMovePct || 0),
            whaleIndex: pickFiniteNumber(rt.whaleIndex, existing.whaleIndex || 0),
            darkPoolPct: pickFiniteNumber(rt.darkPoolPct, existing.darkPoolPct || 0),
        };
    });
}
