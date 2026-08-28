// API Route: /api/live/short-squeeze
// [AWS-FIRST] DynamoDB unified cache → Polygon fallback
// SI% + Days to Cover + Short Volume → Squeeze Risk
// LOW / MEDIUM / HIGH / CRITICAL

import { NextRequest, NextResponse } from 'next/server';
import { swrFetch } from '@/lib/cache/redisSWR';

export const revalidate = 120;

export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('t')?.toUpperCase();
    if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });

    try {
        const { data: squeezeData, _cache } = await swrFetch(
            ticker,
            async () => {
                // ── [AWS-FIRST] Tier 1: DynamoDB unified cache ──
                try {
                    const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
                    const dynData = await getUnifiedCache(ticker, 'en');
                    if (dynData?.squeeze) {
                        const sq = dynData.squeeze;
                        console.log(`[live/short-squeeze] ✅ DynamoDB hit for ${ticker}: ${sq.status} (SI:${sq.siPercent}%)`);
                        return {
                            siData: { siPercent: sq.siPercent || 0, daysToCover: sq.daysToCover || 0, siPercentChange: sq.siChange || 0, floatShares: sq.floatShares || 0, settlementDate: sq.settlementDate || null },
                            svData: { shortVolPercent: sq.shortVolPercent || 0 },
                            _source: 'dynamodb',
                        };
                    }
                } catch (e: any) {
                    console.warn(`[live/short-squeeze] DynamoDB error for ${ticker}:`, e.message);
                }

                // ── Tier 2: Polygon fallback ──
                console.log(`[live/short-squeeze] ⚠️ DynamoDB miss for ${ticker} — falling back to Polygon`);
                const { fetchSIPercent } = await import('@/services/massiveClient');
                const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || '';

                const [siData, svData] = await Promise.all([
                    fetchSIPercent(ticker),
                    (async () => {
                        // [2026-08-29] Massive short-volume 은 200 OK 이지만 실측 date 가
                        // "2024-02-06" — 2년 전 데이터다. Intrinio Startup 미제공 → 중단.
                        if (process.env.ENABLE_MASSIVE_TICKS !== '1') return null;
                        try {
                            const url = `https://api.polygon.io/stocks/v1/short-volume?ticker=${ticker}&limit=1&apiKey=${POLYGON_API_KEY}`;
                            const res = await fetch(url);
                            if (!res.ok) return null;
                            const data = await res.json();
                            const result = data.results?.[0];
                            if (!result) return null;
                            const shortVolume = result.short_volume || 0;
                            const totalVolume = result.total_volume || 1;
                            return { shortVolPercent: Math.round((shortVolume / totalVolume) * 1000) / 10 };
                        } catch { return null; }
                    })(),
                ]);
                return { siData, svData, _source: 'polygon-fallback' };
            },
            { ttlSeconds: 300, keyPrefix: 'swr:squeeze' }
        );

        const { siData, svData } = squeezeData;
        const siPercent = siData?.siPercent || 0;
        const daysToCover = siData?.daysToCover || 0;
        const siChange = siData?.siPercentChange || 0;
        const shortVolPercent = svData?.shortVolPercent || 0;

        // Squeeze Risk Score
        let riskScore = 0;
        if (siPercent >= 20) riskScore += 40;
        else if (siPercent >= 10) riskScore += 25;
        else if (siPercent >= 5) riskScore += 10;
        if (daysToCover >= 5) riskScore += 25;
        else if (daysToCover >= 3) riskScore += 15;
        else if (daysToCover >= 2) riskScore += 8;
        if (siChange > 5) riskScore += 15;
        else if (siChange > 0) riskScore += 8;
        if (shortVolPercent >= 50) riskScore += 20;
        else if (shortVolPercent >= 40) riskScore += 10;
        else if (shortVolPercent >= 30) riskScore += 5;
        riskScore = Math.min(100, riskScore);

        let status: string;
        if (riskScore >= 70) status = 'CRITICAL';
        else if (riskScore >= 45) status = 'HIGH';
        else if (riskScore >= 20) status = 'MEDIUM';
        else status = 'LOW';

        return NextResponse.json({
            ticker, siPercent: Math.round(siPercent * 10) / 10,
            daysToCover: Math.round(daysToCover * 10) / 10,
            siChange: Math.round(siChange * 10) / 10,
            shortVolPercent, riskScore, status,
            floatShares: siData?.floatShares || 0,
            settlementDate: siData?.settlementDate || null,
        });
    } catch (error) {
        console.error('[short-squeeze] Error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
