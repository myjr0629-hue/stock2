// ============================================================================
// INTEL TYPES (Shared across components)
// Extracted from IntelClientPage.tsx for cross-module access
// ============================================================================

export interface UnifiedOptions {
    status: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'PENDING' | 'FAILED';
    coveragePct: number;
    gammaRegime: string;
    gex: number;
    pcr: number;
    callWall: number;
    putFloor: number;
    pinZone: number;
    maxPain: number;
    oiClusters: {
        callsTop: number[];
        putsTop: number[];
    };
    backfilled: boolean;
    fetchedAtET?: string;
    rawChain?: any[];
}

export interface UnifiedFlow {
    vol: number;
    relVol: number;
    gapPct: number;
    largeTradesUsd: number;
    offExPct: number;
    offExDeltaPct: number;
    netFlow?: number;
    netPremium?: number;
    backfilled: boolean;
    fetchedAtET?: string;
    complete?: boolean;
}

export interface UnifiedPrice {
    last: number;
    priceSource?: "OFFICIAL_CLOSE" | "LIVE_SNAPSHOT" | "POST_CLOSE" | "PRE_OPEN";
    extendedPrice?: number;
    extendedChangePct?: number;
    extendedLabel?: "PRE" | "POST" | "CLOSED" | "LIVE";
    error?: string;
    prevClose: number;
    changePct: number;
    vwap: number;
    vwapDistPct: number;
    rsi14: number;
    return3D: number;
    structureState: 'BREAKOUT' | 'BREAKDOWN' | 'CONSOLIDATION' | 'TRENDING' | 'REVERSAL';
    fetchedAtET?: string;
    history3d?: any[];
}

export interface UnifiedStealth {
    label: 'A' | 'B' | 'C';
    tags: string[];
    impact: 'BOOST' | 'WARN' | 'NEUTRAL';
    lastSeenET?: string;
}

export interface UnifiedEvidence {
    price: UnifiedPrice;
    flow: UnifiedFlow;
    options: UnifiedOptions;
    macro: any;
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
}

export interface TickerItem {
    ticker: string;
    evidence: UnifiedEvidence;

    // Legacy / Convenience
    symbol?: string;
    alphaScore?: number;
    qualityTier?: "ACTIONABLE" | "WATCH" | "FILLER" | "INCOMPLETE";
    qualityReasonKR?: string;

    // Decision & Execution
    decisionSSOT?: {
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
        whaleReasonKR?: string;
        // [Phase 5] Tactical Conclusion SSOT
        tacticalConclusion?: {
            key: string;  // i18n key e.g. 'signal.shortGammaAboveMaxPain'
            direction: 'BULLISH' | 'BEARISH' | 'CAUTION' | 'NEUTRAL';
            priority: number;
        };
        // [Phase 6] Snapshot Data - Preserved at report generation time
        snapshotData?: {
            whaleIndex: number;
            whaleConfidence: 'HIGH' | 'MED' | 'LOW' | 'NONE';
            offExPct: number;
            netPremium: number;
            dominantContract?: string;
            capturedAt: string;  // ISO timestamp
        };
    };
    entryBand?: { low: number; high: number };
    hardCut?: number;
    tp1?: number;
    tp2?: number;

    // UI State
    isLoading?: boolean;
}
