// [Phase 22] Debug Probe Endpoint
// Returns raw API responses for a single ticker to validate Vercel data reception

import { NextRequest, NextResponse } from "next/server";
import { fetchMassive } from "@/services/massiveClient";

export const runtime = 'nodejs';
export const maxDuration = 30; // 30s for Vercel

// Direct Yahoo Finance test (not via macroHubProvider)
async function testYahooSymbol(symbol: string): Promise<{ success: boolean; data: any; error: string | null }> {
    try {
        const pkg = require('yahoo-finance2');
        const YahooFinance = pkg.default || pkg;
        const yf = new YahooFinance();

        // 3-second timeout
        const quotePromise = yf.quote(symbol);
        const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after 3000ms`)), 3000)
        );

        const quote = await Promise.race([quotePromise, timeoutPromise]);

        if (!quote) {
            return { success: false, data: null, error: "Empty response from Yahoo" };
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
            error: null
        };
    } catch (e: any) {
        // Return FULL raw error message (no hiding)
        return {
            success: false,
            data: null,
            error: e.message || String(e)
        };
    }
}

export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get("ticker") || "NVDA";
    const startTime = Date.now();

    console.log(`[DEBUG_PROBE] Starting probe for ${ticker}`);

    const results: Record<string, any> = {
        ticker,
        probeTime: new Date().toISOString(),
        serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        yahooTests: {},
        flow: null,
        trades: null,
        options: null,
        errors: []
    };

    // === SECTION 1: Yahoo Finance Comparative Test ===
    // Test both VIX (should work) and NQ=F (might fail) side by side
    console.log(`[DEBUG_PROBE] Testing Yahoo Finance symbols...`);

    const yahooSymbols = ['^VIX', 'NQ=F', '^NDX', '^TNX'];
    for (const sym of yahooSymbols) {
        const testResult = await testYahooSymbol(sym);
        results.yahooTests[sym] = testResult;
        console.log(`[DEBUG_PROBE] Yahoo ${sym}: ${testResult.success ? 'OK' : 'FAIL'} ${testResult.error || ''}`);
    }

    // === SECTION 2: Polygon/Massive API Tests ===

    // 2a. Flow Snapshot
    try {
        const flowResp = await fetchMassive(
            `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`,
            {},
            false // No cache
        );
        results.flow = {
            raw: flowResp?.ticker || null,
            vol: flowResp?.ticker?.day?.v || 0,
            prevClose: flowResp?.ticker?.prevDay?.c || 0,
            lastTrade: flowResp?.ticker?.lastTrade?.p || 0
        };
        console.log(`[DEBUG_PROBE] Flow OK: vol=${results.flow.vol}`);
    } catch (e: any) {
        results.errors.push({ stage: "flow", error: e.message });
        console.error(`[DEBUG_PROBE] Flow Error: ${e.message}`);
    }

    // 2b. Trades Sample
    try {
        const tradesResp = await fetchMassive(
            `/v3/trades/${ticker}`,
            { limit: "50", sort: "timestamp", order: "desc" },
            false
        );
        results.trades = {
            count: tradesResp?.results?.length || 0,
            sample: (tradesResp?.results || []).slice(0, 3).map((t: any) => ({
                price: t.price,
                size: t.size,
                conditions: t.conditions
            }))
        };
        console.log(`[DEBUG_PROBE] Trades OK: count=${results.trades.count}`);
    } catch (e: any) {
        results.errors.push({ stage: "trades", error: e.message });
        console.error(`[DEBUG_PROBE] Trades Error: ${e.message}`);
    }

    // 2c. Options Snapshot
    try {
        const optionsResp = await fetchMassive(
            `/v3/snapshot/options/${ticker}`,
            { limit: "10" },
            false
        );
        results.options = {
            count: optionsResp?.results?.length || 0,
            sample: (optionsResp?.results || []).slice(0, 2).map((c: any) => ({
                strike: c.details?.strike_price || c.strike_price,
                type: c.details?.contract_type || c.contract_type,
                oi: c.open_interest
            }))
        };
        console.log(`[DEBUG_PROBE] Options OK: count=${results.options.count}`);
    } catch (e: any) {
        results.errors.push({ stage: "options", error: e.message });
        console.error(`[DEBUG_PROBE] Options Error: ${e.message}`);
    }

    const elapsed = Date.now() - startTime;
    results.elapsedMs = elapsed;

    // Summary
    const yahooOkCount = Object.values(results.yahooTests).filter((t: any) => t.success).length;
    const yahooFailCount = Object.values(results.yahooTests).filter((t: any) => !t.success).length;
    results.summary = {
        yahooOk: yahooOkCount,
        yahooFail: yahooFailCount,
        polygonErrors: results.errors.length,
        status: results.errors.length === 0 && yahooFailCount === 0 ? "ALL_OK" : "PARTIAL_FAIL"
    };

    console.log(`[DEBUG_PROBE] Complete in ${elapsed}ms. Yahoo: ${yahooOkCount}/${yahooSymbols.length} OK`);

    return NextResponse.json(results, {
        status: 200,
        headers: { "Cache-Control": "no-store" }
    });
}
