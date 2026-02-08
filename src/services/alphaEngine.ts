// ============================================================================
// [V3.0] ALPHA ENGINE — THE ABSOLUTE ENGINE
// ============================================================================
// 
// Philosophy: Alpha Score is ABSOLUTE. 80 means "BUY" — always, everywhere.
// Reports, watchlist, dashboard, individual stocks — ONE engine, ONE score.
// "Data is abundant. So what do I DO?" — This engine answers that.
//
// Architecture: 5-Pillar System (100 points)
//   MOMENTUM(25) + STRUCTURE(25) + FLOW(25) + REGIME(15) + CATALYST(10)
//
// Session Awareness: PRE / REG / POST / CLOSED → auto-adjusts weights
// Absolute Gates: Forced downgrades for dangerous patterns
// Self-Explaining: Every score tells you WHY
// 
// Single entry point: calculateAlphaScore(input) → result
// ============================================================================

import {
    calculateOIHeat,
    getGammaFlipBonus,
    getWallDistanceScore,
    getVIXTermScore,
    getSafeHavenScore,
} from './alphaEngineV2';

// ============================================================================
// TYPES — Input & Output
// ============================================================================

export type AlphaSession = 'PRE' | 'REG' | 'POST' | 'CLOSED';
export type AlphaGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
export type AlphaAction = 'STRONG_BUY' | 'BUY' | 'WATCH' | 'HOLD' | 'REDUCE' | 'EXIT';

export interface AlphaInput {
    ticker: string;
    session: AlphaSession;

    // === MOMENTUM data ===
    price: number;
    prevClose: number;
    changePct: number;
    vwap?: number | null;
    return3D?: number | null;
    sma20?: number | null;

    // === STRUCTURE data (Options) ===
    pcr?: number | null;
    gex?: number | null;
    callWall?: number | null;
    putFloor?: number | null;
    gammaFlipLevel?: number | null;
    rawChain?: any[];
    squeezeScore?: number | null;
    atmIv?: number | null;
    ivSkew?: number | null;   // [V3 PIPELINE] Put IV / Call IV ratio at ATM — >1 = institutional hedging

    // === FLOW data ===
    darkPoolPct?: number | null;
    shortVolPct?: number | null;
    whaleIndex?: number | null;
    relVol?: number | null;
    blockTrades?: number | null;
    netFlow?: number | null;

    // === REGIME data ===
    ndxChangePct?: number | null;
    vixValue?: number | null;
    vixChangePct?: number | null;
    tltChangePct?: number | null;
    gldChangePct?: number | null;

    // === CATALYST data ===
    impliedMovePct?: number | null;
    sentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | null;
    hasEarningsSoon?: boolean;
    hasFOMCSoon?: boolean;
    eventDescription?: string | null;

    // === CONTEXT (optional enrichment) ===
    wasInPrevReport?: boolean;
    prevAlphaScore?: number | null;
    rsi14?: number | null;
    optionsDataAvailable?: boolean;
}

export interface PillarDetail {
    score: number;
    max: number;
    pct: number;      // score/max as percentage for easy display
    factors: { name: string; value: number; max: number; detail?: string }[];
}

export interface AlphaResult {
    // === Core Score ===
    score: number;            // 0-100 absolute
    grade: AlphaGrade;        // S/A/B/C/D/F
    action: AlphaAction;      // STRONG_BUY → EXIT
    actionKR: string;         // Korean action label

    // === Self-Explanation (WHY) ===
    whyKR: string;            // "GEX 양성 + 기관매집 + 3일상승 = 강력매수"
    whyFactors: string[];     // ['GEX_SAFE', 'WHALE_IN', 'TREND_3D']
    triggerCodes: string[];   // For UI badges

    // === Pillar Breakdown ===
    pillars: {
        momentum: PillarDetail;
        structure: PillarDetail;
        flow: PillarDetail;
        regime: PillarDetail;
        catalyst: PillarDetail;
    };

    // === Gate & Session Info ===
    gatesApplied: string[];         // ['WALL_REJECTION'] or []
    sessionAdjusted: boolean;       // true if caps were applied
    dataCompleteness: number;       // 0-100 percentage
    dataCompletenessLabel: string;  // 'FULL' | 'PARTIAL' | 'MINIMAL'

    // === Metadata ===
    ticker: string;
    session: AlphaSession;
    calculatedAt: string;
    engineVersion: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ENGINE_VERSION = '3.1.0';

// Pillar max scores
const PILLAR_MAX = {
    MOMENTUM: 25,
    STRUCTURE: 25,
    FLOW: 25,
    REGIME: 15,
    CATALYST: 10,
} as const;

// Grade thresholds (absolute — never change)
const GRADE_THRESHOLDS = {
    S: 85,
    A: 70,
    B: 55,
    C: 40,
    D: 25,
    // Below 25 = F
} as const;

// Session caps — when data is limited, cap certain pillars
const SESSION_CAPS: Record<AlphaSession, { structure: number; flow: number; momentum: number }> = {
    PRE: { structure: 20, flow: 20, momentum: 25 },    // Options = prev day, Flow = limited
    REG: { structure: 25, flow: 25, momentum: 25 },    // Full power
    POST: { structure: 22, flow: 20, momentum: 22 },   // Volume declining
    CLOSED: { structure: 18, flow: 15, momentum: 15 },  // Stale data
};

// [V3.1] Adaptive Pillar Weight Multipliers per session
// During REG, Flow & Structure are most reliable → boost them
// During CLOSED, Momentum & Regime are most stable → boost them
const ADAPTIVE_WEIGHTS: Record<AlphaSession, { momentum: number; structure: number; flow: number; regime: number; catalyst: number }> = {
    PRE: { momentum: 1.1, structure: 0.9, flow: 0.85, regime: 1.15, catalyst: 1.0 },
    REG: { momentum: 1.0, structure: 1.05, flow: 1.1, regime: 0.95, catalyst: 0.9 },
    POST: { momentum: 1.0, structure: 0.95, flow: 0.9, regime: 1.1, catalyst: 1.05 },
    CLOSED: { momentum: 1.15, structure: 0.85, flow: 0.8, regime: 1.2, catalyst: 1.0 },
};

// ============================================================================
// MAIN FUNCTION — THE SINGLE ENTRY POINT
// ============================================================================

/**
 * Calculate the absolute Alpha Score for any stock, in any session.
 * 
 * This is THE function. Every endpoint calls this.
 * Reports, watchlist, dashboard, individual ticker — all use this.
 *
 * @param input - Available data (null fields are gracefully handled)
 * @returns AlphaResult with score, grade, action, WHY explanation, pillar breakdown
 */
export function calculateAlphaScore(input: AlphaInput): AlphaResult {
    const startTime = Date.now();

    // 1. Calculate data completeness
    const completeness = calculateDataCompleteness(input);

    // 2. Calculate each pillar
    const momentum = calculateMomentum(input);
    const structure = calculateStructure(input);
    const flow = calculateFlow(input);
    const regime = calculateRegime(input);
    const catalyst = calculateCatalyst(input);

    // 3. Apply session caps
    const caps = SESSION_CAPS[input.session];
    const cappedMomentum = applyPillarCap(momentum, caps.momentum);
    const cappedStructure = applyPillarCap(structure, caps.structure);
    const cappedFlow = applyPillarCap(flow, caps.flow);

    // 3b. [V3.1] Apply Adaptive Weights per session
    const aw = ADAPTIVE_WEIGHTS[input.session];
    const weightedMomentum = cappedMomentum.score * aw.momentum;
    const weightedStructure = cappedStructure.score * aw.structure;
    const weightedFlow = cappedFlow.score * aw.flow;
    const weightedRegime = regime.score * aw.regime;
    const weightedCatalyst = catalyst.score * aw.catalyst;

    // 4. Raw score (with adaptive weights)
    let rawScore = weightedMomentum + weightedStructure + weightedFlow + weightedRegime + weightedCatalyst;

    // 4b. [V3.1] Historical Score Trend Adjustment (±3)
    // If previous score exists, adjust based on trajectory
    const prev = input.prevAlphaScore;
    let trendAdjust = 0;
    if (prev !== null && prev !== undefined && prev > 0) {
        const delta = rawScore - prev;
        if (delta >= 10) {
            trendAdjust = 3;  // Strong uptrend — momentum bonus
        } else if (delta >= 5) {
            trendAdjust = 2;  // Moderate uptrend
        } else if (delta >= 2) {
            trendAdjust = 1;  // Mild uptrend
        } else if (delta <= -10) {
            trendAdjust = -3; // Sharp decline — warning
        } else if (delta <= -5) {
            trendAdjust = -2; // Moderate decline
        } else if (delta <= -2) {
            trendAdjust = -1; // Mild decline
        }
        rawScore += trendAdjust;
    }

    // 5. Apply absolute gates
    const gatesResult = applyAbsoluteGates(rawScore, input);
    const finalScore = Math.round(Math.max(0, Math.min(100, gatesResult.adjustedScore)));

    // 6. Determine grade and action
    const grade = determineGrade(finalScore);
    const { action, actionKR } = determineAction(grade, input);

    // 7. Build WHY explanation
    const { whyKR, whyFactors, triggerCodes } = buildExplanation(
        input, cappedMomentum, cappedStructure, cappedFlow, regime, catalyst, gatesResult, grade
    );

    // 8. Session adjustment flag
    const sessionAdjusted = input.session !== 'REG';

    return {
        score: finalScore,
        grade,
        action,
        actionKR,
        whyKR,
        whyFactors,
        triggerCodes,
        pillars: {
            momentum: cappedMomentum,
            structure: cappedStructure,
            flow: cappedFlow,
            regime,
            catalyst,
        },
        gatesApplied: gatesResult.gatesApplied,
        sessionAdjusted,
        dataCompleteness: completeness.pct,
        dataCompletenessLabel: completeness.label,
        ticker: input.ticker,
        session: input.session,
        calculatedAt: new Date().toISOString(),
        engineVersion: ENGINE_VERSION,
    };
}


// ============================================================================
// PILLAR 1: MOMENTUM (25점) — "Is this stock going UP?"
// ============================================================================

function calculateMomentum(input: AlphaInput): PillarDetail {
    const factors: PillarDetail['factors'] = [];
    let total = 0;

    // Factor 1: Price Change (0-8)
    const changePct = input.changePct || 0;
    let changeScore: number;
    if (changePct >= 5) changeScore = 8;
    else if (changePct >= 3) changeScore = 6;
    else if (changePct >= 1) changeScore = 2 + (changePct - 1) * 2;  // Linear 2-6
    else if (changePct >= 0) changeScore = changePct * 2;              // Linear 0-2
    else if (changePct >= -2) changeScore = 0;                         // Small dip = neutral
    else changeScore = 0;                                              // Big drop = 0    
    changeScore = clamp(changeScore, 0, 8);
    factors.push({ name: 'priceChange', value: round1(changeScore), max: 8, detail: `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%` });
    total += changeScore;

    // Factor 2: VWAP Position (0-5)
    let vwapScore = 0;
    if (input.vwap && input.vwap > 0 && input.price > 0) {
        const vwapDist = ((input.price - input.vwap) / input.vwap) * 100;
        if (vwapDist > 2) vwapScore = 5;        // Well above VWAP — strong
        else if (vwapDist > 0.5) vwapScore = 3;  // Slightly above — good
        else if (vwapDist > -0.5) vwapScore = 2; // Near VWAP — neutral
        else if (vwapDist > -2) vwapScore = 1;   // Below VWAP — weak
        else vwapScore = 0;                       // Far below — bad
        factors.push({ name: 'vwapPosition', value: round1(vwapScore), max: 5, detail: `VWAP거리 ${vwapDist >= 0 ? '+' : ''}${vwapDist.toFixed(1)}%` });
    } else {
        // No VWAP → use changePct as proxy (reduced weight)
        vwapScore = changePct > 0 ? Math.min(3, changePct) : 0;
        factors.push({ name: 'vwapPosition', value: round1(vwapScore), max: 5, detail: 'VWAP 없음(프록시)' });
    }
    total += vwapScore;

    // Factor 3: 3-Day Trend (0-7)
    let trendScore = 0;
    const return3D = input.return3D;
    if (return3D !== null && return3D !== undefined) {
        if (return3D >= 8) trendScore = 7;
        else if (return3D >= 5) trendScore = 6;
        else if (return3D >= 3) trendScore = 5;
        else if (return3D >= 1) trendScore = 3;
        else if (return3D >= 0) trendScore = 2;
        else if (return3D >= -2) trendScore = 1;
        else trendScore = 0;
        factors.push({ name: 'trend3D', value: round1(trendScore), max: 7, detail: `3일수익률 ${return3D >= 0 ? '+' : ''}${return3D.toFixed(1)}%` });
    } else {
        // Fallback: use changePct extrapolation (reduced confidence)
        trendScore = Math.min(4, Math.max(0, changePct * 1.5));
        factors.push({ name: 'trend3D', value: round1(trendScore), max: 7, detail: '3일 데이터 없음(추정)' });
    }
    total += trendScore;

    // Factor 4: Smart DIP Detection (0-5)
    // Price down BUT institutional buying → reversal signal
    let smartDipScore = 0;
    if (changePct < -0.5) {
        const netFlow = input.netFlow || 0;
        const whaleIdx = input.whaleIndex || 0;
        const darkPool = input.darkPoolPct || 0;

        if (netFlow > 1000000 || whaleIdx >= 70 || darkPool >= 50) {
            smartDipScore = 5; // Strong Smart DIP
            factors.push({ name: 'smartDip', value: 5, max: 5, detail: '가격↓ + 기관매수↑ = 반등신호' });
        } else if (netFlow > 0 || whaleIdx >= 50) {
            smartDipScore = 3;
            factors.push({ name: 'smartDip', value: 3, max: 5, detail: '가격↓ + 소규모 매집' });
        } else {
            factors.push({ name: 'smartDip', value: 0, max: 5, detail: '가격↓ + 매집 없음' });
        }
    } else if (changePct < 0) {
        factors.push({ name: 'smartDip', value: 0, max: 5, detail: '소폭 하락' });
    } else {
        // No dip → no Smart DIP factor applies, but don't penalize
        factors.push({ name: 'smartDip', value: 0, max: 5, detail: '해당없음' });
    }
    total += smartDipScore;

    total = clamp(total, 0, PILLAR_MAX.MOMENTUM);

    return {
        score: round1(total),
        max: PILLAR_MAX.MOMENTUM,
        pct: Math.round((total / PILLAR_MAX.MOMENTUM) * 100),
        factors,
    };
}


// ============================================================================
// PILLAR 2: STRUCTURE (25점) — "Does the options market support upside?"
// ============================================================================

function calculateStructure(input: AlphaInput): PillarDetail {
    const factors: PillarDetail['factors'] = [];
    let total = 0;

    const optionsAvailable = input.optionsDataAvailable !== false && (
        input.pcr !== null && input.pcr !== undefined ||
        input.gex !== null && input.gex !== undefined ||
        (input.rawChain && input.rawChain.length > 0)
    );

    if (!optionsAvailable) {
        // No options data → minimal structure score with honest labeling
        factors.push({ name: 'optionsData', value: 0, max: 25, detail: '옵션 데이터 없음' });
        return {
            score: 8, // Neutral baseline when no data
            max: PILLAR_MAX.STRUCTURE,
            pct: Math.round((8 / PILLAR_MAX.STRUCTURE) * 100),
            factors,
        };
    }

    // Factor 1: OI Heat (0-5) — concentration of Open Interest
    const oiHeat = calculateOIHeat(input.rawChain || []);
    factors.push({ name: 'oiHeat', value: round1(oiHeat), max: 5, detail: `OI 집중도 ${round1(oiHeat)}/5` });
    total += oiHeat;

    // Factor 2: Gamma Setup (0-5) — price near gamma flip + GEX direction
    let gammaScore = 0;
    const gammaFlipBonus = getGammaFlipBonus(input.price, input.gammaFlipLevel);

    // GEX direction: positive = dealer support (good), negative = amplification (risky but potential)
    const gex = input.gex || 0;
    let gexDirectionBonus = 0;
    if (gex > 2000000) gexDirectionBonus = 2;       // Strong positive GEX — dealer support
    else if (gex > 0) gexDirectionBonus = 1;         // Positive GEX — mild support
    else if (gex < -2000000) gexDirectionBonus = 0;  // Strong negative — amplification danger
    else gexDirectionBonus = 0;

    gammaScore = clamp(gammaFlipBonus + gexDirectionBonus, 0, 5);
    const gexLabel = gex > 0 ? `GEX+$${(gex / 1e6).toFixed(0)}M` : `GEX-$${(Math.abs(gex) / 1e6).toFixed(0)}M`;
    factors.push({ name: 'gammaSetup', value: round1(gammaScore), max: 5, detail: gexLabel });
    total += gammaScore;

    // Factor 3: Wall Sandwich (0-5) — price between support & resistance
    const wallScore = getWallDistanceScore(input.price, input.callWall || 0, input.putFloor || 0);
    // Scale from 0-3 (V2) to 0-5 (V3)
    const wallScaled = clamp(wallScore * (5 / 3), 0, 5);

    let wallDetail = '';
    if (input.callWall && input.putFloor) {
        wallDetail = `Put $${input.putFloor.toFixed(0)} < Price < Call $${input.callWall.toFixed(0)}`;
    } else if (input.callWall) {
        wallDetail = `Call Wall $${input.callWall.toFixed(0)}`;
    } else {
        wallDetail = '레벨 없음';
    }
    factors.push({ name: 'wallSandwich', value: round1(wallScaled), max: 5, detail: wallDetail });
    total += wallScaled;

    // Factor 4: PCR Balance (0-5)
    let pcrScore = 0;
    const pcr = input.pcr || 1;
    if (pcr < 0.5) pcrScore = 5;       // Extreme call dominance
    else if (pcr < 0.7) pcrScore = 4;  // Call dominance — bullish
    else if (pcr < 0.9) pcrScore = 3;  // Mild bullish
    else if (pcr < 1.1) pcrScore = 2;  // Neutral
    else if (pcr < 1.3) pcrScore = 1;  // Mild bearish
    else pcrScore = 0;                  // Put dominance — bearish
    factors.push({ name: 'pcrBalance', value: round1(pcrScore), max: 5, detail: `PCR ${pcr.toFixed(2)}` });
    total += pcrScore;

    // Factor 5: Squeeze Potential (0-5)
    let squeezeScore = 0;
    const sq = input.squeezeScore;
    if (sq !== null && sq !== undefined) {
        if (sq >= 80) squeezeScore = 5;
        else if (sq >= 60) squeezeScore = 4;
        else if (sq >= 45) squeezeScore = 3;
        else if (sq >= 30) squeezeScore = 2;
        else squeezeScore = 1;
        factors.push({ name: 'squeezePotential', value: round1(squeezeScore), max: 5, detail: `스퀴즈 ${sq.toFixed(0)}점` });
    } else {
        squeezeScore = 1; // Neutral fallback
        factors.push({ name: 'squeezePotential', value: 1, max: 5, detail: '스퀴즈 데이터 없음' });
    }
    total += squeezeScore;

    // [V3 PIPELINE] IV Skew Adjustment (±2) — institutional hedging detector
    const skew = input.ivSkew;
    if (skew !== null && skew !== undefined && skew > 0) {
        if (skew > 1.20) {
            // Heavy put skew = institutions buying protection = bearish structure
            total -= 2;
            factors.push({ name: 'ivSkew', value: -2, max: 2, detail: `IV스큐 ${skew.toFixed(2)} (기관헤지 경고)` });
        } else if (skew > 1.10) {
            total -= 1;
            factors.push({ name: 'ivSkew', value: -1, max: 2, detail: `IV스큐 ${skew.toFixed(2)} (약한 헤지)` });
        } else if (skew < 0.85) {
            // Call skew = speculative upside expectation
            total += 2;
            factors.push({ name: 'ivSkew', value: 2, max: 2, detail: `IV스큐 ${skew.toFixed(2)} (콜 집중)` });
        } else if (skew < 0.92) {
            total += 1;
            factors.push({ name: 'ivSkew', value: 1, max: 2, detail: `IV스큐 ${skew.toFixed(2)} (약간 콜 우위)` });
        } else {
            factors.push({ name: 'ivSkew', value: 0, max: 2, detail: `IV스큐 ${skew.toFixed(2)} (균형)` });
        }
    }

    total = clamp(total, 0, PILLAR_MAX.STRUCTURE);

    return {
        score: round1(total),
        max: PILLAR_MAX.STRUCTURE,
        pct: Math.round((total / PILLAR_MAX.STRUCTURE) * 100),
        factors,
    };
}


// ============================================================================
// PILLAR 3: FLOW (25점) — "Are institutions buying?"
// ============================================================================

function calculateFlow(input: AlphaInput): PillarDetail {
    const factors: PillarDetail['factors'] = [];
    let total = 0;

    // Factor 1: Dark Pool % (0-7)
    let darkPoolScore = 0;
    const dp = input.darkPoolPct;
    if (dp !== null && dp !== undefined) {
        if (dp >= 60) darkPoolScore = 7;       // Massive institutional
        else if (dp >= 50) darkPoolScore = 6;  // Heavy institutional
        else if (dp >= 40) darkPoolScore = 5;  // Significant
        else if (dp >= 30) darkPoolScore = 3;  // Moderate
        else if (dp >= 20) darkPoolScore = 1;  // Light
        else darkPoolScore = 0;
        factors.push({ name: 'darkPool', value: round1(darkPoolScore), max: 7, detail: `Dark Pool ${dp.toFixed(1)}%` });
    } else {
        darkPoolScore = 2; // Neutral when no data
        factors.push({ name: 'darkPool', value: 2, max: 7, detail: 'Dark Pool 데이터 없음' });
    }
    total += darkPoolScore;

    // Factor 2: Whale Index (0-6)
    let whaleScore = 0;
    const wi = input.whaleIndex;
    if (wi !== null && wi !== undefined) {
        if (wi >= 80) whaleScore = 6;
        else if (wi >= 65) whaleScore = 5;
        else if (wi >= 50) whaleScore = 4;
        else if (wi >= 35) whaleScore = 2;
        else whaleScore = 1;
        factors.push({ name: 'whaleIndex', value: round1(whaleScore), max: 6, detail: `Whale ${wi.toFixed(0)}` });
    } else {
        whaleScore = 2;
        factors.push({ name: 'whaleIndex', value: 2, max: 6, detail: 'Whale 데이터 없음' });
    }
    total += whaleScore;

    // Factor 3: Relative Volume (0-5)
    let relVolScore = 0;
    const rv = input.relVol;
    if (rv !== null && rv !== undefined) {
        if (rv >= 3.0) relVolScore = 5;       // Explosive volume
        else if (rv >= 2.0) relVolScore = 4;  // Very high
        else if (rv >= 1.5) relVolScore = 3;  // Above average
        else if (rv >= 1.0) relVolScore = 2;  // Normal
        else if (rv >= 0.5) relVolScore = 1;  // Below average
        else relVolScore = 0;                  // Dead volume
        factors.push({ name: 'relativeVol', value: round1(relVolScore), max: 5, detail: `RelVol ${rv.toFixed(1)}x` });
    } else {
        relVolScore = 2;
        factors.push({ name: 'relativeVol', value: 2, max: 5, detail: 'RelVol 데이터 없음' });
    }
    total += relVolScore;

    // Factor 4: Short Volume Protection (0-4)
    // LOW short vol = safe = points. HIGH short vol = danger = 0
    let shortVolScore = 0;
    const sv = input.shortVolPct;
    if (sv !== null && sv !== undefined) {
        if (sv < 25) shortVolScore = 4;       // Very safe
        else if (sv < 35) shortVolScore = 3;  // Safe
        else if (sv < 45) shortVolScore = 2;  // Normal
        else if (sv < 55) shortVolScore = 1;  // Elevated
        else shortVolScore = 0;                // Dangerous
        factors.push({ name: 'shortVolume', value: round1(shortVolScore), max: 4, detail: `Short Vol ${sv.toFixed(1)}%` });
    } else {
        shortVolScore = 2;
        factors.push({ name: 'shortVolume', value: 2, max: 4, detail: 'Short Vol 데이터 없음' });
    }
    total += shortVolScore;

    // Factor 5: Block Trades (0-3)
    let blockScore = 0;
    const bt = input.blockTrades;
    if (bt !== null && bt !== undefined) {
        if (bt >= 5) blockScore = 3;
        else if (bt >= 3) blockScore = 2;
        else if (bt >= 1) blockScore = 1;
        else blockScore = 0;
        factors.push({ name: 'blockTrades', value: round1(blockScore), max: 3, detail: `Block ${bt}건` });
    } else {
        blockScore = 1;
        factors.push({ name: 'blockTrades', value: 1, max: 3, detail: 'Block 데이터 없음' });
    }
    total += blockScore;

    total = clamp(total, 0, PILLAR_MAX.FLOW);

    return {
        score: round1(total),
        max: PILLAR_MAX.FLOW,
        pct: Math.round((total / PILLAR_MAX.FLOW) * 100),
        factors,
    };
}


// ============================================================================
// PILLAR 4: REGIME (15점) — "Is the market environment favorable?"
// ============================================================================

function calculateRegime(input: AlphaInput): PillarDetail {
    const factors: PillarDetail['factors'] = [];
    let total = 0;

    // Factor 1: NDX/Market Trend (0-5)
    let ndxScore = 0;
    const ndx = input.ndxChangePct;
    if (ndx !== null && ndx !== undefined) {
        if (ndx >= 1.0) ndxScore = 5;       // Strong risk-on
        else if (ndx >= 0.5) ndxScore = 4;
        else if (ndx >= 0) ndxScore = 3;    // Mild positive
        else if (ndx >= -0.5) ndxScore = 2;  // Mild negative
        else if (ndx >= -1.0) ndxScore = 1;
        else ndxScore = 0;                    // Strong risk-off
        factors.push({ name: 'ndxTrend', value: round1(ndxScore), max: 5, detail: `NDX ${ndx >= 0 ? '+' : ''}${ndx.toFixed(1)}%` });
    } else {
        ndxScore = 3; // Neutral
        factors.push({ name: 'ndxTrend', value: 3, max: 5, detail: 'NDX 데이터 없음' });
    }
    total += ndxScore;

    // Factor 2: VIX Level & Direction (0-5)
    let vixScore = 0;
    const vix = input.vixValue;
    const vixChg = input.vixChangePct;

    if (vix !== null && vix !== undefined) {
        // VIX level base
        if (vix < 13) vixScore = 5;       // Ultra-calm
        else if (vix < 16) vixScore = 4;  // Calm
        else if (vix < 20) vixScore = 3;  // Normal
        else if (vix < 25) vixScore = 2;  // Elevated
        else if (vix < 30) vixScore = 1;  // High
        else vixScore = 0;                 // Panic

        // VIX direction adjustment: falling VIX = good, rising = bad
        if (vixChg !== null && vixChg !== undefined) {
            if (vixChg < -5) vixScore = Math.min(5, vixScore + 1);  // VIX collapsing = great
            else if (vixChg > 10) vixScore = Math.max(0, vixScore - 1); // VIX spiking = bad
        }

        factors.push({ name: 'vixLevel', value: round1(vixScore), max: 5, detail: `VIX ${vix.toFixed(1)}` });
    } else {
        // Use VIX term proxy from V2
        vixScore = getVIXTermScore(vixChg || 0);
        vixScore = clamp(vixScore, 0, 5);
        factors.push({ name: 'vixLevel', value: round1(vixScore), max: 5, detail: 'VIX 추정' });
    }
    total += vixScore;

    // Factor 3: Safe Haven Flow (0-5)
    const safeHavenRaw = getSafeHavenScore(input.tltChangePct || 0, input.gldChangePct || 0);
    // V2 returns 0-4, scale to 0-5
    const safeHavenScore = clamp(safeHavenRaw * (5 / 4), 0, 5);

    let safeHavenDetail = 'TLT/GLD 데이터 없음';
    if (input.tltChangePct !== null && input.tltChangePct !== undefined) {
        safeHavenDetail = `TLT ${input.tltChangePct >= 0 ? '+' : ''}${input.tltChangePct.toFixed(1)}%`;
        if (input.gldChangePct !== null && input.gldChangePct !== undefined) {
            safeHavenDetail += ` GLD ${input.gldChangePct >= 0 ? '+' : ''}${input.gldChangePct.toFixed(1)}%`;
        }
    }
    factors.push({ name: 'safeHaven', value: round1(safeHavenScore), max: 5, detail: safeHavenDetail });
    total += safeHavenScore;

    total = clamp(total, 0, PILLAR_MAX.REGIME);

    return {
        score: round1(total),
        max: PILLAR_MAX.REGIME,
        pct: Math.round((total / PILLAR_MAX.REGIME) * 100),
        factors,
    };
}


// ============================================================================
// PILLAR 5: CATALYST (10점) — "Is there a catalyst?"
// ============================================================================

function calculateCatalyst(input: AlphaInput): PillarDetail {
    const factors: PillarDetail['factors'] = [];
    let total = 0;

    // Factor 1: Implied Move (0-4) — expected magnitude of move
    let impliedScore = 0;
    const im = input.impliedMovePct;
    if (im !== null && im !== undefined) {
        if (im >= 8) impliedScore = 4;      // Huge event expected
        else if (im >= 5) impliedScore = 3;
        else if (im >= 3) impliedScore = 2;
        else if (im >= 1) impliedScore = 1;
        else impliedScore = 0;
        factors.push({ name: 'impliedMove', value: round1(impliedScore), max: 4, detail: `Implied Move ±${im.toFixed(1)}%` });
    } else {
        factors.push({ name: 'impliedMove', value: 0, max: 4, detail: 'Implied Move 없음' });
    }
    total += impliedScore;

    // Factor 2: Sentiment (0-3)
    let sentimentScore = 0;
    if (input.sentiment === 'POSITIVE') sentimentScore = 3;
    else if (input.sentiment === 'NEUTRAL') sentimentScore = 1;
    else if (input.sentiment === 'NEGATIVE') sentimentScore = 0;
    else sentimentScore = 1; // Default neutral
    factors.push({ name: 'sentiment', value: round1(sentimentScore), max: 3, detail: input.sentiment || 'N/A' });
    total += sentimentScore;

    // Factor 3: Event Gate (-4 to 0) — earnings/FOMC uncertainty penalty
    let eventPenalty = 0;
    if (input.hasEarningsSoon) {
        eventPenalty = -4;  // Earnings = max uncertainty
        factors.push({ name: 'eventGate', value: -4, max: 0, detail: `실적발표 임박${input.eventDescription ? ': ' + input.eventDescription : ''}` });
    } else if (input.hasFOMCSoon) {
        eventPenalty = -3;  // FOMC = high uncertainty
        factors.push({ name: 'eventGate', value: -3, max: 0, detail: 'FOMC 임박' });
    } else {
        factors.push({ name: 'eventGate', value: 0, max: 0, detail: '주요 이벤트 없음' });
    }
    total += eventPenalty;

    // Factor 4: Continuation Bonus (0-3)
    let contScore = 0;
    if (input.wasInPrevReport) {
        contScore = 3; // Stability bonus for staying in report
        factors.push({ name: 'continuation', value: 3, max: 3, detail: '전일 Top12 유지' });
    } else {
        factors.push({ name: 'continuation', value: 0, max: 3, detail: '신규' });
    }
    total += contScore;

    total = clamp(total, 0, PILLAR_MAX.CATALYST);

    return {
        score: round1(total),
        max: PILLAR_MAX.CATALYST,
        pct: Math.round((total / PILLAR_MAX.CATALYST) * 100),
        factors,
    };
}


// ============================================================================
// ABSOLUTE GATES — Forced safety checks
// ============================================================================

interface GateResult {
    adjustedScore: number;
    gatesApplied: string[];
}

function applyAbsoluteGates(rawScore: number, input: AlphaInput): GateResult {
    let score = rawScore;
    const gatesApplied: string[] = [];

    // Gate 1: EXHAUSTION — RSI extreme + huge pump + volume spike
    const rsi = input.rsi14 || 50;
    const changePct = input.changePct || 0;
    const relVol = input.relVol || 1;
    if (rsi >= 80 && changePct >= 12 && relVol >= 2) {
        score = 0; // Nuclear reset
        gatesApplied.push('EXHAUSTION');
        return { adjustedScore: score, gatesApplied }; // Immediate return
    }

    // Gate 2: FAKE PUMP — price up but institutions selling
    const netFlow = input.netFlow || 0;
    const gex = input.gex || 0;
    if (changePct > 5 && netFlow < -100000 && gex < 0) {
        score = Math.min(score, 45);
        gatesApplied.push('FAKE_PUMP');
    }

    // Gate 3: WALL REJECTION — price at Call Wall resistance
    if (input.callWall && input.callWall > 0 && input.price > 0) {
        const wallProximity = Math.abs(input.price - input.callWall) / input.price;
        if (wallProximity < 0.02) { // Within 2% of Call Wall
            score = Math.min(score, 55);
            gatesApplied.push('WALL_REJECTION');
        }
    }

    // Gate 4: SHORT STORM — extremely high short volume
    const shortVol = input.shortVolPct;
    if (shortVol !== null && shortVol !== undefined && shortVol >= 55) {
        score = score - 10;
        gatesApplied.push('SHORT_STORM');
    }

    // Gate 5: CONTEXT-AWARE RSI — Market regime adjusts thresholds
    // Risk-On (NDX ≥ +0.5%): RSI 82, change 8%, cap 75 → 강세장 모멘텀 놓침 방지
    // Normal:                 RSI 75, change 5%, cap 65 → 기존 동일
    // Risk-Off (NDX ≤ -0.5%): RSI 72, change 4%, cap 55 → 약세장 가짜 반등 경고 강화
    const ndx = input.ndxChangePct ?? 0;
    let rsiThreshold = 75;
    let changeThreshold = 5;
    let rsiCap = 65;
    if (ndx >= 0.5) {
        // Risk-On: relax thresholds — market is genuinely strong
        rsiThreshold = 82;
        changeThreshold = 8;
        rsiCap = 75;
        if (rsi >= rsiThreshold && changePct > changeThreshold) {
            score = Math.min(score, rsiCap);
            gatesApplied.push('RSI_EXTREME_RISKON');
        }
    } else if (ndx <= -0.5) {
        // Risk-Off: tighten thresholds — suspect any big move
        rsiThreshold = 72;
        changeThreshold = 4;
        rsiCap = 55;
        if (rsi >= rsiThreshold && changePct > changeThreshold) {
            score = Math.min(score, rsiCap);
            gatesApplied.push('RSI_EXTREME_RISKOFF');
        }
    } else {
        // Normal: original behavior
        if (rsi >= 75 && changePct > 5) {
            score = Math.min(score, 65);
            gatesApplied.push('RSI_EXTREME');
        }
    }

    // Gate 6: DEAD VOLUME — relVol very low indicates no interest
    if (relVol < 0.3 && input.session === 'REG') {
        score = Math.min(score, 50);
        gatesApplied.push('DEAD_VOLUME');
    }

    // Gate 7: SHORT SQUEEZE READY — high short vol + positive squeeze = potential cover rally (BONUS)
    if (shortVol !== null && shortVol !== undefined && shortVol >= 45) {
        const squeezeVal = input.squeezeScore ?? 0;
        if (squeezeVal >= 60 && changePct > 0 && relVol >= 1.5) {
            // Short squeeze conditions: high shorts + squeeze score + price up + volume spike
            score = score + 8; // Significant bonus
            gatesApplied.push('SHORT_SQUEEZE_READY');
        }
    }

    // Gate 8: TLT FLIGHT — safe haven flight to bonds = bearish for equities
    const tlt = input.tltChangePct;
    if (tlt !== null && tlt !== undefined && tlt > 1.0) {
        // TLT rising > 1% = significant bond buying = risk-off
        score = score - 5;
        gatesApplied.push('TLT_FLIGHT');
    }

    // Gate 9: TREND MOMENTUM BONUS — rising score trend + strong momentum = momentum rider
    if (input.prevAlphaScore && input.prevAlphaScore > 0) {
        const scoreDelta = score - input.prevAlphaScore;
        if (scoreDelta >= 15 && changePct > 2 && relVol >= 1.2) {
            score = score + 5;
            gatesApplied.push('TREND_MOMENTUM_BONUS');
        }
    }

    return { adjustedScore: score, gatesApplied };
}


// ============================================================================
// SESSION CAP — Apply pillar maximum for current session
// ============================================================================

function applyPillarCap(pillar: PillarDetail, cap: number): PillarDetail {
    if (pillar.score <= cap) return pillar;
    return {
        ...pillar,
        score: cap,
        pct: Math.round((cap / pillar.max) * 100),
    };
}


// ============================================================================
// GRADE & ACTION DETERMINATION
// ============================================================================

function determineGrade(score: number): AlphaGrade {
    if (score >= GRADE_THRESHOLDS.S) return 'S';
    if (score >= GRADE_THRESHOLDS.A) return 'A';
    if (score >= GRADE_THRESHOLDS.B) return 'B';
    if (score >= GRADE_THRESHOLDS.C) return 'C';
    if (score >= GRADE_THRESHOLDS.D) return 'D';
    return 'F';
}

function determineAction(grade: AlphaGrade, input: AlphaInput): { action: AlphaAction; actionKR: string } {
    switch (grade) {
        case 'S': return { action: 'STRONG_BUY', actionKR: '🔥 즉시 매수' };
        case 'A': return { action: 'BUY', actionKR: '✅ 매수 적합' };
        case 'B': return { action: 'WATCH', actionKR: '👀 관심 등록' };
        case 'C': return { action: 'HOLD', actionKR: '⏸️ 관망' };
        case 'D': return { action: 'REDUCE', actionKR: '⚠️ 축소' };
        case 'F': return { action: 'EXIT', actionKR: '🚫 즉시 이탈' };
    }
}


// ============================================================================
// WHY EXPLANATION — Self-explanatory scoring
// ============================================================================

function buildExplanation(
    input: AlphaInput,
    momentum: PillarDetail,
    structure: PillarDetail,
    flow: PillarDetail,
    regime: PillarDetail,
    catalyst: PillarDetail,
    gates: GateResult,
    grade: AlphaGrade,
): { whyKR: string; whyFactors: string[]; triggerCodes: string[] } {
    const whyParts: string[] = [];
    const whyFactors: string[] = [];
    const triggerCodes: string[] = [];

    // === Momentum signals ===
    if (momentum.pct >= 80) {
        whyParts.push('강한 상승세');
        whyFactors.push('STRONG_MOMENTUM');
        triggerCodes.push('MOM_STRONG');
    } else if (momentum.pct >= 60) {
        whyParts.push('상승 모멘텀');
        whyFactors.push('MOMENTUM_UP');
    }

    // 3D trend
    const trend3D = momentum.factors.find(f => f.name === 'trend3D');
    if (trend3D && trend3D.value >= 5) {
        whyParts.push('3일연속상승');
        whyFactors.push('TREND_3D');
        triggerCodes.push('TREND_3D');
    }

    // Smart DIP
    const smartDip = momentum.factors.find(f => f.name === 'smartDip');
    if (smartDip && smartDip.value >= 3) {
        whyParts.push('기관매집(Smart DIP)');
        whyFactors.push('SMART_DIP');
        triggerCodes.push('SMART_DIP');
    }

    // === Structure signals ===
    const gex = input.gex || 0;
    if (gex > 2000000) {
        whyParts.push(`GEX안전지대(+$${(gex / 1e6).toFixed(0)}M)`);
        whyFactors.push('GEX_SAFE');
        triggerCodes.push('GEX_SAFE');
    } else if (gex < -2000000) {
        whyParts.push(`GEX음성(-$${(Math.abs(gex) / 1e6).toFixed(0)}M)`);
        whyFactors.push('GEX_NEGATIVE');
        triggerCodes.push('GEX_NEG');
    }

    // Squeeze
    if (input.squeezeScore && input.squeezeScore >= 60) {
        whyParts.push('스퀴즈임박');
        whyFactors.push('SQUEEZE_READY');
        triggerCodes.push('SQUEEZE');
    }

    // PCR
    if (input.pcr && input.pcr < 0.7) {
        whyParts.push('콜옵션우세');
        whyFactors.push('CALL_DOMINANT');
    }

    // === Flow signals ===
    if (input.darkPoolPct && input.darkPoolPct >= 50) {
        whyParts.push(`기관매집(DP ${input.darkPoolPct.toFixed(0)}%)`);
        whyFactors.push('DARK_POOL_HIGH');
        triggerCodes.push('DP_HIGH');
    }
    if (input.whaleIndex && input.whaleIndex >= 70) {
        whyParts.push('고래유입');
        whyFactors.push('WHALE_IN');
        triggerCodes.push('WHALE_IN');
    }
    if (input.shortVolPct && input.shortVolPct >= 50) {
        whyParts.push(`공매도경고(${input.shortVolPct.toFixed(0)}%)`);
        whyFactors.push('SHORT_ALERT');
        triggerCodes.push('SHORT_ALERT');
    }
    if (input.relVol && input.relVol >= 2.5) {
        whyParts.push('거래폭발');
        whyFactors.push('VOL_EXPLOSION');
        triggerCodes.push('VOL_BOOM');
    }

    // === Regime signals ===
    if (regime.pct >= 80) {
        whyParts.push('시장 우호');
        whyFactors.push('REGIME_FAVORABLE');
    } else if (regime.pct <= 30) {
        whyParts.push('시장 약세');
        whyFactors.push('REGIME_ADVERSE');
        triggerCodes.push('REGIME_OFF');
    }

    // === Gate signals ===
    if (gates.gatesApplied.includes('EXHAUSTION')) {
        whyParts.unshift('⛔ 과열 급등 = 설거지 위험');
        triggerCodes.push('GATE_EXHAUST');
    }
    if (gates.gatesApplied.includes('FAKE_PUMP')) {
        whyParts.unshift('⚠️ 가짜상승(기관매도중)');
        triggerCodes.push('GATE_FAKE');
    }
    if (gates.gatesApplied.includes('WALL_REJECTION')) {
        whyParts.unshift('🧱 Call Wall 저항');
        triggerCodes.push('GATE_WALL');
    }
    if (gates.gatesApplied.includes('SHORT_STORM')) {
        whyParts.unshift('📉 Short 폭풍');
        triggerCodes.push('GATE_SHORT');
    }

    // === Build final WHY string ===
    let whyKR: string;
    if (whyParts.length === 0) {
        // No strong signals either way
        switch (grade) {
            case 'S':
            case 'A': whyKR = '전반적 양호. 진입 검토 적합'; break;
            case 'B': whyKR = '일부 신호 확인. 추가 관찰 필요'; break;
            case 'C': whyKR = '방향성 불명확. 관망 권장'; break;
            case 'D': whyKR = '부정적 신호 우세. 신규 진입 금지'; break;
            case 'F': whyKR = '구조 붕괴. 즉시 이탈 권고'; break;
        }
    } else {
        // Combine top signals with grade conclusion
        const signalStr = whyParts.slice(0, 4).join(' + ');
        const actionConclusion = grade === 'S' || grade === 'A' ? '= 매수적합'
            : grade === 'B' ? '= 관심종목'
                : grade === 'C' ? '= 관망'
                    : '= 주의';
        whyKR = `${signalStr} ${actionConclusion}`;
    }

    return { whyKR, whyFactors, triggerCodes };
}


// ============================================================================
// DATA COMPLETENESS — How much data do we have?
// ============================================================================

function calculateDataCompleteness(input: AlphaInput): { pct: number; label: string } {
    let available = 0;
    let total = 0;

    // Critical data (always expected)
    total += 3;
    if (input.price > 0) available++;
    if (input.prevClose > 0) available++;
    if (input.changePct !== undefined) available++;

    // Momentum data
    total += 4;
    if (input.vwap) available++;
    if (input.return3D !== null && input.return3D !== undefined) available++;
    if (input.rsi14 !== null && input.rsi14 !== undefined) available++;
    if (input.sma20 !== null && input.sma20 !== undefined) available++;  // [V3 PIPELINE]

    // Structure data
    total += 6;
    if (input.pcr !== null && input.pcr !== undefined) available++;
    if (input.gex !== null && input.gex !== undefined) available++;
    if (input.callWall) available++;
    if (input.putFloor) available++;
    if (input.squeezeScore !== null && input.squeezeScore !== undefined) available++;
    if (input.ivSkew !== null && input.ivSkew !== undefined) available++;  // [V3 PIPELINE]

    // Flow data
    total += 5;
    if (input.darkPoolPct !== null && input.darkPoolPct !== undefined) available++;
    if (input.shortVolPct !== null && input.shortVolPct !== undefined) available++;
    if (input.whaleIndex !== null && input.whaleIndex !== undefined) available++;
    if (input.relVol !== null && input.relVol !== undefined) available++;
    if (input.blockTrades !== null && input.blockTrades !== undefined) available++;

    // Regime data
    total += 3;
    if (input.ndxChangePct !== null && input.ndxChangePct !== undefined) available++;
    if (input.vixValue !== null && input.vixValue !== undefined) available++;
    if (input.tltChangePct !== null && input.tltChangePct !== undefined) available++;

    // Catalyst data
    total += 1;
    if (input.impliedMovePct !== null && input.impliedMovePct !== undefined) available++;

    const pct = Math.round((available / total) * 100);
    const label = pct >= 80 ? 'FULL' : pct >= 50 ? 'PARTIAL' : 'MINIMAL';

    return { pct, label };
}


// ============================================================================
// UTILITIES
// ============================================================================

function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

function round1(val: number): number {
    return Math.round(val * 10) / 10;
}

/**
 * Calculate Whale Index from GEX — centralized logic for all endpoints.
 * High absolute GEX = institutional involvement = higher whale score.
 * Exported for use by API endpoints.
 */
export function calculateWhaleIndex(gex: number | null | undefined): number {
    if (gex === null || gex === undefined) return 0;
    const absGex = Math.abs(gex);
    if (absGex > 50_000_000) return Math.min(90, 60 + Math.floor(absGex / 100_000));
    if (absGex > 10_000_000) return Math.min(70, 40 + Math.floor(absGex / 200_000));
    if (absGex > 1_000_000) return Math.max(10, 30 - Math.floor(absGex / 500_000));
    return 35; // Neutral baseline
}


// ============================================================================
// COMPUTATION UTILITIES — RSI14, Implied Move, etc.
// ============================================================================

/**
 * Compute RSI-14 from an array of closing prices (oldest→newest).
 * Requires at least 15 prices (14 changes). Returns null if insufficient data.
 */
export function computeRSI14(closes: number[]): number | null {
    if (!closes || closes.length < 15) return null;

    // Use the last 15 data points (14 changes)
    const recent = closes.slice(-15);
    let avgGain = 0;
    let avgLoss = 0;

    // First 14 periods — simple average
    for (let i = 1; i < recent.length; i++) {
        const change = recent[i] - recent[i - 1];
        if (change > 0) avgGain += change;
        else avgLoss += Math.abs(change);
    }
    avgGain /= 14;
    avgLoss /= 14;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return Math.round((100 - (100 / (1 + rs))) * 10) / 10;
}

/**
 * Compute Implied Move % from rawChain ATM straddle.
 * Finds the closest-to-ATM call and put, sums their last trade prices,
 * divides by underlying price → percentage.
 */
export function computeImpliedMovePct(rawChain: any[], price: number): number | null {
    if (!rawChain || rawChain.length === 0 || !price || price <= 0) return null;

    try {
        // Find nearest ATM strike
        const strikes = rawChain
            .filter((o: any) => o.details?.strike_price)
            .map((o: any) => o.details.strike_price);
        if (strikes.length === 0) return null;

        const uniqueStrikes = [...new Set(strikes)] as number[];
        uniqueStrikes.sort((a, b) => Math.abs(a - price) - Math.abs(b - price));
        const atmStrike = uniqueStrikes[0];
        if (!atmStrike) return null;

        // Find ATM call and put within $5 tolerance
        const tolerance = Math.max(5, price * 0.02); // 2% or $5
        const atmCalls = rawChain.filter((o: any) =>
            o.details?.contract_type === 'call' &&
            Math.abs((o.details?.strike_price || 0) - atmStrike) <= tolerance
        );
        const atmPuts = rawChain.filter((o: any) =>
            o.details?.contract_type === 'put' &&
            Math.abs((o.details?.strike_price || 0) - atmStrike) <= tolerance
        );

        const callPrice = atmCalls[0]?.last_trade?.price || atmCalls[0]?.day?.close || 0;
        const putPrice = atmPuts[0]?.last_trade?.price || atmPuts[0]?.day?.close || 0;

        if (callPrice > 0 && putPrice > 0) {
            return Math.round(((callPrice + putPrice) / price) * 1000) / 10; // e.g., 3.5%
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * [V3 PIPELINE] Compute IV Skew from raw options chain.
 * IV Skew = ATM Put IV / ATM Call IV.
 * - >1.15 = Heavy institutional hedging (bearish signal)
 * - 0.85-1.15 = Normal/balanced
 * - <0.85 = Call skew (speculative bullish)
 */
export function computeIVSkew(rawChain: any[], price: number): number | null {
    if (!rawChain || rawChain.length === 0 || !price || price <= 0) return null;

    try {
        const tolerance = price * 0.03; // ±3% of current price = ATM zone
        let callIVs: number[] = [];
        let putIVs: number[] = [];

        for (const c of rawChain) {
            const strike = c.details?.strike_price;
            const iv = c.implied_volatility;
            const type = c.details?.contract_type;

            if (!strike || !iv || iv <= 0) continue;
            if (Math.abs(strike - price) > tolerance) continue;

            if (type === 'call') callIVs.push(iv);
            else if (type === 'put') putIVs.push(iv);
        }

        if (callIVs.length === 0 || putIVs.length === 0) return null;

        const avgCallIV = callIVs.reduce((a, b) => a + b, 0) / callIVs.length;
        const avgPutIV = putIVs.reduce((a, b) => a + b, 0) / putIVs.length;

        if (avgCallIV <= 0) return null;

        return Math.round((avgPutIV / avgCallIV) * 100) / 100; // e.g., 1.12
    } catch {
        return null;
    }
}

// ============================================================================
// CONVENIENCE FUNCTIONS — for common use cases
// ============================================================================

/**
 * Quick alpha score from minimal data (e.g., just price + options).
 * Fills missing data with reasonable defaults.
 */
export function calculateAlphaScoreQuick(
    ticker: string,
    price: number,
    prevClose: number,
    session: AlphaSession = 'REG',
    extras?: Partial<AlphaInput>,
): AlphaResult {
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    return calculateAlphaScore({
        ticker,
        session,
        price,
        prevClose,
        changePct,
        ...extras,
    });
}

/**
 * Batch calculate alpha scores for multiple tickers.
 * Pure synchronous — no API calls. Input must be pre-fetched.
 */
export function calculateAlphaScoreBatch(inputs: AlphaInput[]): AlphaResult[] {
    return inputs.map(input => calculateAlphaScore(input));
}

/**
 * Extract the numeric grade value for sorting (S=6, A=5, ..., F=1)
 */
export function gradeToNumber(grade: AlphaGrade): number {
    const map: Record<AlphaGrade, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };
    return map[grade];
}

/**
 * Re-export V2 functions for backward compatibility
 */
export { calculateOIHeat, getGammaFlipBonus, getWallDistanceScore, getVIXTermScore, getSafeHavenScore };
