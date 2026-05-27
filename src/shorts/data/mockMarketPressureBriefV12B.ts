// ============================================================================
// Mock Market Pressure Brief V12B — Missing Layer Hook
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V12B_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 2.5, text: 'YOUR CHART IS MISSING A LAYER.', emphasis: [] },
  { id: 'payoff', label: 'payoff', startSec: 2.5, endSec: 5.5, text: 'SPY IS 1.3% BELOW A HIDDEN CALL WALL.', emphasis: [] },
  { id: 'contrast', label: 'contrast', startSec: 5.5, endSec: 9.0, text: 'MOST CHARTS SHOW PRICE. NOT STRUCTURE.', emphasis: [] },
  { id: 'meaning', label: 'meaning', startSec: 9.0, endSec: 12.5, text: 'NEAR WALLS, PRESSURE CAN BUILD.', emphasis: [] },
  { id: 'product_toggle', label: 'product', startSec: 12.5, endSec: 17.0, text: 'NORMAL CHART VERSUS SIGNUMHQ LAYER.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 17.0, endSec: 21.0, text: 'SEE THE HIDDEN LAYER.', emphasis: [] },
];

export const MOCK_V12B_CAPTIONS: CaptionSegment[] = [
  { id: 'c1', startFrame: 30, endFrame: 75, text: 'Most charts miss this', emphasis: true },
  { id: 'c2', startFrame: 285, endFrame: 345, text: 'Pressure builds here', emphasis: true }
];

export function createMockMarketPressureBriefV12BInput(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v12b-${Date.now()}`,
    template: 'HiddenWallShort',
    format: 'viral',
    ticker: 'SPY',
    title: 'Market Pressure Brief V12B Missing Layer',
    hook: 'YOUR CHART IS MISSING A LAYER.',
    scriptBeats: MOCK_V12B_BEATS,
    captions: MOCK_V12B_CAPTIONS,
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
    voice: { audioUrl: 'shorts/audio/v12b_01.mp3', durationSec: 21.0, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE HIDDEN LAYER.',
    isMock: false,
    durationSec: 21.0,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
