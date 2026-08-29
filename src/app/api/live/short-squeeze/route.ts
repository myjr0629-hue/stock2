// API Route: /api/live/short-squeeze
// [AWS-FIRST] DynamoDB unified cache → Polygon fallback
// SI% + Days to Cover + Short Volume → Squeeze Risk
// LOW / MEDIUM / HIGH / CRITICAL

import { NextRequest, NextResponse } from 'next/server';
import { swrFetch } from '@/lib/cache/redisSWR';

export const revalidate = 120;

/**
 * 공매도 잔고는 격주 정산(settlement) 기준으로 발표된다.
 * 정산일이 45일 이상 지났으면 «현재»라고 부를 수 없다.
 * (소스가 죽은 뒤 캐시에 남은 값을 걸러내는 기준선)
 */
function isRecentSettlement(d?: string | null): boolean {
    if (!d) return false;
    const t = Date.parse(d);
    if (Number.isNaN(t)) return false;
    return Date.now() - t < 45 * 86400000;
}

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

        // ── 「없는 데이터는 0 이 아니라 없음」 ───────────────────────────
        // 공매도 잔고(short interest)는 Intrinio Startup 에서 403 이고,
        // short-volume 도 미제공이다. 즉 **살아 있는 소스가 없다.**
        // 그런데 DynamoDB 에는 Massive 시절 값이 남아 있어서, 그대로
        // 내보내면 «siPercent 0.1 · shortVolPercent 45.2 · riskScore 10 ·
        // status LOW» 처럼 **그럴듯한 숫자가 현재 사실처럼** 나간다(실측).
        // 계산해서 0 을 만드는 것도 답이 아니다 — 0% 공매도는 «낮음»이라는
        // 틀린 결론을 만든다. 값이 없으면 **필드 자체를 null 로** 보내고
        // unavailable 을 명시해 화면이 숨길 수 있게 한다.
        const siSource = (squeezeData as any)?._source;
        const siFresh = siSource === 'dynamodb'
            ? isRecentSettlement(siData?.settlementDate)
            : siData != null;
        if (!siFresh && !svData) {
            return NextResponse.json({
                ticker,
                siPercent: null, daysToCover: null, siChange: null,
                shortVolPercent: null, riskScore: null, status: null,
                floatShares: null, settlementDate: null,
                unavailable: true,
                _reason: 'short-interest-not-in-plan',
            }, { headers: { 'Cache-Control': 's-maxage=300' } });
        }

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
