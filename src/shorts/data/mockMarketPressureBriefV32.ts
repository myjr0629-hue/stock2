import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V32_BEATS: ScriptBeat[] = [
  { id: 'event-leak', label: 'hook', startSec: 0, endSec: 1.8, text: "Four hundred twenty million dollars moved off exchange near SPY’s six hundred wall.", emphasis: ['Four', 'hundred', 'twenty', 'million', 'dollars'] },
  { id: 'the-gap', label: 'pressure', startSec: 1.8, endSec: 3.2, text: "The gap is only one point three percent.", emphasis: ['gap', 'one', 'point', 'three', 'percent'] },
  { id: 'normal-charts-lie', label: 'info', startSec: 3.2, endSec: 6.0, text: "Normal charts show price, not the wall.", emphasis: ['Normal', 'charts', 'show', 'price', 'not'] },
  { id: 'pressure-map', label: 'regime', startSec: 6.0, endSec: 8.0, text: "This is a pressure map, not a price call.", emphasis: ['pressure', 'map', 'price', 'call'] },
  { id: 'product-unlock', label: 'unlock', startSec: 8.0, endSec: 13.6, text: "SignumHQ reveals the structure behind price.", emphasis: ['SignumHQ', 'reveals', 'structure'] },
  { id: 'cta-loop-hook', label: 'cta', startSec: 13.6, endSec: 18.5, text: "See the structure behind price. SignumHQ.com", emphasis: ['structure', 'price', 'SignumHQ.com'] },
];

export const MOCK_V32_CAPTIONS: CaptionSegment[] = [
  // --- Scene 01 (0.0s - 1.8s, 0f - 54f) ---
  { id: 'c1-p1', text: "NEAR SPY'S $600 WALL", startFrame: 0, endFrame: 54, emphasis: true, color: '#f59e0b' },

  // --- Scene 02 (1.8s - 3.2s, 54f - 96f) ---
  { id: 'c2-p1', text: 'NORMAL CHARTS SHOW PRICE', startFrame: 54, endFrame: 78, emphasis: false },
  { id: 'c2-p2', text: 'NOT THE WALL', startFrame: 78, endFrame: 96, emphasis: true, color: '#f87171' },

  // --- Scene 03 (3.2s - 6.0s, 96f - 180f) ---
  { id: 'c3-p1', text: 'THE GAP IS ONLY 1.3%', startFrame: 96, endFrame: 180, emphasis: true, color: '#fbbf24' },

  // --- Scene 04 (6.0s - 8.0s, 180f - 240f) ---
  { id: 'c4-p1', text: 'THIS IS A PRESSURE MAP', startFrame: 180, endFrame: 210, emphasis: true, color: '#22d3ee' },
  { id: 'c4-p2', text: 'NOT A PRICE CALL', startFrame: 210, endFrame: 240, emphasis: false },

  // --- Scene 05 (8.0s - 13.6s, 240f - 408f) ---
  { id: 'c5-p1', text: 'SIGNUMHQ REVEALS', startFrame: 240, endFrame: 252, emphasis: true, color: '#22d3ee' }, // under 0.4s reveal threshold
  { id: 'c5-p2', text: 'THE STRUCTURE BEHIND PRICE', startFrame: 252, endFrame: 408, emphasis: true, color: '#22d3ee' },

  // --- Scene 06 (13.6s - 18.5s, 408f - 555f) ---
  { id: 'c6-p1', text: 'SEE THE STRUCTURE BEHIND PRICE', startFrame: 408, endFrame: 468, emphasis: false },
  { id: 'c6-p2', text: 'SIGNUMHQ.COM', startFrame: 468, endFrame: 555, emphasis: true, color: '#22d3ee' },
];

export function createMockMarketPressureBriefV32Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v32-${Date.now()}`,
    template: 'MarketPressureBriefV32' as any,
    format: 'viral',
    ticker: 'SPY',
    title: 'V32 First-6-Seconds Revenue Lock Rebuild',
    hook: "Four hundred twenty million dollars moved off exchange near SPY’s six hundred wall.",
    scriptBeats: MOCK_V32_BEATS,
    captions: MOCK_V32_CAPTIONS,
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
    voice: { audioUrl: 'shorts/audio/v26_voice.mp3', durationSec: 18.5, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Institutional flow analysis. Real-time updates at SignumHQ.com. Not financial advice.',
    cta: 'GO TO SIGNUMHQ.COM TO UNLOCK LIVE STRUCTURE MAPS.',
    isMock: false,
    durationSec: 18.5,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
