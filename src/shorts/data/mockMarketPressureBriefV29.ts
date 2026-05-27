import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V29_BEATS: ScriptBeat[] = [
  { id: 'event-alert', label: 'hook', startSec: 0, endSec: 2.2, text: "Four hundred twenty million dollars moved off exchange near SPY’s six hundred wall.", emphasis: ['Four', 'hundred', 'twenty', 'million', 'dollars'] },
  { id: 'normal-charts', label: 'info', startSec: 2.2, endSec: 4.8, text: "Normal charts show price. Not the wall.", emphasis: ['Normal', 'charts', 'show', 'price', 'Not'] },
  { id: 'the-gap', label: 'pressure', startSec: 4.8, endSec: 7.4, text: "SPY is one point three percent from a wall you can’t see.", emphasis: ['one', 'point', 'three', 'percent', 'wall'] },
  { id: 'pressure-map', label: 'regime', startSec: 7.4, endSec: 10.2, text: "This is not a prediction. It is a pressure map.", emphasis: ['prediction', 'pressure', 'map'] },
  { id: 'product-unlock', label: 'unlock', startSec: 10.2, endSec: 14.8, text: "SignumHQ shows the structure behind price.", emphasis: ['SignumHQ', 'shows', 'structure'] },
  { id: 'cta-loop', label: 'cta', startSec: 14.8, endSec: 18.5, text: "See the structure behind price. SignumHQ.com", emphasis: ['structure', 'price', 'SignumHQ.com'] },
];

export const MOCK_V29_CAPTIONS: CaptionSegment[] = [
  // --- Scene 01 (0.0s - 2.2s, 0f - 66f) ---
  { id: 'c1-p1', text: "NEAR SPY'S $600 WALL", startFrame: 0, endFrame: 66, emphasis: true, color: '#f59e0b' },

  // --- Scene 02 (2.2s - 4.8s, 66f - 144f) ---
  { id: 'c2-p1', text: 'NORMAL CHARTS SHOW PRICE.', startFrame: 66, endFrame: 105, emphasis: false },
  { id: 'c2-p2', text: 'NOT THE WALL.', startFrame: 105, endFrame: 144, emphasis: true, color: '#f87171' },

  // --- Scene 03 (4.8s - 7.4s, 144f - 222f) ---
  { id: 'c3-p1', text: 'SPY IS 1.3% FROM A WALL', startFrame: 144, endFrame: 183, emphasis: false },
  { id: 'c3-p2', text: "YOU CAN'T SEE", startFrame: 183, endFrame: 222, emphasis: true, color: '#f87171' },

  // --- Scene 04 (7.4s - 10.2s, 222f - 306f) ---
  { id: 'c4-p1', text: 'NOT A PREDICTION.', startFrame: 222, endFrame: 264, emphasis: false },
  { id: 'c4-p2', text: 'A PRESSURE MAP.', startFrame: 264, endFrame: 306, emphasis: true, color: '#22d3ee' },

  // --- Scene 05 (10.2s - 14.8s, 306f - 444f) ---
  { id: 'c5-p1', text: 'SIGNUMHQ SHOWS', startFrame: 306, endFrame: 315, emphasis: true, color: '#22d3ee' }, // Ensure <= 0.3s (9 frames) as requested
  { id: 'c5-p2', text: 'THE STRUCTURE BEHIND PRICE', startFrame: 315, endFrame: 444, emphasis: true, color: '#22d3ee' },

  // --- Scene 06 (14.8s - 18.5s, 444f - 555f) ---
  { id: 'c6-p1', text: 'SEE THE STRUCTURE BEHIND PRICE', startFrame: 444, endFrame: 500, emphasis: false },
  { id: 'c6-p2', text: 'SIGNUMHQ.COM', startFrame: 500, endFrame: 555, emphasis: true, color: '#22d3ee' },
];

export function createMockMarketPressureBriefV29Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v29-${Date.now()}`,
    template: 'MarketPressureBriefV29' as any,
    format: 'viral',
    ticker: 'SPY',
    title: 'V29 Premium Intelligence Revenue Cut',
    hook: "Four hundred twenty million dollars moved off exchange near SPY’s six hundred wall.",
    scriptBeats: MOCK_V29_BEATS,
    captions: MOCK_V29_CAPTIONS,
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
