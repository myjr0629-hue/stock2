// [Phase 22] Debug Probe Endpoint
// Returns raw API responses for a single ticker to validate Vercel data reception

import { NextRequest, NextResponse } from "next/server";
import { fetchMassive } from "@/services/massiveClient";
import { getMacroSnapshotSSOT } from "@/services/macroHubProvider";

export const runtime = 'nodejs';
export const maxDuration = 30; // 30s for Vercel

export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get("ticker") || "NVDA";
    const startTime = Date.now();

    console.log(`[DEBUG_PROBE] Starting probe for ${ticker}`);

    const results: Record<string, any> = {
        ticker,
        probeTime: new Date().toISOString(),
        flow: null,
        trades: null,
        options: null,
        macro: null,
        errors: []
    };

    // 1. Flow Snapshot
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

    // 2. Trades Sample
    try {
        const tradesResp = await fetchMassive(
            `/v3/trades/${ticker}`,
            { limit: "50", sort: "timestamp", order: "desc" },
            false
        );
        results.trades = {
            count: tradesResp?.results?.length || 0,
            sample: (tradesResp?.results || []).slice(0, 5).map((t: any) => ({
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

    // 3. Options Snapshot (probe only)
    try {
        const optionsResp = await fetchMassive(
            `/v3/snapshot/options/${ticker}`,
            { limit: "20" },
            false
        );
        results.options = {
            count: optionsResp?.results?.length || 0,
            sample: (optionsResp?.results || []).slice(0, 3).map((c: any) => ({
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

    // 4. Macro (NQ=F, VIX)
    try {
        const macro = await getMacroSnapshotSSOT();
        results.macro = {
            nq: macro.nq,
            nqLabel: macro.factors?.nasdaq100?.label,
            vix: macro.vix,
            us10y: macro.us10y,
            source: macro.factors?.nasdaq100?.source
        };
        console.log(`[DEBUG_PROBE] Macro OK: NQ=${results.macro.nq}`);
    } catch (e: any) {
        results.errors.push({ stage: "macro", error: e.message });
        console.error(`[DEBUG_PROBE] Macro Error: ${e.message}`);
    }

    const elapsed = Date.now() - startTime;
    results.elapsedMs = elapsed;
    results.status = results.errors.length === 0 ? "ALL_OK" : "PARTIAL_FAIL";

    console.log(`[DEBUG_PROBE] Complete in ${elapsed}ms. Status: ${results.status}`);

    return NextResponse.json(results, {
        status: 200,
        headers: { "Cache-Control": "no-store" }
    });
}
