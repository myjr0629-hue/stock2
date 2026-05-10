// ============================================================================
// EventSpikeVideo V2 — 고래/GEX 이벤트 알림 Shorts (15초)
// 긴박한 모션: 플래시 → 글리치 → 데이터 폭포 → CTA
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
import { wipe } from '@remotion/transitions/wipe';

import { C, sec, gexColor, glow } from '../design';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { KineticNumber } from '../components/KineticNumber';
import { GlowCard, ImpactText, BrandWatermark } from '../components/UIComponents';
import { PulseRing, DataCascade } from '../components/MotionEffects';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface EventSpikeProps {
  ticker: string;
  eventType: 'whale' | 'gex_shift' | 'level_break' | 'unusual_volume';
  details: string;
  premium?: number;
  spy: number;
  gexRegime: string;
  lang: 'en' | 'ko' | 'ja';
  bgmUrl?: string;
}

// ---------------------------------------------------------------------------
// Event Config
// ---------------------------------------------------------------------------
interface EventConfig { icon: string; en: string; ko: string; ja: string; color: string; }
const EVENTS: Record<string, EventConfig> = {
  whale:          { icon: '🐋', en: 'WHALE ALERT',      ko: '고래 감지',     ja: 'ホエールアラート', color: C.cyan },
  gex_shift:      { icon: '⚡', en: 'GEX SHIFT',        ko: 'GEX 전환',     ja: 'GEXシフト',       color: C.amber },
  level_break:    { icon: '🚨', en: 'LEVEL BREAK',      ko: '레벨 이탈',     ja: 'レベルブレイク',   color: C.red },
  unusual_volume: { icon: '📊', en: 'UNUSUAL VOLUME',   ko: '이상 거래량',   ja: '異常出来高',      color: C.purple },
};

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

/** Scene 1: Alert Flash + Icon (0-2초) */
const SceneAlert: React.FC<{ config: EventConfig }> = ({ config }) => {
  const frame = useCurrentFrame();

  // Full screen color flash
  const flashOpacity = interpolate(frame, [0, 4, 12, 25], [0.9, 0.6, 0.2, 0], {
    extrapolateRight: 'clamp',
  });

  // Icon bounce
  const iconScale = spring({
    frame, fps: 30,
    config: { damping: 6, mass: 0.5, stiffness: 300 },
  });

  // Horizontal scan lines (urgency)
  const scanLines = Array.from({ length: 5 }, (_, i) => {
    const y = interpolate(
      (frame + i * 50) % 60, [0, 60], [0, 1920]
    );
    return y;
  });

  return (
    <AbsoluteFill>
      <AnimatedBackground mood="bearish" intensity={2} />

      {/* Color flash */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at center, ${config.color}60, transparent 70%)`,
        opacity: flashOpacity,
      }} />

      {/* Scan lines */}
      {scanLines.map((y, i) => (
        <div key={i} style={{
          position: 'absolute', left: 0, right: 0,
          top: y, height: 2,
          background: `${config.color}15`,
        }} />
      ))}

      {/* Center icon */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%',
      }}>
        <div style={{
          fontSize: 140,
          transform: `scale(${interpolate(iconScale, [0, 1], [0.3, 1])})`,
          filter: `drop-shadow(0 0 30px ${config.color}80)`,
        }}>
          {config.icon}
        </div>
        <PulseRing color={config.color} delay={5} size={300} rings={4} />
      </div>
    </AbsoluteFill>
  );
};

/** Scene 2: Event Details (2-11초) */
const SceneDetails: React.FC<{
  ticker: string;
  config: EventConfig;
  title: string;
  details: string;
  premium?: number;
  spy: number;
  gexRegime: string;
}> = ({ ticker, config, title, details, premium, spy, gexRegime }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <AnimatedBackground mood="bearish" intensity={1} />
      <BrandWatermark />

      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: '60px 50px',
        gap: 24,
      }}>
        {/* Event type badge */}
        <GlowCard frame={frame} delay={0} accentColor={config.color} from="scale">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 14,
          }}>
            <span style={{ fontSize: 32 }}>{config.icon}</span>
            <span style={{
              fontSize: 22, fontWeight: 800, color: config.color,
              letterSpacing: 3,
            }}>
              {title}
            </span>
          </div>
        </GlowCard>

        {/* Ticker — HUGE */}
        <div style={{ position: 'relative', marginTop: 8 }}>
          <ImpactText
            text={`$${ticker}`}
            frame={frame}
            delay={8}
            fontSize={88}
            color={C.text}
            style="glitch"
          />
        </div>

        {/* Details card */}
        <GlowCard frame={frame} delay={18} accentColor={config.color} from="bottom" width="100%">
          <div style={{
            fontSize: 24, color: C.text,
            lineHeight: 1.6, textAlign: 'center',
          }}>
            {details}
          </div>
        </GlowCard>

        {/* Premium amount */}
        {premium && (
          <div style={{
            position: 'relative',
            opacity: interpolate(Math.max(0, frame - 28), [0, 10], [0, 1], { extrapolateRight: 'clamp' }),
          }}>
            <KineticNumber
              value={premium / 1_000_000}
              suffix="M"
              prefix="$"
              color={config.color}
              frame={frame}
              delay={30}
              fontSize={56}
              decimals={1}
            />
            <PulseRing color={config.color} delay={35} size={160} />
          </div>
        )}

        {/* Market context data cascade */}
        <DataCascade
          frame={frame}
          delay={40}
          items={[
            { label: 'SPY', value: `${spy >= 0 ? '+' : ''}${spy.toFixed(2)}%`, color: spy >= 0 ? C.emerald : C.red },
            { label: 'GEX', value: gexRegime.toUpperCase(), color: gexColor(gexRegime) },
          ]}
        />
      </div>
    </AbsoluteFill>
  );
};

/** Scene 3: CTA (11-15초) */
const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      <AnimatedBackground mood="neutral" intensity={0.5} />
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: 20,
      }}>
        <div style={{
          width: 70, height: 70,
          borderRadius: 18,
          background: `linear-gradient(135deg, ${C.grad1}, ${C.grad2})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 40, fontWeight: 900, color: 'white',
          boxShadow: glow(C.grad2, 1.5),
          transform: `scale(${spring({ frame, fps: 30, config: { damping: 10 } })})`,
        }}>
          S
        </div>
        <div style={{
          padding: '14px 36px', borderRadius: 50,
          background: `linear-gradient(90deg, ${C.grad1}, ${C.grad2})`,
          fontSize: 22, fontWeight: 700, color: 'white',
          boxShadow: glow(C.grad1, 1),
          opacity: interpolate(frame, [10, 25], [0, 1], { extrapolateRight: 'clamp' }),
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
export const EventSpikeVideo: React.FC<EventSpikeProps> = (props) => {
  const config = EVENTS[props.eventType];
  const title = config[props.lang] || config.en;

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <TransitionSeries>
        {/* Scene 1: Alert Flash (0-2초) */}
        <TransitionSeries.Sequence durationInFrames={sec(2)}>
          <SceneAlert config={config} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={wipe({ direction: 'from-top' })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: sec(0.5) })}
        />

        {/* Scene 2: Details (2-11초) */}
        <TransitionSeries.Sequence durationInFrames={sec(9)}>
          <SceneDetails
            ticker={props.ticker}
            config={config}
            title={title}
            details={props.details}
            premium={props.premium}
            spy={props.spy}
            gexRegime={props.gexRegime}
          />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: sec(0.5) })}
        />

        {/* Scene 3: CTA (11-15초) */}
        <TransitionSeries.Sequence durationInFrames={sec(4)}>
          <SceneCTA />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {props.bgmUrl && <audio src={props.bgmUrl} />}
    </AbsoluteFill>
  );
};
