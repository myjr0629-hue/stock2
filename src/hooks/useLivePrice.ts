// [PERF] Lightweight 5s price polling hook
// Same pattern as dashboard's fetchPriceOnly — uses /api/live/quotes (no Redis cache)
// Separated from heavy /api/live/ticker (60s Redis cache) to get real-time prices
"use client";

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
});

export interface LivePriceData {
    price: number;
    changePercent: number;
    prevClose: number;
    extendedPrice: number;
    extendedChangePercent: number;
    extendedLabel: string;
    volume: number;
    session: string;
}

/**
 * SWR hook for real-time price updates via /api/live/quotes
 * - Polls every 5 seconds (configurable)
 * - No server-side cache (force-dynamic)
 * - Lightweight: only price data, no options/flow/structure
 */
export function useLivePrice(ticker: string | null, refreshInterval = 5000): LivePriceData | null {
    const { data } = useSWR(
        ticker ? `/api/live/quotes?symbols=${ticker}` : null,
        fetcher,
        {
            refreshInterval,
            dedupingInterval: 3000,
            revalidateOnFocus: true,
            revalidateOnReconnect: true,
            errorRetryCount: 2,
            keepPreviousData: true,
        }
    );

    if (!data?.data?.[ticker!]) return null;

    const q = data.data[ticker!];
    return {
        price: q.price || 0,
        changePercent: q.changePercent ?? q.regChangePct ?? 0,
        prevClose: q.previousClose || q.prevClose || 0,
        extendedPrice: q.extendedPrice || 0,
        extendedChangePercent: q.extendedChangePercent || 0,
        extendedLabel: q.extendedLabel || '',
        volume: q.volume || 0,
        session: q.session || data.session || 'closed',
    };
}
