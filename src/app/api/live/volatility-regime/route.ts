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

        // ★ 2026-09-15 — 계산식을 services/volatilityRegime.ts 로 옮겼다.
        //   premium-metrics 도 같은 값을 필요로 하는데, 예전엔 이 라우트를
        //   HTTP 로 다시 불러야 해서 콜드에 15초가 걸렸다. 이제 둘 다 같은 함수를 부른다.
        const { computeVolatilityRegime } = await import('@/services/volatilityRegime');
        const vr = computeVolatilityRegime({
            netGex, gammaFlipLevel: gammaFlip, underlyingPrice,
            squeezeScore, squeezeRisk, atmIv,
            gammaConcentration, gammaConcentrationLabel,
        });

        return NextResponse.json({ ticker, ...vr });
    } catch (error) {
        console.error('[volatility-regime] Error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
