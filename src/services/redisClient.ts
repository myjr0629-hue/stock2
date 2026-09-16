// ===========================================================================
// Unified Redis Client ??ElastiCache via EC2 Proxy (primary) + Upstash (fallback)
// EC2 Proxy: HTTP REST API wrapping ElastiCache (~15ms from Vercel same-region)
// Upstash: HTTP REST API (works everywhere, ~30ms)
// ===========================================================================

import crypto from 'crypto';
import { Redis as UpstashRedis } from '@upstash/redis';

// Lazy initialization
let upstashClient: UpstashRedis | null = null;
let lastError: string | null = null;
let ecProxyAvailable: boolean | null = null; // null = not tested yet

/**
 * ★ 2026-09-15 — «한 번 실패하면 영원히 포기» 를 고친다.
 *
 * 예전엔 프록시 호출이 한 번이라도 타임아웃되면 ecProxyAvailable=false 로 두고
 * 그 인스턴스가 살아 있는 동안 EC2 캐시를 **다시는 쓰지 않았다.**
 * 실측: guardian:snapshot:ko 는 24,651바이트다. 평소 0.6~1.0초에 오지만
 * 한 번 3초를 넘기면 그 뒤로는 멀쩡한 캐시를 두고도 전부 건너뛴다.
 * Upstash 가 받쳐주면 티가 안 나지만, 느려지고 비용이 든다.
 *
 * [원칙] 일시적 흔들림이 영구 저하가 되면 안 된다 → 쿨다운으로 바꾼다.
 */
const EC_COOLDOWN_MS = 30 * 1000;
let ecProxyDownUntil = 0;

function ecProxyUsable(): boolean {
    if (ecProxyAvailable === false && Date.now() >= ecProxyDownUntil) {
        // 쿨다운이 끝났다 — 다시 시도해 본다
        ecProxyAvailable = null;
    }
    return ecProxyAvailable !== false;
}

function markEcProxyDown(reason: string): void {
    if (ecProxyAvailable !== false) {
        console.warn(`[Redis] EC2 Proxy 일시 중단(${Math.round(EC_COOLDOWN_MS / 1000)}초): ${reason}`);
    }
    ecProxyAvailable = false;
    ecProxyDownUntil = Date.now() + EC_COOLDOWN_MS;
}

// EC2 Redis Proxy configuration
// ★ 2026-09-16 — the bearer key has NO default any more (the old default was
//   printed in docs/source and the proxy accepted POST /set with it). Without
//   EC2_REDIS_PROXY_KEY the proxy answers 401 and every read falls through to
//   Upstash; that is the intended fail-closed behaviour, not an outage.
const EC2_PROXY_URL = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
const EC2_PROXY_KEY = process.env.EC2_REDIS_PROXY_KEY || process.env.REDIS_PROXY_KEY || '';
if (!EC2_PROXY_KEY) console.error('[Redis] EC2_REDIS_PROXY_KEY is not set — EC2 proxy reads/writes will be rejected (fail closed)');

// ★ trade:* writes (killswitch, auto config, real-money arm key) must be signed:
//   the proxy rejects remote writes to trade:* that lack X-Exec-Ts/X-Exec-Sign
//   = HMAC_SHA256(EXECUTOR_SECRET, ts + "." + rawBody) — the executor's scheme.
//   Without EXECUTOR_SECRET those writes only land in Upstash; the engine reads
//   killswitch from ElastiCache, so a missing secret is logged loudly.
const PROTECTED_KEY = /^trade:/;
let warnedNoWriteSecret = false;
function signedWriteHeaders(rawBody: string, keys: string[]): Record<string, string> {
    if (!keys.some((k) => PROTECTED_KEY.test(k))) return {};
    const secret = (process.env.EXECUTOR_SECRET || '').trim();
    if (!secret) {
        if (!warnedNoWriteSecret) { warnedNoWriteSecret = true; console.error('[Redis] EXECUTOR_SECRET missing — trade:* writes to the EC2 proxy will be rejected (403)'); }
        return {};
    }
    const ts = String(Date.now());
    const sign = crypto.createHmac('sha256', secret).update(ts + '.' + rawBody).digest('hex');
    return { 'X-Exec-Ts': ts, 'X-Exec-Sign': sign };
}

// Cache keys
export const CACHE_KEYS = {
    VIX_LAST_KNOWN_GOOD: 'vix:last_known_good',
    VIX_LAST_UPDATE: 'vix:last_update'
};

/**
 * [GLOBAL POLICY] TTL Jitter — adds ±10% random variation to prevent
 * synchronized expiry (thundering herd) across all keys.
 * AWS best practice for distributed caching.
 */
function applyJitter(ttlSeconds: number): number {
    if (ttlSeconds <= 10) return ttlSeconds; // No jitter for very short TTLs
    const jitterRange = Math.floor(ttlSeconds * 0.1); // ±10%
    const jitter = Math.floor(Math.random() * (jitterRange * 2 + 1)) - jitterRange;
    return Math.max(1, ttlSeconds + jitter);
}

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

// ?�?� EC2 Redis Proxy helpers ?�?�
async function ecProxyGet<T>(key: string): Promise<T | null> {
    try {
        const res = await fetch(`${EC2_PROXY_URL}/get?key=${encodeURIComponent(key)}`, {
            headers: { 'Authorization': `Bearer ${EC2_PROXY_KEY}` },
            // ★ 2026-09-15 — 3초는 너무 빡빡했다.
            //   guardian:snapshot 처럼 큰 키(실측 24,651바이트)는 런타임이 바쁠 때
            //   3초를 넘긴다. 그러면 «멀쩡한 캐시»를 두고도 못 쓰고, 예전에는
            //   그 한 번으로 인스턴스 전체가 캐시를 영구히 포기했다.
            //   넘겨봐야 잃는 게 더 크므로 6초로 늘린다(쿨다운도 함께 도입했다).
            signal: AbortSignal.timeout(6000),
            cache: 'no-store'
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (ecProxyAvailable === null) {
            ecProxyAvailable = true;
            console.log('[Redis] EC2 Proxy connected');
        }
        return data.result as T;
    } catch (e: any) {
        markEcProxyDown(e.message);
        return null;
    }
}

async function ecProxySet<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    try {
        const rawBody = JSON.stringify({ key, value, ttl: ttlSeconds });
        const res = await fetch(`${EC2_PROXY_URL}/set`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${EC2_PROXY_KEY}`,
                'Content-Type': 'application/json',
                ...signedWriteHeaders(rawBody, [key]),
            },
            body: rawBody,
            signal: AbortSignal.timeout(3000),
        });
        if (!res.ok && PROTECTED_KEY.test(key)) console.error(`[Redis] EC2 proxy refused trade write key=${key} status=${res.status}`);
        return res.ok;
    } catch {
        return false;
    }
}

// ?�?� Upstash (HTTP) connection ?�?�
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
// The EC2 proxy occasionally mangles multi-byte UTF-8 (Korean/Japanese) into
// U+FFFD replacement chars — the same value stored in Upstash stays clean. Detect
// that corruption so we fall through to Upstash and users never see mojibake
// (guardian AI briefs, sector names, etc.).
function isMojibake(value: unknown): boolean {
    if (value == null) return false;
    try {
        const s = typeof value === 'string' ? value : JSON.stringify(value);
        return s.indexOf('\uFFFD') !== -1;
    } catch { return false; }
}

export async function getFromCache<T>(key: string): Promise<T | null> {
    // Try EC2 Proxy first (ElastiCache via HTTP)
    if (ecProxyUsable()) {
        const result = await ecProxyGet<T>(key);
        // Skip a corrupted EC2 value (mojibake) and let Upstash serve the clean copy.
        if (result !== null && !isMojibake(result)) return result;
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
 * Get multiple cached values from Redis in a single round-trip (MGET).
 * Tries EC2 Proxy /mget first, falls back to Upstash SDK mget.
 * Returns array in same order as input keys (null for misses).
 * [PERF] Reduces N Redis round-trips to 1 for batch reads.
 */
export async function mgetFromCache<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];

    // Try EC2 Proxy /mget first (ElastiCache, ~15ms single round-trip)
    if (ecProxyAvailable !== false) {
        try {
            const res = await fetch(
                `${EC2_PROXY_URL}/mget?keys=${keys.map(encodeURIComponent).join(',')}`,
                {
                    headers: { 'Authorization': `Bearer ${EC2_PROXY_KEY}` },
                    signal: AbortSignal.timeout(5000),
                    cache: 'no-store',
                }
            );
            if (res.ok) {
                const data = await res.json();
                const results = (data.results || []) as (T | null)[];
                // If the EC2 proxy corrupted any multi-byte value, fall through to
                // Upstash's clean copy rather than returning mojibake.
                if (!results.some(isMojibake)) {
                    if (ecProxyAvailable === null) {
                        ecProxyAvailable = true;
                        console.log('[Redis] EC2 Proxy connected (via mget)');
                    }
                    return results;
                }
            }
        } catch (e: any) {
            ecProxyAvailable = false;
            console.warn(`[Redis] EC2 Proxy mget unavailable: ${e.message}`);
        }
    }

    // Fallback to Upstash mget (SDK native support)
    const upstash = getUpstashClient();
    if (upstash) {
        try {
            const results = await upstash.mget(...keys);
            return results as (T | null)[];
        } catch (e: any) {
            console.warn(`[Redis/Upstash] mget failed:`, e.message);
        }
    }

    // Total failure: return null array
    return keys.map(() => null);
}

/**
 * Set value in Redis cache with optional TTL (seconds)
 * Writes to BOTH EC2 Proxy (ElastiCache) and Upstash for consistency
 * [GLOBAL POLICY] Rejects null, undefined, or failed data to prevent cache poisoning
 */
export async function setInCache<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    // [GLOBAL POLICY] Never cache null, undefined, or error responses
    if (value === null || value === undefined) {
        console.warn(`[Redis] BLOCKED: Attempted to cache null/undefined for key=${key}`);
        return false;
    }
    if (typeof value === 'object' && value !== null) {
        const v = value as any;
        // Block {error: "..."} responses (e.g., "fetch failed")
        if (v.error && Object.keys(v).length <= 2) {
            console.warn(`[Redis] BLOCKED: Attempted to cache error response for key=${key}: ${v.error}`);
            return false;
        }
    }

    let ecOk = false;
    let upstashOk = false;

    // [GLOBAL POLICY] Apply TTL jitter to prevent thundering herd
    const effectiveTtl = ttlSeconds ? applyJitter(ttlSeconds) : undefined;

    // Write to EC2 Proxy (ElastiCache)
    if (ecProxyUsable()) {
        ecOk = await ecProxySet(key, value, effectiveTtl);
    }

    // Write to Upstash (always, for fallback consistency)
    const upstash = getUpstashClient();
    if (upstash) {
        try {
            if (effectiveTtl) {
                await upstash.setex(key, effectiveTtl, value);
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
 * [GLOBAL POLICY] Short-lived negative cache for soft errors.
 * Prevents thundering herd when a data source is temporarily down.
 * TTL: 15-30 seconds (random). Never caches hard errors (null/undefined).
 */
export async function setNegativeCache(key: string, reason: string): Promise<boolean> {
    const negativeTtl = 15 + Math.floor(Math.random() * 16); // 15-30 seconds
    const negativePayload = {
        _negative: true,
        _reason: reason,
        _cachedAt: Date.now(),
        _expiresSec: negativeTtl,
    };
    console.warn(`[Redis] Negative cache set: key=${key}, reason=${reason}, ttl=${negativeTtl}s`);
    return setInCache(key as any, negativePayload as any, negativeTtl);
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
                // protected keys: the proxy verifies HMAC(ts + "." + key) for /del
                headers: { 'Authorization': `Bearer ${EC2_PROXY_KEY}`, ...signedWriteHeaders(key, [key]) },
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
