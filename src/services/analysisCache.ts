// ============================================================================
// Analysis Cache Service — Redis-based pre-computed analysis data
// [CACHE WARMER] Stores per-ticker analysis results from Cron warm-analysis job
// Key pattern: cache:analysis:{TICKER} (TTL 5 min)
// Used by: watchlist/batch, portfolio/batch, intel/m7, intel/fast routes
// ============================================================================

import { getFromCache, setInCache, mgetFromCache } from '@/services/redisClient';
import { xsSnapshotOverride, ensureXsScores } from '@/services/xsScores';

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
    /** 장외 체결 비중. **현재 피드에 값이 없어 읽기 시점에 null 로 잘라낸다**(stripDeadTickFields) */
    darkPoolPct: number | null;
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
    const entry = await getFromCache<AnalysisCacheEntry>(key);
    await ensureXsScores();
    return applyXs(ticker, entry);
}

// XS-2.0 display switch: the harvest Lambda keeps stamping V8 values into
// this cache, so the override must sit on the READ side (single point for
// every alphaSnapshot consumer — command/unified, ticker SSR, intel routes).
function applyXs<T extends AnalysisCacheEntry | null>(ticker: string, entry: T): T {
    if (!entry) return entry;
    const stripped = stripDeadTickFields(entry);
    if (!stripped.alphaSnapshot) return stripped as T;
    return { ...stripped, alphaSnapshot: xsSnapshotOverride(ticker, stripped.alphaSnapshot) } as T;
}

/**
 * ★ [2026-08-29] 죽은 다크풀이 이 캐시에 «살아 있는 숫자»로 남아 있었다.
 *
 * 실측 — 가디언 섹터 payload:
 *     XLE DP=67  XLV DP=71  XLF DP=41  …  (15개 섹터 전부 값이 있었다)
 *
 * 이 값들은 2026-08-28 데이터 권한 상실 **이전에 굳어진 것**이고 앞으로
 * 영원히 변하지 않는다. 그런데 하류는 그걸 오늘의 사실로 읽는다:
 *   · calculateWhaleIndex 의 활동도 축 (DP≥60 이면 +25점)
 *   · sectorEngine 의 IFS 다크풀 항
 * 「200 OK 인데 값은 어제 것」보다 나쁘다 — **영원히 어제 것**이다.
 *
 * 캐시를 비워도 소용없다. 하베스트 Lambda 가 다시 채운다(applyXs 주석의
 * V8 사례와 같은 구조). 그래서 **읽는 쪽 한 곳**에서 잘라낸다.
 * 데이터가 복구되면 ENABLE_MASSIVE_TICKS=1 로 되돌린다.
 */
function stripDeadTickFields(entry: AnalysisCacheEntry): AnalysisCacheEntry {
    if (process.env.ENABLE_MASSIVE_TICKS === '1') return entry;
    if (entry.darkPoolPct == null && (entry as any).blockTrades == null) return entry;
    const out: any = { ...entry };
    out.darkPoolPct = null;      // 0 이 아니다 — 0 은 «다크풀 0%» 라는 주장이 된다
    out.blockTrades = null;
    out._tickFieldsStripped = true;
    return out;
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

        await ensureXsScores();
        values.forEach((data, i) => {
            if (data) results[tickers[i].toUpperCase()] = applyXs(tickers[i], data);
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
