// ============================================================================
// Mock Hidden Wall V7 — Insight Message Rebuild
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V7_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 1.5, text: 'THE WALL IS NOT ON YOUR CHART', emphasis: ['WALL', 'NOT'] },
  { id: 'payoff', label: 'payoff', startSec: 1.5, endSec: 4.0, text: 'SPY IS 1.3% FROM A HIDDEN CALL WALL', emphasis: ['1.3%', 'CALL WALL'] },
  { id: 'contrast', label: 'contrast', startSec: 4.0, endSec: 7.0, text: 'PRICE IS VISIBLE. PRESSURE IS NOT.', emphasis: ['VISIBLE', 'NOT'] },
  { id: 'meaning', label: 'meaning', startSec: 7.0, endSec: 10.5, text: 'NOT A PREDICTION. A PRESSURE MAP.', emphasis: ['PRESSURE MAP'] },
  { id: 'product', label: 'product', startSec: 10.5, endSec: 15.5, text: 'NORMAL CHART: PRICE ONLY. SIGNUMHQ LAYER: WALL / FLOOR / FLIP.', emphasis: [] },
  { id: 'sentence', label: 'sentence', startSec: 15.5, endSec: 18.8, text: 'SIGNUMHQ TRACKS THE HIDDEN LAYER.', emphasis: ['HIDDEN LAYER'] },
  { id: 'cta', label: 'cta', startSec: 18.8, endSec: 21.5, text: 'SEE WHAT OTHERS CANNOT.', emphasis: ['SEE', 'CANNOT'] },
];

export const MOCK_V7_CAPTIONS: CaptionSegment[] = [
  // 1.5-4.0s
  { id: 'c1', text: 'SPY is 1.3% from the wall.', startFrame: 45, endFrame: 120, emphasis: true },
  // 4.0-7.0s
  { id: 'c2', text: 'Most charts do not show this.', startFrame: 135, endFrame: 210, emphasis: false },
  // 7.0-10.5s
  { id: 'c3', text: 'Not a prediction.', startFrame: 210, endFrame: 260, emphasis: false },
  { id: 'c4', text: 'A pressure map.', startFrame: 260, endFrame: 315, emphasis: true },
  // 10.5-15.5s
  { id: 'c5', text: 'Normal chart: price only.', startFrame: 330, endFrame: 400, emphasis: false },
  { id: 'c6', text: 'SignumHQ: structure layer.', startFrame: 410, endFrame: 465, emphasis: true },
];

export function createMockHiddenWallV7Input(): ShortsVideoInput {
  return {
    videoId: `mock-hidden-wall-v7-${Date.now()}`,
    template: 'HiddenWallShort',
    format: 'viral',
    ticker: 'SPY',
    title: 'The Wall Is Not On Your Chart',
    hook: 'THE WALL IS NOT ON YOUR CHART.',
    scriptBeats: MOCK_V7_BEATS,
    captions: MOCK_V7_CAPTIONS,
    dataCards: [],
    structureVisual: {
      price: 592.31,
      callWall: 600,
      putFloor: 580,
      gammaFlipLevel: 588,
      nearestWall: 'call',
      distancePercent: 1.3,
    },
    broll: { url: 'shorts/wall_broll_v4.png', type: 'image', provider: 'replicate', isMock: false },
    voice: { audioUrl: 'shorts/audio/v6_voice.mp3', durationSec: 21.5, provider: 'elevenlabs', isMock: true },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE WHAT OTHERS CANNOT.',
    isMock: true,
    durationSec: 21.5,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
