// ============================================================================
// MarketPressureBrief V18 — Upload-Candidate Rebuild
// Mission 23: Complete structural rebuild to solve V17's layout issues.
// Focus: Immediate impact at 0.0s, high density, physical unlock moments.
// ============================================================================

import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile, Audio, Easing } from 'remotion';
import type { ShortsVideoInput } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO } from '../brand/signumBrand';
import { ComplianceFooter } from '../components/ComplianceFooter';

export type MarketPressureBriefProps = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

// ─────────────────────────────────────────────────────────────────────────────
// Cinematic Background — deep navy, subtle glowing depth
// ─────────────────────────────────────────────────────────────────────────────
const CinematicBg: React.FC = () => {
  const frame = useCurrentFrame();
  const breathe = interpolate(Math.sin(frame * 0.015), [-1, 1], [0.02, 0.06]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#02040a' }}>
      {/* Deep radial gradient to give depth */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 50%, rgba(34,211,238,0.03) 0%, transparent 80%)` }} />
      
      {/* Premium intelligence grid */}
      <svg width="1080" height="1920" style={{ position: 'absolute', inset: 0, opacity: breathe }}>
        {Array.from({ length: 32 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 60} x2="1080" y2={i * 60} stroke={BRAND.cyan} strokeWidth="0.5" />
        ))}
        {Array.from({ length: 18 }, (_, i) => (
          <line key={`v${i}`} x1={i * 60} y1="0" x2={i * 60} y2="1920" stroke={BRAND.cyan} strokeWidth="0.5" />
        ))}
      </svg>
      
      {/* Audio layers */}
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.20} />
      <Audio src={staticFile('shorts/audio/v18_voice.mp3')} volume={0.90} />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 0.0–0.7s: Hard Data Interrupt — 1.3% Hero
// ─────────────────────────────────────────────────────────────────────────────
const HardDataInterrupt: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;

  // 0.0s impact - no fade, instant presence, slight recoil
  const impact = spring({ frame, fps, config: { damping: 10, stiffness: 400, mass: 0.4 } });
  
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.6} />

      {/* Central focus: 1.3% */}
      <div style={{ transform: `scale(${interpolate(impact, [0, 1], [1.2, 1])})`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ color: BRAND.textSecondary, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero, marginBottom: -20, letterSpacing: '-0.02em' }}>SPY IS</div>
        
        <div style={{ color: BRAND.amber, fontSize: 320, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber, lineHeight: 1 }}>
          1.3%
        </div>
        
        <div style={{ color: BRAND.text, fontSize: 72, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero, marginTop: 10 }}>
          FROM A WALL
        </div>
        <div style={{ color: BRAND.coral, fontSize: 72, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.coral, marginTop: -10 }}>
          YOU CAN'T SEE
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 0.7–2.5s: The Invisible Wall Appears
// ─────────────────────────────────────────────────────────────────────────────
const InvisibleWallAppears: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;

  const scanX = interpolate(frame, [0, S(0.8)], [-200, 1200], { extrapolateRight: 'clamp' });
  const reveal = interpolate(frame, [S(0.2), S(0.6)], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  const snap = spring({ frame: Math.max(0, frame - S(0.4)), fps, config: { damping: 12, stiffness: 300 } });

  const wallY = 600;
  const priceY = 900;
  const bracketH = priceY - wallY;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz }}>
      {/* SFX played via timeline in Root or here, using scan sound */}
      <Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.35} />

      {/* Dim baseline price line */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: priceY, height: 6, background: BRAND.mutedLight, opacity: 0.5 }} />

      {/* Scanner wipe effect */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: scanX, width: 6, background: BRAND.cyan, boxShadow: `0 0 60px ${BRAND.cyanGlow}, 0 0 120px ${BRAND.cyan}`, zIndex: 100 }} />

      {/* Revealed Structure */}
      <div style={{ opacity: reveal }}>
        {/* Wall */}
        <div style={{ position: 'absolute', left: 80, right: 80, top: wallY, height: 8, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
        <div style={{ position: 'absolute', left: 80, top: wallY - 60, color: BRAND.coral, fontSize: 48, fontWeight: 900, fontFamily: TYPE.family }}>CALL WALL</div>
        
        {/* Price Line active */}
        <div style={{ position: 'absolute', left: 80, right: 400, top: priceY, height: 6, background: BRAND.cyan, boxShadow: `0 0 20px ${BRAND.cyan}` }} />
        
        {/* Bracket snaps in */}
        <div style={{ position: 'absolute', left: 680, top: wallY, height: bracketH, transformOrigin: 'top', transform: `scaleY(${snap})` }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 8, height: '100%', background: BRAND.amber, boxShadow: `0 0 20px ${BRAND.amberGlow}` }} />
          <div style={{ position: 'absolute', left: -20, top: 0, width: 28, height: 8, background: BRAND.amber }} />
          <div style={{ position: 'absolute', left: -20, bottom: 0, width: 28, height: 8, background: BRAND.amber }} />
          
          <div style={{ position: 'absolute', left: 40, top: bracketH / 2 - 45 }}>
            <span style={{ color: BRAND.amber, fontSize: 90, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber }}>1.3%</span>
          </div>
        </div>
      </div>

      {/* Text positioned carefully so it doesn't float disconnected */}
      <div style={{ position: 'absolute', bottom: 350, left: 80, right: 80, opacity: reveal, transform: `translateY(${(1 - reveal) * 40}px)` }}>
        <div style={{ color: BRAND.text, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero, lineHeight: 1.1 }}>
          MOST CHARTS<br/>
          <span style={{ color: BRAND.cyan, textShadow: SHADOW.cyan }}>DON'T SHOW THIS</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2.5–5.5s: Pressure Build (Physical compression)
// ─────────────────────────────────────────────────────────────────────────────
const PressureBuild: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;

  const squeeze = interpolate(frame, [0, S(2.5)], [0, 0.6], { easing: Easing.out(Easing.cubic), extrapolateRight: 'clamp' });
  const pulse = interpolate(Math.sin(frame * 0.4), [-1, 1], [1, 1.4]);
  const glowIntensity = interpolate(frame, [0, S(2.5)], [0.4, 1], { extrapolateRight: 'clamp' });

  const wallY = 600;
  const basePriceY = 900;
  const currentPriceY = basePriceY - (basePriceY - wallY) * squeeze;
  const bracketH = currentPriceY - wallY;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.2} />
      <Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.4} />

      {/* Glowing Wall */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: wallY, height: 8, background: BRAND.coral, boxShadow: `0 0 ${glowIntensity * 80}px ${BRAND.coral}` }} />
      
      {/* Pressure Zone fill */}
      <div style={{ position: 'absolute', left: 80, right: 400, top: wallY + 8, height: bracketH - 8, background: `linear-gradient(180deg, ${BRAND.coral}60 0%, transparent 100%)`, opacity: glowIntensity }} />

      {/* Bracket compressing */}
      <div style={{ position: 'absolute', left: 680, top: wallY, height: bracketH }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 8, height: '100%', background: BRAND.amber, boxShadow: `0 0 30px ${BRAND.amberGlow}` }} />
        <div style={{ position: 'absolute', left: -20, top: 0, width: 28, height: 8, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: -20, bottom: 0, width: 28, height: 8, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: 40, top: Math.max(0, bracketH / 2 - 45) }}>
          <span style={{ color: BRAND.amber, fontSize: 90, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber }}>1.3%</span>
        </div>
      </div>

      {/* Price line pushing up */}
      <div style={{ position: 'absolute', left: 80, right: 400, top: currentPriceY, height: 6, background: BRAND.cyan, boxShadow: `0 0 20px ${BRAND.cyan}` }} />
      
      {/* Pulsing Dot representing active price */}
      <div style={{ position: 'absolute', left: 630, top: currentPriceY - 16, width: 32, height: 32, borderRadius: '50%', background: BRAND.text, border: `6px solid ${BRAND.cyan}`, boxShadow: `0 0 30px ${BRAND.cyan}`, transform: `scale(${pulse})` }} />

      {/* Text pointing explicitly to the gap */}
      <div style={{ position: 'absolute', top: currentPriceY + 60, left: 80, right: 80 }}>
        <div style={{ color: BRAND.text, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero, lineHeight: 1.1 }}>
          PRESSURE<br/>
          <span style={{ color: BRAND.coral, textShadow: SHADOW.coral }}>CAN BUILD HERE ⬆</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5.5–8.5s: Map Trust Beat (Pull back view)
// ─────────────────────────────────────────────────────────────────────────────
const MapTrustBeat: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;
  const { callWall, putFloor, gammaFlipLevel } = data;
  const cWall = callWall ?? 600;
  const pFloor = putFloor ?? 500;
  const gFlip = gammaFlipLevel ?? 550;

  const pullBack = spring({ frame, fps, config: { damping: 14, stiffness: 200 } });
  
  // Assemble sequence for labels
  const showWall = interpolate(frame, [S(0.2), S(0.6)], [0, 1], { extrapolateRight: 'clamp' });
  const showFlip = interpolate(frame, [S(0.6), S(1.0)], [0, 1], { extrapolateRight: 'clamp' });
  const showFloor = interpolate(frame, [S(1.0), S(1.4)], [0, 1], { extrapolateRight: 'clamp' });

  const mapTop = 500;
  const mapH = 700;
  const toY = (level: number) => mapTop + ((cWall - level) / (cWall - pFloor)) * mapH;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.2} />

      {/* Map lines rendering */}
      <div style={{ position: 'absolute', inset: 0, opacity: pullBack, transform: `scale(${interpolate(pullBack, [0, 1], [1.1, 1])})` }}>
        {/* Call Wall (Primary) */}
        <div style={{ opacity: showWall, transform: `translateY(${(1 - showWall) * 20}px)` }}>
          <div style={{ position: 'absolute', left: 80, right: 80, top: toY(cWall), height: 8, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
          <div style={{ position: 'absolute', right: 80, top: toY(cWall) - 60, color: BRAND.coral, fontSize: 48, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.coral }}>CALL WALL</div>
        </div>

        {/* Gamma Flip (Secondary) */}
        {gammaFlipLevel && (
          <div style={{ opacity: showFlip, transform: `translateY(${(1 - showFlip) * 20}px)` }}>
            <div style={{ position: 'absolute', left: 80, right: 80, top: toY(gFlip), height: 6, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
            <div style={{ position: 'absolute', left: 80, top: toY(gFlip) - 50, color: BRAND.purple, fontSize: 40, fontWeight: 800, fontFamily: TYPE.family }}>GAMMA FLIP</div>
          </div>
        )}

        {/* Put Floor (Secondary) */}
        <div style={{ opacity: showFloor, transform: `translateY(${(1 - showFloor) * 20}px)` }}>
          <div style={{ position: 'absolute', left: 80, right: 80, top: toY(pFloor), height: 8, background: BRAND.emerald, boxShadow: `0 0 40px ${BRAND.emerald}` }} />
          <div style={{ position: 'absolute', right: 80, top: toY(pFloor) + 20, color: BRAND.emerald, fontSize: 40, fontWeight: 800, fontFamily: TYPE.family }}>PUT FLOOR</div>
        </div>
      </div>

      {/* Trust Text */}
      <div style={{ position: 'absolute', top: 200, left: 80, right: 80, opacity: pullBack }}>
        <div style={{ color: BRAND.textSecondary, fontSize: 60, fontWeight: 800, fontFamily: TYPE.family, textShadow: SHADOW.caption }}>NOT A PREDICTION.</div>
        <div style={{ color: BRAND.cyan, fontSize: 76, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.cyan, marginTop: 10 }}>A PRESSURE MAP.</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 8.5–12.5s: Product Unlock
// ─────────────────────────────────────────────────────────────────────────────
const ProductUnlock: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Starts dim, then unlocks at 1.5s
  const isUnlock = frame > S(1.5);
  const click = spring({ frame: Math.max(0, frame - S(1.5)), fps, config: { damping: 12, stiffness: 400 } });
  
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz, background: BRAND.bgDeep, display: 'flex', flexDirection: 'column' }}>
      {isUnlock && <Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.6} />}

      {/* Top Half: Title switching */}
      <div style={{ flex: 0.3, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isUnlock ? `radial-gradient(ellipse at bottom, ${BRAND.cyan}20, transparent)` : 'transparent', transition: 'all 0.3s ease' }}>
        <div style={{ textAlign: 'center', transform: isUnlock ? `scale(${interpolate(click, [0, 1], [0.9, 1])})` : 'scale(1)' }}>
          <div style={{ color: isUnlock ? BRAND.text : BRAND.muted, fontSize: 40, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>
            {isUnlock ? 'SIGNUMHQ' : 'NORMAL CHART'}
          </div>
          <div style={{ color: isUnlock ? BRAND.cyan : BRAND.mutedLight, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: isUnlock ? SHADOW.cyan : 'none', marginTop: 10 }}>
            {isUnlock ? 'STRUCTURE LAYER' : 'PRICE ONLY'}
          </div>
        </div>
      </div>

      {/* Bottom Half: Chart rendering */}
      <div style={{ flex: 0.7, position: 'relative', borderTop: `2px solid ${isUnlock ? BRAND.cyan : BRAND.muted}`, transition: 'border-color 0.3s ease', overflow: 'hidden' }}>
        {/* Glow from border when unlocked */}
        {isUnlock && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200, background: `linear-gradient(180deg, ${BRAND.cyanGlow}, transparent)` }} />}

        {/* Dim Price Line (always there) */}
        <svg width="1080" height="400" viewBox="0 0 1080 400" style={{ position: 'absolute', top: 200, opacity: isUnlock ? 1 : 0.3, transition: 'opacity 0.3s ease' }}>
          <path d="M 0,200 C 200,150 400,250 600,100 C 800,-50 900,150 1080,50" stroke={BRAND.cyan} strokeWidth={isUnlock ? 6 : 4} fill="none" strokeLinecap="round" />
        </svg>

        {/* Structure appears magically when unlocked */}
        {isUnlock && (
          <div style={{ position: 'absolute', inset: 0, opacity: click }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 120, height: 8, background: BRAND.coral, boxShadow: `0 0 60px ${BRAND.coral}` }} />
            <div style={{ position: 'absolute', right: 80, top: 60, color: BRAND.coral, fontSize: 48, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.coral }}>CALL WALL</div>

            <div style={{ position: 'absolute', left: 0, right: 0, top: 380, height: 6, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
            <div style={{ position: 'absolute', left: 80, top: 330, color: BRAND.purple, fontSize: 40, fontWeight: 800, fontFamily: TYPE.family }}>GAMMA FLIP</div>
            
            <div style={{ position: 'absolute', left: 0, right: 0, top: 600, height: 8, background: BRAND.emerald, boxShadow: `0 0 40px ${BRAND.emerald}` }} />
            <div style={{ position: 'absolute', right: 80, top: 620, color: BRAND.emerald, fontSize: 40, fontWeight: 800, fontFamily: TYPE.family }}>PUT FLOOR</div>

            {/* Gap Highlight */}
            <div style={{ position: 'absolute', left: 800, top: 120, width: 8, height: 180, background: BRAND.amber, boxShadow: `0 0 30px ${BRAND.amberGlow}` }} />
            <div style={{ position: 'absolute', left: 840, top: 180, color: BRAND.amber, fontSize: 60, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber }}>1.3%</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 12.5–16.0s: Vocabulary Memory (Sequential Punch)
// ─────────────────────────────────────────────────────────────────────────────
const VocabularyMemory: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wallPop = spring({ frame, fps, config: { damping: 12, stiffness: 300 } });
  const floorPop = spring({ frame: Math.max(0, frame - S(1.0)), fps, config: { damping: 12, stiffness: 300 } });
  const flipPop = spring({ frame: Math.max(0, frame - S(2.0)), fps, config: { damping: 12, stiffness: 300 } });

  const items = [
    { label: 'WALL.', color: BRAND.coral, pop: wallPop, shadow: SHADOW.coral },
    { label: 'FLOOR.', color: BRAND.emerald, pop: floorPop, shadow: SHADOW.amber },
    { label: 'FLIP.', color: BRAND.purple, pop: flipPop, shadow: SHADOW.purple },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText, background: BRAND.bgDeep, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 60 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 40, opacity: item.pop, transform: `scale(${interpolate(item.pop, [0, 1], [0.8, 1])})` }}>
          {item.pop > 0 && item.pop < 1 && <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.4} />}
          <span style={{ color: item.color, fontSize: 130, fontWeight: 900, fontFamily: TYPE.family, textShadow: item.shadow, letterSpacing: '0.05em' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 16.0–20.0s: CTA — Natural Conclusion
// ─────────────────────────────────────────────────────────────────────────────
const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spring({ frame, fps, config: { damping: 14, stiffness: 220 } });
  
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText, background: BRAND.bgDeep, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.3} />

      {/* Central Logo - not tiny */}
      <div style={{ marginBottom: 60, opacity: r, transform: `scale(${interpolate(r, [0, 1], [0.8, 1])})` }}>
        <svg width="200" height="200" viewBox="246 247 530 530" fill="none">
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

      {/* Clean elegant button-like URL */}
      <div style={{ marginTop: 80, padding: '20px 60px', borderRadius: 40, border: `3px solid ${BRAND.cyan}`, background: `rgba(34,211,238,0.1)`, opacity: r, transform: `translateY(${(1 - r) * 50}px)`, boxShadow: `0 0 40px ${BRAND.cyanGlow}` }}>
        <span style={{ color: BRAND.text, fontSize: 56, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>SIGNUMHQ.COM</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Composition — 20s @ 30fps = 600 frames
// ─────────────────────────────────────────────────────────────────────────────
export const MarketPressureBriefV18: React.FC<MarketPressureBriefProps> = (props) => {
  const { structureVisual, disclaimer } = props;

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bgDeep }}>
      <CinematicBg />

      <Sequence from={0} durationInFrames={S(0.7)}><HardDataInterrupt data={structureVisual} /></Sequence>
      <Sequence from={S(0.7)} durationInFrames={S(1.8)}><InvisibleWallAppears data={structureVisual} /></Sequence>
      <Sequence from={S(2.5)} durationInFrames={S(3.0)}><PressureBuild data={structureVisual} /></Sequence>
      <Sequence from={S(5.5)} durationInFrames={S(3.0)}><MapTrustBeat data={structureVisual} /></Sequence>
      <Sequence from={S(8.5)} durationInFrames={S(4.0)}><ProductUnlock /></Sequence>
      <Sequence from={S(12.5)} durationInFrames={S(3.5)}><VocabularyMemory /></Sequence>
      <Sequence from={S(16.0)} durationInFrames={S(4.0)}><CTA /></Sequence>

      {/* Brand Bug removed to keep layout clean, replaced by strong ending CTA */}
      <ComplianceFooter text={disclaimer} />

      {/* Progress bar — constrained to absolute bottom to avoid overlapping content */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, background: 'rgba(255,255,255,0.05)', zIndex: Z.progress }}>
        <div style={{ height: '100%', width: `${(useCurrentFrame() / useVideoConfig().durationInFrames) * 100}%`, background: BRAND.gradientCyanPurple }} />
      </div>
    </AbsoluteFill>
  );
};
