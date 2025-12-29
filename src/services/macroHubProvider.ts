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
    DXY: "DX-Y.NYB"
};

// [S-48.3] Yahoo Finance Fetcher
async function fetchYahooQuote(symbol: string, label: string): Promise<MacroFactor> {
    try {
        const pkg = require('yahoo-finance2');
        const YahooFinance = pkg.default || pkg;
        const yf = new YahooFinance();

        const quote = await yf.quote(symbol);

        if (quote && quote.regularMarketPrice != null) {
            return {
                level: quote.regularMarketPrice,
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

// --- Main SSOT Provider ---
export async function getMacroSnapshotSSOT(): Promise<MacroSnapshot> {
    const now = Date.now();

    // Cache Check - return with updated ageSeconds
    if (cache.data && cache.expiry > now) {
        cache.data.ageSeconds = Math.floor((now - cache.fetchedAt) / 1000);
        return cache.data;
    }

    console.log('[MacroHub] Fetching fresh macro data (TTL 45s)...');
    const marketStatus = await getMarketStatusSSOT();
    const fetchedAtET = new Date().toISOString();

    // Parallel Fetch from Yahoo Finance
    const [nasdaq100, vix, us10y, dxy] = await Promise.all([
        fetchYahooQuote(SYMBOLS.NDX, "NASDAQ 100"),
        fetchYahooQuote(SYMBOLS.VIX, "VIX"),
        fetchYahooQuote(SYMBOLS.US10Y, "US10Y"),
        fetchYahooQuote(SYMBOLS.DXY, "DXY")
    ]);

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
        // [Phase 7] Flattened access for convenience
        nq: nasdaq100.level ?? 0,
        nqChangePercent: nasdaq100.chgPct ?? 0,
        vix: vix.level ?? 0,
        us10y: us10y.level ?? 0,
        dxy: dxy.level ?? 0
    };

    cache = { data: snapshot, expiry: now + CACHE_TTL_MS, fetchedAt: now };
    console.log(`[MacroHub] Cached: NDX=${snapshot.nq?.toFixed(0)}, VIX=${snapshot.vix?.toFixed(2)}`);
    return snapshot;
}
