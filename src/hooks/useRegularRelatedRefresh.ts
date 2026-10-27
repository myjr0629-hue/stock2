"use client";

import { useEffect, useRef } from 'react';
import { relatedSessionContext } from '@/lib/relatedRowMerge';
import { etMinutesOf } from '@/lib/marketCalendar';

/** 정규장 중 직접 연관 행(/api/live/related) 다시 받는 간격 — 서버 스냅샷 캐시(인스턴스 60초)와 같다 */
export const RELATED_REGULAR_REFRESH_MS = 60_000;
/** 정규장 진입(09:30 ET)·화면 복귀를 알아채는 점검 간격(요청은 하지 않는다) */
const CHECK_MS = 15_000;

/**
 * 지금 다시 받을 때인가(순수) — 정규장(달력)이고, 09:30 ET대(개장 뒤 첫 1분 — 서버 스냅샷 캐시(인스턴스 60초)에 장전 값이 남을 수 있다)가 지났고,
 *   마지막 조회 뒤 60초(화면 복귀 때는 15초)가 지났을 때.
 */
export function relatedRefreshDue(nowMs: number, lastFetchMs: number, force = false): boolean {
    if (!relatedSessionContext(nowMs).regular) return false;
    if (etMinutesOf(nowMs) < 571) return false;
    return nowMs - lastFetchMs >= (force ? CHECK_MS : RELATED_REGULAR_REFRESH_MS);
}

/**
 * [T31c] 정규장 중 연관 종목의 직접 API 행을 주기적으로 다시 받는다 — 허브(약 15분 지연)가 아니라 최신 체결로 행을 갱신하기 위해.
 *   · 정규장(달력) + 화면이 보일 때만, 60초에 한 번 · 화면 복귀 때는 15초 넘었으면 바로 한 번 · 개장 뒤 첫 1분(09:30 ET대)은 묻지 않는다
 *   · 정규장 밖에서는 요청 0(장외·장전 동작 불변 — 첫 조회는 각 화면의 기존 코드가 한다)
 *   · 응답 행은 호출자가 기존 병합(mergeRelatedRow)으로 합친다
 */
export function useRegularRelatedRefresh(ticker: string | null | undefined, onRows: (rows: any[], count?: number) => void) {
    const cb = useRef(onRows);
    cb.current = onRows;
    useEffect(() => {
        if (!ticker) return;
        let alive = true;
        let inflight = false;
        // 마운트 시각을 마지막 조회로 친다 — 첫 조회는 화면의 기존 코드가 막 했다
        let lastFetch = Date.now();
        const run = (force = false) => {
            if (!alive || inflight) return;
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            const now = Date.now();
            if (!relatedRefreshDue(now, lastFetch, force)) return;
            inflight = true;
            lastFetch = now;
            fetch(`/api/live/related?t=${encodeURIComponent(ticker)}`)
                .then(res => res.json())
                .then(data => { if (alive && Array.isArray(data?.topRelated) && data.topRelated.length > 0) cb.current(data.topRelated, data.count); })
                .catch(() => {})
                .finally(() => { inflight = false; });
        };
        const id = setInterval(() => run(), CHECK_MS);
        const onVisible = () => { if (document.visibilityState === 'visible') run(true); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            alive = false;
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [ticker]);
}
