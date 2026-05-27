// ============================================================================
// Mock Hidden Wall V6 — Audio Sync & Phrase Captions
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V6_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 1.4,
    text: 'THE WALL IS NOT ON YOUR CHART',
    emphasis: ['WALL', 'NOT'] },
  { id: 'reveal', label: 'reveal', startSec: 1.4, endSec: 3.6,
    text: 'HIDDEN WALL DETECTED',
    emphasis: ['HIDDEN WALL'] },
  { id: 'data', label: 'data', startSec: 3.6, endSec: 8.2,
    text: 'PRICE IS NEAR STRUCTURE.',
    emphasis: ['NEAR', 'STRUCTURE'] },
  { id: 'map', label: 'meaning', startSec: 8.2, endSec: 12.4,
    text: 'NOT A PREDICTION. A PRESSURE MAP.',
    emphasis: ['PRESSURE MAP'] },
  { id: 'product', label: 'product', startSec: 12.4, endSec: 17.4,
    text: 'SIGNUMHQ TRACKS THE HIDDEN LAYER.',
    emphasis: ['HIDDEN LAYER'] },
  { id: 'cta', label: 'cta', startSec: 17.4, endSec: 21.2,
    text: 'SEE WHAT OTHERS CANNOT.',
    emphasis: ['SEE', 'CANNOT'] },
];

// Phrase-level captions that DO NOT duplicate giant on-screen text unnecessarily
// They support the dense data scenes visually.
export const MOCK_V6_CAPTIONS: CaptionSegment[] = [
  // 1.4-3.6s
  { id: 'c1', text: 'Hidden structure detected.', startFrame: 42, endFrame: 108, emphasis: true },
  // 3.6-8.2s
  { id: 'c2', text: 'Price is near structure.', startFrame: 135, endFrame: 210, emphasis: false },
  // 8.2-12.4s
  { id: 'c3', text: 'Not a prediction.', startFrame: 255, endFrame: 300, emphasis: false },
  { id: 'c4', text: 'A pressure map.', startFrame: 300, endFrame: 360, emphasis: true },
  // 12.4-17.4s
  { id: 'c5', text: 'Normal chart.', startFrame: 384, endFrame: 420, emphasis: false },
  { id: 'c6', text: 'Hidden layer.', startFrame: 450, endFrame: 510, emphasis: true },
];

export function createMockHiddenWallV6Input(): ShortsVideoInput {
  return {
    videoId: `mock-hidden-wall-v6-${Date.now()}`,
    template: 'HiddenWallShort',
    format: 'viral',
    ticker: 'SPY',
    title: 'The Wall Is Not On Your Chart',
    hook: 'THE WALL IS NOT ON YOUR CHART.',
    scriptBeats: MOCK_V6_BEATS,
    captions: MOCK_V6_CAPTIONS,
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
    voice: { audioUrl: 'shorts/audio/v6_voice.mp3', durationSec: 21.2, provider: 'elevenlabs', isMock: true },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE WHAT OTHERS CANNOT.',
    isMock: true,
    durationSec: 21.2,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
