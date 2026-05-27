import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V33_BEATS: ScriptBeat[] = [
  { id: 'event-leak', label: 'hook', startSec: 0, endSec: 1.5, text: "Four hundred twenty million dollars moved off exchange near SPY’s six hundred wall.", emphasis: ['Four', 'hundred', 'twenty', 'million', 'dollars'] },
  { id: 'normal-charts-lie', label: 'info', startSec: 1.5, endSec: 2.6, text: "Normal charts show price, not the wall.", emphasis: ['Normal', 'charts', 'show', 'price', 'not'] },
  { id: 'the-gap', label: 'pressure', startSec: 2.6, endSec: 4.6, text: "The gap is only one point three percent.", emphasis: ['gap', 'one', 'point', 'three', 'percent'] },
  { id: 'pressure-map', label: 'regime', startSec: 4.6, endSec: 6.0, text: "This is where pressure can build.", emphasis: ['where', 'pressure', 'can', 'build'] },
  { id: 'product-unlock', label: 'unlock', startSec: 6.0, endSec: 13.6, text: "SignumHQ reveals the structure behind price.", emphasis: ['SignumHQ', 'reveals', 'structure'] },
  { id: 'cta-loop-hook', label: 'cta', startSec: 13.6, endSec: 18.5, text: "See the structure behind price. SignumHQ.com", emphasis: ['structure', 'price', 'SignumHQ.com'] },
];

export const MOCK_V33_CAPTIONS: CaptionSegment[] = [
  // --- Scene 01 (0.0s - 1.5s, 0f - 45f) ---
  { id: 'c1-p1', text: "NEAR SPY'S $600 WALL", startFrame: 0, endFrame: 45, emphasis: true, color: '#f59e0b' },

  // --- Scene 02 (1.5s - 2.6s, 45f - 78f) ---
  { id: 'c2-p1', text: 'NORMAL CHARTS SHOW PRICE', startFrame: 45, endFrame: 65, emphasis: false },
  { id: 'c2-p2', text: 'NOT THE WALL', startFrame: 65, endFrame: 78, emphasis: true, color: '#f87171' },

  // --- Scene 03 (2.6s - 4.6s, 78f - 138f) ---
  { id: 'c3-p1', text: 'THE GAP IS ONLY 1.3%', startFrame: 78, endFrame: 138, emphasis: true, color: '#fbbf24' },

  // --- Scene 04 (4.6s - 6.0s, 138f - 180f) ---
  { id: 'c4-p1', text: 'THIS IS WHERE PRESSURE CAN BUILD', startFrame: 138, endFrame: 180, emphasis: true, color: '#22d3ee' },

  // --- Scene 05 (6.0s - 13.6s, 180f - 408f) ---
  { id: 'c5-p1', text: 'SIGNUMHQ REVEALS', startFrame: 180, endFrame: 192, emphasis: true, color: '#22d3ee' }, // under 0.4s reveal threshold
  { id: 'c5-p2', text: 'THE STRUCTURE BEHIND PRICE', startFrame: 192, endFrame: 408, emphasis: true, color: '#22d3ee' },

  // --- Scene 06 (13.6s - 18.5s, 408f - 555f) ---
  { id: 'c6-p1', text: 'SEE THE STRUCTURE BEHIND PRICE', startFrame: 408, endFrame: 468, emphasis: false },
  { id: 'c6-p2', text: 'SIGNUMHQ.COM', startFrame: 468, endFrame: 555, emphasis: true, color: '#22d3ee' },
];

export function createMockMarketPressureBriefV33Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v33-${Date.now()}`,
    template: 'MarketPressureBriefV33' as any,
    format: 'viral',
    ticker: 'SPY',
    title: 'V33 Frame-0 Event Shock Fix',
    hook: "Four hundred twenty million dollars moved off exchange near SPY’s six hundred wall.",
    scriptBeats: MOCK_V33_BEATS,
    captions: MOCK_V33_CAPTIONS,
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
