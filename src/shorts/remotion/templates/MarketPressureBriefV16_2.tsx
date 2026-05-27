// ============================================================================
// MarketPressureBrief V16.2 — Visual Authority Fix Before Public Test
// Fixes: 17s text clipping, 5s clutter, product contrast unlock feel,
// hook polish, map readability. Audio: V16.1 (unchanged).
// ============================================================================

import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile, Audio } from 'remotion';
import type { ShortsVideoInput } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO } from '../brand/signumBrand';
import { ComplianceFooter } from '../components/ComplianceFooter';

export type MarketPressureBriefProps = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

const SCALE = {
  hero: 110,
  insight: 90,
  number: 130,
  support: 48,
  mapLabel: 42,
};

// ─────────────────────────────────────────────────────────────────────────────
// Procedural Background (No Replicate. Clean dark gradient with subtle grid.)
// ─────────────────────────────────────────────────────────────────────────────
const ProceduralAtmosphere: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      {/* Subtle grid pattern for depth, not decoration */}
      <svg width="1080" height="1920" style={{ position: 'absolute', inset: 0, opacity: 0.04 }}>
        {Array.from({ length: 40 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 48} x2="1080" y2={i * 48} stroke="#fff" strokeWidth="0.5" />
        ))}
        {Array.from({ length: 23 }, (_, i) => (
          <line key={`v${i}`} x1={i * 48} y1="0" x2={i * 48} y2="1920" stroke="#fff" strokeWidth="0.5" />
        ))}
      </svg>
      {/* Gradient overlays for cinematic depth */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to top, ${BRAND.bg} 0%, transparent 30%, transparent 70%, ${BRAND.bg} 100%)` }} />
      {/* Tension bed audio */}
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.12} />
      {/* Single unified voice track — freshly generated for V16.1 */}
      <Audio src={staticFile('shorts/audio/v16_1_voice.mp3')} volume={0.85} />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Brand Bug (top-left, subtle)
// ─────────────────────────────────────────────────────────────────────────────
const BrandBug: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [S(0), S(0.5), S(16.5), S(17.0)], [0, 0.8, 0.8, 0], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });

  return (
    <div style={{ position: 'absolute', top: 50, left: 50, zIndex: Z.brand, opacity }}>
      <svg width="36" height="36" viewBox="246 247 530 530" fill="none">
        <path d={SG_LOGO.upper} fill={BRAND.text} />
        <path d={SG_LOGO.lower} fill={BRAND.cyan} />
      </svg>
      <div style={{ color: BRAND.textSecondary, fontSize: 16, fontWeight: 700, fontFamily: TYPE.family, marginTop: 4, letterSpacing: '0.1em' }}>
        SIGNUMHQ
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Data Visualization Layer (persistent chart across phases)
// ─────────────────────────────────────────────────────────────────────────────
const DataVizLayer: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!data || !data.callWall || !data.putFloor) return null;
  const { price, callWall, putFloor, gammaFlipLevel } = data;

  const range = callWall - putFloor;
  const pad = range * 0.25;
  const vMin = putFloor - pad;
  const vMax = callWall + pad;
  const toY = (v: number) => 100 + (1 - (v - vMin) / (vMax - vMin)) * 700;

  const wallY = toY(callWall);
  let priceY = toY(price);

  // Phase flags
  const isHook = frame < S(2.2);
  const isFOMO = frame >= S(2.2) && frame < S(4.2);
  const isPressure = frame >= S(4.2) && frame < S(7.0);
  const isMap = frame >= S(7.0) && frame < S(10.2);
  const isPromise = frame >= S(15.0) && frame < S(18.0);
  const showViz = isHook || isFOMO || isPressure || isMap || isPromise;

  if (!showViz) return null;

  // Pressure squeeze
  if (isPressure) {
    const squeeze = interpolate(frame, [S(4.2), S(6.5)], [0, 0.45], { extrapolateRight: 'clamp' });
    priceY = toY(price) - (toY(price) - wallY) * squeeze;
  }

  const bracketGrow = spring({ frame, fps, config: { damping: 12, stiffness: 240 } });
  const bracketH = Math.max(0, priceY - wallY);
  const wallGlow = isPressure
    ? interpolate(frame, [S(4.2), S(6.5)], [0.4, 1.0], { extrapolateRight: 'clamp' })
    : isHook ? interpolate(bracketGrow, [0, 1], [0.2, 0.6]) : 0.4;
  const dotPulse = isPressure
    ? interpolate(Math.sin((frame - S(4.2)) * 0.4), [-1, 1], [1, 1.4])
    : 1;

  const translateY = (isMap || isPromise) ? 50 : 150;

  // Map assembly timing
  const mapReveal = isMap ? interpolate(frame, [S(7.0), S(7.8)], [0, 1], { extrapolateRight: 'clamp' }) : isPromise ? 1 : 0;

  return (
    <div style={{ position: 'absolute', top: 300, left: 0, width: 1080, height: 900, zIndex: Z.wallViz, transform: `translateY(${translateY}px)` }}>
      {/* Call Wall line + glow zone */}
      <div style={{ position: 'absolute', left: 60, right: 60, top: wallY - 200, height: 200, background: `linear-gradient(180deg, ${BRAND.coral}05 0%, ${BRAND.coral}15 100%)`, borderTop: `2px solid rgba(255,100,100,${wallGlow * 0.4})`, opacity: interpolate(frame, [S(0), S(0.3)], [0, 1], { extrapolateRight: 'clamp' }) }} />
      <div style={{ position: 'absolute', left: 60, right: 60, top: wallY - 4, height: 8, background: BRAND.coral, boxShadow: `0 0 ${wallGlow * 40}px rgba(255,100,100,${wallGlow})`, opacity: interpolate(frame, [S(0), S(0.3)], [0, 1], { extrapolateRight: 'clamp' }) }} />
      {/* Call Wall label */}
      {(isHook || isFOMO) && (
        <div style={{ position: 'absolute', right: 80, top: wallY - 50, opacity: interpolate(bracketGrow, [0.5, 1], [0, 0.7]) }}>
          <div style={{ color: BRAND.coral, fontSize: SCALE.mapLabel, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.05em' }}>CALL WALL</div>
        </div>
      )}
      {/* During Pressure phase: fade CALL WALL label to reduce clutter */}
      {isPressure && (
        <div style={{ position: 'absolute', right: 80, top: wallY - 50, opacity: 0.25 }}>
          <div style={{ color: BRAND.coral, fontSize: SCALE.mapLabel - 8, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.05em' }}>CALL WALL</div>
        </div>
      )}

      {/* Pressure gradient in gap */}
      {isPressure && (
        <div style={{ position: 'absolute', left: 100, right: 350, top: wallY + 4, height: Math.max(0, priceY - wallY - 4), background: `linear-gradient(180deg, ${BRAND.coral}60 0%, ${BRAND.cyan}20 80%, transparent 100%)`, borderLeft: `2px dashed ${BRAND.coral}50`, opacity: interpolate(frame, [S(4.2), S(5.5)], [0, 1], { extrapolateRight: 'clamp' }) }} />
      )}

      {/* Measurement bracket */}
      {(isHook || isFOMO || isPressure) && bracketGrow > 0 && (
        <div style={{ position: 'absolute', right: 330, top: wallY, height: bracketH, width: 20, borderRight: `8px solid ${BRAND.amber}`, borderTop: `8px solid ${BRAND.amber}`, borderBottom: `8px solid ${BRAND.amber}`, boxShadow: `inset -10px 0 20px ${BRAND.amberGlow}`, transformOrigin: 'top right', transform: `scaleY(${bracketGrow})` }} />
      )}

      {/* 1.3% hero label (hidden during Hook phase to avoid collision with hook text) */}
      {(isFOMO || isPressure) && bracketGrow > 0 && (
        <div style={{ position: 'absolute', right: 80, top: wallY + bracketH / 2 - 40, opacity: bracketGrow }}>
          <div style={{ color: BRAND.amber, fontSize: SCALE.number + 10, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber }}>1.3%</div>
        </div>
      )}

      {/* Price line + dot */}
      {(isHook || isFOMO || isPressure) && (
        <>
          <div style={{ position: 'absolute', left: 60, top: priceY - 2, height: 8, width: 600, background: BRAND.cyan, boxShadow: `0 0 20px ${BRAND.cyan}`, borderRadius: 4, opacity: isPressure ? 0.6 : isFOMO ? 0.3 : 1 }} />
          <div style={{ position: 'absolute', left: 644, top: priceY - 16, width: 32, height: 32, borderRadius: '50%', background: BRAND.text, border: `6px solid ${BRAND.cyan}`, boxShadow: `0 0 20px ${BRAND.cyan}`, opacity: isPressure ? 1 : isFOMO ? 0.3 : 1, transform: `scale(${dotPulse})` }} />
        </>
      )}

      {/* FIX 02: SPY Price label REMOVED during Pressure phase to eliminate clutter.
          1.3% is the only hero. No competing text. */}

      {/* Full map assembly (Phase 4 + Phase 6) */}
      {(isMap || isPromise) && mapReveal > 0 && (
        <div style={{ opacity: mapReveal }}>
          {/* Put Floor — FIX 05: larger labels for readability */}
          <div style={{ position: 'absolute', left: 60, right: 300, top: toY(putFloor) - 2, height: 6, background: BRAND.emerald, boxShadow: `0 0 20px ${BRAND.emerald}` }} />
          <div style={{ position: 'absolute', right: 80, top: toY(putFloor) + 10, textAlign: 'right' }}>
            <div style={{ color: BRAND.emerald, fontSize: SCALE.mapLabel + 4, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>PUT FLOOR</div>
            <div style={{ color: BRAND.text, fontSize: SCALE.mapLabel + 14, fontWeight: 900, fontFamily: TYPE.family }}>${putFloor}</div>
          </div>
          {/* Gamma Flip */}
          {gammaFlipLevel && (
            <>
              {/* FIX 05: wider dashed line + larger labels */}
              <div style={{ position: 'absolute', left: 60, top: toY(gammaFlipLevel), width: 550, height: 6, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
              <div style={{ position: 'absolute', left: 80, top: toY(gammaFlipLevel) - 70, textAlign: 'left' }}>
                <div style={{ color: BRAND.purple, fontSize: SCALE.mapLabel + 4, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>GAMMA FLIP</div>
                <div style={{ color: BRAND.text, fontSize: SCALE.mapLabel + 14, fontWeight: 900, fontFamily: TYPE.family }}>${gammaFlipLevel}</div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 0.0 – 2.2s: Hard Data Hook
// ─────────────────────────────────────────────────────────────────────────────
const HardDataHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slam = spring({ frame, fps, config: { damping: 12, stiffness: 400, mass: 0.4 } });

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText }}>
      {/* Voice is at composition level (v16_1_voice.mp3). Only SFX here. */}
      <Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.4} />
      {/* FIX 04: moved to 800px, added left/right 72px safe margins for hook polish */}
      <div style={{ position: 'absolute', top: 800, left: 72, right: 72, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center', transform: `scale(${interpolate(slam, [0, 1], [1.3, 1])})` }}>
        <div style={{ color: '#ffffff', fontSize: SCALE.hero - 10, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.05em', textShadow: SHADOW.hero, lineHeight: 1.0, opacity: slam }}>
          SPY IS
        </div>
        <div style={{ color: BRAND.amber, fontSize: SCALE.number, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.amber, lineHeight: 1.0, opacity: slam, marginBottom: 10 }}>
          1.3% <span style={{ fontSize: SCALE.hero - 10, color: '#fff', textShadow: SHADOW.hero }}>BELOW</span>
        </div>
        <div style={{ color: BRAND.coral, fontSize: SCALE.hero - 25, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.04em', textShadow: SHADOW.coral, lineHeight: 1.1, opacity: slam }}>
          A HIDDEN<br/>CALL WALL
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2.2 – 4.2s: Missing Layer FOMO
// ─────────────────────────────────────────────────────────────────────────────
const MissingLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 220 } });

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: pop, zIndex: Z.hookText }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.2} />
      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ color: BRAND.text, fontSize: SCALE.insight, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero, transform: `translateY(${(1 - pop) * 20}px)` }}>
          MOST CHARTS
        </div>
        <div style={{ color: BRAND.cyan, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.cyan, marginTop: 10, transform: `translateY(${(1 - pop) * 30}px)` }}>
          MISS THIS LAYER
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4.2 – 7.0s: Pressure Build
// ─────────────────────────────────────────────────────────────────────────────
const PressureBuild: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 220 } });

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: pop, zIndex: Z.hookText }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.25} />
      <Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.3} />
      <div style={{ position: 'absolute', top: 250, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ color: BRAND.text, fontSize: SCALE.insight - 10, fontWeight: 800, fontFamily: TYPE.family, textShadow: SHADOW.hero, transform: `scale(${interpolate(pop, [0, 1], [0.9, 1])})` }}>
          PRESSURE CAN
        </div>
        <div style={{ color: BRAND.coral, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.coral, marginTop: 10, transform: `scale(${interpolate(pop, [0, 1], [0.95, 1])})` }}>
          BUILD HERE
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 7.0 – 10.2s: Pressure Map
// ─────────────────────────────────────────────────────────────────────────────
const PressureMap: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 220 } });

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: pop, zIndex: Z.hookText }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.2} />
      <div style={{ position: 'absolute', top: 250, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ color: BRAND.textSecondary, fontSize: SCALE.insight - 10, fontWeight: 800, fontFamily: TYPE.family, textShadow: SHADOW.caption, transform: `translateY(${(1 - pop) * 20}px)` }}>
          NOT A PREDICTION.
        </div>
        <div style={{ color: BRAND.purple, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.purple, marginTop: 10, transform: `translateY(${(1 - pop) * 30}px)` }}>
          A PRESSURE MAP.
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 10.2 – 15.0s: Product Contrast Unlock (MOST IMPORTANT BUSINESS FRAME)
// ─────────────────────────────────────────────────────────────────────────────
const ProductContrast: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame, fps, config: { damping: 12, stiffness: 280, mass: 0.6 } });

  // FIX 03: Scanner line animation — system unlock feel
  const scannerX = interpolate(frame, [S(0.3), S(1.8)], [-200, 1200], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  const scannerOpacity = interpolate(frame, [S(0.3), S(0.5), S(1.5), S(1.8)], [0, 0.8, 0.8, 0], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  // Cyan system glow pulse on the bottom half
  const glowPulse = interpolate(frame, [S(0.8), S(1.2), S(2.0), S(2.5)], [0, 0.5, 0.3, 0.15], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  // Badge border pulse
  const badgePulse = interpolate(Math.sin(frame * 0.15), [-1, 1], [0.4, 1.0]);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz + 10, background: BRAND.bg }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.4} />

      {/* TOP HALF: Normal Chart (dim, bare, insufficient) */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: '#0a0d14', borderBottom: `2px dashed ${BRAND.mutedLight}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: reveal }}>
        <div style={{ color: BRAND.muted, fontSize: SCALE.support, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>NORMAL CHART</div>
        <div style={{ color: BRAND.mutedLight, fontSize: SCALE.insight - 10, fontWeight: 900, fontFamily: TYPE.family, marginTop: 10 }}>PRICE ONLY</div>
        <svg width="600" height="150" viewBox="0 0 600 150" style={{ marginTop: 60, opacity: 0.5 }}>
          <path d="M 0,100 C 100,80 150,120 220,70 C 300,20 350,60 440,40 C 520,25 580,50 600,20" stroke={BRAND.mutedLight} strokeWidth={4} fill="none" strokeLinecap="round" />
        </svg>
      </div>

      {/* FIX 03: Scanner line — sweeps across during reveal */}
      <div style={{ position: 'absolute', top: '50%', left: scannerX, width: 4, height: '50%', background: `linear-gradient(180deg, transparent 0%, ${BRAND.cyan} 30%, ${BRAND.cyan} 70%, transparent 100%)`, boxShadow: `0 0 30px ${BRAND.cyan}, 0 0 60px ${BRAND.cyan}40`, opacity: scannerOpacity, zIndex: 20 }} />

      {/* BOTTOM HALF: SignumHQ Layer — FIX 03: system unlock feel */}
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '50%', background: `radial-gradient(circle at center, ${BRAND.cyan}25 0%, ${BRAND.bg} 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: interpolate(reveal, [0.5, 1], [0, 1]), transform: `translateY(${interpolate(reveal, [0, 1], [200, 0])}px)` }}>
        {/* Cyan system glow overlay */}
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 40%, ${BRAND.cyan}${Math.round(glowPulse * 30).toString(16).padStart(2, '0')} 0%, transparent 70%)`, pointerEvents: 'none' }} />

        {/* Call Wall */}
        <div style={{ position: 'absolute', top: 120, left: 80, right: 80, height: 8, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
        <div style={{ position: 'absolute', top: 70, right: 80, color: BRAND.coral, fontSize: SCALE.mapLabel + 4, fontWeight: 900, fontFamily: TYPE.family }}>CALL WALL $600</div>

        {/* Gamma Flip */}
        <div style={{ position: 'absolute', top: 220, left: 80, right: 180, height: 6, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
        <div style={{ position: 'absolute', top: 170, left: 80, color: BRAND.purple, fontSize: SCALE.mapLabel + 4, fontWeight: 900, fontFamily: TYPE.family }}>GAMMA FLIP $588</div>

        {/* Put Floor */}
        <div style={{ position: 'absolute', top: 320, left: 80, right: 80, height: 8, background: BRAND.emerald, boxShadow: `0 0 40px ${BRAND.emerald}` }} />
        <div style={{ position: 'absolute', top: 340, right: 80, color: BRAND.emerald, fontSize: SCALE.mapLabel + 4, fontWeight: 900, fontFamily: TYPE.family }}>PUT FLOOR $580</div>

        {/* SignumHQ Layer badge — FIX 03: pulsing border for unlock feel */}
        <div style={{ zIndex: 10, textAlign: 'center', marginTop: 150, background: 'rgba(5,10,20,0.95)', padding: '20px 60px', borderRadius: 20, border: `2px solid rgba(0,200,255,${badgePulse})`, boxShadow: `0 0 ${50 * badgePulse}px ${BRAND.cyan}40, inset 0 0 ${20 * badgePulse}px ${BRAND.cyan}10` }}>
          <div style={{ color: BRAND.cyan, fontSize: SCALE.support, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>SIGNUMHQ LAYER</div>
          <div style={{ color: '#ffffff', fontSize: SCALE.insight - 10, fontWeight: 900, fontFamily: TYPE.family, marginTop: 10 }}>WALL / FLOOR / FLIP</div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 15.0 – 18.0s: Product Promise
// ─────────────────────────────────────────────────────────────────────────────
const ProductPromise: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 220 } });

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: pop, zIndex: Z.hookText }}>
      <div style={{ position: 'absolute', top: 300, left: 72, right: 72, textAlign: 'center' }}>
        <div style={{ color: BRAND.text, fontSize: SCALE.insight - 5, fontWeight: 800, fontFamily: TYPE.family, textShadow: SHADOW.hero, transform: `translateY(${(1 - pop) * 20}px)` }}>
          SEE THE STRUCTURE
        </div>
        <div style={{ color: BRAND.cyan, fontSize: SCALE.insight - 5, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.cyan, marginTop: 10, transform: `translateY(${(1 - pop) * 30}px)` }}>
          BEHIND PRICE
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 18.0 – 20.5s: CTA
// ─────────────────────────────────────────────────────────────────────────────
const BrandCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spring({ frame, fps, config: { damping: 14, stiffness: 240 } });
  const scan = interpolate(frame % S(1.5), [0, S(1.5)], [-150, 400]);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: r, zIndex: Z.hookText }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.2} />

      <div style={{ marginBottom: 60, transform: `scale(${interpolate(r, [0, 1], [0.8, 1])})` }}>
        <svg width="180" height="180" viewBox="246 247 530 530" fill="none">
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.cyan} />
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 60, transform: `translateY(${(1 - r) * 20}px)` }}>
        <span style={{ color: BRAND.text, fontSize: 100, fontWeight: 900, letterSpacing: '0.18em', fontFamily: TYPE.family }}>SIGNUM</span>
        <span style={{ color: BRAND.cyan, fontSize: 100, fontWeight: 900, letterSpacing: '0.18em', fontFamily: TYPE.family, textShadow: SHADOW.cyan }}>HQ</span>
      </div>
      <div style={{ width: 300, height: 6, marginBottom: 60, background: BRAND.gradientCyanPurple, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: scan, width: 60, background: 'linear-gradient(90deg, transparent, #fff, transparent)' }} />
      </div>
      <div style={{ color: BRAND.text, fontSize: SCALE.insight - 30, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero, transform: `translateY(${(1 - r) * 30}px)` }}>
        SEE THE HIDDEN LAYER.
      </div>
      <div style={{ marginTop: 50, color: BRAND.cyan, fontSize: SCALE.support + 10, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em', textShadow: SHADOW.cyan, transform: `translateY(${(1 - r) * 40}px)` }}>
        SIGNUMHQ.COM
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Composition
// ─────────────────────────────────────────────────────────────────────────────
export const MarketPressureBriefV16_2: React.FC<MarketPressureBriefProps> = (props) => {
  const { structureVisual, disclaimer } = props;

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <ProceduralAtmosphere />
      {structureVisual && <DataVizLayer data={structureVisual} />}

      <Sequence from={0} durationInFrames={S(2.2)}><HardDataHook /></Sequence>
      <Sequence from={S(2.2)} durationInFrames={S(2.0)}><MissingLayer /></Sequence>
      <Sequence from={S(4.2)} durationInFrames={S(2.8)}><PressureBuild /></Sequence>
      <Sequence from={S(7.0)} durationInFrames={S(3.2)}><PressureMap /></Sequence>
      <Sequence from={S(10.2)} durationInFrames={S(4.8)}><ProductContrast /></Sequence>
      <Sequence from={S(15.0)} durationInFrames={S(3.0)}><ProductPromise /></Sequence>
      <Sequence from={S(18.0)} durationInFrames={S(2.5)}><BrandCTA /></Sequence>

      <BrandBug />
      <ComplianceFooter text={disclaimer} />

      {/* Progress bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, background: 'rgba(255,255,255,0.05)', zIndex: Z.progress }}>
        <div style={{ height: '100%', width: `${(useCurrentFrame() / useVideoConfig().durationInFrames) * 100}%`, background: BRAND.gradientCyanPurple }} />
      </div>
    </AbsoluteFill>
  );
};
