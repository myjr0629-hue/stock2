// ============================================================================
// SignumHQ Shorts Engine — Core Types
// Viewer lock-in is everything.
// ============================================================================

// ---------------------------------------------------------------------------
// Market Data Types
// ---------------------------------------------------------------------------

export interface TickerStructure {
  ticker: string;
  price: number;
  callWall: number | null;
  putFloor: number | null;
  gammaFlipLevel: number | null;
  gammaRegime: 'positive' | 'negative' | 'neutral';
  gexValue: number;           // raw net GEX in dollars
  gexPercentile?: number;     // 0-100 (computed from history, optional)
  regimeDurationDays?: number; // how long in current regime
  darkPoolPercent: number;
  buyPct: number;
  sellPct: number;
  alphaScore?: number;        // "Context Score" for video branding
  iv?: number;
  pcr?: number;               // put/call ratio
}

export interface MarketSnapshot {
  timestamp: string;
  spy: number;
  qqq: number;
  vix: number;
  gexRegime: string;
  tickers: Record<string, TickerStructure>;
  isMock: boolean;
}

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export type EventType =
  | 'hidden_wall'
  | 'pressure_field'
  | 'dark_flow'
  | 'regime_clock'
  | 'ticker_xray'
  | 'dashboard_reveal'
  | 'gex_shift'
  | 'vix_spike'
  | 'dark_pool_spike'
  | 'whale'
  | 'insider_trade';

export interface MarketEvent {
  id: string;
  type: EventType;
  ticker: string;
  timestamp: string;
  title: string;
  description: string;
  data: TickerStructure;
  marketContext: Partial<MarketSnapshot>;
}

// ---------------------------------------------------------------------------
// Hook / Script Types
// ---------------------------------------------------------------------------

export interface HookCandidate {
  text: string;
  score: number;         // 0-100
  rationale: string;
}

export interface ScriptBeat {
  id: string;
  label: string;         // 'hook' | 'curiosity' | 'reveal' | 'data' | 'metaphor' | 'meaning' | 'product' | 'cta'
  startSec: number;
  endSec: number;
  text: string;
  emphasis?: string[];   // words to visually emphasize
}

// ---------------------------------------------------------------------------
// Caption Types
// ---------------------------------------------------------------------------

export interface CaptionSegment {
  id: string;
  text: string;
  startFrame: number;
  endFrame: number;
  emphasis?: boolean;    // visually emphasized word/phrase
  color?: string;        // override color for this segment
}

// ---------------------------------------------------------------------------
// Voice Types
// ---------------------------------------------------------------------------

export interface VoiceAsset {
  audioUrl: string;      // path or URL to audio file
  durationSec: number;
  provider: 'elevenlabs' | 'polly' | 'mock';
  isMock: boolean;
  timestamps?: WordTimestamp[];
}

export interface WordTimestamp {
  word: string;
  startMs: number;
  endMs: number;
}

// ---------------------------------------------------------------------------
// B-roll Types
// ---------------------------------------------------------------------------

export interface BrollAsset {
  url: string;           // path or URL to image/video
  type: 'image' | 'video' | 'none';
  provider: 'replicate' | 'local' | 'mock' | 'procedural';
  prompt?: string;
  isMock: boolean;
}

// ---------------------------------------------------------------------------
// Scoring Types
// ---------------------------------------------------------------------------

export interface ViewerLockInScore {
  totalScore: number;    // 0-100
  firstFrameShock: number;      // /25
  curiosityGap: number;         // /20
  visualMetaphorStrength: number; // /20
  retentionBeatDensity: number; // /15
  cognitiveSimplicity: number;  // /10
  productCuriosity: number;     // /10
  reasons: string[];
  pass: boolean;                // totalScore >= 80
}

export interface AlgorithmFitScore {
  totalScore: number;    // 0-100
  scrollStopPower: number;      // /25
  threeSecondCuriosityGap: number; // /20
  retentionBeatStrength: number;   // /20
  shareSavePotential: number;      // /15
  commentTrigger: number;          // /10
  platformFit: number;             // /10
  reasons: string[];
  pass: boolean;                   // totalScore >= 80
}

export interface MonetizationFitScore {
  totalScore: number;    // 0-100
  dataUniqueness: number;       // /25
  paidFeatureRelevance: number; // /25
  trustBuilding: number;        // /20
  siteVisitMotivation: number;  // /20
  complianceSafety: number;     // /10
  reasons: string[];
  pass: boolean;                // totalScore >= 75
}

export interface ComplianceSafetyResult {
  pass: boolean;
  violations: string[];
  cleanedText?: string;
}

// ---------------------------------------------------------------------------
// Quality Gate
// ---------------------------------------------------------------------------

export interface QualityGateResult {
  pass: boolean;
  checks: {
    singleCoreInsight: boolean;
    maxDataCards: boolean;
    complianceClean: boolean;
    disclaimerPresent: boolean;
    ctaPresent: boolean;
    firstFrameExists: boolean;
    captionLengthOk: boolean;
    durationOk: boolean;
    resolutionOk: boolean;
    mockDataMarked: boolean;
  };
  failures: string[];
}

// ---------------------------------------------------------------------------
// Video Template Types
// ---------------------------------------------------------------------------

export type VideoTemplate =
  | 'HiddenWallShort'
  | 'PressureFieldShort'
  | 'DarkFlowShort'
  | 'RegimeClockShort'
  | 'TickerXRayShort'
  | 'DashboardRevealShort'
  | 'MarketPressureBriefV20'
  | 'MarketPressureBriefV21'
  | 'MarketPressureBriefV21_1'
  | 'MarketPressureBriefV21-2'
  | 'MarketPressureBriefV22'
  | 'MarketPressureBriefV23'
  | 'MarketPressureBriefV24'
  | string;

export type VideoFormat = 'viral' | 'authority' | 'conversion';

export interface DataCardInput {
  label: string;
  value: string;
  color?: string;
  unit?: string;
}

export interface StructureVisualInput {
  price: number;
  callWall: number | null;
  putFloor: number | null;
  gammaFlipLevel: number | null;
  nearestWall: 'call' | 'put' | 'flip' | null;
  distancePercent: number | null;
  // Mission 26 Dark Pool Additions
  darkPoolNotional?: number;
  darkPoolPercentile?: number;
  offExchangeVolumeRatio?: number;
  flowDirection?: string;
  regime?: string;
}

// ---------------------------------------------------------------------------
// Master Video Input
// ---------------------------------------------------------------------------

export interface ShortsVideoInput {
  videoId: string;
  template: VideoTemplate;
  format: VideoFormat;
  ticker: string;
  title: string;
  hook: string;
  scriptBeats: ScriptBeat[];
  captions: CaptionSegment[];
  dataCards: DataCardInput[];
  structureVisual: StructureVisualInput;
  broll: BrollAsset;
  voice: VoiceAsset;
  disclaimer: string;
  cta: string;
  isMock: boolean;
  durationSec: number;
  fps: number;
  width: number;
  height: number;
}
