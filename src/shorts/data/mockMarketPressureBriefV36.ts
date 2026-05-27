// ============================================================================
// MarketPressureBrief V36 — SSoT (Single Source of Truth) Timeline
// Generated programmatically via scripts/generate-v36-audio.ts
// ============================================================================
import type { ShortsVideoInput, ScriptBeat, CaptionSegment } from '../types';

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
    "end": 3.239,
    "voice": "$420 million in off-exchange flow just hit SPY.",
    "caption": "$420M OFF-EXCHANGE FLOW JUST HIT SPY",
    "visualIntent": "show large flow alert, SPY ticker and $420M badges",
    "emphasis": [
      "$420M",
      "OFF-EXCHANGE",
      "FLOW",
      "SPY"
    ]
  },
  {
    "id": "wall",
    "start": 3.239,
    "end": 5.773,
    "voice": "It is clustering near the six hundred dollar wall.",
    "caption": "CLUSTERING NEAR THE $600 WALL",
    "visualIntent": "highlight SPY $600 resistance wall",
    "emphasis": [
      "CLUSTERING",
      "$600 WALL"
    ]
  },
  {
    "id": "contrast",
    "start": 5.773,
    "end": 9.3,
    "voice": "Most charts show price. They do not show this layer.",
    "caption": "MOST CHARTS SHOW PRICE. NOT THIS LAYER.",
    "visualIntent": "normal candlestick chart vs hidden structural contrast scanner sweep",
    "emphasis": [
      "MOST CHARTS",
      "NOT THIS LAYER"
    ]
  },
  {
    "id": "unmask",
    "start": 9.3,
    "end": 12.173,
    "voice": "SignumHQ maps the wall, the floor, and the flip.",
    "caption": "SIGNUMHQ MAPS WALL / FLOOR / FLIP",
    "visualIntent": "reveal Call Wall, Put Floor, Gamma Flip under terminal scanning",
    "emphasis": [
      "SIGNUMHQ",
      "WALL",
      "FLOOR",
      "FLIP"
    ]
  },
  {
    "id": "regime",
    "start": 12.173,
    "end": 14.759,
    "voice": "This is not a price call. It is a pressure map.",
    "caption": "NOT A PRICE CALL. A PRESSURE MAP.",
    "visualIntent": "zoom and screen shake tension to show gap compression",
    "emphasis": [
      "NOT A PRICE CALL",
      "PRESSURE MAP"
    ]
  },
  {
    "id": "cta",
    "start": 14.759,
    "end": 17.868,
    "voice": "See the hidden market structure at SignumHQ dot com.",
    "caption": "SEE THE HIDDEN MARKET STRUCTURE — SIGNUMHQ.COM",
    "visualIntent": "outro screen, lock in domain box",
    "emphasis": [
      "HIDDEN MARKET STRUCTURE",
      "SIGNUMHQ.COM"
    ]
  }
];

export function createMockMarketPressureBriefV36Input(): ShortsVideoInput {
  return {
    videoId: `mock-market-pressure-v36-spy-${Date.now()}`,
    template: 'MarketPressureBriefV36' as any,
    format: 'viral',
    ticker: 'SPY',
    title: 'V36 SSoT Audio Caption Lock',
    hook: "$420 million in off-exchange flow just hit SPY.",
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
      color: seg.id === 'cta' ? '#22d3ee' : undefined
    })),
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
      regime: 'negative gamma pressure zone',
    },
    broll: { url: 'shorts/broll/kling_terminal.mp4', type: 'video', provider: 'replicate', isMock: false },
    voice: { 
      audioUrl: 'shorts/audio/v36_voice.mp3', 
      durationSec: 17.868, 
      provider: 'elevenlabs', 
      isMock: false 
    },
    disclaimer: 'Institutional flow analysis. Real-time updates at SignumHQ.com. Not financial advice.',
    cta: 'GO TO SIGNUMHQ.COM TO UNLOCK LIVE STRUCTURE MAPS.',
    isMock: false,
    durationSec: 17.868,
    fps: 30,
    width: 1080,
    height: 1920,
  };
}
