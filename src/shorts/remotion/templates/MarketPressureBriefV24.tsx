// ============================================================================
// MarketPressureBrief V24 — Institutional-Terminal UI Rebuild
// ============================================================================
// V24 replaces clean infographic assets with highly dense terminal UI elements.
// Visual elements:
// - Always-on order book indicators & DOM (Depth-of-Market) telemetry
// - Corner brackets [ ] on all badges and glass cards
// - Faint volume profile overlays
// - Integrated terminal status panels
//
// 7 scenes, 17.8s, 534 frames @ 30fps.
// ============================================================================

import React from 'react';
import {
  AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig,
  interpolate, spring, staticFile, Audio, Easing, random,
} from 'remotion';
import type { ShortsVideoInput } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO, LAYOUT } from '../brand/signumBrand';
import { ComplianceFooter } from '../components/ComplianceFooter';
import EventFieldBackground from '../components/EventFieldBackground';
import GlassCard from '../components/GlassCard';
import KineticText from '../components/KineticText';
import CountUpNumber from '../components/CountUpNumber';
import AmbientCandlestickBg from '../components/AmbientCandlestickBg';
import AlertTopBar from '../components/AlertTopBar';

export type MarketPressureBriefV24Props = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

const MONO_FAMILY = "'JetBrains Mono', 'SF Mono', monospace";

// ─── Utility: Narrative Flow Particles ───────────────────────────────────────
const FlowParticles: React.FC<{
  progress: number; targetY: number; intensity: number;
  count?: number; maxOpacity?: number; spread?: number;
}> = ({ progress, targetY, intensity, count = 24, maxOpacity = 0.75, spread = 100 }) => {
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
            borderRadius: '50%', background: BRAND.cyan, opacity: op,
            boxShadow: `0 0 ${sz * 3}px ${BRAND.cyan}`,
            transform: `scale(${1 + Math.sin(frame * 0.2 + i) * 0.4})`,
          }} />
        );
      })}
    </div>
  );
};

// ─── Utility: Technical Scanner Line ─────────────────────────────────────────
const ScannerLine: React.FC<{ progress: number; glow?: number }> = ({ progress, glow = 100 }) => {
  const y = interpolate(progress, [0, 1], [-20, 1940]);
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: y, height: 5,
      background: `linear-gradient(90deg, transparent 0%, ${BRAND.cyan} 20%, #ffffff 50%, ${BRAND.cyan} 80%, transparent 100%)`,
      boxShadow: `0 0 ${glow}px ${BRAND.cyan}, 0 0 ${glow * 1.5}px ${BRAND.cyan}, inset 0 0 10px #ffffff`,
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

// ─── Audio Engine ────────────────────────────────────────────────────────────
const AudioEngine: React.FC = () => (
  <>
    {/* Reuse high-grade vocal audio matched exactly to scene triggers */}
    <Audio src={staticFile('shorts/audio/v22_voice.mp3')} volume={0.88} />
    <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.18} startFrom={0} endAt={S(14)} />
    <Sequence from={S(9.5)}>
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.22} startFrom={S(3)} endAt={S(8)} />
    </Sequence>
    <Sequence from={S(13)}>
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.18} startFrom={S(1)} />
    </Sequence>
    <Sequence from={S(0.0)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.55} /></Sequence>
    <Sequence from={S(0.8)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.45} /></Sequence>
    <Sequence from={S(2.2)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.4} /></Sequence>
    <Sequence from={S(4.5)}><Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.5} /></Sequence>
    <Sequence from={S(7.0)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.55} /></Sequence>
    <Sequence from={S(10.5)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.35} /></Sequence>
    <Sequence from={S(13.5)}><Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.45} /></Sequence>
  </>
);

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 01: EVENT ALERT HOOK (0.0s–1.6s)
// ═════════════════════════════════════════════════════════════════════════════
const Scene01_MarketAlert: React.FC = () => {
  const frame = useCurrentFrame();
  const wallY = 1150;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      <EventFieldBackground intensity={0.65} warmth={0} sceneName="scene01" />
      <AlertTopBar ticker="SPY" price={592.31} alertText="INSTITUTIONAL ALERT" />
      <AmbientCandlestickBg opacity={0.10} baseY={1200} height={350} />

      {/* Red Call Wall — terminal profile line */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 12, background: BRAND.coral,
        boxShadow: `0 0 80px ${BRAND.coralGlow}, 0 0 160px ${BRAND.coralGlow}`,
        zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 38,
        color: BRAND.coral, fontSize: 26, fontWeight: 900, fontFamily: MONO_FAMILY,
        textShadow: SHADOW.coral, zIndex: Z.data, letterSpacing: '0.05em',
      }}>[CALL WALL $600.00]</div>

      {/* Particles converging toward wall */}
      <FlowParticles progress={Math.max(0.4, frame / S(1.6))} targetY={wallY + 20} intensity={0.95} count={22} spread={80} />

      {/* HERO ZONE — upper center */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 90, left: LAYOUT.safeL, right: LAYOUT.safeR,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        zIndex: Z.hookText,
      }}>
        {/* $420M — starts high, counts up fast from 200 */}
        <CountUpNumber
          target={420} prefix="$" suffix="M"
          fontSize={140} color={BRAND.text} duration={10} delay={0}
          textShadow={SHADOW.hero}
          formatFn={(n: number) => Math.max(200, Math.round(n)).toString()}
        />

        {/* OFF-EXCHANGE FLOW */}
        <KineticText
          text="OFF-EXCHANGE FLOW"
          fontSize={56} color={BRAND.cyan} delay={0} stagger={1}
          textShadow={SHADOW.cyan}
        />
      </div>

      {/* Glass card — proof badges */}
      <div style={{
        position: 'absolute', top: 580, left: LAYOUT.safeL + 40, right: LAYOUT.safeR + 40,
        zIndex: Z.hookText,
        display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center',
      }}>
        <GlassCard color={BRAND.cyan} padding="16px 44px" bracket={true}>
          <span style={{
            color: BRAND.text, fontSize: 42, fontWeight: 900, fontFamily: MONO_FAMILY,
            letterSpacing: '0.08em',
          }}>91st PERCENTILE</span>
        </GlassCard>

        <GlassCard color={BRAND.coral} padding="14px 40px" bracket={true}>
          <span style={{
            color: BRAND.coral, fontSize: 38, fontWeight: 900, fontFamily: MONO_FAMILY,
            letterSpacing: '0.06em',
          }}>NEAR $600 WALL</span>
        </GlassCard>
      </div>

      {/* Telemetry sidebar */}
      <TerminalTelemetryPanel
        title="TELEMETRY STATUS"
        metrics={[
          { label: 'REGIME', value: 'NEGATIVE GAMMA', color: BRAND.purple },
          { label: 'FLOW WEIGHT', value: '91st %ILE', color: BRAND.cyan },
          { label: 'OFF-EXCH RATIO', value: '2.4x ANOMALY', color: BRAND.amber },
        ]}
        top={860}
        left={LAYOUT.safeL}
        width={340}
      />

      {/* Bottom zone — price context */}
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
// SCENE 02: WHAT THE MARKET MISSES (1.6s–3.4s)
// ═════════════════════════════════════════════════════════════════════════════
const Scene02_HiddenLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const scanProg = interpolate(frame, [0, S(0.8)], [0, 1], { extrapolateRight: 'clamp' });
  const revealOp = interpolate(frame, [S(0.4), S(1.2)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const wallY = 750;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      <EventFieldBackground intensity={0.55} warmth={0} sceneName="scene02" />
      <AmbientCandlestickBg opacity={0.14} baseY={850} height={400} />

      {/* Terminal Title */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 60, left: LAYOUT.safeL, right: LAYOUT.safeR,
        zIndex: Z.hookText,
      }}>
        <KineticText text="MOST CHARTS" fontSize={88} color={BRAND.textSecondary} delay={0} stagger={3} textShadow={SHADOW.hero} />
        <KineticText text="DON'T SHOW THIS" fontSize={88} color={BRAND.text} delay={4} stagger={3} textShadow={SHADOW.hero} />
      </div>

      {/* Scanner sweep through chart area */}
      <ScannerLine progress={scanProg} glow={120} />

      {/* Faint normal chart label */}
      <div style={{
        position: 'absolute', top: 520, left: LAYOUT.safeL,
        fontFamily: MONO_FAMILY, fontSize: 16, color: 'rgba(255,255,255,0.2)',
        zIndex: Z.data,
      }}>[STANDARD TICKER VIEW]</div>

      {/* Hidden wall — revealed after scanner */}
      <div style={{ opacity: revealOp, zIndex: Z.data }}>
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          top: wallY, height: 10, background: BRAND.coral,
          boxShadow: `0 0 60px ${BRAND.coralGlow}, 0 0 120px ${BRAND.coralGlow}`,
        }} />
        <div style={{
          position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 38,
          color: BRAND.coral, fontSize: 28, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: SHADOW.coral,
        }}>[WALL ACTIVATED $600.00]</div>
        <FlowParticles progress={revealOp} targetY={wallY + 30} intensity={0.8} count={16} spread={80} />
      </div>

      {/* Live System Status Evidence Box */}
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

      {/* Bottom context */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 50, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.data,
      }}>
        <GlassCard color={BRAND.cyan} padding="14px 36px" bracket={true}>
          <span style={{
            color: BRAND.textSecondary, fontSize: 28, fontWeight: 700, fontFamily: MONO_FAMILY,
            letterSpacing: '0.05em',
          }}>HIDDEN STRUCTURE SCANNER: DETECTED</span>
        </GlassCard>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 03: DISTANCE (3.4s–5.7s)
// ═════════════════════════════════════════════════════════════════════════════
const Scene03_Distance: React.FC = () => {
  const frame = useCurrentFrame();
  const wallY = 560;
  const priceY = 1000;
  const bracketH = priceY - wallY;
  const dotPulse = 1 + Math.sin(frame * 0.2) * 0.35;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      <EventFieldBackground intensity={0.55} warmth={0.05} sceneName="scene03" />
      <AmbientCandlestickBg opacity={0.08} baseY={780} height={500} />

      {/* Hero text top */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 40, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.hookText,
      }}>
        <KineticText text="SPY IS" fontSize={72} color={BRAND.textSecondary} delay={0} stagger={2} textShadow={SHADOW.caption} />
      </div>

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

      {/* Yellow bracket */}
      <div style={{ position: 'absolute', left: 740, top: wallY, height: bracketH, zIndex: Z.data }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 10, height: '100%',
          background: BRAND.amber, boxShadow: `0 0 30px ${BRAND.amberGlow}`,
        }} />
        <div style={{ position: 'absolute', left: -24, top: 0, width: 34, height: 10, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: -24, bottom: 0, width: 34, height: 10, background: BRAND.amber }} />
      </div>

      {/* 1.3% hero — center left */}
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

      {/* GAP EVIDENCE DATA */}
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

      {/* Bottom label */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 50, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.data,
      }}>
        <KineticText text="FROM A WALL YOU CAN'T SEE" fontSize={46} color={BRAND.textSecondary} delay={6} stagger={2} textShadow={SHADOW.caption} />
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 04: PRESSURE BUILD (5.7s–8.3s)
// ═════════════════════════════════════════════════════════════════════════════
const Scene04_Pressure: React.FC = () => {
  const frame = useCurrentFrame();
  const wallY = 560;
  const basePrice = 1000;
  const squeeze = interpolate(frame, [0, S(2.2)], [0, 0.78], {
    easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp',
  });
  const currentPrice = basePrice - (basePrice - wallY) * squeeze;
  const bracketH = Math.max(30, currentPrice - wallY);
  const wallGlow = interpolate(squeeze, [0, 0.78], [40, 160]);

  // Screen shake intensifies as squeeze increases
  const shakeX = squeeze > 0.35 ? Math.sin(frame * 0.9) * squeeze * 4.5 : 0;
  const shakeY = squeeze > 0.35 ? Math.cos(frame * 1.2) * squeeze * 3.5 : 0;

  // Warmth shift: cool → warm as pressure builds
  const warmth = interpolate(squeeze, [0, 0.78], [0, 0.45], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{
      zIndex: Z.wallViz,
      transform: `translate(${shakeX}px, ${shakeY}px)`,
    }}>
      <EventFieldBackground intensity={0.65} warmth={warmth} sceneName="scene04" />
      <AmbientCandlestickBg opacity={0.08} baseY={780} height={500} />

      {/* Hero text */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 40, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.hookText,
      }}>
        <KineticText text="PRESSURE" fontSize={84} color={BRAND.text} delay={0} stagger={0} textShadow={SHADOW.hero} />
        <KineticText text="CAN BUILD HERE" fontSize={64} color={BRAND.textSecondary} delay={3} stagger={2} textShadow={SHADOW.caption} />
      </div>

      {/* Red wall with intensifying glow */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 14, background: BRAND.coral,
        boxShadow: `0 0 ${wallGlow}px ${BRAND.coral}, 0 0 ${wallGlow * 2}px ${BRAND.coralGlow}`,
        zIndex: Z.data,
      }} />

      {/* Cyan price line moving up */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: 400,
        top: currentPrice, height: 6, background: BRAND.cyan,
        boxShadow: `0 0 30px ${BRAND.cyanGlow}`, zIndex: Z.data,
      }} />

      {/* Particles rush toward wall as squeeze increases */}
      <FlowParticles
        progress={Math.min(1, frame / S(2.0))}
        targetY={wallY + bracketH * 0.15}
        intensity={0.85} count={22} maxOpacity={0.6} spread={50}
      />

      {/* Squeeze telemetry panel */}
      <TerminalTelemetryPanel
        title="COMPRESSION DELTA"
        metrics={[
          { label: 'RATIO', value: `${(squeeze * 10).toFixed(1)}x DENSITY`, color: BRAND.amber },
          { label: 'GRID PRESSURE', value: '98.4%', color: BRAND.coral },
          { label: 'DELTA BIAS', value: 'INSTITUTIONAL CRITICAL', color: BRAND.purple },
        ]}
        top={1120}
        right={LAYOUT.safeR}
        width={380}
      />

      {/* Yellow bracket — contracts */}
      <div style={{ position: 'absolute', left: 740, top: wallY, height: bracketH, zIndex: Z.data }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 10, height: '100%',
          background: BRAND.amber, boxShadow: `0 0 30px ${BRAND.amberGlow}`,
        }} />
        <div style={{ position: 'absolute', left: -24, top: 0, width: 34, height: 10, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: -24, bottom: 0, width: 34, height: 10, background: BRAND.amber }} />
      </div>

      {/* Bottom — compression indicator */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 50, left: LAYOUT.safeL, right: LAYOUT.safeR,
        zIndex: Z.data, display: 'flex', justifyContent: 'center',
      }}>
        <GlassCard color={BRAND.coral} padding="12px 36px" bracket={true}>
          <span style={{
            color: BRAND.coral, fontSize: 28, fontWeight: 900, fontFamily: MONO_FAMILY,
            letterSpacing: '0.05em',
          }}>TENSION ACCELERATING ▲</span>
        </GlassCard>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 05: SCANNER UNLOCK (8.3s–11.2s)
// ═════════════════════════════════════════════════════════════════════════════
const Scene05_ScannerUnlock: React.FC = () => {
  const frame = useCurrentFrame();
  const scanStart = S(0.3);
  const scanEnd = S(1.0);
  const wallReveal = S(1.0);   // Call Wall appears
  const dpReveal = S(1.5);     // Dark Pool
  const flipReveal = S(2.0);   // Gamma Flip
  const floorReveal = S(2.4);  // Put Floor
  const labelSwap = S(1.0);    // "PRICE ONLY" → "SIGNUMHQ LAYER"

  const scanProg = interpolate(frame, [scanStart, scanEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Layer opacities
  const wallOp = interpolate(frame, [wallReveal, wallReveal + S(0.3)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dpOp = interpolate(frame, [dpReveal, dpReveal + S(0.3)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flipOp = interpolate(frame, [flipReveal, flipReveal + S(0.3)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const floorOp = interpolate(frame, [floorReveal, floorReveal + S(0.3)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const labelOp = interpolate(frame, [labelSwap, labelSwap + S(0.3)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Chart zone
  const chartTop = 400;
  const chartH = 900;
  const callWallY = chartTop + chartH * 0.15;
  const flipY = chartTop + chartH * 0.45;
  const priceY = chartTop + chartH * 0.55;
  const floorY = chartTop + chartH * 0.85;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      <EventFieldBackground intensity={0.55} warmth={0.05} sceneName="scene05" />

      {/* Top label — transitions from PRICE ONLY to SIGNUMHQ LAYER */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 30, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.hookText,
      }}>
        <div style={{ opacity: 1 - labelOp }}>
          <span style={{
            color: BRAND.muted, fontSize: 56, fontWeight: 900, fontFamily: MONO_FAMILY,
          }}>[PRICE ONLY VIEW]</span>
        </div>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          opacity: labelOp,
        }}>
          <span style={{
            color: BRAND.cyan, fontSize: 56, fontWeight: 900, fontFamily: MONO_FAMILY,
            textShadow: SHADOW.cyan,
          }}>[SIGNUMHQ ACTIVE MAP]</span>
        </div>
      </div>

      {/* Candlestick background — the "normal chart" */}
      <AmbientCandlestickBg opacity={0.22} baseY={chartTop + chartH / 2} height={chartH * 0.6} candleCount={30} />

      {/* Grey price line — always visible */}
      <svg width="1080" height="1920" viewBox="0 0 1080 1920"
        style={{ position: 'absolute', top: 0, zIndex: Z.data }}>
        <path d={`M 0,${priceY + 40} C 200,${priceY + 10} 400,${priceY + 60} 600,${priceY + 30} C 800,${priceY} 1000,${priceY + 50} 1080,${priceY + 20}`}
          stroke={BRAND.muted} strokeWidth={4} fill="none" opacity={0.5} />
        <circle cx="900" cy={priceY + 20} r="8" fill={BRAND.cyan} opacity={0.8} />
      </svg>

      {/* Scanner sweep */}
      {frame >= scanStart && frame <= scanEnd + S(0.2) && (
        <ScannerLine progress={scanProg} glow={120} />
      )}

      {/* === REVEALED LAYERS === */}

      {/* Call Wall (red) */}
      <div style={{ opacity: wallOp, zIndex: Z.data }}>
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          top: callWallY, height: 8, background: BRAND.coral,
          boxShadow: `0 0 50px ${BRAND.coralGlow}`,
        }} />
        <div style={{
          position: 'absolute', right: LAYOUT.safeR + 10, top: callWallY - 38,
          color: BRAND.coral, fontSize: 26, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: SHADOW.coral, opacity: wallOp,
        }}>CALL WALL $600</div>
      </div>

      {/* Dark Pool Cluster (cyan particles) */}
      <div style={{ opacity: dpOp }}>
        <FlowParticles progress={dpOp} targetY={callWallY + 60} intensity={0.9} count={14} spread={50} />
        <div style={{
          position: 'absolute', left: LAYOUT.safeL + 10, top: callWallY + 80,
          color: BRAND.cyan, fontSize: 24, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: SHADOW.cyan, zIndex: Z.data,
        }}>[DARK POOL CLUSTER]</div>
      </div>

      {/* Gamma Flip (purple dashed) */}
      <div style={{ opacity: flipOp, zIndex: Z.data }}>
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
      </div>

      {/* Put Floor (emerald) */}
      <div style={{ opacity: floorOp, zIndex: Z.data }}>
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

      {/* Live Map Unlocks status sidebar */}
      <TerminalTelemetryPanel
        title="MAP UNLOCKS"
        metrics={[
          { label: 'CALL WALL $600', value: frame >= wallReveal ? 'VERIFIED' : 'WAITING', color: frame >= wallReveal ? BRAND.coral : BRAND.muted },
          { label: 'DARK POOL CLUSTER', value: frame >= dpReveal ? 'DETECTED' : 'WAITING', color: frame >= dpReveal ? BRAND.cyan : BRAND.muted },
          { label: 'GAMMA FLIP $588', value: frame >= flipReveal ? 'ACTIVE' : 'WAITING', color: frame >= flipReveal ? BRAND.purple : BRAND.muted },
          { label: 'PUT FLOOR $580', value: frame >= floorReveal ? 'BOUNDED' : 'WAITING', color: frame >= floorReveal ? BRAND.emerald : BRAND.muted },
        ]}
        bottom={LAYOUT.safeBot + 110}
        left={LAYOUT.safeL}
        width={380}
      />

      {/* Bottom — layer count */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 40, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.hookText,
      }}>
        <span style={{
          color: BRAND.textSecondary, fontSize: 28, fontWeight: 800, fontFamily: MONO_FAMILY,
          letterSpacing: '0.08em', textShadow: '0 0 10px rgba(0,0,0,0.8)',
        }}>
          {frame < wallReveal ? 'SCANNING...' :
           frame < dpReveal ? '1 / 4 LAYERS ACTIVATED' :
           frame < flipReveal ? '2 / 4 LAYERS ACTIVATED' :
           frame < floorReveal ? '3 / 4 LAYERS ACTIVATED' :
           '4 / 4 STRUCTURE LAYERS REVEALED'}
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 06: STRUCTURE MAP (11.2s–14.2s)
// ═════════════════════════════════════════════════════════════════════════════
const Scene06_StructureMap: React.FC = () => {
  const frame = useCurrentFrame();
  const mapTop = 520;
  const mapH = 750;
  const wallY = mapTop;
  const flipY = mapTop + mapH * 0.38;
  const floorY = mapTop + mapH;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      <EventFieldBackground intensity={0.55} warmth={0.1} sceneName="scene06" />
      <AmbientCandlestickBg opacity={0.06} baseY={mapTop + mapH / 2} height={mapH * 0.5} />

      {/* Hero text */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 30, left: LAYOUT.safeL, right: LAYOUT.safeR,
        zIndex: Z.hookText,
      }}>
        <KineticText text="NOT A PREDICTION." fontSize={72} color={BRAND.textSecondary} delay={0} stagger={2} textShadow={SHADOW.caption} />
        <div style={{ marginTop: 8 }}>
          <KineticText text="A PRESSURE MAP." fontSize={88} color={BRAND.text} delay={6} stagger={2} textShadow={SHADOW.hero} />
        </div>
      </div>

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

      {/* Flow cluster */}
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

      {/* Live active dashboard telemetry */}
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
// SCENE 07: DECISIVE CTA (14.2s–17.8s)
// ═════════════════════════════════════════════════════════════════════════════
const Scene07_CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const breathe = 0.85 + Math.sin(frame * 0.08) * 0.15;

  return (
    <AbsoluteFill style={{ zIndex: Z.hookText }}>
      <EventFieldBackground intensity={0.45} warmth={0.05} sceneName="scene07" />

      {/* Subtle structure echo lines */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: '35%', height: 3,
        background: `linear-gradient(90deg, transparent, ${BRAND.coral}, transparent)`,
        opacity: 0.15, zIndex: Z.grid,
      }} />
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: '65%', height: 3,
        background: `linear-gradient(90deg, transparent, ${BRAND.emerald}, transparent)`,
        opacity: 0.12, zIndex: Z.grid,
      }} />

      {/* Logo — immediately visible */}
      <div style={{
        position: 'absolute', top: 380, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', zIndex: Z.brand,
      }}>
        <svg width="220" height="220" viewBox="246 247 530 530" fill="none"
          style={{ opacity: breathe }}>
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.cyan} />
        </svg>
      </div>

      {/* CTA text — NO spring, instant */}
      <div style={{
        position: 'absolute', top: 680, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.brand,
      }}>
        <KineticText text="SEE THE STRUCTURE" fontSize={76} color={BRAND.text} delay={0} stagger={2} textShadow={SHADOW.hero} />
        <div style={{ marginTop: 10 }}>
          <KineticText text="BEHIND PRICE" fontSize={76} color={BRAND.cyan} delay={4} stagger={2} textShadow={SHADOW.cyan} />
        </div>
      </div>

      {/* URL — upgraded glass card with braces */}
      <div style={{
        position: 'absolute', top: 1040, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', zIndex: Z.brand,
      }}>
        <GlassCard color={BRAND.cyan} padding="22px 64px" borderRadius={36} bracket={true}>
          <span style={{
            color: BRAND.text, fontSize: 50, fontWeight: 900,
            fontFamily: MONO_FAMILY, letterSpacing: '0.12em',
          }}>SIGNUMHQ.COM</span>
        </GlassCard>
      </div>

      {/* Telemetry metadata block inside CTA */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 140, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.data,
      }}>
        <span style={{
          color: BRAND.cyan, fontSize: 20, fontWeight: 700, fontFamily: MONO_FAMILY,
          letterSpacing: '0.15em', opacity: 0.8,
        }}>CONTINUE WITH SIGNUMHQ.COM</span>
      </div>

      {/* Bottom context */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 60, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.data,
      }}>
        <span style={{
          color: BRAND.mutedLight, fontSize: 24, fontWeight: 700, fontFamily: MONO_FAMILY,
          letterSpacing: '0.1em',
        }}>STRUCTURE INTELLIGENCE — DAILY UPDATES</span>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPOSITION — 17.8s @ 30fps = 534 frames
// ═════════════════════════════════════════════════════════════════════════════
export const MarketPressureBriefV24: React.FC<MarketPressureBriefV24Props> = (props) => {
  const { disclaimer } = props;
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <AudioEngine />

      {/* Scene 01: Market Alert — 0.0s to 1.6s */}
      <Sequence from={0} durationInFrames={S(1.6)}>
        <Scene01_MarketAlert />
      </Sequence>

      {/* Scene 02: Hidden Layer — 1.6s to 3.4s */}
      <Sequence from={S(1.6)} durationInFrames={S(1.8)}>
        <Scene02_HiddenLayer />
      </Sequence>

      {/* Scene 03: Distance — 3.4s to 5.7s */}
      <Sequence from={S(3.4)} durationInFrames={S(2.3)}>
        <Scene03_Distance />
      </Sequence>

      {/* Scene 04: Pressure Build — 5.7s to 8.3s */}
      <Sequence from={S(5.7)} durationInFrames={S(2.6)}>
        <Scene04_Pressure />
      </Sequence>

      {/* Scene 05: Scanner Unlock — 8.3s to 11.2s */}
      <Sequence from={S(8.3)} durationInFrames={S(2.9)}>
        <Scene05_ScannerUnlock />
      </Sequence>

      {/* Scene 06: Structure Map — 11.2s to 14.2s */}
      <Sequence from={S(11.2)} durationInFrames={S(3.0)}>
        <Scene06_StructureMap />
      </Sequence>

      {/* Scene 07: CTA — 14.2s to 17.8s */}
      <Sequence from={S(14.2)} durationInFrames={S(3.6)}>
        <Scene07_CTA />
      </Sequence>

      {/* Compliance footer — visible from 2s onward */}
      <Sequence from={S(2)} durationInFrames={S(15.8)}>
        <ComplianceFooter text={disclaimer} />
      </Sequence>

      {/* Progress bar — gradient, always visible */}
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
