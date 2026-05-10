// ============================================================================
// MarketPulseVideo V2 — 장 마감 후 시장 요약 Shorts (30초)
// 프리미엄 모션 그래픽: TransitionSeries + KineticNumber + SparklineChart
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

import { C, sec, changeColor, gexColor, glow } from '../design';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { KineticNumber } from '../components/KineticNumber';
import { SparklineChart } from '../components/SparklineChart';
import { GlowCard, ImpactText, BrandWatermark, LowerThird } from '../components/UIComponents';
import { PulseRing } from '../components/MotionEffects';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface MarketPulseProps {
  spy: number;
  qqq: number;
  vix: number;
  gexRegime: string;
  darkPool?: number;
  callWall?: number;
  putFloor?: number;
  lang: 'en' | 'ko' | 'ja';
  bgmUrl?: string;
  narrationUrl?: string;
}

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
const L = {
  en: {
    title: 'MARKET PULSE',
    close: 'Market Close Summary',
    gex: 'GEX REGIME',
    dp: 'Dark Pool',
    cw: 'Call Wall',
    pf: 'Put Floor',
    levels: 'KEY LEVELS',
    cta: 'Real-time intelligence on',
  },
  ko: {
    title: '마켓 펄스',
    close: '장 마감 요약',
    gex: 'GEX 레짐',
    dp: '다크풀',
    cw: '콜 월',
    pf: '풋 플로어',
    levels: '핵심 레벨',
    cta: '실시간 인텔리전스',
  },
  ja: {
    title: 'マーケットパルス',
    close: '引け後サマリー',
    gex: 'GEXレジーム',
    dp: 'ダークプール',
    cw: 'コールウォール',
    pf: 'プットフロア',
    levels: 'キーレベル',
    cta: 'リアルタイムインテリジェンス',
  },
};

// ---------------------------------------------------------------------------
// Scene Components
// ---------------------------------------------------------------------------

/** Scene 1: Impact Opening — 글리치 타이틀 + 바로 데이터 (0-4초) */
const SceneOpening: React.FC<{ l: typeof L.en; spy: number }> = ({ l, spy }) => {
  const frame = useCurrentFrame();
  const mood = spy >= 0 ? 'bullish' : 'bearish';

  // Flash on entry
  const flash = interpolate(frame, [0, 3, 8], [1, 0.8, 0], {
    extrapolateRight: 'clamp',
  });
  const flashColor = spy >= 0 ? C.emerald : C.red;

  return (
    <AbsoluteFill>
      <AnimatedBackground mood={mood} intensity={1.5} />
      {/* Entry flash */}
      <div style={{
        position: 'absolute', inset: 0,
        background: flashColor,
        opacity: flash * 0.15,
      }} />
      <BrandWatermark />

      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: 60,
        gap: 20,
      }}>
        {/* Title stamp */}
        <ImpactText text={l.title} frame={frame} fontSize={56} style="stamp" color={C.text} />

        {/* Subtitle */}
        <div style={{
          fontSize: 22, color: C.muted,
          letterSpacing: 4,
          opacity: interpolate(frame, [15, 30], [0, 1], { extrapolateRight: 'clamp' }),
        }}>
          {l.close}
        </div>

        {/* Decorative line */}
        <div style={{
          width: interpolate(frame, [20, 45], [0, 300], { extrapolateRight: 'clamp' }),
          height: 2,
          background: `linear-gradient(90deg, transparent, ${C.cyan}80, transparent)`,
          marginTop: 10,
        }} />

        {/* Date */}
        <div style={{
          fontSize: 18, color: C.dim,
          opacity: interpolate(frame, [30, 45], [0, 1], { extrapolateRight: 'clamp' }),
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {new Date().toISOString().split('T')[0]}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Scene 2: SPY + QQQ 핵심 지표 (4-10초) */
const SceneIndices: React.FC<{ spy: number; qqq: number; vix: number }> = ({ spy, qqq, vix }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mood = spy >= 0 ? 'bullish' : 'bearish';

  return (
    <AbsoluteFill>
      <AnimatedBackground mood={mood} />
      <BrandWatermark />

      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: '80px 50px',
        gap: 24,
      }}>
        {/* SPY Card */}
        <GlowCard frame={frame} delay={0} accentColor={changeColor(spy)} from="left" width="100%">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 20, color: C.muted, letterSpacing: 2 }}>S&P 500</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: C.text, marginTop: 4 }}>SPY</div>
            </div>
            <KineticNumber value={spy} suffix="%" color={changeColor(spy)} frame={frame} delay={5} fontSize={64} />
          </div>
          <div style={{ marginTop: 16 }}>
            <SparklineChart
              color={changeColor(spy)}
              width={880} height={120}
              delay={10}
              showEndDot
              showFill
            />
          </div>
        </GlowCard>

        {/* QQQ Card */}
        <GlowCard frame={frame} delay={15} accentColor={changeColor(qqq)} from="right" width="100%">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 20, color: C.muted, letterSpacing: 2 }}>NASDAQ 100</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: C.text, marginTop: 4 }}>QQQ</div>
            </div>
            <KineticNumber value={qqq} suffix="%" color={changeColor(qqq)} frame={frame} delay={20} fontSize={64} />
          </div>
          <div style={{ marginTop: 16 }}>
            <SparklineChart
              color={changeColor(qqq)}
              width={880} height={120}
              delay={25}
              showEndDot
              showFill
            />
          </div>
        </GlowCard>

        {/* VIX Compact */}
        <GlowCard frame={frame} delay={35} accentColor={vix > 25 ? C.red : vix > 18 ? C.amber : C.emerald} from="bottom">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 18, color: C.muted, letterSpacing: 2 }}>VOLATILITY</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>VIX</div>
            </div>
            <div style={{ position: 'relative' }}>
              <KineticNumber
                value={vix} suffix="" prefix=""
                color={vix > 25 ? C.red : vix > 18 ? C.amber : C.emerald}
                frame={frame} delay={40} fontSize={56} decimals={1}
              />
              {vix > 25 && <PulseRing color={C.red} delay={50} size={120} />}
            </div>
          </div>
        </GlowCard>
      </div>
    </AbsoluteFill>
  );
};

/** Scene 3: GEX Regime + Key Levels (10-18초) */
const SceneGex: React.FC<{
  gexRegime: string; darkPool?: number; callWall?: number; putFloor?: number; l: typeof L.en;
}> = ({ gexRegime, darkPool, callWall, putFloor, l }) => {
  const frame = useCurrentFrame();
  const gc = gexColor(gexRegime);
  const mood = gexRegime.toLowerCase() === 'positive' ? 'bullish' : gexRegime.toLowerCase() === 'negative' ? 'bearish' : 'neutral';

  return (
    <AbsoluteFill>
      <AnimatedBackground mood={mood} intensity={1.2} />
      <BrandWatermark />

      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: '80px 50px',
        gap: 28,
      }}>
        {/* GEX Regime — Big center badge */}
        <GlowCard frame={frame} delay={0} accentColor={gc} from="scale" width="100%">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, color: C.muted, letterSpacing: 3 }}>{l.gex}</div>

            {/* Regime badge with glow */}
            <div style={{ position: 'relative', display: 'inline-block', marginTop: 16 }}>
              <ImpactText
                text={gexRegime.toUpperCase()}
                frame={frame}
                delay={8}
                fontSize={52}
                color={gc}
                style="stamp"
              />
              <PulseRing color={gc} delay={10} size={200} rings={2} />
            </div>

            {/* Regime bar indicator */}
            <div style={{
              marginTop: 24,
              height: 6, borderRadius: 3,
              background: C.border,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${interpolate(Math.max(0, frame - 15), [0, 30], [0, 100], { extrapolateRight: 'clamp' })}%`,
                background: `linear-gradient(90deg, ${gc}80, ${gc})`,
                borderRadius: 3,
                boxShadow: `0 0 10px ${gc}60`,
              }} />
            </div>
          </div>
        </GlowCard>

        {/* Key Levels */}
        <div style={{
          fontSize: 16, color: C.muted, letterSpacing: 3,
          textTransform: 'uppercase' as const,
          opacity: interpolate(Math.max(0, frame - 25), [0, 15], [0, 1], { extrapolateRight: 'clamp' }),
        }}>
          {l.levels}
        </div>

        {/* Levels row */}
        <div style={{ display: 'flex', gap: 16, width: '100%' }}>
          {callWall && (
            <GlowCard frame={frame} delay={30} accentColor={C.emerald} from="left" width="50%">
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: C.muted }}>{l.cw}</div>
                <div style={{
                  fontSize: 36, fontWeight: 800, color: C.emerald,
                  marginTop: 8,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  ${callWall}
                </div>
              </div>
            </GlowCard>
          )}
          {putFloor && (
            <GlowCard frame={frame} delay={38} accentColor={C.red} from="right" width="50%">
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: C.muted }}>{l.pf}</div>
                <div style={{
                  fontSize: 36, fontWeight: 800, color: C.red,
                  marginTop: 8,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  ${putFloor}
                </div>
              </div>
            </GlowCard>
          )}
        </div>

        {/* Dark Pool */}
        {darkPool != null && (
          <GlowCard frame={frame} delay={45} accentColor={C.purple} from="bottom" width="100%">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, color: C.muted }}>{l.dp}</div>
                <div style={{ fontSize: 13, color: C.dim, marginTop: 2 }}>Institutional Activity</div>
              </div>
              <KineticNumber
                value={darkPool} suffix="%" prefix=""
                color={C.purple}
                frame={frame} delay={50} fontSize={48} decimals={1}
              />
            </div>
            {/* Bar indicator */}
            <div style={{
              marginTop: 14, height: 8, borderRadius: 4,
              background: C.border,
            }}>
              <div style={{
                height: '100%',
                width: `${interpolate(Math.max(0, frame - 52), [0, 30], [0, darkPool], { extrapolateRight: 'clamp' })}%`,
                background: `linear-gradient(90deg, ${C.purple}80, ${C.purple})`,
                borderRadius: 4,
                boxShadow: `0 0 8px ${C.purple}40`,
              }} />
            </div>
          </GlowCard>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** Scene 4: CTA Outro (25-30초) */
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
        {/* Logo */}
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
          fontSize: 24, color: C.muted,
          opacity: interpolate(frame, [10, 25], [0, 1], { extrapolateRight: 'clamp' }),
        }}>
          {l.cta}
        </div>

        {/* URL badge */}
        <div style={{
          padding: '16px 40px',
          borderRadius: 50,
          background: `linear-gradient(90deg, ${C.grad1}, ${C.grad2})`,
          fontSize: 24, fontWeight: 700, color: 'white',
          boxShadow: glow(C.grad1, 1),
          transform: `scale(${interpolate(
            spring({ frame: Math.max(0, frame - 15), fps: 30, config: { damping: 12 } }),
            [0, 1], [0.8, 1]
          )})`,
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
export const MarketPulseVideo: React.FC<MarketPulseProps> = (props) => {
  const l = L[props.lang] || L.en;

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <TransitionSeries>
        {/* Scene 1: Impact Opening (0-4초 = 120 frames) */}
        <TransitionSeries.Sequence durationInFrames={sec(4)}>
          <SceneOpening l={l} spy={props.spy} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={wipe({ direction: 'from-right' })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: sec(0.8) })}
        />

        {/* Scene 2: SPY/QQQ/VIX (4-14초 = 300 frames) */}
        <TransitionSeries.Sequence durationInFrames={sec(10)}>
          <SceneIndices spy={props.spy} qqq={props.qqq} vix={props.vix} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-bottom' })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: sec(0.8) })}
        />

        {/* Scene 3: GEX + Levels (14-24초 = 300 frames) */}
        <TransitionSeries.Sequence durationInFrames={sec(10)}>
          <SceneGex
            gexRegime={props.gexRegime}
            darkPool={props.darkPool}
            callWall={props.callWall}
            putFloor={props.putFloor}
            l={l}
          />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: sec(0.5) })}
        />

        {/* Scene 4: CTA (24-30초) */}
        <TransitionSeries.Sequence durationInFrames={sec(6)}>
          <SceneCTA l={l} />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {/* Audio layers */}
      {props.narrationUrl && <audio src={props.narrationUrl} />}
      {props.bgmUrl && <audio src={props.bgmUrl} />}
    </AbsoluteFill>
  );
};
