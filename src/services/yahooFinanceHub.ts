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
// Yahoo Finance Fetcher (Single Call for Both VIX + NQ)
// ============================================================

/**
 * Fetch accurate previous close from daily candle data.
 * The chart API's `previousClose` for 24h instruments (BTC, futures) returns
 * the intraday start price, NOT the true previous session close.
 * Using range=5d&interval=1d gives us daily candle closes; the second-to-last
 * non-null close is the accurate previous close (matches Yahoo Finance website).
 */
async function fetchTruePreviousCloses(symbols: string[]): Promise<Map<string, number>> {
    const prevCloses = new Map<string, number>();

    const fetches = symbols.map(async (symbol) => {
        try {
            const encodedSymbol = encodeURIComponent(symbol);
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1d&range=5d`;

            const res = await fetch(url, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                signal: AbortSignal.timeout(5000)
            });

            if (!res.ok) return;

            const data = await res.json();
            const result = data?.chart?.result?.[0];
            const closes = result?.indicators?.quote?.[0]?.close as (number | null)[] | undefined;

            if (closes && closes.length >= 2) {
                // Filter out null (today's incomplete candle)
                const nonNullCloses = closes.filter((c): c is number => c !== null);
                if (nonNullCloses.length >= 2) {
                    prevCloses.set(symbol, nonNullCloses[nonNullCloses.length - 2]);
                }
            }
        } catch (e) {
            // Silently fail — will fall back to chart API's previousClose
        }
    });

    await Promise.all(fetches);
    return prevCloses;
}

/**
 * Fetch multiple quotes from Yahoo Finance with accurate change%
 * Step 1: Fetch real-time prices from chart API (interval=1m, range=1d)
 * Step 2: Fetch true previous close from daily candles (interval=1d, range=5d)
 * Step 3: Calculate change% using true previous close
 */
async function fetchYahooQuotes(symbols: string[]): Promise<Map<string, YahooQuote>> {
    const results = new Map<string, YahooQuote>();
    const now = new Date().toISOString();

    // Parallel: fetch real-time prices + accurate previous closes
    const [, truePrevCloses] = await Promise.all([
        (async () => {
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

                    results.set(symbol, {
                        symbol,
                        price: meta.regularMarketPrice,
                        prevClose: meta.previousClose || meta.regularMarketPrice,
                        change: 0,
                        changePct: 0,
                        updatedAt: now,
                        source: "YAHOO",
                        isStale: false
                    });
                } catch (e) {
                    console.warn(`[Yahoo] ${symbol} fetch failed:`, e);
                }
            }
        })(),
        fetchTruePreviousCloses(symbols)
    ]);

    // Apply true previous close and recalculate change%
    for (const [symbol, quote] of results) {
        const truePrevClose = truePrevCloses.get(symbol);
        if (truePrevClose && truePrevClose > 0) {
            quote.prevClose = truePrevClose;
        }
        quote.change = quote.price - quote.prevClose;
        quote.changePct = quote.prevClose > 0 ? (quote.change / quote.prevClose) * 100 : 0;

        console.log(`[Yahoo] ${symbol}: ${quote.price.toFixed(2)} (${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%) [prevClose=${quote.prevClose.toFixed(2)}]`);
    }

    return results;
}

/**
 * Get Yahoo data with rate limiting and Redis persistence
 * Returns both VIX and NQ in single call
 */
export async function getYahooDataSSOT(): Promise<{ vix: YahooQuote; nq: YahooQuote; tnx: YahooQuote; spx: YahooQuote; btc: YahooQuote; gold: YahooQuote; oil: YahooQuote; rut: YahooQuote }> {
    const now = Date.now();
    const timeSinceLastFetch = now - memoryCache.lastFetch;

    // 1. Check if we should fetch from Yahoo (rate limit: 1 min)
    if (timeSinceLastFetch >= RATE_LIMIT_MS) {
        console.log(`[Yahoo] Fetching fresh data (${Math.floor(timeSinceLastFetch / 1000)}s since last fetch)`);

        const quotes = await fetchYahooQuotes(['^VIX', 'NQ=F', '^TNX', '^GSPC', 'BTC-USD', 'GC=F', 'CL=F', '^RUT']);

        const vixQuote = quotes.get('^VIX');
        const nqQuote = quotes.get('NQ=F');
        const tnxQuote = quotes.get('^TNX');
        const spxQuote = quotes.get('^GSPC');
        const btcQuote = quotes.get('BTC-USD');
        const goldQuote = quotes.get('GC=F');
        const oilQuote = quotes.get('CL=F');
        const rutQuote = quotes.get('^RUT');

        if (vixQuote) {
            memoryCache.vix = vixQuote;
            setInCache(YAHOO_CACHE_KEYS.VIX, vixQuote).catch(() => { });
        }

        if (nqQuote) {
            memoryCache.nq = nqQuote;
            setInCache(YAHOO_CACHE_KEYS.NQ, nqQuote).catch(() => { });
        }

        if (tnxQuote) {
            memoryCache.tnx = tnxQuote;
            setInCache(YAHOO_CACHE_KEYS.TNX, tnxQuote).catch(() => { });
        }

        if (spxQuote) {
            memoryCache.spx = spxQuote;
            setInCache(YAHOO_CACHE_KEYS.SPX, spxQuote).catch(() => { });
        }

        if (btcQuote) {
            memoryCache.btc = btcQuote;
            setInCache(YAHOO_CACHE_KEYS.BTC, btcQuote).catch(() => { });
        }

        if (goldQuote) {
            memoryCache.gold = goldQuote;
            setInCache(YAHOO_CACHE_KEYS.GOLD, goldQuote).catch(() => { });
        }

        if (oilQuote) {
            memoryCache.oil = oilQuote;
            setInCache(YAHOO_CACHE_KEYS.OIL, oilQuote).catch(() => { });
        }

        if (rutQuote) {
            memoryCache.rut = rutQuote;
            setInCache(YAHOO_CACHE_KEYS.RUT, rutQuote).catch(() => { });
        }

        if (vixQuote || nqQuote || tnxQuote || spxQuote || btcQuote || goldQuote || oilQuote || rutQuote) {
            memoryCache.lastFetch = now;
        }
    } else {
        console.log(`[Yahoo] Using cached data (${Math.floor(timeSinceLastFetch / 1000)}s old, next fetch in ${Math.ceil((RATE_LIMIT_MS - timeSinceLastFetch) / 1000)}s)`);
    }

    // 2. Return from memory cache if available
    if (memoryCache.vix && memoryCache.nq) {
        const cacheSource = (q: YahooQuote) => ({ ...q, source: q.source === "YAHOO" ? "YAHOO" as const : "CACHE" as const, isStale: q.source !== "YAHOO" });
        return {
            vix: cacheSource(memoryCache.vix),
            nq: cacheSource(memoryCache.nq),
            tnx: memoryCache.tnx ? cacheSource(memoryCache.tnx) : getDefaultQuote('^TNX', 4.2),
            spx: memoryCache.spx ? cacheSource(memoryCache.spx) : getDefaultQuote('^GSPC', 6000),
            btc: memoryCache.btc ? cacheSource(memoryCache.btc) : getDefaultQuote('BTC-USD', 97000),
            gold: memoryCache.gold ? cacheSource(memoryCache.gold) : getDefaultQuote('GC=F', 2900),
            oil: memoryCache.oil ? cacheSource(memoryCache.oil) : getDefaultQuote('CL=F', 70),
            rut: memoryCache.rut ? cacheSource(memoryCache.rut) : getDefaultQuote('^RUT', 2280)
        };
    }

    // 3. Try Redis cache (survives server restarts)
    console.log('[Yahoo] Memory cache empty, trying Redis...');

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

    if (redisVix) {
        memoryCache.vix = redisVix;
        console.log(`[Yahoo] VIX from Redis: ${redisVix.price}`);
    }

    if (redisNq) {
        memoryCache.nq = redisNq;
        console.log(`[Yahoo] NQ from Redis: ${redisNq.price}`);
    }

    if (redisTnx) {
        memoryCache.tnx = redisTnx;
        console.log(`[Yahoo] TNX (US10Y) from Redis: ${redisTnx.price}`);
    }

    if (redisSpx) {
        memoryCache.spx = redisSpx;
        console.log(`[Yahoo] SPX from Redis: ${redisSpx.price}`);
    }

    if (redisBtc) {
        memoryCache.btc = redisBtc;
        console.log(`[Yahoo] BTC from Redis: ${redisBtc.price}`);
    }

    if (redisGold) {
        memoryCache.gold = redisGold;
        console.log(`[Yahoo] GOLD from Redis: ${redisGold.price}`);
    }

    if (redisOil) {
        memoryCache.oil = redisOil;
        console.log(`[Yahoo] OIL from Redis: ${redisOil.price}`);
    }

    if (redisRut) {
        memoryCache.rut = redisRut;
        console.log(`[Yahoo] RUT from Redis: ${redisRut.price}`);
    }

    // 4. Return what we have (with defaults for missing)
    return {
        vix: memoryCache.vix || getDefaultQuote('^VIX', 15),
        nq: memoryCache.nq || getDefaultQuote('NQ=F', 21000),
        tnx: memoryCache.tnx || getDefaultQuote('^TNX', 4.2),
        spx: memoryCache.spx || getDefaultQuote('^GSPC', 6000),
        btc: memoryCache.btc || getDefaultQuote('BTC-USD', 97000),
        gold: memoryCache.gold || getDefaultQuote('GC=F', 2900),
        oil: memoryCache.oil || getDefaultQuote('CL=F', 70),
        rut: memoryCache.rut || getDefaultQuote('^RUT', 2280)
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
