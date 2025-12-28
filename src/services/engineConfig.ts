// [S-56.4] Engine Configuration - Power Score & Quality Tier Constants
// Deterministic constants for scoring amplification

// === QUALITY TIER THRESHOLDS ===
export const QUALITY_TIER_CONFIG = {
    // Score thresholds
    ACTIONABLE_MIN_SCORE: 65,      // Minimum score for ACTIONABLE tier
    WATCH_MIN_SCORE: 50,           // Minimum score for WATCH tier

    // Confidence thresholds
    ACTIONABLE_MIN_CONFIDENCE: 70, // Minimum holdConfidence for ACTIONABLE

    // Top3 promotion thresholds
    TOP3_PROMOTION_SCORE: 70,      // Minimum score to promote WATCH to Top3
    TOP3_RISK_OFF_THRESHOLD: 80,   // Higher threshold during RISK_OFF regime
};

// === POWER SCORE ADJUSTMENTS ===
export const POWER_SCORE_CONFIG = {
    // Continuation bonuses
    BONUS_CONTINUATION: 5.0,       // CONTINUATION from previous report
    BONUS_RECOVERY: 8.0,           // RECOVERY signal (was weak, now strong)
    BONUS_STABILITY: 3.0,          // Stayed in Top12 previous report
    BONUS_LEADER_TRACK: 4.0,       // In Magnificent7, Bio, or DataCenter leaders

    // Penalties
    PENALTY_WEAKENING: -5.0,       // WEAKENING signal
    PENALTY_EXIT: -15.0,           // EXIT signal (strong negative)
    PENALTY_NEW_ENTRY: -2.0,       // New to Top12 (slight disadvantage for stability)

    // Anti-churn band
    TOP3_ANTI_CHURN_DELTA: 8.0,    // Score drop tolerance for Top3 retention
    MAX_TOP3_SWAP_PER_RUN: 1,      // Maximum forced swaps in Top3
};

// === REGIME CONFIGURATION ===
export type MarketRegime = 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF';

export const REGIME_CONFIG = {
    // NQ=F change thresholds (intraday)
    RISK_OFF_THRESHOLD: -1.5,      // Below -1.5% = RISK_OFF
    RISK_ON_THRESHOLD: 0.5,        // Above 0.5% = RISK_ON
    // Between = NEUTRAL
};

// === QUALITY TIER TYPES ===
export type QualityTier = 'ACTIONABLE' | 'WATCH' | 'FILLER';

export interface QualityTierResult {
    tier: QualityTier;
    reasonKR: string;
    powerScore: number;
    isBackfilled: boolean;
}

// === TOP3 STATS ===
export interface Top3Stats {
    actionableUsed: number;
    watchUsed: number;
    noTradeSlots: number;
    changelogKR: string[];
}

// === POWER META ===
export interface PowerMeta {
    regime: MarketRegime;
    regimeReasonKR: string;
    counts: {
        actionableCount: number;
        watchCount: number;
        fillerCount: number;
        backfillCount: number;
    };
    top3Stats: Top3Stats;
}
