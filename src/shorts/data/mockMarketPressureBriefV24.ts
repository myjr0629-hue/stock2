import type { ShortsVideoInput, ScriptBeat } from '../types';

export const MOCK_V24_BEATS: ScriptBeat[] = [
  { id: 'market-alert', label: 'hook', startSec: 0, endSec: 1.6, text: '$420M OFF-EXCHANGE NEAR $600 WALL', emphasis: [] },
  { id: 'hidden-layer', label: 'fomo', startSec: 1.6, endSec: 3.4, text: 'MOST CHARTS DON\'T SHOW THIS', emphasis: [] },
  { id: 'distance', label: 'tension', startSec: 3.4, endSec: 5.7, text: 'SPY IS 1.3% FROM A WALL YOU CAN\'T SEE', emphasis: [] },
  { id: 'pressure', label: 'pressure', startSec: 5.7, endSec: 8.3, text: 'PRESSURE CAN BUILD HERE', emphasis: [] },
  { id: 'scanner-unlock', label: 'product', startSec: 8.3, endSec: 11.2, text: 'SIGNUMHQ REVEALS HIDDEN STRUCTURE', emphasis: [] },
  { id: 'structure-map', label: 'map', startSec: 11.2, endSec: 14.2, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 14.2, endSec: 17.8, text: 'SEE THE STRUCTURE BEHIND PRICE', emphasis: [] },
];

export function createMockMarketPressureBriefV24Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v24-${Date.now()}`,
    template: 'MarketPressureBriefV24' as any,
    format: 'viral',
    ticker: 'SPY',
    title: 'Institutional-Terminal UI V24',
    hook: '$420M OFF-EXCHANGE NEAR $600 WALL',
    scriptBeats: MOCK_V24_BEATS,
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
    broll: { url: '', type: 'image' as const, provider: 'mock' as const, isMock: true },
    voice: { audioUrl: 'shorts/audio/v22_voice.mp3', durationSec: 17.8, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE STRUCTURE BEHIND PRICE.',
    isMock: false,
    durationSec: 17.8,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
