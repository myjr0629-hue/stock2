// ============================================================================
// Mock Hidden Wall V3 — 28s MASTERPIECE CUT
// Silent-first. Every second has visual purpose.
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

const FPS = 30;
const S = (s: number) => Math.round(s * FPS);

export const MOCK_V3_BEATS: ScriptBeat[] = [
  { id: 'shock', label: 'hook', startSec: 0, endSec: 0.4,
    text: '', emphasis: [] }, // visual-only instant shock
  { id: 'hook', label: 'hook', startSec: 0.4, endSec: 1.4,
    text: 'THE WALL IS NOT ON YOUR CHART.',
    emphasis: ['WALL', 'NOT'] },
  { id: 'contrast', label: 'curiosity', startSec: 1.4, endSec: 2.6,
    text: 'PRICE IS VISIBLE. STRUCTURE IS NOT.',
    emphasis: ['VISIBLE', 'NOT'] },
  { id: 'reveal', label: 'reveal', startSec: 2.6, endSec: 4.8,
    text: 'HIDDEN WALL DETECTED',
    emphasis: ['HIDDEN WALL'] },
  { id: 'data', label: 'data', startSec: 4.8, endSec: 7.5,
    text: 'SPY $592 — Call Wall $600 — 1.3% away.',
    emphasis: ['$600', '1.3%'] },
  { id: 'pressure', label: 'metaphor', startSec: 7.5, endSec: 12.5,
    text: 'PRICE IS NEAR STRUCTURE.',
    emphasis: ['NEAR', 'STRUCTURE'] },
  { id: 'map', label: 'meaning', startSec: 12.5, endSec: 16.5,
    text: 'NOT A PREDICTION. A PRESSURE MAP.',
    emphasis: ['PRESSURE MAP'] },
  { id: 'product', label: 'product', startSec: 16.5, endSec: 21.5,
    text: 'SIGNUMHQ TRACKS THE HIDDEN LAYER.',
    emphasis: ['HIDDEN LAYER'] },
  { id: 'cta', label: 'cta', startSec: 21.5, endSec: 25,
    text: 'SEE WHAT OTHERS CANNOT.',
    emphasis: ['SEE', 'CANNOT'] },
];

export const MOCK_V3_CAPTIONS: CaptionSegment[] = [
  // Beat 2: Hook — rendered as HookText component, but also caption for emphasis
  // Beat 3: Contrast
  { id: 'c01', text: 'PRICE IS VISIBLE.', startFrame: S(1.5), endFrame: S(2.0), emphasis: false },
  { id: 'c02', text: 'STRUCTURE IS NOT.', startFrame: S(2.0), endFrame: S(2.5), emphasis: true, color: '#22d3ee' },
  // Beat 4: Wall reveal
  { id: 'c03', text: 'HIDDEN WALL DETECTED', startFrame: S(3.0), endFrame: S(4.5), emphasis: true, color: '#f87171' },
  // Beat 5: Data — floating metrics, captions reinforce
  { id: 'c04', text: 'SPY at $592', startFrame: S(5.0), endFrame: S(6.0) },
  { id: 'c05', text: 'Call Wall: $600', startFrame: S(6.2), endFrame: S(7.3), emphasis: true, color: '#f87171' },
  // Beat 6: Pressure
  { id: 'c06', text: 'PRICE APPROACHING', startFrame: S(8.0), endFrame: S(9.5) },
  { id: 'c07', text: 'STRUCTURAL BOUNDARY.', startFrame: S(9.8), endFrame: S(11.5), emphasis: true, color: '#22d3ee' },
  { id: 'c08', text: 'PRESSURE BUILDS.', startFrame: S(11.8), endFrame: S(12.3), emphasis: true, color: '#f87171' },
  // Beat 7: Map
  { id: 'c09', text: 'Not a prediction.', startFrame: S(13.0), endFrame: S(14.5) },
  { id: 'c10', text: 'A PRESSURE MAP.', startFrame: S(14.8), endFrame: S(16.2), emphasis: true, color: '#a78bfa' },
  // Beat 8: Product
  { id: 'c11', text: 'SIGNUMHQ TRACKS', startFrame: S(17.0), endFrame: S(18.5) },
  { id: 'c12', text: 'THE HIDDEN LAYER.', startFrame: S(18.8), endFrame: S(20.5), emphasis: true, color: '#22d3ee' },
  // Beat 9: CTA — BrandCTALockup handles text
];

export function createMockHiddenWallV3Input(): ShortsVideoInput {
  return {
    videoId: `mock-hidden-wall-v3-${Date.now()}`,
    template: 'HiddenWallShort',
    format: 'viral',
    ticker: 'SPY',
    title: 'The Wall Is Not On Your Chart',
    hook: 'THE WALL IS NOT ON YOUR CHART.',
    scriptBeats: MOCK_V3_BEATS,
    captions: MOCK_V3_CAPTIONS,
    dataCards: [], // V3: no boxed cards — floating metrics integrated in wall viz
    structureVisual: {
      price: 592.31,
      callWall: 600,
      putFloor: 575,
      gammaFlipLevel: 588,
      nearestWall: 'call',
      distancePercent: 1.3,
    },
    broll: { url: 'shorts/wall_broll_v3.png', type: 'image', provider: 'replicate', isMock: false },
    voice: { audioUrl: '', durationSec: 25, provider: 'mock', isMock: true },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE WHAT OTHERS CANNOT.',
    isMock: true,
    durationSec: 25,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
