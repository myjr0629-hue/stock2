// ============================================================================
// Mock Hidden Wall V2 — MOCK DATA (NOT REAL MARKET DATA)
// Shortened to 35s. Silent-first beat structure.
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment, DataCardInput } from '../types';

const FPS = 30;
const sec = (s: number) => Math.round(s * FPS);

// ---------------------------------------------------------------------------
// Script beats — 8-beat silent-first structure (35s total)
// ---------------------------------------------------------------------------
export const MOCK_V2_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 0.7,
    text: 'THE WALL IS NOT ON YOUR CHART.',
    emphasis: ['WALL', 'NOT'] },
  { id: 'contrast', label: 'curiosity', startSec: 0.7, endSec: 2.5,
    text: 'PRICE IS VISIBLE. STRUCTURE IS NOT.',
    emphasis: ['VISIBLE', 'NOT'] },
  { id: 'reveal', label: 'reveal', startSec: 2.5, endSec: 5,
    text: 'A hidden options wall sits near price.',
    emphasis: ['hidden', 'wall'] },
  { id: 'data', label: 'data', startSec: 5, endSec: 9,
    text: 'SPY $592 — Call Wall $600 — 1.3% away.',
    emphasis: ['$600', '1.3%'] },
  { id: 'pressure', label: 'metaphor', startSec: 9, endSec: 16,
    text: 'Price approaches the structural boundary. Pressure compresses.',
    emphasis: ['boundary', 'compresses'] },
  { id: 'meaning', label: 'meaning', startSec: 16, endSec: 23,
    text: 'Not a prediction. A pressure map.',
    emphasis: ['pressure map'] },
  { id: 'product', label: 'product', startSec: 23, endSec: 30,
    text: 'SignumHQ tracks the hidden layer every day.',
    emphasis: ['hidden layer', 'every day'] },
  { id: 'cta', label: 'cta', startSec: 30, endSec: 35,
    text: 'SEE WHAT OTHERS CANNOT.',
    emphasis: ['SEE', 'CANNOT'] },
];

// ---------------------------------------------------------------------------
// Captions — Silent-first: designed visual copy, not subtitles
// ---------------------------------------------------------------------------
export const MOCK_V2_CAPTIONS: CaptionSegment[] = [
  // Beat 1: Hook — text is rendered as HookText, not caption
  // Beat 2: Contrast
  { id: 'c01', text: 'PRICE IS VISIBLE.', startFrame: sec(0.9), endFrame: sec(1.7), emphasis: true },
  { id: 'c02', text: 'STRUCTURE IS NOT.', startFrame: sec(1.7), endFrame: sec(2.5), emphasis: true, color: '#22d3ee' },
  // Beat 3: Reveal
  { id: 'c03', text: 'A hidden options wall', startFrame: sec(2.8), endFrame: sec(3.8), emphasis: true, color: '#a78bfa' },
  { id: 'c04', text: 'sits near price.', startFrame: sec(3.8), endFrame: sec(4.8) },
  // Beat 4: Data — rendered as cards, captions reinforce
  { id: 'c05', text: 'SPY at $592', startFrame: sec(5.3), endFrame: sec(6.5) },
  { id: 'c06', text: 'Call Wall: $600', startFrame: sec(6.5), endFrame: sec(7.8), emphasis: true, color: '#f87171' },
  { id: 'c07', text: '1.3% away.', startFrame: sec(7.8), endFrame: sec(8.8), emphasis: true, color: '#fbbf24' },
  // Beat 5: Pressure — visual metaphor carries, captions support
  { id: 'c08', text: 'Price approaches', startFrame: sec(10), endFrame: sec(11.5) },
  { id: 'c09', text: 'the structural boundary.', startFrame: sec(11.5), endFrame: sec(13.5), emphasis: true, color: '#22d3ee' },
  { id: 'c10', text: 'Pressure compresses.', startFrame: sec(14), endFrame: sec(15.8), emphasis: true, color: '#f87171' },
  // Beat 6: Meaning
  { id: 'c11', text: 'Not a prediction.', startFrame: sec(16.5), endFrame: sec(18.5) },
  { id: 'c12', text: 'A pressure map.', startFrame: sec(19), endFrame: sec(21.5), emphasis: true, color: '#a78bfa' },
  // Beat 7: Product
  { id: 'c13', text: 'SignumHQ tracks', startFrame: sec(24), endFrame: sec(26) },
  { id: 'c14', text: 'the hidden layer.', startFrame: sec(26), endFrame: sec(28), emphasis: true, color: '#22d3ee' },
  { id: 'c15', text: 'Every day.', startFrame: sec(28.5), endFrame: sec(29.8), emphasis: true },
  // Beat 8: CTA — rendered as BrandCTALockup, no caption needed
];

// ---------------------------------------------------------------------------
// Data cards — max 3
// ---------------------------------------------------------------------------
export const MOCK_V2_DATA_CARDS: DataCardInput[] = [
  { label: 'Price', value: '$592.31', color: '#f1f5f9' },
  { label: 'Call Wall', value: '$600', color: '#f87171', unit: '↑1.3%' },
  { label: 'Gamma', value: '-$377M', color: '#f87171', unit: 'NEG' },
];

// ---------------------------------------------------------------------------
// Complete mock input — V2
// ---------------------------------------------------------------------------
export function createMockHiddenWallV2Input(): ShortsVideoInput {
  return {
    videoId: `mock-hidden-wall-v2-${Date.now()}`,
    template: 'HiddenWallShort',
    format: 'viral',
    ticker: 'SPY',
    title: 'The Wall Is Not On Your Chart',
    hook: 'THE WALL IS NOT ON YOUR CHART.',
    scriptBeats: MOCK_V2_BEATS,
    captions: MOCK_V2_CAPTIONS,
    dataCards: MOCK_V2_DATA_CARDS,
    structureVisual: {
      price: 592.31,
      callWall: 600,
      putFloor: 575,
      gammaFlipLevel: 588,
      nearestWall: 'call',
      distancePercent: 1.3,
    },
    broll: { url: '', type: 'image', provider: 'mock', isMock: true },
    voice: { audioUrl: '', durationSec: 35, provider: 'mock', isMock: true },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE WHAT OTHERS CANNOT.',
    isMock: true,
    durationSec: 35,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
