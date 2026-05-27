// ============================================================================
// MarketPressureBrief V25 REFINED — Cinematic 28s Magic Refinement
// ============================================================================
// Resolves feedback on visual monotony, dark backdrop dullness, messaging clarity,
// and lack of Replicate AI impact.
//
// Key enhancements:
// 1. Replicate AI Camera Motion: Slow 3D cubic scale-in over 28s (1.0x to 1.35x).
// 2. High-Contrast Scene Shifts: Pure dark -> Cyan sparks -> Neon Gold -> Hot Coral -> Violet Flash.
// 3. Cognitive Shock Mega-Captions: Giant, centered, high-contrast, glitch-shadow text.
// 4. Strobe Light Implosion: Violent 0.08s strobe flash during options gamma collapse.
// 5. Heavy Shake Telemetry: Dynamic camera matrix distortion during the critical 1.3% squeeze.
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

export type MarketPressureBriefV25Props = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

const MONO_FAMILY = "'JetBrains Mono', 'SF Mono', monospace";

// ─── Utility: Narrative Flow Particles ───────────────────────────────────────
const FlowParticles: React.FC<{
  progress: number; targetY: number; intensity: number;
  count?: number; maxOpacity?: number; spread?: number; color?: string;
}> = ({ progress, targetY, intensity, count = 35, maxOpacity = 0.9, spread = 150, color = BRAND.cyan }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: Z.wallViz - 1 }}>
      {Array.from({ length: count }).map((_, i) => {
        const startX = -80 + random(i) * 1240;
        const endX = 50 + random(i + 50) * 980;
        const startY = 1920 + random(i + 90) * 500;
        const x = interpolate(progress, [0, 1], [startX, endX]);
        const y = interpolate(progress, [0, 1], [startY, targetY + random(i + 130) * spread]);
        const op = interpolate(progress, [0, 0.3, 1], [0, intensity, intensity * maxOpacity]) * (0.4 + random(i) * 0.6);
        const sz = 16 + random(i + 40) * 26;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y, width: sz, height: sz,
            borderRadius: '50%', background: color, opacity: op,
            boxShadow: `0 0 ${sz * 4}px ${color}, 0 0 ${sz * 8}px ${color}`,
            transform: `scale(${1 + Math.sin(frame * 0.3 + i) * 0.5})`,
          }} />
        );
      })}
    </div>
  );
};

// ─── Utility: Implode Particles for Scene 5 ──────────────────────────────────
const ImplodeParticles: React.FC<{ progress: number }> = ({ progress }) => {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: Z.wallViz - 1 }}>
      {Array.from({ length: 45 }).map((_, i) => {
        const angle = random(i) * Math.PI * 2;
        const startRadius = 600 + random(i + 20) * 400;
        const endRadius = 10 + random(i + 40) * 50;
        const radius = interpolate(progress, [0, 1], [startRadius, endRadius], { easing: Easing.out(Easing.quad) });
        
        const x = 540 + Math.cos(angle) * radius;
        const y = 960 + Math.sin(angle) * radius;
        
        const size = interpolate(progress, [0, 1], [24, 6]);
        const opacity = interpolate(progress, [0, 0.2, 0.8, 1], [0, 0.9, 0.9, 0]);
        const color = i % 2 === 0 ? BRAND.purple : BRAND.coral;
        
        return (
          <div key={i} style={{
            position: 'absolute', left: x - size / 2, top: y - size / 2,
            width: size, height: size, borderRadius: '50%',
            background: color, opacity,
            boxShadow: `0 0 ${size * 3}px ${color}, 0 0 ${size * 6}px ${color}`,
          }} />
        );
      })}
    </div>
  );
};

// ─── Utility: Technical Scanner Line ─────────────────────────────────────────
const ScannerLine: React.FC<{ progress: number; glow?: number; color?: string }> = ({ progress, glow = 150, color = BRAND.cyan }) => {
  const y = interpolate(progress, [0, 1], [-80, 2000]);
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: y, height: 8,
      background: `linear-gradient(90deg, transparent 0%, ${color} 15%, #ffffff 50%, ${color} 85%, transparent 100%)`,
      boxShadow: `0 0 ${glow}px ${color}, 0 0 ${glow * 2.0}px ${color}, inset 0 0 15px #ffffff`,
      zIndex: Z.data + 8, pointerEvents: 'none', opacity: 0.99,
    }} />
  );
};

// ─── Telemetry Dashboard Panel (Highly Styled) ───────────────────────────────
const TerminalTelemetryPanel: React.FC<{
  title: string;
  metrics: { label: string; value: string; color?: string }[];
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  width?: number;
}> = ({ title, metrics, top, left, right, bottom, width = 450 }) => {
  return (
    <div style={{
      position: 'absolute', top, left, right, bottom, width,
      zIndex: Z.data + 2,
    }}>
      <GlassCard color="rgba(34,211,238,0.22)" padding="16px 24px" bracket={true}>
        <div style={{
          fontFamily: MONO_FAMILY, fontSize: 14.5, fontWeight: 900,
          color: BRAND.cyan, letterSpacing: '0.1em', borderBottom: '2px solid rgba(34,211,238,0.3)',
          paddingBottom: 8, marginBottom: 12, textTransform: 'uppercase',
          textShadow: `0 0 10px ${BRAND.cyanGlow}`,
        }}>{title}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {metrics.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: MONO_FAMILY, fontSize: 13, fontWeight: 600, color: BRAND.mutedLight }}>{m.label}</span>
              <span style={{ fontFamily: MONO_FAMILY, fontSize: 14, fontWeight: 800, color: m.color || BRAND.text, textShadow: m.color ? `0 0 8px ${m.color}` : 'none' }}>{m.value}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
};

// ─── Dynamic Word-Level Active Caption Overlay ───────────────────────────────
const V25CaptionOverlay: React.FC<{ captions: CaptionSegment[]; frame: number; fps: number }> = ({ captions, frame, fps }) => {
  if (!captions || captions.length === 0) return null;
  
  const activeIndex = captions.findIndex(c => frame >= c.startFrame && frame < c.endFrame);
  if (activeIndex === -1) return null;
  
  const activeCaption = captions[activeIndex];
  
  // Calculate spring pulse based on the start of this specific caption word
  const wordFrame = frame - activeCaption.startFrame;
  const wordSpring = spring({
    frame: wordFrame,
    fps,
    config: {
      damping: 9,
      mass: 0.35,
      stiffness: 140,
    },
  });
  
  // Dynamic scale pulse on word reveal
  const scale = interpolate(wordSpring, [0, 0.4, 1], [0.85, 1.2, 1.0]);
  const text = activeCaption.text.toUpperCase();
  const accentColor = activeCaption.color || (activeCaption.emphasis ? BRAND.cyan : BRAND.text);
  
  const glowShadow = activeCaption.emphasis 
    ? `0 0 25px ${accentColor}, 0 0 50px ${accentColor}, 0 4px 20px rgba(0,0,0,0.9)`
    : `0 0 15px rgba(255,255,255,0.45), 0 4px 15px rgba(0,0,0,0.9)`;

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
        fontSize: activeCaption.emphasis ? 135 : 100,
        color: accentColor,
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: '-0.02em',
        lineHeight: 0.95,
        textShadow: glowShadow,
        transform: `scale(${scale})`,
        display: 'inline-block',
      }}>
        {text}
      </div>
    </div>
  );
};

// ─── Audio Engine ────────────────────────────────────────────────────────────
const AudioEngine: React.FC = () => (
  <>
    <Audio src={staticFile('shorts/audio/v25_voice.mp3')} volume={0.96} />
    <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.16} startFrom={0} endAt={S(18)} />
    <Sequence from={S(11)}>
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.24} startFrom={S(4)} endAt={S(17)} />
    </Sequence>
    <Sequence from={S(21.5)}>
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.20} startFrom={S(1)} />
    </Sequence>

    <Sequence from={S(0.0)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.65} /></Sequence>
    <Sequence from={S(1.0)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.55} /></Sequence>
    <Sequence from={S(3.0)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.50} /></Sequence>
    <Sequence from={S(8.0)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.58} /></Sequence>
    <Sequence from={S(12.0)}><Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.65} /></Sequence>
    <Sequence from={S(17.0)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.70} /></Sequence>
    <Sequence from={S(21.0)}><Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.55} /></Sequence>
    <Sequence from={S(25.0)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.48} /></Sequence>
  </>
);

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 01: THE HOOK - GOLD NEON HIGH CONTRAS DESIGN (0.0s–3.0s, 90f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene01_MarketAlert: React.FC = () => {
  const frame = useCurrentFrame();
  const wallY = 1120;
  const opacity = interpolate(frame, [S(2.7), S(3.0)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 3D Ken Burns scale & pan
  const scale = interpolate(frame, [0, S(3.0)], [1.04, 1.15], { easing: Easing.bezier(0.25, 0.1, 0.25, 1.0) });
  const panY = interpolate(frame, [0, S(3.0)], [-30, 30]);

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz, opacity }}>
      {/* AI Scenic Backdrop */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: Z.bg,
        transform: `scale(${scale}) translateY(${panY}px)`,
      }}>
        <img
          src={staticFile('shorts/broll/v25_scene1_hook.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          alt="Scene 1 AI visual"
        />
      </div>

      {/* Dynamic hot red-tint ambient background overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle, rgba(239,68,68,0.2) 0%, transparent 80%)`,
        zIndex: Z.bg + 1, pointerEvents: 'none',
      }} />

      <AlertTopBar ticker="SPY" price={592.31} alertText="CRITICAL LIQUIDITY DETECTED" />
      <AmbientCandlestickBg opacity={0.15} baseY={1200} height={350} />

      {/* Red Call Wall with heavy high-brightness glow */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 16, background: BRAND.coral,
        boxShadow: `0 0 100px ${BRAND.coral}, 0 0 200px ${BRAND.coralGlow}, 0 0 300px ${BRAND.coralGlow}`,
        zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 45,
        color: BRAND.coral, fontSize: 32, fontWeight: 900, fontFamily: MONO_FAMILY,
        textShadow: `0 0 15px ${BRAND.coral}, 0 0 30px ${BRAND.coral}`, zIndex: Z.data, letterSpacing: '0.08em',
      }}>[CALL WALL BLAST LEVEL $600.00]</div>

      <FlowParticles progress={Math.max(0.3, frame / S(3.0))} targetY={wallY + 20} intensity={0.98} count={35} spread={100} color={BRAND.coral} />

      <TerminalTelemetryPanel
        title="QUANT TERMINAL"
        metrics={[
          { label: 'RISK VECTOR', value: 'GAMMA SQUEEZE DETECTED', color: BRAND.coral },
          { label: 'OFF-EXCH FLOW', value: '420M SPECULATIVE', color: BRAND.cyan },
          { label: 'DETECTION RATIO', value: '91% VOLATILITY PRESSURE', color: BRAND.amber },
        ]}
        top={800}
        left={LAYOUT.safeL}
        width={420}
      />

      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 50, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.data,
      }}>
        <span style={{
          color: BRAND.text, fontSize: 32, fontWeight: 900, fontFamily: MONO_FAMILY,
          letterSpacing: '0.12em', textShadow: '0 0 15px rgba(255,255,255,0.85)',
          background: 'rgba(9,10,15,0.8)', padding: '10px 24px', borderRadius: 8,
          border: `1px solid ${BRAND.coral}`,
        }}>SPY CRITICAL RESISTANCE: $600.00</span>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 02: HIDDEN LAYER - CYAN NEON SPARKS (3.0s–8.0s, 150f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene02_HiddenLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const scanProg = interpolate(frame, [0, S(1.5)], [0, 1], { extrapolateRight: 'clamp' });
  const revealOp = interpolate(frame, [S(0.6), S(2.0)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = interpolate(frame, [S(4.7), S(5.0)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const wallY = 780;

  // 3D Ken Burns scale & vertical fall pan
  const scale = interpolate(frame, [0, S(5.0)], [1.05, 1.18], { easing: Easing.bezier(0.25, 0.1, 0.25, 1.0) });
  const panY = interpolate(frame, [0, S(5.0)], [-50, 50]);

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz, opacity }}>
      {/* AI Scenic Backdrop */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: Z.bg,
        transform: `scale(${scale}) translateY(${panY}px)`,
      }}>
        <img
          src={staticFile('shorts/broll/v25_scene2_darkpool.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          alt="Scene 2 AI visual"
        />
      </div>

      {/* Cyan electric haze backdrop overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle, rgba(34,211,238,0.18) 0%, transparent 85%)`,
        zIndex: Z.bg + 1, pointerEvents: 'none',
      }} />

      <AmbientCandlestickBg opacity={0.2} baseY={850} height={400} />
      <ScannerLine progress={scanProg} glow={180} color={BRAND.cyan} />

      {/* Hidden wall — revealed after scanner */}
      <div style={{ opacity: revealOp, zIndex: Z.data }}>
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          top: wallY, height: 12, background: BRAND.cyan,
          boxShadow: `0 0 80px ${BRAND.cyan}, 0 0 160px ${BRAND.cyanGlow}`,
        }} />
        <div style={{
          position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 45,
          color: BRAND.cyan, fontSize: 32, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: `0 0 15px ${BRAND.cyan}`,
        }}>[OFF-EXCHANGE CLUSTER DETECTED]</div>
        <FlowParticles progress={revealOp} targetY={wallY + 30} intensity={0.9} count={28} spread={90} color={BRAND.cyan} />
      </div>

      <TerminalTelemetryPanel
        title="DARK ROUTE ANOMALY"
        metrics={[
          { label: 'ROUTE SPEED', value: '420M SPECULATIVE INST.', color: BRAND.cyan },
          { label: 'CO-LOCATION COEFFICIENT', value: '2.4x ANOMALY STRENGTH', color: BRAND.amber },
          { label: 'PERCENTILE STATUS', value: '91st %ILE UNREPORTED', color: BRAND.purple },
        ]}
        top={920}
        left={LAYOUT.safeL}
        width={420}
      />
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 03: REVEALED - GOLD NEON HIGH CONTRAST (8.0s–12.0s, 120f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene03_Distance: React.FC = () => {
  const frame = useCurrentFrame();
  const wallY = 560;
  const priceY = 1000;
  const bracketH = priceY - wallY;
  const dotPulse = 1 + Math.sin(frame * 0.25) * 0.45;
  const opacity = interpolate(frame, [S(3.7), S(4.0)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 3D Ken Burns scale & pan (zooming out to reveal structures)
  const scale = interpolate(frame, [0, S(4.0)], [1.20, 1.03], { easing: Easing.bezier(0.25, 0.1, 0.25, 1.0) });
  const panX = interpolate(frame, [0, S(4.0)], [-20, 20]);

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz, opacity }}>
      {/* AI Scenic Backdrop */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: Z.bg,
        transform: `scale(${scale}) translateX(${panX}px)`,
      }}>
        <img
          src={staticFile('shorts/broll/v25_scene3_reveal.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          alt="Scene 3 AI visual"
        />
      </div>

      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle, rgba(245,158,11,0.22) 0%, transparent 90%)`,
        zIndex: Z.bg + 1, pointerEvents: 'none',
      }} />

      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 10, background: BRAND.coral,
        boxShadow: `0 0 60px ${BRAND.coral}`, zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 36,
        color: BRAND.coral, fontSize: 26, fontWeight: 900, fontFamily: MONO_FAMILY,
        textShadow: `0 0 10px ${BRAND.coral}`, zIndex: Z.data,
      }}>[CALL WALL PROXIMITY REGIME]</div>

      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: 400,
        top: priceY, height: 6, background: BRAND.cyan,
        boxShadow: `0 0 35px ${BRAND.cyan}`, zIndex: Z.data,
      }} />
      <div style={{
        position: 'absolute', left: 680, top: priceY - 12, width: 24, height: 24,
        borderRadius: '50%', background: BRAND.cyan,
        boxShadow: `0 0 45px ${BRAND.cyan}`,
        transform: `scale(${dotPulse})`, zIndex: Z.data,
      }} />

      {/* Gold bracket */}
      <div style={{ position: 'absolute', left: 740, top: wallY, height: bracketH, zIndex: Z.data }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 12, height: '100%',
          background: BRAND.amber, boxShadow: `0 0 40px ${BRAND.amber}`,
        }} />
        <div style={{ position: 'absolute', left: -24, top: 0, width: 36, height: 12, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: -24, bottom: 0, width: 36, height: 12, background: BRAND.amber }} />
      </div>

      <div style={{
        position: 'absolute', left: 100, top: wallY + bracketH / 2 - 80,
        zIndex: Z.hookText,
      }}>
        <CountUpNumber
          target={1.3} prefix="" suffix="%"
          fontSize={180} color={BRAND.amber} duration={12} delay={0}
          textShadow={`0 0 30px ${BRAND.amber}`}
          formatFn={(n: number) => (1.3).toFixed(1)}
        />
      </div>

      <TerminalTelemetryPanel
        title="GAP METRIC RADAR"
        metrics={[
          { label: 'GAP SIZE', value: '1.34% TO LIQUIDITY', color: BRAND.amber },
          { label: 'SPOT ACCURACY', value: '99.8% REAL-TIME FEED', color: BRAND.emerald },
          { label: 'COEF BIAS', value: 'INSTITUTIONAL PRESSURE', color: BRAND.purple },
        ]}
        top={1120}
        right={LAYOUT.safeR}
        width={420}
      />
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 04: THE GAP IS SHRINKING - RED COMPRESSION (12.0s–17.0s, 150f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene04_Pressure: React.FC = () => {
  const frame = useCurrentFrame();
  const wallY = 560;
  const basePrice = 1000;
  const squeeze = interpolate(frame, [0, S(4.5)], [0, 0.94], {
    easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp',
  });
  const currentPrice = basePrice - (basePrice - wallY) * squeeze;
  const bracketH = Math.max(20, currentPrice - wallY);
  const wallGlow = interpolate(squeeze, [0, 0.94], [40, 220]);
  const opacity = interpolate(frame, [S(4.7), S(5.0)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 3D Ken Burns scale & pan (zooming in fast to increase compression feel)
  const scale = interpolate(frame, [0, S(5.0)], [1.02, 1.28], { easing: Easing.bezier(0.25, 0.1, 0.25, 1.0) });
  const panX = interpolate(frame, [0, S(5.0)], [30, -30]);

  // Heavy camera distortion matrix shake for deep tension build (2.5x increase in intensity)
  const shakeX = squeeze > 0.2 ? Math.sin(frame * 1.4) * squeeze * 22 : 0;
  const shakeY = squeeze > 0.2 ? Math.cos(frame * 1.8) * squeeze * 17 : 0;

  return (
    <AbsoluteFill style={{
      zIndex: Z.wallViz,
      transform: `translate(${shakeX}px, ${shakeY}px)`,
      opacity,
    }}>
      {/* AI Scenic Backdrop */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: Z.bg,
        transform: `scale(${scale}) translateX(${panX}px)`,
      }}>
        <img
          src={staticFile('shorts/broll/v25_scene4_squeeze.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          alt="Scene 4 AI visual"
        />
      </div>

      {/* Heavy red filter backdrop overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle, rgba(239,68,68,${interpolate(squeeze, [0, 1], [0.1, 0.42])}) 0%, transparent 75%)`,
        zIndex: Z.bg + 1, pointerEvents: 'none',
      }} />

      <AmbientCandlestickBg opacity={0.12} baseY={780} height={500} />

      {/* Intensifying Coral wall */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 16, background: BRAND.coral,
        boxShadow: `0 0 ${wallGlow}px ${BRAND.coral}, 0 0 ${wallGlow * 2.5}px ${BRAND.coralGlow}`,
        zIndex: Z.data,
      }} />

      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: 400,
        top: currentPrice, height: 8, background: BRAND.cyan,
        boxShadow: `0 0 40px ${BRAND.cyan}`, zIndex: Z.data,
      }} />

      <FlowParticles
        progress={Math.min(1, frame / S(4.8))}
        targetY={wallY + bracketH * 0.05}
        intensity={0.95} count={32} maxOpacity={0.7} spread={30} color={BRAND.coral}
      />

      <TerminalTelemetryPanel
        title="GRID COMPRESSION"
        metrics={[
          { label: 'TENSION COEFFICIENT', value: `${(squeeze * 10).toFixed(2)}x PRESSURE`, color: BRAND.amber },
          { label: 'GAMMA SQUEEZE TR.', value: '98.8% MAXIMUM THRESHOLD', color: BRAND.coral },
          { label: 'FLOW WEIGHT', value: 'INSTITUTIONAL CRITICAL', color: BRAND.purple },
        ]}
        top={1120}
        left={LAYOUT.safeL}
        width={420}
      />

      <div style={{ position: 'absolute', left: 740, top: wallY, height: bracketH, zIndex: Z.data }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 12, height: '100%',
          background: BRAND.amber, boxShadow: `0 0 30px ${BRAND.amberGlow}`,
        }} />
        <div style={{ position: 'absolute', left: -24, top: 0, width: 36, height: 12, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: -24, bottom: 0, width: 36, height: 12, background: BRAND.amber }} />
      </div>

      <div style={{
        position: 'absolute', bottom: LAYOUT.safeBot + 50, left: LAYOUT.safeL, right: LAYOUT.safeR,
        zIndex: Z.data, display: 'flex', justifyContent: 'center',
      }}>
        <GlassCard color={BRAND.coral} padding="14px 36px" bracket={true}>
          <span style={{
            color: BRAND.coral, fontSize: 32, fontWeight: 900, fontFamily: MONO_FAMILY,
            letterSpacing: '0.08em', textShadow: `0 0 15px ${BRAND.coral}`,
          }}>TENSION SPEED DENSITY: MAXIMUM ▲</span>
        </GlassCard>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 05: IMPLOSION - SHOCK VIOLET STROBE FLASH (17.0s–21.0s, 120f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene05_ScannerUnlock: React.FC = () => {
  const frame = useCurrentFrame();
  const scanStart = S(0.2);
  const scanEnd = S(1.2);
  const wallReveal = S(0.7);
  const dpReveal = S(1.2);
  const flipReveal = S(1.7);
  const floorReveal = S(2.1);

  const scanProg = interpolate(frame, [scanStart, scanEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = interpolate(frame, [S(3.7), S(4.0)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 3D Ken Burns scale & pan (imploding inwards)
  const scale = interpolate(frame, [0, S(4.0)], [1.25, 0.98], { easing: Easing.bezier(0.25, 0.1, 0.25, 1.0) });
  const panY = interpolate(frame, [0, S(4.0)], [-20, -10]);

  // Fast 0.08s Strobe flash period: alternates between pure dark, violet haze, and hot coral
  const strobe = Math.floor(frame / 2.5) % 3;
  const strobeColor = strobe === 0 ? 'rgba(139,92,246,0.38)' : strobe === 1 ? 'rgba(239,68,68,0.32)' : 'transparent';

  // Layer opacities
  const wallOp = interpolate(frame, [wallReveal, wallReveal + S(0.3)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dpOp = interpolate(frame, [dpReveal, dpReveal + S(0.3)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flipOp = interpolate(frame, [flipReveal, flipReveal + S(0.3)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const floorOp = interpolate(frame, [floorReveal, floorReveal + S(0.3)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Chart zone
  const chartTop = 400;
  const chartH = 900;
  const callWallY = chartTop + chartH * 0.15;
  const flipY = chartTop + chartH * 0.45;
  const priceY = chartTop + chartH * 0.55;
  const floorY = chartTop + chartH * 0.85;

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz, opacity }}>
      {/* AI Scenic Backdrop */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: Z.bg,
        transform: `scale(${scale}) translateY(${panY}px)`,
      }}>
        <img
          src={staticFile('shorts/broll/v25_scene5_implode.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          alt="Scene 5 AI visual"
        />
      </div>

      {/* High-intensity strobe flash overlay layer */}
      <div style={{
        position: 'absolute', inset: 0,
        background: strobeColor,
        zIndex: Z.bg + 4, pointerEvents: 'none',
      }} />

      <AmbientCandlestickBg opacity={0.22} baseY={chartTop + chartH / 2} height={chartH * 0.6} candleCount={32} />

      <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', top: 0, zIndex: Z.data }}>
        <path d={`M 0,${priceY + 40} C 200,${priceY + 15} 400,${priceY + 70} 600,${priceY + 35} C 800,${priceY + 5} 1000,${priceY + 55} 1080,${priceY + 25}`}
          stroke={BRAND.muted} strokeWidth={4} fill="none" opacity={0.5} />
        <circle cx="900" cy={priceY + 25} r="10" fill={BRAND.cyan} opacity={0.8} />
      </svg>

      {frame >= scanStart && frame <= scanEnd + S(0.2) && (
        <ScannerLine progress={scanProg} glow={150} color={BRAND.purple} />
      )}

      {/* CALL WALL */}
      <div style={{ opacity: wallOp, zIndex: Z.data }}>
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
      </div>

      {/* DARK POOL CLUSTER */}
      <div style={{ opacity: dpOp }}>
        <FlowParticles progress={dpOp} targetY={callWallY + 60} intensity={0.9} count={16} spread={50} color={BRAND.cyan} />
        <div style={{
          position: 'absolute', left: LAYOUT.safeL + 10, top: callWallY + 80,
          color: BRAND.cyan, fontSize: 24, fontWeight: 900, fontFamily: MONO_FAMILY,
          textShadow: SHADOW.cyan, zIndex: Z.data,
        }}>[DARK POOL INSIDER BIND]</div>
      </div>

      {/* GAMMA FLIP */}
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

      {/* PUT FLOOR */}
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

      {/* Dynamic Implosion Particles */}
      <ImplodeParticles progress={Math.min(1, frame / S(3.8))} />

      <TerminalTelemetryPanel
        title="IMPLOSION THREAT"
        metrics={[
          { label: 'THREAT REGIME', value: 'GAMMA CRASH THRESHOLD', color: BRAND.purple },
          { label: 'COEF INDEX', value: '98.8% DENSITY CONVERGE', color: BRAND.coral },
          { label: 'GRID BIAS', value: 'INSTITUTIONAL BOUND', color: BRAND.emerald },
        ]}
        bottom={LAYOUT.safeBot + 110}
        left={LAYOUT.safeL}
        width={420}
      />
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 06: SIGNUMHQ BRAND COMPLEX AUTHORITY (21.0s–25.0s, 120f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene06_StructureMap: React.FC = () => {
  const frame = useCurrentFrame();
  const mapTop = 520;
  const mapH = 750;
  const wallY = mapTop;
  const flipY = mapTop + mapH * 0.38;
  const floorY = mapTop + mapH;
  const opacity = interpolate(frame, [S(3.7), S(4.0)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 3D Ken Burns scale & pan (horizontal rotation sweep)
  const scale = interpolate(frame, [0, S(4.0)], [1.05, 1.16], { easing: Easing.bezier(0.25, 0.1, 0.25, 1.0) });
  const panX = interpolate(frame, [0, S(4.0)], [-40, 40]);

  return (
    <AbsoluteFill style={{ zIndex: Z.wallViz, opacity }}>
      {/* AI Scenic Backdrop */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: Z.bg,
        transform: `scale(${scale}) translateX(${panX}px)`,
      }}>
        <img
          src={staticFile('shorts/broll/v25_scene6_dashboard.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          alt="Scene 6 AI visual"
        />
      </div>

      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle, rgba(6,182,212,0.18) 0%, transparent 80%)`,
        zIndex: Z.bg + 1, pointerEvents: 'none',
      }} />

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

      <FlowParticles progress={1} targetY={wallY + 50} intensity={0.8} count={22} color={BRAND.coral} />

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
        title="INSTITUTIONAL FEED"
        metrics={[
          { label: 'FEED SPEED', value: 'SUB-MILLISECOND QUANT', color: BRAND.cyan },
          { label: 'INTELLIGENCE SCORE', value: '99.8% FIDELITY MATCH', color: BRAND.emerald },
          { label: 'OVERLAY DENSITY', value: 'ACTIVE LIQUIDITY BOUNDS', color: BRAND.purple },
        ]}
        bottom={LAYOUT.safeBot + 30}
        left={LAYOUT.safeL}
        width={420}
      />
    </AbsoluteFill>
  );
};

// ─── Outro Breathing Logo ───────────────────────────────────────────────────
const CTA_BreathingLogo: React.FC = () => {
  const frame = useCurrentFrame();
  const breathe = 0.88 + Math.sin(frame * 0.12) * 0.12;
  return (
    <div style={{
      position: 'absolute', top: 380, left: 0, right: 0,
      display: 'flex', justifyContent: 'center', zIndex: Z.brand,
    }}>
      <svg width="250" height="250" viewBox="246 247 530 530" fill="none" style={{ opacity: breathe }}>
        <path d={SG_LOGO.upper} fill={BRAND.text} />
        <path d={SG_LOGO.lower} fill={BRAND.cyan} />
      </svg>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 07: INFINITE LOOP DECISIVE CTA (25.0s–28.0s, 90f)
// ═════════════════════════════════════════════════════════════════════════════
const Scene07_CTA: React.FC = () => {
  const frame = useCurrentFrame();

  // 3D Ken Burns scale (accelerating forward into gold streaks)
  const scale = interpolate(frame, [0, S(3.0)], [1.02, 1.32], { easing: Easing.bezier(0.25, 0.1, 0.25, 1.0) });

  return (
    <AbsoluteFill style={{ zIndex: Z.hookText }}>
      {/* AI Scenic Backdrop */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: Z.bg,
        transform: `scale(${scale})`,
      }}>
        <img
          src={staticFile('shorts/broll/v25_scene7_outro.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          alt="Scene 7 AI visual"
        />
      </div>

      {/* Dynamic structural background lines */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: '35%', height: 3,
        background: `linear-gradient(90deg, transparent, ${BRAND.coral}, transparent)`,
        opacity: 0.22, zIndex: Z.grid,
      }} />
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: '65%', height: 3,
        background: `linear-gradient(90deg, transparent, ${BRAND.emerald}, transparent)`,
        opacity: 0.18, zIndex: Z.grid,
      }} />

      {/* Breathing Logo */}
      <CTA_BreathingLogo />

      <div style={{
        position: 'absolute', top: 680, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center', zIndex: Z.brand,
      }}>
        <span style={{
          color: BRAND.text, fontSize: 88, fontWeight: 900, fontFamily: TYPE.family,
          letterSpacing: '0.04em', textShadow: SHADOW.hero,
        }}>SIGNUMHQ</span>
        
        <div style={{ marginTop: 12 }}>
          <span style={{
            color: BRAND.cyan, fontSize: 38, fontWeight: 900, fontFamily: MONO_FAMILY,
            letterSpacing: '0.1em', textShadow: SHADOW.cyan,
          }}>[UNMASK THE STRUCTURE]</span>
        </div>
      </div>

      {/* Dynamic CTA Card */}
      <div style={{
        position: 'absolute', top: 930, left: LAYOUT.safeL + 20, right: LAYOUT.safeR + 20,
        zIndex: Z.brand, display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <GlassCard color="rgba(34,211,238,0.26)" padding="22px 26px" bracket={true}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{
              color: BRAND.text, fontSize: 36, fontWeight: 900, fontFamily: MONO_FAMILY,
              textShadow: '0 0 10px rgba(255,255,255,0.8)',
            }}>GO TO SIGNUMHQ.COM</span>
            <span style={{
              color: BRAND.mutedLight, fontSize: 26, fontWeight: 800, fontFamily: MONO_FAMILY,
            }}>SEE THE NEXT MOVE BEFORE THEY LOCK IT.</span>
          </div>
        </GlassCard>
      </div>

      <TerminalTelemetryPanel
        title="SECURED CREDENTIALS"
        metrics={[
          { label: 'PLATFORM ACCESS', value: 'SIGNUMHQ LIVE RADAR', color: BRAND.cyan },
          { label: 'FEED INTEGRITY', value: 'UNMASKED LIQUIDITY BOUND', color: BRAND.purple },
        ]}
        bottom={LAYOUT.safeBot + 90}
        left={LAYOUT.safeL + 20}
        width={400}
      />

      <ComplianceFooter text="Institutional flow analysis. Real-time updates at SignumHQ.com. Not financial advice." />
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN REFINED TEMPLATE ENTRYPOINT
// ═════════════════════════════════════════════════════════════════════════════
export const MarketPressureBriefV25: React.FC<MarketPressureBriefV25Props> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Replicate AI camera slow zoom over the entire 28 seconds (1.0x to 1.35x)
  const scale = interpolate(frame, [0, 840], [1.0, 1.35], {
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ background: '#040710', overflow: 'hidden' }}>
      {/* Dynamic 7-stage Scene sequences rendered beneath all overlays */}
      <Sequence from={S(0.0)} durationInFrames={S(3.0)}>
        <Scene01_MarketAlert />
      </Sequence>

      <Sequence from={S(3.0)} durationInFrames={S(5.0)}>
        <Scene02_HiddenLayer />
      </Sequence>

      <Sequence from={S(8.0)} durationInFrames={S(4.0)}>
        <Scene03_Distance />
      </Sequence>

      <Sequence from={S(12.0)} durationInFrames={S(5.0)}>
        <Scene04_Pressure />
      </Sequence>

      <Sequence from={S(17.0)} durationInFrames={S(4.0)}>
        <Scene05_ScannerUnlock />
      </Sequence>

      <Sequence from={S(21.0)} durationInFrames={S(4.0)}>
        <Scene06_StructureMap />
      </Sequence>

      <Sequence from={S(25.0)} durationInFrames={S(3.0)}>
        <Scene07_CTA />
      </Sequence>

      {/* 
        Kling v2.0 Terminal HUD Video Loop Overlay
        Layered above the AI scenes but under the captions and dashboards.
        Blended in color-dodge at 15% opacity to overlay technical scanlines, dynamic grid matrices
        and cyber digital texture over the colorful AI backdrops.
      */}
      <AbsoluteFill style={{
        zIndex: Z.grid + 2,
        opacity: 0.15,
        mixBlendMode: 'color-dodge',
        pointerEvents: 'none',
        transform: `scale(${scale})`,
      }}>
        <Video
          src={staticFile('shorts/broll/kling_terminal.mp4')}
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.9) contrast(1.3) saturate(1.1)' }}
          muted
          loop
        />
      </AbsoluteFill>

      {/* Global Word-Level Springs Highlighter Caption Layer */}
      <V25CaptionOverlay captions={captions} frame={frame} fps={fps} />

      {/* Refined Audio Engine */}
      <AudioEngine />
    </AbsoluteFill>
  );
};

export default MarketPressureBriefV25;
