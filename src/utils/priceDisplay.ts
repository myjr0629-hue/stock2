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
 * - PRE session: Main = current live price, Badge = PRE price (from extended.prePrice)
 * - REG session: Main = live price, Badge = PRE CLOSE (pre-market closing price)
 * - POST session: Main = live price, Badge = POST price
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
        extended
    } = input;

    // Default: Use underlying price as main display
    let mainPrice = underlyingPrice || 0;
    let mainChangePct = intradayChangePct ?? changePercent ?? 0;

    let extPrice = 0;
    let extChangePct = 0;
    let extLabel = '';

    switch (session) {
        case 'PRE':
            // PRE: Main = current live price (underlyingPrice)
            // Badge = PRE price from extended data
            mainPrice = underlyingPrice || 0;
            // Calculate change from prevClose
            if (mainPrice > 0 && prevClose && prevClose > 0) {
                mainChangePct = ((mainPrice - prevClose) / prevClose) * 100;
            }
            // Show PRE badge with pre-market price
            if (extended?.prePrice && extended.prePrice > 0) {
                extPrice = extended.prePrice;
                extChangePct = (extended.preChangePct || 0) * 100;
                extLabel = 'PRE';
            }
            break;

        case 'REG':
            // REG: Main = live price (underlyingPrice)
            // [FIX] Use changePercent (prevClose-based) to match Command page exactly
            mainPrice = underlyingPrice || 0;
            mainChangePct = changePercent ?? 0;  // Command uses display.changePctPct which equals changePercent
            // Badge = PRE CLOSE (pre-market closing price) if available
            if (extended?.preClose && extended.preClose > 0) {
                extPrice = extended.preClose;
                // Calculate PRE CLOSE change from prevClose
                if (prevClose && prevClose > 0) {
                    extChangePct = ((extended.preClose - prevClose) / prevClose) * 100;
                }
                extLabel = 'PRE CLOSE';
            } else if (extended?.prePrice && extended.prePrice > 0) {
                // Fallback to prePrice if preClose not available
                extPrice = extended.prePrice;
                extChangePct = (extended.preChangePct || 0) * 100;
                extLabel = 'PRE CLOSE';
            }
            break;


        case 'POST':
            // POST: Main = live price (underlyingPrice)
            // Badge = POST price
            mainPrice = underlyingPrice || 0;
            if (extended?.postPrice && extended.postPrice > 0) {
                extPrice = extended.postPrice;
                extChangePct = (extended.postChangePct || 0) * 100;
                extLabel = 'POST';
            }
            break;

        case 'CLOSED':
            // CLOSED: Main = today's regular session close
            // Badge = POST price if available
            if (regularCloseToday && regularCloseToday > 0) {
                mainPrice = regularCloseToday;
            }
            if (extended?.postPrice && extended.postPrice > 0) {
                extPrice = extended.postPrice;
                // Calculate POST change from regular close
                if (mainPrice > 0) {
                    extChangePct = ((extended.postPrice - mainPrice) / mainPrice) * 100;
                } else {
                    extChangePct = (extended.postChangePct || 0) * 100;
                }
                extLabel = 'POST';
            }
            break;
    }

    return {
        mainPrice,
        mainChangePct,
        extPrice,
        extChangePct,
        extLabel,
        showExtended: extPrice > 0
    };
}
