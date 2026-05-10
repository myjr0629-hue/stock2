// ============================================================================
// KineticNumber — 슬롯머신 스타일 숫자 카운트업 + 도착 임팩트
// ============================================================================
import React from 'react';
import { interpolate, spring, useVideoConfig } from 'remotion';
import { C, glow } from '../design';

export const KineticNumber: React.FC<{
  value: number;
  suffix?: string;
  prefix?: string;
  color: string;
  frame: number;
  delay?: number;
  fontSize?: number;
  decimals?: number;
}> = ({
  value, suffix = '', prefix = '', color,
  frame, delay = 0, fontSize = 72, decimals = 2,
}) => {
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - delay);

  // Phase 1: Slot machine spin (fast random numbers)
  const spinDuration = 12; // frames of "spinning"
  const isSpinning = f < spinDuration && f > 0;
  const spinValue = isSpinning
    ? Math.abs(value) * (0.3 + Math.random() * 1.4) // random-ish during spin
    : 0;

  // Phase 2: Spring settle to final value
  const progress = spring({
    frame: f,
    fps,
    config: { damping: 15, mass: 0.5, stiffness: 120 },
  });
  const displayValue = interpolate(progress, [0, 1], [0, Math.abs(value)]);

  // Impact effect: scale bounce when arriving
  const impactFrame = f - 18;
  const impactScale = impactFrame > 0
    ? 1 + (1 - spring({ frame: impactFrame, fps, config: { damping: 8, mass: 0.3 } })) * 0.25
    : 1;

  // Glow pulse on arrival
  const glowIntensity = impactFrame > 0 && impactFrame < 15
    ? interpolate(impactFrame, [0, 5, 15], [0, 1, 0], { extrapolateRight: 'clamp' })
    : 0;

  // Visibility
  const opacity = interpolate(f, [0, 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const sign = value >= 0 ? (prefix || '+') : '-';
  const shown = isSpinning ? spinValue : displayValue;

  return (
    <span style={{
      color,
      fontSize,
      fontWeight: 800,
      fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      opacity,
      transform: `scale(${impactScale})`,
      display: 'inline-block',
      textShadow: glowIntensity > 0 ? glow(color, glowIntensity * 2) : 'none',
      letterSpacing: -1,
    }}>
      {sign}{shown.toFixed(decimals)}{suffix}
    </span>
  );
};
