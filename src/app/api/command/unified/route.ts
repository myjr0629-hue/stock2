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
const REFRESH_THRESHOLD_MS = 60 * 1000; // 1 minute (trigger background refresh if older)

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
        overview
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
        callInternalGet(getOverview, `${baseUrl}/api/live/overview?t=${ticker}&lang=${locale}`)
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

        // 2. Cache Miss: Sync Fetch (Initial load penalty of ~2-3s for obscure tickers)
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
