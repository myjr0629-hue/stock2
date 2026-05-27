// ============================================================================
// MarketPressureBrief V23 — Bloomberg-Alert Revenue Cut
// ============================================================================
// V23 is NOT a pretty finance graphic.
// V23 makes you FEEL "$420M off-exchange flow near SPY wall" in 0.3 seconds.
//
// What V22 had:           What V23 does:
// ─ Pure black bg         → EventFieldBackground (multi-layer depth)
// ─ 50-70% empty space    → Zone-based layout, max 35% empty
// ─ Static text           → KineticText (word-by-word)
// ─ Weak particles        → Narrative particles (converge toward wall)
// ─ Split-screen product  → Scanner Unlock (same chart transforms)
// ─ Black CTA frame       → Instant CTA, no spring delay
//
// 7 scenes, 17.5s, 525 frames @ 30fps.
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

export type MarketPressureBriefV23Props = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

// ─── Utility: Flow Particles (upgraded — converge TOWARD wall) ───────────────
const FlowParticles: React.FC<{
  progress: number; targetY: number; intensity: number;
  count?: number; maxOpacity?: number; spread?: number;
}> = ({ progress, targetY, intensity, count = 20, maxOpacity = 0.7, spread = 120 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: Z.wallViz - 1 }}>
      {Array.from({ length: count }).map((_, i) => {
        const startX = -60 + random(i) * 1080;
        const endX = 100 + random(i + 50) * 880;
        const startY = 1920 + random(i + 100) * 400;
        const x = interpolate(progress, [0, 1], [startX, endX]);
        const y = interpolate(progress, [0, 1], [startY, targetY + random(i + 200) * spread]);
        const op = interpolate(progress, [0, 0.6, 1], [0, intensity, intensity * maxOpacity]) * (0.5 + random(i) * 0.5);
        const sz = 10 + random(i + 50) * 18;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y, width: sz, height: sz,
            borderRadius: '50%', background: BRAND.cyan, opacity: op,
            boxShadow: `0 0 ${sz * 2.5}px ${BRAND.cyanGlow}`,
            transform: `scale(${1 + Math.sin(frame * 0.15 + i) * 0.35})`,
          }} />
        );
      })}
    </div>
  );
};

// ─── Utility: Scanner Line ───────────────────────────────────────────────────
const ScannerLine: React.FC<{ progress: number; glow?: number }> = ({ progress, glow = 80 }) => {
  const y = interpolate(progress, [0, 1], [-20, 1940]);
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: y, height: 4,
      background: `linear-gradient(90deg, transparent 0%, ${BRAND.cyan} 20%, ${BRAND.cyan} 80%, transparent 100%)`,
      boxShadow: `0 0 ${glow}px ${BRAND.cyanGlow}, 0 0 ${glow * 2}px ${BRAND.cyanGlow}`,
      zIndex: Z.data + 5, pointerEvents: 'none', opacity: 0.9,
    }} />
  );
};

// ─── Audio Engine (reuse V22 audio) ──────────────────────────────────────────
const AudioEngine: React.FC = () => (
  <>
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
// SCENE 01: MARKET ALERT (0.0s–0.8s)
// Bloomberg-style market alert. NOT a text card.
// $420M + 91st PERCENTILE + NEAR $600 WALL — visible at frame 0.
// ═════════════════════════════════════════════════════════════════════════════
const Scene01_MarketAlert: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const wallY = 1150;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      <EventFieldBackground intensity={0.6} warmth={0} />
      <AlertTopBar ticker="SPY" price={592.31} alertText="OFF-EXCHANGE ALERT" />
      <AmbientCandlestickBg opacity={0.07} baseY={1200} height={350} />

      {/* Red Call Wall — immediately visible in lower zone */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 12, background: BRAND.coral,
        boxShadow: `0 0 80px ${BRAND.coralGlow}, 0 0 160px ${BRAND.coralGlow}`,
        zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 38,
        color: BRAND.coral, fontSize: 28, fontWeight: 800, fontFamily: TYPE.family,
        textShadow: SHADOW.coral, zIndex: Z.data,
      }}>$600 CALL WALL</div>

      {/* Particles converging toward wall */}
      <FlowParticles progress={Math.max(0.4, frame / S(1.0))} targetY={wallY + 20} intensity={0.9} count={18} spread={100} />

      {/* HERO ZONE — upper center */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 80, left: LAYOUT.safeL, right: LAYOUT.safeR,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        zIndex: Z.hookText,
      }}>
        {/* $420M — starts high, counts up fast from 200 */}
        <CountUpNumber
          target={420} prefix="$" suffix="M"
          fontSize={130} color={BRAND.text} duration={8} delay={0}
          textShadow={SHADOW.hero}
          formatFn={(n: number) => Math.max(200, Math.round(n)).toString()}
        />

        {/* OFF-EXCHANGE FLOW */}
        <KineticText
          text="OFF-EXCHANGE FLOW"
          fontSize={54} color={BRAND.cyan} delay={0} stagger={1}
          textShadow={SHADOW.cyan}
        />
      </div>

      {/* Glass card — proof badges */}
      <div style={{
        position: 'absolute', top: 580, left: LAYOUT.safeL + 40, right: LAYOUT.safeR + 40,
        zIndex: Z.hookText,
        display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center',
      }}>
        <GlassCard color={BRAND.cyan} padding="16px 40px">
          <span style={{
            color: BRAND.text, fontSize: 44, fontWeight: 900, fontFamily: TYPE.family,
          }}>91st PERCENTILE</span>
        </GlassCard>

        <GlassCard color={BRAND.coral} padding="14px 36px">
          <span style={{
            color: BRAND.coral, fontSize: 40, fontWeight: 900, fontFamily: TYPE.family,
          }}>NEAR $600 WALL</span>
        </GlassCard>
      </div>

      {/* Bottom zone — price context */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 60, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.data,
      }}>
        <span style={{
          color: BRAND.muted, fontSize: 28, fontWeight: 700, fontFamily: TYPE.family,
          letterSpacing: '0.1em',
        }}>SPY $592.31 — 1.3% FROM WALL</span>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 02: HIDDEN LAYER (0.8s–2.2s)
// Scanner reveals structure on a real-looking chart.
// ═════════════════════════════════════════════════════════════════════════════
const Scene02_HiddenLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const scanProg = interpolate(frame, [0, S(0.6)], [0, 1], { extrapolateRight: 'clamp' });
  const revealOp = interpolate(frame, [S(0.4), S(1.0)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const wallY = 750;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      <EventFieldBackground intensity={0.5} warmth={0} />
      <AmbientCandlestickBg opacity={0.12} baseY={850} height={400} />

      {/* Hero text — upper zone */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 60, left: LAYOUT.safeL, right: LAYOUT.safeR,
        zIndex: Z.hookText,
      }}>
        <KineticText text="MOST CHARTS" fontSize={88} color={BRAND.textSecondary} delay={0} stagger={3} textShadow={SHADOW.hero} />
        <KineticText text="DON'T SHOW THIS" fontSize={88} color={BRAND.text} delay={4} stagger={3} textShadow={SHADOW.hero} />
      </div>

      {/* Scanner sweep through chart area */}
      <ScannerLine progress={scanProg} glow={100} />

      {/* Hidden wall — revealed after scanner */}
      <div style={{ opacity: revealOp, zIndex: Z.data }}>
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          top: wallY, height: 10, background: BRAND.coral,
          boxShadow: `0 0 60px ${BRAND.coralGlow}, 0 0 120px ${BRAND.coralGlow}`,
        }} />
        <div style={{
          position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 38,
          color: BRAND.coral, fontSize: 30, fontWeight: 800, fontFamily: TYPE.family,
          textShadow: SHADOW.coral,
        }}>$600 CALL WALL</div>
        <FlowParticles progress={revealOp} targetY={wallY + 30} intensity={0.8} count={14} spread={80} />
      </div>

      {/* Bottom context */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 80, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.data,
      }}>
        <GlassCard color={BRAND.cyan} padding="14px 32px">
          <span style={{
            color: BRAND.textSecondary, fontSize: 30, fontWeight: 700, fontFamily: TYPE.family,
          }}>HIDDEN STRUCTURE DETECTED</span>
        </GlassCard>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 03: DISTANCE (2.2s–4.5s)
// 1.3% gap between price and wall — bracket compression visual.
// ═════════════════════════════════════════════════════════════════════════════
const Scene03_Distance: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const wallY = 560;
  const priceY = 1000;
  const bracketH = priceY - wallY;
  const dotPulse = 1 + Math.sin(frame * 0.15) * 0.3;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz }}>
      <EventFieldBackground intensity={0.5} warmth={0.05} />
      <AmbientCandlestickBg opacity={0.06} baseY={780} height={500} />

      {/* Hero text top */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 40, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.hookText,
      }}>
        <KineticText text="SPY IS" fontSize={68} color={BRAND.textSecondary} delay={0} stagger={2} textShadow={SHADOW.caption} />
      </div>

      {/* Red wall */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 10, background: BRAND.coral,
        boxShadow: `0 0 50px ${BRAND.coralGlow}`, zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 36,
        color: BRAND.coral, fontSize: 28, fontWeight: 800, fontFamily: TYPE.family,
        textShadow: SHADOW.coral, zIndex: Z.data,
      }}>$600 WALL</div>

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

      {/* Bottom label */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 60, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.data,
      }}>
        <KineticText text="FROM A WALL YOU CAN'T SEE" fontSize={46} color={BRAND.textSecondary} delay={6} stagger={2} textShadow={SHADOW.caption} />
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 04: PRESSURE BUILD (4.5s–7.0s)
// Price rises toward wall. Physical compression. Screen shakes.
// ═════════════════════════════════════════════════════════════════════════════
const Scene04_Pressure: React.FC = () => {
  const frame = useCurrentFrame();
  const wallY = 560;
  const basePrice = 1000;
  const squeeze = interpolate(frame, [0, S(2.0)], [0, 0.75], {
    easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp',
  });
  const currentPrice = basePrice - (basePrice - wallY) * squeeze;
  const bracketH = Math.max(30, currentPrice - wallY);
  const wallGlow = interpolate(squeeze, [0, 0.75], [40, 160]);

  // Screen shake intensifies as squeeze increases
  const shakeX = squeeze > 0.3 ? Math.sin(frame * 0.8) * squeeze * 3 : 0;
  const shakeY = squeeze > 0.3 ? Math.cos(frame * 1.1) * squeeze * 2 : 0;

  // Warmth shift: cool → warm as pressure builds
  const warmth = interpolate(squeeze, [0, 0.75], [0, 0.4], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{
      zIndex: Z.wallViz,
      transform: `translate(${shakeX}px, ${shakeY}px)`,
    }}>
      <EventFieldBackground intensity={0.6} warmth={warmth} />
      <AmbientCandlestickBg opacity={0.06} baseY={780} height={500} />

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
        progress={Math.min(1, frame / S(1.5))}
        targetY={wallY + bracketH * 0.2}
        intensity={0.8} count={18} maxOpacity={0.5} spread={60}
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
        position: 'absolute', bottom: LAYOUT.safeBot + 60, left: LAYOUT.safeL, right: LAYOUT.safeR,
        zIndex: Z.data, display: 'flex', justifyContent: 'center',
      }}>
        <GlassCard color={BRAND.coral} padding="12px 32px">
          <span style={{
            color: BRAND.coral, fontSize: 28, fontWeight: 800, fontFamily: TYPE.family,
          }}>GAP COMPRESSING ▲</span>
        </GlassCard>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 05: SCANNER UNLOCK (7.0s–10.5s)
// Same chart transforms. NO split screen.
// Scanner reveals layers one by one on the SAME chart.
// ═════════════════════════════════════════════════════════════════════════════
const Scene05_ScannerUnlock: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = S(3.5);

  // Phase timings (in local frames)
  const scanStart = S(0.3);
  const scanEnd = S(1.0);
  const wallReveal = S(1.0);   // Call Wall appears
  const dpReveal = S(1.5);     // Dark Pool
  const flipReveal = S(2.0);   // Gamma Flip
  const floorReveal = S(2.5);  // Put Floor
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
      <EventFieldBackground intensity={0.55} warmth={0.05} />

      {/* Top label — transitions from PRICE ONLY to SIGNUMHQ LAYER */}
      <div style={{
        position: 'absolute', top: LAYOUT.safeTop + 30, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.hookText,
      }}>
        <div style={{ opacity: 1 - labelOp }}>
          <span style={{
            color: BRAND.muted, fontSize: 56, fontWeight: 800, fontFamily: TYPE.family,
          }}>PRICE ONLY</span>
        </div>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          opacity: labelOp,
        }}>
          <span style={{
            color: BRAND.cyan, fontSize: 56, fontWeight: 900, fontFamily: TYPE.family,
            textShadow: SHADOW.cyan,
          }}>SIGNUMHQ LAYER</span>
        </div>
      </div>

      {/* Candlestick background — the "normal chart" */}
      <AmbientCandlestickBg opacity={0.18} baseY={chartTop + chartH / 2} height={chartH * 0.6} candleCount={30} />

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
        <GlassCard color={BRAND.coral} padding="6px 20px" opacity={wallOp}>
          <span style={{
            position: 'absolute', right: LAYOUT.safeR + 10, top: callWallY - 40,
            color: BRAND.coral, fontSize: 26, fontWeight: 800, fontFamily: TYPE.family,
          }}>CALL WALL $600</span>
        </GlassCard>
        <div style={{
          position: 'absolute', right: LAYOUT.safeR + 10, top: callWallY - 38,
          color: BRAND.coral, fontSize: 26, fontWeight: 800, fontFamily: TYPE.family,
          textShadow: SHADOW.coral, opacity: wallOp,
        }}>CALL WALL $600</div>
      </div>

      {/* Dark Pool Cluster (cyan particles) */}
      <div style={{ opacity: dpOp }}>
        <FlowParticles progress={dpOp} targetY={callWallY + 60} intensity={0.9} count={12} spread={50} />
        <div style={{
          position: 'absolute', left: LAYOUT.safeL + 10, top: callWallY + 80,
          color: BRAND.cyan, fontSize: 24, fontWeight: 800, fontFamily: TYPE.family,
          textShadow: SHADOW.cyan, zIndex: Z.data,
        }}>DARK POOL CLUSTER</div>
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
          color: BRAND.purple, fontSize: 26, fontWeight: 800, fontFamily: TYPE.family,
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
          color: BRAND.emerald, fontSize: 26, fontWeight: 800, fontFamily: TYPE.family,
        }}>PUT FLOOR $580</div>
      </div>

      {/* Bottom — layer count */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 50, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.hookText,
      }}>
        <span style={{
          color: BRAND.textSecondary, fontSize: 26, fontWeight: 700, fontFamily: TYPE.family,
          letterSpacing: '0.08em',
        }}>
          {frame < wallReveal ? 'SCANNING...' :
           frame < dpReveal ? '1 / 4 LAYERS' :
           frame < flipReveal ? '2 / 4 LAYERS' :
           frame < floorReveal ? '3 / 4 LAYERS' :
           '4 / 4 LAYERS REVEALED'}
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 06: STRUCTURE MAP (10.5s–13.5s)
// Full map + "NOT A PREDICTION. A PRESSURE MAP."
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
      <EventFieldBackground intensity={0.5} warmth={0.1} />
      <AmbientCandlestickBg opacity={0.05} baseY={mapTop + mapH / 2} height={mapH * 0.5} />

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
        <GlassCard color={BRAND.coral} padding="6px 16px">
          <span style={{ color: BRAND.coral, fontSize: 24, fontWeight: 800, fontFamily: TYPE.family }}>
            CALL WALL $600
          </span>
        </GlassCard>
      </div>

      {/* Flow cluster */}
      <FlowParticles progress={1} targetY={wallY + 50} intensity={0.7} count={14} />

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
        <GlassCard color={BRAND.purple} padding="6px 16px">
          <span style={{ color: BRAND.purple, fontSize: 24, fontWeight: 800, fontFamily: TYPE.family }}>
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
        <GlassCard color={BRAND.emerald} padding="6px 16px">
          <span style={{ color: BRAND.emerald, fontSize: 24, fontWeight: 800, fontFamily: TYPE.family }}>
            PUT FLOOR $580
          </span>
        </GlassCard>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 07: CTA (13.5s–17.5s)
// NO spring delay. Instant display. Background is alive, not black.
// ═════════════════════════════════════════════════════════════════════════════
const Scene07_CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const breathe = 0.85 + Math.sin(frame * 0.06) * 0.15;

  return (
    <AbsoluteFill style={{ zIndex: Z.hookText }}>
      <EventFieldBackground intensity={0.4} warmth={0.05} />

      {/* Subtle structure echo lines */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: '35%', height: 3,
        background: `linear-gradient(90deg, transparent, ${BRAND.coral}, transparent)`,
        opacity: 0.12, zIndex: Z.grid,
      }} />
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: '65%', height: 3,
        background: `linear-gradient(90deg, transparent, ${BRAND.emerald}, transparent)`,
        opacity: 0.1, zIndex: Z.grid,
      }} />

      {/* Logo — immediately visible */}
      <div style={{
        position: 'absolute', top: 420, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', zIndex: Z.brand,
      }}>
        <svg width="200" height="200" viewBox="246 247 530 530" fill="none"
          style={{ opacity: breathe }}>
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.cyan} />
        </svg>
      </div>

      {/* CTA text — NO spring, instant */}
      <div style={{
        position: 'absolute', top: 700, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.brand,
      }}>
        <KineticText text="SEE THE STRUCTURE" fontSize={74} color={BRAND.text} delay={0} stagger={2} textShadow={SHADOW.hero} />
        <div style={{ marginTop: 8 }}>
          <KineticText text="BEHIND PRICE" fontSize={74} color={BRAND.cyan} delay={4} stagger={2} textShadow={SHADOW.cyan} />
        </div>
      </div>

      {/* URL — glass card */}
      <div style={{
        position: 'absolute', top: 1050, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', zIndex: Z.brand,
      }}>
        <GlassCard color={BRAND.cyan} padding="20px 60px" borderRadius={36}>
          <span style={{
            color: BRAND.text, fontSize: 48, fontWeight: 900,
            fontFamily: TYPE.family, letterSpacing: '0.1em',
          }}>SIGNUMHQ.COM</span>
        </GlassCard>
      </div>

      {/* Bottom context */}
      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 100, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.data,
      }}>
        <span style={{
          color: BRAND.muted, fontSize: 24, fontWeight: 600, fontFamily: TYPE.family,
          letterSpacing: '0.1em',
        }}>STRUCTURE INTELLIGENCE — DAILY UPDATES</span>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPOSITION — 17.5s @ 30fps = 525 frames
// ═════════════════════════════════════════════════════════════════════════════
export const MarketPressureBriefV23: React.FC<MarketPressureBriefV23Props> = (props) => {
  const { disclaimer } = props;
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <AudioEngine />

      {/* Scene 01: Market Alert — 0.0s to 0.8s */}
      <Sequence from={0} durationInFrames={S(0.8)}>
        <Scene01_MarketAlert />
      </Sequence>

      {/* Scene 02: Hidden Layer — 0.8s to 2.2s */}
      <Sequence from={S(0.8)} durationInFrames={S(1.4)}>
        <Scene02_HiddenLayer />
      </Sequence>

      {/* Scene 03: Distance — 2.2s to 4.5s */}
      <Sequence from={S(2.2)} durationInFrames={S(2.3)}>
        <Scene03_Distance />
      </Sequence>

      {/* Scene 04: Pressure Build — 4.5s to 7.0s */}
      <Sequence from={S(4.5)} durationInFrames={S(2.5)}>
        <Scene04_Pressure />
      </Sequence>

      {/* Scene 05: Scanner Unlock — 7.0s to 10.5s */}
      <Sequence from={S(7.0)} durationInFrames={S(3.5)}>
        <Scene05_ScannerUnlock />
      </Sequence>

      {/* Scene 06: Structure Map — 10.5s to 13.5s */}
      <Sequence from={S(10.5)} durationInFrames={S(3.0)}>
        <Scene06_StructureMap />
      </Sequence>

      {/* Scene 07: CTA — 13.5s to 17.5s */}
      <Sequence from={S(13.5)} durationInFrames={S(4.0)}>
        <Scene07_CTA />
      </Sequence>

      {/* Compliance footer — visible from 2s onward */}
      <Sequence from={S(2)} durationInFrames={S(15.5)}>
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
          boxShadow: `0 0 12px ${BRAND.cyanGlow}`,
        }} />
      </div>
    </AbsoluteFill>
  );
};
