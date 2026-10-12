// [PERF] WebSocket-first live price hook with SWR polling fallback
// WS connected → instant push (0 latency)
// WS disconnected → SWR 5s polling (graceful degradation)
"use client";

import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { pickExtendedForApp, type ExtSrc } from '@/lib/price/extendedLive';
import { etDateOf } from '@/lib/marketCalendar';

/** ★ [2026-10-12] 프리·애프터 시세 요청 간격 — 실시간 시간외 체결(FMP, 서버 캐시 4초)을 따라간다 */
const EXT_REFRESH_MS = 5_000;

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
    /**
     * ★ [2026-10-05] 시간외 값의 종류 — 'close' = 확정 종가 · 'live' = 진행 중 체결 또는 잠정값.
     *   정규장 개장 직후(프리 종가 확정 09:47 ET 전)의 PRE CLOSE 는 'live' 다 → 화면은 extendedTime 을 «기준 시각»으로 같이 그린다.
     */
    extendedKind?: string | null;
    /** 그 값의 체결 시각(ISO) — 서버(/api/live/quotes)가 확인한 것 */
    extendedTime?: string | null;
    /**
     * ★ [2026-10-12] 시간외 값의 원천 — 'live' 실시간(FMP·실시간 허브 틱) · 'delayed' 15분 지연(Intrinio).
     *   화면은 지연이면 칸을 유지하고 «체결 시각 ET · 15분 지연»을 단다(calcPriceDisplay activeExtDelayed).
     */
    extendedSrc?: ExtSrc | null;
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

    // ★ [2026-10-12] 프리·애프터엔 5초 — 시세 요청이 실시간 시간외 체결(FMP)을 싣는다(허브가 이 종목을 방송하지 않아도 칸이 움직인다)
    const [extPolling, setExtPolling] = useState(false);

    // [POLL] SWR fallback — slow polling as backup when WS provides real-time data
    const { data } = useSWR(
        ticker ? `/api/live/quotes?symbols=${ticker}` : null,
        fetcher,
        {
            // [WS] Never slow down polling if open — WS is additive overlay only
            refreshInterval: isGlobalClosed ? 0 : (extPolling ? Math.min(refreshInterval, EXT_REFRESH_MS) : refreshInterval),
            dedupingInterval: 3000,
            revalidateOnFocus: !isGlobalClosed,
            revalidateOnReconnect: !isGlobalClosed,
            errorRetryCount: 2,
            keepPreviousData: true,
        }
    );
    const respSession = String(data?.session || '').toLowerCase();
    const wantExtPolling = respSession === 'pre' || respSession === 'post' || globalMarketStatus.toLowerCase() === 'extended-hours';
    useEffect(() => { if (wantExtPolling !== extPolling) setExtPolling(wantExtPolling); }, [wantExtPolling, extPolling]);

    // ★ [2026-10-12] 시간외 칸 — 허브 틱(체결 시각·원천) + 시세 요청 값 중 «오늘 그 세션 창 안의 가장 새로운 체결»(lib/price/extendedLive 한 곳)
    //   체결 시각 없는 허브 틱(옛 허브)은 쓰지 않는다 · 정규장·마감엔 적용하지 않는다(applies=false → 아래 기존 규칙)
    const extOf = (sessionName: string, q: any, tick: { price: number; tradeTs?: number; src?: string } | undefined) =>
        pickExtendedForApp({
            session: sessionName,
            todayET: etDateOf(Date.now()),
            ws: tick ? { price: tick.price, tradeTs: tick.tradeTs ?? null, src: tick.src ?? null } : null,
            rest: q ? { extendedPrice: q.extendedPrice, extendedTime: q.extendedTime, extendedSrc: q.extendedSrc, extendedKind: q.extendedKind } : null,
        });

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

            // [FIX] Compute extendedChangePercent correctly — 기준선은 PRE·POST 모두 quotes 의 price 다.
            //   ★ [2026-09-25] 프리마켓의 quotes.price = 마지막 정규장 종가(= PRE 기준선),
            //   previousClose 는 그 하나 앞(prevDay.c)이라 PRE 등락률이 한 세션 밀렸다.
            //   애프터의 quotes.price = 오늘 정규장 종가(= POST 기준선).
            let extChangePct = q?.extendedChangePercent || 0;
            // ★ [2026-10-12] 프리·애프터 — 허브 틱이 체결 시각을 실으면 그것으로 고른다(아래 extConfirmed 우회는 옛 허브용으로 남긴다)
            const ext = !isRegular ? extOf(s, q, wsPrice) : null;
            if (ext?.applies) {
                const basePrice = q?.price;
                return {
                    price: q?.price || 0,
                    changePercent: q?.changePercent || q?.regChangePct || 0,
                    prevClose: q?.previousClose || q?.prevClose || 0,
                    extendedPrice: ext.price,
                    extendedChangePercent: ext.price > 0 && basePrice > 0 ? ((ext.price - basePrice) / basePrice) * 100 : 0,
                    extendedLabel: extLabel,
                    extendedKind: ext.price > 0 ? 'live' : null,
                    extendedTime: ext.timeMs ? new Date(ext.timeMs).toISOString() : null,
                    extendedSrc: ext.src,
                    volume: wsPrice.volume || q?.volume || 0,
                    session: sessionRaw,
                };
            }
            // ★ [2026-09-25] WS 메시지엔 체결 시각·조건이 없다({price, changePct, volume}뿐).
            //   16:00 직후 WS 최신가는 종가 인쇄일 수 있고(9/25 COST: 화면 «POST $922.72 −0.05%» 인데
            //   서버는 아직 애프터 체결 없음), 04:00 직후엔 어제 애프터 체결일 수 있다.
            //   → 서버(quotes)가 «이 세션의 시간외 체결이 있다»고 확인한 뒤에만 WS 를 시간외 칸에 쓴다.
            const extConfirmed = (q?.extendedPrice || 0) > 0;
            if (!isRegular && extConfirmed) {
                const basePrice = q?.price;
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
                extendedPrice: !isRegular ? (extConfirmed ? wsPrice.price : 0) : (q?.extendedPrice || 0),
                extendedChangePercent: extChangePct,
                extendedLabel: extLabel,
                // 정규장: 서버 값 그대로(PRE CLOSE 확정·잠정) · 프리/애프터: WS 가 값을 대신하므로 서버 체결 시각은 쓰지 않는다
                extendedKind: isRegular ? (q?.extendedKind ?? null) : (extConfirmed ? 'live' : null),
                extendedTime: isRegular ? (q?.extendedTime ?? null) : null,
                extendedSrc: isRegular ? (q?.extendedSrc ?? null) : null,
                volume: wsPrice.volume || q?.volume || 0,
                session: sessionRaw,
            };
        }
    }

    // [FALLBACK] Standard SWR polling data
    if (!data?.data?.[ticker!]) return null;

    const q = data.data[ticker!];
    // ★ [2026-10-12] 프리·애프터 — 허브가 붙어 있으면(가격 2% 가드에 걸려 위 분기를 못 탔어도) 체결 시각으로 견줘 더 새로운 체결을 쓴다
    const fbTick = wsConnected && ticker && !isGlobalClosed ? wsGetPrice(ticker) : undefined;
    const fbExt = extOf(String(q.session || data.session || ''), q, fbTick);
    if (fbExt.applies) {
        const basePrice = q.price || 0;
        return {
            price: q.price || 0,
            changePercent: q.changePercent ?? q.regChangePct ?? 0,
            prevClose: q.previousClose || q.prevClose || 0,
            extendedPrice: fbExt.price,
            extendedChangePercent: fbExt.price > 0 && basePrice > 0 ? ((fbExt.price - basePrice) / basePrice) * 100 : 0,
            extendedLabel: q.extendedLabel || '',
            extendedKind: fbExt.price > 0 ? 'live' : null,
            extendedTime: fbExt.timeMs ? new Date(fbExt.timeMs).toISOString() : null,
            extendedSrc: fbExt.src,
            volume: q.volume || 0,
            session: q.session || data.session || 'closed',
        };
    }
    return {
        price: q.price || 0,
        changePercent: q.changePercent ?? q.regChangePct ?? 0,
        prevClose: q.previousClose || q.prevClose || 0,
        extendedPrice: q.extendedPrice || 0,
        extendedChangePercent: q.extendedChangePercent || 0,
        extendedLabel: q.extendedLabel || '',
        extendedKind: q.extendedKind ?? null,
        extendedTime: q.extendedTime ?? null,
        extendedSrc: q.extendedSrc ?? null,
        volume: q.volume || 0,
        session: q.session || data.session || 'closed',
    };
}
