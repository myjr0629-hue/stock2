// ============================================================================
// MarketPressureBrief V27 — Collision-Free Institutional Upload Master
// ============================================================================
// V27 delivers broadcast-grade institutional authority and master quality:
// - Absolute zero layout collisions
// - No duplicate $420M captions in Scene 01 (caption Y shifted below Call Wall)
// - Fills Scene 02 middle zone with active procedural candlestick structure
// - Clean, bold Sequential Waterfall in Scene 04 with gap-clustered particles
// - Scanner reveal showing full product unlock text quickly (no long split)
// - Premium CTA: Vector logo, single text block, massive elegant domain footer
// - High volume continuous audio bed to eliminate any silence gaps > 0.25s
// ============================================================================

import React from 'react';
import {
  AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig,
  interpolate, spring, staticFile, Audio, Video, Easing, random,
} from 'remotion';
import type { ShortsVideoInput, CaptionSegment } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO, LAYOUT } from '../brand/signumBrand';
import { ComplianceFooter } from '../components/ComplianceFooter';
import GlassCard from '../components/GlassCard';
import CountUpNumber from '../components/CountUpNumber';
import AlertTopBar from '../components/AlertTopBar';

export type MarketPressureBriefV27Props = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

const MONO_FAMILY = "'JetBrains Mono', 'SF Mono', monospace";

// ─── Utility: Candlestick Grid Overlay (Scene 2/5 Filler) ──────────────────
const ActiveCandleGrid: React.FC<{ opacity?: number; count?: number }> = ({ opacity = 0.15, count = 20 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{
      position: 'absolute', inset: 0, opacity, display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', padding: '0 80px', pointerEvents: 'none', zIndex: Z.grid,
    }}>
      {Array.from({ length: count }).map((_, i) => {
        const h = 100 + random(i) * 250;
        const offset = Math.sin(frame * 0.05 + i) * 30;
        const color = random(i + 5) > 0.5 ? BRAND.emerald : BRAND.coral;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${offset}px)` }}>
            <div style={{ width: 2, height: h * 0.3, background: color }} />
            <div style={{ width: 10, height: h * 0.7, background: color, borderRadius: 2 }} />
            <div style={{ width: 2, height: h * 0.2, background: color }} />
          </div>
        );
      })}
    </div>
  );
};

// ─── Utility: Gap-Clustered Flow Particles ──────────────────────────────────
const ClusteredParticles: React.FC<{
  progress: number; startY: number; endY: number; count?: number; color?: string;
}> = ({ progress, startY, endY, count = 28, color = BRAND.cyan }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: Z.wallViz - 1 }}>
      {Array.from({ length: count }).map((_, i) => {
        // Particles cluster strictly between startY and endY
        const x = 100 + random(i) * 880;
        const y = interpolate(progress, [0, 1], [startY, endY - 40 + random(i + 10) * 80]);
        const op = interpolate(progress, [0, 0.3, 1], [0, 0.8, 0.9]) * (0.3 + random(i) * 0.7);
        const sz = 8 + random(i + 3) * 16;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y, width: sz, height: sz,
            borderRadius: '50%', background: color, opacity: op,
            boxShadow: `0 0 ${sz * 2.5}px ${color}`,
            transform: `scale(${1 + Math.sin(frame * 0.15 + i) * 0.3})`,
          }} />
        );
      })}
    </div>
  );
};

// ─── Utility: Technical Scanner Line ─────────────────────────────────────────
const ScannerLine: React.FC<{ progress: number; glow?: number; color?: string }> = ({ progress, glow = 100, color = BRAND.cyan }) => {
  const y = interpolate(progress, [0, 1], [-20, 1940]);
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: y, height: 6,
      background: `linear-gradient(90deg, transparent 0%, ${color} 20%, #ffffff 50%, ${color} 80%, transparent 100%)`,
      boxShadow: `0 0 ${glow}px ${color}, 0 0 ${glow * 1.5}px ${color}, inset 0 0 10px #ffffff`,
      zIndex: Z.data + 5, pointerEvents: 'none', opacity: 0.95,
    }} />
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

// ─── Collision-Free Caption Overlay (Phrase-Level, centered Y=430) ──────────
const V27CaptionOverlay: React.FC<{ captions: CaptionSegment[]; frame: number }> = ({ captions, frame }) => {
  if (!captions || captions.length === 0) return null;
  
  const activeCaption = captions.find(c => frame >= c.startFrame && frame < c.endFrame);
  if (!activeCaption) return null;

  // SCENE 01 Collision Fix: Shift Scene 01 caption below the red Call Wall line (Y=1420)
  // to prevent overlapping the upper-middle Glass Card.
  const isScene01 = frame < S(2.2);
  const targetY = isScene01 ? 1410 : 430;
  
  const accentColor = activeCaption.color || (activeCaption.emphasis ? BRAND.cyan : BRAND.text);
  
  return (
    <div style={{
      position: 'absolute',
      left: 0,
      right: 0,
      top: targetY,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: Z.caption,
      pointerEvents: 'none',
      padding: '0 60px',
    }}>
      <div style={{
        fontFamily: "'Outfit', 'Montserrat', 'SF Pro Display', sans-serif",
        fontWeight: 900,
        fontSize: activeCaption.emphasis ? 72 : 60,
        color: accentColor,
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: '-0.01em',
        lineHeight: 1.1,
        textShadow: `0 0 20px rgba(0,0,0,0.95), 0 2px 10px rgba(0,0,0,0.9)`,
        display: 'inline-block',
      }}>
        {activeCaption.text}
      </div>
    </div>
  );
};

// ─── Continuous Audio Engine (Hard gate against silence) ─────────────────────
const AudioEngine: React.FC = () => (
  <>
    {/* Continuous Voice track */}
    <Audio src={staticFile('shorts/audio/v26_voice.mp3')} volume={0.98} />
    
    {/* Continuous low cinematic bed mixed at high volume (0.42) to eliminate silence gaps */}
    <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.42} startFrom={0} endAt={S(18.5)} />
    
    {/* Heavy sound effects to maintain continuous energy floor */}
    <Sequence from={S(0.0)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.6} /></Sequence>
    <Sequence from={S(2.2)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.5} /></Sequence>
    <Sequence from={S(4.8)}><Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.55} /></Sequence>
    <Sequence from={S(7.4)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.6} /></Sequence>
    <Sequence from={S(10.2)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.5} /></Sequence>
    <Sequence from={S(14.5)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.45} /></Sequence>
  </>
);

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 01: EVENT SHOCK — ZERO DUPLICATION HERO CARD (0.0s–2.2s, 66f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene01_EventShock: React.FC = () => {
  const wallY = 1200;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      <AlertTopBar ticker="SPY" price={592.31} alertText="INSTITUTIONAL VOLUMETRIC SIGNAL" />

      {/* Red Call Wall line */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 8, background: BRAND.coral,
        boxShadow: `0 0 45px ${BRAND.coralGlow}`,
        zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 32,
        color: BRAND.coral, fontSize: 24, fontWeight: 900, fontFamily: MONO_FAMILY,
        textShadow: SHADOW.coral, zIndex: Z.data, letterSpacing: '0.05em',
      }}>[CALL WALL $600.00]</div>

      {/* HERO CARD - Clean and collision-free */}
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

      {/* Bottom price context */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 50, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.data,
      }}>
        <span style={{
          color: BRAND.mutedLight, fontSize: 24, fontWeight: 700, fontFamily: MONO_FAMILY,
          letterSpacing: '0.12em', textShadow: '0 0 10px rgba(0,0,0,0.8)',
        }}>SPY $592.31 — 1.3% FROM WALL</span>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 02: MOST CHARTS SHOW PRICE — CHART STRUCTURE (2.2s–4.8s, 78f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene02_HiddenWall: React.FC = () => {
  const frame = useCurrentFrame();
  const revealOp = interpolate(frame, [S(0.4), S(1.2)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const wallY = 820;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      {/* Candlestick grid filling the middle zone */}
      <ActiveCandleGrid opacity={0.16} count={12} />

      <div style={{
        position: 'absolute', top: 580, left: LAYOUT.safeL,
        fontFamily: MONO_FAMILY, fontSize: 16, color: 'rgba(255,255,255,0.25)',
        zIndex: Z.data,
      }}>[STANDARD PRICE FEED]</div>

      {/* Faint dim price line */}
      <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.35, zIndex: Z.grid - 1 }}>
        <path d="M 0,900 Q 270,780 540,920 T 1080,880" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="3" />
      </svg>

      {/* Hidden wall revealed */}
      <div style={{ opacity: revealOp, zIndex: Z.data }}>
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          top: wallY, height: 8, background: BRAND.coral,
          boxShadow: `0 0 50px ${BRAND.coralGlow}`,
        }} />
        <div style={{
          position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 32,
          color: BRAND.coral, fontSize: 26, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: SHADOW.coral,
        }}>[WALL ACTIVATED $600.00]</div>
      </div>

      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 50, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.data,
      }}>
        <GlassCard color={BRAND.cyan} padding="12px 30px" bracket={true}>
          <span style={{
            color: BRAND.textSecondary, fontSize: 26, fontWeight: 700, fontFamily: MONO_FAMILY,
            letterSpacing: '0.05em',
          }}>HIDDEN STRUCTURE ACTIVATED</span>
        </GlassCard>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 03: 1.3% PRESSURE GAP — COLLISION-FREE SPOT LIGHT (4.8s–7.4s, 78f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene03_PressureZone: React.FC = () => {
  const frame = useCurrentFrame();
  const wallY = 560;
  const priceY = 1000;
  const bracketH = priceY - wallY;
  const dotPulse = 1 + Math.sin(frame * 0.15) * 0.25;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      {/* Ambient background candelsticks */}
      <ActiveCandleGrid opacity={0.08} count={8} />

      {/* Red Call Wall line */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 8, background: BRAND.coral,
        boxShadow: `0 0 45px ${BRAND.coralGlow}`, zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 32,
        color: BRAND.coral, fontSize: 24, fontWeight: 900, fontFamily: MONO_FAMILY,
        textShadow: SHADOW.coral, zIndex: Z.data,
      }}>[CALL RESISTANCE $600.00]</div>

      {/* Cyan Price line */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: 380,
        top: priceY, height: 6, background: BRAND.cyan,
        boxShadow: `0 0 25px ${BRAND.cyanGlow}`, zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', left: 660, top: priceY - 10, width: 20, height: 20,
        borderRadius: '50%', background: BRAND.cyan,
        boxShadow: `0 0 35px ${BRAND.cyanGlow}`,
        transform: `scale(${dotPulse})`, zIndex: Z.data,
      }} />

      {/* Yellow bracket indicating pressure gap */}
      <div style={{ position: 'absolute', left: 740, top: wallY, height: bracketH, zIndex: Z.data }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 8, height: '100%',
          background: BRAND.amber, boxShadow: `0 0 25px ${BRAND.amberGlow}`,
        }} />
        <div style={{ position: 'absolute', left: -20, top: 0, width: 28, height: 8, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: -20, bottom: 0, width: 28, height: 8, background: BRAND.amber }} />
      </div>

      {/* Massive 1.3% Hero context */}
      <div style={{
        position: 'absolute', left: 100, top: wallY + bracketH / 2 - 70,
        zIndex: Z.hookText,
      }}>
        <CountUpNumber
          target={1.3} prefix="" suffix="%"
          fontSize={150} color={BRAND.amber} duration={1} delay={0}
          textShadow={SHADOW.amber}
          formatFn={(n: number) => (1.3).toFixed(1)}
        />
      </div>

      <TerminalTelemetryPanel
        title="SPOT MATRIX"
        metrics={[
          { label: 'GAP SIZE', value: '1.34%', color: BRAND.amber },
          { label: 'TENSION', value: 'HIGH', color: BRAND.coral },
        ]}
        top={1120}
        left={LAYOUT.safeL}
        width={340}
      />
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 04: RISK BOUNDARY STRUCTURE — SEQUENTIAL WATERFALL (7.4s–10.2s, 84f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene04_MapNotPrediction: React.FC = () => {
  const frame = useCurrentFrame();
  const mapTop = 540;
  const mapH = 720;
  const wallY = mapTop;
  const flipY = mapTop + mapH * 0.4;
  const floorY = mapTop + mapH;

  // Reveal sequential elements based on frames
  const showWall = frame >= 0;
  const showFlip = frame >= S(0.6);
  const showFloor = frame >= S(1.2);

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      {/* Call Wall */}
      {showWall && (
        <div style={{ zIndex: Z.data }}>
          <div style={{
            position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
            top: wallY, height: 8, background: BRAND.coral,
            boxShadow: `0 0 45px ${BRAND.coralGlow}`,
          }} />
          <div style={{
            position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 32,
          }}>
            <span style={{ color: BRAND.coral, fontSize: 22, fontWeight: 900, fontFamily: MONO_FAMILY, textShadow: SHADOW.coral }}>
              [CALL WALL $600]
            </span>
          </div>
        </div>
      )}

      {/* Cluster particles strictly inside the Spot-to-Wall gap */}
      <ClusteredParticles progress={1} startY={wallY} endY={flipY} count={16} />

      {/* Gamma Flip */}
      {showFlip && (
        <div style={{ zIndex: Z.data }}>
          <div style={{
            position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
            top: flipY, height: 6,
            background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 16px, transparent 16px, transparent 32px)`,
            boxShadow: `0 0 25px ${BRAND.purpleGlow}`,
          }} />
          <div style={{
            position: 'absolute', right: LAYOUT.safeR + 10, top: flipY - 32,
          }}>
            <span style={{ color: BRAND.purple, fontSize: 22, fontWeight: 900, fontFamily: MONO_FAMILY, textShadow: SHADOW.purple }}>
              [GAMMA FLIP $588]
            </span>
          </div>
        </div>
      )}

      {/* Put Floor */}
      {showFloor && (
        <div style={{ zIndex: Z.data }}>
          <div style={{
            position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
            top: floorY, height: 8, background: BRAND.emerald,
            boxShadow: `0 0 35px ${BRAND.emerald}`,
          }} />
          <div style={{
            position: 'absolute', right: LAYOUT.safeR + 10, top: floorY - 32,
          }}>
            <span style={{ color: BRAND.emerald, fontSize: 22, fontWeight: 900, fontFamily: MONO_FAMILY }}>
              [PUT FLOOR $580]
            </span>
          </div>
        </div>
      )}

      <TerminalTelemetryPanel
        title="RISK STRUCTURE"
        metrics={[
          { label: 'GAMMA BALANCE', value: 'NEGATIVE', color: BRAND.purple },
          { label: 'MATCH RATIO', value: '99.8%', color: BRAND.emerald },
        ]}
        bottom={LAYOUT.safeBot + 40}
        left={LAYOUT.safeL}
        width={340}
      />
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 05: PRODUCT UNLOCK — DUAL SCANNER REVEAL (10.2s–14.5s, 129f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene05_ProductUnlock: React.FC = () => {
  const frame = useCurrentFrame();
  const scanStart = S(0.3);
  const scanEnd = S(1.5);
  const revealOp = interpolate(frame, [scanStart + S(0.2), scanEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const labelOp = interpolate(frame, [scanStart + S(0.4), scanEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const scanProg = interpolate(frame, [scanStart, scanEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const chartTop = 500;
  const chartH = 750;
  const callWallY = chartTop + chartH * 0.15;
  const priceY = chartTop + chartH * 0.55;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      {/* Top label swap */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 30, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.hookText,
      }}>
        <div style={{ opacity: 1 - labelOp }}>
          <span style={{
            color: BRAND.muted, fontSize: 42, fontWeight: 900, fontFamily: MONO_FAMILY,
          }}>[STANDARD INDEX VIEW]</span>
        </div>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          opacity: labelOp,
        }}>
          <span style={{
            color: BRAND.cyan, fontSize: 42, fontWeight: 900, fontFamily: MONO_FAMILY,
            textShadow: SHADOW.cyan,
          }}>[SIGNUMHQ QUANT ACTIVE]</span>
        </div>
      </div>

      <ActiveCandleGrid opacity={0.18} count={16} />

      {/* Dim baseline price line */}
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', top: 0, zIndex: Z.data }}>
        <path d={`M 0,${priceY + 30} Q 540,${priceY - 30} 1080,${priceY + 30}`}
          stroke={BRAND.muted} strokeWidth={4} fill="none" opacity={0.4} />
      </svg>

      {/* Scanner sweep line */}
      {frame >= scanStart && frame <= scanEnd + S(0.2) && (
        <ScannerLine progress={scanProg} glow={120} />
      )}

      {/* Revealed structural Call Wall */}
      <div style={{ opacity: revealOp, zIndex: Z.data }}>
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          top: callWallY, height: 8, background: BRAND.coral,
          boxShadow: `0 0 45px ${BRAND.coralGlow}`,
        }} />
        <div style={{
          position: 'absolute', right: LAYOUT.safeR + 10, top: callWallY - 32,
          color: BRAND.coral, fontSize: 24, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: SHADOW.coral,
        }}>CALL WALL $600</div>

        <ClusteredParticles progress={revealOp} startY={callWallY} endY={priceY} count={12} />
      </div>

      <TerminalTelemetryPanel
        title="RADAR ENGINE"
        metrics={[
          { label: 'CALL WALL $600', value: frame >= revealOp ? 'ACTIVE' : 'LOCKED', color: frame >= revealOp ? BRAND.coral : BRAND.muted },
        ]}
        bottom={LAYOUT.safeBot + 100}
        left={LAYOUT.safeL}
        width={340}
      />
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 06: CTA — PREMIUM BROADCAST OUTRO (14.5s–18.5s, 120f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene06_CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const breathe = 0.9 + Math.sin(frame * 0.08) * 0.1;

  return (
    <AbsoluteFill style={{ zIndex: Z.hookText }}>
      {/* High density clean grid backing */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: '35%', height: 2,
        background: `linear-gradient(90deg, transparent, ${BRAND.cyan}, transparent)`,
        opacity: 0.15, zIndex: Z.grid,
      }} />

      {/* SG Vector Logo */}
      <div style={{
        position: 'absolute', top: 380, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', zIndex: Z.brand,
      }}>
        <svg width="220" height="220" viewBox="246 247 530 530" fill="none" style={{ opacity: breathe }}>
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.cyan} />
        </svg>
      </div>

      {/* Middle Text: Single stable block */}
      <div style={{
        position: 'absolute', top: 680, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.brand,
      }}>
        <span style={{
          color: BRAND.text, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family,
          letterSpacing: '0.04em', textShadow: SHADOW.hero,
        }}>SIGNUMHQ</span>
        
        <div style={{ marginTop: 20 }}>
          <span style={{
            color: BRAND.cyan, fontSize: 30, fontWeight: 900, fontFamily: MONO_FAMILY,
            letterSpacing: '0.08em', textShadow: SHADOW.cyan,
          }}>[UNMASK THE STRUCTURE BEHIND PRICE]</span>
        </div>
      </div>

      {/* Massive Elegant Footer Link */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 120, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.brand,
      }}>
        <div style={{
          display: 'inline-block',
          border: `2px solid ${BRAND.cyan}`,
          padding: '16px 48px',
          borderRadius: 8,
          background: 'rgba(4,7,16,0.85)',
          boxShadow: `0 0 35px rgba(34,211,238,0.25)`,
        }}>
          <span style={{
            color: BRAND.text, fontSize: 44, fontWeight: 900, fontFamily: MONO_FAMILY,
            letterSpacing: '0.08em',
          }}>SIGNUMHQ.COM</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPOSITION ENTRYPOINT (V27)
// ═════════════════════════════════════════════════════════════════════════════
export const MarketPressureBriefV27: React.FC<MarketPressureBriefV27Props> = ({ captions, disclaimer }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: '#040710', overflow: 'hidden' }}>
      {/* 1. Sequential scene layers */}
      <Sequence from={0} durationInFrames={S(2.2)}>
        <Scene01_EventShock />
      </Sequence>

      <Sequence from={S(2.2)} durationInFrames={S(2.6)}>
        <Scene02_HiddenWall />
      </Sequence>

      <Sequence from={S(4.8)} durationInFrames={S(2.6)}>
        <Scene03_PressureZone />
      </Sequence>

      <Sequence from={S(7.4)} durationInFrames={S(2.8)}>
        <Scene04_MapNotPrediction />
      </Sequence>

      <Sequence from={S(10.2)} durationInFrames={S(4.3)}>
        <Scene05_ProductUnlock />
      </Sequence>

      <Sequence from={S(14.5)} durationInFrames={S(4.0)}>
        <Scene06_CTA />
      </Sequence>

      {/* 
        2. Faint technical scanner grid backing loop
        Layered above the scenes but strictly blended in color-dodge at 11% opacity
        to act as subtle atmospheric support without distracting from data.
      */}
      <AbsoluteFill style={{
        zIndex: Z.grid + 2,
        opacity: 0.11,
        mixBlendMode: 'color-dodge',
        pointerEvents: 'none',
      }}>
        <Video
          src={staticFile('shorts/broll/kling_terminal.mp4')}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.9) contrast(1.25)' }}
          muted
          loop
        />
      </AbsoluteFill>

      {/* 3. Collision-free caption overlay centered at Y=430 / Y=1410 */}
      <V27CaptionOverlay captions={captions} frame={frame} />

      {/* 4. Legal Compliance Footer */}
      <Sequence from={S(2.2)} durationInFrames={S(16.3)}>
        <ComplianceFooter text={disclaimer} />
      </Sequence>

      {/* 5. Continuous Audio Engine */}
      <AudioEngine />

      {/* 6. Static progress timeline */}
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

export default MarketPressureBriefV27;
