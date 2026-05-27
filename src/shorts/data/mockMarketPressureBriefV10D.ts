// ============================================================================
// Mock Market Pressure Brief V10D — Audio Integration
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V10D_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 2.5, text: 'YOUR CHART IS MISSING A LAYER.', emphasis: ['MISSING', 'LAYER'] },
  { id: 'payoff', label: 'payoff', startSec: 2.5, endSec: 6.0, text: 'SPY IS 1.3% BELOW A HIDDEN CALL WALL.', emphasis: ['1.3%', 'CALL WALL'] },
  { id: 'why_care', label: 'contrast', startSec: 6.0, endSec: 9.0, text: 'THIS IS WHERE PRESSURE CAN BUILD.', emphasis: ['PRESSURE', 'BUILD'] },
  { id: 'product_toggle', label: 'product', startSec: 9.0, endSec: 13.0, text: 'NORMAL CHART: PRICE ONLY. SIGNUMHQ LAYER: WALL / FLOOR / FLIP.', emphasis: [] },
  { id: 'map', label: 'meaning', startSec: 13.0, endSec: 16.5, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: ['PRESSURE MAP'] },
  { id: 'tension', label: 'data', startSec: 16.5, endSec: 19.5, text: 'THE GAP IS ONLY 1.3%.', emphasis: ['1.3%'] },
  { id: 'cta', label: 'cta', startSec: 19.5, endSec: 22.0, text: 'SEE THE STRUCTURE BEHIND PRICE.', emphasis: ['STRUCTURE'] },
];

export function createMockMarketPressureBriefV10DInput(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v10d-${Date.now()}`,
    template: 'HiddenWallShort',
    format: 'viral',
    ticker: 'SPY',
    title: 'Market Pressure Brief V10D Audio Integration',
    hook: 'YOUR CHART IS MISSING A LAYER.',
    scriptBeats: MOCK_V10D_BEATS,
    captions: [],
    dataCards: [],
    structureVisual: {
      price: 592.31,
      callWall: 600,
      putFloor: 580,
      gammaFlipLevel: 588,
      nearestWall: 'call',
      distancePercent: 1.3,
    },
    broll: { url: 'shorts/broll/hook_v10.png', type: 'image', provider: 'replicate', isMock: false },
    voice: { audioUrl: 'shorts/audio/v10c/beat1.mp3', durationSec: 22.0, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE STRUCTURE BEHIND PRICE.',
    isMock: false,
    durationSec: 22.0,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
