import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

// ============================================================================
// SPY SCENARIO: Live Morning Spec (지수 전체 특보)
// ============================================================================
export const MOCK_V35_SPY_BEATS: ScriptBeat[] = [
  { id: 'scan-boot', label: 'intro', startSec: 0, endSec: 0.4, text: "System active.", emphasis: [] },
  { id: 'breaking-shock', label: 'hook', startSec: 0.4, endSec: 5.0, text: "Live Morning Spec: Four hundred twenty million off-exchange print detected near SPY’s six hundred wall.", emphasis: ['Live', 'Morning', 'Spec', 'Four', 'hundred', 'twenty', 'million'] },
  { id: 'normal-charts-lie', label: 'info', startSec: 5.0, endSec: 8.5, text: "Normal charts show only price. They cannot expose where institutional pressure is clustering.", emphasis: ['Normal', 'cannot', 'expose', 'institutional'] },
  { id: 'scanner-sweep', label: 'unlock', startSec: 8.5, endSec: 13.5, text: "Our terminal sweeps to unlock the hidden layer: Call Wall, Put Floor, Gamma Flip. The gap is only 1.3%.", emphasis: ['sweeps', 'unlock', 'hidden', 'layer'] },
  { id: 'insight-payoff', label: 'regime', startSec: 13.5, endSec: 18.5, text: "Not a call. A live pressure map. Force is concentrating near the critical boundary.", emphasis: ['Not', 'live', 'pressure', 'map', 'Force'] },
  { id: 'cta-loop', label: 'cta', startSec: 18.5, endSec: 24.0, text: "See the hidden structure today at SignumHQ.com.", emphasis: ['hidden', 'structure', 'SignumHQ.com'] },
];

export const MOCK_V35_SPY_CAPTIONS: CaptionSegment[] = [
  { id: 'c0-p1', text: "SYSTEM SCAN ACTIVE", startFrame: 0, endFrame: 12, emphasis: true, color: '#22d3ee' },
  { id: 'c1-p1', text: "LIVE MORNING SPEC", startFrame: 12, endFrame: 42, emphasis: true, color: '#f87171' },
  { id: 'c1-p2', text: "$420M OFF-EXCHANGE DETECTED", startFrame: 42, endFrame: 105, emphasis: true, color: '#22d3ee' },
  { id: 'c1-p3', text: "NEAR SPY'S $600 WALL", startFrame: 105, endFrame: 149, emphasis: true, color: '#fbbf24' },
  { id: 'c2-p1', text: 'NORMAL CHARTS SHOW ONLY PRICE', startFrame: 150, endFrame: 210, emphasis: false },
  { id: 'c2-p2', text: 'THEY CANNOT EXPOSE', startFrame: 210, endFrame: 235, emphasis: false },
  { id: 'c2-p3', text: 'INSTITUTIONAL PRESSURE CLUSTERING', startFrame: 235, endFrame: 280, emphasis: true, color: '#f87171' },
  { id: 'c3-p1', text: 'SWEEPING HIDDEN STRUCTURE', startFrame: 280, endFrame: 305, emphasis: true, color: '#22d3ee' },
  { id: 'c3-p2', text: 'CALL WALL / PUT FLOOR / FLIP', startFrame: 305, endFrame: 360, emphasis: true, color: '#22d3ee' },
  { id: 'c3-p3', text: 'THE GAP IS ONLY 1.3%', startFrame: 360, endFrame: 395, emphasis: true, color: '#fbbf24' },
  { id: 'c4-p1', text: 'NOT A CALL. A PRESSURE MAP.', startFrame: 395, endFrame: 445, emphasis: true, color: '#fbbf24' },
  { id: 'c4-p2', text: 'FORCE IS CONCENTRATING NEAR BND', startFrame: 445, endFrame: 525, emphasis: true, color: '#22d3ee' },
  { id: 'c5-p1', text: 'SEE THE HIDDEN STRUCTURE TODAY', startFrame: 525, endFrame: 610, emphasis: false },
  { id: 'c5-p2', text: 'SIGNUMHQ.COM', startFrame: 610, endFrame: 710, emphasis: true, color: '#22d3ee' },
];

// ============================================================================
// NVDA SCENARIO: Ticker Spotlight (개별종목 긴급 락인)
// ============================================================================
export const MOCK_V35_NVDA_BEATS: ScriptBeat[] = [
  { id: 'scan-boot', label: 'intro', startSec: 0, endSec: 0.4, text: "System active.", emphasis: [] },
  { id: 'breaking-shock', label: 'hook', startSec: 0.4, endSec: 5.0, text: "Live Ticker Spotlight: Six hundred eighty million institutional blocks exposed near Nvidia’s one hundred forty wall.", emphasis: ['Live', 'Ticker', 'Spotlight', 'Six', 'hundred', 'eighty', 'million'] },
  { id: 'normal-charts-lie', label: 'info', startSec: 5.0, endSec: 8.5, text: "Generic candle charts only show historical price. They miss where mass pressure is building.", emphasis: ['Generic', 'only', 'historical', 'miss'] },
  { id: 'scanner-sweep', label: 'unlock', startSec: 8.5, endSec: 13.5, text: "Our scanner unlocks the institutional footprint: Core Wall, Gamma Flip, Put Floor. The gap is only 1.8%.", emphasis: ['scanner', 'footprint', 'Core', 'Wall'] },
  { id: 'insight-payoff', label: 'regime', startSec: 13.5, endSec: 18.5, text: "Not a prediction. A live tactical map. Extreme squeeze tension is loading at the edge.", emphasis: ['Not', 'tactical', 'map', 'squeeze', 'tension'] },
  { id: 'cta-loop', label: 'cta', startSec: 18.5, endSec: 24.0, text: "Unlock the hidden structure now at SignumHQ.com.", emphasis: ['Unlock', 'structure', 'SignumHQ.com'] },
];

export const MOCK_V35_NVDA_CAPTIONS: CaptionSegment[] = [
  { id: 'c0-p1', text: "SYSTEM SCAN ACTIVE", startFrame: 0, endFrame: 12, emphasis: true, color: '#22c55e' },
  { id: 'c1-p1', text: "LIVE TICKER SPOTLIGHT", startFrame: 12, endFrame: 42, emphasis: true, color: '#f87171' },
  { id: 'c1-p2', text: "$680M BLOCKS EXPOSED", startFrame: 42, endFrame: 105, emphasis: true, color: '#22c55e' },
  { id: 'c1-p3', text: "NEAR NVIDIA'S $140 WALL", startFrame: 105, endFrame: 149, emphasis: true, color: '#fbbf24' },
  { id: 'c2-p1', text: 'GENERIC CANDLE CHARTS SHOW PRICE', startFrame: 150, endFrame: 210, emphasis: false },
  { id: 'c2-p2', text: 'THEY MISS WHERE', startFrame: 210, endFrame: 235, emphasis: false },
  { id: 'c2-p3', text: 'MASS PRESSURE IS BUILDING', startFrame: 235, endFrame: 280, emphasis: true, color: '#f87171' },
  { id: 'c3-p1', text: 'UNLOCKING INSTITUTIONAL FOOTPRINT', startFrame: 280, endFrame: 305, emphasis: true, color: '#22c55e' },
  { id: 'c3-p2', text: 'CORE WALL / FLIP / FLOOR', startFrame: 305, endFrame: 360, emphasis: true, color: '#22c55e' },
  { id: 'c3-p3', text: 'THE GAP IS ONLY 1.8%', startFrame: 360, endFrame: 395, emphasis: true, color: '#fbbf24' },
  { id: 'c4-p1', text: 'NOT A PREDICTION. A TACTICAL MAP.', startFrame: 395, endFrame: 445, emphasis: true, color: '#fbbf24' },
  { id: 'c4-p2', text: 'EXTREME SQUEEZE TENSION LOADING', startFrame: 445, endFrame: 525, emphasis: true, color: '#22c55e' },
  { id: 'c5-p1', text: 'UNLOCK THE HIDDEN STRUCTURE NOW', startFrame: 525, endFrame: 610, emphasis: false },
  { id: 'c5-p2', text: 'SIGNUMHQ.COM', startFrame: 610, endFrame: 710, emphasis: true, color: '#22c55e' },
];

export function createMockMarketPressureBriefV35Input(ticker: 'SPY' | 'NVDA' = 'SPY'): ShortsVideoInput {
  const isSpy = ticker === 'SPY';

  return {
    videoId: `mock-market-pressure-v35-${ticker.toLowerCase()}-${Date.now()}`,
    template: 'MarketPressureBriefV35' as any,
    format: 'viral',
    ticker,
    title: isSpy ? 'V35 Live Morning Spec' : 'V35 Ticker Spotlight Nvidia',
    hook: isSpy 
      ? "Live Morning Spec: Four hundred twenty million off-exchange print detected near SPY’s six hundred wall."
      : "Live Ticker Spotlight: Six hundred eighty million institutional blocks exposed near Nvidia’s one hundred forty wall.",
    scriptBeats: isSpy ? MOCK_V35_SPY_BEATS : MOCK_V35_NVDA_BEATS,
    captions: isSpy ? MOCK_V35_SPY_CAPTIONS : MOCK_V35_NVDA_CAPTIONS,
    dataCards: [],
    structureVisual: {
      price: isSpy ? 592.31 : 137.52,
      callWall: isSpy ? 600.00 : 140.00,
      putFloor: isSpy ? 580.00 : 130.00,
      gammaFlipLevel: isSpy ? 588.00 : 135.00,
      nearestWall: 'call',
      distancePercent: isSpy ? 1.3 : 1.8,
      darkPoolNotional: isSpy ? 420000000 : 680000000,
      darkPoolPercentile: isSpy ? 91 : 95,
      offExchangeVolumeRatio: isSpy ? 2.4 : 3.1,
      flowDirection: isSpy ? 'clustered near upper structure' : 'buying momentum at lower flips',
      regime: isSpy ? 'negative gamma pressure zone' : 'gamma squeeze ready regime',
    },
    broll: { url: 'shorts/broll/kling_terminal.mp4', type: 'video' as const, provider: 'replicate' as const, isMock: false },
    voice: { 
      audioUrl: isSpy ? 'shorts/audio/v35_spy_voice.mp3' : 'shorts/audio/v35_nvda_voice.mp3', 
      durationSec: 24.0, 
      provider: 'elevenlabs', 
      isMock: false 
    },
    disclaimer: 'Institutional flow analysis. Real-time updates at SignumHQ.com. Not financial advice.',
    cta: isSpy 
      ? 'GO TO SIGNUMHQ.COM TO UNLOCK LIVE STRUCTURE MAPS.'
      : 'UNLOCK NVIDIA STRUCTURE REALTIME AT SIGNUMHQ.COM.',
    isMock: false,
    durationSec: 24.0,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
