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

// ============================================================
// [V8.1] No memory cache — always read directly from Redis
// Redis is populated by cron (market-feed) every minute.
// If Yahoo fails, Redis retains the last good data.
// ============================================================

/**
 * [V8.1] Get market data from Redis directly (no memory cache, no Yahoo calls)
 * Every call reads Redis → always gets the latest cron-written data.
 * If Redis is empty, returns safe defaults.
 */
export async function getYahooDataSSOT(): Promise<{ vix: YahooQuote; nq: YahooQuote; tnx: YahooQuote; spx: YahooQuote; btc: YahooQuote; gold: YahooQuote; oil: YahooQuote; rut: YahooQuote }> {
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

    return {
        vix: redisVix || getDefaultQuote('^VIX', 15),
        nq: redisNq || getDefaultQuote('NQ=F', 21000),
        tnx: redisTnx || getDefaultQuote('^TNX', 4.2),
        spx: redisSpx || getDefaultQuote('ES=F', 6800),
        btc: redisBtc || getDefaultQuote('BTC-USD', 97000),
        gold: redisGold || getDefaultQuote('GC=F', 2900),
        oil: redisOil || getDefaultQuote('CL=F', 70),
        rut: redisRut || getDefaultQuote('RTY=F', 2650)
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
