// [Phase 22.3] App Router Debug Probe with Full Error Capture
// Path: /api/debug/probe

import { NextRequest, NextResponse } from "next/server";
import { CentralDataHub } from "@/services/centralDataHub";

export const runtime = "nodejs";
export const maxDuration = 30;

// Direct Yahoo Finance test with FULL error object capture
async function testYahooSymbol(symbol: string): Promise<{
    success: boolean;
    data: any;
    fullError: any;
}> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pkg = require("yahoo-finance2");
        const YahooFinance = pkg.default || pkg;
        const yf = new YahooFinance();

        console.log(`[PROBE] Testing Yahoo symbol: ${symbol}`);

        // 5-second timeout
        const quotePromise = yf.quote(symbol);
        const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error("TIMEOUT_5000ms")), 5000)
        );

        const quote = await Promise.race([quotePromise, timeoutPromise]);

        if (!quote) {
            return {
                success: false,
                data: null,
                fullError: { message: "Empty response from Yahoo", type: "EMPTY_RESPONSE" }
            };
        }

        return {
            success: true,
            data: {
                symbol: quote.symbol,
                regularMarketPrice: quote.regularMarketPrice,
                regularMarketChange: quote.regularMarketChange,
                marketState: quote.marketState,
                quoteType: quote.quoteType
            },
            fullError: null
        };
    } catch (e: any) {
        // Capture FULL error object - don't hide anything
        const fullError: any = {
            name: e.name || "Error",
            message: e.message || String(e),
            code: e.code || null,
            stack: e.stack?.split("\n").slice(0, 5).join("\n") || null // Truncate stack
        };

        if (e.response) {
            fullError.httpStatus = e.response.status;
            fullError.httpStatusText = e.response.statusText;
        }

        if (e.result) {
            fullError.yahooResult = e.result;
        }

        console.error(`[PROBE] Yahoo ${symbol} FULL ERROR:`, JSON.stringify(fullError, null, 2));

        return {
            success: false,
            data: null,
            fullError: fullError
        };
    }
}

export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get("ticker") || "NVDA";
    const startTime = Date.now();

    console.log(`[PROBE] ====== START ======`);
    console.log(`[PROBE] Time: ${new Date().toISOString()}`);

    const results: Record<string, any> = {
        probeVersion: "22.3-AppRouter",
        ticker,
        probeTime: new Date().toISOString(),
        serverInfo: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            nodeVersion: process.version,
            platform: process.platform,
            env: process.env.NODE_ENV,
            vercel: process.env.VERCEL ? "YES" : "NO"
        },
        centralHub: {},
        yahooComparison: {}
    };

    // [Phase 24] Test Central Data Hub
    try {
        console.log(`[PROBE] Testing CentralDataHub for ${ticker}...`);
        const hubQuote = await CentralDataHub.getQuote(ticker);
        results.centralHub = {
            status: "OK",
            data: hubQuote
        };
    } catch (e: any) {
        console.error(`[PROBE] CentralDataHub Failed:`, e);
        results.centralHub = {
            status: "FAIL",
            error: e.message
        };
    }

    // === COMPARATIVE TEST: VIX (control) vs NQ=F (test subject) ===
    console.log(`[PROBE] Running comparative Yahoo test...`);

    // Control: ^VIX (should always work)
    const vixResult = await testYahooSymbol("^VIX");
    results.yahooComparison["^VIX"] = {
        status: vixResult.success ? "OK" : "FAIL",
        price: vixResult.data?.regularMarketPrice || null,
        error: vixResult.fullError
    };

    // Test Subject: NQ=F (may fail)
    const nqfResult = await testYahooSymbol("NQ=F");
    results.yahooComparison["NQ=F"] = {
        status: nqfResult.success ? "OK" : "FAIL",
        price: nqfResult.data?.regularMarketPrice || null,
        error: nqfResult.fullError
    };

    // Additional test
    const ndxResult = await testYahooSymbol("^NDX");
    results.yahooComparison["^NDX"] = {
        status: ndxResult.success ? "OK" : "FAIL",
        price: ndxResult.data?.regularMarketPrice || null,
        error: ndxResult.fullError
    };

    const elapsed = Date.now() - startTime;
    results.elapsedMs = elapsed;

    // Quick Summary
    const okCount = Object.values(results.yahooComparison).filter((r: any) => r.status === "OK").length;
    results.summary = {
        yahooOk: okCount,
        yahooFail: 3 - okCount,
        vixPrice: results.yahooComparison["^VIX"].price,
        nqfPrice: results.yahooComparison["NQ=F"].price,
        nqfStatus: results.yahooComparison["NQ=F"].status,
        nqfError: results.yahooComparison["NQ=F"].error?.message || null,
        centralHubStatus: results.centralHub.status,
        diagnosis: nqfResult.success
            ? "NQ=F is working!"
            : `NQ=F FAILED: ${nqfResult.fullError?.message || "Unknown"}`
    };

    console.log(`[PROBE] ====== END ======`);
    console.log(`[PROBE] Summary:`, JSON.stringify(results.summary));

    return NextResponse.json(results, {
        status: 200,
        headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache"
        }
    });
}
