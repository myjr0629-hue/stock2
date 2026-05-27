// ============================================================================
// Mock Market Pressure Brief V8 — Story, Insight & Visual Impact Rebuild
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V8_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 2.5, text: 'THE WALL IS NOT ON YOUR CHART', emphasis: ['WALL', 'NOT'] },
  { id: 'payoff', label: 'payoff', startSec: 2.5, endSec: 6.0, text: 'SPY IS 1.3% BELOW A HIDDEN CALL WALL', emphasis: ['1.3%', 'CALL WALL'] },
  { id: 'why_care', label: 'contrast', startSec: 6.0, endSec: 10.0, text: 'MOST CHARTS ONLY SHOW PRICE. THEY DO NOT SHOW WHERE PRESSURE MAY CONCENTRATE.', emphasis: ['PRESSURE', 'CONCENTRATE'] },
  { id: 'map', label: 'meaning', startSec: 10.0, endSec: 16.0, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: ['PRESSURE MAP'] },
  { id: 'insight', label: 'data', startSec: 16.0, endSec: 23.0, text: 'PRICE IS HERE. THE WALL IS HERE. THE GAP IS ONLY 1.3%.', emphasis: ['GAP', '1.3%'] },
  { id: 'product_toggle', label: 'product', startSec: 23.0, endSec: 30.0, text: 'NORMAL CHART: PRICE ONLY. SIGNUMHQ LAYER: WALL / FLOOR / FLIP.', emphasis: [] },
  { id: 'product_need', label: 'product', startSec: 30.0, endSec: 36.0, text: 'SIGNUMHQ TRACKS THE HIDDEN LAYER EVERY DAY.', emphasis: ['HIDDEN LAYER'] },
  { id: 'cta', label: 'cta', startSec: 36.0, endSec: 40.0, text: 'SEE WHAT OTHERS CANNOT.', emphasis: ['SEE', 'CANNOT'] },
];

export const MOCK_V8_CAPTIONS: CaptionSegment[] = [
  // 2.5-6.0s
  { id: 'c1', text: 'SPY is 1.3% below the wall.', startFrame: 75, endFrame: 180, emphasis: true },
  // 6.0-10.0s
  { id: 'c2', text: 'Most charts do not show this.', startFrame: 180, endFrame: 230, emphasis: false },
  { id: 'c3', text: 'Pressure may concentrate here.', startFrame: 230, endFrame: 300, emphasis: true },
  // 10.0-16.0s
  { id: 'c4', text: 'Not a prediction.', startFrame: 300, endFrame: 360, emphasis: false },
  { id: 'c5', text: 'A pressure map.', startFrame: 360, endFrame: 480, emphasis: true },
  // 16.0-23.0s
  { id: 'c6', text: 'The gap is only 1.3%.', startFrame: 540, endFrame: 690, emphasis: true },
  // 23.0-30.0s
  { id: 'c7', text: 'Normal chart: price only.', startFrame: 690, endFrame: 800, emphasis: false },
  { id: 'c8', text: 'SignumHQ: structure layer.', startFrame: 810, endFrame: 900, emphasis: true },
];

export function createMockMarketPressureBriefV8Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v8-${Date.now()}`,
    template: 'HiddenWallShort', // using existing template name string for type checking compatibility
    format: 'viral',
    ticker: 'SPY',
    title: 'Market Pressure Brief V8',
    hook: 'THE WALL IS NOT ON YOUR CHART.',
    scriptBeats: MOCK_V8_BEATS,
    captions: MOCK_V8_CAPTIONS,
    dataCards: [],
    structureVisual: {
      price: 592.31,
      callWall: 600,
      putFloor: 580,
      gammaFlipLevel: 588,
      nearestWall: 'call',
      distancePercent: 1.3,
    },
    broll: { url: 'shorts/broll/hook_wall.png', type: 'image', provider: 'replicate', isMock: false },
    voice: { audioUrl: 'shorts/audio/v6_voice.mp3', durationSec: 40.0, provider: 'elevenlabs', isMock: true },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE WHAT OTHERS CANNOT.',
    isMock: true,
    durationSec: 40.0,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
