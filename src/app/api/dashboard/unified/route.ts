import { NextRequest, NextResponse } from 'next/server';
import { calculateAlphaScore, calculateWhaleIndex, type AlphaSession } from '@/services/alphaEngine';
import { getStructureData } from '@/services/structureService';
import { fetchRealtimeMetrics } from '@/services/realtimeMetricsService';
import { getFromCache, setInCache } from '@/services/redisClient';
import { recordAlphaDaily } from '@/lib/aws/historyMiddleware';
import { getAnalysisCacheForTickers, type AnalysisCacheEntry } from '@/services/analysisCache';
import { GET as getLiveTicker } from '@/app/api/live/ticker/route'; // [FIX] Direct import (no HTTP loopback)
import { fetchMassive } from '@/services/massiveClient';

// ============================================================
// [PREV-CHANGE FIX] Accurate previous regular session change from Polygon Daily Bars
// Same data source as 5-DAY HISTORY — always correct
// ============================================================

// ── [REDIS OPT] In-memory cache for prev-day-pct — 1h TTL ──
// Daily bars are confirmed data that only change once per day at market close.
// 1-hour memory cache eliminates ~99% of Redis GET calls for this data.
// Before: 14 tickers × Redis GET / 30s = 28 GET/min
// After:  14 tickers × Redis GET / 3600s = 0.23 GET/min
type PrevDayEntry = { changePct: number; close: number; prevClose: number };
const PREV_DAY_MEM_CACHE = new Map<string, { data: PrevDayEntry; expiry: number }>();
const PREV_DAY_MEM_TTL_MS = 3600_000; // 1 hour — daily bars change once per day, safe to cache long

async function getDailyChangeBatch(tickers: string[]): Promise<Map<string, PrevDayEntry>> {
    const result = new Map<string, PrevDayEntry>();
    const REDIS_KEY_PREFIX = 'prev-day-pct:';
    const CACHE_TTL = 600; // 10 min — daily bars are confirmed data, rarely change

    // 0. Check in-memory cache FIRST — avoids Redis entirely for cached tickers
    const tickersAfterMem: string[] = [];
    const now = Date.now();
    for (const ticker of tickers) {
        const memEntry = PREV_DAY_MEM_CACHE.get(ticker);
        if (memEntry && now < memEntry.expiry) {
            result.set(ticker, memEntry.data);
        } else {
            if (memEntry) PREV_DAY_MEM_CACHE.delete(ticker);
            tickersAfterMem.push(ticker);
        }
    }
    if (tickersAfterMem.length === 0) return result;

    // 1. Check Redis cache for remaining tickers
    const missingTickers: string[] = [];
    await Promise.all(tickersAfterMem.map(async (ticker) => {
        try {
            const cached = await getFromCache<PrevDayEntry>(`${REDIS_KEY_PREFIX}${ticker}`);
            if (cached && typeof cached.changePct === 'number') {
                result.set(ticker, cached);
                // Store in memory cache for future calls
                PREV_DAY_MEM_CACHE.set(ticker, { data: cached, expiry: Date.now() + PREV_DAY_MEM_TTL_MS });
                return;
            }
        } catch { /* cache miss */ }
        missingTickers.push(ticker);
    }));

    if (missingTickers.length === 0) return result;

    // 2. Fetch Polygon Daily Bars for cache misses (parallel, 2 bars each)
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 10 days back

    await Promise.all(missingTickers.map(async (ticker) => {
        try {
            const data = await fetchMassive(
                `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`,
                { adjusted: 'true', sort: 'desc', limit: '3' },
                true
            );
            const bars = data?.results || [];
            if (bars.length >= 2) {
                const todayBar = bars[0]; // Most recent trading day
                const prevBar = bars[1];  // Previous trading day
                const changePct = prevBar.c > 0 ? ((todayBar.c - prevBar.c) / prevBar.c) * 100 : 0;
                const entry: PrevDayEntry = { changePct, close: todayBar.c, prevClose: prevBar.c };
                result.set(ticker, entry);
                // Store in both memory and Redis cache
                PREV_DAY_MEM_CACHE.set(ticker, { data: entry, expiry: Date.now() + PREV_DAY_MEM_TTL_MS });
                try { await setInCache(`${REDIS_KEY_PREFIX}${ticker}`, entry, CACHE_TTL); } catch { /* non-critical */ }
            }
        } catch (e) {
            console.warn(`[getDailyChangeBatch] Failed for ${ticker}:`, e);
        }
    }));

    return result;
}

// [AWS-FIRST] Technical indicators from analysis-cache (NO Polygon API call)
// Analysis cache is pre-computed by Lambda harvest and stored in Redis.
async function fetchTechnicalIndicators(ticker: string): Promise<{
    return3D: number | null;
    sma20: number | null;
    rsi14: number | null;
    relVol: number | null;
}> {
    try {
        // [FIX] Use correct cache:analysis: key (not analysis:)
        const { getAnalysisCache } = await import('@/services/analysisCache');
        const cached = await getAnalysisCache(ticker);
        if (cached) {
            return {
                return3D: cached.return3d ?? null,
                sma20: null,
                rsi14: cached.rsi ?? null,
                relVol: cached.relVol ?? null,
            };
        }
        // Fallback: try DynamoDB unified cache
        const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
        const dynData = await Promise.race([
            getUnifiedCache(ticker, 'en'),
            new Promise<null>(r => setTimeout(() => r(null), 3000))
        ]);
        if (dynData) {
            const p = (dynData as any).price || {};
            return {
                return3D: (dynData as any).return3d ?? null,
                sma20: p.sma20 ?? null,
                rsi14: (dynData as any).rsi ?? null,
                relVol: (dynData as any).relVol ?? null,
            };
        }
        return { return3D: null, sma20: null, rsi14: null, relVol: null };
    } catch {
        return { return3D: null, sma20: null, rsi14: null, relVol: null };
    }
}

// [V4.1] Calculate ivSkew from rawChain: Put ATM IV / Call ATM IV
function calculateIvSkew(rawChain: any[], price: number): number | null {
    if (!rawChain || rawChain.length === 0 || !price) return null;
    try {
        const tolerance = price * 0.05; // ±5% of price
        const atmCalls = rawChain.filter((c: any) =>
            c.details?.contract_type === 'call' &&
            Math.abs((c.details?.strike_price || 0) - price) <= tolerance &&
            c.implied_volatility > 0
        );
        const atmPuts = rawChain.filter((c: any) =>
            c.details?.contract_type === 'put' &&
            Math.abs((c.details?.strike_price || 0) - price) <= tolerance &&
            c.implied_volatility > 0
        );
        if (atmCalls.length === 0 || atmPuts.length === 0) return null;

        const avgCallIV = atmCalls.reduce((s: number, c: any) => s + c.implied_volatility, 0) / atmCalls.length;
        const avgPutIV = atmPuts.reduce((s: number, c: any) => s + c.implied_volatility, 0) / atmPuts.length;
        if (avgCallIV <= 0) return null;

        return parseFloat((avgPutIV / avgCallIV).toFixed(3)); // >1 = institutional hedging
    } catch {
        return null;
    }
}

// [FIX] Internal API call helper — bypasses HTTP loopback (Vercel serverless has no localhost)
// Creates a mock NextRequest and calls the handler directly, returns parsed JSON
const DASHBOARD_INTERNAL_TIMEOUT_MS = 10000;
async function callInternalGetForDashboard(handler: Function, url: string): Promise<any> {
    try {
        const mockReq = new NextRequest(url);
        const responsePromise = handler(mockReq);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Internal call timeout')), DASHBOARD_INTERNAL_TIMEOUT_MS)
        );
        const response = await Promise.race([responsePromise, timeoutPromise]) as Response;
        if (!response || typeof response.json !== 'function') return null;
        return await response.json();
    } catch (e: any) {
        console.error(`[Dashboard] callInternalGet failed for ${url}:`, e.message);
        return null;
    }
}

// [PERFORMANCE] Server-side Auto Cache Warming
// Instead of SWR (stale-while-revalidate) which causes cold-start delays after 5min expiry,
// the server proactively refreshes the cache every WARM_INTERVAL_MS.
// Users ALWAYS get cached data instantly; cache never "expires".
interface CacheEntry {
    data: any;
    timestamp: number;
    isRevalidating?: boolean;
}
const CACHE_VERSION = 'v5'; // Bumped: v4→v5 (HTTP loopback fix - invalidate old failed cache)
const cache: Map<string, CacheEntry> = new Map();
const WARM_INTERVAL_MS = 90_000; // 90 seconds — auto-refresh interval for default tickers
const REDIS_PREFIX = 'dashboard:unified:'; // Redis key prefix

// Smart TTL: short during active sessions (pre+regular+after), long during true off-hours
function getDashboardSmartTTL(): { memoryMs: number; redisSeconds: number } {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMin = utcHour * 60 + now.getUTCMinutes();
    const day = now.getUTCDay();
    // [FIX] Include PRE-market (04:00 ET = 08:00 UTC) through AFTER-hours close (20:00 ET = 00:00+1 UTC)
    // Active window: 08:00 UTC onwards on weekdays (covers pre+regular+after)
    // After midnight UTC (Mon-Fri 00:00-01:00) = still after-hours in ET (20:00-21:00)
    const isWeekday = day >= 1 && day <= 5;
    const isMarketActive = isWeekday && utcMin >= 8 * 60; // 08:00+ UTC = 04:00+ ET
    return isMarketActive
        ? { memoryMs: 120_000, redisSeconds: 180 } // 2min/3min during active sessions
        : { memoryMs: 3600_000, redisSeconds: 43200 }; // 1h/12h during true off-hours (21:00-04:00 ET)
}

// Default tickers for dashboard
const DEFAULT_TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'SPY'];

// ── Redis cache helpers ──
function redisKey(cacheKey: string): string {
    return `${REDIS_PREFIX}${cacheKey}`;
}

async function getFromRedisCache(cacheKey: string): Promise<CacheEntry | null> {
    try {
        const entry = await getFromCache<CacheEntry>(redisKey(cacheKey));
        if (entry && entry.data && entry.timestamp) {
            // Check freshness (Redis TTL handles expiry, but double-check)
            const age = Date.now() - entry.timestamp;
            if (age < getDashboardSmartTTL().redisSeconds * 1000) {
                return entry;
            }
        }
        return null;
    } catch {
        return null;
    }
}

async function writeToRedisCache(cacheKey: string, data: any, timestamp: number): Promise<void> {
    try {
        await setInCache(redisKey(cacheKey), { data, timestamp }, getDashboardSmartTTL().redisSeconds);
    } catch {
        // Redis write failure is non-critical — in-memory cache still works
    }
}

// ============================================================
// [CACHE WARMER] Proactive background refresh — eliminates cold starts
// ============================================================
let _warmerStarted = false;
let _warmerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Warm the cache for DEFAULT_TICKERS.
 * Runs automatically every WARM_INTERVAL_MS, ensuring the cache is always fresh.
 * Uses localhost self-fetch (same as the original fetchTickerData pattern).
 */
async function warmDefaultCache() {
    const cacheKey = `${CACHE_VERSION}:${[...DEFAULT_TICKERS].sort().join(',')}`;
    const existing = cache.get(cacheKey);

    // Skip if already revalidating
    if (existing?.isRevalidating) {
        console.log('[CACHE WARMER] Skip — already revalidating');
        return;
    }

    // Mark as revalidating
    if (existing) {
        cache.set(cacheKey, { ...existing, isRevalidating: true });
    }

    const startTs = Date.now();
    console.log('[CACHE WARMER] Starting background warm...');

    try {
        // [AWS-FIRST] Use production URL, never localhost (Vercel has no localhost)
        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : `http://localhost:${process.env.PORT || '3000'}`;

        const [marketData, ...tickerResults] = await Promise.all([
            fetchMarketData(),
            ...DEFAULT_TICKERS.map(async (ticker) => {
                try {
                    const data = await fetchTickerData(ticker, undefined, 3, baseUrl);
                    return { ticker, data, error: null };
                } catch (e: any) {
                    return { ticker, data: null, error: e.message };
                }
            })
        ]);

        const response = await buildResponseFromResults(tickerResults, marketData);
        const ts = Date.now();
        cache.set(cacheKey, { data: response, timestamp: ts });
        // [REDIS] Also write to Redis for cross-instance sharing
        writeToRedisCache(cacheKey, response, ts);

        const elapsed = Date.now() - startTs;
        console.log(`[CACHE WARMER] ✅ Warm complete (${elapsed}ms) — ${DEFAULT_TICKERS.length} tickers cached`);
    } catch (error) {
        console.error('[CACHE WARMER] ❌ Warm failed:', error);
        // Restore non-revalidating state
        if (existing) {
            cache.set(cacheKey, { ...existing, isRevalidating: false });
        }
    }
}

/**
 * Start the cache warmer. Safe to call multiple times (idempotent).
 * First warm fires after a 5-second delay (let server boot complete),
 * then repeats every WARM_INTERVAL_MS.
 */
function startCacheWarmer() {
    if (_warmerStarted) return;
    _warmerStarted = true;

    console.log(`[CACHE WARMER] 🔥 Initializing (interval: ${WARM_INTERVAL_MS / 1000}s)`);

    // Initial warm after 5 second delay (let Next.js finish booting)
    setTimeout(() => {
        warmDefaultCache();
    }, 5_000);

    // Periodic warm
    _warmerInterval = setInterval(() => {
        warmDefaultCache();
    }, WARM_INTERVAL_MS);
}

// Auto-start on module load (Next.js server process lifecycle)
startCacheWarmer();

// [PERFORMANCE] Build response object from fetched results
async function buildResponseFromResults(
    tickerResults: { ticker: string; data: any; error: string | null }[],
    marketData: any
) {
    const tickersData: Record<string, any> = {};
    const signals: any[] = [];

    // [PREV-CHANGE FIX] Get accurate daily bars for all tickers
    const allTickers = tickerResults.filter(r => r.data).map(r => r.ticker);
    const dailyChanges = await getDailyChangeBatch(allTickers);

    tickerResults.forEach(({ ticker, data, error }) => {
        if (data) {
            const dailyBar = dailyChanges.get(ticker);
            // Use daily bars as authoritative source for prevChangePct
            const accuratePrevChangePct = dailyBar?.changePct ?? data.prevChangePct ?? null;

            tickersData[ticker] = {
                underlyingPrice: data.underlyingPrice,
                changePercent: data.changePercent,
                prevClose: dailyBar?.prevClose || data.prevClose,
                // [INTRADAY FIX] Today's regular session close
                regularCloseToday: dailyBar?.close || data.regularCloseToday || null,
                // [INTRADAY FIX] Intraday-only change (regularCloseToday vs prevClose)
                intradayChangePct: accuratePrevChangePct || data.intradayChangePct || null,
                // [FIX] Command-style price display data
                display: data.display || null,
                prevChangePct: accuratePrevChangePct,
                prevRegularClose: dailyBar?.prevClose || (data.prevRegularClose ?? null),
                extended: data.extended || null,
                session: data.session || 'CLOSED',
                netGex: data.netGex,
                maxPain: data.maxPain,
                pcr: data.pcr,
                isGammaSqueeze: data.isGammaSqueeze,
                gammaFlipLevel: data.gammaFlipLevel,
                atmIv: data.atmIv || null,
                atmIvExpiry: data.atmIvExpiry || null,
                squeezeScore: data.squeezeScore ?? null,     // [SQUEEZE FIX] 0-100 score from structureService
                squeezeRisk: data.squeezeRisk ?? null,       // [SQUEEZE FIX] LOW/MEDIUM/HIGH/EXTREME
                // [DASHBOARD V2] New intraday indicators
                vwap: data.vwap ?? null,
                darkPoolPct: data.darkPoolPct ?? null,
                shortVolPct: data.shortVolPct ?? null,
                zeroDtePct: data.zeroDtePct ?? null,
                impliedMovePct: data.impliedMovePct ?? null,
                impliedMoveDir: data.impliedMoveDir ?? null,
                gammaConcentration: data.gammaConcentration ?? null,
                // [P/C RATIO VOLUME] Volume-based P/C ratio from rawChain
                volumePcr: data.volumePcr ?? null,
                volumePcrCallVol: data.volumePcrCallVol ?? null,
                volumePcrPutVol: data.volumePcrPutVol ?? null,
                levels: data.levels,
                expiration: data.expiration,
                options_status: data.options_status,
            };

            // [V3.0] Alpha Engine V3 — Real-time scoring (SWR path)
            try {
                const sessionMap: Record<string, AlphaSession> = { PRE: 'PRE', REG: 'REG', POST: 'POST', CLOSED: 'CLOSED' };
                const alphaSession: AlphaSession = sessionMap[data.session || 'CLOSED'] || 'CLOSED';
                const whaleIndex = calculateWhaleIndex(data.netGex, data.darkPoolPct, data._blockTrades, data._netPremium);
                const alphaResult = calculateAlphaScore({
                    ticker,
                    session: alphaSession,
                    price: data.underlyingPrice || 0,
                    prevClose: data.prevClose || 0,
                    changePct: data.changePercent || 0,
                    vwap: data.vwap ?? null,
                    return3D: data._return3D ?? null, // [V4.1]
                    sma20: data._sma20 ?? null, // [V4.1]
                    rsi14: data._rsi14 ?? null, // [V4.1]
                    pcr: data.pcr ?? null,
                    gex: data.netGex ?? null,
                    callWall: data.levels?.callWall ?? null,
                    putFloor: data.levels?.putFloor ?? null,
                    gammaFlipLevel: data.gammaFlipLevel ?? null,
                    rawChain: data._rawChain ?? [],
                    squeezeScore: data.squeezeScore ?? null,
                    atmIv: data.atmIv ?? null,
                    ivSkew: data._ivSkew ?? null, // [V4.1]
                    darkPoolPct: data.darkPoolPct ?? null,
                    shortVolPct: data.shortVolPct ?? null,
                    whaleIndex,
                    relVol: data._relVol ?? null, // [V4.1]
                    netFlow: data._netPremium ?? null,
                    ndxChangePct: marketData?.nq?.change ?? null,
                    vixValue: marketData?.vix ?? null,
                    impliedMovePct: data.impliedMovePct ?? null,
                    blockTrades: data._blockTrades ?? null, // [V4.1]
                    tltChangePct: marketData?.tltChangePct ?? null, // [V4.1]
                    gldChangePct: marketData?.gldChangePct ?? null, // [V4.1]
                    optionsDataAvailable: data.options_status === 'OK',
                    // [V3.4] Pre-Market Validation
                    preMarketChangePct: data._extendedChangePct ?? null,
                });
                tickersData[ticker].alpha = {
                    score: alphaResult.score,
                    grade: alphaResult.grade,
                    action: alphaResult.action,
                    actionKR: alphaResult.actionKR,
                    whyKR: alphaResult.whyKR,
                    pillars: {
                        momentum: alphaResult.pillars.momentum.score,
                        structure: alphaResult.pillars.structure.score,
                        flow: alphaResult.pillars.flow.score,
                        regime: alphaResult.pillars.regime.score,
                        catalyst: alphaResult.pillars.catalyst.score,
                    },
                    gatesApplied: alphaResult.gatesApplied,
                    dataCompleteness: alphaResult.dataCompleteness,
                    engineVersion: alphaResult.engineVersion,
                };

                // 🔥 [V4.6 WRITE-BACK] Record accurate SSR Alpha Score to DynamoDB
                recordAlphaDaily(ticker, {
                    alphaScore: alphaResult.score,
                    qualityTier: 'SSR_V46',
                    changePct: data.changePercent || 0,
                    gex: data.netGex ?? 0,
                    pcr: data.pcr ?? 0,
                    grade: alphaResult.grade,
                    momentum: alphaResult.pillars.momentum.score,
                    structure: alphaResult.pillars.structure.score,
                    flow: alphaResult.pillars.flow.score,
                    regime: alphaResult.pillars.regime.score,
                    catalyst: alphaResult.pillars.catalyst.score,
                    engineVersion: alphaResult.engineVersion,
                    price: data.underlyingPrice || 0,
                });
            } catch (e) {
                console.error(`[Dashboard V3 SWR] Alpha failed for ${ticker}:`, e);
            }

            // Generate signals — ONLY during regular market hours (REG)
            // [SIGNAL AUDIT V2] Removed: Gamma LONG/SHORT (always-firing), GEX<0 (structural noise)
            // Added: Dark Pool ≥60%, Short Vol ≥50%, Implied Move ≥5%
            const session = data.session || 'CLOSED';
            if (session === 'REG') {
                const timestamp = new Date().toISOString();
                const price = data.underlyingPrice;
                const callWall = data.levels?.callWall;
                const putFloor = data.levels?.putFloor;

                // BULLISH signals
                if (putFloor && price && data.netGex && price <= putFloor * 1.02 && data.netGex > 0) {
                    signals.push({ time: timestamp, ticker, type: 'BULLISH', message: `지지선 매수 기회 (Put Floor $${putFloor})`, messageKey: 'signalBuyPutFloor', params: { putFloor } });
                }
                if (data.pcr && data.pcr < 0.7) {
                    signals.push({ time: timestamp, ticker, type: 'BULLISH', message: `콜 강세 (PCR ${data.pcr.toFixed(2)}) - 상승 추세`, messageKey: 'signalBuyCallBullish', params: { pcr: data.pcr.toFixed(2) } });
                }

                // BEARISH signals
                if (callWall && price && data.netGex && price >= callWall * 0.98 && data.netGex < 0) {
                    signals.push({ time: timestamp, ticker, type: 'BEARISH', message: `저항선 도달 - 익절 구간 (Call Wall $${callWall})`, messageKey: 'signalSellCallWall', params: { callWall } });
                }
                if (data.pcr && data.pcr > 1.3) {
                    signals.push({ time: timestamp, ticker, type: 'BEARISH', message: `풋 헤징 증가 (PCR ${data.pcr.toFixed(2)}) - 하락 주의`, messageKey: 'signalSellPutHedge', params: { pcr: data.pcr.toFixed(2) } });
                }

                // WHALE signals
                if (data.netGex && Math.abs(data.netGex) > 100000000) {
                    const size = Math.abs(data.netGex) > 500000000 ? '🐋🐋' : '🐋';
                    signals.push({ time: timestamp, ticker, type: 'WHALE', message: `${size} 고래 GEX ($${(data.netGex / 1e6).toFixed(0)}M)`, messageKey: 'signalWhaleGex', params: { size, gex: `$${(data.netGex / 1e6).toFixed(0)}M` } });
                }

                // ALERT signals — core
                if (data.isGammaSqueeze) {
                    signals.push({ time: timestamp, ticker, type: 'ALERT', message: `⚡ 감마 스퀴즈 감지`, messageKey: 'signalGammaSqueeze', params: {} });
                }
                if (data.atmIv && data.atmIv > 60) {
                    signals.push({ time: timestamp, ticker, type: 'ALERT', message: `📈 고변동성 (IV ${data.atmIv}%) - 큰 움직임 예상`, messageKey: 'signalHighIv', params: { iv: data.atmIv } });
                }
                if (callWall && price && price > callWall) {
                    signals.push({ time: timestamp, ticker, type: 'ALERT', message: `🚀 Call Wall 돌파 ($${callWall}) - 신규 고점`, messageKey: 'signalCallWallBreak', params: { callWall } });
                }
                if (putFloor && price && price < putFloor) {
                    signals.push({ time: timestamp, ticker, type: 'ALERT', message: `💥 Put Floor 이탈 ($${putFloor}) - 손절 구간`, messageKey: 'signalPutFloorBreak', params: { putFloor } });
                }

                // ALERT signals — V2 dashboard card signals
                if (data.darkPoolPct && data.darkPoolPct >= 60) {
                    signals.push({ time: timestamp, ticker, type: 'ALERT', message: `🏦 Dark Pool 집중 (${data.darkPoolPct.toFixed(1)}%) - 기관 대량 거래`, messageKey: 'signalDarkPool', params: { pct: data.darkPoolPct.toFixed(1) } });
                }
                if (data.shortVolPct && data.shortVolPct >= 50) {
                    signals.push({ time: timestamp, ticker, type: 'ALERT', message: `📉 Short Vol 급증 (${data.shortVolPct.toFixed(1)}%) - 공매도 공세`, messageKey: 'signalShortVol', params: { pct: data.shortVolPct.toFixed(1) } });
                }
                if (data.impliedMovePct && data.impliedMovePct >= 5) {
                    signals.push({ time: timestamp, ticker, type: 'ALERT', message: `⚡ Implied Move ±${data.impliedMovePct}% - 대폭 변동 예상`, messageKey: 'signalImpliedMove', params: { pct: data.impliedMovePct } });
                }
            }
        } else {
            tickersData[ticker] = { error };
        }
    });

    return {
        timestamp: new Date().toISOString(),
        market: marketData,
        tickers: tickersData,
        signals: signals.slice(0, 20),
        meta: {
            tickerCount: Object.keys(tickersData).length,
            cacheTTL: getDashboardSmartTTL().memoryMs / 1000
        }
    };
}

// ============================================================
// [STRATEGY A] Build response from warm-analysis Redis cache
// Converts AnalysisCacheEntry format → dashboard response format
// Used during cold start to avoid 40+ Polygon API calls
// ============================================================
async function buildResponseFromAnalysisCache(
    tickers: string[],
    analysisCacheMap: Record<string, AnalysisCacheEntry>,
    marketData: any
) {
    const tickersData: Record<string, any> = {};

    // [FIX] Fetch accurate prevClose + extended prices from quotes API (fast, ~200ms)
    // DynamoDB priceCacheStore only has today's data, no prevClose or extended prices
    const quotesMap: Record<string, any> = {};
    try {
        const { GET: getQuotes } = await import('@/app/api/live/quotes/route');
        const quotesReq = new NextRequest(`https://localhost/api/live/quotes?symbols=${tickers.join(',')}`);
        const quotesRes = await Promise.race([
            getQuotes(quotesReq),
            new Promise<null>(r => setTimeout(() => r(null), 5000))
        ]);
        if (quotesRes && typeof (quotesRes as Response).json === 'function') {
            const quotesJson = await (quotesRes as Response).json();
            if (quotesJson?.data) {
                for (const [t, q] of Object.entries(quotesJson.data) as [string, any][]) {
                    if (q) quotesMap[t] = q;
                }
            }
        }
    } catch (e) {
        console.warn('[Dashboard] quotes fetch failed in analysis-cache path:', e);
    }

    // Fetch live prices — DynamoDB first (fast batch), Polygon fallback for misses
    const priceMap: Record<string, any> = {};
    try {
        // [Phase 2] Try DynamoDB priceCacheStore first (batch: ~300ms for all tickers)
        const { getLatestPricesBatch } = await import('@/lib/aws/priceCacheStore');
        const tickersToFetch = tickers.filter(t => analysisCacheMap[t]);
        const dynamoPrices = await getLatestPricesBatch(tickersToFetch);

        // Use DynamoDB data where available
        const missingFromDynamo: string[] = [];
        for (const ticker of tickersToFetch) {
            const dp = dynamoPrices.get(ticker);
            const q = quotesMap[ticker];
            if (dp && dp.close > 0) {
                // [FIX] Use quotes API for accurate prevClose instead of approximation
                const accuratePrevClose = q?.previousClose || q?.prevClose || dp.close;
                priceMap[ticker] = {
                    lastTrade: { p: dp.close },
                    day: { c: dp.close, o: dp.open, h: dp.high, l: dp.low, v: dp.volume, vw: dp.vwap },
                    prevDay: { c: accuratePrevClose },
                    todaysChangePerc: q?.changePercent || q?.regChangePct || dp.changePct || 0,
                    // [FIX] Extended session prices from quotes API
                    afterHours: q?.extendedLabel === 'POST' && q?.extendedPrice > 0 ? { p: q.extendedPrice } : undefined,
                    preMarket: q?.extendedLabel === 'PRE' && q?.extendedPrice > 0 ? { p: q.extendedPrice } : undefined,
                    _quotesSession: q?.session || null,
                    _quotesExtLabel: q?.extendedLabel || null,
                    _quotesExtChangePct: q?.extendedChangePercent || null,
                };
            } else {
                missingFromDynamo.push(ticker);
            }
        }

        // [AWS-FIRST] DynamoDB misses get no price — analysis cache still provides structure
        if (missingFromDynamo.length > 0) {
            console.log(`[Dashboard] ${missingFromDynamo.length} tickers missing from DynamoDB — using analysis cache only`);
        }

        console.log(`[Dashboard] Price: DynamoDB ${tickersToFetch.length - missingFromDynamo.length}/${tickersToFetch.length}, Quotes ${Object.keys(quotesMap).length}`);
    } catch {
        // DynamoDB failed — analysis cache still provides structure data
        console.warn(`[Dashboard] DynamoDB price fetch failed — continuing with analysis cache`);
    }

    // [PREV-CHANGE FIX] Fetch accurate daily bars for all tickers (Redis cached, ~0ms after first call)
    const dailyChanges = await getDailyChangeBatch(tickers);

    // [ROOT FIX] 캐시에 shortVolPct 없는 종목만 라이브로 가져옴 — "없으면 실데이터" 원칙
    const shortVolMap: Record<string, number | null> = {};
    const tickersNeedingShortVol = tickers.filter(t => analysisCacheMap[t] && analysisCacheMap[t].shortVolPct == null);
    if (tickersNeedingShortVol.length > 0) {
        try {
            const { fetchShortVolumeData } = await import('@/services/realtimeMetricsService');
            const results = await Promise.all(
                tickersNeedingShortVol.map(t => fetchShortVolumeData(t).catch(() => null))
            );
            tickersNeedingShortVol.forEach((t, i) => {
                shortVolMap[t] = results[i]?.shortVolPercent ?? null;
            });
        } catch { /* silent — cache data still used */ }
    }

    // [ROOT FIX] VWAP: DynamoDB에 저장 안 됨 → Polygon 스냅샷에서 직접 가져옴
    const vwapMap: Record<string, number | null> = {};
    const tickersNeedingVwap = tickers.filter(t => {
        const ac = analysisCacheMap[t];
        const snap = priceMap[t];
        return ac && !ac.vwap && !(snap?.day?.vw);
    });
    if (tickersNeedingVwap.length > 0) {
        try {
            const { fetchMassive } = await import('@/services/massiveClient');
            const snapRes = await fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers`, { tickers: tickersNeedingVwap.join(',') }).catch(() => null);
            for (const t of (snapRes?.tickers || [])) {
                vwapMap[t.ticker] = t?.day?.vw || t?.prevDay?.vw || null;
            }
        } catch { /* silent */ }
    }

    for (const ticker of tickers) {
        const ac = analysisCacheMap[ticker];
        if (!ac) continue;

        // [FIX V3] quotes API fallback — DynamoDB miss 시 가격/세션/extended 유실 방지
        const snap = priceMap[ticker];
        const q = quotesMap[ticker];
        const livePrice = snap?.lastTrade?.p || snap?.min?.c || snap?.day?.c || q?.price || 0;
        const prevClose = snap?.prevDay?.c || q?.previousClose || q?.prevClose || 0;
        const dayClose = snap?.day?.c || q?.price || prevClose;
        const todaysChangePerc = snap?.todaysChangePerc || q?.changePercent || q?.regChangePct || 0;
        const price = livePrice || dayClose || prevClose;

        // Session detection: quotes API > DynamoDB snap > market status
        const quotesSession = snap?._quotesSession || q?.session;
        const quotesSessionMap: Record<string, string> = { 'pre': 'PRE', 'regular': 'REG', 'post': 'POST', 'closed': 'CLOSED' };
        const currentSession = marketData?.marketStatus || 'CLOSED';
        const marketSessionMap: Record<string, string> = { 'PRE': 'PRE', 'OPEN': 'REG', 'AFTER': 'POST', 'CLOSED': 'CLOSED' };
        const session = (quotesSession && quotesSessionMap[quotesSession]) || marketSessionMap[currentSession] || 'CLOSED';

        // Calculate changePct from live data
        // [FIX V2] Return null instead of 0 when changePct cannot be reliably calculated.
        // deepMergeTicker skips null values → preserves correct data from 5s quotes poller.
        // Previously: fallback 0 was treated as valid, overwriting real values (caused 0.00% glitch).
        let changePercent: number | null = null;
        if (todaysChangePerc && todaysChangePerc !== 0) {
            changePercent = todaysChangePerc;
        } else if (session === 'REG') {
            changePercent = prevClose > 0 && price > 0 ? ((price - prevClose) / prevClose) * 100 : null;
        } else {
            changePercent = (dayClose > 0 && prevClose > 0 && dayClose !== prevClose) ? ((dayClose - prevClose) / prevClose) * 100 : null;
        }

        // Squeeze risk label from score
        const sqScore = ac.squeezeScore ?? 0;
        const squeezeRisk = sqScore >= 70 ? 'EXTREME' : sqScore >= 50 ? 'HIGH' : sqScore >= 30 ? 'MEDIUM' : 'LOW';

        // [FIX V3] Build extended session data — snap OR quotes API (never miss)
        let extended: any = null;
        const afterHoursPrice = snap?.afterHours?.p || (q?.extendedLabel === 'POST' && q?.extendedPrice > 0 ? q.extendedPrice : 0);
        const preMarketPrice = snap?.preMarket?.p || (q?.extendedLabel === 'PRE' && q?.extendedPrice > 0 ? q.extendedPrice : 0);
        if (afterHoursPrice > 0 || preMarketPrice > 0) {
            extended = {
                postPrice: afterHoursPrice > 0 ? afterHoursPrice : undefined,
                postChangePct: afterHoursPrice > 0 && dayClose > 0 ? ((afterHoursPrice - dayClose) / dayClose) * 100 : (q?.extendedLabel === 'POST' ? q?.extendedChangePercent : undefined),
                prePrice: preMarketPrice > 0 ? preMarketPrice : undefined,
                preChangePct: preMarketPrice > 0 && prevClose > 0 ? ((preMarketPrice - prevClose) / prevClose) * 100 : (q?.extendedLabel === 'PRE' ? q?.extendedChangePercent : undefined),
            };
        }

        // Build display object (Command-style)
        // [FIX V2] display and prevChangePct also use null to prevent overwrite
        const displayPrice = session === 'REG' ? price : dayClose || prevClose;
        const display = changePercent !== null
            ? { price: displayPrice, changePctPct: changePercent }
            : null;

        // [PREV-CHANGE FIX] Use accurate daily bars data when available
        const dailyBar = dailyChanges.get(ticker);
        const accuratePrevChangePct = dailyBar?.changePct ?? changePercent;
        const accurateClose = dailyBar?.close || dayClose || price;
        const accuratePrevClose = dailyBar?.prevClose || prevClose;

        tickersData[ticker] = {
            underlyingPrice: session === 'PRE' ? (accurateClose || price) : price,
            changePercent: session === 'PRE' ? accuratePrevChangePct : changePercent,
            prevClose: accuratePrevClose || prevClose,
            regularCloseToday: accurateClose || dayClose || null,
            intradayChangePct: accuratePrevChangePct,
            display: {
                price: session === 'PRE' ? accurateClose : (displayPrice || price),
                changePctPct: accuratePrevChangePct ?? changePercent ?? 0
            },
            prevChangePct: accuratePrevChangePct,
            prevRegularClose: accuratePrevClose || prevClose,
            extended,
            session,
            netGex: ac.gex,
            gexM: ac.gexM,             // [D] GEX in millions (display-ready)
            maxPain: ac.maxPain,
            pcr: ac.pcr,
            isGammaSqueeze: sqScore >= 70 && (ac.gex ?? 0) < 0,
            gammaFlipLevel: ac.gammaFlipLevel,
            atmIv: ac.iv || null,
            atmIvExpiry: null,
            squeezeScore: ac.squeezeScore,
            squeezeRisk,
            // [ROOT FIX] 캐시에 없으면 → 이미 가져온 라이브 데이터에서 직접 채움
            // 원칙: "있으면 캐시, 없으면 실데이터" — 복잡한 캐시 의존 제거
            vwap: ac.vwap || snap?.day?.vw || snap?.prevDay?.vw || vwapMap[ticker] || null,
            darkPoolPct: ac.darkPoolPct != null ? Math.round(ac.darkPoolPct * 10) / 10 : null,
            shortVolPct: (() => { const v = ac.shortVolPct ?? shortVolMap[ticker] ?? null; return v != null ? Math.round(v * 10) / 10 : null; })(),
            zeroDtePct: ac.zeroDtePct ?? null,
            impliedMovePct: ac.impliedMovePct != null ? Math.round(ac.impliedMovePct * 10) / 10 : null,
            impliedMoveDir: ac.impliedMoveDir ?? null,
            gammaConcentration: null,
            // [ROOT FIX] volumePcr: 캐시에 없으면 OI 기반 pcr 폴백 (같은 데이터 소스)
            volumePcr: ac.volumePcr ?? ac.pcr ?? null,
            volumePcrCallVol: ac.volumePcrCallVol ?? null,
            volumePcrPutVol: ac.volumePcrPutVol ?? null,
            levels: {
                callWall: ac.callWall,
                putFloor: ac.putFloor,
            },
            expiration: ac.expiration ?? null,
            options_status: ac.maxPain || ac.gex ? 'OK' : null,
            // [D] Technical indicators from analysis cache (used for Alpha recalc on full refresh)
            _rsi14: ac.rsi,
            _return3D: ac.return3d,
            _relVol: ac.relVol,
            _vwapDist: ac.vwapDist,
            _netPremium: ac.netPremium,
            _volume: ac.volume,
            sparkline: ac.sparkline,
            whaleIndex: ac.whaleIndex,
            whaleConfidence: ac.whaleConfidence,
            // Alpha from pre-computed cache
            alpha: ac.alphaSnapshot ? {
                score: ac.alphaSnapshot.score,
                grade: ac.alphaSnapshot.grade,
                action: ac.alphaSnapshot.action,
                actionKR: ac.alphaSnapshot.actionKR,
                whyKR: ac.alphaSnapshot.whyKR,
                pillars: ac.alphaSnapshot.pillars,
                gatesApplied: ac.alphaSnapshot.gatesApplied,
                dataCompleteness: ac.alphaSnapshot.confidence,
                engineVersion: ac.alphaSnapshot.engineVersion,
            } : undefined,
        };
    }

    return {
        timestamp: new Date().toISOString(),
        market: marketData,
        tickers: tickersData,
        signals: [] as any[],
        meta: {
            tickerCount: Object.keys(tickersData).length,
            cacheTTL: getDashboardSmartTTL().memoryMs / 1000,
            source: 'analysis-cache'
        }
    };
}

// Background revalidation function (used for both warmer and on-demand custom tickers)
async function revalidateCache(cacheKey: string, tickers: string[], requestOrBaseUrl?: NextRequest | string) {
    const cached = cache.get(cacheKey);
    if (cached?.isRevalidating) return; // Already revalidating

    // Mark as revalidating
    if (cached) {
        cache.set(cacheKey, { ...cached, isRevalidating: true });
    }

    try {
        // [AWS-FIRST] Use production URL, never localhost
        let baseUrl: string;
        if (typeof requestOrBaseUrl === 'string') {
            baseUrl = requestOrBaseUrl;
        } else if (requestOrBaseUrl) {
            baseUrl = new URL(requestOrBaseUrl.url).origin;
        } else {
            baseUrl = process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : `http://localhost:${process.env.PORT || '3000'}`;
        }

        const marketData = await fetchMarketData();
        const tickerResults = await Promise.all(
            tickers.map(async (ticker) => {
                try {
                    const data = await fetchTickerData(ticker, undefined, 3, baseUrl);
                    return { ticker, data, error: null };
                } catch (e: any) {
                    return { ticker, data: null, error: e.message };
                }
            })
        );

        const response = buildResponseFromResults(tickerResults, marketData);
        const ts = Date.now();
        cache.set(cacheKey, { data: response, timestamp: ts });
        // [REDIS] Also write to Redis for cross-instance sharing
        writeToRedisCache(cacheKey, response, ts);
        console.log(`[CACHE] Background revalidation complete for: ${cacheKey}`);
    } catch (error) {
        console.error('[CACHE] Background revalidation failed:', error);
        if (cached) {
            cache.set(cacheKey, { ...cached, isRevalidating: false });
        }
    }
}

// [FIX] Fill missing ticker data — NEVER allow blank cards.
// Layer 1: analysis-cache (fast ~10ms) → Layer 2: fetchTickerData API (guaranteed data)
// IMPORTANT: Creates NEW object, never mutates cached data (prevents race conditions)
async function fillMissingTickers(cachedData: any, requestedTickers: string[], baseUrl?: string): Promise<any> {
    if (!cachedData || !requestedTickers?.length) return cachedData;
    const existingTickers = cachedData.tickers || {};
    const missingTickers = requestedTickers.filter(t =>
        !existingTickers[t] || existingTickers[t].error || existingTickers[t].netGex === undefined
    );
    if (missingTickers.length === 0) return cachedData;

    console.log(`[CACHE FIX] Filling ${missingTickers.length} missing tickers: ${missingTickers.join(',')}`);
    const marketData = cachedData.market || await fetchMarketData();
    const newTickers: Record<string, any> = {}; // Only new data, never overwrite existing
    let stillMissing: string[] = [...missingTickers];

    // Layer 1: analysis-cache (fast ~10ms per ticker from Redis)
    try {
        const analysisCacheMap = await getAnalysisCacheForTickers(missingTickers);
        const acHits = missingTickers.filter(t => analysisCacheMap[t.toUpperCase()]);
        if (acHits.length > 0) {
            const filled = await buildResponseFromAnalysisCache(acHits, analysisCacheMap, marketData);
            for (const [t, data] of Object.entries(filled.tickers)) {
                if (!existingTickers[t]) newTickers[t] = data; // Only add MISSING tickers
            }
            stillMissing = missingTickers.filter(t => !analysisCacheMap[t.toUpperCase()]);
        }
    } catch (e) {
        console.warn('[CACHE FIX] Analysis-cache fill failed:', e);
    }

    // Layer 2: Direct API fetch for any remaining misses (universe 외 종목 등)
    if (stillMissing.length > 0 && baseUrl) {
        console.log(`[CACHE FIX] Fetching ${stillMissing.length} tickers via API: ${stillMissing.join(',')}`);
        try {
            const results = await Promise.all(
                stillMissing.map(async (ticker) => {
                    try {
                        const data = await fetchTickerData(ticker, undefined, 2, baseUrl);
                        return { ticker, data, error: null };
                    } catch (e: any) {
                        return { ticker, data: null, error: e.message };
                    }
                })
            );
            const apiResponse = await buildResponseFromResults(results, marketData);
            for (const [t, data] of Object.entries(apiResponse.tickers)) {
                if (!existingTickers[t]) newTickers[t] = data; // Only add MISSING tickers
            }
        } catch (e) {
            console.warn('[CACHE FIX] API fetch fallback failed:', e);
        }
    }

    if (Object.keys(newTickers).length === 0) return cachedData;

    // Return NEW object (immutable — original cachedData untouched)
    return {
        ...cachedData,
        tickers: { ...existingTickers, ...newTickers },
    };
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');
    const tickers = tickersParam
        ? tickersParam.split(',').slice(0, 20) // Max 20 tickers (dashboard supports up to 20 slots)
        : DEFAULT_TICKERS;

    const cacheKey = `${CACHE_VERSION}:${tickers.sort().join(',')}`;
    const cached = cache.get(cacheKey);
    const now = Date.now();
    const baseUrl = new URL(request.url).origin;

    // [WARM] Fresh cache — return immediately (fill missing tickers if any)
    if (cached && (now - cached.timestamp) < getDashboardSmartTTL().memoryMs) {
        const filledData = await fillMissingTickers(cached.data, tickers, baseUrl);
        // Update cache if we filled anything
        if (filledData !== cached.data) {
            cache.set(cacheKey, { data: filledData, timestamp: cached.timestamp });
        }
        return NextResponse.json({
            ...filledData,
            _cached: true,
            _cacheAge: Math.round((now - cached.timestamp) / 1000),
            _status: 'fresh'
        });
    }

    // [WARM] Stale in-memory cache exists — return immediately, trigger background refresh
    if (cached) {
        // Non-blocking background revalidation
        revalidateCache(cacheKey, tickers, baseUrl);

        const filledData = await fillMissingTickers(cached.data, tickers, baseUrl);
        if (filledData !== cached.data) {
            cache.set(cacheKey, { data: filledData, timestamp: cached.timestamp });
        }
        return NextResponse.json({
            ...filledData,
            _cached: true,
            _cacheAge: Math.round((now - cached.timestamp) / 1000),
            _status: 'warming'
        });
    }

    // [REDIS FALLBACK] In-memory miss — check Redis (shared across Vercel instances)
    const redisCached = await getFromRedisCache(cacheKey);
    if (redisCached) {
        const filledData = await fillMissingTickers(redisCached.data, tickers, baseUrl);
        // Hydrate in-memory cache from Redis (with filled data)
        cache.set(cacheKey, { data: filledData, timestamp: redisCached.timestamp });
        console.log(`[CACHE] ✅ Redis hit for ${cacheKey} (age: ${Math.round((now - redisCached.timestamp) / 1000)}s)`);

        // Non-blocking background revalidation to keep data fresh
        revalidateCache(cacheKey, tickers, baseUrl);

        return NextResponse.json({
            ...filledData,
            _cached: true,
            _cacheAge: Math.round((now - redisCached.timestamp) / 1000),
            _status: 'redis-hit'
        });
    }

    // [COLD START + STRATEGY A] Check warm-analysis Redis cache before expensive API calls
    // The warm-analysis cron pre-computes data for ~50 popular tickers every 2 minutes.
    // If we have analysis cache hits, we can return instantly and revalidate in background.
    console.log(`[CACHE] ❄️ Cold start for ${cacheKey} — checking analysis cache...`);
    try {
        const [marketData, analysisCacheMap] = await Promise.all([
            fetchMarketData(),
            getAnalysisCacheForTickers(tickers)
        ]);

        const cachedTickers = Object.keys(analysisCacheMap);
        const missingTickers = tickers.filter(t => !analysisCacheMap[t.toUpperCase()]);

        // If we have analysis cache for ANY tickers, use it for instant response
        if (cachedTickers.length > 0) {
            console.log(`[CACHE] 🚀 Analysis cache hit: ${cachedTickers.length}/${tickers.length} tickers (miss: ${missingTickers.join(',') || 'none'})`);

            // Build instant response from analysis cache + live prices
            const response = await buildResponseFromAnalysisCache(tickers, analysisCacheMap, marketData);

            // If there are missing tickers, fetch them via full API and merge
            if (missingTickers.length > 0) {
                const missingResults = await Promise.all(
                    missingTickers.map(async (ticker) => {
                        try {
                            const data = await fetchTickerData(ticker, undefined, 3, baseUrl);
                            return { ticker, data, error: null };
                        } catch (e: any) {
                            return { ticker, data: null, error: e.message };
                        }
                    })
                );
                const missingResponse = await buildResponseFromResults(missingResults, marketData);
                // Merge missing tickers into the response
                response.tickers = { ...response.tickers, ...missingResponse.tickers };
                response.signals = [...response.signals, ...missingResponse.signals].slice(0, 20);
            }

            // Store in cache and trigger background full revalidation
            const ts = Date.now();
            cache.set(cacheKey, { data: response, timestamp: ts });
            writeToRedisCache(cacheKey, response, ts);

            // Non-blocking: full revalidation to replace analysis-cache data with complete data
            revalidateCache(cacheKey, tickers, baseUrl);

            return NextResponse.json({
                ...response,
                _cached: false,
                _status: 'analysis-cache-hit',
                _analysisHits: cachedTickers.length,
                _analysisMisses: missingTickers.length,
            });
        }

        // No analysis cache either — full cold start (original path)
        console.log(`[CACHE] ❄️ No analysis cache — full cold start`);
        const tickerResults = await Promise.all(
            tickers.map(async (ticker) => {
                try {
                    const data = await fetchTickerData(ticker, undefined, 3, baseUrl);
                    return { ticker, data, error: null };
                } catch (e: any) {
                    return { ticker, data: null, error: e.message };
                }
            })
        );

        const response = await buildResponseFromResults(tickerResults, marketData);

        // Store in BOTH in-memory and Redis
        const ts = Date.now();
        cache.set(cacheKey, { data: response, timestamp: ts });
        writeToRedisCache(cacheKey, response, ts);

        return NextResponse.json({
            ...response,
            _cached: false,
            _status: 'cold-start'
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Fetch market overview data - uses macro cache for NQ data (faster, no separate fetch)
async function fetchMarketData() {
    try {
        // [PERF] Direct import instead of HTTP call - faster and more reliable
        const { getMacroSnapshotSSOT } = await import('@/services/macroHubProvider');
        const { getMarketStatusSSOT } = await import('@/services/marketStatusProvider');
        const [macro, marketStatusSSOT] = await Promise.all([
            getMacroSnapshotSSOT(),
            getMarketStatusSSOT().catch(() => null)
        ]);

        const nqChange = macro?.nqChangePercent || 0;
        const nqPrice = macro?.nq || null;
        const vix = macro?.vix || null;

        // Determine market phase based on NQ metrics
        let phase = 'NEUTRAL';
        if (nqChange > 0.5) {
            phase = 'BULLISH_EXPANSION';
        } else if (nqChange < -0.5) {
            phase = 'BEARISH_DECLINE';
        } else if (nqChange > 0) {
            phase = 'BULLISH';
        } else if (nqChange < 0) {
            phase = 'BEARISH';
        }

        return {
            // [V45.13] Changed from SPY to NQ (NASDAQ 100)
            nq: {
                price: nqPrice,
                change: nqChange
            },
            vix,
            phase,
            marketStatus: getMarketStatus(),
            // Holiday info from Massive/Polygon API
            isHoliday: marketStatusSSOT?.isHoliday || false,
            holidayName: marketStatusSSOT?.holidayName || undefined,
            // [V4.1] Safe Haven ETFs for AlphaEngine regime scoring
            tltChangePct: (macro as any)?.tltChangePct ?? null,
            gldChangePct: (macro as any)?.gldChangePct ?? null,
        };
    } catch {
        return {
            nq: { price: null, change: 0 },
            vix: null,
            phase: 'UNKNOWN',
            marketStatus: getMarketStatus(),
            isHoliday: false,
        };
    }
}

// Fetch individual ticker data using structure + ticker API for extended prices
// [DATA VALIDATION] Auto-retry when validation.confidence is LOW
async function fetchTickerData(ticker: string, request?: NextRequest, maxRetries: number = 3, baseUrlOverride?: string): Promise<any> {
    const baseUrl = baseUrlOverride || (request ? new URL(request.url).origin : `http://localhost:${process.env.PORT || '3000'}`);
    let retryCount = 0;

    const attemptFetch = async (): Promise<any> => {
        // [FIX] ALL direct imports — NO HTTP loopback (Vercel serverless has no localhost)
        const [structureData, tickerRes, metrics, techIndicators] = await Promise.all([
            getStructureData(ticker),
            callInternalGetForDashboard(getLiveTicker, `${baseUrl}/api/live/ticker?t=${ticker}`),
            fetchRealtimeMetrics(ticker).catch(() => null),
            fetchTechnicalIndicators(ticker) // [V4.1] return3D, sma20, rsi14, relVol
        ]);

        if (!structureData || !structureData.underlyingPrice) {
            throw new Error(`Failed to fetch ${ticker}: no structure data`);
        }

        // [DATA VALIDATION] Auto-retry if confidence is LOW
        if (structureData.validation?.confidence === 'LOW' && retryCount < maxRetries) {
            retryCount++;
            console.log(`[Dashboard] ${ticker} validation LOW, retry ${retryCount}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, 300));
            return attemptFetch();
        }

        // Merge extended session data from ticker API (Command style)
        // [FIX] tickerRes is now a parsed JSON object from callInternalGetForDashboard (not a Response)
        let tickerRawChain: any[] = [];
        const tickerData = tickerRes; // Already parsed JSON from callInternalGet
        if (tickerData && !tickerData.error) {
            structureData.extended = tickerData.extended || null;
            structureData.session = tickerData.session || 'CLOSED';
            structureData.prevClose = tickerData.prices?.prevRegularClose || structureData.prevClose;
            structureData.regularCloseToday = tickerData.prices?.regularCloseToday || null;
            structureData.intradayChangePct = tickerData.prices?.prevChangePct || null;
            // [FIX] Pass display object for accurate PRE/POST/CLOSED price rendering (matches Command page)
            structureData.display = tickerData.display || null;
            structureData.prevChangePct = tickerData.prices?.prevChangePct ?? null;
            structureData.prevRegularClose = tickerData.prices?.prevRegularClose ?? null;
            // [DASHBOARD V2] VWAP from ticker API
            structureData.vwap = tickerData.vwap ?? null;
            // [DASHBOARD V2] Save rawChain for 0DTE/IM computation
            tickerRawChain = tickerData.flow?.rawChain || [];

            // [P/C RATIO VOLUME] Use pre-computed values from ticker API (bypasses SWR cache)
            structureData.volumePcr = tickerData.flow?.volumePcr ?? null;
            structureData.volumePcrCallVol = tickerData.flow?.volumePcrCallVol ?? null;
            structureData.volumePcrPutVol = tickerData.flow?.volumePcrPutVol ?? null;
        }

        // [PERF] Dark Pool % & Short Vol % — direct import (no HTTP loopback)
        if (metrics) {
            structureData.darkPoolPct = metrics.darkPool?.percent ?? null;
            structureData.shortVolPct = metrics.shortVolume?.percent ?? null;
            structureData._blockTrades = metrics.blockTrade?.count ?? null; // [V4.1] Block trades for AlphaEngine
        }

        // [DASHBOARD V2] 0DTE Impact & Implied Move from rawChain (ticker API)
        // Uses gamma-weighted ratio matching FlowRadar.tsx
        try {
            const rawChain = tickerRawChain;
            const price = structureData.underlyingPrice || 0;

            if (rawChain.length > 0 && price > 0) {
                // Find nearest expiry (same as FlowRadar)
                const expirySet = new Set<string>();
                rawChain.forEach((o: any) => {
                    const exp = o.details?.expiration_date;
                    if (exp) expirySet.add(exp);
                });
                const sortedExpiries = Array.from(expirySet).sort();
                const today = new Date().toISOString().split('T')[0];
                let targetExpiry = today;
                if (!expirySet.has(today)) {
                    targetExpiry = sortedExpiries.find(e => e >= today) || sortedExpiries[0] || today;
                }

                // Gamma-weighted 0DTE (same logic as FlowRadar)
                let totalGamma = 0;
                let nearestGamma = 0;
                let atmGamma = 0; // [GEX REGIME] ATM concentration for pinStrength
                rawChain.forEach((o: any) => {
                    const gamma = o.greeks?.gamma || 0;
                    const oi = o.open_interest || 0;
                    const strike = o.details?.strike_price || 0;
                    const gammaExposure = Math.abs(gamma * oi * 100);
                    totalGamma += gammaExposure;
                    if (o.details?.expiration_date === targetExpiry) {
                        nearestGamma += gammaExposure;
                    }
                    // ATM = within 2% of current price (matches FlowRadar)
                    if (Math.abs(strike - price) / price < 0.02) {
                        atmGamma += gammaExposure;
                    }
                });
                structureData.zeroDtePct = totalGamma > 0 ? Math.round((nearestGamma / totalGamma) * 100) : 0;
                structureData.gammaConcentration = totalGamma > 0 ? Math.round((atmGamma / totalGamma) * 100) : 0;

                // Implied Move: ATM straddle price / underlying price * 100
                // [FIX] Use FlowRadar's nearest-strike approach (not rounded ATM ±5)
                const nearestContracts = rawChain.filter((o: any) => o.details?.expiration_date === targetExpiry);
                let nearestCall: any = null, nearestPut: any = null;
                let minCallDist = Infinity, minPutDist = Infinity;
                nearestContracts.forEach((o: any) => {
                    const strike = o.details?.strike_price;
                    if (!strike) return;
                    const dist = Math.abs(strike - price);
                    if (o.details?.contract_type === 'call' && dist < minCallDist) { minCallDist = dist; nearestCall = o; }
                    if (o.details?.contract_type === 'put' && dist < minPutDist) { minPutDist = dist; nearestPut = o; }
                });
                const callMid = nearestCall?.last_trade?.price || nearestCall?.day?.close || 0;
                const putMid = nearestPut?.last_trade?.price || nearestPut?.day?.close || 0;
                if (callMid > 0 && putMid > 0 && price > 0) {
                    structureData.impliedMovePct = parseFloat(((callMid + putMid) / price * 100).toFixed(1));
                    structureData.impliedMoveDir = callMid > putMid ? 'bullish' : callMid < putMid ? 'bearish' : 'neutral';
                }

            }
        } catch (e) {
            // Continue without 0DTE/IM data
        }

        // [V3 PIPELINE] Pass rawChain and net premium for alpha scoring
        structureData._rawChain = tickerRawChain;
        // Calculate net premium from rawChain for flow scoring
        let netPremium = 0;
        try {
            tickerRawChain.forEach((o: any) => {
                const premium = (o.last_trade?.price || o.day?.close || 0) * (o.open_interest || 0) * 100;
                const type = o.details?.contract_type;
                if (type === 'call') netPremium += premium;
                else if (type === 'put') netPremium -= premium;
            });
        } catch { /* ignore */ }
        structureData._netPremium = netPremium !== 0 ? netPremium : null;

        // [V4.1] Technical indicators (return3D, sma20, rsi14, relVol)
        structureData._return3D = techIndicators.return3D;
        structureData._sma20 = techIndicators.sma20;
        structureData._rsi14 = techIndicators.rsi14;
        structureData._relVol = techIndicators.relVol;

        // [V4.1] IV Skew from rawChain (Put IV / Call IV at ATM)
        structureData._ivSkew = calculateIvSkew(tickerRawChain, structureData.underlyingPrice);

        return structureData;
    };

    return attemptFetch();
}

// Determine current market status
function getMarketStatus(): 'PRE' | 'OPEN' | 'AFTER' | 'CLOSED' {
    const now = new Date();
    const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = nyTime.getHours();
    const minute = nyTime.getMinutes();
    const day = nyTime.getDay();

    // Weekend
    if (day === 0 || day === 6) return 'CLOSED';

    const timeInMinutes = hour * 60 + minute;

    // Pre-market: 4:00 AM - 9:30 AM
    if (timeInMinutes >= 240 && timeInMinutes < 570) return 'PRE';
    // Regular: 9:30 AM - 4:00 PM
    if (timeInMinutes >= 570 && timeInMinutes < 960) return 'OPEN';
    // After-hours: 4:00 PM - 8:00 PM
    if (timeInMinutes >= 960 && timeInMinutes < 1200) return 'AFTER';

    return 'CLOSED';
}
