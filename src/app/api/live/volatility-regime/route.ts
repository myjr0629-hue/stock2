// API Route: /api/live/volatility-regime
// Combines GEX, 0DTE, ATM IV, Gamma Flip, Squeeze → Regime determination
// CALM / COILING / LOADED / ERUPTING

import { NextRequest, NextResponse } from 'next/server';
import { getStructureData, levelViolations } from '@/services/structureService';

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

        // ★★ [2026-09-29] 화면에 나가는 감마플립은 구조 한 벌뿐 — 위 장외 폴백의 DynamoDB flipLevel 은
        //   수집 Lambda 가 쓰는 «(콜월+풋플로어)/2»(벽 중간값)라 감마플립이 아니다(9/28 MU 530·TSLA 300).
        //   레짐 점수(vr.regime·regimeScore)는 예전 입력 그대로 둔다 — 점수 입력을 바꾸는 건 이번 범위 밖.
        //   표시값(flipLevel·flipDistance·isAboveFlip)만 구조 값 + 정의 게이트(|K−S| ≤ 0.15S)로 맞춘다.
        const doorFlipRaw = Number(structure?.gammaFlipLevel) > 0 ? Number(structure.gammaFlipLevel) : 0;
        const doorFlip = doorFlipRaw > 0 && levelViolations({ gammaFlipLevel: doorFlipRaw }, vr.underlyingPrice).length === 0 ? doorFlipRaw : 0;
        if (doorFlip !== vr.flipLevel) {
            const dist = doorFlip > 0 && vr.underlyingPrice > 0 ? ((vr.underlyingPrice - doorFlip) / doorFlip) * 100 : 0;
            vr.flipLevel = doorFlip;
            vr.flipDistance = Math.round(dist * 10) / 10;
            vr.isAboveFlip = dist > 0;
        }

        return NextResponse.json({ ticker, ...vr });
    } catch (error) {
        console.error('[volatility-regime] Error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
