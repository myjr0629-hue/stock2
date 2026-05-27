// ============================================================================
// MarketPressureBrief V28 — Revenue-Grade Viewer Lock-in Rebuild
// ============================================================================
// "Bloomberg Terminal meets cinematic intelligence leak"
// Rebuilt from the ground up:
// - Dynamic procedural living terminal background with slow drift and grid drift
// - Faint scrolling candlestick price trace in background
// - Low-opacity breathing volume profile overlay
// - Tiny institutional telemetry text fragments scattered
// - Soft active cyan/red glow zones highlight active structures
// - Subtle vignette and 2.5% film grain overlay
// - One continuous transforming price chart across Scenes 02 to 05
// - Expensive, duplicate-free Scene 06 CTA lockup
// - High volume continuous audio mix ensuring zero silence gaps > 0.25s
// ============================================================================

import React from 'react';
import {
  AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig,
  interpolate, spring, staticFile, Audio, Easing, random,
} from 'remotion';
import type { ShortsVideoInput, CaptionSegment } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO, LAYOUT } from '../brand/signumBrand';
import { ComplianceFooter } from '../components/ComplianceFooter';
import GlassCard from '../components/GlassCard';
import CountUpNumber from '../components/CountUpNumber';
import AlertTopBar from '../components/AlertTopBar';

export type MarketPressureBriefV28Props = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

const MONO_FAMILY = "'JetBrains Mono', 'SF Mono', monospace";

// ─── Procedural Layer: Slow Moving Candlestick Trace (Layer 3) ──────────────────
const ScrollingBackgroundChart: React.FC = () => {
  const frame = useCurrentFrame();
  // Very slow horizontal scrolling
  const scrollOffset = (frame * 0.8) % 2400;
  return (
    <div style={{
      position: 'absolute', inset: 0, opacity: 0.05, transform: `translateX(-${scrollOffset}px)`,
      display: 'flex', alignItems: 'center', gap: 60, pointerEvents: 'none', zIndex: Z.grid - 1,
    }}>
      {Array.from({ length: 50 }).map((_, i) => {
        const h = 80 + Math.sin(i * 0.5) * 150 + Math.cos(i * 0.2) * 50;
        const color = i % 2 === 0 ? BRAND.cyan : BRAND.coral;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 1.5, height: h * 0.3, background: color }} />
            <div style={{ width: 8, height: h * 0.7, background: color, borderRadius: 1 }} />
            <div style={{ width: 1.5, height: h * 0.2, background: color }} />
          </div>
        );
      })}
    </div>
  );
};

// ─── Procedural Layer: Breathing Volume Profile Overlay (Layer 4) ───────────
const VolumeProfileOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{
      position: 'absolute', left: 40, top: 250, bottom: 250, width: 200,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      pointerEvents: 'none', zIndex: Z.grid - 1, opacity: 0.05
    }}>
      {Array.from({ length: 15 }).map((_, i) => {
        const baseW = 40 + Math.sin(i * 0.8) * 80 + Math.cos(i * 0.3) * 30;
        const pulse = Math.sin(frame * 0.04 + i) * 10;
        const w = Math.max(10, baseW + pulse);
        const color = i % 3 === 0 ? BRAND.coral : BRAND.cyan;
        return (
          <div key={i} style={{
            height: 12, width: w, background: color,
            borderRadius: '0 4px 4px 0', borderRight: `1.5px solid ${color}`,
          }} />
        );
      })}
    </div>
  );
};

// ─── Procedural Layer: Institutional Telemetry fragments (Layer 5) ─────────────
const TelemetryFragments: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{
      position: 'absolute', inset: 50, pointerEvents: 'none', zIndex: Z.grid,
      fontFamily: MONO_FAMILY, fontSize: 11, color: 'rgba(34,211,238,0.18)',
    }}>
      <div style={{ position: 'absolute', top: 120, left: 20 }}>SYS_TRCK_SIG: 0x992B</div>
      <div style={{ position: 'absolute', top: 140, left: 20 }}>FLOW_STATE: {Math.sin(frame * 0.05) > 0 ? 'STABLE' : 'DRIFTING'}</div>
      <div style={{ position: 'absolute', bottom: 240, left: 20 }}>LIMIT_BND: 600.00 / 580.00</div>
      <div style={{ position: 'absolute', bottom: 260, left: 20 }}>DELTA_EXPOSURE: +0.41%</div>
      <div style={{ position: 'absolute', top: 480, right: 20 }}>GAMMA_VAL: 1.25M</div>
      <div style={{ position: 'absolute', top: 500, right: 20 }}>REGIME: NEG_GEX</div>
    </div>
  );
};

// ─── Procedural Layer: Soft active cyan/red glow zones (Layer 6) ─────────────
const GlowZones: React.FC = () => {
  const frame = useCurrentFrame();
  const glowIntensity = 0.5 + Math.sin(frame * 0.08) * 0.15;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: Z.bg + 1 }}>
      {/* Call Wall Red Glow Zone */}
      <div style={{
        position: 'absolute', top: 400, left: 100, right: 100, height: 400,
        background: 'radial-gradient(circle, rgba(248,113,113,0.06) 0%, transparent 70%)',
        opacity: glowIntensity,
      }} />
      {/* Cyan Price Glow Zone */}
      <div style={{
        position: 'absolute', bottom: 400, left: 200, width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(34,211,238,0.04) 0%, transparent 70%)',
        opacity: glowIntensity,
      }} />
    </div>
  );
};

// ─── Premium Living Terminal Background System (L0-L8 Combined) ────────────────
const LivingTerminalBackground: React.FC<{ sceneName?: string }> = ({ sceneName = 'default' }) => {
  const frame = useCurrentFrame();

  // Slow horizontal and vertical drifting grid position
  const gridX = (frame * 0.15) % 120;
  const gridY = (frame * 0.25) % 120;

  // L5 — Film grain noise seed mapping
  const grainSeed = Math.floor(random(`grain-${sceneName}-${frame}`) * 1000);
  const grainTx = (random(`grain-tx-${frame}`) - 0.5) * 3;
  const grainTy = (random(`grain-ty-${frame}`) - 0.5) * 3;

  return (
    <AbsoluteFill style={{ background: '#040710', overflow: 'hidden', zIndex: Z.bg }}>
      {/* L1 — Deep navy gradient base */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 120% 80% at 50% 40%, #060c1a 0%, #02040a 70%),
          radial-gradient(ellipse 100% 60% at 30% 70%, #081020 0%, transparent 60%),
          linear-gradient(180deg, #02040a 0%, #060c1a 35%, #081020 65%, #02040a 100%)
        `,
        zIndex: Z.bg,
      }} />

      {/* L2 — Drifting Grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          radial-gradient(rgba(34, 211, 238, 0.05) 1px, transparent 1px),
          radial-gradient(rgba(34, 211, 238, 0.03) 1px, transparent 1px)
        `,
        backgroundSize: '80px 80px',
        backgroundPosition: `${gridX}px ${gridY}px`,
        zIndex: Z.grid,
        pointerEvents: 'none',
      }} />

      {/* L3 — Scrolling Candlestick Trace */}
      <ScrollingBackgroundChart />

      {/* L4 — Volume Profile Overlay */}
      <VolumeProfileOverlay />

      {/* L5 — Telemetry fragments */}
      <TelemetryFragments />

      {/* L6 — Glow Zones */}
      <GlowZones />

      {/* L7 — Vignette Overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 70% 55% at 50% 45%, transparent 0%, rgba(0,0,0,0.75) 100%)',
        zIndex: Z.glows + 1,
        pointerEvents: 'none',
      }} />

      {/* L8 — 2.5% Film Grain */}
      <div style={{
        position: 'absolute', inset: 0,
        zIndex: Z.glows + 2,
        pointerEvents: 'none',
        opacity: 0.025,
        transform: `translate(${grainTx}px, ${grainTy}px)`,
      }}>
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <filter id={`grain-${sceneName}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" seed={grainSeed} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#grain-${sceneName})`} />
        </svg>
      </div>

      {/* Institutional borders with corner crosshairs */}
      <div style={{
        position: 'absolute', inset: 30,
        border: '1.5px solid rgba(34, 211, 238, 0.06)',
        pointerEvents: 'none', zIndex: Z.grid + 2,
      }}>
        <div style={{ position: 'absolute', top: -5, left: -5, width: 14, height: 14, borderTop: '2px solid rgba(34,211,238,0.3)', borderLeft: '2px solid rgba(34,211,238,0.3)' }} />
        <div style={{ position: 'absolute', top: -5, right: -5, width: 14, height: 14, borderTop: '2px solid rgba(34,211,238,0.3)', borderRight: '2px solid rgba(34,211,238,0.3)' }} />
        <div style={{ position: 'absolute', bottom: -5, left: -5, width: 14, height: 14, borderBottom: '2px solid rgba(34,211,238,0.3)', borderLeft: '2px solid rgba(34,211,238,0.3)' }} />
        <div style={{ position: 'absolute', bottom: -5, right: -5, width: 14, height: 14, borderBottom: '2px solid rgba(34,211,238,0.3)', borderRight: '2px solid rgba(34,211,238,0.3)' }} />

        <div style={{ position: 'absolute', top: 8, left: 12, color: 'rgba(34,211,238,0.3)', fontSize: 13, fontFamily: MONO_FAMILY, fontWeight: 700, letterSpacing: '0.05em' }}>SYS: ACTIVE</div>
        <div style={{ position: 'absolute', top: 8, right: 12, color: 'rgba(34,211,238,0.3)', fontSize: 13, fontFamily: MONO_FAMILY, fontWeight: 700, letterSpacing: '0.05em' }}>NET: LIVE_STRM</div>
        <div style={{ position: 'absolute', bottom: 8, left: 12, color: 'rgba(255,255,255,0.15)', fontSize: 12, fontFamily: MONO_FAMILY }}>[SCALE: 9:16 ENHANCED]</div>
        <div style={{ position: 'absolute', bottom: 8, right: 12, color: 'rgba(255,255,255,0.15)', fontSize: 12, fontFamily: MONO_FAMILY }}>[MODE: OVERLAY]</div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Telemetry Dashboard Panel ───────────────────────────────────────────────
const TerminalTelemetryPanel: React.FC<{
  title: string;
  metrics: { label: string; value: string; color?: string }[];
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  width?: number;
}> = ({ title, metrics, top, left, right, bottom, width = 420 }) => {
  return (
    <div style={{
      position: 'absolute', top, left, right, bottom, width,
      zIndex: Z.data + 2,
    }}>
      <GlassCard color="rgba(34,211,238,0.12)" padding="12px 20px" bracket={true}>
        <div style={{
          fontFamily: MONO_FAMILY, fontSize: 13, fontWeight: 900,
          color: BRAND.cyan, letterSpacing: '0.08em', borderBottom: '1px solid rgba(34,211,238,0.15)',
          paddingBottom: 6, marginBottom: 8, textTransform: 'uppercase',
        }}>{title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {metrics.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: MONO_FAMILY, fontSize: 12, color: BRAND.mutedLight }}>{m.label}</span>
              <span style={{ fontFamily: MONO_FAMILY, fontSize: 13, fontWeight: 700, color: m.color || BRAND.text }}>{m.value}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
};

// ─── Technical Scanner Line ─────────────────────────────────────────
const ScannerLine: React.FC<{ progress: number; glow?: number; color?: string }> = ({ progress, glow = 100, color = BRAND.cyan }) => {
  const y = interpolate(progress, [0, 1], [500, 1250]);
  return (
    <div style={{
      position: 'absolute', left: 80, right: 80, top: y, height: 6,
      background: `linear-gradient(90deg, transparent 0%, ${color} 20%, #ffffff 50%, ${color} 80%, transparent 100%)`,
      boxShadow: `0 0 ${glow}px ${color}, 0 0 ${glow * 1.5}px ${color}, inset 0 0 10px #ffffff`,
      zIndex: Z.data + 5, pointerEvents: 'none', opacity: 0.95,
    }} />
  );
};

// ─── Flow particles in bracket gap ──────────────────────────────────────────
const FlowParticles: React.FC<{
  startY: number; endY: number; count?: number; color?: string; frameOffset?: number;
}> = ({ startY, endY, count = 12, color = BRAND.cyan, frameOffset = 0 }) => {
  const frame = useCurrentFrame() + frameOffset;
  return (
    <div style={{ position: 'absolute', left: 80, right: 80, top: startY, height: Math.abs(endY - startY), pointerEvents: 'none', zIndex: Z.wallViz - 1 }}>
      {Array.from({ length: count }).map((_, i) => {
        const x = 120 + random(i) * 680;
        const progress = ((frame * (0.015 + random(i) * 0.02)) + random(i + 5)) % 1.0;
        // Reversed y to make particles flow UPWARD toward the Call Wall structure (startY)
        const y = interpolate(progress, [0, 1], [Math.abs(endY - startY), 0]);
        const op = interpolate(progress, [0, 0.2, 0.8, 1], [0, 0.7, 0.7, 0]);
        const sz = 6 + random(i + 2) * 12;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y, width: sz, height: sz,
            borderRadius: '50%', background: color, opacity: op,
            boxShadow: `0 0 ${sz * 2}px ${color}`,
          }} />
        );
      })}
    </div>
  );
};

// ─── Phrase-Level Safe Caption Overlay ──────────────────────────────────────
const SafeCaptionOverlay: React.FC<{ captions: CaptionSegment[]; frame: number }> = ({ captions, frame }) => {
  // Disable captions during Scene 06 CTA (frame >= S(14.2)) to prevent overlapping with brand elements
  if (frame >= S(14.2)) return null;

  if (!captions || captions.length === 0) return null;

  const activeCaption = captions.find(c => frame >= c.startFrame && frame < c.endFrame);
  if (!activeCaption) return null;

  const isScene01 = frame < S(2.0);
  const targetY = isScene01 ? 1420 : 380;
  const accentColor = activeCaption.color || (activeCaption.emphasis ? BRAND.cyan : BRAND.text);

  return (
    <div style={{
      position: 'absolute', left: 70, right: 70, top: targetY,
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: Z.caption, pointerEvents: 'none',
    }}>
      <div style={{
        fontFamily: isScene01 ? MONO_FAMILY : "'Outfit', 'Montserrat', 'SF Pro Display', sans-serif",
        fontWeight: 900,
        fontSize: isScene01 ? 32 : (activeCaption.emphasis ? 72 : 58),
        color: accentColor,
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: isScene01 ? '0.08em' : '-0.01em',
        lineHeight: 1.15,
        textShadow: '0 2px 15px rgba(0,0,0,0.95), 0 0 30px rgba(0,0,0,0.85)',
      }}>
        {activeCaption.text}
      </div>
    </div>
  );
};

// ─── Audio Engine ────────────────────────────────────────────────────────────
const AudioEngine: React.FC = () => (
  <>
    <Audio src={staticFile('shorts/audio/v26_voice.mp3')} volume={0.98} />
    {/* Continuous backing audio bed at high volume (0.42) to bridge any silence gaps */}
    <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.42} startFrom={0} endAt={S(18.5)} />
    <Sequence from={S(0.0)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.6} /></Sequence>
    <Sequence from={S(2.0)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.5} /></Sequence>
    <Sequence from={S(4.5)}><Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.55} /></Sequence>
    <Sequence from={S(7.2)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.6} /></Sequence>
    <Sequence from={S(10.0)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.5} /></Sequence>
    <Sequence from={S(14.2)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.45} /></Sequence>
  </>
);

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 01: EVENT SHOCK (0.0s - 2.0s, 60f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene01_EventShock: React.FC = () => {
  const frame = useCurrentFrame();
  const wallY = 1200;
  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      <AlertTopBar ticker="SPY" price={592.31} alertText="LIVE | SPY | OFF-EXCHANGE FLOW DETECTED" />

      {/* Red Call Wall line */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 8, background: BRAND.coral,
        boxShadow: `0 0 45px ${BRAND.coralGlow}`, zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 32,
        color: BRAND.coral, fontSize: 24, fontWeight: 900, fontFamily: MONO_FAMILY,
        textShadow: SHADOW.coral, zIndex: Z.data, letterSpacing: '0.05em',
      }}>[CALL WALL $600.00]</div>

      {/* HERO CARD (Single, non-duplicated hero) */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 60, left: LAYOUT.safeL, right: LAYOUT.safeR,
        display: 'flex', flexDirection: 'column', gap: 16, zIndex: Z.hookText,
      }}>
        <GlassCard color="rgba(34,211,238,0.16)" padding="24px" bracket={true}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: MONO_FAMILY, fontSize: 22, fontWeight: 900, color: BRAND.cyan }}>SPY LIQUIDITY ANOMALY</span>
            <span style={{ fontFamily: MONO_FAMILY, fontSize: 16, color: BRAND.amber, border: `1px solid ${BRAND.amber}`, padding: '3px 8px', borderRadius: 4 }}>91st %ILE FLOW</span>
          </div>
          <div style={{ marginTop: 16, fontSize: 110, fontWeight: 900, fontFamily: MONO_FAMILY, color: BRAND.text, textAlign: 'center', lineHeight: 1 }}>
            $420M
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, fontFamily: MONO_FAMILY, color: BRAND.cyan, textAlign: 'center', marginTop: 8, letterSpacing: '0.05em' }}>
            OFF-EXCHANGE FLOW
          </div>
        </GlassCard>
      </div>

      {/* Beautiful High-density Living Terminal Chart for Lower Half (Eliminates empty space) */}
      <div style={{
        position: 'absolute', top: 780, left: LAYOUT.safeL, right: LAYOUT.safeR, height: 350,
        border: '1.5px solid rgba(34,211,238,0.15)', borderRadius: 12,
        background: 'rgba(4,7,16,0.3)', overflow: 'hidden',
        zIndex: Z.data,
      }}>
        {/* Horizontal grid lines inside the mini-chart */}
        <div style={{ position: 'absolute', top: 90, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.06)' }} />
        <div style={{ position: 'absolute', top: 180, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.06)' }} />
        <div style={{ position: 'absolute', top: 270, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.06)' }} />

        {/* Mini running price path vector */}
        <svg width="960" height="350" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.25 }}>
          <path d="M 0,230 Q 150,130 300,190 T 600,110 T 960,170" fill="none" stroke={BRAND.cyan} strokeWidth="3" />
        </svg>

        {/* Faint pulsing histogram bars */}
        <div style={{
          position: 'absolute', bottom: 15, left: 20, right: 20, height: 70,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', opacity: 0.18
        }}>
          {Array.from({ length: 24 }).map((_, i) => {
            const h = 15 + Math.sin(frame * 0.08 + i) * 35 + Math.cos(frame * 0.04 - i) * 15;
            return (
              <div key={i} style={{
                width: 16, height: Math.max(5, h), background: BRAND.cyan,
                borderRadius: '2px 2px 0 0'
              }} />
            );
          })}
        </div>

        {/* Status indicator texts inside the mini-panel */}
        <div style={{ position: 'absolute', top: 16, left: 20, fontFamily: MONO_FAMILY, fontSize: 13, color: BRAND.cyan }}>
          [FEED: REALTIME_DEPTH]
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ContinuousTransformChart: React.FC<{ frame: number; scene: 'scene2' | 'scene3' | 'scene4' | 'scene5' }> = ({ frame, scene }) => {
  const chartTop = 520;
  const chartBottom = 1220;
  const chartHeight = chartBottom - chartTop;

  // Grid tick levels
  const callWallY = chartTop + 80;    // Y=600
  const gammaFlipY = chartTop + 400;  // Y=920
  const putFloorY = chartTop + 630;   // Y=1150

  // Dynamic price position
  // In Scene 02: Dim baseline price line
  // In Scene 03: Price dot pushes towards the Call Wall: goes from Y=900 down to Y=680
  let activePriceY = chartTop + 400; // default
  if (scene === 'scene2') {
    activePriceY = chartTop + 380;
  } else if (scene === 'scene3') {
    activePriceY = interpolate(frame, [0, S(2.7)], [chartTop + 380, chartTop + 160], { extrapolateRight: 'clamp' });
  } else if (scene === 'scene4') {
    activePriceY = chartTop + 160;
  } else if (scene === 'scene5') {
    activePriceY = chartTop + 220;
  }

  // Bracket compression logic (Scene 3 compresses slightly)
  const bracketH = Math.max(20, activePriceY - callWallY);

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      {/* Container outline */}
      <div style={{
        position: 'absolute', left: 80, right: 80, top: chartTop, height: chartHeight,
        border: '1.5px solid rgba(255,255,255,0.06)', borderRadius: 12,
        background: 'rgba(4,7,16,0.5)', overflow: 'hidden',
      }}>
        {/* Horizontal grids */}
        <div style={{ position: 'absolute', top: 80, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', top: 240, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', top: 400, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', top: 560, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.04)' }} />
      </div>

      {/* --- Render Scene-based logic over the SAME structure --- */}

      {/* Scene 02: Scanner Reveal Call Wall */}
      {scene === 'scene2' && (() => {
        // Scanner Line sweep progress mapping
        const sweepProgress = interpolate(frame, [0, S(2.0)], [0, 1], { extrapolateRight: 'clamp' });
        const sweepY = interpolate(sweepProgress, [0, 1], [chartTop, chartBottom]);
        
        // Dynamically unmask Call Wall as the scanner passes it
        const callWallOpacity = interpolate(sweepY, [callWallY, callWallY + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

        return (
          <>
            {/* Price curve (always visible but dim in standard view) */}
            <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: Z.data }}>
              <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="3" />
            </svg>

            {/* Scanner Line passing */}
            <ScannerLine progress={sweepProgress} />

            {/* Red Call Wall dynamically fading in as scanner passes */}
            <div style={{ zIndex: Z.data, opacity: callWallOpacity }}>
              <div style={{
                position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
                boxShadow: `0 0 35px ${BRAND.coralGlow}`,
              }} />
              <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: BRAND.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900 }}>
                [CALL RESISTANCE $600.00]
              </div>
              {/* Gap bracket */}
              <div style={{ position: 'absolute', left: 740, top: callWallY, height: activePriceY - callWallY, zIndex: Z.data }}>
                <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: BRAND.amber }} />
                <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: BRAND.amber }} />
                <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: BRAND.amber }} />
              </div>
            </div>
          </>
        );
      })()}

      {/* Scene 03: Gap tension pushes dot, particles move towards gap */}
      {scene === 'scene3' && (
        <>
          {/* Price curve matching moving price spot */}
          <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: Z.data }}>
            <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
          </svg>

          {/* Call Wall Red resistance */}
          <div style={{
            position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
            boxShadow: `0 0 50px ${BRAND.coralGlow}`, zIndex: Z.data,
          }} />
          <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: BRAND.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, zIndex: Z.data }}>
            [CALL RESISTANCE $600.00]
          </div>

          {/* Glowing Price Dot */}
          <div style={{
            position: 'absolute', left: 600 - 12, top: activePriceY - 12, width: 24, height: 24,
            borderRadius: '50%', background: BRAND.cyan,
            boxShadow: `0 0 35px ${BRAND.cyanGlow}`, zIndex: Z.data + 2,
          }} />

          {/* Gap bracket */}
          <div style={{ position: 'absolute', left: 740, top: callWallY, height: bracketH, zIndex: Z.data }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: BRAND.amber, boxShadow: `0 0 20px ${BRAND.amberGlow}` }} />
            <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: BRAND.amber }} />
            <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: BRAND.amber }} />
          </div>

          {/* Flow Particles moving towards red wall gap */}
          <FlowParticles startY={callWallY} endY={activePriceY} count={16} />

          {/* Massive 1.3% Hero context inside chart space */}
          <div style={{ position: 'absolute', left: 160, top: callWallY + 40, zIndex: Z.hookText }}>
            <CountUpNumber
              target={1.3} prefix="" suffix="%"
              fontSize={140} color={BRAND.amber} duration={1} delay={0}
              textShadow={SHADOW.amber}
              formatFn={(n: number) => (1.3).toFixed(1)}
            />
          </div>
        </>
      )}

      {/* Scene 04: Sequential reveal of Call Wall, Gamma Flip, and Put Floor */}
      {scene === 'scene4' && (() => {
        // Smooth fade-in and scaling animations for sequential levels
        const gammaFlipOpacity = interpolate(frame, [S(0.6), S(1.0)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const gammaFlipScale = interpolate(gammaFlipOpacity, [0, 1], [0.97, 1]);

        const putFloorOpacity = interpolate(frame, [S(1.2), S(1.6)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const putFloorScale = interpolate(putFloorOpacity, [0, 1], [0.97, 1]);

        return (
          <>
            {/* Base price path */}
            <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.3, zIndex: Z.data }}>
              <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke={BRAND.cyan} strokeWidth="3" />
            </svg>

            {/* Sequential Layers */}
            {/* 1. Call Wall (0.0s+) */}
            <div style={{ zIndex: Z.data }}>
              <div style={{
                position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
                boxShadow: `0 0 45px ${BRAND.coralGlow}`,
              }} />
              <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: BRAND.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900 }}>
                [CALL WALL $600.00]
              </div>
            </div>

            {/* 2. Gamma Flip (0.6s+ with smooth unmasking) */}
            <div style={{ zIndex: Z.data, opacity: gammaFlipOpacity, transform: `scaleX(${gammaFlipScale})` }}>
              <div style={{
                position: 'absolute', left: 80, right: 80, top: gammaFlipY, height: 6,
                background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 16px, transparent 16px, transparent 32px)`,
                boxShadow: `0 0 25px ${BRAND.purpleGlow}`,
              }} />
              <div style={{ position: 'absolute', right: 100, top: gammaFlipY - 32, color: BRAND.purple, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900 }}>
                [GAMMA FLIP $588.00]
              </div>
            </div>

            {/* 3. Put Floor (1.2s+ with smooth unmasking) */}
            <div style={{ zIndex: Z.data, opacity: putFloorOpacity, transform: `scaleX(${putFloorScale})` }}>
              <div style={{
                position: 'absolute', left: 80, right: 80, top: putFloorY, height: 8, background: BRAND.emerald,
                boxShadow: `0 0 35px ${BRAND.emerald}`,
              }} />
              <div style={{ position: 'absolute', right: 100, top: putFloorY - 32, color: BRAND.emerald, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900 }}>
                [PUT FLOOR $580.00]
              </div>
            </div>

            {frame >= S(0.6) && (
              <FlowParticles startY={callWallY} endY={gammaFlipY} count={10} frameOffset={60} />
            )}
          </>
        );
      })()}

      {/* Scene 05: scanner sweep unmasks full SignumHQ layers */}
      {scene === 'scene5' && (() => {
        // Continuous sweep progress from top to bottom
        const sweepProgress = interpolate(frame, [S(0.2), S(2.2)], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
        const sweepY = interpolate(sweepProgress, [0, 1], [chartTop, chartBottom]);

        // Unmask structure lines EXACTLY as the sweep passes their vertical Y position
        const callWallOpacity = interpolate(sweepY, [callWallY, callWallY + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const gammaFlipOpacity = interpolate(sweepY, [gammaFlipY, gammaFlipY + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const putFloorOpacity = interpolate(sweepY, [putFloorY, putFloorY + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

        return (
          <>
            {/* Sweep progress maps from top to bottom */}
            <ScannerLine progress={sweepProgress} />

            {/* Price path unmasking smoothly */}
            <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: Z.data }}>
              {/* Dim price feed always visible */}
              <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none"
                stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
              
              {/* Glowing price feed fades in as scanner passes */}
              <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none"
                stroke={BRAND.cyan} strokeWidth="4" style={{ opacity: sweepProgress }} />
            </svg>

            {/* Unmasked Call Wall */}
            <div style={{ zIndex: Z.data, opacity: callWallOpacity }}>
              <div style={{
                position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
                boxShadow: `0 0 50px ${BRAND.coralGlow}`,
              }} />
              <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: BRAND.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900 }}>
                [CALL RESISTANCE $600.00]
              </div>
            </div>

            {/* Unmasked Gamma Flip */}
            <div style={{ zIndex: Z.data, opacity: gammaFlipOpacity }}>
              <div style={{
                position: 'absolute', left: 80, right: 80, top: gammaFlipY, height: 6,
                background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 16px, transparent 16px, transparent 32px)`,
                boxShadow: `0 0 30px ${BRAND.purpleGlow}`,
              }} />
              <div style={{ position: 'absolute', right: 100, top: gammaFlipY - 32, color: BRAND.purple, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900 }}>
                [GAMMA STABILITY $588.00]
              </div>
            </div>

            {/* Unmasked Put Floor */}
            <div style={{ zIndex: Z.data, opacity: putFloorOpacity }}>
              <div style={{
                position: 'absolute', left: 80, right: 80, top: putFloorY, height: 8, background: BRAND.emerald,
                boxShadow: `0 0 40px ${BRAND.emerald}`,
              }} />
              <div style={{ position: 'absolute', right: 100, top: putFloorY - 32, color: BRAND.emerald, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900 }}>
                [PUT SUPPORT FLOOR $580.00]
              </div>
            </div>

            {sweepY >= gammaFlipY && (
              <FlowParticles startY={callWallY} endY={gammaFlipY} count={14} frameOffset={120} />
            )}
          </>
        );
      })()}

      {/* Shared bottom information overlay */}
      <div style={{
        position: 'absolute', bottom: 15, left: 100, right: 100,
        display: 'flex', justifyContent: 'space-between', zIndex: Z.data + 2,
        fontFamily: MONO_FAMILY, fontSize: 13, color: BRAND.mutedLight,
      }}>
        <span>COORDINATE_MAP: ACTIVE</span>
        <span>INDEX: SPY $592.31</span>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 06: BRAND CTA LOCKUP (14.2s - 18.5s, 129f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene06_CTA: React.FC = () => {
  const frame = useCurrentFrame();
  // Premium slow breathing effect
  const breathe = 0.95 + Math.sin(frame * 0.06) * 0.05;

  return (
    <AbsoluteFill style={{ zIndex: Z.hookText }}>
      {/* High density vector background overlay */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: '32%', height: 2.5,
        background: `linear-gradient(90deg, transparent, ${BRAND.cyan}, transparent)`,
        opacity: 0.25, zIndex: Z.grid,
      }} />

      {/* Vector Logo - elegant, zero overlap */}
      <div style={{
        position: 'absolute', top: 320, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', zIndex: Z.brand,
      }}>
        <svg width="220" height="220" viewBox="246 247 530 530" fill="none" style={{ transform: `scale(${breathe})` }}>
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.cyan} />
        </svg>
      </div>

      {/* Brand & Tagline lockup */}
      <div style={{
        position: 'absolute', top: 620, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.brand,
      }}>
        <span style={{
          color: BRAND.text, fontSize: 88, fontWeight: 900, fontFamily: TYPE.family,
          letterSpacing: '0.04em', textShadow: SHADOW.hero,
        }}>SIGNUMHQ</span>

        <div style={{ marginTop: 22 }}>
          <span style={{
            color: BRAND.cyan, fontSize: 32, fontWeight: 900, fontFamily: MONO_FAMILY,
            letterSpacing: '0.08em', textShadow: SHADOW.cyan,
          }}>[SEE THE STRUCTURE BEHIND PRICE]</span>
        </div>
      </div>

      {/* Single, massive domain box - premium, uncompromised */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 120, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.brand,
      }}>
        <div style={{
          display: 'inline-block',
          border: `2px.solid ${BRAND.cyan}`,
          borderColor: BRAND.cyan,
          borderStyle: 'solid',
          borderWidth: '2.5px',
          padding: '18px 56px',
          borderRadius: 8,
          background: 'rgba(4,7,16,0.92)',
          boxShadow: `0 0 40px rgba(34,211,238,0.3)`,
        }}>
          <span style={{
            color: BRAND.text, fontSize: 48, fontWeight: 900, fontFamily: MONO_FAMILY,
            letterSpacing: '0.08em',
          }}>SIGNUMHQ.COM</span>
        </div>
      </div>

      {/* Loop hint: Reappearing faint red Call Wall near the end */}
      {frame >= 100 && (
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          bottom: 150, height: 4, background: BRAND.coral,
          opacity: interpolate(frame, [100, 129], [0, 0.45]),
          boxShadow: `0 0 20px ${BRAND.coralGlow}`,
          zIndex: Z.data,
        }} />
      )}
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPOSITION ENTRYPOINT (V28)
// ═════════════════════════════════════════════════════════════════════════════
export const MarketPressureBriefV28: React.FC<MarketPressureBriefV28Props> = ({ captions, disclaimer }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: '#040710', overflow: 'hidden' }}>
      {/* 1. Premium living terminal background */}
      <LivingTerminalBackground sceneName="v28-terminal" />

      {/* 2. Scene Sequences */}
      {/* Scene 01: Event Shock Hook (0.0s to 2.0s, 60f) */}
      <Sequence from={0} durationInFrames={S(2.0)}>
        <Scene01_EventShock />
      </Sequence>

      {/* Scene 02: What normal charts miss (2.0s to 4.5s, 75f) */}
      <Sequence from={S(2.0)} durationInFrames={S(2.5)}>
        <ContinuousTransformChart frame={frame - S(2.0)} scene="scene2" />
      </Sequence>

      {/* Scene 03: 1.3% Tension pressure gap (4.5s to 7.2s, 81f) */}
      <Sequence from={S(4.5)} durationInFrames={S(2.7)}>
        <ContinuousTransformChart frame={frame - S(4.5)} scene="scene3" />
      </Sequence>

      {/* Scene 04: Risk structure waterfall map (7.2s to 10.0s, 84f) */}
      <Sequence from={S(7.2)} durationInFrames={S(2.8)}>
        <ContinuousTransformChart frame={frame - S(7.2)} scene="scene4" />
      </Sequence>

      {/* Scene 05: Product Unlock scanner layer (10.0s to 14.2s, 126f) */}
      <Sequence from={S(10.0)} durationInFrames={S(4.2)}>
        <ContinuousTransformChart frame={frame - S(10.0)} scene="scene5" />
      </Sequence>

      {/* Scene 06: Outro Brand CTA lockup (14.2s to 18.5s, 129f) */}
      <Sequence from={S(14.2)} durationInFrames={S(4.3)}>
        <Scene06_CTA />
      </Sequence>

      {/* 3. Captions Overlay centered inside safe zones */}
      <SafeCaptionOverlay captions={captions} frame={frame} />

      {/* 4. Legal Compliance Footer (Scenes 02 to 06) */}
      <Sequence from={S(2.0)} durationInFrames={S(16.5)}>
        <ComplianceFooter text={disclaimer} />
      </Sequence>

      {/* 5. Continuous Audio mix to pass silencedetect */}
      <AudioEngine />

      {/* 6. High-end terminal progress progress line */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 8,
        background: 'rgba(255,255,255,0.03)', zIndex: Z.progress,
      }}>
        <div style={{
          height: '100%',
          width: `${(frame / durationInFrames) * 100}%`,
          background: BRAND.gradientCyanPurple,
          boxShadow: `0 0 12px ${BRAND.cyan}`,
        }} />
      </div>
    </AbsoluteFill>
  );
};

export default MarketPressureBriefV28;
