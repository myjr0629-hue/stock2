
import { fetchMassive, fetchMassiveAll, CACHE_POLICY } from './massiveClient';
import { getMarketStatusSSOT } from './marketStatusProvider';

// [Phase 24.1] Central Data Hub Structure
export interface UnifiedQuote {
    ticker: string;
    price: number;       // Main Display Price (Session Aware)
    changePct: number;   // Main Display Change (Session Aware)
    finalChangePercent: number; // [Phase 24.3] SSOT for Report Change %
    prevClose: number;   // Baseline Price
    volume: number;

    // Components
    snapshot: any;
    openClose: any;
    history3d?: any[]; // [Phase 36] 3-Day OHLCV
    history15d?: any[]; // [Fix] For RSI Calculation

    // Flow Data (Calculated)
    flow: {
        netPremium: number; // Calculated Net Flow (Call - Put)
        callPremium: number;
        putPremium: number;
        totalPremium: number;
        optionsCount: number; // Number of contracts processed
        gamma?: number; // [Phase 35] Total Gamma Exposure
        rawChain?: any[]; // [Phase 42] Raw Options Chain
        dataSource?: string; // [Phase 42] Data Source
        // [Phase 42.1] Structure Data (Walls)
        callWall?: number;
        putFloor?: number;
        pinZone?: number;
        maxPain?: number; // [Phase 42.1] Real Max Pain
    };

    // Status
    session: "PRE" | "REG" | "POST" | "CLOSED";
    isRollover: boolean; // True if Rollover Logic Applied (0% -> PrevChange)

    // Display Hints
    // Display Hints
    priceSource: "OFFICIAL_CLOSE" | "LIVE_SNAPSHOT" | "POST_CLOSE" | "PRE_OPEN";
    error?: string; // [Phase 24.2] Expose Error

    // [Phase 41.2] Real Indicators
    rsi?: number;
    relVol?: number;
    gapPct?: number;

    // [Phase 42] Raw Options Chain (Filtered)
    rawChain?: any[];
}

const MAX_RETRIES = 2; // User Requirement: Max 2 Retries
const RETRY_DELAY = 500; // 0.5s

export const CentralDataHub = {

    /**
     * [Phase 24.1] Get Unified Data (SSOT)
     * Orchestrates gathering of Price and Flow data with strict error handling.
     */
    getUnifiedData: async (ticker: string): Promise<UnifiedQuote> => {
        let attempts = 0;
        let lastError = null;

        while (attempts <= MAX_RETRIES) {
            try {
                return await CentralDataHub._fetchInternal(ticker);
            } catch (e: any) {
                lastError = e;
                attempts++;
                if (attempts <= MAX_RETRIES) {
                    console.warn(`[CentralDataHub] Retry ${attempts}/${MAX_RETRIES} for ${ticker}...`);
                    await new Promise(r => setTimeout(r, RETRY_DELAY));
                }
            }
        }

        // [Phase 24.2] Disable Error Swallowing: Expose actual error
        console.error(`[CentralDataHub] Failed for ${ticker} after retries:`, lastError);
        return {
            ticker,
            price: 0,
            changePct: 0,
            finalChangePercent: 0,
            prevClose: 0,
            volume: 0,
            snapshot: {},
            openClose: {},
            flow: { netPremium: 0, callPremium: 0, putPremium: 0, totalPremium: 0, optionsCount: 0 },
            session: "CLOSED",
            isRollover: false,
            priceSource: "LIVE_SNAPSHOT",
            error: lastError?.message || "Unknown Error"
        };
    },

    /**
     * Internal Fetch Logic (Non-Retrying)
     */
    _fetchInternal: async (ticker: string, specificDate?: string): Promise<UnifiedQuote> => {
        // 1. Get Market Status (SSOT)
        const marketStatus = await getMarketStatusSSOT();
        const session = marketStatus.session.toUpperCase() as "PRE" | "REG" | "POST" | "CLOSED";
        const isClosed = session === "CLOSED";

        // 2. Fetch Data Parallel
        // - Snapshot (Realtime Price)
        // - OpenClose (Official Close - Essential for CLOSED)
        // - Options Chain (Flow Calc)

        // 2. Fetch Price Logic (Sequential due to Smart Option Filter dependency)
        // [Phase 27] We need price first to filter options
        // [Phase 27] We need price first to filter options
        // [Fix] 3-Day History -> 15-Day History (for RSI)
        // Calculate date range: today to 30 days ago
        const toDate = specificDate || new Date().toISOString().split('T')[0];
        const fromDate = new Date();
        fromDate.setDate(new Date(toDate).getDate() - 30);
        const fromDateStr = fromDate.toISOString().split('T')[0];

        const [snapshotRes, ocRes, historyRes, rsiRes] = await Promise.all([
            fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {}, true),
            fetchMassive(`/v1/open-close/${ticker}/${toDate}`, {}, true).catch(() => ({ data: null })),
            fetchMassive(`/v2/aggs/ticker/${ticker}/range/1/day/${fromDateStr}/${toDate}`, { limit: '30', sort: 'asc' }, true).catch(() => ({ results: [] })),
            // [Phase 41.2] Real RSI Fetch
            fetchMassive(`/v1/indicators/rsi/${ticker}`, { timespan: 'day', adjusted: 'true', window: '14', series_type: 'close', order: 'desc', limit: '1' }, true).catch(() => ({ results: { values: [] } }))
        ]);

        const S = snapshotRes.ticker || {};
        const OC = ocRes || {};

        // [Fix] Handle History (ASC: Oldest -> Newest)
        const fullHistory = historyRes?.results || [];
        // history3d needs Newest 3 (Last 3 in ASC)
        // Reverse if needed for 'history3d' consumer which expected desc? 
        // No, usually consumer handles it, but let's provide [Today/Yesterday/...] descending, 
        // OR [T-2, T-1, T0] ascending.
        // powerEngine expects [day1, day2] where day1 > day2? 
        // powerEngine line 85: day1 = history[0] (Newest).
        // So history3d should be DESCENDING (Newest First).
        const history3d = [...fullHistory].reverse().slice(0, 3);

        // 3. Determine Prices (Session Aware Logic)
        const liveLast = S.lastTrade?.p || null;
        let regClose = S.day?.c || S.prevDay?.c || OC.close || 0;

        const prevDay = S.prevDay || {};
        let prevClose = prevDay.c || 0;

        // [Fix] Robust Fallback if Snapshot is empty
        if (regClose === 0 && prevClose === 0) {
            // Try fallback from history or OC
            if (OC.close) regClose = OC.close;
            else if (fullHistory.length > 0) {
                // Use last available history close
                regClose = fullHistory[fullHistory.length - 1].c;
                prevClose = fullHistory.length > 1 ? fullHistory[fullHistory.length - 2].c : regClose;
            }
        }
        if (prevClose === 0 && OC.from) {
            // If we have OC from specific date but no prevClose from Snapshot
            // We can't do much without history, but logic above handles history.
        }

        let price = liveLast || regClose; // Estimated price for options filter

        // [Phase 27] Fetch Smart Options (Dark Pool) using estimated price
        const optionsRes = await CentralDataHub._fetchOptionsChain(ticker, price).catch(err => ({
            netPremium: 0, callPremium: 0, putPremium: 0, totalPremium: 0, optionsCount: 0, error: err.message || "Safe Fallback"
        }));

        const flowData = optionsRes as any;

        // ... existing options fetch ... 

        // ... flow calc ...

        // Reg Close Logic: Explicit OC > Snapshot Day Close > Last Trade (if Closed)
        if (isClosed && OC.close) {
            regClose = OC.close;
        } else {
            regClose = S.day?.c || S.min?.c || liveLast || regClose; // Use enhanced regClose
        }

        // Price Selection
        let changePct = S.todaysChangePerc || 0;
        let priceSource: UnifiedQuote['priceSource'] = "LIVE_SNAPSHOT";

        // [Fix] Session logic overhaul for Weekend/Holidays
        // If market is CLOSED, we still want to show Post-Market badge if data exists.

        if (session === "PRE") {
            price = S.min?.c || liveLast || regClose;
            priceSource = "PRE_OPEN";
        } else if (session === "POST") {
            price = S.min?.c || liveLast || regClose;
            priceSource = "POST_CLOSE";
        } else if (session === "CLOSED") {
            // Even if CLOSED, if we have afterHours data (e.g. weekend), treat as POST for display
            // This solves "Problem 2: Missing Post Market Data"
            if (S.afterHours?.p && S.afterHours.p > 0) {
                // But wait, user wants "Post Market" badge specifically?
                // Let's keep session as CLOSED but allow UI to see extended prices.
                price = regClose; // Main price is ALWAYS Official Close when closed
                priceSource = "OFFICIAL_CLOSE";
            } else {
                price = regClose;
                priceSource = "OFFICIAL_CLOSE";
            }
        } else {
            price = liveLast || regClose;
            priceSource = "LIVE_SNAPSHOT";
        }

        // [Critial Fix] Weekend/Holiday Stale Data Correction (Friday vs Friday)
        // Solves "Problem 1: 0.00% Change"
        const isNonTradingDay = marketStatus.isHoliday || session === "CLOSED";
        if (isNonTradingDay && fullHistory.length >= 2) {
            // If Price is roughly equal to PrevClose (indicating API gave same T-1 for both)
            if (Math.abs(price - prevClose) < 0.001) {
                // Check if 'price' matches T-1 (Last History Close)
                const lastClose = fullHistory[fullHistory.length - 1].c;
                if (Math.abs(price - lastClose) < 0.001) {
                    // Shift PrevClose to T-2 (Thursday Close)
                    prevClose = fullHistory[fullHistory.length - 2].c;
                    // console.log(`[CentralDataHub] Weekend Fix: Shifted PrevClose to ${prevClose}`);
                }
            }
        }

        // [Final Safety Net]
        if (!price || price === 0) {
            if (prevClose > 0) {
                price = prevClose;
                priceSource = "OFFICIAL_CLOSE"; // Fallback to prev close
            }
        }

        if (price && prevClose) {
            // Re-calc change if we fixed prevClose or if API was 0 (and not 0% real change)
            if (changePct === 0 || isNonTradingDay) {
                changePct = (price - prevClose) / prevClose;
            }
        }

        // [Phase 25.1] Rollover Detection
        // If date in snapshot (e.g. prevDay.d) is NOT yesterday, or if change is 0 despite price diff
        // For now, simpler check: if session is PRE and change is 0, it might be rollover.
        // Let's rely on changePct being 0 as a hint for now to indicate "Fresh Session".
        const isRollover = (session === "PRE" && changePct === 0);

        return {
            ticker,
            price: price || 0,
            changePct: changePct || 0,
            finalChangePercent: changePct || 0, // [Phase 24.3] SSOT
            prevClose: prevClose || 0,
            volume: S.day?.v || 0,
            snapshot: S,
            openClose: OC,
            flow: flowData,
            session,
            isRollover: isRollover,
            priceSource,
            history3d, // Newest 3 days (for Momentum)
            history15d: fullHistory, // [Fix] Expose full history for RSI

            // [Phase 41.2] Real Data Mapping
            rsi: rsiRes?.results?.values?.[0]?.value || null, // Real RSI or null
            relVol: (fullHistory.length > 0 && S.day?.v) ? (S.day.v / (fullHistory.reduce((a: number, b: any) => a + (b.v || 0), 0) / fullHistory.length)) : 1, // Snapshot Vol / Avg Vol
            gapPct: (S.day?.o && S.prevDay?.c) ? ((S.day.o - S.prevDay.c) / S.prevDay.c * 100) : 0
        };
    },

    /**
     * [Phase 27] Smart Option Pipeline (Dark Pool Revival)
     * Filters: Strike ±5%, Expiration < 30d
     */
    _fetchOptionsChain: async (ticker: string, currentPrice: number) => {
        // [S-17] Safe Unblock: Check Dev Flag
        // FORCE ENABLE FOR DEMO: Checks bypassed
        /*
        const DISABLE_OPTIONS_IN_DEV = process.env.NODE_ENV !== "production";
        if (DISABLE_OPTIONS_IN_DEV && process.env.ALLOW_MASSIVE_FOR_SNAPSHOT !== "1") {
            return {
                netPremium: 0, callPremium: 0, putPremium: 0, totalPremium: 0,
                optionsCount: 0, dataSource: 'NONE', isAfterHours: false
            };
        }
        */

        try {
            if (!currentPrice || currentPrice <= 0) return {
                netPremium: 0, callPremium: 0, putPremium: 0, totalPremium: 0,
                optionsCount: 0, dataSource: 'NONE', isAfterHours: false
            };

            // [Fix] Massive API Options Overhaul
            // Fetch everything, filter in memory.
            const today = new Date();
            const future = new Date();
            future.setDate(today.getDate() + 14); // [Tuning] 35 -> 14 Days (Increase Sensitivity)
            const dateStr = future.toISOString().split('T')[0];

            console.log(`[CentralDataHub] Fetching ALL options for ${ticker} -> In-Memory Filter < ${dateStr}`);

            // [Fix] Enforce Date Range at API Level to ensure 250 limit contains RELEVANT options
            // Otherwise we get LEAPS (2026+) and filter them all out locally.
            const todayStr = new Date().toISOString().split('T')[0];
            const maxExpiryDate = new Date();
            // [User Request] Tighten window to 14 days (Weeklies + Next Week)
            maxExpiryDate.setDate(maxExpiryDate.getDate() + 14);
            const maxExpiryStr = maxExpiryDate.toISOString().split('T')[0];

            const params: any = {
                limit: '250', // [User Rule] Strict 250 limit. Pagination MUST handle the rest.
                'expiration_date.gte': todayStr,
                'expiration_date.lte': maxExpiryStr
            };

            // [Fix] Use fetchMassiveAll but with higher limit
            const res = await fetchMassiveAll(`/v3/snapshot/options/${ticker}`, params, true);
            const results = res.results || [];

            let callPremium = 0;
            let putPremium = 0;
            let totalGamma = 0;
            let contractsProcessed = 0;
            let usedFallback = false;

            // [Phase 32/35] First pass: Try using day.volume (live data)
            // If we have some volume, we rely on it. But we also aggregate Gamma regardless.
            let hasLiveVolume = false;

            for (const c of results) {
                // [Phase 35] In-Memory Expiration Filter (Redundant with API params, and was incorrect > dateStr)
                // if (c.details?.expiration_date > dateStr) continue;

                // Common Greek Extraction
                const gamma = c.greeks?.gamma || 0;
                const oi = c.open_interest || 0;
                const cType = c.details?.contract_type;
                const priceUsed = c.day?.close || c.details?.close_price || 0;

                // [Phase 35] Always calculate Total Gamma (GEX proxy)
                // GEX = Gamma * OI * 100 * Spot (Approx)
                // Here we just sum Raw Gamma * OI * 100 for "Gamma Exposure" direction
                // Call Gamma is positive, Put Gamma is negative? 
                // Usually GEX maps: Call (+), Put (-).
                if (cType === 'call') totalGamma += (gamma * oi * 100);
                else if (cType === 'put') totalGamma -= (gamma * oi * 100);

                const vol = c.day?.volume || 0;
                if (vol > 0 && priceUsed > 0) {
                    hasLiveVolume = true;
                    const premium = vol * priceUsed * 100;
                    if (cType === 'call') callPremium += premium;
                    else if (cType === 'put') putPremium += premium;
                    contractsProcessed++;
                }
            }

            // [Phase 32/35] Fallback: If NO live volume found, run Manual Aggregation on OI
            if (!hasLiveVolume && results.length > 0) {
                console.log(`[CentralDataHub] Day volume is 0, activating Manual Aggregation (Sniper Mode)...`);
                usedFallback = true;
                contractsProcessed = 0; // Reset for fallback count
                callPremium = 0;
                putPremium = 0;

                for (const c of results) {
                    const oi = c.open_interest || 0;
                    const priceUsed = c.day?.previous_close || c.details?.prev_close || 0;
                    const cType = c.details?.contract_type;

                    if (!oi || !priceUsed) continue;

                    // [Phase 35] Notional Value: OI * Price * 100 (Proxy for "Potential Flow")
                    // This prevents $0.0M display.
                    const notional = oi * priceUsed * 100 * 0.05; // [Tuning] 5% of OI turnover assumption? 
                    // User said: "manually aggregate... using OI * Price". 
                    // Just OI * Price * 100 is "Open Interest Notional Value". 
                    // Flow is usually volume. Using 100% of OI as Flow is huge. 
                    // I'll stick to the Phase 32 logic: OI * PreviousClose * 100.
                    // But explicitly label it 'CALCULATED'.

                    const val = oi * priceUsed * 100;

                    if (cType === 'call') callPremium += val;
                    else if (cType === 'put') putPremium += val;

                    contractsProcessed++;
                }
                console.log(`[CentralDataHub] Manual Flow: $${((callPremium - putPremium) / 1e6).toFixed(1)}M (Gamma: ${totalGamma.toFixed(0)})`);
            }

            // Determine data source for UI display
            const isAfterHours = contractsProcessed === 0 && results.length > 0;
            let dataSource: 'LIVE' | 'PREVIOUS_CLOSE' | 'CALCULATED' | 'NONE' = 'LIVE';
            if (usedFallback && contractsProcessed > 0) dataSource = 'CALCULATED';
            // [Fix] Even if isAfterHours (no volume processed), if we have results, we show CALCULATED (OI-based) for Radar
            if (isAfterHours && results.length > 0) dataSource = 'CALCULATED';

            return {
                netPremium: callPremium - putPremium,
                callPremium,
                putPremium,
                totalPremium: callPremium + putPremium,
                optionsCount: results.length,
                contractsProcessed,
                dataSource, // 'LIVE', 'CALCULATED', or 'NONE'
                isAfterHours,
                gamma: totalGamma, // [Phase 35] Expose Gamma
                // [Phase 42] Expose Raw Chain for UI
                rawChain: results,

                // [Phase 42.1] Wall Calculation (Nearest Expiry Only)
                // Filter chain to only include the nearest expiration date for more accurate pinning levels
                callWall: calcMaxOI(filterNearestExpiry(results), 'call'),
                putFloor: calcMaxOI(filterNearestExpiry(results), 'put'),
                pinZone: calcMaxTotalOI(filterNearestExpiry(results)),
                maxPain: calcMaxPain(filterNearestExpiry(results)),
                error: null
            };

        } catch (e: any) {
            // [Fix] Graceful degradation for Access/Auth errors
            const isAuthError = e.code === 'AUTH_ERROR' || e.httpStatus === 403 || e.httpStatus === 401;
            const isMissing = e.httpStatus === 404;

            // [Fix] Handle MassiveError object structure (e.message might be undefined)
            const errorMessage = e.message || e.reasonKR || JSON.stringify(e);

            if (isAuthError || isMissing) {
                console.warn(`[CentralDataHub] Options access restricted for ${ticker} (${e.httpStatus || e.code}). Returning empty flow.`);
            } else {
                console.error(`[CentralDataHub] Options Flow Calc Failed for ${ticker}: ${errorMessage}`, { code: e.code });
            }

            return {
                netPremium: 0, callPremium: 0, putPremium: 0, totalPremium: 0,
                optionsCount: 0, dataSource: 'NONE', isAfterHours: false
            };
        }
    },

    getQuote: async (ticker: string) => {
        return CentralDataHub.getUnifiedData(ticker);
    },

    getMarketStatus: async () => {
        return await getMarketStatusSSOT();
    }
};

// [Helper] Max OI Calculation for Wall/Floor
function calcMaxOI(chain: any[], type: 'call' | 'put'): number | null {
    let maxOI = -1;
    let maxStrike = 0;
    for (const c of chain) {
        if (c.details?.contract_type === type) {
            const oi = c.open_interest || 0;
            if (oi > maxOI) { maxOI = oi; maxStrike = c.details.strike_price; }
        }
    }
    return maxStrike > 0 ? maxStrike : null;
}

// [Helper] Pin Zone (Max Combined OI Strike)
function calcMaxTotalOI(chain: any[]): number | null {
    const strikeMap = new Map<number, number>();
    let maxTotal = -1;
    let maxStrike = 0;

    for (const c of chain) {
        const s = c.details?.strike_price;
        const oi = c.open_interest || 0;
        if (!s) continue;
        strikeMap.set(s, (strikeMap.get(s) || 0) + oi);
    }

    strikeMap.forEach((total, strike) => {
        if (total > maxTotal) { maxTotal = total; maxStrike = strike; }
    });

    return maxStrike > 0 ? maxStrike : null;
}

// [Helper] Filter for Nearest Expiry (0DTE/1DTE)
function filterNearestExpiry(chain: any[]): any[] {
    if (!chain || chain.length === 0) return [];

    // 1. Extract all expiration dates
    const expirations = chain
        .map(c => c.details?.expiration_date)
        .filter(d => !!d)
        .sort(); // String sort works for ISO dates (YYYY-MM-DD)

    if (expirations.length === 0) return chain; // Fallback

    // 2. Pick the nearest (first) one
    const nearestDate = expirations[0];

    // 3. Filter
    return chain.filter(c => c.details?.expiration_date === nearestDate);
}

// [Helper] Real Max Pain Calculation (Total Loss Minimization)
function calcMaxPain(chain: any[]): number | null {
    if (!chain || chain.length === 0) return null;

    const strikes = new Set<number>();
    chain.forEach(c => {
        if (c.details?.strike_price) strikes.add(c.details.strike_price);
    });

    const sortedStrikes = Array.from(strikes).sort((a, b) => a - b);

    let minPain = Infinity;
    let maxPainStrike = 0;

    // Evaluate Total Pain at each specific strike price
    for (const pricePoint of sortedStrikes) {
        let totalPain = 0;
        for (const c of chain) {
            const K = c.details?.strike_price;
            const oi = c.open_interest || 0;
            const type = c.details?.contract_type;

            if (!K) continue;

            // Intrinsic Value Calculation
            if (type === 'call') {
                if (pricePoint > K) totalPain += (pricePoint - K) * oi;
            } else if (type === 'put') {
                if (pricePoint < K) totalPain += (K - pricePoint) * oi;
            }
        }

        if (totalPain < minPain) {
            minPain = totalPain;
            maxPainStrike = pricePoint;
        }
    }

    return maxPainStrike > 0 ? maxPainStrike : null;
}
