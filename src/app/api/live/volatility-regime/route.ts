// API Route: /api/live/volatility-regime
// Combines GEX, 0DTE, ATM IV, Gamma Flip, Squeeze → Regime determination
// CALM / COILING / LOADED / ERUPTING

import { NextRequest, NextResponse } from 'next/server';
import { getStructureData } from '@/services/structureService';

export const revalidate = 60;

export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('t')?.toUpperCase();
    if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });

    try {
        const structure = await getStructureData(ticker);

        const netGex = structure?.netGex || 0;
        const gammaFlip = structure?.gammaFlipLevel || 0;
        const underlyingPrice = structure?.underlyingPrice || 0;
        const squeezeScore = structure?.squeezeScore || 0;
        const squeezeRisk = structure?.squeezeRisk || 'LOW';
        const atmIv = structure?.atmIv || 0; // already percentage
        const gammaConcentration = structure?.gammaConcentration || 0;
        const gammaConcentrationLabel = structure?.gammaConcentrationLabel || 'NORMAL';

        // Gamma Flip distance (% from current price)
        const flipDistance = gammaFlip > 0 && underlyingPrice > 0
            ? ((underlyingPrice - gammaFlip) / gammaFlip) * 100
            : 0;
        const isShortGamma = netGex < 0;
        const isAboveFlip = flipDistance > 0;

        // --- Regime Calculation ---
        let regimeScore = 0;

        // Factor 1: GEX Polarity (0-30pts) — Short Gamma amplifies vol
        if (isShortGamma) {
            const gexMagnitude = Math.abs(netGex) / 1000000;
            regimeScore += Math.min(30, gexMagnitude * 3);
        }

        // Factor 2: Squeeze Score from structure (0-25pts)
        regimeScore += Math.min(25, squeezeScore / 4);

        // Factor 3: ATM IV Level (0-20pts)
        if (atmIv > 50) regimeScore += 20;
        else if (atmIv > 35) regimeScore += 12;
        else if (atmIv > 25) regimeScore += 6;

        // Factor 4: Gamma Flip Proximity (0-15pts)
        const flipDist = Math.abs(flipDistance);
        if (flipDist < 1) regimeScore += 15;
        else if (flipDist < 3) regimeScore += 10;
        else if (flipDist < 5) regimeScore += 5;

        // Factor 5: Gamma Concentration (0-10pts) — STICKY = high concentration
        if (gammaConcentration >= 70) regimeScore += 10;
        else if (gammaConcentration >= 50) regimeScore += 6;
        else if (gammaConcentration >= 30) regimeScore += 3;

        regimeScore = Math.min(100, regimeScore);

        let regime: string;
        if (regimeScore >= 75) regime = 'ERUPTING';
        else if (regimeScore >= 50) regime = 'LOADED';
        else if (regimeScore >= 25) regime = 'COILING';
        else regime = 'CALM';

        return NextResponse.json({
            ticker,
            regime,
            regimeScore: Math.round(regimeScore),
            gex: Math.round(netGex),
            gexLabel: isShortGamma ? 'SHORT' : 'LONG',
            iv: atmIv,
            flipDistance: Math.round(flipDistance * 10) / 10,
            flipLevel: gammaFlip,
            isAboveFlip,
            squeezeScore: Math.round(squeezeScore),
            squeezeRisk,
            gammaConcentration,
            gammaConcentrationLabel,
        });
    } catch (error) {
        console.error('[volatility-regime] Error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
