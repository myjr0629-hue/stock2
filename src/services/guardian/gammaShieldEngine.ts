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

// === Core Engine ===
export async function calculateGammaShield(): Promise<GammaShieldData> {
    const startTime = Date.now();
    console.log('[GAMMA SHIELD] Starting calculation...');

    try {
        // Parallel fetch SPY and QQQ structure data
        const [spyData, qqqData] = await Promise.all([
            getStructureData('SPY').catch(e => {
                console.error('[GAMMA SHIELD] SPY fetch failed:', e.message);
                return null;
            }),
            getStructureData('QQQ').catch(e => {
                console.error('[GAMMA SHIELD] QQQ fetch failed:', e.message);
                return null;
            })
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
        const spyCallWall = spyData?.levels?.callWall ?? null;
        const spyPutFloor = spyData?.levels?.putFloor ?? null;
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
    // 1. Check memory cache (fastest)
    if (!force && memoryCache && (Date.now() - memoryCache.timestamp < MEMORY_TTL_MS)) {
        return { ...memoryCache.data, source: 'CACHE' };
    }

    // 2. Check Redis cache
    if (!force) {
        try {
            const redis = getRedis();
            if (redis) {
                const cached = await redis.get<string>(REDIS_KEY);
                if (cached) {
                    const data: GammaShieldData = typeof cached === 'string' ? JSON.parse(cached) : cached;
                    memoryCache = { data, timestamp: Date.now() };
                    return { ...data, source: 'CACHE' };
                }
            }
        } catch (e) {
            console.warn('[GAMMA SHIELD] Redis read failed:', e);
        }
    }

    // 3. Off-hours: return memory cache if available, else null
    if (isOffHours() && !force) {
        if (memoryCache) return { ...memoryCache.data, source: 'CACHE' };
        // Try to calculate once even during off-hours for initial data
    }

    // 4. Calculate fresh
    try {
        return await calculateGammaShield();
    } catch (e) {
        console.error('[GAMMA SHIELD] Fresh calculation failed:', e);
        if (memoryCache) return { ...memoryCache.data, source: 'CACHE' };
        return null;
    }
}
