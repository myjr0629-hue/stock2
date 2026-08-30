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

/**
 * 섹터 스냅샷의 종목 한 줄.
 *
 * ⚠️ 측정값은 전부 null 을 가질 수 있다. 예전에는 이 API 가 `?? 0` 으로
 *    0 을 채워 내보냈고, 그래서 화면·AI 가 그것을 **측정된 0** 으로 읽었다
 *    (GEX 미수집이 「감마 0」, change_pct 누락이 「전 종목 보합」).
 *    측정 못 한 것은 여기서부터 null 로 흘러야 한다.
 */
export interface TickerSnapshot {
    ticker: string;
    close_price: number | null;
    change_pct: number | null;
    alpha_score: number | null;
    grade: string | null;
    volume: number | null;
    gex: number | null;
    pcr: number | null;
    gamma_regime: string | null;      // 'LONG' | 'SHORT' | 'NEUTRAL' | null(미측정)
    max_pain: number | null;
    call_wall: number | null;
    put_floor: number | null;
    rsi: number | null;
    rvol: number | null;
    sparkline: number[];
    verdict: string;                  // 'HOLD' | 'BUY_DIP' | 'HEDGE' | 'TRIM'
    analysis_kr: string;              // 한줄 AI 요약
}

export interface NewsDigestItem {
    headline: string;                 // Original English headline
    summaryKR: string;                // Korean translation
    summaryJP: string;                // Japanese translation
    insightKR: string;                // AI insight (Korean)
    insightEN: string;                // AI insight (English)
    insightJP: string;                // AI insight (Japanese)
    source: string;                   // Publisher name
    sentiment: 'positive' | 'negative' | 'neutral';
    tickers: string[];                // Related M7 tickers
    publishedAt: string;              // ISO datetime
}

export interface BriefingData {
    headline: string;                 // Bold 18px headline (Korean)
    headlineEN?: string;              // English headline
    headlineJP?: string;              // Japanese headline
    bullets: string[];                // Bullet points (Korean, keywords wrapped in <mark>)
    bulletsEN?: string[];             // English bullets
    bulletsJP?: string[];             // Japanese bullets
    watchpoints: string[];            // Key levels to watch (Korean)
    watchpointsEN?: string[];         // English watchpoints
    watchpointsJP?: string[];         // Japanese watchpoints
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
    newsDigest?: NewsDigestItem[];    // AI-curated news digest
    newsSentimentOverall?: string;    // 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL'
    macroContext?: {                  // Market environment for NEXT DAY OUTLOOK
        vix: { price: number; changePct: number };
        spx: { price: number; changePct: number };
        nq: { price: number; changePct: number };
        tnx: { price: number; changePct: number };   // US 10Y yield
        fearGreed?: number;           // 0-100 CNN Fear & Greed
    };
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
