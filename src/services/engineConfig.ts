// [S-56.4] Engine Configuration - Power Score & Quality Tier Constants
// Deterministic constants for scoring amplification

// === QUALITY TIER THRESHOLDS ===
export const QUALITY_TIER_CONFIG = {
    // Score thresholds
    ACTIONABLE_MIN_SCORE: 70,      // Minimum score for ACTIONABLE tier
    WATCH_MIN_SCORE: 50,           // Minimum score for WATCH tier

    // Confidence thresholds
    ACTIONABLE_MIN_CONFIDENCE: 60, // Minimum holdConfidence for ACTIONABLE (Reduced from 70)

    // Top3 promotion thresholds
    TOP3_PROMOTION_SCORE: 75,      // Minimum score to promote WATCH to Top3
    TOP3_RISK_OFF_THRESHOLD: 80,   // Higher threshold during RISK_OFF regime
};

// === POWER SCORE ADJUSTMENTS ===
export const POWER_SCORE_CONFIG = {
    // [vNext] Weighted AlphaScore 2.0 (Total 100)
    WEIGHTS: {
        PRICE: 25,
        OPTIONS: 25,
        FLOW: 20,
        MACRO: 15,
        STEALTH: 15
    },

    // Legacy / Adjustments
    BONUS_CONTINUATION: 10,       // CONTINUATION from previous report
    BONUS_RECOVERY: 15,           // RECOVERY signal (was weak, now strong)
    BONUS_STABILITY: 5,           // Stayed in Top12 previous report
    BONUS_LEADER_TRACK: 5,        // In Magnificent7, Bio, or DataCenter leaders

    // Penalties
    PENALTY_WEAKENING: -10,       // WEAKENING signal
    PENALTY_EXIT: -50,            // Severe penalty for exit
    PENALTY_NEW_ENTRY: -5,         // New to Top12 (slight disadvantage for stability)

    // Anti-churn band
    TOP3_ANTI_CHURN_DELTA: 8.0,    // Score drop tolerance for Top3 retention
    MAX_TOP3_SWAP_PER_RUN: 1,      // Maximum forced swaps in Top3

    // [V3.0] Sector Boost (Engine Integration)
    TARGET_SECTOR_BOOST: 10,       // Bonus for tickers in Guardian's Target Sector
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
    triggersKR?: string[]; // [V3.7.3] Trigger codes for UI
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
