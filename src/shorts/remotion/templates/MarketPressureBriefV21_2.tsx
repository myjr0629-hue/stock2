// ============================================================================
// MarketPressureBrief V21.2 — Collision-Free Upload Candidate
// Fixes: 0.0s full text, Compact proof stack, strict 1.3% x-bounds,
// Simplified pressure map, Split-screen redesign, <0.25s silence strict fix.
// ============================================================================

import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile, Audio, Easing, random } from 'remotion';
import type { ShortsVideoInput } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO } from '../brand/signumBrand';
import { ComplianceFooter } from '../components/ComplianceFooter';

export type MarketPressureBriefProps = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

// ─────────────────────────────────────────────────────────────────────────────
// Cinematic Noise
// ─────────────────────────────────────────────────────────────────────────────
const CinematicNoise: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = 0.04; 
  const transform = `translate(${random(frame) * 10 - 5}px, ${random(frame + 1) * 10 - 5}px) scale(1.1)`;

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: 'none', mixBlendMode: 'overlay', zIndex: Z.progress - 1, overflow: 'hidden' }}>
      <svg width="100%" height="100%" style={{ transform }}>
        <filter id="noiseFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noiseFilter)" />
      </svg>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Audio Engine: V21.2 Extra Strict Bed Overlay
// ─────────────────────────────────────────────────────────────────────────────
const AudioEngine: React.FC = () => {
  return (
    <>
      <Audio src={staticFile('shorts/audio/v21_2_voice.mp3')} volume={0.85} />
      
      {/* Continuous strong bed to bridge any natural script pauses under 0.25s */}
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.20} startFrom={0} endAt={S(14)} />
      
      {/* Overlapping bed around 10-13s to explicitly nuke the 11.35s silence gap */}
      <Sequence from={S(10)}>
        <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.25} startFrom={S(4)} endAt={S(8)} />
      </Sequence>

      <Sequence from={S(13)}>
        <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.20} startFrom={S(2)} />
      </Sequence>
      
      {/* SFX Triggers */}
      <Sequence from={S(0.0)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.4} /></Sequence>
      <Sequence from={S(0.7)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.5} /></Sequence>
      <Sequence from={S(2.2)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.4} /></Sequence>
      <Sequence from={S(4.5)}><Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.5} /></Sequence>
      <Sequence from={S(7.0)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.6} /></Sequence>
      <Sequence from={S(10.5)}><Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.4} /></Sequence>
      <Sequence from={S(11.5)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.3} /></Sequence>
      <Sequence from={S(16.5)}><Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.4} /></Sequence>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Large Flow Particles
// ─────────────────────────────────────────────────────────────────────────────
const LargeFlow: React.FC<{ progress: number, targetY: number, intensity: number, count?: number, maxOpacity?: number }> = ({ progress, targetY, intensity, count = 30, maxOpacity = 0.7 }) => {
  const frame = useCurrentFrame();
  const particles = Array.from({ length: count });

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: Z.wallViz - 1 }}>
      {particles.map((_, i) => {
        const startX = -100 + random(i) * 1080;
        const targetX = 100 + random(i + 50) * 880;
        
        const startY = 1920 + random(i + 100) * 600;
        
        const currentX = interpolate(progress, [0, 1], [startX, targetX]);
        const currentY = interpolate(progress, [0, 1], [startY, targetY + random(i + 200) * 120]);
        
        const op = interpolate(progress, [0, 0.8, 1], [0, intensity, intensity * maxOpacity]) * (0.6 + random(i) * 0.4);
        const size = 16 + random(i + 50) * 24;

        return (
          <div key={i} style={{
            position: 'absolute',
            left: currentX,
            top: currentY,
            width: size,
            height: size,
            borderRadius: '50%',
            background: BRAND.cyan,
            opacity: op,
            boxShadow: `0 0 ${size * 2}px ${BRAND.cyanGlow}`,
            transform: `scale(${1 + Math.sin(frame * 0.1 + i) * 0.5})`
          }} />
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 0.0s–0.7s: Hook Tension
// ─────────────────────────────────────────────────────────────────────────────
const HookTension: React.FC = () => {
  const frame = useCurrentFrame();
  
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, background: '#111' }}>
      {/* Boring grey line */}
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', top: 0 }}>
        <path d="M 0,1100 C 300,1050 600,1150 1080,1080" stroke="#444" strokeWidth={8} fill="none" />
        <circle cx="500" cy="1108" r="16" fill="#666" />
      </svg>
      
      {/* Hidden tension cue: Ghost wall (15% opacity) */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: 600, height: 6, background: BRAND.coral, opacity: 0.15 }} />
      
      {/* 3-5 barely visible cyan particles starting to move immediately */}
      <LargeFlow progress={Math.max(0.1, frame / S(2.0))} targetY={600} intensity={0.2} count={4} />

      {/* Full Hook Text Visible Immediately */}
      <div style={{ position: 'absolute', top: 300, left: 80, right: 80, textAlign: 'center' }}>
        <div style={{ color: '#ccc', fontSize: 100, fontWeight: 900, fontFamily: TYPE.family, textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>SPY LOOKS NORMAL.</div>
        <div style={{ color: BRAND.cyan, fontSize: 100, fontWeight: 900, fontFamily: TYPE.family, textShadow: '0 4px 20px rgba(0,0,0,0.5)', marginTop: 10 }}>THE FLOW DOESN'T.</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 0.7s–2.5s: Concrete Proof Stack Reveal
// ─────────────────────────────────────────────────────────────────────────────
const ProofStackReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, S(1.5)], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  
  const wallY = 600;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, background: BRAND.bg }}>
      <div style={{ position: 'absolute', left: 80, right: 80, top: wallY, height: 12, background: BRAND.coral, boxShadow: `0 0 60px ${BRAND.coral}` }} />
      <LargeFlow progress={progress} targetY={wallY + 40} intensity={0.9} />

      {/* Compact Vertical Evidence Stack - Upper Center Safe Zone */}
      <div style={{ position: 'absolute', top: 150, left: 80, right: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div style={{ color: BRAND.text, fontSize: 110, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero }}>$420M OFF-EXCHANGE</div>
        <div style={{ 
          padding: '16px 40px', background: `rgba(34,211,238,0.15)`, border: `4px solid ${BRAND.cyan}`, borderRadius: 24,
          boxShadow: `0 0 40px ${BRAND.cyanGlow}`
        }}>
          <span style={{ color: BRAND.text, fontSize: 50, fontWeight: 900, fontFamily: TYPE.family }}>91st PERCENTILE</span>
        </div>
        <div style={{ color: BRAND.coral, fontSize: 60, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.coral, marginTop: 10 }}>NEAR $600 WALL</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4.5s–7.0s: Pressure Build Simplification (Strict 1.3% Layout)
// ─────────────────────────────────────────────────────────────────────────────
const GapTensionSimplified: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  if (!data) return null;

  const squeeze = interpolate(frame, [0, S(2.0)], [0, 0.8], { easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp' });
  
  const wallY = 600;
  const basePriceY = 1100;
  const currentPriceY = basePriceY - (basePriceY - wallY) * squeeze;
  const bracketH = currentPriceY - wallY;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, background: BRAND.bg }}>
      {/* Red Wall Line */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: wallY, height: 12, background: BRAND.coral, boxShadow: `0 0 ${100 * squeeze}px ${BRAND.coral}` }} />
      
      {/* 6 to 12 particles max. Opacity <= 0.35 so they don't occlude text. */}
      <LargeFlow progress={1} targetY={wallY + bracketH * 0.1} intensity={0.5} count={8} maxOpacity={0.35} />

      {/* Hero 1.3% Bracket - Strict Layout 
          x <= 760px, width <= 260px, right edge <= 1020px
          We place bracket left line at x=760, text to the right. 
      */}
      <div style={{ position: 'absolute', left: 740, top: wallY, height: Math.max(10, bracketH) }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 12, height: '100%', background: BRAND.amber, boxShadow: `0 0 30px ${BRAND.amberGlow}` }} />
        <div style={{ position: 'absolute', left: -30, top: 0, width: 40, height: 12, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: -30, bottom: 0, width: 40, height: 12, background: BRAND.amber }} />
        
        {/* Dynamic Number - width constrained */}
        <div style={{ position: 'absolute', left: 40, top: '50%', transform: `translateY(-50%)` }}>
          <div style={{ color: BRAND.amber, fontSize: 120, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber, lineHeight: 1 }}>1.3%</div>
        </div>
      </div>

      {/* Cyan Price/Flow line */}
      <div style={{ position: 'absolute', left: 80, right: 380, top: currentPriceY, height: 8, background: BRAND.cyan, boxShadow: `0 0 40px ${BRAND.cyanGlow}` }} />

      {/* One short text line: PRESSURE CAN BUILD HERE */}
      <div style={{ position: 'absolute', top: 300, left: 80, right: 80, textAlign: 'center' }}>
        <div style={{ color: BRAND.text, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero }}>PRESSURE CAN BUILD HERE</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 7.0s–10.5s: Product Reveal Redesign
// ─────────────────────────────────────────────────────────────────────────────
const SplitScreenRedesign: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  if (!data) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz }}>
      {/* TOP: NORMAL CHART - PRICE ONLY */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: '#111', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 60, left: 80, display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#ccc', fontSize: 60, fontWeight: 800, fontFamily: TYPE.family }}>NORMAL CHART</span>
          <span style={{ color: '#888', fontSize: 40, fontWeight: 700, fontFamily: TYPE.family }}>PRICE ONLY</span>
        </div>
        <svg width="1080" height="960" viewBox="0 0 1080 960" style={{ position: 'absolute', top: 0 }}>
          <path d="M 0,600 C 300,550 600,650 1080,580" stroke="#555" strokeWidth={8} fill="none" />
        </svg>
      </div>

      {/* BOTTOM: SIGNUMHQ LAYER (Scanner line separates them) */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: BRAND.bg, overflow: 'hidden', borderTop: `10px solid ${BRAND.cyan}`, boxShadow: `0 -20px 60px ${BRAND.cyanGlow}` }}>
        <div style={{ position: 'absolute', top: 40, left: 80, display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: BRAND.cyan, fontSize: 60, fontWeight: 900, fontFamily: TYPE.family }}>SIGNUMHQ LAYER</span>
        </div>
        
        {/* Structure mapped inside bottom half */}
        <div style={{ position: 'absolute', left: 80, right: 80, top: 200, height: 12, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
        <div style={{ position: 'absolute', right: 80, top: 150, color: BRAND.coral, fontSize: 40, fontWeight: 900, fontFamily: TYPE.family }}>CALL WALL</div>
        
        <LargeFlow progress={1} targetY={240} intensity={0.9} />
        <div style={{ position: 'absolute', left: 80, top: 240, color: BRAND.cyan, fontSize: 40, fontWeight: 900, fontFamily: TYPE.family }}>DARK POOL CLUSTER</div>
        
        <div style={{ position: 'absolute', left: 80, right: 80, top: 450, height: 8, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
        <div style={{ position: 'absolute', right: 80, top: 400, color: BRAND.purple, fontSize: 40, fontWeight: 900, fontFamily: TYPE.family }}>GAMMA FLIP</div>
        
        <div style={{ position: 'absolute', left: 80, right: 80, top: 700, height: 12, background: BRAND.emerald, boxShadow: `0 0 40px ${BRAND.emerald}` }} />
        <div style={{ position: 'absolute', right: 80, top: 650, color: BRAND.emerald, fontSize: 40, fontWeight: 900, fontFamily: TYPE.family }}>PUT FLOOR</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 10.5s–13.5s: Controlled Pressure Map 
// ─────────────────────────────────────────────────────────────────────────────
const PressureMapClean: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  if (!data) return null;
  const cWall = data.callWall ?? 600;
  const pFloor = data.putFloor ?? 580;
  const gFlip = data.gammaFlipLevel;
  const mapTop = 600;
  const mapH = 600;
  const toY = (level: number) => mapTop + ((cWall - level) / (cWall - pFloor)) * mapH;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, background: BRAND.bg }}>
      <div style={{ position: 'absolute', left: 80, right: 80, top: toY(cWall), height: 10, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
      <LargeFlow progress={1} targetY={toY(cWall) + 40} intensity={0.9} />
      
      {gFlip && (
        <div style={{ position: 'absolute', left: 80, right: 80, top: toY(gFlip), height: 8, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
      )}

      <div style={{ position: 'absolute', left: 80, right: 80, top: toY(pFloor), height: 10, background: BRAND.emerald, boxShadow: `0 0 40px ${BRAND.emerald}` }} />

      <div style={{ position: 'absolute', top: 250, left: 80, right: 80, textAlign: 'center' }}>
        <div style={{ color: BRAND.textSecondary, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.caption }}>NOT A PREDICTION.</div>
        <div style={{ color: BRAND.text, fontSize: 100, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero, marginTop: 10 }}>A PRESSURE MAP.</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 13.5s–17.5s: CTA
// ─────────────────────────────────────────────────────────────────────────────
const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spring({ frame, fps, config: { damping: 14, stiffness: 220 } });
  
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText, background: BRAND.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ marginBottom: 80, opacity: r, transform: `scale(${interpolate(r, [0, 1], [0.8, 1])})` }}>
        <svg width="250" height="250" viewBox="246 247 530 530" fill="none">
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.cyan} />
        </svg>
      </div>

      <div style={{ textAlign: 'center', opacity: r, transform: `translateY(${(1 - r) * 40}px)` }}>
        <div style={{ color: BRAND.text, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero, lineHeight: 1.15 }}>SEE THE STRUCTURE</div>
        <div style={{ color: BRAND.cyan, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.cyan, marginTop: 10 }}>BEHIND PRICE</div>
      </div>

      <div style={{ marginTop: 100, padding: '24px 80px', borderRadius: 40, border: `4px solid ${BRAND.cyan}`, background: `rgba(34,211,238,0.1)`, opacity: r, transform: `translateY(${(1 - r) * 50}px)`, boxShadow: `0 0 50px ${BRAND.cyanGlow}` }}>
        <span style={{ color: BRAND.text, fontSize: 60, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>SIGNUMHQ.COM</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Composition — 17.5s @ 30fps = 525 frames
// ─────────────────────────────────────────────────────────────────────────────
export const MarketPressureBriefV21_2: React.FC<MarketPressureBriefProps> = (props) => {
  const { structureVisual, disclaimer } = props;

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <CinematicNoise />
      <AudioEngine />

      <Sequence from={0} durationInFrames={S(0.7)}><HookTension /></Sequence>
      <Sequence from={S(0.7)} durationInFrames={S(3.8)}><ProofStackReveal /></Sequence>
      <Sequence from={S(4.5)} durationInFrames={S(2.5)}><GapTensionSimplified data={structureVisual} /></Sequence>
      <Sequence from={S(7.0)} durationInFrames={S(3.5)}><SplitScreenRedesign data={structureVisual} /></Sequence>
      <Sequence from={S(10.5)} durationInFrames={S(3.0)}><PressureMapClean data={structureVisual} /></Sequence>
      <Sequence from={S(13.5)} durationInFrames={S(4.0)}><CTA /></Sequence>

      <Sequence from={S(13.5)} durationInFrames={S(4.0)}>
        <ComplianceFooter text={disclaimer} />
      </Sequence>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 10, background: 'rgba(255,255,255,0.05)', zIndex: Z.progress }}>
        <div style={{ height: '100%', width: `${(useCurrentFrame() / useVideoConfig().durationInFrames) * 100}%`, background: BRAND.gradientCyanPurple }} />
      </div>
    </AbsoluteFill>
  );
};
