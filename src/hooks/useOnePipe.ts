/**
 * useOnePipe — 진짜 원파이프
 * 
 * 사이트 전체에서 가격을 가져오는 유일한 훅.
 * 내부에서 WS + SWR 폴링 + 세션 판정 + regularCloseToday 잠금 전부 처리.
 * 사용하는 페이지는 이 훅만 호출하면 됨.
 * 
 * 사용법:
 *   const prices = useOnePipe(['NVDA', 'AAPL', 'TSLA']);
 *   const nvda = prices.get('NVDA');
 *   // nvda.price, nvda.changePct, nvda.extPrice, nvda.extLabel...
 */
'use client';

import { useMemo, useRef } from 'react';
import useSWR from 'swr';
import { useRealtimeData } from '@/providers/WebSocketProvider';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { pickExtPrice } from '@/utils/extWsTrust';
import { readStamp, wsTickFresh, makeStamp, type SourceStamp } from '@/lib/sourceStamp';
import { etDateOf } from '@/lib/marketCalendar';
import { acceptObservation, marketSessionAt, ownSessionBaseline, serverRegularPriceUsable } from '@/lib/priceAcceptance';

// ── 출력 타입 ──
export interface OnePipeResult {
    /** 메인 표시 가격 (세션별 자동 선택) */
    price: number;
    /** 메인 등락률 (항상 직접 계산, 외부 changePct 사용 금지) */
    changePct: number;
    /** PRE/POST 뱃지 가격 (없으면 null) */
    extPrice: number | null;
    /** PRE/POST 뱃지 등락률 */
    extChangePct: number | null;
    /** 뱃지 라벨: 'PRE'|'POST'|'PRE CLOSE'|'' */
    extLabel: string;
    /** StockChart currentPrice */
    chartPrice: number;
    /** StockChart prevClose (기준선) */
    chartPrevClose: number;
    /** 전일 종가 */
    prevClose: number;
    /** 현재 세션 */
    session: 'PRE' | 'REG' | 'POST' | 'CLOSED';
    /** 가격 소스 */
    source: 'WS' | 'POLL' | 'SSR';
    /** 오늘 정규 종가 (잠금됨) */
    regularCloseToday: number | null;
    /**
     * ★ [2026-10-19 가격 채택 통합] 정규장·PRE 등락의 기준 = 직전 완료 정규장 종가 C(P(D)).
     *   PRE 의 prevClose(시세 previousClose)는 그 한 세션 앞이라 화면(calcPriceDisplay prevRegularClose)의 기준으로 쓰면
     *   월요일 PRE 에 «본장 98(목) · PRE +2.04%»가 됐다(관문 B1-10191713). 화면 기준은 이 값으로.
     */
    regularBaseline: number | null;
    /** ★ 묶음 4 — 메인 가격(price)의 원천 날짜·관측 시각·근거(시세 응답 스탬프 · WS 를 쓰면 그 체결) */
    stamp?: SourceStamp;
}

// ── 내부 유틸 ──
const fetcher = (url: string) => fetch(url).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
function round2(n: number): number { return Math.round(n * 100) / 100; }

type Session = 'PRE' | 'REG' | 'POST' | 'CLOSED';
export type MarketSession = Session;
function toSession(s: string | undefined): Session {
    if (!s) return 'CLOSED';
    const u = s.toUpperCase();
    if (u === 'PRE' || u === 'PRE_MARKET' || u === 'PREMARKET') return 'PRE';
    if (u === 'REG' || u === 'REGULAR' || u === 'OPEN') return 'REG';
    if (u === 'POST' || u === 'POST_MARKET' || u === 'POSTMARKET') return 'POST';
    return 'CLOSED';
}

/**
 * 핵심 순수 함수 — 테스트 54/54 통과 완료
 * WS든 폴링이든 상관없이, 입력만 넣으면 정확한 결과 출력
 */
export function computeOnePipe(params: {
    session: Session;
    pollPrice: number;
    pollPrevClose: number;
    pollExtPrice: number;
    pollExtLabel: string;
    pollChangePct?: number | null;
    wsPrice: number | null;
    regularCloseToday: number | null;
    /** 허브 틱 체결 시각(ms) · 서버 시간외 체결 시각 — 주면 옛 틱이 서버 시간외 값을 덮지 못한다(pickExtPrice) */
    wsTimeMs?: number | null;
    pollExtTime?: string | number | null;
    /** 서버(폴링) 정규장 가격의 체결 시각(ms) — 주면 그보다 옛 소켓 틱은 정규장 가격을 덮지 못한다 */
    pollPriceTime?: number | null;
    /** 서버(폴링) 응답을 받은 시각(ms) — 체결 시각을 모를 때 «서버 관측의 상한» */
    pollReceivedAt?: number | null;
    /** 소켓 틱을 받은 시각(ms) — 10분 넘게 묵은 틱은 쓰지 않는다 */
    wsReceivedAt?: number | null;
    /** 계산 시각(한 계산 한 시계) — 기본 Date.now() */
    nowMs?: number;
}): OnePipeResult {
    const { session, pollPrice, pollPrevClose, pollExtPrice, pollExtLabel, pollChangePct, wsPrice, regularCloseToday } = params;
    const nowMs = params.nowMs ?? Date.now();   // 한 계산 한 시계
    const extTiming = { wsTimeMs: params.wsTimeMs, serverTime: params.pollExtTime, wsReceivedAt: params.wsReceivedAt, nowMs };
    const prevClose = pollPrevClose;

    let price = 0;
    let changePct = 0;
    let extPrice: number | null = null;
    let extChangePct: number | null = null;
    let extLabel = '';
    let chartPrice = 0;
    let chartPrevClose = 0;
    let source: 'WS' | 'POLL' | 'SSR' = 'POLL';

    switch (session) {
        case 'REG': {
            // ★ [2026-10-19 가격 채택 통합] 소켓 체결 시각을 넘기는 호출자는 공용 규칙(priceAcceptance.acceptObservation)으로 —
            //   오늘 정규장 시간 안의 체결 · 받은 지 10분 안 · 서버가 본 체결(모르면 서버 응답을 받은 시각)보다 옛것이 아닐 때만 소켓 값.
            //   가격 근접성은 보지 않는다 · 체결 시각 없는 틱은 서버 값을 대신하지 않는다. 시각을 넘기지 않는 옛 호출자는 예전처럼(상위에서 이미 걸렀다).
            const timed = params.wsTimeMs !== undefined;
            let wsOk = !!(wsPrice && wsPrice > 0);
            if (wsOk && timed) {
                const pt = Number(params.pollPriceTime) || 0;
                const server = pollPrice > 0 ? { lane: 'regular' as const, sourceSessionDate: pt ? etDateOf(pt) : null, price: pollPrice,
                    tradeTime: pt || null, receivedAt: Number(params.pollReceivedAt) || 0, basis: 'trade' as const, origin: 'server' as const, finality: 'provisional' as const } : null;
                const wt = Number(params.wsTimeMs) || 0;
                const ws = { lane: 'regular' as const, sourceSessionDate: wt ? etDateOf(wt) : null, price: wsPrice as number,
                    tradeTime: wt || null, receivedAt: Number(params.wsReceivedAt) || nowMs, basis: 'trade' as const, origin: 'ws' as const, finality: 'provisional' as const };
                wsOk = acceptObservation(server, ws, marketSessionAt(nowMs)).value === ws;
            }
            price = wsOk ? (wsPrice as number) : pollPrice;
            source = wsOk ? 'WS' : 'POLL';
            changePct = prevClose > 0 ? round2(((price - prevClose) / prevClose) * 100) : 0;
            if (pollExtPrice > 0 && pollExtLabel === 'PRE') {
                extPrice = pollExtPrice;
                extChangePct = prevClose > 0 ? round2(((pollExtPrice - prevClose) / prevClose) * 100) : 0;
                extLabel = 'PRE CLOSE';
            }
            chartPrice = price;
            chartPrevClose = prevClose;
            break;
        }
        case 'PRE': {
            // ★ [2026-09-25] 프리마켓의 «본장»은 마지막 정규장 종가 = quotes.price(스냅샷 day.c)다.
            //   quotes.prevClose(prevDay.c)는 Intrinio 이관 뒤 «그 하나 앞»이 됐다(Massive 땐 prevDay 가
            //   곧 마지막 정규장이었다) → 월요일 프리마켓에 목요일 종가가 메인 가격·PRE 기준선으로 나갔다.
            //   quotes 를 아직 못 받았으면(pollPrice 0) 예전처럼 prevClose 로 둔다.
            const lastRegClose = pollPrice > 0 ? pollPrice : prevClose;
            price = lastRegClose;
            // PRE 본장 등락률: null이면 기존 값 유지 (Phase 0 race condition 방지)
            changePct = pollChangePct ?? changePct ?? 0;
            source = 'POLL';
            // ★ [2026-09-25] WS 가격엔 체결 시각·조건이 없다 — 04:00 직후 WS 최신가는 어제 애프터 체결일 수 있다.
            //   서버(폴링)가 오늘 프리 체결을 확인(pollExtPrice > 0)한 뒤에만 WS 를 PRE 가격으로 쓴다.
            //   ★ [2026-10-13] 시간외엔 허브도 서버와 같은 15분 지연 — 허브 값은 서버 값과 0.25% 안일 때만 쓴다(어제 값을 든 허브가 PRE 칸에 앉았다: JPM $334.81 vs 서버 338.18)
            const pickedPre = pickExtPrice(wsPrice, pollExtPrice, extTiming);
            const preRealtime = pickedPre.price;
            if (preRealtime > 0) {
                extPrice = preRealtime;
                extChangePct = lastRegClose > 0 ? round2(((preRealtime - lastRegClose) / lastRegClose) * 100) : 0;
                extLabel = 'PRE';
                source = pickedPre.fromWs ? 'WS' : 'POLL';
            }
            chartPrice = preRealtime > 0 ? preRealtime : lastRegClose;
            chartPrevClose = lastRegClose;
            break;
        }
        case 'POST': {
            const regClose = regularCloseToday || pollPrice;
            price = regClose;
            changePct = prevClose > 0 ? round2(((regClose - prevClose) / prevClose) * 100) : 0;
            source = 'POLL';
            // ★ [2026-09-25] 16:00 직후 WS 최신가는 «종가 인쇄»일 수 있다 — 서버가 오늘 애프터 체결을
            //   확인(pollExtPrice > 0)한 뒤에만 WS 를 POST 가격으로 쓴다(그 뒤로는 WS 가 더 최신).
            const pickedPost = pickExtPrice(wsPrice, pollExtPrice, extTiming);   // ★ [2026-10-13] 위 PRE 와 같은 규칙 — 허브 값은 서버 값과 0.25% 안일 때만
            const postRealtime = pickedPost.price;
            if (postRealtime > 0) {
                extPrice = postRealtime;
                extChangePct = regClose > 0 ? round2(((postRealtime - regClose) / regClose) * 100) : 0;
                extLabel = 'POST';
                source = pickedPost.fromWs ? 'WS' : 'POLL';
            }
            chartPrice = postRealtime > 0 ? postRealtime : regClose;
            chartPrevClose = regClose;
            break;
        }
        case 'CLOSED': {
            const regClose = regularCloseToday || pollPrice;
            price = regClose;
            changePct = prevClose > 0 && Math.abs(regClose - prevClose) > 0.001
                ? round2(((regClose - prevClose) / prevClose) * 100) : 0;
            source = 'POLL';
            if (pollExtPrice > 0) {
                extPrice = pollExtPrice;
                extChangePct = regClose > 0 ? round2(((pollExtPrice - regClose) / regClose) * 100) : 0;
                extLabel = 'POST';
            }
            chartPrice = regClose;
            chartPrevClose = prevClose;
            break;
        }
    }

    // 정규장·PRE 등락 기준 C(P(D)) — PRE 는 마지막 완료 정규장 종가(= 본장 값), 그 밖은 전 거래일 종가(시세 previousClose)
    const regularBaseline = ownSessionBaseline({ price: pollPrice, previousClose: prevClose, session });
    return { price, changePct, extPrice, extChangePct, extLabel, chartPrice, chartPrevClose, prevClose, session, source, regularCloseToday, regularBaseline };
}

/**
 * useOnePipe — 진짜 원파이프 훅
 * 
 * @param tickers 종목 코드 배열
 * @param options.refreshInterval 폴링 간격 (기본 5000ms)
 * @param options.ssrPrices SSR 초기 가격 데이터 (하이드레이션용)
 */
export function useOnePipe(
    tickers: string[],
    options?: {
        refreshInterval?: number;
        ssrPrices?: Record<string, { price: number; prevClose: number; changePct?: number; extPrice?: number; extLabel?: string; session?: string }>;
    }
): Map<string, OnePipeResult> {
    const refreshInterval = options?.refreshInterval ?? 5000;
    const ssrPrices = options?.ssrPrices;

    // ── 1. 마켓 상태 (폴링 제어용) ──
    const { status: marketStatus } = useMarketStatus();
    const isClosed = marketStatus.isHoliday || marketStatus.market === 'closed';

    // ── 2. WebSocket 가격 ──
    const tickerArray = tickers.length > 0 ? tickers : undefined;
    const { connected: wsConnected, getPrice: wsGetPrice } = useRealtimeData(tickerArray);

    // ── 3. SWR 폴링 (/api/live/quotes) ──
    const tickerString = tickers.join(',');
    const { data: pollData } = useSWR(
        tickerString ? `/api/live/quotes?symbols=${tickerString}` : null,
        fetcher,
        {
            refreshInterval: isClosed ? 0 : refreshInterval,
            revalidateOnFocus: !isClosed,
            revalidateOnReconnect: !isClosed,
            keepPreviousData: true,
            dedupingInterval: Math.max(refreshInterval - 1000, 1000),
            errorRetryCount: 2,
        }
    );

    // ── 4. regularCloseToday 잠금 (useRef — 렌더 간 유지) ──
    const closeLocks = useRef<Record<string, number>>({});
    /** 정규장 중 마지막으로 받은 실제 정규장 가격 — 마감 뒤 서버가 proxy 값만 줄 때 직전 실제 값으로 쓴다 */
    const lastRegular = useRef<Record<string, number>>({});

    // SSR 데이터로 잠금 초기화 — «정규장 종가»인 세션(POST·CLOSED)의 값만 잠근다
    if (ssrPrices && Object.keys(closeLocks.current).length === 0) {
        Object.entries(ssrPrices).forEach(([ticker, data]) => {
            const ss = toSession(data.session);
            if (data.price > 0 && (ss === 'POST' || ss === 'CLOSED')) closeLocks.current[ticker] = data.price;
        });
    }

    // ── 5. 결과 계산 (useMemo) ──
    const result = useMemo(() => {
        const map = new Map<string, OnePipeResult>();

        for (const ticker of tickers) {
            // 데이터 소스: 폴링 > SSR
            const poll = pollData?.data?.[ticker];
            const ssr = ssrPrices?.[ticker];

            // ★ [10/19 가격 채택 통합] 서버가 proxy(정규장 시간 밖 관측 — 벌크 마감 뒤 호가 중간값)로 표시한 정규장 가격은
            //   종가로 잠그지 않는다 — 직전 실제 정규장 값(정규장 마지막 폴링·이미 잠근 종가)이 있으면 그것(설계서 T35)
            const pollUsable = serverRegularPriceUsable(poll);
            const lastReal = closeLocks.current[ticker] || lastRegular.current[ticker] || 0;
            const pollPrice = (pollUsable || !(lastReal > 0) ? poll?.price : lastReal) || ssr?.price || 0;
            const pollPrevClose = poll?.prevClose || poll?.previousClose || ssr?.prevClose || 0;
            const pollExtPrice = poll?.extendedPrice || ssr?.extPrice || 0;
            const pollExtLabel = poll?.extendedLabel || ssr?.extLabel || '';
            const pollChangePct = poll?.changePercent ?? poll?.regChangePct ?? ssr?.changePct ?? null;
            const session = toSession(poll?.session || ssr?.session);

            // regularCloseToday 잠금 갱신
            // ★ [2026-09-25] «정규장 종가»는 POST·CLOSED 의 quotes.price 에만 있다. 예전엔 세션과 무관하게
            //   첫 폴링 값을 잠가서, 정규장에 연 페이지를 애프터까지 두면 «정규장 중 실시간 가격»이
            //   POST 의 메인 가격·기준선으로 남았다. PRE·REG 에선 잠금을 비운다(다음 마감 때 새로 잡는다).
            if (session === 'PRE' || session === 'REG') {
                delete closeLocks.current[ticker];
                if (session === 'REG' && pollUsable && pollPrice > 0) lastRegular.current[ticker] = pollPrice;
            } else if (pollUsable && pollPrice > 0 && !closeLocks.current[ticker]) {
                // 종가 잠금은 서버 실제 정규장 값으로만 — proxy 대신 남긴 장중 값은 잠그지 않는다(관문 10192055 P1)
                // CLOSED/POST에서 price ≈ prevClose면 잠금 차단 (Polygon 버그 방지)
                const isSuspicious = pollPrevClose > 0 && Math.abs(pollPrice - pollPrevClose) < 0.01;
                if (!isSuspicious) {
                    closeLocks.current[ticker] = pollPrice;
                }
            }

            // WS 가격 (연결 시에만)
            // ★ [2026-10-19 묶음 4] 틱의 «나이»를 본다 — 지난 세션 체결·시세가 이미 더 늦은 체결을 본 틱·체결 시각 없이 오래 남은 틱은 쓰지 않는다(wsTickFresh)
            const nowMs = Date.now();
            const restStamp = readStamp(poll, nowMs);
            const wsData = wsConnected ? wsGetPrice(ticker) : undefined;
            const wsFresh = !!wsData && wsTickFresh({ priceTime: wsData.priceTime, receivedAt: wsData.ts }, session === 'REG' ? 'reg' : session.toLowerCase(), nowMs, restStamp?.observedAt ?? null);
            const wsPrice = (wsFresh && wsData?.price && wsData.price > 0) ? wsData.price : null;

            // computeOnePipe 호출 (검증 완료된 순수 함수)
            const computed = computeOnePipe({
                session,
                pollPrice,
                pollPrevClose,
                pollExtPrice,
                pollExtLabel,
                pollChangePct,
                wsPrice,
                regularCloseToday: closeLocks.current[ticker] || null,
                wsTimeMs: wsPrice ? (wsData?.priceTime ?? null) : null,
                pollExtTime: poll?.extendedTime ?? null,
                pollPriceTime: restStamp?.observedAt ?? null,
                pollReceivedAt: restStamp?.receivedAt ?? null,
                wsReceivedAt: wsData?.ts ?? null,
                nowMs,
            });

            // 메인 가격의 스탬프 — 정규장에 WS 를 썼으면 그 체결, 아니면 시세 응답(서버 스탬프 · 없으면 날짜 null)
            const stamp = computed.source === 'WS' && session === 'REG'
                ? makeStamp({ sourceSessionDate: etDateOf(wsData?.priceTime || nowMs), observedAt: wsData?.priceTime || null, receivedAt: wsData?.ts ?? nowMs, basis: 'live' }, nowMs)
                : (restStamp ?? makeStamp({ receivedAt: nowMs, basis: computed.price > 0 ? 'last-session' : 'missing' }, nowMs));
            map.set(ticker, { ...computed, stamp });
        }

        return map;
    }, [tickers, pollData, wsConnected, wsGetPrice, ssrPrices]);

    return result;
}
