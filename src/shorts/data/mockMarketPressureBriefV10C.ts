// ============================================================================
// Mock Market Pressure Brief V10C — Final Visual Polish
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V10C_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 2.5, text: 'YOUR CHART IS MISSING A LAYER.', emphasis: ['MISSING', 'LAYER'] },
  { id: 'payoff', label: 'payoff', startSec: 2.5, endSec: 6.0, text: 'SPY IS 1.3% BELOW A HIDDEN CALL WALL.', emphasis: ['1.3%', 'CALL WALL'] },
  { id: 'why_care', label: 'contrast', startSec: 6.0, endSec: 9.0, text: 'THIS IS WHERE PRESSURE CAN BUILD.', emphasis: ['PRESSURE', 'BUILD'] },
  { id: 'product_toggle', label: 'product', startSec: 9.0, endSec: 13.0, text: 'NORMAL CHART: PRICE ONLY. SIGNUMHQ LAYER: WALL / FLOOR / FLIP.', emphasis: [] },
  { id: 'map', label: 'meaning', startSec: 13.0, endSec: 16.5, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: ['PRESSURE MAP'] },
  { id: 'tension', label: 'data', startSec: 16.5, endSec: 19.5, text: 'THE GAP IS ONLY 1.3%.', emphasis: ['1.3%'] },
  { id: 'cta', label: 'cta', startSec: 19.5, endSec: 22.0, text: 'SEE THE STRUCTURE BEHIND PRICE.', emphasis: ['STRUCTURE'] },
];

export const MOCK_V10C_CAPTIONS: CaptionSegment[] = [];

export function createMockMarketPressureBriefV10CInput(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v10c-${Date.now()}`,
    template: 'HiddenWallShort', // using existing allowed type
    format: 'viral',
    ticker: 'SPY',
    title: 'Market Pressure Brief V10C Final Polish',
    hook: 'YOUR CHART IS MISSING A LAYER.',
    scriptBeats: MOCK_V10C_BEATS,
    captions: MOCK_V10C_CAPTIONS,
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
    voice: { audioUrl: 'shorts/audio/v6_voice.mp3', durationSec: 22.0, provider: 'elevenlabs', isMock: true },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE STRUCTURE BEHIND PRICE.',
    isMock: true,
    durationSec: 22.0,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
