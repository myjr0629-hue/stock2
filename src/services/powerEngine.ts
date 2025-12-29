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
}

interface ScoreResult {
    alphaScore: number | null;  // null if incomplete
    layerScores: LayerScores;
    calculatedLayers: number;
    totalWeight: number;
}

// === HELPER: Check if symbol is in Leaders Track ===
function isLeaderSymbol(symbol: string): boolean {
    const sym = symbol?.toUpperCase() || '';
    return (
        (MAGNIFICENT_7 as readonly string[]).includes(sym) ||
        (BIO_LEADERS_TOP5 as readonly string[]).includes(sym) ||
        (DATACENTER_TOP5 as readonly string[]).includes(sym)
    );
}

// === COMPUTE LAYER SCORES (No Default 50) ===

function calculateLayerScores(evidence: any): ScoreResult {
    const layerScores: LayerScores = {
        price: null,
        options: null,
        flow: null,
        macro: null,
        stealth: null
    };

    let calculatedLayers = 0;
    let totalWeight = 0;
    let weightedSum = 0;

    // A) Price Layer (Weight: 25) - [P0] Continuous scaling
    if (evidence?.price?.complete) {
        const p = evidence.price;
        let score = 0;

        // Momentum (-5% to +5% → 0-40 continuous)
        const momentumScore = Math.max(0, Math.min(40, (p.changePct + 2) * 8));
        score += momentumScore;

        // VWAP Position (-3% to +3% → 0-30 continuous)
        const vwapScore = Math.max(0, Math.min(30, (p.vwapDistPct + 1.5) * 10));
        score += vwapScore;

        // RSI Sweet Spot (30-70 optimal band → 0-30)
        const rsiDistance = Math.abs(p.rsi14 - 55); // Distance from optimal 55
        const rsiScore = Math.max(0, 30 - rsiDistance); // Closer to 55 = higher
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
            // No options = neutral score
            score = 50;
        } else {
            // Bias from PCR (0-40)
            if (o.pcr < 0.5) score += 40; // Very bullish
            else if (o.pcr < 0.7) score += 30;
            else if (o.pcr < 1.0) score += 20;
            else if (o.pcr < 1.3) score += 10;

            // Gamma Regime (0-30)
            if (o.gammaRegime === 'Long Gamma') score += 30;
            else if (o.gammaRegime === 'Neutral') score += 15;

            // Wall Structure (0-30)
            if (o.callWall > 0 && o.putFloor > 0) {
                const range = o.callWall - o.putFloor;
                if (range > 0) score += 20; // Clear structure
            }
        }

        layerScores.options = Math.min(100, score);
        calculatedLayers++;
        totalWeight += POWER_SCORE_CONFIG.WEIGHTS.OPTIONS;
        weightedSum += layerScores.options * POWER_SCORE_CONFIG.WEIGHTS.OPTIONS;
    }

    // C) Flow Layer (Weight: 20) - [P0] Continuous scaling
    if (evidence?.flow?.complete) {
        const f = evidence.flow;
        let score = 0;

        // Relative Volume (0.5x to 3x → 0-50 continuous)
        const relVolClamped = Math.max(0.5, Math.min(3, f.relVol));
        const relVolScore = ((relVolClamped - 0.5) / 2.5) * 50;
        score += relVolScore;

        // Gap % (-3% to +5% → 0-30)
        const gapClamped = Math.max(-3, Math.min(5, f.gapPct));
        const gapScore = Math.max(0, ((gapClamped + 1) / 6) * 30);
        score += gapScore;

        // [P0] offExPct removed from scoring (no source)
        // Base 20 for having flow data at all
        score += 20;

        layerScores.flow = Math.max(0, Math.min(100, score));
        calculatedLayers++;
        totalWeight += POWER_SCORE_CONFIG.WEIGHTS.FLOW;
        weightedSum += layerScores.flow * POWER_SCORE_CONFIG.WEIGHTS.FLOW;
    }

    // D) Macro Layer (Weight: 15) - [P0] Continuous scaling
    if (evidence?.macro?.complete) {
        const m = evidence.macro;

        // NDX Direction (-3% to +3% → 0-60 continuous)
        const ndxPct = m.ndx?.changePct || 0;
        const ndxClamped = Math.max(-3, Math.min(3, ndxPct));
        const ndxScore = ((ndxClamped + 3) / 6) * 60;

        // VIX Level (10-40 inverted → 0-40)
        const vix = m.vix?.value || 20;
        const vixClamped = Math.max(10, Math.min(40, vix));
        const vixScore = ((40 - vixClamped) / 30) * 40; // Lower VIX = higher score

        layerScores.macro = Math.max(0, Math.min(100, ndxScore + vixScore));
        calculatedLayers++;
        totalWeight += POWER_SCORE_CONFIG.WEIGHTS.MACRO;
        weightedSum += layerScores.macro * POWER_SCORE_CONFIG.WEIGHTS.MACRO;
    }

    // E) Stealth Layer (Weight: 15)
    if (evidence?.stealth?.complete) {
        const s = evidence.stealth;
        let score = 0;

        // Label-based
        if (s.label === 'A') score = 90;
        else if (s.label === 'B') score = 60;
        else score = 30;

        // Bonus for specific tags
        if (s.tags?.includes('blockPrint')) score += 10;
        if (s.tags?.includes('offExSurge')) score += 10;

        layerScores.stealth = Math.min(100, score);
        calculatedLayers++;
        totalWeight += POWER_SCORE_CONFIG.WEIGHTS.STEALTH;
        weightedSum += layerScores.stealth * POWER_SCORE_CONFIG.WEIGHTS.STEALTH;
    }

    // [P0] Calculate normalized score - ALWAYS produce a score if >= 1 layer
    // Formula: (weighted sum / total weight) - gives score on 0-100 scale
    let alphaScore: number | null = null;
    if (calculatedLayers >= 1 && totalWeight > 0) {
        // [P0] Produce partial score even with 1 layer
        alphaScore = weightedSum / totalWeight;

        // [P0] Cap score based on completeness
        // 1-2 layers: max 50
        // 3 layers: max 70
        // 4 layers: max 85
        // 5 layers: no cap
        const cappedMax = calculatedLayers <= 2 ? 50 : calculatedLayers === 3 ? 70 : calculatedLayers === 4 ? 85 : 100;
        alphaScore = Math.min(alphaScore, cappedMax);
    }

    return {
        alphaScore,
        layerScores,
        calculatedLayers,
        totalWeight
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
