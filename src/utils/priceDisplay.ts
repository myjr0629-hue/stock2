// [CENTRALIZED] Price Display Logic - Single Source of Truth
// All components should use this to calculate display prices

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
        postPrice?: number;
        postChangePct?: number;
    } | null;
}

export interface PriceDisplayOutput {
    // Main price display (intraday)
    mainPrice: number;
    mainChangePct: number;

    // Extended session display (PRE/POST)
    extPrice: number;
    extChangePct: number;
    extLabel: 'PRE' | 'POST' | '';
    showExtended: boolean;
}

/**
 * Calculate display prices based on market session.
 * 
 * Rules:
 * - PRE session: Main = prevClose (yesterday), Extended = current PRE price
 * - REG session: Main = underlyingPrice (live), Extended = none
 * - POST/CLOSED: Main = regularCloseToday (today's close), Extended = POST price
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

    let mainPrice = underlyingPrice || 0;
    let mainChangePct = intradayChangePct ?? changePercent ?? 0;
    let extPrice = 0;
    let extChangePct = 0;
    let extLabel: 'PRE' | 'POST' | '' = '';

    switch (session) {
        case 'PRE':
            // PRE: Main price = yesterday's close
            // Extended = current pre-market price
            if (prevClose) {
                mainPrice = prevClose;
            }
            if (extended?.prePrice && extended.prePrice > 0) {
                extPrice = extended.prePrice;
                extChangePct = (extended.preChangePct || 0) * 100;
                extLabel = 'PRE';
            }
            break;

        case 'REG':
            // REG: Main price = live price (underlyingPrice)
            // No extended display
            mainPrice = underlyingPrice || 0;
            break;

        case 'POST':
        case 'CLOSED':
            // POST/CLOSED: Main price = today's regular close
            // Extended = after-hours price
            if (regularCloseToday) {
                mainPrice = regularCloseToday;
            }
            if (extended?.postPrice && extended.postPrice > 0) {
                extPrice = extended.postPrice;
                extChangePct = (extended.postChangePct || 0) * 100;
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
