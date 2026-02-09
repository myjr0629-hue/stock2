
import { fetchMassive, fetchMassiveAll, CACHE_POLICY } from './massiveClient';
import { getMarketStatusSSOT } from './marketStatusProvider';
import { findWeeklyExpirationSync } from './holidayCache';

// [Phase 24.1] Central Data Hub Structure
export interface UnifiedQuote {
    ticker: string;
    price: number;       // Main Display Price (ALWAYS OFFICIAL CLOSE unless LIVE REG)
    changePct: number;   // Main Display Change (From Prev Close to Price)
    finalChangePercent: number; // SSOT
    prevClose: number;   // Baseline Price
    volume: number;

    // [V3.7.5] Extended Session Data
    extendedPrice?: number;
    extendedChangePct?: number;
    extendedLabel?: "PRE" | "POST" | "CLOSED";

    // Components
    snapshot: any;
    openClose: any;
    history3d?: any[];
    history15d?: any[];

    // Flow Data (Calculated)
    flow: {
        netPremium: number;
        callPremium: number;
        putPremium: number;
        totalPremium: number;
        optionsCount: number;
        gamma?: number;
        rawChain?: any[];
        dataSource?: string;
        callWall?: number;
        putFloor?: number;
        pinZone?: number;
        maxPain?: number;
    };

    // Status
    session: "PRE" | "REG" | "POST" | "CLOSED";
    isRollover: boolean;
    priceSource: "OFFICIAL_CLOSE" | "LIVE_SNAPSHOT" | "POST_CLOSE" | "PRE_OPEN";
    error?: string;

    rsi?: number;
    relVol?: number;
    gapPct?: number;

    rawChain?: any[];
}

const MAX_RETRIES = 2;
const RETRY_DELAY = 500;

// [V45.14] In-memory TTL cache for SSR performance
const CACHE_TTL_MS = 10_000; // 10 seconds
const quoteCache = new Map<string, { data: UnifiedQuote; timestamp: number }>();

function getCachedQuote(ticker: string): UnifiedQuote | null {
    const cached = quoteCache.get(ticker.toUpperCase());
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        console.log(`[CentralDataHub] Cache HIT for ${ticker} (${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`);
        return cached.data;
    }
    return null;
}

function setCachedQuote(ticker: string, data: UnifiedQuote): void {
    quoteCache.set(ticker.toUpperCase(), { data, timestamp: Date.now() });
    // Cleanup old entries (max 100 tickers)
    if (quoteCache.size > 100) {
        const oldest = Array.from(quoteCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
        if (oldest) quoteCache.delete(oldest[0]);
    }
}

export const CentralDataHub = {
    getUnifiedData: async (ticker: string, forceRefresh = false, targetDate?: string): Promise<UnifiedQuote> => {
        // [V45.14] Check cache first (unless forceRefresh)
        if (!forceRefresh && !targetDate) {
            const cached = getCachedQuote(ticker);
            if (cached) return cached;
        }

        let attempts = 0;
        let lastError = null;

        while (attempts <= MAX_RETRIES) {
            try {
                const result = await CentralDataHub._fetchInternal(ticker, targetDate, forceRefresh);
                // Cache successful result (only for current date)
                if (!targetDate && result.price > 0) {
                    setCachedQuote(ticker, result);
                }
                return result;
            } catch (e: any) {
                lastError = e;
                attempts++;
                if (attempts <= MAX_RETRIES) {
                    console.warn(`[CentralDataHub] Retry ${attempts}/${MAX_RETRIES} for ${ticker}...`);
                    await new Promise(r => setTimeout(r, RETRY_DELAY));
                }
            }
        }

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

    _fetchInternal: async (ticker: string, specificDate?: string, forceRefresh = false): Promise<UnifiedQuote> => {
        const marketStatus = await getMarketStatusSSOT();
        const session = marketStatus.session.toUpperCase() as "PRE" | "REG" | "POST" | "CLOSED";
        const isClosed = session === "CLOSED";

        const toDate = specificDate || new Date().toISOString().split('T')[0];
        const fromDate = new Date();
        fromDate.setDate(new Date(toDate).getDate() - 30);
        const fromDateStr = fromDate.toISOString().split('T')[0];

        const useMemoryCache = !forceRefresh;
        const fetchOptions = forceRefresh ? { cache: 'no-store' as RequestCache } : undefined;

        const [snapshotRes, ocRes, historyRes, rsiRes] = await Promise.all([
            fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {}, useMemoryCache, undefined, fetchOptions),
            fetchMassive(`/v1/open-close/${ticker}/${toDate}`, {}, useMemoryCache, undefined, fetchOptions).catch(() => ({ data: null })),
            fetchMassive(`/v2/aggs/ticker/${ticker}/range/1/day/${fromDateStr}/${toDate}`, { limit: '30', sort: 'asc' }, useMemoryCache, undefined, fetchOptions).catch(() => ({ results: [] })),
            fetchMassive(`/v1/indicators/rsi/${ticker}`, { timespan: 'day', adjusted: 'true', window: '14', series_type: 'close', order: 'desc', limit: '1' }, useMemoryCache, undefined, fetchOptions).catch(() => ({ results: { values: [] } }))
        ]);

        const S = snapshotRes.ticker || {};
        const OC = ocRes || {};
        const fullHistory = historyRes?.results || [];
        const history3d = [...fullHistory].reverse().slice(0, 3);

        // [V4.3] When specificDate is provided (report path), use history aggs as primary data source.
        // Snapshot may return empty data on weekends/holidays, but history aggs always has the correct data.
        const useHistoryPrimary = !!specificDate && fullHistory.length >= 2;

        let price = 0;
        let prevClose = 0;
        let regClose = 0;
        let dayVolume = 0;
        let dayOpen = 0;
        let dayVwap = 0;
        let priceSource: UnifiedQuote['priceSource'] = "OFFICIAL_CLOSE";
        let extendedPrice = 0;
        let extendedLabel: "PRE" | "POST" | "CLOSED" | undefined = undefined;

        if (useHistoryPrimary) {
            // --- REPORT PATH: History Aggs as Primary Source ---
            // [V4.3.1] Filter out today's incomplete bar — during market hours,
            // Polygon returns a partial bar for today with low volume.
            // We want only COMPLETED trading day bars.
            const todayStr = new Date().toISOString().split('T')[0];
            const completedBars = fullHistory.filter((bar: any) => {
                const barDate = new Date(bar.t).toISOString().split('T')[0];
                return barDate !== todayStr;
            });

            if (completedBars.length >= 2) {
                const lastBar = completedBars[completedBars.length - 1];  // Last completed trading day
                const prevBar = completedBars[completedBars.length - 2];  // Day before
                price = lastBar.c;
                prevClose = prevBar.c;
                regClose = lastBar.c;
                dayVolume = lastBar.v || 0;
                dayOpen = lastBar.o || 0;
                dayVwap = lastBar.vw || lastBar.c;
            } else {
                // Fallback: not enough completed bars, use all bars
                const lastBar = fullHistory[fullHistory.length - 1];
                const prevBar = fullHistory[fullHistory.length - 2];
                price = lastBar.c;
                prevClose = prevBar.c;
                regClose = lastBar.c;
                dayVolume = lastBar.v || 0;
                dayOpen = lastBar.o || 0;
                dayVwap = lastBar.vw || lastBar.c;
            }
            priceSource = "OFFICIAL_CLOSE";
        } else {
            // --- REAL-TIME PATH: Snapshot as Primary Source (existing logic) ---
            const liveLast = S.lastTrade?.p || null;
            regClose = S.day?.c || S.prevDay?.c || OC.close || 0;
            const prevDay = S.prevDay || {};
            prevClose = prevDay.c || 0;

            // Robust Fallback
            if (regClose === 0 && prevClose === 0) {
                if (OC.close) regClose = OC.close;
                else if (fullHistory.length > 0) {
                    regClose = fullHistory[fullHistory.length - 1].c;
                    prevClose = fullHistory.length > 1 ? fullHistory[fullHistory.length - 2].c : regClose;
                }
            }

            // Reg Close Logic (Official)
            if (isClosed && OC.close) {
                regClose = OC.close;
            } else {
                if (session === 'PRE') {
                    regClose = prevClose || S.prevDay?.c || regClose;
                } else {
                    regClose = S.day?.c || S.min?.c || liveLast || regClose;
                }
            }

            // Price Selection
            if (session === 'REG') {
                price = liveLast || regClose;
                priceSource = "LIVE_SNAPSHOT";
            } else {
                price = regClose;
                priceSource = "OFFICIAL_CLOSE";
                if (session === 'PRE') {
                    extendedPrice = S.min?.c || liveLast || 0;
                    extendedLabel = 'PRE';
                } else if (session === 'POST') {
                    extendedPrice = S.min?.c || liveLast || 0;
                    extendedLabel = 'POST';
                } else if (session === 'CLOSED') {
                    if (S.afterHours?.p && S.afterHours.p > 0) {
                        extendedPrice = S.afterHours.p;
                        extendedLabel = 'POST';
                    }
                }
            }

            // Weekend/Holiday Stale Data Correction
            const isNonTradingDay = marketStatus.isHoliday || session === "CLOSED";
            if (isNonTradingDay && fullHistory.length >= 2) {
                if (Math.abs(price - prevClose) < 0.001) {
                    const lastClose = fullHistory[fullHistory.length - 1].c;
                    if (Math.abs(price - lastClose) < 0.001) {
                        prevClose = fullHistory[fullHistory.length - 2].c;
                    }
                }
            }

            if (!price || price === 0) {
                if (prevClose > 0) {
                    price = prevClose;
                    priceSource = "OFFICIAL_CLOSE";
                }
            }

            dayVolume = S.day?.v || 0;
            dayOpen = S.day?.o || 0;
            dayVwap = S.day?.vw || 0;
        }

        let changePct = 0;
        if (price && prevClose) {
            changePct = ((price - prevClose) / prevClose) * 100;
        }

        let extendedChangePct = 0;
        if (extendedPrice > 0 && price > 0) {
            extendedChangePct = ((extendedPrice - price) / price) * 100;
        }

        const isRollover = (session === "PRE" && changePct === 0);

        // Smart Options Fetch
        const fetchPrice = price || prevClose;
        const optionsRes = await CentralDataHub._fetchOptionsChain(ticker, fetchPrice, specificDate).catch(err => ({
            netPremium: 0, callPremium: 0, putPremium: 0, totalPremium: 0, optionsCount: 0, error: err.message || "Safe Fallback"
        }));

        const flowData = optionsRes as any;

        // [V4.3] relVol: use history aggs average volume for both paths
        const avgVol = fullHistory.length > 0 ? fullHistory.reduce((a: number, b: any) => a + (b.v || 0), 0) / fullHistory.length : 0;
        const relVol = (avgVol > 0 && dayVolume > 0) ? dayVolume / avgVol : 1;

        // [V4.3] gapPct: use dayOpen vs prevClose
        const gapPct = (dayOpen > 0 && prevClose > 0) ? ((dayOpen - prevClose) / prevClose * 100) : 0;

        return {
            ticker,
            price: price || 0,
            changePct: changePct || 0,
            finalChangePercent: changePct || 0,
            prevClose: prevClose || 0,
            volume: dayVolume,
            extendedPrice,
            extendedChangePct,
            extendedLabel,
            snapshot: S,
            openClose: OC,
            flow: flowData,
            session,
            isRollover: isRollover,
            priceSource,
            history3d,
            history15d: fullHistory,
            rsi: rsiRes?.results?.values?.[0]?.value || null,
            relVol,
            gapPct
        };
    },

    /**
     * [Phase 27] Smart Option Pipeline (Dark Pool Revival)
     * Filters: Strike ±5%, Expiration < 30d
     */
    _fetchOptionsChain: async (ticker: string, currentPrice: number, targetDate?: string) => {
        try {
            if (!currentPrice || currentPrice <= 0) return {
                netPremium: 0, callPremium: 0, putPremium: 0, totalPremium: 0,
                optionsCount: 0, dataSource: 'NONE', isAfterHours: false
            };

            const today = targetDate ? new Date(targetDate) : new Date();
            const todayStr = targetDate || new Date().toISOString().split('T')[0];

            // [S-72] Phase 1: Probe for available expirations
            // [S-76] Fix: Sort by expiration_date to ensure we capture multiple expirations
            // Without sort, API may return 100 contracts all from the same expiration date
            const probeParams: any = {
                limit: '250',
                'expiration_date.gte': todayStr,
                'sort': 'expiration_date',
                'order': 'asc'
            };

            const probeRes = await fetchMassiveAll(`/v3/snapshot/options/${ticker}`, probeParams, true);
            const probeResults = probeRes.results || [];

            // Find weekly expiration
            const expirations = Array.from(new Set(
                probeResults.map((c: any) => c.details?.expiration_date)
            )).filter(Boolean).sort() as string[];

            // [DEBUG] Log all available expirations
            console.log(`[CentralDataHub] ${ticker} available expirations (${expirations.length}):`, JSON.stringify(expirations.slice(0, 10)));

            const weeklyExpiry = findWeeklyExpirationSync(expirations);

            if (!weeklyExpiry) {
                console.warn(`[CentralDataHub] No weekly expiration found for ${ticker}`);
                return {
                    netPremium: 0, callPremium: 0, putPremium: 0, totalPremium: 0,
                    optionsCount: 0, dataSource: 'NONE', isAfterHours: false
                };
            }

            console.log(`[CentralDataHub] Fetching EXACT weekly expiration for ${ticker}: ${weeklyExpiry}`);

            // [S-72] Phase 2: Fetch exact weekly expiration (full data for accurate Max Pain)
            const exactParams: any = {
                limit: '250',
                'expiration_date': weeklyExpiry
            };

            const exactRes = await fetchMassiveAll(`/v3/snapshot/options/${ticker}`, exactParams, true);
            const results = exactRes.results || [];

            let callPremium = 0;
            let putPremium = 0;
            let totalGamma = 0;
            let contractsProcessed = 0;
            let usedFallback = false;
            let hasLiveVolume = false;

            for (const c of results) {
                const gamma = c.greeks?.gamma || 0;
                const oi = c.open_interest || 0;
                const cType = c.details?.contract_type;
                const priceUsed = c.day?.close || c.details?.close_price || 0;

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

            if (!hasLiveVolume && results.length > 0) {
                console.log(`[CentralDataHub] Day volume is 0, activating Manual Aggregation (Sniper Mode)...`);
                usedFallback = true;
                contractsProcessed = 0;
                callPremium = 0;
                putPremium = 0;

                for (const c of results) {
                    const oi = c.open_interest || 0;
                    const priceUsed = c.day?.previous_close || c.details?.prev_close || 0;
                    const cType = c.details?.contract_type;

                    if (!oi || !priceUsed) continue;
                    const val = oi * priceUsed * 100;
                    if (cType === 'call') callPremium += val;
                    else if (cType === 'put') putPremium += val;
                    contractsProcessed++;
                }
                console.log(`[CentralDataHub] Manual Flow: $${((callPremium - putPremium) / 1e6).toFixed(1)}M`);
            }

            const isAfterHours = contractsProcessed === 0 && results.length > 0;
            let dataSource: 'LIVE' | 'PREVIOUS_CLOSE' | 'CALCULATED' | 'NONE' = 'LIVE';
            if (usedFallback && contractsProcessed > 0) dataSource = 'CALCULATED';
            if (isAfterHours && results.length > 0) dataSource = 'CALCULATED';

            // [S-72] Use full weekly expiration data for accurate Max Pain (no filter)
            return {
                netPremium: callPremium - putPremium,
                callPremium,
                putPremium,
                totalPremium: callPremium + putPremium,
                optionsCount: results.length,
                contractsProcessed,
                dataSource,
                isAfterHours,
                gamma: totalGamma,
                rawChain: results,
                // [FIX] Multi-expiry probe data for accurate 0DTE Impact calculation
                // probeResults contains contracts across ALL available expirations (up to 250)
                allExpiryChain: probeResults,
                allExpirations: expirations,
                weeklyExpiration: weeklyExpiry,
                callWall: calcMaxOI(results, 'call'),
                putFloor: calcMaxOI(results, 'put'),
                pinZone: calcMaxTotalOI(results),
                maxPain: calcMaxPain(results),
                error: null
            };

        } catch (e: any) {
            const isAuthError = e.code === 'AUTH_ERROR' || e.httpStatus === 403 || e.httpStatus === 401;
            const isMissing = e.httpStatus === 404;
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

// [S-70] Filter for Weekly Expiry (Friday, or Thursday if holiday)
function filterNearestExpiry(chain: any[]): any[] {
    if (!chain || chain.length === 0) return [];

    // 1. Extract all expiration dates
    const expirations = chain
        .map(c => c.details?.expiration_date)
        .filter(d => !!d)
        .sort(); // String sort works for ISO dates (YYYY-MM-DD)

    if (expirations.length === 0) return chain; // Fallback

    // 2. [S-70] Find weekly expiration (Friday first, then Thursday)
    let targetDate = expirations[0]; // Default fallback

    // Find first Friday
    const fridayExp = expirations.find(exp => {
        const date = new Date(exp + 'T12:00:00');
        return date.getDay() === 5;
    });
    if (fridayExp) {
        targetDate = fridayExp;
    } else {
        // Find first Thursday (holiday fallback)
        const thursdayExp = expirations.find(exp => {
            const date = new Date(exp + 'T12:00:00');
            return date.getDay() === 4;
        });
        if (thursdayExp) targetDate = thursdayExp;
    }

    // 3. Filter
    return chain.filter(c => c.details?.expiration_date === targetDate);
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
