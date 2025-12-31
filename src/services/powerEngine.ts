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
import { MAGNIFICENT_7, BIO_LEADERS_TOP5, DATACENTER_TOP5 } from './universePolicy';

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
        let score = 0;
        const p = evidence.price;
        const history = evidence.price.history3d || [];

        // 3-Day Slope Calculation
        let slopeScore = 0;
        if (history.length >= 2) {
            const day1 = history[0]; // Newest
            const day2 = history[1];
            if (day1.c > day2.c) slopeScore += 20;
            if (day1.v > day2.v) slopeScore += 10;
        } else {
            if (p.changePct > 0) slopeScore += 15;
        }

        // Base Momentum
        const momScore = Math.max(0, Math.min(40, (p.changePct + 2) * 8));
        score = (slopeScore * 0.6) + (momScore * 0.4);

        if (p.vwapDistPct > 0) score += 10;

        layerScores.price = Math.max(0, Math.min(100, score));
        calculatedLayers++;
        totalWeight += POWER_SCORE_CONFIG.WEIGHTS.PRICE;
        weightedSum += layerScores.price * POWER_SCORE_CONFIG.WEIGHTS.PRICE;
    }

    // [Phase 35] Smart Flow (Weight: 40%) - Maps to Flow Layer
    if (evidence?.flow?.complete) {
        const f = evidence.flow;
        let score = 0;

        // Manual Calc / Gamma Logic injected here
        if (f.dataSource === 'CALCULATED') {
            if (f.netPremium > 0) score += 60;
            else score += 20;
        } else {
            const relVolClamped = Math.max(0.5, Math.min(3, f.relVol));
            score += ((relVolClamped - 0.5) / 2.5) * 50;
            if (f.largeTradesUsd > 1000000) score += 20;
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
    // Start with Options as base
    if (evidence?.options?.complete) {
        const o = evidence.options;
        let score = 0;

        // PCR Logic
        if (o.pcr < 0.7) score += 30;

        // Gamma Regime
        if (o.gammaRegime === 'Short Gamma') score += 40;
        else if (o.gammaRegime === 'Long Gamma') score += 10;

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
        alphaScore = weightedSum / totalWeight;

        // [Normalization] Dynamic Scoring
        // alphaScore is already weightedSum / totalWeight.
        // If totalWeight is small (e.g., only Price), the score is valid for that layer.
        // We do NOT boost artificially.

        // Cap logic: If very few layers, credibility is low, so we cap the max possible score.
        // 1-2 Layers: Max 70 (Watch only)
        // 3-4 Layers: Max 90
        // 5 Layers: Max 100
        const cappedMax = calculatedLayers <= 2 ? 70 : calculatedLayers <= 4 ? 90 : 100;
        alphaScore = Math.min(alphaScore, cappedMax);
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
    }
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
    const reportDiffReason = item.classification?.reportDiffReason || item.reportDiffReason || 'NONE';
    const wasInPrevReport = prevReportSymbols.has(symbol);

    if (reportDiffReason === 'CONTINUATION') alphaScore += POWER_SCORE_CONFIG.BONUS_CONTINUATION;
    if (reportDiffReason === 'RECOVERY') alphaScore += POWER_SCORE_CONFIG.BONUS_RECOVERY;
    if (wasInPrevReport) alphaScore += POWER_SCORE_CONFIG.BONUS_STABILITY;
    if (isLeaderSymbol(symbol)) alphaScore += POWER_SCORE_CONFIG.BONUS_LEADER_TRACK;

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

    // Options incomplete = cannot be ACTIONABLE (Top3 Gate)
    const optionsComplete = evidence?.options?.complete && evidence.options.status !== 'PENDING';

    // [Step 1] State Machine & Event Gate Variables (Lifted Scope)
    const currentAction = item.decisionSSOT?.action || 'NONE';
    const hasHighImpactEvent = item.evidence?.policy?.gate?.P0?.length > 0;

    // [Upgraded] Advanced Reasoning Builder
    const buildAdvancedReason = (baseScore: number) => {
        const details: string[] = [];

        // A. GEX Logic
        const gex = evidence?.options?.gex || 0;
        if (gex > 2000000) details.push('GEX안전지대');
        else if (gex < -2000000) details.push('CallWall돌파'); // Short gamma often implies volatility or breakout attempt

        // B. Flow Logic
        const netFlow = evidence?.flow?.largeTradesUsd || 0;
        if (netFlow > 5000000) details.push('고래유입');
        else if (netFlow < -5000000) details.push('매도우위');

        // C. Wall Logic
        const lastPrice = evidence?.price?.last || 0;
        const callWall = evidence?.options?.callWall || 0;
        if (callWall > 0 && Math.abs(lastPrice - callWall) / lastPrice < 0.02) details.push('저항테스트');

        const detailStr = details.length > 0 ? `(${details.join('/')})` : '';
        return `${baseScore.toFixed(0)}${detailStr}`;
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
        reasonKR = `💥 3일 연속 상승(${alphaScore.toFixed(0)}) + ${buildAdvancedReason(alphaScore)} = 강력 매수`;

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
        const detailInfo = buildAdvancedReason(alphaScore);
        // Clean format: "고강도(95/GEX안전지대/고래유입) + 옵션확인 = 매수 적합"
        // actually buildAdvancedReason returns "95(GEX...)"
        reasonKR = `고강도 ${detailInfo} + 옵션확인 = 매수 적합`;

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
        const detailInfo = buildAdvancedReason(alphaScore);
        reasonKR = optionsComplete
            ? `관심권 ${detailInfo}`
            : `관심권(${alphaScore.toFixed(0)}) - 옵션 미확인`;
    } else {
        tier = 'FILLER';
        reasonKR = `저강도(${alphaScore.toFixed(0)})`;
    }

    return {
        tier,
        reasonKR,
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
    historyMap: Record<string, { tMinus1?: { score: number, vol: number }, tMinus2?: { score: number, vol: number } }> = {}
): any[] {
    return items.map(item => {
        const sym = (item.symbol || item.ticker)?.toUpperCase() || '';
        const isBackfilled = backfilledSymbols.has(sym) || item.isBackfilled === true;
        const history = historyMap[sym];

        const tierResult = computeQualityTier(item, prevReportSymbols, isBackfilled, history);

        return {
            ...item,
            qualityTier: tierResult.tier,
            qualityReasonKR: tierResult.reasonKR,
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
