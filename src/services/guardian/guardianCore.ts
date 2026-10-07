/**
 * 가디언 «공유 코어» — 언어와 무관한 시장 숫자는 한 번만 계산해 ko·ja·en 이 같이 쓴다. 문장만 언어별로 만든다.
 *
 * 출발점 (2026-10-07 운영 장중 실측): 같은 시각 RLSI 가 ko 42.7 · ja 43.4 · en 46.3, GEX 가 −26 · −10 · −16 으로 달랐다.
 * 원인 (2026-10-08 00:2x KST 운영 8회 표본 실측):
 *   ① 언어마다 «전체 컨텍스트»(RLSI·시장·섹터·감마쉴드·참여폭…)를 따로 계산하고 따로 캐시(guardian:snapshot:{locale})했다 —
 *      계산 시각이 언어마다 달랐다.
 *   ② EC2 워커가 30초마다 옛 스냅샷을 그대로 다시 쓰며 _workerTimestamp 만 새로 찍는다. 서버는 «나이 = _workerTimestamp» 로 재서
 *      내용이 6분 묵은 en 스냅샷(ts 15:17:40)을 계속 «신선»으로 냈다(8회 중 7회 RLSI 가 언어마다 달랐다).
 *   ③ 잠금(20초) 중 재계산을 건너뛰는 길은 lastgood(최대 5분 이상 묵은 사본)를 줬다(ja ts 15:12:44 가 15:21 에 나갔다).
 *
 * 고침:
 *   · 숫자(rlsi·market·sectors·vectors·rotationIntensity·rvol·ma20Breadth·breadth·rlsiHistory·gammaShield)는 «코어»로 한 번만 계산해
 *     Redis(gcore:v1) 에 둔다. 신선도는 코어 «자신의 계산 시각»으로 잰다(워커 도장과 무관).
 *   · 숫자가 박힌 언어별 문장(divergence·tripleA·ruleVerdict)은 코어에서 «순수 함수»(deriveLocaleParts)로 만든다.
 *   · 응답 출구에서 코어의 최신본을 얹는다(overlayCore) — 어느 경로(Redis 스냅샷·메모리·lastgood·새 계산)로 온 언어별 컨텍스트든
 *     숫자는 같은 코어다. AI 글(verdict)은 언어별로 그대로 두고, 글 속 숫자는 기존 출구(자리표 채움)가 그 응답의 화면 값으로 채운다.
 *   · 응답 출구는 «사용자를 기다리게 하지 않는다»(SWR): 가진 코어(신선하든 15분 안으로 낡았든)를 즉시 얹고, 낡았으면 갱신은 응답 뒤(after)에서
 *     (잠금으로 중복 방지 · 실패하면 20초 쉰다). 코어를 직접 계산하는 것은 언어별 스냅샷을 새로 만드는 계산 경로뿐이다.
 *
 * 이 파일은 «순수 + 주입» 이다 — 벤더·Redis 를 직접 부르지 않는다(tests/guardianCore.test.ts 가 가짜 의존으로 고정한다).
 */
import type { RLSIResult } from './rlsiEngine';
import type { SectorFlowRate, FlowVector, RotationIntensity, GuardianVerdict } from './sectorEngine';
import type { MacroSnapshot } from '@/services/macroHubProvider';
import type { RvolProfile } from './rvolEngine';
import type { GammaShieldData } from './gammaShieldEngine';
import type { GuardianContext, DivergenceAnalysis, MarketVerdict, TripleAChecklist } from './unifiedDataStream';

export type GuardianLocale = 'ko' | 'en' | 'ja';
type Locale = GuardianLocale;

// ─────────────────────────────────────────────────────────────────────────────
// 1) 언어별 문구 표 (unifiedDataStream 에서 옮겨 왔다 — 내용은 한 글자도 바꾸지 않았다)
// ─────────────────────────────────────────────────────────────────────────────

export const VERDICT_TEXTS: Record<string, Record<Locale, { title: string; desc: string }>> = {
    SYNC: {
        ko: { title: "MARKET SYNCHRONIZED", desc: "지수와 유동성 흐름이 동기화 상태. 이상 징후 미관측." },
        en: { title: "MARKET SYNCHRONIZED", desc: "Index and liquidity flows are aligned. No anomalies detected." },
        ja: { title: "MARKET SYNCHRONIZED", desc: "指数と流動性フローが同期状態。異常兆候は未観測。" }
    },
    RETAIL_TRAP: {
        ko: { title: "DIVERGENCE DETECTED", desc: "지수 상승에도 유동성 이탈 진행 중. 표면 강세와 내부 약세 괴리 관측." },
        en: { title: "DIVERGENCE DETECTED", desc: "Index advancing while liquidity exits. Surface strength diverges from internal weakness." },
        ja: { title: "DIVERGENCE DETECTED", desc: "指数上昇中も流動性離脱が進行。表面の強さと内部の弱さの乖離を観測。" }
    },
    SILENT_ACCUM: {
        ko: { title: "STEALTH INFLOW", desc: "가격 하락 구간에서 기관 유동성 유입 관측. 역방향 자금 흐름 감지." },
        en: { title: "STEALTH INFLOW", desc: "Institutional liquidity inflow observed during price decline. Counter-directional capital flow detected." },
        ja: { title: "STEALTH INFLOW", desc: "価格下落局面で機関流動性の流入を観測。逆方向の資金フローを検出。" }
    },
    QUANTUM_LEAP: {
        ko: { title: "MOMENTUM SURGE", desc: "강한 유동성 동반 상승세 관측. 거래량과 가격 동시 확장 구간." },
        en: { title: "MOMENTUM SURGE", desc: "Strong liquidity-backed advance observed. Volume and price expanding simultaneously." },
        ja: { title: "MOMENTUM SURGE", desc: "強い流動性を伴う上昇トレンドを観測。出来高と価格が同時拡大中。" }
    },
    DEEP_FREEZE: {
        ko: { title: "MOMENTUM DEPLETION", desc: "모멘텀 및 유동성 동시 위축 관측. 방향성 부재 구간." },
        en: { title: "MOMENTUM DEPLETION", desc: "Momentum and liquidity contraction observed simultaneously. Directionless phase." },
        ja: { title: "MOMENTUM DEPLETION", desc: "モメンタムと流動性の同時収縮を観測。方向性不在の局面。" }
    },
    STABLE: {
        ko: { title: "SYSTEM STABLE", desc: "특이 징후 미관측. 섹터 순환 흐름 모니터링 중." },
        en: { title: "SYSTEM STABLE", desc: "No anomalies detected. Sector rotation flows under surveillance." },
        ja: { title: "SYSTEM STABLE", desc: "特異兆候は未観測。セクターローテーションフローを監視中。" }
    },
    SETUP_REQUIRED: {
        ko: { title: "SETUP REQUIRED", desc: "AI 인텔리전스를 활성화하려면 .env.local 파일에 GEMINI_API_KEY가 필요합니다." },
        en: { title: "SETUP REQUIRED", desc: "GEMINI_API_KEY is required in .env.local to activate AI intelligence." },
        ja: { title: "SETUP REQUIRED", desc: "AIインテリジェンスを有効にするには.env.localにGEMINI_API_KEYが必要です。" }
    }
};

const CHECKLIST_TEXTS: Record<Locale, {
    targetLocked: string;
    bearMode: string;
    waitMode: string;
    nasdaqUp: string;
    targetSectorUp: string;
    yieldStable: string;
    above: string;
    rising: string;
    under: string;
}> = {
    ko: {
        targetLocked: "TARGET LOCKED :: 강세장 진입 조건 충족",
        bearMode: "BEAR MODE :: 보수적 운용 구간",
        waitMode: "STANDBY :: 관망 구간",
        nasdaqUp: "NASDAQ 상승",
        targetSectorUp: "타겟 섹터 상승",
        yieldStable: "금리 안정",
        above: "이상",
        rising: "상승",
        under: "미만"
    },
    en: {
        targetLocked: "TARGET LOCKED :: Bull market conditions met",
        bearMode: "BEAR MODE :: Defensive stance recommended",
        waitMode: "STANDBY :: Wait recommended",
        nasdaqUp: "NASDAQ Rising",
        targetSectorUp: "Target Sector Rising",
        yieldStable: "Yield Stable",
        above: "or above",
        rising: "Rising",
        under: "under"
    },
    ja: {
        targetLocked: "TARGET LOCKED :: 強気相場条件充足",
        bearMode: "BEAR MODE :: 防御運用推奨",
        waitMode: "STANDBY :: 様子見推奨",
        nasdaqUp: "NASDAQ上昇",
        targetSectorUp: "ターゲットセクター上昇",
        yieldStable: "金利安定",
        above: "以上",
        rising: "上昇",
        under: "未満"
    }
};

const RULE_VERDICT_TEXTS: Record<Locale, {
    bullish: { headline: string; action: string };
    bearish: { headline: string; action: string };
    neutral: { headline: string; action: string };
    rotation: string;
    riskScore: string;
    dangerScore: string;
    advanceRatio: string;
}> = {
    ko: {
        bullish: { headline: "BULL PHASE ACTIVE", action: "상승 종목 비중 확대 유효" },
        bearish: { headline: "DEFENSIVE PHASE", action: "신규 매수 자제, 현금 비중 확대" },
        neutral: { headline: "STANDBY PHASE", action: "방향성 확인 후 진입" },
        rotation: "순환매",
        riskScore: "양호",
        dangerScore: "위험",
        advanceRatio: "상승비율"
    },
    en: {
        bullish: { headline: "BULL PHASE ACTIVE", action: "Increase exposure to rising stocks" },
        bearish: { headline: "DEFENSIVE PHASE", action: "Avoid new buys, increase cash" },
        neutral: { headline: "STANDBY PHASE", action: "Enter after direction confirmed" },
        rotation: "Rotation",
        riskScore: "Healthy",
        dangerScore: "Danger",
        advanceRatio: "Advance Ratio"
    },
    ja: {
        bullish: { headline: "BULL PHASE ACTIVE", action: "上昇銘柄のウェイト拡大有効" },
        bearish: { headline: "DEFENSIVE PHASE", action: "新規買い自制、現金ウェイト拡大" },
        neutral: { headline: "STANDBY PHASE", action: "方向性確認後にエントリー" },
        rotation: "ローテーション",
        riskScore: "良好",
        dangerScore: "危険",
        advanceRatio: "上昇比率"
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2) 코어 — 언어와 무관한 숫자
// ─────────────────────────────────────────────────────────────────────────────

export interface GuardianCore {
    /** 형식 버전 — 바뀌면 옛 사본은 읽지 않는다 */
    v: 1;
    /** 이 숫자를 계산 끝낸 시각(ISO). 신선도·«누가 더 새로운가»의 기준 */
    timestamp: string;
    /** 계산 당시 세션(rlsi.session) — 지금 세션과 다르면 낡은 것으로 본다 */
    session: string;
    rlsi: RLSIResult;
    market: MacroSnapshot;
    sectors: SectorFlowRate[];
    vectors: FlowVector[];
    sourceId: string | null;
    targetId: string | null;
    rvol: { ndx: RvolProfile; dow: RvolProfile };
    ma20Breadth: GuardianContext['ma20Breadth'];
    rotationIntensity: RotationIntensity;
    breadth: NonNullable<GuardianContext['breadth']>;
    rlsiHistory: { time: string; score: number }[];
    gammaShield: GammaShieldData | null;
    /** AI 재료용 시장 헤드라인 — 응답에는 싣지 않는다 */
    news: string[];
}

/** 코어로 쓸 수 있는 모양인가. 섹터가 비면 «벤더 장애로 반쯤 계산된» 것이다 — 캐시하지 않는다(MAP FLAP FIX 와 같은 이유) */
export function isUsableCore(c: any): c is GuardianCore {
    return !!c && c.v === 1 && typeof c.timestamp === 'string' && Number.isFinite(Date.parse(c.timestamp))
        && !!c.rlsi && Number.isFinite(c.rlsi.score) && !!c.market && !!c.rotationIntensity && !!c.rvol && !!c.breadth
        && Array.isArray(c.sectors) && c.sectors.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) 코어 → 언어별 파생 (순수 함수) — 숫자가 박힌 문장은 여기서만 만든다
// ─────────────────────────────────────────────────────────────────────────────

export interface LocaleParts {
    divCase: DivergenceAnalysis;
    marketStatus: 'GO' | 'WAIT' | 'STOP';
    tripleA: NonNullable<GuardianContext['tripleA']>;
    ruleVerdict: MarketVerdict;
}

/**
 * unifiedDataStream.computeGuardianSnapshot 의 STEP 3(괴리)·STEP 5(상태·Triple-A·규칙 판정)를 «그대로» 옮긴 것이다.
 * 계산 경로와 응답 출구(overlayCore)가 같은 함수를 쓰므로 둘이 갈라질 수 없다.
 */
export function deriveLocaleParts(core: GuardianCore, locale: Locale): LocaleParts {
    const macro = core.market;
    const rlsi = core.rlsi;
    const flows = core.sectors;
    const vectors = core.vectors;
    const targetId = core.targetId;
    const rvolNdx = core.rvol.ndx;
    const rotationIntensity = core.rotationIntensity;

    const nq = macro?.nqChangePercent || 0;
    const score = rlsi.score;
    const nqSign = nq >= 0 ? '+' : '';
    const nqStr = `${nqSign}${nq.toFixed(2)}%`;
    const scoreStr = score.toFixed(0);

    // Dynamic reasoning builders per locale
    const buildReason = {
        ko: {
            caseA: `NASDAQ ${nqStr} 상승 중이나 RLSI ${scoreStr}(40 미만)으로 유동성 지표는 약세. 지수 표면의 강세와 내부 유동성 흐름의 괴리 관측.`,
            caseB: `NASDAQ ${nqStr} 하락 중이나 RLSI ${scoreStr}(60 이상)으로 유동성은 유입 중. 가격 하락 속 기관 자금 유입 패턴 관측.`,
            caseC: `NASDAQ ${nqStr} 상승 + RLSI ${scoreStr}(70 이상). 가격과 유동성이 동시 확장하는 강한 모멘텀 구간.`,
            caseD: `NASDAQ ${nqStr} 하락 + RLSI ${scoreStr}(30 미만). 가격·유동성 동시 위축으로 방향성 부재 구간.`,
            sync: `NASDAQ ${nqStr}, RLSI ${scoreStr}. 지수와 유동성 흐름이 동기화 상태. 이상 징후 미관측.`,
        },
        en: {
            caseA: `NASDAQ ${nqStr} rising but RLSI ${scoreStr} (below 40) signals weak liquidity. Surface strength diverges from internal capital flow weakness.`,
            caseB: `NASDAQ ${nqStr} declining but RLSI ${scoreStr} (above 60) shows liquidity inflow. Institutional capital accumulation observed during price decline.`,
            caseC: `NASDAQ ${nqStr} + RLSI ${scoreStr} (above 70). Price and liquidity expanding simultaneously — strong momentum phase.`,
            caseD: `NASDAQ ${nqStr} + RLSI ${scoreStr} (below 30). Price and liquidity contracting — directionless phase.`,
            sync: `NASDAQ ${nqStr}, RLSI ${scoreStr}. Index and liquidity flows are aligned. No divergence detected.`,
        },
        ja: {
            caseA: `NASDAQ ${nqStr}上昇中もRLSI ${scoreStr}(40未満)で流動性は弱気。指数表面の強さと内部流動性の乖離を観測。`,
            caseB: `NASDAQ ${nqStr}下落中もRLSI ${scoreStr}(60以上)で流動性は流入中。価格下落中の機関資金流入パターンを観測。`,
            caseC: `NASDAQ ${nqStr} + RLSI ${scoreStr}(70以上)。価格と流動性が同時拡大する強いモメンタム局面。`,
            caseD: `NASDAQ ${nqStr} + RLSI ${scoreStr}(30未満)。価格・流動性の同時収縮で方向性不在の局面。`,
            sync: `NASDAQ ${nqStr}、RLSI ${scoreStr}。指数と流動性フローが同期状態。乖離は未観測。`,
        },
    };
    const reason = buildReason[locale] || buildReason.en;

    // caseId: 'N' (Neutral)
    let divCase: DivergenceAnalysis = {
        caseId: 'N',
        verdictTitle: VERDICT_TEXTS.SYNC[locale].title,
        verdictDesc: reason.sync,
        isDivergent: false,
        score: 0
    };

    // CASE A (False Rally): Index UP (+), RLSI LOW (<40)
    if (nq > 0.3 && score < 40) {
        divCase = {
            caseId: 'A',
            verdictTitle: VERDICT_TEXTS.RETAIL_TRAP[locale].title,
            verdictDesc: reason.caseA,
            isDivergent: true,
            score: 90
        };
    }
    // CASE B (Hidden Opportunity): Index DOWN (-), RLSI HIGH (>60)
    else if (nq < -0.2 && score > 60) {
        divCase = {
            caseId: 'B',
            verdictTitle: VERDICT_TEXTS.SILENT_ACCUM[locale].title,
            verdictDesc: reason.caseB,
            isDivergent: true,
            score: 90
        };
    }
    // CASE C (Full Bull): Index UP, RLSI HIGH (>70)
    else if (nq > 0.5 && score > 70) {
        divCase = {
            caseId: 'C',
            verdictTitle: VERDICT_TEXTS.QUANTUM_LEAP[locale].title,
            verdictDesc: reason.caseC,
            isDivergent: false,
            score: 0
        };
    }
    // CASE D (Deep Freeze): Index DOWN, RLSI LOW (<30)
    else if (nq < -0.5 && score < 30) {
        divCase = {
            caseId: 'D',
            verdictTitle: VERDICT_TEXTS.DEEP_FREEZE[locale].title,
            verdictDesc: reason.caseD,
            isDivergent: false,
            score: 0
        };
    }

    let marketStatus: 'GO' | 'WAIT' | 'STOP' = 'WAIT';
    if (rlsi.level === 'OPTIMAL') marketStatus = 'GO';
    else if (rlsi.level === 'DANGER') marketStatus = 'STOP';
    else {
        if (rlsi.score >= 50) marketStatus = 'GO';
        else marketStatus = 'WAIT';
    }

    // === STEP 5: TRIPLE-A LOGIC (TARGET LOCK) ===
    // Alignment / Acceleration / Accumulation
    // 1. Regime Detection — [V6.1] Cross-validated with Rotation Direction
    let regime: 'BULL' | 'BEAR' | 'NEUTRAL' = 'NEUTRAL';
    if (rlsi.score >= 55 && nq > 0) regime = 'BULL';
    else if (rlsi.score <= 35 && nq < 0) regime = 'BEAR';

    // [V6.1] Rotation Cross-Validation — prevent conflicting signals
    const rotDir = rotationIntensity?.direction;
    const rotConviction = rotationIntensity?.conviction;

    if (regime === 'BULL' && rotDir === 'RISK_OFF' && rotConviction === 'HIGH') {
        // "겉은 강세, 속은 약세" — surface bullish but money rotating to defense
        regime = 'NEUTRAL';
    } else if (regime === 'BEAR' && rotDir === 'RISK_ON' && rotConviction === 'HIGH') {
        // Surface bearish but money flowing into growth — potential bottom
        regime = 'NEUTRAL';
    }

    // 2. Alignment (Market + Sector)
    // Is the flows target actually aligned with the market direction?
    // If Bull, Target Sector should be Up.
    const targetSector = flows.find(s => s.id === targetId);
    const isSectorAligned = regime === 'BULL' && (targetSector ? targetSector.change > 0 : false);

    // 3. Acceleration (RVOL > 1.2 or Vector Strength)
    // Use Market RVOL as proxy OR Vector Torque
    const isAccelerating = (rvolNdx.rvol ?? 0) >= 1.2 || (vectors && vectors.length > 0 && vectors[0].strength > 25);

    // 4. Accumulation (Breadth)
    // Check top 3 constituents of target sector
    let isAccumulating = false;
    if (targetSector && targetSector.topConstituents && targetSector.topConstituents.length >= 3) {
        // If 2 out of top 3 are green
        const top3 = targetSector.topConstituents.slice(0, 3);
        const greenCount = top3.filter(c => c.change > 0).length;
        if (greenCount >= 2) isAccumulating = true;
    }

    // 5. 10Y Bond Filter (Safety Check)
    // If Yield is spiking (> +2.5%), invalidate Bull Lock
    const yieldSpike = (macro?.factors?.us10y?.chgPct || 0) > 2.5;

    // FINAL LOCK DECISION
    const isTargetLock = regime === 'BULL' && isSectorAligned && isAccelerating && isAccumulating && !yieldSpike;

    // [V6.0] Build Checklist with actual values
    const yieldPct = macro?.factors?.us10y?.chgPct || 0;
    const targetSectorChange = targetSector?.change || 0;

    const checklist: TripleAChecklist = {
        conditions: [
            {
                id: 'rlsi',
                label: 'RLSI 55+',
                passed: rlsi.score >= 55,
                current: `${rlsi.score.toFixed(0)}`,
                required: `55 ${CHECKLIST_TEXTS[locale].above}`
            },
            {
                id: 'nasdaq',
                label: CHECKLIST_TEXTS[locale].nasdaqUp,
                passed: nq > 0,
                current: `${nq > 0 ? '+' : ''}${nq.toFixed(2)}%`,
                required: '> 0%'
            },
            {
                id: 'sector',
                label: CHECKLIST_TEXTS[locale].targetSectorUp,
                passed: isSectorAligned,
                current: targetSector ? `${targetSector.name} ${targetSectorChange > 0 ? '+' : ''}${targetSectorChange.toFixed(2)}%` : 'N/A',
                required: CHECKLIST_TEXTS[locale].rising
            },
            {
                id: 'rvol',
                label: 'RVOL 1.2+',
                passed: isAccelerating,
                // 정규장이 아니면 «0.00x»(저조)가 아니라 «—»(측정 불가)로 보여야 한다
                current: rvolNdx.status === "OPEN" && (rvolNdx.rvol ?? 0) > 0
                    ? `${rvolNdx.rvol!.toFixed(2)}x`
                    : '—',
                required: `1.2x ${CHECKLIST_TEXTS[locale].above}`
            },
            {
                id: 'yield',
                label: CHECKLIST_TEXTS[locale].yieldStable,
                passed: !yieldSpike,
                current: `${yieldPct > 0 ? '+' : ''}${yieldPct.toFixed(2)}%`,
                required: `< 2.5%`
            }
        ],
        passedCount: [rlsi.score >= 55, nq > 0, isSectorAligned, isAccelerating, !yieldSpike].filter(Boolean).length,
        totalCount: 5,
        isLocked: isTargetLock,
        message: isTargetLock
            ? CHECKLIST_TEXTS[locale].targetLocked
            : regime === 'BEAR'
                ? CHECKLIST_TEXTS[locale].bearMode
                : CHECKLIST_TEXTS[locale].waitMode
    };

    const tripleA = {
        regime,
        alignment: isSectorAligned,
        acceleration: isAccelerating,
        accumulation: isAccumulating,
        isTargetLock,
        checklist // [V6.0]
    };

    // [V6.1] Rule-based Market Verdict — Rotation-aware
    const breadth = rotationIntensity?.breadth || 50;
    let ruleVerdict: MarketVerdict;

    if (rlsi.score >= 60 && rotDir === 'RISK_ON') {
        // Strong RLSI + growth rotation → confident bullish
        ruleVerdict = {
            status: 'BULLISH',
            headline: RULE_VERDICT_TEXTS[locale].bullish.headline,
            keyMetrics: [
                `RLSI ${rlsi.score.toFixed(0)} (${RULE_VERDICT_TEXTS[locale].riskScore})`,
                `${RULE_VERDICT_TEXTS[locale].rotation}: ${rotDir}`,
                `NASDAQ ${nq > 0 ? '+' : ''}${nq.toFixed(2)}%`
            ],
            action: RULE_VERDICT_TEXTS[locale].bullish.action
        };
    } else if (rlsi.score <= 35 || (rotDir === 'RISK_OFF' && rotConviction === 'HIGH')) {
        // RLSI danger zone OR high-conviction defensive rotation → bearish
        ruleVerdict = {
            status: 'BEARISH',
            headline: RULE_VERDICT_TEXTS[locale].bearish.headline,
            keyMetrics: [
                `RLSI ${rlsi.score.toFixed(0)} (${rotConviction === 'HIGH' ? RULE_VERDICT_TEXTS[locale].dangerScore : RULE_VERDICT_TEXTS[locale].riskScore})`,
                `${RULE_VERDICT_TEXTS[locale].rotation}: ${rotDir || 'N/A'} (${rotConviction || 'N/A'})`,
                `${RULE_VERDICT_TEXTS[locale].advanceRatio} ${breadth.toFixed(0)}%`
            ],
            action: RULE_VERDICT_TEXTS[locale].bearish.action
        };
    } else {
        // Mixed or insufficient signal → neutral/standby
        ruleVerdict = {
            status: 'NEUTRAL',
            headline: RULE_VERDICT_TEXTS[locale].neutral.headline,
            keyMetrics: [
                `RLSI ${rlsi.score.toFixed(0)}`,
                `${RULE_VERDICT_TEXTS[locale].rotation}: ${rotDir || 'NEUTRAL'} (${rotConviction || 'N/A'})`,
                `Breadth ${breadth.toFixed(0)}%`
            ],
            action: RULE_VERDICT_TEXTS[locale].neutral.action
        };
    }

    return { divCase, marketStatus, tripleA, ruleVerdict };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) 응답 출구 — 어느 경로로 온 언어별 컨텍스트든 숫자는 «최신 코어» 하나
// ─────────────────────────────────────────────────────────────────────────────

/** 판정(verdict)의 제목·감정이 «괴리 판정에서 온 것»일 때만 새 괴리에 맞춘다 — AI 글 본문은 건드리지 않는다 */
const DIVERGENCE_TITLES = new Set<string>([
    VERDICT_TEXTS.RETAIL_TRAP.ko.title, VERDICT_TEXTS.SILENT_ACCUM.ko.title,
]);

export function overlayCore(context: GuardianContext, core: GuardianCore, locale: Locale): GuardianContext {
    // 이미 이 코어(이거나 더 새 것)로 만든 컨텍스트면 그대로 — 되돌리지 않는다
    if (context.coreAt && context.coreAt >= core.timestamp) return context;
    const parts = deriveLocaleParts(core, locale);
    let verdict = context.verdict;
    if (verdict) {
        const oldDiv = context.divergence;
        const patch: Partial<GuardianVerdict> = {};
        if (verdict.title === 'TACTICAL INSIGHT' || DIVERGENCE_TITLES.has(verdict.title)) {
            const isDivergent = parts.divCase.isDivergent && core.rlsi.session === 'REG';
            patch.title = isDivergent ? parts.divCase.verdictTitle : 'TACTICAL INSIGHT';
            patch.sentiment = isDivergent ? (parts.divCase.caseId === 'B' ? 'BULLISH' : 'BEARISH') : 'NEUTRAL';
        }
        // AI 실패 폴백 경로: 본문이 괴리 문장(숫자 박힌 템플릿) 그대로다 — 새 숫자의 같은 템플릿으로 바꾼다
        if (oldDiv && verdict.description === oldDiv.verdictDesc) patch.description = parts.divCase.verdictDesc;
        if (Object.keys(patch).length) verdict = { ...verdict, ...patch };
    }
    return {
        ...context,
        rlsi: core.rlsi,
        market: core.market,
        sectors: core.sectors,
        vectors: core.vectors || [],
        verdict,
        divergence: parts.divCase,
        verdictSourceId: core.sourceId,
        verdictTargetId: core.targetId,
        marketStatus: parts.marketStatus,
        rvol: core.rvol,
        ma20Breadth: core.ma20Breadth,
        rotationIntensity: core.rotationIntensity,
        ruleVerdict: parts.ruleVerdict,
        tripleA: parts.tripleA,
        breadth: core.breadth,
        rlsiHistory: core.rlsiHistory,
        gammaShield: core.gammaShield,
        coreAt: core.timestamp,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) 코어 저장소 — 한 번만 계산하고(단일 비행) 세 언어가 같이 읽는다
// ─────────────────────────────────────────────────────────────────────────────

/** 접두사 gcore: 는 redisClient 의 Upstash 복제 목록에 없다 → EC2 에만 쓴다(EC2 장애 땐 예전처럼 Upstash 가 받는다) */
export const CORE_KEY = 'gcore:v1';
export const CORE_LOCK_KEY = 'gcore:lock';
/** 코어가 «신선»한 나이(정규·확장장). 기존 스냅샷 FRESH_MS 와 같다 */
export const CORE_FRESH_MS = 45_000;
/** 장외(CLOSED)는 값이 거의 안 변한다 — 벤더 호출을 줄인다 */
export const CORE_FRESH_CLOSED_MS = 120_000;
/** 코어를 «가진 것으로 대신 쓸 수 있는» 한계 나이 — 계산이 실패하거나 잠금 중일 때, 응답 출구에서 얹을 때. 넘으면 없는 것으로 본다(낡은 숫자를 라이브처럼 내지 않는다) */
export const CORE_MAX_STALE_MS = 15 * 60_000;
/** 다른 인스턴스가 계산을 시작한 뒤 이 시간 안이면 또 계산하지 않고 가진 것을 준다 */
export const CORE_LOCK_MS = 20_000;
/** 배경 갱신이 실패한 인스턴스는 이 시간 동안 다시 시도하지 않는다 — 벤더 장애 중 요청마다 두드리지 않게 */
export const CORE_FAIL_COOLDOWN_MS = 20_000;
/** 같은 인스턴스 안 연속 호출은 Redis 를 다시 치지 않는다 */
const CORE_MEM_MS = 1_500;

export interface CoreDeps {
    now: () => number;
    /** 지금 세션 */
    session: () => string;
    read: () => Promise<GuardianCore | null>;
    write: (core: GuardianCore, ttlSec: number) => Promise<void>;
    readLock: () => Promise<number | null>;
    writeLock: (at: number) => Promise<void>;
    /** 벤더·엔진에서 코어를 새로 계산한다 */
    compute: (force: boolean) => Promise<GuardianCore>;
    /** 응답 뒤 작업 예약. 예약했으면 true, 못 하면 false(호출부가 기다리며 계산한다) */
    background?: (job: () => Promise<void>) => boolean;
    /** 배경 갱신 잠금(여러 인스턴스가 동시에 갱신하지 않게). 잡았으면 true */
    bgLock?: () => Promise<boolean>;
    bgUnlock?: () => Promise<void>;
    log?: (msg: string) => void;
}

export type CoreMode = 'fresh' | 'swr';

let _mem: { core: GuardianCore; at: number } | null = null;
let _inflight: Promise<GuardianCore> | null = null;
let _failUntil = 0;

/** 테스트 전용 */
export function _resetCoreForTest(): void { _mem = null; _inflight = null; _failUntil = 0; }

const freshMsFor = (session: string) => (session === 'CLOSED' ? CORE_FRESH_CLOSED_MS : CORE_FRESH_MS);
const ageOf = (c: GuardianCore, now: number) => now - Date.parse(c.timestamp);

async function safe<T>(p: () => Promise<T>): Promise<T | null> {
    try { return await p(); } catch { return null; }
}

function remember(deps: CoreDeps, core: GuardianCore): GuardianCore {
    _mem = { core, at: deps.now() };
    return core;
}

async function computeAndStore(deps: CoreDeps, force: boolean): Promise<GuardianCore> {
    if (_inflight) return _inflight;     // 같은 인스턴스에서 동시에 온 요청은 한 계산을 같이 기다린다
    const job = (async () => {
        try {
            await safe(() => deps.writeLock(deps.now()));
            const core = await deps.compute(force);
            if (isUsableCore(core)) {
                remember(deps, core);
                const ttl = core.session === 'REG' ? 120 : 600;
                await safe(() => deps.write(core, ttl));
            }
            return core;
        } finally {
            _inflight = null;
        }
    })();
    _inflight = job;
    return job;
}

/** 응답 뒤(after)에 코어 갱신을 예약한다. 이미 계산 중이거나 방금 실패했거나 예약할 수 없는 환경이면 아무것도 하지 않는다 */
function scheduleRefresh(deps: CoreDeps): void {
    if (_inflight) return;
    if (!deps.background || !deps.bgLock) return;
    if (_failUntil > deps.now()) return;
    const log = deps.log ?? (() => { });
    deps.background(async () => {
        if (!(await safe(() => deps.bgLock!()))) return;      // 다른 인스턴스가 갱신 중
        try {
            const core = await computeAndStore(deps, false);
            if (!isUsableCore(core)) _failUntil = deps.now() + CORE_FAIL_COOLDOWN_MS;
        } catch (e: any) {
            _failUntil = deps.now() + CORE_FAIL_COOLDOWN_MS;
            log(`[GuardianCore] 배경 갱신 실패(가진 코어 유지): ${e?.message ?? e}`);
        } finally {
            await safe(() => deps.bgUnlock?.() ?? Promise.resolve());
        }
    });
}

/**
 * 공유 코어를 돌려준다.
 *   mode 'fresh' — 계산 경로용. 신선하면 그대로, 아니면 계산해서(다른 인스턴스가 방금 시작했으면 가진 것을) 준다.
 *                  계산이 실패해도 쓸 만한(15분 안) 사본이 있으면 그것을, 없으면 던진다.
 *   mode 'swr'   — 응답 출구용. «사용자를 기다리게 하지 않는다»: 있는 것(신선하든 낡았든 15분 안)을 즉시 주고 없으면 null.
 *                  낡았으면 갱신은 응답 뒤(after)로 예약한다. 절대 던지지 않고 절대 직접 계산하지 않는다.
 */
export async function getSharedCore(deps: CoreDeps, opts: { force?: boolean; mode?: CoreMode } = {}): Promise<GuardianCore | null> {
    const force = !!opts.force;
    const mode: CoreMode = opts.mode ?? 'fresh';
    const log = deps.log ?? (() => { });
    const now = deps.now();
    const session = deps.session();
    const isFresh = (c: GuardianCore) => c.session === session && ageOf(c, now) >= -5_000 && ageOf(c, now) <= freshMsFor(session);   // 시계 오차로 «미래»(−5초 이내)는 신선
    const isUsableStale = (c: GuardianCore) => ageOf(c, now) <= CORE_MAX_STALE_MS;

    // 1) 이 인스턴스의 아주 최근 기억 — 연속 호출이 Redis 를 다시 치지 않는다
    if (!force && _mem && now - _mem.at < CORE_MEM_MS && isFresh(_mem.core)) return _mem.core;

    // 2) Redis (장애·미스면 이 인스턴스의 기억) 에서 후보
    let have: GuardianCore | null = null;
    if (!force) {
        const cached = await safe(deps.read);
        have = isUsableCore(cached) ? cached : (_mem && isUsableCore(_mem.core) ? _mem.core : null);
        if (have && isFresh(have)) return remember(deps, have);
        if (have && !isUsableStale(have)) have = null;       // 너무 낡았다 — 없는 것으로
    }

    // 3) swr — 기다리지 않는다
    if (mode === 'swr') {
        scheduleRefresh(deps);
        return have;
    }

    // 4) fresh — 다른 인스턴스가 방금 계산을 시작했으면 또 계산하지 않고 가진 것을 준다(옛 lastgood 길과 같은 목적, 단 같은 코어를 모두에게)
    if (!force && have) {
        const lockedAt = await safe(deps.readLock);
        if (typeof lockedAt === 'number' && now - lockedAt < CORE_LOCK_MS) return have;
    }
    try {
        const core = await computeAndStore(deps, force);
        if (isUsableCore(core)) return core;
        // 반쯤 계산된 코어(섹터 없음) — 쓸 만한 사본이 있으면 그것을, 없으면 한 번만 그대로(옛 «serving once only»)
        if (have) return have;
        if (_mem && isUsableCore(_mem.core) && isUsableStale(_mem.core)) return _mem.core;
        return core;
    } catch (e: any) {
        log(`[GuardianCore] 계산 실패: ${e?.message ?? e}`);
        if (have) return have;
        if (_mem && isUsableCore(_mem.core) && isUsableStale(_mem.core)) return _mem.core;
        throw e;
    }
}
