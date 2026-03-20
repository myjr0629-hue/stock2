import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

// Import individual route GET handlers directly to bypass HTTP overhead
import { GET as getStructure } from '@/app/api/live/options/structure/route';
import { GET as getAtm } from '@/app/api/live/options/atm/route';
import { GET as getEarnings } from '@/app/api/live/earnings/route';
import { GET as getSma } from '@/app/api/live/sma/route';
import { GET as getRelated } from '@/app/api/live/related/route';
import { GET as getAnalyst } from '@/app/api/live/analyst/route';
import { GET as getVolatility } from '@/app/api/live/volatility-regime/route';
import { GET as getSqueeze } from '@/app/api/live/short-squeeze/route';
import { GET as getInstitutional } from '@/app/api/flow/realtime-metrics/route';
import { GET as getFundamentals } from '@/app/api/live/fundamentals/route';
import { GET as getOverview } from '@/app/api/live/overview/route';

// Configuration
const CACHE_KEY_PREFIX = 'cache:command:unified:';
const CACHE_TTL_MARKET = 1800; // [극강] 30 minutes during market hours (was 5 min)
const CACHE_TTL_OFFHOURS = 43200; // 12 hours during off-hours (data doesn't change)
const REFRESH_THRESHOLD_MS = 300 * 1000; // [극강] 5 minutes — background refresh after 5 min (was 2 min)

// ══════════════════════════════════════════════════════════════
// [극강 Layer 1] IN-MEMORY LRU CACHE — 0ms response
// Survives within the same serverless instance (Vercel keeps warm ~5-15 min)
// Max 200 entries, 60-second TTL (short = always fresh)
// ══════════════════════════════════════════════════════════════
const MEMORY_MAX = 200;
const MEMORY_TTL_MS = 60_000; // 60 seconds
const memoryCache = new Map<string, { data: any; ts: number }>();

function memoryGet(key: string): any | null {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > MEMORY_TTL_MS) {
        memoryCache.delete(key);
        return null;
    }
    return entry.data;
}

function memorySet(key: string, data: any): void {
    // LRU eviction: if at capacity, delete oldest entry
    if (memoryCache.size >= MEMORY_MAX) {
        const oldestKey = memoryCache.keys().next().value;
        if (oldestKey) memoryCache.delete(oldestKey);
    }
    memoryCache.set(key, { data, ts: Date.now() });
}

function isMarketHoursNow(): boolean {
    const now = new Date();
    const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const day = now.getUTCDay();
    return day >= 1 && day <= 5 && utcMin >= 13 * 60 + 30 && utcMin <= 21 * 60;
}

// Smart TTL: short during market, long during off-hours
function getSmartTTL(): number {
    return isMarketHoursNow() ? CACHE_TTL_MARKET : CACHE_TTL_OFFHOURS;
}

// [AWS Phase 2] Fetch DynamoDB GEX history for percentile, flip events, maxpain tracking
async function fetchGexHistoryData(ticker: string): Promise<any> {
    try {
        const { getGexHistory } = await import('@/lib/aws/historyStore');
        const history = await getGexHistory(ticker, 30);
        if (!history || history.length === 0) return null;

        // Calculate GEX percentile (current vs 30-day range)
        const gexValues = history.map((h: any) => h.gex).filter((v: number) => v !== 0);
        const currentGex = gexValues[0] || 0;
        const belowCount = gexValues.filter((v: number) => v < currentGex).length;
        const gexPercentile = gexValues.length > 0 ? Math.round((belowCount / gexValues.length) * 100) : null;

        // Detect Gamma Flip events (flipLevel changes)
        const flipEvents: any[] = [];
        for (let i = 1; i < Math.min(history.length, 30); i++) {
            const curr = history[i - 1];
            const prev = history[i];
            if (curr.flipLevel && prev.flipLevel && Math.abs(curr.flipLevel - prev.flipLevel) > curr.flipLevel * 0.02) {
                flipEvents.push({
                    date: new Date(curr.timestamp).toISOString().slice(0, 10),
                    from: prev.flipLevel,
                    to: curr.flipLevel,
                    direction: curr.flipLevel > prev.flipLevel ? 'UP' : 'DOWN',
                });
            }
        }

        // Max Pain movement tracking (last 5 entries)
        const maxPainHistory = history.slice(0, 5)
            .filter((h: any) => h.maxPain)
            .map((h: any) => ({ date: new Date(h.timestamp).toISOString().slice(0, 10), maxPain: h.maxPain, price: h.price }));

        // GEX regime distribution (30-day)
        const regimeCounts = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
        history.forEach((h: any) => {
            const regime = h.gammaRegime || 'NEUTRAL';
            if (regime in regimeCounts) regimeCounts[regime as keyof typeof regimeCounts]++;
        });

        return {
            gexPercentile,
            gex30dCount: history.length,
            gex30dHigh: Math.max(...gexValues),
            gex30dLow: Math.min(...gexValues),
            flipEvents: flipEvents.slice(0, 5),
            maxPainHistory,
            regimeDistribution: regimeCounts,
        };
    } catch {
        return null;
    }
}

// [극강 Layer 5] JSON response with Vercel CDN edge caching headers
// s-maxage: Vercel CDN caches at edge (서버 함수 호출 자체가 없음)
// stale-while-revalidate: 만료 후에도 즉시 stale 응답 + 백그라운드 갱신
function jsonResponse(data: any, status = 200) {
    const isMarket = isMarketHoursNow();
    return NextResponse.json(data, {
        status,
        headers: {
            'Cache-Control': isMarket
                ? 'public, s-maxage=15, stale-while-revalidate=60, max-age=10'
                : 'public, s-maxage=300, stale-while-revalidate=3600, max-age=60',
        }
    });
}

// Helper to reliably get the localhost URL for internal API calls
function getBaseUrl(request: NextRequest) {
    // Priority 1: Vercel standard URL
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    // Priority 2: Use host from request headers if available
    const host = request.headers.get('host');
    if (host) {
        const protocol = host.includes('localhost') ? 'http' : 'https';
        return `${protocol}://${host}`;
    }
    // Priority 3: Fallback local port
    const port = process.env.PORT || '3000';
    return `http://localhost:${port}`;
}

// Bypasses Next.js HTTP routing entirely by calling the GET handler as a standard async function
async function callInternalGet(handler: Function, url: string) {
    try {
        const mockReq = new NextRequest(url);
        const res = await handler(mockReq);
        if (!res || !res.ok) return null;
        return await res.json();
    } catch (e) {
        console.warn(`[Command Unified] Direct functional call failed: ${url}`, e);
        return null;
    }
}

// Core Aggregation Function
async function buildUnifiedData(ticker: string, baseUrl: string, locale: string) {
    const start = Date.now();

    // 11 Parallel Internal Fetches, executed as pure JS functions running instantly in memory
    const [
        structure,
        optionsAtm,
        earnings,
        sma,
        related,
        analyst,
        volatility,
        squeeze,
        institutional,
        fundamentals,
        overview,
        gexHistory
    ] = await Promise.all([
        callInternalGet(getStructure, `${baseUrl}/api/live/options/structure?t=${ticker}`),
        callInternalGet(getAtm, `${baseUrl}/api/live/options/atm?t=${ticker}`),
        callInternalGet(getEarnings, `${baseUrl}/api/live/earnings?t=${ticker}`),
        callInternalGet(getSma, `${baseUrl}/api/live/sma?t=${ticker}`),
        callInternalGet(getRelated, `${baseUrl}/api/live/related?t=${ticker}`),
        callInternalGet(getAnalyst, `${baseUrl}/api/live/analyst?t=${ticker}`),
        callInternalGet(getVolatility, `${baseUrl}/api/live/volatility-regime?t=${ticker}`),
        callInternalGet(getSqueeze, `${baseUrl}/api/live/short-squeeze?t=${ticker}`),
        callInternalGet(getInstitutional, `${baseUrl}/api/flow/realtime-metrics?ticker=${ticker}`),
        callInternalGet(getFundamentals, `${baseUrl}/api/live/fundamentals?t=${ticker}`),
        callInternalGet(getOverview, `${baseUrl}/api/live/overview?t=${ticker}&lang=${locale}`),
        // [AWS Phase 2] DynamoDB GEX history — non-blocking parallel fetch
        fetchGexHistoryData(ticker),
    ]);

    const data = {
        structure,
        options: optionsAtm,
        earnings,
        sma,
        related,
        analyst,
        volatility,
        squeeze,
        institutional,
        fundamentals,
        overview,
        // [AWS Phase 2] History-based insights from DynamoDB
        history: gexHistory,
        timestamp: Date.now()
    };

    console.log(`[Command Unified] Built aggregation for ${ticker} in ${Date.now() - start}ms execution time`);
    return data;
}

// Background Revalidator
async function triggerBackgroundRefresh(ticker: string, cacheKey: string, baseUrl: string, locale: string) {
    console.log(`[Command Unified] Triggering background refresh for ${ticker}`);
    try {
        const newData = await buildUnifiedData(ticker, baseUrl, locale);
        if (newData.structure || newData.options) {
            await setInCache(cacheKey, newData, getSmartTTL());
        }
        console.log(`[Command Unified] Background refresh complete for ${ticker}`);
    } catch (e) {
        console.error(`[Command Unified] Background refresh failed for ${ticker}`, e);
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('t')?.toUpperCase();
    const locale = searchParams.get('lang') || 'en';

    if (!ticker) {
        return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    const cacheKey = `${CACHE_KEY_PREFIX}${ticker}:${locale}`;
    const start = Date.now();

    try {
        // ══════════════════════════════════════════════════════════════
        // [극강 Layer 1] IN-MEMORY LRU — 0ms response
        // ══════════════════════════════════════════════════════════════
        const memKey = `${ticker}:${locale}`;
        const memData = memoryGet(memKey);
        if (memData && (memData.structure || memData.options)) {
            const ageMs = Date.now() - (memData.timestamp || 0);
            // Background refresh if stale
            if (ageMs > REFRESH_THRESHOLD_MS) {
                const baseUrl = getBaseUrl(request);
                triggerBackgroundRefresh(ticker, cacheKey, baseUrl, locale);
            }
            return jsonResponse({ ...memData, _source: 'memory-lru', _ageMs: ageMs });
        }

        // ══════════════════════════════════════════════════════════════
        // [극강 Layer 2] Redis Cache — ~5ms response (TTL 30min)
        // ══════════════════════════════════════════════════════════════
        const cachedData = await getFromCache<any>(cacheKey);

        if (cachedData && cachedData.timestamp && (cachedData.structure || cachedData.options)) {
            const ageMs = Date.now() - cachedData.timestamp;

            // Promote to memory cache for next request (0ms)
            memorySet(memKey, cachedData);

            // SWR: If older than threshold, refetch in background
            if (ageMs > REFRESH_THRESHOLD_MS) {
                const baseUrl = getBaseUrl(request);
                triggerBackgroundRefresh(ticker, cacheKey, baseUrl, locale);
            }

            return jsonResponse({ ...cachedData, _source: 'cache', _ageMs: ageMs });
        }

        // ══════════════════════════════════════════════════════════════
        // TIER 1.5: DynamoDB Unified Cache — ~50ms (permanent, never expires)
        // Complete unified data stored by warm-command cron
        // ══════════════════════════════════════════════════════════════
        try {
            const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
            const dynamoUnified = await getUnifiedCache(ticker, locale);
            if (dynamoUnified && (dynamoUnified.structure || dynamoUnified.options)) {
                // Re-warm Redis + memory for next request
                setInCache(cacheKey, dynamoUnified, getSmartTTL()).catch(() => {});
                memorySet(memKey, dynamoUnified);
                console.log(`[Command Unified] ⚡ DynamoDB UNIFIED for ${ticker} in ${Date.now() - start}ms`);
                return jsonResponse({ ...dynamoUnified, _source: 'dynamodb-unified', _latency: Date.now() - start });
            }
        } catch { /* DynamoDB unavailable, continue to Tier 2 */ }

        // ══════════════════════════════════════════════════════════════
        // TIER 2: PARALLEL RACE — DynamoDB snapshots vs Polygon
        // Start BOTH simultaneously. If DynamoDB has fresh data → return instantly.
        // If DynamoDB fails/empty → Polygon result is already in-flight.
        const baseUrl = getBaseUrl(request);

        // Start Polygon fetch immediately (don't wait for DynamoDB to fail first)
        const polygonPromise = buildUnifiedData(ticker, baseUrl, locale);

        // Race: Try DynamoDB + Analysis Cache in parallel with Polygon
        const dynamoResult = await tryDynamoFast(ticker);

        if (dynamoResult) {
            // DynamoDB had fresh data — but it's PARTIAL (no full fundamentals, related, etc.)
            // Wait up to 2s for Polygon to complete so we can return FULL merged data
            const POLYGON_WAIT_MS = 2000;
            const polygonWithTimeout = Promise.race([
                polygonPromise.then(fullData => ({ fullData, timedOut: false })),
                new Promise<{ fullData: null; timedOut: boolean }>(resolve =>
                    setTimeout(() => resolve({ fullData: null, timedOut: true }), POLYGON_WAIT_MS)
                )
            ]);

            const polygonResult = await polygonWithTimeout;

            if (!polygonResult.timedOut && polygonResult.fullData && (polygonResult.fullData.structure || polygonResult.fullData.options)) {
                // Polygon completed within 2s — return FULLY MERGED data (best of both)
                const merged = {
                    ...dynamoResult,
                    volatility: polygonResult.fullData.volatility || dynamoResult.volatility,
                    squeeze: polygonResult.fullData.squeeze || dynamoResult.squeeze,
                    overview: polygonResult.fullData.overview || dynamoResult.overview,
                    fundamentals: polygonResult.fullData.fundamentals || dynamoResult.fundamentals,
                    related: polygonResult.fullData.related || dynamoResult.related,
                    sma: polygonResult.fullData.sma || dynamoResult.sma,
                    earnings: polygonResult.fullData.earnings || dynamoResult.earnings,
                    analyst: polygonResult.fullData.analyst || dynamoResult.analyst,
                    institutional: polygonResult.fullData.institutional || dynamoResult.institutional,
                    structure: polygonResult.fullData.structure || dynamoResult.structure,
                    options: polygonResult.fullData.options || dynamoResult.options,
                    timestamp: Date.now(),
                };
                await setInCache(cacheKey, merged, getSmartTTL());
                memorySet(memKey, merged);
                // Persist to DynamoDB for permanent access
                import('@/lib/aws/unifiedCacheProvider').then(m => m.putUnifiedCache(ticker, locale, merged)).catch(() => {});
                console.log(`[Command Unified] ⚡ MERGED (DynamoDB+Polygon) for ${ticker} in ${Date.now() - start}ms`);
                return jsonResponse({ ...merged, _source: 'merged', _ageMs: 0, _latency: Date.now() - start });
            }

            // Polygon timed out — return DynamoDB partial, let Polygon finish in background
            await setInCache(cacheKey, dynamoResult, getSmartTTL());
            polygonPromise.then(async (fullData) => {
                if (fullData.structure || fullData.options) {
                    const merged = {
                        ...dynamoResult,
                        volatility: fullData.volatility || dynamoResult.volatility,
                        squeeze: fullData.squeeze || dynamoResult.squeeze,
                        overview: fullData.overview || dynamoResult.overview,
                        fundamentals: fullData.fundamentals || dynamoResult.fundamentals,
                        related: fullData.related || dynamoResult.related,
                        sma: fullData.sma || dynamoResult.sma,
                        earnings: fullData.earnings || dynamoResult.earnings,
                        analyst: fullData.analyst || dynamoResult.analyst,
                        institutional: fullData.institutional || dynamoResult.institutional,
                        structure: fullData.structure || dynamoResult.structure,
                        options: fullData.options || dynamoResult.options,
                        timestamp: Date.now(),
                    };
                    await setInCache(cacheKey, merged, getSmartTTL());
                    // Persist to DynamoDB for permanent access
                    import('@/lib/aws/unifiedCacheProvider').then(m => m.putUnifiedCache(ticker, locale, merged)).catch(() => {});
                }
            }).catch(() => {});

            console.log(`[Command Unified] ⚡ DynamoDB PARTIAL for ${ticker} in ${Date.now() - start}ms (Polygon timeout, bg merge)`);
            memorySet(memKey, dynamoResult);
            return jsonResponse({ ...dynamoResult, _source: 'dynamodb-partial', _ageMs: 0, _latency: Date.now() - start });
        }

        // DynamoDB had nothing — await Polygon (which was already started in parallel)
        const newData = await polygonPromise;

        if (newData.structure || newData.options) {
            await setInCache(cacheKey, newData, getSmartTTL());
            memorySet(memKey, newData);
            // Persist to DynamoDB for permanent access
            import('@/lib/aws/unifiedCacheProvider').then(m => m.putUnifiedCache(ticker, locale, newData)).catch(() => {});
        }

        console.log(`[Command Unified] 🌐 Polygon FRESH for ${ticker} in ${Date.now() - start}ms`);
        return jsonResponse({ ...newData, _source: 'fresh', _ageMs: 0, _latency: Date.now() - start });

    } catch (error: any) {
        console.error('[Command Unified] API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch unified data' }, { status: 500 });
    }
}

// ══════════════════════════════════════════════════════════════
// FAST DynamoDB + Analysis Cache check (non-blocking)
// Returns unified data if fresh, or null to fall through to Polygon
// ══════════════════════════════════════════════════════════════
async function tryDynamoFast(ticker: string): Promise<any | null> {
    // --- Attempt 1: DynamoDB (Lambda 300 tickers) ---
    try {
        const { getTickerSnapshot, isDataFresh } = await import('@/lib/aws/dynamoDataProvider');
        const snap = await getTickerSnapshot(ticker);

        // [FIX] Accept data if: today's date OR last trading day (weekends/holidays)
        const hasFreshPrice = snap.price && (
            isDataFresh(snap.price.date) ||
            isRecentTradingDay(snap.price.date)
        );

        if (hasFreshPrice) {
            const [gexHistory] = await Promise.all([fetchGexHistoryData(ticker)]);
            const gex = snap.gex;
            const flow = snap.flow;
            const p = snap.price as any;

            // Build SMA
            let smaCard = null;
            if (p.sma50 && p.sma200) {
                const dist = ((p.sma50 - p.sma200) / p.sma200) * 100;
                smaCard = {
                    ticker, cross: p.cross || 'NONE', crossType: p.crossType || '',
                    sma50: p.sma50, sma200: p.sma200,
                    distance: Math.round(dist * 100) / 100,
                    isImminent: Math.abs(dist) < 0.5,
                    phase: p.cross === 'GOLDEN' ? (dist > 5 ? 'ACCELERATION' : 'MARKUP') : p.cross === 'DEAD' ? (dist < -5 ? 'DECLINE' : 'DISTRIBUTION') : 'NEUTRAL',
                    label: p.cross === 'GOLDEN' ? '상승 추세' : p.cross === 'DEAD' ? '하락 추세' : '수렴 중',
                };
            }

            // Build cards from pattern-db
            let analystCard = null;
            if (snap.analyst) {
                const a = snap.analyst;
                analystCard = { ticker, consensus: a.consensus || 'N/A', totalAnalysts: a.totalAnalysts || 0, bullishPct: a.bullishPct || 0, breakdown: a.breakdown || {}, period: a.period || null, priceTarget: null };
            }

            let earningsCard = null;
            if (snap.earnings) {
                const e = snap.earnings;
                const days = e.daysUntil || 0;
                earningsCard = { ticker, nextEarningsDate: e.nextDate || null, daysUntilEarnings: days, daysLabel: days < 0 ? `D+${Math.abs(days)}` : days === 0 ? 'today' : `D-${days}`, epsEstimate: e.epsEstimate || null, quarter: e.quarter || null, year: e.year || null, hourLabel: e.hour || '', color: days <= 3 && days >= 0 ? 'text-rose-400' : days <= 7 && days >= 0 ? 'text-amber-400' : 'text-slate-400', hasData: true };
            }

            let relatedCard = snap.related?.tickers ? { ticker, relatedTickers: snap.related.tickers } : null;

            let fundamentalsCard = null;
            if (snap.fundamentals) {
                const f = snap.fundamentals;
                fundamentalsCard = { ticker, name: f.name || ticker, marketCap: f.marketCap || null, shareCount: f.shareCount || null, description: f.description || null, sector: f.sector || null };
            }

            // Build squeeze from GEX data (squeezeProbability or compute from PCR + regime)
            let squeezeCard = null;
            if (gex) {
                const pcr = gex.pcr || 0;
                const regime = gex.gammaRegime;
                // Squeeze heuristic: high PCR + negative gamma = higher squeeze probability
                let score = 0;
                if (regime === 'NEGATIVE') score += 40;
                if (pcr > 1.5) score += 30;
                else if (pcr > 1.0) score += 15;
                if (flow?.squeezeProbability && flow.squeezeProbability > 0) score = Math.max(score, flow.squeezeProbability);
                if (score > 0) squeezeCard = { score: Math.min(100, score), ticker };
            }

            // Build volatility from GEX regime
            let volatilityCard = null;
            if (gex) {
                volatilityCard = {
                    regime: gex.gammaRegime === 'POSITIVE' ? 'LOW' : gex.gammaRegime === 'NEGATIVE' ? 'HIGH' : 'NORMAL',
                    gammaRegime: gex.gammaRegime,
                    pcr: gex.pcr,
                };
            }

            return {
                structure: gex ? {
                    options_status: 'OK', netGex: gex.gex, maxPain: gex.maxPain,
                    pcRatio: gex.pcr, levels: { callWall: gex.callWall, putFloor: gex.putFloor },
                    gammaFlipLevel: gex.flipLevel, gammaRegime: gex.gammaRegime,
                    totalContracts: gex.totalContracts, totalCallOI: gex.totalCallOI, totalPutOI: gex.totalPutOI,
                    validation: { confidence: 'HIGH', source: 'dynamodb-lambda' },
                } : null,
                options: gex ? { pcr: gex.pcr } : null,
                sma: smaCard, earnings: earningsCard, related: relatedCard,
                analyst: analystCard,
                volatility: volatilityCard,
                squeeze: squeezeCard,
                institutional: flow ? { compositeScore: flow.compositeScore, opi: flow.opi, whaleScore: flow.whaleScore, totalCallOI: flow.totalCallOI, totalPutOI: flow.totalPutOI, pcr: flow.pcr } : null,
                fundamentals: fundamentalsCard,
                overview: null,
                history: gexHistory,
                _dynamoPrice: { price: p.close, open: p.open, high: p.high, low: p.low, volume: p.volume, vwap: p.vwap, changePct: p.changePct },
                timestamp: Date.now(),
            };
        }
    } catch { /* DynamoDB unavailable */ }

    // --- Attempt 2: Analysis Cache (warm-analysis 96 tickers) ---
    try {
        const { getAnalysisCache } = await import('@/services/analysisCache');
        const ad = await getAnalysisCache(ticker);
        if (ad && ad.timestamp && (Date.now() - ad.timestamp) < 600_000) {
            const gexHistory = await fetchGexHistoryData(ticker);
            return {
                structure: { options_status: ad.maxPain || ad.gex ? 'OK' : null, netGex: ad.gex, maxPain: ad.maxPain, pcRatio: ad.pcr, levels: { callWall: ad.callWall, putFloor: ad.putFloor }, gammaFlipLevel: ad.gammaFlipLevel, squeezeScore: ad.squeezeScore, atmIv: ad.iv, validation: { confidence: 'HIGH' } },
                options: { iv: ad.iv, ivSkew: ad.ivSkew },
                sma: null, earnings: null, related: null, analyst: null,
                volatility: null,
                squeeze: ad.squeezeScore != null ? { score: ad.squeezeScore } : null,
                institutional: ad.darkPoolPct ? { darkPool: { percent: ad.darkPoolPct } } : null,
                fundamentals: null, overview: null,
                history: gexHistory, _alpha: ad.alphaSnapshot,
                timestamp: ad.timestamp,
            };
        }
    } catch { /* analysis cache unavailable */ }

    return null; // Fall through to Polygon
}

// [FIX] Check if date is within last 3 trading days (covers weekends + holidays)
function isRecentTradingDay(dateStr: string): boolean {
    if (!dateStr) return false;
    const dataDate = new Date(dateStr + 'T12:00:00-05:00'); // ET noon
    const now = new Date();
    const diffMs = now.getTime() - dataDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    // Accept data up to 3 days old (Friday data valid through Sunday)
    return diffDays >= 0 && diffDays < 3.5;
}
