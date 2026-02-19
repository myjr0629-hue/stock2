// [V7.0] Yahoo Finance Real-time Data Hub
// Rate-limited fetcher for VIX, NQ, and TNX (US10Y) with Redis caching
// Fetches from Yahoo max once per minute, serves from cache otherwise

import { getFromCache, setInCache, CACHE_KEYS } from './redisClient';

// ============================================================
// Types
// ============================================================

export interface YahooQuote {
    symbol: string;
    price: number;
    prevClose: number;
    change: number;
    changePct: number;
    updatedAt: string;
    source: "YAHOO" | "CACHE" | "REDIS" | "DEFAULT";
    isStale: boolean;
}

// Extend cache keys for new data
export const YAHOO_CACHE_KEYS = {
    VIX: 'yahoo:vix',
    NQ: 'yahoo:nq',
    TNX: 'yahoo:tnx',
    SPX: 'yahoo:spx',
    BTC: 'yahoo:btc',
    GOLD: 'yahoo:gold',
    OIL: 'yahoo:oil',
    RUT: 'yahoo:rut',
    LAST_FETCH: 'yahoo:last_fetch'
};

// Rate limit: 1 minute between Yahoo calls
const RATE_LIMIT_MS = 60 * 1000;

// In-memory cache for fast access
let memoryCache: {
    vix: YahooQuote | null;
    nq: YahooQuote | null;
    tnx: YahooQuote | null;
    spx: YahooQuote | null;
    btc: YahooQuote | null;
    gold: YahooQuote | null;
    oil: YahooQuote | null;
    rut: YahooQuote | null;
    lastFetch: number;
} = {
    vix: null,
    nq: null,
    tnx: null,
    spx: null,
    btc: null,
    gold: null,
    oil: null,
    rut: null,
    lastFetch: 0
};

// ============================================================
// [V8.0] Yahoo direct HTTP calls REMOVED
// All data now comes from Redis only (getYahooDataSSOT)
// ============================================================

/**
 * [V8.0] Get market data from Redis ONLY (no Yahoo direct calls)
 * Redis is populated by external process. This function only reads.
 * Flow: memory cache → Redis → default values
 */
export async function getYahooDataSSOT(): Promise<{ vix: YahooQuote; nq: YahooQuote; tnx: YahooQuote; spx: YahooQuote; btc: YahooQuote; gold: YahooQuote; oil: YahooQuote; rut: YahooQuote }> {
    const now = Date.now();
    const timeSinceLastFetch = now - memoryCache.lastFetch;

    // 1. Return from memory cache if fresh (< 1 min old)
    if (timeSinceLastFetch < RATE_LIMIT_MS && memoryCache.vix && memoryCache.nq) {
        const cacheSource = (q: YahooQuote) => ({ ...q, source: "CACHE" as const, isStale: false });
        return {
            vix: cacheSource(memoryCache.vix),
            nq: cacheSource(memoryCache.nq),
            tnx: memoryCache.tnx ? cacheSource(memoryCache.tnx) : getDefaultQuote('^TNX', 4.2),
            spx: memoryCache.spx ? cacheSource(memoryCache.spx) : getDefaultQuote('ES=F', 6800),
            btc: memoryCache.btc ? cacheSource(memoryCache.btc) : getDefaultQuote('BTC-USD', 97000),
            gold: memoryCache.gold ? cacheSource(memoryCache.gold) : getDefaultQuote('GC=F', 2900),
            oil: memoryCache.oil ? cacheSource(memoryCache.oil) : getDefaultQuote('CL=F', 70),
            rut: memoryCache.rut ? cacheSource(memoryCache.rut) : getDefaultQuote('RTY=F', 2650)
        };
    }

    // 2. Read from Redis (ONLY source of truth — no Yahoo direct calls)
    console.log('[Yahoo] Reading from Redis...');

    const [redisVix, redisNq, redisTnx, redisSpx, redisBtc, redisGold, redisOil, redisRut] = await Promise.all([
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.VIX),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.NQ),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.TNX),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.SPX),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.BTC),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.GOLD),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.OIL),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.RUT)
    ]);

    if (redisVix) { memoryCache.vix = redisVix; }
    if (redisNq) { memoryCache.nq = redisNq; }
    if (redisTnx) { memoryCache.tnx = redisTnx; }
    if (redisSpx) { memoryCache.spx = redisSpx; }
    if (redisBtc) { memoryCache.btc = redisBtc; }
    if (redisGold) { memoryCache.gold = redisGold; }
    if (redisOil) { memoryCache.oil = redisOil; }
    if (redisRut) { memoryCache.rut = redisRut; }

    if (redisVix || redisNq) {
        memoryCache.lastFetch = now;
        console.log(`[Yahoo] Redis loaded: VIX=${redisVix?.price ?? 'N/A'} NQ=${redisNq?.price ?? 'N/A'}`);
    }

    // 3. Return what we have (with defaults for missing)
    return {
        vix: memoryCache.vix || getDefaultQuote('^VIX', 15),
        nq: memoryCache.nq || getDefaultQuote('NQ=F', 21000),
        tnx: memoryCache.tnx || getDefaultQuote('^TNX', 4.2),
        spx: memoryCache.spx || getDefaultQuote('ES=F', 6800),
        btc: memoryCache.btc || getDefaultQuote('BTC-USD', 97000),
        gold: memoryCache.gold || getDefaultQuote('GC=F', 2900),
        oil: memoryCache.oil || getDefaultQuote('CL=F', 70),
        rut: memoryCache.rut || getDefaultQuote('RTY=F', 2650)
    };
}

/**
 * Get default quote when all sources fail
 */
function getDefaultQuote(symbol: string, defaultPrice: number): YahooQuote {
    console.warn(`[Yahoo] ${symbol} using default value: ${defaultPrice}`);
    return {
        symbol,
        price: defaultPrice,
        prevClose: defaultPrice,
        change: 0,
        changePct: 0,
        updatedAt: new Date().toISOString(),
        source: "DEFAULT",
        isStale: true
    };
}

// ============================================================
// Individual Getters (for backward compatibility)
// ============================================================

export async function getVixFromYahoo(): Promise<YahooQuote> {
    const data = await getYahooDataSSOT();
    return data.vix;
}

export async function getNqFromYahoo(): Promise<YahooQuote> {
    const data = await getYahooDataSSOT();
    return data.nq;
}

export async function getTnxFromYahoo(): Promise<YahooQuote> {
    const data = await getYahooDataSSOT();
    return data.tnx;
}
