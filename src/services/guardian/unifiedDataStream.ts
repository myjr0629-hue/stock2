import { calculateRLSI, RLSIResult, getMarketSession, MarketSession } from "./rlsiEngine";
import { SectorEngine, SectorFlowRate, GuardianVerdict, FlowVector, RotationIntensity } from "./sectorEngine";
import { getMacroSnapshotSSOT, MacroSnapshot } from "@/services/macroHubProvider";
import { IntelligenceNode } from "./intelligenceNode";
import { RvolEngine, RvolProfile } from "./rvolEngine";

// === TYPES ===
export interface SectorDensity {
    sector: string;
    densityScore: number; // 0-100 normalized
    height: number;       // 0-1.0 for 3D mapping
    topTickers: string[];
}

export interface DivergenceAnalysis {
    caseId: 'A' | 'B' | 'C' | 'D' | 'N';
    verdictTitle: string;
    verdictDesc: string;
    isDivergent: boolean;
    score: number;
}

// [V6.0] Rule-based Market Verdict
export interface MarketVerdict {
    status: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    headline: string;       // 1줄 핵심 결론
    keyMetrics: string[];   // 근거 수치 3개
    action: string;         // 명확한 액션
}

// [V6.0] TARGET LOCK Checklist
export interface TripleACondition {
    id: string;
    label: string;
    passed: boolean;
    current: string;
    required: string;
}

export interface TripleAChecklist {
    conditions: TripleACondition[];
    passedCount: number;
    totalCount: number;
    isLocked: boolean;
    message: string;        // 사용자 친화적 메시지
}

export interface GuardianContext {
    rlsi: RLSIResult;
    market: MacroSnapshot;
    sectors: SectorFlowRate[];
    vectors?: FlowVector[];
    verdict: GuardianVerdict;
    divergence: DivergenceAnalysis;
    verdictSourceId: string | null;
    verdictTargetId: string | null;
    marketStatus: 'GO' | 'WAIT' | 'STOP';
    rvol?: { ndx: RvolProfile; dow: RvolProfile };
    rotationIntensity?: RotationIntensity;
    // [V6.0] Hybrid Intelligence
    ruleVerdict?: MarketVerdict;        // 규칙 기반 핵심 결론
    tripleA?: {
        regime: 'BULL' | 'BEAR' | 'NEUTRAL';
        alignment: boolean;
        acceleration: boolean;
        accumulation: boolean;
        isTargetLock: boolean;
        checklist: TripleAChecklist;    // [V6.0] 체크리스트
    };
    timestamp: string;
}

// === CACHE CONFIG ===
let _cachedContext: GuardianContext | null = null;
let _lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class GuardianDataHub {

    /**
     * Get the Unified Guardian Context (SSOT)
     * Optimized with Parallel Execution for RLSI & Macro Data.
     */
    static async getGuardianSnapshot(force: boolean = false): Promise<GuardianContext> {
        const now = Date.now();

        if (!force && _cachedContext && (now - _lastFetchTime < CACHE_TTL_MS)) {
            return _cachedContext;
        }

        console.log("[Guardian] Refreshing Context (Parallel Optimization)...");

        try {
            // === STEP 1: PARALLEL DATA FETCHING (Optimization) ===
            // [V5.0] Changed order: Sector first, then RLSI with RIS score
            console.log("[Guardian V5.0] Step 1: Fetching Sector Flows & Macro in Parallel...");
            const [sectorResult, macro, rvolNdx, rvolDow] = await Promise.all([
                SectorEngine.getSectorFlows(),
                getMacroSnapshotSSOT(),
                RvolEngine.getRvol("QQQ"),
                RvolEngine.getRvol("DIA")
            ]);

            const { flows, vectors, source, target, sourceId, targetId, rotationIntensity } = sectorResult;
            console.log(`[Guardian V5.0] Step 1 Complete. RIS: ${rotationIntensity.score}, Direction: ${rotationIntensity.direction}`);

            // === STEP 2: RLSI WITH RIS INTEGRATION ===
            // [V5.0] Pass rotation score to RLSI for 4-factor calculation
            console.log("[Guardian V5.0] Step 2: Calculating RLSI with RIS...");
            const rlsi = await calculateRLSI(force, rotationIntensity.score);
            console.log(`[Guardian V5.0] Step 2 Complete. RLSI: ${rlsi.score}, Session: ${rlsi.session}`);

            // === STEP 3: DIVERGENCE ANALYSIS (The Logic) ===
            // Logic: Compare Nasdaq Change vs RLSI Score
            const nq = macro?.nqChangePercent || 0;
            const score = rlsi.score;

            // caseId: 'N' (Neutral)
            let divCase: DivergenceAnalysis = {
                caseId: 'N',
                verdictTitle: "MARKET SYNCHRONIZED",
                verdictDesc: "지수와 유동성이 동기화됨. 특이사항 없음.",
                isDivergent: false,
                score: 0
            };

            // CASE A (False Rally): Index UP (+), RLSI LOW (<40)
            if (nq > 0.3 && score < 40) {
                divCase = {
                    caseId: 'A',
                    verdictTitle: "⚠️ RETAIL TRAP (개미지옥)",
                    verdictDesc: "지수는 상승하나 유동성은 이탈 중. 추격 매수 금지.",
                    isDivergent: true,
                    score: 90
                };
            }
            // CASE B (Hidden Opportunity): Index DOWN (-), RLSI HIGH (>60)
            else if (nq < -0.2 && score > 60) {
                divCase = {
                    caseId: 'B',
                    verdictTitle: "💎 SILENT ACCUMULATION (침묵의 매집)",
                    verdictDesc: "가격 하락 중 스마트 머니 강력 유입. 분할 매수 적기.",
                    isDivergent: true,
                    score: 90
                };
            }
            // CASE C (Full Bull): Index UP, RLSI HIGH (>70)
            else if (nq > 0.5 && score > 70) {
                divCase = {
                    caseId: 'C',
                    verdictTitle: "🚀 QUANTUM LEAP (상승 폭발)",
                    verdictDesc: "강력한 유동성 동반 상승. 수익 극대화 구간.",
                    isDivergent: false, // Not a divergence, but a strong signal
                    score: 0
                };
            }
            // CASE D (Deep Freeze): Index DOWN, RLSI LOW (<30)
            else if (nq < -0.5 && score < 30) {
                divCase = {
                    caseId: 'D',
                    verdictTitle: "❄️ DEEP FREEZE (빙하기)",
                    verdictDesc: "모멘텀 소멸. 현금 확보 필수.",
                    isDivergent: false,
                    score: 0
                };
            }

            // === STEP 4: GENERATE VERDICT NARRATIVE (AI + Templates) ===
            let verdict: GuardianVerdict;

            if (divCase.isDivergent) {
                // Priority: Divergence Overrides AI
                verdict = {
                    title: divCase.verdictTitle,
                    description: divCase.verdictDesc,
                    sentiment: divCase.caseId === 'B' ? 'BULLISH' : 'BEARISH'
                };
            } else {
                // Standard Market: Use Dual Stream AI
                const staticVerdict: GuardianVerdict = {
                    title: "SYSTEM STABLE",
                    description: "특이 징후 없음. 섹터 순환매 감시 중.",
                    sentiment: 'NEUTRAL',
                };

                try {
                    // [PART 1] Rotation Insight (Sidebar)
                    const rotationText = await IntelligenceNode.generateRotationInsight({
                        rlsiScore: rlsi.score,
                        nasdaqChange: macro?.nqChangePercent || 0,
                        vectors: vectors?.map(v => ({ source: v.sourceId, target: v.targetId, strength: v.strength })) || [],
                        rvol: rvolNdx.rvol,
                        vix: macro?.vix || 0
                    });

                    // [PART 2] Reality Insight (Center) - Call Sequentially
                    const realityText = await IntelligenceNode.generateRealityInsight({
                        rlsiScore: rlsi.score,
                        nasdaqChange: macro?.nqChangePercent || 0,
                        vectors: vectors?.map(v => ({ source: v.sourceId, target: v.targetId, strength: v.strength })) || [],
                        rvol: rvolNdx.rvol,
                        vix: macro?.vix || 0
                    });

                    // [PART 3] Construct Verdict
                    if (rotationText.includes("NO KEY")) {
                        verdict = {
                            title: "SETUP REQUIRED",
                            description: "AI 인텔리전스를 활성화하려면 .env.local 파일에 GEMINI_API_KEY가 필요합니다.",
                            sentiment: 'NEUTRAL'
                        };
                    } else {
                        verdict = {
                            title: "TACTICAL INSIGHT",
                            description: rotationText, // Sidebar
                            sentiment: 'NEUTRAL',
                            realityInsight: realityText // Center
                        };
                    }
                } catch (e) {
                    console.warn("[Guardian] AI Verdict Failed, using fallback:", e);
                    verdict = staticVerdict;
                }
            }
            console.log("[Guardian] Step 3 Complete. AI Verdict Generated.");

            // === STEP 5: FINALIZE ===
            let marketStatus: 'GO' | 'WAIT' | 'STOP' = 'WAIT';
            if (rlsi.level === 'OPTIMAL') marketStatus = 'GO';
            else if (rlsi.level === 'DANGER') marketStatus = 'STOP';
            else {
                if (rlsi.score >= 50) marketStatus = 'GO';
                else marketStatus = 'WAIT';
            }

            // === STEP 5: TRIPLE-A LOGIC (TARGET LOCK) ===
            // Alignment / Acceleration / Accumulation
            // 1. Regime Detection
            let regime: 'BULL' | 'BEAR' | 'NEUTRAL' = 'NEUTRAL';
            if (rlsi.score >= 55 && nq > 0) regime = 'BULL';
            else if (rlsi.score <= 35 && nq < 0) regime = 'BEAR';

            // 2. Alignment (Market + Sector)
            // Is the flows target actually aligned with the market direction?
            // If Bull, Target Sector should be Up.
            const targetSector = flows.find(s => s.id === targetId);
            const isSectorAligned = regime === 'BULL' && (targetSector ? targetSector.change > 0 : false);

            // 3. Acceleration (RVOL > 1.2 or Vector Strength)
            // Use Market RVOL as proxy OR Vector Torque
            const isAccelerating = rvolNdx.rvol >= 1.2 || (vectors && vectors.length > 0 && vectors[0].strength > 25);

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
                        current: `${rlsi.score.toFixed(0)}점`,
                        required: '55점 이상'
                    },
                    {
                        id: 'nasdaq',
                        label: 'NASDAQ 상승',
                        passed: nq > 0,
                        current: `${nq > 0 ? '+' : ''}${nq.toFixed(2)}%`,
                        required: '> 0%'
                    },
                    {
                        id: 'sector',
                        label: '타겟 섹터 상승',
                        passed: isSectorAligned,
                        current: targetSector ? `${targetSector.name} ${targetSectorChange > 0 ? '+' : ''}${targetSectorChange.toFixed(2)}%` : 'N/A',
                        required: '상승'
                    },
                    {
                        id: 'rvol',
                        label: 'RVOL 1.2+',
                        passed: isAccelerating,
                        current: `${rvolNdx.rvol.toFixed(2)}x`,
                        required: '1.2x 이상'
                    },
                    {
                        id: 'yield',
                        label: '금리 안정',
                        passed: !yieldSpike,
                        current: `${yieldPct > 0 ? '+' : ''}${yieldPct.toFixed(2)}%`,
                        required: '< 2.5%'
                    }
                ],
                passedCount: [rlsi.score >= 55, nq > 0, isSectorAligned, isAccelerating, !yieldSpike].filter(Boolean).length,
                totalCount: 5,
                isLocked: isTargetLock,
                message: isTargetLock
                    ? '🎯 TARGET LOCKED: 강세장 진입 조건 충족'
                    : regime === 'BEAR'
                        ? '❄️ 약세장: 보수적 운용 권장'
                        : '⏸️ 방향성 부재: 관망 권장'
            };

            const tripleA = {
                regime,
                alignment: isSectorAligned,
                acceleration: isAccelerating,
                accumulation: isAccumulating,
                isTargetLock,
                checklist // [V6.0]
            };

            // [V6.0] Rule-based Market Verdict
            const breadth = rotationIntensity?.breadth || 50;
            let ruleVerdict: MarketVerdict;

            if (rlsi.score >= 60 && rotationIntensity?.direction === 'RISK_ON') {
                ruleVerdict = {
                    status: 'BULLISH',
                    headline: '📈 강세 지속 구간',
                    keyMetrics: [
                        `RLSI ${rlsi.score.toFixed(0)}점 (양호)`,
                        `순환매: ${rotationIntensity.direction}`,
                        `NASDAQ ${nq > 0 ? '+' : ''}${nq.toFixed(2)}%`
                    ],
                    action: '상승 종목 비중 확대 유효'
                };
            } else if (rlsi.score <= 35 || rotationIntensity?.direction === 'RISK_OFF') {
                ruleVerdict = {
                    status: 'BEARISH',
                    headline: '📉 방어 구간',
                    keyMetrics: [
                        `RLSI ${rlsi.score.toFixed(0)}점 (위험)`,
                        `순환매: ${rotationIntensity?.direction || 'N/A'}`,
                        `상승비율 ${breadth.toFixed(0)}%`
                    ],
                    action: '신규 매수 자제, 현금 비중 확대'
                };
            } else {
                ruleVerdict = {
                    status: 'NEUTRAL',
                    headline: '⏸️ 관망 구간',
                    keyMetrics: [
                        `RLSI ${rlsi.score.toFixed(0)}점`,
                        `순환매: ${rotationIntensity?.direction || 'NEUTRAL'}`,
                        `Breadth ${breadth.toFixed(0)}%`
                    ],
                    action: '방향성 확인 후 진입'
                };
            }

            console.log(`[Guardian V6.0] RuleVerdict: ${ruleVerdict.headline}, Action: ${ruleVerdict.action}`);

            const context: GuardianContext = {
                rlsi,
                market: macro,
                sectors: flows,
                vectors: vectors || [],
                verdict,
                divergence: divCase,
                verdictSourceId: sourceId,
                verdictTargetId: targetId,
                marketStatus,
                rvol: { ndx: rvolNdx, dow: rvolDow },
                rotationIntensity,
                ruleVerdict, // [V6.0] 규칙 기반 핵심 결론
                tripleA,     // [V6.0] 체크리스트 포함
                timestamp: new Date().toISOString()
            };

            if (!force) {
                _cachedContext = context;
                _lastFetchTime = now;
            }

            console.log("[Guardian] Context Refresh Complete.");
            return context;

        } catch (error) {
            console.error("[Guardian] Unified Stream Error:", error);
            throw error;
        }
    }
}
