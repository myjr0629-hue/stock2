
// ============================================================================
// TYPES (vNext Unified Evidence Model)
// ============================================================================

export interface UnifiedOptions {
    status: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'PENDING' | 'FAILED' | 'OK' | 'READY' | 'NO_OPTIONS';
    coveragePct: number;
    gammaRegime: string;
    gex: number;
    gexZeroDte?: number;
    gexZeroDteRatio?: number;
    pcr: number;
    callWall: number;
    putFloor: number;
    pinZone: number;
    maxPain: number;
    volume?: number;
    oiClusters: {
        callsTop: any[];
        putsTop: any[];
    };
    backfilled?: boolean;
    fetchedAtET?: string;
    complete?: boolean;
    triggersKR?: string[]; // Added from snippet
    // [V3.7.3] Deep Forensic
    whaleIndex?: number; // 0-100
    whaleConfidence?: 'HIGH' | 'MED' | 'LOW' | 'NONE';
    [key: string]: any;
}

export interface UnifiedFlow {
    vol: number;
    relVol: number;
    gapPct: number;
    largeTradesUsd: number;
    offExPct: number;
    offExDeltaPct: number;
    netFlow?: number;
    backfilled?: boolean;
    fetchedAtET?: string;
    complete?: boolean;
    [key: string]: any;
}

export interface UnifiedPrice {
    last: number;
    priceSource?: "OFFICIAL_CLOSE" | "LIVE_SNAPSHOT" | "POST_CLOSE" | "PRE_OPEN"; // [Phase 25.1] Precise Session Tagging
    extendedPrice?: number; // [V3.7.5] Pre/Post Market Price
    extendedChangePct?: number; // [V3.7.5] Pre/Post Market Change %
    extendedLabel?: "PRE" | "POST" | "CLOSED"; // [V3.7.5] Label for Extended Data
    error?: string; // [Phase 24.2] Expose Error
    prevClose: number;
    changePct: number;
    vwap: number;
    vwapDistPct: number;
    rsi14: number;
    return3D: number;
    structureState: 'BREAKOUT' | 'BREAKDOWN' | 'CONSOLIDATION' | 'TRENDING' | 'REVERSAL';
    fetchedAtET?: string;
    complete?: boolean;
    [key: string]: any;
}

export interface UnifiedStealth {
    label: 'A' | 'B' | 'C';
    tags: string[];
    impact: 'BOOST' | 'WARN' | 'NEUTRAL';
    lastSeenET?: string;
    complete?: boolean;
    [key: string]: any;
}

export interface UnifiedMacro {
    ndx: { changePct: number; price?: number;[key: string]: any };
    vix: { level?: number; value?: number;[key: string]: any };
    // Legacy / Fallback fields
    nq?: number;
    nqChangePercent?: number;
    us10y?: any;
    dxy?: any;
    factors?: any;
    fetchedAtET?: string;
    ageSeconds?: number;
    complete?: boolean;
    [key: string]: any;
}

export interface UnifiedEvidence {
    price: UnifiedPrice;
    flow: UnifiedFlow;
    options: UnifiedOptions;
    macro: UnifiedMacro;
    policy: {
        gate: {
            P0: string[];
            P1: string[];
            P2: string[];
            blocked: boolean;
        };
        gradeA_B_C_counts: { A: number; B: number; C: number };
        fetchedAtET?: string;
    };
    stealth: UnifiedStealth;
    complete?: boolean;
    [key: string]: any;
}

export interface TerminalItem {
    ticker: string;
    evidence: UnifiedEvidence;
    complete: boolean;
    isBackfilled?: boolean; // Optional now

    // Legacy / Calculated
    alphaScore?: number | null;
    classification?: any;
    decisionSSOT?: any; // Allow loose typing or define explicitly below
    [key: string]: any;
}

export interface DecisionSSOT {
    action: string;
    confidencePct: number;
    triggersKR: string[];
    entryBand?: { min: number; max: number };
    cutPrice?: number;
    isLocked?: boolean;
    whaleIndex?: number;
    whaleConfidence?: 'HIGH' | 'MED' | 'LOW' | 'NONE';
    whaleEntryLevel?: number;
    whaleTargetLevel?: number;
    dominantContract?: string;
}

export interface TickerItem extends TerminalItem {
    ticker: string; // Ensure override matches
    symbol?: string;
    qualityTier?: "ACTIONABLE" | "WATCH" | "FILLER" | "PENDING" | "INCOMPLETE";
    entryBand?: { low: number; high: number };
    hardCut?: number;
    tp1?: number;
    tp2?: number;
    isLoading?: boolean;
    [key: string]: any;
}

// [V3.7.3] Option Tick Data Support (Massive API)
export interface OptionTrade {
    price: number;
    size: number;
    exchange: string;
    conditions: string[];
    timestamp: number;
    details?: {
        contract_type: 'call' | 'put';
        strike_price: number;
        expiration_date: string;
        underlying_price?: number; // Ideal if available
    };
}

export interface OptionQuote {
    bid_price: number;
    bid_size: number;
    ask_price: number;
    ask_size: number;
    timestamp: number;
}

export interface LastOptionTrade {
    price: number;
    size: number;
    exchange: string;
    timestamp: number;
}
