import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V25_BEATS: ScriptBeat[] = [
  { id: 'market-alert', label: 'hook', startSec: 0, endSec: 3.0, text: 'MARKET MAKERS WANT YOU TO IGNORE THIS, BUT LOOK AT THIS WALL', emphasis: ['IGNORE', 'LOOK', 'WALL'] },
  { id: 'hidden-anomalies', label: 'fomo', startSec: 3.0, endSec: 8.0, text: 'FOUR HUNDRED TWENTY MILLION OFF-EXCHANGE, NEAR THE SPY WALL', emphasis: ['MILLION', 'OFF-EXCHANGE', 'SPY', 'WALL'] },
  { id: 'active-structure', label: 'reveal', startSec: 8.0, endSec: 12.0, text: 'NORMAL CHARTS SHOW PRICE, SIGNUMHQ SHOWS STRUCTURE', emphasis: ['SIGNUMHQ', 'STRUCTURE'] },
  { id: 'critical-squeeze', label: 'squeeze', startSec: 12.0, endSec: 17.0, text: 'THE GAP IS SHRINKING, ONLY ONE POINT THREE PERCENT LEFT', emphasis: ['GAP', 'SHRINKING', 'PERCENT', 'LEFT'] },
  { id: 'options-implosion', label: 'implosion', startSec: 17.0, endSec: 21.0, text: 'WHEN IT HITS, THE OPTIONS GAMMA WILL IMPLODE', emphasis: ['HITS', 'GAMMA', 'IMPLODE'] },
  { id: 'live-authority', label: 'cta', startSec: 21.0, endSec: 25.0, text: 'WE TRACK THIS LIVE. GO TO SIGNUMHQ.COM. SEE THE NEXT MOVE BEFORE THEY LOCK IT', emphasis: ['LIVE', 'SIGNUMHQ.COM', 'MOVE', 'LOCK'] },
  { id: 'infinite-loop', label: 'loop', startSec: 25.0, endSec: 28.0, text: 'LOOK AT THIS WALL.', emphasis: ['LOOK', 'WALL'] },
];

export const MOCK_V25_CAPTIONS: CaptionSegment[] = [
  // --- Beat 1 (0.0s - 3.0s, 0f - 90f) ---
  { id: 'b1-w1', text: 'MARKET', startFrame: 0, endFrame: 10 },
  { id: 'b1-w2', text: 'MAKERS', startFrame: 10, endFrame: 20 },
  { id: 'b1-w3', text: 'WANT', startFrame: 20, endFrame: 28 },
  { id: 'b1-w4', text: 'YOU', startFrame: 28, endFrame: 35 },
  { id: 'b1-w5', text: 'TO', startFrame: 35, endFrame: 42 },
  { id: 'b1-w6', text: 'IGNORE', startFrame: 42, endFrame: 52, emphasis: true, color: '#f87171' },
  { id: 'b1-w7', text: 'THIS,', startFrame: 52, endFrame: 60 },
  { id: 'b1-w8', text: 'BUT', startFrame: 60, endFrame: 68 },
  { id: 'b1-w9', text: 'LOOK', startFrame: 68, endFrame: 76, emphasis: true, color: '#22d3ee' },
  { id: 'b1-w10', text: 'AT', startFrame: 76, endFrame: 82 },
  { id: 'b1-w11', text: 'THIS', startFrame: 82, endFrame: 86 },
  { id: 'b1-w12', text: 'WALL', startFrame: 86, endFrame: 90, emphasis: true, color: '#fbbf24' },

  // --- Beat 2 (3.0s - 8.0s, 90f - 240f) ---
  { id: 'b2-w1', text: 'FOUR', startFrame: 90, endFrame: 100 },
  { id: 'b2-w2', text: 'HUNDRED', startFrame: 100, endFrame: 110 },
  { id: 'b2-w3', text: 'TWENTY', startFrame: 110, endFrame: 120 },
  { id: 'b2-w4', text: 'MILLION', startFrame: 120, endFrame: 135, emphasis: true, color: '#22d3ee' },
  { id: 'b2-w5', text: 'OFF-EXCHANGE,', startFrame: 135, endFrame: 160, emphasis: true, color: '#f87171' },
  { id: 'b2-w6', text: 'NEAR', startFrame: 160, endFrame: 175 },
  { id: 'b2-w7', text: 'THE', startFrame: 175, endFrame: 190 },
  { id: 'b2-w8', text: 'SPY', startFrame: 190, endFrame: 210, emphasis: true, color: '#22d3ee' },
  { id: 'b2-w9', text: 'WALL', startFrame: 210, endFrame: 240, emphasis: true, color: '#fbbf24' },

  // --- Beat 3 (8.0s - 12.0s, 240f - 360f) ---
  { id: 'b3-w1', text: 'NORMAL', startFrame: 240, endFrame: 252 },
  { id: 'b3-w2', text: 'CHARTS', startFrame: 252, endFrame: 265 },
  { id: 'b3-w3', text: 'SHOW', startFrame: 265, endFrame: 275 },
  { id: 'b3-w4', text: 'PRICE,', startFrame: 275, endFrame: 290, color: '#94a3b8' },
  { id: 'b3-w5', text: 'SIGNUMHQ', startFrame: 290, endFrame: 315, emphasis: true, color: '#22d3ee' },
  { id: 'b3-w6', text: 'SHOWS', startFrame: 315, endFrame: 330 },
  { id: 'b3-w7', text: 'STRUCTURE', startFrame: 330, endFrame: 360, emphasis: true, color: '#fbbf24' },

  // --- Beat 4 (12.0s - 17.0s, 360f - 510f) ---
  { id: 'b4-w1', text: 'THE', startFrame: 360, endFrame: 370 },
  { id: 'b4-w2', text: 'GAP', startFrame: 370, endFrame: 385, emphasis: true, color: '#f87171' },
  { id: 'b4-w3', text: 'IS', startFrame: 385, endFrame: 395 },
  { id: 'b4-w4', text: 'SHRINKING,', startFrame: 395, endFrame: 415, emphasis: true, color: '#f87171' },
  { id: 'b4-w5', text: 'ONLY', startFrame: 415, endFrame: 430 },
  { id: 'b4-w6', text: 'ONE', startFrame: 430, endFrame: 442 },
  { id: 'b4-w7', text: 'POINT', startFrame: 442, endFrame: 452 },
  { id: 'b4-w8', text: 'THREE', startFrame: 452, endFrame: 468 },
  { id: 'b4-w9', text: 'PERCENT', startFrame: 468, endFrame: 485, emphasis: true, color: '#fbbf24' },
  { id: 'b4-w10', text: 'LEFT', startFrame: 485, endFrame: 510, emphasis: true, color: '#f87171' },

  // --- Beat 5 (17.0s - 21.0s, 510f - 630f) ---
  { id: 'b5-w1', text: 'WHEN', startFrame: 510, endFrame: 522 },
  { id: 'b5-w2', text: 'IT', startFrame: 522, endFrame: 534 },
  { id: 'b5-w3', text: 'HITS,', startFrame: 534, endFrame: 550, emphasis: true, color: '#f87171' },
  { id: 'b5-w4', text: 'THE', startFrame: 550, endFrame: 562 },
  { id: 'b5-w5', text: 'OPTIONS', startFrame: 562, endFrame: 578 },
  { id: 'b5-w6', text: 'GAMMA', startFrame: 578, endFrame: 602, emphasis: true, color: '#a78bfa' },
  { id: 'b5-w7', text: 'WILL', startFrame: 602, endFrame: 612 },
  { id: 'b5-w8', text: 'IMPLODE', startFrame: 612, endFrame: 630, emphasis: true, color: '#a78bfa' },

  // --- Beat 6 (21.0s - 25.0s, 630f - 750f) ---
  { id: 'b6-w1', text: 'WE', startFrame: 630, endFrame: 638 },
  { id: 'b6-w2', text: 'TRACK', startFrame: 638, endFrame: 648 },
  { id: 'b6-w3', text: 'THIS', startFrame: 648, endFrame: 656 },
  { id: 'b6-w4', text: 'LIVE.', startFrame: 656, endFrame: 670, emphasis: true, color: '#22d3ee' },
  { id: 'b6-w5', text: 'GO', startFrame: 670, endFrame: 678 },
  { id: 'b6-w6', text: 'TO', startFrame: 678, endFrame: 684 },
  { id: 'b6-w7', text: 'SIGNUMHQ.COM.', startFrame: 684, endFrame: 708, emphasis: true, color: '#22d3ee' },
  { id: 'b6-w8', text: 'SEE', startFrame: 708, endFrame: 716 },
  { id: 'b6-w9', text: 'THE', startFrame: 716, endFrame: 722 },
  { id: 'b6-w10', text: 'NEXT', startFrame: 722, endFrame: 730 },
  { id: 'b6-w11', text: 'MOVE', startFrame: 730, endFrame: 738, emphasis: true, color: '#fbbf24' },
  { id: 'b6-w12', text: 'BEFORE', startFrame: 738, endFrame: 744 },
  { id: 'b6-w13', text: 'THEY', startFrame: 744, endFrame: 747 },
  { id: 'b6-w14', text: 'LOCK', startFrame: 747, endFrame: 749, emphasis: true, color: '#f87171' },
  { id: 'b6-w15', text: 'IT', startFrame: 749, endFrame: 750 },

  // --- Beat 7 (25.0s - 28.0s, 750f - 840f) ---
  { id: 'b7-w1', text: 'LOOK', startFrame: 750, endFrame: 770, emphasis: true, color: '#22d3ee' },
  { id: 'b7-w2', text: 'AT', startFrame: 770, endFrame: 790 },
  { id: 'b7-w3', text: 'THIS', startFrame: 790, endFrame: 810 },
  { id: 'b7-w4', text: 'WALL.', startFrame: 810, endFrame: 840, emphasis: true, color: '#fbbf24' },
];

export function createMockMarketPressureBriefV25Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v25-${Date.now()}`,
    template: 'MarketPressureBriefV25' as any,
    format: 'viral',
    ticker: 'SPY',
    title: 'Cinematic V25 28s Magic Prototype',
    hook: 'MARKET MAKERS WANT YOU TO IGNORE THIS, BUT LOOK AT THIS WALL',
    scriptBeats: MOCK_V25_BEATS,
    captions: MOCK_V25_CAPTIONS,
    dataCards: [],
    structureVisual: {
      price: 592.31,
      callWall: 600.00,
      putFloor: 580.00,
      gammaFlipLevel: 588.00,
      nearestWall: 'call',
      distancePercent: 1.3,
      darkPoolNotional: 420000000,
      darkPoolPercentile: 91,
      offExchangeVolumeRatio: 2.4,
      flowDirection: 'clustered near upper structure',
      regime: 'negative gamma pressure zone'
    },
    broll: { url: 'shorts/broll/kling_terminal.mp4', type: 'video' as const, provider: 'replicate' as const, isMock: false },
    voice: { audioUrl: 'shorts/audio/v25_voice.mp3', durationSec: 28.0, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'GO TO SIGNUMHQ.COM TO UNLOCK LIVE STRUCTURE MAPS.',
    isMock: false,
    durationSec: 28.0,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
