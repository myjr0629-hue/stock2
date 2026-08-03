// [CENTRALIZED] Price Display Logic - Single Source of Truth
// Matches Command page (LiveTickerDashboard.tsx) behavior exactly

export interface PriceDisplayInput {
    underlyingPrice: number | null;
    prevClose: number | null;
    regularCloseToday: number | null;
    intradayChangePct: number | null;
    changePercent: number | null;
    session: 'PRE' | 'REG' | 'POST' | 'CLOSED';
    extended?: {
        prePrice?: number;
        preChangePct?: number;
        preClose?: number;  // Pre-market close (for REG session badge)
        postPrice?: number;
        postChangePct?: number;
    } | null;
    // [FIX] New fields from Command page (display object from /api/live/ticker)
    display?: {
        price?: number;
        changePctPct?: number;
    } | null;
    prevChangePct?: number | null;   // Previous session change %
    prevRegularClose?: number | null; // Previous regular session close price
}

export interface PriceDisplayOutput {
    // Main price display
    mainPrice: number;
    mainChangePct: number;

    // Extended session badge (PRE/POST/PRE CLOSE)
    extPrice: number;
    extChangePct: number;
    extLabel: string;  // 'PRE' | 'POST' | 'PRE CLOSE' | ''
    showExtended: boolean;
}

/**
 * Calculate display prices based on market session.
 * Matches Command page (LiveTickerDashboard.tsx) logic exactly.
 * 
 * Rules (matching Command page):
 * - PRE session: Main = prevClose (static, yesterday's close), Badge = PRE price
 * - REG session: Main = live price, Badge = PRE CLOSE
 * - POST session: Main = today's regular close, Badge = POST price
 * - CLOSED: Main = today's regular close, Badge = POST price if available
 */
export function getDisplayPrices(input: PriceDisplayInput): PriceDisplayOutput {
    const {
        underlyingPrice,
        prevClose,
        regularCloseToday,
        intradayChangePct,
        changePercent,
        session,
        extended,
        display,
        prevChangePct,
        prevRegularClose
    } = input;

    // [FIX] Use display.price from API as primary source (matches Command page exactly)
    let displayPrice = display?.price || underlyingPrice || 0;
    let displayChangePct = display?.changePctPct ?? intradayChangePct ?? changePercent ?? 0;

    let extPrice = 0;
    let extChangePct = 0;
    let extLabel = '';

    switch (session) {
        case 'PRE':
            // [FIX] PRE: Main = prevClose (STATIC yesterday's close) — matches Command page
            // Command page line 723: displayPrice = staticClose (prevRegularClose)
            // The pre-market price is ONLY shown in the badge
            const staticClose = prevRegularClose || prevClose || displayPrice;
            if (staticClose && staticClose > 0) {
                displayPrice = staticClose;
                // Show yesterday's change, NOT 0% (Command page line 729-730)
                displayChangePct = prevChangePct ?? intradayChangePct ?? 0;
            }
            // Badge = PRE price from extended data
            if (extended?.prePrice && extended.prePrice > 0) {
                extPrice = extended.prePrice;
                // Direct calculation from prices (avoids fraction vs pct ambiguity)
                if (displayPrice > 0) {
                    extChangePct = ((extended.prePrice - displayPrice) / displayPrice) * 100;
                }
                extLabel = 'PRE';
            }
            break;

        case 'REG':
            // REG: Main = live price (underlyingPrice or display.price)
            // [FIX] Use display.changePctPct which is the API's pre-calculated %
            displayPrice = display?.price || underlyingPrice || 0;
            displayChangePct = display?.changePctPct ?? changePercent ?? 0;
            // Badge = PRE CLOSE (pre-market closing price) if available
            if (extended?.preClose && extended.preClose > 0) {
                extPrice = extended.preClose;
                if (prevClose && prevClose > 0) {
                    extChangePct = ((extended.preClose - prevClose) / prevClose) * 100;
                }
                extLabel = 'PRE CLOSE';
            } else if (extended?.prePrice && extended.prePrice > 0) {
                // [FIX] Skip if prePrice === prevClose (stale OC.preMarket, meaningless 0% badge)
                const isMeaningful = prevClose ? Math.abs(extended.prePrice - prevClose) > 0.01 : true;
                if (isMeaningful) {
                    extPrice = extended.prePrice;
                    if (prevClose && prevClose > 0) {
                        extChangePct = ((extended.prePrice - prevClose) / prevClose) * 100;
                    }
                    extLabel = 'PRE CLOSE';
                }
            }
            break;

        case 'POST':
            // POST: Main = today's regular close (same as Command page)
            if (regularCloseToday && regularCloseToday > 0) {
                displayPrice = regularCloseToday;
            } else {
                displayPrice = display?.price || underlyingPrice || 0;
            }
            // Calculate change from prevClose (matches Command page)
            if (displayPrice > 0 && prevClose && prevClose > 0) {
                // [FIX 2026-07-31] 보합(0.00%)을 «데이터 없음»으로 오판하던 isNewTradingDay 제거.
                // 바깥 if가 이미 displayPrice>0 && prevClose>0 을 보장하므로 항상 계산하면 된다.
                // 같으면 식이 0을 낸다. 실측 SOXL 7/31: 어제의 +24.71%가 화면에 남았다.
                displayChangePct = ((displayPrice - prevClose) / prevClose) * 100;
            }
            // Badge = POST price
            if (extended?.postPrice && extended.postPrice > 0) {
                extPrice = extended.postPrice;
                if (displayPrice > 0) {
                    extChangePct = ((extended.postPrice - displayPrice) / displayPrice) * 100;
                } else if (prevClose && prevClose > 0) {
                    extChangePct = ((extended.postPrice - prevClose) / prevClose) * 100;
                }
                extLabel = 'POST';
            }
            break;

        case 'CLOSED':
            // CLOSED: Main = today's regular session close
            if (regularCloseToday && regularCloseToday > 0) {
                displayPrice = regularCloseToday;
            }
            // Calculate change from prevClose (matches Command page)
            if (displayPrice > 0 && prevClose && prevClose > 0) {
                // [FIX 2026-07-31] 보합(0.00%)을 «데이터 없음»으로 오판하던 isNewTradingDay 제거.
                // 바깥 if가 이미 displayPrice>0 && prevClose>0 을 보장하므로 항상 계산하면 된다.
                // 같으면 식이 0을 낸다. 실측 SOXL 7/31: 어제의 +24.71%가 화면에 남았다.
                displayChangePct = ((displayPrice - prevClose) / prevClose) * 100;
            }
            // Badge = POST price if available
            if (extended?.postPrice && extended.postPrice > 0) {
                extPrice = extended.postPrice;
                if (displayPrice > 0) {
                    extChangePct = ((extended.postPrice - displayPrice) / displayPrice) * 100;
                } else if (prevClose && prevClose > 0) {
                    extChangePct = ((extended.postPrice - prevClose) / prevClose) * 100;
                }
                extLabel = 'POST';
            }
            break;
    }

    return {
        mainPrice: displayPrice,
        mainChangePct: displayChangePct,
        extPrice,
        extChangePct,
        extLabel,
        showExtended: extPrice > 0
    };
}
