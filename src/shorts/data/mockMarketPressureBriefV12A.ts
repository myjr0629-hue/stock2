// ============================================================================
// Mock Market Pressure Brief V12A — SPY Shock Hook
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V12A_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 2.5, text: 'SPY IS 1.3% FROM A WALL MOST CHARTS DO NOT SHOW.', emphasis: [] },
  { id: 'payoff', label: 'payoff', startSec: 2.5, endSec: 5.5, text: '', emphasis: [] },
  { id: 'why_care', label: 'contrast', startSec: 5.5, endSec: 8.5, text: 'THIS IS WHERE PRESSURE CAN BUILD.', emphasis: [] },
  { id: 'map', label: 'meaning', startSec: 8.5, endSec: 12.5, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: [] },
  { id: 'product_toggle', label: 'product', startSec: 12.5, endSec: 17.0, text: 'NORMAL CHART: PRICE ONLY. SIGNUMHQ LAYER: WALL / FLOOR / FLIP.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 17.0, endSec: 21.0, text: 'SEE THE STRUCTURE BEHIND PRICE.', emphasis: [] },
];

export const MOCK_V12A_CAPTIONS: CaptionSegment[] = [
  { id: 'c1', startFrame: 15, endFrame: 75, text: '1.3% from a hidden wall', emphasis: true },
  { id: 'c2', startFrame: 165, endFrame: 225, text: 'Pressure builds here', emphasis: true }
];

export function createMockMarketPressureBriefV12AInput(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v12a-${Date.now()}`,
    template: 'HiddenWallShort',
    format: 'viral',
    ticker: 'SPY',
    title: 'Market Pressure Brief V12A SPY Shock',
    hook: 'SPY IS 1.3% FROM A WALL MOST CHARTS DO NOT SHOW.',
    scriptBeats: MOCK_V12A_BEATS,
    captions: MOCK_V12A_CAPTIONS,
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
    voice: { audioUrl: 'shorts/audio/v12a_01.mp3', durationSec: 21.0, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE STRUCTURE BEHIND PRICE.',
    isMock: false,
    durationSec: 21.0,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
