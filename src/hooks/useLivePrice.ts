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
export function useLivePrice(ticker: string | null, globalMarketStatus: string = 'closed', refreshInterval = 15000): LivePriceData | null {
    // [WS] Subscribe to WebSocket price stream
    const tickerArray = ticker ? [ticker] : undefined;
    const { connected: wsConnected, getPrice: wsGetPrice, prices: wsPrices } = useRealtimeData(tickerArray);

    const isGlobalClosed = globalMarketStatus.toLowerCase() === 'closed';

    // [POLL] SWR fallback — slow polling as backup when WS provides real-time data
    const { data } = useSWR(
        ticker ? `/api/live/quotes?symbols=${ticker}` : null,
        fetcher,
        {
            // [WS] Never slow down polling if open — WS is additive overlay only
            refreshInterval: isGlobalClosed ? 0 : refreshInterval,
            dedupingInterval: 3000,
            revalidateOnFocus: !isGlobalClosed,
            revalidateOnReconnect: !isGlobalClosed,
            errorRetryCount: 2,
            keepPreviousData: true,
        }
    );

    // [WS PRIORITY] Use WebSocket price if available and fresh.
    // [HOLIDAY/CLOSED FIX] Skip the WS overlay entirely when the market is closed
    // (holiday/weekend/overnight). On a closed day WS carries only the stale last
    // print, and this branch would route it into extendedPrice — mirroring the
    // regular close as a fake "POST $X +0.00%". When closed, use the polled quote
    // (/api/live/quotes), which already holds the correct last-session POST.
    if (wsConnected && ticker && !isGlobalClosed) {
        const wsPrice = wsGetPrice(ticker);

        // ── [2026-08-29] STALE WS 가드 ──────────────────────────────────
        // Massive 계정이 차단되면서 EC2 price-ws 가 실시간 틱을 못 받고,
        // 구독 시점에 캐시된 **어제 값**만 한 번 뱉는 상태가 됐다.
        //   실측: WS $228.2697 (고정) vs REST $218.985  → 4% 괴리, 화면에 오표시.
        // WS 가격이 REST 기준가에서 크게 벗어나면 WS 를 신뢰하지 않고
        // REST(Intrinio) 폴링 값으로 폴백한다.
        // EC2 워커를 Intrinio WS 로 이관하면 자연히 통과하게 되는 가드다.
        const restQuote = data?.data?.[ticker];
        const restRef = restQuote?.price || restQuote?.previousClose || restQuote?.prevClose || 0;
        const wsDeviation =
            wsPrice && wsPrice.price > 0 && restRef > 0
                ? Math.abs(wsPrice.price - restRef) / restRef
                : 0;
        const WS_MAX_DEVIATION = 0.02; // 2%
        const wsTrustworthy = wsDeviation <= WS_MAX_DEVIATION;

        if (!wsTrustworthy && wsPrice && wsPrice.price > 0 && restRef > 0) {
            if (typeof console !== 'undefined' && Math.random() < 0.02) {
                console.warn(
                    `[useLivePrice] WS 가격 무시 (${ticker}): ws=${wsPrice.price} rest=${restRef} 괴리=${(wsDeviation * 100).toFixed(2)}%`
                );
            }
        }

        if (wsPrice && wsPrice.price > 0 && wsTrustworthy) {
            // Merge WS real-time price with SWR extended session data
            const q = data?.data?.[ticker];
            
            // [V12] We must determine session robustness. If SWR hasn't loaded (data undefined), assuming 'closed' is lethal,
            // because it routes live WS prices into the extendedPrice bucket.
            // When in doubt (data undefined), default to generic 'open' so we don't accidentally animate the PRE CLOSE badge.
            const sessionRaw = q?.session || data?.session || (wsPrice ? 'open' : 'closed');
            
            // [ABSOLUTE FIX] Override delayed SWR session with the global SSOT marketStatus.
            // If the global market is 'open', it IS open. Period.
            const isGlobalOpen = globalMarketStatus.toLowerCase() === 'open' || globalMarketStatus.toLowerCase() === 'reg';
            const s = isGlobalOpen ? 'reg' : sessionRaw.toLowerCase();
            
            // [FIX] Do NOT overwrite regular session 'price' during POST/PRE/CLOSED.
            // WebSocket streams trades for whichever session is currently active.
            const isRegular = s === 'reg' || s === 'open' || s === 'market';
            const extLabel = q?.extendedLabel || (!isRegular ? (s === 'pre' ? 'PRE' : 'POST') : '');

            // [FIX] Compute extendedChangePercent correctly: PRE against prevClose, POST against regular close (price)
            let extChangePct = q?.extendedChangePercent || 0;
            if (!isRegular) {
                const basePrice = extLabel === 'PRE' ? q?.previousClose : q?.price;
                if (basePrice > 0) {
                    extChangePct = ((wsPrice.price - basePrice) / basePrice) * 100;
                }
            }

            return {
                price: isRegular ? wsPrice.price : (q?.price || 0),
                changePercent: isRegular ? (wsPrice.changePct || q?.changePercent || q?.regChangePct || 0) : (q?.changePercent || q?.regChangePct || 0),
                prevClose: q?.previousClose || q?.prevClose || 0,
                // [CRITICAL BUGFIX] Never route wsPrice.price to extendedPrice during REGULAR session.
                // If it is regular session, extendedPrice MUST remain the frozen PRE/POST snapshot.
                extendedPrice: !isRegular ? wsPrice.price : (q?.extendedPrice || 0),
                extendedChangePercent: extChangePct,
                extendedLabel: extLabel,
                volume: wsPrice.volume || q?.volume || 0,
                session: sessionRaw,
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
