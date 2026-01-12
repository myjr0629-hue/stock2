// [S-48.4] MacroHub Provider (Massive API Native V2 + Synthetic Calibration)
// Pure Massive Implementation: QQQ(Trend), VIXY(Panic), US10Y(Fed API)
// removed Yahoo Finance entirely due to instability (429 Rate Limits).
// Synthetic Multipliers applied to mimic Index Levels.

import { fetchMassive, CACHE_POLICY } from './massiveClient';
import { MarketStatusResult, getMarketStatusSSOT } from "./marketStatusProvider";
import { getUpcomingEvents } from './eventHubProvider';

export interface MacroFactor {
    level: number | null;
    chgPct?: number | null;
    chgAbs?: number | null;
    label: string;
    source: "MASSIVE" | "FAIL"; // No more YAHOO
    status: "OK" | "UNAVAILABLE";
    symbolUsed: string;
}

export interface MacroSnapshot {
    asOfET: string;
    fetchedAtET: string;
    ageSeconds: number;
    marketStatus: MarketStatusResult;
    factors: {
        nasdaq100: MacroFactor;
        vix: MacroFactor;
        us10y: MacroFactor;
        dxy: MacroFactor;
    };
    nq?: number;
    nqChangePercent?: number;
    vix?: number;
    us10y?: number;
    dxy?: number;
}

const CACHE_TTL_MS = 120000; // 2 min cache
let cache: { data: MacroSnapshot | null; expiry: number; fetchedAt: number } = { data: null, expiry: 0, fetchedAt: 0 };

const SYMBOLS = {
    NDX_PROXY: "QQQ", // Massive uses QQQ for Trend Logic
    VIX_PROXY: "VIXY", // Massive uses VIXY for Panic Logic
    DXY_PROXY: "UUP"   // UUP (Bullish Dollar ETF) as proxy for DXY since I:DX is blocked.
    // Previous code used I:DX. Attempt I:DX, if fail, fallback UUP?
    // Let's stick to I:DX if it was working? No, I:DX is likely blocked just like I:TNX. 
    // Let's use UUP or just handle Fail cleanly. 
    // Wait, previous logs showed "Exhausted all fetch methods for I:DX". 
    // So I:DX is likely blocked.
};

// Synthetic Multipliers (Calculated 2025-12-31)
// QQQ -> NDX: x41.45
// VIXY -> VIX: x0.56
const MULTIPLIERS = {
    NDX: 41.45,
    VIX: 0.56,
    DXY: 3.6315 // Calibrated UUP(27.05) -> DXY(98.23)
};

async function fetchIndexSnapshot(ticker: string, label: string, multiplier: number = 1, marketStatus?: MarketStatusResult): Promise<MacroFactor> {
    // [V3 Upgrade] Use Polygon V3 Snapshot for real-time accuracy (Pre/Post market support)
    // V3 response: { results: [ { ticker, last_trade, min, day, updated } ] }
    try {
        const res = await fetchMassive(`/v3/snapshot?ticker.any_of=${ticker}`, {}, true, undefined, CACHE_POLICY.LIVE);
        const result = res?.results?.[0]; // Get first match

        if (result) {
            // Priority: Last Trade (Live) > Min (Bar) > Day (Close)
            // V3 'last_trade' updates during Extended Hours if trade occurs
            // [Fix V3 Parsing] Use 'session' object if available (Standard V3 Snapshot)
            const session = result.session;

            let rawLevel =
                session?.price ||
                session?.close ||
                result.last_trade?.p ||
                result.min?.c ||
                result.day?.c ||
                result.prev_day?.c;

            const rawChgAbs = session?.change || result.todaysChange || (result.day?.c - result.prev_day?.c) || 0;
            const rawChgPct = session?.change_percent || result.todaysChangePerc || (result.day?.change_percent) || 0;

            if (rawLevel) {
                return {
                    level: rawLevel * multiplier,
                    chgPct: rawChgPct,
                    chgAbs: rawChgAbs * multiplier,
                    label: label,
                    source: "MASSIVE",
                    status: "OK",
                    symbolUsed: ticker
                };
            }
        }
    } catch (e) {
        // V3 failed, fall back?
    }

    // 2. Fallback: Aggs (Previous Close) - Kept for safety
    try {
        const prevRes = await fetchMassive(`/v2/aggs/ticker/${ticker}/prev`, {}, true);
        if (prevRes?.results?.[0]) {
            const r = prevRes.results[0];
            return {
                level: r.c * multiplier,
                chgPct: 0,
                chgAbs: 0,
                label: label + " (Delayed)",
                source: "MASSIVE",
                status: "OK",
                symbolUsed: ticker
            };
        }
    } catch (e) {
        // Aggs failed
    }

    return createFailFactor(label, ticker);
}

function createFailFactor(label: string, symbolUsed: string): MacroFactor {
    return { level: null, chgPct: null, chgAbs: null, label, source: "FAIL", status: "UNAVAILABLE", symbolUsed };
}

// [Phase 41.3] Real Macro Intelligence (Fed Data)
// Using /fed/v1/treasury-yields
async function fetchFedYield(): Promise<MacroFactor> {
    try {
        // Sort by date desc to get latest
        const res = await fetchMassive('/fed/v1/treasury-yields', { limit: '1', sort: 'date', order: 'desc' }, true);
        const latest = res?.results?.[0];

        if (latest && latest.yield_10_year) {
            return {
                level: latest.yield_10_year,
                chgPct: 0,
                chgAbs: 0,
                label: "US 10Y (Fed)",
                source: "MASSIVE",
                status: "OK",
                symbolUsed: "FED:10Y"
            };
        }
    } catch (e) {
        console.error("[MacroHub] Fed Yield Fetch Failed", e);
    }
    return createFailFactor("US10Y", "FED");
}

/**
 * [Phase 23] Macro SSOT
 * Aggregates Indices (QQQ) + VIX (VIXY) + Bond Yields (Fed) to determine Market Regime
 */
export function determineRegime(vixLevel: number, us10yLevel: number, qqqTrend: number): "RISK_ON" | "NEUTRAL" | "RISK_OFF" | "DAY_TRADE_ONLY" {
    // 1. Panic Gate (Standard VIX Scale)
    // Now VIX is synthetically ~14 (Normal).
    // Risk Off Threshold: VIX > 30 (Panic)
    // Warning Threshold: VIX > 20
    if (vixLevel > 30) return "RISK_OFF";

    // 2. Rate Shock Gate (Fed Yield)
    if (us10yLevel > 4.5) return "DAY_TRADE_ONLY"; // High rates kill swings

    // 3. Trend Gate
    if (qqqTrend > 0) return "RISK_ON";

    return "NEUTRAL";
}

export async function getMacroSnapshotSSOT(): Promise<MacroSnapshot> {
    const now = Date.now();
    if (cache.data && cache.expiry > now) {
        cache.data.ageSeconds = Math.floor((now - cache.fetchedAt) / 1000);
        return cache.data;
    }

    console.log('[MacroHub] Fetching Massive Macros (Pure)...');
    const marketStatus = await getMarketStatusSSOT();
    const fetchedAtET = new Date().toISOString();

    // Parallel Fetch with Multipliers
    const [qqq, vixy, us10y] = await Promise.all([
        fetchIndexSnapshot(SYMBOLS.NDX_PROXY, "NASDAQ 100", MULTIPLIERS.NDX, marketStatus),
        fetchIndexSnapshot(SYMBOLS.VIX_PROXY, "VIX", MULTIPLIERS.VIX, marketStatus),
        fetchFedYield()
    ]);

    // DXY Proxy: UUP (Bullish Dollar ETF) -> Calibrated to ~98.23 (x3.6315)
    const dxy = await fetchIndexSnapshot(SYMBOLS.DXY_PROXY, "DOLLAR (DXY)", MULTIPLIERS.DXY, marketStatus);

    // Regime Logic: QQQ Price > SMA20
    // We need to fetch SMA20 for QQQ
    let regime = "Neutral";
    let qqqSma20 = 0;

    try {
        const smaRes = await fetchMassive(`/v1/indicators/sma/${SYMBOLS.NDX_PROXY}`, { timespan: 'day', window: '20', limit: '1' }, true);
        if (smaRes?.results?.values?.[0]) {
            // Note: SMA is RAW QQQ price. We compare RAW QQQ price vs RAW SMA.
            // But qqq variable is SCALED. We need to unscale or just use independent check.
            qqqSma20 = smaRes.results.values[0].value;

            // To be safe, we don't know the exact raw QQQ price unless we kept it.
            // But we know qqq.level = raw * 41.45
            // So raw = qqq.level / 41.45
            const rawPrice = (qqq.level || 0) / MULTIPLIERS.NDX;

            if (rawPrice > qqqSma20) {
                regime = "Bullish (QQQ > SMA20)";
            } else {
                regime = "Bearish (QQQ < SMA20)";
            }
            // Enrich label
            qqq.label = `NASDAQ 100 (Syn)`;
        }
    } catch (e) {
        // console.warn("[MacroHub] SMA fetch failed", e);
    }

    const snapshot: MacroSnapshot = {
        asOfET: marketStatus.asOfET || fetchedAtET,
        fetchedAtET,
        ageSeconds: 0,
        marketStatus,
        factors: { nasdaq100: qqq, vix: vixy, us10y, dxy },
        nq: qqq.level ?? 0,
        nqChangePercent: qqq.chgPct ?? 0,
        vix: vixy.level ?? 0,
        us10y: us10y.level ?? 0,
        dxy: dxy.level ?? 0
    };

    cache = { data: snapshot, expiry: now + CACHE_TTL_MS, fetchedAt: now };
    return snapshot;
}
