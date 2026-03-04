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

    // === MACD (Momentum Enhancement V5.5+) ===
    macdLine?: number | null;       // MACD line (12-EMA minus 26-EMA)
    macdSignal?: number | null;     // Signal line (9-EMA of MACD)
    macdHistogram?: number | null;  // MACD - Signal (positive = bullish crossover)

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
    vix3mValue?: number | null;     // [V5.5+] VIX3M for term structure analysis
    tltChangePct?: number | null;
    gldChangePct?: number | null;

    // === REGIME ENHANCEMENT (V4.5) — 24/7 reliable indicators ===
    fearGreedScore?: number | null;     // 0-100 CNN Fear & Greed
    dxy?: number | null;                // Dollar Index
    realYieldStance?: 'TIGHT' | 'NEUTRAL' | 'EASY' | null;
    rotationDirection?: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' | null;

    // === CATALYST data ===
    impliedMovePct?: number | null;
    sentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | null;
    hasEarningsSoon?: boolean;
    hasFOMCSoon?: boolean;
    eventDescription?: string | null;

    // === PRE-MARKET VALIDATION data (V3.4) ===
    preMarketPrice?: number | null;       // Pre-market 현재가
    preMarketChangePct?: number | null;   // Pre-market 변동률 (vs prevClose)

    // === SELF-CORRECTION (Track Record) ===
    historicalWinRate?: number | null;
    historicalTotalTrades?: number | null;
    historicalEntryAccuracy?: number | null;  // Entry zone trigger rate (0-100%)

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

const ENGINE_VERSION = '4.6.0';

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

// [V3.2] SESSION_CAPS REMOVED — 데이터가 같으면 점수도 같아야 합니다.
// 시간에 따른 인위적 점수 제한 없음.
// ADAPTIVE_WEIGHTS도 제거 — 모든 pillar 동일 가중치.

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

    // [V3.2] No session caps, no adaptive weights.
    // 데이터가 같으면 점수도 같아야 합니다.

    // 4a. [V3.2] Score Normalization
    let rawScore = momentum.score + structure.score + flow.score + regime.score + catalyst.score;

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

    // 4c. [V3.1 → V6.0] Self-Correction Loop (Supabase TrackRecord)
    // Adjust score based on persistent win/loss logs + entry zone accuracy
    const hWinRate = input.historicalWinRate;
    const hTotal = input.historicalTotalTrades;
    const hEntryAcc = input.historicalEntryAccuracy;
    let trackRecordAdjust = 0;

    if (hWinRate !== null && hWinRate !== undefined && hTotal && hTotal >= 1) {
        if (hWinRate >= 70) {
            trackRecordAdjust = 5; // Serial Winner Bonus
        } else if (hWinRate <= 30 && hTotal >= 2) {
            trackRecordAdjust = -10; // Serial Loser Penalty (Requires at least 2 trades)
        } else if (hWinRate <= 50 && hTotal >= 3) {
            trackRecordAdjust = -5; // Consistent Underperformer
        }

        // [V6.0] Entry Accuracy Modifier — penalize if entry zone consistently misses
        if (hEntryAcc !== null && hEntryAcc !== undefined && hTotal >= 3) {
            if (hEntryAcc < 30) {
                trackRecordAdjust -= 3; // Entry zone rarely triggered → reduce confidence
            }
        }

        rawScore += trackRecordAdjust;
    }

    // 5. Apply absolute gates
    const gatesResult = applyAbsoluteGates(rawScore, input);
    const finalScore = Math.round(Math.max(0, Math.min(100, gatesResult.adjustedScore)));


    // 6. Determine grade and action
    const grade = determineGrade(finalScore);
    const { action, actionKR } = determineAction(grade, input);

    // 7. Build WHY explanation
    const explanation = buildExplanation(
        input, momentum, structure, flow, regime, catalyst, gatesResult, grade
    );
    let whyKR = explanation.whyKR;
    const whyFactors = [...explanation.whyFactors];
    const triggerCodes = [...explanation.triggerCodes];

    if (trackRecordAdjust > 0) {
        whyKR += ' [⭐연승보너스]';
        whyFactors.push('SERIAL_WINNER');
        triggerCodes.push('SERIAL_WINNER');
    } else if (trackRecordAdjust < 0) {
        whyKR += ' [⚠️연패페널티]';
        whyFactors.push('SERIAL_LOSER');
        triggerCodes.push('SERIAL_LOSER');
    }

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
            momentum,
            structure,
            flow,
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

    // Factor 1: Price Change (0-8) — [V3.3.1] Recalibrated
    const changePct = input.changePct || 0;
    let changeScore: number;
    // [V4.5] Sweet spot 3-8% = max. Above 8% = diminishing (chase risk)
    if (changePct >= 3 && changePct <= 8) changeScore = 8;  // Sweet spot
    else if (changePct > 8 && changePct <= 15) changeScore = 6; // Overheated
    else if (changePct > 15) changeScore = 3;                // Surge = chase risk
    else if (changePct >= 2) changeScore = 7;
    else if (changePct >= 1) changeScore = 5;
    else if (changePct >= 0.5) changeScore = 4;
    else if (changePct >= 0) changeScore = changePct * 6; // 0-3 linear
    else if (changePct >= -1) changeScore = 1;   // Small dip = minimal
    else changeScore = 0;
    changeScore = clamp(changeScore, 0, 8);
    factors.push({ name: 'priceChange', value: round1(changeScore), max: 8, detail: `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%` });
    total += changeScore;

    // Factor 2: VWAP Position (0-5) — [V3.3.1] Improved no-data proxy
    let vwapScore = 0;
    if (input.vwap && input.vwap > 0 && input.price > 0) {
        const vwapDist = ((input.price - input.vwap) / input.vwap) * 100;
        if (vwapDist > 2) vwapScore = 5;
        else if (vwapDist > 0.5) vwapScore = 4;
        else if (vwapDist > -0.5) vwapScore = 3;
        else if (vwapDist > -2) vwapScore = 1;
        else vwapScore = 0;
        factors.push({ name: 'vwapPosition', value: round1(vwapScore), max: 5, detail: `VWAP거리 ${vwapDist >= 0 ? '+' : ''}${vwapDist.toFixed(1)}%` });
    } else {
        // [V4.5] No VWAP → conservative estimate (was 3-4, now 2)
        vwapScore = changePct > 1 ? 3 : changePct > 0 ? 2 : 1;
        factors.push({ name: 'vwapPosition', value: round1(vwapScore), max: 5, detail: 'VWAP 없음(추정)' });
    }
    total += vwapScore;

    // Factor 3: 3-Day Trend (0-7) — [V3.3.1] Recalibrated
    let trendScore = 0;
    const return3D = input.return3D;
    if (return3D !== null && return3D !== undefined) {
        if (return3D >= 5) trendScore = 7;
        else if (return3D >= 3) trendScore = 6;
        else if (return3D >= 2) trendScore = 5;
        else if (return3D >= 1) trendScore = 4;
        else if (return3D >= 0) trendScore = 3;  // Flat = neutral-positive
        else if (return3D >= -1) trendScore = 2;
        else if (return3D >= -3) trendScore = 1;
        else trendScore = 0;
        factors.push({ name: 'trend3D', value: round1(trendScore), max: 7, detail: `3일수익률 ${return3D >= 0 ? '+' : ''}${return3D.toFixed(1)}%` });
    } else {
        trendScore = changePct > 0 ? Math.min(5, changePct * 2 + 2) : 2;
        factors.push({ name: 'trend3D', value: round1(trendScore), max: 7, detail: '3일 데이터 없음(추정)' });
    }
    total += trendScore;

    // Factor 4: Trend Confirmation (0-5) — [V3.3.1] Replaces SmartDIP
    // Positive momentum + institutional support = confirmation bonus
    // Negative momentum + institutional buying = reversal signal
    let confirmScore = 0;
    const netFlowM = input.netFlow || 0;
    const whaleIdxM = input.whaleIndex || 0;
    const darkPoolM = input.darkPoolPct || 0;

    if (changePct >= 1 && (netFlowM > 0 || whaleIdxM >= 40 || darkPoolM >= 35)) {
        // Strong: positive momentum + institutional confirmation
        confirmScore = 5;
        factors.push({ name: 'trendConfirm', value: 5, max: 5, detail: '가격↑ + 기관확인' });
    } else if (changePct >= 0.5) {
        confirmScore = 3;
        factors.push({ name: 'trendConfirm', value: 3, max: 5, detail: '양호한 상승' });
    } else if (changePct < -0.5 && (netFlowM > 1000000 || whaleIdxM >= 70)) {
        confirmScore = 5; // Smart DIP
        factors.push({ name: 'trendConfirm', value: 5, max: 5, detail: '가격↓ + 기관매수↑ = 반등신호' });
    } else if (changePct < -0.5 && (netFlowM > 0 || whaleIdxM >= 50)) {
        confirmScore = 3;
        factors.push({ name: 'trendConfirm', value: 3, max: 5, detail: '가격↓ + 소규모 매집' });
    } else if (changePct >= 0) {
        confirmScore = 2; // Neutral positive
        factors.push({ name: 'trendConfirm', value: 2, max: 5, detail: '횡보/소폭 양' });
    } else {
        confirmScore = 0;
        factors.push({ name: 'trendConfirm', value: 0, max: 5, detail: '하락 + 매집 없음' });
    }
    total += confirmScore;

    // Factor 5: [V3.3] Momentum Acceleration (0-5)
    // 가속 중인 상승 = 강한 추세, 감속 = 정점 근처
    let accelScore = 0;
    const return3DVal = input.return3D ?? null;
    if (return3DVal !== null && return3DVal !== undefined) {
        const dailyAvg3D = return3DVal / 3; // 3일 평균 일일 수익률
        const todayPace = changePct;       // 오늘 수익률
        const acceleration = todayPace - dailyAvg3D;

        if (acceleration > 2) {
            accelScore = 5;  // 강한 가속
            factors.push({ name: 'acceleration', value: 5, max: 5, detail: `가속 +${acceleration.toFixed(1)}%p` });
        } else if (acceleration > 1) {
            accelScore = 3;
            factors.push({ name: 'acceleration', value: 3, max: 5, detail: `가속 +${acceleration.toFixed(1)}%p` });
        } else if (acceleration > -0.5) {
            accelScore = 1;  // 등속 유지
            factors.push({ name: 'acceleration', value: 1, max: 5, detail: `등속` });
        } else {
            accelScore = 0;  // 감속 — 정점 가능성
            factors.push({ name: 'acceleration', value: 0, max: 5, detail: `감속 ${acceleration.toFixed(1)}%p` });
        }
    } else {
        factors.push({ name: 'acceleration', value: 0, max: 5, detail: '3D 데이터 없음' });
    }
    total += accelScore;

    // Factor 6: [V3.3] Late Momentum Penalty (0 to -5)
    // RSI + 3D수익률 + relVol 교차 분석으로 과열 vs 지속 판단
    let latePenalty = 0;
    const rsiVal = input.rsi14 ?? 50;
    const rvVal = input.relVol ?? 1;
    if (return3DVal !== null && return3DVal > 8 && rsiVal > 70) {
        if (rvVal < 1.0) {
            // 3D +8%이상 + RSI 70+ + 거래량 감소 = 과열 후 이탈
            latePenalty = -5;
            factors.push({ name: 'lateMomentum', value: -5, max: 0, detail: '과열+거래량감소 = 이탈 경고' });
        } else if (rvVal >= 1.5) {
            // RSI 높지만 거래량 아직 증가 = 기관 아직 참여 중
            latePenalty = -1;
            factors.push({ name: 'lateMomentum', value: -1, max: 0, detail: 'RSI높음+기관참여 유지' });
        } else {
            latePenalty = -3;
            factors.push({ name: 'lateMomentum', value: -3, max: 0, detail: '과열 주의' });
        }
    } else {
        factors.push({ name: 'lateMomentum', value: 0, max: 0, detail: '해당없음' });
    }
    total += latePenalty;

    // Factor 7: [V3.4] Pre-Market Validation (-5 to +5)
    // 직전장 방향 vs Pre-market 방향 교차 검증
    // Pre-market이 같은 방향 → 확인 보너스, 역행 → 감점
    let preMarketScore = 0;
    const pmChg = input.preMarketChangePct;
    if (pmChg !== null && pmChg !== undefined) {
        const prevDir = input.changePct; // 직전장 방향
        const sameDirection = (prevDir >= 0 && pmChg >= 0) || (prevDir < 0 && pmChg < 0);

        if (sameDirection) {
            // 같은 방향 = 확인
            const pmAbs = Math.abs(pmChg);
            if (pmAbs >= 3) preMarketScore = 5;      // 강한 확인
            else if (pmAbs >= 1.5) preMarketScore = 4;
            else if (pmAbs >= 0.5) preMarketScore = 3;
            else preMarketScore = 2;                  // 약한 확인
            factors.push({
                name: 'preMarketValidation', value: preMarketScore, max: 5,
                detail: `PM ${pmChg >= 0 ? '+' : ''}${pmChg.toFixed(1)}% 확인`
            });
        } else {
            // 반대 방향 = 역행
            const pmAbs = Math.abs(pmChg);
            if (pmAbs >= 3) preMarketScore = -5;      // 강한 역행 — 위험
            else if (pmAbs >= 1.5) preMarketScore = -3;
            else if (pmAbs >= 0.5) preMarketScore = -1;
            else preMarketScore = 0;                   // 미세 역행 — 무시
            factors.push({
                name: 'preMarketValidation', value: preMarketScore, max: 5,
                detail: `PM ${pmChg >= 0 ? '+' : ''}${pmChg.toFixed(1)}% 역행${pmAbs >= 1.5 ? ' ⚠' : ''}`
            });
        }
    } else {
        // Pre-market 데이터 없음 (본장/폐장) → 배점에서 완전 제외 (max:0)
        factors.push({ name: 'preMarketValidation', value: 0, max: 0, detail: '해당없음' });
    }
    total += preMarketScore;

    // Factor 8: [V5.5+] MACD Trend Crossover (−2 to +3)
    // MACD histogram > 0 = 골든크로스 (상승 초반), < 0 = 데드크로스 (하락 전환)
    // RSI만으로는 잡지 못하는 "추세의 위치"를 판단하는 핵심 팩터
    let macdScore = 0;
    const macdHist = input.macdHistogram;
    if (macdHist !== null && macdHist !== undefined) {
        if (macdHist > 0.5) {
            // 강한 골든크로스 — 상승 추세 초중반
            macdScore = 3;
            factors.push({ name: 'macdCross', value: 3, max: 3, detail: `MACD+ ${macdHist.toFixed(2)} 골든크로스` });
        } else if (macdHist > 0) {
            // 약한 골든크로스 — 추세 전환 시작
            macdScore = 2;
            factors.push({ name: 'macdCross', value: 2, max: 3, detail: `MACD+ ${macdHist.toFixed(2)} 전환중` });
        } else if (macdHist > -0.3) {
            // 약한 데드크로스 — 경고
            macdScore = 0;
            factors.push({ name: 'macdCross', value: 0, max: 3, detail: `MACD- ${macdHist.toFixed(2)} 주의` });
        } else {
            // 강한 데드크로스 — 하락 추세 확인
            macdScore = -2;
            factors.push({ name: 'macdCross', value: -2, max: 3, detail: `MACD- ${macdHist.toFixed(2)} 데드크로스⚠` });
        }
    } else {
        factors.push({ name: 'macdCross', value: 0, max: 0, detail: 'MACD 없음' });
    }
    total += macdScore;

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
        // [V4.5] No options data → low baseline (data absence = uncertainty, not neutral)
        factors.push({ name: 'optionsData', value: 0, max: 25, detail: '옵션 데이터 없음' });
        return {
            score: 8, // [V4.5] Reduced from 13 → 8 (uncertainty penalty, not zero)
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

    // [V5 Weekly] GEX direction — thresholds calibrated for WEEKLY EXPIRY scale (÷10 from V4.6)
    // Weekly-only GEX is 10-50x smaller than all-chain GEX
    // Discovery 종목 GEX range: -3K ~ -83K → weekly: -300 ~ -8K
    const gex = input.gex || 0;
    let gexDirectionBonus = 0;
    if (gex > 50000) gexDirectionBonus = 2;        // Strong positive GEX — dealer support
    else if (gex > 0) gexDirectionBonus = 1;        // Positive GEX — mild support
    else if (gex < -5000) gexDirectionBonus = 2;    // [V5 Weekly] Negative GEX = price amplification (3-day catalyst)
    else if (gex < -1000) gexDirectionBonus = 1;    // [V5 Weekly] Moderate negative = amplification potential
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

    // Factor 4: PCR Balance (0-5) — [V3.3.1] Recalibrated
    let pcrScore = 0;
    const pcr = input.pcr || 1;
    if (pcr < 0.5) pcrScore = 5;
    else if (pcr < 0.7) pcrScore = 4;
    else if (pcr < 0.85) pcrScore = 4;  // Mild call dominance = good
    else if (pcr < 1.1) pcrScore = 3;   // Neutral = healthy (was 2)
    else if (pcr < 1.3) pcrScore = 1;
    else pcrScore = 0;
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
        squeezeScore = 2; // [V3.3.1] Neutral fallback (was 1)
        factors.push({ name: 'squeezePotential', value: 2, max: 5, detail: '스퀴즈 데이터 없음' });
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

    // Factor 1: Dark Pool % (0-7) — [V3.3.1] Recalibrated
    let darkPoolScore = 0;
    const dp = input.darkPoolPct;
    if (dp !== null && dp !== undefined) {
        if (dp >= 50) darkPoolScore = 7;
        else if (dp >= 40) darkPoolScore = 6;
        else if (dp >= 30) darkPoolScore = 5;  // 30% = significant (was 3)
        else if (dp >= 20) darkPoolScore = 3;
        else if (dp >= 10) darkPoolScore = 2;
        else darkPoolScore = 1;
        factors.push({ name: 'darkPool', value: round1(darkPoolScore), max: 7, detail: `Dark Pool ${dp.toFixed(1)}%` });
    } else {
        darkPoolScore = 2; // [V4.5] Reduced from 3 → 2 (no data = uncertain, not neutral)
        factors.push({ name: 'darkPool', value: 2, max: 7, detail: 'Dark Pool 데이터 없음' });
    }
    total += darkPoolScore;

    // Factor 2: Whale Index (0-6) — [V4.6] 3일 수익 관점: 기관 대형 매수 감지
    let whaleScore = 0;
    const wi = input.whaleIndex;
    if (wi !== null && wi !== undefined && wi > 0) {
        if (wi >= 70) whaleScore = 6;
        else if (wi >= 55) whaleScore = 5;
        else if (wi >= 40) whaleScore = 4;
        else if (wi >= 25) whaleScore = 3;
        else whaleScore = 2;
        factors.push({ name: 'whaleIndex', value: round1(whaleScore), max: 6, detail: `Whale ${wi.toFixed(0)}` });
    } else {
        // [V4.6] GEX 기반 whaleIndex=0일 때 netFlow+blockTrades로 기관 활동 추정
        // 3일 수익 관점: 대형 자금 유입 = 가격 지지 + 상승 지속
        const nf = input.netFlow || 0;
        const bt = input.blockTrades || 0;
        if (nf > 5_000_000 && bt >= 5) { whaleScore = 5; factors.push({ name: 'whaleIndex', value: 5, max: 6, detail: `대량유입 $${(nf / 1e6).toFixed(1)}M+블록${bt}건` }); }
        else if (nf > 1_000_000 || bt >= 5) { whaleScore = 4; factors.push({ name: 'whaleIndex', value: 4, max: 6, detail: `기관활동 $${(nf / 1e6).toFixed(1)}M/블록${bt}건` }); }
        else if (nf > 100_000 || bt >= 3) { whaleScore = 3; factors.push({ name: 'whaleIndex', value: 3, max: 6, detail: `소규모유입 $${(nf / 1e3).toFixed(0)}K` }); }
        else { whaleScore = 2; factors.push({ name: 'whaleIndex', value: 2, max: 6, detail: '기관활동 미감지' }); }
    }
    total += whaleScore;

    // Factor 3: Relative Volume (0-5) — [V3.3.1] Recalibrated
    let relVolScore = 0;
    const rv = input.relVol;
    if (rv !== null && rv !== undefined) {
        if (rv >= 2.5) relVolScore = 5;
        else if (rv >= 1.8) relVolScore = 4;
        else if (rv >= 1.2) relVolScore = 3;
        else if (rv >= 0.8) relVolScore = 3;  // Normal volume = good (was 2)
        else if (rv >= 0.5) relVolScore = 2;
        else relVolScore = 1;
        factors.push({ name: 'relativeVol', value: round1(relVolScore), max: 5, detail: `RelVol ${rv.toFixed(1)}x` });
    } else {
        relVolScore = 2; // [V4.5] Reduced from 3 → 2
        factors.push({ name: 'relativeVol', value: 2, max: 5, detail: 'RelVol 데이터 없음' });
    }
    total += relVolScore;

    // Factor 4: Short Volume × Direction (0-4) — [V4.6] 3일 수익 관점
    // 상승중 + 高ShortVol = 숏커버 연료 (3일 추가 상승 가능)
    // 하락중 + 高ShortVol = 숏이 이기는 중 (3일 추가 하락 위험)
    let shortVolScore = 0;
    const sv = input.shortVolPct;
    const chgForSV = input.changePct || 0;
    if (sv !== null && sv !== undefined) {
        if (chgForSV >= 1) {
            // 상승 중 — 高SV = 숏커버 연료 (3일 추가 상승)
            if (sv >= 50) { shortVolScore = 4; factors.push({ name: 'shortVolume', value: 4, max: 4, detail: `SV ${sv.toFixed(0)}%+상승→숏커버연료🔥` }); }
            else if (sv >= 35) { shortVolScore = 3; factors.push({ name: 'shortVolume', value: 3, max: 4, detail: `SV ${sv.toFixed(0)}%+상승→커버잠재` }); }
            else { shortVolScore = 2; factors.push({ name: 'shortVolume', value: 2, max: 4, detail: `SV ${sv.toFixed(0)}% 보통` }); }
        } else if (chgForSV <= -1) {
            // 하락 중 — 高SV = 숏이 이기는 중
            if (sv >= 50) { shortVolScore = 0; factors.push({ name: 'shortVolume', value: 0, max: 4, detail: `SV ${sv.toFixed(0)}%+하락→숏우위⚠` }); }
            else if (sv >= 35) { shortVolScore = 1; factors.push({ name: 'shortVolume', value: 1, max: 4, detail: `SV ${sv.toFixed(0)}%+하락` }); }
            else { shortVolScore = 2; factors.push({ name: 'shortVolume', value: 2, max: 4, detail: `SV ${sv.toFixed(0)}% 보통` }); }
        } else {
            shortVolScore = 2;
            factors.push({ name: 'shortVolume', value: 2, max: 4, detail: `SV ${sv.toFixed(0)}% 횡보` });
        }
    } else {
        shortVolScore = 2;
        factors.push({ name: 'shortVolume', value: 2, max: 4, detail: 'SV 데이터 없음' });
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

    // Factor 1: NDX/Market Trend (0-5) — [V3.3.1] Recalibrated
    let ndxScore = 0;
    const ndx = input.ndxChangePct;
    if (ndx !== null && ndx !== undefined) {
        if (ndx >= 0.8) ndxScore = 5;
        else if (ndx >= 0.3) ndxScore = 4;
        else if (ndx >= -0.3) ndxScore = 3;  // Flat market = normal (narrowed range)
        else if (ndx >= -0.8) ndxScore = 2;
        else if (ndx >= -1.5) ndxScore = 1;
        else ndxScore = 0;
        factors.push({ name: 'ndxTrend', value: round1(ndxScore), max: 5, detail: `NDX ${ndx >= 0 ? '+' : ''}${ndx.toFixed(1)}%` });
    } else {
        ndxScore = 3;
        factors.push({ name: 'ndxTrend', value: 3, max: 5, detail: 'NDX 데이터 없음' });
    }
    total += ndxScore;

    // Factor 2: VIX Level & Direction (0-5) — [V3.3.1] Recalibrated
    let vixScore = 0;
    const vix = input.vixValue;
    const vixChg = input.vixChangePct;

    if (vix !== null && vix !== undefined) {
        if (vix < 14) vixScore = 5;
        else if (vix < 18) vixScore = 4;
        else if (vix < 22) vixScore = 3;  // Normal range widened (was <20)
        else if (vix < 27) vixScore = 2;
        else if (vix < 32) vixScore = 1;
        else vixScore = 0;

        if (vixChg !== null && vixChg !== undefined) {
            if (vixChg < -5) vixScore = Math.min(5, vixScore + 1);
            else if (vixChg > 10) vixScore = Math.max(0, vixScore - 1);
        }

        factors.push({ name: 'vixLevel', value: round1(vixScore), max: 5, detail: `VIX ${vix.toFixed(1)}` });
    } else {
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

    // [V4.5] Factor 4: Fear & Greed Index (±2 bonus/penalty) — 24/7 reliable
    const fg = input.fearGreedScore;
    if (fg !== null && fg !== undefined) {
        let fgBonus = 0;
        if (fg >= 70) { fgBonus = 2; }       // Greed = bullish confirmation
        else if (fg >= 50) { fgBonus = 1; }   // Neutral-bullish
        else if (fg <= 25) { fgBonus = -2; }  // Extreme Fear
        else if (fg <= 40) { fgBonus = -1; }  // Fear
        total += fgBonus;
        factors.push({ name: 'fearGreed', value: fgBonus, max: 2, detail: `F&G ${fg.toFixed(0)}` });
    }

    // [V4.5] Factor 5: DXY Dollar Strength (±1) — 24/7 reliable (FX market)
    const dxy = input.dxy;
    if (dxy !== null && dxy !== undefined) {
        let dxyBonus = 0;
        if (dxy > 105) { dxyBonus = -1; }       // Strong dollar = equity headwind
        else if (dxy < 100) { dxyBonus = 1; }  // Weak dollar = equity tailwind
        total += dxyBonus;
        factors.push({ name: 'dxyStrength', value: dxyBonus, max: 1, detail: `DXY ${dxy.toFixed(1)}` });
    }

    // [V4.5] Factor 6: Real Yield Stance (±1) — 24/7 reliable (bond market)
    if (input.realYieldStance) {
        let yieldBonus = 0;
        if (input.realYieldStance === 'EASY') { yieldBonus = 1; }
        else if (input.realYieldStance === 'TIGHT') { yieldBonus = -1; }
        total += yieldBonus;
        factors.push({ name: 'realYield', value: yieldBonus, max: 1, detail: `금리 ${input.realYieldStance}` });
    }

    // [V5.5+] Factor 7: VIX Term Structure (−2 to +1)
    // VIX/VIX3M 비율로 "진짜 공포 vs 일시적 불안" 구분
    // Backwardation (VIX > VIX3M) = 임박한 위험 → 추천 점수 전체 하향
    // Contango (VIX < VIX3M) = 정상 시장 → 소폭 보너스
    const vix3m = input.vix3mValue;
    if (vix !== null && vix !== undefined && vix > 0 &&
        vix3m !== null && vix3m !== undefined && vix3m > 0) {
        const termRatio = vix / vix3m;
        let termBonus = 0;
        if (termRatio > 1.05) {
            // 백워데이션: VIX > VIX3M 5%이상 → 진짜 패닉 (시장 임박 위험 인식)
            termBonus = -2;
            factors.push({ name: 'vixTerm', value: -2, max: 1, detail: `VIX/VIX3M ${termRatio.toFixed(2)} 백워데이션⚠` });
        } else if (termRatio > 0.95) {
            // Flat: 거의 같음 → 불확실
            termBonus = 0;
            factors.push({ name: 'vixTerm', value: 0, max: 1, detail: `VIX/VIX3M ${termRatio.toFixed(2)} 중립` });
        } else {
            // 콘탱고: VIX < VIX3M → 정상 시장
            termBonus = 1;
            factors.push({ name: 'vixTerm', value: 1, max: 1, detail: `VIX/VIX3M ${termRatio.toFixed(2)} 콘탱고(안정)` });
        }
        total += termBonus;
    }

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

    // Factor 2: Sentiment (0-3) — [V3.3.1] Neutral = 2 (was 1)
    let sentimentScore = 0;
    if (input.sentiment === 'POSITIVE') sentimentScore = 3;
    else if (input.sentiment === 'NEUTRAL') sentimentScore = 2;
    else if (input.sentiment === 'NEGATIVE') sentimentScore = 0;
    else sentimentScore = 2; // Default neutral = 2 (was 1)
    factors.push({ name: 'sentiment', value: round1(sentimentScore), max: 3, detail: input.sentiment || 'N/A' });
    total += sentimentScore;

    // Factor 3: Event Gate (-4 to +2) — [V3.3.1] No event = safety bonus
    let eventScore = 0;
    if (input.hasEarningsSoon) {
        eventScore = -4;
        factors.push({ name: 'eventGate', value: -4, max: 2, detail: `실적발표 임박${input.eventDescription ? ': ' + input.eventDescription : ''}` });
    } else if (input.hasFOMCSoon) {
        eventScore = -3;
        factors.push({ name: 'eventGate', value: -3, max: 2, detail: 'FOMC 임박' });
    } else {
        eventScore = 2; // [V3.3.1] No major event = stability = +2
        factors.push({ name: 'eventGate', value: 2, max: 2, detail: '이벤트 없음 = 안정' });
    }
    total += eventScore;

    // Factor 4: Continuation (0-3) — [V4.6] 3일 수익 관점: 모멘텀 지속 확인
    let contScore = 0;
    if (input.wasInPrevReport) {
        // [V4.6] 이전 리포트 + 상승 지속 = 모멘텀 연속 (3일 수익 확률 높음)
        const chgCont = input.changePct || 0;
        if (chgCont >= 1) { contScore = 3; factors.push({ name: 'continuation', value: 3, max: 3, detail: '연속상승 유지🔥' }); }
        else if (chgCont >= 0) { contScore = 2; factors.push({ name: 'continuation', value: 2, max: 3, detail: '전일 유지(횡보)' }); }
        else { contScore = 1; factors.push({ name: 'continuation', value: 1, max: 3, detail: '전일 유지(하락전환)' }); }
    } else {
        contScore = 1;
        factors.push({ name: 'continuation', value: 1, max: 3, detail: '신규' });
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

    // [V4.6] Gate 1: EXHAUSTION — 진짜 끝난 급등만 캡
    // 3일 철학: 이미 터진 종목 추격 ❌, 달리는 말 올라타기 ✅
    const rsi = input.rsi14 ?? null;
    const changePct = input.changePct || 0;
    const relVol = input.relVol || 1;
    const netFlowG = input.netFlow ?? 0;
    const hasFuel = relVol >= 1.5 || netFlowG > 500000 || (input.shortVolPct ?? 0) >= 40;

    if (changePct >= 20) {
        // 하루 20%+: 연료 확인 — 기관매집+볼륨이면 달리는 말, 아니면 끝난 폭죽
        if (hasFuel && netFlowG > 0) {
            // 기관이 아직 사고 있다 → 3일 추가 상승 가능, 캡하지 않음
            score = Math.min(score, 85); // 약한 캡만 (무한 점수 방지)
            gatesApplied.push('SURGE_WITH_FUEL');
        } else {
            // 볼륨 죽고 기관 매도 중 → 끝난 급등
            score = Math.min(score, 30);
            gatesApplied.push('EXHAUSTION');
        }
    }

    // [V4.6] Gate 1.5: SURGE 판단 — 달리는 말 vs 추격매수
    if (changePct >= 10 && changePct < 20) {
        const return3D = input.return3D ?? 0;
        const isMultiDayTrend = return3D > 0 && changePct < return3D * 0.7; // 오늘이 3일 흐름의 일부

        if (isMultiDayTrend && hasFuel) {
            // 달리는 말 — 3일째 모멘텀 지속 중 + 연료 있음 → 보너스
            score = score + 3;
            gatesApplied.push('MOMENTUM_RIDE');
        } else if (!hasFuel && netFlowG < 0) {
            // 볼륨 없고 기관 매도 → 추격매수 위험
            score = Math.min(score, 55);
            gatesApplied.push('CHASE_RISK');
        }
        // 그 외: 판단 유보, 감점 없음
    } else if (changePct >= 5 && changePct < 10) {
        // 5-10% 상승: 이건 정상적인 모멘텀 구간 — 감점 없음, 연료 있으면 가산
        if (hasFuel && (input.shortVolPct ?? 0) >= 40) {
            score = score + 2; // 숏커버 연료 + 적당한 상승 = 3일 급변 구간
            gatesApplied.push('SQUEEZE_BUILDING');
        }
    }

    // [V4.6] RSI null + big move: RSI 없으면 판단 불가 → 가벼운 보류만
    if (rsi === null && changePct >= 12) {
        score = Math.min(score, 75); // 12%+ 인데 RSI 확인 불가 → 느슨한 캡
        gatesApplied.push('NO_RSI_CAUTION');
    }

    // Gate 2: FAKE PUMP — [V3.3] 다차원 교차 검증
    // 단순히 price up + flow 음수가 아니라, darkPool/블록매매까지 확인
    const netFlow = input.netFlow || 0;
    const gex = input.gex || 0;
    const darkPoolPct = input.darkPoolPct ?? null;
    const blockTrades = input.blockTrades ?? 0;
    if (changePct > 5 && netFlow < -100000 && gex < 0) {
        // 진짜 가짜 펌프: 모든 기관 시그널이 매도 방향
        if (darkPoolPct !== null && darkPoolPct < 30 && blockTrades <= 1) {
            // darkPool 낮음 + 블록매매 없음 → 확실한 가짜 펌프
            score = Math.min(score, 45);
            gatesApplied.push('FAKE_PUMP');
        } else if (darkPoolPct !== null && darkPoolPct >= 40) {
            // darkPool 높음 → 기관이 포지션 전환 중일 수 있음, 약한 감점만
            score = score - 3;
            gatesApplied.push('FLOW_DIVERGENCE');
        } else {
            // 애매한 경우 → 경미한 감점
            score = score - 3;
            gatesApplied.push('FLOW_DIVERGENCE');
        }
    }

    // Gate 3: CALL WALL CONTEXT — [V3.3] 돌파 vs 저항 교차 분석
    // "근처니까 탈락"이 아니라 GEX/Flow/Volume으로 방향 판단
    if (input.callWall && input.callWall > 0 && input.price > 0) {
        const wallDist = (input.callWall - input.price) / input.price;

        if (wallDist > -0.02 && wallDist < 0.03) {
            // Call Wall ±2~3% 범위 내
            const isBreakout = input.price > input.callWall; // 이미 돌파
            const hasVolume = relVol >= 1.5;
            const bullishFlow = netFlow > 0 || (darkPoolPct !== null && darkPoolPct >= 40);
            const negativeGex = gex < 0; // 감마스퀴즈 잠재력

            if (isBreakout && hasVolume && negativeGex) {
                // 감마 스퀴즈 돌파 — 보너스
                score = score + 5;
                gatesApplied.push('GAMMA_BREAKOUT');
            } else if (isBreakout && bullishFlow) {
                // 돌파 + 기관 매수 — 약한 보너스
                score = score + 3;
                gatesApplied.push('WALL_BREAKOUT');
            } else if (!isBreakout && !hasVolume && netFlow < 0) {
                // 접근 중 + 거래량 약함 + 기관 매도 → 저항 확인
                score = score - 3;
                gatesApplied.push('WALL_RESISTANCE');
            }
            // 그 외: 아무 조치 없음 (판단 유보)
        }
    }

    // Gate 4: SHORT ANALYSIS — [V3.3] 숏커버/스퀴즈 교차 판단
    // 높은 공매도 = 위험이 아니라, 방향에 따라 기회일 수 있음
    const shortVol = input.shortVolPct;
    let shortSqueezeApplied = false; // [V4.5] Track to prevent Gate 7 double-counting
    if (shortVol !== null && shortVol !== undefined && shortVol >= 55) {
        const squeezeVal = input.squeezeScore ?? 0;

        if (changePct > 0 && relVol >= 1.5 && squeezeVal >= 50) {
            // 숏커버 랠리 + 스퀴즈 조건 → 오히려 보너스
            score = score + 5;
            gatesApplied.push('SHORT_SQUEEZE_MOMENTUM');
            shortSqueezeApplied = true; // [V4.5] Mark to skip Gate 7
        } else if (changePct > 0 && relVol >= 1.2) {
            // 가격 상승 중 + 거래량 증가 → 숏커버 진행, 감점 안 함
            gatesApplied.push('SHORT_COVER_ACTIVE');
        } else if (changePct < -2 && netFlow < 0) {
            // 진짜 위험: 가격 하락 + 기관 매도 + 공매도 높음
            score = score - 8;
            gatesApplied.push('SHORT_STORM');
        } else {
            // [V4.6] 방향 불분명 — FLOW pillar에서 이미 방향별 점수 처리됨
            // 이중 감점 방지를 위해 gate 감점 제거, 태그만 유지
            gatesApplied.push('SHORT_NOTED');
        }
    }

    // [V4.6] Gate 5: RSI — 3일 모멘텀 관점
    // 장기투자: RSI 70 = 과매수 = 위험. 3일 트레이딩: RSI 70 = 모멘텀 살아있음 = 기회
    // "달리는 말" — RSI가 높다는 건 지금 힘이 있다는 뜻
    const ndx = input.ndxChangePct ?? 0;
    if (rsi !== null) {
        if (rsi >= 85 && changePct >= 15) {
            // RSI 극단 + 이미 대폭등 → 진짜 끝물, 3일 내 반락 확률 높음
            score = Math.min(score, 60);
            gatesApplied.push('RSI_BLOW_OFF');
        } else if (rsi >= 70 && rsi < 85 && hasFuel) {
            // RSI 70-85 + 연료 있음 = 달리는 말 → 감점 없음, 오히려 모멘텀 확인
            score = score + 2;
            gatesApplied.push('RSI_MOMENTUM_ALIVE');
        } else if (rsi <= 30 && changePct > 0 && hasFuel) {
            // RSI 과매도 + 반등 시작 + 연료 → 3일 반등 셋업
            score = score + 3;
            gatesApplied.push('RSI_BOUNCE_SETUP');
        }
        // RSI 30-70: 정상 범위 → gate 개입 없음

        // [V4.6] Risk-off 장세에서만 강한 캡 (시장 전체가 빠지는데 혼자 오르면 위험)
        if (ndx <= -1.5 && rsi >= 75 && changePct >= 8) {
            score = Math.min(score, 55);
            gatesApplied.push('RISKOFF_DIVERGENCE');
        }
    }

    // Gate 6: DEAD VOLUME — relVol very low indicates no interest
    if (relVol < 0.3 && input.session === 'REG') {
        score = Math.min(score, 50);
        gatesApplied.push('DEAD_VOLUME');
    }

    // Gate 7: SHORT SQUEEZE READY — [V4.5] Only if Gate 4 didn't already apply squeeze bonus
    if (!shortSqueezeApplied && shortVol !== null && shortVol !== undefined && shortVol >= 45) {
        const squeezeVal = input.squeezeScore ?? 0;
        if (squeezeVal >= 60 && changePct > 0 && relVol >= 1.5) {
            score = score + 8;
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

    // [V4.5] Gate 10: RISK_OFF_ROTATION — capital rotating to defense sectors
    if (input.rotationDirection === 'RISK_OFF') {
        score = Math.min(score, 65);
        gatesApplied.push('RISK_OFF_ROTATION');
    }

    // ================================================================
    // [V5] Gate 11: PM VERIFICATION — Phase 2 검증 레이어
    // 기본분석(직전장) 결과를 PM 실시간 데이터로 확인/부정
    // 철학: 분석은 직전장, 검증은 PM, 최종 확정은 둘의 조합
    // ================================================================
    const pmChg = input.preMarketChangePct;
    if (pmChg !== null && pmChg !== undefined) {
        const baseDir = changePct >= 0 ? 1 : -1; // 직전장 방향
        const pmDir = pmChg >= 0 ? 1 : -1;       // PM 방향
        const pmAbs = Math.abs(pmChg);
        const sameDir = baseDir === pmDir;

        if (sameDir && pmAbs >= 3 && pmAbs < 15) {
            // PM 3-15%: 직전장과 같은 방향으로 적정 갭 → 강한 확인
            score = score + 5;
            gatesApplied.push('PM_CONFIRM');
        } else if (sameDir && pmAbs >= 1 && pmAbs < 3) {
            // PM 1-3%: 약한 확인
            score = score + 3;
            gatesApplied.push('PM_SOFT_CONFIRM');
        } else if (sameDir && pmAbs >= 15 && pmAbs < 20) {
            // PM 15-20%: 확인되지만 갭 부담 있음
            score = score + 2;
            gatesApplied.push('PM_MILD_CONFIRM');
        } else if (sameDir && pmAbs >= 20) {
            // PM 20%+: Gap Trap 위험 — Sell the News
            // 보너스 없음 + 경고 태그
            gatesApplied.push('EXTREME_GAP_RISK');
        } else if (!sameDir && pmAbs >= 3) {
            // PM이 직전장 반대 방향으로 3%+ → 기본분석 부정
            score = Math.min(score, 55);
            gatesApplied.push('PM_REJECT');
        } else if (!sameDir && pmAbs >= 1) {
            // PM이 반대 방향 1-3% → 약한 부정, 가벼운 감점
            score = score - 3;
            gatesApplied.push('PM_DIVERGE');
        }
        // PM < 1%: 미세 변동 → gate 개입 없음
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
        case 'S': return { action: 'STRONG_BUY', actionKR: '즉시 매수' };
        case 'A': return { action: 'BUY', actionKR: '매수 적합' };
        case 'B': return { action: 'WATCH', actionKR: '관심 등록' };
        case 'C': return { action: 'HOLD', actionKR: '관망' };
        case 'D': return { action: 'REDUCE', actionKR: '비중 축소' };
        case 'F': return { action: 'EXIT', actionKR: '리스크 이탈' };
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
        whyParts.push('거래급증');
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
            case 'F': whyKR = '구조 붕괴. 즉시 이탈 구간'; break;
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
            const strike = c.details?.strike_price || c.strike_price;
            const iv = c.implied_volatility;
            const type = c.details?.contract_type || c.contract_type;

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

// ================================================================
// [V5] TRADE PLAN ENGINE — 실전 트레이딩용 진입/목표/손절 계산
// 철학: PM 세션에서 검증된 종목의 현실적 진입가를 제시하고,
//       3일 수익률 관점의 목표가와 리스크 관리 손절가를 계산
// ================================================================

export interface TradePlan {
    entry: number;              // 계산된 진입가
    entryZone: [number, number]; // 진입 범위 (하단, 상단)
    entryStrategy: string;       // 진입 전략 설명
    target1: number;            // 보수적 목표가
    target2: number;            // 공격적 목표가
    targetBasis: string;         // 목표가 근거
    stopLoss: number;           // 손절가
    stopBasis: string;          // 손절 근거
    riskReward: number;         // 리스크/리워드 비율 (target1 기준)
    atr: number;                // ATR (일일 평균 변동폭)
    positionNote: string;       // 포지션 사이징 참고
}

export interface TradePlanInput {
    regClose: number;           // 직전장 종가
    prevClose: number;          // 전전일 종가
    pmPrice: number | null;     // PM 현재가
    pmChangePct: number | null; // PM 변동률 (vs 직전장 종가)
    changePct: number;          // 직전장 변동률
    vwap: number | null;        // VWAP
    sma20: number | null;       // SMA20
    callWall: number | null;    // Call Wall (최대 콜 OI 행사가)
    putFloor: number | null;    // Put Floor (최대 풋 OI 행사가)
    maxPain: number | null;     // Max Pain
    history3d: any[];           // 3일 캔들 데이터 [최근, 전일, 전전일]
    alphaScore: number;         // Alpha 점수 (Gate 적용 후)
    gatesApplied: string[];     // 적용된 Gate 목록
    atmIv: number | null;       // ATM Implied Volatility
}

export function calculateTradePlan(input: TradePlanInput): TradePlan | null {
    const { regClose, pmPrice, pmChangePct, changePct, vwap, sma20,
        callWall, putFloor, history3d, alphaScore, gatesApplied, atmIv } = input;

    if (regClose <= 0) return null;

    // ── ATR 계산 (True Range의 평균) ──
    // history3d: [최근봉, 전일봉, 전전일봉] (reversed from asc)
    let atr = 0;
    if (history3d && history3d.length >= 2) {
        const trs: number[] = [];
        for (const bar of history3d) {
            if (bar.h && bar.l) {
                trs.push(bar.h - bar.l);
            }
        }
        atr = trs.length > 0 ? trs.reduce((a, b) => a + b, 0) / trs.length : regClose * 0.03;
    } else {
        // history 없을 때 — 가격의 3%를 기본 ATR로 추정
        atr = regClose * 0.03;
    }

    // ATR이 너무 작으면 최소값 보정 (페니스탁 등)
    if (atr < regClose * 0.01) atr = regClose * 0.01;

    // ── 기준 가격 결정 ──
    // PM 데이터가 있으면 PM 가격이 실제 장 시작 가격에 가까움
    const basePrice = (pmPrice && pmPrice > 0) ? pmPrice : regClose;
    const pmGapPct = pmChangePct || 0;
    const pmAbs = Math.abs(pmGapPct);

    // ── ENTRY (진입가) 계산 ──
    // 핵심 원칙: PM 갭이 클수록 장 시작 후 풀백(되돌림)을 기대하고 더 낮은 가격에 진입
    let entry: number;
    let entryLow: number;
    let entryHigh: number;
    let entryStrategy: string;

    if (pmPrice === null || pmPrice <= 0) {
        // PM 데이터 없음 → 직전장 종가 기준 진입
        entry = regClose;
        entryLow = regClose - atr * 0.2;
        entryHigh = regClose + atr * 0.3;
        entryStrategy = 'PM 거래량 미달/데이터 부재 — 시초가 관찰 후 첫 5분 VWAP 지지선에서 진입';
    } else if (pmAbs < 3) {
        // 갭 < 3%: 적은 갭 → 시가 진입 가능
        entry = pmPrice;
        entryLow = pmPrice - atr * 0.2;
        entryHigh = pmPrice + atr * 0.2;
        entryStrategy = `PM 약보합 (${pmGapPct >= 0 ? '+' : ''}${pmGapPct.toFixed(1)}%) — 시가 근처 분할 진입 유효`;
    } else if (pmAbs < 8) {
        // 갭 3-8%: 적정 갭 → 첫 하락에 진입
        const pullback = atr * 0.4;
        entry = Math.max(regClose, pmPrice - pullback);
        entryLow = entry - atr * 0.3;
        entryHigh = entry + atr * 0.2;
        entryStrategy = `PM 갭업 (+${pmGapPct.toFixed(1)}%) — 시초가 직후 첫 풀백(약 $${pullback.toFixed(2)} 하락) 대기 후 진입`;
    } else if (pmAbs < 15) {
        // 갭 8-15%: 큰 갭 → 의미있는 되돌림 대기
        const pullback = atr * 0.8;
        entry = pmPrice - pullback;
        entryLow = entry - atr * 0.5;
        entryHigh = entry + atr * 0.3;
        entryStrategy = `PM 높은 갭업 (+${pmGapPct.toFixed(1)}%) — 장 초반 차익실현 물량(약 $${pullback.toFixed(2)} 깊이) 소화 확인 필수`;
    } else {
        // 갭 15%+: 극단적 갭 → 대폭 되돌림 또는 진입 보류
        const pullback = atr * 1.5;
        entry = Math.max(regClose * 1.05, pmPrice - pullback);
        entryLow = entry - atr * 0.8;
        entryHigh = entry + atr * 0.5;
        entryStrategy = `PM 급등 (+${pmGapPct.toFixed(1)}%) — 🚨 Gap Trap 극도 고위험 구간. 추격 진입 고위험, 충분한 눌림목($${pullback.toFixed(2)}+ 하락) 통과 후 VWAP 반등 확인 필요`;
    }

    // PM이 하락일 경우 진입가 조정: 하락 갭은 되돌림을 기대하지 않고 시가에서 관찰
    if (pmGapPct < 0 && pmPrice && pmPrice > 0) {
        if (pmGapPct < -8) {
            entry = pmPrice;
            entryLow = pmPrice - atr * 0.6;
            entryHigh = pmPrice + atr * 0.2;
            entryStrategy = `PM 급락 (${pmGapPct.toFixed(1)}%) — 🚨 Catching Knife 위험. 장 초반 바닥 다짐 및 VWAP 강력 돌파 전까지 진입 보류`;
        } else {
            entry = pmPrice;
            entryLow = pmPrice - atr * 0.4;
            entryHigh = pmPrice + atr * 0.2;
            entryStrategy = `PM 하락 (${pmGapPct.toFixed(1)}%) — 시가 관찰 후 이중 바닥(Double Bottom) 등 반등 패턴 형성 시 진입`;
        }
    }

    // ── TARGET (목표가) 계산 ──
    // 3일 수익률 관점: 보수적 = 1.5×ATR, 공격적 = 2.5×ATR
    // 옵션 레벨이 있으면 그것을 우선 적용
    let target1: number;
    let target2: number;
    let targetBasis: string;

    // Call Wall 기반 목표가 (entry 위에 있는 경우만 유효)
    const callWallValid = callWall && callWall > entry;

    if (callWallValid && callWall) {
        // Call Wall이 진입가 위에 있음 → 1차 목표 = Call Wall
        target1 = callWall;
        // 2차 목표 = Call Wall + 1×ATR (마켓메이커 감마 헤지로 돌파 시 가속)
        target2 = callWall + atr * 1.0;
        targetBasis = `CallWall $${callWall.toFixed(2)} → 감마 헤지 가속 시 +ATR`;
    } else {
        // Call Wall이 이미 돌파됨 또는 없음 → ATR 기반
        target1 = entry + atr * 1.5;
        target2 = entry + atr * 2.5;
        targetBasis = 'ATR 기반 (CallWall 이미 돌파 또는 데이터 없음)';
    }

    // ATM IV가 극히 높으면 (200%+ = 어닝 직전) 목표가를 보수적 조정
    // 100% 수준은 일반적 모멘텀 종목에서도 나타나므로 감산하지 않음
    if (atmIv && atmIv > 200) {
        target1 = target1 * 0.97; // 극단적 IV일 때만 3% 보수적
        target2 = target2 * 0.95;
        targetBasis += ' | IV Crush 위험으로 보수적 조정';
    }

    // Target 최소 보장: entry 이하가 되지 않도록 floor 설정
    const minTarget1 = entry + atr * 0.5;
    const minTarget2 = entry + atr * 1.0;
    if (target1 < minTarget1) target1 = minTarget1;
    if (target2 < minTarget2) target2 = minTarget2;

    // ── STOP LOSS (손절가) 계산 ──
    // 원칙: 가장 높은 지지선 중 가장 가까운 것
    const stopCandidates: { price: number; label: string }[] = [];

    // 1) Entry - 1×ATR (기술적 손절)
    stopCandidates.push({ price: entry - atr * 1.0, label: 'ATR 기반' });

    // 2) Put Floor (옵션 지지)
    if (putFloor && putFloor > 0 && putFloor < entry) {
        stopCandidates.push({ price: putFloor, label: 'PutFloor $' + putFloor.toFixed(2) });
    }

    // 3) VWAP (모멘텀 확인선 — VWAP 이탈 시 모멘텀 소실)
    if (vwap && vwap > 0 && vwap < entry) {
        stopCandidates.push({ price: vwap * 0.99, label: 'VWAP 이탈' }); // VWAP 1% 아래
    }

    // 4) SMA20 (중기 추세 확인)
    if (sma20 && sma20 > 0 && sma20 < entry) {
        stopCandidates.push({ price: sma20 * 0.99, label: 'SMA20 이탈' });
    }

    // 5) 어제 저가 (최근 지지)
    if (history3d && history3d.length > 0 && history3d[0].l) {
        stopCandidates.push({ price: history3d[0].l, label: '직전장 저가 $' + history3d[0].l.toFixed(2) });
    }

    // 가장 높은 지지선을 손절로 (=가장 타이트한 손절)
    // 단, entry의 80% 미만은 너무 넓으므로 제외
    const validStops = stopCandidates.filter(s => s.price >= entry * 0.80 && s.price < entry);

    let stopLoss: number;
    let stopBasis: string;
    if (validStops.length > 0) {
        // 가장 높은 (타이트한) 지지선 사용
        const bestStop = validStops.sort((a, b) => b.price - a.price)[0];
        stopLoss = bestStop.price;
        stopBasis = bestStop.label;
    } else {
        // 유효 후보 없으면 ATR 기반
        stopLoss = entry - atr * 1.0;
        stopBasis = 'ATR 기반 (지지선 부재)';
    }

    // ── RISK/REWARD ──
    const risk = entry - stopLoss;
    const reward = target1 - entry;
    const riskReward = risk > 0 ? round2(reward / risk) : 0;

    // ── POSITION NOTE ──
    let positionNote = '';
    if (riskReward >= 3) {
        positionNote = 'R/R 우수 — 표준 포지션 유효';
    } else if (riskReward >= 2) {
        positionNote = 'R/R 적정 — 소규모 포지션 권장';
    } else if (riskReward >= 1) {
        positionNote = 'R/R 낮음 — 진입 재고 또는 풀백 대기';
    } else {
        positionNote = 'R/R 부적합 — 진입 보류';
    }

    // EXTREME_GAP_RISK가 있으면 경고 추가
    if (gatesApplied.includes('EXTREME_GAP_RISK')) {
        positionNote = '⚠ EXTREME GAP RISK — 추격매수 금지. ' + positionNote;
    }
    if (gatesApplied.includes('PM_REJECT')) {
        positionNote = '❌ PM 역행 — 진입 보류 권장. ' + positionNote;
    }

    return {
        entry: round2(entry),
        entryZone: [round2(entryLow), round2(entryHigh)],
        entryStrategy,
        target1: round2(target1),
        target2: round2(target2),
        targetBasis,
        stopLoss: round2(stopLoss),
        stopBasis,
        riskReward,
        atr: round2(atr),
        positionNote,
    };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
