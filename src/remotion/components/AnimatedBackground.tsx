// ============================================================================
// AnimatedBackground — 살아있는 배경 (그라디언트 이동 + 노이즈 그레인)
// ============================================================================
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { noise2D } from '@remotion/noise';
import { C } from '../design';

export const AnimatedBackground: React.FC<{
  mood?: 'bullish' | 'bearish' | 'neutral';
  intensity?: number;
}> = ({ mood = 'neutral', intensity = 1 }) => {
  const frame = useCurrentFrame();

  // Slowly rotating gradient
  const angle = interpolate(frame, [0, 900], [135, 225]);

  const moodColors = {
    bullish:  [`${C.bgDeep}`, '#051a12', '#0a2a1a', `${C.bgDeep}`],
    bearish:  [`${C.bgDeep}`, '#1a0808', '#2a0a0a', `${C.bgDeep}`],
    neutral:  [`${C.bgDeep}`, '#0a1028', '#0d1540', `${C.bgDeep}`],
  };
  const colors = moodColors[mood];

  // Floating particles (subtle data-point feel)
  const particles = Array.from({ length: 12 }, (_, i) => {
    const x = noise2D(`px${i}`, i * 0.5, frame * 0.003) * 500 + 540;
    const y = noise2D(`py${i}`, i * 0.7, frame * 0.004) * 900 + 960;
    const opacity = (noise2D(`po${i}`, i, frame * 0.01) + 1) * 0.15 * intensity;
    const size = 2 + noise2D(`ps${i}`, i, frame * 0.005) * 2;
    const hue = mood === 'bullish' ? '160' : mood === 'bearish' ? '0' : '220';
    return { x, y, opacity, size, hue };
  });

  // Scan line effect (subtle horizontal line sweep)
  const scanY = interpolate(frame % 180, [0, 180], [-50, 1970]);

  return (
    <AbsoluteFill>
      {/* Base gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(${angle}deg, ${colors.join(', ')})`,
      }} />

      {/* Grain overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: 0.03 * intensity,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' seed='${Math.floor(frame * 0.5)}'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: '200px 200px',
      }} />

      {/* Floating particles */}
      {particles.map((p, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: p.x, top: p.y,
          width: p.size, height: p.size,
          borderRadius: '50%',
          background: `hsla(${p.hue}, 80%, 60%, ${p.opacity})`,
          boxShadow: `0 0 ${p.size * 4}px hsla(${p.hue}, 80%, 60%, ${p.opacity * 0.5})`,
        }} />
      ))}

      {/* Scan line */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        top: scanY,
        height: 1,
        background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)`,
      }} />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)',
      }} />
    </AbsoluteFill>
  );
};
