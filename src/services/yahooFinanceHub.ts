// [V7.0] Yahoo Finance Real-time Data Hub
// Rate-limited fetcher for VIX, NQ, and TNX (US10Y) with Redis caching
// Fetches from Yahoo max once per minute, serves from cache otherwise

import { getFromCache } from './redisClient';

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
    marketTime?: string;
    marketState?: string;
    exchangeTimezoneName?: string;
    source: "YAHOO" | "CACHE" | "REDIS" | "DEFAULT";
    isStale: boolean;
}

// Extend cache keys for new data
export const YAHOO_CACHE_KEYS = {
    VIX: 'yahoo:vix',
    VIX3M: 'yahoo:vix3m',
    NQ: 'yahoo:nq',
    TNX: 'yahoo:tnx',
    SPX: 'yahoo:spx',
    BTC: 'yahoo:btc',
    GOLD: 'yahoo:gold',
    TLT: 'yahoo:tlt',
    OIL: 'yahoo:oil',
    RUT: 'yahoo:rut',
    SOX: 'yahoo:sox',
    USDKRW: 'yahoo:usdkrw',
    USDJPY: 'yahoo:usdjpy',
    // Actual index (regular session close) — distinct from futures
    IDX_NASDAQ: 'yahoo:idx:nasdaq',
    IDX_DOW: 'yahoo:idx:dow',
    IDX_SPX: 'yahoo:idx:spx',
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
export async function getYahooDataSSOT(): Promise<{ vix: YahooQuote; vix3m: YahooQuote; nq: YahooQuote; tnx: YahooQuote; spx: YahooQuote; btc: YahooQuote; gold: YahooQuote; tlt: YahooQuote; oil: YahooQuote; rut: YahooQuote; sox: YahooQuote }> {
    const [redisVix, redisVix3m, redisNq, redisTnx, redisSpx, redisBtc, redisGold, redisTlt, redisOil, redisRut, redisSox] = await Promise.all([
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.VIX),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.VIX3M),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.NQ),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.TNX),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.SPX),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.BTC),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.GOLD),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.TLT),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.OIL),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.RUT),
        getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.SOX)
    ]);

    return {
        vix: redisVix || getDefaultQuote('^VIX', 15),
        vix3m: redisVix3m || getDefaultQuote('^VIX3M', 18),
        nq: redisNq || getDefaultQuote('NQ=F', 21000),
        tnx: redisTnx || getDefaultQuote('^TNX', 4.2),
        spx: redisSpx || getDefaultQuote('ES=F', 6800),
        btc: redisBtc || getDefaultQuote('BTC-USD', 97000),
        gold: redisGold || getDefaultQuote('GC=F', 2900),
        tlt: redisTlt || getDefaultQuote('TLT', 90),
        oil: redisOil || getDefaultQuote('CL=F', 70),
        rut: redisRut || getDefaultQuote('RTY=F', 2650),
        sox: redisSox || getDefaultQuote('^SOX', 5200)
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
