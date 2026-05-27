import type { ShortsVideoInput, ScriptBeat } from '../types';

export const MOCK_V18_BEATS: ScriptBeat[] = [
  { id: 'interrupt', label: 'hook', startSec: 0, endSec: 0.7, text: 'SPY IS 1.3% FROM A WALL YOU CAN\'T SEE', emphasis: [] },
  { id: 'appear', label: 'fomo', startSec: 0.7, endSec: 2.5, text: 'MOST CHARTS DON\'T SHOW THIS', emphasis: [] },
  { id: 'pressure', label: 'meaning', startSec: 2.5, endSec: 5.5, text: 'PRESSURE CAN BUILD HERE', emphasis: [] },
  { id: 'map', label: 'map', startSec: 5.5, endSec: 8.5, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: [] },
  { id: 'unlock', label: 'contrast', startSec: 8.5, endSec: 12.5, text: 'PRICE ONLY vs STRUCTURE LAYER', emphasis: [] },
  { id: 'vocab', label: 'recap', startSec: 12.5, endSec: 16.0, text: 'WALL. FLOOR. FLIP.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 16.0, endSec: 20.0, text: 'SEE THE STRUCTURE BEHIND PRICE. SIGNUMHQ.COM', emphasis: [] },
];

export function createMockMarketPressureBriefV18Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v18-${Date.now()}`,
    template: 'MarketPressureBriefV18',
    format: 'viral',
    ticker: 'SPY',
    title: 'Market Pressure Brief V18 Upload Candidate',
    hook: 'SPY IS 1.3% FROM A WALL YOU CAN\'T SEE',
    scriptBeats: MOCK_V18_BEATS,
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
    voice: { audioUrl: 'shorts/audio/v18_voice.mp3', durationSec: 20.0, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE STRUCTURE BEHIND PRICE.',
    isMock: false,
    durationSec: 20.0,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
