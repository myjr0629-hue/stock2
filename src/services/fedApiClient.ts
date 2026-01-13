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

// [V4.4] Get VIX from FRED (VIXCLS series)
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
