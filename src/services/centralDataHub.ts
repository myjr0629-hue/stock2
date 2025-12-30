import { fetchMassive, CACHE_POLICY } from './massiveClient';
import { getMarketStatusSSOT } from './marketStatusProvider';

export interface CentralQuote {
    ticker: string;
    price: number; // The "Golden" Price (Session Aware)
    changePct: number; // The "Golden" Change % (Session Aware)

    // Raw Components
    snapshot: any; // /v2/snapshot
    openClose: any; // /v1/open-close
    prevClose: number;

    // Session Info
    session: "PRE" | "REG" | "POST" | "CLOSED";
    isRollover: boolean; // True if date changed but market hasn't opened (0% change fix)

    // Display Hints
    display: {
        priceLabel: string;
        baselineLabel: string;
        color: "green" | "red" | "grey";
    };
}

/**
 * Central Data Hub - Single Source of Truth for Stock Data
 * Aggregates Snapshot, Open-Close, and Market Status to provide a unified quote.
 */
export const CentralDataHub = {
    /**
     * Get the authoritative quote for a ticker.
     * specificDate can be passed to force a historical look (default: today).
     */
    getQuote: async (ticker: string, specificDate?: string): Promise<CentralQuote> => {
        // 1. Get Market Status (SSOT)
        const marketStatus = await getMarketStatusSSOT();
        const session = marketStatus.session.toUpperCase() as "PRE" | "REG" | "POST" | "CLOSED";

        // 2. Fetch Data (Parallel)
        // Snapshot is the primary source for Real-Time & Extended Hours
        // Open-Close is the source for Official Closes
        const [snapshotRes, ocRes] = await Promise.all([
            fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {}, true),
            // For now, always try to fetch today's open-close, fallback handled in logic
            fetchMassive(`/v1/open-close/${ticker}/${specificDate || new Date().toISOString().split('T')[0]}`, {}, true)
        ]);

        const S = snapshotRes.data?.ticker || {};
        const OC = ocRes.data || {};

        // 3. Determine Prices (Session Aware Logic - Placeholder for logic migration)
        const price = S.lastTrade?.p || 0;
        const changePct = S.todaysChangePerc || 0;

        return {
            ticker,
            price,
            changePct,
            snapshot: S,
            openClose: OC,
            prevClose: S.prevDay?.c || 0,
            session,
            isRollover: false, // TODO: Implement detection
            display: {
                priceLabel: "Market",
                baselineLabel: "Prev Close",
                color: "grey"
            }
        };
    },

    /**
     * Get authoritative market status
     */
    getMarketStatus: async () => {
        return await getMarketStatusSSOT();
    }
};
