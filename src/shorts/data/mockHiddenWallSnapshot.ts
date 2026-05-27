// ============================================================================
// Mock Hidden Wall Snapshot — MOCK DATA (NOT REAL MARKET DATA)
// Used for prototype rendering only.
// ============================================================================

import type { MarketSnapshot, TickerStructure, ShortsVideoInput, ScriptBeat, CaptionSegment, DataCardInput } from '../types';

/** Convert seconds to frames at 30fps */
const sec = (s: number) => Math.round(s * 30);

// ---------------------------------------------------------------------------
// Mock ticker structure — SPY
// ---------------------------------------------------------------------------
export const MOCK_SPY_STRUCTURE: TickerStructure = {
  ticker: 'SPY',
  price: 592.31,
  callWall: 600,
  putFloor: 575,
  gammaFlipLevel: 588,
  gammaRegime: 'negative',
  gexValue: -376_700_000,
  darkPoolPercent: 42.3,
  buyPct: 38,
  sellPct: 62,
  alphaScore: 61.4,
};

// ---------------------------------------------------------------------------
// Mock market snapshot
// ---------------------------------------------------------------------------
export const MOCK_MARKET_SNAPSHOT: MarketSnapshot = {
  timestamp: new Date().toISOString(),
  spy: -0.47,
  qqq: -0.82,
  vix: 21.3,
  gexRegime: 'negative',
  tickers: { SPY: MOCK_SPY_STRUCTURE },
  isMock: true,
};

// ---------------------------------------------------------------------------
// Script beats — 7-act structure for Hidden Wall
// ---------------------------------------------------------------------------
const FPS = 30;

export const MOCK_HIDDEN_WALL_BEATS: ScriptBeat[] = [
  {
    id: 'hook',
    label: 'hook',
    startSec: 0,
    endSec: 1.5,
    text: 'THE WALL IS NOT ON YOUR CHART.',
    emphasis: ['WALL', 'NOT'],
  },
  {
    id: 'curiosity',
    label: 'curiosity',
    startSec: 1.5,
    endSec: 4,
    text: 'Most traders only see price.',
    emphasis: ['only'],
  },
  {
    id: 'reveal',
    label: 'reveal',
    startSec: 4,
    endSec: 8,
    text: 'But options structure reveals hidden pressure zones that never appear on a chart.',
    emphasis: ['hidden', 'pressure zones'],
  },
  {
    id: 'data',
    label: 'data',
    startSec: 8,
    endSec: 14,
    text: 'SPY is trading at $592. The call wall sits at $600 — just 1.3% away. Gamma exposure is negative $377 million.',
    emphasis: ['$600', '1.3%', 'negative'],
  },
  {
    id: 'metaphor',
    label: 'metaphor',
    startSec: 14,
    endSec: 23,
    text: 'Price is approaching an invisible ceiling. The put floor at $575 and gamma flip at $588 create a pressure channel. This structure is not visible on any standard chart.',
    emphasis: ['invisible ceiling', 'pressure channel', 'not visible'],
  },
  {
    id: 'meaning',
    label: 'meaning',
    startSec: 23,
    endSec: 31,
    text: 'This is not a directional prediction. It indicates where the market structure may become most sensitive to the next move.',
    emphasis: ['not a directional prediction', 'most sensitive'],
  },
  {
    id: 'product',
    label: 'product',
    startSec: 31,
    endSec: 38,
    text: 'SignumHQ tracks these hidden structural layers across 30 institutional-grade tickers. Every day.',
    emphasis: ['hidden structural layers', 'Every day'],
  },
  {
    id: 'cta',
    label: 'cta',
    startSec: 38,
    endSec: 42,
    text: 'See what others cannot.',
    emphasis: ['See', 'cannot'],
  },
];

// ---------------------------------------------------------------------------
// Mock captions — handcrafted timing
// ---------------------------------------------------------------------------
export const MOCK_HIDDEN_WALL_CAPTIONS: CaptionSegment[] = [
  // Hook
  { id: 'c01', text: 'THE WALL IS NOT', startFrame: 0, endFrame: sec(0.8), emphasis: true, color: '#22d3ee' },
  { id: 'c02', text: 'ON YOUR CHART.', startFrame: sec(0.8), endFrame: sec(1.5), emphasis: true, color: '#f1f5f9' },
  // Curiosity
  { id: 'c03', text: 'Most traders', startFrame: sec(1.8), endFrame: sec(2.8) },
  { id: 'c04', text: 'only see price.', startFrame: sec(2.8), endFrame: sec(3.8), emphasis: true },
  // Reveal
  { id: 'c05', text: 'But options structure reveals', startFrame: sec(4.2), endFrame: sec(5.6) },
  { id: 'c06', text: 'hidden pressure zones', startFrame: sec(5.6), endFrame: sec(7), emphasis: true, color: '#a78bfa' },
  { id: 'c07', text: 'that never appear on a chart.', startFrame: sec(7), endFrame: sec(8) },
  // Data
  { id: 'c08', text: 'SPY at $592.', startFrame: sec(8.5), endFrame: sec(9.8) },
  { id: 'c09', text: 'Call wall: $600', startFrame: sec(9.8), endFrame: sec(11), emphasis: true, color: '#f87171' },
  { id: 'c10', text: '— just 1.3% away.', startFrame: sec(11), endFrame: sec(12.2), emphasis: true, color: '#fbbf24' },
  { id: 'c11', text: 'GEX: -$377M', startFrame: sec(12.2), endFrame: sec(13.8), emphasis: true, color: '#f87171' },
  // Metaphor — no captions, visual speaks
  { id: 'c12', text: 'Price approaching', startFrame: sec(14.5), endFrame: sec(16) },
  { id: 'c13', text: 'an invisible ceiling.', startFrame: sec(16), endFrame: sec(17.5), emphasis: true, color: '#22d3ee' },
  { id: 'c14', text: 'A pressure channel', startFrame: sec(18.5), endFrame: sec(20), emphasis: true, color: '#a78bfa' },
  { id: 'c15', text: 'not visible on any chart.', startFrame: sec(20.5), endFrame: sec(22.5) },
  // Meaning
  { id: 'c16', text: 'Not a directional prediction.', startFrame: sec(23.5), endFrame: sec(25.5) },
  { id: 'c17', text: 'It shows where structure', startFrame: sec(26), endFrame: sec(28) },
  { id: 'c18', text: 'becomes most sensitive.', startFrame: sec(28), endFrame: sec(30.5), emphasis: true, color: '#fbbf24' },
  // Product
  { id: 'c19', text: 'SignumHQ tracks these', startFrame: sec(31.5), endFrame: sec(33.5) },
  { id: 'c20', text: 'hidden layers. Every day.', startFrame: sec(33.5), endFrame: sec(36), emphasis: true, color: '#22d3ee' },
  // CTA
  { id: 'c21', text: 'See what others cannot.', startFrame: sec(38.5), endFrame: sec(41.5), emphasis: true, color: '#22d3ee' },
];

// ---------------------------------------------------------------------------
// Mock data cards
// ---------------------------------------------------------------------------
export const MOCK_DATA_CARDS: DataCardInput[] = [
  { label: 'Price', value: '$592.31', color: '#f1f5f9' },
  { label: 'Call Wall', value: '$600', color: '#f87171', unit: '↑1.3%' },
  { label: 'Gamma', value: '-$377M', color: '#f87171', unit: 'NEG' },
];

// ---------------------------------------------------------------------------
// Complete mock video input
// ---------------------------------------------------------------------------
export function createMockHiddenWallInput(): ShortsVideoInput {
  const ticker = MOCK_SPY_STRUCTURE;
  const nearestWall = ticker.callWall && ticker.price
    ? (ticker.callWall - ticker.price < ticker.price - (ticker.putFloor || 0) ? 'call' as const : 'put' as const)
    : null;
  const distPct = nearestWall === 'call' && ticker.callWall
    ? ((ticker.callWall - ticker.price) / ticker.price) * 100
    : nearestWall === 'put' && ticker.putFloor
      ? ((ticker.price - ticker.putFloor) / ticker.price) * 100
      : null;

  return {
    videoId: `mock-hidden-wall-${Date.now()}`,
    template: 'HiddenWallShort',
    format: 'viral',
    ticker: ticker.ticker,
    title: 'The Wall Is Not On Your Chart',
    hook: 'THE WALL IS NOT ON YOUR CHART.',
    scriptBeats: MOCK_HIDDEN_WALL_BEATS,
    captions: MOCK_HIDDEN_WALL_CAPTIONS,
    dataCards: MOCK_DATA_CARDS,
    structureVisual: {
      price: ticker.price,
      callWall: ticker.callWall,
      putFloor: ticker.putFloor,
      gammaFlipLevel: ticker.gammaFlipLevel,
      nearestWall,
      distancePercent: distPct ? Math.round(distPct * 10) / 10 : null,
    },
    broll: {
      url: '',
      type: 'image',
      provider: 'mock',
      isMock: true,
    },
    voice: {
      audioUrl: '',
      durationSec: 42,
      provider: 'mock',
      isMock: true,
    },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'See what others cannot.',
    isMock: true,
    durationSec: 42,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
