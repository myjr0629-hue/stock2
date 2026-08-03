// src/utils/calcPriceDisplay.ts
// [UNIFIED] Single source of truth for price display calculations
// Used by: Command (LiveTickerDashboard), Flow, and future pages
// All session-aware price, changePct, and extended badge logic is here.

export interface PriceDisplayInput {
    /** 5s polling live price (from useLivePrice) */
    livePrice?: number | null;
    /** 5s polling live changePct */
    liveChangePct?: number | null;
    /** 5s polling extended price */
    liveExtPrice?: number | null;
    /** 5s polling extended change percent */
    liveExtChangePct?: number | null;
    /** 5s polling extended label ('PRE' or 'POST') */
    liveExtLabel?: string | null;
    /** Ticker API display.price (60s cached) */
    apiDisplayPrice?: number | null;
    /** Ticker API display.changePctPct */
    apiDisplayChangePct?: number | null;
    /** Effective trading session */
    session: string;
    /** Previous regular close (yesterday's close) */
    prevRegularClose?: number | null;
    /** Fallback prevClose */
    prevClose?: number | null;
    /** Today's regular session close */
    regularCloseToday?: number | null;
    /** Previous day's change percent (for weekends/holidays) */
    prevChangePct?: number | null;
    /** Initial/fallback change percent */
    fallbackChangePct?: number | null;
    /** Last trade price */
    lastTrade?: number | null;
    /** Extended session prices */
    extended?: {
        prePrice?: number | null;
        preClose?: number | null;
        postPrice?: number | null;
    } | null;
    /** Prices object from ticker API */
    prices?: {
        prePrice?: number | null;
        postPrice?: number | null;
    } | null;
}

export interface PriceDisplayResult {
    /** Main display price (big white number) */
    displayPrice: number;
    /** Main change percentage */
    displayChangePct: number;
    /** Extended session price (badge) */
    activeExtPrice: number;
    /** Extended session type: 'PRE' | 'PRE_CLOSE' | 'POST' | '' */
    activeExtType: string;
    /** Extended session label for UI */
    activeExtLabel: string;
    /** Extended session change percentage */
    activeExtPct: number;
}

/**
 * Pure function: calculates all display prices from raw data.
 * No side effects, no hooks, no API calls.
 * Identical logic to LiveTickerDashboard.tsx L757-862 (now single source of truth).
 */
export function calcPriceDisplay(input: PriceDisplayInput): PriceDisplayResult {
    const {
        livePrice,
        liveChangePct,
        apiDisplayPrice,
        apiDisplayChangePct,
        session,
        prevRegularClose,
        prevClose: prevCloseFallback,
        regularCloseToday,
        prevChangePct,
        fallbackChangePct,
        lastTrade,
        extended,
        prices,
    } = input;

    // Normalize session to uppercase for comparison
    const s = (session || 'CLOSED').toUpperCase();

    // Resolve prevClose with fallback chain
    const resolvedPrevClose = prevRegularClose || prevCloseFallback || 0;

    // ===== A. Main Display Price =====
    let displayPrice = livePrice || apiDisplayPrice || resolvedPrevClose || 0;
    let displayChangePct = liveChangePct ?? apiDisplayChangePct ?? null;

    // [STRICT YAHOO FINANCE PRICING RULE]
    if (s === 'PRE' || s === 'PRE_CLOSE') {
        // PRE-market: Main price MUST be yesterday's regular close.
        if (resolvedPrevClose > 0) {
            displayPrice = resolvedPrevClose;
            displayChangePct = prevChangePct !== null && prevChangePct !== undefined ? prevChangePct : (fallbackChangePct ?? 0);
        }
    } else if (s === 'POST' || s === 'CLOSED') {
        // POST-market / CLOSED: Main price MUST be today's regular close.
        if (regularCloseToday && regularCloseToday > 0) {
            displayPrice = regularCloseToday;
            // [FIX 2026-07-31] `Math.abs(...) > 0.001` 조건을 제거했다.
            // 오늘 종가가 전일 종가와 «같다»는 것은 0.00% 보합이라는 **답**이지 결측이 아닌데,
            // 그 조건이 거짓이 되면서 else의 `prevChangePct` — 이름 그대로 **어제의 등락률** —
            // 로 떨어졌다. 실측: SOXL 7/30 114.72(+24.71%) → 7/31 114.72(0.00%)에서
            // **7/30의 +24.71%가 7/31 화면에 그대로 표시**됐다.
            // 두 값이 모두 유효하면 언제나 계산한다. 같으면 식이 0을 낸다.
            if (resolvedPrevClose > 0) {
                displayChangePct = ((regularCloseToday - resolvedPrevClose) / resolvedPrevClose) * 100;
            } else {
                displayChangePct = prevChangePct ?? fallbackChangePct ?? 0;
            }
        } else if (resolvedPrevClose > 0 && displayPrice === 0) {
            // Fallback for weekend/holiday where regularCloseToday might be missing
            displayPrice = resolvedPrevClose;
            displayChangePct = prevChangePct ?? fallbackChangePct ?? 0;
        }
    }

    // Final fallback for displayChangePct
    if (displayChangePct === undefined || displayChangePct === null) {
        displayChangePct = fallbackChangePct || 0;
    }

    // REG fallback: if still no price, use lastTrade
    if ((!displayPrice || displayPrice === 0) && (s === 'REG' || s === 'RTH' || s === 'MARKET')) {
        displayPrice = lastTrade || displayPrice;
    }

    // [FIX V4] REG session: ALWAYS use (displayPrice - prevClose) / prevClose
    // Ignores ALL external changePct sources (WebSocket, SWR, Polygon) — they use inconsistent bases
    // This guarantees changePct always matches the displayPrice and prevClose shown to user
    if ((s === 'REG' || s === 'RTH' || s === 'MARKET') && displayPrice > 0 && resolvedPrevClose > 0) {
        displayChangePct = ((displayPrice - resolvedPrevClose) / resolvedPrevClose) * 100;
    }

    // ===== B. Extended Session Badge =====
    let activeExtPrice = 0;
    let activeExtType = '';
    let activeExtLabel = '';
    let activeExtPct = 0;

    // [V5.5 FAST FETCH] Provide 0ms latency for POST/PRE badges by hijacking the liveExt polling data
    if (input.liveExtPrice && input.liveExtPrice > 0 && input.liveExtLabel) {
        activeExtPrice = input.liveExtPrice;
        activeExtPct = input.liveExtChangePct || 0;
        
        const baseType = input.liveExtLabel.includes('PRE') ? 'PRE' : input.liveExtLabel.includes('POST') ? 'POST' : input.liveExtLabel;
        
        // During REG session, PRE market has closed → show as 'PRE CLOSE'
        const isRegSession = s === 'REG' || s === 'RTH' || s === 'MARKET';
        if (baseType === 'PRE' && isRegSession) {
            activeExtLabel = 'PRE CLOSE';
            activeExtType = 'PRE_CLOSE';
        } else {
            activeExtLabel = input.liveExtLabel;
            activeExtType = baseType;
        }
    } else {
        // Fallback to heavy ticker API data if live polling hasn't spun up yet
        if (s === 'PRE') {
            activeExtPrice = extended?.prePrice || prices?.prePrice || 0;
            activeExtType = 'PRE';
            activeExtLabel = 'PRE';
        } else if (s === 'REG' || s === 'RTH' || s === 'MARKET') {
            activeExtPrice = extended?.prePrice || prices?.prePrice || extended?.preClose || 0;
            if (activeExtPrice > 0) {
                activeExtType = 'PRE_CLOSE';
                activeExtLabel = 'PRE CLOSE';
            }
        } else if (s === 'POST') {
            activeExtPrice = extended?.postPrice || prices?.postPrice || 0;
            activeExtType = 'POST';
            activeExtLabel = 'POST';
        } else if (s === 'CLOSED') {
            activeExtPrice = extended?.postPrice || prices?.postPrice || 0;
            if (activeExtPrice > 0) {
                activeExtType = 'POST';
                activeExtLabel = 'POST (CLOSED)';
            } else {
                activeExtPrice = extended?.prePrice || prices?.prePrice || 0;
                if (activeExtPrice > 0) {
                    activeExtType = 'PRE_CLOSE';
                    activeExtLabel = 'PRE (CLOSED)';
                }
            }
        }
    }

    // [ABSOLUTE MATH OVERRIDE - BULLDOZER FIX]
    // Completely ignore any untrustworthy `activeExtPct` from APIs (like +3.93% instead of +0.54%).
    // Recalculate directly from absolute numbers to guarantee 100% data integrity globally.
    if (activeExtPrice > 0) {
        if ((activeExtType === 'PRE' || activeExtType === 'PRE_CLOSE') && resolvedPrevClose > 0) {
            activeExtPct = ((activeExtPrice - resolvedPrevClose) / resolvedPrevClose) * 100;
        } else if (activeExtType === 'POST') {
            // POST session change must reference regular close limit. Try regularCloseToday first, fallback to displayPrice (which locks to intraday close during POST).
            const referencePrice = (regularCloseToday && regularCloseToday > 0) ? regularCloseToday : displayPrice;
            if (referencePrice > 0) {
                activeExtPct = ((activeExtPrice - referencePrice) / referencePrice) * 100;
            }
        } else if (resolvedPrevClose > 0) {
            activeExtPct = ((activeExtPrice - resolvedPrevClose) / resolvedPrevClose) * 100;
        }
    }

    return {
        displayPrice,
        displayChangePct,
        activeExtPrice,
        activeExtType,
        activeExtLabel,
        activeExtPct
    };
}
