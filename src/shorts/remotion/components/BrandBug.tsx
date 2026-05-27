// ============================================================================
// BrandBug V3 — Minimal icon after 3s, full lockup for CTA
// No logo during hook (0-3s).
// ============================================================================

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { BRAND, TYPE, Z, SHADOW, SG_LOGO } from '../brand/signumBrand';

/** Minimal icon-only watermark, appears after 3s */
export const BrandBug: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [fps * 3, fps * 4], [0, 0.6], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  if (opacity < 0.01) return null;

  return (
    <div style={{ position: 'absolute', top: 52, left: 52, opacity, zIndex: Z.brand }}>
      <svg width="28" height="28" viewBox="246 247 530 530" fill="none">
        <path d={SG_LOGO.upper} fill={BRAND.text} fillOpacity={0.75} />
        <path d={SG_LOGO.lower} fill={BRAND.text} fillOpacity={0.75} />
      </svg>
    </div>
  );
};

/** Full CTA lockup with real logo + wordmark */
export const BrandCTALockup: React.FC<{ cta: string }> = ({ cta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = interpolate(frame, [0, fps * 0.6], [0, 1], { extrapolateRight: 'clamp' });
  const sy = (1 - r) * 12;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      opacity: r, zIndex: Z.hookText,
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 24, transform: `translateY(${sy}px)` }}>
        <svg width="56" height="56" viewBox="246 247 530 530" fill="none">
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.text} />
        </svg>
      </div>

      {/* Wordmark */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 28, transform: `translateY(${sy}px)` }}>
        <span style={{ color: BRAND.text, fontSize: 32, fontWeight: 900, letterSpacing: '0.16em', fontFamily: TYPE.family }}>SIGNUM</span>
        <span style={{ color: BRAND.cyan, fontSize: 32, fontWeight: 900, letterSpacing: '0.16em', fontFamily: TYPE.family }}>HQ</span>
      </div>

      {/* Divider */}
      <div style={{ width: 90 * r, height: 1.5, marginBottom: 24, background: BRAND.gradientCyanPurple }} />

      {/* CTA */}
      <div style={{
        color: BRAND.cyan, fontSize: 42, fontWeight: 800,
        fontFamily: TYPE.family, textAlign: 'center',
        letterSpacing: '-0.01em', textShadow: SHADOW.cyan,
        transform: `translateY(${sy}px)`,
      }}>
        {cta}
      </div>

      {/* URL */}
      <div style={{
        marginTop: 16, color: BRAND.mutedLight,
        fontSize: 16, fontWeight: 500, fontFamily: TYPE.family,
        letterSpacing: '0.08em', opacity: r * 0.5,
      }}>
        signumhq.com
      </div>
    </div>
  );
};
