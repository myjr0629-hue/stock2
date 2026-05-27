// ============================================================================
// MarketPressureBrief V30 — Intelligence Leak Revenue Cut
// ============================================================================
// "Someone just exposed institutional flow near a hidden SPY level"
// Rebuilt with extreme visual density, physical zooming mechanics, and dramatics.
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

export type MarketPressureBriefV30Props = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

const MONO_FAMILY = "'JetBrains Mono', 'SF Mono', monospace";

// ─── Procedural Layer: Slow Moving Candlestick Trace (Layer 3) ──────────────────
const ScrollingBackgroundChart: React.FC<{ opacity?: number }> = ({ opacity = 0.16 }) => {
  const frame = useCurrentFrame();
  const scrollOffset = (frame * 1.1) % 2400; // slightly faster drift
  return (
    <div style={{
      position: 'absolute', inset: 0, opacity, transform: `translateX(-${scrollOffset}px)`,
      display: 'flex', alignItems: 'center', gap: 60, pointerEvents: 'none', zIndex: Z.grid - 1,
    }}>
      {Array.from({ length: 50 }).map((_, i) => {
        const h = 100 + Math.sin(i * 0.5) * 160 + Math.cos(i * 0.2) * 60;
        const color = i % 2 === 0 ? BRAND.cyan : BRAND.coral;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 1.5, height: h * 0.35, background: color }} />
            <div style={{ width: 10, height: h * 0.65, background: color, borderRadius: 1.5, boxShadow: `0 0 8px ${color}40` }} />
            <div style={{ width: 1.5, height: h * 0.25, background: color }} />
          </div>
        );
      })}
    </div>
  );
};

// ─── Procedural Layer: Breathing Volume Profile Overlay (Layer 4) ───────────
const VolumeProfileOverlay: React.FC<{ opacity?: number }> = ({ opacity = 0.16 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{
      position: 'absolute', left: 40, top: 250, bottom: 250, width: 220,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      pointerEvents: 'none', zIndex: Z.grid - 1, opacity
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
            boxShadow: `0 0 12px ${color}33`
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
      fontFamily: MONO_FAMILY, fontSize: 12, color: 'rgba(34,211,238,0.35)',
      textShadow: '0 0 6px rgba(34,211,238,0.15)'
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
  const glowIntensity = 0.7 + Math.sin(frame * 0.09) * 0.18;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: Z.bg + 1 }}>
      {/* Call Wall Red Glow Zone */}
      <div style={{
        position: 'absolute', top: 380, left: 80, right: 80, height: 450,
        background: 'radial-gradient(circle, rgba(248,113,113,0.12) 0%, transparent 70%)',
        opacity: glowIntensity,
      }} />
      {/* Cyan Price Glow Zone */}
      <div style={{
        position: 'absolute', bottom: 350, left: 150, width: 700, height: 700,
        background: 'radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 70%)',
        opacity: glowIntensity,
      }} />
    </div>
  );
};

// ─── Premium Living Terminal Background System (L0-L8 Combined) ────────────────
const LivingTerminalBackground: React.FC<{ sceneName?: string }> = ({ sceneName = 'default' }) => {
  const frame = useCurrentFrame();

  // Slow horizontal and vertical drifting grid position
  const gridX = (frame * 0.22) % 120;
  const gridY = (frame * 0.32) % 120;

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
          radial-gradient(rgba(34, 211, 238, 0.12) 1.5px, transparent 1.5px),
          radial-gradient(rgba(34, 211, 238, 0.05) 1px, transparent 1px)
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
        background: 'radial-gradient(ellipse 70% 55% at 50% 45%, transparent 0%, rgba(0,0,0,0.85) 100%)',
        zIndex: Z.glows + 1,
        pointerEvents: 'none',
      }} />

      {/* L8 — Film Grain */}
      <div style={{
        position: 'absolute', inset: 0,
        zIndex: Z.glows + 2,
        pointerEvents: 'none',
        opacity: 0.035, // 3.5% opacity for high density oled
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
        border: '1.5px solid rgba(34, 211, 238, 0.12)',
        pointerEvents: 'none', zIndex: Z.grid + 2,
      }}>
        <div style={{ position: 'absolute', top: -5, left: -5, width: 16, height: 16, borderTop: '2.5px solid rgba(34,211,238,0.5)', borderLeft: '2.5px solid rgba(34,211,238,0.5)' }} />
        <div style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderTop: '2.5px solid rgba(34,211,238,0.5)', borderRight: '2.5px solid rgba(34,211,238,0.5)' }} />
        <div style={{ position: 'absolute', bottom: -5, left: -5, width: 16, height: 16, borderBottom: '2.5px solid rgba(34,211,238,0.5)', borderLeft: '2.5px solid rgba(34,211,238,0.5)' }} />
        <div style={{ position: 'absolute', bottom: -5, right: -5, width: 16, height: 16, borderBottom: '2.5px solid rgba(34,211,238,0.5)', borderRight: '2.5px solid rgba(34,211,238,0.5)' }} />

        <div style={{ position: 'absolute', top: 8, left: 12, color: 'rgba(34,211,238,0.5)', fontSize: 13, fontFamily: MONO_FAMILY, fontWeight: 700, letterSpacing: '0.05em' }}>SYS: ACTIVE</div>
        <div style={{ position: 'absolute', top: 8, right: 12, color: 'rgba(34,211,238,0.5)', fontSize: 13, fontFamily: MONO_FAMILY, fontWeight: 700, letterSpacing: '0.05em' }}>NET: LIVE_STRM</div>
        <div style={{ position: 'absolute', bottom: 8, left: 12, color: 'rgba(255,255,255,0.25)', fontSize: 12, fontFamily: MONO_FAMILY }}>[SCALE: 9:16 ENHANCED]</div>
        <div style={{ position: 'absolute', bottom: 8, right: 12, color: 'rgba(255,255,255,0.25)', fontSize: 12, fontFamily: MONO_FAMILY }}>[MODE: INTEL_LEAK]</div>
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
        const progress = ((frame * (0.025 + random(i) * 0.03) * speedFactor) + random(i + 5)) % 1.0;
        // Flow UPWARD toward the Call Wall structure (startY)
        const y = interpolate(progress, [0, 1], [Math.abs(endY - startY), 0]);
        const op = interpolate(progress, [0, 0.2, 0.8, 1], [0, 0.9, 0.9, 0]);
        const sz = 6 + random(i + 2) * 14;
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
  // Disable captions during Scene 06 CTA (frame >= S(13.8))
  if (frame >= S(13.8)) return null;

  if (!captions || captions.length === 0) return null;

  const activeCaption = captions.find(c => frame >= c.startFrame && frame < c.endFrame);
  if (!activeCaption) return null;

  const isScene01 = frame < S(2.0);
  const targetY = isScene01 ? 1410 : 380;
  
  const isNotTheWall = activeCaption.text === 'NOT THE WALL.';
  const isAPressureMap = activeCaption.text === 'A PRESSURE MAP.';
  const isYouCantSee = activeCaption.text === "YOU CAN'T SEE";
  
  let fontSize = isScene01 ? 32 : (activeCaption.emphasis ? 72 : 58);
  let color = activeCaption.color || (activeCaption.emphasis ? BRAND.cyan : BRAND.text);
  let textShadow = '0 2px 15px rgba(0,0,0,0.95), 0 0 30px rgba(0,0,0,0.85)';
  
  if (isNotTheWall) {
    fontSize = 96; // Massive visual weight
    color = BRAND.coral; // Bright warning red/coral
    textShadow = `0 0 45px ${BRAND.coralGlow}, 0 2px 10px rgba(0,0,0,0.95)`;
  } else if (isAPressureMap) {
    fontSize = 96; // Massive hero text
    color = BRAND.cyan; // Bright glowing cyan
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
    <Sequence from={S(2.0)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.5} /></Sequence>
    <Sequence from={S(4.2)}><Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.7} /></Sequence>
    <Sequence from={S(6.8)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.65} /></Sequence>
    <Sequence from={S(9.4)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.5} /></Sequence>
    <Sequence from={S(13.8)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.5} /></Sequence>
  </>
);

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 01: EVENT LEAK (0.0s - 2.0s, 60f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene01_EventLeak: React.FC = () => {
  const frame = useCurrentFrame();
  const wallY = 1200;
  
  // Decrypting glitch pulse
  const decryptGlow = Math.sin(frame * 0.4) > 0 ? BRAND.coral : BRAND.cyan;
  
  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      {/* Top LIVE strip with warning indicators */}
      <AlertTopBar ticker="SPY" price={592.31} alertText="LIVE | SPY | OFF-EXCHANGE FLOW DETECTED" />
      <div style={{
        position: 'absolute', top: 40, right: LAYOUT.safeR, zIndex: Z.hookText + 5,
        fontFamily: MONO_FAMILY, fontSize: 13, fontWeight: 900, color: decryptGlow,
        textShadow: `0 0 10px ${decryptGlow}`, display: 'flex', alignItems: 'center', gap: 6
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: decryptGlow, display: 'inline-block' }} />
        [DECRYPTED_INTEL]
      </div>

      {/* Red Call Wall line is already visible */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 8, background: BRAND.coral,
        boxShadow: `0 0 55px ${BRAND.coralGlow}, 0 0 20px ${BRAND.coral}`, zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 32,
        color: BRAND.coral, fontSize: 24, fontWeight: 900, fontFamily: MONO_FAMILY,
        textShadow: SHADOW.coral, zIndex: Z.data, letterSpacing: '0.05em',
      }}>[CALL WALL $600.00]</div>

      {/* HERO CARD ( Bloomberg alerts style with attached 91st %ILE badge ) */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 60, left: LAYOUT.safeL, right: LAYOUT.safeR,
        display: 'flex', flexDirection: 'column', gap: 16, zIndex: Z.hookText,
      }}>
        <GlassCard color="rgba(34,211,238,0.22)" padding="26px" bracket={true}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: MONO_FAMILY, fontSize: 22, fontWeight: 900, color: BRAND.cyan, letterSpacing: '0.05em' }}>INSTITUTIONAL SPIKE DETECTED</span>
            <span style={{
              fontFamily: MONO_FAMILY, fontSize: 18, color: '#03050c', background: BRAND.amber,
              padding: '6px 12px', borderRadius: 4, fontWeight: 900,
              boxShadow: `0 0 15px ${BRAND.amberGlow}`
            }}>91st %ILE FLOW</span>
          </div>
          <div style={{ marginTop: 20, fontSize: 130, fontWeight: 900, fontFamily: MONO_FAMILY, color: BRAND.text, textAlign: 'center', lineHeight: 1, textShadow: SHADOW.cyan, letterSpacing: '-0.02em' }}>
            $420M
          </div>
          <div style={{ fontSize: 34, fontWeight: 900, fontFamily: MONO_FAMILY, color: BRAND.cyan, textAlign: 'center', marginTop: 10, letterSpacing: '0.08em' }}>
            OFF-EXCHANGE FLOW
          </div>
        </GlassCard>
      </div>

      {/* Active High-density Mini Chart for Lower Half (Eliminates empty space completely) */}
      <div style={{
        position: 'absolute', top: 780, left: LAYOUT.safeL, right: LAYOUT.safeR, height: 350,
        border: '2px solid rgba(34,211,238,0.3)', borderRadius: 12,
        background: 'rgba(4,7,16,0.75)', overflow: 'hidden',
        boxShadow: '0 15px 45px rgba(0,0,0,0.65)',
        zIndex: Z.data,
      }}>
        {/* Horizontal grid lines inside the mini-chart */}
        <div style={{ position: 'absolute', top: 90, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.15)' }} />
        <div style={{ position: 'absolute', top: 180, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.15)' }} />
        <div style={{ position: 'absolute', top: 270, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.15)' }} />

        {/* Mini running price path vector - highly visible */}
        <svg width="960" height="350" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.55 }}>
          <path d="M 0,230 Q 150,130 300,190 T 600,110 T 960,170" fill="none" stroke={BRAND.cyan} strokeWidth="5" />
        </svg>

        {/* Pulse trails in the mini-chart */}
        <FlowParticles startY={350} endY={110} count={12} speedFactor={1.6} />

        {/* Highly visible pulsing volume histogram bars */}
        <div style={{
          position: 'absolute', bottom: 15, left: 20, right: 20, height: 95,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', opacity: 0.45
        }}>
          {Array.from({ length: 28 }).map((_, i) => {
            const h = 20 + Math.sin(frame * 0.12 + i) * 45 + Math.cos(frame * 0.08 - i) * 25;
            return (
              <div key={i} style={{
                width: 13, height: Math.max(8, h), background: BRAND.cyan,
                borderRadius: '3px 3px 0 0',
                boxShadow: `0 0 12px ${BRAND.cyanGlow}, 0 0 4px ${BRAND.cyan}`
              }} />
            );
          })}
        </div>

        {/* Status indicator texts inside the mini-panel */}
        <div style={{ position: 'absolute', top: 16, left: 20, fontFamily: MONO_FAMILY, fontSize: 13, color: BRAND.cyan, fontWeight: 900 }}>
          [TERM_FEED: UNLOCKED_REALTIME_LEVELS]
        </div>
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

  // Dynamic price position
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

  // --- Dynamic zooming mechanics for Scene 03 to dramatize the 1.3% moment ---
  let containerTransform = 'scale(1) translate(0px, 0px)';
  if (scene === 'scene3') {
    // Zoom in slowly over the first 40 frames of Scene 03 and hold it
    const zoomProgress = spring({
      frame,
      fps: 30,
      config: { damping: 14, mass: 0.8, stiffness: 100 }
    });
    const scale = interpolate(zoomProgress, [0, 1], [1, 1.35]);
    const translateY = interpolate(zoomProgress, [0, 1], [0, -60]); // Translate vertically to center the Call Wall Gap
    containerTransform = `scale(${scale}) translateY(${translateY}px)`;
  } else if (scene === 'scene4' || scene === 'scene5') {
    // Hold a persistent high-contrast zoomed state slightly to feel premium
    containerTransform = 'scale(1.15) translateY(-20px)';
  }

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      {/* Container outline with spring scale and translate zooming */}
      <div style={{
        position: 'absolute', left: 80, right: 80, top: chartTop, height: chartHeight,
        border: '2px solid rgba(34,211,238,0.3)', borderRadius: 12,
        background: 'rgba(4,7,16,0.75)', overflow: 'hidden',
        boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
        transform: containerTransform,
        transition: 'transform 0.15s ease-out'
      }}>
        {/* Horizontal grids */}
        <div style={{ position: 'absolute', top: 80, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.15)' }} />
        <div style={{ position: 'absolute', top: 240, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.15)' }} />
        <div style={{ position: 'absolute', top: 400, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.15)' }} />
        <div style={{ position: 'absolute', top: 560, left: 0, right: 0, height: 1, background: 'rgba(34,211,238,0.15)' }} />

        {/* Visual density background candlesticks inside grid - highly distinct */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.28, display: 'flex', alignItems: 'center', justifyContent: 'space-around', pointerEvents: 'none' }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 1.5, height: 40, background: BRAND.mutedLight }} />
              <div style={{ width: 8, height: 80, background: BRAND.mutedLight, opacity: 0.5, borderRadius: 2 }} />
              <div style={{ width: 1.5, height: 20, background: BRAND.mutedLight }} />
            </div>
          ))}
        </div>
      </div>

      {/* --- Render Scene-based logic over the same structure --- */}
      <div style={{ transform: containerTransform, position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {/* Scene 02: Normal Chart Lie & Scanner */}
        {scene === 'scene2' && (() => {
          const sweepProgress = interpolate(frame, [0, S(2.2)], [0, 1], { extrapolateRight: 'clamp' });
          const sweepY = interpolate(sweepProgress, [0, 1], [chartTop, chartBottom]);
          const callWallOpacity = interpolate(sweepY, [callWallY, callWallY + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

          return (
            <>
              {/* Dim price path (normal view) */}
              <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: Z.data }}>
                <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
              </svg>

              {/* Vertical Sweep Scanner Line */}
              <ScannerLine progress={sweepProgress} />

              {/* Red Call Wall line fade-in */}
              <div style={{ zIndex: Z.data, opacity: callWallOpacity }}>
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
                  boxShadow: `0 0 50px ${BRAND.coralGlow}, 0 0 15px ${BRAND.coral}`,
                }} />
                <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: BRAND.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: SHADOW.coral }}>
                  [CALL WALL $600.00]
                </div>
                
                {/* 1.3% Gap bracket turns on */}
                <div style={{ position: 'absolute', left: 740, top: callWallY, height: activePriceY - callWallY, zIndex: Z.data }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: BRAND.amber, boxShadow: `0 0 25px ${BRAND.amberGlow}` }} />
                  <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: BRAND.amber }} />
                  <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: BRAND.amber }} />
                </div>
              </div>
            </>
          );
        })()}

        {/* Scene 03: Zoom tension price gap, pulsing price dot, rapid particles */}
        {scene === 'scene3' && (() => {
          const glowPulse = 35 + Math.sin(frame * 0.2) * 20;
          
          return (
            <>
              {/* Price curve line */}
              <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: Z.data }}>
                <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="4" />
              </svg>

              {/* Call Resistance Red Wall */}
              <div style={{
                position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
                boxShadow: `0 0 60px ${BRAND.coralGlow}, 0 0 20px ${BRAND.coral}`, zIndex: Z.data,
              }} />
              <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: BRAND.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: SHADOW.coral, zIndex: Z.data }}>
                [CALL RESISTANCE $600.00]
              </div>

              {/* Glowing Price Dot (Cyan) */}
              <div style={{
                position: 'absolute', left: 600 - 16, top: activePriceY - 16, width: 32, height: 32,
                borderRadius: '50%', background: BRAND.cyan,
                boxShadow: `0 0 ${glowPulse}px ${BRAND.cyanGlow}, 0 0 12px #ffffff`, zIndex: Z.data + 2,
              }} />

              {/* Compressing Bracket */}
              <div style={{ position: 'absolute', left: 740, top: callWallY, height: bracketH, zIndex: Z.data }}>
                <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: BRAND.amber, boxShadow: `0 0 30px ${BRAND.amberGlow}` }} />
                <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: BRAND.amber }} />
                <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: BRAND.amber }} />
              </div>

              {/* Flow Particles moving towards red wall gap rapidly */}
              <FlowParticles startY={callWallY} endY={activePriceY} count={24} speedFactor={1.7} />

              {/* Massive 1.3% count animation spring-scaled */}
              <div style={{
                position: 'absolute', left: 160, top: callWallY + 45, zIndex: Z.hookText,
                transform: `scale(${1.1 + Math.sin(frame * 0.1) * 0.05})`
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

        {/* Scene 04: Sequential reveal of Call Wall, Gamma Flip, Put Floor, Flow Cluster */}
        {scene === 'scene4' && (() => {
          const gammaFlipOpacity = interpolate(frame, [S(0.5), S(1.0)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const gammaFlipScale = interpolate(gammaFlipOpacity, [0, 1], [0.95, 1]);

          const putFloorOpacity = interpolate(frame, [S(1.0), S(1.5)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const putFloorScale = interpolate(putFloorOpacity, [0, 1], [0.95, 1]);

          const flowClusterOpacity = interpolate(frame, [S(1.5), S(2.0)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

          return (
            <>
              {/* price line path */}
              <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.5, zIndex: Z.data }}>
                <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke={BRAND.cyan} strokeWidth="4" />
              </svg>

              {/* 1. Call Wall (0.0s+) */}
              <div style={{ zIndex: Z.data }}>
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: BRAND.coral,
                  boxShadow: `0 0 55px ${BRAND.coralGlow}, 0 0 15px ${BRAND.coral}`,
                }} />
                <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: BRAND.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: SHADOW.coral }}>
                  [CALL WALL $600.00]
                </div>
              </div>

              {/* 2. Gamma Flip (0.5s+ with smooth spring unmasking) */}
              <div style={{ zIndex: Z.data, opacity: gammaFlipOpacity, transform: `scaleX(${gammaFlipScale})` }}>
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: gammaFlipY, height: 6,
                  background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 16px, transparent 16px, transparent 32px)`,
                  boxShadow: `0 0 35px ${BRAND.purpleGlow}, 0 0 10px ${BRAND.purple}`,
                }} />
                <div style={{ position: 'absolute', right: 100, top: gammaFlipY - 32, color: BRAND.purple, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: SHADOW.purple }}>
                  [GAMMA FLIP $588.00]
                </div>
              </div>

              {/* 3. Put Floor (1.0s+ with smooth spring unmasking) */}
              <div style={{ zIndex: Z.data, opacity: putFloorOpacity, transform: `scaleX(${putFloorScale})` }}>
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: putFloorY, height: 8, background: BRAND.emerald,
                  boxShadow: `0 0 45px ${BRAND.emerald}, 0 0 12px ${BRAND.emerald}80`,
                }} />
                <div style={{ position: 'absolute', right: 100, top: putFloorY - 32, color: BRAND.emerald, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: `0 0 10px ${BRAND.emerald}` }}>
                  [PUT FLOOR $580.00]
                </div>
              </div>

              {/* 4. Flow Cluster telemetry (1.5s+ sequential reveal) */}
              <div style={{
                position: 'absolute', left: 120, top: gammaFlipY + 40, zIndex: Z.data + 3,
                fontFamily: MONO_FAMILY, fontSize: 14, fontWeight: 900, color: BRAND.cyan,
                background: 'rgba(4,7,16,0.9)', border: `1.5px solid ${BRAND.cyan}`,
                padding: '6px 12px', borderRadius: 4, opacity: flowClusterOpacity,
                boxShadow: `0 0 15px ${BRAND.cyanGlow}`
              }}>
                [FLOW CLUSTER: CLUSTERED UPPER LIMIT]
              </div>

              {frame >= S(0.5) && (
                <FlowParticles startY={callWallY} endY={gammaFlipY} count={16} frameOffset={60} />
              )}
            </>
          );
        })()}

        {/* Scene 05: Product Unlock scanner sweep from left-to-right to expose all structures */}
        {scene === 'scene5' && (() => {
          // Horizontal scanner sweep from left to right
          const sweepProgress = interpolate(frame, [S(0.2), S(2.5)], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
          const sweepX = interpolate(sweepProgress, [0, 1], [80, 1000]);

          return (
            <>
              {/* Horizontal scanner sweep line */}
              <ScannerLine progress={sweepProgress} direction="horizontal" />

              {/* Price path unmasking */}
              <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: Z.data }}>
                {/* Dim price feed always visible */}
                <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none"
                  stroke="rgba(255,255,255,0.22)" strokeWidth="4" />
                
                {/* Glowing price feed fades in as scanner passes */}
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
                  [CALL RESISTANCE $600.00]
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
                  [GAMMA STABILITY $588.00]
                </div>
              </div>

              {/* Unmasked Put Floor */}
              <div style={{ zIndex: Z.data, opacity: sweepProgress }}>
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: putFloorY, height: 8, background: BRAND.emerald,
                  boxShadow: `0 0 45px ${BRAND.emerald}, 0 0 12px ${BRAND.emerald}80`,
                }} />
                <div style={{ position: 'absolute', right: 100, top: putFloorY - 32, color: BRAND.emerald, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: `0 0 10px ${BRAND.emerald}` }}>
                  [PUT SUPPORT FLOOR $580.00]
                </div>
              </div>

              {/* 1.3% gap bracket marker unmasked */}
              <div style={{ position: 'absolute', left: 740, top: callWallY, height: activePriceY - callWallY, zIndex: Z.data, opacity: sweepProgress }}>
                <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: BRAND.amber, boxShadow: `0 0 30px ${BRAND.amberGlow}` }} />
                <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: BRAND.amber }} />
                <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: BRAND.amber }} />
              </div>

              {sweepProgress > 0.3 && (
                <FlowParticles startY={callWallY} endY={gammaFlipY} count={20} frameOffset={120} />
              )}
            </>
          );
        })()}
      </div>

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

// ─── SCENE 06: CTA WITH LOOP HOOK (13.8s to end) ─────────────────────────────
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
        opacity: 0.35, zIndex: Z.grid,
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

      {/* Loop Hint: reappearing pulsing red Call Wall line in the final 12 frames */}
      {frame >= 99 && (
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          bottom: 150, height: 5, background: BRAND.coral,
          opacity: interpolate(frame, [99, 111], [0, 0.7]),
          boxShadow: `0 0 25px ${BRAND.coralGlow}, 0 0 10px ${BRAND.coral}`,
          zIndex: Z.data,
        }} />
      )}
    </AbsoluteFill>
  );
};

// ─── MAIN COMPOSITION ENTRYPOINT (V30) ───────────────────────────────────────
export const MarketPressureBriefV30: React.FC<MarketPressureBriefV30Props> = ({ captions, disclaimer }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: '#03050c', overflow: 'hidden' }}>
      {/* 1. Premium living terminal background */}
      <LivingTerminalBackground sceneName="v30-terminal" />

      {/* 2. Scene Sequences */}
      {/* Scene 01: Event Leak Hook (0.0s to 2.0s, 60f) */}
      <Sequence from={0} durationInFrames={S(2.0)}>
        <Scene01_EventLeak />
      </Sequence>

      {/* Scene 02: What normal charts miss (2.0s to 4.2s, 66f) */}
      <Sequence from={S(2.0)} durationInFrames={S(2.2)}>
        <ContinuousTransformChart frame={frame - S(2.0)} scene="scene2" />
      </Sequence>

      {/* Scene 03: 1.3% Tension pressure gap zoom (4.2s to 6.8s, 78f) */}
      <Sequence from={S(4.2)} durationInFrames={S(2.6)}>
        <ContinuousTransformChart frame={frame - S(4.2)} scene="scene3" />
      </Sequence>

      {/* Scene 04: Risk structure waterfall map (6.8s to 9.4s, 78f) */}
      <Sequence from={S(6.8)} durationInFrames={S(2.6)}>
        <ContinuousTransformChart frame={frame - S(6.8)} scene="scene4" />
      </Sequence>

      {/* Scene 05: Product Unlock scanner layer (9.4s to 13.8s, 132f) */}
      <Sequence from={S(9.4)} durationInFrames={S(4.4)}>
        <ContinuousTransformChart frame={frame - S(9.4)} scene="scene5" />
      </Sequence>

      {/* Scene 06: Outro Brand CTA lockup (13.8s to 18.5s, 141f) */}
      <Sequence from={S(13.8)} durationInFrames={S(4.7)}>
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

export default MarketPressureBriefV30;
