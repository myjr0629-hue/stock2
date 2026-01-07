// [S-56.4 Phase 7] Power Engine v2 - Score Normalization
// NO 50-point clustering - Layer-based scoring with null for incomplete
// Top3 Gate: Incomplete items cannot be promoted

import {
    QUALITY_TIER_CONFIG,
    POWER_SCORE_CONFIG,
    REGIME_CONFIG,
    QualityTier,
    QualityTierResult,
    MarketRegime,
    Top3Stats,
    PowerMeta
} from './engineConfig';
import { MAGNIFICENT_7, BIO_LEADERS_TOP5, DATACENTER_TOP5, getSectorForTicker } from './universePolicy';

// === GUARDIAN SIGNAL INTEGRATION (Phase 4) ===
export interface GuardianSignal {
    marketStatus: 'GO' | 'WAIT' | 'STOP';
    divCaseId: 'A' | 'B' | 'C' | 'D' | 'N';
    divScore: number;
}

// [Phase 36] Export checkOvernightRisk for use in analysis
export function checkOvernightRisk(evidence: any): boolean {
    // 1. IV Rank (Proxy: PCR extremely low/high or VIX high)
    // 2. Gamma Regime: If 'Short Gamma' (Vol expansion), holding overnight is risky unless breakout is confirmed.
    // 3. Market VIX > 35

    const vix = evidence?.macro?.vix?.value || 0;
    if (vix > 35) return true;

    // Pending Event
    // if (evidence?.policy?.event) return true;

    return false;
}

function isLeaderSymbol(symbol: string): boolean {
    const s = symbol.toUpperCase();
    return MAGNIFICENT_7.includes(s as any) || BIO_LEADERS_TOP5.includes(s as any) || DATACENTER_TOP5.includes(s as any);
}


// === LAYER SCORES (null = not calculated) ===

interface LayerScores {
    price: number | null;
    options: number | null;
    flow: number | null;
    macro: number | null;
    stealth: number | null;
    policy: number | null; // [Step 1] New Policy Layer
}

interface ScoreResult {
    alphaScore: number | null;
    layerScores: LayerScores;
    calculatedLayers: number;
    totalWeight: number;
    eventImpact: number; // [Step 1] Event Impact on Score
}

// ... existing code ...

function calculateLayerScores(evidence: any): ScoreResult {
    const layerScores: LayerScores = {
        price: null,
        options: null,
        flow: null,
        macro: null,
        stealth: null,
        policy: null
    };

    let calculatedLayers = 0;
    let totalWeight = 0;
    let weightedSum = 0;
    let eventImpact = 0;

    // [Phase 36] 3-Day Sniper Logic (v3.0)
    // A) Price Layer
    if (evidence?.price?.complete) {

        const p = evidence.price;
        // Slope Score (Trend) - Assume calculated elsewhere or default
        const slopeScore = 50; // Placeholder if not calculated

        // [V3.7.3 TUNING] Aggressive Momentum Scoring
        // Old: Max 40. New: Max 100.
        // Formula: ChangePct * 15. (+1% = 15pts, +3% = 45pts, +5% = 75pts, +7% = 100pts)
        let momScore = 0;
        if (p.changePct > 0) {
            momScore = Math.min(100, p.changePct * 20); // Super Aggressive: +5% = 100pts
        }

        // Use the BETTER of Trend or Momentum. Don't average down a breakout.
        let score = Math.max(slopeScore, momScore);

        if (p.vwapDistPct > 0) score += 10;
        // Bonuse for strong close
        if (p.priceSource === 'POST_CLOSE' || p.priceSource === 'OFFICIAL_CLOSE') score += 5;

        layerScores.price = Math.max(0, Math.min(100, score));
        calculatedLayers++;
        totalWeight += POWER_SCORE_CONFIG.WEIGHTS.PRICE;
        weightedSum += layerScores.price * POWER_SCORE_CONFIG.WEIGHTS.PRICE;


    }

    // [Phase 35] Smart Flow (Weight: 40%) - Maps to Flow Layer
    if (evidence?.flow?.complete) {
        const f = evidence.flow;
        let score = 0;

        // [V3.7.3 TUNING] Aggressive Flow Scoring
        if (f.dataSource === 'CALCULATED') {
            if (f.netPremium > 0) score += 80;
            else score += 40;
        } else {
            // RelVol 1.0 = 50pts. RelVol 2.0 = 100pts.
            const relVolScore = Math.min(100, f.relVol * 50);
            score = relVolScore;

            if (f.largeTradesUsd > 1000000) score += 10; // Bonus
            if (f.gapPct > 1.0) score += 10; // Gap Bonus
        }

        // Gamma Exposure Bonus
        if (f.gamma && f.gamma > 0) score += 10;

        layerScores.flow = Math.max(0, Math.min(100, score));
        calculatedLayers++;
        totalWeight += POWER_SCORE_CONFIG.WEIGHTS.FLOW;
        weightedSum += layerScores.flow * POWER_SCORE_CONFIG.WEIGHTS.FLOW;
    }

    // [Phase 36] Gamma Regime (Weight: 20%) - Maps to Macro Layer (as proxy) or Options
    // Start with Options as base
    // [Phase 36] Gamma Regime (Weight: 20%) - Maps to Macro Layer (as proxy) or Options
    // Start with Options as base
    if (evidence?.options?.complete) {
        const o = evidence.options;
        let score = 50; // [V3.7.3] Base Score 50 (Neutral)

        // PCR Logic (Bullish < 0.7)
        if (o.pcr < 0.75) score += 20;

        // Gamma Regime
        // Long Gamma = Stability/Support (Good for Hold) -> +20
        // Short Gamma = Volatility (Good for Squeeze) -> +10
        if (o.gammaRegime === 'Long Gamma') score += 20;
        else if (o.gammaRegime === 'Short Gamma') score += 10;

        // OI Support
        if (o.callWall > evidence.price.last) score += 10; // Room to grow

        // Check for GEX Puke (Negative GEX)
        if (o.gex < -1000000) score += 10; // Volatility Potential

        layerScores.options = Math.min(100, score);
        calculatedLayers++;
        totalWeight += POWER_SCORE_CONFIG.WEIGHTS.OPTIONS;
        weightedSum += layerScores.options * POWER_SCORE_CONFIG.WEIGHTS.OPTIONS;
    }

    // D) Macro/Policy Layers (Supplemental)
    if (evidence?.macro?.complete) {
        // ... standard macro logic ...
        const m = evidence.macro;

        // [Audit] Honest Check: If ndx is 0 and complete says true, it might be stale?
        // But we trust 'complete' flag.

        const ndxScore = m.ndx?.changePct > 0 ? 60 : 20;
        layerScores.macro = ndxScore;
        calculatedLayers++;
        totalWeight += POWER_SCORE_CONFIG.WEIGHTS.MACRO;
        weightedSum += layerScores.macro * POWER_SCORE_CONFIG.WEIGHTS.MACRO;
    }

    // [Phase 36] Defense: Overnight Gate (IV Rank check)
    // Check if IV is too high -> Day Trade Only
    // Assumption: evidence.options.ivRank exists or we simulate it
    // If we don't have IV Rank, use VIX or Implied Vol
    // Hardcoded logic for now: if risk is extreme, flag it.

    // We update the score/meta, not just return a flag here. 
    // The flag determines the "Action".

    // ... existing Stealth/Policy logic ...
    if (evidence?.policy) {
        // ... simplified policy logic ...
        layerScores.policy = 50;
    }

    // Calculate Alpha Score
    let alphaScore: number | null = null;
    if (calculatedLayers >= 1 && totalWeight > 0) {

        // [V3.7.2] Field Commander Override (Intraday Momentum)
        // "Early session momentum trumps structural theory." (70% Priority)
        const relVol = evidence?.flow?.relVol || 0;
        const netFlow = evidence?.flow?.netFlow || 0;
        const isTapeMomentum = relVol >= 3.0 || netFlow > 1000000;

        if (isTapeMomentum && layerScores.price != null && layerScores.flow != null) {
            // Recalculate with Momentum Priority Weights
            // Price (Action): 40%
            // Flow (Fuel): 40%
            // Options (Structure): 20% (Background)
            // Macro: Ignored (Noise)
            console.log(`[PowerEngine] Field Commander Override Active for Tape Momentum`);
            const pScore = layerScores.price;
            const fScore = layerScores.flow;
            const oScore = layerScores.options || 50; // Neutral if missing

            // Re-weight: (P*0.4 + F*0.4 + O*0.2)
            alphaScore = (pScore * 0.4) + (fScore * 0.4) + (oScore * 0.2);

            // Allow full score (uncapped) because Momentum is verified by Tape
        } else {
            // Standard Structural Logic
            alphaScore = weightedSum / totalWeight;

            // Cap logic
            const cappedMax = calculatedLayers <= 2 ? 70 : calculatedLayers <= 4 ? 90 : 100;
            alphaScore = Math.min(alphaScore, cappedMax);
        }
    }

    return {
        alphaScore,
        layerScores,
        calculatedLayers,
        totalWeight,
        eventImpact
    };
}

// === COMPUTE QUALITY TIER (v2 - No Estimation) ===

export function computeQualityTier(
    item: any,
    prevReportSymbols: Set<string> = new Set(),
    isBackfilled: boolean = false,
    history?: {
        tMinus1?: { score: number, vol: number };
        tMinus2?: { score: number, vol: number };
    },
    guardianSignal?: GuardianSignal, // [Phase 4] Guardian Integration
    targetSectorId?: string | null, // [V3.0] Sector Boost
    sentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL', // [V3.5] Sentiment Gate
    isSympathyTarget?: boolean // [V3.5] Sympathy Hunter
): QualityTierResult {
    const symbol = item.ticker || '';
    const evidence = item.evidence;
    const isComplete = item.complete === true || evidence?.complete === true;

    // 1. Calculate Layer Scores (No 50-point default)
    const scoreResult = calculateLayerScores(evidence);
    let alphaScore = scoreResult.alphaScore;

    console.log(`[PowerEngine v2] ${symbol}: Layers ${scoreResult.calculatedLayers}/5, Score: ${alphaScore?.toFixed(1) || 'NULL'}`);

    // [P0] FIX: Never return score=0. Partial score is always valid.
    // If alphaScore is still null (0 layers), use a minimum base score
    if (alphaScore === null) {
        alphaScore = 25; // Base score for items with no calculable layers
    }

    // [P0] Build missing layers list for reasonKR
    const missingLayers: string[] = [];
    if (!scoreResult.layerScores.price) missingLayers.push('가격');
    if (!scoreResult.layerScores.options) missingLayers.push('옵션');
    if (!scoreResult.layerScores.flow) missingLayers.push('거래량');
    if (!scoreResult.layerScores.macro) missingLayers.push('매크로');
    if (!scoreResult.layerScores.stealth) missingLayers.push('스텔스');

    // [P0] Determine tier based on completeness and score
    if (!isComplete) {
        // Partial data - still give a score but mark as PARTIAL tier
        const missingStr = missingLayers.length > 0 ? missingLayers.slice(0, 2).join('/') : '';
        return {
            tier: scoreResult.calculatedLayers >= 3 ? 'WATCH' : 'FILLER',
            reasonKR: `부분 데이터 (${scoreResult.calculatedLayers}/5${missingStr ? ', 누락: ' + missingStr : ''})`,
            powerScore: Math.round(alphaScore * 10) / 10, // [P0] Never zero!
            isBackfilled: true
        };
    }

    // 3. Apply Bonuses/Penalties (only for complete items)
    const holdAction = item.decisionSSOT?.action || 'NONE';
    let reportDiffReason = item.classification?.reportDiffReason || item.reportDiffReason || 'NONE';
    const wasInPrevReport = prevReportSymbols.has(symbol);

    // [V3.7.4] Stability Patch: Auto-detect Continuation from History
    if (reportDiffReason === 'NONE' && wasInPrevReport && history?.tMinus1?.score && history.tMinus1.score >= QUALITY_TIER_CONFIG.ACTIONABLE_MIN_SCORE) {
        reportDiffReason = 'CONTINUATION';
    }

    if (reportDiffReason === 'CONTINUATION') alphaScore += POWER_SCORE_CONFIG.BONUS_CONTINUATION;
    if (reportDiffReason === 'RECOVERY') alphaScore += POWER_SCORE_CONFIG.BONUS_RECOVERY;
    if (wasInPrevReport) alphaScore += POWER_SCORE_CONFIG.BONUS_STABILITY;
    if (isLeaderSymbol(symbol)) alphaScore += POWER_SCORE_CONFIG.BONUS_LEADER_TRACK;

    // [V3.0] Sector Target Boost
    if (targetSectorId) {
        const sector = getSectorForTicker(symbol);
        if (sector === targetSectorId) {
            alphaScore += POWER_SCORE_CONFIG.TARGET_SECTOR_BOOST;
            // reasonKR += ' [SECTOR_BOOST]'; // Append logic later
        }
    }

    if (reportDiffReason === 'WEAKENING') alphaScore += POWER_SCORE_CONFIG.PENALTY_WEAKENING;
    if (holdAction === 'EXIT') alphaScore += POWER_SCORE_CONFIG.PENALTY_EXIT;
    if (!wasInPrevReport) alphaScore += POWER_SCORE_CONFIG.PENALTY_NEW_ENTRY;

    // [13.2] Momentum Boost (3-Day Rising)
    // T-2 < T-1 < T0  AND  Vol(T0) > Vol(T-1) (optional validation)
    let momentumBonus = 0;
    if (history?.tMinus1 && history?.tMinus2) {
        const s0 = alphaScore;
        const s1 = history.tMinus1.score;
        const s2 = history.tMinus2.score;

        // Check strict rising trend
        if (s0 > s1 && s1 > s2) {
            // Check significant rise (> 5 points over 2 days)
            if ((s0 - s2) >= 5) {
                momentumBonus = 10; // Major Boost
                alphaScore += momentumBonus;
                // Lift scope reason for transparency
                // reasonKR += ' [MOMENTUM: 3일 상승]'; // This string is built later, we assume separate logic or append to metadata
            }
        }
    }

    // Cap score
    alphaScore = Math.max(0, Math.min(100, alphaScore));

    // 4. Tier Determination
    let tier: QualityTier;
    let reasonKR: string;
    let triggersKR: string[] = []; // [V3.7.3] Codes

    // Options incomplete = cannot be ACTIONABLE (Top3 Gate)
    const optionsComplete = evidence?.options?.complete && evidence.options.status !== 'PENDING';

    // [Step 1] State Machine & Event Gate Variables (Lifted Scope)
    const currentAction = item.decisionSSOT?.action || 'NONE';
    const hasHighImpactEvent = item.evidence?.policy?.gate?.P0?.length > 0;

    // [Upgraded] Advanced Reasoning Builder with Flow/GEX Signal
    const buildAdvancedReason = (baseScore: number) => {
        const details: string[] = [];
        const triggerCodes: string[] = []; // [V3.7.3] Codes for UI Badges

        // [NEW] Combined Flow + GEX Signal (Primary Interpretation)
        const netFlow = evidence?.flow?.largeTradesUsd || evidence?.flow?.netFlow || 0;
        const gex = evidence?.options?.gex || evidence?.flow?.gammaExposure || 0;
        const isPremiumBullish = netFlow > 0;
        const isGexNegative = gex < 0;

        if (isPremiumBullish && isGexNegative) {
            details.push('🚀감마스퀴즈'); // Rocket fuel + Igniter
            triggerCodes.push('GEX_SQZ');
        } else if (isPremiumBullish && !isGexNegative && gex > 1000000) {
            details.push('📈상방억제'); // Bullish but suppressed by +GEX
            triggerCodes.push('SUPPRESSED');
        } else if (!isPremiumBullish && isGexNegative) {
            details.push('📉가속하락'); // Panic selling amplified
            triggerCodes.push('ACCEL_DROP');
        } else if (!isPremiumBullish && !isGexNegative && gex > 1000000) {
            details.push('🔻조정구간'); // Slow bleed, supported drop
            triggerCodes.push('CORRECTION');
        }

        // A. GEX Detail (Secondary)
        if (gex > 2000000) {
            details.push('GEX안전지대');
            triggerCodes.push('GEX_SAFE');
        } else if (gex < -2000000) {
            details.push('CallWall돌파');
            triggerCodes.push('WALL_BREAK');
        }

        // B. Flow Detail (Secondary - only if significant)
        if (netFlow > 5000000) {
            details.push('고래유입');
            triggerCodes.push('WHALE_IN');
        } else if (netFlow < -5000000) {
            details.push('매도우위');
            triggerCodes.push('SELL_DOM');
        }

        // C. Wall Logic
        const lastPrice = evidence?.price?.last || 0;
        const callWall = evidence?.options?.callWall || 0;
        if (callWall > 0 && Math.abs(lastPrice - callWall) / lastPrice < 0.02) {
            details.push('저항테스트');
            triggerCodes.push('WALL_TEST');
        }

        const detailStr = details.length > 0 ? `(${details.join('/')})` : '';
        return { text: `${baseScore.toFixed(0)}${detailStr}`, codes: triggerCodes };
    };

    if (holdAction === 'EXIT') {
        tier = 'FILLER';
        reasonKR = '매도 신호 (EXIT)';
    } else if (evidence?.policy?.gate?.blocked) {
        tier = 'FILLER';
        reasonKR = '정책적 차단 (Policy Block)';
    } else if (momentumBonus > 0 && optionsComplete) {
        // [13.2] Momentum Override
        tier = 'ACTIONABLE';
        const adv = buildAdvancedReason(alphaScore);
        reasonKR = `💥 3일 연속 상승(${alphaScore.toFixed(0)}) + ${adv.text} = 강력 매수`;
        triggersKR = adv.codes;

        // Event Gate: Block actionable if high impact event imminent
        if (hasHighImpactEvent && tier === 'ACTIONABLE') {
            tier = 'WATCH';
            reasonKR = `[Event Gate] 주요 이벤트 대기 (${item.evidence.policy.gate.P0.join(', ')})`;
        }

        // State Machine Transitions
        if (currentAction === 'HOLD') {
            if (alphaScore < 60 && alphaScore >= 45) {
                reasonKR += ' [OBSERVE: 점수 하락 관찰]';
            } else if (alphaScore < 45) {
                reasonKR += ' [EARLY_HANDOFF: 구조 붕괴]';
            }
        } else if (currentAction === 'OBSERVE') {
            if (alphaScore >= 70) {
                reasonKR += ' [REBUILD: 회복세 확인]';
            }
        }

    } else if (alphaScore >= QUALITY_TIER_CONFIG.ACTIONABLE_MIN_SCORE && optionsComplete) {
        tier = 'ACTIONABLE';
        const adv = buildAdvancedReason(alphaScore);
        // Clean format: "고강도(95/GEX안전지대/고래유입) + 옵션확인 = 매수 적합"
        // actually buildAdvancedReason returns "95(GEX...)"
        reasonKR = `고강도 ${adv.text} + 옵션확인 = 매수 적합`;
        triggersKR = adv.codes;

        // [Step 1] Event Gate Check inside Actionable
        if (hasHighImpactEvent) {
            tier = 'WATCH';
            reasonKR = `⛔ Event Gate: ${item.evidence.policy.gate.P0[0]} 대기 (매수 보류)`;
        }

        // [Step 1] State Machine Logic (Status Transitions)
        if (currentAction === 'HOLD') {
            if (alphaScore < 60 && alphaScore >= 45) {
                reasonKR += ' [OBSERVE: 점수 하락 관찰]';
            } else if (alphaScore < 45) {
                reasonKR += ' [EARLY_HANDOFF: 구조 붕괴]';
            }
        } else if (currentAction === 'OBSERVE') {
            if (alphaScore >= 70) {
                reasonKR += ' [REBUILD: 회복세 확인]';
            }
        }

    } else if (alphaScore >= QUALITY_TIER_CONFIG.WATCH_MIN_SCORE) {
        tier = 'WATCH';
        const adv = buildAdvancedReason(alphaScore);
        reasonKR = optionsComplete
            ? `관심권 ${adv.text}`
            : `관심권(${alphaScore.toFixed(0)}) - 옵션 미확인`;
        triggersKR = adv.codes;
    } else {
        tier = 'FILLER';
        reasonKR = `저강도(${alphaScore.toFixed(0)})`;
    }

    // === [V3.7] OPTION-CENTRIC ABSOLUTE GATEKEEPER ===
    // "Quantity(Vol) is Noise, Location(Option) is Sovereignty."
    // We strictly reject "Fake Pumps" and "Resistance Grinding".

    const price = evidence?.price?.last || 0;
    const callWall = evidence?.options?.callWall || 0;
    const rsi = evidence?.price?.rsi14 || 50;
    const changePct = evidence?.price?.changePct || 0;
    const relVol = evidence?.flow?.relVol || 0;
    const netFlow = evidence?.flow?.netFlow || 0;
    const gex = evidence?.options?.gex || 0;

    // [Gate 1] Option Gravity Shield (Call Wall Resistance)
    // If Price is within 2% of Call Wall (or above), it's a Kill Zone.
    // [V3.7.2 FIX] Allow Breakouts! If price > 101% of Call Wall, it is a BREAKOUT, not a rejection.
    // Penalty only applies if price is struggling AT the wall (98% ~ 101%).
    if (callWall > 0 && price >= callWall * 0.98 && price < callWall * 1.01) {
        console.log(`[PowerEngine] ${symbol} Rejected by Gate 1 (Call Wall: ${callWall}, Price: ${price})`);
        alphaScore = Math.min(alphaScore, 40); // Force Watch/Filler
        tier = 'WATCH';
        reasonKR = `🛡️ [Gate 1] 옵션 저항벽 도달 (${callWall} Call Wall) - 진입 금지`;
    }

    // [Gate 2] Relative Location & Divergence (Exhaustion)
    // RSI > 80 AND High Vol/Change -> Likely Top (Exhaustion)
    else if (rsi >= 80 && changePct >= 15.0 && relVol >= 2.0) {
        console.log(`[PowerEngine] ${symbol} Rejected by Gate 2 (Exhaustion: RSI ${rsi.toFixed(0)})`);
        alphaScore = 0; // Penalty -100 (Effective 0)
        tier = 'FILLER';
        reasonKR = `📉 [Gate 2] 설거지 패턴 감지 (RSI 과열 + 거래량 폭발) - 즉시 이탈 권고`;
    }

    // [Gate 3] Smart Money Alignment (GEX/Flow)
    // If Price UP but Gamma is Short (Volatile) and Flow is Negative? 
    // User Guide: "rising OI ... stable PCR". 
    // We use GEX check or NetFlow check.
    else if (changePct > 5.0 && netFlow < -100000 && gex < 0) {
        // Price Up + Big Selling + Short Gamma = Trap
        console.log(`[PowerEngine] ${symbol} Rejected by Gate 3 (Fake Pump)`);
        alphaScore = Math.min(alphaScore, 45);
        tier = 'WATCH';
        reasonKR = `⛔ [Gate 3] 가짜 상승 (스마트머니 이탈 확인)`;
    }

    // [V3.7] Validated Momentum (Survivors)
    // Only if it passes all gates, apply standard scoring.
    // We removed v3.6 Hyper-Momentum Boost.
    // Instead, we trust the 'Calculated Layer' score which rewards Flow & Options naturally.
    // We assume if it survived the gates and has good score, it is valid.


    // === PHASE 4: GUARDIAN SIGNAL INJECTION ===
    let guardianPenaltyStr = "";
    if (guardianSignal && optionsComplete) {
        const { marketStatus, divCaseId } = guardianSignal;

        // 1. Divergence Case A (False Rally)
        if (divCaseId === 'A') {
            console.log(`[AlphaEngine] Applying 'False Rally' penalty to ${symbol}`);
            alphaScore -= 20; // Global Penalty
            guardianPenaltyStr = " [⚠️ 가짜 상승장 경고: -20]";
        }
        // 2. Divergence Case B (Hidden Opportunity)
        else if (divCaseId === 'B') {
            // Boost only High Quality (already > 60)
            if (alphaScore > 60) {
                console.log(`[AlphaEngine] Applying 'Hidden Opportunity' boost to ${symbol}`);
                alphaScore += 15;
                guardianPenaltyStr = " [💎 숨겨진 기회: +15]";
            }
        }
        // 3. Divergence Case D (Deep Freeze)
        else if (divCaseId === 'D') {
            console.log(`[AlphaEngine] Applying 'Deep Freeze' penalty to ${symbol}`);
            alphaScore = Math.min(alphaScore, 50); // Hard Cap
            guardianPenaltyStr = " [🚨 시장 붕괴: 점수 제한]";
            tier = 'WATCH'; // Force Downgrade
        }

        // 4. Market Status: STOP
        if (marketStatus === 'STOP') {
            if (alphaScore > 70) {
                alphaScore -= 10;
                guardianPenaltyStr += " [⛔ 시장 정지: -10]";
            }
            if (tier === 'ACTIONABLE' && alphaScore < 90) {
                tier = 'WATCH'; // [Phase 4] Guardian Global Stop
                guardianPenaltyStr += " (가디언 정지)";
            }
        } else if (marketStatus === 'GO') {
            alphaScore += 5; // Slight momentum boost
        }
    }

    // Re-Cap
    alphaScore = Math.max(0, Math.min(100, alphaScore));

    // Append Penalty Reason
    if (guardianPenaltyStr) {
        reasonKR += guardianPenaltyStr;
    }

    // [V3.0] Check Sector Boost
    if (targetSectorId && getSectorForTicker(symbol) === targetSectorId) {
        reasonKR += ` [🔥 주도 섹터: +${POWER_SCORE_CONFIG.TARGET_SECTOR_BOOST}]`;
    }

    // [V3.5] Sympathy Hunter
    if (isSympathyTarget) {
        alphaScore += 15;
        reasonKR += ` [🤝 공명 효과: +15]`;
    }

    // [V3.5] Sentiment Gate (Final check)
    if (sentiment === 'NEGATIVE') {
        alphaScore -= 30;
        reasonKR += ` [📉 뉴스 심리 악화: -30]`;
        if (alphaScore < 40) tier = 'FILLER'; // Force downgrade if sentiment kills the score
    }

    return {
        tier,
        reasonKR,
        triggersKR, // export to result
        powerScore: alphaScore,
        isBackfilled
    };
}

// === SELECT TOP3 WITH STRICT OPTIONS GATE ===

export interface Top3Selection {
    top3: any[];
    stats: Top3Stats;
    changelog: string[];
}

export function selectTop3(
    rankedItems: any[],
    previousTop3Symbols: string[] = [],
    regime: MarketRegime = 'NEUTRAL'
): Top3Selection {
    const changelog: string[] = [];
    const prevTop3Set = new Set(previousTop3Symbols.map(s => s.toUpperCase()));

    // Get promotion threshold based on regime
    const promotionThreshold = regime === 'RISK_OFF'
        ? QUALITY_TIER_CONFIG.TOP3_RISK_OFF_THRESHOLD
        : QUALITY_TIER_CONFIG.TOP3_PROMOTION_SCORE;

    // Filter: Only COMPLETE items can be in Top3
    const eligibleItems = rankedItems.filter(item =>
        item.complete === true &&
        item.evidence?.options?.complete === true &&
        item.evidence?.options?.status !== 'PENDING'
    );

    // Separate by tier
    const actionables = eligibleItems.filter(item => item.qualityTier === 'ACTIONABLE');
    const watches = eligibleItems.filter(item => item.qualityTier === 'WATCH');

    // Sort by powerScore (descending)
    actionables.sort((a, b) => (b.powerScore || 0) - (a.powerScore || 0));
    watches.sort((a, b) => (b.powerScore || 0) - (a.powerScore || 0));

    const selected: any[] = [];
    let actionableUsed = 0;
    let watchUsed = 0;
    let swapCount = 0;

    // === ANTI-CHURN: Keep previous Top3 if still ACTIONABLE ===
    for (const prevSymbol of previousTop3Symbols) {
        if (selected.length >= 3) break;

        const prevItem = actionables.find(item =>
            (item.symbol || item.ticker)?.toUpperCase() === prevSymbol.toUpperCase()
        );

        if (prevItem) {
            const prevScore = prevItem.prevAlphaScore || prevItem.powerScore;
            const currentScore = prevItem.powerScore || 0;
            const scoreDrop = prevScore - currentScore;

            if (scoreDrop <= POWER_SCORE_CONFIG.TOP3_ANTI_CHURN_DELTA) {
                selected.push(prevItem);
                actionableUsed++;
                changelog.push(`[유지] ${prevSymbol} - ACTIONABLE (점수: ${currentScore.toFixed(1)})`);
            }
        }
    }

    // === FILL REMAINING FROM ACTIONABLE ===
    for (const item of actionables) {
        if (selected.length >= 3) break;

        const sym = (item.symbol || item.ticker)?.toUpperCase();
        if (selected.some(s => (s.symbol || s.ticker)?.toUpperCase() === sym)) continue;

        if (!prevTop3Set.has(sym) && swapCount >= POWER_SCORE_CONFIG.MAX_TOP3_SWAP_PER_RUN) {
            continue; // Skip new entry if swap limit reached
        }

        selected.push(item);
        actionableUsed++;

        if (!prevTop3Set.has(sym)) {
            swapCount++;
            changelog.push(`[신규] ${sym} - ACTIONABLE (점수: ${(item.powerScore || 0).toFixed(1)})`);
        }
    }

    // === [P0] FILL FROM WATCH IF NEEDED ===
    if (selected.length < 3) {
        for (const item of watches) {
            if (selected.length >= 3) break;

            const sym = (item.symbol || item.ticker)?.toUpperCase();
            if (selected.some(s => (s.symbol || s.ticker)?.toUpperCase() === sym)) continue;

            // [P0] Accept any WATCH item, no threshold when filling
            selected.push({ ...item, top3Action: 'WATCH' });
            watchUsed++;
            changelog.push(`[WATCH 승격] ${sym} - 점수 ${(item.powerScore || 0).toFixed(1)}`);
        }
    }

    // === [P0] FILL FROM ALL ITEMS (FILLER) IF STILL NOT 3 ===
    if (selected.length < 3) {
        // Sort all remaining items by score
        const remaining = rankedItems
            .filter(item => !selected.some(s => (s.symbol || s.ticker)?.toUpperCase() === (item.symbol || item.ticker)?.toUpperCase()))
            .sort((a, b) => (b.powerScore || 0) - (a.powerScore || 0));

        for (const item of remaining) {
            if (selected.length >= 3) break;
            const sym = (item.symbol || item.ticker)?.toUpperCase();
            // [P0] Mark as NO_TRADE action for incomplete items
            const action = item.complete ? 'HOLD_ONLY' : 'NO_TRADE';
            selected.push({ ...item, top3Action: action });
            changelog.push(`[${action}] ${sym} - 점수 ${(item.powerScore || 0).toFixed(1)} (데이터 부분)`);
        }
    }

    // [P0] noTradeSlots = count of items with NO_TRADE action
    const noTradeSlots = selected.filter(s => s.top3Action === 'NO_TRADE').length;

    const stats: Top3Stats = {
        actionableUsed,
        watchUsed,
        noTradeSlots,
        changelogKR: changelog
    };

    return { top3: selected, stats, changelog };
}

// === DETERMINE MARKET REGIME ===

export function determineRegime(macroData?: any): { regime: MarketRegime; reasonKR: string } {
    if (!macroData || !macroData.complete) {
        return { regime: 'NEUTRAL', reasonKR: 'Macro 데이터 미완성 (기본 NEUTRAL)' };
    }

    const nqChange = macroData.ndx?.changePct || 0;

    if (nqChange <= REGIME_CONFIG.RISK_OFF_THRESHOLD) {
        return { regime: 'RISK_OFF', reasonKR: `NQ=F ${nqChange.toFixed(2)}% (위험회피 모드)` };
    } else if (nqChange >= REGIME_CONFIG.RISK_ON_THRESHOLD) {
        return { regime: 'RISK_ON', reasonKR: `NQ=F +${nqChange.toFixed(2)}% (적극 모드)` };
    } else {
        return { regime: 'NEUTRAL', reasonKR: `NQ=F ${nqChange.toFixed(2)}% (중립 모드)` };
    }
}

// === APPLY QUALITY TIERS TO ALL ITEMS ===

export function applyQualityTiers(
    items: any[],
    prevReportSymbols: Set<string> = new Set(),
    backfilledSymbols: Set<string> = new Set(),
    historyMap: Record<string, { tMinus1?: { score: number, vol: number }, tMinus2?: { score: number, vol: number } }> = {},
    guardianSignal?: GuardianSignal, // [Phase 4]
    targetSectorId?: string | null, // [V3.0] Sector Boost Input
    sentimentMap?: Record<string, 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'>, // [V3.5]
    sympathySet?: Set<string> // [V3.5]
): any[] {
    return items.map(item => {
        const sym = (item.symbol || item.ticker)?.toUpperCase() || '';
        const isBackfilled = backfilledSymbols.has(sym) || item.isBackfilled === true;
        const history = historyMap[sym];

        const sentiment = sentimentMap ? (sentimentMap[sym] as any) : undefined;
        const isSympathy = sympathySet ? sympathySet.has(sym) : false;

        const tierResult = computeQualityTier(item, prevReportSymbols, isBackfilled, history, guardianSignal, targetSectorId, sentiment, isSympathy);

        return {
            ...item,
            qualityTier: tierResult.tier,
            qualityReasonKR: tierResult.reasonKR,
            // [V3.7.3] Populate SSOT decision triggers
            decisionSSOT: {
                ...(item.decisionSSOT || {}),
                triggersKR: tierResult.triggersKR || []
            },
            powerScore: tierResult.powerScore,
            alphaScore: tierResult.powerScore, // Keep in sync
            isBackfilled: tierResult.isBackfilled
        };
    });
}

// === COMPUTE POWER META ===

export function computePowerMeta(
    items: any[],
    top3Stats: Top3Stats,
    regime: MarketRegime,
    regimeReasonKR: string
): PowerMeta {
    const completeItems = items.filter(i => i.complete === true);
    const actionableCount = completeItems.filter(i => i.qualityTier === 'ACTIONABLE').length;
    const watchCount = completeItems.filter(i => i.qualityTier === 'WATCH').length;
    const fillerCount = items.filter(i => i.qualityTier === 'FILLER').length;
    const incompleteCount = items.filter(i => i.complete !== true).length;

    return {
        regime,
        regimeReasonKR,
        counts: {
            actionableCount,
            watchCount,
            fillerCount,
            backfillCount: incompleteCount
        },
        top3Stats
    };
}

// === [V3.0] FINAL LIST SELECTION (10 Best + 2 Discovery) ===
export function selectFinalList(allScoredItems: any[]): any[] {
    // 1. Sort by Score Descending
    const sorted = [...allScoredItems].sort((a, b) => (b.powerScore || 0) - (a.powerScore || 0));

    // 2. Take Top 10 (Standard Elite)
    const top10 = sorted.slice(0, 10);
    const top10Ids = new Set(top10.map(i => i.ticker));

    // 3. Find Discovery Candidates (Wildcards) from remaining
    // Criteria: High RVOL (> 2.5) OR High GEX (> 3M) OR Strong Momentum (> 4%)
    const remaining = sorted.slice(10);

    const candidates = remaining.filter(item => {
        if (top10Ids.has(item.ticker)) return false;

        const rvol = item.evidence?.flow?.relVol || 0;
        const gex = Math.abs(item.evidence?.options?.gex || 0);
        const change = item.evidence?.price?.changePct || 0;

        // Wildcard Logic
        const isVolumeExplosion = rvol >= 2.5;
        const isGammaNuke = gex >= 3000000; // 3M
        const isMomentumRocket = change >= 4.0;

        return isVolumeExplosion || isGammaNuke || isMomentumRocket;
    });

    // Sort candidates by RVOL (Explosiveness)
    candidates.sort((a, b) => (b.evidence?.flow?.relVol || 0) - (a.evidence?.flow?.relVol || 0));

    // 4. Fill Slots 11 & 12
    const discoverySlots = [];
    if (candidates.length > 0) discoverySlots.push(candidates[0]);
    if (candidates.length > 1) discoverySlots.push(candidates[1]);

    // 5. If not enough candidates, fill with next best score
    let nextIdx = 10; // Start from 11th best by score
    while (discoverySlots.length < 2 && nextIdx < sorted.length) {
        const candidate = sorted[nextIdx];
        if (!top10Ids.has(candidate.ticker) && !discoverySlots.find(d => d.ticker === candidate.ticker)) {
            discoverySlots.push(candidate);
        }
        nextIdx++;
    }

    // 6. Combine & Mark Discovery
    const final12 = [...top10, ...discoverySlots];

    // Mark Discovery items for UI
    return final12.map((item, idx) => {
        const isDiscovery = idx >= 10; // 11th and 12th
        if (isDiscovery) {
            // Append Discovery Tag if not already there
            // We modify the reasonKR slightly to indicate it's a discovery slot if it was a low score entry
            if (item.powerScore < 50) {
                return { ...item, qualityReasonKR: item.qualityReasonKR + ' [🧪 Discovery Slot: 변동성 베팅]' };
            }
        }
        return item;
    });
}
