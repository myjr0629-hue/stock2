// [PERF] SWR-based data hook for Flow page
// Stale-While-Revalidate pattern: shows cached data instantly, refreshes in background
"use client";

import useSWR from 'swr';

// SWR fetcher: simple fetch wrapper
const fetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
});

// [PERF] Module-level cache — survives page unmount/navigation (same pattern as useMacroSnapshot)
// This ensures re-entry to Flow page shows data instantly (0ms) instead of skeleton
const _flowCache: Record<string, any> = {};

interface UseFlowDataOptions {
    /** Polling interval in ms (default: 15000) */
    refreshInterval?: number;
    /** Next.js SSR Hydration Data */
    fallbackData?: any;
}

/**
 * SWR hook for /api/live/ticker data
 * - Returns cached data instantly on page revisit (0ms load)
 * - Auto-refreshes in background
 * - Deduplicates concurrent requests
 * - Auto-retries on error
 * - Uses skip_alpha=1 to skip alpha-only APIs (Flow page doesn't use alpha)
 */
export function useFlowData(ticker: string | null, options: UseFlowDataOptions = {}) {
    const { refreshInterval = 15000, fallbackData } = options;

    // [PERF] Fallback priority: SSR data → module-level cache → undefined
    const effectiveFallback = fallbackData || (ticker ? _flowCache[ticker] : undefined);

    const { data, error, isLoading, isValidating, mutate } = useSWR(
        ticker ? `/api/live/ticker?t=${ticker}&skip_alpha=1` : null,
        fetcher,
        {
            fallbackData: effectiveFallback,
            refreshInterval,
            revalidateOnFocus: true,       // Refresh when tab becomes active
            revalidateOnReconnect: true,    // Refresh on network reconnect
            dedupingInterval: 3000,        // Must be < refreshInterval to avoid suppressing polls
            keepPreviousData: false,        // [FIX] false: clear stale data on ticker switch (prevents Y-axis stretch from mismatched prices)
            errorRetryCount: 3,            // Retry up to 3 times on error
            errorRetryInterval: 5000,      // Wait 5s between retries
        }
    );

    // [PERF] Persist successful fetch to module-level cache for instant re-entry
    if (data && ticker) {
        _flowCache[ticker] = data;
    }

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
export function useWhaleTrades(ticker: string | null, enabled: boolean = true, fallbackData?: any) {
    const { data, error, isLoading } = useSWR(
        ticker && enabled ? `/api/live/options/trades?t=${ticker}` : null,
        fetcher,
        {
            fallbackData: fallbackData ? { items: fallbackData } : undefined,
            refreshInterval: 0,            // [WS OPT] Disabled polling — WS provides real-time updates
            dedupingInterval: 60000,        // Prevent duplicate fetches for 60s
            revalidateOnFocus: false,
            revalidateOnReconnect: true,    // Re-fetch on network reconnect (safety net)
            errorRetryCount: 2,
            keepPreviousData: true,
        }
    );

    return { trades: data?.items || [], error, isLoading };
}

/**
 * SWR hook for realtime metrics API (used inside FlowRadar)
 */
export function useRealtimeMetrics(ticker: string | null, enabled: boolean = true, fallbackData?: any) {
    const { data, error, isLoading } = useSWR(
        ticker && enabled ? `/api/flow/realtime-metrics?ticker=${ticker}` : null,
        fetcher,
        {
            fallbackData,
            refreshInterval: 30000,        // 30s (aligned with warm-flow cron interval)
            dedupingInterval: 20000,
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
export function useDarkPoolTrades(ticker: string | null, enabled: boolean = true, fallbackData?: any) {
    const { data, error, isLoading } = useSWR(
        ticker && enabled ? `/api/flow/dark-pool-trades?ticker=${ticker}&limit=30` : null,
        fetcher,
        {
            fallbackData: fallbackData ? { items: fallbackData } : undefined,
            refreshInterval: 30000,
            dedupingInterval: 25000,
            revalidateOnFocus: false,
            errorRetryCount: 2,
            keepPreviousData: true,
        }
    );

    return { trades: data?.items || [], error, isLoading };
}

/**
 * SWR hook for true IV percentile from DynamoDB history
 * Returns actual historical percentile rank (not simplified range mapping)
 */
export function useIvPercentile(ticker: string | null, enabled: boolean = true) {
    const { data, error, isLoading } = useSWR(
        ticker && enabled ? `/api/flow/iv-percentile?t=${ticker}` : null,
        fetcher,
        {
            refreshInterval: 60000,        // 60s (IV changes slowly)
            dedupingInterval: 30000,
            revalidateOnFocus: false,
            errorRetryCount: 2,
            keepPreviousData: true,
        }
    );

    return {
        percentile: data?.percentile ?? null,
        currentIv: data?.currentIv ?? null,
        sampleSize: data?.sampleSize ?? 0,
        source: data?._source ?? null,
        error,
        isLoading,
    };
}

/**
 * SWR hook for enhanced Smart Money + UOA from DynamoDB history
 * Returns direction consistency (5-day) and OI z-score (5-10 day)
 */
export function useEnhancedMetrics(ticker: string | null, enabled: boolean = true) {
    const { data, error, isLoading } = useSWR(
        ticker && enabled ? `/api/flow/enhanced-metrics?t=${ticker}` : null,
        fetcher,
        {
            refreshInterval: 60000,        // 60s (historical data changes slowly)
            dedupingInterval: 30000,
            revalidateOnFocus: false,
            errorRetryCount: 2,
            keepPreviousData: true,
        }
    );

    return {
        smartMoney: data?.smartMoney ?? null,
        uoa: data?.uoa ?? null,
        source: data?._source ?? null,
        error,
        isLoading,
    };
}

