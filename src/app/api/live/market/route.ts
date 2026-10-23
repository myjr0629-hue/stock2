import { priceAsOfET } from '@/lib/quoteBasis';
import { NextResponse } from 'next/server';
import { getMacroSnapshotSSOT } from '@/services/macroHubProvider';

export const dynamic = 'force-dynamic';

export async function GET() {
    // [S-48.2] Converted to use MacroHub SSOT (Massive Direct Only)
    // Yahoo Finance & DXY Removed.

    const snapshot = await getMacroSnapshotSSOT();
    const { marketStatus, factors } = snapshot;
    const { vix, us10y } = factors;
    const ndx = snapshot.indexBasis?.cash.ndx;

    // Mapping to legacy response format for compatibility
    // DXY is removed from response structure as per S-48.2 policy

    const sourceGrade = "A"; // Massive Direct assumed High Quality

    const ndxObj = {
        symbol: "I:NDX",
        price: ndx?.price ?? null,
        changePct: ndx?.changePct ?? null,
        asOf: ndx?.asOf ?? null,
        sessionDate: ndx?.sessionDate ?? null,
        basis: ndx?.basis ?? 'regular-session'
    };
    const vixObj = {
        symbol: "I:VIX",
        price: vix.level ?? null,
        changePct: vix.chgPct ?? null
    };
    const us10yObj = {
        symbol: "I:TNX",
        yield: us10y.level ?? null,
        changeBp: typeof us10y.chgAbs === 'number' && Number.isFinite(us10y.chgAbs) ? Math.round(us10y.chgAbs * 100 * 100) / 100 : null
    };

    // [S-48.2] Regime Logic updated to SSOT
    let regime: "RISK_ON" | "NEUTRAL" | "RISK_OFF" = "NEUTRAL";
    const vixLevel = vix.level;
    const tnxLevel = us10y.level;

    // Simple Risk Logic based on Absolute Levels (aligned with Tier-01)
    if ((vixLevel != null && vixLevel > 20) || (tnxLevel != null && tnxLevel > 4.9)) regime = "RISK_OFF";
    else if (vixLevel != null && tnxLevel != null && vixLevel < 16 && tnxLevel < 4.5) regime = "RISK_ON";

    return NextResponse.json({
        timestampET: ndx?.asOf ? priceAsOfET('LIVE', null, Date.parse(ndx.asOf), Date.now()) : null,
        marketStatus: marketStatus.market, // "PRE" | "RTH" | "POST" | "CLOSED"
        regime,
        ndx: ndxObj,
        indexBasis: snapshot.indexBasis ?? null,
        futures: snapshot.indexBasis?.futures ?? null,
        vix: vixObj,
        us10y: us10yObj,
        // dxy: REMOVED
        sourceGrade
    }, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' }
    });
}
