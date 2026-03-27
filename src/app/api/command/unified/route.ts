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
import { UNIVERSE_500 } from '@/lib/universe';

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
        case 'earnings': return data.hasData !== false && (data.nextEarningsDate !== null || data.earningsDate !== null);
        case 'fundamentals': return !!data.name || !!data.score || !!data.marketCap || !!data.grade;
        case 'related': return (data.relatedTickers?.length > 0) || (data.topRelated?.length > 0) || (data.count > 0);
        case 'sma': return data.sma50 != null || data.sma200 != null || data.cross != null;
        case 'volatility': return data.regime != null || data.regimeScore != null || data.iv != null || data.gex != null;
        case 'squeeze': return (data.siPercent != null && data.siPercent > 0) || (data.shortVolPercent != null && data.shortVolPercent > 0) || (data.daysToCover != null && data.daysToCover > 0);
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

// [REMOVED] buildUnifiedData — replaced by AWS Lambda cold-start (v7.2)
// All Polygon fetches now happen in Lambda, NOT in Vercel.

// [AWS-FIRST] Build structure from DynamoDB GEX data (0.1s vs Polygon 20-27s)
// This replaces the slow options/structure Polygon API call in gap-fill paths
async function getStructureFromDynamoGex(ticker: string): Promise<any | null> {
    try {
        const { getLatestGex } = await import('@/lib/aws/dynamoDataProvider');
        const gex = await Promise.race([
            getLatestGex(ticker),
            new Promise<null>(r => setTimeout(() => r(null), 3000)) // 3s safety timeout
        ]);
        if (!gex || (!gex.gex && !gex.maxPain)) return null;
        return {
            options_status: 'OK',
            ticker,
            netGex: gex.gex,
            maxPain: gex.maxPain,
            pcRatio: gex.pcr,
            levels: { callWall: gex.callWall, putFloor: gex.putFloor },
            gammaFlipLevel: gex.flipLevel,
            gammaRegime: gex.gammaRegime,
            totalContracts: gex.totalContracts || 0,
            totalCallOI: gex.totalCallOI || 0,
            totalPutOI: gex.totalPutOI || 0,
            validation: { confidence: 'HIGH', source: 'dynamodb-gex' },
            _ts: Date.now(),
        };
    } catch {
        return null;
    }
}

// [AWS-FIRST] Build volatility from DynamoDB GEX data (0.1s vs Polygon 27s)
async function getVolatilityFromDynamoGex(ticker: string): Promise<any | null> {
    try {
        const { getLatestGex } = await import('@/lib/aws/dynamoDataProvider');
        const gex = await Promise.race([
            getLatestGex(ticker),
            new Promise<null>(r => setTimeout(() => r(null), 3000))
        ]);
        if (!gex) return null;
        const isShortGamma = gex.gex < 0;
        const flipLevel = gex.flipLevel || 0;
        const spotPrice = gex.price || 0;
        const flipDist = flipLevel > 0 && spotPrice > 0 ? ((spotPrice - flipLevel) / spotPrice) * 100 : 0;
        let regimeScore = 0;
        if (isShortGamma) regimeScore += Math.min(30, Math.abs(gex.gex) / 1000000 * 3);
        if (Math.abs(flipDist) < 1) regimeScore += 15; else if (Math.abs(flipDist) < 3) regimeScore += 10;
        regimeScore = Math.min(100, Math.round(regimeScore));
        const regime = regimeScore >= 75 ? 'ERUPTING' : regimeScore >= 50 ? 'LOADED' : regimeScore >= 25 ? 'COILING' : 'CALM';
        return {
            regime, regimeScore, gammaRegime: gex.gammaRegime,
            gex: Math.round(gex.gex), gexLabel: isShortGamma ? 'SHORT' : 'LONG',
            iv: 0, flipDistance: Math.round(flipDist * 10) / 10, flipLevel,
            isAboveFlip: flipDist > 0, squeezeScore: 0, squeezeRisk: 'LOW',
            gammaConcentration: 0, gammaConcentrationLabel: 'NORMAL',
            pcr: gex.pcr, _ts: Date.now(),
            validation: { source: 'dynamodb-gex' },
        };
    } catch { return null; }
}


// [AWS-FIRST] Background Revalidator — reads from DynamoDB, NOT Polygon.
// warm-command cron is responsible for populating DynamoDB. This just syncs DynamoDB→Redis.
async function triggerBackgroundRefresh(ticker: string, dataCacheKey: string, overviewCacheKey: string, _baseUrl: string, _locale: string) {
    console.log(`[Command Unified] SWR background sync (DynamoDB→Redis) for ${ticker}`);
    try {
        const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
        const dynamoData = await Promise.race([
            getUnifiedCache(ticker, 'en'),
            new Promise<null>(r => setTimeout(() => r(null), 5000)) // 5s timeout
        ]);
        if (dynamoData && typeof dynamoData === 'object') {
            const CORE_FIELDS = ['structure','analyst','fundamentals','earnings','sma','related','squeeze','volatility','institutional'] as const;
            const fieldCount = CORE_FIELDS.filter(f => (dynamoData as any)[f]).length;
            if (fieldCount >= 3) {
                await setInCache(dataCacheKey, dynamoData, getSmartTTL());
                console.log(`[Command Unified] SWR sync complete: ${ticker} (${fieldCount}/9 fields)`);
            }
        }
    } catch (e) {
        console.warn(`[Command Unified] SWR sync failed for ${ticker}:`, e);
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
            // [AWS-FIRST] Enrich volatility IV if memory-cached data has iv=0
            let enrichedMemData = memData;
            if (memData.volatility && memData.volatility.iv === 0) {
                let ivFound = false;
                // Attempt 1: Lambda DynamoDB (unified-cache)
                try {
                    const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
                    const snap = await Promise.race([
                        getUnifiedCache(ticker, locale),
                        new Promise<any>(r => setTimeout(() => r(null), 2000))
                    ]);
                    if (snap?.volatility?.iv && snap.volatility.iv > 0) {
                        enrichedMemData = { ...memData, volatility: { ...snap.volatility, _ts: Date.now() } };
                        memorySet(memKey, enrichedMemData);
                        ivFound = true;
                    }
                } catch { /* DynamoDB unavailable */ }
                // Attempt 2: Live Polygon API (always has IV during/after market)
                if (!ivFound) {
                    try {
                        const baseUrl = getBaseUrl(request);
                        const volRes = await Promise.race([
                            callInternalGet(getVolatility, `${baseUrl}/api/live/volatility-regime?t=${ticker}`),
                            new Promise<any>(r => setTimeout(() => r(null), 3000))
                        ]);
                        if (volRes?.iv && volRes.iv > 0) {
                            enrichedMemData = { ...memData, volatility: { ...volRes, _ts: Date.now() } };
                            memorySet(memKey, enrichedMemData);
                        }
                    } catch { /* Polygon unavailable */ }
                }
            }
            // [FIX] Cross-reference: inject atmIV into structure from volatility
            // Frontend's structureDerived reads structure.atmIV to display IV%
            const finalData = enrichedMemData;
            if (finalData.structure && !finalData.structure.atmIV && finalData.volatility?.iv > 0) {
                finalData.structure = { ...finalData.structure, atmIV: finalData.volatility.iv / 100 };
            }
            return jsonResponse({ ...finalData, overview: overview || null, _source: 'memory-lru', _ageMs: ageMs });
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

            // [QUALITY CHECK] If Redis cache is severely incomplete (5+ missing core fields),
            // try DynamoDB for better data before serving stale Redis cache
            const QC_FIELDS = ['structure','analyst','fundamentals','earnings','sma','related','squeeze','volatility','institutional'] as const;
            const redisFc = QC_FIELDS.filter(f => isFieldUsable(f, cachedData[f])).length;
            if (redisFc <= 4) {
                // Redis cache is too incomplete — check DynamoDB for better data
                try {
                    const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
                    const dynData = await getUnifiedCache(ticker, locale);
                    if (dynData) {
                        const dynamoFc = QC_FIELDS.filter(f => !!(dynData as any)[f]).length;
                        if (dynamoFc > redisFc) {
                            console.log(`[Command Unified] Redis(${redisFc}/9) < DynamoDB(${dynamoFc}/9) for ${ticker} — upgrading cache`);
                            // Merge DynamoDB data into Redis — DynamoDB wins for missing fields
                            for (const f of QC_FIELDS) {
                                if (!isFieldUsable(f, cachedData[f]) && (dynData as any)[f]) {
                                    cachedData[f] = (dynData as any)[f];
                                }
                            }
                            cachedData.timestamp = Date.now();
                            setInCache(dataCacheKey, cachedData, getSmartTTL()).catch(() => {});
                        }
                    }
                } catch { /* DynamoDB unavailable, continue with Redis */ }
            }

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

            // [AWS-FIRST] ALWAYS enrich volatility IV if cached data has iv=0
            if (cachedData.volatility && cachedData.volatility.iv === 0) {
                let ivFound = false;
                // Attempt 1: Lambda DynamoDB
                try {
                    const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
                    const snap = await Promise.race([
                        getUnifiedCache(ticker, locale),
                        new Promise<any>(r => setTimeout(() => r(null), 3000))
                    ]);
                    if (snap?.volatility?.iv && snap.volatility.iv > 0) {
                        cachedData.volatility = { ...snap.volatility, _ts: Date.now() };
                        ivFound = true;
                    }
                } catch { /* DynamoDB unavailable */ }
                // Attempt 2: Live Polygon API
                if (!ivFound) {
                    try {
                        const baseUrl = getBaseUrl(request);
                        const volRes = await Promise.race([
                            callInternalGet(getVolatility, `${baseUrl}/api/live/volatility-regime?t=${ticker}`),
                            new Promise<any>(r => setTimeout(() => r(null), 3000))
                        ]);
                        if (volRes?.iv && volRes.iv > 0) {
                            cachedData.volatility = { ...volRes, _ts: Date.now() };
                        }
                    } catch { /* Polygon unavailable */ }
                }
            }
            
            if (missingFields.length > 0 && missingFields.length <= 7) {

                // [AWS-FIRST] For structure & volatility, use DynamoDB GEX (0.1s) instead of Polygon (20-27s)
                let structureFilled = false;
                let volatilityFilled = false;

                if (missingFields.includes('structure')) {
                    const dynamoStructure = await getStructureFromDynamoGex(ticker);
                    if (dynamoStructure) {
                        cachedData.structure = dynamoStructure;
                        structureFilled = true;
                        console.log(`[Command Unified] ✅ Structure filled from DynamoDB GEX for ${ticker}`);
                    }
                }
                if (missingFields.includes('volatility')) {
                    const dynamoVol = await getVolatilityFromDynamoGex(ticker);
                    if (dynamoVol) {
                        cachedData.volatility = dynamoVol;
                        volatilityFilled = true;
                        console.log(`[Command Unified] ✅ Volatility filled from DynamoDB GEX for ${ticker}`);
                    }
                }

                // Gap-fill remaining fields (excluding DynamoDB-filled ones)
                const remainingFields = missingFields.filter(f =>
                    !(f === 'structure' && structureFilled) &&
                    !(f === 'volatility' && volatilityFilled)
                );
                if (remainingFields.length > 0) {
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
                    
                    const gapPromises = remainingFields.map(f => {
                        const [handler, url] = fieldHandlers[f];
                        return callInternalGet(handler, url);
                    });
                    
                    const gapResults = await Promise.all(gapPromises);
                    for (let i = 0; i < remainingFields.length; i++) {
                        if (gapResults[i]) {
                            if (VOLATILE_FIELDS.has(remainingFields[i])) {
                                gapResults[i]._ts = Date.now();
                            }
                            cachedData[remainingFields[i]] = gapResults[i];
                        }
                    }
                }
                
                const totalFilled = missingFields.filter(f => isFieldUsable(f, cachedData[f])).length;
                if (totalFilled > 0 || structureFilled) {
                    cachedData.timestamp = Date.now();
                    setInCache(dataCacheKey, cachedData, getSmartTTL()).catch(() => {});
                    console.log(`[Command Unified] Redis GAP-FILL ${ticker}: filled ${totalFilled}/${missingFields.length} fields${structureFilled ? ' (structure via DynamoDB)' : ''}`);
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

            // [FIX] Cross-reference: inject atmIV into structure from volatility
            if (cachedData.structure && !cachedData.structure.atmIV && cachedData.volatility?.iv > 0) {
                cachedData.structure = { ...cachedData.structure, atmIV: cachedData.volatility.iv / 100 };
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
                if (!isFieldUsable('volatility', dynData.volatility)) {
                    const dynamoVol = await getVolatilityFromDynamoGex(ticker);
                    if (dynamoVol) {
                        (dynData as any).volatility = dynamoVol;
                        console.log(`[Command Unified] ✅ DynamoDB+GapFill: volatility filled from DynamoDB GEX for ${ticker}`);
                    } else {
                        gapFills.push(callInternalGet(getVolatility, `${bUrl}/api/live/volatility-regime?t=${ticker}`));
                        gapNames.push('volatility');
                    }
                }
                // [AWS-FIRST] Structure: use DynamoDB GEX (0.1s) instead of Polygon (20-27s)
                if (!isFieldUsable('structure', dynData.structure)) {
                    const dynamoStruct = await getStructureFromDynamoGex(ticker);
                    if (dynamoStruct) {
                        (dynData as any).structure = dynamoStruct;
                        console.log(`[Command Unified] ✅ DynamoDB+GapFill: structure filled from DynamoDB GEX for ${ticker}`);
                    } else {
                        gapFills.push(callInternalGet(getStructure, `${bUrl}/api/live/options/structure?t=${ticker}`));
                        gapNames.push('structure');
                    }
                }
                
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
        } catch { /* DynamoDB unavailable, continue to fallback */ }

        // ══════════════════════════════════════════════════════════════
        // TIER 2: ALL CACHES MISSED
        // ══════════════════════════════════════════════════════════════
        const isInUniverse = UNIVERSE_500.includes(ticker);

        if (isInUniverse) {
            // ── Universe ticker: warm-command cron will fill data ──
            // DO NOT call Polygon. Return unavailable. Next cron cycle fills it.
            console.warn(`[Command Unified] ⚠️ ALL CACHES MISS for ${ticker} (UNIVERSE) — returning unavailable`);
            const { setNegativeCache } = await import('@/services/redisClient');
            await setNegativeCache(dataCacheKey, `all-miss:${ticker}`);
            return jsonResponse({
                _source: 'unavailable',
                _cacheStatus: 'miss',
                _asOf: new Date().toISOString(),
                _ageSec: 0,
                _isStale: false,
                _isPartial: true,
                _latency: Date.now() - start,
                _message: `Data for ${ticker} is being prepared. Please retry in 1-3 minutes.`,
                structure: null, options: null, earnings: null, sma: null,
                related: null, analyst: null, volatility: null, squeeze: null,
                institutional: null, fundamentals: null, overview: null, history: null,
                timestamp: Date.now(),
            }, 200);
        }

        // ── Non-universe ticker: AWS Lambda cold-start ──
        // Strategy: Try DynamoDB first (Lambda may have already saved it from a previous request)
        // If not found: fire-and-forget Lambda invoke + return "preparing" immediately
        console.log(`[Command Unified] 🌐 Non-universe cold-start for ${ticker} — AWS Lambda on-demand`);
        try {
            // Step 1: Check if Lambda already saved data from a previous request
            const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
            const existingDynData = await getUnifiedCache(ticker, locale);
            if (existingDynData) {
                const cacheData = (existingDynData as any).data || existingDynData;
                await setInCache(dataCacheKey, cacheData, getSmartTTL());
                memorySet(memKey, cacheData);
                console.log(`[Command Unified] ✅ Cold-start HIT from previous Lambda run for ${ticker}`);
                return jsonResponse({
                    ...cacheData,
                    overview: null,
                    _source: 'dynamodb-cold-start',
                    _asOf: new Date().toISOString(),
                    _ageSec: Math.round((existingDynData._ageMs || 0) / 1000),
                    _isStale: false,
                    _isPartial: false,
                    _latency: Date.now() - start,
                });
            }

            // Step 2: Fire-and-forget Lambda invoke (async — no waiting for result)
            // [DEDUPE] Prevent duplicate Lambda invocations for the same ticker
            // Uses Redis pending marker with 90s TTL — if already dispatched, skip
            const pendingKey = `pending:cold:${ticker}`;
            const alreadyPending = await getFromCache<string>(pendingKey).catch(() => null);
            if (alreadyPending) {
                console.log(`[Command Unified] ⏳ Lambda already dispatched for ${ticker} (${alreadyPending}) — skipping duplicate`);
            } else {
                const { LambdaClient, InvokeCommand } = await import('@aws-sdk/client-lambda');
                const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
                const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
                if (awsAccessKeyId && awsSecretAccessKey) {
                    // Set pending marker BEFORE dispatch to prevent race condition
                    await setInCache(pendingKey, new Date().toISOString(), 90); // 90s TTL
                    const lambdaClient = new LambdaClient({ 
                        region: 'us-east-1',
                        credentials: { accessKeyId: awsAccessKeyId, secretAccessKey: awsSecretAccessKey },
                    });
                    // Event = async fire-and-forget — Lambda runs in background, no timeout risk
                    await lambdaClient.send(new InvokeCommand({
                        FunctionName: 'signum-harvest',
                        InvocationType: 'Event', // ASYNC — returns 202 immediately
                        Payload: JSON.stringify({ onDemandTicker: ticker }),
                    }));
                    console.log(`[Command Unified] 🚀 Lambda async invoke dispatched for ${ticker} — data will be in DynamoDB in ~60s`);
                }
            }
        } catch (e) {
            console.error(`[Command Unified] Lambda cold-start error for ${ticker}:`, e);
        }

        // Cold-start failed — return unavailable
        console.warn(`[Command Unified] ⚠️ Cold-start FAILED for ${ticker} — returning unavailable`);
        return jsonResponse({
            _source: 'unavailable',
            _cacheStatus: 'cold-start-failed',
            _asOf: new Date().toISOString(),
            _ageSec: 0,
            _isStale: false,
            _isPartial: true,
            _latency: Date.now() - start,
            _message: `Data for ${ticker} is temporarily unavailable. Please retry shortly.`,
            structure: null, options: null, earnings: null, sma: null,
            related: null, analyst: null, volatility: null, squeeze: null,
            institutional: null, fundamentals: null, overview: null, history: null,
            timestamp: Date.now(),
        }, 200);

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

            // [AWS-FIRST] NO supplement API calls in request path.
            // DynamoDB data only. Missing fields = null (warm-command fills them).
            const gexHistory = await fetchGexHistoryData(ticker);

            // Build SMA from DynamoDB price data
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

            // Build cards from DynamoDB only
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
                _source: 'dynamodb',
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

            // Squeeze from DynamoDB (no API call)
            const snapAny = snap as any;
            let squeezeCard: any = null;
            if (snapAny.squeeze?.siPercent || snapAny.shortVol?.percent) {
                squeezeCard = {
                    ticker,
                    siPercent: snapAny.squeeze?.siPercent || 0,
                    daysToCover: snapAny.squeeze?.daysToCover || 0,
                    siChange: 0,
                    shortVolPercent: snapAny.shortVol?.percent || 0,
                    riskScore: 0,
                    status: 'LOW',
                    _ts: Date.now(),
                };
            }

            // Institutional from DynamoDB (no API call)
            let institutionalCard: any = null;
            if (snapAny.darkPool?.percent || flow) {
                institutionalCard = {
                    darkPool: { percent: snapAny.darkPool?.percent || 0 },
                    blockTrade: { count: snapAny.darkPool?.blockCount || 0, volume: 0 },
                    shortVolume: { percent: snapAny.shortVol?.percent || 0 },
                    _ts: Date.now(),
                };
            }

            // [AWS-FIRST] Volatility: use Lambda's pre-computed volatility (includes IV)
            // Fall back to GEX-derived calculation only if Lambda volatility is missing
            let volatilityCard = null;
            if (snapAny.volatility && snapAny.volatility.regimeScore !== undefined) {
                // Lambda v7 stores complete volatility with IV, regimeScore, etc.
                volatilityCard = { ...snapAny.volatility, _ts: Date.now() };
            } else if (gex) {
                const isShortGamma = gex.gex < 0;
                const flipLevel = gex.flipLevel || 0;
                const spotPrice = gex.price || p.close || 0;
                const flipDist = flipLevel > 0 && spotPrice > 0 ? ((spotPrice - flipLevel) / spotPrice) * 100 : 0;
                let regimeScore = 0;
                if (isShortGamma) regimeScore += Math.min(30, Math.abs(gex.gex) / 1000000 * 3);
                if (Math.abs(flipDist) < 1) regimeScore += 15; else if (Math.abs(flipDist) < 3) regimeScore += 10;
                regimeScore = Math.min(100, Math.round(regimeScore));
                const regime = regimeScore >= 75 ? 'ERUPTING' : regimeScore >= 50 ? 'LOADED' : regimeScore >= 25 ? 'COILING' : 'CALM';
                volatilityCard = {
                    regime, regimeScore, gammaRegime: gex.gammaRegime,
                    gex: Math.round(gex.gex), gexLabel: isShortGamma ? 'SHORT' : 'LONG',
                    iv: 0, flipDistance: Math.round(flipDist * 10) / 10, flipLevel,
                    isAboveFlip: flipDist > 0, squeezeScore: 0, squeezeRisk: 'LOW',
                    gammaConcentration: 0, gammaConcentrationLabel: 'NORMAL',
                    pcr: gex.pcr, _ts: Date.now(),
                };
            }

            return {
                structure: gex ? {
                    options_status: 'OK', netGex: gex.gex, maxPain: gex.maxPain,
                    pcRatio: gex.pcr, levels: { callWall: gex.callWall, putFloor: gex.putFloor },
                    gammaFlipLevel: gex.flipLevel, gammaRegime: gex.gammaRegime,
                    totalContracts: gex.totalContracts, totalCallOI: gex.totalCallOI, totalPutOI: gex.totalPutOI,
                    atmIV: volatilityCard?.iv ? volatilityCard.iv / 100 : undefined, // Frontend expects 0.xx format
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
                _source: 'dynamodb-snapshot',
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
