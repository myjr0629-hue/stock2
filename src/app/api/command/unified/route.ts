import { NextRequest, NextResponse, after } from 'next/server';
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

// [극강] Allow Vercel Pro to run unified aggregation up to 30s (default 10s kills it)
export const maxDuration = 30;

// Configuration
const CACHE_KEY_PREFIX = 'cache:command:unified:';  // Language-independent data
const OVERVIEW_KEY_PREFIX = 'cache:command:overview:'; // Language-specific overview
const CACHE_TTL_MARKET = 1800; // [극강] 30 minutes during market hours (was 5 min)
const CACHE_TTL_OFFHOURS = 259200; // 72 hours off-hours (covers Friday→Monday)
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

// [GAP-FILL] Check if a cached field has usable data (not just an empty shell)
function isFieldUsable(field: string, data: any): boolean {
    if (!data) return false;
    switch (field) {
        case 'analyst': return data.totalAnalysts > 0;
        case 'earnings': return data.hasData !== false && data.nextEarningsDate !== null;
        case 'fundamentals': return !!data.name || !!data.score || !!data.marketCap || !!data.grade;
        case 'related': return (data.relatedTickers?.length > 0) || (data.topRelated?.length > 0) || (data.count > 0);
        case 'sma': return data.sma50 != null || data.sma200 != null || data.cross != null;
        case 'volatility': return data.regimeScore != null && data.regimeScore > 0;
        case 'squeeze': return (data.siPercent != null && data.siPercent > 0) || (data.daysToCover != null && data.daysToCover > 0);
        case 'institutional': return (data.darkPool?.percent != null && data.darkPool.percent > 0) || (data.compositeScore != null && data.compositeScore > 0);
        case 'structure': return data.options_status === 'OK' || data.netGex != null;
        default: return true;
    }
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

// Bypasses Next.js HTTP routing — with 8s per-call timeout (overview needs FMP+Polygon+Translate)
const INTERNAL_CALL_TIMEOUT_MS = 8000;

async function callInternalGet(handler: Function, url: string) {
    try {
        const mockReq = new NextRequest(url);
        const result = await Promise.race([
            handler(mockReq).then(async (res: any) => {
                if (!res || !res.ok) return null;
                return await res.json();
            }),
            new Promise<null>(resolve => setTimeout(() => {
                console.warn(`[Command Unified] ⏱️ Timeout (${INTERNAL_CALL_TIMEOUT_MS}ms): ${url.split('?')[0].split('/').pop()}`);
                resolve(null);
            }, INTERNAL_CALL_TIMEOUT_MS))
        ]);
        return result;
    } catch (e) {
        console.warn(`[Command Unified] Direct functional call failed: ${url}`, e);
        return null;
    }
}

// Core Aggregation Function — fetches Polygon data (language-independent) + overview (language-specific)
async function buildUnifiedData(ticker: string, baseUrl: string, locale: string) {
    const start = Date.now();

    // 11 Parallel Internal Fetches: 10 language-independent + 1 language-specific (overview)
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

    // Separate data (language-independent) from overview (language-specific)
    const now = Date.now();
    // Stamp _ts on volatile fields for age-based staleness detection in gap-fill
    if (squeeze) squeeze._ts = now;
    if (institutional) institutional._ts = now;
    if (volatility) volatility._ts = now;
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
        // overview is NOT stored in data cache — stored separately
        history: gexHistory,
        timestamp: now
    };

    console.log(`[Command Unified] Built aggregation for ${ticker} in ${Date.now() - start}ms execution time`);
    return { data, overview };
}

// Background Revalidator
async function triggerBackgroundRefresh(ticker: string, dataCacheKey: string, overviewCacheKey: string, baseUrl: string, locale: string) {
    console.log(`[Command Unified] Triggering background refresh for ${ticker}`);
    try {
        const { data: newData, overview: newOverview } = await buildUnifiedData(ticker, baseUrl, locale);
        if (newData.structure || newData.options) {
            await setInCache(dataCacheKey, newData, getSmartTTL());
        }
        if (newOverview) {
            await setInCache(overviewCacheKey, newOverview, getSmartTTL());
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

    // [통합] Language-independent data key + language-specific overview key
    const dataCacheKey = `${CACHE_KEY_PREFIX}${ticker}`;              // Polygon data (shared across all languages)
    const overviewCacheKey = `${OVERVIEW_KEY_PREFIX}${ticker}:${locale}`; // Overview (per language)
    const start = Date.now();

    try {
        // ══════════════════════════════════════════════════════════════
        // [극강 Layer 1] IN-MEMORY LRU — 0ms response
        // ══════════════════════════════════════════════════════════════
        const memKey = ticker; // Language-independent (data is shared)
        const memData = memoryGet(memKey);
        if (memData && (memData.structure || memData.options)) {
            const ageMs = Date.now() - (memData.timestamp || 0);
            if (ageMs > REFRESH_THRESHOLD_MS) {
                const baseUrl = getBaseUrl(request);
                after(() => {
                    triggerBackgroundRefresh(ticker, dataCacheKey, overviewCacheKey, baseUrl, locale);
                });
            }
            // Merge with language-specific overview: memory → Redis → API fetch
            let overview = memoryGet(`overview:${ticker}:${locale}`);
            if (!overview) {
                overview = await getFromCache<any>(overviewCacheKey).catch(() => null);
            }
            if (!overview) {
                // Overview not cached yet — fetch from API and cache for next time
                const baseUrl = getBaseUrl(request);
                overview = await callInternalGet(getOverview, `${baseUrl}/api/live/overview?t=${ticker}&lang=${locale}`);
                if (overview) {
                    setInCache(overviewCacheKey, overview, getSmartTTL()).catch(() => {});
                    memorySet(`overview:${ticker}:${locale}`, overview);
                }
            }
            return jsonResponse({ ...memData, overview: overview || null, _source: 'memory-lru', _ageMs: ageMs });
        }

        // ══════════════════════════════════════════════════════════════
        // [극강 Layer 2] Redis Cache — ~5ms response (TTL 30min)
        // ══════════════════════════════════════════════════════════════
        let [cachedData, cachedOverview] = await Promise.all([
            getFromCache<any>(dataCacheKey).catch(() => null),
            getFromCache<any>(overviewCacheKey).catch(() => null),
        ]);

        // Migration fallback: try old key format if new key has no data
        if (!cachedData) {
            const oldKey = `${CACHE_KEY_PREFIX}${ticker}:${locale}`;
            const oldData = await getFromCache<any>(oldKey).catch(() => null);
            if (oldData && oldData.timestamp && (oldData.structure || oldData.options)) {
                cachedData = oldData;
                if (!cachedOverview && oldData.overview) cachedOverview = oldData.overview;
                // Migrate to new key format for next time
                setInCache(dataCacheKey, oldData, getSmartTTL()).catch(() => {});
                if (oldData.overview) setInCache(overviewCacheKey, oldData.overview, getSmartTTL()).catch(() => {});
            }
        }

        if (cachedData && cachedData.timestamp) {
            const ageMs = Date.now() - cachedData.timestamp;

            // Get overview: Redis → API fetch
            let resolvedOverview = cachedOverview;
            if (!resolvedOverview) {
                const baseUrl = getBaseUrl(request);
                resolvedOverview = await callInternalGet(getOverview, `${baseUrl}/api/live/overview?t=${ticker}&lang=${locale}`);
                if (resolvedOverview) {
                    setInCache(overviewCacheKey, resolvedOverview, getSmartTTL()).catch(() => {});
                }
            }
            if (resolvedOverview) memorySet(`overview:${ticker}:${locale}`, resolvedOverview);

            // [GAP-FILL V2] Check for missing, empty-shell, or STALE fields and fill them via sub-APIs
            // CRITICAL FIX: Volatile fields (squeeze, institutional, volatility) must check _ts age,
            // not just existence. Otherwise cached tickers serve 30-min-old stale data while fresh
            // tickers always get live data — making cached tickers paradoxically worse.
            const VOLATILE_FIELDS = new Set(['squeeze', 'institutional', 'volatility']);
            const VOLATILE_STALE_MS = 300_000; // 5 minutes — force refresh volatile fields older than this
            const CORE_FIELDS = ['analyst','fundamentals','earnings','related','sma','squeeze','volatility','structure','institutional'] as const;
            const missingFields = CORE_FIELDS.filter(f => {
                if (!isFieldUsable(f, cachedData[f])) return true;
                // Force refresh volatile fields that are too old
                if (VOLATILE_FIELDS.has(f)) {
                    const fieldTs = cachedData[f]?._ts || cachedData.timestamp || 0;
                    if (Date.now() - fieldTs > VOLATILE_STALE_MS) return true;
                }
                return false;
            });
            
            if (missingFields.length > 0 && missingFields.length <= 7) {
                // Only gap-fill if partially complete (not completely empty)
                const baseUrl = getBaseUrl(request);
                const fieldHandlers: Record<string, [Function, string]> = {
                    'analyst': [getAnalyst, `${baseUrl}/api/live/analyst?t=${ticker}`],
                    'fundamentals': [getFundamentals, `${baseUrl}/api/live/fundamentals?t=${ticker}`],
                    'earnings': [getEarnings, `${baseUrl}/api/live/earnings?t=${ticker}`],
                    'related': [getRelated, `${baseUrl}/api/live/related?t=${ticker}`],
                    'sma': [getSma, `${baseUrl}/api/live/sma?t=${ticker}`],
                    'squeeze': [getSqueeze, `${baseUrl}/api/live/short-squeeze?t=${ticker}`],
                    'volatility': [getVolatility, `${baseUrl}/api/live/volatility-regime?t=${ticker}`],
                    'structure': [getStructure, `${baseUrl}/api/live/options/structure?t=${ticker}`],
                    'institutional': [getInstitutional, `${baseUrl}/api/flow/realtime-metrics?ticker=${ticker}`],
                };
                
                const gapPromises = missingFields.map(f => {
                    const [handler, url] = fieldHandlers[f];
                    return callInternalGet(handler, url);
                });
                
                const gapResults = await Promise.all(gapPromises);
                let filled = 0;
                for (let i = 0; i < missingFields.length; i++) {
                    if (gapResults[i]) {
                        // Stamp _ts on volatile fields for next staleness check
                        if (VOLATILE_FIELDS.has(missingFields[i])) {
                            gapResults[i]._ts = Date.now();
                        }
                        cachedData[missingFields[i]] = gapResults[i];
                        filled++;
                    }
                }
                
                if (filled > 0) {
                    cachedData.timestamp = Date.now();
                    // Update Redis with complete data
                    setInCache(dataCacheKey, cachedData, getSmartTTL()).catch(() => {});
                    console.log(`[Command Unified] Redis GAP-FILL ${ticker}: filled ${missingFields.filter((_,i) => gapResults[i]).join(',')}`);
                }
            }

            // Promote to memory cache for next request (0ms)
            memorySet(memKey, cachedData);

            // SWR: If older than threshold, refetch in background
            if (ageMs > REFRESH_THRESHOLD_MS) {
                const baseUrl = getBaseUrl(request);
                after(() => {
                    triggerBackgroundRefresh(ticker, dataCacheKey, overviewCacheKey, baseUrl, locale);
                });
            }

            return jsonResponse({ ...cachedData, overview: resolvedOverview || null, _source: 'cache', _ageMs: ageMs });
        }

        // ══════════════════════════════════════════════════════════════
        // TIER 1.5: DynamoDB Unified Cache + Sub-API Gap Fill
        // Uses whatever DynamoDB has, fills missing fields via sub-APIs
        // ══════════════════════════════════════════════════════════════
        try {
            const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
            const dynamoUnified = await getUnifiedCache(ticker, locale);
            if (dynamoUnified) {
                const CF = ['structure','analyst','fundamentals','earnings','sma','related','squeeze','volatility','institutional'] as const;
                const fc = CF.filter(f => (dynamoUnified as any)[f]).length;
                
                // Use DynamoDB data as base, fill missing fields with sub-APIs
                const { overview: _dov, _source: _s, _ageMs: _a, ...dynData } = dynamoUnified;
                const bUrl = getBaseUrl(request);
                
                // Identify missing fields and fetch them in parallel
                const gapFills: Promise<any>[] = [];
                const gapNames: string[] = [];
                
                if (!isFieldUsable('analyst', dynData.analyst)) { gapFills.push(callInternalGet(getAnalyst, `${bUrl}/api/live/analyst?t=${ticker}`)); gapNames.push('analyst'); }
                if (!isFieldUsable('fundamentals', dynData.fundamentals)) { gapFills.push(callInternalGet(getFundamentals, `${bUrl}/api/live/fundamentals?t=${ticker}`)); gapNames.push('fundamentals'); }
                if (!isFieldUsable('earnings', dynData.earnings)) { gapFills.push(callInternalGet(getEarnings, `${bUrl}/api/live/earnings?t=${ticker}`)); gapNames.push('earnings'); }
                if (!isFieldUsable('related', dynData.related)) { gapFills.push(callInternalGet(getRelated, `${bUrl}/api/live/related?t=${ticker}`)); gapNames.push('related'); }
                if (!isFieldUsable('sma', dynData.sma)) { gapFills.push(callInternalGet(getSma, `${bUrl}/api/live/sma?t=${ticker}`)); gapNames.push('sma'); }
                if (!isFieldUsable('squeeze', dynData.squeeze)) { gapFills.push(callInternalGet(getSqueeze, `${bUrl}/api/live/short-squeeze?t=${ticker}`)); gapNames.push('squeeze'); }
                if (!isFieldUsable('volatility', dynData.volatility)) { gapFills.push(callInternalGet(getVolatility, `${bUrl}/api/live/volatility-regime?t=${ticker}`)); gapNames.push('volatility'); }
                if (!isFieldUsable('structure', dynData.structure)) { gapFills.push(callInternalGet(getStructure, `${bUrl}/api/live/options/structure?t=${ticker}`)); gapNames.push('structure'); }
                
                // Overview (language-specific)
                let dynOv = await getFromCache<any>(overviewCacheKey).catch(() => null);
                if (!dynOv) {
                    gapFills.push(callInternalGet(getOverview, `${bUrl}/api/live/overview?t=${ticker}&lang=${locale}`));
                    gapNames.push('overview');
                }
                
                // Execute all gap fills in parallel
                const gapResults = await Promise.all(gapFills);
                
                // Merge gap fill results into dynData
                for (let gi = 0; gi < gapNames.length; gi++) {
                    const name = gapNames[gi];
                    const result = gapResults[gi];
                    if (result) {
                        if (name === 'overview') {
                            dynOv = result;
                        } else {
                            (dynData as any)[name] = result;
                        }
                    }
                }
                
                // Cache the completed data
                if (dynOv) {
                    setInCache(overviewCacheKey, dynOv, getSmartTTL()).catch(() => {});
                    memorySet(`overview:${ticker}:${locale}`, dynOv);
                }
                setInCache(dataCacheKey, dynData, getSmartTTL()).catch(() => {});
                memorySet(memKey, dynData);
                
                const finalFc = CF.filter(f => (dynData as any)[f]).length;
                console.log(`[Command Unified] DynamoDB+GapFill ${ticker} ${Date.now() - start}ms (${fc}→${finalFc}/9, filled: ${gapNames.filter((n,i) => gapResults[i] && n !== 'overview').join(',')})`);
                return jsonResponse({ ...dynData, overview: dynOv || null, _source: fc === finalFc ? 'dynamodb-unified' : 'dynamodb-gapfill', _latency: Date.now() - start });
            }
        } catch { /* DynamoDB unavailable, continue to Tier 2 */ }

        // ══════════════════════════════════════════════════════════════
        // TIER 2: PARALLEL RACE — DynamoDB snapshots vs Polygon
        // Start BOTH simultaneously. If DynamoDB has fresh data → return instantly.
        // If DynamoDB fails/empty → Polygon result is already in-flight.
        const baseUrl = getBaseUrl(request);

        // Start Polygon fetch immediately (don't wait for DynamoDB to fail first)
        const polygonPromise = buildUnifiedData(ticker, baseUrl, locale);
        // Also check if overview exists in cache (from another language's Polygon call)
        const existingOverview = cachedOverview || await getFromCache<any>(overviewCacheKey).catch(() => null);

        // Race: Try DynamoDB with 3s hard timeout (DynamoDB can hang on Vercel)
        const dynamoResult = await Promise.race([
            tryDynamoFast(ticker),
            new Promise<null>(resolve => setTimeout(() => {
                console.warn(`[Command Unified] ⏱️ DynamoDB timeout (3s) for ${ticker} — skipping to Polygon`);
                resolve(null);
            }, 3000))
        ]);

        if (dynamoResult) {
            // DynamoDB had fresh data — but it's PARTIAL (no full fundamentals, related, etc.)
            // [극강 FIX] Wait up to 15s for Polygon (unlimited plan, completes in ~5s)
            // Previously 2s → returned incomplete data. Now we ALWAYS get complete data.
            const POLYGON_WAIT_MS = 15000;
            const polygonWithTimeout = Promise.race([
                polygonPromise.then(fullData => ({ fullData, timedOut: false })),
                new Promise<{ fullData: null; timedOut: boolean }>(resolve =>
                    setTimeout(() => resolve({ fullData: null, timedOut: true }), POLYGON_WAIT_MS)
                )
            ]);

            const polygonResult = await polygonWithTimeout;

            if (!polygonResult.timedOut && polygonResult.fullData) {
                const { data: polyData, overview: polyOverview } = polygonResult.fullData;
                if (polyData.structure || polyData.options) {
                    // Polygon completed within 2s — return FULLY MERGED data (best of both)
                    const merged = {
                        ...dynamoResult,
                        volatility: polyData.volatility || dynamoResult.volatility,
                        squeeze: polyData.squeeze || dynamoResult.squeeze,
                        fundamentals: polyData.fundamentals || dynamoResult.fundamentals,
                        related: polyData.related || dynamoResult.related,
                        sma: polyData.sma || dynamoResult.sma,
                        earnings: polyData.earnings || dynamoResult.earnings,
                        analyst: polyData.analyst || dynamoResult.analyst,
                        institutional: polyData.institutional || dynamoResult.institutional,
                        structure: polyData.structure || dynamoResult.structure,
                        options: polyData.options || dynamoResult.options,
                        timestamp: Date.now(),
                    };
                    const mergedOverview = polyOverview || existingOverview || null;
                    await setInCache(dataCacheKey, merged, getSmartTTL());
                    if (mergedOverview) await setInCache(overviewCacheKey, mergedOverview, getSmartTTL());
                    memorySet(memKey, merged);
                    // Persist to DynamoDB for permanent access
                    import('@/lib/aws/unifiedCacheProvider').then(m => m.putUnifiedCache(ticker, locale, merged)).catch(() => {});
                    console.log(`[Command Unified] ⚡ MERGED (DynamoDB+Polygon) for ${ticker} in ${Date.now() - start}ms`);
                    return jsonResponse({ ...merged, overview: mergedOverview, _source: 'merged', _ageMs: 0, _latency: Date.now() - start });
                }
            }

            // [극강 FIX] Polygon timed out (15s — very rare with unlimited plan)
            // Still return DynamoDB partial BUT do NOT cache incomplete data
            // Background Polygon will save complete data for next request
            polygonPromise.then(async ({ data: fullData, overview: fullOverview }) => {
                if (fullData.structure || fullData.options) {
                    const merged = {
                        ...dynamoResult,
                        volatility: fullData.volatility || dynamoResult.volatility,
                        squeeze: fullData.squeeze || dynamoResult.squeeze,
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
                    await setInCache(dataCacheKey, merged, getSmartTTL());
                    if (fullOverview) await setInCache(overviewCacheKey, fullOverview, getSmartTTL());
                    import('@/lib/aws/unifiedCacheProvider').then(m => m.putUnifiedCache(ticker, locale, merged)).catch(() => {});
                }
            }).catch(() => {});

            console.log(`[Command Unified] ⚠️ DynamoDB PARTIAL for ${ticker} in ${Date.now() - start}ms (Polygon 15s timeout — bg merge)`);
            memorySet(memKey, dynamoResult);
            return jsonResponse({ ...dynamoResult, overview: existingOverview || null, _source: 'dynamodb-partial', _ageMs: 0, _latency: Date.now() - start });
        }

        // DynamoDB had nothing — await Polygon (which was already started in parallel)
        const { data: newData, overview: newOverview } = await polygonPromise;

        if (newData.structure || newData.options) {
            await setInCache(dataCacheKey, newData, getSmartTTL());
            if (newOverview) await setInCache(overviewCacheKey, newOverview, getSmartTTL());
            memorySet(memKey, newData);
            // Persist to DynamoDB for permanent access
            import('@/lib/aws/unifiedCacheProvider').then(m => m.putUnifiedCache(ticker, locale, newData)).catch(() => {});
        }

        console.log(`[Command Unified] 🌐 Polygon FRESH for ${ticker} in ${Date.now() - start}ms`);
        return jsonResponse({ ...newData, overview: newOverview || null, _source: 'fresh', _ageMs: 0, _latency: Date.now() - start });

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
            const gex = snap.gex;
            const flow = snap.flow;
            const p = snap.price as any;

            // [핵심 FIX] DynamoDB에 없는 필드(fundamentals, sma, related)를 개별 API로 보충
            // 4초 timeout — DynamoDB 응답(~1s) + supplement(~2-3s) = 전체 ~5s 이내
            const SUPPLEMENT_TIMEOUT = 10000; // 10s — realtime-metrics fetches 50K+ Polygon trades on cold start (4-8s)
            const supplementPromises: Promise<any>[] = [fetchGexHistoryData(ticker)];

            const needFundamentals = !snap.fundamentals?.score;
            const needSma = !p.sma50 || !p.sma200;
            const needRelated = !snap.related?.tickers?.length;

            const baseUrl = process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : `http://localhost:${process.env.PORT || '3000'}`;

            if (needFundamentals) {
                supplementPromises.push(
                    Promise.race([
                        callInternalGet(getFundamentals, `${baseUrl}/api/live/fundamentals?t=${ticker}`),
                        new Promise<null>(r => setTimeout(() => r(null), SUPPLEMENT_TIMEOUT))
                    ])
                );
            }
            if (needSma) {
                supplementPromises.push(
                    Promise.race([
                        callInternalGet(getSma, `${baseUrl}/api/live/sma?t=${ticker}`),
                        new Promise<null>(r => setTimeout(() => r(null), SUPPLEMENT_TIMEOUT))
                    ])
                );
            }
            if (needRelated) {
                supplementPromises.push(
                    Promise.race([
                        callInternalGet(getRelated, `${baseUrl}/api/live/related?t=${ticker}`),
                        new Promise<null>(r => setTimeout(() => r(null), SUPPLEMENT_TIMEOUT))
                    ])
                );
            }
            // [FIX] Always fetch real squeeze & institutional data — DynamoDB has no SI%/darkPool%
            supplementPromises.push(
                Promise.race([
                    callInternalGet(getSqueeze, `${baseUrl}/api/live/short-squeeze?t=${ticker}`),
                    new Promise<null>(r => setTimeout(() => r(null), SUPPLEMENT_TIMEOUT))
                ])
            );
            supplementPromises.push(
                Promise.race([
                    callInternalGet(getInstitutional, `${baseUrl}/api/flow/realtime-metrics?ticker=${ticker}`),
                    new Promise<null>(r => setTimeout(() => r(null), SUPPLEMENT_TIMEOUT))
                ])
            );

            const supplementResults = await Promise.all(supplementPromises);
            const [gexHistory] = supplementResults;
            let supplementIdx = 1;
            const fundResult = needFundamentals ? supplementResults[supplementIdx++] : null;
            const smaResult = needSma ? supplementResults[supplementIdx++] : null;
            const relResult = needRelated ? supplementResults[supplementIdx++] : null;
            const squeezeResult = supplementResults[supplementIdx++];
            const instResult = supplementResults[supplementIdx++];

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

            let relatedCard = snap.related?.tickers ? {
                ticker,
                count: snap.related.tickers.length,
                topRelated: snap.related.tickers.slice(0, 4).map((t: string) => ({ ticker: t, price: 0, change: 0, logo: null })),
                relatedTickers: snap.related.tickers,
                allTickers: snap.related.tickers,
                _source: 'dynamodb-partial',
            } : null;

            let fundamentalsCard = null;
            if (snap.fundamentals) {
                const f = snap.fundamentals;
                fundamentalsCard = {
                    ticker, name: f.name || ticker,
                    marketCap: f.marketCap || null, shareCount: f.shareCount || null,
                    description: f.description || null, sector: f.sector || null,
                    score: f.score ?? null, grade: f.grade ?? null,
                    pe: f.pe ?? null, roe: f.roe ?? null, de: f.de ?? null,
                    revenueGrowth: f.revenueGrowth ?? null, netMargin: f.netMargin ?? null,
                    breakdown: f.breakdown ?? null,
                };
            }

            // [핵심 FIX] DynamoDB에 없는 필드를 supplement API 결과로 보충
            if (!fundamentalsCard && fundResult) {
                fundamentalsCard = fundResult;
            }
            if (!smaCard && smaResult) {
                smaCard = smaResult;
            }
            if (!relatedCard && relResult) {
                relatedCard = relResult;
            }

            // [FIX] Use actual API squeeze data (has siPercent, daysToCover, shortVolPercent, status)
            // Fallback to GEX heuristic only if API didn't return
            let squeezeCard = squeezeResult || null;
            if (squeezeCard) squeezeCard._ts = Date.now();
            if (!squeezeCard) {
                // Fallback: construct minimal squeeze card with UI-required fields
                const snapAny = snap as any;
                const shortVolPct = snapAny.shortVol?.percent || 0;
                squeezeCard = {
                    ticker,
                    siPercent: snapAny.squeeze?.siPercent || 0,
                    daysToCover: snapAny.squeeze?.daysToCover || 0,
                    siChange: 0,
                    shortVolPercent: shortVolPct,
                    riskScore: 0,
                    status: 'LOW',
                    _ts: Date.now(),
                };
            }

            // [FIX] Use actual API institutional data (has darkPool.percent, blockTrade, shortVolume)
            // Fallback to DynamoDB flow data only if API didn't return
            let institutionalCard = instResult || null;
            if (institutionalCard) institutionalCard._ts = Date.now();
            if (!institutionalCard) {
                // Fallback: construct institutional card with UI-required fields
                const snapAny = snap as any;
                const shortVolPct = squeezeCard?.shortVolPercent || 0;
                institutionalCard = {
                    darkPool: { percent: snapAny.darkPool?.percent || 0 },
                    blockTrade: { count: snapAny.darkPool?.blockCount || 0, volume: 0 },
                    shortVolume: { percent: shortVolPct },
                    _ts: Date.now(),
                };
            }

            // Build volatility from GEX regime
            let volatilityCard = null;
            if (gex) {
                volatilityCard = {
                    regime: gex.gammaRegime === 'POSITIVE' ? 'LOW' : gex.gammaRegime === 'NEGATIVE' ? 'HIGH' : 'NORMAL',
                    gammaRegime: gex.gammaRegime,
                    pcr: gex.pcr,
                    _ts: Date.now(),
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
                institutional: institutionalCard,
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
