// ============================================================================
// GlowCard — 글래스모피즘 + 네온 보더 + 입장 애니메이션
// ============================================================================
import React from 'react';
import { interpolate, spring, useVideoConfig } from 'remotion';
import { C, glow } from '../design';

export const GlowCard: React.FC<{
  children: React.ReactNode;
  accentColor?: string;
  frame: number;
  delay?: number;
  /** Entry direction */
  from?: 'bottom' | 'left' | 'right' | 'scale';
  width?: string;
}> = ({
  children, accentColor = C.cyan,
  frame, delay = 0, from = 'bottom', width = '100%',
}) => {
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - delay);

  // Entry animation with spring
  const enter = spring({ frame: f, fps, config: { damping: 14, mass: 0.6, stiffness: 100 } });

  // Transform based on direction
  const transforms: Record<string, string> = {
    bottom: `translateY(${interpolate(enter, [0, 1], [60, 0])}px)`,
    left:   `translateX(${interpolate(enter, [0, 1], [-80, 0])}px)`,
    right:  `translateX(${interpolate(enter, [0, 1], [80, 0])}px)`,
    scale:  `scale(${interpolate(enter, [0, 1], [0.7, 1])})`,
  };

  // Glow pulse on entry
  const glowPulse = f > 5 && f < 25
    ? interpolate(f, [5, 12, 25], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;

  // Border shimmer — a subtle moving highlight
  const shimmerPos = interpolate(f, [10, 40], [-100, 200], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      width,
      background: C.card,
      borderRadius: 20,
      border: `1px solid ${accentColor}25`,
      backdropFilter: 'blur(20px)',
      padding: '28px 32px',
      position: 'relative',
      overflow: 'hidden',
      opacity: interpolate(enter, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
      transform: transforms[from],
      boxShadow: glowPulse > 0 ? glow(accentColor, glowPulse) : 'none',
    }}>
      {/* Top edge shimmer */}
      <div style={{
        position: 'absolute',
        top: 0, left: `${shimmerPos}%`,
        width: '30%', height: 1,
        background: `linear-gradient(90deg, transparent, ${accentColor}60, transparent)`,
        opacity: f < 45 ? 1 : 0,
      }} />
      {children}
    </div>
  );
};

// ============================================================================
// ImpactText — 글리치/스탬프 스타일 텍스트 입장
// ============================================================================
export const ImpactText: React.FC<{
  text: string;
  frame: number;
  delay?: number;
  fontSize?: number;
  color?: string;
  style?: 'stamp' | 'glitch' | 'typewriter';
}> = ({ text, frame, delay = 0, fontSize = 48, color = C.text, style = 'stamp' }) => {
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - delay);

  if (style === 'stamp') {
    const scale = spring({ frame: f, fps, config: { damping: 8, mass: 0.4, stiffness: 200 } });
    const scaleVal = interpolate(scale, [0, 1], [3, 1]);
    const opacity = interpolate(f, [0, 3], [0, 1], { extrapolateRight: 'clamp' });
    return (
      <div style={{
        fontSize, fontWeight: 900, color,
        letterSpacing: 6, textTransform: 'uppercase' as const,
        transform: `scale(${scaleVal})`,
        opacity,
        textShadow: `0 0 30px ${color}40`,
      }}>
        {text}
      </div>
    );
  }

  if (style === 'glitch') {
    const offsetX = f < 8 ? Math.sin(f * 5) * 4 : 0;
    const offsetY = f < 8 ? Math.cos(f * 7) * 2 : 0;
    const opacity = interpolate(f, [0, 4], [0, 1], { extrapolateRight: 'clamp' });
    return (
      <div style={{ position: 'relative', fontSize, fontWeight: 900, color, letterSpacing: 4, opacity }}>
        {/* RGB split layers */}
        <span style={{
          position: 'absolute', left: offsetX, top: offsetY,
          color: '#ff000080', mixBlendMode: 'screen' as const,
        }}>{text}</span>
        <span style={{
          position: 'absolute', left: -offsetX, top: -offsetY,
          color: '#00ffff80', mixBlendMode: 'screen' as const,
        }}>{text}</span>
        <span style={{ position: 'relative' }}>{text}</span>
      </div>
    );
  }

  // typewriter
  const charsVisible = Math.min(Math.floor(f / 2), text.length);
  const displayed = text.substring(0, charsVisible);
  const cursor = f % 10 < 6 ? '▌' : '';
  return (
    <div style={{
      fontSize, fontWeight: 700, color,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {displayed}<span style={{ color: C.cyan, opacity: 0.8 }}>{cursor}</span>
    </div>
  );
};

// ============================================================================
// LowerThird — 하단 정보 바 (Bloomberg 스타일)
// ============================================================================
export const LowerThird: React.FC<{
  left: string;
  right: string;
  accentColor?: string;
  frame: number;
  delay?: number;
}> = ({ left, right, accentColor = C.cyan, frame, delay = 0 }) => {
  const f = Math.max(0, frame - delay);
  const slideIn = interpolate(f, [0, 15], [-100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = interpolate(f, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      position: 'absolute',
      bottom: 200, left: 40, right: 40,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '16px 24px',
      background: `${C.bgDeep}e0`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: '0 12px 12px 0',
      opacity,
      transform: `translateX(${slideIn}%)`,
    }}>
      <span style={{ fontSize: 18, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' as const }}>{left}</span>
      <span style={{ fontSize: 20, color: accentColor, fontWeight: 700 }}>{right}</span>
    </div>
  );
};

// ============================================================================
// BrandWatermark — 상시 표시 브랜드 워터마크
// ============================================================================
export const BrandWatermark: React.FC<{ opacity?: number }> = ({ opacity = 0.3 }) => (
  <div style={{
    position: 'absolute', top: 60, right: 50,
    fontSize: 16, fontWeight: 700,
    color: C.text, opacity,
    letterSpacing: 3,
  }}>
    SIGNUM HQ
  </div>
);
