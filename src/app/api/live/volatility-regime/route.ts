// API Route: /api/live/volatility-regime
// Combines GEX, 0DTE, ATM IV, Gamma Flip, Squeeze → Regime determination
// CALM / COILING / LOADED / ERUPTING

import { NextRequest, NextResponse } from 'next/server';
import { getStructureData } from '@/services/structureService';
import { computeStructureVolatilityRegime } from '@/services/volatilityRegime';

export const revalidate = 60;

export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('t')?.toUpperCase();
    if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });

    try {
        const structure = await getStructureData(ticker);

        const vr = computeStructureVolatilityRegime(structure, Date.now());
        return NextResponse.json({ ticker, ...vr });
    } catch (error) {
        console.error('[volatility-regime] Error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
