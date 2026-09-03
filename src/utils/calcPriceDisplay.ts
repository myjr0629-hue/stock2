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
    /**
     * ★ [2026-09-04] 시간외 등락률을 «실제로 계산했는가».
     *   기준선(prevClose)이 없으면 계산이 불가능한데, 그때도 0 이 남아
     *   화면에 «+0.00%» 가 진짜 값처럼 떴다(대표 지적: PRE CLOSE 가
     *   맞게 나오는 종목과 아닌 종목이 섞인다). false 면 화면은 «—» 를 그린다.
     */
    activeExtPctKnown: boolean;
}

/**
 * Pure function: calculates all display prices from raw data.
 * No side effects, no hooks, no API calls.
 * Identical logic to LiveTickerDashboard.tsx L757-862 (now single source of truth).
 */

/**
 * [FIX 2026-08-04 · 프로덕션 회귀 수정]
 * 종가 대비 등락률을 «안전하게» 계산한다.
 *
 * 배경 — 두 개의 서로 다른 결함이 겹쳐 있었다:
 *  ① 7/31 이전: `Math.abs(today - prev) > 0.001` 가드가 «진짜 보합(0.00%)»을 결측으로 오판해
 *     어제의 등락률을 오늘 화면에 그대로 남겼다(SOXL 7/31 실측: 7/30의 +24.71%가 표시).
 *  ② 8/3 그 가드를 걷어내자 **가려져 있던 데이터 오염**이 드러났다:
 *     `/api/live/ticker`가 **오늘 종가를 prevClose 자리에** 넣어 보낸다.
 *     실측 SNDK 8/4: prevClose 1288.03 == regularCloseToday 1288.03, 그런데 prevChangePct 6.03.
 *     → (1288.03-1288.03)/1288.03 = **0.00%** 가 전 종목에 표시됐다.
 *     (같은 순간 `/api/live/quotes`는 prevClose 1214.83으로 정상 — 두 엔드포인트가 어긋난다)
 *
 * 두 경우는 «구분 가능»하다. prevChangePct가 모순을 드러낸다:
 *   · 진짜 보합      → 계산값 ≈ 0 이고 prevChangePct 도 ≈ 0   → 0.00% 가 정답
 *   · prevClose 오염 → 계산값 = 0 인데 prevChangePct 는 6.03  → prevChangePct 가 정답
 * "어제 대비 6.03% 움직였다"면서 어제 종가가 오늘과 같을 수는 없다.
 *
 * ⚠️ 근본 원인은 서버(`/api/live/ticker`)다. 이건 클라이언트 방어선이며,
 *    서버가 고쳐져도 이 함수는 그대로 옳게 동작한다(계산값을 그냥 쓴다).
 */
export function safeChangePct(
    todayClose: number,
    prevClose: number,
    prevChangePct?: number | null,
): number {
    if (!(todayClose > 0) || !(prevClose > 0)) return prevChangePct ?? 0;
    const computed = ((todayClose - prevClose) / prevClose) * 100;
    const looksFlat = Math.abs(computed) < 0.005;
    const contradicts = prevChangePct != null && Math.abs(prevChangePct) >= 0.01;
    // 계산값이 0인데 «어제 대비 움직였다»는 값이 따로 있으면 prevClose 가 오염된 것이다.
    if (looksFlat && contradicts) return prevChangePct as number;
    return computed;
}

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
                displayChangePct = safeChangePct(regularCloseToday, resolvedPrevClose, prevChangePct);
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
    let activeExtPctKnown = false;
    if (activeExtPrice > 0) {
        if ((activeExtType === 'PRE' || activeExtType === 'PRE_CLOSE') && resolvedPrevClose > 0) {
            activeExtPct = ((activeExtPrice - resolvedPrevClose) / resolvedPrevClose) * 100;
            activeExtPctKnown = true;
        } else if (activeExtType === 'POST') {
            // POST session change must reference regular close limit. Try regularCloseToday first, fallback to displayPrice (which locks to intraday close during POST).
            const referencePrice = (regularCloseToday && regularCloseToday > 0) ? regularCloseToday : displayPrice;
            if (referencePrice > 0) {
                activeExtPct = ((activeExtPrice - referencePrice) / referencePrice) * 100;
                activeExtPctKnown = true;
            }
        } else if (resolvedPrevClose > 0) {
            activeExtPct = ((activeExtPrice - resolvedPrevClose) / resolvedPrevClose) * 100;
            activeExtPctKnown = true;
        }
    }

    return {
        displayPrice,
        displayChangePct,
        activeExtPrice,
        activeExtType,
        activeExtLabel,
        activeExtPct,
        activeExtPctKnown
    };
}
