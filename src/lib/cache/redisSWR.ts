/**
 * [V8] Redis SWR (Stale-While-Revalidate) Cache Utility
 * 
 * Wraps any async data fetcher with Redis caching.
 * When stale, fetches fresh data SYNCHRONOUSLY to guarantee
 * the result is saved before Vercel kills the serverless function.
 * Falls back to fetcher on cache miss.
 * 
 * Used by all Polygon-calling API routes to minimize API calls
 * and maximize response speed.
 */

import { getFromCache, setInCache } from '@/services/redisClient';

interface SWROptions {
    /** Time in seconds the data is considered fresh */
    ttlSeconds: number;
    /** Key prefix for Redis (e.g., 'swr:live:ticker') */
    keyPrefix: string;
}

/**
 * Generic SWR fetch wrapper for API routes.
 * 
 * @param key - Unique cache key suffix (e.g., ticker name)
 * @param fetcher - Async function that fetches fresh data
 * @param options - SWR configuration
 * @returns { data, source } - data from cache or fetcher
 */
export async function swrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: SWROptions
): Promise<{ data: T; _cache: 'hit' | 'miss' | 'revalidated'; _ageMs?: number }> {
    const cacheKey = `${options.keyPrefix}:${key}`;

    // 1. Try Redis cache first
    try {
        const cached = await getFromCache<{ data: T; timestamp: number }>(cacheKey);
        if (cached && cached.data) {
            const age = Date.now() - (cached.timestamp || 0);
            const isStale = age > options.ttlSeconds * 1000;

            if (!isStale) {
                // Fresh data — return immediately
                return { data: cached.data, _cache: 'hit', _ageMs: age };
            }

            // Stale data — fetch fresh data SYNCHRONOUSLY (not fire-and-forget)
            // This is critical for Vercel serverless: detached promises get killed
            try {
                const freshData = await fetcher();
                // Save fresh data to Redis
                await setInCache(cacheKey, { data: freshData, timestamp: Date.now() }, options.ttlSeconds * 2);
                return { data: freshData, _cache: 'revalidated', _ageMs: 0 };
            } catch {
                // If fresh fetch fails, return stale data as fallback
                return { data: cached.data, _cache: 'hit', _ageMs: age };
            }
        }
    } catch {
        // Redis error — fall through to fetcher
    }

    // 2. Cache miss — fetch fresh data
    const data = await fetcher();

    // 3. Store in Redis
    try {
        await setInCache(cacheKey, { data, timestamp: Date.now() }, options.ttlSeconds * 2); // TTL = 2x for stale window
    } catch {}

    return { data, _cache: 'miss' };
}
