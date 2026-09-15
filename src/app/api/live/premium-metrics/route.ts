// src/app/api/live/premium-metrics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { GuardianDataHub } from '@/services/guardian/unifiedDataStream';

export const dynamic = 'force-dynamic';

/**
 * 인스턴스 자체 기억.
 *
 * Redis 가 흔들리면(큰 키 타임아웃 등) 마지막 정상본조차 못 읽는다. 그때
 * «이 인스턴스가 직전에 성공적으로 만든 값»이라도 있으면 화면은 살아 있다.
 * 3단 방어: Redis 정상본 → 인스턴스 기억 → 실제 계산.
 */
const memo = new Map<string, unknown>();

export async function GET(req: NextRequest) {
    const localeQuery = req.nextUrl.searchParams.get('locale') || 'ko';
    const locale: 'ko' | 'en' | 'ja' = (localeQuery === 'ko' || localeQuery === 'en' || localeQuery === 'ja')
        ? localeQuery
        : 'ko';
        
    // (origin 은 내부 HTTP 왕복을 없애면서 쓸 곳이 사라졌다 — 아래 주석 참조)

    // ★ 2026-09-15 — 어디가 느린지는 «응답에 실어야» 안다.
    //   예전엔 콜드 15초의 원인을 찾으려고 코드를 읽어야 했다.
    //   이제 각 소스의 소요 시간을 _timings 로 함께 돌려준다(진단은 공짜여야 한다).
    const T0 = Date.now();
    const timings: Record<string, number> = {};

    /**
     * ★ 「사용자를 기다리게 하지 않는다」 — 이 라우트의 공통 규칙.
     *
     * 무거운 계산은 사용자 요청 경로에서 «기다리지» 않는다.
     *   1) 마지막 정상본이 있으면 즉시 주고, 갱신은 뒤에서 건다
     *   2) 없으면 계산을 기다리되(첫 사용자 한 명), 결과를 정상본으로 남긴다
     *
     * 이 지표들은 초 단위로 뒤집히지 않는다(기관 신규 포지션 = 어제 확정된 OI,
     * 시장 폭 = 20일선 위 비율). 몇 분 된 값이 «빈 화면»보다 언제나 낫다.
     * 나이는 _timings 와 함께 드러나므로 숨기는 것이 아니다.
     */
    const LASTGOOD_TTL = 72 * 60 * 60;
    async function withLastGood<T>(name: string, key: string, fn: () => Promise<T>): Promise<T | null> {
        try {
            const cached = await getFromCache<T>(key);
            if (cached != null) {
                timings[name] = 0;
                memo.set(key, cached);
                // 뒤에서 갱신 — 이번 응답은 붙잡지 않는다
                void fn().then((fresh) => {
                    if (fresh != null) return setInCache(key, fresh, LASTGOOD_TTL);
                }).catch((e) => console.warn(`[premium-metrics] ${name} 배경 갱신 실패:`, e?.message));
                return cached;
            }
        } catch (e) {
            console.warn(`[premium-metrics] ${name} 정상본 조회 실패:`, (e as any)?.message);
        }
        // Redis 를 못 읽었어도 이 인스턴스가 직전에 만든 값이 있으면 그것부터 쓴다
        if (memo.has(key)) {
            timings[name] = 0;
            void fn().then((fresh) => {
                if (fresh != null) { memo.set(key, fresh); return setInCache(key, fresh, LASTGOOD_TTL); }
            }).catch(() => {});
            return memo.get(key) as T;
        }

        // 아무것도 없다 — 이번 한 번은 기다리고, 다음부터는 즉시 나간다
        const t = Date.now();
        try {
            const fresh = await fn();
            if (fresh != null) {
                memo.set(key, fresh);
                void setInCache(key, fresh, LASTGOOD_TTL).catch(() => {});
            }
            return fresh;
        } finally {
            timings[name] = Date.now() - t;
        }
    }
    const timed = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
        const t = Date.now();
        try { return await fn(); } finally { timings[name] = Date.now() - t; }
    };

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
        
        // ⚠️ 순서가 곧 지연이다 (2026-09-03 실측: **838바이트 응답에 4.7초**).
        //    예전엔 다섯 조회를 «차례로» 기다렸다. 실제 의존 관계는 하나뿐이다 —
        //    딜러 감마만 변동성 레짐의 flipLevel·현재가를 필요로 한다.
        //    나머지(기관 포지션·시장 폭·섹터 로테이션)는 서로 무관하므로 같이 출발시킨다.
        //    → 가장 긴 사슬이 「변동성 레짐 → 딜러 감마」 둘로 줄어든다.
        //    각 조회는 자기 try/catch 를 유지한다 — 하나가 실패해도 나머지는 나가야 한다.
        const instFlowP = (async () => {
            try {
                const { getInstitutionalFlowSummary } = await import('@/services/institutionalFlow');
                return await withLastGood('instFlow', 'premium:instflow:lastgood', () => getInstitutionalFlowSummary());
            } catch (e) {
                console.warn('[premium-metrics] 기관 신규 포지션 조회 실패:', e);
                return null;
            }
        })();

        const breadthP = (async () => {
            try {
                const { getIndexBreadth } = await import('@/services/indexBreadth');
                return await withLastGood('breadth', 'premium:breadth:lastgood', () => getIndexBreadth());
            } catch (e) {
                console.warn('[premium-metrics] 시장 폭 조회 실패:', e);
                return null;
            }
        })();

        // ★ 2026-09-15 — 한 필드 때문에 가디언 스냅샷 «전체»를 계산하지 않는다.
        //
        //   실측: 이 한 줄이 **25,868ms** 였다. 사용자가 보려는 건 rotationIntensity
        //   하나인데, 캐시가 비면 스냅샷 전체(수십 개 지표)를 인라인으로 만들었다.
        //   그동안 마켓 펄스는 아무것도 못 보여준다.
        //
        //   [원칙] 사용자 요청 경로에서 «무거운 전체 계산»을 기다리지 않는다.
        //     1) 스냅샷 캐시에 있으면 그대로 (가장 빠름)
        //     2) 없으면 마지막 정상본을 즉시 주고, 갱신은 뒤에서
        //     3) 그것도 없으면 null — 카드가 «준비 중»으로 뜨는 게
        //        26초 동안 화면이 멈추는 것보다 낫다. 갱신은 역시 뒤에서 건다.
        const ROTATION_LASTGOOD = `premium:rotation:lastgood:${locale}`;
        const rotationP = (async () => {
            try {
                const snap = await getFromCache<any>(`guardian:snapshot:${locale}`);
                if (snap?.rotationIntensity) {
                    timings.rotation = 0;
                    void setInCache(ROTATION_LASTGOOD, snap.rotationIntensity, 72 * 60 * 60).catch(() => {});
                    return snap.rotationIntensity;
                }

                // 뒤에서 채운다 — 이번 요청은 기다리지 않는다
                void GuardianDataHub.getGuardianSnapshot(false, locale)
                    .then((fresh) => {
                        if (fresh?.rotationIntensity) {
                            return setInCache(ROTATION_LASTGOOD, fresh.rotationIntensity, 72 * 60 * 60);
                        }
                    })
                    .catch((e) => console.warn('[premium-metrics] 섹터 순환 배경 갱신 실패:', e?.message));

                const lastGood = await getFromCache<any>(ROTATION_LASTGOOD);
                timings.rotation = 0;
                if (lastGood) {
                    console.log('[premium-metrics] 섹터 순환: 마지막 정상본 사용 + 배경 갱신');
                    return lastGood;
                }
                console.log('[premium-metrics] 섹터 순환: 값 없음 — 배경 갱신만 걸고 null 반환');
                return null;
            } catch (e) {
                console.warn('[premium-metrics] Failed to fetch sector snapshot:', e);
                return null;
            }
        })();

        // ★ 2026-09-15 — 자기 서버를 HTTP 로 다시 부르지 않는다.
        //
        //   예전엔 `fetch(origin + '/api/live/volatility-regime?t=SPY')` 였다.
        //   같은 프로세스 안에서 쓸 수 있는 값을 굳이 네트워크로 한 바퀴 돌렸고,
        //   그 라우트의 `revalidate = 60` 때문에 60초마다 첫 요청이 전체 비용을 냈다.
        //   실측: 이 라우트 콜드 응답 **15,986ms**. 사용자는 그동안 마켓 펄스를 못 본다.
        //
        //   같은 데이터를 만드는 것은 getStructureData 하나뿐이므로 직접 부른다.
        //   왕복(DNS·TLS·콜드 람다)이 사라지고, structureService 의 공유 Redis 캐시가
        //   그대로 적용된다.
        try {
            const { getStructureData } = await import('@/services/structureService');
            const { computeVolatilityRegime } = await import('@/services/volatilityRegime');
            const st: any = await timed('structure', () => getStructureData('SPY'));
            if (st) {
                // 레짐 계산은 «공용 함수»를 쓴다 — 라우트와 같은 식이라 값이 갈라지지 않는다
                const vr = computeVolatilityRegime(st);
                gammaFlipLevel = vr.flipLevel > 0 ? vr.flipLevel : null;
                spyPrice = vr.underlyingPrice > 0 ? vr.underlyingPrice : null;
                regime = vr.regime;
                regimeScore = vr.regimeScore;
                squeezeScore = vr.squeezeScore;
                squeezeRisk = vr.squeezeRisk;
            }
        } catch (e) {
            console.warn('[premium-metrics] 구조 데이터 조회 실패:', e);
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
        // 위에서 이미 출발시켰다 — 여기서는 기다리기만 한다.
        const instFlow: import('@/services/institutionalFlow').InstitutionalFlowSummary | null =
            await instFlowP;

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
            dealerGamma = await timed('dealerGamma', () => getDealerGamma('SPY', gammaFlipLevel, spyPrice));
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
            const b = await breadthP;   // 위에서 이미 출발시켰다
            if (b?.ndx?.pctAbove20 != null || b?.dow?.pctAbove20 != null) {
                // ⚠️ `pctAbove20` 은 이름과 달리 **0~1 비율**이다(서비스 정의 그대로).
                //    화면은 %로 쓰므로 경계에서 ×100 한다. 안 하면 52% 가 «0%» 로 찍힌다.
                const toPct = (v: number | null | undefined) =>
                    typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 10 : null;
                breadth = {
                    ndx: toPct(b.ndx?.pctAbove20),
                    dow: toPct(b.dow?.pctAbove20),
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

        // 위에서 이미 출발시켰다 (캐시 → 없으면 GuardianDataHub 폴백까지 그 안에서 끝난다)
        const rot = await rotationP;
        if (rot) {
            rotationScore = typeof rot.score === 'number' ? rot.score : rotationScore;
            rotationDirection = rot.direction ?? rotationDirection;
            rotationConviction = rot.conviction ?? rotationConviction;
            rotationBasis = rot.scoreBasis ?? rotationBasis;
            rotationWindows = typeof rot.sampleWindows === 'number' ? rot.sampleWindows : rotationWindows;
            rotationInto = rot.topInflow?.[0]?.sector ?? rotationInto;
            rotationOutOf = rot.topOutflow?.[0]?.sector ?? rotationOutOf;
        }

        return NextResponse.json({
            success: true,
            // 진단 — 콜드일 때 «어느 소스»가 붙잡는지 응답만 보고 알 수 있어야 한다
            _timings: { ...timings, total: Date.now() - T0 },
            volatilityRegime: {
                regime,
                score: regimeScore == null ? null : Math.round(regimeScore),
            },
            // ★ 이 카드에서만 뺐다 — 지표가 없어서가 아니다.
            //
            //   [정정 2026-09-09] 바로 위 주석의 «영구 상실»은 **틀린 판단이었다.**
            //   장외 체결은 법으로 FINRA TRF 에 보고되고 FINRA 가 공개한다.
            //   다크풀은 복원되어 지금 12,129종목이 당일치로 살아 있다
            //   (/api/flow/dark-pool · getDarkPoolBatch · finra:offexchange).
            //   여기 카드를 «기관 신규 포지션»으로 바꾼 것은 그 뒤의 선택이고,
            //   카드 구성을 되돌릴지는 제품 결정이라 코드가 임의로 하지 않는다.
            //   ⚠️ 이 표기를 「다크풀은 죽었다」로 읽지 말 것 — 그 오독이 실제로
            //      대체 지표를 만들게 했고, 원본을 찾는 데 시간이 걸렸다.
            darkPool: null,
            _darkPoolNote: 'restored-via-finra-2026-08-31; card intentionally replaced by institutionalFlow',
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
