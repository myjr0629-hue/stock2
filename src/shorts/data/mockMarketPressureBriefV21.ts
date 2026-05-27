import type { ShortsVideoInput, ScriptBeat } from '../types';

export const MOCK_V21_BEATS: ScriptBeat[] = [
  { id: 'shock', label: 'hook', startSec: 0, endSec: 0.7, text: 'SPY LOOKS NORMAL.', emphasis: [] },
  { id: 'reveal', label: 'reveal', startSec: 0.7, endSec: 2.2, text: 'BUT FLOW IS CLUSTERING.', emphasis: [] },
  { id: 'proof', label: 'proof', startSec: 2.2, endSec: 4.5, text: '$420M OFF-EXCHANGE NEAR THE $600 WALL', emphasis: [] },
  { id: 'tension', label: 'tension', startSec: 4.5, endSec: 7.0, text: 'THE GAP IS ONLY 1.3%', emphasis: [] },
  { id: 'contrast', label: 'product', startSec: 7.0, endSec: 10.5, text: 'MOST CHARTS DON\'T SHOW THIS', emphasis: [] },
  { id: 'map', label: 'map', startSec: 10.5, endSec: 13.5, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 13.5, endSec: 17.5, text: 'SEE THE STRUCTURE BEHIND PRICE. SIGNUMHQ.COM', emphasis: [] },
];

export function createMockMarketPressureBriefV21Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v21-${Date.now()}`,
    template: 'MarketPressureBriefV21' as any, // bypassing strict enum check for now
    format: 'viral',
    ticker: 'SPY',
    title: 'Institutional Footprint V21 Event-Driven Rebuild',
    hook: 'SPY LOOKS NORMAL.',
    scriptBeats: MOCK_V21_BEATS,
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
    voice: { audioUrl: 'shorts/audio/v21_voice.mp3', durationSec: 17.5, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE STRUCTURE BEHIND PRICE.',
    isMock: false,
    durationSec: 17.5,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
