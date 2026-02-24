import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

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

// Internal Fetcher with Timeout Safety
async function fetchInternalSafe(url: string, timeoutMs = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        clearTimeout(id);
        console.warn(`[Command Unified] Internal fetch failed or timed out: ${url}`, e);
        return null;
    }
}

// Core Aggregation Function
async function buildUnifiedData(ticker: string, baseUrl: string, locale: string) {
    const start = Date.now();

    // 11 Parallel Internal Fetches (Zero code duplication, 100% logic identical)
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
        fetchInternalSafe(`${baseUrl}/api/live/options/structure?t=${ticker}`),
        fetchInternalSafe(`${baseUrl}/api/live/options/atm?t=${ticker}`),
        fetchInternalSafe(`${baseUrl}/api/live/earnings?t=${ticker}`),
        fetchInternalSafe(`${baseUrl}/api/live/sma?t=${ticker}`),
        fetchInternalSafe(`${baseUrl}/api/live/related?t=${ticker}`),
        fetchInternalSafe(`${baseUrl}/api/live/analyst?t=${ticker}`),
        fetchInternalSafe(`${baseUrl}/api/live/volatility-regime?t=${ticker}`),
        fetchInternalSafe(`${baseUrl}/api/live/short-squeeze?t=${ticker}`),
        fetchInternalSafe(`${baseUrl}/api/flow/realtime-metrics?ticker=${ticker}`),
        fetchInternalSafe(`${baseUrl}/api/live/fundamentals?t=${ticker}`),
        fetchInternalSafe(`${baseUrl}/api/live/overview?t=${ticker}&lang=${locale}`)
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

    console.log(`[Command Unified] Built aggregation for ${ticker} in ${Date.now() - start}ms`);
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
