// ============================================================================
// Mock Market Pressure Brief V11 — Final Audio Mix
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V11_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 2.4, text: 'YOUR CHART IS MISSING A LAYER.', emphasis: [] },
  { id: 'payoff', label: 'payoff', startSec: 2.4, endSec: 6.0, text: 'SPY IS 1.3% BELOW A HIDDEN CALL WALL.', emphasis: [] },
  { id: 'why_care', label: 'contrast', startSec: 6.0, endSec: 9.0, text: 'THIS IS WHERE PRESSURE CAN BUILD.', emphasis: [] },
  { id: 'product_toggle', label: 'product', startSec: 9.0, endSec: 12.2, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: [] },
  { id: 'map', label: 'meaning', startSec: 12.2, endSec: 16.2, text: 'NORMAL CHART: PRICE ONLY. SIGNUMHQ LAYER: WALL / FLOOR / FLIP.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 16.2, endSec: 21.0, text: 'SEE THE STRUCTURE BEHIND PRICE.', emphasis: [] },
];

export const MOCK_V11_CAPTIONS: CaptionSegment[] = [
  { id: 'c1', startFrame: 30, endFrame: 72, text: 'Most charts miss this', emphasis: true },
  { id: 'c2', startFrame: 90, endFrame: 150, text: '1.3% below the wall', emphasis: false },
  { id: 'c3', startFrame: 195, endFrame: 255, text: 'Pressure builds here', emphasis: true },
  { id: 'c4', startFrame: 495, endFrame: 555, text: 'Structure behind price', emphasis: true }
];

export function createMockMarketPressureBriefV11Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v11-${Date.now()}`,
    template: 'HiddenWallShort',
    format: 'viral',
    ticker: 'SPY',
    title: 'Market Pressure Brief V11 Final Audio',
    hook: 'YOUR CHART IS MISSING A LAYER.',
    scriptBeats: MOCK_V11_BEATS,
    captions: MOCK_V11_CAPTIONS,
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
    voice: { audioUrl: 'shorts/audio/v11_voice_01.mp3', durationSec: 22.0, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE STRUCTURE BEHIND PRICE.',
    isMock: false,
    durationSec: 22.0,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
