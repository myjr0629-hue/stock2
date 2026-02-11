// Intel Shared Data Hook - Centralized data fetching for M7 and Physical AI
// [PERF v2] Two-Phase Loading: fast API (prices ~1s) → full API (options/alpha ~15s)
// Phase 1: Polygon batch snapshot → instant price display
// Phase 2: Full /api/intel/m7 + /api/intel/physicalai → complete data with options
// [FIXED] Keeps existing data during refresh, no page reset
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

// Ticker lists
const M7_TICKERS = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'];
const PHYSICAL_AI_TICKERS = ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'];

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
}

export interface IntelSharedData {
    m7: IntelQuote[];
    physicalAI: IntelQuote[];
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

export function useIntelSharedData(): IntelSharedData & { refresh: () => void } {
    const [m7Data, setM7Data] = useState<IntelQuote[]>([]);
    const [physicalAIData, setPhysicalAIData] = useState<IntelQuote[]>([]);
    const [loading, setLoading] = useState(true);
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
            const [m7Res, paiRes] = await Promise.all([
                safeFetch('/api/intel/fast?sector=m7'),
                safeFetch('/api/intel/fast?sector=physical_ai')
            ]);

            if (m7Res?.data?.length > 0) {
                setM7Data(prev => {
                    // If we already have full data, merge: keep options from prev, update prices from fast
                    if (hasFullData.current && prev.length > 0) {
                        return mergeFastIntoFull(prev, m7Res.data);
                    }
                    return m7Res.data;
                });
            }

            if (paiRes?.data?.length > 0) {
                setPhysicalAIData(prev => {
                    if (hasFullData.current && prev.length > 0) {
                        return mergeFastIntoFull(prev, paiRes.data);
                    }
                    return paiRes.data;
                });
            }

            setFetchedAt(new Date().toISOString());
            setLoading(false);
        } catch (e) {
            console.error('[IntelSharedData] Fast fetch failed:', e);
            setLoading(false);
        } finally {
            isFastFetching.current = false;
        }
    }, []);

    // ── Phase 2: Full API — complete data with options/alpha (~15s) ──
    const fetchFull = useCallback(async () => {
        if (isFullFetching.current) return;
        isFullFetching.current = true;
        setOptionsLoading(true);

        try {
            const [m7Res, paiRes] = await Promise.all([
                safeFetch('/api/intel/m7'),
                safeFetch('/api/intel/physicalai')
            ]);

            if (m7Res?.data?.length > 0) {
                setM7Data(m7Res.data);
            }

            if (paiRes?.data?.length > 0) {
                setPhysicalAIData(paiRes.data);
            }

            hasFullData.current = true;
            setOptionsLoading(false);
            setFetchedAt(new Date().toISOString());
            console.log('[IntelSharedData] ✅ Full data loaded (options/alpha complete)');
        } catch (e) {
            console.error('[IntelSharedData] Full fetch failed:', e);
            setOptionsLoading(false);
        } finally {
            isFullFetching.current = false;
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
        if (isInitialized.current) return;
        isInitialized.current = true;

        // Phase 1: Instant prices
        fetchFast();

        // Phase 2: Full data in background (non-blocking)
        fetchFull();

        // Fast refresh every 30 seconds (prices stay fresh)
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
            clearInterval(fastInterval);
            clearInterval(fullInterval);
        };
    }, []); // Empty deps - runs once on mount

    return {
        m7: m7Data,
        physicalAI: physicalAIData,
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
            extendedPrice: updated.extendedPrice,
            extendedChangePct: updated.extendedChangePct,
            extendedLabel: updated.extendedLabel,
            session: updated.session,
            // Keep options/alpha from full data (don't overwrite with 0s)
        };
    });
}

// Export ticker constants for components
export { M7_TICKERS, PHYSICAL_AI_TICKERS };
