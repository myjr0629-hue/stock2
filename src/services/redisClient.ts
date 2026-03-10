// ===========================================================================
// Unified Redis Client — ElastiCache via EC2 Proxy (primary) + Upstash (fallback)
// EC2 Proxy: HTTP REST API wrapping ElastiCache (~15ms from Vercel same-region)
// Upstash: HTTP REST API (works everywhere, ~30ms)
// ===========================================================================

import { Redis as UpstashRedis } from '@upstash/redis';

// Lazy initialization
let upstashClient: UpstashRedis | null = null;
let lastError: string | null = null;
let ecProxyAvailable: boolean | null = null; // null = not tested yet

// EC2 Redis Proxy configuration
const EC2_PROXY_URL = process.env.EC2_REDIS_PROXY_URL || 'http://3.236.193.97:8081';
const EC2_PROXY_KEY = process.env.EC2_REDIS_PROXY_KEY || 'signum-redis-proxy-2026';

// Cache keys
export const CACHE_KEYS = {
    VIX_LAST_KNOWN_GOOD: 'vix:last_known_good',
    VIX_LAST_UPDATE: 'vix:last_update'
};

/** Get Redis connection status for debugging */
export function getRedisStatus() {
    return {
        backend: ecProxyAvailable ? 'ec2-proxy' : 'upstash',
        ecProxyUrl: EC2_PROXY_URL,
        ecProxyAvailable,
        lastError,
        hasUpstashUrl: !!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL),
    };
}

// ── EC2 Redis Proxy helpers ──
async function ecProxyGet<T>(key: string): Promise<T | null> {
    try {
        const res = await fetch(`${EC2_PROXY_URL}/get?key=${encodeURIComponent(key)}`, {
            headers: { 'Authorization': `Bearer ${EC2_PROXY_KEY}` },
            signal: AbortSignal.timeout(3000), // 3s timeout
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (ecProxyAvailable === null) {
            ecProxyAvailable = true;
            console.log('[Redis] ✅ EC2 Proxy connected');
        }
        return data.result as T;
    } catch (e: any) {
        if (ecProxyAvailable !== false) {
            ecProxyAvailable = false;
            console.warn(`[Redis] EC2 Proxy unavailable: ${e.message}`);
        }
        return null;
    }
}

async function ecProxySet<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    try {
        const res = await fetch(`${EC2_PROXY_URL}/set`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${EC2_PROXY_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ key, value, ttl: ttlSeconds }),
            signal: AbortSignal.timeout(3000),
        });
        return res.ok;
    } catch {
        return false;
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
 * Tries EC2 Proxy (ElastiCache) first (~15ms), falls back to Upstash (~30ms)
 */
export async function getFromCache<T>(key: string): Promise<T | null> {
    // Try EC2 Proxy first (ElastiCache via HTTP)
    if (ecProxyAvailable !== false) {
        const result = await ecProxyGet<T>(key);
        if (result !== null) return result;
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
 * Writes to BOTH EC2 Proxy (ElastiCache) and Upstash for consistency
 */
export async function setInCache<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    let ecOk = false;
    let upstashOk = false;

    // Write to EC2 Proxy (ElastiCache)
    if (ecProxyAvailable !== false) {
        ecOk = await ecProxySet(key, value, ttlSeconds);
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

/**
 * Delete a key from Redis cache
 * Removes from BOTH EC2 Proxy and Upstash
 */
export async function deleteFromCache(key: string): Promise<boolean> {
    let ecOk = false;
    let upstashOk = false;

    // Delete from EC2 Proxy
    if (ecProxyAvailable !== false) {
        try {
            const res = await fetch(`${EC2_PROXY_URL}/del?key=${encodeURIComponent(key)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${EC2_PROXY_KEY}` },
                signal: AbortSignal.timeout(3000),
            });
            ecOk = res.ok;
        } catch { /* ignore */ }
    }

    // Delete from Upstash
    const upstash = getUpstashClient();
    if (upstash) {
        try {
            await upstash.del(key);
            upstashOk = true;
        } catch { /* ignore */ }
    }

    return ecOk || upstashOk;
}
