
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
    decisionSSOT?: any;
    [key: string]: any;
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
