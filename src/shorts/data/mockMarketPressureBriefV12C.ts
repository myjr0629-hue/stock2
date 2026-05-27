// ============================================================================
// Mock Market Pressure Brief V12C — Chart vs Structure Hook
// ============================================================================

import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

export const MOCK_V12C_BEATS: ScriptBeat[] = [
  { id: 'hook', label: 'hook', startSec: 0, endSec: 3.0, text: 'NORMAL CHART: PRICE ONLY. SIGNUMHQ: STRUCTURE LAYER.', emphasis: [] },
  { id: 'payoff', label: 'payoff', startSec: 3.0, endSec: 6.0, text: 'SPY IS 1.3% BELOW A HIDDEN CALL WALL.', emphasis: [] },
  { id: 'meaning', label: 'meaning', startSec: 6.0, endSec: 9.0, text: 'THIS IS NOT A PREDICTION. IT IS A PRESSURE MAP.', emphasis: [] },
  { id: 'layers', label: 'layers', startSec: 9.0, endSec: 14.0, text: 'WALL. FLOOR. FLIP.', emphasis: [] },
  { id: 'product', label: 'product', startSec: 14.0, endSec: 18.0, text: 'SIGNUMHQ TRACKS THE HIDDEN LAYER.', emphasis: [] },
  { id: 'cta', label: 'cta', startSec: 18.0, endSec: 21.0, text: 'SEE THE STRUCTURE BEHIND PRICE.', emphasis: [] },
];

export const MOCK_V12C_CAPTIONS: CaptionSegment[] = [
  { id: 'c1', startFrame: 30, endFrame: 80, text: 'Structure vs Price', emphasis: true },
  { id: 'c2', startFrame: 100, endFrame: 160, text: '1.3% below the wall', emphasis: false },
  { id: 'c3', startFrame: 430, endFrame: 520, text: 'Tracks the hidden layer', emphasis: true }
];

export function createMockMarketPressureBriefV12CInput(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v12c-${Date.now()}`,
    template: 'HiddenWallShort',
    format: 'viral',
    ticker: 'SPY',
    title: 'Market Pressure Brief V12C Chart vs Structure',
    hook: 'NORMAL CHART: PRICE ONLY. SIGNUMHQ: STRUCTURE LAYER.',
    scriptBeats: MOCK_V12C_BEATS,
    captions: MOCK_V12C_CAPTIONS,
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
    voice: { audioUrl: 'shorts/audio/v12c_01.mp3', durationSec: 21.0, provider: 'elevenlabs', isMock: false },
    disclaimer: 'Market structure brief. Not financial advice.',
    cta: 'SEE THE STRUCTURE BEHIND PRICE.',
    isMock: false,
    durationSec: 21.0,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
