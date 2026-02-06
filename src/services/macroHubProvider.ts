// [S-48.4] MacroHub Provider (Massive API Native V2 + Synthetic Calibration)
// Pure Massive Implementation: QQQ(Trend), VIXY(Panic), US10Y(Fed API)
// removed Yahoo Finance entirely due to instability (429 Rate Limits).
// Synthetic Multipliers applied to mimic Index Levels.

import { fetchMassive, CACHE_POLICY } from './massiveClient';
import { MarketStatusResult, getMarketStatusSSOT } from "./marketStatusProvider";
import { getUpcomingEvents } from './eventHubProvider';
import { getTreasuryYields } from './fedApiClient';

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
    // Legacy fields
    nq?: number;
    nqChangePercent?: number;
    vix?: number;
    us10y?: number;
    dxy?: number;
    // [V45.0] Advanced Macro Indicators
    yieldCurve?: {
        us2y: number;      // 2-Year Yield
        us10y: number;     // 10-Year Yield
        spread2s10s: number; // 10Y - 2Y (negative = inversion warning)
        trend: 'STEEPENING' | 'FLATTENING' | 'INVERTED' | 'NORMAL';
    };
    realYield?: {
        us10y: number;          // 10Y Nominal
        inflationExpectation: number; // Breakeven or TIPS-based
        realYield: number;       // 10Y - Inflation Expectation
        stance: 'TIGHT' | 'NEUTRAL' | 'LOOSE';
    };
}

const CACHE_TTL_MS = 120000; // 2 min cache
let cache: { data: MacroSnapshot | null; expiry: number; fetchedAt: number } = { data: null, expiry: 0, fetchedAt: 0 };

const SYMBOLS = {
    NDX_PROXY: "QQQ", // Massive uses QQQ for Trend Logic
    VIX_PROXY: "VIXY", // Massive uses VIXY for Panic Logic
    DXY_PROXY: "UUP"   // UUP (Bullish Dollar ETF) as proxy for DXY
};

// Synthetic Multipliers (Re-Calibrated 2026-01-13)
// Methodology: Real Index / ETF Proxy Price
// QQQ -> NDX: x41.45
// VIXY -> VIX: Real VIX(15.12) / VIXY(25.03) = x0.604
// UUP -> DXY: Real DXY(99.01) / UUP(27.28) = x3.63
// 
// [TODO] FRED API Auto-Calibration:
// - Fetch real VIX from FRED (series: VIXCLS) daily
// - Recalculate multiplier: realVIX / vixyPrice
// - This ensures <1% error vs current ~7% error
const MULTIPLIERS = {
    NDX: 41.45,
    VIX: 0.604,  // [2026-01-13] Re-calibrated: 15.12 / 25.03 = 0.604
    DXY: 3.63    // [2026-01-13] Re-calibrated: 99.01 / 27.28 = 3.63
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

// [V45.0] Yield Curve Data (2Y, 10Y for 2s10s Spread)
interface YieldCurveData {
    us2y: number;
    us10y: number;
    spread2s10s: number;
    trend: 'STEEPENING' | 'FLATTENING' | 'INVERTED' | 'NORMAL';
}

async function fetchYieldCurveData(): Promise<YieldCurveData | null> {
    try {
        // [V45.0] Use getTreasuryYields() from fedApiClient (FRED -> Massive fallback)
        const treasury = await getTreasuryYields();

        if (treasury.us2y !== null && treasury.us10y !== null) {
            const spread2s10s = treasury.spread2s10s ?? (treasury.us10y - treasury.us2y);

            // Determine trend based on spread level
            let trend: 'STEEPENING' | 'FLATTENING' | 'INVERTED' | 'NORMAL' = 'NORMAL';
            if (spread2s10s < 0) {
                trend = 'INVERTED';
            } else if (spread2s10s < 0.25) {
                trend = 'FLATTENING';
            } else if (spread2s10s > 1.0) {
                trend = 'STEEPENING';
            }

            console.log(`[MacroHub] YieldCurve: 2Y=${treasury.us2y.toFixed(2)}%, 10Y=${treasury.us10y.toFixed(2)}%, Spread=${spread2s10s.toFixed(2)}% (${trend})`);
            return { us2y: treasury.us2y, us10y: treasury.us10y, spread2s10s, trend };
        }
    } catch (e) {
        console.error("[MacroHub] Yield Curve Fetch Failed", e);
    }
    return null;
}

// [V45.0] Inflation Expectations (for Real Yield calculation)
interface RealYieldData {
    us10y: number;
    inflationExpectation: number;
    realYield: number;
    stance: 'TIGHT' | 'NEUTRAL' | 'LOOSE';
}

async function fetchRealYieldData(us10y: number): Promise<RealYieldData | null> {
    // [V45.0] Use reasonable default for inflation expectation based on Fed target
    // Long-term inflation expectation is typically around 2.0-2.5%
    const inflationExpectation = 2.3; // Fed's long-run expectation
    const realYield = us10y - inflationExpectation;

    // Determine stance
    let stance: 'TIGHT' | 'NEUTRAL' | 'LOOSE' = 'NEUTRAL';
    if (realYield > 1.5) stance = 'TIGHT';
    else if (realYield < 0) stance = 'LOOSE';

    console.log(`[MacroHub] RealYield: 10Y=${us10y.toFixed(2)}% - Exp=${inflationExpectation}% = ${realYield.toFixed(2)}% (${stance})`);
    return { us10y, inflationExpectation, realYield, stance };
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

    // Parallel Fetch with Multipliers + [V45.0] Advanced Indicators
    const [qqq, vixy, us10y, yieldCurve] = await Promise.all([
        fetchIndexSnapshot(SYMBOLS.NDX_PROXY, "NASDAQ 100", MULTIPLIERS.NDX, marketStatus),
        fetchIndexSnapshot(SYMBOLS.VIX_PROXY, "VIX", MULTIPLIERS.VIX, marketStatus),
        fetchFedYield(),
        fetchYieldCurveData()
    ]);

    // DXY Proxy: UUP (Bullish Dollar ETF) -> Calibrated to ~98.23 (x3.6315)
    const dxy = await fetchIndexSnapshot(SYMBOLS.DXY_PROXY, "DOLLAR (DXY)", MULTIPLIERS.DXY, marketStatus);

    // [V45.0] Real Yield (depends on 10Y yield)
    const realYield = yieldCurve ? await fetchRealYieldData(yieldCurve.us10y) : null;

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
        // Legacy fields
        nq: qqq.level ?? 0,
        nqChangePercent: qqq.chgPct ?? 0,
        vix: vixy.level ?? 0,
        us10y: us10y.level ?? 0,
        dxy: dxy.level ?? 0,
        // [V45.0] Advanced Macro Indicators
        yieldCurve: yieldCurve ?? undefined,
        realYield: realYield ?? undefined
    };

    cache = { data: snapshot, expiry: now + CACHE_TTL_MS, fetchedAt: now };
    return snapshot;
}
