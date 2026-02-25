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

    // POST/CLOSED: Main display = today's regular close
    if (s === 'POST' || s === 'CLOSED') {
        if (regularCloseToday && regularCloseToday > 0) {
            displayPrice = regularCloseToday;

            // Detect "No New Trading Day" (weekend/holiday)
            const isNewTradingDay = resolvedPrevClose > 0
                ? Math.abs(regularCloseToday - resolvedPrevClose) > 0.001
                : false;

            if (isNewTradingDay && resolvedPrevClose > 0) {
                displayChangePct = ((regularCloseToday - resolvedPrevClose) / resolvedPrevClose) * 100;
            } else {
                // Weekend/holiday: show previous session's change
                displayChangePct = prevChangePct ?? fallbackChangePct ?? 0;
            }
        }
    }

    // PRE: Main display = prevClose (static), change = yesterday's change
    if (s === 'PRE') {
        if (resolvedPrevClose > 0) {
            displayPrice = resolvedPrevClose;
            displayChangePct = prevChangePct ?? 0;
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

    // ===== B. Extended Session Badge =====
    let activeExtPrice = 0;
    let activeExtType = '';
    let activeExtLabel = '';
    let activeExtPct = 0;

    // [V5.5 FAST FETCH] Provide 0ms latency for POST/PRE badges by hijacking the liveExt polling data
    if (input.liveExtPrice && input.liveExtPrice > 0 && input.liveExtLabel) {
        activeExtPrice = input.liveExtPrice;
        activeExtPct = input.liveExtChangePct || 0;
        activeExtLabel = input.liveExtLabel === 'PRE' ? 'PRE' : input.liveExtLabel === 'POST' ? 'POST' : input.liveExtLabel;
        activeExtType = input.liveExtLabel; // Treat type same as label for styling mapping
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

        // Calculate activeExtPct for fallback data
        if (activeExtPrice > 0 && resolvedPrevClose > 0) {
            if (activeExtType === 'PRE' || activeExtType === 'PRE_CLOSE') {
                activeExtPct = ((activeExtPrice - resolvedPrevClose) / resolvedPrevClose) * 100;
            } else if (activeExtType === 'POST' && regularCloseToday && regularCloseToday > 0) {
                activeExtPct = ((activeExtPrice - regularCloseToday) / regularCloseToday) * 100;
            } else {
                activeExtPct = ((activeExtPrice - resolvedPrevClose) / resolvedPrevClose) * 100;
            }
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
