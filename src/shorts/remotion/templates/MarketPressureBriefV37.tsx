// ============================================================================
// MarketPressureBrief V37 — Premium Visual & Real-time Redis Integration
// ============================================================================
// High-end 24.633-second (739 frames at 30fps) event-based insight short.
// All pacing, captions, and visual states are dynamically derived from
// NARRATIVE_TIMELINE in mockMarketPressureBriefV37.ts (SSoT).
// ============================================================================

import React from 'react';
import {
  AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig,
  interpolate, spring, staticFile, Audio, random,
} from 'remotion';
import type { ShortsVideoInput } from '../../types';
import { SG_LOGO, LAYOUT } from '../brand/signumBrand';
import { ComplianceFooter } from '../components/ComplianceFooter';
import AlertTopBar from '../components/AlertTopBar';
import { NARRATIVE_TIMELINE, NarrativeSegment } from '../../data/mockMarketPressureBriefV37';

export type MarketPressureBriefV37Props = ShortsVideoInput;
const S = (s: number) => Math.round(s * 30);

const MONO_FAMILY = "'JetBrains Mono', 'SF Mono', monospace";
const SANS_FAMILY = "'Inter', 'SF Pro Display', -apple-system, sans-serif";

// ─── High-End Theme Configuration (Silent Luxury HSL System) ─────────────────
interface ThemePalette {
  slateIndigo: string;
  slateIndigoGlow: string;
  smokedObsidian: string;
  burntAmber: string;
  burntAmberGlow: string;
  mutedCyan: string;
  mutedCyanGlow: string;
  borderFaint: string;
  textMuted: string;
}

const theme: ThemePalette = {
  slateIndigo: 'hsla(200, 13%, 19%, 1)',       // #2C3539 - Muted slate blue
  slateIndigoGlow: 'hsla(200, 13%, 19%, 0.35)',
  smokedObsidian: 'hsla(0, 0%, 8%, 1)',         // Dark volcano black
  burntAmber: 'hsla(13, 70%, 62%, 1)',          // #E07A5F - Premium warm orange
  burntAmberGlow: 'hsla(13, 70%, 62%, 0.45)',
  mutedCyan: 'hsla(190, 80%, 45%, 1)',          // Elegant tailored cyan
  mutedCyanGlow: 'hsla(190, 80%, 45%, 0.40)',
  borderFaint: 'rgba(255, 255, 255, 0.08)',
  textMuted: 'rgba(255, 255, 255, 0.45)',
};

// ─── Premium Layer: High-End Vectorized Nvidia Ticker Logo ─────────────────
const NvidiaLogo: React.FC<{ size?: number; showText?: boolean; color?: string }> = ({ size = 60, showText = false, color = '#76b900' }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: `drop-shadow(0 0 15px ${color}66)` }}>
        <path d="M50 10C27.9 10 10 27.9 10 50C10 72.1 27.9 90 50 90C72.1 90 90 72.1 90 50C90 27.9 72.1 10 50 10ZM50 82C32.3 82 18 67.7 18 50C18 32.3 32.3 18 50 18C67.7 18 82 32.3 82 50C82 67.7 67.7 82 50 82Z" fill={color} />
        <path d="M50 26C36.8 26 26 36.8 26 50C26 63.2 36.8 74 50 74C63.2 74 74 63.2 74 50C74 36.8 63.2 26 50 26ZM50 66C41.2 66 34 58.8 34 50C34 41.2 41.2 34 50 34C58.8 34 66 41.2 66 50C66 58.8 58.8 66 50 66Z" fill={color} opacity="0.6" />
        <path d="M50 38C43.4 38 38 43.4 38 50C38 56.6 43.4 62 50 62C56.6 62 62 56.6 62 50C62 43.4 56.6 38 50 38Z" fill="#ffffff" />
        <path d="M50 18C41.2 18 34 25.2 34 34C34 38.4 35.8 42.4 38.8 45.2L43 41C41.2 39.2 40 36.8 40 34C40 28.5 44.5 24 50 24C55.5 24 60 28.5 60 34C60 36.8 58.8 39.2 57 41L61.2 45.2C64.2 42.4 66 38.4 66 34C66 25.2 58.8 18 50 18Z" fill={color} />
      </svg>
      {showText && (
        <span style={{
          fontFamily: SANS_FAMILY,
          fontWeight: 900,
          fontSize: size * 0.40,
          color: '#ffffff',
          letterSpacing: '0.08em',
          textShadow: '0 0 10px rgba(255,255,255,0.3)'
        }}>
          NVIDIA
        </span>
      )}
    </div>
  );
};


// ─── Premium Layer: 3D Holographic Perspective Floor Grid ───────────────────
const Holographic3DFloor: React.FC<{ zoomProgress: number }> = ({ zoomProgress }) => {
  const frame = useCurrentFrame();
  
  // Slow forward scroll movement on grid
  const scrollOffset = (frame * 1.5) % 80;
  
  // Interpolate 3D values based on active scene zoom
  const perspective = interpolate(zoomProgress, [0, 1], [600, 480]);
  const rotateX = interpolate(zoomProgress, [0, 1], [62, 55]);
  const translateY = interpolate(zoomProgress, [0, 1], [0, -30]);
  const opacity = interpolate(zoomProgress, [0, 1], [0.15, 0.28]);

  return (
    <div style={{
      position: 'absolute', left: -200, right: -200, bottom: -100, height: 650,
      perspective: `${perspective}px`,
      pointerEvents: 'none', zIndex: 1, overflow: 'hidden'
    }}>
      <div style={{
        width: '140%', height: '140%', left: '-20%', top: '-20%', position: 'absolute',
        backgroundImage: `
          linear-gradient(to right, ${theme.mutedCyan}33 1px, transparent 1px),
          linear-gradient(to bottom, ${theme.mutedCyan}33 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        backgroundPosition: `0px ${scrollOffset}px`,
        transform: `rotateX(${rotateX}deg) translateY(${translateY}px)`,
        opacity,
        maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,0) 100%)',
        WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,0) 100%)',
        transition: 'transform 0.1s ease-out, opacity 0.1s ease-out'
      }} />
    </div>
  );
};

// ─── Premium Layer: Slow Candlestick Trace ──────────────────────────
const ScrollingBackgroundChart: React.FC<{ opacity?: number }> = ({ opacity = 0.15 }) => {
  const frame = useCurrentFrame();
  const scrollOffset = (frame * 1.0) % 2400;
  return (
    <div style={{
      position: 'absolute', inset: 0, opacity, transform: `translateX(-${scrollOffset}px)`,
      display: 'flex', alignItems: 'center', gap: 70, pointerEvents: 'none', zIndex: 2,
    }}>
      {Array.from({ length: 45 }).map((_, i) => {
        const h = 130 + Math.sin(i * 0.6) * 170 + Math.cos(i * 0.3) * 60;
        const color = i % 2 === 0 ? theme.mutedCyan : theme.burntAmber;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 1.5, height: h * 0.3, background: color }} />
            <div style={{ width: 10, height: h * 0.7, background: color, borderRadius: 1.5, boxShadow: `0 0 12px ${color}33` }} />
            <div style={{ width: 1.5, height: h * 0.2, background: color }} />
          </div>
        );
      })}
    </div>
  );
};

// ─── Premium Layer: Telemetry fragments ─────────────────────
const TelemetryFragments: React.FC<{ ticker: string; limitBound: string }> = ({ ticker, limitBound }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{
      position: 'absolute', inset: 50, pointerEvents: 'none', zIndex: 3,
      fontFamily: MONO_FAMILY, fontSize: 13, color: `${theme.mutedCyan}55`,
      textShadow: `0 0 6px ${theme.mutedCyan}22`
    }}>
      <div style={{ position: 'absolute', top: 120, left: 20 }}>SYS_TRCK_SIG: 0x37F7</div>
      <div style={{ position: 'absolute', top: 145, left: 20 }}>FLOW_STATE: {Math.sin(frame * 0.04) > 0 ? 'ACTIVE_FEED' : 'SECURE_LINK'}</div>
      <div style={{ position: 'absolute', bottom: 240, left: 20 }}>LIMIT_BND: {limitBound}</div>
      <div style={{ position: 'absolute', bottom: 265, left: 20 }}>DELTA_EXPOSURE: +0.678%</div>
      <div style={{ position: 'absolute', top: 480, right: 20 }}>GAMMA_VAL: 1.84M</div>
      <div style={{ position: 'absolute', top: 505, right: 20 }}>TICKER: {ticker.toUpperCase()}</div>
      <div style={{ position: 'absolute', top: 720, left: 20 }}>FEED_LATENCY: 1.5ms</div>
      <div style={{ position: 'absolute', top: 745, left: 20 }}>SEC_HASH: SHA256//V37</div>
    </div>
  );
};

// ─── Premium Layer: Cinematic Texture Overlay (Grain & Vignette) ────────────
const CinematicOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const grainSeed = Math.floor(random(`grain-v37-${frame}`) * 1000);
  const grainTx = (random(`grain-tx-v37-${frame}`) - 0.5) * 4;
  const grainTy = (random(`grain-ty-v37-${frame}`) - 0.5) * 4;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 100 }}>
      {/* 1. Elegant Lens Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at center, transparent 35%, rgba(0, 0, 0, 0.55) 100%)',
      }} />

      {/* 2. Procedural Film Grain */}
      <div style={{
        position: 'absolute', inset: -10,
        opacity: 0.038,
        transform: `translate(${grainTx}px, ${grainTy}px)`,
      }}>
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <filter id="grain-v37-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.80" numOctaves="4" seed={grainSeed} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain-v37-noise)" />
        </svg>
      </div>
    </AbsoluteFill>
  );
};

// ─── Premium Living Terminal Background System ──────────────────────────────────
const LivingTerminalBackground: React.FC<{ ticker: string; limitBound: string; zoomProgress: number }> = ({ ticker, limitBound, zoomProgress }) => {
  const frame = useCurrentFrame();
  const gridX = (frame * 0.20) % 80;
  const gridY = (frame * 0.25) % 80;

  return (
    <AbsoluteFill style={{ background: theme.smokedObsidian, overflow: 'hidden', zIndex: 0 }}>
      {/* Underlying smooth color map */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 130% 90% at 50% 30%, #030816 0%, #010204 80%),
          radial-gradient(ellipse 110% 70% at 15% 80%, #040d22 0%, transparent 60%)
        `,
      }} />

      {/* Swiss Micro-Dot Grid Mesh */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px)`,
        backgroundSize: '10px 10px',
        backgroundPosition: `${gridX}px ${gridY}px`,
        opacity: 0.85,
      }} />

      {/* Procedural visual layers */}
      <ScrollingBackgroundChart />
      <Holographic3DFloor zoomProgress={zoomProgress} />
      <TelemetryFragments ticker={ticker} limitBound={limitBound} />

      {/* Decorative hairline outer border frame */}
      <div style={{
        position: 'absolute', inset: 30,
        border: `0.5px solid ${theme.borderFaint}`,
        pointerEvents: 'none', zIndex: 10,
      }}>
        {/* Corners */}
        <div style={{ position: 'absolute', top: -1, left: -1, width: 22, height: 22, borderTop: `2px solid ${theme.mutedCyan}`, borderLeft: `2px solid ${theme.mutedCyan}` }} />
        <div style={{ position: 'absolute', top: -1, right: -1, width: 22, height: 22, borderTop: `2px solid ${theme.mutedCyan}`, borderRight: `2px solid ${theme.mutedCyan}` }} />
        <div style={{ position: 'absolute', bottom: -1, left: -1, width: 22, height: 22, borderBottom: `2px solid ${theme.mutedCyan}`, borderLeft: `2px solid ${theme.mutedCyan}` }} />
        <div style={{ position: 'absolute', bottom: -1, right: -1, width: 22, height: 22, borderBottom: `2px solid ${theme.mutedCyan}`, borderRight: `2px solid ${theme.mutedCyan}` }} />

        {/* HUD Labels */}
        <div style={{ position: 'absolute', top: 12, left: 15, color: `${theme.mutedCyan}bb`, fontSize: 12, fontFamily: MONO_FAMILY, fontWeight: 700, letterSpacing: '0.1em' }}>SYS: ACTIVE</div>
        <div style={{ position: 'absolute', top: 12, right: 15, color: `${theme.mutedCyan}bb`, fontSize: 12, fontFamily: MONO_FAMILY, fontWeight: 700, letterSpacing: '0.1em' }}>NET: REALTIME</div>
        <div style={{ position: 'absolute', bottom: 12, left: 15, color: theme.textMuted, fontSize: 11, fontFamily: MONO_FAMILY }}>[SCALE: 9:16 CBR MASTER]</div>
        <div style={{ position: 'absolute', bottom: 12, right: 15, color: theme.textMuted, fontSize: 11, fontFamily: MONO_FAMILY }}>[MODE: SSoT_LOCK_V37]</div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Technical Scanner Line ─────────────────────────────────────────
const ScannerLine: React.FC<{ progress: number; glow?: number; color?: string }> = ({ progress, glow = 80, color = theme.mutedCyan }) => {
  const y = interpolate(progress, [0, 1], [520, 1220]);
  return (
    <div style={{
      position: 'absolute', left: 80, right: 80, top: y, height: 4,
      background: `linear-gradient(90deg, transparent 0%, ${color} 25%, #ffffff 50%, ${color} 75%, transparent 100%)`,
      boxShadow: `0 0 ${glow}px ${color}, 0 0 ${glow * 1.5}px ${color}, inset 0 0 4px #ffffff`,
      zIndex: 20, pointerEvents: 'none', opacity: 0.9,
    }} />
  );
};

// ─── Directional Institutional Flow Particles ──────────────────────────
const FlowParticles: React.FC<{
  startY: number; endY: number; count?: number; color?: string; frameOffset?: number; speedFactor?: number;
}> = ({ startY, endY, count = 15, color = theme.mutedCyan, frameOffset = 0, speedFactor = 1.0 }) => {
  const frame = useCurrentFrame() + frameOffset;
  const height = Math.abs(endY - startY);
  
  return (
    <div style={{ position: 'absolute', left: 80, right: 80, top: Math.min(startY, endY), height: Math.max(10, height), pointerEvents: 'none', zIndex: 15 }}>
      {Array.from({ length: count }).map((_, i) => {
        const cycleProgress = ((frame * (0.012 + random(i + 2) * 0.018) * speedFactor) + random(i + 12)) % 1.0;
        const easedProgress = 1 - Math.pow(1 - cycleProgress, 2.5);
        
        const xStart = 160 + random(i + 5) * 330; 
        const xEnd = 740 + (random(i + 6) - 0.5) * 60;  
        const x = interpolate(easedProgress, [0, 1], [xStart, xEnd]);
        
        const y = interpolate(easedProgress, [0, 1], [height, 0]);
        const op = interpolate(cycleProgress, [0, 0.15, 0.9, 1.0], [0, 0.92, 0.92, 0]);
        
        const sz = 6 + random(i + 9) * 11;
        const glowMult = interpolate(easedProgress, [0, 0.7, 1.0], [1.0, 1.7, 3.2]);
        
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y, width: sz, height: sz,
            borderRadius: '50%', background: color, opacity: op,
            boxShadow: `0 0 ${sz * 2.5 * glowMult}px ${color}, 0 0 ${sz * 1.2 * glowMult}px ${color}`,
          }} />
        );
      })}
    </div>
  );
};

// ─── Absolute Caption Overlay with Physical Spring Damping ───────────────────
const SafeCaptionOverlay: React.FC<{ activeSegment: NarrativeSegment }> = ({ activeSegment }) => {
  const frame = useCurrentFrame();
  const currentTime = frame / 30;

  // Scene vertical placement
  const isHook = activeSegment.id === 'hook';
  const isCTA = activeSegment.id === 'cta';
  const targetY = isHook ? 1410 : (isCTA ? 1250 : 380);
  
  const isContrast = activeSegment.id === 'contrast';
  const isPressureMap = activeSegment.id === 'regime';
  const isBrand = activeSegment.id === 'cta';

  // Physical Spring Caption scaling on entry
  const segmentDurationInFrames = S(activeSegment.end - activeSegment.start);
  const relativeFrame = frame - S(activeSegment.start);
  
  const entryScale = spring({
    frame: relativeFrame,
    fps: 30,
    config: { damping: 13, mass: 0.7, stiffness: 105 },
  });

  let fontSize = isHook ? 38 : (isCTA ? 50 : 70);
  let color = '#ffffff';
  let textShadow = '0 3px 20px rgba(0,0,0,0.98), 0 0 35px rgba(0,0,0,0.90)';
  
  if (isContrast) {
    fontSize = 68;
    color = theme.burntAmber;
    textShadow = `0 0 45px ${theme.burntAmberGlow}, 0 3px 15px rgba(0,0,0,0.98)`;
  } else if (isPressureMap) {
    fontSize = 72;
    color = theme.mutedCyan;
    textShadow = `0 0 50px ${theme.mutedCyanGlow}, 0 3px 15px rgba(0,0,0,0.98)`;
  } else if (isBrand) {
    fontSize = 54;
    color = theme.mutedCyan;
    textShadow = `0 0 40px ${theme.mutedCyanGlow}, 0 3px 15px rgba(0,0,0,0.98)`;
  }

  // CTA domain scaling lock in final second
  const isFinalOneSecond = currentTime >= (NARRATIVE_TIMELINE[NARRATIVE_TIMELINE.length - 1].end - 1.0);
  if (isFinalOneSecond) {
    fontSize = 64;
    color = theme.mutedCyan;
    textShadow = `0 0 55px ${theme.mutedCyanGlow}, 0 3px 20px rgba(0,0,0,0.98)`;
  }

  return (
    <div style={{
      position: 'absolute', left: 75, right: 75, top: targetY,
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 90, pointerEvents: 'none',
      transform: `scale(${entryScale})`,
    }}>
      <div style={{
        fontFamily: isHook ? MONO_FAMILY : SANS_FAMILY,
        fontWeight: 900,
        fontSize,
        color,
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: isHook ? '0.06em' : '-0.03em',
        lineHeight: 1.05,
        textShadow,
      }}>
        {activeSegment.caption}
      </div>
    </div>
  );
};

// ─── Audio Engine ───
const AudioEngine: React.FC = () => {
  return (
    <>
      <Audio src={staticFile('shorts/audio/v37_voice.mp3')} volume={1.0} />
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.38} startFrom={0} endAt={739} />
      
      {/* Audio SFX Cues */}
      <Sequence from={0}><Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.8} /></Sequence>
      <Sequence from={S(0.4)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.85} /></Sequence>
      <Sequence from={S(7.236)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.65} /></Sequence>
      <Sequence from={S(20.793)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.6} /></Sequence>
    </>
  );
};

// ─── SCENE 00 / 01: ALERT BOOT & SHOCK ───────────────────────────────────────
interface Scene01Props {
  price: number;
  callWall: number;
  putFloor: number;
  nearestWall: string;
  distancePercent: number;
  darkPoolNotional: number;
  darkPoolPercentile: number;
  activeSegment: NarrativeSegment;
}

const Scene00_AlertBoot: React.FC<{ ticker: string }> = ({ ticker }) => {
  const frame = useCurrentFrame();
  const scanY = interpolate(frame, [0, 12], [200, 1720]);
  const glitch = frame % 3 === 0;

  return (
    <AbsoluteFill style={{ background: theme.smokedObsidian, zIndex: 50 }}>
      {/* Glitch micro-dots */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(${theme.mutedCyan}22 1.5px, transparent 1.5px)`,
        backgroundSize: '40px 40px',
        opacity: 0.6,
      }} />

      <div style={{
        position: 'absolute', left: 40, right: 40, top: scanY, height: 4,
        background: theme.mutedCyan, boxShadow: `0 0 30px ${theme.mutedCyanGlow}, 0 0 10px #ffffff`,
      }} />

      <div style={{
        position: 'absolute', top: 520, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        flexDirection: 'column',
      }}>
        <div style={{
          transform: glitch ? 'skewX(-10deg) scale(1.03)' : 'none',
          filter: glitch ? `blur(1px)` : 'none',
        }}>
          <NvidiaLogo size={130} showText={true} />
        </div>

        <div style={{
          fontFamily: MONO_FAMILY, fontSize: 16, color: '#ffffff',
          letterSpacing: '0.08em', marginTop: 35,
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: theme.burntAmber, display: 'inline-block', animation: 'pulse 1s infinite' }} />
          SYSTEM SCAN: [{ticker.toUpperCase()}] / GEX DETECTED...
        </div>
      </div>
    </AbsoluteFill>
  );
};


const Scene01_EventShock: React.FC<Scene01Props> = ({
  price, callWall, putFloor, nearestWall, distancePercent, darkPoolNotional, darkPoolPercentile, activeSegment
}) => {
  const frame = useCurrentFrame();
  const wallY = 600;
  const priceY = 820;

  const decryptGlow = Math.sin(frame * 0.3) > 0 ? theme.burntAmber : theme.mutedCyan;
  const formattedNotional = `$${(darkPoolNotional / 1e9).toFixed(1)}B`;

  return (
    <AbsoluteFill style={{ zIndex: 10 }}>
      {/* Alert Header top bar */}
      <AlertTopBar ticker="NVDA" price={price} alertText="OFF-EXCHANGE FLOW DETECTED" isV33={true} />
      
      <div style={{
        position: 'absolute', top: 45, right: LAYOUT.safeR, zIndex: 25,
        display: 'flex', alignItems: 'center', gap: 15
      }}>
        <NvidiaLogo size={26} showText={true} />
        <div style={{
          fontFamily: MONO_FAMILY, fontSize: 13, fontWeight: 900, color: decryptGlow,
          textShadow: `0 0 10px ${decryptGlow}`, display: 'flex', alignItems: 'center', gap: 6
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: decryptGlow, display: 'inline-block' }} />
          [FLOW_EXPOSED]
        </div>
      </div>

      {/* Massive Hook headline */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 60, left: LAYOUT.safeL, right: LAYOUT.safeR,
        display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 20,
      }}>
        <div style={{
          fontSize: 180, fontWeight: 900, fontFamily: MONO_FAMILY, color: '#ffffff',
          textAlign: 'center', lineHeight: 0.85, textShadow: `0 0 60px rgba(255,255,255,0.40), 0 10px 40px rgba(0,0,0,0.85)`,
          letterSpacing: '-0.04em'
        }}>
          {formattedNotional}
        </div>
        <div style={{
          fontSize: 34, fontWeight: 900, fontFamily: MONO_FAMILY, color: theme.mutedCyan,
          textAlign: 'center', marginTop: 10, letterSpacing: '0.12em', textShadow: `0 0 20px ${theme.mutedCyanGlow}`
        }}>
          OFF-EXCHANGE FLOW
        </div>

        {/* 94th percentile Badge */}
        <div style={{
          fontFamily: MONO_FAMILY, fontSize: 16, color: '#03050c', background: theme.burntAmber,
          padding: '5px 14px', borderRadius: 2, fontWeight: 900, marginTop: 15,
          boxShadow: `0 0 15px ${theme.burntAmberGlow}`
        }}>
          {darkPoolPercentile}th %ILE INSTITUTIONAL REGIME
        </div>
      </div>

      {/* Target Wall Box */}
      <div style={{
        position: 'absolute', top: 1120, left: LAYOUT.safeL, right: LAYOUT.safeR,
        display: 'flex', justifyContent: 'center', zIndex: 20,
      }}>
        <div style={{
          background: 'rgba(3,6,12,0.94)',
          border: `0.5px solid ${theme.burntAmber}`,
          boxShadow: `0 0 30px ${theme.burntAmberGlow}`,
          borderRadius: 3, padding: '14px 32px',
          textAlign: 'center',
        }}>
          <span style={{
            fontFamily: MONO_FAMILY, fontSize: 40, fontWeight: 900,
            color: theme.burntAmber, letterSpacing: '0.06em',
            textShadow: `0 0 12px ${theme.burntAmber}`
          }}>
            NEAR NVDA'S ${Math.round(callWall)} WALL
          </span>
        </div>
      </div>

      {/* Main chart outline in center half */}
      <div style={{
        position: 'absolute', top: 520, bottom: 700, left: LAYOUT.safeL, right: LAYOUT.safeR,
        border: `0.5px solid ${theme.borderFaint}`, borderRadius: 3,
        background: 'rgba(3,6,12,0.85)', overflow: 'hidden',
        boxShadow: '0 20px 50px rgba(0,0,0,0.85)',
        zIndex: 10,
      }}>
        <div style={{ position: 'absolute', top: 80, left: 0, right: 0, height: 1, background: `rgba(255,255,255,0.04)` }} />
        <div style={{ position: 'absolute', top: 240, left: 0, right: 0, height: 1, background: `rgba(255,255,255,0.04)` }} />
        <div style={{ position: 'absolute', top: 400, left: 0, right: 0, height: 1, background: `rgba(255,255,255,0.04)` }} />

        {/* Glow Price Vector Curve */}
        <svg width="960" height="700" style={{ position: 'absolute', top: -520, left: 0 }}>
          <path d={`M 80,${priceY + 120} Q 400,${priceY - 80} 600,${priceY} T 960,${priceY - 30}`} fill="none" stroke={theme.mutedCyan} strokeWidth="5" />
        </svg>

        {/* Pulsing price dot */}
        <div style={{
          position: 'absolute', left: 600 - 15, top: (priceY - 520) - 15, width: 30, height: 30,
          borderRadius: '50%', background: theme.mutedCyan,
          boxShadow: `0 0 30px ${theme.mutedCyanGlow}, 0 0 8px #ffffff`, zIndex: 12,
        }} />

        {/* Red Call Wall Resistance Line */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: wallY - 520, height: 6, background: theme.burntAmber,
          boxShadow: `0 0 45px ${theme.burntAmberGlow}, 0 0 12px ${theme.burntAmber}`,
        }} />
        <div style={{
          position: 'absolute', right: 20, top: (wallY - 520) - 30,
          color: theme.burntAmber, fontSize: 20, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: `0 0 10px ${theme.burntAmberGlow}`,
        }}>[CALL RESISTANCE ${Math.round(callWall)}.00]</div>

        {/* Compress gap bracket */}
        <div style={{ position: 'absolute', left: 740, top: wallY - 520, height: priceY - wallY }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 4, height: '100%', background: theme.burntAmber, boxShadow: `0 0 20px ${theme.burntAmberGlow}` }} />
          <div style={{ position: 'absolute', left: -12, top: 0, width: 18, height: 4, background: theme.burntAmber }} />
          <div style={{ position: 'absolute', left: -12, bottom: 0, width: 18, height: 4, background: theme.burntAmber }} />
        </div>
        <div style={{
          position: 'absolute', left: 765, top: (wallY - 520) + 70,
          color: theme.burntAmber, fontSize: 30, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: `0 0 10px ${theme.burntAmberGlow}`
        }}>
          {distancePercent}% GAP
        </div>

        {/* Flow particles */}
        <FlowParticles startY={wallY - 520} endY={priceY - 520} count={14} speedFactor={1.5} color={theme.mutedCyan} />
      </div>

      {/* Volumetric Histogram at bottom */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 80, left: LAYOUT.safeL, right: LAYOUT.safeR, height: 160,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', zIndex: 10,
        background: 'linear-gradient(180deg, transparent, rgba(34,211,238,0.02))',
        padding: '10px', borderRadius: 3, border: '0.5px solid rgba(255,255,255,0.03)'
      }}>
        {Array.from({ length: 22 }).map((_, i) => {
          const h = 40 + Math.sin(frame * 0.16 + i) * 75 + Math.cos(frame * 0.11 - i) * 30;
          return (
            <div key={i} style={{
              width: 25, height: Math.max(12, h), background: `linear-gradient(0deg, ${theme.mutedCyan}33 0%, ${theme.mutedCyan} 100%)`,
              borderRadius: '2px 2px 0 0',
              boxShadow: `0 0 20px ${theme.mutedCyanGlow}, 0 0 4px ${theme.mutedCyan}`,
              borderLeft: '0.5px solid rgba(255,255,255,0.08)',
              borderRight: '0.5px solid rgba(0,0,0,0.3)',
            }} />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENES 02 - 04: CONTINUOUS TRANSFORMING PRICE CHART ─────────────────────
interface ContinuousChartProps {
  frame: number;
  scene: 'scene2' | 'scene3' | 'scene4' | 'scene5';
  price: number;
  callWall: number;
  putFloor: number;
  gammaFlip: number;
  distancePercent: number;
}

const ContinuousTransformChart: React.FC<ContinuousChartProps> = ({
  frame, scene, price, callWall, putFloor, gammaFlip, distancePercent
}) => {
  const chartTop = 520;
  const chartBottom = 1220;
  const chartHeight = chartBottom - chartTop;

  const callWallY = chartTop + 80;    
  const gammaFlipY = chartTop + 400;  
  const putFloorY = chartTop + 630;   

  let activePriceY = chartTop + 300;
  if (scene === 'scene2') {
    activePriceY = chartTop + 380;
  } else if (scene === 'scene3') {
    activePriceY = chartTop + 380;
  } else if (scene === 'scene4') {
    activePriceY = interpolate(frame, [0, S(2.87)], [chartTop + 380, chartTop + 140], { extrapolateRight: 'clamp' });
  } else if (scene === 'scene5') {
    activePriceY = chartTop + 140;
  }

  const bracketH = Math.max(10, activePriceY - callWallY);

  // --- Zooming mechanics ---
  let containerTransform = 'scale(1) translate(0px, 0px)';
  let zoomProgress = 0;
  if (scene === 'scene4') {
    zoomProgress = spring({
      frame,
      fps: 30,
      config: { damping: 14, mass: 0.8, stiffness: 85 }
    });
    const scale = interpolate(zoomProgress, [0, 1], [1, 1.48]);
    const translateY = interpolate(zoomProgress, [0, 1], [0, -85]);
    containerTransform = `scale(${scale}) translateY(${translateY}px)`;
  } else if (scene === 'scene5') {
    zoomProgress = 1.0;
    containerTransform = 'scale(1.22) translateY(-40px)';
  }

  // --- Screen shake logic during compression lock in ---
  let shakeStyle: React.CSSProperties = {};
  if (scene === 'scene4' && frame >= S(0.0) && frame < S(0.6)) {
    const shakeFrame = frame;
    const intensity = interpolate(shakeFrame, [0, 18], [10, 0], { extrapolateRight: 'clamp' });
    const sx = (Math.sin(shakeFrame * 1.5) * intensity);
    const sy = (Math.cos(shakeFrame * 1.8) * intensity);
    shakeStyle = { transform: `translate(${sx}px, ${sy}px)` };
  }

  const warmTintOpacity = (scene === 'scene4')
    ? interpolate(frame, [0, S(1.0)], [0, 0.22], { extrapolateRight: 'clamp' })
    : (scene === 'scene5' ? 0.16 : 0);

  const isScannerSweepFrame = scene === 'scene3';
  const sweepProgress = isScannerSweepFrame
    ? interpolate(frame, [0, S(1.5)], [0, 1], { extrapolateRight: 'clamp' })
    : 0;

  const revealProgress = (scene === 'scene2')
    ? 0
    : ((scene === 'scene3') ? sweepProgress : 1.0); 

  const pulseIntensity = isScannerSweepFrame
    ? interpolate(sweepProgress, [0, 0.4, 1.0], [0, 0.85, 0], { extrapolateRight: 'clamp' })
    : 0;

  return (
    <AbsoluteFill style={{ zIndex: 10 }}>
      {warmTintOpacity > 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(circle, ${theme.burntAmber}26 0%, transparent 80%)`,
          opacity: warmTintOpacity, zIndex: 1, pointerEvents: 'none'
        }} />
      )}

      {/* Shake container */}
      <div style={{ position: 'absolute', inset: 0, ...shakeStyle }}>
        {/* Grid Outline with zoom */}
        <div style={{
          position: 'absolute', left: 80, right: 80, top: chartTop, height: chartHeight,
          border: `0.5px solid ${theme.borderFaint}`, borderRadius: 3,
          background: 'rgba(3,6,12,0.85)', overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
          transform: containerTransform,
          transition: 'transform 0.12s ease-out'
        }}>
          {/* Subtly glowing floor grid helper */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px)`,
            backgroundSize: '15px 15px',
          }} />

          <div style={{ position: 'absolute', top: 80, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.03)' }} />
          <div style={{ position: 'absolute', top: 240, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.03)' }} />
          <div style={{ position: 'absolute', top: 400, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.03)' }} />
          <div style={{ position: 'absolute', top: 560, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.03)' }} />

          {/* Faint candlesticks inside grid */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.28, display: 'flex', alignItems: 'center', justifyContent: 'space-around', pointerEvents: 'none' }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 1.5, height: 50, background: '#ffffff', opacity: 0.3 }} />
                <div style={{ width: 8, height: 95, background: '#ffffff', opacity: 0.15, borderRadius: 1.5 }} />
                <div style={{ width: 1.5, height: 30, background: '#ffffff', opacity: 0.3 }} />
              </div>
            ))}
          </div>

          {/* Product Unlock Reveal Pulse Overlay */}
          {pulseIntensity > 0 && (
            <div style={{
              position: 'absolute', inset: 0,
              background: `${theme.mutedCyan}22`,
              boxShadow: `inset 0 0 100px ${theme.mutedCyan}88`,
              pointerEvents: 'none', zIndex: 12,
              opacity: pulseIntensity,
            }} />
          )}
        </div>

        {/* Structured elements inside zoomed container */}
        <div style={{ transform: containerTransform, position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          
          <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: 10 }}>
            <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke={revealProgress > 0.1 ? theme.mutedCyan : `rgba(255,255,255,0.25)`} strokeWidth="4" />
          </svg>

          {isScannerSweepFrame && <ScannerLine progress={sweepProgress} color={theme.mutedCyan} />}

          {/* Call Wall, Put Floor, Gamma Flip reveal under scanner sweep */}
          <div style={{ zIndex: 10, opacity: revealProgress }}>
            {/* Burnt Amber Call Wall */}
            <div style={{
              position: 'absolute', left: 80, right: 80, top: callWallY, height: 6, background: theme.burntAmber,
              boxShadow: `0 0 45px ${theme.burntAmberGlow}, 0 0 12px ${theme.burntAmber}`,
            }} />
            <div style={{ position: 'absolute', right: 100, top: callWallY - 28, color: theme.burntAmber, fontFamily: MONO_FAMILY, fontSize: 18, fontWeight: 900, textShadow: `0 0 10px ${theme.burntAmberGlow}` }}>
              [CALL WALL $${Math.round(callWall)}.00]
            </div>

            {/* Put Floor */}
            <div style={{
              position: 'absolute', left: 80, right: 80, top: putFloorY, height: 5, background: theme.mutedCyan,
              boxShadow: `0 0 35px ${theme.mutedCyanGlow}`,
            }} />
            <div style={{ position: 'absolute', left: 100, top: putFloorY + 12, color: theme.mutedCyan, fontFamily: MONO_FAMILY, fontSize: 16, fontWeight: 900, textShadow: `0 0 8px ${theme.mutedCyanGlow}` }}>
              [PUT FLOOR $${Math.round(putFloor)}.00]
            </div>

            {/* Gamma Flip */}
            <div style={{
              position: 'absolute', left: 80, right: 80, top: gammaFlipY, height: 4, background: '#3b82f6',
              boxShadow: `0 0 25px rgba(59,130,246,0.6)`,
            }} />
            <div style={{ position: 'absolute', left: 100, top: gammaFlipY - 24, color: '#3b82f6', fontFamily: MONO_FAMILY, fontSize: 14, fontWeight: 900 }}>
              [GAMMA FLIP $${Math.round(gammaFlip)}.00]
            </div>
            
            {/* Gap bracket */}
            <div style={{ position: 'absolute', left: 740, top: callWallY, height: bracketH, zIndex: 12 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: 4, height: '100%', background: theme.burntAmber, boxShadow: `0 0 20px ${theme.burntAmberGlow}` }} />
              <div style={{ position: 'absolute', left: -12, top: 0, width: 18, height: 4, background: theme.burntAmber }} />
              <div style={{ position: 'absolute', left: -12, bottom: 0, width: 18, height: 4, background: theme.burntAmber }} />
            </div>

            {/* Gap value badge */}
            <div style={{
              position: 'absolute', left: 765, top: callWallY + (bracketH / 2) - 18,
              color: theme.burntAmber, fontSize: 24, fontWeight: 900, fontFamily: MONO_FAMILY,
              textShadow: `0 0 8px ${theme.burntAmberGlow}`
            }}>{distancePercent}% GAP</div>

            {/* Directional flow particles */}
            <FlowParticles startY={callWallY} endY={activePriceY} count={15} speedFactor={1.7} color={theme.mutedCyan} />
          </div>

        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── SCENE 05: PREMIUM SSoT CTA OUTRO (CTA Lock Frame) ──────────────────────
const Scene05_CTAOutro: React.FC = () => {
  const frame = useCurrentFrame();

  const lockScale = spring({
    frame,
    fps: 30,
    config: { damping: 11, mass: 0.9, stiffness: 110 }
  });

  const neonPulse = 25 + Math.sin(frame * 0.12) * 12;

  return (
    <AbsoluteFill style={{ zIndex: 60 }}>
      {/* Seamless Loop fade overlay */}
      {frame >= S(2.5) && (
        <div style={{
          position: 'absolute', inset: 0,
          background: theme.smokedObsidian, zIndex: 1, opacity: interpolate(frame - S(2.5), [0, 15], [0, 0.72], { extrapolateRight: 'clamp' }), pointerEvents: 'none'
        }}>
          <div style={{
            position: 'absolute', left: 80, right: 80, top: 600, height: 6, background: theme.burntAmber,
            boxShadow: `0 0 45px ${theme.burntAmberGlow}, 0 0 10px ${theme.burntAmber}`,
          }} />
        </div>
      )}

      {/* CTA Box wrapper */}
      <div style={{
        position: 'absolute', top: 560, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        flexDirection: 'column',
        transform: `scale(${lockScale})`,
        zIndex: 5,
      }}>
        {/* Premium vector SG branding */}
        <svg width="170" height="170" viewBox="246 247 530 530" fill="none" style={{
          filter: `drop-shadow(0 0 12px ${theme.mutedCyanGlow})`,
        }}>
          <path d={SG_LOGO.upper} fill="#ffffff" />
          <path d={SG_LOGO.lower} fill={theme.mutedCyan} />
        </svg>

        {/* SSoT Domain CTA Box */}
        <div style={{
          marginTop: 60,
          background: 'rgba(3,6,12,0.94)',
          border: `0.5px solid ${theme.mutedCyan}`,
          borderRadius: 3,
          padding: '24px 60px',
          boxShadow: `0 0 ${neonPulse}px ${theme.mutedCyanGlow}, inset 0 0 20px ${theme.mutedCyanGlow}`,
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 24, fontFamily: MONO_FAMILY, color: '#ffffff',
            letterSpacing: '0.08em', fontWeight: 700,
          }}>
            [SEE HIDDEN STRUCTURE]
          </div>
          <div style={{
            fontSize: 50, fontFamily: MONO_FAMILY, color: theme.mutedCyan,
            letterSpacing: '0.12em', fontWeight: 900, marginTop: 8,
            textShadow: `0 0 15px ${theme.mutedCyan}`
          }}>
            SIGNUMHQ.COM
          </div>
        </div>

        {/* Small HUD indicator */}
        <div style={{
          marginTop: 35, fontSize: 16, fontFamily: MONO_FAMILY, color: theme.textMuted,
          letterSpacing: '0.08em', fontWeight: 700
        }}>
          * LIVE QUANT TERMINAL ACCESSIBLE
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT EXPORT
// ═════════════════════════════════════════════════════════════════════════════
export const MarketPressureBriefV37: React.FC<MarketPressureBriefV37Props> = ({
  structureVisual,
}) => {
  const frame = useCurrentFrame();
  const currentTime = frame / 30;

  // Active timeline segment lookup
  const activeSegment = NARRATIVE_TIMELINE.find(seg => currentTime >= seg.start && currentTime < seg.end) 
                        || NARRATIVE_TIMELINE[NARRATIVE_TIMELINE.length - 1];

  // Map values securely from visual block
  const priceVal = structureVisual?.price ?? 221.20;
  const callWallVal = structureVisual?.callWall ?? 250.00;
  const putFloorVal = structureVisual?.putFloor ?? 200.00;
  const gammaFlipVal = structureVisual?.gammaFlipLevel ?? 235.00;
  const distanceVal = structureVisual?.distancePercent ?? 13.0;
  const poolNotionalVal = structureVisual?.darkPoolNotional ?? 5380000000;
  const poolPercentileVal = structureVisual?.darkPoolPercentile ?? 94;

  const formattedLimitBound = `${Math.round(callWallVal)}.00 / ${Math.round(putFloorVal)}.00`;

  // Compute active scene zoom mapping for floor perspective
  let activeSceneZoom = 0;
  const t_unmask = S(11.860); // Segment 3: UNMASK
  const t_regime = S(17.424); // Segment 4: REGIME
  const t_cta = S(20.793);    // Segment 5: CTA

  if (frame >= t_unmask && frame < t_regime) {
    activeSceneZoom = spring({
      frame: frame - t_unmask,
      fps: 30,
      config: { damping: 14, mass: 0.8, stiffness: 85 }
    });
  } else if (frame >= t_regime) {
    activeSceneZoom = 1.0;
  }

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {/* 1. Living Telemetry Grid Background (connected to zoom factor) */}
      <LivingTerminalBackground ticker="NVDA" limitBound={formattedLimitBound} zoomProgress={activeSceneZoom} />

      {/* 2. Global Top Header for NVDA Ticker Brand Lock */}
      {currentTime >= 3.762 && currentTime < 20.793 && (
        <div style={{
          position: 'absolute', top: 60, left: 80, right: 80, height: 80,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: `0.5px solid ${theme.borderFaint}`,
          zIndex: 85, pointerEvents: 'none',
          paddingBottom: 15
        }}>
          <NvidiaLogo size={36} showText={true} />
          <div style={{
            fontFamily: MONO_FAMILY, fontSize: 12, fontWeight: 900,
            color: theme.mutedCyan, display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(3,6,12,0.6)', padding: '5px 12px', border: `0.5px solid ${theme.mutedCyan}44`,
            borderRadius: 2
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: theme.mutedCyan, display: 'inline-block' }} />
            REAL-TIME QUANT STATE
          </div>
        </div>
      )}

      {/* 3. Absolute Phrase-Level Caption Engine (Spring physics equipped) */}
      <SafeCaptionOverlay activeSegment={activeSegment} />

      {/* 3. Audio & SFX integration */}
      <AudioEngine />

      {/* 4. Sequence Timeline Distribution mapped to SSoT segments */}

      {/* Segment 0: HOOK (0.0s ~ 3.762s, f0 ~ f113) */}
      <Sequence from={0} durationInFrames={S(3.762)}>
        {frame < 12 ? (
          <Scene00_AlertBoot ticker="NVDA" />
        ) : (
          <Scene01_EventShock
            price={priceVal}
            callWall={callWallVal}
            putFloor={putFloorVal}
            nearestWall="call"
            distancePercent={distanceVal}
            darkPoolNotional={poolNotionalVal}
            darkPoolPercentile={poolPercentileVal}
            activeSegment={activeSegment}
          />
        )}
      </Sequence>

      {/* Segment 1: WALL (3.762s ~ 7.236s, f113 ~ f217) */}
      <Sequence from={S(3.762)} durationInFrames={S(3.474)}>
        <ContinuousTransformChart
          frame={frame - S(3.762)}
          scene="scene2"
          price={priceVal}
          callWall={callWallVal}
          putFloor={putFloorVal}
          gammaFlip={gammaFlipVal}
          distancePercent={distanceVal}
        />
      </Sequence>

      {/* Segment 2: CONTRAST (7.236s ~ 11.860s, f217 ~ f356) */}
      <Sequence from={S(7.236)} durationInFrames={S(4.624)}>
        <ContinuousTransformChart
          frame={frame - S(7.236)}
          scene="scene3"
          price={priceVal}
          callWall={callWallVal}
          putFloor={putFloorVal}
          gammaFlip={gammaFlipVal}
          distancePercent={distanceVal}
        />
      </Sequence>

      {/* Segment 3: UNMASK (11.860s ~ 17.424s, f356 ~ f523) */}
      <Sequence from={S(11.860)} durationInFrames={S(5.564)}>
        <ContinuousTransformChart
          frame={frame - S(11.860)}
          scene="scene4"
          price={priceVal}
          callWall={callWallVal}
          putFloor={putFloorVal}
          gammaFlip={gammaFlipVal}
          distancePercent={distanceVal}
        />
      </Sequence>

      {/* Segment 4: REGIME (17.424s ~ 20.793s, f523 ~ f624) */}
      <Sequence from={S(17.424)} durationInFrames={S(3.370)}>
        <ContinuousTransformChart
          frame={frame - S(17.424)}
          scene="scene5"
          price={priceVal}
          callWall={callWallVal}
          putFloor={putFloorVal}
          gammaFlip={gammaFlipVal}
          distancePercent={distanceVal}
        />
      </Sequence>

      {/* Segment 5: CTA (20.793s ~ 24.633s, f624 ~ f739) */}
      <Sequence from={S(20.793)} durationInFrames={S(3.840)}>
        <Scene05_CTAOutro />
      </Sequence>

      {/* 5. Universal Cinematic Vignette & Grain Noise Overlay */}
      <CinematicOverlay />

      {/* 6. Universal Floating compliance footer */}
      <ComplianceFooter text="Institutional flow analysis. Real-time updates at SignumHQ.com. Not financial advice." />
    </AbsoluteFill>
  );
};
