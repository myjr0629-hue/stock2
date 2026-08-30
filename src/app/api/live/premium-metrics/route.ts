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
        let gammaFlipLevel: number | null = null;
        let spyPrice: number | null = null;
        
        try {
            const res = await fetch(`${origin}/api/live/volatility-regime?t=SPY`);
            if (res.ok) {
                const vData = await res.json();
                gammaFlipLevel = typeof vData.flipLevel === 'number' ? vData.flipLevel : null;
                // flipDistance 는 % 이므로 여기서 현재가를 역산한다
                spyPrice = (gammaFlipLevel && typeof vData.flipDistance === 'number')
                    ? gammaFlipLevel * (1 + vData.flipDistance / 100)
                    : null;
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
        // ⚠️ 예전엔 이 라우트가 `/api/flow/options-eod?all=1` 을 HTTP 로 다시 불러
        //    `opening[sym].side` 로 콜 비중을 냈다. 그건 «콜 우위 종목»의 금액을
        //    통째로 콜로 세는 것이라 실제보다 부풀려진다(실측: 73.3% vs 65.9%).
        //    공용 서비스는 **계약 단위**로 센다 — 같은 데이터, 정확한 답.
        let instFlow: import('@/services/institutionalFlow').InstitutionalFlowSummary | null = null;
        try {
            const { getInstitutionalFlowSummary } = await import('@/services/institutionalFlow');
            instFlow = await getInstitutionalFlowSummary();
        } catch (e) {
            console.warn('[premium-metrics] 기관 신규 포지션 조회 실패:', e);
        }

        // ══════════════════════════════════════════════════════════════
        // 2-B. 딜러 감마 구조 — 「변동성 레짐」+「감마 스퀴즈」를 하나로
        //
        //   두 카드는 같은 것을 두 번 보여 주고 있었다: regimeScore 계산식이
        //   `squeezeScore / 4` 를 직접 더한다. 4칸 중 2칸이 같은 정보였다.
        //   대신 «오늘 딜러 감마가 평소와 얼마나 다른가»를 자기 이력 백분위로
        //   내고, 그 자리에 시장 폭(아래)을 새로 넣는다.
        // ══════════════════════════════════════════════════════════════
        let dealerGamma: import('@/services/dealerGamma').DealerGammaSignal | null = null;
        try {
            const { getDealerGamma } = await import('@/services/dealerGamma');
            dealerGamma = await getDealerGamma('SPY', gammaFlipLevel, spyPrice);
        } catch (e) {
            console.warn('[premium-metrics] 딜러 감마 조회 실패:', e);
        }

        // ══════════════════════════════════════════════════════════════
        // 2-C. 시장 폭 — 지수가 «넓게» 오르는가, 소수가 끌고 가는가
        //   위 세 신호가 전부 옵션·섹터 쪽이라 주식 현물 축이 비어 있었다.
        //   NDX100 / DOW30 구성종목 중 20일선 위 비율(실측 EOD 20일 이력).
        // ══════════════════════════════════════════════════════════════
        let breadth: { ndx: number | null; dow: number | null; covered: number; universe: number } | null = null;
        try {
            const { getIndexBreadth } = await import('@/services/indexBreadth');
            const b = await getIndexBreadth();
            if (b?.ndx?.pctAbove20 != null || b?.dow?.pctAbove20 != null) {
                breadth = {
                    ndx: b.ndx?.pctAbove20 ?? null,
                    dow: b.dow?.pctAbove20 ?? null,
                    covered: (b.ndx?.covered ?? 0) + (b.dow?.covered ?? 0),
                    universe: (b.ndx?.universe ?? 0) + (b.dow?.universe ?? 0),
                };
            }
        } catch (e) {
            console.warn('[premium-metrics] 시장 폭 조회 실패:', e);
        }

        // 3. Sector Rotation Intensity (Fetch from guardian:snapshot:${locale} or dynamic fallback)
        let rotationScore: number | null = null;
        let rotationDirection: string | null = null;
        let rotationConviction: string | null = null;
        // [V7.0] 점수를 «무엇에 견줘» 냈는지. percentile 이면 100 은
        //        「최근 세션 중 가장 강한 로테이션」이라는 실제 의미를 갖는다.
        let rotationBasis: string | null = null;
        let rotationWindows: number | null = null;
        // 점수만으론 «얼마나»만 알 수 있다. 프리미엄 카드는 «어디로»를 말해야 한다.
        let rotationInto: string | null = null;
        let rotationOutOf: string | null = null;

        try {
            const guardianSnap = await getFromCache<any>(`guardian:snapshot:${locale}`);
            if (guardianSnap?.rotationIntensity) {
                rotationScore = typeof guardianSnap.rotationIntensity.score === 'number' ? guardianSnap.rotationIntensity.score : rotationScore;
                rotationDirection = guardianSnap.rotationIntensity.direction ?? rotationDirection;
                rotationConviction = guardianSnap.rotationIntensity.conviction ?? rotationConviction;
                rotationBasis = guardianSnap.rotationIntensity.scoreBasis ?? rotationBasis;
                rotationWindows = typeof guardianSnap.rotationIntensity.sampleWindows === 'number' ? guardianSnap.rotationIntensity.sampleWindows : rotationWindows;
                rotationInto = guardianSnap.rotationIntensity.topInflow?.[0]?.sector ?? rotationInto;
                rotationOutOf = guardianSnap.rotationIntensity.topOutflow?.[0]?.sector ?? rotationOutOf;
            } else {
                // Fallback: dynamic compute via GuardianDataHub
                const freshSnap = await GuardianDataHub.getGuardianSnapshot(false, locale);
                if (freshSnap?.rotationIntensity) {
                    rotationScore = typeof freshSnap.rotationIntensity.score === 'number' ? freshSnap.rotationIntensity.score : rotationScore;
                    rotationDirection = freshSnap.rotationIntensity.direction ?? rotationDirection;
                    rotationConviction = freshSnap.rotationIntensity.conviction ?? rotationConviction;
                    rotationBasis = freshSnap.rotationIntensity.scoreBasis ?? rotationBasis;
                    rotationWindows = typeof freshSnap.rotationIntensity.sampleWindows === 'number' ? freshSnap.rotationIntensity.sampleWindows : rotationWindows;
                    rotationInto = freshSnap.rotationIntensity.topInflow?.[0]?.sector ?? rotationInto;
                    rotationOutOf = freshSnap.rotationIntensity.topOutflow?.[0]?.sector ?? rotationOutOf;
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
            // 옛 소비처 호환 — 새 카드는 dealerGamma 를 쓴다
            gammaSqueeze: {
                score: squeezeScore == null ? null : Math.round(squeezeScore),
                risk: squeezeRisk, // 'LOW' | 'MEDIUM' | 'HIGH' | null
            },
            dealerGamma,
            breadth,
            sectorRotation: {
                score: rotationScore,
                direction: rotationDirection, // 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null
                conviction: rotationConviction, // 'HIGH' | 'MEDIUM' | 'LOW' | null
                basis: rotationBasis,          // 'percentile' | 'uncalibrated' | null
                windows: rotationWindows,      // 백분위를 낼 때 쓴 과거 5일창 개수
                into: rotationInto,            // 자금이 가장 많이 들어간 섹터
                outOf: rotationOutOf,          // 가장 많이 빠져나온 섹터
            }
        });

    } catch (err: any) {
        console.error('[premium-metrics] Error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
