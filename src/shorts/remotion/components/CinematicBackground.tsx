// ============================================================================
// CinematicBackground V4 — Replicate B-roll composited with procedural layers
// Visually dynamic, strongly supports the "hidden wall" metaphor.
// ============================================================================

import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, staticFile, Img } from 'remotion';
import { BRAND, Z, FPS } from '../brand/signumBrand';

interface CinematicBackgroundProps {
  brollSrc?: string; // path in public/
}

export const CinematicBackground: React.FC<CinematicBackgroundProps> = ({ brollSrc }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();

  // Motion
  const yDrift = interpolate(frame, [0, durationInFrames], [0, -60]);
  const xDrift = interpolate(frame, [0, durationInFrames], [0, -25]);
  const breathe = interpolate(frame % (fps * 6), [0, fps * 1.5, fps * 3, fps * 4.5, fps * 6], [0.15, 0.28, 0.18, 0.3, 0.15]);
  const slowZoom = interpolate(frame, [0, durationInFrames], [1.0, 1.15]);

  // Wall Reveal Opacity (B-roll gets brighter when the wall is detected at 2.6s)
  const brollBaseOpacity = 0.25;
  const brollRevealOpacity = interpolate(frame, [Math.round(2.6 * fps), Math.round(3.2 * fps)], [0, 0.25], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const totalBrollOpacity = brollBaseOpacity + brollRevealOpacity;

  return (
    <AbsoluteFill style={{ zIndex: Z.bg }}>
      {/* L0: Deep gradient */}
      <div style={{ position: 'absolute', inset: 0, background: BRAND.gradientBg }} />

      {/* L1: Replicate B-roll if available */}
      {brollSrc && (
        <div style={{
          position: 'absolute', inset: -50,
          transform: `scale(${slowZoom})`,
          transformOrigin: 'center 40%',
          zIndex: Z.broll,
        }}>
          <Img src={staticFile(brollSrc)} style={{
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center',
            opacity: totalBrollOpacity,
            filter: 'saturate(1.2) contrast(1.1)',
            mixBlendMode: 'screen'
          }} />
        </div>
      )}

      {/* L2: Dot matrix with parallax */}
      <div style={{
        position: 'absolute', inset: -120,
        transform: `translate(${xDrift}px, ${yDrift}px)`,
        backgroundImage: `radial-gradient(circle, rgba(34,211,238,0.04) 1px, transparent 1px)`,
        backgroundSize: '36px 36px', zIndex: Z.grid,
      }} />

      {/* L3: Diagonal streams */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translateY(${yDrift * 1.3}px)`,
        backgroundImage: `repeating-linear-gradient(-30deg, transparent, transparent 100px, rgba(34,211,238,0.015) 100px, rgba(34,211,238,0.015) 101px)`,
        zIndex: Z.grid,
      }} />

      {/* L4: Cyan glow upper */}
      <div style={{
        position: 'absolute', top: '-5%', left: '25%',
        width: 800, height: 600, borderRadius: '50%',
        background: `radial-gradient(ellipse, rgba(34,211,238,0.08) 0%, transparent 60%)`,
        opacity: breathe, filter: 'blur(60px)', zIndex: Z.glows,
      }} />

      {/* L5: Purple glow lower-right */}
      <div style={{
        position: 'absolute', bottom: '10%', right: '-10%',
        width: 700, height: 700, borderRadius: '50%',
        background: `radial-gradient(ellipse, rgba(167,139,250,0.08) 0%, transparent 60%)`,
        opacity: breathe * 0.8, filter: 'blur(80px)', zIndex: Z.glows,
      }} />

      {/* L6: Dark vignette to ensure text contrast */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 15%, rgba(2,4,8,0.85) 100%)',
        zIndex: Z.glows + 1,
      }} />

      {/* L7: Film grain */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`,
        opacity: 0.6, mixBlendMode: 'overlay', zIndex: Z.glows + 2,
      }} />
    </AbsoluteFill>
  );
};
