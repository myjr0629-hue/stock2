import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V34_BEATS: ScriptBeat[] = [
  { id: 'scan-boot', label: 'intro', startSec: 0, endSec: 0.4, text: "System active.", emphasis: [] },
  { id: 'breaking-shock', label: 'hook', startSec: 0.4, endSec: 5.0, text: "Four hundred twenty million off-exchange flow just printed near SPY’s six hundred wall.", emphasis: ['Four', 'hundred', 'twenty', 'million'] },
  { id: 'normal-charts-lie', label: 'info', startSec: 5.0, endSec: 8.5, text: "Normal charts show price. They cannot show where pressure is clustering.", emphasis: ['Normal', 'cannot', 'show', 'where'] },
  { id: 'scanner-sweep', label: 'unlock', startSec: 8.5, endSec: 13.5, text: "Our scanner sweeps to reveal the structure: Call Wall, Put Floor, and Gamma Flip.", emphasis: ['scanner', 'sweeps', 'reveal'] },
  { id: 'insight-payoff', label: 'regime', startSec: 13.5, endSec: 18.5, text: "Not a call. A live pressure map. Force is concentrating near the boundary.", emphasis: ['Not', 'live', 'pressure', 'map', 'Force'] },
  { id: 'cta-loop', label: 'cta', startSec: 18.5, endSec: 24.0, text: "See the hidden structure at SignumHQ.com.", emphasis: ['hidden', 'structure', 'SignumHQ.com'] },
];

export const MOCK_V34_CAPTIONS: CaptionSegment[] = [
  // --- Scene 00: Signature Scan Alert Boot (0.0s - 0.4s, 0f - 12f) ---
  { id: 'c0-p1', text: "STRUCTURE SCAN ACTIVE", startFrame: 0, endFrame: 12, emphasis: true, color: '#22d3ee' },

  // --- Scene 01: Breaking News Shock (0.4s - 5.0s, 12f - 150f) ---
  { id: 'c1-p1', text: "NEAR SPY'S $600 WALL", startFrame: 12, endFrame: 150, emphasis: true, color: '#fbbf24' },

  // --- Scene 02: Normal Chart vs Hidden Layer (5.0s - 8.5s, 150f - 255f) ---
  { id: 'c2-p1', text: 'NORMAL CHARTS SHOW PRICE', startFrame: 150, endFrame: 195, emphasis: false },
  { id: 'c2-p2', text: 'THEY CANNOT SHOW', startFrame: 195, endFrame: 220, emphasis: false },
  { id: 'c2-p3', text: 'WHERE PRESSURE CLUSTERS', startFrame: 220, endFrame: 255, emphasis: true, color: '#f87171' },

  // --- Scene 03: Scanner Sweep & Reveal (8.5s - 13.5s, 255f - 405f) ---
  { id: 'c3-p1', text: 'SCANNING SHQ STRUCTURE', startFrame: 255, endFrame: 285, emphasis: true, color: '#22d3ee' },
  { id: 'c3-p2', text: 'CALL WALL / PUT FLOOR / FLIP', startFrame: 285, endFrame: 405, emphasis: true, color: '#22d3ee' },

  // --- Scene 04: Insight Payoff (13.5s - 18.5s, 405f - 555f) ---
  { id: 'c4-p1', text: 'NOT A CALL. A PRESSURE MAP.', startFrame: 405, endFrame: 485, emphasis: true, color: '#fbbf24' },
  { id: 'c4-p2', text: 'FORCE IS CONCENTRATING', startFrame: 485, endFrame: 555, emphasis: true, color: '#22d3ee' },

  // --- Scene 05: Premium CTA (18.5s - 24.0s, 555f - 720f) ---
  { id: 'c5-p1', text: 'SEE THE HIDDEN STRUCTURE', startFrame: 555, endFrame: 630, emphasis: false },
  { id: 'c5-p2', text: 'SIGNUMHQ.COM', startFrame: 630, endFrame: 720, emphasis: true, color: '#22d3ee' },
];

export function createMockMarketPressureBriefV34Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v34-${Date.now()}`,
    template: 'MarketPressureBriefV34' as any,
    format: 'viral',
    ticker: 'SPY',
    title: 'V34 Alert Boot & 24s Rebuild',
    hook: "Four hundred twenty million off-exchange flow just printed near SPY's six hundred wall.",
    scriptBeats: MOCK_V34_BEATS,
    captions: MOCK_V34_CAPTIONS,
    dataCards: [],
    structureVisual: {
      price: 592.31,
      callWall: 600.00,
      putFloor: 580.00,
      gammaFlipLevel: 588.00,
      nearestWall: 'call',
      distancePercent: 1.3,
      darkPoolNotional: 420000000,
      darkPoolPercentile: 91,
      offExchangeVolumeRatio: 2.4,
      flowDirection: 'clustered near upper structure',
      regime: 'negative gamma pressure zone',
    },
    broll: { url: 'shorts/broll/kling_terminal.mp4', type: 'video' as const, provider: 'replicate' as const, isMock: false },
    voice: { audioUrl: 'shorts/audio/v34_voice.mp3', durationSec: 24.0, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Institutional flow analysis. Real-time updates at SignumHQ.com. Not financial advice.',
    cta: 'GO TO SIGNUMHQ.COM TO UNLOCK LIVE STRUCTURE MAPS.',
    isMock: false,
    durationSec: 24.0,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
