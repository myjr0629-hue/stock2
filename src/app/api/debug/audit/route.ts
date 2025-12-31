
import { NextRequest, NextResponse } from "next/server";
import { getMacroSnapshotSSOT } from "@/services/macroHubProvider";
import { getOptionsData } from "@/services/stockApi";
import { getStockData } from "@/services/stockApi";

export async function GET(request: NextRequest) {
    const logs: string[] = [];
    const log = (msg: string) => logs.push(msg);

    log("=== MASSIVE API NATIVE AUDIT ===");

    // 1. RSI Check
    try {
        const nvda = await getStockData('NVDA');
        log(`[RSI Check] NVDA: ${nvda.rsi?.toFixed(1) || 'NULL'} (Source: Massive Native/Aggs)`);
    } catch (e: any) {
        log(`[RSI Check] Failed: ${e.message}`);
    }

    // 2. Macro Check
    try {
        const macro = await getMacroSnapshotSSOT();
        const nq = macro.factors.nasdaq100;
        const vix = macro.factors.vix;
        const us10y = macro.factors.us10y;

        log(`[Macro] NDX/QQQ: ${nq.label} - Status: ${nq.status}`);
        log(`[Macro] VIX/VIXY: ${vix.level} (Source: ${vix.symbolUsed})`);
        log(`[Macro] US10Y: ${us10y.level}% (Source: ${us10y.source}) - ${us10y.status}`);
    } catch (e: any) {
        log(`[Macro Check] Failed: ${e.message}`);
    }

    // 3. Options Check
    try {
        const od = await getOptionsData('NVDA');
        log(`[Options] NVDA Expiry: ${od.expirationDate}`);
        log(`[Options] Contracts Found: ${od.strikes.length} strikes plotted`);
        log(`[Options] GEX: ${od.gems?.gex}`);
        log(`[Options] Comment: ${od.gems?.comment}`);
    } catch (e: any) {
        log(`[Options Check] Failed: ${e.message}`);
    }

    return NextResponse.json({ logs });
}
