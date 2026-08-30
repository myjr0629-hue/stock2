// API Route: /api/live/volatility-regime
// Combines GEX, 0DTE, ATM IV, Gamma Flip, Squeeze → Regime determination
// CALM / COILING / LOADED / ERUPTING

import { NextRequest, NextResponse } from 'next/server';
import { getStructureData } from '@/services/structureService';

export const revalidate = 60;

// Check if US market is currently open
function isMarketOpen(): boolean {
    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    // Market: Mon-Fri 13:30-20:00 UTC (9:30 AM - 4:00 PM ET)
    return utcDay >= 1 && utcDay <= 5 && utcMin >= 13 * 60 + 30 && utcMin <= 20 * 60;
}

export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('t')?.toUpperCase();
    if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });

    try {
        const structure = await getStructureData(ticker);

        let netGex = structure?.netGex || 0;
        let gammaFlip = structure?.gammaFlipLevel || 0;
        let underlyingPrice = structure?.underlyingPrice || 0;
        let squeezeScore = structure?.squeezeScore || 0;
        let squeezeRisk = structure?.squeezeRisk || 'LOW';
        let atmIv = structure?.atmIv || 0; // already percentage
        let gammaConcentration = structure?.gammaConcentration || 0;
        let gammaConcentrationLabel = structure?.gammaConcentrationLabel || 'NORMAL';

        // [Weekend/Off-hours Fix] If IV is 0 and market is closed, 
        // try to use DynamoDB cached data from last trading day
        if (atmIv === 0 && !isMarketOpen()) {
            try {
                const { getTickerSnapshot } = await import('@/lib/aws/dynamoDataProvider');
                const snap = await getTickerSnapshot(ticker);
                if (snap?.gex) {
                    // Use DynamoDB GEX data as fallback for off-hours
                    if (snap.gex.gex !== undefined) netGex = snap.gex.gex;
                    if (snap.gex.flipLevel) gammaFlip = snap.gex.flipLevel;
                    if (snap.gex.gammaRegime) {
                        // gammaRegime from DynamoDB provides regime context
                    }
                }
                // Try to get IV from the structure's historical cache
                if (snap?.price?.close && snap.price.close > 0) {
                    underlyingPrice = snap.price.close;
                }
            } catch { /* DynamoDB fallback failed, continue with live data */ }
        }

        // Gamma Flip distance (% from current price)
        const flipDistance = gammaFlip > 0 && underlyingPrice > 0
            ? ((underlyingPrice - gammaFlip) / gammaFlip) * 100
            : 0;
        const isShortGamma = netGex < 0;
        const isAboveFlip = flipDistance > 0;

        // --- Regime Calculation ---
        let regimeScore = 0;

        // Factor 1: GEX Polarity (0-30pts) — Short Gamma amplifies vol
        //
        // ⚠️ 옛 식 `Math.min(30, gexMagnitude * 3)` 은 $10M 만 넘으면 30 만점이었다.
        //    실제 숏감마는 수백 M~수 B 규모라 사실상 «숏감마면 30, 아니면 0» 인
        //    이진값을 그라데이션처럼 보이게 하고 있었다. 로그 척도로 바꾸면
        //    $1M→0 · $10M→10 · $100M→20 · $1B→30 으로 규모가 실제로 반영된다.
        if (isShortGamma) {
            const gexMagnitude = Math.abs(netGex) / 1000000; // $M
            const decades = gexMagnitude > 1 ? Math.log10(gexMagnitude) : 0; // 0~3
            regimeScore += Math.max(0, Math.min(30, decades * 10));
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
