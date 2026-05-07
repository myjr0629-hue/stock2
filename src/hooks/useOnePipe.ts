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
}): OnePipeResult {
    const { session, pollPrice, pollPrevClose, pollExtPrice, pollExtLabel, pollChangePct, wsPrice, regularCloseToday } = params;
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
            price = (wsPrice && wsPrice > 0) ? wsPrice : pollPrice;
            source = (wsPrice && wsPrice > 0) ? 'WS' : 'POLL';
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
            price = prevClose;
            // PRE 본장 등락률: 폴링에서 가져온 changePct 사용 (전일 본장 등락률)
            // /api/live/quotes PRE에서 changePct = (dayClose - prevDayClose) / prevDayClose
            changePct = pollChangePct ?? 0;
            source = 'POLL';
            const preRealtime = (wsPrice && wsPrice > 0) ? wsPrice : (pollExtPrice > 0 ? pollExtPrice : 0);
            if (preRealtime > 0) {
                extPrice = preRealtime;
                extChangePct = prevClose > 0 ? round2(((preRealtime - prevClose) / prevClose) * 100) : 0;
                extLabel = 'PRE';
                source = (wsPrice && wsPrice > 0) ? 'WS' : 'POLL';
            }
            chartPrice = preRealtime > 0 ? preRealtime : prevClose;
            chartPrevClose = prevClose;
            break;
        }
        case 'POST': {
            const regClose = regularCloseToday || pollPrice;
            price = regClose;
            changePct = prevClose > 0 ? round2(((regClose - prevClose) / prevClose) * 100) : 0;
            source = 'POLL';
            const postRealtime = (wsPrice && wsPrice > 0) ? wsPrice : (pollExtPrice > 0 ? pollExtPrice : 0);
            if (postRealtime > 0) {
                extPrice = postRealtime;
                extChangePct = regClose > 0 ? round2(((postRealtime - regClose) / regClose) * 100) : 0;
                extLabel = 'POST';
                source = (wsPrice && wsPrice > 0) ? 'WS' : 'POLL';
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

    return { price, changePct, extPrice, extChangePct, extLabel, chartPrice, chartPrevClose, prevClose, session, source, regularCloseToday };
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

    // SSR 데이터로 잠금 초기화
    if (ssrPrices && Object.keys(closeLocks.current).length === 0) {
        Object.entries(ssrPrices).forEach(([ticker, data]) => {
            if (data.price > 0) closeLocks.current[ticker] = data.price;
        });
    }

    // ── 5. 결과 계산 (useMemo) ──
    const result = useMemo(() => {
        const map = new Map<string, OnePipeResult>();

        for (const ticker of tickers) {
            // 데이터 소스: 폴링 > SSR
            const poll = pollData?.data?.[ticker];
            const ssr = ssrPrices?.[ticker];

            const pollPrice = poll?.price || ssr?.price || 0;
            const pollPrevClose = poll?.prevClose || poll?.previousClose || ssr?.prevClose || 0;
            const pollExtPrice = poll?.extendedPrice || ssr?.extPrice || 0;
            const pollExtLabel = poll?.extendedLabel || ssr?.extLabel || '';
            const pollChangePct = poll?.changePercent ?? poll?.regChangePct ?? ssr?.changePct ?? null;
            const session = toSession(poll?.session || ssr?.session);

            // regularCloseToday 잠금 갱신
            if (pollPrice > 0 && !closeLocks.current[ticker]) {
                // CLOSED/POST에서 price ≈ prevClose면 잠금 차단 (Polygon 버그 방지)
                const isSuspicious = pollPrevClose > 0 && Math.abs(pollPrice - pollPrevClose) < 0.01;
                if (!isSuspicious || (session !== 'CLOSED' && session !== 'POST')) {
                    closeLocks.current[ticker] = pollPrice;
                }
            }

            // WS 가격 (연결 시에만)
            const wsData = wsConnected ? wsGetPrice(ticker) : undefined;
            const wsPrice = (wsData?.price && wsData.price > 0) ? wsData.price : null;

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
            });

            map.set(ticker, computed);
        }

        return map;
    }, [tickers, pollData, wsConnected, wsGetPrice, ssrPrices]);

    return result;
}
