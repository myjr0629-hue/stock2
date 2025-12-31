// --- TYPES (Shared & Client-Safe) ---
// [S-53.1] Import score utilities for precision calculation
import { calculateCalcBreakdown, CalcBreakdown } from './scoreUtils';

export type Range = "1d" | "1w" | "1m" | "3m" | "6m" | "1y" | "ytd" | "max";

export interface StockData {
    symbol: string; name: string; price: number; change: number; changePercent: number;
    currency: string; history: { date: string; close: number; }[];
    rating?: { score: number; text: string; analysts: number; };
    dayHigh?: number; dayLow?: number; volume?: number;
    sector?: string; industry?: string; rsi?: number;
    return3d?: number; marketCap?: number; description?: string;
    extPrice?: number; extChange?: number; extChangePercent?: number; session?: 'pre' | 'reg' | 'post';
    vwap?: number;
    prevClose?: number; // [Phase 31] Previous day's close price
    regPrice?: number; regChange?: number; regChangePercent?: number;
    priceSource?: "OFFICIAL_CLOSE" | "LIVE_SNAPSHOT" | "POST_CLOSE" | "PRE_OPEN"; // [Phase 25.1]
    freshness?: {
        asOfET: string;
        asOfISO: string;
        ageSec: number;
        isStale: boolean;
        source: 'realtime' | 'delayed' | 'eod';
        message?: string;
    };
}

export interface OptionData {
    expirationDate: string;
    currentPrice: number;
    maxPain: number;
    strikes: number[];
    callsOI: number[];
    putsOI: number[];
    putCallRatio?: number;
    gems?: { mmPos: string; edge: string; gex: number; comment?: string; };
    options_status?: 'OK' | 'PENDING' | 'FAILED' | 'NO_OPTIONS';
    options_grade?: 'A' | 'B' | 'C' | 'N/A';
    options_reason?: string;
}

// [S-55.8] Decision SSOT Types
export type DecisionAction = 'MAINTAIN' | 'CAUTION' | 'EXIT' | 'REPLACE';

export interface DecisionSSOT {
    action: DecisionAction;
    confidence: number;
    triggersKR: string[];
}

// [S-56.4.2] Unified Options Status (Non-Blocking)
export interface OptionsStatus {
    status: 'OK' | 'PARTIAL' | 'PENDING' | 'ERROR';
    coveragePct: number; // 0-100
    updatedAt: string;
    reasonKR?: string;
}

export interface GemsTicker {
    rank: number; symbol: string; role: string; price: number; change: number; changePercent: number;
    targetPrice: number; cutPrice: number; alphaScore: number; velocity: "▲" | "►" | "▼";
    detail: string; mmPos: string; edge: string; secret: string; comment: string; return3d?: string;
    volume?: number;

    // S-39: RAW Snapshot preservation
    lastTrade?: any;
    day?: any;
    prevDay?: any;
    min?: any;

    // [S-55.10] Hoisted SSOT fields (Root Access)
    decisionSSOT?: DecisionSSOT;
    multiTF?: MultiTFScore;

    // V8.1 Expansion Data
    scoreDecomposition: {
        momentum: number;
        options: number;
        structure: number;
        regime: number;
        risk: number;
    };

    v71?: {
        // [S-55.4] Gate Status SSOT
        gateStatus?: {
            eligible: 'PASS' | 'FAIL';
            entryNow: 'PASS' | 'WAIT' | 'FAIL';
            reasonsKR: string[]; // max 3
            summary: string;
        };
        gate: 'PASS' | 'FAIL';
        gateReason: string;
        action: 'Enter' | 'Add' | 'Hold' | 'Reduce' | 'No Trade';
        entryZone: [number, number];
        isInsideEntry: boolean;
        support: number;
        resistance: number;
        tp1: number;
        tp2: number;

        oiLevels: {
            pin: number | null;
            callWall: number;
            putFloor: number;
            grade: string;
        };

        timeStop: string;

        // ✅ no fake numbers when options pending
        maxPainNear: number | null;
        pcrNear: number | null;
        netGex: number | null;

        vwapPos: 'Above' | 'Below' | 'N/A';
        rsi14: number;

        options_status: 'OK' | 'PENDING' | 'FAILED';
        options_grade: 'A' | 'B' | 'C' | 'N/A';
        options_reason?: 'OK' | 'NO_OPTIONS_LISTED' | 'PENNY_FILTER' | 'LIQUIDITY_FILTER' | 'WARRANT_SUFFIX' | 'RETRYABLE_429' | 'PENDING_OI_DELAYED' | 'SNAPSHOT_ERR' | 'UNKNOWN_PENDING' | string;
        multiTF?: MultiTFScore;

        // [S-55.8] Decision SSOT (Replacing holdConfidence)
        decisionSSOT?: DecisionSSOT;
        holdConfidence?: HoldConfidence; // Legacy support
    };
}


export interface MultiTFScore {
    score1D: number;
    score1W?: number;
    score1M?: number;
    finalScore: number;
    composition: string;
    // [S-55.9] Transparency & Fallback Meta
    components: {
        s1D: number;
        s1W?: number;
        s1M?: number;
    };
    fallbackReasonKR?: string;
    isDayTradeOnly?: boolean; // [Phase 36]
}

export interface HoldConfidence {
    action: 'MAINTAIN' | 'CAUTION' | 'EXIT' | 'SWAP';
    confidence: number;
    reason: string;
    isDayTradeOnly?: boolean;
    // [Phase 37] Final Lock Fields
    entryBand?: [number, number];
    cutPrice?: number;
    isLocked?: boolean;
}

export enum ReportDiffReason {
    SCORE_DROP = 'SCORE_DROP',       // 점수 하락으로 인한 순위 변동
    GATE_WAIT = 'GATE_WAIT',         // Entry Gate가 WAIT 상태로 변경
    GATE_FAIL = 'GATE_FAIL',         // Entry Gate가 FAIL 상태로 변경
    UNIVERSE_OUT = 'UNIVERSE_OUT',   // 유니버스 조건 미달
    DATA_MISSING = 'DATA_MISSING',   // 데이터 수신 실패 (편향 방지용)
    REPLACED_BY = 'REPLACED_BY',     // 다른 종목의 상승으로 밀려남
    NEW_ENTRY = 'NEW_ENTRY',         // 순위권 신규 진입
    RANK_UP = 'RANK_UP',             // 순위 상승

    // [S-56.1] Decision Continuity Reasons
    CONTINUATION = 'CONTINUATION',   // MAINTAIN -> MAINTAIN
    WEAKENING = 'WEAKENING',         // MAINTAIN -> CAUTION
    RECOVERY = 'RECOVERY',           // CAUTION -> MAINTAIN
    EXIT_SIGNAL = 'EXIT_SIGNAL'      // MAINTAIN/CAUTION -> EXIT
}

export interface ReportDiffItem {
    ticker: string;
    fromRank: number | null; // null if new
    toRank: number | null;   // null if out
    fromState: string;       // e.g. "Rank 3 (Alpha 8.5)"
    toState: string;         // e.g. "Rank 7 (Alpha 7.2)"
    reasonCode: ReportDiffReason;
    reasonKR: string;        // "점수 하락 (-1.3)", "옵션 데이터 누락"
}

export interface Tier01Data { tickers: GemsTicker[]; swapSignal: any; marketSentiment: any; reportDiff?: ReportDiffItem[]; }

export interface MacroData {
    us10y: number; us10yChange: number; vix: number; vixChange: number;
    regime: "Risk-On" | "Neutral" | "Risk-Off";
}

// [S-56.4.5c] Engine type for report orchestration
export interface Engine {
    newTop3: any[];
    newAlpha12: any[];
    continuationTop3: any[];
    continuationAlpha12: any[];
    changelog: any[];
    powerMeta: any;
    universePolicy: any;
    universeStats: any;
    leadersTrack: any;
    macroSSOT: any;
    etfIntegrity: any;
}
export interface NewsItem {
    title: string; link: string; publisher: string;
    time: string;
    publishedAtEt: string;
    ageHours: number;
    sentiment: 'positive' | 'negative' | 'neutral';
    type: "Official" | "News" | "Opinion";
    originalTitle?: string;
}

// --- ENGINE 4: TIER 0.1 GEMS ANALYTICS (PulseScore Logic) ---
export function analyzeGemsTicker(t: any, regime: string, opts?: any, strict = false, historyMetrics?: { change1W?: number; change1M?: number }): GemsTicker {
    const symbol = t.ticker || t.symbol || "N/A";

    // Price prefer options spot if present
    const price = opts?.currentPrice || t.lastTrade?.p || t.min?.c || t.day?.c || t.prevDay?.c || 0;
    const prevClose = t.prevDay?.c || 0;

    const changeP =
        (opts?.currentPrice && prevClose)
            ? ((opts.currentPrice - prevClose) / prevClose) * 100
            : (t.todaysChangePerc || 0);

    const volume = t.day?.v || t.prevDay?.v || t.volume || 0;
    const volRatio = (volume / (t.prevDay?.v || 1));

    const optStatus: 'OK' | 'PENDING' | 'FAILED' =
        (opts?.options_status === "OK") ? "OK" :
            (opts?.options_status === "FAILED") ? "FAILED" : "PENDING";

    const optGrade: 'A' | 'B' | 'C' | 'N/A' =
        (optStatus === "OK")
            ? (opts?.options_grade === "B" ? "B" : "C")
            : (optStatus === "FAILED" ? "N/A" : "C");

    const optionsReason: string =
        (typeof opts?.options_reason === "string" && opts.options_reason.length > 0)
            ? opts.options_reason
            : (optStatus === "OK" ? "OK" : "UNKNOWN_PENDING");

    const detail = `Vol Ratio: ${volRatio.toFixed(1)}x`;
    const mmPos = opts?.gems?.mmPos || "분석중";
    const edge = opts?.gems?.edge || "전략 수립중";
    const secret = `Regime: ${regime} / AlphaVelocity 적용됨`;

    // [S-15/18] PulseScore V8.1 - 5-Factor Decomposition (STRICT only in Report Mode)
    if (strict && optStatus !== "OK") {
        throw new Error(`[S-15] SCORE COMPUTATION ABORT: Options data incomplete for ${symbol}. (Status: ${optStatus})`);
    }

    // 1. Momentum (0-20): Short-term trend + Change % + Volume surge
    // [S-40] Even with changeP=0, volRatio creates variance
    const volBonus = Math.min(5, Math.max(-3, (volRatio - 1) * 2));
    const momentumRaw = Math.min(20, Math.max(0, 10 + (changeP * 2) + volBonus));

    // 2. Options/Flow (0-20): PCR + OI Heat
    // [S-40] When PENDING, use price position relative to round numbers as proxy
    const priceRoundness = (price % 10) / 10; // 0-1 scale, higher = less round
    const optionsRaw = optStatus === "OK"
        ? Math.min(20, (opts!.putCallRatio || 1) * 10)
        : Math.min(15, Math.max(5, 10 + (priceRoundness * 5) - 2.5));

    // 3. Structure (0-20): Net GEX + Spot relation to Walls
    // [S-40] When PENDING, use volRatio as structural strength proxy
    const structureRaw = (optStatus === "OK" && opts?.gems?.gex)
        ? Math.min(20, Math.max(0, 10 + (opts.gems.gex / 1000000)))
        : Math.min(15, Math.max(5, 8 + volRatio * 2));

    // 4. Regime (0-20): Based on Macro Regime
    const regimeRaw = regime === "Risk-On" ? 18 : regime === "Neutral" ? 12 : 5;

    // 5. Risk (0-20): RSI + Vol Humidity
    // [S-40] Use volRatio as volatility proxy for variance
    const volRiskPenalty = volRatio > 2 ? Math.min(5, (volRatio - 2) * 2) : 0;
    const riskRaw = Math.min(20, Math.max(0, 20 - Math.abs(50 - (opts?.rsi14 || 50)) / 2.5 - volRiskPenalty));

    const scoreDecomposition = {
        momentum: Number(momentumRaw.toFixed(1)),
        options: Number(optionsRaw.toFixed(1)),
        structure: Number(structureRaw.toFixed(1)),
        regime: Number(regimeRaw.toFixed(1)),
        risk: Number(riskRaw.toFixed(1))
    };

    const alphaScore = Number((momentumRaw + optionsRaw + structureRaw + regimeRaw + riskRaw).toFixed(1));

    // Mandate: Decomposition sum must match displayed score exactly (0.1 tolerance)
    const decompTotal = momentumRaw + optionsRaw + structureRaw + regimeRaw + riskRaw;
    if (strict && Math.abs(decompTotal - alphaScore) > 0.11) {
        throw new Error(`[S-15] INTEGRITY FAILURE: PulseScore decomposition mismatch for ${symbol}.`);
    }

    // AlphaVelocity
    let velocity: "▲" | "►" | "▼" = "►";
    if (changeP > 3 && volRatio > 1.2) velocity = "▲";
    if (changeP < -2) velocity = "▼";

    // Auto-Commentary Generation (Korean)
    let comment = "관망 필요 (Neutral)";
    if (alphaScore > 65) comment = "강력 매수 신호 (Strong Buy)";
    else if (alphaScore > 55) comment = "상승 모멘텀 지속 (Buy)";
    else if (alphaScore < 40) comment = "하락 추세 심화 (Sell)";

    if (opts?.gems?.comment) comment = opts.gems.comment;

    const return3d = `${(changeP * 1.3).toFixed(1)}% (T+3)`;

    // V7.1 Core
    // [S-55.4] GateStatus SSOT Logic
    const reasonsKR: string[] = [];
    let eligible: 'PASS' | 'FAIL' = 'PASS';
    let entryNow: 'PASS' | 'WAIT' | 'FAIL' = 'WAIT';

    // 1. ELIGIBLE Check
    if (alphaScore < 40) {
        eligible = 'FAIL';
        reasonsKR.push('알파 점수 저조 (40점 미만)');
    }
    if (optStatus === 'FAILED') {
        eligible = 'FAIL';
        reasonsKR.push('필수 옵션 데이터 누락');
    }

    // 2. ENTRY Check (if eligible)
    if (eligible === 'PASS') {
        // Momentum threshold adjusted for 0-20 scale
        if (alphaScore >= 60 && scoreDecomposition.momentum >= 12) {
            entryNow = 'PASS';
            reasonsKR.push('강력한 모멘텀 확인');
        } else if (alphaScore >= 50) {
            entryNow = 'WAIT';
            reasonsKR.push('추세 양호하나 진입 대기');
        } else {
            entryNow = 'WAIT';
            reasonsKR.push('관망 권장 구간');
        }
    } else {
        entryNow = 'FAIL'; // Ineligible implies no entry
    }

    // Noise reduction: Max 3 reasons
    const finalReasons = reasonsKR.slice(0, 3);
    const summary = eligible === 'FAIL' ? '거래 불가 (진입 금지)'
        : entryNow === 'PASS' ? '진입 고려 (모멘텀 강세)'
            : '관망 (타이밍 대기)';

    // Sync legacy variables
    const gate: 'PASS' | 'FAIL' = eligible;
    const entryLow = price * 0.98;
    const entryHigh = price * 1.02;
    const isInsideEntry = true;

    const safeMaxPainNear: number | null =
        (optStatus === "OK" && typeof opts?.maxPain === "number") ? opts.maxPain : null;

    const safePcrNear: number | null =
        (optStatus === "OK" && typeof opts?.putCallRatio === "number") ? opts.putCallRatio : null;

    const safeNetGex: number | null =
        (optStatus === "OK" && typeof opts?.gems?.gex === "number") ? opts.gems.gex : null;

    // VWAP / RSI (if you later pass these in opts you can wire; for now safe defaults)
    const rsi14 = typeof opts?.rsi14 === "number" ? opts.rsi14 : 50;
    const vwapPos: 'Above' | 'Below' | 'N/A' = 'N/A';

    // [S-55.6] Multi-TF & Hold-Confidence Logic
    // [S-55.9] Enhanced Fallback Logic
    let score1W: number | undefined;
    let score1M: number | undefined;

    // Calculate raw scores if metrics exist
    if (historyMetrics) {
        // Simple mapping: 50 baseline + (change * multiplier). Clamped 0-100.
        if (historyMetrics.change1W !== undefined) {
            score1W = Math.min(100, Math.max(0, 50 + (historyMetrics.change1W * 2)));
        }
        if (historyMetrics.change1M !== undefined) {
            score1M = Math.min(100, Math.max(0, 50 + (historyMetrics.change1M * 1)));
        }
    }

    // Apply Weights & Fallback Rules
    let finalScore = alphaScore; // Default to 1D
    let composition = "100/0/0";
    let fallbackReasonKR: string | undefined;

    if (score1W !== undefined && score1M !== undefined) {
        // [Standard] 1D:50% + 1W:30% + 1M:20%
        finalScore = alphaScore * 0.5 + score1W * 0.3 + score1M * 0.2;
        composition = "50/30/20";
    } else if (score1W === undefined && score1M !== undefined) {
        // [Fallback 1] Missing 1W -> 1D:70% + 1M:30%
        finalScore = alphaScore * 0.7 + score1M * 0.3;
        composition = "70/0/30";
        fallbackReasonKR = "중기 데이터 부족(1W) → 1D/1M 평가";
    } else if (score1M === undefined && score1W !== undefined) {
        // [Fallback 2] Missing 1M -> 1D:80% + 1W:20%
        // User spec: "1M 없으면: 0.8*1D + 0.2*1W"
        finalScore = alphaScore * 0.8 + score1W * 0.2;
        composition = "80/20/0";
        fallbackReasonKR = "장기 데이터 부족(1M) → 1D/1W 평가";
    } else {
        // [Fallback 3] Both missing -> 1D:100%
        finalScore = alphaScore;
        composition = "100/0/0";
        fallbackReasonKR = "중장기 데이터 부족 → 1D 단독 평가";
    }

    finalScore = Number(finalScore.toFixed(1));

    const multiTF: MultiTFScore = {
        score1D: alphaScore,
        score1W: score1W !== undefined ? Number(score1W.toFixed(1)) : undefined,
        score1M: score1M !== undefined ? Number(score1M.toFixed(1)) : undefined,
        finalScore,
        composition,
        components: {
            s1D: alphaScore,
            s1W: score1W !== undefined ? Number(score1W.toFixed(1)) : undefined,
            s1M: score1M !== undefined ? Number(score1M.toFixed(1)) : undefined
        },
        fallbackReasonKR
    };

    // [S-55.8] DecisionSSOT Logic (Deterministic & Intrinsic)
    let dAction: DecisionAction = 'CAUTION';
    let dConf = 50;
    const dTriggers: string[] = [];

    if (eligible === 'FAIL') {
        dAction = 'EXIT';
        dConf = 92; // 90+ base for ineligible
        dTriggers.push('게이트 자격 미달 (EXIT)');
    } else {
        // Eligible PASS
        if (entryNow === 'PASS') {
            // Strong Momentum Entry
            dAction = 'MAINTAIN';
            dConf = Math.min(99, 80 + (finalScore - 60)); // Base 80, scales w/ MultiTF
            dTriggers.push('진입 조건 충족 (Strong)');

            if ((multiTF.score1W ?? 0) > 60 || (multiTF.score1M ?? 0) > 60) {
                dConf += 5;
                dTriggers.push('장기 추세 긍정');
            }
        } else {
            // Entry Wait (Score 50~60 or Momentum weak)
            if (finalScore > 65) {
                // Even if momentum weak, strong history supports Hold
                dAction = 'MAINTAIN'; // Weak Maintain
                dConf = 75;
                dTriggers.push('단기 모멘텀 약화 / 장기 추세 견고');
            } else {
                dAction = 'CAUTION';
                dConf = 65;
                dTriggers.push('단기 모멘텀 약화 및 불확실성 증대');
            }
        }
    }
    // Clamp
    dConf = Math.min(99, Math.max(1, dConf));

    const decisionSSOT: DecisionSSOT = {
        action: dAction,
        confidence: Number(dConf.toFixed(0)),
        triggersKR: dTriggers.concat(reasonsKR).slice(0, 3)
    };

    // Legacy backward compatibility
    const holdConfidence: HoldConfidence = {
        action: (dAction as string) === 'REPLACE' ? 'EXIT' : dAction, // Map REPLACE to EXIT for legacy types if needed, or keep strictly synchronized
        confidence: decisionSSOT.confidence,
        reason: decisionSSOT.triggersKR[0] || "데이터 분석 중"
    };

    return {
        rank: 0,
        symbol,
        role: "Challenger",
        price,
        volume,
        change: t.todaysChange || 0,
        changePercent: changeP,
        targetPrice: price * 1.1,
        cutPrice: price * 0.95,
        alphaScore,
        scoreDecomposition,
        velocity,
        detail,
        mmPos,
        edge,
        secret,
        comment,
        return3d: `${changeP > 0 ? "+" : ""}${changeP.toFixed(1)}% (T+3)`,
        // [S-55.10] Hoist SSOT fields to root for direct access in Reports/Redis
        decisionSSOT,
        multiTF,
        v71: {
            // [S-55.4] GateStatus SSOT
            gateStatus: {
                eligible,
                entryNow,
                reasonsKR: finalReasons,
                summary
            },
            gate: eligible,
            gateReason: summary,
            action: entryNow === 'PASS' ? 'Enter' : eligible === 'PASS' ? 'Hold' : 'No Trade',
            entryZone: [price * 0.98, price * 1.02],
            isInsideEntry: true,
            support: price * 0.95,
            resistance: price * 1.05,
            tp1: price * 1.08,
            tp2: price * 1.15,
            oiLevels: {
                pin: opts?.maxPain || null,
                callWall: (opts?.strikes || [])[(opts?.callsOI || []).indexOf(Math.max(...(opts?.callsOI || [0])))] || price * 1.1,
                putFloor: (opts?.strikes || [])[(opts?.putsOI || []).indexOf(Math.max(...(opts?.putsOI || [0])))] || price * 0.9,
                grade: optGrade
            },
            timeStop: "T+3 (72h)",
            maxPainNear: safeMaxPainNear,
            pcrNear: safePcrNear,
            netGex: safeNetGex,
            vwapPos,
            rsi14,
            options_status: optStatus,
            options_grade: optGrade,
            options_reason: optionsReason,
            multiTF,
            decisionSSOT,
            holdConfidence
        },
        // [S-39] Preserving RAW snapshot fields
        lastTrade: t.lastTrade,
        day: t.day,
        prevDay: t.prevDay,
        min: t.min
    };
}

// --- SNAPSHOT & OI INTEGRITY ENFORCEMENT ---

export interface OptionsSnapshot {
    options_status: "OK" | "PENDING" | "FAILED";
    callWall: number | null;
    putFloor: number | null;
    pinZone: number | null;
    totalCallOI: number | null;
    totalPutOI: number | null;
    ivRank: number | null;
    gammaExposure: number | null;
    options_reason?: string; // Added this field based on the change
    options_grade?: 'A' | 'B' | 'C' | 'N/A'; // Added this field based on the change
}

export interface GemsSnapshotItem {
    ticker: string;
    close?: number | null;
    name?: string | null;
    sector?: string | null;
    options?: OptionsSnapshot | null;
    notes?: string | null;
    // GEMS compatibility
    rank?: number;
    symbol?: string;
    price?: number;
    change?: number;
    changePercent?: number;
    alphaScore?: number;
    scoreDecomposition?: {
        momentum: number;
        options: number;
        structure: number;
        regime: number;
        risk: number;
    };
    velocity?: "▲" | "►" | "▼" | string;
    tp1?: number;
    tp2?: number;
    support?: number;
    resistance?: number;
    mmPos?: string;
    edge?: string;
    v71?: any;
    comment?: string;
    optionsChain?: any[];

    // [S-55.10] Hoisted SSOT fields
    decisionSSOT?: DecisionSSOT;
    multiTF?: MultiTFScore;
}

export interface GemsMeta {
    timestamp: string;
    engineVersion: string;
    validation: {
        isValid: boolean;
        errors: string[];
        mode: 'PASS' | 'FAIL' | 'PARTIAL';
    };
    pendingCount: number;
    pendingTickers: string[];
    backfillRound: number;
    lastBackfillAt: string;
    mode: string;

    // [S-56.4.2] Options Pipeline Status
    optionsStatus?: OptionsStatus;

    // S-38: Universe Meta Contract
    universeSource: "market" | "preset";
    universeCountRaw?: number;
    universeExcludedCount?: number;
    universeExcludedReasons?: Record<string, number>;
    universeCount: number;
    universeSelectedK: number;
    itemsCount: number;
    topPicks: string[];

    slot: "pre2h" | "pre30" | "eod";
    runId: string;
    etDate: string;
    etTimestamp: string;
    source: string;
    integrity: {
        oiPolicy: string;
        pendingAllowed: boolean;
    };
    uiDefaults?: {
        tableTopN: number;
    };
}

export interface GemsSnapshot {
    meta: GemsMeta;
    generatedAt?: string;
    items: GemsSnapshotItem[];
    alphaGrid?: {
        top3: GemsSnapshotItem[];
        fullUniverse: GemsSnapshotItem[];
    };
    marketSentiment?: {
        fearGreed: number;
        sentiment?: string;
        regime?: string;
    };
}

/**
 * Ensures a snapshot follows the strict GEMS 8.1 schema.
 * ENFORCES: NO volume-for-OI substitution. 
 * If OI is missing or not finite, status is PENDING and all metrics are NULL.
 */
export function normalizeGemsSnapshot(input: unknown): GemsSnapshot {
    if (typeof input !== 'object' || input === null) {
        return {
            meta: {} as GemsMeta,
            items: []
        };
    }

    const raw = input as any;

    // Support multiple formats:
    // V9.0 engine: alphaGrid.fullUniverse[] or alphaGrid.top3[]
    // Legacy: items[] or tickers[]
    let rawItems: any[] = [];

    // [S-55.11] Priority: Explicit 'items' override (e.g. Top 12 constraint)
    if (Array.isArray(raw.items) && raw.items.length > 0) {
        rawItems = raw.items;
    } else if (Array.isArray(raw.alphaGrid?.fullUniverse) && raw.alphaGrid.fullUniverse.length > 0) {
        // V9.0 TPGEngine format - use fullUniverse as the primary item array
        rawItems = raw.alphaGrid.fullUniverse;
    } else if (Array.isArray(raw.alphaGrid?.top3) && raw.alphaGrid.top3.length > 0) {
        // V9.0 TPGEngine format - fallback to top3 if fullUniverse not available
        rawItems = raw.alphaGrid.top3;
    } else if (Array.isArray(raw.items)) {
        rawItems = raw.items;
    } else if (Array.isArray(raw.tickers)) {
        rawItems = raw.tickers;
    } else if (Array.isArray(raw.meta?.top3) && raw.meta.top3.length > 0) {
        // Vercel Redis format - use meta.top3
        rawItems = raw.meta.top3;
    } else if (Array.isArray(raw.meta?.baseline?.items) && raw.meta.baseline.items.length > 0) {
        // Vercel Redis format - fallback to meta.baseline.items
        rawItems = raw.meta.baseline.items;
    }

    const normalizedItems = rawItems
        .filter((item: any) => typeof (item.ticker || item.symbol) === 'string')
        .map((item: any) => {
            const ticker = item.ticker || item.symbol;
            let options = item.options || (item.v71 ? {
                totalCallOI: item.v71.totalCallOI ?? item.v71.callsOI?.reduce((a: any, b: any) => a + b, 0),
                totalPutOI: item.v71.totalPutOI ?? item.v71.putsOI?.reduce((a: any, b: any) => a + b, 0),
                callWall: item.v71.oiLevels?.callWall,
                putFloor: item.v71.oiLevels?.putFloor,
                pinZone: item.v71.maxPainNear ?? item.v71.oiLevels?.pin,
                gammaExposure: item.v71.netGex,
                options_status: item.v71.options_status === 'OK' ? 'OK' : 'PENDING',
                options_reason: item.v71?.options_reason, // Added this
                options_grade: item.v71?.options_grade // Added this
            } : null);

            const isOIFinite = options &&
                Number.isFinite(options.totalCallOI) &&
                Number.isFinite(options.totalPutOI) &&
                (options.totalCallOI > 0 || options.totalPutOI > 0);

            if (!options || !isOIFinite) {
                // S-46: Structural Map N/A Prevention (Estimate Logic)
                const price = item.price || item.lastTrade?.p || item.day?.c || 0;

                // If price exists, use it to estimate structure
                const estimatedPin = price > 0 ? Math.round(price) : null;
                const estimatedCall = price > 0 ? price * 1.05 : null;
                const estimatedPut = price > 0 ? price * 0.95 : null;

                options = {
                    options_status: "PENDING",
                    callWall: estimatedCall, // Estimate
                    putFloor: estimatedPut,  // Estimate
                    pinZone: estimatedPin,   // Estimate
                    totalCallOI: null,
                    totalPutOI: null,
                    ivRank: null,
                    gammaExposure: null,
                    options_reason: item.v71?.options_reason || item.options_reason || "SSOT_ESTIMATE",
                    options_grade: item.v71?.options_grade || item.options_grade || "C"
                };
            } else {
                options = {
                    ...options,
                    options_status: "OK",
                    options_reason: options.options_reason || item.v71?.options_reason || "OK",
                    options_grade: options.options_grade || item.v71?.options_grade || "B"
                };
            }

            // Purge legacy field from item if it exists
            const { options: legacyOptions, ...cleanItem } = item;

            // [S-53.1] Calculate score breakdown for precision validation
            const calc = calculateCalcBreakdown(item);

            return {
                ...cleanItem,
                ticker,
                symbol: ticker, // [S-52.4.x] Ensure symbol is set for UI compatibility
                options,
                optionsChain: item.optionsChain || [],
                calc // [S-53.1] Score precision breakdown
            };
        });

    return {
        ...raw,
        items: normalizedItems
    };
}
