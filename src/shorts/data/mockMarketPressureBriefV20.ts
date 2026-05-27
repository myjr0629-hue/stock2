import type { ShortsVideoInput, ScriptBeat } from '../types';

export const MOCK_V20_BEATS: ScriptBeat[] = [
  { id: 'shock', label: 'hook', startSec: 0, endSec: 0.5, text: 'SPY IS 1.3% FROM A HIDDEN WALL', emphasis: [] },
  { id: 'darkpool', label: 'reveal', startSec: 0.5, endSec: 2.5, text: 'DARK POOL FLOW CLUSTERING NEARBY', emphasis: [] },
  { id: 'context', label: 'context', startSec: 2.5, endSec: 5.2, text: 'MOST CHARTS DON\'T SHOW THIS', emphasis: [] },
  { id: 'pressure', label: 'tension', startSec: 5.2, endSec: 8.5, text: 'PRESSURE MAY BUILD HERE', emphasis: [] },
  { id: 'unlock', label: 'product', startSec: 8.5, endSec: 12.0, text: 'SIGNUMHQ STRUCTURE LAYER', emphasis: [] },
  { id: 'compliance', label: 'compliance', startSec: 12.0, endSec: 15.2, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 15.2, endSec: 18.5, text: 'SEE THE STRUCTURE BEHIND PRICE. SIGNUMHQ.COM', emphasis: [] },
];

export function createMockMarketPressureBriefV20Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v20-${Date.now()}`,
    template: 'MarketPressureBriefV20',
    format: 'viral',
    ticker: 'SPY',
    title: 'Institutional Footprint Brief V20',
    hook: 'SPY IS 1.3% FROM A HIDDEN WALL',
    scriptBeats: MOCK_V20_BEATS,
    captions: [],
    dataCards: [],
    structureVisual: {
      price: 592.31,
      callWall: 600,
      putFloor: 580,
      gammaFlipLevel: 588,
      nearestWall: 'call',
      distancePercent: 1.3,
      darkPoolNotional: 420000000,
      darkPoolPercentile: 91,
      offExchangeVolumeRatio: 2.4,
      flowDirection: 'clustered near upper structure',
      regime: 'negative gamma pressure zone'
    },
    broll: { url: '', type: 'none', provider: 'procedural', isMock: false },
    voice: { audioUrl: 'shorts/audio/v20_voice.mp3', durationSec: 18.5, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE STRUCTURE BEHIND PRICE.',
    isMock: false,
    durationSec: 18.5,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
