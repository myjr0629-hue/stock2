// [PERF] SWR-based data hook for Flow page
// Stale-While-Revalidate pattern: shows cached data instantly, refreshes in background
"use client";

import useSWR from 'swr';

// SWR fetcher: simple fetch wrapper
const fetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
});

interface UseFlowDataOptions {
    /** Polling interval in ms (default: 15000) */
    refreshInterval?: number;
}

/**
 * SWR hook for /api/live/ticker data
 * - Returns cached data instantly on page revisit (0ms load)
 * - Auto-refreshes in background
 * - Deduplicates concurrent requests
 * - Auto-retries on error
 */
export function useFlowData(ticker: string | null, options: UseFlowDataOptions = {}) {
    const { refreshInterval = 15000 } = options;

    const { data, error, isLoading, isValidating, mutate } = useSWR(
        ticker ? `/api/live/ticker?t=${ticker}` : null,
        fetcher,
        {
            refreshInterval,
            revalidateOnFocus: true,       // Refresh when tab becomes active
            revalidateOnReconnect: true,    // Refresh on network reconnect
            dedupingInterval: 10000,        // Suppress duplicate requests within 10s
            keepPreviousData: true,         // Keep stale data while fetching new ticker
            errorRetryCount: 3,            // Retry up to 3 times on error
            errorRetryInterval: 5000,      // Wait 5s between retries
        }
    );

    return {
        data,
        error,
        isLoading,       // true on first load only (no cached data)
        isValidating,    // true on ANY fetch (background refresh too)
        mutate,          // Manual refresh trigger
    };
}

/**
 * SWR hook for whale trades API (used inside FlowRadar)
 */
export function useWhaleTrades(ticker: string | null, enabled: boolean = true) {
    const { data, error, isLoading } = useSWR(
        ticker && enabled ? `/api/live/options/trades?t=${ticker}` : null,
        fetcher,
        {
            refreshInterval: 30000,        // 30s (was 15s, but response takes 35s)
            dedupingInterval: 25000,
            revalidateOnFocus: false,       // Don't refetch heavy API on focus
            errorRetryCount: 2,
            keepPreviousData: true,
        }
    );

    return { trades: data?.items || [], error, isLoading };
}

/**
 * SWR hook for realtime metrics API (used inside FlowRadar)
 */
export function useRealtimeMetrics(ticker: string | null, enabled: boolean = true) {
    const { data, error, isLoading } = useSWR(
        ticker && enabled ? `/api/flow/realtime-metrics?ticker=${ticker}` : null,
        fetcher,
        {
            refreshInterval: 15000,
            dedupingInterval: 10000,
            revalidateOnFocus: true,
            errorRetryCount: 2,
            keepPreviousData: true,
        }
    );

    return { metrics: data || { darkPool: null, shortVolume: null, bidAsk: null, blockTrade: null }, error, isLoading };
}

/**
 * SWR hook for dark pool trades API (used inside FlowRadar)
 */
export function useDarkPoolTrades(ticker: string | null, enabled: boolean = true) {
    const { data, error, isLoading } = useSWR(
        ticker && enabled ? `/api/flow/dark-pool-trades?ticker=${ticker}&limit=30` : null,
        fetcher,
        {
            refreshInterval: 30000,
            dedupingInterval: 25000,
            revalidateOnFocus: false,
            errorRetryCount: 2,
            keepPreviousData: true,
        }
    );

    return { trades: data?.items || [], error, isLoading };
}
