// ============================================================================
// MarketPressureBrief V20 — Institutional Footprint Cut
// Mission 26: Dark Pool + Options Wall visualization.
// Strict <0.35s silence rule. 15Mbps bitrate forced.
// ============================================================================

import React, { useMemo } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile, Audio, Easing, random } from 'remotion';
import type { ShortsVideoInput } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO } from '../brand/signumBrand';
import { ComplianceFooter } from '../components/ComplianceFooter';

export type MarketPressureBriefProps = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

// ─────────────────────────────────────────────────────────────────────────────
// Cinematic Noise — Forces H.264 bitrate
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
// Audio Engine: Strict overlap to prevent silence >0.35s
// ─────────────────────────────────────────────────────────────────────────────
const AudioEngine: React.FC = () => {
  return (
    <>
      <Audio src={staticFile('shorts/audio/v20_voice.mp3')} volume={0.85} />
      {/* Primary Bed 0-14s */}
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.12} startFrom={0} endAt={S(14)} />
      {/* Secondary Bed overlap to carry through end */}
      <Sequence from={S(13)}>
        <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.15} startFrom={S(2)} />
      </Sequence>
      {/* Final pulse explicitly at 17.8 to cover the end */}
      <Sequence from={S(17.8)}>
        <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.4} />
      </Sequence>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 0.0s–0.5s: Immediate Data Shock
// ─────────────────────────────────────────────────────────────────────────────
const DataShock: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  if (!data) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {frame === 0 && <Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.5} />}

      {/* Dimmed background structure lines for context */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: 700, height: 6, background: BRAND.coral, opacity: 0.3 }} />
      <div style={{ position: 'absolute', left: 80, right: 80, top: 1200, height: 4, background: BRAND.cyan, opacity: 0.3 }} />
      <div style={{ position: 'absolute', left: 800, top: 700, width: 6, height: 500, background: BRAND.amber, opacity: 0.3 }} />

      <div style={{ zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ color: BRAND.textSecondary, fontSize: 100, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero, marginBottom: -20 }}>SPY IS</div>
        {/* Massive 1.3% without clipping */}
        <div style={{ color: BRAND.amber, fontSize: 380, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber, lineHeight: 1 }}>1.3%</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 10 }}>
          <div style={{ padding: '12px 32px', background: BRAND.coral, borderRadius: 24 }}>
            <span style={{ color: BRAND.bg, fontSize: 60, fontWeight: 900, fontFamily: TYPE.family }}>FROM A HIDDEN WALL</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Dark Pool Particles Component
// ─────────────────────────────────────────────────────────────────────────────
const DarkPoolFlow: React.FC<{ progress: number, targetY: number, intensity: number }> = ({ progress, targetY, intensity }) => {
  const frame = useCurrentFrame();
  const particles = Array.from({ length: 40 });

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: Z.wallViz - 1 }}>
      {particles.map((_, i) => {
        const x = 100 + random(i) * 880;
        const startY = 1920 + random(i + 100) * 800;
        // Particles move up towards targetY based on progress
        const currentY = interpolate(progress, [0, 1], [startY, targetY + random(i + 200) * 100]);
        const op = interpolate(progress, [0, 0.8, 1], [0, intensity, intensity * 0.5]) * (0.5 + random(i) * 0.5);
        const size = 4 + random(i + 50) * 12;

        return (
          <div key={i} style={{
            position: 'absolute',
            left: x,
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
// 0.5s–2.5s: Dark Pool Footprint Reveal
// ─────────────────────────────────────────────────────────────────────────────
const DarkPoolReveal: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;

  const progress = interpolate(frame, [0, S(1.5)], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const wallY = 600;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz }}>
      {frame === S(0.2) && <Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.4} />}
      
      {/* Wall Line */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: wallY, height: 8, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
      <div style={{ position: 'absolute', left: 80, top: wallY - 60, color: BRAND.coral, fontSize: 48, fontWeight: 900, fontFamily: TYPE.family }}>CALL WALL</div>

      {/* Dark Pool Particles clustering to the wall */}
      <DarkPoolFlow progress={progress} targetY={wallY + 20} intensity={0.8} />

      <div style={{ position: 'absolute', top: 300, left: 80, right: 80 }}>
        <div style={{ color: BRAND.text, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero }}>
          DARK POOL FLOW<br/>
          <span style={{ color: BRAND.cyan, textShadow: SHADOW.cyan }}>CLUSTERING NEARBY</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2.5s–5.2s: Why This Matters
// ─────────────────────────────────────────────────────────────────────────────
const WhyItMatters: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  if (!data) return null;

  // Normal chart for 1s, then scanner
  const scanStart = S(1.0);
  const scanX = interpolate(frame, [scanStart, scanStart + S(0.8)], [-100, 1200], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  const reveal = interpolate(frame, [scanStart + S(0.2), scanStart + S(0.6)], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });

  const wallY = 600;
  const priceY = 1100;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz }}>
      {frame === scanStart && <Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.4} />}

      {/* Normal Chart Line */}
      <svg width="1080" height="400" viewBox="0 0 1080 400" style={{ position: 'absolute', top: 900, opacity: 1 - reveal * 0.5 }}>
        <path d="M 0,200 C 200,100 400,300 600,150 C 800,0 900,200 1080,200" stroke={BRAND.muted} strokeWidth={6} fill="none" strokeLinecap="round" />
      </svg>

      {/* Scanner Wipe */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: scanX, width: 6, background: BRAND.cyan, boxShadow: `0 0 60px ${BRAND.cyanGlow}, 0 0 100px ${BRAND.cyan}`, opacity: frame > scanStart && frame < scanStart + S(1) ? 1 : 0, zIndex: 100 }} />

      {/* Revealed Structure */}
      <div style={{ opacity: reveal }}>
        <div style={{ position: 'absolute', left: 80, right: 80, top: wallY, height: 8, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
        <DarkPoolFlow progress={1} targetY={wallY + 20} intensity={0.4} />
      </div>

      <div style={{ position: 'absolute', top: 300, left: 80, right: 80 }}>
        <div style={{ color: BRAND.textSecondary, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.caption }}>
          MOST CHARTS<br/>
          <span style={{ color: BRAND.text, textShadow: SHADOW.hero }}>DON'T SHOW THIS</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5.2s–8.5s: Pressure Zone
// ─────────────────────────────────────────────────────────────────────────────
const PressureZone: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  if (!data) return null;

  const squeeze = interpolate(frame, [0, S(2.0)], [0, 0.7], { easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp' });
  const pulse = interpolate(Math.sin(frame * 0.5), [-1, 1], [1, 1.2]);
  
  const wallY = 600;
  const basePriceY = 1100;
  const currentPriceY = basePriceY - (basePriceY - wallY) * squeeze;
  const bracketH = currentPriceY - wallY;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz }}>
      {frame === 0 && <Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.2} />}
      {frame === S(0.5) && <Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.4} />}

      {/* Glowing Wall */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: wallY, height: 8, background: BRAND.coral, boxShadow: `0 0 ${80 * squeeze}px ${BRAND.coral}` }} />
      
      {/* Dark Pool Flow compressing in gap */}
      <DarkPoolFlow progress={1} targetY={wallY + bracketH * 0.2} intensity={0.6 + squeeze * 0.4} />

      {/* Bracket */}
      <div style={{ position: 'absolute', left: 780, top: wallY, height: Math.max(10, bracketH) }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 8, height: '100%', background: BRAND.amber, boxShadow: `0 0 20px ${BRAND.amberGlow}` }} />
        <div style={{ position: 'absolute', left: -24, top: 0, width: 32, height: 8, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: -24, bottom: 0, width: 32, height: 8, background: BRAND.amber }} />
      </div>

      {/* Price Dot pushing up */}
      <div style={{ position: 'absolute', left: 80, right: 300, top: currentPriceY, height: 4, background: BRAND.cyan, opacity: 0.6 }} />
      <div style={{ position: 'absolute', left: 500, top: currentPriceY - 16, width: 32, height: 32, borderRadius: '50%', background: BRAND.text, border: `6px solid ${BRAND.cyan}`, boxShadow: `0 0 30px ${BRAND.cyanGlow}`, transform: `scale(${pulse})` }} />

      <div style={{ position: 'absolute', top: 300, left: 80, right: 80 }}>
        <div style={{ color: BRAND.text, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero }}>
          PRESSURE<br/>
          <span style={{ color: BRAND.amber, textShadow: SHADOW.amber }}>MAY BUILD HERE ⬆</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 8.5s–12.0s: SignumHQ Layer Unlock (System Boot)
// ─────────────────────────────────────────────────────────────────────────────
const SystemBoot: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;
  const { callWall, putFloor, gammaFlipLevel } = data;
  const cWall = callWall ?? 600;
  const pFloor = putFloor ?? 500;
  const gFlip = gammaFlipLevel ?? 550;

  const wallPop = spring({ frame: Math.max(0, frame - S(0.3)), fps, config: { damping: 12, stiffness: 300 } });
  const flowPop = spring({ frame: Math.max(0, frame - S(0.7)), fps, config: { damping: 12, stiffness: 300 } });
  const flipPop = spring({ frame: Math.max(0, frame - S(1.1)), fps, config: { damping: 12, stiffness: 300 } });
  const floorPop = spring({ frame: Math.max(0, frame - S(1.5)), fps, config: { damping: 12, stiffness: 300 } });

  const mapTop = 600;
  const mapH = 600;
  const toY = (level: number) => mapTop + ((cWall - level) / (cWall - pFloor)) * mapH;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz }}>
      {frame === S(0.3) && <Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.4} />}
      {frame === S(0.7) && <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.3} />}
      {frame === S(1.1) && <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.3} />}
      {frame === S(1.5) && <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.3} />}

      <div style={{ position: 'absolute', top: 300, left: 80, right: 80, textAlign: 'center' }}>
        <div style={{ color: BRAND.text, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero }}>SIGNUMHQ</div>
        <div style={{ color: BRAND.cyan, fontSize: 70, fontWeight: 800, fontFamily: TYPE.family, textShadow: SHADOW.cyan, marginTop: 10 }}>STRUCTURE LAYER</div>
      </div>

      <div style={{ position: 'absolute', inset: 0 }}>
        {/* Wall */}
        <div style={{ opacity: interpolate(wallPop, [0, 1], [0, 1]), transform: `scaleX(${wallPop})` }}>
          <div style={{ position: 'absolute', left: 80, right: 80, top: toY(cWall), height: 8, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
          <div style={{ position: 'absolute', right: 80, top: toY(cWall) - 60, color: BRAND.coral, fontSize: 40, fontWeight: 800, fontFamily: TYPE.family }}>CALL WALL</div>
        </div>

        {/* Dark Pool */}
        {flowPop > 0 && <DarkPoolFlow progress={1} targetY={toY(cWall) + 30} intensity={flowPop} />}
        <div style={{ opacity: interpolate(flowPop, [0, 1], [0, 1]), position: 'absolute', left: 80, top: toY(cWall) + 40, color: BRAND.cyan, fontSize: 36, fontWeight: 800, fontFamily: TYPE.family }}>DARK POOL CLUSTER</div>

        {/* Flip */}
        {gammaFlipLevel && (
          <div style={{ opacity: interpolate(flipPop, [0, 1], [0, 1]), transform: `scaleX(${flipPop})` }}>
            <div style={{ position: 'absolute', left: 80, right: 80, top: toY(gFlip), height: 6, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
            <div style={{ position: 'absolute', right: 80, top: toY(gFlip) - 50, color: BRAND.purple, fontSize: 36, fontWeight: 800, fontFamily: TYPE.family }}>GAMMA FLIP</div>
          </div>
        )}

        {/* Floor */}
        <div style={{ opacity: interpolate(floorPop, [0, 1], [0, 1]), transform: `scaleX(${floorPop})` }}>
          <div style={{ position: 'absolute', left: 80, right: 80, top: toY(pFloor), height: 8, background: BRAND.emerald, boxShadow: `0 0 40px ${BRAND.emerald}` }} />
          <div style={{ position: 'absolute', right: 80, top: toY(pFloor) + 20, color: BRAND.emerald, fontSize: 40, fontWeight: 800, fontFamily: TYPE.family }}>PUT FLOOR</div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 12.0s–15.2s: Compliance Map
// ─────────────────────────────────────────────────────────────────────────────
const ComplianceMap: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  if (!data) return null;
  const { callWall, putFloor, gammaFlipLevel } = data;
  const cWall = callWall ?? 600;
  const pFloor = putFloor ?? 500;
  const gFlip = gammaFlipLevel ?? 550;
  const mapTop = 600;
  const mapH = 600;
  const toY = (level: number) => mapTop + ((cWall - level) / (cWall - pFloor)) * mapH;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz }}>
      {/* Full Map Static */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: toY(cWall), height: 8, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
      <div style={{ position: 'absolute', right: 80, top: toY(cWall) - 60, color: BRAND.coral, fontSize: 40, fontWeight: 800, fontFamily: TYPE.family }}>CALL WALL</div>
      <DarkPoolFlow progress={1} targetY={toY(cWall) + 30} intensity={0.8} />
      <div style={{ position: 'absolute', left: 80, top: toY(cWall) + 40, color: BRAND.cyan, fontSize: 36, fontWeight: 800, fontFamily: TYPE.family }}>DARK POOL CLUSTER</div>
      
      {gammaFlipLevel && (
        <>
          <div style={{ position: 'absolute', left: 80, right: 80, top: toY(gFlip), height: 6, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
          <div style={{ position: 'absolute', right: 80, top: toY(gFlip) - 50, color: BRAND.purple, fontSize: 36, fontWeight: 800, fontFamily: TYPE.family }}>GAMMA FLIP</div>
        </>
      )}

      <div style={{ position: 'absolute', left: 80, right: 80, top: toY(pFloor), height: 8, background: BRAND.emerald, boxShadow: `0 0 40px ${BRAND.emerald}` }} />
      <div style={{ position: 'absolute', right: 80, top: toY(pFloor) + 20, color: BRAND.emerald, fontSize: 40, fontWeight: 800, fontFamily: TYPE.family }}>PUT FLOOR</div>

      {/* Compliance Text */}
      <div style={{ position: 'absolute', top: 300, left: 80, right: 80 }}>
        <div style={{ color: BRAND.textSecondary, fontSize: 70, fontWeight: 800, fontFamily: TYPE.family, textShadow: SHADOW.caption }}>NOT A PREDICTION.</div>
        <div style={{ color: BRAND.text, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero, marginTop: 10 }}>A PRESSURE MAP.</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 15.2s–18.5s: CTA
// ─────────────────────────────────────────────────────────────────────────────
const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spring({ frame, fps, config: { damping: 14, stiffness: 220 } });
  
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {frame === 0 && <Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.4} />}

      <div style={{ marginBottom: 60, opacity: r, transform: `scale(${interpolate(r, [0, 1], [0.8, 1])})` }}>
        <svg width="220" height="220" viewBox="246 247 530 530" fill="none">
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.cyan} />
        </svg>
      </div>

      <div style={{ textAlign: 'center', opacity: r, transform: `translateY(${(1 - r) * 40}px)` }}>
        <div style={{ color: BRAND.text, fontSize: 72, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero, lineHeight: 1.15 }}>SEE THE STRUCTURE</div>
        <div style={{ color: BRAND.cyan, fontSize: 72, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.cyan, marginTop: 10 }}>BEHIND PRICE</div>
      </div>

      <div style={{ marginTop: 80, padding: '24px 64px', borderRadius: 40, border: `3px solid ${BRAND.cyan}`, background: `rgba(34,211,238,0.1)`, opacity: r, transform: `translateY(${(1 - r) * 50}px)`, boxShadow: `0 0 40px ${BRAND.cyanGlow}` }}>
        <span style={{ color: BRAND.text, fontSize: 56, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>SIGNUMHQ.COM</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Composition — 18.5s @ 30fps = 555 frames
// ─────────────────────────────────────────────────────────────────────────────
export const MarketPressureBriefV20: React.FC<MarketPressureBriefProps> = (props) => {
  const { structureVisual, disclaimer } = props;

  return (
    <AbsoluteFill style={{ backgroundColor: '#02050e' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, rgba(34,211,238,0.04) 0%, transparent 80%)` }} />
      <CinematicNoise />
      <AudioEngine />

      <Sequence from={0} durationInFrames={S(0.5)}><DataShock data={structureVisual} /></Sequence>
      <Sequence from={S(0.5)} durationInFrames={S(2.0)}><DarkPoolReveal data={structureVisual} /></Sequence>
      <Sequence from={S(2.5)} durationInFrames={S(2.7)}><WhyItMatters data={structureVisual} /></Sequence>
      <Sequence from={S(5.2)} durationInFrames={S(3.3)}><PressureZone data={structureVisual} /></Sequence>
      <Sequence from={S(8.5)} durationInFrames={S(3.5)}><SystemBoot data={structureVisual} /></Sequence>
      <Sequence from={S(12.0)} durationInFrames={S(3.2)}><ComplianceMap data={structureVisual} /></Sequence>
      <Sequence from={S(15.2)} durationInFrames={S(3.3)}><CTA /></Sequence>

      <ComplianceFooter text={disclaimer} />

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, background: 'rgba(255,255,255,0.05)', zIndex: Z.progress }}>
        <div style={{ height: '100%', width: `${(useCurrentFrame() / useVideoConfig().durationInFrames) * 100}%`, background: BRAND.gradientCyanPurple }} />
      </div>
    </AbsoluteFill>
  );
};
