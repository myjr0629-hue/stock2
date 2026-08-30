// ============================================================================
// MarketPulseV3 — 30초 하이브리드 Shorts (GPT+Claude+기존 최적 조합)
// 6씬 구조 | TransitionSeries | i18n (en/ko/ja) | Audio
// ============================================================================
import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  Audio,
  staticFile,
} from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { sec, C } from '../design';

// Scenes
import { Scene1_Hook } from '../scenes/Scene1_Hook';
import { Scene2_PriceReveal } from '../scenes/Scene2_PriceReveal';
import { Scene3_XRay } from '../scenes/Scene3_XRay';
import { Scene4_DataCascade } from '../scenes/Scene4_DataCascade';
import { Scene5_Insight } from '../scenes/Scene5_Insight';
import { Scene6_CTA } from '../scenes/Scene6_CTA';

// Persistent layers
import {
  PersistentBrandLogo,
  PersistentProgressBar,
  PersistentScanline,
} from '../components/PersistentLayers';

// ---------------------------------------------------------------------------
// Props (render-video 파이프라인에서 주입)
// ---------------------------------------------------------------------------
export interface MarketPulseV3Props {
  // 기본
  lang: 'en' | 'ko' | 'ja';
  date: string;

  // Scene 1 Hook
  ticker: string;

  // Scene 2 Price
  tickerName: string;
  price: string;
  change: string;

  // Scene 3 X-Ray
  gexRegime: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  gexLabel: string;
  /** 다크풀은 2026-08-28 소멸 → 기관 신규 포지션(옵션 OI 증가분)으로 대체 */
  instNotional?: number | null;
  instCallPct?: number | null;
  buyRatio: number;
  sellRatio: number;

  // Scene 4 Data
  spy: number;
  qqq: number;
  vix: number;

  // Scene 5 Insight
  insight1: string;
  insight2: string;
  insight3: string;

  // Audio
  bgmUrl?: string;
  narrationUrl?: string;
}

// ---------------------------------------------------------------------------
// Default insights (i18n)
// ---------------------------------------------------------------------------
const defaultInsights = {
  en: [
    'GEX regime shift detected — dealer hedging structure changed',
    'Dark pool activity above 40% — institutional accumulation signal',
    'VIX structure suggests elevated short-term risk',
  ],
  ko: [
    'GEX 레짐 전환 감지 — 딜러 헤징 구조 변경',
    '다크풀 활동 40% 이상 — 기관 매집 신호',
    'VIX 구조 단기 리스크 상승 시사',
  ],
  ja: [
    'GEXレジーム転換検出 — ディーラーヘッジ構造変更',
    'ダークプール活動40%超 — 機関蓄積シグナル',
    'VIX構造短期リスク上昇示唆',
  ],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const MarketPulseV3: React.FC<MarketPulseV3Props> = (props) => {
  const {
    lang = 'en',
    ticker = 'SPY',
    tickerName = 'S&P 500 ETF',
    price = '585.00',
    change = '+0.84',
    gexRegime = 'POSITIVE',
    gexLabel = 'NEGATIVE → POSITIVE',
    instNotional = null,
    instCallPct = null,
    buyRatio = 34,
    sellRatio = 65,
    spy = 0.84,
    qqq = 1.71,
    vix = 18.2,
    bgmUrl = '',
    narrationUrl = '',
  } = props;

  const insight1 = props.insight1 || defaultInsights[lang]?.[0] || defaultInsights.en[0];
  const insight2 = props.insight2 || defaultInsights[lang]?.[1] || defaultInsights.en[1];
  const insight3 = props.insight3 || defaultInsights[lang]?.[2] || defaultInsights.en[2];

  // Scene durations (frames @ 30fps)
  const TRANSITION = sec(0.3); // 9 frames fade transition
  const S1 = sec(3);    // 0-3s    HOOK
  const S2 = sec(5);    // 3-8s    PRICE REVEAL
  const S3 = sec(6);    // 8-14s   X-RAY
  const S4 = sec(6);    // 14-20s  DATA CASCADE
  const S5 = sec(5);    // 20-25s  INSIGHT
  const S6 = sec(5);    // 25-30s  CTA

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {/* ========================================
          SCENE TIMELINE — TransitionSeries
      ========================================= */}
      <TransitionSeries>
        {/* Scene 1: HOOK */}
        <TransitionSeries.Sequence durationInFrames={S1}>
          <Scene1_Hook ticker={ticker} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION })}
        />

        {/* Scene 2: PRICE REVEAL */}
        <TransitionSeries.Sequence durationInFrames={S2}>
          <Scene2_PriceReveal
            ticker={ticker}
            tickerName={tickerName}
            price={price}
            change={change}
            lang={lang}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION })}
        />

        {/* Scene 3: X-RAY */}
        <TransitionSeries.Sequence durationInFrames={S3}>
          <Scene3_XRay
            ticker={ticker}
            gexRegime={gexRegime}
            gexLabel={gexLabel}
            instNotional={instNotional}
            instCallPct={instCallPct}
            buyRatio={buyRatio}
            sellRatio={sellRatio}
            lang={lang}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION })}
        />

        {/* Scene 4: DATA CASCADE */}
        <TransitionSeries.Sequence durationInFrames={S4}>
          <Scene4_DataCascade
            spy={spy}
            qqq={qqq}
            vix={vix}
            lang={lang}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION })}
        />

        {/* Scene 5: INSIGHT */}
        <TransitionSeries.Sequence durationInFrames={S5}>
          <Scene5_Insight
            insight1={insight1}
            insight2={insight2}
            insight3={insight3}
            lang={lang}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: TRANSITION })}
        />

        {/* Scene 6: CTA */}
        <TransitionSeries.Sequence durationInFrames={S6}>
          <Scene6_CTA lang={lang} />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {/* ========================================
          PERSISTENT LAYERS (항상 위에)
      ========================================= */}
      <PersistentBrandLogo />
      <PersistentProgressBar />
      <PersistentScanline />

      {/* ========================================
          AUDIO LAYERS
      ========================================= */}
      {bgmUrl && (
        <Audio src={bgmUrl} volume={0.15} />
      )}
      {narrationUrl && (
        <Sequence from={sec(1)}>
          <Audio src={narrationUrl} volume={0.85} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
