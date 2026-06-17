// src/app/api/live/premium-metrics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { GuardianDataHub } from '@/services/guardian/unifiedDataStream';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const localeQuery = req.nextUrl.searchParams.get('locale') || 'ko';
    const locale: 'ko' | 'en' | 'ja' = (localeQuery === 'ko' || localeQuery === 'en' || localeQuery === 'ja')
        ? localeQuery
        : 'ko';
        
    const origin = req.nextUrl.origin || req.url.split('/api/')[0];

    try {
        // 1. Volatility Regime & Gamma Squeeze Risk (Internal fetch to volatility-regime)
        let regime = 'COILING';
        let regimeScore = 38;
        let squeezeScore = 34;
        let squeezeRisk = 'LOW';
        
        try {
            const res = await fetch(`${origin}/api/live/volatility-regime?t=SPY`);
            if (res.ok) {
                const vData = await res.json();
                regime = vData.regime || regime;
                regimeScore = vData.regimeScore ?? regimeScore;
                squeezeScore = vData.squeezeScore ?? squeezeScore;
                squeezeRisk = vData.squeezeRisk || squeezeRisk;
            }
        } catch (e) {
            console.warn('[premium-metrics] Failed to fetch volatility-regime:', e);
        }

        // 2. Dark Pool Volume (Use same source as web Flow page: realtime-metrics)
        let darkPoolPercent = 42.5;
        let darkPoolVolume = 0;
        let darkPoolTotalVolume = 0;
        
        try {
            // Primary: realtime-metrics API (same as web Flow page)
            const res = await fetch(`${origin}/api/flow/realtime-metrics?ticker=SPY`);
            if (res.ok) {
                const rmData = await res.json();
                if (rmData.darkPool) {
                    darkPoolPercent = rmData.darkPool.percent ?? darkPoolPercent;
                    darkPoolVolume = rmData.darkPool.volume ?? darkPoolVolume;
                    darkPoolTotalVolume = rmData.darkPool.totalVolume ?? darkPoolTotalVolume;
                }
            }
        } catch (e) {
            // Fallback: direct Redis cache
            try {
                const cachedDp = await getFromCache<any>('cvv3_darkpool:SPY');
                if (cachedDp) {
                    darkPoolPercent = cachedDp.darkPoolPercent ?? darkPoolPercent;
                    darkPoolVolume = cachedDp.totalDarkPoolValue ?? darkPoolVolume;
                }
            } catch {
                console.warn('[premium-metrics] Failed to fetch dark pool volume:', e);
            }
        }

        // 3. Sector Rotation Intensity (Fetch from guardian:snapshot:${locale} or dynamic fallback)
        let rotationScore = 50;
        let rotationDirection = 'NEUTRAL';
        let rotationConviction = 'LOW';

        try {
            const guardianSnap = await getFromCache<any>(`guardian:snapshot:${locale}`);
            if (guardianSnap?.rotationIntensity) {
                rotationScore = guardianSnap.rotationIntensity.score ?? rotationScore;
                rotationDirection = guardianSnap.rotationIntensity.direction ?? rotationDirection;
                rotationConviction = guardianSnap.rotationIntensity.conviction ?? rotationConviction;
            } else {
                // Fallback: dynamic compute via GuardianDataHub
                const freshSnap = await GuardianDataHub.getGuardianSnapshot(false, locale);
                if (freshSnap?.rotationIntensity) {
                    rotationScore = freshSnap.rotationIntensity.score ?? rotationScore;
                    rotationDirection = freshSnap.rotationIntensity.direction ?? rotationDirection;
                    rotationConviction = freshSnap.rotationIntensity.conviction ?? rotationConviction;
                }
            }
        } catch (e) {
            console.warn('[premium-metrics] Failed to fetch sector snapshot:', e);
        }

        return NextResponse.json({
            success: true,
            volatilityRegime: {
                regime,
                score: Math.round(regimeScore),
            },
            darkPool: {
                percent: darkPoolPercent,
                volume: darkPoolVolume,
                totalVolume: darkPoolTotalVolume,
            },
            gammaSqueeze: {
                score: Math.round(squeezeScore),
                risk: squeezeRisk, // 'LOW' | 'MEDIUM' | 'HIGH'
            },
            sectorRotation: {
                score: rotationScore,
                direction: rotationDirection, // 'BULLISH' | 'BEARISH' | 'NEUTRAL'
                conviction: rotationConviction, // 'HIGH' | 'MEDIUM' | 'LOW'
            }
        });

    } catch (err: any) {
        console.error('[premium-metrics] Error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
