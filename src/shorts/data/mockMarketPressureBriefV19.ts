import type { ShortsVideoInput, ScriptBeat } from '../types';

export const MOCK_V19_BEATS: ScriptBeat[] = [
  { id: 'shock', label: 'hook', startSec: 0, endSec: 0.7, text: 'SPY IS 1.3% FROM A WALL MOST CHARTS MISS', emphasis: [] },
  { id: 'curiosity', label: 'reveal', startSec: 0.7, endSec: 2.5, text: 'A WALL YOU CAN\'T SEE', emphasis: [] },
  { id: 'pressure', label: 'tension', startSec: 2.5, endSec: 5.0, text: 'PRESSURE CAN BUILD HERE', emphasis: [] },
  { id: 'map', label: 'map', startSec: 5.0, endSec: 7.5, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: [] },
  { id: 'unlock', label: 'product', startSec: 7.5, endSec: 11.5, text: 'NORMAL CHART PRICE ONLY vs SIGNUMHQ LAYER', emphasis: [] },
  { id: 'vocab', label: 'punch', startSec: 11.5, endSec: 15.0, text: 'WALL. FLOOR. FLIP.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 15.0, endSec: 19.0, text: 'SEE THE STRUCTURE BEHIND PRICE. SIGNUMHQ.COM', emphasis: [] },
];

export function createMockMarketPressureBriefV19Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v19-${Date.now()}`,
    template: 'MarketPressureBriefV19',
    format: 'viral',
    ticker: 'SPY',
    title: 'Market Pressure Brief V19 True Upload Candidate',
    hook: 'SPY IS 1.3% FROM A WALL MOST CHARTS MISS',
    scriptBeats: MOCK_V19_BEATS,
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
    voice: { audioUrl: 'shorts/audio/v19_voice.mp3', durationSec: 19.0, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE STRUCTURE BEHIND PRICE.',
    isMock: false,
    durationSec: 19.0,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
