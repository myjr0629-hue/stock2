// [PERF] SWR hooks for Command page non-realtime data
// These APIs return data that changes slowly (hourly to quarterly),
// so SWR caching gives instant display on ticker re-visit.
// Real-time data (prices, quotes, options) is NOT handled here.
"use client";

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
});

// ─── Related Tickers (changes very rarely) ───────────────────────────
export function useRelatedTickers(ticker: string | null) {
    const { data, error, isLoading } = useSWR(
        ticker ? `/api/live/related?t=${ticker}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000,
            errorRetryCount: 2,
        }
    );

    return {
        relatedData: data ? {
            count: data.count || 0,
            topRelated: data.topRelated || [],
        } : null,
        error,
        isLoading,
    };
}

// ─── Analyst Recommendations (changes weekly) ────────────────────────
export function useAnalystData(ticker: string | null) {
    const { data, error, isLoading } = useSWR(
        ticker ? `/api/live/analyst?t=${ticker}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000,
            errorRetryCount: 2,
        }
    );

    return { analystData: data || null, error, isLoading };
}

// ─── Fundamentals (changes quarterly) ────────────────────────────────
export function useFundamentals(ticker: string | null) {
    const { data, error, isLoading } = useSWR(
        ticker ? `/api/live/fundamentals?t=${ticker}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000,
            errorRetryCount: 2,
        }
    );

    return { fundamentalData: data || null, error, isLoading };
}

// ─── Earnings Schedule (changes daily at most) ──────────────────────
export function useEarningsData(ticker: string | null) {
    const { data, error, isLoading } = useSWR(
        ticker ? `/api/live/earnings?t=${ticker}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000,
            errorRetryCount: 2,
        }
    );

    return {
        earningsData: data ? {
            nextDate: data.nextEarningsDate || null,
            daysLabel: data.daysLabel || 'TBD',
            epsEstimate: data.epsEstimate || null,
            quarter: data.quarter || null,
            year: data.year || null,
            hourLabel: data.hourLabel || '',
            color: data.color || 'text-slate-400',
        } : null,
        error,
        isLoading,
    };
}

// ─── SMA 50/200 Trend Phase (changes on daily close) ────────────────
export function useSmaData(ticker: string | null) {
    const { data, error, isLoading } = useSWR(
        ticker ? `/api/live/sma?t=${ticker}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000,
            errorRetryCount: 2,
        }
    );

    return {
        smaData: data ? {
            cross: data.cross || 'UNKNOWN',
            crossType: data.crossType || '',
            label: data.label || '',
            sma50: data.sma50 || 0,
            sma200: data.sma200 || 0,
            distance: data.distance || 0,
            isImminent: data.isImminent || false,
            phase: data.phase || 'UNKNOWN',
        } : null,
        error,
        isLoading,
    };
}

// ─── Volatility Regime (changes hourly) ─────────────────────────────
export function useVolatilityRegime(ticker: string | null) {
    const { data, error, isLoading } = useSWR(
        ticker ? `/api/live/volatility-regime?t=${ticker}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000,
            errorRetryCount: 2,
        }
    );

    return { volatilityData: data || null, error, isLoading };
}

// ─── Short Squeeze Risk (changes daily) ─────────────────────────────
export function useShortSqueeze(ticker: string | null) {
    const { data, error, isLoading } = useSWR(
        ticker ? `/api/live/short-squeeze?t=${ticker}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000,
            errorRetryCount: 2,
        }
    );

    return { squeezeData: data || null, error, isLoading };
}

// ─── Institutional Flow (changes hourly) ────────────────────────────
export function useInstitutionalFlow(ticker: string | null) {
    const { data, error, isLoading } = useSWR(
        ticker ? `/api/flow/realtime-metrics?ticker=${ticker}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000,
            errorRetryCount: 2,
        }
    );

    return { institutionalData: data || null, error, isLoading };
}
