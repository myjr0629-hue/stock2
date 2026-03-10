// ===========================================================================
// Unified Redis Client — ElastiCache (primary) + Upstash (fallback)
// ElastiCache: ioredis TCP connection (requires Vercel Secure Compute)
// Upstash: HTTP REST API (works everywhere, slower)
// ===========================================================================

import { Redis as UpstashRedis } from '@upstash/redis';

// Lazy initialization
let upstashClient: UpstashRedis | null = null;
let ioredisClient: any = null; // ioredis dynamically imported
let useElastiCache = false;
let elastiCacheAttempted = false;
let lastError: string | null = null;

// ElastiCache endpoint from .env.local
const ELASTICACHE_HOST = process.env.ELASTICACHE_ENDPOINT || 'signum-redis.dhzfzt.0001.use1.cache.amazonaws.com';
const ELASTICACHE_PORT = parseInt(process.env.ELASTICACHE_PORT || '6379');

// Cache keys
export const CACHE_KEYS = {
    VIX_LAST_KNOWN_GOOD: 'vix:last_known_good',
    VIX_LAST_UPDATE: 'vix:last_update'
};

/** Get Redis connection status for debugging */
export function getRedisStatus() {
    return {
        backend: useElastiCache ? 'elasticache' : 'upstash',
        connected: useElastiCache ? ioredisClient !== null : upstashClient !== null,
        lastError,
        elastiCacheHost: ELASTICACHE_HOST,
        hasUpstashUrl: !!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL),
    };
}

// ── ElastiCache (ioredis) connection ──
async function getElastiCacheClient(): Promise<any | null> {
    if (ioredisClient) return ioredisClient;
    if (elastiCacheAttempted) return null;
    elastiCacheAttempted = true;

    try {
        const IORedis = (await import('ioredis')).default;
        ioredisClient = new IORedis({
            host: ELASTICACHE_HOST,
            port: ELASTICACHE_PORT,
            connectTimeout: 3000,
            maxRetriesPerRequest: 1,
            retryStrategy: (times: number) => (times > 2 ? null : Math.min(times * 500, 2000)),
            lazyConnect: true,
        });

        await ioredisClient.connect();
        useElastiCache = true;
        console.log(`[Redis] ✅ ElastiCache connected: ${ELASTICACHE_HOST}:${ELASTICACHE_PORT}`);
        return ioredisClient;
    } catch (e: any) {
        lastError = `elasticache: ${e.message}`;
        console.warn(`[Redis] ElastiCache unavailable (${e.message}), falling back to Upstash`);
        ioredisClient = null;
        return null;
    }
}

// ── Upstash (HTTP) connection ──
function getUpstashClient(): UpstashRedis | null {
    if (upstashClient) return upstashClient;

    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
        console.warn('[Redis] Upstash not configured');
        return null;
    }

    try {
        upstashClient = new UpstashRedis({ url, token });
        console.log('[Redis] Upstash client initialized');
        return upstashClient;
    } catch (e: any) {
        lastError = `upstash: ${e.message}`;
        return null;
    }
}

/**
 * Get cached value from Redis
 * Tries ElastiCache first (< 1ms latency), falls back to Upstash (~30ms)
 */
export async function getFromCache<T>(key: string): Promise<T | null> {
    // Try ElastiCache first
    const ec = await getElastiCacheClient();
    if (ec) {
        try {
            const raw = await ec.get(key);
            if (raw) return typeof raw === 'string' ? JSON.parse(raw) : raw;
            return null;
        } catch (e: any) {
            console.warn(`[Redis/EC] get(${key}) failed:`, e.message);
        }
    }

    // Fallback to Upstash
    const upstash = getUpstashClient();
    if (!upstash) return null;

    try {
        return await upstash.get<T>(key);
    } catch (e: any) {
        console.warn(`[Redis/Upstash] get(${key}) failed:`, e.message);
        return null;
    }
}

/**
 * Set value in Redis cache with optional TTL (seconds)
 * Writes to BOTH ElastiCache and Upstash for consistency
 */
export async function setInCache<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    let ecOk = false;
    let upstashOk = false;

    // Write to ElastiCache
    const ec = await getElastiCacheClient();
    if (ec) {
        try {
            const serialized = JSON.stringify(value);
            if (ttlSeconds) {
                await ec.setex(key, ttlSeconds, serialized);
            } else {
                await ec.set(key, serialized);
            }
            ecOk = true;
        } catch (e: any) {
            console.warn(`[Redis/EC] set(${key}) failed:`, e.message);
        }
    }

    // Write to Upstash (always, for fallback consistency)
    const upstash = getUpstashClient();
    if (upstash) {
        try {
            if (ttlSeconds) {
                await upstash.setex(key, ttlSeconds, value);
            } else {
                await upstash.set(key, value);
            }
            upstashOk = true;
        } catch (e: any) {
            lastError = `set(${key}): ${e.message}`;
            console.warn(`[Redis/Upstash] set(${key}) failed:`, e.message);
        }
    }

    return ecOk || upstashOk;
}
