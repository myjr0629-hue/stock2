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
const CACHE_TTL_SEC = 300; // 5 minutes solid cache (Redis TTL)
const REFRESH_THRESHOLD_MS = 120 * 1000; // [OPTIMIZED] 2 minutes (was 1 min — reduces unnecessary background refreshes)

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
            await setInCache(cacheKey, newData, CACHE_TTL_SEC);
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

    try {
        // 1. Try Cache First (0ms response)
        const cachedData = await getFromCache<any>(cacheKey);

        if (cachedData && cachedData.timestamp && (cachedData.structure || cachedData.options)) {
            const ageMs = Date.now() - cachedData.timestamp;

            // Stale-While-Revalidate (SWR): If older than threshold, refetch in background
            if (ageMs > REFRESH_THRESHOLD_MS) {
                const baseUrl = getBaseUrl(request);
                // Fire and forget background refresh
                triggerBackgroundRefresh(ticker, cacheKey, baseUrl, locale);
            }

            // Immediately return cache
            return NextResponse.json({ ...cachedData, _source: 'cache', _ageMs: ageMs });
        }

        // 2. [AWS Phase 2] DynamoDB First Read — Lambda populates 300 tickers every 5 min
        // Much faster than Polygon (~10ms vs 3s) and covers 300 tickers
        try {
            const { getTickerSnapshot, isDataFresh } = await import('@/lib/aws/dynamoDataProvider');
            const dynamoSnapshot = await getTickerSnapshot(ticker);
            
            if (dynamoSnapshot.price && isDataFresh(dynamoSnapshot.price.date)) {
                const gexHistory = await fetchGexHistoryData(ticker);
                const gex = dynamoSnapshot.gex;
                const flow = dynamoSnapshot.flow;
                const priceData = dynamoSnapshot.price as any;
                
                // Build SMA card from DynamoDB (Lambda v5 stores sma50/sma200 in alpha-history)
                let smaCard = null;
                if (priceData.sma50 && priceData.sma200) {
                    const dist = ((priceData.sma50 - priceData.sma200) / priceData.sma200) * 100;
                    smaCard = {
                        ticker, cross: priceData.cross || 'NONE',
                        crossType: priceData.crossType || '',
                        sma50: priceData.sma50, sma200: priceData.sma200,
                        distance: Math.round(dist * 100) / 100,
                        isImminent: Math.abs(dist) < 0.5,
                        phase: priceData.cross === 'GOLDEN' ? (dist > 5 ? 'ACCELERATION' : 'MARKUP') : priceData.cross === 'DEAD' ? (dist < -5 ? 'DECLINE' : 'DISTRIBUTION') : 'NEUTRAL',
                        label: priceData.cross === 'GOLDEN' ? '상승 추세' : priceData.cross === 'DEAD' ? '하락 추세' : '수렴 중',
                    };
                }

                // Build Analyst card from DynamoDB (Lambda v5 stores in signum-pattern-db)
                let analystCard = null;
                if (dynamoSnapshot.analyst) {
                    const a = dynamoSnapshot.analyst;
                    analystCard = {
                        ticker, consensus: a.consensus || 'N/A',
                        totalAnalysts: a.totalAnalysts || 0,
                        bullishPct: a.bullishPct || 0,
                        breakdown: a.breakdown || {},
                        period: a.period || null,
                        priceTarget: null,
                    };
                }

                // Build Earnings card from DynamoDB
                let earningsCard = null;
                if (dynamoSnapshot.earnings) {
                    const e = dynamoSnapshot.earnings;
                    const days = e.daysUntil || 0;
                    earningsCard = {
                        ticker, nextEarningsDate: e.nextDate || null,
                        daysUntilEarnings: days,
                        daysLabel: days < 0 ? `D+${Math.abs(days)}` : days === 0 ? 'today' : `D-${days}`,
                        epsEstimate: e.epsEstimate || null,
                        quarter: e.quarter || null, year: e.year || null,
                        hourLabel: e.hour || '',
                        color: days <= 3 && days >= 0 ? 'text-rose-400' : days <= 7 && days >= 0 ? 'text-amber-400' : 'text-slate-400',
                        hasData: true,
                    };
                }

                // Build Related card from DynamoDB
                let relatedCard = null;
                if (dynamoSnapshot.related?.tickers) {
                    relatedCard = { ticker, relatedTickers: dynamoSnapshot.related.tickers };
                }

                // Build Fundamentals card from DynamoDB
                let fundamentalsCard = null;
                if (dynamoSnapshot.fundamentals) {
                    const f = dynamoSnapshot.fundamentals;
                    fundamentalsCard = {
                        ticker, name: f.name || ticker,
                        marketCap: f.marketCap || null,
                        shareCount: f.shareCount || null,
                        description: f.description || null,
                        sector: f.sector || null,
                    };
                }

                const dynamoData = {
                    structure: gex ? {
                        options_status: 'OK',
                        netGex: gex.gex,
                        maxPain: gex.maxPain,
                        pcRatio: gex.pcr,
                        levels: { callWall: gex.callWall, putFloor: gex.putFloor },
                        gammaFlipLevel: gex.flipLevel,
                        gammaRegime: gex.gammaRegime,
                        totalContracts: gex.totalContracts,
                        totalCallOI: gex.totalCallOI,
                        totalPutOI: gex.totalPutOI,
                        validation: { confidence: 'HIGH', source: 'dynamodb-lambda' },
                    } : null,
                    options: gex ? { pcr: gex.pcr } : null,
                    sma: smaCard,
                    earnings: earningsCard,
                    related: relatedCard,
                    analyst: analystCard,
                    volatility: null,
                    squeeze: null,
                    institutional: flow ? {
                        compositeScore: flow.compositeScore,
                        opi: flow.opi,
                        whaleScore: flow.whaleScore,
                        totalCallOI: flow.totalCallOI,
                        totalPutOI: flow.totalPutOI,
                        pcr: flow.pcr,
                    } : null,
                    fundamentals: fundamentalsCard,
                    overview: null,
                    history: gexHistory,
                    _dynamoPrice: {
                        price: dynamoSnapshot.price.close,
                        open: dynamoSnapshot.price.open,
                        high: dynamoSnapshot.price.high,
                        low: dynamoSnapshot.price.low,
                        volume: dynamoSnapshot.price.volume,
                        vwap: dynamoSnapshot.price.vwap,
                        changePct: dynamoSnapshot.price.changePct,
                    },
                    timestamp: Date.now(),
                };

                // Cache to Redis for subsequent requests
                await setInCache(cacheKey, dynamoData, CACHE_TTL_SEC);
                // Trigger full Polygon refresh in background (overview AI + squeeze only)
                const baseUrl = getBaseUrl(request);
                triggerBackgroundRefresh(ticker, cacheKey, baseUrl, locale);

                console.log(`[Command Unified] ⚡ DynamoDB FULL for ${ticker} (sma:${!!smaCard}|analyst:${!!analystCard}|earn:${!!earningsCard}|fund:${!!fundamentalsCard}|rel:${!!relatedCard})`);
                return NextResponse.json({ ...dynamoData, _source: 'dynamodb', _ageMs: 0 });
            }
        } catch { /* DynamoDB unavailable — continue to analysis cache */ }

        // 3. [AWS Phase 2] Analysis Cache Fallback — warm-analysis covers 96 tickers
        // If command cache missed, check if warm-analysis has pre-computed data
        try {
            const { getAnalysisCache } = await import('@/services/analysisCache');
            const analysisData = await getAnalysisCache(ticker);
            if (analysisData && analysisData.timestamp) {
                const analysisAge = Date.now() - analysisData.timestamp;
                // Use analysis cache if it's less than 10 minutes old
                if (analysisAge < 600_000) {
                    const gexHistory = await fetchGexHistoryData(ticker);
                    // Convert analysis cache format → command unified format
                    const convertedData = {
                        structure: {
                            options_status: analysisData.maxPain || analysisData.gex ? 'OK' : null,
                            netGex: analysisData.gex,
                            maxPain: analysisData.maxPain,
                            pcRatio: analysisData.pcr,
                            levels: { callWall: analysisData.callWall, putFloor: analysisData.putFloor },
                            gammaFlipLevel: analysisData.gammaFlipLevel,
                            squeezeScore: analysisData.squeezeScore,
                            atmIv: analysisData.iv,
                            gexZeroDteRatio: null,
                            validation: { confidence: 'HIGH' },
                        },
                        options: { iv: analysisData.iv, ivSkew: analysisData.ivSkew },
                        sma: null, // SMA not in analysis cache — will load on next full refresh
                        earnings: null,
                        related: null,
                        analyst: null,
                        volatility: null,
                        squeeze: analysisData.squeezeScore != null ? { score: analysisData.squeezeScore } : null,
                        institutional: analysisData.darkPoolPct ? { darkPool: { percent: analysisData.darkPoolPct } } : null,
                        fundamentals: null,
                        overview: null,
                        history: gexHistory,
                        _alpha: analysisData.alphaSnapshot,
                        timestamp: analysisData.timestamp,
                    };
                    // Save to command cache to speed up next request
                    await setInCache(cacheKey, convertedData, CACHE_TTL_SEC);
                    // Trigger full refresh in background for complete data
                    const baseUrl = getBaseUrl(request);
                    triggerBackgroundRefresh(ticker, cacheKey, baseUrl, locale);

                    console.log(`[Command Unified] ⚡ Analysis cache hit for ${ticker} (age: ${Math.round(analysisAge/1000)}s)`);
                    return NextResponse.json({ ...convertedData, _source: 'analysis-cache', _ageMs: analysisAge });
                }
            }
        } catch { /* analysis cache unavailable — continue to full fetch */ }

        // 3. Full Cache Miss: Sync Fetch (only for tickers NOT in warm-analysis universe)
        const baseUrl = getBaseUrl(request);
        const newData = await buildUnifiedData(ticker, baseUrl, locale);

        // Save to Redis (ONLY if it's a valid structure, meaning not all fetches failed due to timeout)
        if (newData.structure || newData.options) {
            await setInCache(cacheKey, newData, CACHE_TTL_SEC);
        }

        return NextResponse.json({ ...newData, _source: 'fresh', _ageMs: 0 });

    } catch (error: any) {
        console.error('[Command Unified] API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch unified data' }, { status: 500 });
    }
}
