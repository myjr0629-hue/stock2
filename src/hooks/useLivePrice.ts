// [PERF] WebSocket-first live price hook with SWR polling fallback
// WS connected → instant push (0 latency)
// WS disconnected → SWR 5s polling (graceful degradation)
"use client";

import useSWR from 'swr';
import { useRealtimeData } from '@/providers/WebSocketProvider';

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
 * WebSocket-first price hook with SWR polling fallback
 * - WebSocket connected → instant push from EC2 Price WS Hub
 * - WebSocket disconnected → SWR polls /api/live/quotes every 5s
 */
export function useLivePrice(ticker: string | null, refreshInterval = 5000): LivePriceData | null {
    // [WS] Subscribe to WebSocket price stream
    const tickerArray = ticker ? [ticker] : undefined;
    const { connected: wsConnected, getPrice: wsGetPrice } = useRealtimeData(tickerArray);

    // [POLL] SWR fallback — reduced frequency when WS is active
    const { data } = useSWR(
        ticker ? `/api/live/quotes?symbols=${ticker}` : null,
        fetcher,
        {
            refreshInterval: wsConnected ? 30000 : refreshInterval, // Slow down polling when WS active
            dedupingInterval: 3000,
            revalidateOnFocus: true,
            revalidateOnReconnect: true,
            errorRetryCount: 2,
            keepPreviousData: true,
        }
    );

    // [WS PRIORITY] Use WebSocket price if available and fresh
    if (wsConnected && ticker) {
        const wsPrice = wsGetPrice(ticker);
        if (wsPrice && wsPrice.price > 0) {
            // Merge WS real-time price with SWR extended session data
            const q = data?.data?.[ticker];
            return {
                price: wsPrice.price,
                changePercent: wsPrice.changePct || q?.changePercent || q?.regChangePct || 0,
                prevClose: q?.previousClose || q?.prevClose || 0,
                extendedPrice: q?.extendedPrice || 0,
                extendedChangePercent: q?.extendedChangePercent || 0,
                extendedLabel: q?.extendedLabel || '',
                volume: wsPrice.volume || q?.volume || 0,
                session: q?.session || data?.session || 'closed',
            };
        }
    }

    // [FALLBACK] Standard SWR polling data
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

