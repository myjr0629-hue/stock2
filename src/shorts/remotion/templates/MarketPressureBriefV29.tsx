// ============================================================================
// MarketPressureBrief V29 — Premium Intelligence Revenue Cut
// ============================================================================
// "Bloomberg Terminal meets Apple keynote meets intelligence leak"
// Rebuilt with high visual density, physical urgency, and pristine brand CTA.
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

export type MarketPressureBriefV29Props = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

const MONO_FAMILY = "'JetBrains Mono', 'SF Mono', monospace";

// ─── Procedural Layer: Slow Moving Candlestick Trace (Layer 3) ──────────────────
const ScrollingBackgroundChart: React.FC = () => {
  const frame = useCurrentFrame();
  const scrollOffset = (frame * 0.9) % 2400; // slightly faster drift
  return (
    <div style={{
      position: 'absolute', inset: 0, opacity: 0.08, transform: `translateX(-${scrollOffset}px)`,
      display: 'flex', alignItems: 'center', gap: 60, pointerEvents: 'none', zIndex: Z.grid - 1,
    }}>
      {Array.from({ length: 50 }).map((_, i) => {
        const h = 100 + Math.sin(i * 0.5) * 160 + Math.cos(i * 0.2) * 60;
        const color = i % 2 === 0 ? BRAND.cyan : BRAND.coral;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 1.5, height: h * 0.35, background: color }} />
            <div style={{ width: 10, height: h * 0.65, background: color, borderRadius: 1.5 }} />
            <div style={{ width: 1.5, height: h * 0.25, background: color }} />
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
      position: 'absolute', left: 40, top: 250, bottom: 250, width: 220,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      pointerEvents: 'none', zIndex: Z.grid - 1, opacity: 0.08
    }}>
      {Array.from({ length: 18 }).map((_, i) => {
        const baseW = 50 + Math.sin(i * 0.8) * 90 + Math.cos(i * 0.3) * 40;
        const pulse = Math.sin(frame * 0.05 + i) * 12;
        const w = Math.max(15, baseW + pulse);
        const color = i % 3 === 0 ? BRAND.coral : BRAND.cyan;
        return (
          <div key={i} style={{
            height: 14, width: w, background: color,
            borderRadius: '0 4px 4px 0', borderRight: `1.5px solid ${color}`,
            boxShadow: `0 0 10px ${color}1a`
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
      fontFamily: MONO_FAMILY, fontSize: 12, color: 'rgba(34,211,238,0.28)',
      textShadow: '0 0 5px rgba(34,211,238,0.1)'
    }}>
      <div style={{ position: 'absolute', top: 120, left: 20 }}>SYS_TRCK_SIG: 0x992B</div>
      <div style={{ position: 'absolute', top: 145, left: 20 }}>FLOW_STATE: {Math.sin(frame * 0.05) > 0 ? 'ACTIVE_FEED' : 'SECURE_LINK'}</div>
      <div style={{ position: 'absolute', bottom: 240, left: 20 }}>LIMIT_BND: 600.00 / 580.00</div>
      <div style={{ position: 'absolute', bottom: 265, left: 20 }}>DELTA_EXPOSURE: +0.421%</div>
      <div style={{ position: 'absolute', top: 480, right: 20 }}>GAMMA_VAL: 1.25M</div>
      <div style={{ position: 'absolute', top: 505, right: 20 }}>REGIME: NEG_GEX</div>
      <div style={{ position: 'absolute', top: 720, left: 20 }}>FEED_LATENCY: 1.2ms</div>
      <div style={{ position: 'absolute', top: 745, left: 20 }}>SEC_HASH: SHA256//SIG</div>
    </div>
  );
};

// ─── Procedural Layer: Soft active cyan/red glow zones (Layer 6) ─────────────
const GlowZones: React.FC = () => {
  const frame = useCurrentFrame();
  const glowIntensity = 0.6 + Math.sin(frame * 0.09) * 0.15;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: Z.bg + 1 }}>
      {/* Call Wall Red Glow Zone */}
      <div style={{
        position: 'absolute', top: 380, left: 80, right: 80, height: 450,
        background: 'radial-gradient(circle, rgba(248,113,113,0.08) 0%, transparent 70%)',
        opacity: glowIntensity,
      }} />
      {/* Cyan Price Glow Zone */}
      <div style={{
        position: 'absolute', bottom: 350, left: 150, width: 700, height: 700,
        background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)',
        opacity: glowIntensity,
      }} />
    </div>
  );
};

// ─── Premium Living Terminal Background System (L0-L8 Combined) ────────────────
const LivingTerminalBackground: React.FC<{ sceneName?: string }> = ({ sceneName = 'default' }) => {
  const frame = useCurrentFrame();

  // Slow horizontal and vertical drifting grid position
  const gridX = (frame * 0.18) % 120;
  const gridY = (frame * 0.28) % 120;

  // L8 — Film grain noise seed mapping
  const grainSeed = Math.floor(random(`grain-${sceneName}-${frame}`) * 1000);
  const grainTx = (random(`grain-tx-${frame}`) - 0.5) * 3;
  const grainTy = (random(`grain-ty-${frame}`) - 0.5) * 3;

  return (
    <AbsoluteFill style={{ background: '#03050c', overflow: 'hidden', zIndex: Z.bg }}>
      {/* L1 — Deep navy gradient base */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 130% 90% at 50% 35%, #050b18 0%, #010307 75%),
          radial-gradient(ellipse 110% 70% at 20% 80%, #070e1c 0%, transparent 60%),
          linear-gradient(180deg, #010307 0%, #050b18 35%, #070e1c 65%, #010307 100%)
        `,
        zIndex: Z.bg,
      }} />

      {/* L2 — Drifting Grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          radial-gradient(rgba(34, 211, 238, 0.08) 1.5px, transparent 1.5px),
          radial-gradient(rgba(34, 211, 238, 0.04) 1px, transparent 1px)
        `,
        backgroundSize: '80px 80px, 20px 20px',
        backgroundPosition: `${gridX}px ${gridY}px, ${gridX}px ${gridY}px`,
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
        background: 'radial-gradient(ellipse 70% 55% at 50% 45%, transparent 0%, rgba(0,0,0,0.8) 100%)',
        zIndex: Z.glows + 1,
        pointerEvents: 'none',
      }} />

      {/* L8 — Film Grain */}
      <div style={{
        position: 'absolute', inset: 0,
        zIndex: Z.glows + 2,
        pointerEvents: 'none',
        opacity: 0.03, // 3% opacity for high density oled
        transform: `translate(${grainTx}px, ${grainTy}px)`,
      }}>
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <filter id={`grain-${sceneName}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" seed={grainSeed} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#grain-${sceneName})`} />
        </svg>
      </div>

      {/* Institutional borders with corner crosshairs */}
      <div style={{
        position: 'absolute', inset: 30,
        border: '1.5px solid rgba(34, 211, 238, 0.08)',
        pointerEvents: 'none', zIndex: Z.grid + 2,
      }}>
        <div style={{ position: 'absolute', top: -5, left: -5, width: 16, height: 16, borderTop: '2.5px solid rgba(34,211,238,0.4)', borderLeft: '2.5px solid rgba(34,211,238,0.4)' }} />
        <div style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderTop: '2.5px solid rgba(34,211,238,0.4)', borderRight: '2.5px solid rgba(34,211,238,0.4)' }} />
        <div style={{ position: 'absolute', bottom: -5, left: -5, width: 16, height: 16, borderBottom: '2.5px solid rgba(34,211,238,0.4)', borderLeft: '2.5px solid rgba(34,211,238,0.4)' }} />
        <div style={{ position: 'absolute', bottom: -5, right: -5, width: 16, height: 16, borderBottom: '2.5px solid rgba(34,211,238,0.4)', borderRight: '2.5px solid rgba(34,211,238,0.4)' }} />

        <div style={{ position: 'absolute', top: 8, left: 12, color: 'rgba(34,211,238,0.4)', fontSize: 13, fontFamily: MONO_FAMILY, fontWeight: 700, letterSpacing: '0.05em' }}>SYS: ACTIVE</div>
        <div style={{ position: 'absolute', top: 8, right: 12, color: 'rgba(34,211,238,0.4)', fontSize: 13, fontFamily: MONO_FAMILY, fontWeight: 700, letterSpacing: '0.05em' }}>NET: LIVE_STRM</div>
        <div style={{ position: 'absolute', bottom: 8, left: 12, color: 'rgba(255,255,255,0.2)', fontSize: 12, fontFamily: MONO_FAMILY }}>[SCALE: 9:16 ENHANCED]</div>
        <div style={{ position: 'absolute', bottom: 8, right: 12, color: 'rgba(255,255,255,0.2)', fontSize: 12, fontFamily: MONO_FAMILY }}>[MODE: INTEL_FLOW]</div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Technical Scanner Line ─────────────────────────────────────────
const ScannerLine: React.FC<{ progress: number; glow?: number; color?: string; direction?: 'vertical' | 'horizontal' }> = ({ progress, glow = 100, color = BRAND.cyan, direction = 'vertical' }) => {
  if (direction === 'horizontal') {
    const x = interpolate(progress, [0, 1], [80, 1000]);
    return (
      <div style={{
        position: 'absolute', top: 520, bottom: 700, left: x, width: 6,
        background: `linear-gradient(180deg, transparent 0%, ${color} 20%, #ffffff 50%, ${color} 80%, transparent 100%)`,
        boxShadow: `0 0 ${glow}px ${color}, 0 0 ${glow * 1.5}px ${color}, inset 0 0 10px #ffffff`,
        zIndex: Z.data + 5, pointerEvents: 'none', opacity: 0.95,
      }} />
    );
  }
  
  const y = interpolate(progress, [0, 1], [520, 1220]);
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
  startY: number; endY: number; count?: number; color?: string; frameOffset?: number; speedFactor?: number;
}> = ({ startY, endY, count = 12, color = BRAND.cyan, frameOffset = 0, speedFactor = 1.0 }) => {
  const frame = useCurrentFrame() + frameOffset;
  return (
    <div style={{ position: 'absolute', left: 80, right: 80, top: Math.min(startY, endY), height: Math.abs(endY - startY), pointerEvents: 'none', zIndex: Z.wallViz - 1 }}>
      {Array.from({ length: count }).map((_, i) => {
        const x = 120 + random(i) * 680;
        const progress = ((frame * (0.02 + random(i) * 0.025) * speedFactor) + random(i + 5)) % 1.0;
        // Reversed y to make particles flow UPWARD toward the Call Wall structure (startY)
        const y = interpolate(progress, [0, 1], [Math.abs(endY - startY), 0]);
        const op = interpolate(progress, [0, 0.2, 0.8, 1], [0, 0.8, 0.8, 0]);
        const sz = 6 + random(i + 2) * 14;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y, width: sz, height: sz,
            borderRadius: '50%', background: color, opacity: op,
            boxShadow: `0 0 ${sz * 2.5}px ${color}`,
          }} />
        );
      })}
    </div>
  );
};

// ─── Phrase-Level Safe Caption Overlay ──────────────────────────────────────
const SafeCaptionOverlay: React.FC<{ captions: CaptionSegment[]; frame: number }> = ({ captions, frame }) => {
  // Disable captions during Scene 06 CTA (frame >= S(14.8)) to prevent overlapping with brand elements
  if (frame >= S(14.8)) return null;

  if (!captions || captions.length === 0) return null;

  const activeCaption = captions.find(c => frame >= c.startFrame && frame < c.endFrame);
  if (!activeCaption) return null;

  const isScene01 = frame < S(2.2);
  const targetY = isScene01 ? 1410 : 380;
  
  // Custom styling rules to satisfy "NOT THE WALL" and "A PRESSURE MAP" high visual impact rules
  const isNotTheWall = activeCaption.text === 'NOT THE WALL.';
  const isAPressureMap = activeCaption.text === 'A PRESSURE MAP.';
  const isYouCantSee = activeCaption.text === "YOU CAN'T SEE";
  
  let fontSize = isScene01 ? 32 : (activeCaption.emphasis ? 72 : 58);
  let color = activeCaption.color || (activeCaption.emphasis ? BRAND.cyan : BRAND.text);
  let textShadow = '0 2px 15px rgba(0,0,0,0.95), 0 0 30px rgba(0,0,0,0.85)';
  
  if (isNotTheWall) {
    fontSize = 96; // Massive visual weight
    color = BRAND.coral; // Bright warning red/coral
    textShadow = `0 0 40px ${BRAND.coralGlow}, 0 2px 10px rgba(0,0,0,0.95)`;
  } else if (isAPressureMap) {
    fontSize = 96; // Massive hero text
    color = BRAND.cyan; // Bright glowing cyan
    textShadow = `0 0 45px ${BRAND.cyanGlow}, 0 2px 10px rgba(0,0,0,0.95)`;
  } else if (isYouCantSee) {
    fontSize = 90;
    color = BRAND.amber;
    textShadow = `0 0 35px ${BRAND.amberGlow}, 0 2px 10px rgba(0,0,0,0.95)`;
  }

  return (
    <div style={{
      position: 'absolute', left: 70, right: 70, top: targetY,
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: Z.caption, pointerEvents: 'none',
    }}>
      <div style={{
        fontFamily: isScene01 ? MONO_FAMILY : "'Outfit', 'Montserrat', 'SF Pro Display', sans-serif",
        fontWeight: 900,
        fontSize,
        color,
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: isScene01 ? '0.08em' : '-0.01em',
        lineHeight: 1.1,
        textShadow,
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
    <Sequence from={S(0.0)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.65} /></Sequence>
    <Sequence from={S(2.2)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.5} /></Sequence>
    <Sequence from={S(4.8)}><Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.6} /></Sequence>
    <Sequence from={S(7.4)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.65} /></Sequence>
    <Sequence from={S(10.2)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.5} /></Sequence>
    <Sequence from={S(14.8)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.5} /></Sequence>
  </>
);

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 01: EVENT ALERT (0.0s - 2.2s, 66f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene01_EventShock: React.FC = () => {
  const frame = useCurrentFrame();
  const wallY = 1200;
  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      {/* Top alert bar */}
      <AlertTopBar ticker="SPY" price={592.31} alertText="LIVE | SPY 592.31 | OFF-EXCHANGE FLOW DETECTED" />

      {/* Red Call Wall line */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 8, background: BRAND.coral,
        boxShadow: `0 0 50px ${BRAND.coralGlow}`, zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 32,
        color: BRAND.coral, fontSize: 24, fontWeight: 900, fontFamily: MONO_FAMILY,
        textShadow: SHADOW.coral, zIndex: Z.data, letterSpacing: '0.05em',
      }}>[CALL WALL $600.00]</div>

      {/* HERO CARD ( Bloomberg alerts look-and-feel ) */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 60, left: LAYOUT.safeL, right: LAYOUT.safeR,
        display: 'flex', flexDirection: 'column', gap: 16, zIndex: Z.hookText,
      }}>
        <GlassCard color="rgba(34,211,238,0.18)" padding="26px" bracket={true}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: MONO_FAMILY, fontSize: 22, fontWeight: 900, color: BRAND.cyan, letterSpacing: '0.05em' }}>SPY LIQUIDITY ALERT</span>
            <span style={{ fontFamily: MONO_FAMILY, fontSize: 16, color: BRAND.amber, border: `1.5px solid ${BRAND.amber}`, padding: '4px 10px', borderRadius: 4, fontWeight: 900 }}>91st %ILE FLOW</span>
          </div>
          <div style={{ marginTop: 16, fontSize: 116, fontWeight: 900, fontFamily: MONO_FAMILY, color: BRAND.text, textAlign: 'center', lineHeight: 1, textShadow: SHADOW.cyan }}>
            $420M
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, fontFamily: MONO_FAMILY, color: BRAND.cyan, textAlign: 'center', marginTop: 8, letterSpacing: '0.06em' }}>
            OFF-EXCHANGE FLOW
          </div>
        </GlassCard>
      </div>

      {/* Active High-density Mini Chart for Lower Half (Eliminates empty space) */}
      <div style={{
        position: 'absolute', top: 780, left: LAYOUT.safeL, right: LAYOUT.safeR, height: 350,
        border: '2px solid rgba(34,211,238,0.22)', borderRadius: 12,
        background: 'rgba(4,7,16,0.6)', overflow: 'hidden',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        zIndex: Z.data,
      }}>
        {/* Horizontal grid lines inside the mini-chart */}
        <div style={{ position: 'absolute', top: 90, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.1)' }} />
        <div style={{ position: 'absolute', top: 180, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.1)' }} />
        <div style={{ position: 'absolute', top: 270, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.1)' }} />

        {/* Mini running price path vector */}
        <svg width="960" height="350" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.35 }}>
          <path d="M 0,230 Q 150,130 300,190 T 600,110 T 960,170" fill="none" stroke={BRAND.cyan} strokeWidth="4" />
        </svg>

        {/* Pulse trails in the mini-chart */}
        <FlowParticles startY={350} endY={110} count={8} speedFactor={1.5} />

        {/* pulsing histogram bars */}
        <div style={{
          position: 'absolute', bottom: 15, left: 20, right: 20, height: 75,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', opacity: 0.28
        }}>
          {Array.from({ length: 24 }).map((_, i) => {
            const h = 15 + Math.sin(frame * 0.09 + i) * 35 + Math.cos(frame * 0.05 - i) * 20;
            return (
              <div key={i} style={{
                width: 16, height: Math.max(5, h), background: BRAND.cyan,
                borderRadius: '2px 2px 0 0',
                boxShadow: `0 0 10px ${BRAND.cyanGlow}`
              }} />
            );
          })}
        </div>

        {/* Status indicator texts inside the mini-panel */}
        <div style={{ position: 'absolute', top: 16, left: 20, fontFamily: MONO_FAMILY, fontSize: 13, color: BRAND.cyan, fontWeight: 900 }}>
          [TERM_FEED: ACTIVE_REALTIME_DEPTH]
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// CONTINUOUS TRANSFORMING PRICE CHART (SCENES 02 - 05)
// ═════════════════════════════════════════════════════════════════════════════
const ContinuousTransformChart: React.FC<{ frame: number; scene: 'scene2' | 'scene3' | 'scene4' | 'scene5' }> = ({ frame, scene }) => {
  const chartTop = 520;
  const chartBottom = 1220;
  const chartHeight = chartBottom - chartTop;

  // Key visual structures coordinates
  const callWallY = chartTop + 80;    // Y=600
  const gammaFlipY = chartTop + 400;  // Y=920
  const putFloorY = chartTop + 630;   // Y=1150

  // Dynamic price position
  // Scene 02: Dim baseline price line
  // Scene 03: Price dot pushes towards the Call Wall: goes from Y=900 down to Y=680
  let activePriceY = chartTop + 400; // default
  if (scene === 'scene2') {
    activePriceY = chartTop + 380;
  } else if (scene === 'scene3') {
    activePriceY = interpolate(frame, [0, S(2.6)], [chartTop + 380, chartTop + 160], { extrapolateRight: 'clamp' });
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
        border: '2px solid rgba(34,211,238,0.22)', borderRadius: 12,
        background: 'rgba(4,7,16,0.6)', overflow: 'hidden',
        boxShadow: '0 15px 40px rgba(0,0,0,0.6)'
      }}>
        {/* Horizontal grids */}
        <div style={{ position: 'absolute', top: 80, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.08)' }} />
        <div style={{ position: 'absolute', top: 240, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.08)' }} />
        <div style={{ position: 'absolute', top: 400, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.08)' }} />
        <div style={{ position: 'absolute', top: 560, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.08)' }} />

        {/* Visual density background candlesticks inside grid */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.15, display: 'flex', alignItems: 'center', justifyContent: 'space-around', pointerEvents: 'none' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 1, height: 40, background: BRAND.mutedLight }} />
              <div style={{ width: 6, height: 80, background: BRAND.mutedLight, opacity: 0.4 }} />
              <div style={{ width: 1, height: 20, background: BRAND.mutedLight }} />
            </div>
          ))}
        </div>
      </div>

      {/* --- Render Scene-based logic over the SAME structure --- */}

      {/* Scene 02: Scanner Reveal Call Wall */}
      {scene === 'scene2' && (() => {
        // Scanner Line sweep progress mapping
        const sweepProgress = interpolate(frame, [0, S(2.2)], [0, 1], { extrapolateRight: 'clamp' });
        const sweepY = interpolate(sweepProgress, [0, 1], [chartTop, chartBottom]);
        
        // Dynamically unmask Call Wall as the scanner passes it
        const callWallOpacity = interpolate(sweepY, [callWallY, callWallY + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

        return (
          <>
            {/* Price curve (always visible but dim in standard view) */}
            <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: Z.data }}>
              <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
            </svg>

            {/* Scanner Line passing */}
            <ScannerLine progress={sweepProgress} />

            {/* Red Call Wall dynamically fading in as scanner passes */}
            <div style={{ zIndex: Z.data, opacity: callWallOpacity }}>
              <div style={{
                position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
                boxShadow: `0 0 45px ${BRAND.coralGlow}`,
              }} />
              <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: BRAND.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900 }}>
                [CALL WALL $600.00]
              </div>
              
              {/* 1.3% Gap bracket turns on */}
              <div style={{ position: 'absolute', left: 740, top: callWallY, height: activePriceY - callWallY, zIndex: Z.data }}>
                <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: BRAND.amber, boxShadow: `0 0 20px ${BRAND.amberGlow}` }} />
                <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: BRAND.amber }} />
                <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: BRAND.amber }} />
              </div>
            </div>
          </>
        );
      })()}

      {/* Scene 03: Gap tension pushes dot, particles move towards gap */}
      {scene === 'scene3' && (() => {
        // Dynamic push indicator glow
        const glowPulse = 30 + Math.sin(frame * 0.15) * 15;
        
        return (
          <>
            {/* Price curve matching moving price spot */}
            <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: Z.data }}>
              <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
            </svg>

            {/* Call Wall Red resistance */}
            <div style={{
              position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
              boxShadow: `0 0 55px ${BRAND.coralGlow}`, zIndex: Z.data,
            }} />
            <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: BRAND.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, zIndex: Z.data }}>
              [CALL RESISTANCE $600.00]
            </div>

            {/* Glowing Price Dot (Cyan) */}
            <div style={{
              position: 'absolute', left: 600 - 14, top: activePriceY - 14, width: 28, height: 28,
              borderRadius: '50%', background: BRAND.cyan,
              boxShadow: `0 0 ${glowPulse}px ${BRAND.cyanGlow}, 0 0 10px #ffffff`, zIndex: Z.data + 2,
            }} />

            {/* Gap bracket compresses */}
            <div style={{ position: 'absolute', left: 740, top: callWallY, height: bracketH, zIndex: Z.data }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: BRAND.amber, boxShadow: `0 0 25px ${BRAND.amberGlow}` }} />
              <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: BRAND.amber }} />
              <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: BRAND.amber }} />
            </div>

            {/* Flow Particles moving towards red wall gap */}
            <FlowParticles startY={callWallY} endY={activePriceY} count={20} speedFactor={1.4} />

            {/* Massive 1.3% Hero context inside chart space */}
            <div style={{
              position: 'absolute', left: 160, top: callWallY + 45, zIndex: Z.hookText,
              transform: `scale(${1 + Math.sin(frame * 0.08) * 0.03})`
            }}>
              <CountUpNumber
                target={1.3} prefix="" suffix="%"
                fontSize={160} color={BRAND.amber} duration={1} delay={0}
                textShadow={SHADOW.amber}
                formatFn={(n: number) => (1.3).toFixed(1)}
              />
            </div>
          </>
        );
      })()}

      {/* Scene 04: Sequential reveal of Call Wall, Gamma Flip, and Put Floor */}
      {scene === 'scene4' && (() => {
        // Smooth fade-in and scaling animations for sequential levels
        const gammaFlipOpacity = interpolate(frame, [S(0.6), S(1.1)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const gammaFlipScale = interpolate(gammaFlipOpacity, [0, 1], [0.96, 1]);

        const putFloorOpacity = interpolate(frame, [S(1.2), S(1.7)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const putFloorScale = interpolate(putFloorOpacity, [0, 1], [0.96, 1]);

        return (
          <>
            {/* Base price path */}
            <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.45, zIndex: Z.data }}>
              <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke={BRAND.cyan} strokeWidth="3" />
            </svg>

            {/* Sequential Layers */}
            {/* 1. Call Wall (0.0s+) */}
            <div style={{ zIndex: Z.data }}>
              <div style={{
                position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
                boxShadow: `0 0 50px ${BRAND.coralGlow}`,
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
                boxShadow: `0 0 30px ${BRAND.purpleGlow}`,
              }} />
              <div style={{ position: 'absolute', right: 100, top: gammaFlipY - 32, color: BRAND.purple, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900 }}>
                [GAMMA FLIP $588.00]
              </div>
            </div>

            {/* 3. Put Floor (1.2s+ with smooth unmasking) */}
            <div style={{ zIndex: Z.data, opacity: putFloorOpacity, transform: `scaleX(${putFloorScale})` }}>
              <div style={{
                position: 'absolute', left: 80, right: 80, top: putFloorY, height: 8, background: BRAND.emerald,
                boxShadow: `0 0 40px ${BRAND.emerald}`,
              }} />
              <div style={{ position: 'absolute', right: 100, top: putFloorY - 32, color: BRAND.emerald, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900 }}>
                [PUT FLOOR $580.00]
              </div>
            </div>

            {frame >= S(0.6) && (
              <FlowParticles startY={callWallY} endY={gammaFlipY} count={12} frameOffset={60} />
            )}
          </>
        );
      })()}

      {/* Scene 05: scanner sweep unmasks full SignumHQ layers */}
      {scene === 'scene5' && (() => {
        // Horizontal scanner sweep from left to right (satisfies: Product Unlock left to right sweep)
        const sweepProgress = interpolate(frame, [S(0.2), S(2.5)], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
        const sweepX = interpolate(sweepProgress, [0, 1], [80, 1000]);

        // Unmask structure elements dynamically as the vertical scanner line passes horizontally
        const callWallOpacity = interpolate(sweepX, [callWallY - 200, callWallY + 200], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const gammaFlipOpacity = interpolate(sweepX, [gammaFlipY - 200, gammaFlipY + 200], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const putFloorOpacity = interpolate(sweepX, [putFloorY - 200, putFloorY + 200], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

        return (
          <>
            {/* Horizontal sweep scanner line */}
            <ScannerLine progress={sweepProgress} direction="horizontal" />

            {/* Price path unmasking smoothly */}
            <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: Z.data }}>
              {/* Dim price feed always visible */}
              <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none"
                stroke="rgba(255,255,255,0.18)" strokeWidth="4" />
              
              {/* Glowing price feed fades in as scanner passes */}
              <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none"
                stroke={BRAND.cyan} strokeWidth="5" style={{ opacity: sweepProgress }} />
            </svg>

            {/* Unmasked Call Wall */}
            <div style={{ zIndex: Z.data, opacity: sweepProgress }}>
              <div style={{
                position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
                boxShadow: `0 0 50px ${BRAND.coralGlow}`,
              }} />
              <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: BRAND.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900 }}>
                [CALL RESISTANCE $600.00]
              </div>
            </div>

            {/* Unmasked Gamma Flip */}
            <div style={{ zIndex: Z.data, opacity: sweepProgress }}>
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
            <div style={{ zIndex: Z.data, opacity: sweepProgress }}>
              <div style={{
                position: 'absolute', left: 80, right: 80, top: putFloorY, height: 8, background: BRAND.emerald,
                boxShadow: `0 0 40px ${BRAND.emerald}`,
              }} />
              <div style={{ position: 'absolute', right: 100, top: putFloorY - 32, color: BRAND.emerald, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900 }}>
                [PUT SUPPORT FLOOR $580.00]
              </div>
            </div>

            {sweepProgress > 0.4 && (
              <FlowParticles startY={callWallY} endY={gammaFlipY} count={16} frameOffset={120} />
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
// SCENE 06: BRAND CTA LOCKUP (14.8s - 18.5s, 111f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene06_CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const breathe = 0.96 + Math.sin(frame * 0.05) * 0.04;

  return (
    <AbsoluteFill style={{ zIndex: Z.hookText }}>
      {/* High density vector background overlay */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: '32%', height: 2.5,
        background: `linear-gradient(90deg, transparent, ${BRAND.cyan}, transparent)`,
        opacity: 0.3, zIndex: Z.grid,
      }} />

      {/* Vector Logo - elegant, zero overlap */}
      <div style={{
        position: 'absolute', top: 300, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', zIndex: Z.brand,
      }}>
        <svg width="240" height="240" viewBox="246 247 530 530" fill="none" style={{ transform: `scale(${breathe})` }}>
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.cyan} />
        </svg>
      </div>

      {/* Brand & Tagline lockup */}
      <div style={{
        position: 'absolute', top: 600, left: LAYOUT.safeL, right: LAYOUT.safeR,
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
          borderColor: BRAND.cyan,
          borderStyle: 'solid',
          borderWidth: '2.5px',
          padding: '18px 56px',
          borderRadius: 8,
          background: 'rgba(4,7,16,0.92)',
          boxShadow: `0 0 45px rgba(34,211,238,0.35)`,
        }}>
          <span style={{
            color: BRAND.text, fontSize: 48, fontWeight: 900, fontFamily: MONO_FAMILY,
            letterSpacing: '0.08em',
          }}>SIGNUMHQ.COM</span>
        </div>
      </div>

      {/* Optional Loop Hint: reappearing faint red Call Wall at the bottom */}
      {frame >= 95 && (
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          bottom: 150, height: 4, background: BRAND.coral,
          opacity: interpolate(frame, [95, 111], [0, 0.5]),
          boxShadow: `0 0 20px ${BRAND.coralGlow}`,
          zIndex: Z.data,
        }} />
      )}
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPOSITION ENTRYPOINT (V29)
// ═════════════════════════════════════════════════════════════════════════════
export const MarketPressureBriefV29: React.FC<MarketPressureBriefV29Props> = ({ captions, disclaimer }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: '#03050c', overflow: 'hidden' }}>
      {/* 1. Premium living terminal background */}
      <LivingTerminalBackground sceneName="v29-terminal" />

      {/* 2. Scene Sequences */}
      {/* Scene 01: Event Shock Hook (0.0s to 2.2s, 66f) */}
      <Sequence from={0} durationInFrames={S(2.2)}>
        <Scene01_EventShock />
      </Sequence>

      {/* Scene 02: What normal charts miss (2.2s to 4.8s, 78f) */}
      <Sequence from={S(2.2)} durationInFrames={S(2.6)}>
        <ContinuousTransformChart frame={frame - S(2.2)} scene="scene2" />
      </Sequence>

      {/* Scene 03: 1.3% Tension pressure gap (4.8s to 7.4s, 78f) */}
      <Sequence from={S(4.8)} durationInFrames={S(2.6)}>
        <ContinuousTransformChart frame={frame - S(4.8)} scene="scene3" />
      </Sequence>

      {/* Scene 04: Risk structure waterfall map (7.4s to 10.2s, 84f) */}
      <Sequence from={S(7.4)} durationInFrames={S(2.8)}>
        <ContinuousTransformChart frame={frame - S(7.4)} scene="scene4" />
      </Sequence>

      {/* Scene 05: Product Unlock scanner layer (10.2s to 14.8s, 138f) */}
      <Sequence from={S(10.2)} durationInFrames={S(4.6)}>
        <ContinuousTransformChart frame={frame - S(10.2)} scene="scene5" />
      </Sequence>

      {/* Scene 06: Outro Brand CTA lockup (14.8s to 18.5s, 111f) */}
      <Sequence from={S(14.8)} durationInFrames={S(3.7)}>
        <Scene06_CTA />
      </Sequence>

      {/* 3. Captions Overlay centered inside safe zones */}
      <SafeCaptionOverlay captions={captions} frame={frame} />

      {/* 4. Legal Compliance Footer (Scenes 02 to 06) */}
      <Sequence from={S(2.2)} durationInFrames={S(16.3)}>
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

export default MarketPressureBriefV29;
