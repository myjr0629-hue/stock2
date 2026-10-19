
"use client";

import { useState, useEffect, useRef } from "react";
import { MarketStatusResult } from "@/services/marketStatusProvider";
import { usEquitySessionForEt } from "@/lib/marketCalendar";
import { etClock, REG_CLOSE_MIN } from "@/lib/marketSession";

// Compute initial session from client clock to prevent polling freeze on mount
// This is a best-effort estimate; the API will correct it within seconds
function computeInitialSession(): MarketStatusResult {
    const now = new Date();
    // 세션 경계는 거래소 달력 하나(주말·휴장 CLOSED · 조기 폐장 13:00) — 시계는 etClock(formatToParts, h23)
    const c = etClock(now.getTime());
    const session = usEquitySessionForEt(c.date, c.minutes);
    // 첫 추정의 market 은 예전 그대로 «세션이 있으면 open»(평일 정상 시각 동등).
    // 단 조기 폐장일 13:00~16:00 은 예전 16:00 고정 시계로는 «정규장»이던 구간 — 거기서 open 이면
    // useLivePrice 가 시간외 체결을 정규장 가격으로 쓴다 → 그 구간만 extended-hours.
    const market: MarketStatusResult['market'] =
        session === 'closed' ? 'closed'
        : session === 'post' && c.minutes < REG_CLOSE_MIN ? 'extended-hours'
        : 'open';
    return {
        market,
        session,
        isHoliday: false,
        // 서버가 알려주기 전엔 «모른다» — 휴장 배지를 지레 띄우지 않는다
        isHolidaySession: false,
        serverTime: now.toISOString(),
        asOfET: '-',
        source: 'FALLBACK',
        cacheAgeSec: 0
    };
}

const INITIAL_STATUS: MarketStatusResult = computeInitialSession();

export function useMarketStatus() {
    const [status, setStatus] = useState<MarketStatusResult>(INITIAL_STATUS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // [FIX] Track previous meaningful fields to prevent unnecessary re-renders
    // Without this, every 30s poll creates a new object → re-render → SWR cascade → chart flicker
    // ⚠️ [2026-09-07] 이 가드는 «추적하는 필드»만 본다. 여기에 없는 필드는
    //   응답에 실려 와도 화면에 **영원히 도달하지 않는다**(setStatus 가 안 불린다).
    //   isHolidaySession 을 서버에 추가하고 여기를 안 고쳤더니, API 는
    //   isHolidaySession:true 를 주는데 화면엔 휴장 배지가 안 떴다 —
    //   market·session·isHoliday 셋이 초기값과 같았기 때문이다.
    //   **여기에 필드를 추가할 때는 이 목록도 함께 늘려야 한다.**
    const prevStateRef = useRef({
        market: INITIAL_STATUS.market,
        session: INITIAL_STATUS.session,
        isHoliday: INITIAL_STATUS.isHoliday,
        isHolidaySession: INITIAL_STATUS.isHolidaySession,
    });

    useEffect(() => {
        let isMounted = true;

        const fetchStatus = async () => {
            try {
                // Determine base URL properly
                const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                const res = await fetch(`${baseUrl}/api/market/status`, {
                    next: { revalidate: 30 } // Client-side hint
                });

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const data = await res.json();

                if (isMounted) {
                    // [FIX] Only update state when meaningful fields actually change
                    // Prevents 30s poll from causing re-render cascade when market/session unchanged
                    const prev = prevStateRef.current;
                    if (prev.market !== data.market || prev.session !== data.session
                        || prev.isHoliday !== data.isHoliday
                        || prev.isHolidaySession !== data.isHolidaySession) {
                        prevStateRef.current = {
                            market: data.market, session: data.session,
                            isHoliday: data.isHoliday, isHolidaySession: data.isHolidaySession,
                        };
                        setStatus(data);
                    }
                    setLoading(false);
                    setError(null);
                }
            } catch (err: any) {
                if (isMounted) {
                    console.error("[useMarketStatus] Poll failed:", err);
                    setError(err.message);
                    setLoading(false);
                    // Keep previous status on error to prevent UI flicker
                }
            }
        };

        // Initial Fetch
        fetchStatus();

        // Poll every 30s (matches server cache)
        const interval = setInterval(fetchStatus, 30000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    return { status, loading, error };
}
