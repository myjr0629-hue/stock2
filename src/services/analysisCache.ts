// ============================================================================
// Analysis Cache Service — Redis-based pre-computed analysis data
// [CACHE WARMER] Stores per-ticker analysis results from Cron warm-analysis job
// Key pattern: cache:analysis:{TICKER} (TTL 5 min)
// Used by: watchlist/batch, portfolio/batch, intel/m7, intel/fast routes
// ============================================================================

import { getFromCache, setInCache, mgetFromCache } from '@/services/redisClient';

// Cache key prefix — separate namespace from flow:ticker:* (used by live/ticker)
const ANALYSIS_CACHE_PREFIX = 'cache:analysis:';

// TTL: 3 days (Cron runs every 2 min Mon-Fri, so data is always fresh on weekdays.
// Extended TTL ensures Friday's last data persists through the entire weekend.)
const ANALYSIS_CACHE_TTL = 259200;

/**
 * Shape of cached analysis data per ticker.
 * Contains everything expensive to compute: Alpha, RSI, RVOL, options, structure.
 * Does NOT contain real-time price data (price, changePct, VWAP) — those are fetched live.
 */
export interface AnalysisCacheEntry {
    ticker: string;
    timestamp: number; // ms since epoch

    // Alpha Engine result
    alphaSnapshot: {
        score: number;
        grade: string;
        action: string;
        actionKR?: string;
        whyKR?: string;
        confidence: number;
        triggers: string[];
        pillars?: any;
        gatesApplied?: any;
        engineVersion?: string;
        capturedAt: string;
    };

    // Analysis indicators (from realtime block)
    rsi: number | null;
    return3d: number | null;
    sparkline: number[];
    relVol: number | null;

    // Options structure data
    expiration: string | null; // Target options expiration date (YYYY-MM-DD) from structureService
    maxPain: number | null;
    gex: number | null;        // netGex (raw)
    gexM: number | null;       // netGex in millions
    pcr: number | null;        // putCallRatio
    callWall: number | null;
    putFloor: number | null;
    gammaFlipLevel: number | null;
    squeezeScore: number | null;
    iv: number | null;         // ATM IV

    // Extra indicators
    whaleIndex: number;
    whaleConfidence: 'HIGH' | 'MED' | 'LOW' | 'NONE';
    darkPoolPct: number;   // [V5] Off-exchange / dark pool volume percentage
    netPremium: number | null;
    vwapDist: number | null;   // cached for reference, UI recalculates with live price
    volume: number | null;     // for reference
    ivSkew: number | null;             // IV skew (put vs call IV difference)
    impliedMovePct: number | null;     // Implied move % from ATM straddle

    // [V3 FIX] Dashboard card fields — previously computed but not cached
    shortVolPct: number | null;        // Short Volume % (FINRA daily data)
    vwap: number | null;               // Absolute VWAP price
    volumePcr: number | null;          // Volume-based Put/Call Ratio
    volumePcrCallVol: number | null;   // Call volume total
    volumePcrPutVol: number | null;    // Put volume total
    zeroDtePct: number | null;         // 0DTE options OI percentage
    impliedMoveDir: string | null;     // CALL/PUT/NEUTRAL direction bias
}

/**
 * Write analysis cache for a single ticker.
 * Called by /api/cron/warm-analysis after computing data.
 */
export async function writeAnalysisCache(
    ticker: string,
    data: AnalysisCacheEntry
): Promise<boolean> {
    const key = `${ANALYSIS_CACHE_PREFIX}${ticker.toUpperCase()}`;
    return setInCache(key, data, ANALYSIS_CACHE_TTL);
}

/**
 * Read analysis cache for a single ticker.
 * Returns null if not found or expired.
 */
export async function getAnalysisCache(
    ticker: string
): Promise<AnalysisCacheEntry | null> {
    const key = `${ANALYSIS_CACHE_PREFIX}${ticker.toUpperCase()}`;
    return getFromCache<AnalysisCacheEntry>(key);
}

/**
 * Read analysis cache for multiple tickers using Redis MGET (single round-trip).
 * Returns a map of ticker → data (only includes tickers with cache hits).
 * [PERF] MGET reduces N Redis round-trips to 1.
 */
export async function getAnalysisCacheForTickers(
    tickers: string[]
): Promise<Record<string, AnalysisCacheEntry>> {
    const results: Record<string, AnalysisCacheEntry> = {};
    if (tickers.length === 0) return results;

    try {
        // [PERF] Single MGET round-trip instead of N individual GETs
        const keys = tickers.map(t => `${ANALYSIS_CACHE_PREFIX}${t.toUpperCase()}`);
        const values = await mgetFromCache<AnalysisCacheEntry>(keys);

        values.forEach((data, i) => {
            if (data) results[tickers[i].toUpperCase()] = data;
        });
    } catch (e) {
        // Fallback: MGET failed → use original individual GETs (zero-regression guarantee)
        console.warn('[AnalysisCache] MGET failed, falling back to individual GETs:', e);
        return getAnalysisCacheForTickersFallback(tickers);
    }

    return results;
}

/**
 * Fallback: individual Redis GETs (used when MGET fails)
 */
async function getAnalysisCacheForTickersFallback(
    tickers: string[]
): Promise<Record<string, AnalysisCacheEntry>> {
    const results: Record<string, AnalysisCacheEntry> = {};
    const entries = await Promise.all(
        tickers.map(async (ticker) => {
            const data = await getAnalysisCache(ticker);
            return { ticker: ticker.toUpperCase(), data };
        })
    );
    entries.forEach(({ ticker, data }) => {
        if (data) results[ticker] = data;
    });
    return results;
}
