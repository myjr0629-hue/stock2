import { NextRequest, NextResponse } from 'next/server';
import { calculateAlphaScore, calculateWhaleIndex, type AlphaSession } from '@/services/alphaEngine';
import { getStructureData } from '@/services/structureService';
import { fetchRealtimeMetrics } from '@/services/realtimeMetricsService';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getAnalysisCacheForTickers, type AnalysisCacheEntry } from '@/services/analysisCache';
import { fetchMassive } from '@/services/massiveClient';

// [V4.1] Polygon API for technical indicators (return3D, sma20, rsi14, relVol)
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const POLYGON_BASE = 'https://api.polygon.io';

// [V4.1] Fetch daily bars and compute return3D, sma20, rsi14, relVol in one call
async function fetchTechnicalIndicators(ticker: string): Promise<{
    return3D: number | null;
    sma20: number | null;
    rsi14: number | null;
    relVol: number | null;
}> {
    try {
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 45 * 86400000).toISOString().split('T')[0]; // 45 calendar days for 20+ trading days
        const url = `${POLYGON_BASE}/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url, { next: { revalidate: 300 } }); // cache 5min
        if (!res.ok) return { return3D: null, sma20: null, rsi14: null, relVol: null };

        const data = await res.json();
        const bars = data.results || [];
        if (bars.length < 4) return { return3D: null, sma20: null, rsi14: null, relVol: null };

        const closes: number[] = bars.map((b: any) => b.c);
        const volumes: number[] = bars.map((b: any) => b.v);

        // return3D: 3-trading-day return
        let return3D: number | null = null;
        if (closes.length >= 4) {
            const recent = closes.slice(-4);
            return3D = parseFloat((((recent[3] - recent[0]) / recent[0]) * 100).toFixed(2));
        }

        // sma20: 20-day simple moving average
        let sma20: number | null = null;
        if (closes.length >= 20) {
            const last20 = closes.slice(-20);
            sma20 = parseFloat((last20.reduce((a, b) => a + b, 0) / 20).toFixed(2));
        }

        // rsi14: 14-period RSI (Wilder's smoothing)
        let rsi14: number | null = null;
        if (closes.length >= 15) {
            const changes = closes.slice(1).map((c, i) => c - closes[i]);
            let avgGain = 0, avgLoss = 0;
            for (let i = 0; i < 14; i++) {
                if (changes[i] > 0) avgGain += changes[i];
                else avgLoss += Math.abs(changes[i]);
            }
            avgGain /= 14;
            avgLoss /= 14;
            // Wilder's smoothing for remaining periods
            for (let i = 14; i < changes.length; i++) {
                if (changes[i] > 0) {
                    avgGain = (avgGain * 13 + changes[i]) / 14;
                    avgLoss = (avgLoss * 13) / 14;
                } else {
                    avgGain = (avgGain * 13) / 14;
                    avgLoss = (avgLoss * 13 + Math.abs(changes[i])) / 14;
                }
            }
            const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
            rsi14 = parseFloat((100 - 100 / (1 + rs)).toFixed(1));
        }

        // relVol: current day volume / 20-day average volume
        let relVol: number | null = null;
        if (volumes.length >= 21) {
            const todayVol = volumes[volumes.length - 1];
            const avg20Vol = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
            relVol = avg20Vol > 0 ? parseFloat((todayVol / avg20Vol).toFixed(2)) : null;
        }

        return { return3D, sma20, rsi14, relVol };
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

// [PERFORMANCE] Server-side Auto Cache Warming
// Instead of SWR (stale-while-revalidate) which causes cold-start delays after 5min expiry,
// the server proactively refreshes the cache every WARM_INTERVAL_MS.
// Users ALWAYS get cached data instantly; cache never "expires".
interface CacheEntry {
    data: any;
    timestamp: number;
    isRevalidating?: boolean;
}
const CACHE_VERSION = 'v4'; // Bumped: v3→v4 (Redis hybrid cache)
const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 120_000; // 120 seconds — data considered "fresh" (warmer runs every 90s)
const WARM_INTERVAL_MS = 90_000; // 90 seconds — auto-refresh interval for default tickers
const REDIS_TTL_SECONDS = 180; // Redis TTL: 180s (slightly longer than in-memory)
const REDIS_PREFIX = 'dashboard:unified:'; // Redis key prefix

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
            if (age < REDIS_TTL_SECONDS * 1000) {
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
        await setInCache(redisKey(cacheKey), { data, timestamp }, REDIS_TTL_SECONDS);
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
        // Determine base URL for internal API calls
        const port = process.env.PORT || '3000';
        const baseUrl = `http://localhost:${port}`;

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

        const response = buildResponseFromResults(tickerResults, marketData);
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
function buildResponseFromResults(
    tickerResults: { ticker: string; data: any; error: string | null }[],
    marketData: any
) {
    const tickersData: Record<string, any> = {};
    const signals: any[] = [];

    tickerResults.forEach(({ ticker, data, error }) => {
        if (data) {
            tickersData[ticker] = {
                underlyingPrice: data.underlyingPrice,
                changePercent: data.changePercent,
                prevClose: data.prevClose,
                // [INTRADAY FIX] Today's regular session close
                regularCloseToday: data.regularCloseToday || null,
                // [INTRADAY FIX] Intraday-only change (regularCloseToday vs prevClose)
                intradayChangePct: data.intradayChangePct || data.prevChangePct || null,
                // [FIX] Command-style price display data
                display: data.display || null,
                prevChangePct: data.prevChangePct ?? null,
                prevRegularClose: data.prevRegularClose ?? null,
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
                const whaleIndex = calculateWhaleIndex(data.netGex);
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
            cacheTTL: CACHE_TTL_MS / 1000
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
            if (dp && dp.close > 0) {
                // Convert DynamoDB format to Polygon snapshot format
                priceMap[ticker] = {
                    lastTrade: { p: dp.close },
                    day: { c: dp.close, o: dp.open, h: dp.high, l: dp.low, v: dp.volume, vw: dp.vwap },
                    prevDay: { c: dp.close }, // approximation
                    todaysChangePerc: dp.changePct || 0,
                };
            } else {
                missingFromDynamo.push(ticker);
            }
        }

        // Polygon fallback only for DynamoDB misses
        if (missingFromDynamo.length > 0) {
            const polygonResults = await Promise.all(
                missingFromDynamo.map(async (ticker) => {
                    try {
                        const snapRes = await fetchMassive(
                            `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`,
                            {}, false, undefined, { cache: 'no-store' as RequestCache }
                        );
                        return { ticker, snapshot: snapRes?.ticker || null };
                    } catch {
                        return { ticker, snapshot: null };
                    }
                })
            );
            polygonResults.forEach(({ ticker, snapshot }) => {
                if (snapshot) priceMap[ticker] = snapshot;
            });
        }

        console.log(`[Dashboard] Price: DynamoDB ${tickersToFetch.length - missingFromDynamo.length}/${tickersToFetch.length}, Polygon fallback ${missingFromDynamo.length}`);
    } catch {
        // DynamoDB failed — fall back entirely to Polygon
        const priceResults = await Promise.all(
            tickers.filter(t => analysisCacheMap[t]).map(async (ticker) => {
                try {
                    const snapRes = await fetchMassive(
                        `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`,
                        {}, false, undefined, { cache: 'no-store' as RequestCache }
                    );
                    return { ticker, snapshot: snapRes?.ticker || null };
                } catch {
                    return { ticker, snapshot: null };
                }
            })
        );
        priceResults.forEach(({ ticker, snapshot }) => {
            if (snapshot) priceMap[ticker] = snapshot;
        });
    }

    for (const ticker of tickers) {
        const ac = analysisCacheMap[ticker];
        if (!ac) continue;

        // Merge live price from snapshot with cached analysis data
        const snap = priceMap[ticker];
        const livePrice = snap?.lastTrade?.p || snap?.min?.c || snap?.day?.c || 0;
        const prevClose = snap?.prevDay?.c || 0;
        const dayClose = snap?.day?.c || prevClose;
        const todaysChangePerc = snap?.todaysChangePerc || 0;
        const price = livePrice || dayClose || prevClose;

        // Session detection (same as getMarketStatus)
        const currentSession = marketData?.marketStatus || 'CLOSED';
        const sessionMap: Record<string, string> = { 'PRE': 'PRE', 'OPEN': 'REG', 'AFTER': 'POST', 'CLOSED': 'CLOSED' };
        const session = sessionMap[currentSession] || 'CLOSED';

        // Calculate changePct from live data
        let changePercent = 0;
        if (session === 'REG') {
            changePercent = todaysChangePerc || (prevClose > 0 && price > 0 ? ((price - prevClose) / prevClose) * 100 : 0);
        } else {
            changePercent = (dayClose > 0 && prevClose > 0 && dayClose !== prevClose) ? ((dayClose - prevClose) / prevClose) * 100 : 0;
        }

        // Squeeze risk label from score
        const sqScore = ac.squeezeScore ?? 0;
        const squeezeRisk = sqScore >= 70 ? 'EXTREME' : sqScore >= 50 ? 'HIGH' : sqScore >= 30 ? 'MEDIUM' : 'LOW';

        // Build extended session data from snapshot
        let extended: any = null;
        if (snap) {
            const afterHoursPrice = snap.afterHours?.p || 0;
            const preMarketPrice = snap.preMarket?.p || 0;
            extended = {
                postPrice: afterHoursPrice > 0 ? afterHoursPrice : undefined,
                postChangePct: afterHoursPrice > 0 && dayClose > 0 ? ((afterHoursPrice - dayClose) / dayClose) * 100 : undefined,
                prePrice: preMarketPrice > 0 ? preMarketPrice : undefined,
                preChangePct: preMarketPrice > 0 && prevClose > 0 ? ((preMarketPrice - prevClose) / prevClose) * 100 : undefined,
            };
        }

        // Build display object (Command-style)
        const displayPrice = session === 'REG' ? price : dayClose || prevClose;
        const display = { price: displayPrice, changePctPct: changePercent };

        tickersData[ticker] = {
            underlyingPrice: price,
            changePercent,
            prevClose,
            regularCloseToday: dayClose || null,
            intradayChangePct: changePercent,
            display,
            prevChangePct: changePercent,
            prevRegularClose: prevClose,
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
            vwap: null, // VWAP price needs live data, vwapDist is distance only
            darkPoolPct: null,       // Not in analysis cache (comes from realtimeMetrics)
            shortVolPct: null,       // Not in analysis cache
            zeroDtePct: null,        // Not in analysis cache
            impliedMovePct: null,    // Not in analysis cache
            impliedMoveDir: null,
            gammaConcentration: null,
            volumePcr: null,
            volumePcrCallVol: null,
            volumePcrPutVol: null,
            levels: {
                callWall: ac.callWall,
                putFloor: ac.putFloor,
            },
            expiration: null,
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
            cacheTTL: CACHE_TTL_MS / 1000,
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
        // Determine baseUrl from request or fallback to localhost
        let baseUrl: string;
        if (typeof requestOrBaseUrl === 'string') {
            baseUrl = requestOrBaseUrl;
        } else if (requestOrBaseUrl) {
            baseUrl = new URL(requestOrBaseUrl.url).origin;
        } else {
            const port = process.env.PORT || '3000';
            baseUrl = `http://localhost:${port}`;
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

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');
    const tickers = tickersParam
        ? tickersParam.split(',').slice(0, 10) // Max 10 tickers
        : DEFAULT_TICKERS;

    const cacheKey = `${CACHE_VERSION}:${tickers.sort().join(',')}`;
    const cached = cache.get(cacheKey);
    const now = Date.now();
    const baseUrl = new URL(request.url).origin;

    // [WARM] Fresh cache — return immediately
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
        return NextResponse.json({
            ...cached.data,
            _cached: true,
            _cacheAge: Math.round((now - cached.timestamp) / 1000),
            _status: 'fresh'
        });
    }

    // [WARM] Stale in-memory cache exists — return immediately, trigger background refresh
    if (cached) {
        // Non-blocking background revalidation
        revalidateCache(cacheKey, tickers, baseUrl);

        return NextResponse.json({
            ...cached.data,
            _cached: true,
            _cacheAge: Math.round((now - cached.timestamp) / 1000),
            _status: 'warming'
        });
    }

    // [REDIS FALLBACK] In-memory miss — check Redis (shared across Vercel instances)
    const redisCached = await getFromRedisCache(cacheKey);
    if (redisCached) {
        // Hydrate in-memory cache from Redis
        cache.set(cacheKey, { data: redisCached.data, timestamp: redisCached.timestamp });
        console.log(`[CACHE] ✅ Redis hit for ${cacheKey} (age: ${Math.round((now - redisCached.timestamp) / 1000)}s)`);

        // Non-blocking background revalidation to keep data fresh
        revalidateCache(cacheKey, tickers, baseUrl);

        return NextResponse.json({
            ...redisCached.data,
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
                const missingResponse = buildResponseFromResults(missingResults, marketData);
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

        const response = buildResponseFromResults(tickerResults, marketData);

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
        // [PERF] Direct Import: structure + realtime-metrics called directly (no HTTP loopback)
        // Only ticker API still uses HTTP (monolithic 700-line route with Redis caching)
        const [structureData, tickerRes, metrics, techIndicators] = await Promise.all([
            getStructureData(ticker),
            fetch(`${baseUrl}/api/live/ticker?t=${ticker}`),
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
        let tickerRawChain: any[] = [];
        if (tickerRes.ok) {
            const tickerData = await tickerRes.json();
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
            console.log(`[Dashboard PCR Debug] ${ticker}: volumePcr=${structureData.volumePcr}, callVol=${structureData.volumePcrCallVol}, putVol=${structureData.volumePcrPutVol}, tickerFlowKeys=${Object.keys(tickerData.flow || {}).join(',')}`);
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
