import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V27_BEATS: ScriptBeat[] = [
  { id: 'event-shock', label: 'hook', startSec: 0, endSec: 2.2, text: "Four hundred twenty million off-exchange flow just printed near SPY's six hundred wall.", emphasis: ['Four', 'hundred', 'twenty', 'million', 'off-exchange', 'flow'] },
  { id: 'hidden-wall', label: 'info', startSec: 2.2, endSec: 4.8, text: "Most charts show price. They do not show this layer.", emphasis: ['Most', 'charts', 'show', 'price'] },
  { id: 'pressure-zone', label: 'pressure', startSec: 4.8, endSec: 7.4, text: "When price moves near a wall, pressure can build fast.", emphasis: ['pressure', 'build', 'fast'] },
  { id: 'map-not-pred', label: 'regime', startSec: 7.4, endSec: 10.2, text: "This is not a prediction. It is a pressure map.", emphasis: ['not', 'prediction', 'pressure', 'map'] },
  { id: 'product-unlock', label: 'unlock', startSec: 10.2, endSec: 14.5, text: "SignumHQ shows the structure behind price.", emphasis: ['SignumHQ', 'shows', 'structure'] },
  { id: 'cta-loop', label: 'cta', startSec: 14.5, endSec: 18.5, text: "See the hidden layer at SignumHQ.", emphasis: ['hidden', 'layer', 'SignumHQ'] },
];

export const MOCK_V27_CAPTIONS: CaptionSegment[] = [
  // --- Scene 01 (0.0s - 2.2s, 0f - 66f) ---
  { id: 'c1-p2', text: "NEAR SPY'S $600 WALL", startFrame: 30, endFrame: 66, emphasis: true, color: '#fbbf24' },

  // --- Scene 02 (2.2s - 4.8s, 66f - 144f) ---
  { id: 'c2-p1', text: 'MOST CHARTS SHOW PRICE', startFrame: 66, endFrame: 105, emphasis: false },
  { id: 'c2-p2', text: 'BUT NOT THE WALL', startFrame: 105, endFrame: 144, emphasis: true, color: '#f87171' },

  // --- Scene 03 (4.8s - 7.4s, 144f - 222f) ---
  { id: 'c3-p1', text: 'WHEN PRICE MOVES NEAR A WALL', startFrame: 144, endFrame: 183, emphasis: false },
  { id: 'c3-p2', text: 'PRESSURE CAN BUILD HERE', startFrame: 183, endFrame: 222, emphasis: true, color: '#f87171' },

  // --- Scene 04 (7.4s - 10.2s, 222f - 306f) ---
  { id: 'c4-p1', text: 'NOT A PREDICTION.', startFrame: 222, endFrame: 264, emphasis: false },
  { id: 'c4-p2', text: 'A PRESSURE MAP.', startFrame: 264, endFrame: 306, emphasis: true, color: '#22d3ee' },

  // --- Scene 05 (10.2s - 14.5s, 306f - 435f) ---
  { id: 'c5-p1', text: 'SIGNUMHQ SHOWS THE STRUCTURE BEHIND PRICE', startFrame: 306, endFrame: 435, emphasis: true, color: '#22d3ee' },

  // --- Scene 06 (14.5s - 18.5s, 435f - 555f) ---
  { id: 'c6-p1', text: 'SEE THE STRUCTURE BEHIND PRICE', startFrame: 435, endFrame: 495, emphasis: false },
  { id: 'c6-p2', text: 'SIGNUMHQ.COM', startFrame: 495, endFrame: 555, emphasis: true, color: '#22d3ee' },
];

export function createMockMarketPressureBriefV27Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v27-${Date.now()}`,
    template: 'MarketPressureBriefV27' as any,
    format: 'viral',
    ticker: 'SPY',
    title: 'V27 Collision-Free Institutional Upload Master',
    hook: "Four hundred twenty million off-exchange flow just printed near SPY's six hundred wall.",
    scriptBeats: MOCK_V27_BEATS,
    captions: MOCK_V27_CAPTIONS,
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
      regime: 'negative gamma pressure zone'
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
