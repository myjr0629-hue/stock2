// ============================================================================
// MarketPressureBrief V21 — Event-Driven Institutional Footprint Rebuild
// Strict <0.25s silence rule. Split screen layout. Brutal contrast.
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
// Audio Engine: Strict overlap to prevent silence >0.25s
// ─────────────────────────────────────────────────────────────────────────────
const AudioEngine: React.FC = () => {
  return (
    <>
      <Audio src={staticFile('shorts/audio/v21_voice.mp3')} volume={0.85} />
      {/* Primary Bed 0-14s. Increased volume slightly to bridge tight gaps */}
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.15} startFrom={0} endAt={S(14)} />
      {/* Secondary Bed overlap */}
      <Sequence from={S(13)}>
        <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.18} startFrom={S(2)} />
      </Sequence>
      {/* Event SFX explicitly timed to hit the script pauses */}
      <Sequence from={S(0.0)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.4} /></Sequence>
      <Sequence from={S(0.7)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.5} /></Sequence>
      <Sequence from={S(2.2)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.4} /></Sequence>
      <Sequence from={S(4.5)}><Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.5} /></Sequence>
      <Sequence from={S(7.0)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.6} /></Sequence>
      <Sequence from={S(10.5)}><Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.4} /></Sequence>
      {/* Final pulse to cover the trailing 16-17.5s gap */}
      <Sequence from={S(16.5)}><Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.4} /></Sequence>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared Large Flow Particles
// ─────────────────────────────────────────────────────────────────────────────
const LargeFlow: React.FC<{ progress: number, targetY: number, intensity: number }> = ({ progress, targetY, intensity }) => {
  const frame = useCurrentFrame();
  const particles = Array.from({ length: 30 }); // Fewer but larger particles

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: Z.wallViz - 1 }}>
      {particles.map((_, i) => {
        const startX = -100 + random(i) * 1080;
        const targetX = 100 + random(i + 50) * 880;
        
        const startY = 1920 + random(i + 100) * 600;
        
        const currentX = interpolate(progress, [0, 1], [startX, targetX]);
        const currentY = interpolate(progress, [0, 1], [startY, targetY + random(i + 200) * 120]);
        
        const op = interpolate(progress, [0, 0.8, 1], [0, intensity, intensity * 0.7]) * (0.6 + random(i) * 0.4);
        const size = 16 + random(i + 50) * 24; // Large, mobile-visible particles

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
// 0.0s–0.7s: Pattern Interrupt (Boring Chart)
// ─────────────────────────────────────────────────────────────────────────────
const PatternInterrupt: React.FC = () => {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, background: '#111' }}>
      {/* Boring grey line */}
      <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{ position: 'absolute', top: 0 }}>
        <path d="M 0,1100 C 300,1050 600,1150 1080,1080" stroke="#444" strokeWidth={8} fill="none" />
        <circle cx="500" cy="1108" r="16" fill="#666" />
      </svg>
      <div style={{ position: 'absolute', top: 300, left: 80, right: 80, textAlign: 'center' }}>
        <div style={{ color: '#ccc', fontSize: 100, fontWeight: 900, fontFamily: TYPE.family, textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>SPY LOOKS</div>
        <div style={{ color: '#888', fontSize: 120, fontWeight: 900, fontFamily: TYPE.family, textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>NORMAL.</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 0.7s–2.2s: Hidden Footprint Reveal
// ─────────────────────────────────────────────────────────────────────────────
const HiddenFootprintReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, S(1.5)], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, background: BRAND.bg }}>
      <LargeFlow progress={progress} targetY={500} intensity={1.0} />
      <div style={{ position: 'absolute', top: 300, left: 80, right: 80, textAlign: 'center' }}>
        <div style={{ color: BRAND.textSecondary, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.caption }}>BUT FLOW IS</div>
        <div style={{ color: BRAND.cyan, fontSize: 110, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.cyan, marginTop: 10 }}>CLUSTERING.</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2.2s–4.5s: Concrete Data Shock
// ─────────────────────────────────────────────────────────────────────────────
const ConcreteDataShock: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;

  const wallPop = spring({ frame: Math.max(0, frame), fps, config: { damping: 12, stiffness: 200 } });
  const badgePop = spring({ frame: Math.max(0, frame - S(0.3)), fps, config: { damping: 10, stiffness: 150 } });

  const wallY = 600;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, background: BRAND.bg }}>
      {/* Call Wall snapping in */}
      <div style={{ opacity: wallPop, transform: `scaleX(${wallPop})` }}>
        <div style={{ position: 'absolute', left: 80, right: 80, top: wallY, height: 12, background: BRAND.coral, boxShadow: `0 0 60px ${BRAND.coral}` }} />
        <div style={{ position: 'absolute', right: 80, top: wallY - 70, color: BRAND.coral, fontSize: 50, fontWeight: 900, fontFamily: TYPE.family }}>$600 WALL</div>
      </div>

      <LargeFlow progress={1} targetY={wallY + 40} intensity={0.9} />

      {/* 91st Percentile Badge */}
      <div style={{ 
        position: 'absolute', left: 80, top: wallY + 60, 
        padding: '16px 32px', background: `rgba(34,211,238,0.15)`, border: `3px solid ${BRAND.cyan}`, borderRadius: 20,
        opacity: badgePop, transform: `scale(${interpolate(badgePop, [0, 1], [0.8, 1])})`,
        boxShadow: `0 0 30px ${BRAND.cyanGlow}`
      }}>
        <span style={{ color: BRAND.text, fontSize: 40, fontWeight: 900, fontFamily: TYPE.family }}>91st PERCENTILE</span>
      </div>

      <div style={{ position: 'absolute', top: 250, left: 80, right: 80, textAlign: 'center' }}>
        <div style={{ color: BRAND.text, fontSize: 100, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero }}>$420M</div>
        <div style={{ color: BRAND.cyan, fontSize: 70, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.cyan, marginTop: 10 }}>OFF-EXCHANGE</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4.5s–7.0s: Gap Tension
// ─────────────────────────────────────────────────────────────────────────────
const GapTension: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  if (!data) return null;

  const squeeze = interpolate(frame, [0, S(2.0)], [0, 0.8], { easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp' });
  const pulse = interpolate(Math.sin(frame * 0.5), [-1, 1], [1, 1.2]);
  
  const wallY = 600;
  const basePriceY = 1100;
  const currentPriceY = basePriceY - (basePriceY - wallY) * squeeze;
  const bracketH = currentPriceY - wallY;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, background: BRAND.bg }}>
      <div style={{ position: 'absolute', left: 80, right: 80, top: wallY, height: 12, background: BRAND.coral, boxShadow: `0 0 ${100 * squeeze}px ${BRAND.coral}` }} />
      <div style={{ position: 'absolute', right: 80, top: wallY - 70, color: BRAND.coral, fontSize: 50, fontWeight: 900, fontFamily: TYPE.family }}>$600 WALL</div>
      
      {/* Particles compressing */}
      <LargeFlow progress={1} targetY={wallY + bracketH * 0.1} intensity={0.7 + squeeze * 0.5} />

      {/* Hero 1.3% Bracket */}
      <div style={{ position: 'absolute', left: 600, top: wallY, height: Math.max(10, bracketH) }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 12, height: '100%', background: BRAND.amber, boxShadow: `0 0 30px ${BRAND.amberGlow}` }} />
        <div style={{ position: 'absolute', left: -30, top: 0, width: 40, height: 12, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: -30, bottom: 0, width: 40, height: 12, background: BRAND.amber }} />
        
        {/* Dynamic Number */}
        <div style={{ position: 'absolute', left: 60, top: '50%', transform: `translateY(-50%) scale(${1 + squeeze * 0.5})`, transformOrigin: 'left center' }}>
          <div style={{ color: BRAND.amber, fontSize: 180, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber, lineHeight: 1 }}>1.3%</div>
        </div>
      </div>

      {/* Price line pushing */}
      <div style={{ position: 'absolute', left: 80, right: 400, top: currentPriceY, height: 6, background: BRAND.text, opacity: 0.8 }} />
      <div style={{ position: 'absolute', left: 450, top: currentPriceY - 20, width: 40, height: 40, borderRadius: '50%', background: BRAND.text, border: `8px solid ${BRAND.cyan}`, boxShadow: `0 0 40px ${BRAND.cyanGlow}`, transform: `scale(${pulse})` }} />

      <div style={{ position: 'absolute', top: 250, left: 80, right: 80 }}>
        <div style={{ color: BRAND.textSecondary, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.caption }}>THE GAP IS</div>
        <div style={{ color: BRAND.text, fontSize: 100, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero }}>ONLY 1.3%</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 7.0s–10.5s: Split Screen Contrast
// ─────────────────────────────────────────────────────────────────────────────
const SplitScreenContrast: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  if (!data) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz }}>
      
      {/* TOP: NORMAL CHART (Boring) */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: '#111', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 200, left: 80, color: '#ccc', fontSize: 60, fontWeight: 800, fontFamily: TYPE.family, background: '#333', padding: '10px 24px', borderRadius: 16 }}>NORMAL CHART</div>
        <svg width="1080" height="960" viewBox="0 0 1080 960" style={{ position: 'absolute', top: 0 }}>
          <path d="M 0,600 C 300,550 600,650 1080,580" stroke="#555" strokeWidth={8} fill="none" />
          <circle cx="500" cy="608" r="16" fill="#888" />
        </svg>
      </div>

      {/* BOTTOM: SIGNUMHQ LAYER (Rich) */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: BRAND.bg, overflow: 'hidden', borderTop: `10px solid ${BRAND.cyan}`, boxShadow: `0 -20px 60px ${BRAND.cyanGlow}` }}>
        <div style={{ position: 'absolute', top: 40, left: 80, color: BRAND.bg, fontSize: 60, fontWeight: 900, fontFamily: TYPE.family, background: BRAND.cyan, padding: '10px 24px', borderRadius: 16, zIndex: 10 }}>SIGNUMHQ LAYER</div>
        
        {/* Structure mapped inside bottom half */}
        <div style={{ position: 'absolute', left: 80, right: 80, top: 200, height: 12, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
        <LargeFlow progress={1} targetY={240} intensity={0.9} />
        <div style={{ position: 'absolute', left: 80, right: 80, top: 450, height: 8, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
        <div style={{ position: 'absolute', left: 80, right: 80, top: 700, height: 12, background: BRAND.emerald, boxShadow: `0 0 40px ${BRAND.emerald}` }} />
      </div>

      {/* Overlay Text */}
      <div style={{ position: 'absolute', top: 780, left: 0, right: 0, textAlign: 'center', zIndex: 100 }}>
        <div style={{ display: 'inline-block', background: 'rgba(0,0,0,0.85)', padding: '24px 60px', borderRadius: 40, border: `4px solid ${BRAND.text}`, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
          <div style={{ color: BRAND.text, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero }}>MOST CHARTS</div>
          <div style={{ color: BRAND.coral, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.coral, marginTop: 10 }}>DON'T SHOW THIS</div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 10.5s–13.5s: Pressure Map
// ─────────────────────────────────────────────────────────────────────────────
const PressureMap: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  if (!data) return null;
  const { callWall, putFloor, gammaFlipLevel } = data;
  const cWall = callWall ?? 600;
  const pFloor = putFloor ?? 500;
  const gFlip = gammaFlipLevel ?? 550;
  const mapTop = 600;
  const mapH = 600;
  const toY = (level: number) => mapTop + ((cWall - level) / (cWall - pFloor)) * mapH;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, background: BRAND.bg }}>
      <div style={{ position: 'absolute', left: 80, right: 80, top: toY(cWall), height: 10, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
      <div style={{ position: 'absolute', right: 80, top: toY(cWall) - 60, color: BRAND.coral, fontSize: 48, fontWeight: 900, fontFamily: TYPE.family }}>CALL WALL</div>
      
      <LargeFlow progress={1} targetY={toY(cWall) + 40} intensity={0.9} />
      <div style={{ position: 'absolute', left: 80, top: toY(cWall) + 40, color: BRAND.cyan, fontSize: 40, fontWeight: 900, fontFamily: TYPE.family }}>DARK POOL CLUSTER</div>
      
      {gammaFlipLevel && (
        <>
          <div style={{ position: 'absolute', left: 80, right: 80, top: toY(gFlip), height: 8, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
          <div style={{ position: 'absolute', right: 80, top: toY(gFlip) - 60, color: BRAND.purple, fontSize: 40, fontWeight: 900, fontFamily: TYPE.family }}>GAMMA FLIP</div>
        </>
      )}

      <div style={{ position: 'absolute', left: 80, right: 80, top: toY(pFloor), height: 10, background: BRAND.emerald, boxShadow: `0 0 40px ${BRAND.emerald}` }} />
      <div style={{ position: 'absolute', right: 80, top: toY(pFloor) + 20, color: BRAND.emerald, fontSize: 48, fontWeight: 900, fontFamily: TYPE.family }}>PUT FLOOR</div>

      <div style={{ position: 'absolute', top: 250, left: 80, right: 80 }}>
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
export const MarketPressureBriefV21: React.FC<MarketPressureBriefProps> = (props) => {
  const { structureVisual, disclaimer } = props;

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <CinematicNoise />
      <AudioEngine />

      <Sequence from={0} durationInFrames={S(0.7)}><PatternInterrupt /></Sequence>
      <Sequence from={S(0.7)} durationInFrames={S(1.5)}><HiddenFootprintReveal /></Sequence>
      <Sequence from={S(2.2)} durationInFrames={S(2.3)}><ConcreteDataShock data={structureVisual} /></Sequence>
      <Sequence from={S(4.5)} durationInFrames={S(2.5)}><GapTension data={structureVisual} /></Sequence>
      <Sequence from={S(7.0)} durationInFrames={S(3.5)}><SplitScreenContrast data={structureVisual} /></Sequence>
      <Sequence from={S(10.5)} durationInFrames={S(3.0)}><PressureMap data={structureVisual} /></Sequence>
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
