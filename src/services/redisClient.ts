// [V45.8] Upstash Redis Client for Persistent Caching
// Used for VIX Last Known Good pattern and other caching needs
// Supports both Vercel KV (KV_REST_API_*) and Upstash (UPSTASH_REDIS_REST_*) naming

import { Redis } from '@upstash/redis';

// Lazy initialization - only create client when needed
let redisClient: Redis | null = null;
let lastInitAttempt = 0;
let lastError: string | null = null;
const RETRY_INTERVAL_MS = 30_000; // Retry Redis init every 30s after failure

/** Get Redis connection status for debugging */
export function getRedisStatus() {
    return {
        connected: redisClient !== null,
        lastError,
        hasUrl: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
        hasToken: !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
        urlPrefix: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').substring(0, 30),
    };
}

/**
 * Get Redis client instance (lazy initialization)
 * Supports both Vercel KV and Upstash environment variable names
 * Retries after failure instead of giving up permanently
 */
export async function getRedisClient(): Promise<Redis | null> {
    // Return existing client
    if (redisClient) {
        return redisClient;
    }

    // Rate-limit retry attempts (wait 30s before retrying after failure)
    const now = Date.now();
    if (lastInitAttempt > 0 && now - lastInitAttempt < RETRY_INTERVAL_MS) {
        return null;
    }
    lastInitAttempt = now;

    // Check for required environment variables (Upstash direct FIRST, then legacy Vercel KV)
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
        console.warn('[Redis] KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN not configured');
        return null;
    }

    try {
        redisClient = new Redis({ url, token });
        console.log('[Redis] Client initialized successfully');
        lastInitAttempt = 0; // Reset on success
        return redisClient;
    } catch (e) {
        lastError = `init: ${e instanceof Error ? e.message : String(e)}`;
        console.error('[Redis] Failed to initialize client:', lastError);
        redisClient = null;
        return null;
    }
}

// Cache keys
export const CACHE_KEYS = {
    VIX_LAST_KNOWN_GOOD: 'vix:last_known_good',
    VIX_LAST_UPDATE: 'vix:last_update'
};

/**
 * Get cached value from Redis
 */
export async function getFromCache<T>(key: string): Promise<T | null> {
    const redis = await getRedisClient();
    if (!redis) return null;

    try {
        const value = await redis.get<T>(key);
        return value;
    } catch (e) {
        console.warn(`[Redis] Failed to get ${key}:`, e);
        return null;
    }
}

/**
 * Set value in Redis cache with optional TTL (seconds)
 */
export async function setInCache<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    const redis = await getRedisClient();
    if (!redis) return false;

    try {
        if (ttlSeconds) {
            await redis.setex(key, ttlSeconds, value);
        } else {
            await redis.set(key, value);
        }
        return true;
    } catch (e) {
        lastError = `set(${key}): ${e instanceof Error ? e.message : String(e)}`;
        console.warn(`[Redis] Failed to set ${key}:`, lastError);
        return false;
    }
}
