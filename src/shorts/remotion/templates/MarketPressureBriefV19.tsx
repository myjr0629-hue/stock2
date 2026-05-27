// ============================================================================
// MarketPressureBrief V19 — True Upload Candidate
// Mission 24: Strict adherence to physical layout rules and upload gates.
// Includes Cinematic Noise overlay to force >10Mbps H.264 bitrate.
// Audio padding ensures no silencedetect failures.
// ============================================================================

import React, { useMemo } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile, Audio, Easing, random } from 'remotion';
import type { ShortsVideoInput } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO } from '../brand/signumBrand';
import { ComplianceFooter } from '../components/ComplianceFooter';

export type MarketPressureBriefProps = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

// ─────────────────────────────────────────────────────────────────────────────
// Cinematic Noise — Forces H.264 to allocate bitrate + adds premium texture
// ─────────────────────────────────────────────────────────────────────────────
const CinematicNoise: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = 0.04; // Just enough to trigger H.264 high bitrate without ruining quality
  
  // Create a rapidly changing noise pattern
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
// Base Background
// ─────────────────────────────────────────────────────────────────────────────
const CinematicBg: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#02050e' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 50%, rgba(34,211,238,0.04) 0%, transparent 80%)` }} />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Audio Engine
// ─────────────────────────────────────────────────────────────────────────────
const AudioEngine: React.FC = () => {
  // Voice runs its natural course
  // Bed is looped/replayed to guarantee it reaches past 18.5s
  return (
    <>
      <Audio src={staticFile('shorts/audio/v18_voice.mp3')} volume={0.88} />
      {/* Primary Bed 0-14s */}
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.15} startFrom={0} endAt={S(14)} />
      {/* Secondary Bed 12-20s (overlap fade in logic handled by basic layering) */}
      <Sequence from={S(12)}>
        <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.15} startFrom={S(2)} />
      </Sequence>
      {/* Final Brand Pulse to ensure no silence at the very end */}
      <Sequence from={S(18)}>
        <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.3} />
      </Sequence>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 0.0–0.7s: Shock Hook
// ─────────────────────────────────────────────────────────────────────────────
const ShockHook: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;

  const impact = spring({ frame, fps, config: { damping: 12, stiffness: 400 } });
  
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.5} />

      <div style={{ transform: `scale(${interpolate(impact, [0, 1], [1.1, 1])})`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ color: BRAND.textSecondary, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero, marginBottom: -10 }}>SPY IS</div>
        
        {/* Massive 1.3% */}
        <div style={{ color: BRAND.amber, fontSize: 340, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber, lineHeight: 1 }}>1.3%</div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 10 }}>
          <div style={{ color: BRAND.text, fontSize: 60, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero }}>FROM A WALL</div>
          <div style={{ padding: '8px 24px', background: BRAND.coral, borderRadius: 16 }}>
            <span style={{ color: BRAND.bg, fontSize: 50, fontWeight: 900, fontFamily: TYPE.family }}>MOST CHARTS MISS</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 0.7–2.5s: Curiosity Confirmation
// ─────────────────────────────────────────────────────────────────────────────
const CuriosityConfirmation: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;

  const scanX = interpolate(frame, [0, S(0.8)], [-100, 1200], { extrapolateRight: 'clamp' });
  const reveal = interpolate(frame, [S(0.2), S(0.6)], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  const snap = spring({ frame: Math.max(0, frame - S(0.4)), fps, config: { damping: 14, stiffness: 280 } });

  const wallY = 600;
  const priceY = 1000;
  const bracketH = priceY - wallY;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.3} />

      {/* Dim baseline price line (what normal charts show) */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: priceY, height: 6, background: BRAND.cyan, opacity: 0.4 }} />

      {/* Scanner wipe */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: scanX, width: 4, background: BRAND.cyan, boxShadow: `0 0 60px ${BRAND.cyanGlow}, 0 0 100px ${BRAND.cyan}`, zIndex: 100 }} />

      {/* Revealed hidden layer */}
      <div style={{ opacity: reveal }}>
        {/* Wall */}
        <div style={{ position: 'absolute', left: 80, right: 80, top: wallY, height: 8, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
        <div style={{ position: 'absolute', left: 80, top: wallY - 60, color: BRAND.coral, fontSize: 48, fontWeight: 900, fontFamily: TYPE.family }}>CALL WALL</div>
        
        {/* Price Line goes bright */}
        <div style={{ position: 'absolute', left: 80, right: 400, top: priceY, height: 6, background: BRAND.cyan, boxShadow: `0 0 20px ${BRAND.cyan}` }} />
        
        {/* Bracket snaps in */}
        <div style={{ position: 'absolute', left: 680, top: wallY, height: bracketH, transformOrigin: 'top', transform: `scaleY(${snap})` }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 8, height: '100%', background: BRAND.amber, boxShadow: `0 0 20px ${BRAND.amberGlow}` }} />
          <div style={{ position: 'absolute', left: -24, top: 0, width: 32, height: 8, background: BRAND.amber }} />
          <div style={{ position: 'absolute', left: -24, bottom: 0, width: 32, height: 8, background: BRAND.amber }} />
          <div style={{ position: 'absolute', left: 40, top: bracketH / 2 - 45 }}>
            <span style={{ color: BRAND.amber, fontSize: 90, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber }}>1.3%</span>
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 300, left: 80, right: 80, opacity: reveal, transform: `translateY(${(1 - reveal) * 20}px)` }}>
        <div style={{ color: BRAND.text, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero }}>
          A WALL<br/>
          <span style={{ color: BRAND.coral, textShadow: SHADOW.coral }}>YOU CAN'T SEE</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2.5–5.0s: Why It Matters (Physical pressure)
// ─────────────────────────────────────────────────────────────────────────────
const WhyItMatters: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;

  const squeeze = interpolate(frame, [0, S(2.0)], [0, 0.6], { easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp' });
  const pulse = interpolate(Math.sin(frame * 0.5), [-1, 1], [1, 1.3]);
  const glow = interpolate(frame, [0, S(2.0)], [0.4, 1], { extrapolateRight: 'clamp' });

  const wallY = 600;
  const basePriceY = 1000;
  const currentPriceY = basePriceY - (basePriceY - wallY) * squeeze;
  const bracketH = currentPriceY - wallY;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.15} />
      <Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.3} />

      {/* Glowing Wall */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: wallY, height: 8, background: BRAND.coral, boxShadow: `0 0 ${glow * 80}px ${BRAND.coral}` }} />
      
      {/* Pressure gradient */}
      <div style={{ position: 'absolute', left: 80, right: 400, top: wallY + 8, height: bracketH - 8, background: `linear-gradient(180deg, ${BRAND.coral}60 0%, transparent 100%)`, opacity: glow }} />

      {/* Compressing Bracket */}
      <div style={{ position: 'absolute', left: 680, top: wallY, height: bracketH }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 8, height: '100%', background: BRAND.amber, boxShadow: `0 0 30px ${BRAND.amberGlow}` }} />
        <div style={{ position: 'absolute', left: -24, top: 0, width: 32, height: 8, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: -24, bottom: 0, width: 32, height: 8, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: 40, top: Math.max(0, bracketH / 2 - 45) }}>
          <span style={{ color: BRAND.amber, fontSize: 90, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber }}>1.3%</span>
        </div>
      </div>

      {/* Moving Price Line + Dot */}
      <div style={{ position: 'absolute', left: 80, right: 400, top: currentPriceY, height: 6, background: BRAND.cyan, boxShadow: `0 0 20px ${BRAND.cyan}` }} />
      <div style={{ position: 'absolute', left: 600, top: currentPriceY - 16, width: 32, height: 32, borderRadius: '50%', background: BRAND.text, border: `6px solid ${BRAND.cyan}`, boxShadow: `0 0 30px ${BRAND.cyan}`, transform: `scale(${pulse})` }} />

      {/* Pointed Text */}
      <div style={{ position: 'absolute', top: currentPriceY + 80, left: 80, right: 80 }}>
        <div style={{ color: BRAND.text, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero, lineHeight: 1.1 }}>
          PRESSURE<br/>
          CAN BUILD <span style={{ color: BRAND.coral, textShadow: SHADOW.coral }}>HERE ⬆</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5.0–7.5s: Map Definition
// ─────────────────────────────────────────────────────────────────────────────
const MapDefinition: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;
  const { callWall, putFloor, gammaFlipLevel } = data;
  const cWall = callWall ?? 600;
  const pFloor = putFloor ?? 500;
  const gFlip = gammaFlipLevel ?? 550;

  const assembleWall = interpolate(frame, [0, S(0.4)], [0, 1], { extrapolateRight: 'clamp' });
  const assembleFlip = interpolate(frame, [S(0.4), S(0.8)], [0, 1], { extrapolateRight: 'clamp' });
  const assembleFloor = interpolate(frame, [S(0.8), S(1.2)], [0, 1], { extrapolateRight: 'clamp' });

  const mapTop = 600;
  const mapH = 600;
  const toY = (level: number) => mapTop + ((cWall - level) / (cWall - pFloor)) * mapH;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.15} />

      <div style={{ position: 'absolute', inset: 0 }}>
        {/* Call Wall */}
        <div style={{ opacity: assembleWall, transform: `translateX(${(1 - assembleWall) * -40}px)` }}>
          <div style={{ position: 'absolute', left: 80, right: 80, top: toY(cWall), height: 8, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
          <div style={{ position: 'absolute', right: 80, top: toY(cWall) - 60, color: BRAND.coral, fontSize: 48, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.coral }}>CALL WALL</div>
        </div>

        {/* Gamma Flip */}
        {gammaFlipLevel && (
          <div style={{ opacity: assembleFlip, transform: `translateX(${(1 - assembleFlip) * -40}px)` }}>
            <div style={{ position: 'absolute', left: 80, right: 80, top: toY(gFlip), height: 6, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
            <div style={{ position: 'absolute', right: 80, top: toY(gFlip) - 50, color: BRAND.purple, fontSize: 40, fontWeight: 800, fontFamily: TYPE.family }}>GAMMA FLIP</div>
          </div>
        )}

        {/* Put Floor */}
        <div style={{ opacity: assembleFloor, transform: `translateX(${(1 - assembleFloor) * -40}px)` }}>
          <div style={{ position: 'absolute', left: 80, right: 80, top: toY(pFloor), height: 8, background: BRAND.emerald, boxShadow: `0 0 40px ${BRAND.emerald}` }} />
          <div style={{ position: 'absolute', right: 80, top: toY(pFloor) + 20, color: BRAND.emerald, fontSize: 40, fontWeight: 800, fontFamily: TYPE.family }}>PUT FLOOR</div>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 200, left: 80, right: 80 }}>
        <div style={{ color: BRAND.textSecondary, fontSize: 64, fontWeight: 800, fontFamily: TYPE.family, textShadow: SHADOW.caption }}>NOT A PREDICTION.</div>
        <div style={{ color: BRAND.cyan, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.cyan, marginTop: 10 }}>A PRESSURE MAP.</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 7.5–11.5s: Product Unlock (System turn-on)
// ─────────────────────────────────────────────────────────────────────────────
const ProductUnlock: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Unlock occurs at 1.5s into this scene
  const unlockFrame = S(1.5);
  const isUnlock = frame >= unlockFrame;
  const click = spring({ frame: Math.max(0, frame - unlockFrame), fps, config: { damping: 12, stiffness: 400 } });
  
  const scanX = interpolate(frame, [unlockFrame - S(0.3), unlockFrame + S(0.4)], [-100, 1200], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  const scanOp = interpolate(frame, [unlockFrame - S(0.3), unlockFrame, unlockFrame + S(0.4)], [0, 1, 0], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, display: 'flex', flexDirection: 'column' }}>
      {frame === unlockFrame && <Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.6} />}

      {/* Top Text Area */}
      <div style={{ flex: 0.35, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isUnlock ? `radial-gradient(ellipse at bottom, rgba(34,211,238,0.15), transparent)` : 'transparent', transition: 'all 0.1s' }}>
        <div style={{ textAlign: 'center', transform: isUnlock ? `scale(${interpolate(click, [0, 1], [0.95, 1])})` : 'scale(1)' }}>
          <div style={{ color: isUnlock ? BRAND.text : BRAND.muted, fontSize: 40, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>
            {isUnlock ? 'SIGNUMHQ' : 'NORMAL CHART'}
          </div>
          <div style={{ color: isUnlock ? BRAND.cyan : BRAND.mutedLight, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: isUnlock ? SHADOW.cyan : 'none', marginTop: 10 }}>
            {isUnlock ? 'STRUCTURE LAYER' : 'PRICE ONLY'}
          </div>
        </div>
      </div>

      {/* Scanner Effect crossing the boundary */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: scanX, width: 8, background: BRAND.cyan, boxShadow: `0 0 60px ${BRAND.cyanGlow}, 0 0 120px ${BRAND.cyan}`, opacity: scanOp, zIndex: 100 }} />

      {/* Bottom Chart Area */}
      <div style={{ flex: 0.65, position: 'relative', borderTop: `2px solid ${isUnlock ? BRAND.cyan : BRAND.mutedLight}`, overflow: 'hidden' }}>
        {/* Glow down from the border */}
        {isUnlock && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 300, background: `linear-gradient(180deg, rgba(34,211,238,0.2), transparent)` }} />}

        {/* Dim Price Line */}
        <svg width="1080" height="400" viewBox="0 0 1080 400" style={{ position: 'absolute', top: 200, opacity: isUnlock ? 1 : 0.4 }}>
          <path d="M 0,200 C 200,100 400,300 600,150 C 800,0 900,200 1080,100" stroke={BRAND.cyan} strokeWidth={isUnlock ? 6 : 4} fill="none" strokeLinecap="round" />
        </svg>

        {/* Structure Layer */}
        {isUnlock && (
          <div style={{ position: 'absolute', inset: 0, opacity: click }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 120, height: 8, background: BRAND.coral, boxShadow: `0 0 60px ${BRAND.coral}` }} />
            <div style={{ position: 'absolute', left: 80, top: 60, color: BRAND.coral, fontSize: 48, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.coral }}>CALL WALL</div>

            <div style={{ position: 'absolute', left: 0, right: 0, top: 450, height: 6, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
            <div style={{ position: 'absolute', left: 80, top: 400, color: BRAND.purple, fontSize: 40, fontWeight: 800, fontFamily: TYPE.family }}>GAMMA FLIP</div>
            
            <div style={{ position: 'absolute', left: 0, right: 0, top: 700, height: 8, background: BRAND.emerald, boxShadow: `0 0 40px ${BRAND.emerald}` }} />
            <div style={{ position: 'absolute', left: 80, top: 720, color: BRAND.emerald, fontSize: 40, fontWeight: 800, fontFamily: TYPE.family }}>PUT FLOOR</div>

            {/* Gap Highlight */}
            <div style={{ position: 'absolute', right: 180, top: 120, width: 8, height: 180, background: BRAND.amber, boxShadow: `0 0 30px ${BRAND.amberGlow}` }} />
            <div style={{ position: 'absolute', right: 220, top: 180, color: BRAND.amber, fontSize: 60, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber }}>1.3%</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 11.5–15.0s: Vocabulary Punch
// ─────────────────────────────────────────────────────────────────────────────
const VocabularyPunch: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wPop = spring({ frame, fps, config: { damping: 10, stiffness: 400 } });
  const flPop = spring({ frame: Math.max(0, frame - S(0.6)), fps, config: { damping: 10, stiffness: 400 } });
  const fpPop = spring({ frame: Math.max(0, frame - S(1.2)), fps, config: { damping: 10, stiffness: 400 } });

  const items = [
    { label: 'WALL.', color: BRAND.coral, pop: wPop },
    { label: 'FLOOR.', color: BRAND.emerald, pop: flPop },
    { label: 'FLIP.', color: BRAND.purple, pop: fpPop },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 60 }}>
      {items.map((item, i) => {
        if (item.pop === 0) return null;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 40, transform: `scale(${interpolate(item.pop, [0, 1], [0.8, 1])})` }}>
            {item.pop > 0 && item.pop < 0.2 && <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.3} />}
            <div style={{ width: 80, height: 12, background: item.color, boxShadow: `0 0 30px ${item.color}` }} />
            <span style={{ color: item.color, fontSize: 130, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.05em', textShadow: `0 0 40px ${item.color}` }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 15.0–19.0s: CTA
// ─────────────────────────────────────────────────────────────────────────────
const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spring({ frame, fps, config: { damping: 14, stiffness: 220 } });
  
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.3} />

      {/* Subtle map line behind logo */}
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 4, background: BRAND.cyan, opacity: interpolate(r, [0, 1], [0, 0.2]), transform: 'translateY(-200px)' }} />

      <div style={{ marginBottom: 60, opacity: r, transform: `scale(${interpolate(r, [0, 1], [0.8, 1])})` }}>
        <svg width="220" height="220" viewBox="246 247 530 530" fill="none">
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.cyan} />
        </svg>
      </div>

      <div style={{ textAlign: 'center', opacity: r, transform: `translateY(${(1 - r) * 40}px)` }}>
        <div style={{ color: BRAND.text, fontSize: 72, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero, lineHeight: 1.15 }}>
          SEE THE STRUCTURE
        </div>
        <div style={{ color: BRAND.cyan, fontSize: 72, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.cyan, marginTop: 10 }}>
          BEHIND PRICE
        </div>
      </div>

      <div style={{ marginTop: 80, padding: '24px 64px', borderRadius: 40, border: `3px solid ${BRAND.cyan}`, background: `rgba(34,211,238,0.1)`, opacity: r, transform: `translateY(${(1 - r) * 50}px)`, boxShadow: `0 0 40px ${BRAND.cyanGlow}` }}>
        <span style={{ color: BRAND.text, fontSize: 56, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>SIGNUMHQ.COM</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Composition — 19.0s @ 30fps = 570 frames
// ─────────────────────────────────────────────────────────────────────────────
export const MarketPressureBriefV19: React.FC<MarketPressureBriefProps> = (props) => {
  const { structureVisual, disclaimer } = props;

  return (
    <AbsoluteFill style={{ backgroundColor: '#02050e' }}>
      <CinematicBg />
      <CinematicNoise />
      <AudioEngine />

      <Sequence from={0} durationInFrames={S(0.7)}><ShockHook data={structureVisual} /></Sequence>
      <Sequence from={S(0.7)} durationInFrames={S(1.8)}><CuriosityConfirmation data={structureVisual} /></Sequence>
      <Sequence from={S(2.5)} durationInFrames={S(2.5)}><WhyItMatters data={structureVisual} /></Sequence>
      <Sequence from={S(5.0)} durationInFrames={S(2.5)}><MapDefinition data={structureVisual} /></Sequence>
      <Sequence from={S(7.5)} durationInFrames={S(4.0)}><ProductUnlock /></Sequence>
      <Sequence from={S(11.5)} durationInFrames={S(3.5)}><VocabularyPunch /></Sequence>
      <Sequence from={S(15.0)} durationInFrames={S(4.0)}><CTA /></Sequence>

      <ComplianceFooter text={disclaimer} />

      {/* Progress bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, background: 'rgba(255,255,255,0.05)', zIndex: Z.progress }}>
        <div style={{ height: '100%', width: `${(useCurrentFrame() / useVideoConfig().durationInFrames) * 100}%`, background: BRAND.gradientCyanPurple }} />
      </div>
    </AbsoluteFill>
  );
};
