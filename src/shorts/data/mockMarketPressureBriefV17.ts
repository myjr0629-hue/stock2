import type { ShortsVideoInput, ScriptBeat } from '../types';

export const MOCK_V17_BEATS: ScriptBeat[] = [
  { id: 'interrupt', label: 'hook', startSec: 0, endSec: 1.6, text: 'SPY IS 1.3% FROM A WALL YOU CAN\'T SEE', emphasis: [] },
  { id: 'reveal', label: 'fomo', startSec: 1.6, endSec: 3.8, text: 'NORMAL CHARTS DON\'T SHOW IT', emphasis: [] },
  { id: 'pressure', label: 'meaning', startSec: 3.8, endSec: 6.5, text: 'NEAR WALLS, PRESSURE CAN BUILD', emphasis: [] },
  { id: 'map', label: 'map', startSec: 6.5, endSec: 9.2, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: [] },
  { id: 'desire', label: 'contrast', startSec: 9.2, endSec: 13.2, text: 'PRICE ONLY vs STRUCTURE LAYER', emphasis: [] },
  { id: 'recap', label: 'recap', startSec: 13.2, endSec: 16.5, text: 'WALL. FLIP. FLOOR.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 16.5, endSec: 20.0, text: 'SEE THE STRUCTURE BEHIND PRICE. SIGNUMHQ.COM', emphasis: [] },
];

export function createMockMarketPressureBriefV17Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v17-${Date.now()}`,
    template: 'MarketPressureBriefV17',
    format: 'viral',
    ticker: 'SPY',
    title: 'Market Pressure Brief V17 Revenue-Grade Rebuild',
    hook: 'SPY IS 1.3% FROM A WALL YOU CAN\'T SEE',
    scriptBeats: MOCK_V17_BEATS,
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
    voice: { audioUrl: 'shorts/audio/v17_voice.mp3', durationSec: 20.0, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE STRUCTURE BEHIND PRICE.',
    isMock: false,
    durationSec: 20.0,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
