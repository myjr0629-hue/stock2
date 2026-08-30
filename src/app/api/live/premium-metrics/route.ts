// src/app/api/live/premium-metrics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { GuardianDataHub } from '@/services/guardian/unifiedDataStream';
import { publicBase } from '@/lib/net/publicBase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const localeQuery = req.nextUrl.searchParams.get('locale') || 'ko';
    const locale: 'ko' | 'en' | 'ja' = (localeQuery === 'ko' || localeQuery === 'en' || localeQuery === 'ja')
        ? localeQuery
        : 'ko';
        
    const origin = publicBase(req.nextUrl.origin || req.url.split('/api/')[0]);

    try {
        // 1. Volatility Regime & Gamma Squeeze Risk (Internal fetch to volatility-regime)
        // ⚠️ 초기값을 숫자로 두면 «못 잰 것»이 그 숫자로 나간다.
        //    이 카드들은 **보상형 광고를 봐야 보이는 자리**다. 광고를 보고 나서
        //    보는 값이 폴백 상수면 그건 사용자를 속이는 것이다. null 로 둔다.
        let regime: string | null = null;
        let regimeScore: number | null = null;
        let squeezeScore: number | null = null;
        let squeezeRisk: string | null = null;
        
        try {
            const res = await fetch(`${origin}/api/live/volatility-regime?t=SPY`);
            if (res.ok) {
                const vData = await res.json();
                regime = vData.regime ?? regime;
                regimeScore = typeof vData.regimeScore === 'number' ? vData.regimeScore : regimeScore;
                squeezeScore = typeof vData.squeezeScore === 'number' ? vData.squeezeScore : squeezeScore;
                squeezeRisk = vData.squeezeRisk ?? squeezeRisk;
            }
        } catch (e) {
            console.warn('[premium-metrics] Failed to fetch volatility-regime:', e);
        }

        // ══════════════════════════════════════════════════════════════
        // 2. 기관 신규 포지션 — 다크풀을 «대체»한다
        //
        //   ★ 여기 있던 다크풀 카드는 `let darkPoolPercent = 42.5;` 로 시작해
        //     출처가 사라진 뒤에도 **영원히 42.5%** 를 내보내고 있었다.
        //     보상형 광고를 보고 나서 보는 값이 하드코딩 상수였다는 뜻이다.
        //     다크풀은 Intrinio 이관으로 **영구 상실**했으므로 카드를 지우고,
        //     성격이 같으면서 «우리가 실제로 재는» 지표로 바꾼다.
        //
        //   무엇으로 바꾸나: **옵션 계약별 미결제약정 증가분**(신규 포지션).
        //     · 다크풀이 대신하던 질문과 같다 — 「기관이 호가창 밖에서 무엇을 했나」
        //     · 장중에는 볼 수 없다(OI 는 마감 후 확정된다) = 진짜 «비공개 발자국»
        //     · 5년치 옵션 EOD 벌크가 있어야 만들 수 있다 = 우리만 가능
        //   실측(2026-08-28): 375종목 신규 $63.2B · 콜 73% · 최대 NVDA $10.9B(콜)
        // ══════════════════════════════════════════════════════════════
        let instFlow: {
            notional: number; callPct: number; side: 'call' | 'put';
            tickers: number; topTicker: string | null; topNotional: number; date: string | null;
        } | null = null;

        try {
            const res = await fetch(`${origin}/api/flow/options-eod?all=1`);
            if (res.ok) {
                const d = await res.json();
                const opening: Record<string, { contracts: number; notional: number; side: 'call' | 'put' }> =
                    d?.opening || {};
                const rows = Object.entries(opening);
                // 표본이 얇으면 «시장 전체»라고 말할 수 없다
                if (d?.available && rows.length >= 50) {
                    let total = 0, call = 0, topN = 0, topT: string | null = null;
                    for (const [t, v] of rows) {
                        const n = Number(v?.notional) || 0;
                        total += n;
                        if (v?.side === 'call') call += n;
                        if (n > topN) { topN = n; topT = t; }
                    }
                    if (total > 0) {
                        const callPct = Math.round((call / total) * 1000) / 10;
                        instFlow = {
                            notional: total,
                            callPct,
                            side: callPct >= 50 ? 'call' : 'put',
                            tickers: rows.length,
                            topTicker: topT,
                            topNotional: topN,
                            date: d?.date ?? null,
                        };
                    }
                }
            }
        } catch (e) {
            console.warn('[premium-metrics] 기관 신규 포지션 조회 실패:', e);
        }

        // 3. Sector Rotation Intensity (Fetch from guardian:snapshot:${locale} or dynamic fallback)
        let rotationScore: number | null = null;
        let rotationDirection: string | null = null;
        let rotationConviction: string | null = null;
        // [V7.0] 점수를 «무엇에 견줘» 냈는지. percentile 이면 100 은
        //        「최근 세션 중 가장 강한 로테이션」이라는 실제 의미를 갖는다.
        let rotationBasis: string | null = null;
        let rotationWindows: number | null = null;

        try {
            const guardianSnap = await getFromCache<any>(`guardian:snapshot:${locale}`);
            if (guardianSnap?.rotationIntensity) {
                rotationScore = typeof guardianSnap.rotationIntensity.score === 'number' ? guardianSnap.rotationIntensity.score : rotationScore;
                rotationDirection = guardianSnap.rotationIntensity.direction ?? rotationDirection;
                rotationConviction = guardianSnap.rotationIntensity.conviction ?? rotationConviction;
                rotationBasis = guardianSnap.rotationIntensity.scoreBasis ?? rotationBasis;
                rotationWindows = typeof guardianSnap.rotationIntensity.sampleWindows === 'number' ? guardianSnap.rotationIntensity.sampleWindows : rotationWindows;
            } else {
                // Fallback: dynamic compute via GuardianDataHub
                const freshSnap = await GuardianDataHub.getGuardianSnapshot(false, locale);
                if (freshSnap?.rotationIntensity) {
                    rotationScore = typeof freshSnap.rotationIntensity.score === 'number' ? freshSnap.rotationIntensity.score : rotationScore;
                    rotationDirection = freshSnap.rotationIntensity.direction ?? rotationDirection;
                    rotationConviction = freshSnap.rotationIntensity.conviction ?? rotationConviction;
                    rotationBasis = freshSnap.rotationIntensity.scoreBasis ?? rotationBasis;
                    rotationWindows = typeof freshSnap.rotationIntensity.sampleWindows === 'number' ? freshSnap.rotationIntensity.sampleWindows : rotationWindows;
                }
            }
        } catch (e) {
            console.warn('[premium-metrics] Failed to fetch sector snapshot:', e);
        }

        return NextResponse.json({
            success: true,
            volatilityRegime: {
                regime,
                score: regimeScore == null ? null : Math.round(regimeScore),
            },
            // ★ darkPool 은 제거했다 — 이관으로 영구 상실한 지표다.
            //   소비처가 옛 키를 계속 읽으면 조용히 undefined 가 되므로,
            //   «없어졌다»는 사실을 명시적으로 남긴다.
            darkPool: null,
            _darkPoolRetired: 'vendor-unavailable-since-2026-08-28',
            institutionalFlow: instFlow,
            gammaSqueeze: {
                score: squeezeScore == null ? null : Math.round(squeezeScore),
                risk: squeezeRisk, // 'LOW' | 'MEDIUM' | 'HIGH' | null
            },
            sectorRotation: {
                score: rotationScore,
                direction: rotationDirection, // 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null
                conviction: rotationConviction, // 'HIGH' | 'MEDIUM' | 'LOW' | null
                basis: rotationBasis,          // 'percentile' | 'uncalibrated' | null
                windows: rotationWindows,      // 백분위를 낼 때 쓴 과거 5일창 개수
            }
        });

    } catch (err: any) {
        console.error('[premium-metrics] Error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
