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

    // A) Price Layer (Weight: 25)
    if (evidence?.price?.complete) {
        // ... same logic as before ...
        const p = evidence.price;
        let score = 0;
        const momentumScore = Math.max(0, Math.min(40, (p.changePct + 2) * 8));
        score += momentumScore;
        const vwapScore = Math.max(0, Math.min(30, (p.vwapDistPct + 1.5) * 10));
        score += vwapScore;
        const rsiDistance = Math.abs(p.rsi14 - 55);
        const rsiScore = Math.max(0, 30 - rsiDistance);
        score += rsiScore;
        layerScores.price = Math.max(0, Math.min(100, score));
        calculatedLayers++;
        totalWeight += POWER_SCORE_CONFIG.WEIGHTS.PRICE;
        weightedSum += layerScores.price * POWER_SCORE_CONFIG.WEIGHTS.PRICE;
    }

    // B) Options Layer (Weight: 25)
    if (evidence?.options?.complete && evidence.options.status !== 'PENDING') {
        const o = evidence.options;
        let score = 0;
        if (o.status === 'NO_OPTIONS') {
            score = 50;
        } else {
            if (o.pcr < 0.5) score += 40;
            else if (o.pcr < 0.7) score += 30;
            else if (o.pcr < 1.0) score += 20;
            else if (o.pcr < 1.3) score += 10;
            if (o.gammaRegime === 'Long Gamma') score += 30;
            else if (o.gammaRegime === 'Neutral') score += 15;
            if (o.callWall > 0 && o.putFloor > 0) {
                const range = o.callWall - o.putFloor;
                if (range > 0) score += 20;
            }
        }
        layerScores.options = Math.min(100, score);
        calculatedLayers++;
        totalWeight += POWER_SCORE_CONFIG.WEIGHTS.OPTIONS;
        weightedSum += layerScores.options * POWER_SCORE_CONFIG.WEIGHTS.OPTIONS;
    }

    // C) Flow Layer (Weight: 20)
    const relVolVal = evidence?.flow?.relVol || 0;
    if (evidence?.flow?.complete) {
        const f = evidence.flow;
        let score = 0;
        const relVolClamped = Math.max(0.5, Math.min(3, f.relVol));
        const relVolScore = ((relVolClamped - 0.5) / 2.5) * 50;
        score += relVolScore;
        const gapClamped = Math.max(-3, Math.min(5, f.gapPct));
        const gapScore = Math.max(0, ((gapClamped + 1) / 6) * 30);
        score += gapScore;
        score += 20;
        layerScores.flow = Math.max(0, Math.min(100, score));
        calculatedLayers++;
        totalWeight += POWER_SCORE_CONFIG.WEIGHTS.FLOW;
        weightedSum += layerScores.flow * POWER_SCORE_CONFIG.WEIGHTS.FLOW;
    }

    // [Step 1] Real-time Validator: Flow Validation
    const isFlowConfirmed = relVolVal > 1.2; // Significant volume validates external signals

    // D) Macro Layer (Weight: 15)
    if (evidence?.macro?.complete) {
        const m = evidence.macro;
        const ndxPct = m.ndx?.changePct || 0;
        const ndxClamped = Math.max(-3, Math.min(3, ndxPct));
        const ndxScore = ((ndxClamped + 3) / 6) * 60;
        const vix = m.vix?.value || 20;
        const vixClamped = Math.max(10, Math.min(40, vix));
        const vixScore = ((40 - vixClamped) / 30) * 40;

        // [Step 1] Validation Gate
        let rawMacroScore = ndxScore + vixScore;
        if (!isFlowConfirmed && Math.abs(rawMacroScore - 50) > 20) {
            // Dampen extreme macro signals if not confirmed by flow
            rawMacroScore = 50 + (rawMacroScore - 50) * 0.5;
        }

        layerScores.macro = Math.max(0, Math.min(100, rawMacroScore));
        calculatedLayers++;
        totalWeight += POWER_SCORE_CONFIG.WEIGHTS.MACRO;
        weightedSum += layerScores.macro * POWER_SCORE_CONFIG.WEIGHTS.MACRO;
    }

    // E) Stealth Layer (Weight: 15)
    if (evidence?.stealth?.complete) {
        const s = evidence.stealth;
        let score = 0;
        if (s.label === 'A') score = 90;
        else if (s.label === 'B') score = 60;
        else score = 30;
        if (s.tags?.includes('blockPrint')) score += 10;
        if (s.tags?.includes('offExSurge')) score += 10;
        layerScores.stealth = Math.min(100, score);
        calculatedLayers++;
        totalWeight += POWER_SCORE_CONFIG.WEIGHTS.STEALTH;
        weightedSum += layerScores.stealth * POWER_SCORE_CONFIG.WEIGHTS.STEALTH;
    }

    // [Step 1] F) Policy/Events Layer (New Weight: 10 - steals from others in vNext, but additively for now)
    if (evidence?.policy) {
        const p = evidence.policy;
        let policyScore = 50; // Neutral start

        // Gate impact
        if (p.gate?.blocked) policyScore = 0;
        else {
            // Grade based scoring
            if (p.gradeA_B_C_counts?.A > 0) policyScore += 20;
            if (p.gradeA_B_C_counts?.B > 0) policyScore += 10;

            // Event Impact (Mock for now, real logic would use EventHub dates)
            // If major event coming, increase volatility expectation -> simpler: reduce certainty?
            // For Alpha score, we reward favourable policy.
        }

        // [Step 1] Validation
        if (!isFlowConfirmed && policyScore > 60) {
            policyScore = 60; // Cap unconfirmed policy optimism
        }

        layerScores.policy = Math.max(0, Math.min(100, policyScore));
        // Note: Not adding to totalWeight yet to preserve existing balance, 
        // using it as a modifier or separate signal in vNext full rollout.
        // For this step, we just calculate it.
    }

    // Calculate Alpha Score
    let alphaScore: number | null = null;
    if (calculatedLayers >= 1 && totalWeight > 0) {
        alphaScore = weightedSum / totalWeight;

        // [Step 1] Event Impact Logic (Global modifier)
        // If high VIX or Policy Block, dampen score
        if (evidence?.policy?.gate?.blocked) {
            alphaScore *= 0.5;
            eventImpact = -50;
        }

        const cappedMax = calculatedLayers <= 2 ? 50 : calculatedLayers === 3 ? 70 : calculatedLayers === 4 ? 85 : 100;
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
    isBackfilled: boolean = false
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

    // Cap score
    alphaScore = Math.max(0, Math.min(100, alphaScore));

    // 4. Tier Determination
    let tier: QualityTier;
    let reasonKR: string;

    // Options incomplete = cannot be ACTIONABLE (Top3 Gate)
    const optionsComplete = evidence?.options?.complete && evidence.options.status !== 'PENDING';

    if (holdAction === 'EXIT') {
        tier = 'FILLER';
        reasonKR = '매도 신호 (EXIT)';
    } else if (evidence?.policy?.gate?.blocked) {
        tier = 'FILLER';
        reasonKR = '정책적 차단 (Policy Block)';
    } else if (alphaScore >= QUALITY_TIER_CONFIG.ACTIONABLE_MIN_SCORE && optionsComplete) {
        tier = 'ACTIONABLE';
        reasonKR = `고강도(${alphaScore.toFixed(0)}) + 옵션확인 = 매수 적합`;
    } else if (alphaScore >= QUALITY_TIER_CONFIG.WATCH_MIN_SCORE) {
        tier = 'WATCH';
        reasonKR = optionsComplete
            ? `관심권(${alphaScore.toFixed(0)})`
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
    backfilledSymbols: Set<string> = new Set()
): any[] {
    return items.map(item => {
        const sym = (item.symbol || item.ticker)?.toUpperCase() || '';
        const isBackfilled = backfilledSymbols.has(sym) || item.isBackfilled === true;

        const tierResult = computeQualityTier(item, prevReportSymbols, isBackfilled);

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
