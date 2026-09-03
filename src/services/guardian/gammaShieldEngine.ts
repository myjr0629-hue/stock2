// src/services/guardian/gammaShieldEngine.ts
// GAMMA SHIELD™ — Market-Wide Volatility Intelligence Engine
// Aggregates SPY + QQQ options data into intuitive market indices

import { getStructureData } from '../structureService';
import { Redis } from '@upstash/redis';

// === Types ===
export interface GammaShieldData {
    // Core Indices
    gexIndex: number;           // -100 ~ +100 (normalized market GEX)
    gexLevel: 'LONG_GAMMA' | 'NEUTRAL' | 'SHORT_GAMMA';
    gexLabel: string;           // Human-readable label

    squeezeRisk: number;        // 0-100%
    squeezeLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

    // v3: Individual ETF Squeeze Scores
    spySqueezeScore: number;    // SPY squeeze contribution
    qqqSqueezeScore: number;    // QQQ squeeze contribution

    // Trigger Band (S&P 500 price-equivalent)
    supportWall: number | null;     // Put floor → S&P 500 points
    resistanceWall: number | null;  // Call wall → S&P 500 points
    currentPrice: number | null;    // SPY × 10 ≈ S&P
    gammaFlipPoint: number | null;  // GEX sign change point

    // v2: GEX Trend (24h comparison)
    prevGexIndex: number | null;    // Previous GEX index from last calculation
    gexChange: number | null;       // Current - Previous (direction)

    // v2: SPY/QQQ Split Indices
    spyGexIndex: number;            // SPY-only normalized GEX
    qqqGexIndex: number;            // QQQ-only normalized GEX

    // Metadata
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    spyGex: number | null;
    qqqGex: number | null;
    updatedAt: string;
    source: 'LIVE' | 'CACHE';
}

// === Constants ===
const REDIS_KEY = 'guardian:gammaShield';
const REDIS_PREV_KEY = 'guardian:gammaShield:prev';
const CACHE_TTL_SEC = 5 * 60; // 5 minutes (matches Guardian polling)
const OFF_HOURS_TTL_SEC = 12 * 60 * 60; // 12 hours

// In-memory fallback cache
let memoryCache: { data: GammaShieldData; timestamp: number } | null = null;
const MEMORY_TTL_MS = 5 * 60 * 1000;

// === Redis Helper ===
function getRedis(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;
    return new Redis({ url, token });
}

// === Time-Based Gating ===
function isOffHours(): boolean {
    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hour = nowET.getHours();
    const day = nowET.getDay();
    if (day === 0 || day === 6) return true;
    if (hour >= 20 || hour < 4) return true;
    return false;
}

// === GEX Index Normalization ===
// Converts raw net GEX (in dollar-gamma) to -100~+100 scale
// Typical SPY GEX ranges: -5B (extreme short) to +10B (extreme long)
function normalizeGexToIndex(rawGex: number): number {
    // Historical reference ranges for SPY+QQQ combined
    const EXTREME_SHORT = -3_000_000_000; // -3B = extreme short gamma
    const EXTREME_LONG = 6_000_000_000;   // +6B = extreme long gamma

    if (rawGex >= 0) {
        return Math.min(100, Math.round((rawGex / EXTREME_LONG) * 100));
    } else {
        return Math.max(-100, Math.round((rawGex / EXTREME_SHORT) * -100));
    }
}

// Normalize individual ETF GEX separately (different baselines)
function normalizeEtfGex(rawGex: number, etf: 'SPY' | 'QQQ'): number {
    const extremes = etf === 'SPY'
        ? { long: 4_000_000_000, short: -2_000_000_000 }
        : { long: 2_000_000_000, short: -1_000_000_000 };

    if (rawGex >= 0) {
        return Math.min(100, Math.round((rawGex / extremes.long) * 100));
    } else {
        return Math.max(-100, Math.round((rawGex / extremes.short) * -100));
    }
}

function getGexLevel(index: number): 'LONG_GAMMA' | 'NEUTRAL' | 'SHORT_GAMMA' {
    if (index >= 20) return 'LONG_GAMMA';
    if (index <= -20) return 'SHORT_GAMMA';
    return 'NEUTRAL';
}

function getGexLabel(index: number, level: string): string {
    if (level === 'LONG_GAMMA') {
        if (index >= 70) return 'MAXIMUM CUSHION';
        if (index >= 40) return 'STABLE';
        return 'MILD SUPPORT';
    }
    if (level === 'SHORT_GAMMA') {
        if (index <= -70) return 'EXTREME DANGER';
        if (index <= -40) return 'VOLATILE';
        return 'CAUTION';
    }
    return 'NEUTRAL ZONE';
}

// ============================================================================
// 빠른 경로 — 크론이 구워 둔 «공유» 구조 캐시에서 SPY·QQQ 를 읽는다.
// ----------------------------------------------------------------------------
// 왜 (2026-09-03 실측):
//   화면의 감마쉴드가 «감마 0 · 신뢰도 LOW» 로 굳어 있었다.
//   원인은 데이터가 없어서가 아니었다 — 같은 시각 /api/command/unified?t=SPY 는
//   netGex 3.67억을 0.7초에 준다. 문제는 **경로**였다.
//
//   structureService 의 캐시는 «프로세스 메모리»다. 람다 인스턴스마다 따로다.
//   그래서 커맨드 화면이 도는 웜 인스턴스는 캐시 적중(0.7초)인데,
//   가디언이 도는 인스턴스는 매번 콜드로 원본을 다시 긁는다. 느리고(10.9초),
//   그 호출이 한 번이라도 실패하면 spyGex=qqqGex=null 인 결과가 그대로
//   Redis 에 저장돼 **최대 12시간(장외 TTL)** 동안 0 이 화면에 박힌다.
//
//   구조 크론은 이미 2,001종목(SPY·QQQ 포함)을 하루 5번 구워 Redis 에 둔다.
//   그걸 읽으면 공유·웜이라 한 자릿수 100ms 이고, 인스턴스마다 다시 긁지 않는다.
//
// ⚠️ 크론이 아직 `sq`(스퀴즈)를 안 넣은 낡은 파트가 남아 있을 수 있다.
//    그때는 그 티커만 라이브로 내려간다 — 읽는 쪽만 만들면 조용히 0 이 된다.
// ============================================================================
type StructLite = {
    netGex: number | null;
    squeezeScore: number | null;
    underlyingPrice: number | null;
    callWall: number | null;
    putFloor: number | null;
    gammaFlipLevel: number | null;
};

const SHARDS = 8;

/** 유니버스에서 티커가 속한 샤드를 계산한다 — 파일이 바뀌어도 자동으로 맞는다. */
async function shardOf(ticker: string): Promise<number | null> {
    try {
        const mod: any = await import('@/../data/stock_universe_us800.json');
        const symbols: string[] = (mod?.symbols ?? mod?.default?.symbols ?? []) as string[];
        const idx = symbols.indexOf(ticker);
        if (idx < 0) return null;
        return Math.floor(idx / Math.ceil(symbols.length / SHARDS));
    } catch {
        return null;
    }
}

/** 공유 캐시에서 한 티커를 읽는다. 없거나 GEX 가 비면 null — 그러면 호출부가 라이브로 간다. */
async function readShared(ticker: string): Promise<StructLite | null> {
    try {
        const shard = await shardOf(ticker);
        if (shard === null) return null;
        const redis = getRedis();
        if (!redis) return null;
        const raw = await redis.get<any>(`structure:part:v2:${shard}`);
        if (!raw) return null;
        const part = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const row = (part?.rows ?? []).find((r: any) => r?.t === ticker);
        // GEX 가 없으면 이 경로는 쓸모가 없다. 스퀴즈만 없는 경우도 라이브로 보낸다 —
        // 0 으로 메우면 화면이 「스퀴즈 없음」이라고 거짓말한다.
        if (!row || typeof row.gex !== 'number' || typeof row.sq !== 'number') return null;
        return {
            netGex: row.gex,
            squeezeScore: row.sq,
            underlyingPrice: typeof row.px === 'number' ? row.px : null,
            callWall: typeof row.cw === 'number' ? row.cw : null,
            putFloor: typeof row.pf === 'number' ? row.pf : null,
            gammaFlipLevel: typeof row.fl === 'number' ? row.fl : null,
        };
    } catch {
        return null;
    }
}

/** 공유 캐시 → 실패 시 라이브. 어느 쪽이든 같은 모양으로 돌려준다. */
async function loadStruct(ticker: string): Promise<StructLite | null> {
    const shared = await readShared(ticker);
    if (shared) {
        console.log(`[GAMMA SHIELD] ${ticker}: shared cache hit (gex=${shared.netGex})`);
        return shared;
    }
    try {
        const d: any = await getStructureData(ticker);
        if (!d) return null;
        const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
        return {
            netGex: num(d.netGex),
            squeezeScore: num(d.squeezeScore),
            underlyingPrice: num(d.underlyingPrice),
            callWall: num(d.levels?.callWall),
            putFloor: num(d.levels?.putFloor),
            gammaFlipLevel: num(d.gammaFlipLevel),
        };
    } catch (e: any) {
        console.error(`[GAMMA SHIELD] ${ticker} live fetch failed:`, e?.message);
        return null;
    }
}

/** 이 결과를 화면에 써도 되는가. GEX 가 둘 다 없으면 «데이터 없음»이지 «감마 0»이 아니다. */
export function isUsableShield(d: GammaShieldData | null | undefined): boolean {
    if (!d) return false;
    return d.spyGex !== null || d.qqqGex !== null;
}

// === Core Engine ===
export async function calculateGammaShield(): Promise<GammaShieldData> {
    const startTime = Date.now();
    console.log('[GAMMA SHIELD] Starting calculation...');

    try {
        const [spyData, qqqData] = await Promise.all([
            loadStruct('SPY'),
            loadStruct('QQQ'),
        ]);

        const elapsed = Date.now() - startTime;
        console.log(`[GAMMA SHIELD] Data fetched in ${elapsed}ms — SPY: ${spyData ? 'OK' : 'FAIL'}, QQQ: ${qqqData ? 'OK' : 'FAIL'}`);

        // Aggregate GEX
        const spyGex = spyData?.netGex ?? null;
        const qqqGex = qqqData?.netGex ?? null;
        const combinedGex = (spyGex ?? 0) + (qqqGex ?? 0);
        const gexIndex = normalizeGexToIndex(combinedGex);
        const gexLevel = getGexLevel(gexIndex);
        const gexLabel = getGexLabel(gexIndex, gexLevel);

        // v2: Individual ETF GEX indices
        const spyGexIndex = spyGex !== null ? normalizeEtfGex(spyGex, 'SPY') : 0;
        const qqqGexIndex = qqqGex !== null ? normalizeEtfGex(qqqGex, 'QQQ') : 0;

        // Aggregate Squeeze Risk (weighted: SPY 60%, QQQ 40%)
        const spySqueezeScore = spyData?.squeezeScore ?? 0;
        const qqoSqueezeScore = qqqData?.squeezeScore ?? 0;
        const combinedSqueeze = Math.round(spySqueezeScore * 0.6 + qqoSqueezeScore * 0.4);
        const squeezeLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' =
            combinedSqueeze >= 70 ? 'EXTREME' :
                combinedSqueeze >= 45 ? 'HIGH' :
                    combinedSqueeze >= 20 ? 'MEDIUM' : 'LOW';

        // Trigger Band — convert SPY prices to S&P 500 equivalent (SPY × 10 ≈ S&P)
        const spyPrice = spyData?.underlyingPrice ?? null;
        const spyCallWall = spyData?.callWall ?? null;
        const spyPutFloor = spyData?.putFloor ?? null;
        const spyGammaFlip = spyData?.gammaFlipLevel ?? null;

        const toSP500 = (spyVal: number | null): number | null => {
            if (spyVal === null) return null;
            return Math.round(spyVal * 10);
        };

        // Confidence
        const hasSpyGex = spyGex !== null;
        const hasQqqGex = qqqGex !== null;
        const confidence: 'HIGH' | 'MEDIUM' | 'LOW' =
            hasSpyGex && hasQqqGex ? 'HIGH' :
                hasSpyGex || hasQqqGex ? 'MEDIUM' : 'LOW';

        // v2: Get previous GEX from Redis for trend comparison
        let prevGexIndex: number | null = null;
        try {
            const redis = getRedis();
            if (redis) {
                const prevData = await redis.get<string>(REDIS_PREV_KEY);
                if (prevData) {
                    const prev = typeof prevData === 'string' ? JSON.parse(prevData) : prevData;
                    prevGexIndex = prev.gexIndex ?? null;
                }
            }
        } catch { /* ignore prev read failure */ }

        const gexChange = prevGexIndex !== null ? gexIndex - prevGexIndex : null;

        const result: GammaShieldData = {
            gexIndex,
            gexLevel,
            gexLabel,
            squeezeRisk: combinedSqueeze,
            squeezeLevel,
            spySqueezeScore: Math.round(spySqueezeScore),
            qqqSqueezeScore: Math.round(qqoSqueezeScore),
            supportWall: toSP500(spyPutFloor),
            resistanceWall: toSP500(spyCallWall),
            currentPrice: toSP500(spyPrice),
            gammaFlipPoint: toSP500(spyGammaFlip),
            prevGexIndex,
            gexChange,
            spyGexIndex,
            qqqGexIndex,
            confidence,
            spyGex,
            qqqGex,
            updatedAt: new Date().toISOString(),
            source: 'LIVE'
        };

        // ⚠️ 못 쓸 결과는 **저장하지 않는다.**
        //    SPY·QQQ GEX 가 둘 다 없으면 그건 «감마 0»이 아니라 «데이터 없음»이다.
        //    예전엔 그대로 저장해서, 한 번의 실패가 장외 TTL 12시간 동안
        //    화면에 「감마 0 · 신뢰도 LOW」로 굳었다(2026-09-03 실측).
        //    prev(추세 비교용)도 같이 오염돼 gexChange 가 영영 0 이 됐다.
        if (!isUsableShield(result)) {
            console.error('[GAMMA SHIELD] SPY·QQQ GEX 둘 다 없음 — 캐시하지 않는다(다음 호출에서 재시도)');
            return result;
        }

        // Cache to Redis + save previous GEX for trend
        try {
            const redis = getRedis();
            if (redis) {
                const ttl = isOffHours() ? OFF_HOURS_TTL_SEC : CACHE_TTL_SEC;
                await redis.set(REDIS_KEY, JSON.stringify(result), { ex: ttl });
                // Save current as 'previous' with longer TTL (24h) for trend comparison
                await redis.set(REDIS_PREV_KEY, JSON.stringify({ gexIndex, updatedAt: result.updatedAt }), { ex: 24 * 60 * 60 });
                console.log(`[GAMMA SHIELD] Cached to Redis (TTL: ${ttl}s)`);
            }
        } catch (e) {
            console.warn('[GAMMA SHIELD] Redis cache failed:', e);
        }

        // Memory cache fallback
        memoryCache = { data: result, timestamp: Date.now() };

        console.log(`[GAMMA SHIELD] Complete — GEX: ${gexIndex} (${gexLevel}), SPY: ${spyGexIndex}, QQQ: ${qqqGexIndex}, Squeeze: ${combinedSqueeze}% (${squeezeLevel}), Flip: ${result.gammaFlipPoint}, Trend: ${gexChange !== null ? (gexChange >= 0 ? '+' : '') + gexChange : 'N/A'}`);

        return result;
    } catch (error: any) {
        console.error('[GAMMA SHIELD] Calculation failed:', error.message);
        throw error;
    }
}

// === Public API: Get with Cache ===
export async function getGammaShield(force: boolean = false): Promise<GammaShieldData | null> {
    // ⚠️ 캐시 경계마다 «쓸 수 있는가»를 본다.
    //    쓰는 쪽만 막으면 **이미 박혀 있는** 오염된 값이 TTL 끝까지 살아남는다.
    //    읽는 쪽에서도 걸러야 스스로 회복한다.

    // 1. Check memory cache (fastest)
    if (!force && memoryCache && (Date.now() - memoryCache.timestamp < MEMORY_TTL_MS)) {
        if (isUsableShield(memoryCache.data)) return { ...memoryCache.data, source: 'CACHE' };
        memoryCache = null;
    }

    // 2. Check Redis cache
    if (!force) {
        try {
            const redis = getRedis();
            if (redis) {
                const cached = await redis.get<string>(REDIS_KEY);
                if (cached) {
                    const data: GammaShieldData = typeof cached === 'string' ? JSON.parse(cached) : cached;
                    if (isUsableShield(data)) {
                        memoryCache = { data, timestamp: Date.now() };
                        return { ...data, source: 'CACHE' };
                    }
                    // 오염된 항목이다 — 지우고 새로 계산한다.
                    console.warn('[GAMMA SHIELD] 캐시에 GEX 없는 항목 발견 — 삭제 후 재계산');
                    await redis.del(REDIS_KEY).catch(() => { });
                    await redis.del(REDIS_PREV_KEY).catch(() => { });
                }
            }
        } catch (e) {
            console.warn('[GAMMA SHIELD] Redis read failed:', e);
        }
    }

    // 3. Off-hours: return memory cache if available, else null
    if (isOffHours() && !force) {
        if (memoryCache && isUsableShield(memoryCache.data)) return { ...memoryCache.data, source: 'CACHE' };
        // Try to calculate once even during off-hours for initial data
    }

    // 4. Calculate fresh
    try {
        const fresh = await calculateGammaShield();
        // 계산했는데도 못 쓰면 «0 을 보여주느니 없다고 말한다» — 화면이
        // 「감마 0」이라고 단정하는 것보다 «데이터 없음»이 정직하다.
        if (!isUsableShield(fresh)) {
            if (memoryCache && isUsableShield(memoryCache.data)) return { ...memoryCache.data, source: 'CACHE' };
            return null;
        }
        return fresh;
    } catch (e) {
        console.error('[GAMMA SHIELD] Fresh calculation failed:', e);
        if (memoryCache && isUsableShield(memoryCache.data)) return { ...memoryCache.data, source: 'CACHE' };
        return null;
    }
}
