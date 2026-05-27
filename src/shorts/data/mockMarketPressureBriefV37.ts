// ============================================================================
// MarketPressureBrief V37 — SSoT (Single Source of Truth) Timeline
// Generated programmatically via scripts/generate-v37-audio.ts
// ============================================================================
import type { ShortsVideoInput } from '../types';

export type NarrativeSegment = {
  id: string;
  start: number;
  end: number;
  voice: string;
  caption: string;
  visualIntent: string;
  emphasis?: string[];
};

export const NARRATIVE_TIMELINE: NarrativeSegment[] = [
  {
    "id": "hook",
    "start": 0,
    "end": 3.762,
    "voice": "$5.4B in institutional block trades just exposed in Nvidia.",
    "caption": "$5.4B INSTITUTIONAL BLOCK TRADES EXPOSED IN NVDA",
    "visualIntent": "show large flow alert, NVDA ticker and $5.4B badges",
    "emphasis": [
      "$5.4B",
      "INSTITUTIONAL",
      "BLOCK TRADES",
      "NVDA"
    ]
  },
  {
    "id": "wall",
    "start": 3.762,
    "end": 7.236,
    "voice": "It is coiling near the 250 dollar call resistance wall.",
    "caption": "COILING NEAR THE $250 CALL RESISTANCE WALL",
    "visualIntent": "highlight NVDA $250 resistance wall",
    "emphasis": [
      "COILING",
      "$250",
      "CALL RESISTANCE"
    ]
  },
  {
    "id": "contrast",
    "start": 7.236,
    "end": 11.86,
    "voice": "Normal retail charts only show price. They do not map this coiling pressure.",
    "caption": "NORMAL CHARTS ONLY SHOW PRICE. NOT THIS PRESSURE.",
    "visualIntent": "normal candlestick chart vs hidden structural contrast scanner sweep",
    "emphasis": [
      "ONLY SHOW PRICE",
      "NOT THIS PRESSURE"
    ]
  },
  {
    "id": "unmask",
    "start": 11.86,
    "end": 17.424,
    "voice": "SignumHQ unmasks the wall at 250, floor at 200, and the flip at 235.",
    "caption": "UNMASKING WALL: $250 | FLOOR: $200 | FLIP: $235",
    "visualIntent": "reveal Call Wall, Put Floor, Gamma Flip under terminal scanning",
    "emphasis": [
      "WALL: $250",
      "FLOOR: $200",
      "FLIP: $235"
    ]
  },
  {
    "id": "regime",
    "start": 17.424,
    "end": 20.793,
    "voice": "This is a highly compressed negative gamma coiling regime.",
    "caption": "HIGHLY COMPRESSED NEGATIVE GAMMA REGIME",
    "visualIntent": "zoom and screen shake tension to show gap compression",
    "emphasis": [
      "NEGATIVE GAMMA REGIME"
    ]
  },
  {
    "id": "cta",
    "start": 20.793,
    "end": 24.633,
    "voice": "See the live institutional maps for yourself at SignumHQ dot com.",
    "caption": "SEE THE LIVE STRUCTURE MAPS — SIGNUMHQ.COM",
    "visualIntent": "outro screen, lock in domain box",
    "emphasis": [
      "LIVE STRUCTURE MAPS",
      "SIGNUMHQ.COM"
    ]
  }
];

export function createMockMarketPressureBriefV37Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v37-nvda-${Date.now()}`,
    template: 'MarketPressureBriefV37' as any,
    format: 'viral',
    ticker: 'NVDA',
    title: 'V37 Premium Real-time NVDA Stream',
    hook: "$5.4B in institutional block trades just exposed in Nvidia.",
    scriptBeats: NARRATIVE_TIMELINE.map((seg, idx) => ({
      id: seg.id,
      label: idx === 0 ? 'hook' : (idx === NARRATIVE_TIMELINE.length - 1 ? 'cta' : 'info'),
      startSec: seg.start,
      endSec: seg.end,
      text: seg.voice,
      emphasis: seg.emphasis || []
    })),
    captions: NARRATIVE_TIMELINE.map((seg) => ({
      id: `caption-${seg.id}`,
      text: seg.caption,
      startFrame: Math.round(seg.start * 30),
      endFrame: Math.round(seg.end * 30),
      emphasis: true,
      color: seg.id === 'cta' ? '#e07a5f' : undefined // Burnt Amber color
    })),
    dataCards: [],
    structureVisual: {
      price: 221.2,
      callWall: 250,
      putFloor: 200,
      gammaFlipLevel: 235,
      nearestWall: 'call',
      distancePercent: 13,
      darkPoolNotional: 5383372050,
      darkPoolPercentile: 94,
      offExchangeVolumeRatio: 1.8,
      flowDirection: 'coiling near structural wall',
      regime: 'negative gamma pressure zone',
    },
    broll: { url: 'shorts/broll/kling_terminal.mp4', type: 'video', provider: 'replicate', isMock: false },
    voice: { 
      audioUrl: 'shorts/audio/v37_voice.mp3', 
      durationSec: 24.633, 
      provider: 'elevenlabs', 
      isMock: false 
    },
    disclaimer: 'Institutional flow analysis. Real-time updates at SignumHQ.com. Not financial advice.',
    cta: 'GO TO SIGNUMHQ.COM TO UNLOCK LIVE STRUCTURE MAPS.',
    isMock: false,
    durationSec: 24.633,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
