import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V30_BEATS: ScriptBeat[] = [
  { id: 'event-leak', label: 'hook', startSec: 0, endSec: 2.0, text: "Four hundred twenty million dollars moved off exchange near SPY’s six hundred wall.", emphasis: ['Four', 'hundred', 'twenty', 'million', 'dollars'] },
  { id: 'normal-charts-lie', label: 'info', startSec: 2.0, endSec: 4.2, text: "Normal charts show price. Not the wall.", emphasis: ['Normal', 'charts', 'show', 'price', 'Not'] },
  { id: 'the-gap', label: 'pressure', startSec: 4.2, endSec: 6.8, text: "SPY is one point three percent from a wall you can’t see.", emphasis: ['one', 'point', 'three', 'percent', 'wall'] },
  { id: 'pressure-map', label: 'regime', startSec: 6.8, endSec: 9.4, text: "This is not a prediction. It is a pressure map.", emphasis: ['prediction', 'pressure', 'map'] },
  { id: 'product-unlock', label: 'unlock', startSec: 9.4, endSec: 13.8, text: "SignumHQ shows the structure behind price.", emphasis: ['SignumHQ', 'shows', 'structure'] },
  { id: 'cta-loop-hook', label: 'cta', startSec: 13.8, endSec: 18.5, text: "See the structure behind price. SignumHQ.com", emphasis: ['structure', 'price', 'SignumHQ.com'] },
];

export const MOCK_V30_CAPTIONS: CaptionSegment[] = [
  // --- Scene 01 (0.0s - 2.0s, 0f - 60f) ---
  { id: 'c1-p1', text: "NEAR SPY'S $600 WALL", startFrame: 0, endFrame: 60, emphasis: true, color: '#f59e0b' },

  // --- Scene 02 (2.0s - 4.2s, 60f - 126f) ---
  { id: 'c2-p1', text: 'NORMAL CHARTS SHOW PRICE.', startFrame: 60, endFrame: 96, emphasis: false },
  { id: 'c2-p2', text: 'NOT THE WALL.', startFrame: 96, endFrame: 126, emphasis: true, color: '#f87171' },

  // --- Scene 03 (4.2s - 6.8s, 126f - 204f) ---
  { id: 'c3-p1', text: 'SPY IS 1.3% FROM A WALL', startFrame: 126, endFrame: 165, emphasis: false },
  { id: 'c3-p2', text: "YOU CAN'T SEE", startFrame: 165, endFrame: 204, emphasis: true, color: '#fbbf24' },

  // --- Scene 04 (6.8s - 9.4s, 204f - 282f) ---
  { id: 'c4-p1', text: 'NOT A PREDICTION.', startFrame: 204, endFrame: 240, emphasis: false },
  { id: 'c4-p2', text: 'A PRESSURE MAP.', startFrame: 240, endFrame: 282, emphasis: true, color: '#22d3ee' },

  // --- Scene 05 (9.4s - 13.8s, 282f - 414f) ---
  { id: 'c5-p1', text: 'SIGNUMHQ SHOWS', startFrame: 282, endFrame: 291, emphasis: true, color: '#22d3ee' }, // 9 frames = 0.3s as requested
  { id: 'c5-p2', text: 'THE STRUCTURE BEHIND PRICE', startFrame: 291, endFrame: 414, emphasis: true, color: '#22d3ee' },

  // --- Scene 06 (13.8s - 18.5s, 414f - 555f) ---
  { id: 'c6-p1', text: 'SEE THE STRUCTURE BEHIND PRICE', startFrame: 414, endFrame: 474, emphasis: false },
  { id: 'c6-p2', text: 'SIGNUMHQ.COM', startFrame: 474, endFrame: 555, emphasis: true, color: '#22d3ee' },
];

export function createMockMarketPressureBriefV30Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v30-${Date.now()}`,
    template: 'MarketPressureBriefV30' as any,
    format: 'viral',
    ticker: 'SPY',
    title: 'V30 Intelligence Leak Revenue Cut',
    hook: "Four hundred twenty million dollars moved off exchange near SPY’s six hundred wall.",
    scriptBeats: MOCK_V30_BEATS,
    captions: MOCK_V30_CAPTIONS,
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
