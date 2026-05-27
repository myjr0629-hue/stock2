// ============================================================================
// MarketPressureBrief V31 — Event Shock + Product Desire Rebuild
// ============================================================================
// "An institutional flow event just appeared near SPY's hidden wall"
// Rebuilt for maximum visual impact, immediate Hook Shock, and emotional payoffs.
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

export type MarketPressureBriefV31Props = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

const MONO_FAMILY = "'JetBrains Mono', 'SF Mono', monospace";

// ─── Procedural Layer: Slow Moving Candlestick Trace (Layer 3) ──────────────────
const ScrollingBackgroundChart: React.FC<{ opacity?: number }> = ({ opacity = 0.18 }) => {
  const frame = useCurrentFrame();
  const scrollOffset = (frame * 1.3) % 2400; // fast drifting
  return (
    <div style={{
      position: 'absolute', inset: 0, opacity, transform: `translateX(-${scrollOffset}px)`,
      display: 'flex', alignItems: 'center', gap: 60, pointerEvents: 'none', zIndex: Z.grid - 1,
    }}>
      {Array.from({ length: 50 }).map((_, i) => {
        const h = 120 + Math.sin(i * 0.5) * 180 + Math.cos(i * 0.25) * 80;
        const color = i % 2 === 0 ? BRAND.cyan : BRAND.coral;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 2, height: h * 0.35, background: color }} />
            <div style={{ width: 12, height: h * 0.65, background: color, borderRadius: 2, boxShadow: `0 0 10px ${color}55` }} />
            <div style={{ width: 2, height: h * 0.25, background: color }} />
          </div>
        );
      })}
    </div>
  );
};

// ─── Procedural Layer: Breathing Volume Profile Overlay (Layer 4) ───────────
const VolumeProfileOverlay: React.FC<{ opacity?: number }> = ({ opacity = 0.20 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{
      position: 'absolute', left: 40, top: 200, bottom: 200, width: 240,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      pointerEvents: 'none', zIndex: Z.grid - 1, opacity
    }}>
      {Array.from({ length: 20 }).map((_, i) => {
        const baseW = 60 + Math.sin(i * 0.8) * 110 + Math.cos(i * 0.4) * 50;
        const pulse = Math.sin(frame * 0.07 + i) * 15;
        const w = Math.max(20, baseW + pulse);
        const color = i % 3 === 0 ? BRAND.coral : BRAND.cyan;
        return (
          <div key={i} style={{
            height: 16, width: w, background: color,
            borderRadius: '0 4px 4px 0', borderRight: `2px solid ${color}`,
            boxShadow: `0 0 15px ${color}44`
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
      fontFamily: MONO_FAMILY, fontSize: 13, color: 'rgba(34,211,238,0.40)',
      textShadow: '0 0 8px rgba(34,211,238,0.20)'
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
  const glowIntensity = 0.75 + Math.sin(frame * 0.08) * 0.15;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: Z.bg + 1 }}>
      {/* Call Wall Red Glow Zone */}
      <div style={{
        position: 'absolute', top: 350, left: 80, right: 80, height: 500,
        background: 'radial-gradient(circle, rgba(248,113,113,0.15) 0%, transparent 70%)',
        opacity: glowIntensity,
      }} />
      {/* Cyan Price Glow Zone */}
      <div style={{
        position: 'absolute', bottom: 300, left: 150, width: 750, height: 750,
        background: 'radial-gradient(circle, rgba(34,211,238,0.10) 0%, transparent 70%)',
        opacity: glowIntensity,
      }} />
    </div>
  );
};

// ─── Premium Living Terminal Background System (L0-L8 Combined) ────────────────
const LivingTerminalBackground: React.FC<{ sceneName?: string }> = ({ sceneName = 'default' }) => {
  const frame = useCurrentFrame();

  const gridX = (frame * 0.25) % 120;
  const gridY = (frame * 0.35) % 120;

  // L8 — Film grain noise seed mapping (2.5% animation grain)
  const grainSeed = Math.floor(random(`grain-${sceneName}-${frame}`) * 1000);
  const grainTx = (random(`grain-tx-${frame}`) - 0.5) * 3;
  const grainTy = (random(`grain-ty-${frame}`) - 0.5) * 3;

  return (
    <AbsoluteFill style={{ background: '#020409', overflow: 'hidden', zIndex: Z.bg }}>
      {/* L1 — Deep navy gradient base */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 135% 95% at 50% 35%, #04091a 0%, #010204 80%),
          radial-gradient(ellipse 115% 75% at 15% 85%, #050c1f 0%, transparent 65%),
          linear-gradient(180deg, #010204 0%, #04091a 35%, #050c1f 65%, #010204 100%)
        `,
        zIndex: Z.bg,
      }} />

      {/* L2 — Drifting Grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          radial-gradient(rgba(34, 211, 238, 0.15) 1.5px, transparent 1.5px),
          radial-gradient(rgba(34, 211, 238, 0.06) 1px, transparent 1px)
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
        background: 'radial-gradient(ellipse 75% 60% at 50% 45%, transparent 0%, rgba(0,0,0,0.90) 100%)',
        zIndex: Z.glows + 1,
        pointerEvents: 'none',
      }} />

      {/* L8 — Film Grain */}
      <div style={{
        position: 'absolute', inset: 0,
        zIndex: Z.glows + 2,
        pointerEvents: 'none',
        opacity: 0.04, // 4% high density grain
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
        border: '1.5px solid rgba(34, 211, 238, 0.15)',
        pointerEvents: 'none', zIndex: Z.grid + 2,
      }}>
        <div style={{ position: 'absolute', top: -5, left: -5, width: 20, height: 20, borderTop: '3px solid rgba(34,211,238,0.6)', borderLeft: '3px solid rgba(34,211,238,0.6)' }} />
        <div style={{ position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderTop: '3px solid rgba(34,211,238,0.6)', borderRight: '3px solid rgba(34,211,238,0.6)' }} />
        <div style={{ position: 'absolute', bottom: -5, left: -5, width: 20, height: 20, borderBottom: '3px solid rgba(34,211,238,0.6)', borderLeft: '3px solid rgba(34,211,238,0.6)' }} />
        <div style={{ position: 'absolute', bottom: -5, right: -5, width: 20, height: 20, borderBottom: '3px solid rgba(34,211,238,0.6)', borderRight: '3px solid rgba(34,211,238,0.6)' }} />

        <div style={{ position: 'absolute', top: 8, left: 12, color: 'rgba(34,211,238,0.6)', fontSize: 13, fontFamily: MONO_FAMILY, fontWeight: 700, letterSpacing: '0.05em' }}>SYS: ACTIVE</div>
        <div style={{ position: 'absolute', top: 8, right: 12, color: 'rgba(34,211,238,0.6)', fontSize: 13, fontFamily: MONO_FAMILY, fontWeight: 700, letterSpacing: '0.05em' }}>NET: LIVE_STRM</div>
        <div style={{ position: 'absolute', bottom: 8, left: 12, color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: MONO_FAMILY }}>[SCALE: 9:16 CBR MASTER]</div>
        <div style={{ position: 'absolute', bottom: 8, right: 12, color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: MONO_FAMILY }}>[MODE: EVENT_SHOCK]</div>
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
        position: 'absolute', top: 520, bottom: 700, left: x, width: 8,
        background: `linear-gradient(180deg, transparent 0%, ${color} 20%, #ffffff 50%, ${color} 80%, transparent 100%)`,
        boxShadow: `0 0 ${glow}px ${color}, 0 0 ${glow * 1.5}px ${color}, inset 0 0 10px #ffffff`,
        zIndex: Z.data + 5, pointerEvents: 'none', opacity: 0.95,
      }} />
    );
  }
  
  const y = interpolate(progress, [0, 1], [520, 1220]);
  return (
    <div style={{
      position: 'absolute', left: 80, right: 80, top: y, height: 8,
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
        const progress = ((frame * (0.025 + random(i) * 0.035) * speedFactor) + random(i + 5)) % 1.0;
        const y = interpolate(progress, [0, 1], [Math.abs(endY - startY), 0]);
        const op = interpolate(progress, [0, 0.2, 0.8, 1], [0, 0.95, 0.95, 0]);
        const sz = 6 + random(i + 2) * 16;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y, width: sz, height: sz,
            borderRadius: '50%', background: color, opacity: op,
            boxShadow: `0 0 ${sz * 3}px ${color}, 0 0 ${sz * 1.5}px ${color}`,
          }} />
        );
      })}
    </div>
  );
};

// ─── Phrase-Level Safe Caption Overlay ──────────────────────────────────────
const SafeCaptionOverlay: React.FC<{ captions: CaptionSegment[]; frame: number }> = ({ captions, frame }) => {
  // Disable captions during Scene 06 CTA (frame >= S(13.6))
  if (frame >= S(13.6)) return null;

  if (!captions || captions.length === 0) return null;

  const activeCaption = captions.find(c => frame >= c.startFrame && frame < c.endFrame);
  if (!activeCaption) return null;

  const isScene01 = frame < S(2.2);
  const targetY = isScene01 ? 1410 : 380;
  
  const isNotTheWall = activeCaption.text === 'NOT THE WALL.';
  const isPressureMap = activeCaption.text === 'THIS IS A PRESSURE MAP';
  const isYouCantSee = activeCaption.text === "YOU CAN'T SEE";
  
  let fontSize = isScene01 ? 34 : (activeCaption.emphasis ? 72 : 58);
  let color = activeCaption.color || (activeCaption.emphasis ? BRAND.cyan : BRAND.text);
  let textShadow = '0 2px 15px rgba(0,0,0,0.95), 0 0 30px rgba(0,0,0,0.85)';
  
  if (isNotTheWall) {
    fontSize = 96;
    color = BRAND.coral;
    textShadow = `0 0 45px ${BRAND.coralGlow}, 0 2px 10px rgba(0,0,0,0.95)`;
  } else if (isPressureMap) {
    fontSize = 84;
    color = BRAND.cyan;
    textShadow = `0 0 50px ${BRAND.cyanGlow}, 0 2px 10px rgba(0,0,0,0.95)`;
  } else if (isYouCantSee) {
    fontSize = 90;
    color = BRAND.amber;
    textShadow = `0 0 40px ${BRAND.amberGlow}, 0 2px 10px rgba(0,0,0,0.95)`;
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
    {/* Continuous backing audio bed to bridge any silence gaps */}
    <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.42} startFrom={0} endAt={S(18.5)} />
    <Sequence from={S(0.0)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.65} /></Sequence>
    <Sequence from={S(2.2)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.5} /></Sequence>
    <Sequence from={S(4.2)}><Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.7} /></Sequence>
    <Sequence from={S(6.8)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.65} /></Sequence>
    <Sequence from={S(9.2)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.5} /></Sequence>
    <Sequence from={S(13.6)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.5} /></Sequence>
  </>
);

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 01: EVENT SHOCK (0.0s - 2.2s, 66f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene01_EventShock: React.FC = () => {
  const frame = useCurrentFrame();
  const wallY = 600;
  const priceY = 820;

  // Warning flashing indicators
  const decryptGlow = Math.sin(frame * 0.4) > 0 ? BRAND.coral : BRAND.cyan;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      {/* Top Live Feed Strip */}
      <AlertTopBar ticker="SPY" price={592.31} alertText="LIVE | SPY | INSTITUTIONAL FLOW DETECTED" />
      <div style={{
        position: 'absolute', top: 40, right: LAYOUT.safeR, zIndex: Z.hookText + 5,
        fontFamily: MONO_FAMILY, fontSize: 13, fontWeight: 900, color: decryptGlow,
        textShadow: `0 0 10px ${decryptGlow}`, display: 'flex', alignItems: 'center', gap: 6
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: decryptGlow, display: 'inline-block' }} />
        [EVENT_SHOCK]
      </div>

      {/* --- ELIMINATE STATIC DASHBOARD CARD: MERGE DATA AS BOLD INTEL EVENT --- */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 60, left: LAYOUT.safeL, right: LAYOUT.safeR,
        display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: Z.hookText,
      }}>
        {/* Massive 160px Hero Text for immediate hook shock */}
        <div style={{
          fontSize: 180, fontWeight: 900, fontFamily: MONO_FAMILY, color: BRAND.text,
          textAlign: 'center', lineHeight: 0.9, textShadow: `0 0 50px rgba(255,255,255,0.4), ${SHADOW.hero}`,
          letterSpacing: '-0.04em'
        }}>
          $420M
        </div>
        <div style={{
          fontSize: 38, fontWeight: 900, fontFamily: MONO_FAMILY, color: BRAND.cyan,
          textAlign: 'center', marginTop: 10, letterSpacing: '0.12em', textShadow: SHADOW.cyan
        }}>
          OFF-EXCHANGE FLOW
        </div>

        {/* Supporting Secondary Badge */}
        <div style={{
          fontFamily: MONO_FAMILY, fontSize: 18, color: '#03050c', background: BRAND.amber,
          padding: '6px 16px', borderRadius: 4, fontWeight: 900, marginTop: 15,
          boxShadow: `0 0 20px ${BRAND.amberGlow}`
        }}>
          91st %ILE EVENT
        </div>
      </div>

      {/* High-density visual map already exposed in the middle/lower half */}
      <div style={{
        position: 'absolute', top: 520, bottom: 700, left: LAYOUT.safeL, right: LAYOUT.safeR,
        border: '2px solid rgba(34,211,238,0.4)', borderRadius: 12,
        background: 'rgba(3,6,12,0.85)', overflow: 'hidden',
        boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
        zIndex: Z.data,
      }}>
        {/* Horizontal grid lines */}
        <div style={{ position: 'absolute', top: 80, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.15)' }} />
        <div style={{ position: 'absolute', top: 240, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.15)' }} />
        <div style={{ position: 'absolute', top: 400, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.15)' }} />

        {/* Visible glowing price vector curve */}
        <svg width="960" height="700" style={{ position: 'absolute', top: -520, left: 0 }}>
          <path d={`M 80,${priceY + 120} Q 400,${priceY - 80} 600,${priceY} T 960,${priceY - 30}`} fill="none" stroke={BRAND.cyan} strokeWidth="6" />
        </svg>

        {/* Pulsing price dot */}
        <div style={{
          position: 'absolute', left: 600 - 18, top: (priceY - 520) - 18, width: 36, height: 36,
          borderRadius: '50%', background: BRAND.cyan,
          boxShadow: `0 0 35px ${BRAND.cyanGlow}, 0 0 10px #ffffff`, zIndex: Z.data + 2,
        }} />

        {/* Red Call WallResistance Line */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: wallY - 520, height: 8, background: BRAND.coral,
          boxShadow: `0 0 55px ${BRAND.coralGlow}, 0 0 15px ${BRAND.coral}`,
        }} />
        <div style={{
          position: 'absolute', right: 20, top: (wallY - 520) - 34,
          color: BRAND.coral, fontSize: 22, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: SHADOW.coral,
        }}>[CALL RESISTANCE $600.00]</div>

        {/* Compress gap bracket */}
        <div style={{ position: 'absolute', left: 740, top: wallY - 520, height: priceY - wallY }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: BRAND.amber, boxShadow: `0 0 25px ${BRAND.amberGlow}` }} />
          <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: BRAND.amber }} />
          <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: BRAND.amber }} />
        </div>
        <div style={{
          position: 'absolute', left: 765, top: (wallY - 520) + 70,
          color: BRAND.amber, fontSize: 32, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: SHADOW.amber
        }}>
          1.3% GAP
        </div>

        {/* Particles actively migrating */}
        <FlowParticles startY={wallY - 520} endY={priceY - 520} count={16} speedFactor={1.5} />
      </div>

      {/* Highly active Neon Volume Histogram in the lower safe area */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 180, left: LAYOUT.safeL, right: LAYOUT.safeR, height: 110,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', zIndex: Z.data,
      }}>
        {Array.from({ length: 32 }).map((_, i) => {
          const h = 25 + Math.sin(frame * 0.15 + i) * 60 + Math.cos(frame * 0.1 - i) * 25;
          return (
            <div key={i} style={{
              width: 14, height: Math.max(10, h), background: BRAND.cyan,
              borderRadius: '4px 4px 0 0',
              boxShadow: `0 0 15px ${BRAND.cyanGlow}, 0 0 5px ${BRAND.cyan}`
            }} />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── CONTINUOUS TRANSFORMING PRICE CHART (SCENES 02 - 05) ────────────────────
const ContinuousTransformChart: React.FC<{ frame: number; scene: 'scene2' | 'scene3' | 'scene4' | 'scene5' }> = ({ frame, scene }) => {
  const chartTop = 520;
  const chartBottom = 1220;
  const chartHeight = chartBottom - chartTop;

  // Key structures coordinates
  const callWallY = chartTop + 80;    // Y=600
  const gammaFlipY = chartTop + 400;  // Y=920
  const putFloorY = chartTop + 630;   // Y=1150

  // Price position
  let activePriceY = chartTop + 300;
  if (scene === 'scene2') {
    activePriceY = chartTop + 380;
  } else if (scene === 'scene3') {
    activePriceY = interpolate(frame, [0, S(2.6)], [chartTop + 380, chartTop + 160], { extrapolateRight: 'clamp' });
  } else if (scene === 'scene4') {
    activePriceY = chartTop + 160;
  } else if (scene === 'scene5') {
    activePriceY = chartTop + 220;
  }

  const bracketH = Math.max(20, activePriceY - callWallY);

  // --- Dynamic zooming mechanics for Scene 03 to dramatize the 1.3% moment ---
  let containerTransform = 'scale(1) translate(0px, 0px)';
  if (scene === 'scene3') {
    const zoomProgress = spring({
      frame,
      fps: 30,
      config: { damping: 13, mass: 0.75, stiffness: 100 }
    });
    const scale = interpolate(zoomProgress, [0, 1], [1, 1.45]); // extreme focus
    const translateY = interpolate(zoomProgress, [0, 1], [0, -75]);
    containerTransform = `scale(${scale}) translateY(${translateY}px)`;
  } else if (scene === 'scene4' || scene === 'scene5') {
    containerTransform = 'scale(1.18) translateY(-25px)'; // hold the premium unmasked state
  }

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      {/* Container outline with dynamic zooming transform */}
      <div style={{
        position: 'absolute', left: 80, right: 80, top: chartTop, height: chartHeight,
        border: '2px solid rgba(34,211,238,0.4)', borderRadius: 12,
        background: 'rgba(3,6,12,0.85)', overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
        transform: containerTransform,
        transition: 'transform 0.15s ease-out'
      }}>
        {/* Horizontal grid lines */}
        <div style={{ position: 'absolute', top: 80, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.15)' }} />
        <div style={{ position: 'absolute', top: 240, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.15)' }} />
        <div style={{ position: 'absolute', top: 400, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.15)' }} />
        <div style={{ position: 'absolute', top: 560, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.15)' }} />

        {/* Faint candlesticks inside grid */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.32, display: 'flex', alignItems: 'center', justifyContent: 'space-around', pointerEvents: 'none' }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 2, height: 50, background: BRAND.mutedLight }} />
              <div style={{ width: 10, height: 90, background: BRAND.mutedLight, opacity: 0.5, borderRadius: 2 }} />
              <div style={{ width: 2, height: 30, background: BRAND.mutedLight }} />
            </div>
          ))}
        </div>
      </div>

      {/* Structured elements inside zoomed container */}
      <div style={{ transform: containerTransform, position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {/* Scene 02: Normal Chart Contrast */}
        {scene === 'scene2' && (() => {
          const sweepProgress = interpolate(frame, [0, S(2.0)], [0, 1], { extrapolateRight: 'clamp' });
          const sweepY = interpolate(sweepProgress, [0, 1], [chartTop, chartBottom]);
          const callWallOpacity = interpolate(sweepY, [callWallY, callWallY + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

          return (
            <>
              {/* Dim price path */}
              <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: Z.data }}>
                <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="4" />
              </svg>

              {/* Vertical Sweep Scanner Line */}
              <ScannerLine progress={sweepProgress} />

              {/* Red Call Wall line fades in as scanner passes */}
              <div style={{ zIndex: Z.data, opacity: callWallOpacity }}>
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
                  boxShadow: `0 0 55px ${BRAND.coralGlow}, 0 0 15px ${BRAND.coral}`,
                }} />
                <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: BRAND.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: SHADOW.coral }}>
                  [CALL WALL $600.00]
                </div>
                
                {/* 1.3% Gap bracket shows */}
                <div style={{ position: 'absolute', left: 740, top: callWallY, height: activePriceY - callWallY, zIndex: Z.data }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: BRAND.amber, boxShadow: `0 0 25px ${BRAND.amberGlow}` }} />
                  <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: BRAND.amber }} />
                  <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: BRAND.amber }} />
                </div>
              </div>
            </>
          );
        })()}

        {/* Scene 03: The Gap Tension Zoom */}
        {scene === 'scene3' && (() => {
          const glowPulse = 35 + Math.sin(frame * 0.25) * 25;
          
          return (
            <>
              <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: Z.data }}>
                <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="5" />
              </svg>

              {/* Red Call Resistance Wall */}
              <div style={{
                position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
                boxShadow: `0 0 60px ${BRAND.coralGlow}, 0 0 20px ${BRAND.coral}`, zIndex: Z.data,
              }} />
              <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: BRAND.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: SHADOW.coral, zIndex: Z.data }}>
                [CALL WALL $600.00]
              </div>

              {/* Glowing pulsing price dot */}
              <div style={{
                position: 'absolute', left: 600 - 18, top: activePriceY - 18, width: 36, height: 36,
                borderRadius: '50%', background: BRAND.cyan,
                boxShadow: `0 0 ${glowPulse}px ${BRAND.cyanGlow}, 0 0 12px #ffffff`, zIndex: Z.data + 2,
              }} />

              {/* Bracket compression */}
              <div style={{ position: 'absolute', left: 740, top: callWallY, height: bracketH, zIndex: Z.data }}>
                <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: BRAND.amber, boxShadow: `0 0 35px ${BRAND.amberGlow}` }} />
                <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: BRAND.amber }} />
                <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: BRAND.amber }} />
              </div>

              {/* Particles getting pulled into the gap rapidly */}
              <FlowParticles startY={callWallY} endY={activePriceY} count={28} speedFactor={1.9} />

              {/* Dynamic 1.3% locking counter */}
              <div style={{
                position: 'absolute', left: 140, top: callWallY + 30, zIndex: Z.hookText,
                transform: `scale(${1.25 + Math.sin(frame * 0.1) * 0.06})`
              }}>
                <CountUpNumber
                  target={1.3} prefix="" suffix="%"
                  fontSize={180} color={BRAND.amber} duration={1} delay={0}
                  textShadow={SHADOW.amber}
                  formatFn={(n: number) => (1.3).toFixed(1)}
                />
              </div>
            </>
          );
        })()}

        {/* Scene 04: Structured activation layers */}
        {scene === 'scene4' && (() => {
          const gammaFlipOpacity = interpolate(frame, [S(0.4), S(0.8)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const putFloorOpacity = interpolate(frame, [S(0.8), S(1.2)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const flowClusterOpacity = interpolate(frame, [S(1.2), S(1.6)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

          return (
            <>
              <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.6, zIndex: Z.data }}>
                <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke={BRAND.cyan} strokeWidth="5" />
              </svg>

              {/* Call Wall (always visible) */}
              <div style={{ zIndex: Z.data }}>
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
                  boxShadow: `0 0 55px ${BRAND.coralGlow}, 0 0 15px ${BRAND.coral}`,
                }} />
                <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: BRAND.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: SHADOW.coral }}>
                  [CALL WALL $600.00]
                </div>
              </div>

              {/* Gamma Flip reveals */}
              <div style={{ zIndex: Z.data, opacity: gammaFlipOpacity }}>
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: gammaFlipY, height: 6,
                  background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 16px, transparent 16px, transparent 32px)`,
                  boxShadow: `0 0 35px ${BRAND.purpleGlow}, 0 0 10px ${BRAND.purple}`,
                }} />
                <div style={{ position: 'absolute', right: 100, top: gammaFlipY - 32, color: BRAND.purple, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: SHADOW.purple }}>
                  [GAMMA FLIP $588.00]
                </div>
              </div>

              {/* Put Floor reveals */}
              <div style={{ zIndex: Z.data, opacity: putFloorOpacity }}>
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: putFloorY, height: 8, background: BRAND.emerald,
                  boxShadow: `0 0 45px ${BRAND.emerald}, 0 0 12px ${BRAND.emerald}80`,
                }} />
                <div style={{ position: 'absolute', right: 100, top: putFloorY - 32, color: BRAND.emerald, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: `0 0 10px ${BRAND.emerald}` }}>
                  [PUT FLOOR $580.00]
                </div>
              </div>

              {/* Flow Cluster reveals */}
              <div style={{
                position: 'absolute', left: 120, top: gammaFlipY + 40, zIndex: Z.data + 3,
                fontFamily: MONO_FAMILY, fontSize: 14, fontWeight: 900, color: BRAND.cyan,
                background: 'rgba(3,6,12,0.92)', border: `1.5px solid ${BRAND.cyan}`,
                padding: '6px 12px', borderRadius: 4, opacity: flowClusterOpacity,
                boxShadow: `0 0 20px ${BRAND.cyanGlow}`
              }}>
                [FLOW CLUSTER: INSTITUTIONAL CONVERGENCE]
              </div>

              <FlowParticles startY={callWallY} endY={gammaFlipY} count={16} frameOffset={60} />
            </>
          );
        })()}

        {/* Scene 05: Product Unlock Sweep */}
        {scene === 'scene5' && (() => {
          const sweepProgress = interpolate(frame, [S(0.2), S(2.5)], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });

          return (
            <>
              {/* Horizontal scanner sweep line */}
              <ScannerLine progress={sweepProgress} direction="horizontal" />

              {/* Price path unmasking */}
              <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: Z.data }}>
                <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none"
                  stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
                <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none"
                  stroke={BRAND.cyan} strokeWidth="6" style={{ opacity: sweepProgress }} />
              </svg>

              {/* Unmasked Call Wall */}
              <div style={{ zIndex: Z.data, opacity: sweepProgress }}>
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
                  boxShadow: `0 0 55px ${BRAND.coralGlow}, 0 0 15px ${BRAND.coral}`,
                }} />
                <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: BRAND.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: SHADOW.coral }}>
                  [CALL WALL $600.00]
                </div>
              </div>

              {/* Unmasked Gamma Flip */}
              <div style={{ zIndex: Z.data, opacity: sweepProgress }}>
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: gammaFlipY, height: 6,
                  background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 16px, transparent 16px, transparent 32px)`,
                  boxShadow: `0 0 35px ${BRAND.purpleGlow}, 0 0 10px ${BRAND.purple}`,
                }} />
                <div style={{ position: 'absolute', right: 100, top: gammaFlipY - 32, color: BRAND.purple, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: SHADOW.purple }}>
                  [GAMMA FLIP $588.00]
                </div>
              </div>

              {/* Unmasked Put Floor */}
              <div style={{ zIndex: Z.data, opacity: sweepProgress }}>
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: putFloorY, height: 8, background: BRAND.emerald,
                  boxShadow: `0 0 45px ${BRAND.emerald}, 0 0 12px ${BRAND.emerald}80`,
                }} />
                <div style={{ position: 'absolute', right: 100, top: putFloorY - 32, color: BRAND.emerald, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: `0 0 10px ${BRAND.emerald}` }}>
                  [PUT FLOOR $580.00]
                </div>
              </div>

              {/* 1.3% bracket unmasked */}
              <div style={{ position: 'absolute', left: 740, top: callWallY, height: activePriceY - callWallY, zIndex: Z.data, opacity: sweepProgress }}>
                <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: BRAND.amber, boxShadow: `0 0 30px ${BRAND.amberGlow}` }} />
                <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: BRAND.amber }} />
                <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: BRAND.amber }} />
              </div>

              <FlowParticles startY={callWallY} endY={gammaFlipY} count={24} frameOffset={120} />
            </>
          );
        })()}
      </div>

      {/* Faint coordinates */}
      <div style={{
        position: 'absolute', bottom: 15, left: 100, right: 100,
        display: 'flex', justifyContent: 'space-between', zIndex: Z.data + 2,
        fontFamily: MONO_FAMILY, fontSize: 13, color: BRAND.mutedLight,
      }}>
        <span>SYSTEM_COORDINATE: MAPPED</span>
        <span>INDEX: SPY $592.31</span>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 06: CTA WITH LOOP HOOK (13.6s to end) ─────────────────────────────
const Scene06_CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const currentFrameAbsolute = frame + S(13.6);
  
  const breathe = 0.96 + Math.sin(frame * 0.05) * 0.04;

  // Outro Loop Hint: Fades in Call Wall & $420M ghost pulse at the final 15 frames (0.5s)
  const isLoopWindow = currentFrameAbsolute >= (durationInFrames - 15);
  const loopOpacity = isLoopWindow 
    ? interpolate(currentFrameAbsolute, [durationInFrames - 15, durationInFrames - 1], [0, 0.85], { extrapolateRight: 'clamp' })
    : 0;

  return (
    <AbsoluteFill style={{ zIndex: Z.hookText }}>
      {/* High density vector line */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: '32%', height: 3,
        background: `linear-gradient(90deg, transparent, ${BRAND.cyan}, transparent)`,
        opacity: 0.40, zIndex: Z.grid,
      }} />

      {/* Vector Logo - zero overlap */}
      <div style={{
        position: 'absolute', top: 300, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', zIndex: Z.brand,
      }}>
        <svg width="240" height="240" viewBox="246 247 530 530" fill="none" style={{ transform: `scale(${breathe})` }}>
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.cyan} />
        </svg>
      </div>

      {/* Brand Label */}
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

      {/* Single domain box - no clutter */}
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
          background: 'rgba(3,6,12,0.95)',
          boxShadow: `0 0 45px rgba(34,211,238,0.40)`,
        }}>
          <span style={{
            color: BRAND.text, fontSize: 48, fontWeight: 900, fontFamily: MONO_FAMILY,
            letterSpacing: '0.08em',
          }}>SIGNUMHQ.COM</span>
        </div>
      </div>

      {/* --- LOOP MECHANISM GHOST PULSES (Final 15 frames) --- */}
      {isLoopWindow && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: Z.data - 1, pointerEvents: 'none',
          opacity: loopOpacity, transition: 'opacity 0.05s ease-out'
        }}>
          {/* Faint Red Call Wall Resistance Line */}
          <div style={{
            position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
            top: 600, height: 6, background: BRAND.coral,
            boxShadow: `0 0 35px ${BRAND.coralGlow}, 0 0 10px ${BRAND.coral}`,
          }} />
          
          {/* Faint $420M Ghost Pulse in middle zone */}
          <div style={{
            position: 'absolute', top: 320, left: 0, right: 0,
            fontSize: 160, fontWeight: 900, fontFamily: MONO_FAMILY,
            color: 'rgba(255,255,255,0.08)', textAlign: 'center',
            letterSpacing: '-0.04em', textShadow: '0 0 25px rgba(255,255,255,0.05)'
          }}>
            $420M
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ─── MAIN COMPOSITION ENTRYPOINT (V31) ───────────────────────────────────────
export const MarketPressureBriefV31: React.FC<MarketPressureBriefV31Props> = ({ captions, disclaimer }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: '#020409', overflow: 'hidden' }}>
      {/* 1. Living terminal background system */}
      <LivingTerminalBackground sceneName="v31-terminal-depth" />

      {/* 2. Scene Sequences */}
      {/* Scene 01: Event Shock First Frame (0.0s to 2.2s, 66f) */}
      <Sequence from={0} durationInFrames={S(2.2)}>
        <Scene01_EventShock />
      </Sequence>

      {/* Scene 02: Normal Chart Contrast (2.2s to 4.2s, 60f) */}
      <Sequence from={S(2.2)} durationInFrames={S(2.0)}>
        <ContinuousTransformChart frame={frame - S(2.2)} scene="scene2" />
      </Sequence>

      {/* Scene 03: Gap Tension Dynamic Zoom (4.2s to 6.8s, 78f) */}
      <Sequence from={S(4.2)} durationInFrames={S(2.6)}>
        <ContinuousTransformChart frame={frame - S(4.2)} scene="scene3" />
      </Sequence>

      {/* Scene 04: Structured risk maps (6.8s to 9.2s, 72f) */}
      <Sequence from={S(6.8)} durationInFrames={S(2.4)}>
        <ContinuousTransformChart frame={frame - S(6.8)} scene="scene4" />
      </Sequence>

      {/* Scene 05: Product Unlock Scanner Sweep (9.2s to 13.6s, 132f) */}
      <Sequence from={S(9.2)} durationInFrames={S(4.4)}>
        <ContinuousTransformChart frame={frame - S(9.2)} scene="scene5" />
      </Sequence>

      {/* Scene 06: Outro Brand CTA + Loop (13.6s to 18.5s, 147f) */}
      <Sequence from={S(13.6)} durationInFrames={S(4.9)}>
        <Scene06_CTA />
      </Sequence>

      {/* 3. Safe Caption Overlay */}
      <SafeCaptionOverlay captions={captions} frame={frame} />

      {/* 4. Legal Compliance Footer (Scenes 02 to 06) */}
      <Sequence from={S(2.2)} durationInFrames={S(16.3)}>
        <ComplianceFooter text={disclaimer} />
      </Sequence>

      {/* 5. Continuous Audio Engine */}
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

export default MarketPressureBriefV31;
