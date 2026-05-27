import type { ShortsVideoInput, ScriptBeat } from '../types';

export const MOCK_V23_BEATS: ScriptBeat[] = [
  { id: 'market-alert', label: 'hook', startSec: 0, endSec: 0.8, text: '$420M OFF-EXCHANGE NEAR $600 WALL', emphasis: [] },
  { id: 'hidden-layer', label: 'fomo', startSec: 0.8, endSec: 2.2, text: 'MOST CHARTS DON\'T SHOW THIS', emphasis: [] },
  { id: 'distance', label: 'tension', startSec: 2.2, endSec: 4.5, text: 'SPY IS 1.3% FROM A WALL YOU CAN\'T SEE', emphasis: [] },
  { id: 'pressure', label: 'pressure', startSec: 4.5, endSec: 7.0, text: 'PRESSURE CAN BUILD HERE', emphasis: [] },
  { id: 'scanner-unlock', label: 'product', startSec: 7.0, endSec: 10.5, text: 'SIGNUMHQ REVEALS HIDDEN STRUCTURE', emphasis: [] },
  { id: 'structure-map', label: 'map', startSec: 10.5, endSec: 13.5, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 13.5, endSec: 17.5, text: 'SEE THE STRUCTURE BEHIND PRICE', emphasis: [] },
];

export function createMockMarketPressureBriefV23Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v23-${Date.now()}`,
    template: 'MarketPressureBriefV23' as any,
    format: 'viral',
    ticker: 'SPY',
    title: 'Bloomberg-Alert Revenue Cut V23',
    hook: '$420M OFF-EXCHANGE NEAR $600 WALL',
    scriptBeats: MOCK_V23_BEATS,
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
    voice: { audioUrl: 'shorts/audio/v22_voice.mp3', durationSec: 17.5, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE STRUCTURE BEHIND PRICE.',
    isMock: false,
    durationSec: 17.5,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
