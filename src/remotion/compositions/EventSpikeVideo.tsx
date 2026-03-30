// ============================================================================
// EventSpikeVideo — 고래/GEX 이벤트 알림 Shorts (15초)
// SIGNUM HQ 고유 데이터: 고래 추적, GEX 급변, 이상 거래량
// ============================================================================

import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Sequence,
} from 'remotion';

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
// Constants
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
  cyan: '#06b6d4',
  gradient1: '#6366f1',
  gradient2: '#a855f7',
};

const EVENT_CONFIG = {
  whale:          { icon: '🐋', en: 'WHALE ALERT',      ko: '고래 감지',     ja: 'ホエールアラート', color: COLORS.cyan },
  gex_shift:      { icon: '⚡', en: 'GEX SHIFT',        ko: 'GEX 전환',     ja: 'GEXシフト',       color: COLORS.amber },
  level_break:    { icon: '🚨', en: 'LEVEL BREAK',      ko: '레벨 이탈',     ja: 'レベルブレイク',   color: COLORS.red },
  unusual_volume: { icon: '📊', en: 'UNUSUAL VOLUME',   ko: '이상 거래량',   ja: '異常出来高',      color: COLORS.purple },
};

// ---------------------------------------------------------------------------
// Main Composition
// ---------------------------------------------------------------------------
export const EventSpikeVideo: React.FC<EventSpikeProps> = (props) => {
  const frame = useCurrentFrame();
  const config = EVENT_CONFIG[props.eventType];
  const eventTitle = config[props.lang] || config.en;

  const opacity = interpolate(frame, [0, 10, 430, 450], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Pulse effect for urgency
  const pulse = Math.sin(frame * 0.15) * 0.15 + 0.85;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, opacity }}>

      {/* === Alert flash (0-1s) === */}
      <Sequence from={0} durationInFrames={30}>
        <AbsoluteFill style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${config.color}${Math.round(interpolate(frame, [0, 10, 20, 30], [0, 30, 10, 0]) ).toString(16).padStart(2, '0')}`,
        }}>
          <span style={{
            fontSize: 120,
            opacity: interpolate(frame, [0, 10, 20, 30], [0, 1, 1, 0.5], { extrapolateRight: 'clamp' }),
          }}>
            {config.icon}
          </span>
        </AbsoluteFill>
      </Sequence>

      {/* === Main content (1-11s) === */}
      <Sequence from={30} durationInFrames={300}>
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 50, gap: 30 }}>

          {/* Event type badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 28px',
            borderRadius: 50,
            background: `${config.color}22`,
            border: `2px solid ${config.color}`,
            opacity: interpolate(frame - 30, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            <span style={{ fontSize: 28 }}>{config.icon}</span>
            <span style={{ fontSize: 24, fontWeight: 700, color: config.color, letterSpacing: 2 }}>
              {eventTitle}
            </span>
          </div>

          {/* Ticker */}
          <div style={{
            fontSize: 80,
            fontWeight: 900,
            color: COLORS.text,
            opacity: interpolate(frame - 30, [10, 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            ${props.ticker}
          </div>

          {/* Details */}
          <div style={{
            width: '100%',
            background: COLORS.card,
            borderRadius: 24,
            padding: 30,
            border: `1px solid ${config.color}44`,
            opacity: interpolate(frame - 30, [25, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            <div style={{ fontSize: 26, color: COLORS.text, lineHeight: 1.5, textAlign: 'center' }}>
              {props.details}
            </div>
          </div>

          {/* Premium amount */}
          {props.premium && (
            <div style={{
              fontSize: 44,
              fontWeight: 800,
              color: config.color,
              opacity: pulse * interpolate(frame - 30, [40, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}>
              ${(props.premium / 1000000).toFixed(1)}M Premium
            </div>
          )}

          {/* Market context */}
          <div style={{
            display: 'flex',
            gap: 16,
            opacity: interpolate(frame - 30, [55, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            <div style={{
              padding: '10px 20px',
              borderRadius: 12,
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}>
              <span style={{ fontSize: 16, color: COLORS.muted }}>SPY </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: props.spy >= 0 ? COLORS.green : COLORS.red }}>
                {props.spy >= 0 ? '+' : ''}{props.spy.toFixed(2)}%
              </span>
            </div>
            <div style={{
              padding: '10px 20px',
              borderRadius: 12,
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
            }}>
              <span style={{ fontSize: 16, color: COLORS.muted }}>GEX </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: props.gexRegime === 'positive' ? COLORS.green : COLORS.red }}>
                {props.gexRegime.toUpperCase()}
              </span>
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* === CTA (11-15s) === */}
      <Sequence from={330} durationInFrames={120}>
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: `linear-gradient(135deg, ${COLORS.gradient1}, ${COLORS.gradient2})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 36,
            fontWeight: 900,
            color: 'white',
          }}>
            S
          </div>
          <div style={{
            padding: '14px 36px',
            borderRadius: 50,
            background: `linear-gradient(90deg, ${COLORS.gradient1}, ${COLORS.gradient2})`,
            fontSize: 20,
            fontWeight: 700,
            color: 'white',
          }}>
            signumhq.com
          </div>
        </AbsoluteFill>
      </Sequence>

      {props.bgmUrl && <audio src={props.bgmUrl} />}
    </AbsoluteFill>
  );
};
