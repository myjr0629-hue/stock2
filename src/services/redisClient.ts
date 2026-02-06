// [V45.8] Upstash Redis Client for Persistent Caching
// Used for VIX Last Known Good pattern and other caching needs
// Supports both Vercel KV (KV_REST_API_*) and Upstash (UPSTASH_REDIS_REST_*) naming

import { Redis } from '@upstash/redis';

// Lazy initialization - only create client when needed
let redisClient: Redis | null = null;
let initError: Error | null = null;

/**
 * Get Redis client instance (lazy initialization)
 * Supports both Vercel KV and Upstash environment variable names
 */
export async function getRedisClient(): Promise<Redis | null> {
    // Return cached error state
    if (initError) {
        console.warn('[Redis] Previous initialization failed, skipping');
        return null;
    }

    // Return existing client
    if (redisClient) {
        return redisClient;
    }

    // Check for required environment variables (Vercel KV or Upstash naming)
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        console.warn('[Redis] KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN not configured');
        return null;
    }

    try {
        redisClient = new Redis({ url, token });
        console.log('[Redis] Client initialized successfully');
        return redisClient;
    } catch (e) {
        initError = e instanceof Error ? e : new Error(String(e));
        console.error('[Redis] Failed to initialize client:', initError.message);
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
        console.warn(`[Redis] Failed to set ${key}:`, e);
        return false;
    }
}
