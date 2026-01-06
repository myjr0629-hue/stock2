import { calculateRLSI, RLSIResult } from "./rlsiEngine";
import { SectorEngine, SectorFlowRate, GuardianVerdict, FlowVector } from "./sectorEngine";
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
    caseId: 'A' | 'B' | 'C' | 'D' | 'N'; // N for Neutral/None
    verdictTitle: string;
    verdictDesc: string;
    isDivergent: boolean;
    score: number; // Divergence Score
}

export interface GuardianContext {
    rlsi: RLSIResult;
    market: MacroSnapshot; // Consolidated Data Interface (SSOT)
    sectors: SectorFlowRate[]; // Changed from SectorDensity (Phase 2)
    vectors?: FlowVector[]; // Top 3 Flow Vectors
    verdict: GuardianVerdict;
    divergence: DivergenceAnalysis; // NEW: Added Divergence Analysis
    verdictSourceId: string | null;
    verdictTargetId: string | null;
    marketStatus: 'GO' | 'WAIT' | 'STOP';
    rvol?: { ndx: RvolProfile; dow: RvolProfile }; // NEW: RVOL Data
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
            console.log("[Guardian] Step 1: Fetching RLSI, Macro & RVOL Data in Parallel...");
            const [rlsi, macro, rvolNdx, rvolDow] = await Promise.all([
                calculateRLSI(force),
                getMacroSnapshotSSOT(),
                RvolEngine.getRvol("QQQ"),
                RvolEngine.getRvol("DIA")
            ]);
            console.log(`[Guardian] Step 1 Complete. RLSI: ${rlsi.score.toFixed(1)}, RVOL(NDX): ${rvolNdx.rvol.toFixed(2)}x`);

            // === STEP 2: SECTOR & FLOW ANALYSIS ===
            console.log("[Guardian] Step 2: Fetching Sector Flows...");
            const { flows, vectors, source, target, sourceId, targetId } = await SectorEngine.getSectorFlows();

            // === STEP 3: DIVERGENCE ANALYSIS (The Logic) ===
            // Logic: Compare Nasdaq Change vs RLSI Score
            const nq = macro?.nqChangePercent || 0;
            const score = rlsi.score;

            let divCase: DivergenceAnalysis = {
                caseId: 'N',
                verdictTitle: "MARKET SYNCED",
                verdictDesc: "지수와 내부 유동성이 동조화되고 있습니다.",
                isDivergent: false,
                score: 0
            };

            // CASE A (False Rally): Index UP (+), RLSI LOW (<40) or Falling (Not handled here deeply yet)
            // RVOL Booster: If Rally + Low Volume => Very Likely False.
            if (nq > 0.3 && score < 40) {
                divCase = {
                    caseId: 'A',
                    verdictTitle: "⚠️ FALSE RALLY (가짜 상승)",
                    verdictDesc: "시장 왜곡 감지. 소수 대형주에 의한 가짜 상승입니다. 추격 매수를 중단하세요.",
                    isDivergent: true,
                    score: 80
                };
            }
            // CASE B (Hidden Opportunity): Index DOWN (-), RLSI HIGH (>60 - Adjusted threshold for sensitivity)
            else if (nq < -0.2 && score > 60) {
                divCase = {
                    caseId: 'B',
                    verdictTitle: "💎 HIDDEN OPPORTUNITY",
                    verdictDesc: "매수 기회. 지수는 과매도 구간이나 스마트 머니의 유입이 강력합니다. 분할 매수를 시작하세요.",
                    isDivergent: true,
                    score: 80
                };
            }
            // CASE C (Full Bull): Index UP, RLSI HIGH (>70)
            else if (nq > 0.5 && score > 70) {
                divCase = {
                    caseId: 'C',
                    verdictTitle: "✅ FULL BULL (강력 매수)",
                    verdictDesc: "강력한 매수 신호. 유동성과 모멘텀이 일치합니다. 비중 확대를 권장합니다.",
                    isDivergent: false,
                    score: 0
                };
            }
            // CASE D (Deep Freeze): Index DOWN, RLSI LOW (<30)
            else if (nq < -0.5 && score < 30) {
                divCase = {
                    caseId: 'D',
                    verdictTitle: "🚨 DEEP FREEZE (대피 신호)",
                    verdictDesc: "대피 신호. 시장의 중력이 사라졌습니다. 현금을 확보하고 관망하세요.",
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
                    title: "MARKET STABLE",
                    description: "시장이 안정적인 흐름을 유지하고 있습니다. 섹터별 순환매를 주시하세요.",
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

            const context: GuardianContext = {
                rlsi,
                market: macro,
                sectors: flows,
                vectors: vectors || [],
                verdict,
                divergence: divCase, // Store for HUD
                verdictSourceId: sourceId,
                verdictTargetId: targetId,
                marketStatus,
                rvol: { ndx: rvolNdx, dow: rvolDow }, // NEW RVOL DATA
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
