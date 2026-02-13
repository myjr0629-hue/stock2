// src/hooks/usePriceDisplay.ts
// [UNIFIED] Hook that combines useFlowData + useLivePrice → calcPriceDisplay
// Single import for Command and Flow pages

"use client";

import { useFlowData } from '@/hooks/useFlowData';
import { useLivePrice } from '@/hooks/useLivePrice';
import { calcPriceDisplay, PriceDisplayResult } from '@/utils/calcPriceDisplay';

interface UsePriceDisplayOptions {
    /** Ticker API refresh interval (default: 5000ms) */
    tickerInterval?: number;
    /** Live price refresh interval (default: 5000ms) */
    priceInterval?: number;
}

export interface UsePriceDisplayReturn extends PriceDisplayResult {
    /** Original ticker API data (for chart, flow, options, etc.) */
    liveQuote: any;
    /** SWR loading state */
    isLoading: boolean;
    /** SWR validating state */
    isValidating: boolean;
    /** Live price data from 5s polling */
    livePrice: ReturnType<typeof useLivePrice>;
    /** SWR mutate for manual refresh */
    mutate: () => void;
    /** Initial stock data from ticker API */
    initialStockData: any;
}

/**
 * Unified price display hook for single-ticker pages (Command, Flow).
 * Combines useFlowData (60s) + useLivePrice (5s) → calcPriceDisplay.
 * Returns everything needed for price display + the full liveQuote for other components.
 */
export function usePriceDisplay(
    ticker: string | null,
    options: UsePriceDisplayOptions = {}
): UsePriceDisplayReturn {
    const { tickerInterval = 5000, priceInterval = 5000 } = options;

    // Heavy data: ticker API (options, flow, structure, etc.)
    const {
        data: liveQuote,
        isLoading,
        isValidating,
        mutate,
    } = useFlowData(ticker, { refreshInterval: tickerInterval });

    // Lightweight: 5s price-only polling
    const livePrice = useLivePrice(ticker, priceInterval);

    // Effective session: liveQuote's session or fallback
    const session = liveQuote?.session || 'CLOSED';

    // Calculate all display values via pure function
    const priceResult = calcPriceDisplay({
        livePrice: livePrice?.price,
        liveChangePct: livePrice?.changePercent,
        apiDisplayPrice: liveQuote?.display?.price,
        apiDisplayChangePct: liveQuote?.display?.changePctPct,
        session,
        prevRegularClose: liveQuote?.prices?.prevRegularClose,
        prevClose: liveQuote?.prevClose,
        regularCloseToday: liveQuote?.prices?.regularCloseToday,
        prevChangePct: liveQuote?.prices?.prevChangePct,
        fallbackChangePct: liveQuote?.changePercent || 0,
        lastTrade: liveQuote?.prices?.lastTrade || liveQuote?.price,
        extended: liveQuote?.extended,
        prices: liveQuote?.prices,
    });

    return {
        ...priceResult,
        liveQuote,
        isLoading,
        isValidating,
        livePrice,
        mutate,
        initialStockData: liveQuote,
    };
}
