// ============================================================================
// MarketPressureBrief V35 — 데일리 모닝 특보 & 3-Shorts 분화 체계
// ============================================================================
// Complete 24-second (720 frames at 30fps) event-based insight short.
// Integrates:
// 1. Signature Scan Alert Boot Intro (0.0s - 0.4s, f0 - f12) -> Ticker dynamic boot
// 2. Breaking News Shock Event Delivery (0.4s - 3.5s, f12 - f105)
// 3. Normal Chart vs Hidden Structure Contrast with Scanner sweep (3.5s - 7.5s, f105 - f225)
// 4. Elastic Pacing Zoom and Screen Shake Tension (7.5s - 12.5s, f225 - f375)
// 5. High-Impact Insight Payoff (12.5s - 18.0s, f375 - f540)
// 6. Premium Outro with Clean Domain Box & Loop Scan overlays (18.0s - 24.0s, f540 - f720)
// ============================================================================

import React from 'react';
import {
  AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig,
  interpolate, spring, staticFile, Audio, random,
} from 'remotion';
import type { ShortsVideoInput, CaptionSegment } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO, LAYOUT } from '../brand/signumBrand';
import { ComplianceFooter } from '../components/ComplianceFooter';
import AlertTopBar from '../components/AlertTopBar';

export type MarketPressureBriefV35Props = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

const MONO_FAMILY = "'JetBrains Mono', 'SF Mono', monospace";

// ─── Theme Configurations Helper ─────────────────────────────────────────
interface ThemePalette {
  cyan: string;
  cyanGlow: string;
  coral: string;
  coralGlow: string;
  amber: string;
  amberGlow: string;
  shadowCyan: string;
  shadowCoral: string;
  shadowAmber: string;
}

const getThemePalette = (ticker: string): ThemePalette => {
  const t = ticker.toUpperCase();
  if (t === 'NVDA') {
    return {
      cyan: '#22c55e', // neon green
      cyanGlow: 'rgba(34,197,94,0.35)',
      coral: '#ef4444', // deep red
      coralGlow: 'rgba(239,68,68,0.35)',
      amber: '#fbbf24',
      amberGlow: 'rgba(251,191,36,0.3)',
      shadowCyan: '0 0 24px rgba(34,197,94,0.35), 0 4px 30px rgba(0,0,0,0.9)',
      shadowCoral: '0 0 20px rgba(239,68,68,0.35), 0 4px 30px rgba(0,0,0,0.9)',
      shadowAmber: '0 0 18px rgba(251,191,36,0.3), 0 4px 30px rgba(0,0,0,0.9)',
    };
  }
  if (t === 'TSLA') {
    return {
      cyan: '#ef4444', // crimson red
      cyanGlow: 'rgba(239,68,68,0.35)',
      coral: '#f87171', // soft coral red
      coralGlow: 'rgba(248,113,113,0.35)',
      amber: '#eab308', // gold/yellow
      amberGlow: 'rgba(234,179,8,0.3)',
      shadowCyan: '0 0 24px rgba(239,68,68,0.35), 0 4px 30px rgba(0,0,0,0.9)',
      shadowCoral: '0 0 20px rgba(248,113,113,0.35), 0 4px 30px rgba(0,0,0,0.9)',
      shadowAmber: '0 0 18px rgba(234,179,8,0.3), 0 4px 30px rgba(0,0,0,0.9)',
    };
  }
  // Default (SPY / QQQ - Cyan & Coral)
  return {
    cyan: BRAND.cyan,
    cyanGlow: BRAND.cyanGlow,
    coral: BRAND.coral,
    coralGlow: BRAND.coralGlow,
    amber: BRAND.amber,
    amberGlow: BRAND.amberGlow,
    shadowCyan: SHADOW.cyan,
    shadowCoral: SHADOW.coral,
    shadowAmber: SHADOW.amber,
  };
};

// ─── Procedural Layer: Slow Moving Candlestick Trace (Layer 3) ──────────────────
const ScrollingBackgroundChart: React.FC<{ opacity?: number; theme: ThemePalette }> = ({ opacity = 0.18, theme }) => {
  const frame = useCurrentFrame();
  const scrollOffset = (frame * 1.3) % 2400;
  return (
    <div style={{
      position: 'absolute', inset: 0, opacity, transform: `translateX(-${scrollOffset}px)`,
      display: 'flex', alignItems: 'center', gap: 60, pointerEvents: 'none', zIndex: Z.grid - 1,
    }}>
      {Array.from({ length: 50 }).map((_, i) => {
        const h = 120 + Math.sin(i * 0.5) * 180 + Math.cos(i * 0.25) * 80;
        const color = i % 2 === 0 ? theme.cyan : theme.coral;
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
const VolumeProfileOverlay: React.FC<{ opacity?: number; theme: ThemePalette }> = ({ opacity = 0.20, theme }) => {
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
        const color = i % 3 === 0 ? theme.coral : theme.cyan;
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
const TelemetryFragments: React.FC<{ theme: ThemePalette; ticker: string; limitBound: string }> = ({ theme, ticker, limitBound }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{
      position: 'absolute', inset: 50, pointerEvents: 'none', zIndex: Z.grid,
      fontFamily: MONO_FAMILY, fontSize: 13, color: `${theme.cyan}66`,
      textShadow: `0 0 8px ${theme.cyan}33`
    }}>
      <div style={{ position: 'absolute', top: 120, left: 20 }}>SYS_TRCK_SIG: 0x992B</div>
      <div style={{ position: 'absolute', top: 145, left: 20 }}>FLOW_STATE: {Math.sin(frame * 0.05) > 0 ? 'ACTIVE_FEED' : 'SECURE_LINK'}</div>
      <div style={{ position: 'absolute', bottom: 240, left: 20 }}>LIMIT_BND: {limitBound}</div>
      <div style={{ position: 'absolute', bottom: 265, left: 20 }}>DELTA_EXPOSURE: +0.421%</div>
      <div style={{ position: 'absolute', top: 480, right: 20 }}>GAMMA_VAL: 1.25M</div>
      <div style={{ position: 'absolute', top: 505, right: 20 }}>TICKER: {ticker.toUpperCase()}</div>
      <div style={{ position: 'absolute', top: 720, left: 20 }}>FEED_LATENCY: 1.2ms</div>
      <div style={{ position: 'absolute', top: 745, left: 20 }}>SEC_HASH: SHA256//SIG</div>
    </div>
  );
};

// ─── Procedural Layer: Soft active cyan/red glow zones (Layer 6) ─────────────
const GlowZones: React.FC<{ theme: ThemePalette }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const glowIntensity = 0.75 + Math.sin(frame * 0.08) * 0.15;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: Z.bg + 1 }}>
      <div style={{
        position: 'absolute', top: 350, left: 80, right: 80, height: 500,
        background: `radial-gradient(circle, ${theme.coral}24 0%, transparent 70%)`,
        opacity: glowIntensity,
      }} />
      <div style={{
        position: 'absolute', bottom: 300, left: 150, width: 750, height: 750,
        background: `radial-gradient(circle, ${theme.cyan}1a 0%, transparent 70%)`,
        opacity: glowIntensity,
      }} />
    </div>
  );
};

// ─── Premium Living Terminal Background System (L0-L8 Combined) ────────────────
const LivingTerminalBackground: React.FC<{ sceneName?: string; theme: ThemePalette; ticker: string; limitBound: string }> = ({ sceneName = 'default', theme, ticker, limitBound }) => {
  const frame = useCurrentFrame();

  const gridX = (frame * 0.25) % 120;
  const gridY = (frame * 0.35) % 120;

  const grainSeed = Math.floor(random(`grain-${sceneName}-${frame}`) * 1000);
  const grainTx = (random(`grain-tx-${frame}`) - 0.5) * 3;
  const grainTy = (random(`grain-ty-${frame}`) - 0.5) * 3;

  return (
    <AbsoluteFill style={{ background: '#020409', overflow: 'hidden', zIndex: Z.bg }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 135% 95% at 50% 35%, #04091a 0%, #010204 80%),
          radial-gradient(ellipse 115% 75% at 15% 85%, #050c1f 0%, transparent 65%),
          linear-gradient(180deg, #010204 0%, #04091a 35%, #050c1f 65%, #010204 100%)
        `,
        zIndex: Z.bg,
      }} />

      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          radial-gradient(${theme.cyan}24 1.5px, transparent 1.5px),
          radial-gradient(${theme.cyan}0f 1px, transparent 1px)
        `,
        backgroundSize: '80px 80px, 20px 20px',
        backgroundPosition: `${gridX}px ${gridY}px, ${gridX}px ${gridY}px`,
        zIndex: Z.grid,
        pointerEvents: 'none',
      }} />

      <ScrollingBackgroundChart theme={theme} />
      <VolumeProfileOverlay theme={theme} />
      <TelemetryFragments theme={theme} ticker={ticker} limitBound={limitBound} />
      <GlowZones theme={theme} />

      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 75% 60% at 50% 45%, transparent 0%, rgba(0,0,0,0.90) 100%)',
        zIndex: Z.glows + 1,
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'absolute', inset: 0,
        zIndex: Z.glows + 2,
        pointerEvents: 'none',
        opacity: 0.04,
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

      <div style={{
        position: 'absolute', inset: 30,
        border: `1.5px solid ${theme.cyan}24`,
        pointerEvents: 'none', zIndex: Z.grid + 2,
      }}>
        <div style={{ position: 'absolute', top: -5, left: -5, width: 20, height: 20, borderTop: `3px solid ${theme.cyan}99`, borderLeft: `3px solid ${theme.cyan}99` }} />
        <div style={{ position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderTop: `3px solid ${theme.cyan}99`, borderRight: `3px solid ${theme.cyan}99` }} />
        <div style={{ position: 'absolute', bottom: -5, left: -5, width: 20, height: 20, borderBottom: `3px solid ${theme.cyan}99`, borderLeft: `3px solid ${theme.cyan}99` }} />
        <div style={{ position: 'absolute', bottom: -5, right: -5, width: 20, height: 20, borderBottom: `3px solid ${theme.cyan}99`, borderRight: `3px solid ${theme.cyan}99` }} />

        <div style={{ position: 'absolute', top: 8, left: 12, color: `${theme.cyan}cc`, fontSize: 13, fontFamily: MONO_FAMILY, fontWeight: 700, letterSpacing: '0.05em' }}>SYS: ACTIVE</div>
        <div style={{ position: 'absolute', top: 8, right: 12, color: `${theme.cyan}cc`, fontSize: 13, fontFamily: MONO_FAMILY, fontWeight: 700, letterSpacing: '0.05em' }}>NET: LIVE_STRM</div>
        <div style={{ position: 'absolute', bottom: 8, left: 12, color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: MONO_FAMILY }}>[SCALE: 9:16 CBR MASTER]</div>
        <div style={{ position: 'absolute', bottom: 8, right: 12, color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: MONO_FAMILY }}>[MODE: EVENT_SHOCK_V35]</div>
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

// ─── Directional Institutional Flow Particles V35 ───────────
const FlowParticlesV35: React.FC<{
  startY: number; endY: number; count?: number; color?: string; frameOffset?: number; speedFactor?: number;
}> = ({ startY, endY, count = 16, color = BRAND.cyan, frameOffset = 0, speedFactor = 1.0 }) => {
  const frame = useCurrentFrame() + frameOffset;
  const height = Math.abs(endY - startY);
  
  return (
    <div style={{ position: 'absolute', left: 80, right: 80, top: Math.min(startY, endY), height: Math.max(10, height), pointerEvents: 'none', zIndex: Z.wallViz - 1 }}>
      {Array.from({ length: count }).map((_, i) => {
        const cycleProgress = ((frame * (0.015 + random(i + 1) * 0.02) * speedFactor) + random(i + 9)) % 1.0;
        const easedProgress = 1 - Math.pow(1 - cycleProgress, 2.5);
        
        const xStart = 150 + random(i + 3) * 350; 
        const xEnd = 740 + (random(i + 4) - 0.5) * 80;  
        const x = interpolate(easedProgress, [0, 1], [xStart, xEnd]);
        
        const y = interpolate(easedProgress, [0, 1], [height, 0]);
        const op = interpolate(cycleProgress, [0, 0.15, 0.9, 1.0], [0, 0.95, 0.95, 0]);
        
        const sz = 8 + random(i + 7) * 14;
        const glowMult = interpolate(easedProgress, [0, 0.7, 1.0], [1.0, 1.8, 3.5]);
        
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y, width: sz, height: sz,
            borderRadius: '50%', background: color, opacity: op,
            boxShadow: `0 0 ${sz * 3 * glowMult}px ${color}, 0 0 ${sz * 1.5 * glowMult}px ${color}`,
          }} />
        );
      })}
    </div>
  );
};

// ─── Phrase-Level Safe Caption Overlay ──────────────────────────────────────
const SafeCaptionOverlay: React.FC<{ captions: CaptionSegment[]; frame: number; theme: ThemePalette }> = ({ captions, frame, theme }) => {
  if (frame >= S(24.0)) return null;
  if (!captions || captions.length === 0) return null;

  const activeCaption = captions.find(c => frame >= c.startFrame && frame < c.endFrame);
  if (!activeCaption) return null;

  // Scene 01 (0.0s - 3.5s) targets Y=1410 (bottom), Outro (18s+) targets Y=1250 (bottom-middle), others target Y=380 (top)
  const isScene01 = frame >= S(0.0) && frame < S(3.5);
  const isOutro = frame >= S(18.0);
  const targetY = isScene01 ? 1410 : (isOutro ? 1250 : 380);
  
  const isNotTheWall = activeCaption.text.includes('NOT THE WALL') || activeCaption.text.includes('NOT A PREDICTION');
  const isPressureMap = activeCaption.text.includes('PRESSURE MAP') || activeCaption.text.includes('PRESSURE IS BUILDING') || activeCaption.text.includes('TACTICAL MAP');
  const isTheGap = activeCaption.text.includes('THE GAP IS');
  const isBrand = activeCaption.text.includes('SIGNUMHQ.COM');
  
  let fontSize = isScene01 ? 40 : (isOutro ? 60 : (activeCaption.emphasis ? 76 : 60));
  let color = activeCaption.color || (activeCaption.emphasis ? theme.cyan : BRAND.text);
  let textShadow = '0 3px 20px rgba(0,0,0,0.98), 0 0 35px rgba(0,0,0,0.92)';
  
  if (isNotTheWall) {
    fontSize = 76;
    color = theme.coral;
    textShadow = `0 0 50px ${theme.coralGlow}, 0 3px 15px rgba(0,0,0,0.98)`;
  } else if (isPressureMap) {
    fontSize = 80;
    color = theme.cyan;
    textShadow = `0 0 55px ${theme.cyanGlow}, 0 3px 15px rgba(0,0,0,0.98)`;
  } else if (isTheGap) {
    fontSize = 86;
    color = theme.amber;
    textShadow = `0 0 45px ${theme.amberGlow}, 0 3px 15px rgba(0,0,0,0.98)`;
  } else if (isBrand) {
    fontSize = 72;
    color = theme.cyan;
    textShadow = `0 0 45px ${theme.cyanGlow}, 0 3px 15px rgba(0,0,0,0.98)`;
  }

  return (
    <div style={{
      position: 'absolute', left: 70, right: 70, top: targetY,
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: Z.caption + 50, pointerEvents: 'none',
    }}>
      <div style={{
        fontFamily: isScene01 ? MONO_FAMILY : "'Outfit', 'Montserrat', 'SF Pro Display', sans-serif",
        fontWeight: 900,
        fontSize,
        color,
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: isScene01 ? '0.08em' : '-0.02em',
        lineHeight: 1.05,
        textShadow,
      }}>
        {activeCaption.text}
      </div>
    </div>
  );
};

// ─── Audio Engine ───
const AudioEngine: React.FC<{ ticker: string }> = ({ ticker }) => {
  const isSpy = ticker.toUpperCase() === 'SPY';
  const voiceUrl = isSpy ? 'shorts/audio/v35_spy_voice.mp3' : 'shorts/audio/v35_nvda_voice.mp3';

  return (
    <>
      <Audio src={staticFile(voiceUrl)} volume={0.98} />
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.42} startFrom={0} endAt={S(24.0)} />
      {/* Frame 0: Glitch Alert Ping */}
      <Sequence from={0}><Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.8} /></Sequence>
      {/* 0.4s: Low bass impact boom */}
      <Sequence from={S(0.4)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.85} /></Sequence>
      {/* 7.0s: Scanner sweep sweeps */}
      <Sequence from={S(7.0)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.65} /></Sequence>
      {/* 18.0s: Mechanical CTA entry impact */}
      <Sequence from={S(18.0)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.6} /></Sequence>
    </>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 00: SIGNATURE SCAN ALERT BOOT (0.0s - 0.4s, f0 - f12)
// ═════════════════════════════════════════════════════════════════════════════
const Scene00_AlertBoot: React.FC<{ theme: ThemePalette; ticker: string }> = ({ theme, ticker }) => {
  const frame = useCurrentFrame();
  const scanY = interpolate(frame, [0, 12], [200, 1720]);
  const glitch = frame % 3 === 0;

  return (
    <AbsoluteFill style={{ background: '#020409', zIndex: Z.wallViz + 20 }}>
      {/* Grid structure background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(${theme.cyan}24 1.5px, transparent 1.5px)`,
        backgroundSize: '40px 40px',
        opacity: 0.7,
      }} />

      {/* Moving scanner line */}
      <div style={{
        position: 'absolute', left: 40, right: 40, top: scanY, height: 4,
        background: theme.cyan, boxShadow: `0 0 30px ${theme.cyanGlow}, 0 0 10px #ffffff`,
      }} />

      {/* Glitching Logo */}
      <div style={{
        position: 'absolute', top: 550, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        flexDirection: 'column',
      }}>
        <svg width="220" height="220" viewBox="246 247 530 530" fill="none" style={{
          transform: glitch ? 'skewX(-15deg) scale(1.05)' : 'none',
          filter: glitch ? `hue-rotate(${ticker === 'NVDA' ? '120deg' : '0deg'}) blur(1px)` : 'none',
        }}>
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={theme.cyan} />
        </svg>

        <div style={{
          fontFamily: MONO_FAMILY, fontSize: 32, fontWeight: 900, color: theme.cyan,
          letterSpacing: '0.2em', textShadow: `0 0 15px ${theme.cyanGlow}`, marginTop: 45,
          opacity: glitch ? 0.3 : 1.0,
        }}>
          SIGNUMHQ
        </div>

        <div style={{
          fontFamily: MONO_FAMILY, fontSize: 18, color: BRAND.text,
          letterSpacing: '0.08em', marginTop: 15,
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: theme.coral, display: 'inline-block', animation: 'pulse 1s infinite' }} />
          SYSTEM SCAN: [{ticker.toUpperCase()}] / GEX DETECTED...
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 01: EVENT SHOCK & DETECT (0.4s - 3.5s, f12 - f105)
// ═════════════════════════════════════════════════════════════════════════════
interface Scene01Props {
  theme: ThemePalette;
  ticker: string;
  price: number;
  callWall: number;
  putFloor: number;
  nearestWall: string;
  distancePercent: number;
  darkPoolNotional: number;
  darkPoolPercentile: number;
}
const Scene01_EventShock: React.FC<Scene01Props> = ({
  theme, ticker, price, callWall, putFloor, nearestWall, distancePercent, darkPoolNotional, darkPoolPercentile
}) => {
  const frame = useCurrentFrame();
  const wallY = 600;
  const priceY = 820;

  const decryptGlow = Math.sin(frame * 0.4) > 0 ? theme.coral : theme.cyan;
  const formattedNotional = `$${Math.round(darkPoolNotional / 1000000)}M`;
  const isSpy = ticker.toUpperCase() === 'SPY';

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      {/* Premium Clean Top Bar */}
      <AlertTopBar ticker={ticker} price={price} alertText={isSpy ? "OFF-EXCHANGE FLOW DETECTED" : "INSTITUTIONAL BLOCK EXPOSED"} isV33={true} />
      
      <div style={{
        position: 'absolute', top: 40, right: LAYOUT.safeR, zIndex: Z.hookText + 5,
        fontFamily: MONO_FAMILY, fontSize: 13, fontWeight: 900, color: decryptGlow,
        textShadow: `0 0 10px ${decryptGlow}`, display: 'flex', alignItems: 'center', gap: 6
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: decryptGlow, display: 'inline-block' }} />
        {isSpy ? '[FLOW_EXPOSED]' : '[BLOCKS_UNLOCKED]'}
      </div>

      {/* Massive Hook Headline - command attention */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 60, left: LAYOUT.safeL, right: LAYOUT.safeR,
        display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: Z.hookText,
      }}>
        <div style={{
          fontSize: 195, fontWeight: 900, fontFamily: MONO_FAMILY, color: BRAND.text,
          textAlign: 'center', lineHeight: 0.85, textShadow: `0 0 60px rgba(255,255,255,0.45), ${SHADOW.hero}`,
          letterSpacing: '-0.04em'
        }}>
          {formattedNotional}
        </div>
        <div style={{
          fontSize: 38, fontWeight: 900, fontFamily: MONO_FAMILY, color: theme.cyan,
          textAlign: 'center', marginTop: 10, letterSpacing: '0.15em', textShadow: theme.shadowCyan
        }}>
          {isSpy ? 'OFF-EXCHANGE FLOW' : 'INSTITUTIONAL BLOCKS'}
        </div>

        {/* %ILE Badge */}
        <div style={{
          fontFamily: MONO_FAMILY, fontSize: 18, color: '#03050c', background: theme.amber,
          padding: '6px 16px', borderRadius: 4, fontWeight: 900, marginTop: 15,
          boxShadow: `0 0 20px ${theme.amberGlow}`
        }}>
          {darkPoolPercentile}th %ILE INSTITUTIONAL REGIME
        </div>
      </div>

      {/* Target Wall Box */}
      <div style={{
        position: 'absolute', top: 1120, left: LAYOUT.safeL, right: LAYOUT.safeR,
        display: 'flex', justifyContent: 'center', zIndex: Z.hookText + 10,
      }}>
        <div style={{
          background: 'rgba(3,6,12,0.92)',
          border: `3px solid ${theme.amber}`,
          boxShadow: `0 0 35px ${theme.amberGlow}`,
          borderRadius: 8, padding: '16px 36px',
          textAlign: 'center',
        }}>
          <span style={{
            fontFamily: MONO_FAMILY, fontSize: 44, fontWeight: 900,
            color: theme.amber, letterSpacing: '0.08em',
            textShadow: `0 0 15px ${theme.amber}`
          }}>
            NEAR {ticker.toUpperCase()}'S ${Math.round(callWall)} WALL
          </span>
        </div>
      </div>

      {/* Live chart map exposed immediately in the middle half */}
      <div style={{
        position: 'absolute', top: 520, bottom: 700, left: LAYOUT.safeL, right: LAYOUT.safeR,
        border: `2px solid ${theme.cyan}66`, borderRadius: 12,
        background: 'rgba(3,6,12,0.85)', overflow: 'hidden',
        boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
        zIndex: Z.data,
      }}>
        <div style={{ position: 'absolute', top: 80, left: 0, right: 0, height: 1, background: `rgba(255,255,255,0.06)` }} />
        <div style={{ position: 'absolute', top: 240, left: 0, right: 0, height: 1, background: `rgba(255,255,255,0.06)` }} />
        <div style={{ position: 'absolute', top: 400, left: 0, right: 0, height: 1, background: `rgba(255,255,255,0.06)` }} />

        {/* Visible glowing price vector curve */}
        <svg width="960" height="700" style={{ position: 'absolute', top: -520, left: 0 }}>
          <path d={`M 80,${priceY + 120} Q 400,${priceY - 80} 600,${priceY} T 960,${priceY - 30}`} fill="none" stroke={theme.cyan} strokeWidth="6" />
        </svg>

        {/* Pulsing price dot */}
        <div style={{
          position: 'absolute', left: 600 - 18, top: (priceY - 520) - 18, width: 36, height: 36,
          borderRadius: '50%', background: theme.cyan,
          boxShadow: `0 0 35px ${theme.cyanGlow}, 0 0 10px #ffffff`, zIndex: Z.data + 2,
        }} />

        {/* Red Call Wall Resistance Line */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: wallY - 520, height: 8, background: theme.coral,
          boxShadow: `0 0 55px ${theme.coralGlow}, 0 0 15px ${theme.coral}`,
        }} />
        <div style={{
          position: 'absolute', right: 20, top: (wallY - 520) - 34,
          color: theme.coral, fontSize: 22, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: theme.shadowCoral,
        }}>[{isSpy ? 'CALL RESISTANCE' : 'CORE CEILING'} ${Math.round(callWall)}.00]</div>

        {/* Compress gap bracket */}
        <div style={{ position: 'absolute', left: 740, top: wallY - 520, height: priceY - wallY }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: theme.amber, boxShadow: `0 0 25px ${theme.amberGlow}` }} />
          <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: theme.amber }} />
          <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: theme.amber }} />
        </div>
        <div style={{
          position: 'absolute', left: 765, top: (wallY - 520) + 70,
          color: theme.amber, fontSize: 32, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: theme.shadowAmber
        }}>
          {distancePercent}% GAP
        </div>

        {/* Directional flow packets */}
        <FlowParticlesV35 startY={wallY - 520} endY={priceY - 520} count={16} speedFactor={1.6} color={theme.cyan} />
      </div>

      {/* Volumetric premium chart histogram at bottom */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 80, left: LAYOUT.safeL, right: LAYOUT.safeR, height: 160,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', zIndex: Z.data,
        background: 'linear-gradient(180deg, transparent, rgba(34,211,238,0.03))',
        padding: '10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)'
      }}>
        {Array.from({ length: 22 }).map((_, i) => {
          const h = 40 + Math.sin(frame * 0.18 + i) * 80 + Math.cos(frame * 0.12 - i) * 35;
          return (
            <div key={i} style={{
              width: 26, height: Math.max(15, h), background: `linear-gradient(0deg, ${theme.cyan}44 0%, ${theme.cyan} 100%)`,
              borderRadius: '6px 6px 0 0',
              boxShadow: `0 0 25px ${theme.cyanGlow}, 0 0 5px ${theme.cyan}`,
              borderLeft: '1px solid rgba(255,255,255,0.1)',
              borderRight: '1px solid rgba(0,0,0,0.4)',
            }} />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── CONTINUOUS TRANSFORMING PRICE CHART (SCENES 02 - 04) ────────────────────
interface ContinuousChartProps {
  frame: number;
  scene: 'scene2' | 'scene3' | 'scene4';
  theme: ThemePalette;
  ticker: string;
  price: number;
  callWall: number;
  putFloor: number;
  gammaFlip: number;
  distancePercent: number;
}
const ContinuousTransformChart: React.FC<ContinuousChartProps> = ({
  frame, scene, theme, ticker, price, callWall, putFloor, gammaFlip, distancePercent
}) => {
  const chartTop = 520;
  const chartBottom = 1220;
  const chartHeight = chartBottom - chartTop;

  // Render relative coordinates
  const callWallY = chartTop + 80;    
  const gammaFlipY = chartTop + 400;  
  const putFloorY = chartTop + 630;   

  // Price position mapping
  let activePriceY = chartTop + 300;
  if (scene === 'scene2') {
    activePriceY = chartTop + 380;
  } else if (scene === 'scene3') {
    activePriceY = interpolate(frame, [0, S(2.5)], [chartTop + 380, chartTop + 140], { extrapolateRight: 'clamp' });
  } else if (scene === 'scene4') {
    activePriceY = chartTop + 140;
  }

  const bracketH = Math.max(10, activePriceY - callWallY);

  // --- Zooming mechanics ---
  let containerTransform = 'scale(1) translate(0px, 0px)';
  if (scene === 'scene3') {
    const zoomProgress = spring({
      frame,
      fps: 30,
      config: { damping: 12, mass: 0.8, stiffness: 90 }
    });
    const scale = interpolate(zoomProgress, [0, 1], [1, 1.52]);
    const translateY = interpolate(zoomProgress, [0, 1], [0, -90]);
    containerTransform = `scale(${scale}) translateY(${translateY}px)`;
  } else if (scene === 'scene4') {
    containerTransform = 'scale(1.22) translateY(-40px)';
  }

  // --- Screen shake logic during compression lock in ---
  let shakeStyle: React.CSSProperties = {};
  if (scene === 'scene3' && frame >= S(0.0) && frame < S(0.6)) {
    const shakeFrame = frame;
    const intensity = interpolate(shakeFrame, [0, 18], [12, 0], { extrapolateRight: 'clamp' });
    const sx = (Math.sin(shakeFrame * 1.5) * intensity);
    const sy = (Math.cos(shakeFrame * 1.8) * intensity);
    shakeStyle = { transform: `translate(${sx}px, ${sy}px)` };
  }

  // Danger warning glow color
  const warmTintOpacity = (scene === 'scene3')
    ? interpolate(frame, [0, S(1.0)], [0, 0.28], { extrapolateRight: 'clamp' })
    : (scene === 'scene4' ? 0.18 : 0);

  // Product Unlock Reveal Pulse
  const isScannerSweepFrame = scene === 'scene2' && frame >= S(3.5);
  const sweepProgress = isScannerSweepFrame
    ? interpolate(frame - S(3.5), [0, S(0.4)], [0, 1], { extrapolateRight: 'clamp' })
    : 0;

  const revealProgress = scene === 'scene2'
    ? (isScannerSweepFrame ? sweepProgress : 0)
    : 1.0; 

  const pulseIntensity = isScannerSweepFrame
    ? interpolate(sweepProgress, [0, 0.4, 1.0], [0, 1.0, 0], { extrapolateRight: 'clamp' })
    : 0;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      {warmTintOpacity > 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(circle, ${theme.coral}33 0%, transparent 80%)`,
          opacity: warmTintOpacity, zIndex: Z.bg + 2, pointerEvents: 'none'
        }} />
      )}

      {/* Shake container */}
      <div style={{ position: 'absolute', inset: 0, ...shakeStyle }}>
        {/* Grid Outline with zoom */}
        <div style={{
          position: 'absolute', left: 80, right: 80, top: chartTop, height: chartHeight,
          border: `2px solid ${theme.cyan}66`, borderRadius: 12,
          background: 'rgba(3,6,12,0.85)', overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
          transform: containerTransform,
          transition: 'transform 0.12s ease-out'
        }}>
          <div style={{ position: 'absolute', top: 80, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ position: 'absolute', top: 240, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ position: 'absolute', top: 400, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ position: 'absolute', top: 560, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.06)' }} />

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

          {/* Product Unlock Reveal Pulse Overlay */}
          {pulseIntensity > 0 && (
            <div style={{
              position: 'absolute', inset: 0,
              background: `${theme.cyan}26`,
              boxShadow: `inset 0 0 100px ${theme.cyan}99`,
              pointerEvents: 'none', zIndex: Z.data + 10,
              opacity: pulseIntensity,
            }} />
          )}
        </div>

        {/* Structured elements inside zoomed container */}
        <div style={{ transform: containerTransform, position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          
          {/* Scene 02: Normal Chart Contrast */}
          {scene === 'scene2' && (() => {
            const pathColor = interpolate(revealProgress, [0, 0.1], [0.35, 1.0]);
            
            return (
              <>
                <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: Z.data }}>
                  <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke={revealProgress > 0.1 ? theme.cyan : `rgba(255,255,255,${pathColor})`} strokeWidth="4" />
                </svg>

                {isScannerSweepFrame && <ScannerLine progress={sweepProgress} color={theme.cyan} />}

                {/* Call Wall, Put Floor, Gamma Flip reveal under scanner sweep */}
                <div style={{ zIndex: Z.data, opacity: revealProgress }}>
                  {/* Red Call Wall */}
                  <div style={{
                    position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: theme.coral,
                    boxShadow: `0 0 55px ${theme.coralGlow}, 0 0 15px ${theme.coral}`,
                  }} />
                  <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: theme.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: theme.shadowCoral }}>
                    [{ticker === 'NVDA' ? 'CORE CEILING' : 'CALL WALL'} ${Math.round(callWall)}.00]
                  </div>

                  {/* Put Floor */}
                  <div style={{
                    position: 'absolute', left: 80, right: 80, top: putFloorY, height: 6, background: theme.cyan,
                    boxShadow: `0 0 45px ${theme.cyanGlow}`,
                  }} />
                  <div style={{ position: 'absolute', left: 100, top: putFloorY + 12, color: theme.cyan, fontFamily: MONO_FAMILY, fontSize: 18, fontWeight: 900, textShadow: theme.shadowCyan }}>
                    [{ticker === 'NVDA' ? 'CORE BASE' : 'PUT FLOOR'} ${Math.round(putFloor)}.00]
                  </div>

                  {/* Gamma Flip */}
                  <div style={{
                    position: 'absolute', left: 80, right: 80, top: gammaFlipY, height: 4, background: '#3b82f6',
                    boxShadow: `0 0 25px rgba(59,130,246,0.8)`,
                  }} />
                  <div style={{ position: 'absolute', left: 100, top: gammaFlipY - 26, color: '#3b82f6', fontFamily: MONO_FAMILY, fontSize: 16, fontWeight: 900 }}>
                    [GAMMA FLIP ${Math.round(gammaFlip)}.00]
                  </div>
                  
                  {/* Gap bracket */}
                  <div style={{ position: 'absolute', left: 740, top: callWallY, height: activePriceY - callWallY, zIndex: Z.data }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: theme.amber, boxShadow: `0 0 25px ${theme.amberGlow}` }} />
                    <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: theme.amber }} />
                    <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: theme.amber }} />
                  </div>
                </div>
              </>
            );
          })()}

          {/* Scene 03: The Gap Tension Zoom */}
          {scene === 'scene3' && (() => {
            const glowPulse = 45 + Math.sin(frame * 0.3) * 35;
            
            return (
              <>
                <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, zIndex: Z.data }}>
                  <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke={theme.cyan} strokeWidth="5" />
                </svg>

                {/* Red Call Resistance Wall */}
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: theme.coral,
                  boxShadow: `0 0 75px ${theme.coralGlow}, 0 0 25px ${theme.coral}`, zIndex: Z.data,
                }} />
                <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: theme.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: theme.shadowCoral, zIndex: Z.data }}>
                  [{ticker === 'NVDA' ? 'CORE CEILING' : 'CALL WALL'} ${Math.round(callWall)}.00]
                </div>

                {/* Glowing pulsing price dot */}
                <div style={{
                  position: 'absolute', left: 600 - 18, top: activePriceY - 18, width: 36, height: 36,
                  borderRadius: '50%', background: theme.cyan,
                  boxShadow: `0 0 ${glowPulse}px ${theme.cyanGlow}, 0 0 12px #ffffff`, zIndex: Z.data + 2,
                }} />

                {/* Bracket compression */}
                <div style={{ position: 'absolute', left: 740, top: callWallY, height: bracketH, zIndex: Z.data }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: theme.amber, boxShadow: `0 0 35px ${theme.amberGlow}` }} />
                  <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: theme.amber }} />
                  <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: theme.amber }} />
                </div>

                {/* Directional flow particles clustering in the gap */}
                <FlowParticlesV35 startY={callWallY} endY={activePriceY} count={24} speedFactor={2.2} color={theme.cyan} />
              </>
            );
          })()}

          {/* Scene 04: Insight Payoff (Fully unmasked telemetry) */}
          {scene === 'scene4' && (() => {
            return (
              <>
                <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.6, zIndex: Z.data }}>
                  <path d={`M 80,${chartTop + 450} Q 400,${chartTop + 280} 600,${activePriceY} T 1000,${chartTop + 320}`} fill="none" stroke={theme.cyan} strokeWidth="5" />
                </svg>

                {/* Call Wall */}
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: callWallY, height: 8, background: theme.coral,
                  boxShadow: `0 0 65px rgba(239,68,68,0.7), 0 0 20px rgba(239,68,68,1.0)`, zIndex: Z.data,
                }} />
                <div style={{ position: 'absolute', right: 100, top: callWallY - 32, color: theme.coral, fontFamily: MONO_FAMILY, fontSize: 20, fontWeight: 900, textShadow: theme.shadowCoral, zIndex: Z.data }}>
                  [{ticker === 'NVDA' ? 'CORE CEILING' : 'CALL WALL'} ${Math.round(callWall)}.00]
                </div>

                {/* Gamma Flip */}
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: gammaFlipY, height: 4, background: '#3b82f6',
                  boxShadow: `0 0 25px rgba(59,130,246,0.8)`, zIndex: Z.data,
                }} />
                <div style={{ position: 'absolute', left: 100, top: gammaFlipY - 26, color: '#3b82f6', fontFamily: MONO_FAMILY, fontSize: 16, fontWeight: 900, zIndex: Z.data }}>
                  [GAMMA FLIP ${Math.round(gammaFlip)}.00]
                </div>

                {/* Put Floor */}
                <div style={{
                  position: 'absolute', left: 80, right: 80, top: putFloorY, height: 6, background: theme.cyan,
                  boxShadow: `0 0 45px rgba(34,211,238,0.6)`, zIndex: Z.data,
                }} />
                <div style={{ position: 'absolute', left: 100, top: putFloorY + 12, color: theme.cyan, fontFamily: MONO_FAMILY, fontSize: 18, fontWeight: 900, textShadow: theme.shadowCyan, zIndex: Z.data }}>
                  [{ticker === 'NVDA' ? 'CORE BASE' : 'PUT FLOOR'} ${Math.round(putFloor)}.00]
                </div>

                {/* Price Dot */}
                <div style={{
                  position: 'absolute', left: 600 - 18, top: activePriceY - 18, width: 36, height: 36,
                  borderRadius: '50%', background: theme.cyan,
                  boxShadow: `0 0 40px ${theme.cyanGlow}, 0 0 10px #ffffff`, zIndex: Z.data + 2,
                }} />

                {/* Gap brackets */}
                <div style={{ position: 'absolute', left: 740, top: callWallY, height: activePriceY - callWallY, zIndex: Z.data }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: '100%', background: theme.amber, boxShadow: `0 0 30px ${theme.amberGlow}` }} />
                  <div style={{ position: 'absolute', left: -15, top: 0, width: 22, height: 6, background: theme.amber }} />
                  <div style={{ position: 'absolute', left: -15, bottom: 0, width: 22, height: 6, background: theme.amber }} />
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 05: PREMIUM CTA & LOOP OUTRO (18.0s - 24.0s, f540 - f720)
// ═════════════════════════════════════════════════════════════════════════════
const Scene05_CTAOutro: React.FC<{ theme: ThemePalette; ticker: string; callWall: number }> = ({ theme, ticker, callWall }) => {
  const frame = useCurrentFrame();

  const lockScale = spring({
    frame,
    fps: 30,
    config: { damping: 10, mass: 0.9, stiffness: 120 }
  });

  const neonPulse = 30 + Math.sin(frame * 0.15) * 15;

  // Seamless Loop: Fade in fading structure during the last 15 frames
  const isLoopCue = frame >= S(4.5); // f705 - f720
  const loopOpacity = isLoopCue 
    ? interpolate(frame - S(4.5), [0, 15], [0, 0.72], { extrapolateRight: 'clamp' })
    : 0;

  return (
    <AbsoluteFill style={{ zIndex: Z.brand }}>
      {loopOpacity > 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          background: '#020409', zIndex: Z.bg + 1, opacity: loopOpacity, pointerEvents: 'none'
        }}>
          {/* Faint Red Wall Line at loop overlay to stitch to Frame 0 */}
          <div style={{
            position: 'absolute', left: 80, right: 80, top: 600, height: 8, background: theme.coral,
            boxShadow: `0 0 45px ${theme.coralGlow}, 0 0 10px ${theme.coral}`,
          }} />
        </div>
      )}

      {/* CTA Box wrapper */}
      <div style={{
        position: 'absolute', top: 580, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        flexDirection: 'column',
        transform: `scale(${lockScale})`,
        zIndex: Z.brand + 5,
      }}>
        {/* Vector SG branding */}
        <svg width="180" height="180" viewBox="246 247 530 530" fill="none" style={{
          filter: `drop-shadow(0 0 15px ${theme.cyanGlow})`,
        }}>
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={theme.cyan} />
        </svg>

        {/* Branded box outline container */}
        <div style={{
          marginTop: 60,
          background: 'rgba(3,6,12,0.92)',
          border: `3px solid ${theme.cyan}`,
          borderRadius: 12,
          padding: '24px 60px',
          boxShadow: `0 0 ${neonPulse}px ${theme.cyanGlow}, inset 0 0 20px ${theme.cyanGlow}`,
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 26, fontFamily: MONO_FAMILY, color: BRAND.text,
            letterSpacing: '0.08em', fontWeight: 700,
          }}>
            [SEE HIDDEN STRUCTURE]
          </div>
          <div style={{
            fontSize: 54, fontFamily: MONO_FAMILY, color: theme.cyan,
            letterSpacing: '0.12em', fontWeight: 900, marginTop: 8,
            textShadow: `0 0 15px ${theme.cyan}`
          }}>
            SIGNUMHQ.COM
          </div>
        </div>

        {/* Small subtitle indicator */}
        <div style={{
          marginTop: 35, fontSize: 18, fontFamily: MONO_FAMILY, color: BRAND.mutedLight,
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
export const MarketPressureBriefV35: React.FC<MarketPressureBriefV35Props> = ({
  ticker = 'SPY',
  structureVisual,
  captions = [],
}) => {
  const frame = useCurrentFrame();
  const theme = getThemePalette(ticker);

  const priceVal = structureVisual?.price ?? 592.31;
  const callWallVal = structureVisual?.callWall ?? 600.00;
  const putFloorVal = structureVisual?.putFloor ?? 580.00;
  const gammaFlipVal = structureVisual?.gammaFlipLevel ?? 588.00;
  const distanceVal = structureVisual?.distancePercent ?? 1.3;
  const poolNotionalVal = structureVisual?.darkPoolNotional ?? 420000000;
  const poolPercentileVal = structureVisual?.darkPoolPercentile ?? 91;

  const formattedLimitBound = `${Math.round(callWallVal)}.00 / ${Math.round(putFloorVal)}.00`;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {/* 1. Integrated Living Telemetry Grid Canvas */}
      <LivingTerminalBackground theme={theme} ticker={ticker} limitBound={formattedLimitBound} />

      {/* 2. Phrase-Level Caption Engine */}
      <SafeCaptionOverlay captions={captions} frame={frame} theme={theme} />

      {/* 3. Audio & SFX integration */}
      <AudioEngine ticker={ticker} />

      {/* Sequence Timeline distribution */}

      {/* Scene 00: Boot Scans (0.0s - 0.4s, f0 - f12) */}
      <Sequence from={0} durationInFrames={12}>
        <Scene00_AlertBoot theme={theme} ticker={ticker} />
      </Sequence>

      {/* Scene 01: Breaking Shock Event (0.4s - 3.5s, f12 - f105) */}
      <Sequence from={12} durationInFrames={93}>
        <Scene01_EventShock
          theme={theme}
          ticker={ticker}
          price={priceVal}
          callWall={callWallVal}
          putFloor={putFloorVal}
          nearestWall={structureVisual?.nearestWall ?? 'call'}
          distancePercent={distanceVal}
          darkPoolNotional={poolNotionalVal}
          darkPoolPercentile={poolPercentileVal}
        />
      </Sequence>

      {/* Scene 02: Normal Chart vs GEX layers Sweep (3.5s - 7.5s, f105 - f225) */}
      <Sequence from={105} durationInFrames={120}>
        <ContinuousTransformChart
          frame={frame - 105}
          scene="scene2"
          theme={theme}
          ticker={ticker}
          price={priceVal}
          callWall={callWallVal}
          putFloor={putFloorVal}
          gammaFlip={gammaFlipVal}
          distancePercent={distanceVal}
        />
      </Sequence>

      {/* Scene 03: Zoom Squeeze Compression Shake (7.5s - 12.5s, f225 - f375) */}
      <Sequence from={225} durationInFrames={150}>
        <ContinuousTransformChart
          frame={frame - 225}
          scene="scene3"
          theme={theme}
          ticker={ticker}
          price={priceVal}
          callWall={callWallVal}
          putFloor={putFloorVal}
          gammaFlip={gammaFlipVal}
          distancePercent={distanceVal}
        />
      </Sequence>

      {/* Scene 04: High Impact Insight Payoff (12.5s - 18.0s, f375 - f540) */}
      <Sequence from={375} durationInFrames={165}>
        <ContinuousTransformChart
          frame={frame - 375}
          scene="scene4"
          theme={theme}
          ticker={ticker}
          price={priceVal}
          callWall={callWallVal}
          putFloor={putFloorVal}
          gammaFlip={gammaFlipVal}
          distancePercent={distanceVal}
        />
      </Sequence>

      {/* Scene 05: Brand Call to Action Box (18.0s - 24.0s, f540 - f720) */}
      <Sequence from={540} durationInFrames={180}>
        <Scene05_CTAOutro theme={theme} ticker={ticker} callWall={callWallVal} />
      </Sequence>

      {/* Universal Floating compliance layer */}
      <ComplianceFooter text="Institutional flow analysis. Real-time updates at SignumHQ.com. Not financial advice." />
    </AbsoluteFill>
  );
};
