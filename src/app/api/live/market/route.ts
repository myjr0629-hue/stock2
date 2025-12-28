import { NextResponse } from 'next/server';
import { getMacroSnapshotSSOT } from '@/services/macroHubProvider';

export const revalidate = 30; // 30s TTL

export async function GET() {
    // [S-48.2] Converted to use MacroHub SSOT (Massive Direct Only)
    // Yahoo Finance & DXY Removed.

    const snapshot = await getMacroSnapshotSSOT();
    const { marketStatus, factors } = snapshot;
    const { nasdaq100, vix, us10y } = factors;

    // Mapping to legacy response format for compatibility
    // DXY is removed from response structure as per S-48.2 policy

    const sourceGrade = "A"; // Massive Direct assumed High Quality

    const ndxObj = {
        symbol: "I:NDX",
        price: nasdaq100.level ?? null,
        changePct: nasdaq100.chgPct ?? null
    };
    const vixObj = {
        symbol: "I:VIX",
        price: vix.level ?? null,
        changePct: vix.chgPct ?? null
    };
    const us10yObj = {
        symbol: "I:TNX",
        yield: us10y.level ?? null,
        changeBp: null // Massive Snapshot lacks daily BP change often, null is safer
    };

    // [S-48.2] Regime Logic updated to SSOT
    let regime: "RISK_ON" | "NEUTRAL" | "RISK_OFF" = "NEUTRAL";
    const vixLevel = vix.level ?? 0;
    const tnxLevel = us10y.level ?? 0;

    // Simple Risk Logic based on Absolute Levels (aligned with Tier-01)
    if (vixLevel > 20 || tnxLevel > 4.9) regime = "RISK_OFF";
    else if (vixLevel < 16 && tnxLevel < 4.5) regime = "RISK_ON";

    return NextResponse.json({
        timestampET: snapshot.asOfET,
        marketStatus: marketStatus.market, // "PRE" | "RTH" | "POST" | "CLOSED"
        regime,
        ndx: ndxObj,
        vix: vixObj,
        us10y: us10yObj,
        // dxy: REMOVED
        sourceGrade
    });
}
