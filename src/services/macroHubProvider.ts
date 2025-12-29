import { MarketStatusResult, getMarketStatusSSOT } from "./marketStatusProvider";

// [S-48.3] Yahoo Finance Exclusive SSOT
// 4 Indices: NDX, VIX, US10Y, DXY
export interface MacroFactor {
    level: number | null;
    chgPct?: number | null;
    chgAbs?: number | null;
    label: string;
    source: "YAHOO" | "FAIL";
    status: "OK" | "UNAVAILABLE";
    symbolUsed: string;
}

export interface MacroSnapshot {
    asOfET: string;
    fetchedAtET: string;       // [Phase 7] Exact fetch timestamp
    ageSeconds: number;        // [Phase 7] Age of data in seconds
    marketStatus: MarketStatusResult;
    factors: {
        nasdaq100: MacroFactor;
        vix: MacroFactor;
        us10y: MacroFactor;
        dxy: MacroFactor;
    };
    // [Phase 7] Flattened for easy access
    nq?: number;
    nqChangePercent?: number;
    vix?: number;
    us10y?: number;
    dxy?: number;
}

// [Phase 7] TTL 45 seconds for macro data
const CACHE_TTL_MS = 45000; // 45s
let cache: { data: MacroSnapshot | null; expiry: number; fetchedAt: number } = { data: null, expiry: 0, fetchedAt: 0 };

// Yahoo Finance Symbols
const SYMBOLS = {
    NDX: "^NDX",
    VIX: "^VIX",
    US10Y: "^TNX",
    DXY: "DX-Y.NYB",
    NQF: "NQ=F" // [Phase 17] Added Futures
};

// [S-48.3] Yahoo Finance Fetcher (Vercel-Safe)
// Inject User-Agent to bypass Vercel/Cloudflare blocks
try {
    const pkg = require('yahoo-finance2');
    const YahooFinance = pkg.default || pkg;
    YahooFinance.setGlobalConfig({
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        logger: {
            info: (...args: any[]) => { },
            warn: (...args: any[]) => { },
            error: (...args: any[]) => { } // Suppress noisy Vercel logs
        }
    });
} catch (e) { }

async function fetchYahooQuote(symbol: string, label: string): Promise<MacroFactor> {
    try {
        const pkg = require('yahoo-finance2');
        const YahooFinance = pkg.default || pkg;
        const yf = new YahooFinance(); // Uses global config

        const quote = await yf.quote(symbol);

        if (quote && (quote.regularMarketPrice != null || quote.ask != null)) {
            const price = quote.regularMarketPrice || quote.ask || 0;
            console.log(`[Alpha] NQ=F Fetch Result: ${symbol} = ${price}`); // [Phase 20] Verification Log
            return {
                level: price,
                chgPct: quote.regularMarketChangePercent ?? null,
                chgAbs: quote.regularMarketChange ?? null,
                label,
                source: "YAHOO",
                status: "OK",
                symbolUsed: symbol
            };
        }

        return createFailFactor(label, symbol);
    } catch (e: any) {
        console.error(`[MacroHub] Yahoo Error ${symbol}: ${e.message}`);
        return createFailFactor(label, symbol);
    }
}

function createFailFactor(label: string, symbolUsed: string): MacroFactor {
    return {
        level: null,
        chgPct: null,
        chgAbs: null,
        label,
        source: "FAIL",
        status: "UNAVAILABLE",
        symbolUsed
    };
}

// Fallback logic for NDX
async function fetchMassiveNDXFallback(): Promise<MacroFactor | null> {
    try {
        // Import purely for fallback to avoid circular deps if possible
        const { fetchMassive } = require('./massiveClient');
        // Try I:NDX or just NDX
        const res = await fetchMassive(`/v2/snapshot/locale/us/markets/indices/tickers/I:NDX`, {}, false); // No cache for fallback
        const t = res?.ticker;
        if (t && t.day && t.day.c) {
            console.log(`[Alpha] Fallback NDX Success: ${t.day.c}`);
            return {
                level: t.day.c,
                chgPct: t.todaysChangePerc || 0,
                chgAbs: t.todaysChange || 0,
                label: "NASDAQ 100 (Fallback)",
                source: "YAHOO", // Use YAHOO type to satisfy interface but it's really Massive
                status: "OK",
                symbolUsed: "I:NDX"
            };
        }
    } catch (e) {
        console.error("[MacroHub] Massive NDX Fallback failed");
    }
    return null;
}

// --- Main SSOT Provider ---
export async function getMacroSnapshotSSOT(): Promise<MacroSnapshot> {
    const now = Date.now();

    // Cache Check
    if (cache.data && cache.expiry > now) {
        cache.data.ageSeconds = Math.floor((now - cache.fetchedAt) / 1000);
        return cache.data;
    }

    console.log('[MacroHub] Fetching fresh macro data (TTL 45s)...');
    const marketStatus = await getMarketStatusSSOT();
    const fetchedAtET = new Date().toISOString();

    const useFutures = marketStatus.market === 'closed' || marketStatus.market === 'extended-hours';

    // Parallel Fetch
    const promises = [
        fetchYahooQuote(SYMBOLS.NDX, "NASDAQ 100"),
        fetchYahooQuote(SYMBOLS.VIX, "VIX"),
        fetchYahooQuote(SYMBOLS.US10Y, "US10Y"),
        fetchYahooQuote(SYMBOLS.DXY, "DXY")
    ];

    if (useFutures) {
        promises.push(fetchYahooQuote(SYMBOLS.NQF, "NASDAQ 100 Futures"));
    }

    const results = await Promise.all(promises);
    let nasdaq100 = results[0];
    const vix = results[1];
    const us10y = results[2];
    const dxy = results[3];
    const futuresNq = useFutures ? results[4] : null;

    // [Phase 20] NDX Fallback
    if (nasdaq100.status !== 'OK') {
        const fallback = await fetchMassiveNDXFallback();
        if (fallback) nasdaq100 = fallback;
    }

    // [Phase 17] Futures Override
    if (useFutures && futuresNq && futuresNq.status === 'OK') {
        nasdaq100 = {
            ...futuresNq,
            label: "NASDAQ 100 (F)",
            symbolUsed: SYMBOLS.NQF
        };
    }

    const snapshot: MacroSnapshot = {
        asOfET: marketStatus.asOfET || fetchedAtET,
        fetchedAtET,
        ageSeconds: 0,
        marketStatus,
        factors: {
            nasdaq100,
            vix,
            us10y,
            dxy
        },
        nq: nasdaq100.level ?? 0,
        nqChangePercent: nasdaq100.chgPct ?? 0,
        vix: vix.level ?? 0,
        us10y: us10y.level ?? 0,
        dxy: dxy.level ?? 0
    };

    cache = { data: snapshot, expiry: now + CACHE_TTL_MS, fetchedAt: now };
    console.log(`[MacroHub] Cached: ${nasdaq100.label}=${snapshot.nq?.toFixed(0)}, VIX=${snapshot.vix?.toFixed(2)}`);
    return snapshot;
}
