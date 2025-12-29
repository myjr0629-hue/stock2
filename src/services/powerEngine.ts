// [S-56.4] Power Engine - Quality Tier, Power Score, Top3 Selection
// "Show 12 / Trade 3" separation with stability locks

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

// === HELPER: Check if symbol is in Leaders Track ===
function isLeaderSymbol(symbol: string): boolean {
    const sym = symbol?.toUpperCase() || '';
    return (
        (MAGNIFICENT_7 as readonly string[]).includes(sym) ||
        (BIO_LEADERS_TOP5 as readonly string[]).includes(sym) ||
        (DATACENTER_TOP5 as readonly string[]).includes(sym)
    );
}

// === COMPUTE QUALITY TIER (vNext Weighted) ===
export function computeQualityTier(
    item: any, // Typed as TerminalItem in practice
    prevReportSymbols: Set<string> = new Set(),
    isBackfilled: boolean = false
): QualityTierResult {
    const symbol = item.ticker || '';
    const evidence = item.evidence; // Enhanced Evidence

    // 1. Calculate weighted AlphaScore 2.0
    let alphaScore = 0;

    if (evidence) {
        // A) Price (25)
        const priceScore = calculatePriceScore(evidence.price);
        alphaScore += (priceScore * POWER_SCORE_CONFIG.WEIGHTS.PRICE) / 100;

        // B) Options (25)
        const optionsScore = calculateOptionsScore(evidence.options);
        alphaScore += (optionsScore * POWER_SCORE_CONFIG.WEIGHTS.OPTIONS) / 100;

        // C) Flow (20)
        const flowScore = calculateFlowScore(evidence.flow);
        alphaScore += (flowScore * POWER_SCORE_CONFIG.WEIGHTS.FLOW) / 100;

        // D) Macro (15)
        const macroScore = calculateMacroScore(evidence.macro);
        alphaScore += (macroScore * POWER_SCORE_CONFIG.WEIGHTS.MACRO) / 100;

        // E) Stealth (15)
        const stealthScore = calculateStealthScore(evidence.stealth);
        alphaScore += (stealthScore * POWER_SCORE_CONFIG.WEIGHTS.STEALTH) / 100;

        console.log(`[PowerEngine] ${symbol} RawScore: ${alphaScore.toFixed(2)} (P:${priceScore} O:${optionsScore} F:${flowScore} M:${macroScore} S:${stealthScore})`);

    } else {
        // Legacy Fallback
        alphaScore = item.alphaScore || 0;
    }

    // 2. Adjustments (Bonuses/Penalties)
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

    // 3. Tier Determination
    let tier: QualityTier;
    let reasonKR: string;

    // Rule: Zero Score -> INVALID (Critical Guardrail)
    if (alphaScore <= 0) {
        tier = 'FILLER';
        reasonKR = '데이터 산출 실패 (INVALID)';
        alphaScore = 0; // Ensure explicit 0 for filtering
    }
    // Rule: Backfilled items with Smart Estimates CAN be actionable (if high confidence)
    // but usually we prefer Live. Allow SILVER/GOLD distinction if passed in.
    else if (isBackfilled || !evidence) {
        // [vNext] Smart Backfill allows promotion if score is very high (e.g. > 80), otherwise Filler
        if (alphaScore > 80) {
            tier = 'WATCH'; // Promote to Watch at least
            reasonKR = 'Backfill(추정치) 고득점';
        } else {
            tier = 'FILLER';
            reasonKR = 'Backfill 충원 종목';
        }
    }
    // Rule: EXIT action -> FILLER
    else if (holdAction === 'EXIT') {
        tier = 'FILLER';
        reasonKR = '매도 신호 (EXIT)';
    }
    // Rule: Policy Block
    else if (evidence?.policy?.gate?.blocked) {
        tier = 'FILLER';
        reasonKR = '정책적 차단 (Policy Block)';
    }
    // Rule: High score -> ACTIONABLE
    else if (alphaScore >= QUALITY_TIER_CONFIG.ACTIONABLE_MIN_SCORE) {
        tier = 'ACTIONABLE';
        reasonKR = `고강도(${alphaScore.toFixed(0)}) + 통합근거 = 매수 적합`;
    }
    // Rule: Moderate -> WATCH
    else if (alphaScore >= QUALITY_TIER_CONFIG.WATCH_MIN_SCORE) {
        tier = 'WATCH';
        reasonKR = `관심권(${alphaScore.toFixed(0)})`;
    }
    else {
        tier = 'FILLER';
        reasonKR = `저강도(${alphaScore.toFixed(0)}) - 채움용`;
    }

    return {
        tier,
        reasonKR,
        powerScore: alphaScore,
        isBackfilled
    };
}

// vNext Scoring Helpers
function calculatePriceScore(p?: any): number {
    if (!p) return 0;
    let score = 50; // Base
    if (p.changePct > 0) score += 20;
    if (p.vwapDistPct > 0) score += 20;
    if (p.rsi14 >= 50 && p.rsi14 <= 70) score += 10;
    return Math.min(100, Math.max(0, score));
}

function calculateOptionsScore(o?: any): number {
    if (!o) return 0;
    let score = 50;
    if (o.status === 'BULLISH') score += 30;
    else if (o.status === 'BEARISH') score -= 20;
    if (o.gammaRegime === 'Long Gamma') score += 10; // Stability
    return Math.min(100, Math.max(0, score));
}

function calculateFlowScore(f?: any): number {
    if (!f) return 0;
    let score = 50;
    if (f.offExPct > 45) score += 15;
    if (f.relVol > 1.2) score += 20;
    return Math.min(100, Math.max(0, score));
}

function calculateMacroScore(m?: any): number {
    if (!m) return 50;
    // Simple pass-through regime
    return 50; // Neutral default for now
}

function calculateStealthScore(s?: any): number {
    if (!s) return 0;
    if (s.label === 'A') return 90;
    if (s.label === 'B') return 70;
    return 30;
}

// === DETERMINE MARKET REGIME ===
export function determineRegime(macroData?: any): { regime: MarketRegime; reasonKR: string } {
    // If no macro data, default to NEUTRAL
    if (!macroData) {
        return { regime: 'NEUTRAL', reasonKR: 'Macro 데이터 없음 (기본 NEUTRAL)' };
    }

    // Try to get NQ=F change percentage
    const nqChange = macroData.nqChangePercent || macroData.changePct || 0;

    if (nqChange <= REGIME_CONFIG.RISK_OFF_THRESHOLD) {
        return { regime: 'RISK_OFF', reasonKR: `NQ=F ${nqChange.toFixed(2)}% (위험회피 모드)` };
    } else if (nqChange >= REGIME_CONFIG.RISK_ON_THRESHOLD) {
        return { regime: 'RISK_ON', reasonKR: `NQ=F +${nqChange.toFixed(2)}% (적극 모드)` };
    } else {
        return { regime: 'NEUTRAL', reasonKR: `NQ=F ${nqChange.toFixed(2)}% (중립 모드)` };
    }
}

// === SELECT TOP3 WITH PROMOTION GATE ===
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

    // Separate by tier
    const actionables = rankedItems.filter(item => item.qualityTier === 'ACTIONABLE');
    const watches = rankedItems.filter(item => item.qualityTier === 'WATCH');

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
            // Check if score drop within tolerance
            const prevScore = prevItem.prevAlphaScore || prevItem.powerScore;
            const currentScore = prevItem.powerScore || 0;
            const scoreDrop = prevScore - currentScore;

            if (scoreDrop <= POWER_SCORE_CONFIG.TOP3_ANTI_CHURN_DELTA) {
                selected.push(prevItem);
                actionableUsed++;
                changelog.push(`[유지] ${prevSymbol} - ACTIONABLE 유지 (점수: ${currentScore.toFixed(1)})`);
            }
        }
    }

    // === FILL REMAINING FROM ACTIONABLE ===
    for (const item of actionables) {
        if (selected.length >= 3) break;

        const sym = (item.symbol || item.ticker)?.toUpperCase();
        if (selected.some(s => (s.symbol || s.ticker)?.toUpperCase() === sym)) continue;

        // Check swap limit
        if (!prevTop3Set.has(sym) && swapCount >= POWER_SCORE_CONFIG.MAX_TOP3_SWAP_PER_RUN) {
            continue; // Skip new entry if swap limit reached
        }

        selected.push(item);
        actionableUsed++;

        if (!prevTop3Set.has(sym)) {
            swapCount++;
            changelog.push(`[신규] ${sym} - ACTIONABLE 승격 (점수: ${(item.powerScore || 0).toFixed(1)})`);
        }
    }

    // === FILL FROM WATCH IF NEEDED (only if score >= threshold) ===
    if (selected.length < 3) {
        for (const item of watches) {
            if (selected.length >= 3) break;

            const score = item.powerScore || 0;
            if (score < promotionThreshold) continue; // Must meet threshold

            const sym = (item.symbol || item.ticker)?.toUpperCase();
            if (selected.some(s => (s.symbol || s.ticker)?.toUpperCase() === sym)) continue;

            selected.push(item);
            watchUsed++;
            changelog.push(`[WATCH 승격] ${sym} - 점수 ${score.toFixed(1)} >= ${promotionThreshold}`);
        }
    }

    // === CALCULATE NO_TRADE SLOTS ===
    const noTradeSlots = 3 - selected.length;
    if (noTradeSlots > 0) {
        changelog.push(`[NO_TRADE] ${noTradeSlots}개 슬롯 - ACTIONABLE 부족 (regime: ${regime})`);
    }

    const stats: Top3Stats = {
        actionableUsed,
        watchUsed,
        noTradeSlots,
        changelogKR: changelog
    };

    return { top3: selected, stats, changelog };
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
    const actionableCount = items.filter(i => i.qualityTier === 'ACTIONABLE').length;
    const watchCount = items.filter(i => i.qualityTier === 'WATCH').length;
    const fillerCount = items.filter(i => i.qualityTier === 'FILLER').length;
    const backfillCount = items.filter(i => i.isBackfilled).length;

    return {
        regime,
        regimeReasonKR,
        counts: {
            actionableCount,
            watchCount,
            fillerCount,
            backfillCount
        },
        top3Stats
    };
}
