// ============================================================================
// Persistent Layers — 상시 표시 (모든 씬 위에 렌더링)
// BrandLogo (좌상단) + ProgressBar (하단) + ScanlineOverlay
// ============================================================================
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { C } from '../design';

const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

// ── Brand Logo (좌상단) ──
export const PersistentBrandLogo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, fps * 0.5], [0, 0.85], clamp);

  return (
    <div style={{
      position: 'absolute', top: 52, left: 52,
      display: 'flex', alignItems: 'center', gap: 14, opacity, zIndex: 200,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(135deg, ${C.purple} 0%, ${C.cyan} 100%)`,
      }}>
        <svg width="28" height="28" viewBox="0 0 160 160" fill="none">
          <path d="M119 22H64C43 22 29 34 29 52c0 16 10 26 30 34l35 14c10 4 15 9 15 17 0 10-8 16-23 16H38"
            stroke={C.text} strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M117 22 98 43M40 133 62 112" stroke={C.text} strokeWidth="22" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <div style={{ color: C.text, fontSize: 26, lineHeight: 1, fontWeight: 900, letterSpacing: '0.12em', fontFamily: 'Inter' }}>
          SIGNUM HQ
        </div>
        <div style={{ marginTop: 5, color: '#d2d9e6', fontSize: 12, fontWeight: 500, letterSpacing: '0.03em', fontFamily: 'Inter' }}>
          Institutional Intelligence
        </div>
      </div>
    </div>
  );
};

// ── Progress Bar (하단) ──
export const PersistentProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = (frame / durationInFrames) * 100;

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 6,
      background: 'rgba(255,255,255,0.05)', zIndex: 200,
    }}>
      <div style={{
        height: '100%', width: `${progress}%`,
        background: `linear-gradient(90deg, ${C.purple} 0%, ${C.cyan} 100%)`,
      }} />
    </div>
  );
};

// ── Scanline Overlay ──
export const PersistentScanline: React.FC = () => (
  <AbsoluteFill style={{
    background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 4px)',
    pointerEvents: 'none', zIndex: 190, mixBlendMode: 'overlay',
  }} />
);
