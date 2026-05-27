import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V26_BEATS: ScriptBeat[] = [
  { id: 'event-shock', label: 'hook', startSec: 0, endSec: 2.0, text: "Four hundred twenty million off-exchange flow just printed near SPY's six hundred wall.", emphasis: ['Four', 'hundred', 'twenty', 'million', 'off-exchange', 'flow'] },
  { id: 'hidden-wall', label: 'info', startSec: 2.0, endSec: 4.5, text: "Most charts show price. They do not show this layer.", emphasis: ['Most', 'charts', 'show', 'price'] },
  { id: 'pressure-zone', label: 'pressure', startSec: 4.5, endSec: 7.0, text: "When price moves near a wall, pressure can build fast.", emphasis: ['pressure', 'build', 'fast'] },
  { id: 'map-not-pred', label: 'regime', startSec: 7.0, endSec: 10.5, text: "This is not a prediction. It is a pressure map.", emphasis: ['not', 'prediction', 'pressure', 'map'] },
  { id: 'product-unlock', label: 'unlock', startSec: 10.5, endSec: 14.5, text: "SignumHQ shows the structure behind price.", emphasis: ['SignumHQ', 'shows', 'structure'] },
  { id: 'cta-loop', label: 'cta', startSec: 14.5, endSec: 18.5, text: "See the hidden layer at SignumHQ.", emphasis: ['hidden', 'layer', 'SignumHQ'] },
];

export const MOCK_V26_CAPTIONS: CaptionSegment[] = [
  // --- Scene 01 (0.0s - 2.0s, 0f - 60f) ---
  { id: 'c1-p1', text: '$420M OFF-EXCHANGE FLOW', startFrame: 0, endFrame: 30, emphasis: true, color: '#22d3ee' },
  { id: 'c1-p2', text: "NEAR SPY'S $600 WALL", startFrame: 30, endFrame: 60, emphasis: true, color: '#fbbf24' },

  // --- Scene 02 (2.0s - 4.5s, 60f - 135f) ---
  { id: 'c2-p1', text: 'MOST CHARTS SHOW PRICE', startFrame: 60, endFrame: 95, emphasis: false },
  { id: 'c2-p2', text: "THEY DON'T SHOW THIS LAYER", startFrame: 95, endFrame: 135, emphasis: true, color: '#f87171' },

  // --- Scene 03 (4.5s - 7.0s, 135f - 210f) ---
  { id: 'c3-p1', text: 'WHEN PRICE MOVES NEAR A WALL', startFrame: 135, endFrame: 175, emphasis: false },
  { id: 'c3-p2', text: 'PRESSURE CAN BUILD FAST', startFrame: 175, endFrame: 210, emphasis: true, color: '#f87171' },

  // --- Scene 04 (7.0s - 10.5s, 210f - 315f) ---
  { id: 'c4-p1', text: 'THIS IS NOT A PREDICTION', startFrame: 210, endFrame: 260, emphasis: false },
  { id: 'c4-p2', text: 'IT IS A PRESSURE MAP', startFrame: 260, endFrame: 315, emphasis: true, color: '#22d3ee' },

  // --- Scene 05 (10.5s - 14.5s, 315f - 435f) ---
  { id: 'c5-p1', text: 'SIGNUMHQ SHOWS', startFrame: 315, endFrame: 365, emphasis: true, color: '#22d3ee' },
  { id: 'c5-p2', text: 'THE STRUCTURE BEHIND PRICE', startFrame: 365, endFrame: 435, emphasis: true, color: '#fbbf24' },

  // --- Scene 06 (14.5s - 18.5s, 435f - 555f) ---
  { id: 'c6-p1', text: 'SEE THE HIDDEN LAYER', startFrame: 435, endFrame: 495, emphasis: false },
  { id: 'c6-p2', text: 'AT SIGNUMHQ.COM', startFrame: 495, endFrame: 555, emphasis: true, color: '#22d3ee' },
];

export function createMockMarketPressureBriefV26Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v26-${Date.now()}`,
    template: 'MarketPressureBriefV26' as any,
    format: 'viral',
    ticker: 'SPY',
    title: 'V26 Institutional Data-First Revenue Cut',
    hook: "Four hundred twenty million off-exchange flow just printed near SPY's six hundred wall.",
    scriptBeats: MOCK_V26_BEATS,
    captions: MOCK_V26_CAPTIONS,
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
