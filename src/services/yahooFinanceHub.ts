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
// Yahoo Finance Fetcher
// ============================================================

/**
 * Fetch multiple quotes from Yahoo Finance with accurate change%
 * Uses meta.previousClose from chart API directly (matches Yahoo Finance website).
 * Previously used a separate fetchTruePreviousCloses() call that picked wrong
 * daily candle closes during holidays/weekends, causing chgPct errors.
 */
async function fetchYahooQuotes(symbols: string[]): Promise<Map<string, YahooQuote>> {
    const results = new Map<string, YahooQuote>();
    const now = new Date().toISOString();

    // Fetch real-time prices sequentially (avoid rate limiting)
    for (const symbol of symbols) {
        try {
            const encodedSymbol = encodeURIComponent(symbol);
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1m&range=1d`;

            const res = await fetch(url, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                signal: AbortSignal.timeout(5000)
            });

            if (!res.ok) {
                console.warn(`[Yahoo] ${symbol} returned ${res.status}`);
                continue;
            }

            const data = await res.json();
            const meta = data?.chart?.result?.[0]?.meta;

            if (!meta?.regularMarketPrice) {
                console.warn(`[Yahoo] ${symbol} missing market price`);
                continue;
            }

            // Use meta.previousClose directly — this matches Yahoo Finance website
            // chartPreviousClose is identical but kept as fallback
            const price = meta.regularMarketPrice;
            const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
            const change = price - prevClose;
            const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

            results.set(symbol, {
                symbol,
                price,
                prevClose,
                change,
                changePct,
                updatedAt: now,
                source: "YAHOO",
                isStale: false
            });

            console.log(`[Yahoo] ${symbol}: ${price.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%) [prevClose=${prevClose.toFixed(2)}]`);
        } catch (e) {
            console.warn(`[Yahoo] ${symbol} fetch failed:`, e);
        }
    }

    return results;
}

/**
 * Get Yahoo data — Redis only (NEVER call Yahoo directly from serverless)
 * Yahoo data is populated into Redis by the local dev server.
 * Serverless functions only READ from Redis.
 */
export async function getYahooDataSSOT(): Promise<{ vix: YahooQuote; nq: YahooQuote; tnx: YahooQuote; spx: YahooQuote; btc: YahooQuote; gold: YahooQuote; oil: YahooQuote; rut: YahooQuote }> {
    // 1. Return from memory cache if available (fast path)
    if (memoryCache.vix && memoryCache.nq) {
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

    // 2. Read from Redis (populated by dev server)
    console.log('[Yahoo] Reading macro data from Redis...');

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

    // Populate memory cache from Redis
    if (redisVix) { memoryCache.vix = redisVix; }
    if (redisNq) { memoryCache.nq = redisNq; }
    if (redisTnx) { memoryCache.tnx = redisTnx; }
    if (redisSpx) { memoryCache.spx = redisSpx; }
    if (redisBtc) { memoryCache.btc = redisBtc; }
    if (redisGold) { memoryCache.gold = redisGold; }
    if (redisOil) { memoryCache.oil = redisOil; }
    if (redisRut) { memoryCache.rut = redisRut; }

    const redisHits = [redisVix, redisNq, redisTnx, redisSpx, redisBtc, redisGold, redisOil, redisRut].filter(Boolean).length;
    console.log(`[Yahoo] Redis: ${redisHits}/8 symbols loaded`);

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
