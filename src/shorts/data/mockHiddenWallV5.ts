// ============================================================================
// Mock Hidden Wall V5 — Interactive Market Structure System
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V5_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 1.0,
    text: 'THE WALL IS NOT ON YOUR CHART',
    emphasis: ['WALL', 'NOT'] },
  { id: 'reveal', label: 'reveal', startSec: 1.0, endSec: 4.0,
    text: 'HIDDEN WALL DETECTED',
    emphasis: ['HIDDEN WALL'] },
  { id: 'data', label: 'data', startSec: 4.0, endSec: 9.0,
    text: 'PRICE IS NEAR STRUCTURE.',
    emphasis: ['NEAR', 'STRUCTURE'] },
  { id: 'map', label: 'meaning', startSec: 9.0, endSec: 14.0,
    text: 'NOT A PREDICTION. A PRESSURE MAP.',
    emphasis: ['PRESSURE MAP'] },
  { id: 'product', label: 'product', startSec: 14.0, endSec: 20.0,
    text: 'SIGNUMHQ TRACKS THE HIDDEN LAYER.',
    emphasis: ['HIDDEN LAYER'] },
  { id: 'cta', label: 'cta', startSec: 20.0, endSec: 26.0,
    text: 'SEE WHAT OTHERS CANNOT.',
    emphasis: ['SEE', 'CANNOT'] },
];

export const MOCK_V5_CAPTIONS: CaptionSegment[] = [];

export function createMockHiddenWallV5Input(): ShortsVideoInput {
  return {
    videoId: `mock-hidden-wall-v5-${Date.now()}`,
    template: 'HiddenWallShort',
    format: 'viral',
    ticker: 'SPY',
    title: 'The Wall Is Not On Your Chart',
    hook: 'THE WALL IS NOT ON YOUR CHART.',
    scriptBeats: MOCK_V5_BEATS,
    captions: MOCK_V5_CAPTIONS,
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
    voice: { audioUrl: '', durationSec: 26, provider: 'mock', isMock: true },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE WHAT OTHERS CANNOT.',
    isMock: true,
    durationSec: 21.2,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
