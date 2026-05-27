// ============================================================================
// MarketPressureBrief V22 — Event-First Revenue Cut
// ============================================================================
// First frame = EVENT ($420M + 91st percentile + wall proximity).
// NOT "SPY looks normal" — the event IS the hook.
// 7 scenes, 17.5s, 525 frames @ 30fps.
// No collisions, no empty beats, every second earns retention.
// ============================================================================

import React from 'react';
import {
  AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig,
  interpolate, spring, staticFile, Audio, Easing, random,
} from 'remotion';
import type { ShortsVideoInput } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO, LAYOUT } from '../brand/signumBrand';
import { ComplianceFooter } from '../components/ComplianceFooter';

export type MarketPressureBriefV22Props = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

// ─── Utility: Institutional Grid Background ──────────────────────────────────
const InstitutionalGrid: React.FC<{ intensity?: number }> = ({ intensity = 0.04 }) => (
  <div style={{ position: 'absolute', inset: 0, zIndex: Z.grid, pointerEvents: 'none', opacity: intensity }}>
    <svg width="1080" height="1920" viewBox="0 0 1080 1920">
      {Array.from({ length: 18 }).map((_, i) => (
        <line key={`h${i}`} x1={0} y1={i * 120} x2={1080} y2={i * 120} stroke="#334155" strokeWidth={1} />
      ))}
      {Array.from({ length: 10 }).map((_, i) => (
        <line key={`v${i}`} x1={i * 120} y1={0} x2={i * 120} y2={1920} stroke="#334155" strokeWidth={1} />
      ))}
    </svg>
  </div>
);

// ─── Utility: Cinematic Noise Overlay ────────────────────────────────────────
const CinematicNoise: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{
      opacity: 0.035, pointerEvents: 'none', mixBlendMode: 'overlay',
      zIndex: Z.progress - 1, overflow: 'hidden',
    }}>
      <svg width="100%" height="100%" style={{
        transform: `translate(${random(frame) * 8 - 4}px, ${random(frame + 1) * 8 - 4}px)`,
      }}>
        <filter id="n22"><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
        <rect width="100%" height="100%" filter="url(#n22)" />
      </svg>
    </AbsoluteFill>
  );
};

// ─── Utility: Flow Particles ─────────────────────────────────────────────────
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
        const sz = 14 + random(i + 50) * 22;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y, width: sz, height: sz,
            borderRadius: '50%', background: BRAND.cyan, opacity: op,
            boxShadow: `0 0 ${sz * 2}px ${BRAND.cyanGlow}`,
            transform: `scale(${1 + Math.sin(frame * 0.12 + i) * 0.4})`,
          }} />
        );
      })}
    </div>
  );
};

// ─── Utility: Scanner Line ───────────────────────────────────────────────────
const ScannerLine: React.FC<{ progress: number }> = ({ progress }) => {
  const y = interpolate(progress, [0, 1], [-20, 1940]);
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: y, height: 4,
      background: `linear-gradient(90deg, transparent 0%, ${BRAND.cyan} 30%, ${BRAND.cyan} 70%, transparent 100%)`,
      boxShadow: `0 0 40px ${BRAND.cyanGlow}, 0 0 80px ${BRAND.cyanGlow}`,
      zIndex: Z.data + 5, pointerEvents: 'none', opacity: 0.9,
    }} />
  );
};

// ─── Audio Engine ────────────────────────────────────────────────────────────
const AudioEngine: React.FC = () => (
  <>
    <Audio src={staticFile('shorts/audio/v22_voice.mp3')} volume={0.88} />
    {/* Continuous bed: primary layer 0-14s */}
    <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.18} startFrom={0} endAt={S(14)} />
    {/* Overlap bed around 10-14s to bridge any natural pause */}
    <Sequence from={S(9.5)}>
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.22} startFrom={S(3)} endAt={S(8)} />
    </Sequence>
    {/* Tail bed 13-17.5s */}
    <Sequence from={S(13)}>
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.18} startFrom={S(1)} />
    </Sequence>
    {/* SFX triggers */}
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
// SCENE 01: EVENT SHOCK (0.0s–0.8s)
// Frame 0 must show: $420M + 91st Percentile + Near $600 Wall
// ═════════════════════════════════════════════════════════════════════════════
const Scene01_EventShock: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slam = spring({ frame, fps, config: { damping: 12, stiffness: 300 } });
  const wallY = 520;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, background: BRAND.bg }}>
      <InstitutionalGrid intensity={0.06} />

      {/* Red Call Wall — immediately visible */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 14, background: BRAND.coral,
        boxShadow: `0 0 60px ${BRAND.coralGlow}, 0 0 120px ${BRAND.coralGlow}`,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 40,
        color: BRAND.coral, fontSize: 32, fontWeight: 800, fontFamily: TYPE.family,
        textShadow: SHADOW.coral,
      }}>$600 CALL WALL</div>

      {/* Particles already moving at frame 0 */}
      <FlowParticles progress={Math.max(0.3, frame / S(1.5))} targetY={wallY + 30} intensity={0.8} count={16} />

      {/* Scanner flash across wall */}
      {frame < S(0.5) && <ScannerLine progress={interpolate(frame, [0, S(0.5)], [0.2, 0.4])} />}

      {/* EVENT BADGES — slam in, large, dominant */}
      <div style={{
        position: 'absolute', top: 180, left: LAYOUT.safeL, right: LAYOUT.safeR,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
        transform: `scale(${interpolate(slam, [0, 1], [1.15, 1])})`,
        opacity: interpolate(slam, [0, 0.3], [0.7, 1]),
      }}>
        {/* $420M OFF-EXCHANGE */}
        <div style={{
          color: BRAND.text, fontSize: 96, fontWeight: 900, fontFamily: TYPE.family,
          textShadow: SHADOW.hero, textAlign: 'center', lineHeight: 1.05,
        }}>$420M</div>
        <div style={{
          color: BRAND.cyan, fontSize: 60, fontWeight: 900, fontFamily: TYPE.family,
          textShadow: SHADOW.cyan, letterSpacing: '0.06em',
        }}>OFF-EXCHANGE</div>

        {/* 91st PERCENTILE badge */}
        <div style={{
          padding: '14px 44px', background: 'rgba(34,211,238,0.12)',
          border: `3px solid ${BRAND.cyan}`, borderRadius: 20,
          boxShadow: `0 0 30px ${BRAND.cyanGlow}`,
        }}>
          <span style={{
            color: BRAND.text, fontSize: 48, fontWeight: 900, fontFamily: TYPE.family,
          }}>91st PERCENTILE</span>
        </div>

        {/* NEAR $600 WALL */}
        <div style={{
          color: BRAND.coral, fontSize: 56, fontWeight: 900, fontFamily: TYPE.family,
          textShadow: SHADOW.coral, marginTop: 8,
        }}>NEAR $600 WALL</div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 02: HIDDEN LAYER / FOMO (0.8s–2.2s)
// ═════════════════════════════════════════════════════════════════════════════
const Scene02_HiddenLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const scanProg = interpolate(frame, [0, S(0.6)], [0, 1], { extrapolateRight: 'clamp' });
  const revealOp = interpolate(frame, [S(0.4), S(1.0)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const wallY = 600;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, background: BRAND.bg }}>
      <InstitutionalGrid />

      {/* Faint grey price line — looks incomplete */}
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', top: 0, zIndex: Z.wallViz }}>
        <path d="M 0,900 C 200,870 400,950 600,920 C 800,890 1000,940 1080,910"
          stroke="#3a3f4d" strokeWidth={6} fill="none" strokeDasharray="16 8" />
        <circle cx="900" cy="928" r="10" fill="#555" />
      </svg>

      {/* Scanner sweep */}
      <ScannerLine progress={scanProg} />

      {/* Hidden structure revealed after scanner */}
      <div style={{ opacity: revealOp }}>
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          top: wallY, height: 10, background: BRAND.coral,
          boxShadow: `0 0 50px ${BRAND.coralGlow}`,
        }} />
        <FlowParticles progress={revealOp} targetY={wallY + 30} intensity={0.7} count={12} />
      </div>

      {/* Hero text */}
      <div style={{
        position: 'absolute', top: 300, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center',
      }}>
        <div style={{
          color: BRAND.textSecondary, fontSize: 90, fontWeight: 900,
          fontFamily: TYPE.family, textShadow: SHADOW.hero, lineHeight: 1.1,
        }}>MOST CHARTS</div>
        <div style={{
          color: BRAND.text, fontSize: 90, fontWeight: 900,
          fontFamily: TYPE.family, textShadow: SHADOW.hero, lineHeight: 1.1,
        }}>DON'T SHOW THIS</div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 03: DISTANCE PAYOFF (2.2s–4.5s)
// ═════════════════════════════════════════════════════════════════════════════
const Scene03_Distance: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const wallY = 520;
  const priceY = 900;
  const bracketH = priceY - wallY;
  const dotPulse = 1 + Math.sin(frame * 0.15) * 0.3;
  const zoom = spring({ frame, fps, config: { damping: 20, stiffness: 120 } });

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: Z.wallViz, background: BRAND.bg,
      transform: `scale(${interpolate(zoom, [0, 1], [1, 1.03])})`,
      transformOrigin: '540px 700px',
    }}>
      <InstitutionalGrid />

      {/* Red wall */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 10, background: BRAND.coral,
        boxShadow: `0 0 40px ${BRAND.coralGlow}`,
      }} />

      {/* Cyan price/flow line */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: 400,
        top: priceY, height: 6, background: BRAND.cyan,
        boxShadow: `0 0 30px ${BRAND.cyanGlow}`,
      }} />

      {/* Price dot pulse */}
      <div style={{
        position: 'absolute', left: 680, top: priceY - 10, width: 20, height: 20,
        borderRadius: '50%', background: BRAND.cyan,
        boxShadow: `0 0 30px ${BRAND.cyanGlow}`,
        transform: `scale(${dotPulse})`,
      }} />

      {/* Yellow bracket — strict layout: left edge at 740, well within 1020 right boundary */}
      <div style={{ position: 'absolute', left: 740, top: wallY, height: bracketH }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 10, height: '100%',
          background: BRAND.amber, boxShadow: `0 0 25px ${BRAND.amberGlow}`,
        }} />
        <div style={{ position: 'absolute', left: -24, top: 0, width: 34, height: 10, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: -24, bottom: 0, width: 34, height: 10, background: BRAND.amber }} />
      </div>

      {/* 1.3% — positioned to the LEFT of the bracket, never overlapping */}
      <div style={{
        position: 'absolute', left: 140, top: wallY + bracketH / 2 - 60,
        textAlign: 'center',
      }}>
        <div style={{
          color: BRAND.amber, fontSize: 160, fontWeight: 900,
          fontFamily: TYPE.family, textShadow: SHADOW.amber, lineHeight: 1,
        }}>1.3%</div>
      </div>

      {/* Top and bottom scene labels */}
      <div style={{
        position: 'absolute', top: 260, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center',
      }}>
        <div style={{
          color: BRAND.textSecondary, fontSize: 64, fontWeight: 800,
          fontFamily: TYPE.family, textShadow: SHADOW.caption,
        }}>SPY IS</div>
      </div>
      <div style={{
        position: 'absolute', bottom: 500, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center',
      }}>
        <div style={{
          color: BRAND.textSecondary, fontSize: 48, fontWeight: 700,
          fontFamily: TYPE.family, textShadow: SHADOW.caption,
        }}>FROM A WALL YOU CAN'T SEE</div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 04: PRESSURE BUILD (4.5s–7.0s)
// ═════════════════════════════════════════════════════════════════════════════
const Scene04_Pressure: React.FC = () => {
  const frame = useCurrentFrame();
  const wallY = 520;
  const basePrice = 900;
  const squeeze = interpolate(frame, [0, S(2.0)], [0, 0.7], {
    easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp',
  });
  const currentPrice = basePrice - (basePrice - wallY) * squeeze;
  const bracketH = Math.max(30, currentPrice - wallY);
  const wallGlow = interpolate(squeeze, [0, 0.7], [40, 120]);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, background: BRAND.bg }}>
      <InstitutionalGrid />

      {/* Red wall with intensifying glow */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 12, background: BRAND.coral,
        boxShadow: `0 0 ${wallGlow}px ${BRAND.coral}`,
      }} />

      {/* Cyan price line moving up */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: 400,
        top: currentPrice, height: 6, background: BRAND.cyan,
        boxShadow: `0 0 30px ${BRAND.cyanGlow}`,
      }} />

      {/* Particles cluster into gap, max opacity 0.35 so they pass behind text */}
      <FlowParticles
        progress={Math.min(1, frame / S(1.8))}
        targetY={wallY + bracketH * 0.3}
        intensity={0.6} count={14} maxOpacity={0.35} spread={80}
      />

      {/* Yellow bracket — contracts as squeeze intensifies */}
      <div style={{ position: 'absolute', left: 740, top: wallY, height: bracketH }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 10, height: '100%',
          background: BRAND.amber, boxShadow: `0 0 25px ${BRAND.amberGlow}`,
        }} />
        <div style={{ position: 'absolute', left: -24, top: 0, width: 34, height: 10, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: -24, bottom: 0, width: 34, height: 10, background: BRAND.amber }} />
        {/* 1.3% inside bracket area but safe */}
        <div style={{
          position: 'absolute', left: 30, top: '50%', transform: 'translateY(-50%)',
          color: BRAND.amber, fontSize: 80, fontWeight: 900,
          fontFamily: TYPE.family, textShadow: SHADOW.amber, lineHeight: 1,
          whiteSpace: 'nowrap',
        }}>1.3%</div>
      </div>

      {/* Hero text */}
      <div style={{
        position: 'absolute', top: 280, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center',
      }}>
        <div style={{
          color: BRAND.text, fontSize: 80, fontWeight: 900,
          fontFamily: TYPE.family, textShadow: SHADOW.hero,
        }}>PRESSURE</div>
        <div style={{
          color: BRAND.textSecondary, fontSize: 64, fontWeight: 800,
          fontFamily: TYPE.family, textShadow: SHADOW.caption, marginTop: 8,
        }}>CAN BUILD HERE</div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 05: PRODUCT UNLOCK (7.0s–10.5s) — Split-screen
// ═════════════════════════════════════════════════════════════════════════════
const Scene05_Product: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame: frame - S(0.3), fps, config: { damping: 16, stiffness: 200 } });
  const scanProg = interpolate(frame, [0, S(0.5)], [0.45, 0.55], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz }}>
      {/* TOP HALF: Normal Chart */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
        background: '#0a0e18', overflow: 'hidden',
      }}>
        <InstitutionalGrid intensity={0.03} />
        <div style={{
          position: 'absolute', top: 100, left: LAYOUT.safeL,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <span style={{
            color: '#6b7280', fontSize: 56, fontWeight: 800, fontFamily: TYPE.family,
          }}>NORMAL CHART</span>
          <span style={{
            color: '#4b5563', fontSize: 36, fontWeight: 700, fontFamily: TYPE.family,
          }}>PRICE ONLY</span>
        </div>
        <svg width="1080" height="960" viewBox="0 0 1080 960" style={{ position: 'absolute', top: 0 }}>
          <path d="M 0,550 C 250,520 500,600 750,570 C 900,555 1000,580 1080,560"
            stroke="#374151" strokeWidth={6} fill="none" />
        </svg>
      </div>

      {/* Scanner Line at midpoint */}
      <ScannerLine progress={scanProg} />

      {/* Separator glow line */}
      <div style={{
        position: 'absolute', top: '50%', left: 0, right: 0, height: 6,
        background: BRAND.cyan, boxShadow: `0 0 30px ${BRAND.cyanGlow}, 0 0 60px ${BRAND.cyanGlow}`,
        zIndex: Z.data + 10,
      }} />

      {/* BOTTOM HALF: SignumHQ Layer */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
        background: BRAND.bg, overflow: 'hidden',
        opacity: interpolate(reveal, [0, 1], [0.3, 1]),
      }}>
        <InstitutionalGrid intensity={0.05} />

        {/* Layer label */}
        <div style={{
          position: 'absolute', top: 60, left: LAYOUT.safeL,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <span style={{
            color: BRAND.cyan, fontSize: 56, fontWeight: 900, fontFamily: TYPE.family,
            textShadow: SHADOW.cyan,
          }}>SIGNUMHQ LAYER</span>
        </div>

        {/* Call Wall */}
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          top: 200, height: 8, background: BRAND.coral,
          boxShadow: `0 0 30px ${BRAND.coralGlow}`,
        }} />
        <div style={{
          position: 'absolute', right: LAYOUT.safeR + 10, top: 165,
          color: BRAND.coral, fontSize: 30, fontWeight: 800, fontFamily: TYPE.family,
        }}>CALL WALL</div>

        {/* Dark Pool Cluster */}
        <FlowParticles progress={reveal} targetY={240} intensity={0.8} count={10} spread={60} />
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, top: 260,
          color: BRAND.cyan, fontSize: 30, fontWeight: 800, fontFamily: TYPE.family,
        }}>DARK POOL CLUSTER</div>

        {/* Gamma Flip */}
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          top: 440, height: 6,
          background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 18px, transparent 18px, transparent 36px)`,
        }} />
        <div style={{
          position: 'absolute', right: LAYOUT.safeR + 10, top: 405,
          color: BRAND.purple, fontSize: 30, fontWeight: 800, fontFamily: TYPE.family,
        }}>GAMMA FLIP</div>

        {/* Put Floor */}
        <div style={{
          position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
          top: 680, height: 8, background: BRAND.emerald,
          boxShadow: `0 0 30px ${BRAND.emerald}`,
        }} />
        <div style={{
          position: 'absolute', right: LAYOUT.safeR + 10, top: 645,
          color: BRAND.emerald, fontSize: 30, fontWeight: 800, fontFamily: TYPE.family,
        }}>PUT FLOOR</div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 06: MEANING / COMPLIANCE (10.5s–13.5s)
// ═════════════════════════════════════════════════════════════════════════════
const Scene06_Map: React.FC = () => {
  const mapTop = 550;
  const mapH = 700;
  const wallY = mapTop;
  const flipY = mapTop + mapH * 0.4;
  const floorY = mapTop + mapH;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, background: BRAND.bg }}>
      <InstitutionalGrid />

      {/* Full structure map */}
      {/* Call Wall */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: wallY, height: 8, background: BRAND.coral,
        boxShadow: `0 0 40px ${BRAND.coralGlow}`,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: wallY - 36,
        color: BRAND.coral, fontSize: 28, fontWeight: 800, fontFamily: TYPE.family,
      }}>CALL WALL $600</div>

      {/* Flow cluster */}
      <FlowParticles progress={1} targetY={wallY + 50} intensity={0.7} count={12} />

      {/* Gamma Flip */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: flipY, height: 6,
        background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 18px, transparent 18px, transparent 36px)`,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: flipY - 36,
        color: BRAND.purple, fontSize: 28, fontWeight: 800, fontFamily: TYPE.family,
      }}>GAMMA FLIP $588</div>

      {/* Put Floor */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: floorY, height: 8, background: BRAND.emerald,
        boxShadow: `0 0 40px ${BRAND.emerald}`,
      }} />
      <div style={{
        position: 'absolute', right: LAYOUT.safeR + 10, top: floorY - 36,
        color: BRAND.emerald, fontSize: 28, fontWeight: 800, fontFamily: TYPE.family,
      }}>PUT FLOOR $580</div>

      {/* Hero text — controlled, no awkward line breaks */}
      <div style={{
        position: 'absolute', top: 200, left: LAYOUT.safeL, right: LAYOUT.safeR,
        textAlign: 'center',
      }}>
        <div style={{
          color: BRAND.textSecondary, fontSize: 76, fontWeight: 900,
          fontFamily: TYPE.family, textShadow: SHADOW.caption,
        }}>NOT A PREDICTION.</div>
        <div style={{
          color: BRAND.text, fontSize: 96, fontWeight: 900,
          fontFamily: TYPE.family, textShadow: SHADOW.hero, marginTop: 12,
        }}>A PRESSURE MAP.</div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SCENE 07: CTA (13.5s–17.5s)
// ═════════════════════════════════════════════════════════════════════════════
const Scene07_CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spring({ frame, fps, config: { damping: 14, stiffness: 200 } });

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: Z.hookText,
      background: BRAND.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <InstitutionalGrid intensity={0.03} />

      {/* Subtle structure line passing behind */}
      <div style={{
        position: 'absolute', left: LAYOUT.safeL, right: LAYOUT.safeR,
        top: '50%', height: 3, background: `linear-gradient(90deg, transparent, ${BRAND.cyan}, transparent)`,
        opacity: 0.15, zIndex: Z.grid,
      }} />

      {/* Logo */}
      <div style={{
        marginBottom: 70, opacity: r,
        transform: `scale(${interpolate(r, [0, 1], [0.85, 1])})`,
      }}>
        <svg width="220" height="220" viewBox="246 247 530 530" fill="none">
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.cyan} />
        </svg>
      </div>

      {/* CTA text */}
      <div style={{
        textAlign: 'center', opacity: r,
        transform: `translateY(${(1 - r) * 30}px)`,
      }}>
        <div style={{
          color: BRAND.text, fontSize: 76, fontWeight: 900,
          fontFamily: TYPE.family, textShadow: SHADOW.hero, lineHeight: 1.15,
        }}>SEE THE STRUCTURE</div>
        <div style={{
          color: BRAND.cyan, fontSize: 76, fontWeight: 900,
          fontFamily: TYPE.family, textShadow: SHADOW.cyan, marginTop: 8,
        }}>BEHIND PRICE</div>
      </div>

      {/* URL */}
      <div style={{
        marginTop: 80, padding: '20px 70px', borderRadius: 36,
        border: `3px solid ${BRAND.cyan}`, background: 'rgba(34,211,238,0.08)',
        opacity: r, transform: `translateY(${(1 - r) * 40}px)`,
        boxShadow: `0 0 40px ${BRAND.cyanGlow}`,
      }}>
        <span style={{
          color: BRAND.text, fontSize: 52, fontWeight: 900,
          fontFamily: TYPE.family, letterSpacing: '0.1em',
        }}>SIGNUMHQ.COM</span>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPOSITION — 17.5s @ 30fps = 525 frames
// ═════════════════════════════════════════════════════════════════════════════
export const MarketPressureBriefV22: React.FC<MarketPressureBriefV22Props> = (props) => {
  const { disclaimer } = props;
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <CinematicNoise />
      <AudioEngine />

      {/* Scene 01: Event Shock — 0.0s to 0.8s */}
      <Sequence from={0} durationInFrames={S(0.8)}>
        <Scene01_EventShock />
      </Sequence>

      {/* Scene 02: Hidden Layer — 0.8s to 2.2s */}
      <Sequence from={S(0.8)} durationInFrames={S(1.4)}>
        <Scene02_HiddenLayer />
      </Sequence>

      {/* Scene 03: Distance Payoff — 2.2s to 4.5s */}
      <Sequence from={S(2.2)} durationInFrames={S(2.3)}>
        <Scene03_Distance />
      </Sequence>

      {/* Scene 04: Pressure Build — 4.5s to 7.0s */}
      <Sequence from={S(4.5)} durationInFrames={S(2.5)}>
        <Scene04_Pressure />
      </Sequence>

      {/* Scene 05: Product Unlock — 7.0s to 10.5s */}
      <Sequence from={S(7.0)} durationInFrames={S(3.5)}>
        <Scene05_Product />
      </Sequence>

      {/* Scene 06: Meaning / Compliance — 10.5s to 13.5s */}
      <Sequence from={S(10.5)} durationInFrames={S(3.0)}>
        <Scene06_Map />
      </Sequence>

      {/* Scene 07: CTA — 13.5s to 17.5s */}
      <Sequence from={S(13.5)} durationInFrames={S(4.0)}>
        <Scene07_CTA />
      </Sequence>

      {/* Compliance footer — visible from 2s onward */}
      <Sequence from={S(2)} durationInFrames={S(15.5)}>
        <ComplianceFooter text={disclaimer} />
      </Sequence>

      {/* Progress bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 8,
        background: 'rgba(255,255,255,0.04)', zIndex: Z.progress,
      }}>
        <div style={{
          height: '100%',
          width: `${(frame / durationInFrames) * 100}%`,
          background: BRAND.gradientCyanPurple,
        }} />
      </div>
    </AbsoluteFill>
  );
};
