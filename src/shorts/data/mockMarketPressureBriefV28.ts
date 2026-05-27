import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V28_BEATS: ScriptBeat[] = [
  { id: 'event-shock', label: 'hook', startSec: 0, endSec: 2.0, text: "Four hundred twenty million off-exchange flow just printed near SPY's six hundred wall.", emphasis: ['Four', 'hundred', 'twenty', 'million', 'off-exchange', 'flow'] },
  { id: 'hidden-wall', label: 'info', startSec: 2.0, endSec: 4.5, text: "Most charts show price. They do not show this layer.", emphasis: ['Most', 'charts', 'show', 'price'] },
  { id: 'pressure-zone', label: 'pressure', startSec: 4.5, endSec: 7.2, text: "When price moves near a wall, pressure can build fast.", emphasis: ['pressure', 'build', 'fast'] },
  { id: 'map-not-pred', label: 'regime', startSec: 7.2, endSec: 10.0, text: "This is not a prediction. It is a pressure map.", emphasis: ['not', 'prediction', 'pressure', 'map'] },
  { id: 'product-unlock', label: 'unlock', startSec: 10.0, endSec: 14.2, text: "SignumHQ shows the structure behind price.", emphasis: ['SignumHQ', 'shows', 'structure'] },
  { id: 'cta-loop', label: 'cta', startSec: 14.2, endSec: 18.5, text: "See the hidden layer at SignumHQ.", emphasis: ['hidden', 'layer', 'SignumHQ'] },
];

export const MOCK_V28_CAPTIONS: CaptionSegment[] = [
  // --- Scene 01 (0.0s - 2.0s, 0f - 60f) ---
  // The layout of Scene 01 has its own custom visual elements.
  // We will display: NEAR SPY'S $600 WALL as a readable context caption at the bottom.
  { id: 'c1-p2', text: "NEAR SPY'S $600 WALL", startFrame: 0, endFrame: 60, emphasis: true, color: '#fbbf24' },

  // --- Scene 02 (2.0s - 4.5s, 60f - 135f) ---
  { id: 'c2-p1', text: 'NORMAL CHARTS SHOW PRICE.', startFrame: 60, endFrame: 98, emphasis: false },
  { id: 'c2-p2', text: 'NOT THE WALL.', startFrame: 98, endFrame: 135, emphasis: true, color: '#f87171' },

  // --- Scene 03 (4.5s - 7.2s, 135f - 216f) ---
  { id: 'c3-p1', text: 'SPY IS 1.3% FROM A WALL', startFrame: 135, endFrame: 175, emphasis: false },
  { id: 'c3-p2', text: "YOU CAN'T SEE", startFrame: 175, endFrame: 216, emphasis: true, color: '#f87171' },

  // --- Scene 04 (7.2s - 10.0s, 216f - 300f) ---
  { id: 'c4-p1', text: 'NOT A PREDICTION.', startFrame: 216, endFrame: 258, emphasis: false },
  { id: 'c4-p2', text: 'A PRESSURE MAP.', startFrame: 258, endFrame: 300, emphasis: true, color: '#22d3ee' },

  // --- Scene 05 (10.0s - 14.2s, 300f - 426f) ---
  { id: 'c5-p1', text: 'SIGNUMHQ SHOWS', startFrame: 300, endFrame: 309, emphasis: true, color: '#22d3ee' },
  { id: 'c5-p2', text: 'THE STRUCTURE BEHIND PRICE', startFrame: 309, endFrame: 426, emphasis: true, color: '#22d3ee' },

  // --- Scene 06 (14.2s - 18.5s, 426f - 555f) ---
  { id: 'c6-p1', text: 'SEE THE STRUCTURE BEHIND PRICE', startFrame: 426, endFrame: 490, emphasis: false },
  { id: 'c6-p2', text: 'SIGNUMHQ.COM', startFrame: 490, endFrame: 555, emphasis: true, color: '#22d3ee' },
];

export function createMockMarketPressureBriefV28Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v28-${Date.now()}`,
    template: 'MarketPressureBriefV28' as any,
    format: 'viral',
    ticker: 'SPY',
    title: 'V28 Revenue-Grade Viewer Lock-in Rebuild',
    hook: "Four hundred twenty million off-exchange flow just printed near SPY's six hundred wall.",
    scriptBeats: MOCK_V28_BEATS,
    captions: MOCK_V28_CAPTIONS,
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
