// ============================================================================
// Remotion Root — 모든 Composition 등록 (V3 Hybrid)
// ============================================================================

import React from 'react';
import { Composition } from 'remotion';
import { MarketPulseVideo, type MarketPulseProps } from './compositions/MarketPulseVideo';
import { NewsDigestVideo, type NewsDigestProps } from './compositions/NewsDigestVideo';
import { EventSpikeVideo, type EventSpikeProps } from './compositions/EventSpikeVideo';
import { MarketPulseV3, type MarketPulseV3Props } from './compositions/MarketPulseV3';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ★ Market Pulse V3 — 하이브리드 6씬 Shorts (30초) */}
      <Composition
        id="MarketPulseV3"
        component={MarketPulseV3 as React.ComponentType<any>}
        durationInFrames={30 * 30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          lang: 'en',
          date: new Date().toISOString().split('T')[0],
          ticker: 'SPY',
          tickerName: 'S&P 500 ETF',
          price: '585.00',
          change: '+0.84',
          gexRegime: 'POSITIVE',
          gexLabel: 'NEGATIVE → POSITIVE',
          darkPool: 39.2,
          buyRatio: 34,
          sellRatio: 65,
          spy: 0.84,
          qqq: 1.71,
          vix: 18.2,
          insight1: '',
          insight2: '',
          insight3: '',
          bgmUrl: '',
          narrationUrl: '',
        }}
      />

      {/* Market Pulse V2 — 레거시 (30초) */}
      <Composition
        id="MarketPulse"
        component={MarketPulseVideo as React.ComponentType<any>}
        durationInFrames={30 * 30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          spy: -1.2,
          qqq: -0.8,
          vix: 18.5,
          gexRegime: 'positive',
          darkPool: 42.3,
          callWall: 590,
          putFloor: 570,
          lang: 'en',
          bgmUrl: '',
          narrationUrl: '',
        }}
      />

      {/* News Digest — 뉴스 + 시장 반응 (30초) */}
      <Composition
        id="NewsDigest"
        component={NewsDigestVideo as React.ComponentType<any>}
        durationInFrames={30 * 30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          headlines: [
            { title: 'Fed signals rate pause', sentiment: 'neutral' },
            { title: 'NVDA earnings beat expectations', sentiment: 'positive' },
            { title: 'China tariff tensions escalate', sentiment: 'negative' },
          ],
          spy: -1.2,
          vix: 18.5,
          lang: 'en',
          bgmUrl: '',
          narrationUrl: '',
        }}
      />

      {/* Event Spike — 고래/GEX 이벤트 (15초) */}
      <Composition
        id="EventSpike"
        component={EventSpikeVideo as React.ComponentType<any>}
        durationInFrames={15 * 30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          ticker: 'SPY',
          eventType: 'whale',
          details: '$2.5M Call sweep at $590 strike',
          premium: 2500000,
          spy: -1.2,
          gexRegime: 'positive',
          lang: 'en',
          bgmUrl: '',
        }}
      />
    </>
  );
};
