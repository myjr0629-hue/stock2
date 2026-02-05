// Intel Shared Data Hook - Centralized data fetching for M7 and Physical AI
// [FIXED] Uses Full API only (correct Flow/Command page price logic)
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
}

export interface IntelSharedData {
    m7: IntelQuote[];
    physicalAI: IntelQuote[];
    loading: boolean;
    refreshing: boolean;
    optionsLoading: boolean;
    fetchedAt: string | null;
}

export function useIntelSharedData(): IntelSharedData & { refresh: () => void } {
    const [m7Data, setM7Data] = useState<IntelQuote[]>([]);
    const [physicalAIData, setPhysicalAIData] = useState<IntelQuote[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [fetchedAt, setFetchedAt] = useState<string | null>(null);

    const isFetching = useRef(false);
    const isInitialized = useRef(false);

    // Fetch data from Full API (correct price logic)
    const fetchData = useCallback(async () => {
        if (isFetching.current) return;
        isFetching.current = true;

        // Only show refreshing if we already have data
        const hasData = m7Data.length > 0 || physicalAIData.length > 0;
        if (hasData) {
            setRefreshing(true);
        }

        try {
            const [m7Res, physicalAIRes] = await Promise.all([
                fetch('/api/intel/m7', { cache: 'no-store' })
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null),
                fetch('/api/intel/physicalai', { cache: 'no-store' })
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null)
            ]);

            // Only update if we got valid data (preserve existing on error)
            if (m7Res?.data?.length > 0) {
                setM7Data(m7Res.data);
            }

            if (physicalAIRes?.data?.length > 0) {
                setPhysicalAIData(physicalAIRes.data);
            }

            setFetchedAt(new Date().toISOString());
            setLoading(false);
        } catch (e) {
            console.error('[IntelSharedData] Fetch failed:', e);
            setLoading(false);
        } finally {
            setRefreshing(false);
            isFetching.current = false;
        }
    }, []); // Empty deps - stable function

    // Initial fetch + interval
    useEffect(() => {
        if (isInitialized.current) return;
        isInitialized.current = true;

        fetchData();

        // Refresh every 30 seconds
        const interval = setInterval(() => {
            if (!isFetching.current) {
                fetchData();
            }
        }, 30000);

        return () => clearInterval(interval);
    }, []); // Empty deps - runs once on mount

    return {
        m7: m7Data,
        physicalAI: physicalAIData,
        loading,
        refreshing,
        optionsLoading: false, // No longer used
        fetchedAt,
        refresh: fetchData
    };
}

// Export ticker constants for components
export { M7_TICKERS, PHYSICAL_AI_TICKERS };
