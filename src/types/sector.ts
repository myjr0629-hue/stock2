// ============================================================================
// SECTOR INTELLIGENCE PLATFORM — Core Types
// Templatized architecture for M7, Physical AI, Bio, Crypto, etc.
// ============================================================================

export interface SectorTheme {
    accent: string;       // Primary accent color (tailwind class)
    accentHex: string;    // Hex for dynamic styles
    bg: string;           // Card background
    border: string;       // Border color class
    glow: string;         // Glow effect color
    gradient: string;     // Gradient for headers
}

export interface SectorConfig {
    id: string;                          // 'm7' | 'physical_ai' | 'bio' | 'crypto'
    name: string;                        // 'Magnificent 7'
    shortName: string;                   // 'M7'
    description: string;                 // 'Tech Giants Driving AI Revolution'
    icon: string;                        // Emoji or icon identifier
    theme: SectorTheme;
    tickers: string[];                   // ['AAPL','NVDA','MSFT',...]
    apiEndpoints: {
        live: string;                    // '/api/intel/m7'
        snapshot: string;                // '/api/intel/snapshot?sector=m7'
        calendar?: string;               // '/api/intel/m7-calendar'
    };
}

// ============================================================================
// Snapshot Data Types (Supabase daily_sector_snapshots)
// ============================================================================

export interface TickerSnapshot {
    ticker: string;
    close_price: number;
    change_pct: number;
    alpha_score: number;
    grade: string;
    volume: number;
    gex: number;
    pcr: number;
    gamma_regime: string;             // 'LONG' | 'SHORT' | 'NEUTRAL'
    max_pain: number;
    call_wall: number;
    put_floor: number;
    rsi: number;
    rvol: number;
    sparkline: number[];
    verdict: string;                  // 'HOLD' | 'BUY_DIP' | 'HEDGE' | 'TRIM'
    analysis_kr: string;              // 한줄 AI 요약
}

export interface BriefingData {
    headline: string;                 // Bold 18px headline
    bullets: string[];                // 3 bullet points (keywords wrapped in <mark>)
    watchpoints: string[];            // Key levels to watch
}

export interface SectorSummary {
    avg_alpha: number;
    gainers: number;
    losers: number;
    dominant_regime: string;
    avg_pcr: number;
    total_gex: number;
    outlook: string;                  // 'BULLISH' | 'BEARISH' | 'NEUTRAL'
    next_day_briefing_kr: string;     // Legacy string (backward compat)
    briefing?: BriefingData;          // Structured briefing (new)
}

export interface SnapshotData {
    meta: {
        snapshot_timestamp: string;   // ISO datetime (ET market close)
        sector: string;
        locked_until: string;         // ISO datetime (next market close)
    };
    tickers: TickerSnapshot[];
    sector_summary: SectorSummary;
}

export interface DailySectorSnapshot {
    id: string;
    sector_id: string;
    snapshot_date: string;            // YYYY-MM-DD
    data_json: SnapshotData;
    created_at: string;
}

// ============================================================================
// Extended IntelQuote (adds RSI, RVOL, VWAP for Session Grid)
// ============================================================================

export interface IntelQuoteExtended {
    ticker: string;
    price: number;
    changePct: number;
    prevClose: number;
    volume: number;
    extendedPrice: number;
    extendedChangePct: number;
    extendedLabel: string;
    session: string;
    alphaScore: number;
    grade: string;
    // Options data
    maxPain: number;
    callWall: number;
    putFloor: number;
    gex: number;
    pcr: number;
    gammaRegime: string;
    sparkline: number[];
    // Extended indicators (new)
    rsi?: number;
    rvol?: number;
    vwapDist?: number;              // % distance from VWAP
    netPremium?: number;            // Net options premium flow
    // Triple-A alignment
    tripleA?: {
        direction: boolean;
        acceleration: boolean;
        accumulation: boolean;
    };
}
