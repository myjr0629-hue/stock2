// [Phase 22.2] Enhanced Debug Probe Endpoint
// Returns raw API responses with full error stack traces for Vercel debugging

import { NextRequest, NextResponse } from "next/server";
import { fetchMassive } from "@/services/massiveClient";

export const runtime = 'nodejs';
export const maxDuration = 30; // 30s for Vercel

// Deep Yahoo Finance test with full error capture
async function testYahooSymbol(symbol: string): Promise<{
    success: boolean;
    data: any;
    error: string | null;
    errorStack: string | null;
    httpInfo: any;
}> {
    try {
        const pkg = require('yahoo-finance2');
        const YahooFinance = pkg.default || pkg;
        const yf = new YahooFinance();

        // Log the exact symbol being requested
        console.log(`[YAHOO_DEBUG] Requesting symbol: "${symbol}" (length: ${symbol.length})`);
        console.log(`[YAHOO_DEBUG] URL encoded: ${encodeURIComponent(symbol)}`);

        // 5-second timeout (longer for debugging)
        const quotePromise = yf.quote(symbol);
        const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after 5000ms`)), 5000)
        );

        const quote = await Promise.race([quotePromise, timeoutPromise]);

        if (!quote) {
            return {
                success: false,
                data: null,
                error: "Empty response from Yahoo",
                errorStack: null,
                httpInfo: { symbolRequested: symbol }
            };
        }

        return {
            success: true,
            data: {
                symbol: quote.symbol,
                regularMarketPrice: quote.regularMarketPrice,
                regularMarketChange: quote.regularMarketChange,
                regularMarketChangePercent: quote.regularMarketChangePercent,
                marketState: quote.marketState,
                quoteType: quote.quoteType
            },
            error: null,
            errorStack: null,
            httpInfo: { symbolRequested: symbol, symbolReturned: quote.symbol }
        };
    } catch (e: any) {
        // Capture FULL error details including stack trace
        const errorStack = e.stack || null;
        const httpInfo: any = {
            symbolRequested: symbol,
            errorName: e.name,
            errorCode: e.code || null
        };

        // Check for specific HTTP error codes
        if (e.response) {
            httpInfo.httpStatus = e.response.status;
            httpInfo.httpStatusText = e.response.statusText;
        }

        console.error(`[YAHOO_DEBUG] Full Error for ${symbol}:`, e);
        console.error(`[YAHOO_DEBUG] Stack: ${errorStack}`);

        return {
            success: false,
            data: null,
            error: e.message || String(e),
            errorStack: errorStack,
            httpInfo: httpInfo
        };
    }
}

export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get("ticker") || "NVDA";
    const startTime = Date.now();

    console.log(`[DEBUG_PROBE] ====== PROBE START ======`);
    console.log(`[DEBUG_PROBE] Ticker: ${ticker}`);
    console.log(`[DEBUG_PROBE] Time: ${new Date().toISOString()}`);

    const results: Record<string, any> = {
        ticker,
        probeTime: new Date().toISOString(),
        serverInfo: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            nodeVersion: process.version,
            platform: process.platform,
            env: process.env.NODE_ENV
        },
        yahooTests: {},
        symbolEncodingTest: {},
        flow: null,
        trades: null,
        options: null,
        errors: []
    };

    // === SECTION 0: Symbol Encoding Test ===
    console.log(`[DEBUG_PROBE] Testing symbol encoding...`);
    const testSymbols = {
        'NQ=F_original': 'NQ=F',
        'NQ=F_encoded': encodeURIComponent('NQ=F'),
        'NQ%3DF_literal': 'NQ%3DF'
    };
    results.symbolEncodingTest = testSymbols;

    // === SECTION 1: Yahoo Finance Comparative Test ===
    console.log(`[DEBUG_PROBE] Testing Yahoo Finance symbols...`);

    // Test multiple symbol formats
    const yahooSymbols = [
        '^VIX',      // Should always work (no special chars)
        'NQ=F',      // Futures with = character
        '^NDX',      // Index
        '^TNX',      // Treasury
        '%5EVIX'     // Encoded version of ^VIX
    ];

    for (const sym of yahooSymbols) {
        console.log(`[DEBUG_PROBE] Testing: ${sym}`);
        const testResult = await testYahooSymbol(sym);
        results.yahooTests[sym] = testResult;
        console.log(`[DEBUG_PROBE] Yahoo ${sym}: ${testResult.success ? 'OK' : 'FAIL'}`);
        if (!testResult.success) {
            console.log(`[DEBUG_PROBE] Error: ${testResult.error}`);
        }
    }

    // === SECTION 2: Polygon/Massive API Tests ===
    console.log(`[DEBUG_PROBE] Testing Polygon/Massive APIs...`);

    // 2a. Flow Snapshot
    try {
        const flowResp = await fetchMassive(
            `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`,
            {},
            false
        );
        results.flow = {
            vol: flowResp?.ticker?.day?.v || 0,
            prevClose: flowResp?.ticker?.prevDay?.c || 0,
            lastTrade: flowResp?.ticker?.lastTrade?.p || 0,
            status: "OK"
        };
    } catch (e: any) {
        results.errors.push({ stage: "flow", error: e.message });
        results.flow = { status: "FAIL", error: e.message };
    }

    // 2b. Trades
    try {
        const tradesResp = await fetchMassive(
            `/v3/trades/${ticker}`,
            { limit: "20" },
            false
        );
        results.trades = {
            count: tradesResp?.results?.length || 0,
            status: "OK"
        };
    } catch (e: any) {
        results.errors.push({ stage: "trades", error: e.message });
        results.trades = { status: "FAIL", error: e.message };
    }

    // 2c. Options
    try {
        const optionsResp = await fetchMassive(
            `/v3/snapshot/options/${ticker}`,
            { limit: "5" },
            false
        );
        results.options = {
            count: optionsResp?.results?.length || 0,
            status: "OK"
        };
    } catch (e: any) {
        results.errors.push({ stage: "options", error: e.message });
        results.options = { status: "FAIL", error: e.message };
    }

    const elapsed = Date.now() - startTime;
    results.elapsedMs = elapsed;

    // Summary
    const yahooOkCount = Object.values(results.yahooTests).filter((t: any) => t.success).length;
    const yahooFailCount = Object.values(results.yahooTests).filter((t: any) => !t.success).length;

    // Extract NQ=F specifically for quick check
    const nqfResult = results.yahooTests['NQ=F'];

    results.summary = {
        yahooOk: yahooOkCount,
        yahooFail: yahooFailCount,
        polygonErrors: results.errors.length,
        nqfSuccess: nqfResult?.success || false,
        nqfPrice: nqfResult?.data?.regularMarketPrice || null,
        nqfError: nqfResult?.error || null,
        status: results.errors.length === 0 && yahooFailCount === 0 ? "ALL_OK" : "PARTIAL_FAIL"
    };

    console.log(`[DEBUG_PROBE] ====== PROBE END ======`);
    console.log(`[DEBUG_PROBE] Elapsed: ${elapsed}ms, Yahoo: ${yahooOkCount}/${yahooSymbols.length}, NQ=F: ${results.summary.nqfPrice || 'FAIL'}`);

    return NextResponse.json(results, {
        status: 200,
        headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache"
        }
    });
}
