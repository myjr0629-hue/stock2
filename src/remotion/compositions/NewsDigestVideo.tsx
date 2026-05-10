// ============================================================================
// NewsDigestVideo V2 — 뉴스 + 시장 반응 Shorts (30초)
// 타이핑 효과 헤드라인 + 센티먼트 시각화 + 시장 데이터
// ============================================================================

import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from 'remotion';
import {
  TransitionSeries,
  springTiming,
  linearTiming,
} from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';

import { C, sec, changeColor, glow } from '../design';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { KineticNumber } from '../components/KineticNumber';
import { SparklineChart } from '../components/SparklineChart';
import { GlowCard, ImpactText, BrandWatermark, LowerThird } from '../components/UIComponents';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface NewsDigestProps {
  headlines: { title: string; sentiment: 'positive' | 'negative' | 'neutral' }[];
  spy: number;
  vix: number;
  lang: 'en' | 'ko' | 'ja';
  bgmUrl?: string;
  narrationUrl?: string;
}

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
const L = {
  en: { title: 'NEWS DIGEST',   reaction: 'Market Reaction',   cta: 'Real-time intelligence on' },
  ko: { title: '뉴스 다이제스트', reaction: '시장 반응',          cta: '실시간 인텔리전스' },
  ja: { title: 'ニュースダイジェスト', reaction: '市場の反応',       cta: 'リアルタイムインテリジェンス' },
};

const sentimentConfig = {
  positive: { icon: '📈', color: C.emerald, label: 'BULLISH' },
  negative: { icon: '📉', color: C.red,     label: 'BEARISH' },
  neutral:  { icon: '➡️', color: C.muted,   label: 'NEUTRAL' },
};

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

/** Scene 1: Title + news ticker feel (0-4초) */
const SceneTitle: React.FC<{ l: typeof L.en }> = ({ l }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <AnimatedBackground mood="neutral" intensity={1.2} />
      <BrandWatermark />

      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: 60, gap: 16,
      }}>
        {/* Breaking news style bar */}
        <div style={{
          padding: '10px 24px',
          background: `${C.red}15`,
          border: `1px solid ${C.red}40`,
          borderRadius: 8,
          opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' }),
        }}>
          <span style={{ fontSize: 14, color: C.red, letterSpacing: 3, fontWeight: 700 }}>
            ● LIVE
          </span>
        </div>

        <ImpactText text={l.title} frame={frame} delay={5} fontSize={52} style="stamp" color={C.text} />

        {/* Animated underline */}
        <div style={{
          width: interpolate(frame, [15, 40], [0, 400], { extrapolateRight: 'clamp' }),
          height: 2,
          background: `linear-gradient(90deg, transparent, ${C.cyan}60, transparent)`,
        }} />

        {/* Date + time */}
        <div style={{
          fontSize: 18, color: C.dim,
          fontFamily: "'JetBrains Mono', monospace",
          opacity: interpolate(frame, [25, 40], [0, 1], { extrapolateRight: 'clamp' }),
        }}>
          {new Date().toISOString().split('T')[0]} · Post Market
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Scene 2: Headlines with sentiment (4-18초) */
const SceneHeadlines: React.FC<{
  headlines: NewsDigestProps['headlines'];
}> = ({ headlines }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = headlines.slice(0, 4); // Max 4 headlines

  return (
    <AbsoluteFill>
      <AnimatedBackground mood="neutral" intensity={0.8} />
      <BrandWatermark />

      <div style={{
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center',
        height: '100%', padding: '80px 50px',
        gap: 20,
      }}>
        {items.map((h, i) => {
          const itemDelay = i * 30; // 1 second apart
          const itemF = Math.max(0, frame - itemDelay);
          const sc = sentimentConfig[h.sentiment];

          // Slide in from alternating sides
          const enterDir = i % 2 === 0 ? 'left' : 'right';

          return (
            <GlowCard
              key={i}
              frame={frame}
              delay={itemDelay}
              accentColor={sc.color}
              from={enterDir}
              width="100%"
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                {/* Sentiment icon */}
                <div style={{
                  fontSize: 28,
                  opacity: interpolate(itemF, [10, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                }}>
                  {sc.icon}
                </div>

                <div style={{ flex: 1 }}>
                  {/* Headline with typewriter effect */}
                  <div style={{
                    fontSize: 22, color: C.text,
                    fontWeight: 600, lineHeight: 1.4,
                  }}>
                    {/* Progressive text reveal */}
                    <span style={{
                      opacity: interpolate(itemF, [5, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                    }}>
                      {h.title}
                    </span>
                  </div>

                  {/* Sentiment badge */}
                  <div style={{
                    marginTop: 8,
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: 6,
                    background: `${sc.color}15`,
                    border: `1px solid ${sc.color}30`,
                    opacity: interpolate(itemF, [15, 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                  }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: sc.color,
                      letterSpacing: 2,
                    }}>
                      {sc.label}
                    </span>
                  </div>
                </div>
              </div>
            </GlowCard>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Scene 3: Market Reaction data (18-25초) */
const SceneReaction: React.FC<{
  spy: number; vix: number; l: typeof L.en;
}> = ({ spy, vix, l }) => {
  const frame = useCurrentFrame();
  const mood = spy >= 0 ? 'bullish' : 'bearish';

  return (
    <AbsoluteFill>
      <AnimatedBackground mood={mood} intensity={1} />
      <BrandWatermark />

      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: '80px 50px',
        gap: 28,
      }}>
        <div style={{
          fontSize: 20, color: C.muted, letterSpacing: 4,
          textTransform: 'uppercase' as const,
          opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' }),
        }}>
          {l.reaction}
        </div>

        {/* SPY with chart */}
        <GlowCard frame={frame} delay={5} accentColor={changeColor(spy)} from="bottom" width="100%">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 18, color: C.muted }}>S&P 500</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: C.text }}>SPY</div>
            </div>
            <KineticNumber value={spy} suffix="%" color={changeColor(spy)} frame={frame} delay={10} fontSize={56} />
          </div>
          <div style={{ marginTop: 12 }}>
            <SparklineChart
              color={changeColor(spy)}
              width={880} height={100}
              delay={15}
            />
          </div>
        </GlowCard>

        {/* VIX */}
        <GlowCard frame={frame} delay={30} accentColor={vix > 25 ? C.red : C.amber} from="bottom" width="100%">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 18, color: C.muted }}>Volatility</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: C.text }}>VIX</div>
            </div>
            <KineticNumber
              value={vix} suffix="" prefix=""
              color={vix > 25 ? C.red : vix > 18 ? C.amber : C.emerald}
              frame={frame} delay={35} fontSize={56} decimals={1}
            />
          </div>
        </GlowCard>
      </div>
    </AbsoluteFill>
  );
};

/** Scene 4: CTA (25-30초) */
const SceneCTA: React.FC<{ l: typeof L.en }> = ({ l }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <AnimatedBackground mood="neutral" intensity={0.5} />
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: 24,
      }}>
        <div style={{
          width: 80, height: 80,
          borderRadius: 20,
          background: `linear-gradient(135deg, ${C.grad1}, ${C.grad2})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 44, fontWeight: 900, color: 'white',
          boxShadow: glow(C.grad2, 1.5),
          transform: `scale(${spring({ frame, fps: 30, config: { damping: 10 } })})`,
        }}>
          S
        </div>
        <div style={{
          fontSize: 22, color: C.muted,
          opacity: interpolate(frame, [10, 25], [0, 1], { extrapolateRight: 'clamp' }),
        }}>
          {l.cta}
        </div>
        <div style={{
          padding: '14px 36px', borderRadius: 50,
          background: `linear-gradient(90deg, ${C.grad1}, ${C.grad2})`,
          fontSize: 22, fontWeight: 700, color: 'white',
          boxShadow: glow(C.grad1, 1),
          opacity: interpolate(frame, [15, 30], [0, 1], { extrapolateRight: 'clamp' }),
        }}>
          signumhq.com
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Main Composition
// ---------------------------------------------------------------------------
export const NewsDigestVideo: React.FC<NewsDigestProps> = (props) => {
  const l = L[props.lang] || L.en;

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <TransitionSeries>
        {/* Scene 1: Title (0-4초) */}
        <TransitionSeries.Sequence durationInFrames={sec(4)}>
          <SceneTitle l={l} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={wipe({ direction: 'from-left' })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: sec(0.7) })}
        />

        {/* Scene 2: Headlines (4-18초) */}
        <TransitionSeries.Sequence durationInFrames={sec(14)}>
          <SceneHeadlines headlines={props.headlines} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-bottom' })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: sec(0.7) })}
        />

        {/* Scene 3: Market Reaction (18-25초) */}
        <TransitionSeries.Sequence durationInFrames={sec(7)}>
          <SceneReaction spy={props.spy} vix={props.vix} l={l} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: sec(0.5) })}
        />

        {/* Scene 4: CTA (25-30초) */}
        <TransitionSeries.Sequence durationInFrames={sec(5)}>
          <SceneCTA l={l} />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {props.narrationUrl && <audio src={props.narrationUrl} />}
      {props.bgmUrl && <audio src={props.bgmUrl} />}
    </AbsoluteFill>
  );
};
