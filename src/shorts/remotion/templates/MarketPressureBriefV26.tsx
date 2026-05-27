// ============================================================================
// MarketPressureBrief V26 — Institutional Data-First Revenue Cut
// ============================================================================
// V26 delivers pure institutional terminal credibility:
// - Sharp procedural SVG/CSS elements
// - Extreme stop-power on Frame 0 (SPY ticker, $420M, 91st %, $600 Wall all visible)
// - Clean phrase-level captions at Y=430 (no bouncy word-level karaoke)
// - Atmospheric support underlay at <=15% opacity (kling_terminal.mp4)
// - Strictly locked 18.5s timeline (555 frames @ 30fps)
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
import AmbientCandlestickBg from '../components/AmbientCandlestickBg';
import AlertTopBar from '../components/AlertTopBar';

export type MarketPressureBriefV26Props = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

const MONO_FAMILY = "'JetBrains Mono', 'SF Mono', monospace";

// ─── Utility: Narrative Flow Particles ───────────────────────────────────────
const FlowParticles: React.FC<{
  progress: number; targetY: number; intensity: number;
  count?: number; maxOpacity?: number; spread?: number; color?: string;
}> = ({ progress, targetY, intensity, count = 24, maxOpacity = 0.8, spread = 100, color = BRAND.cyan }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: Z.wallViz - 1 }}>
      {Array.from({ length: count }).map((_, i) => {
        const startX = -40 + random(i) * 1160;
        const endX = 100 + random(i + 40) * 880;
        const startY = 1920 + random(i + 80) * 400;
        const x = interpolate(progress, [0, 1], [startX, endX]);
        const y = interpolate(progress, [0, 1], [startY, targetY + random(i + 120) * spread]);
        const op = interpolate(progress, [0, 0.5, 1], [0, intensity, intensity * maxOpacity]) * (0.4 + random(i) * 0.6);
        const sz = 12 + random(i + 30) * 20;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y, width: sz, height: sz,
            borderRadius: '50%', background: color, opacity: op,
            boxShadow: `0 0 ${sz * 3}px ${color}`,
            transform: `scale(${1 + Math.sin(frame * 0.2 + i) * 0.4})`,
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
      <GlassCard color="rgba(34,211,238,0.15)" padding="12px 20px" bracket={true}>
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

// ─── Phrase-Level Caption Overlay (Y=430 Centered, Plain & High-Readability) ────
const V26CaptionOverlay: React.FC<{ captions: CaptionSegment[]; frame: number }> = ({ captions, frame }) => {
  if (!captions || captions.length === 0) return null;
  
  const activeCaption = captions.find(c => frame >= c.startFrame && frame < c.endFrame);
  if (!activeCaption) return null;
  
  const accentColor = activeCaption.color || (activeCaption.emphasis ? BRAND.cyan : BRAND.text);
  
  return (
    <div style={{
      position: 'absolute',
      left: 0,
      right: 0,
      top: 430,
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
        fontSize: activeCaption.emphasis ? 76 : 64,
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

// ─── Audio Engine ────────────────────────────────────────────────────────────
const AudioEngine: React.FC = () => (
  <>
    <Audio src={staticFile('shorts/audio/v26_voice.mp3')} volume={0.95} />
    <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.16} startFrom={0} endAt={S(18.5)} />
    <Sequence from={S(0.0)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.55} /></Sequence>
    <Sequence from={S(2.0)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.45} /></Sequence>
    <Sequence from={S(4.5)}><Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.5} /></Sequence>
    <Sequence from={S(7.0)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.55} /></Sequence>
    <Sequence from={S(10.5)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.45} /></Sequence>
    <Sequence from={S(14.5)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.4} /></Sequence>
  </>
);

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 01: EVENT SHOCK - INSTANT FIRST-FRAME STOP POWER (0.0s–2.0s, 60f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene01_EventShock: React.FC = () => {
  const wallY = 1200;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      <AlertTopBar ticker="SPY" price={592.31} alertText="INSTITUTIONAL DETECTED FLOW" />
      <AmbientCandlestickBg opacity={0.10} baseY={1200} height={350} />

      {/* Red Call Wall — terminal profile line */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 12, background: BRAND.coral,
        boxShadow: `0 0 60px ${BRAND.coralGlow}`,
        zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 38,
        color: BRAND.coral, fontSize: 26, fontWeight: 900, fontFamily: MONO_FAMILY,
        textShadow: SHADOW.coral, zIndex: Z.data, letterSpacing: '0.05em',
      }}>[CALL WALL $600.00]</div>

      {/* HERO ZONE — Premium Terminal Dashboard */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 60, left: LAYOUT.safeL, right: LAYOUT.safeR,
        display: 'flex', flexDirection: 'column', gap: 20, zIndex: Z.hookText,
      }}>
        <GlassCard color="rgba(34,211,238,0.18)" padding="24px" bracket={true}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: MONO_FAMILY, fontSize: 24, fontWeight: 900, color: BRAND.cyan }}>SPY LIQUIDITY ANOMALY</span>
            <span style={{ fontFamily: MONO_FAMILY, fontSize: 18, color: BRAND.amber, border: `1px solid ${BRAND.amber}`, padding: '4px 10px', borderRadius: 4 }}>91st %ILE FLOW</span>
          </div>
          <div style={{ marginTop: 20, fontSize: 120, fontWeight: 900, fontFamily: MONO_FAMILY, color: BRAND.text, textAlign: 'center', lineHeight: 1 }}>
            $420M
          </div>
          <div style={{ fontSize: 34, fontWeight: 900, fontFamily: MONO_FAMILY, color: BRAND.cyan, textAlign: 'center', marginTop: 10, letterSpacing: '0.05em' }}>
            OFF-EXCHANGE FLOW
          </div>
        </GlassCard>
        
        <GlassCard color="rgba(248,113,113,0.15)" padding="12px" bracket={true}>
          <div style={{ textAlign: 'center', fontFamily: MONO_FAMILY, fontSize: 24, fontWeight: 900, color: BRAND.coral }}>
            NEAR SPY'S $600 CALL WALL
          </div>
        </GlassCard>
      </div>

      {/* Telemetry sidebar */}
      <TerminalTelemetryPanel
        title="QUANT TERMINAL"
        metrics={[
          { label: 'REGIME', value: 'NEGATIVE GAMMA', color: BRAND.purple },
          { label: 'FLOW WEIGHT', value: '91st %ILE', color: BRAND.cyan },
          { label: 'OFF-EXCH RATIO', value: '2.4x ANOMALY', color: BRAND.amber },
        ]}
        top={830}
        left={LAYOUT.safeL}
        width={340}
      />

      {/* Bottom price context */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 50, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.data,
      }}>
        <span style={{
          color: BRAND.mutedLight, fontSize: 26, fontWeight: 700, fontFamily: MONO_FAMILY,
          letterSpacing: '0.12em', textShadow: '0 0 10px rgba(0,0,0,0.8)',
        }}>SPY $592.31 — 1.3% FROM WALL</span>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 02: THE HIDDEN WALL - SYSTEM SCAN (2.0s–4.5s, 75f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene02_HiddenWall: React.FC = () => {
  const frame = useCurrentFrame();
  const scanProg = interpolate(frame, [0, S(1.2)], [0, 1], { extrapolateRight: 'clamp' });
  const revealOp = interpolate(frame, [S(0.4), S(1.2)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const wallY = 750;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      <AmbientCandlestickBg opacity={0.14} baseY={850} height={400} />
      <ScannerLine progress={scanProg} glow={120} />

      <div style={{
        position: 'absolute', top: 520, left: LAYOUT.safeL,
        fontFamily: MONO_FAMILY, fontSize: 16, color: 'rgba(255,255,255,0.2)',
        zIndex: Z.data,
      }}>[STANDARD TICKER VIEW]</div>

      {/* Hidden wall revealed after scanner sweep */}
      <div style={{ opacity: revealOp, zIndex: Z.data }}>
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          top: wallY, height: 10, background: BRAND.coral,
          boxShadow: `0 0 60px ${BRAND.coralGlow}`,
        }} />
        <div style={{
          position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 38,
          color: BRAND.coral, fontSize: 28, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: SHADOW.coral,
        }}>[WALL ACTIVATED $600.00]</div>
        <FlowParticles progress={revealOp} targetY={wallY + 30} intensity={0.8} count={16} spread={80} />
      </div>

      <TerminalTelemetryPanel
        title="REGIME STATUS"
        metrics={[
          { label: 'SCANNER STATE', value: 'REVEAL COMPLETE', color: BRAND.cyan },
          { label: 'HIDDEN BOUNDARY', value: '$600.00 CALL RESISTANCE', color: BRAND.coral },
          { label: 'UNREPORTED VOL', value: '420M INSTITUTIONAL', color: BRAND.purple },
        ]}
        top={950}
        right={LAYOUT.safeR}
        width={380}
      />

      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 50, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.data,
      }}>
        <GlassCard color={BRAND.cyan} padding="14px 36px" bracket={true}>
          <span style={{
            color: BRAND.textSecondary, fontSize: 28, fontWeight: 700, fontFamily: MONO_FAMILY,
            letterSpacing: '0.05em',
          }}>HIDDEN STRUCTURE SCANNER: ACTIVE</span>
        </GlassCard>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 03: PRESSURE ZONE - BRACKET SQUEEZE (4.5s–7.0s, 75f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene03_PressureZone: React.FC = () => {
  const frame = useCurrentFrame();
  const wallY = 560;
  const priceY = 1000;
  const bracketH = priceY - wallY;
  const dotPulse = 1 + Math.sin(frame * 0.2) * 0.35;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      <AmbientCandlestickBg opacity={0.08} baseY={780} height={500} />

      {/* Red wall */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 10, background: BRAND.coral,
        boxShadow: `0 0 50px ${BRAND.coralGlow}`, zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 36,
        color: BRAND.coral, fontSize: 26, fontWeight: 900, fontFamily: MONO_FAMILY,
        textShadow: SHADOW.coral, zIndex: Z.data,
      }}>[CALL RESISTANCE $600.00]</div>

      {/* Cyan price line */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: 400,
        top: priceY, height: 6, background: BRAND.cyan,
        boxShadow: `0 0 30px ${BRAND.cyanGlow}`, zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', left: 680, top: priceY - 12, width: 24, height: 24,
        borderRadius: '50%', background: BRAND.cyan,
        boxShadow: `0 0 40px ${BRAND.cyanGlow}`,
        transform: `scale(${dotPulse})`, zIndex: Z.data,
      }} />

      {/* Yellow bracket indicating critical gap */}
      <div style={{ position: 'absolute', left: 740, top: wallY, height: bracketH, zIndex: Z.data }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 10, height: '100%',
          background: BRAND.amber, boxShadow: `0 0 30px ${BRAND.amberGlow}`,
        }} />
        <div style={{ position: 'absolute', left: -24, top: 0, width: 34, height: 10, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: -24, bottom: 0, width: 34, height: 10, background: BRAND.amber }} />
      </div>

      <div style={{
        position: 'absolute', left: 100, top: wallY + bracketH / 2 - 80,
        zIndex: Z.hookText,
      }}>
        <CountUpNumber
          target={1.3} prefix="" suffix="%"
          fontSize={160} color={BRAND.amber} duration={1} delay={0}
          textShadow={SHADOW.amber}
          formatFn={(n: number) => (1.3).toFixed(1)}
        />
      </div>

      <TerminalTelemetryPanel
        title="GAP METRICS"
        metrics={[
          { label: 'SPOT DISTANCE', value: '1.34%', color: BRAND.amber },
          { label: 'TENSION COEFFICIENT', value: '9.42 / HIGH', color: BRAND.coral },
          { label: 'REMAINING RANGE', value: '$7.69 POINTS', color: BRAND.text },
        ]}
        top={1120}
        left={LAYOUT.safeL}
        width={380}
      />
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 04: MAP NOT PREDICTION - RISK BOUNDARY STRUCTURE (7.0s–10.5s, 105f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene04_MapNotPrediction: React.FC = () => {
  const mapTop = 520;
  const mapH = 750;
  const wallY = mapTop;
  const flipY = mapTop + mapH * 0.38;
  const floorY = mapTop + mapH;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      <AmbientCandlestickBg opacity={0.06} baseY={mapTop + mapH / 2} height={mapH * 0.5} />

      {/* Call Wall */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 8, background: BRAND.coral,
        boxShadow: `0 0 50px ${BRAND.coralGlow}`, zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 34,
        zIndex: Z.data,
      }}>
        <GlassCard color={BRAND.coral} padding="6px 16px" bracket={true}>
          <span style={{ color: BRAND.coral, fontSize: 24, fontWeight: 900, fontFamily: MONO_FAMILY }}>
            CALL WALL $600
          </span>
        </GlassCard>
      </div>

      <FlowParticles progress={1} targetY={wallY + 50} intensity={0.7} count={16} />

      {/* Gamma Flip */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: flipY, height: 6,
        background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 18px, transparent 18px, transparent 36px)`,
        boxShadow: `0 0 25px ${BRAND.purpleGlow}`, zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: flipY - 34,
        zIndex: Z.data,
      }}>
        <GlassCard color={BRAND.purple} padding="6px 16px" bracket={true}>
          <span style={{ color: BRAND.purple, fontSize: 24, fontWeight: 900, fontFamily: MONO_FAMILY }}>
            GAMMA FLIP $588
          </span>
        </GlassCard>
      </div>

      {/* Put Floor */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: floorY, height: 8, background: BRAND.emerald,
        boxShadow: `0 0 40px ${BRAND.emerald}`, zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: floorY - 34,
        zIndex: Z.data,
      }}>
        <GlassCard color={BRAND.emerald} padding="6px 16px" bracket={true}>
          <span style={{ color: BRAND.emerald, fontSize: 24, fontWeight: 900, fontFamily: MONO_FAMILY }}>
            PUT FLOOR $580
          </span>
        </GlassCard>
      </div>

      <TerminalTelemetryPanel
        title="RISK BOUNDARIES"
        metrics={[
          { label: 'BIAS INDEX', value: 'HIGH REGIME TENSION', color: BRAND.amber },
          { label: 'GAMMA BALANCE', value: '-24% CORRECTION BIAS', color: BRAND.purple },
          { label: 'MATCH RATE', value: '99.8% FIDELITY', color: BRAND.emerald },
        ]}
        bottom={LAYOUT.safeBot + 30}
        left={LAYOUT.safeL}
        width={380}
      />
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 05: PRODUCT UNLOCK - SCANNER REVEAL (10.5s–14.5s, 120f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene05_ProductUnlock: React.FC = () => {
  const frame = useCurrentFrame();
  const scanStart = S(0.3);
  const scanEnd = S(1.3);
  const revealOp = interpolate(frame, [scanStart + S(0.2), scanEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const labelOp = interpolate(frame, [scanStart + S(0.4), scanEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const scanProg = interpolate(frame, [scanStart, scanEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const chartTop = 400;
  const chartH = 900;
  const callWallY = chartTop + chartH * 0.15;
  const flipY = chartTop + chartH * 0.45;
  const priceY = chartTop + chartH * 0.55;
  const floorY = chartTop + chartH * 0.85;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      {/* Top label swap */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 30, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.hookText,
      }}>
        <div style={{ opacity: 1 - labelOp }}>
          <span style={{
            color: BRAND.muted, fontSize: 48, fontWeight: 900, fontFamily: MONO_FAMILY,
          }}>[PRICE ONLY VIEW]</span>
        </div>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          opacity: labelOp,
        }}>
          <span style={{
            color: BRAND.cyan, fontSize: 48, fontWeight: 900, fontFamily: MONO_FAMILY,
            textShadow: SHADOW.cyan,
          }}>[SIGNUMHQ STRUCTURE MAP ACTIVE]</span>
        </div>
      </div>

      <AmbientCandlestickBg opacity={0.22} baseY={chartTop + chartH / 2} height={chartH * 0.6} candleCount={30} />

      {/* Grey price line */}
      <svg width="1080" height="1920" viewBox="0 0 1080 1920"
        style={{ position: 'absolute', top: 0, zIndex: Z.data }}>
        <path d={`M 0,${priceY + 40} C 200,${priceY + 10} 400,${priceY + 60} 600,${priceY + 30} C 800,${priceY} 1000,${priceY + 50} 1080,${priceY + 20}`}
          stroke={BRAND.muted} strokeWidth={4} fill="none" opacity={0.5} />
        <circle cx="900" cy={priceY + 20} r="8" fill={BRAND.cyan} opacity={0.8} />
      </svg>

      {/* Scanner sweep line */}
      {frame >= scanStart && frame <= scanEnd + S(0.2) && (
        <ScannerLine progress={scanProg} glow={120} />
      )}

      {/* Revealed layers */}
      <div style={{ opacity: revealOp, zIndex: Z.data }}>
        {/* Call Wall */}
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          top: callWallY, height: 8, background: BRAND.coral,
          boxShadow: `0 0 50px ${BRAND.coralGlow}`,
        }} />
        <div style={{
          position: 'absolute', right: LAYOUT.safeR + 10, top: callWallY - 38,
          color: BRAND.coral, fontSize: 26, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: SHADOW.coral,
        }}>CALL WALL $600</div>

        {/* Dark Pool Cluster */}
        <FlowParticles progress={revealOp} targetY={callWallY + 60} intensity={0.9} count={14} spread={50} />
        <div style={{
          position: 'absolute', left: LAYOUT.safeL + 10, top: callWallY + 80,
          color: BRAND.cyan, fontSize: 24, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: SHADOW.cyan,
        }}>[DARK POOL CLUSTER]</div>

        {/* Gamma Flip */}
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          top: flipY, height: 6,
          background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 18px, transparent 18px, transparent 36px)`,
          boxShadow: `0 0 30px ${BRAND.purpleGlow}`,
        }} />
        <div style={{
          position: 'absolute', right: LAYOUT.safeR + 10, top: flipY - 36,
          color: BRAND.purple, fontSize: 26, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: SHADOW.purple,
        }}>GAMMA FLIP $588</div>

        {/* Put Floor */}
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          top: floorY, height: 8, background: BRAND.emerald,
          boxShadow: `0 0 40px ${BRAND.emerald}`,
        }} />
        <div style={{
          position: 'absolute', right: LAYOUT.safeR + 10, top: floorY - 36,
          color: BRAND.emerald, fontSize: 26, fontWeight: 900, fontFamily: MONO_FAMILY,
        }}>PUT FLOOR $580</div>
      </div>

      <TerminalTelemetryPanel
        title="MAP STATUS"
        metrics={[
          { label: 'CALL WALL $600', value: frame >= revealOp ? 'ACTIVE' : 'LOCKED', color: frame >= revealOp ? BRAND.coral : BRAND.muted },
          { label: 'GAMMA FLIP $588', value: frame >= revealOp ? 'ACTIVE' : 'LOCKED', color: frame >= revealOp ? BRAND.purple : BRAND.muted },
          { label: 'PUT FLOOR $580', value: frame >= revealOp ? 'ACTIVE' : 'LOCKED', color: frame >= revealOp ? BRAND.emerald : BRAND.muted },
        ]}
        bottom={LAYOUT.safeBot + 110}
        left={LAYOUT.safeL}
        width={380}
      />
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 06: CTA - CLEAN AUTHORITATIVE CONVERSION (14.5s–18.5s, 120f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene06_CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const breathe = 0.88 + Math.sin(frame * 0.1) * 0.12;

  return (
    <AbsoluteFill style={{ zIndex: Z.hookText }}>
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: '32%', height: 3,
        background: `linear-gradient(90deg, transparent, ${BRAND.cyan}, transparent)`,
        opacity: 0.2, zIndex: Z.grid,
      }} />

      {/* Vector Logo */}
      <div style={{
        position: 'absolute', top: 380, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', zIndex: Z.brand,
      }}>
        <svg width="220" height="220" viewBox="246 247 530 530" fill="none" style={{ opacity: breathe }}>
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.cyan} />
        </svg>
      </div>

      <div style={{
        position: 'absolute', top: 680, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.brand,
      }}>
        <span style={{
          color: BRAND.text, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family,
          letterSpacing: '0.04em', textShadow: SHADOW.hero,
        }}>SIGNUMHQ</span>
        
        <div style={{ marginTop: 12 }}>
          <span style={{
            color: BRAND.cyan, fontSize: 32, fontWeight: 900, fontFamily: MONO_FAMILY,
            letterSpacing: '0.08em', textShadow: SHADOW.cyan,
          }}>[UNMASK THE STRUCTURE BEHIND PRICE]</span>
        </div>
      </div>

      {/* Call to action card */}
      <div style={{
        position: 'absolute', top: 930, left: LAYOUT.safeL + 20, right: LAYOUT.safeR + 20,
        zIndex: Z.brand,
      }}>
        <GlassCard color="rgba(34,211,238,0.22)" padding="24px 32px" bracket={true}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{
              color: BRAND.text, fontSize: 36, fontWeight: 900, fontFamily: MONO_FAMILY,
              textShadow: '0 0 10px rgba(255,255,255,0.8)',
            }}>GO TO SIGNUMHQ.COM</span>
            <span style={{
              color: BRAND.mutedLight, fontSize: 24, fontWeight: 800, fontFamily: MONO_FAMILY,
            }}>SEE THE HIDDEN FLOW MATRIX NOW</span>
          </div>
        </GlassCard>
      </div>

      <TerminalTelemetryPanel
        title="SECURED PLATFORM ACCESS"
        metrics={[
          { label: 'PLATFORM ACCESS', value: 'SIGNUMHQ LIVE RADAR', color: BRAND.cyan },
          { label: 'FEED INTEGRITY', value: 'UNMASKED LIQUIDITY BOUND', color: BRAND.purple },
        ]}
        bottom={LAYOUT.safeBot + 90}
        left={LAYOUT.safeL + 20}
        width={400}
      />
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN REFINED ENTRYPOINT (V26)
// ═════════════════════════════════════════════════════════════════════════════
export const MarketPressureBriefV26: React.FC<MarketPressureBriefV26Props> = ({ captions, disclaimer }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: '#040710', overflow: 'hidden' }}>
      {/* 1. Scene sequences */}
      <Sequence from={0} durationInFrames={S(2.0)}>
        <Scene01_EventShock />
      </Sequence>

      <Sequence from={S(2.0)} durationInFrames={S(2.5)}>
        <Scene02_HiddenWall />
      </Sequence>

      <Sequence from={S(4.5)} durationInFrames={S(2.5)}>
        <Scene03_PressureZone />
      </Sequence>

      <Sequence from={S(7.0)} durationInFrames={S(3.5)}>
        <Scene04_MapNotPrediction />
      </Sequence>

      <Sequence from={S(10.5)} durationInFrames={S(4.0)}>
        <Scene05_ProductUnlock />
      </Sequence>

      <Sequence from={S(14.5)} durationInFrames={S(4.0)}>
        <Scene06_CTA />
      </Sequence>

      {/* 
        2. Kling v2.0 Terminal HUD Video Loop Overlay
        Layered above the scenes but strictly blended in color-dodge at 12% opacity
        to act as under-the-hood atmospheric support without distracting from core elements.
      */}
      <AbsoluteFill style={{
        zIndex: Z.grid + 2,
        opacity: 0.12,
        mixBlendMode: 'color-dodge',
        pointerEvents: 'none',
      }}>
        <Video
          src={staticFile('shorts/broll/kling_terminal.mp4')}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.9) contrast(1.2)' }}
          muted
          loop
        />
      </AbsoluteFill>

      {/* 3. Plain, clean phrase-level captions centered at Y=430 */}
      <V26CaptionOverlay captions={captions} frame={frame} />

      {/* 4. Compliance footer */}
      <Sequence from={S(2.0)} durationInFrames={S(16.5)}>
        <ComplianceFooter text={disclaimer} />
      </Sequence>

      {/* 5. Audio engine */}
      <AudioEngine />

      {/* 6. Static timeline progress indicator */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 8,
        background: 'rgba(255,255,255,0.04)', zIndex: Z.progress,
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

export default MarketPressureBriefV26;
