/**
 * [V8] Redis SWR (Stale-While-Revalidate) Cache Utility
 * 
 * Wraps any async data fetcher with Redis caching.
 * Returns stale data immediately while refreshing in background.
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
): Promise<{ data: T; _cache: 'hit' | 'miss'; _ageMs?: number }> {
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

            // Stale data — return stale + revalidate in background (fire-and-forget)
            revalidateInBackground(cacheKey, fetcher, options.ttlSeconds).catch(() => {});
            return { data: cached.data, _cache: 'hit', _ageMs: age };
        }
    } catch {
        // Redis error — fall through to fetcher
    }

    // 2. Cache miss — fetch fresh data
    const data = await fetcher();

    // 3. Store in Redis (fire-and-forget)
    try {
        await setInCache(cacheKey, { data, timestamp: Date.now() }, options.ttlSeconds * 2); // TTL = 2x for stale window
    } catch {}

    return { data, _cache: 'miss' };
}

async function revalidateInBackground<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number
) {
    try {
        const freshData = await fetcher();
        await setInCache(cacheKey, { data: freshData, timestamp: Date.now() }, ttlSeconds * 2);
    } catch (e) {
        console.warn(`[SWR] Background revalidation failed for ${cacheKey}:`, e);
    }
}
