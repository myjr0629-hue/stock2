// ============================================================================
// Scene 2: PRICE REVEAL (3~8s) — 가격 카운트업 임팩트
// Claude 베이스 (카운트업) + GPT 티커 슬라이드
// ============================================================================
import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import { C } from '../design';

interface Scene2Props {
  ticker: string;
  tickerName: string;
  price: string;
  change: string;
  lang: 'en' | 'ko' | 'ja';
}

const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

const L = {
  en: { overnight: 'Overnight Change', focus: 'TICKER FOCUS' },
  ko: { overnight: '오버나이트 변동', focus: '티커 포커스' },
  ja: { overnight: 'オーバーナイト変動', focus: 'ティッカーフォーカス' },
};

export const Scene2_PriceReveal: React.FC<Scene2Props> = ({
  ticker, tickerName, price, change, lang,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isPositive = !change.startsWith('-');
  const l = L[lang] || L.en;

  // Ticker slides in from top
  const tickerY = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });

  // Price counter animation
  const priceProgress = interpolate(frame, [fps * 0.5, fps * 2.5], [0, 1], clamp);
  const numPrice = parseFloat(price) || 0;
  const animatedPrice = numPrice * priceProgress;

  // Change badge appears after price
  const changeOpacity = interpolate(frame, [fps * 2.5, fps * 3], [0, 1], clamp);
  const changeScale = interpolate(frame, [fps * 2.5, fps * 3], [0.5, 1], clamp);

  // Ambient glow
  const glowColor = isPositive ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)';
  const accentColor = isPositive ? C.emerald : C.red;

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {/* Background */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 50% 40%, ${glowColor} 0%, transparent 55%), ${C.bg}`,
      }} />
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.16,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      {/* Content centered */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 60px' }}>
        {/* Focus label */}
        <div style={{
          color: C.muted, fontSize: 21, fontWeight: 900, letterSpacing: '0.34em',
          textTransform: 'uppercase', marginBottom: 22,
          opacity: interpolate(frame, [0, fps * 0.3], [0, 1], clamp),
        }}>{l.focus}</div>

        {/* Ticker */}
        <div style={{
          fontSize: 142, fontWeight: 900, color: C.cyan, letterSpacing: '-0.075em',
          lineHeight: 0.85, marginBottom: 16,
          transform: `translateY(${(1 - tickerY) * -200}px)`,
          textShadow: `0 0 40px rgba(34,211,238,0.38)`,
          fontFamily: 'Inter, sans-serif',
        }}>${ticker}</div>

        {/* Ticker name */}
        <div style={{
          color: C.text, fontSize: 34, fontWeight: 800, letterSpacing: '0.12em',
          textTransform: 'uppercase', marginBottom: 48,
          opacity: interpolate(frame, [fps * 0.3, fps * 0.8], [0, 1], clamp),
        }}>{tickerName}</div>

        {/* Price (animated count up) */}
        <div style={{
          fontSize: 148, fontWeight: 900, color: C.text,
          letterSpacing: '-0.05em', lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          ${animatedPrice.toFixed(2)}
        </div>

        {/* Change badge */}
        <div style={{
          marginTop: 32, padding: '16px 40px',
          background: isPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
          border: `3px solid ${accentColor}`,
          borderRadius: 16, opacity: changeOpacity,
          transform: `scale(${changeScale})`,
        }}>
          <span style={{
            color: accentColor, fontSize: 64, fontWeight: 900,
            fontVariantNumeric: 'tabular-nums', fontFamily: 'Inter',
          }}>
            {isPositive ? '▲' : '▼'} {change}%
          </span>
        </div>

        {/* Sub label */}
        <div style={{
          marginTop: 28, color: C.muted, fontSize: 22, fontWeight: 600,
          letterSpacing: '0.18em',
          opacity: interpolate(frame, [fps * 3, fps * 3.5], [0, 1], clamp),
        }}>{l.overnight}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
