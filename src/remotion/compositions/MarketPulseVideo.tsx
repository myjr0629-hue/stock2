// ============================================================================
// MarketPulseVideo — 장 마감 후 시장 요약 Shorts (30초)
// SIGNUM HQ 특성: GEX Regime, Call Wall, Put Floor, Dark Pool
// ============================================================================

import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
  Sequence,
} from 'remotion';

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
// Color palette (consistent with OG Image)
// ---------------------------------------------------------------------------
const COLORS = {
  bg: '#0a0e17',
  card: '#111827',
  border: '#1e293b',
  text: '#f1f5f9',
  muted: '#94a3b8',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
  purple: '#8b5cf6',
  gradient1: '#6366f1',
  gradient2: '#a855f7',
};

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
const LABELS = {
  en: { title: 'MARKET PULSE', close: 'Market Close', gex: 'GEX Regime', dp: 'Dark Pool', cw: 'Call Wall', pf: 'Put Floor', cta: 'Live data on signumhq.com' },
  ko: { title: '마켓 펄스', close: '장 마감 요약', gex: 'GEX 레짐', dp: '다크풀', cw: '콜 월', pf: '풋 플로어', cta: '실시간 데이터 signumhq.com' },
  ja: { title: 'マーケットパルス', close: '引け後サマリー', gex: 'GEXレジーム', dp: 'ダークプール', cw: 'コールウォール', pf: 'プットフロア', cta: 'リアルタイムデータ signumhq.com' },
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
const changeColor = (v: number) => v > 0 ? COLORS.green : v < 0 ? COLORS.red : COLORS.muted;
const fmtChange = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

const AnimatedNumber: React.FC<{ value: number; suffix?: string; color: string; frame: number; delay: number; fps: number }> = ({ value, suffix = '%', color, frame, delay, fps }) => {
  const progress = spring({ frame: frame - delay, fps, config: { damping: 20, mass: 0.5 } });
  const displayValue = interpolate(progress, [0, 1], [0, Math.abs(value)]);
  const sign = value >= 0 ? '+' : '-';
  return (
    <span style={{ color, fontSize: 72, fontWeight: 800, fontFamily: 'system-ui' }}>
      {sign}{displayValue.toFixed(2)}{suffix}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Main Composition
// ---------------------------------------------------------------------------
export const MarketPulseVideo: React.FC<MarketPulseProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const l = LABELS[props.lang] || LABELS.en;

  // Fade in/out
  const opacity = interpolate(frame, [0, 15, 870, 900], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, opacity }}>

      {/* === Section 1: Logo Intro (0-3s, frames 0-90) === */}
      <Sequence from={0} durationInFrames={90}>
        <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{
            width: 120,
            height: 120,
            borderRadius: 30,
            background: `linear-gradient(135deg, ${COLORS.gradient1}, ${COLORS.gradient2})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 64,
            fontWeight: 900,
            color: 'white',
            opacity: interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' }),
            transform: `scale(${interpolate(frame, [0, 20], [0.5, 1], { extrapolateRight: 'clamp' })})`,
          }}>
            S
          </div>
          <div style={{
            marginTop: 20,
            fontSize: 36,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: 6,
            opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' }),
          }}>
            SIGNUM HQ
          </div>
          <div style={{
            marginTop: 12,
            fontSize: 22,
            color: COLORS.muted,
            opacity: interpolate(frame, [30, 50], [0, 1], { extrapolateRight: 'clamp' }),
          }}>
            {l.title}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* === Section 2: SPY/QQQ/VIX (3-10s, frames 90-300) === */}
      <Sequence from={90} durationInFrames={210}>
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 40 }}>
          <div style={{ fontSize: 28, color: COLORS.muted, letterSpacing: 4 }}>{l.close}</div>

          {/* SPY */}
          <DataCard
            label="SPY"
            sublabel="S&P 500 ETF"
            value={props.spy}
            frame={frame - 90}
            delay={10}
            fps={fps}
          />

          {/* QQQ */}
          <DataCard
            label="QQQ"
            sublabel="NASDAQ 100 ETF"
            value={props.qqq}
            frame={frame - 90}
            delay={25}
            fps={fps}
          />

          {/* VIX */}
          <div style={{
            width: '100%',
            background: COLORS.card,
            borderRadius: 24,
            border: `1px solid ${COLORS.border}`,
            padding: '24px 40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            opacity: interpolate(frame - 90, [35, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 24, color: COLORS.muted }}>VIX</span>
              <span style={{ fontSize: 14, color: COLORS.muted }}>Volatility Index</span>
            </div>
            <span style={{
              fontSize: 64,
              fontWeight: 800,
              color: props.vix > 25 ? COLORS.red : props.vix > 18 ? COLORS.amber : COLORS.green,
            }}>
              {props.vix.toFixed(1)}
            </span>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* === Section 3: GEX + Key Levels (10-18s, frames 300-540) === */}
      <Sequence from={300} durationInFrames={240}>
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 30 }}>
          {/* GEX Regime */}
          <div style={{
            width: '100%',
            background: `${gexColor(props.gexRegime)}15`,
            borderRadius: 24,
            border: `2px solid ${gexColor(props.gexRegime)}66`,
            padding: 40,
            textAlign: 'center',
            opacity: interpolate(frame - 300, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            <div style={{ fontSize: 22, color: COLORS.muted, marginBottom: 12 }}>{l.gex}</div>
            <div style={{ fontSize: 48, fontWeight: 800, color: gexColor(props.gexRegime) }}>
              {props.gexRegime.toUpperCase()}
            </div>
          </div>

          {/* Key Levels */}
          {props.callWall && (
            <LevelCard label={l.cw} value={`$${props.callWall}`} color={COLORS.green} frame={frame - 300} delay={30} />
          )}
          {props.putFloor && (
            <LevelCard label={l.pf} value={`$${props.putFloor}`} color={COLORS.red} frame={frame - 300} delay={45} />
          )}
          {props.darkPool != null && (
            <LevelCard label={l.dp} value={`${props.darkPool.toFixed(1)}%`} color={COLORS.purple} frame={frame - 300} delay={60} />
          )}
        </AbsoluteFill>
      </Sequence>

      {/* === Section 4: CTA + Outro (25-30s, frames 750-900) === */}
      <Sequence from={750} durationInFrames={150}>
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: `linear-gradient(135deg, ${COLORS.gradient1}, ${COLORS.gradient2})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 44,
            fontWeight: 900,
            color: 'white',
          }}>
            S
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, color: COLORS.text, textAlign: 'center' }}>
            {l.cta}
          </div>
          <div style={{
            padding: '16px 40px',
            borderRadius: 50,
            background: `linear-gradient(90deg, ${COLORS.gradient1}, ${COLORS.gradient2})`,
            fontSize: 22,
            fontWeight: 700,
            color: 'white',
          }}>
            signumhq.com
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Audio layers */}
      {props.narrationUrl && (
        <audio src={props.narrationUrl} />
      )}
      {props.bgmUrl && (
        <audio src={props.bgmUrl} />
      )}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
const DataCard: React.FC<{ label: string; sublabel: string; value: number; frame: number; delay: number; fps: number }> = ({ label, sublabel, value, frame, delay, fps }) => (
  <div style={{
    width: '100%',
    background: COLORS.card,
    borderRadius: 24,
    border: `1px solid ${COLORS.border}`,
    padding: '24px 40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    opacity: interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    transform: `translateY(${interpolate(frame, [delay, delay + 15], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
  }}>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 24, color: COLORS.muted }}>{label}</span>
      <span style={{ fontSize: 14, color: COLORS.muted }}>{sublabel}</span>
    </div>
    <AnimatedNumber value={value} color={changeColor(value)} frame={frame} delay={delay} fps={fps} />
  </div>
);

const LevelCard: React.FC<{ label: string; value: string; color: string; frame: number; delay: number }> = ({ label, value, color, frame, delay }) => (
  <div style={{
    width: '100%',
    background: COLORS.card,
    borderRadius: 20,
    border: `1px solid ${color}44`,
    padding: '20px 32px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    opacity: interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  }}>
    <span style={{ fontSize: 22, color: COLORS.muted }}>{label}</span>
    <span style={{ fontSize: 36, fontWeight: 700, color }}>{value}</span>
  </div>
);

function gexColor(gex: string): string {
  const g = gex.toLowerCase();
  if (g === 'positive') return COLORS.green;
  if (g === 'negative') return COLORS.red;
  if (g === 'transition') return COLORS.amber;
  return COLORS.muted;
}
