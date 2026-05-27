// ============================================================================
// Mock Market Pressure Brief V16 — Upload Candidate
// ============================================================================

import type { ShortsVideoInput, ScriptBeat } from '../types';

export const MOCK_V16_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 2.2, text: 'SPY IS 1.3% BELOW A HIDDEN CALL WALL', emphasis: [] },
  { id: 'fomo', label: 'fomo', startSec: 2.2, endSec: 4.2, text: 'MOST CHARTS MISS THIS LAYER.', emphasis: [] },
  { id: 'pressure', label: 'meaning', startSec: 4.2, endSec: 7.0, text: 'PRESSURE CAN BUILD HERE.', emphasis: [] },
  { id: 'map', label: 'map', startSec: 7.0, endSec: 10.2, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: [] },
  { id: 'contrast', label: 'contrast', startSec: 10.2, endSec: 15.0, text: 'NORMAL CHART: PRICE ONLY. SIGNUMHQ LAYER: WALL / FLOOR / FLIP.', emphasis: [] },
  { id: 'promise', label: 'promise', startSec: 15.0, endSec: 18.0, text: 'SEE THE STRUCTURE BEHIND PRICE.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 18.0, endSec: 20.5, text: 'SEE THE HIDDEN LAYER. SIGNUMHQ.COM', emphasis: [] },
];

export function createMockMarketPressureBriefV16Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v16-${Date.now()}`,
    template: 'MarketPressureBriefV16',
    format: 'viral',
    ticker: 'SPY',
    title: 'Market Pressure Brief V16 Upload Candidate',
    hook: 'SPY IS 1.3% BELOW A HIDDEN CALL WALL',
    scriptBeats: MOCK_V16_BEATS,
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
    broll: { url: '', type: 'none', provider: 'procedural', isMock: false },
    voice: { audioUrl: 'shorts/audio/v14_01.mp3', durationSec: 20.5, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE HIDDEN LAYER.',
    isMock: false,
    durationSec: 20.5,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
