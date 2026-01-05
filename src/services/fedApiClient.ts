// [P1] FED API Client - Treasury Yields, Inflation Data
// Uses Massive API /fed/v1/* endpoints

import { fetchMassive } from "./massiveClient";

const FED_CACHE_TTL = 60 * 30; // 30 minutes

export interface TreasuryYields {
    date: string;
    us2y: number | null;
    us5y: number | null;
    us10y: number | null;
    us30y: number | null;
    spread2s10s: number | null;
    source: "MASSIVE" | "FAIL";
    updatedAt: string;
}

export interface InflationData {
    date: string;
    cpi: number | null;
    cpiYoY: number | null;
    pce: number | null;
    pceYoY: number | null;
    expectations: number | null;
    source: "MASSIVE" | "FAIL";
    updatedAt: string;
}

export interface FedSnapshot {
    treasury: TreasuryYields;
    inflation: InflationData;
    asOfET: string;
}

// Fetch Treasury Yields from Massive FED API
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

    try {
        // Massive API endpoint for treasury yields (New Structure)
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

// Get complete FED snapshot
export async function getFedSnapshot(): Promise<FedSnapshot> {
    const [treasury, inflation] = await Promise.all([
        getTreasuryYields(),
        getInflationData()
    ]);

    return {
        treasury,
        inflation,
        asOfET: new Date().toLocaleString('en-US', {
            timeZone: 'America/New_York',
            dateStyle: 'short',
            timeStyle: 'short'
        })
    };
}
