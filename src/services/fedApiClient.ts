// [P1] FED API Client - Treasury Yields, Inflation Data
// [V4.3] Added direct FRED API integration for Treasury yields
// Uses Massive API /fed/v1/* endpoints as fallback

import { fetchMassive } from "./massiveClient";

const FED_CACHE_TTL = 60 * 30; // 30 minutes
const FRED_API_KEY = process.env.FRED_API_KEY || "";
const FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations";

export interface TreasuryYields {
    date: string;
    us2y: number | null;
    us5y: number | null;
    us10y: number | null;
    us30y: number | null;
    spread2s10s: number | null;
    source: "FRED" | "MASSIVE" | "FAIL";
    updatedAt: string;
}

export interface InflationData {
    date: string;
    cpi: number | null;
    cpiYoY: number | null;
    pce: number | null;
    pceYoY: number | null;
    expectations: number | null;
    source: "FRED" | "MASSIVE" | "FAIL";
    updatedAt: string;
}

export interface VixData {
    date: string;
    vix: number | null;
    source: "FRED" | "PROXY" | "FAIL";
    updatedAt: string;
}

export interface FedSnapshot {
    treasury: TreasuryYields;
    inflation: InflationData;
    vix: VixData;
    asOfET: string;
}

// [V4.3] Direct FRED API fetch helper
async function fetchFredSeries(seriesId: string, limit: number = 1): Promise<number | null> {
    if (!FRED_API_KEY) return null;

    try {
        const url = `${FRED_BASE_URL}?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
        const res = await fetch(url, { next: { revalidate: 1800 } }); // 30min cache

        if (!res.ok) {
            console.warn(`[FRED] ${seriesId} fetch failed: ${res.status}`);
            return null;
        }

        const data = await res.json();
        const obs = data?.observations?.[0];
        if (obs && obs.value !== ".") {
            return parseFloat(obs.value);
        }
        return null;
    } catch (e) {
        console.error(`[FRED] ${seriesId} error:`, e);
        return null;
    }
}

// Fetch Treasury Yields - Try FRED first, fallback to Massive
export async function getTreasuryYields(): Promise<TreasuryYields> {
    const now = new Date().toISOString();
    const failResult: TreasuryYields = {
        date: now.split('T')[0],
        us2y: null,
        us5y: null,
        us10y: null,
        us30y: null,
        spread2s10s: null,
        source: "FAIL",
        updatedAt: now
    };

    // [V4.3] Try FRED API first if key is available
    if (FRED_API_KEY) {
        try {
            console.log("[FedAPI] Fetching Treasury from FRED...");
            const [us2y, us5y, us10y, us30y] = await Promise.all([
                fetchFredSeries("DGS2"),   // 2-Year Treasury
                fetchFredSeries("DGS5"),   // 5-Year Treasury
                fetchFredSeries("DGS10"),  // 10-Year Treasury
                fetchFredSeries("DGS30")   // 30-Year Treasury
            ]);

            if (us10y !== null) {
                console.log(`[FedAPI] FRED Treasury OK: 10Y=${us10y}%`);
                return {
                    date: now.split('T')[0],
                    us2y,
                    us5y,
                    us10y,
                    us30y,
                    spread2s10s: (us2y !== null && us10y !== null) ? us10y - us2y : null,
                    source: "FRED",
                    updatedAt: now
                };
            }
        } catch (e) {
            console.warn("[FedAPI] FRED Treasury failed, fallback to Massive:", e);
        }
    }

    // Fallback: Massive API
    try {
        const data = await fetchMassive("/fed/v1/treasury-yields", {
            limit: "1",
            sort: "date.desc"
        }, true);

        if (data && data.results && data.results.length > 0) {
            const latest = data.results[0];
            const us2y = latest.yield_2_year ?? null;
            const us10y = latest.yield_10_year ?? null;

            return {
                date: latest.date || now.split('T')[0],
                us2y,
                us5y: latest.yield_5_year ?? null,
                us10y,
                us30y: latest.yield_30_year ?? null,
                spread2s10s: (us2y !== null && us10y !== null) ? us10y - us2y : null,
                source: "MASSIVE",
                updatedAt: now
            };
        }

        return failResult;
    } catch (e) {
        console.error("[FedAPI] Treasury fetch error:", e);
        return failResult;
    }
}

// Fetch Inflation Data from Massive FED API
export async function getInflationData(): Promise<InflationData> {
    const now = new Date().toISOString();
    const failResult: InflationData = {
        date: now.split('T')[0],
        cpi: null,
        cpiYoY: null,
        pce: null,
        pceYoY: null,
        expectations: null,
        source: "FAIL",
        updatedAt: now
    };

    try {
        // Parallel fetch inflation and expectations
        const [inflationRes, expectationsRes] = await Promise.all([
            fetchMassive("/fed/v1/inflation", {}, true).catch(() => null),
            fetchMassive("/fed/v1/inflation-expectations", {}, true).catch(() => null)
        ]);

        const cpi = inflationRes?.cpi ?? null;
        const cpiYoY = inflationRes?.cpiYoY ?? null;
        const pce = inflationRes?.pce ?? null;
        const pceYoY = inflationRes?.pceYoY ?? null;
        const expectations = expectationsRes?.expected ?? null;

        // If we got any data, consider it a partial success
        if (cpi !== null || pce !== null || expectations !== null) {
            return {
                date: inflationRes?.date || now.split('T')[0],
                cpi,
                cpiYoY,
                pce,
                pceYoY,
                expectations,
                source: "MASSIVE",
                updatedAt: now
            };
        }

        return failResult;
    } catch (e) {
        console.error("[FedAPI] Inflation fetch error:", e);
        return failResult;
    }
}

// [V4.4] Get VIX from FRED (VIXCLS series) - Daily Close
export async function getVixFromFred(): Promise<VixData> {
    const now = new Date().toISOString();
    const failResult: VixData = {
        date: now.split('T')[0],
        vix: null,
        source: "FAIL",
        updatedAt: now
    };

    // Try FRED API first (VIXCLS = CBOE Volatility Index)
    if (FRED_API_KEY) {
        try {
            console.log("[FedAPI] Fetching VIX from FRED (VIXCLS)...");
            const vix = await fetchFredSeries("VIXCLS");

            if (vix !== null) {
                console.log(`[FedAPI] FRED VIX OK: ${vix}`);
                return {
                    date: now.split('T')[0],
                    vix,
                    source: "FRED",
                    updatedAt: now
                };
            }
        } catch (e) {
            console.warn("[FedAPI] FRED VIX failed:", e);
        }
    }

    // Fallback: Return fail (macroHubProvider will use proxy calculation)
    console.log("[FedAPI] VIX fallback to PROXY calculation");
    return { ...failResult, source: "PROXY" };
}

// ============================================================
// [V45.7] VIX SSOT - Single Source of Truth with Multi-Tier Fallback
// ============================================================
// Priority: 1) Yahoo Finance (Real-time) → 2) In-Memory Cache → 3) Redis Cache → 4) FRED → 5) Default
// [V45.8] "Last Known Good" Pattern with Redis persistence for serverless
// ============================================================

import { getFromCache, setInCache, CACHE_KEYS } from './redisClient';

export interface VixSSOT {
    vix: number;
    prevClose: number;
    change: number;
    changePct: number;
    source: "YAHOO" | "CACHE" | "REDIS" | "FRED" | "DEFAULT";
    updatedAt: string;
    isStale: boolean; // True if data is from cache/fallback
}

// In-memory cache for fast access within same process
let vixCache: { data: VixSSOT | null } = { data: null };

/**
 * Fetch real-time VIX from Yahoo Finance
 */
async function fetchVixFromYahoo(): Promise<VixSSOT | null> {
    try {
        const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1m&range=1d";
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            signal: AbortSignal.timeout(5000) // 5s timeout
        });

        if (!res.ok) {
            console.warn(`[VIX] Yahoo Finance returned ${res.status}`);
            return null;
        }

        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;

        if (!meta?.regularMarketPrice) {
            console.warn("[VIX] Yahoo Finance missing market price");
            return null;
        }

        const vix = meta.regularMarketPrice;
        const prevClose = meta.previousClose || vix;
        const change = vix - prevClose;
        const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

        console.log(`[VIX] Yahoo OK: ${vix.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`);

        return {
            vix,
            prevClose,
            change,
            changePct,
            source: "YAHOO",
            updatedAt: new Date().toISOString(),
            isStale: false
        };
    } catch (e) {
        console.warn("[VIX] Yahoo Finance fetch failed:", e);
        return null;
    }
}

/**
 * Get VIX with Multi-Tier Fallback (SSOT)
 * [V45.8] "Last Known Good" Pattern with Redis persistence
 * Used by both Guardian page display and RLSI engine
 */
export async function getVixSSOT(): Promise<VixSSOT> {
    // 1. Try Yahoo Finance (Real-time)
    const yahooVix = await fetchVixFromYahoo();
    if (yahooVix) {
        // Update both in-memory and Redis cache on success
        vixCache = { data: yahooVix };
        // Fire-and-forget Redis update (don't block)
        setInCache(CACHE_KEYS.VIX_LAST_KNOWN_GOOD, yahooVix).catch(() => { });
        return yahooVix;
    }

    // 2. Fallback: Use in-memory cache (fast, same process)
    if (vixCache.data) {
        console.log(`[VIX] Using In-Memory Cache: ${vixCache.data.vix.toFixed(2)}`);
        return { ...vixCache.data, source: "CACHE", isStale: true };
    }

    // 3. Fallback: Use Redis cache (survives server restarts)
    try {
        const redisVix = await getFromCache<VixSSOT>(CACHE_KEYS.VIX_LAST_KNOWN_GOOD);
        if (redisVix && redisVix.vix) {
            console.log(`[VIX] Using Redis Cache: ${redisVix.vix.toFixed(2)} (from ${redisVix.updatedAt})`);
            // Hydrate in-memory cache
            vixCache = { data: redisVix };
            return { ...redisVix, source: "REDIS", isStale: true };
        }
    } catch (e) {
        console.warn("[VIX] Redis cache failed:", e);
    }

    // 4. Fallback: Try FRED (Daily Close) - Only when all caches empty
    console.log("[VIX] No cached data, trying FRED...");
    try {
        const fredVix = await getVixFromFred();
        if (fredVix.vix !== null) {
            console.log(`[VIX] Cold start: Using FRED daily close: ${fredVix.vix}`);
            const result: VixSSOT = {
                vix: fredVix.vix,
                prevClose: fredVix.vix,
                change: 0,
                changePct: 0,
                source: "FRED",
                updatedAt: fredVix.updatedAt,
                isStale: true
            };
            // Cache FRED data as initial value
            vixCache = { data: result };
            setInCache(CACHE_KEYS.VIX_LAST_KNOWN_GOOD, result).catch(() => { });
            return result;
        }
    } catch (e) {
        console.warn("[VIX] FRED fallback failed:", e);
    }

    // 5. Emergency Fallback: Default value
    console.warn("[VIX] All sources failed, using default 15");
    return {
        vix: 15,
        prevClose: 15,
        change: 0,
        changePct: 0,
        source: "DEFAULT",
        updatedAt: new Date().toISOString(),
        isStale: true
    };
}

// Get complete FED snapshot
export async function getFedSnapshot(): Promise<FedSnapshot> {
    const [treasury, inflation, vix] = await Promise.all([
        getTreasuryYields(),
        getInflationData(),
        getVixFromFred()
    ]);

    return {
        treasury,
        inflation,
        vix,
        asOfET: new Date().toLocaleString('en-US', {
            timeZone: 'America/New_York',
            dateStyle: 'short',
            timeStyle: 'short'
        })
    };
}
