// ============================================================================
// Mock Market Pressure Brief V13 — Hybrid Winner
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V13_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 2.2, text: 'SPY IS 1.3% FROM A WALL MOST CHARTS DO NOT SHOW.', emphasis: [] },
  { id: 'payoff', label: 'payoff', startSec: 2.2, endSec: 4.8, text: 'SPY IS 1.3% BELOW A HIDDEN CALL WALL.', emphasis: [] },
  { id: 'why_care', label: 'contrast', startSec: 4.8, endSec: 7.5, text: 'THIS IS WHERE PRESSURE CAN BUILD.', emphasis: [] },
  { id: 'fomo', label: 'meaning', startSec: 7.5, endSec: 10.5, text: 'YOUR CHART IS MISSING THIS LAYER.', emphasis: [] },
  { id: 'map', label: 'layers', startSec: 10.5, endSec: 14.5, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: [] },
  { id: 'product', label: 'product', startSec: 14.5, endSec: 18.2, text: 'NORMAL CHART: PRICE ONLY. SIGNUMHQ LAYER: WALL / FLOOR / FLIP.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 18.2, endSec: 21.5, text: 'SEE THE STRUCTURE BEHIND PRICE.', emphasis: [] },
];

export const MOCK_V13_CAPTIONS: CaptionSegment[] = [
  { id: 'c1', startFrame: 30, endFrame: 75, text: 'Most charts miss this', emphasis: true },
  { id: 'c2', startFrame: 150, endFrame: 220, text: 'Pressure can build here', emphasis: true },
  { id: 'c3', startFrame: 460, endFrame: 530, text: 'Structure behind price', emphasis: true }
];

export function createMockMarketPressureBriefV13Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v13-${Date.now()}`,
    template: 'HiddenWallShort',
    format: 'viral',
    ticker: 'SPY',
    title: 'Market Pressure Brief V13 Hybrid Winner',
    hook: 'SPY 1.3% FROM A WALL MOST CHARTS DO NOT SHOW',
    scriptBeats: MOCK_V13_BEATS,
    captions: MOCK_V13_CAPTIONS,
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
    voice: { audioUrl: 'shorts/audio/v13_01.mp3', durationSec: 21.5, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE STRUCTURE BEHIND PRICE.',
    isMock: false,
    durationSec: 21.5,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
