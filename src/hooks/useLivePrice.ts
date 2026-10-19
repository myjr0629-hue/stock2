// [PERF] WebSocket-first live price hook with SWR polling fallback
// WS connected → instant push (0 latency)
// WS disconnected → SWR 5s polling (graceful degradation)
"use client";

import { wsTickUsable, type RestQuote } from '@/utils/liveQuote';
import useSWR from 'swr';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { pickExtPrice } from '@/utils/extWsTrust';

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
    volume: number;
    session: string;
    /** 혼합 전 REST 원본. 가격 비교로 WS 출처를 추측하지 않는다. */
    restQuote?: RestQuote;
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

        // ── [2026-08-29] STALE WS 가드 → [2026-10-19] 가격 채택 통합 ──────────────
        // 예전엔 REST 기준가에서 2% 넘게 벗어난 WS 를 버렸다(EC2 price-ws 가 어제 값을 뱉던 때). 이제 판정은 체결 시각으로 한다 —
        // 정규장 칸은 공용 규칙(liveQuote.wsTickUsable → src/lib/priceAcceptance.ts): 오늘 정규장 시간 안의 체결이고 서버가 본 체결보다
        // 옛것이 아닐 때만 WS. 체결 시각 없는 틱은 서버 값을 대신하지 않는다. 가격 차이만으로 정상 급등락을 버리지 않는다.
        // 시간외 칸은 아래 pickExtPrice(서버 시간외 체결 이후의 체결만)가 따로 정한다.
        const restQuote = data?.data?.[ticker];
        const nowMs = Date.now();
        const globalOpen = globalMarketStatus.toLowerCase() === 'open' || globalMarketStatus.toLowerCase() === 'reg';
        const restSession = String(restQuote?.session || data?.session || '').toLowerCase();
        const regularLane = globalOpen || restSession === 'reg' || restSession === 'regular' || restSession === 'open';
        const wsTrustworthy = !!wsPrice && (!regularLane
            || wsTickUsable(restQuote, { price: wsPrice.price, changePct: wsPrice.changePct, ts: wsPrice.ts, priceTime: wsPrice.priceTime }, 'reg', nowMs));

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
            // ★ [2026-09-25] WS 메시지엔 체결 시각·조건이 없다({price, changePct, volume}뿐).
            //   16:00 직후 WS 최신가는 종가 인쇄일 수 있고(9/25 COST: 화면 «POST $922.72 −0.05%» 인데
            //   서버는 아직 애프터 체결 없음), 04:00 직후엔 어제 애프터 체결일 수 있다.
            //   → 서버(quotes)가 «이 세션의 시간외 체결이 있다»고 확인한 뒤에만 WS 를 시간외 칸에 쓴다.
            const extConfirmed = (q?.extendedPrice || 0) > 0;
            // ★ [2026-10-13] 시간외엔 허브도 서버와 같은 15분 지연이다 — 허브 값은 서버가 확인한 시간외 체결가와 0.25% 안일 때만 쓴다.
            //   (EDGX 에 프리 체결이 드문 종목은 허브가 어젯밤 값을 들고 있다: 04:32 ET JPM 화면 PRE $334.81 · 서버 338.18 · 통합 테이프 337~338)
            const extPick = !isRegular && extConfirmed ? pickExtPrice(wsPrice.price, q?.extendedPrice, { wsTimeMs: wsPrice.priceTime, serverTime: q?.extendedTime, wsReceivedAt: wsPrice.ts, nowMs }) : null;
            if (!isRegular && extConfirmed && extPick) {
                const basePrice = q?.price;
                if (basePrice > 0) {
                    extChangePct = ((extPick.price - basePrice) / basePrice) * 100;
                }
            }

            return {
                price: isRegular ? wsPrice.price : (q?.price || 0),
                changePercent: isRegular ? (wsPrice.changePct || q?.changePercent || q?.regChangePct || 0) : (q?.changePercent || q?.regChangePct || 0),
                restQuote: q,
                prevClose: q?.previousClose || q?.prevClose || 0,
                // [CRITICAL BUGFIX] Never route wsPrice.price to extendedPrice during REGULAR session.
                // If it is regular session, extendedPrice MUST remain the frozen PRE/POST snapshot.
                extendedPrice: !isRegular ? (extConfirmed && extPick ? extPick.price : 0) : (q?.extendedPrice || 0),
                extendedChangePercent: extChangePct,
                extendedLabel: extLabel,
                // 정규장: 서버 값 그대로(PRE CLOSE 확정·잠정) · 프리/애프터: WS 가 값을 대신하므로 서버 체결 시각은 쓰지 않는다
                extendedKind: isRegular ? (q?.extendedKind ?? null) : (extConfirmed ? (extPick && extPick.fromWs ? 'live' : (q?.extendedKind ?? 'live')) : null),
                // 시간외 값과 그 체결 시각은 한 묶음 — 소켓 값을 쓰면 소켓 체결 시각(가격 채택 통합)
                extendedTime: isRegular ? (q?.extendedTime ?? null)
                    : (extPick && extPick.fromWs ? (wsPrice.priceTime ? new Date(wsPrice.priceTime).toISOString() : null) : (q?.extendedTime ?? null)),
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
        restQuote: q,
        prevClose: q.previousClose || q.prevClose || 0,
        extendedPrice: q.extendedPrice || 0,
        extendedChangePercent: q.extendedChangePercent || 0,
        extendedLabel: q.extendedLabel || '',
        extendedKind: q.extendedKind ?? null,
        extendedTime: q.extendedTime ?? null,
        volume: q.volume || 0,
        session: q.session || data.session || 'closed',
    };
}
