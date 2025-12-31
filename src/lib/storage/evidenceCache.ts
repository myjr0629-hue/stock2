// [Phase 7] Evidence Cache Layer - Redis-based caching for real data
// NO estimation, NO fallback - only cache real API responses

import { Redis } from '@upstash/redis';

// === CACHE KEYS & TTLs ===
const CACHE_TTL = {
    EVIDENCE: 90,      // ticker:evidence:{T} - 90 seconds
    MACRO: 45,         // macro:bundle - 45 seconds
    OPTIONS: 90,       // options:chain:{T} - 90 seconds
    FLOW: 90           // flow:bundle:{T} - 90 seconds
};

const CACHE_KEYS = {
    evidence: (ticker: string) => `ticker:evidence:${ticker.toUpperCase()}`,
    macro: () => 'macro:bundle',
    options: (ticker: string) => `options:chain:${ticker.toUpperCase()}`,
    flow: (ticker: string) => `flow:bundle:${ticker.toUpperCase()}`
};

// === Redis Client ===
let redis: Redis | null = null;

function getRedis(): Redis {
    if (!redis) {
        redis = Redis.fromEnv();
    }
    return redis;
}

// === EVIDENCE CACHE ===

export interface CachedEvidence {
    ticker: string;
    price: any;
    flow: any;
    options: any;
    stealth: any;
    complete: boolean;
    fetchedAtET: string;
    ageSeconds: number;
}

export async function getEvidenceFromCache(ticker: string): Promise<CachedEvidence | null> {
    try {
        const key = CACHE_KEYS.evidence(ticker);
        const cached = await getRedis().get<CachedEvidence>(key);

        if (cached) {
            // Calculate age
            const fetchedAt = new Date(cached.fetchedAtET);
            cached.ageSeconds = Math.floor((Date.now() - fetchedAt.getTime()) / 1000);
            console.log(`[EvidenceCache] HIT ${ticker} (age: ${cached.ageSeconds}s)`);
        }

        return cached;
    } catch (e) {
        console.error(`[EvidenceCache] GET error for ${ticker}:`, e);
        return null;
    }
}

export async function setEvidenceToCache(ticker: string, evidence: CachedEvidence): Promise<void> {
    try {
        const key = CACHE_KEYS.evidence(ticker);
        await getRedis().set(key, evidence, { ex: CACHE_TTL.EVIDENCE });
        console.log(`[EvidenceCache] SET ${ticker} (TTL: ${CACHE_TTL.EVIDENCE}s)`);
    } catch (e) {
        console.error(`[EvidenceCache] SET error for ${ticker}:`, e);
    }
}

// === MACRO BUNDLE CACHE ===

export interface CachedMacroBundle {
    ndx: { price: number; changePct: number };
    vix: { value: number };
    us10y: { yield: number };
    dxy: { value: number };
    fetchedAtET: string;
    ageSeconds: number;
}

export async function getMacroBundleFromCache(): Promise<CachedMacroBundle | null> {
    try {
        const key = CACHE_KEYS.macro();
        const cached = await getRedis().get<CachedMacroBundle>(key);

        if (cached) {
            const fetchedAt = new Date(cached.fetchedAtET);
            cached.ageSeconds = Math.floor((Date.now() - fetchedAt.getTime()) / 1000);
            console.log(`[MacroCache] HIT (age: ${cached.ageSeconds}s)`);
        }

        return cached;
    } catch (e) {
        console.error(`[MacroCache] GET error:`, e);
        return null;
    }
}

export async function setMacroBundleToCache(macro: CachedMacroBundle): Promise<void> {
    try {
        const key = CACHE_KEYS.macro();
        await getRedis().set(key, macro, { ex: CACHE_TTL.MACRO });
        console.log(`[MacroCache] SET (TTL: ${CACHE_TTL.MACRO}s)`);
    } catch (e) {
        console.error(`[MacroCache] SET error:`, e);
    }
}

// === OPTIONS CHAIN CACHE ===

export interface CachedOptionsChain {
    ticker: string;
    status: 'OK' | 'READY' | 'NO_OPTIONS' | 'PENDING' | 'FAILED' | 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    callWall: number;
    putFloor: number;
    maxPain: number;
    pinZone: number;
    pcr: number;
    gex: number;
    gammaRegime: string;
    coveragePct: number;
    oiClusters: {
        callsTop: Array<{ strike: number; oi: number }>;
        putsTop: Array<{ strike: number; oi: number }>;
    };
    fetchedAtET: string;
}

export async function getOptionsFromCache(ticker: string): Promise<CachedOptionsChain | null> {
    try {
        const key = CACHE_KEYS.options(ticker);
        const cached = await getRedis().get<CachedOptionsChain>(key);

        if (cached) {
            console.log(`[OptionsCache] HIT ${ticker}`);
        }

        return cached;
    } catch (e) {
        console.error(`[OptionsCache] GET error for ${ticker}:`, e);
        return null;
    }
}

export async function setOptionsToCache(ticker: string, options: CachedOptionsChain): Promise<void> {
    try {
        const key = CACHE_KEYS.options(ticker);
        await getRedis().set(key, options, { ex: CACHE_TTL.OPTIONS });
        console.log(`[OptionsCache] SET ${ticker} (TTL: ${CACHE_TTL.OPTIONS}s)`);
    } catch (e) {
        console.error(`[OptionsCache] SET error for ${ticker}:`, e);
    }
}

// === FLOW BUNDLE CACHE ===

export interface CachedFlowBundle {
    ticker: string;
    vol: number;
    relVol: number;
    gapPct: number;
    largeTradesUsd: number;
    offExPct: number;
    offExDeltaPct: number;
    netFlow?: number;
    complete: boolean;
    fetchedAtET: string;
}

export async function getFlowFromCache(ticker: string): Promise<CachedFlowBundle | null> {
    try {
        const key = CACHE_KEYS.flow(ticker);
        const cached = await getRedis().get<CachedFlowBundle>(key);

        if (cached) {
            console.log(`[FlowCache] HIT ${ticker}`);
        }

        return cached;
    } catch (e) {
        console.error(`[FlowCache] GET error for ${ticker}:`, e);
        return null;
    }
}

export async function setFlowToCache(ticker: string, flow: CachedFlowBundle): Promise<void> {
    try {
        const key = CACHE_KEYS.flow(ticker);
        await getRedis().set(key, flow, { ex: CACHE_TTL.FLOW });
        console.log(`[FlowCache] SET ${ticker} (TTL: ${CACHE_TTL.FLOW}s)`);
    } catch (e) {
        console.error(`[FlowCache] SET error for ${ticker}:`, e);
    }
}

// === CACHE VALIDITY CHECK ===

export async function isCacheValid(ticker: string): Promise<boolean> {
    const evidence = await getEvidenceFromCache(ticker);
    return evidence !== null && evidence.complete === true;
}

// === BULK INVALIDATION ===

export async function invalidateTickerCache(ticker: string): Promise<void> {
    try {
        const keys = [
            CACHE_KEYS.evidence(ticker),
            CACHE_KEYS.options(ticker),
            CACHE_KEYS.flow(ticker)
        ];
        await Promise.all(keys.map(k => getRedis().del(k)));
        console.log(`[Cache] Invalidated all caches for ${ticker}`);
    } catch (e) {
        console.error(`[Cache] Invalidation error for ${ticker}:`, e);
    }
}

