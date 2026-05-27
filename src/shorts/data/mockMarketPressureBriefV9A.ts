// ============================================================================
// Mock Market Pressure Brief V9A — 22s Aggressive Cutdown
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V9A_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 2.0, text: 'THE WALL IS NOT ON YOUR CHART', emphasis: ['WALL', 'NOT'] },
  { id: 'payoff', label: 'payoff', startSec: 2.0, endSec: 5.0, text: 'SPY IS 1.3% BELOW A HIDDEN CALL WALL', emphasis: ['1.3%', 'CALL WALL'] },
  { id: 'why_care', label: 'contrast', startSec: 5.0, endSec: 9.0, text: 'THIS IS WHERE PRESSURE MAY CLUSTER.', emphasis: ['PRESSURE', 'CLUSTER'] },
  { id: 'map', label: 'meaning', startSec: 9.0, endSec: 13.0, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: ['PRESSURE MAP'] },
  { id: 'product_toggle', label: 'product', startSec: 13.0, endSec: 18.0, text: 'NORMAL CHART: PRICE ONLY. SIGNUMHQ LAYER: WALL / FLOOR / FLIP.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 18.0, endSec: 22.0, text: 'SEE WHAT OTHERS CANNOT.', emphasis: ['SEE', 'CANNOT'] },
];

export const MOCK_V9A_CAPTIONS: CaptionSegment[] = [
  // Only using captions for beats that lack explicit text or need reinforcement
  // 5.0-9.0s (Why care) - main text is "THIS IS WHERE PRESSURE MAY CLUSTER."
  // I will omit duplicate phrase captions to adhere to strict visual layout rules.
];

export function createMockMarketPressureBriefV9AInput(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v9a-${Date.now()}`,
    template: 'HiddenWallShort',
    format: 'viral',
    ticker: 'SPY',
    title: 'Market Pressure Brief V9A 22s',
    hook: 'THE WALL IS NOT ON YOUR CHART.',
    scriptBeats: MOCK_V9A_BEATS,
    captions: MOCK_V9A_CAPTIONS,
    dataCards: [],
    structureVisual: {
      price: 592.31,
      callWall: 600,
      putFloor: 580,
      gammaFlipLevel: 588,
      nearestWall: 'call',
      distancePercent: 1.3,
    },
    broll: { url: 'shorts/broll/hook_v9a.png', type: 'image', provider: 'replicate', isMock: false },
    voice: { audioUrl: 'shorts/audio/v6_voice.mp3', durationSec: 22.0, provider: 'elevenlabs', isMock: true },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE WHAT OTHERS CANNOT.',
    isMock: true,
    durationSec: 22.0,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
