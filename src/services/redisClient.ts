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
/** EC2 프록시 읽기 — `ok:true` 는 «프록시가 정상 응답했다»(값이 null 이어도)를 뜻한다. */
async function ecProxyGetEx<T>(key: string): Promise<{ ok: boolean; value: T | null }> {
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
        if (!res.ok) {
            // ★ 401/5xx 는 «미스»가 아니라 «프록시 이상»이다. 예전엔 null 로 돌려 미스처럼 보였고,
            //   키가 틀린 배포에서도 모든 읽기가 조용히 Upstash 로 갔다. 쿨다운으로 넘긴다.
            markEcProxyDown(`HTTP ${res.status}`);
            return { ok: false, value: null };
        }
        const data = await res.json();
        if (ecProxyAvailable === null) {
            ecProxyAvailable = true;
            console.log('[Redis] EC2 Proxy connected');
        }
        return { ok: true, value: (data.result ?? null) as T | null };
    } catch (e: any) {
        markEcProxyDown(e.message);
        return { ok: false, value: null };
    }
}
async function ecProxyGet<T>(key: string): Promise<T | null> {
    return (await ecProxyGetEx<T>(key)).value;
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


// ═══════════════════════════════════════════════════════════════════════════
// ★ 2026-09-18 — Upstash «복제본» → «폴백 + 내구 저장소» (비용 감축, 동작 불변)
//
// 실측: 9월 Upstash 명령 1,903만(8월 369만의 5.2배)·대역폭 495GB·$47.
//   · 쓰기 880만 = setInCache 가 모든 쓰기를 Upstash 에 «무조건» 복제한 것
//   · 읽기 1,028만 = EC2 미스마다 Upstash 를 다시 읽은 것(적중률 46% — 없는 키 유료 조회)
//   · 대역폭 = flow:ticker(257KB·비ASCII) 를 프록시가 깨뜨려 Upstash 사본으로 폴백한 것
//     → 프록시 readBody 결함은 scripts/ec2-redis-proxy.js 에서 같은 날 수정·검증했다
//
// 정책(순수 함수, scripts/test-redis-policy.ts 가 고정한다):
//   복제(Upstash 에도 쓴다) = TTL 없음(내구 데이터) | 장애-필수 접두사 | EC2 쓰기 실패
//   lastgood 류는 EC2 엔 매번, Upstash 엔 «키당 N초에 한 번»만(인스턴스별 스로틀)
//   폴백(EC2 가 «정상 응답으로 null» 인데도 Upstash 를 읽는다) = Upstash 전용 접두사 | 복제 접두사
//   프록시가 죽었거나 쿨다운이면 → 예전과 똑같이 전부 Upstash
// 실측 근거: Upstash 접두사 60개 중 EC2 에 없는 것은 cache:13f·push:tokens·guardian:gemini·
//   reports:*·split:recent·cache:xs·flow-harvest:lock 뿐(2026-09-18 프로브). 그 외 전부 EC2 3/3.
// ═══════════════════════════════════════════════════════════════════════════
/** 장애 때 없으면 화면이 비거나 상태를 잃는 키 — Upstash 복제를 유지한다. */
const REPLICATE_PREFIXES: readonly RegExp[] = [
    /^trade:/, /^mkt:/, /^push:/, /^guardian:/, /^yahoo:/, /^vix:/, /^cnn:/,
    /^market:movers:last_good/, /^structure:lastgood:/, /^intrinio:options:eod/,
    /^intrinio:snap:lastgood:/, /^flow:ticker:lastgood:/,
];
/** Upstash 에만 존재하는 키(래퍼 밖 작성자) — EC2 미스여도 Upstash 를 읽는다. */
const UPSTASH_ONLY_PREFIXES: readonly RegExp[] = [
    /^cache:13f:/, /^push:/, /^reports:/, /^guardian:gemini/, /^split:/, /^cache:xs/, /^flow-harvest:/,
];
/** 크고 자주 쓰는 «마지막 정상값» — Upstash 복제를 키당 N초에 한 번으로 묶는다. */
const THROTTLED_REPLICATE: readonly { re: RegExp; windowMs: number }[] = [
    { re: /^flow:ticker:lastgood:/, windowMs: 5 * 60 * 1000 },   // 257KB — 대역폭의 주범
    { re: /^intrinio:snap:lastgood:/, windowMs: 60 * 1000 },      // 호출마다 쓰이던 것
];
const _lastReplicated = new Map<string, number>();
export type ReplicateDecision = 'replicate' | 'throttled' | 'skip';
/** 순수 함수 — 테스트 가능. now 는 주입한다. */
export function decideReplicate(key: string, ttlSeconds: number | undefined, ecOk: boolean, now = Date.now()): ReplicateDecision {
    if (!ecOk) return 'replicate';                       // EC2 에 못 썼으면 예전처럼 Upstash 가 받는다
    if (ttlSeconds === undefined) return 'replicate';    // 내구 데이터(킬스위치·토큰 등)
    const th = THROTTLED_REPLICATE.find((t) => t.re.test(key));
    if (th) {
        const last = _lastReplicated.get(key);           // 기록 없음 = 첫 쓰기 → 복제(시계값에 기대지 않는다)
        if (last !== undefined && now - last < th.windowMs) return 'throttled';
        if (_lastReplicated.size > 5000) _lastReplicated.clear(); // 인스턴스 메모리 상한
        _lastReplicated.set(key, now);
        return 'replicate';
    }
    return REPLICATE_PREFIXES.some((r) => r.test(key)) ? 'replicate' : 'skip';
}
/** 순수 함수 — EC2 가 «정상 응답으로 null» 을 줬을 때 Upstash 를 읽을지. */
export function shouldFallbackToUpstash(key: string, ecAuthoritative: boolean): boolean {
    if (!ecAuthoritative) return true;                   // 프록시 죽음/쿨다운/오류 → 예전과 동일
    return UPSTASH_ONLY_PREFIXES.some((r) => r.test(key)) || REPLICATE_PREFIXES.some((r) => r.test(key));
}
/** 테스트 전용 — 스로틀 상태 초기화 */
export function _resetReplicateThrottle(): void { _lastReplicated.clear(); }

export async function getFromCache<T>(key: string): Promise<T | null> {
    // Try EC2 Proxy first (ElastiCache via HTTP)
    let ecAuthoritative = false;
    if (ecProxyUsable()) {
        const r = await ecProxyGetEx<T>(key);
        // Skip a corrupted EC2 value (mojibake) and let Upstash serve the clean copy.
        if (r.ok && r.value !== null && !isMojibake(r.value)) return r.value;
        // 정상 응답인데 null(진짜 미스) → 래퍼로만 쓰는 키는 Upstash 에도 없으므로 묻지 않는다.
        // 깨진 값(mojibake)은 «비권위»로 두어 예전처럼 Upstash 사본을 시도한다.
        ecAuthoritative = r.ok && r.value === null;
    }
    if (ecAuthoritative && !shouldFallbackToUpstash(key, true)) return null;

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
                    // Upstash 에만 있을 수 있는 키(cache:13f 등)의 미스만 골라 채운다.
                    const need = keys.map((k, i) => (results[i] === null && shouldFallbackToUpstash(k, true) ? i : -1)).filter((i) => i >= 0);
                    if (need.length) {
                        const upstash = getUpstashClient();
                        if (upstash) {
                            try {
                                const extra = await upstash.mget(...need.map((i) => keys[i]));
                                need.forEach((i, j) => { if (extra[j] != null) results[i] = extra[j] as T; });
                            } catch (e: any) { console.warn(`[Redis/Upstash] mget(fill) failed:`, e.message); }
                        }
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

    // Upstash 복제는 정책이 정한다(내구 키·장애-필수 키·EC2 실패 시). 그 외는 EC2 만.
    const decision = decideReplicate(key, ttlSeconds, ecOk);
    const upstash = decision === 'replicate' ? getUpstashClient() : null;
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
