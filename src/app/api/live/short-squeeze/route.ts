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

                // ── Tier 2: FINRA 원본 (2026-09-02 복원) ──────────────────
                // Intrinio Startup 은 공매도 잔고가 403(Enterprise 전용)이고
                // short_volume 은 404 다. 그런데 **원본이 FINRA 에 공개돼 있다.**
                // 다크풀을 되살린 것과 같은 경로다. → services/shortInterest.ts
                //
                // 잔고(월 2회 정산)와 거래량(매일)은 서로 다른 것이므로
                // 잔고는 consolidatedShortInterest, 거래량은 regShoDaily(darkPool)에서
                // 각각 가져와 합친다.
                console.log(`[live/short-squeeze] DynamoDB miss for ${ticker} — FINRA 원본 조회`);
                const [{ getShortInterest, fetchSharesOutstanding }, { getDarkPool }] = await Promise.all([
                    import('@/services/shortInterest'),
                    import('@/services/darkPool'),
                ]);

                const [so, dp] = await Promise.all([
                    fetchSharesOutstanding(ticker),
                    getDarkPool(ticker).catch(() => null),
                ]);
                const si = await getShortInterest(ticker, { sharesOutstanding: so });

                return {
                    siData: si
                        ? {
                            siPercent: si.siPercent,          // 분모 없으면 null — 0 으로 채우지 않는다
                            daysToCover: si.daysToCover,
                            siPercentChange: si.changePercent,
                            floatShares: si.sharesOutstanding,
                            settlementDate: si.settlementDate,
                            shortShares: si.shortShares,
                        }
                        : null,
                    // 장외 공매도 «거래량» 비중. 잔고와 다른 지표다.
                    svData: dp && dp.shortPct !== null ? { shortVolPercent: dp.shortPct } : null,
                    _source: 'finra',
                };
            },
            { ttlSeconds: 300, keyPrefix: 'swr:squeeze' }
        );

        const { siData, svData } = squeezeData;

        // ── 「없는 데이터는 0 이 아니라 없음」 ───────────────────────────
        // [이력] 2026-08~09 초, 공매도 잔고의 살아 있는 소스가 없던 기간에는
        //   DynamoDB 에 남은 Massive 시절 값이 «siPercent 0.1 · shortVolPercent
        //   45.2 · status LOW» 처럼 그럴듯한 현재 사실로 나갔다(실측).
        //   계산해서 0 을 만드는 것도 답이 아니었다 — 0% 공매도는 「안전」이라는
        //   틀린 결론을 만든다. 그래서 필드를 null 로 보내고 unavailable 을 명시했다.
        //
        // [현재] FINRA 원본으로 소스가 복원됐다. 그래도 이 게이트는 남긴다 —
        //   FINRA 공표가 밀리거나 상장폐지·신규상장으로 행이 없을 수 있고,
        //   그때 옛 캐시가 현재처럼 나가는 것을 막는 장치가 여전히 필요하다.
        // [2026-09-02] 소스가 살아났다. 이제 판정 기준은 «정산일이 최근인가» 하나다.
        //   FINRA 는 월 2회 정산이고 공표까지 8영업일쯤 걸리므로 45일 창은 넉넉하다.
        //   DynamoDB 에 남은 Massive 시절 값은 정산일이 오래돼 여기서 걸린다.
        const siSource = (squeezeData as any)?._source;
        if (siData == null || !isRecentSettlement(siData?.settlementDate)) {
            return NextResponse.json({
                ticker,
                siPercent: null, daysToCover: null, siChange: null,
                shortVolPercent: null, riskScore: null, status: null,
                floatShares: null, settlementDate: null,
                unavailable: true,
                _reason: 'short-interest-not-in-plan',
            }, { headers: { 'Cache-Control': 's-maxage=300' } });
        }

        // 채점에는 0 을 쓰되(없는 항목은 점수를 «더하지 않는다»는 뜻),
        // **응답에는 null 을 그대로 내보낸다.** 0% 와 «모름»은 다른 말이다.
        const siPercent = siData?.siPercent ?? null;
        const daysToCover = siData?.daysToCover ?? null;
        const siChange = siData?.siPercentChange ?? null;
        const shortVolPercent = svData?.shortVolPercent ?? null;
        const _si = siPercent ?? 0, _dtc = daysToCover ?? 0, _chg = siChange ?? 0, _svp = shortVolPercent ?? 0;

        // Squeeze Risk Score
        let riskScore = 0;
        if (_si >= 20) riskScore += 40;
        else if (_si >= 10) riskScore += 25;
        else if (_si >= 5) riskScore += 10;
        if (_dtc >= 5) riskScore += 25;
        else if (_dtc >= 3) riskScore += 15;
        else if (_dtc >= 2) riskScore += 8;
        if (_chg > 5) riskScore += 15;
        else if (_chg > 0) riskScore += 8;
        if (_svp >= 50) riskScore += 20;
        else if (_svp >= 40) riskScore += 10;
        else if (_svp >= 30) riskScore += 5;
        riskScore = Math.min(100, riskScore);

        let status: string;
        if (riskScore >= 70) status = 'CRITICAL';
        else if (riskScore >= 45) status = 'HIGH';
        else if (riskScore >= 20) status = 'MEDIUM';
        else status = 'LOW';

        const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
        return NextResponse.json({
            ticker,
            siPercent: r1(siPercent),
            daysToCover: r1(daysToCover),
            siChange: r1(siChange),
            shortVolPercent: r1(shortVolPercent),
            shortShares: (siData as any)?.shortShares ?? null,
            riskScore, status,
            // ⚠️ float 이 아니라 «희석 가중평균 발행주식수» 다(Intrinio 플랜 제약).
            //    이름을 floatShares 로 두면 화면이 유통주식수라고 표기하게 된다.
            sharesOutstanding: siData?.floatShares ?? null,
            settlementDate: siData?.settlementDate || null,
            source: siSource,
            attribution: 'Data source: FINRA',
        });
    } catch (error) {
        console.error('[short-squeeze] Error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
