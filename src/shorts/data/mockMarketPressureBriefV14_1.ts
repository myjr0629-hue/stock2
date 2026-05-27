// ============================================================================
// Mock Market Pressure Brief V14.1 — Final Hook & Hierarchy
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V14_1_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 2.0, text: 'SPY 1.3% BELOW HIDDEN WALL.', emphasis: [] },
  { id: 'fomo', label: 'fomo', startSec: 2.0, endSec: 4.0, text: 'MOST CHARTS MISS THIS LAYER.', emphasis: [] },
  { id: 'why_care', label: 'meaning', startSec: 4.0, endSec: 6.8, text: 'THIS IS WHERE PRESSURE CAN BUILD.', emphasis: [] },
  { id: 'map', label: 'map', startSec: 6.8, endSec: 9.8, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: [] },
  { id: 'contrast', label: 'contrast', startSec: 9.8, endSec: 14.0, text: 'NORMAL CHART: PRICE ONLY. SIGNUMHQ LAYER: WALL / FLOOR / FLIP.', emphasis: [] },
  { id: 'promise', label: 'promise', startSec: 14.0, endSec: 17.2, text: 'SIGNUMHQ SHOWS THE STRUCTURE BEHIND PRICE.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 17.2, endSec: 20.5, text: 'SEE THE HIDDEN LAYER. SIGNUMHQ.COM', emphasis: [] },
];

export const MOCK_V14_1_CAPTIONS: CaptionSegment[] = [];

export function createMockMarketPressureBriefV14_1Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v14-1-${Date.now()}`,
    template: 'HiddenWallShort',
    format: 'viral',
    ticker: 'SPY',
    title: 'Market Pressure Brief V14.1 Final Hook Hierarchy',
    hook: 'SPY 1.3% BELOW HIDDEN WALL',
    scriptBeats: MOCK_V14_1_BEATS,
    captions: MOCK_V14_1_CAPTIONS,
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
    voice: { audioUrl: 'shorts/audio/v14_01.mp3', durationSec: 20.5, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE STRUCTURE BEHIND PRICE.',
    isMock: false,
    durationSec: 20.5,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
