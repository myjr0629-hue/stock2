// ============================================================================
// MarketPressureBrief V9A — 22s Cutdown
// ============================================================================

import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile, Img } from 'remotion';
import type { ShortsVideoInput } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO } from '../brand/signumBrand';

import { BrandBug } from '../components/BrandBug';
import { ComplianceFooter } from '../components/ComplianceFooter';
import { CaptionOverlay } from '../components/CaptionOverlay';

export type MarketPressureBriefProps = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

// Type scale for V9A
const SCALE = {
  hook: 110,
  insight: 84,
  number: 110,
  label: 42,
  disclaimer: 22,
};

// ---------------------------------------------------------------------------
// 0.0-2.0s: Hook / Visual Shock
// ---------------------------------------------------------------------------
const HookTextV9: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exit = interpolate(frame, [S(1.6), S(2.0)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flash = interpolate(frame, [0, S(0.3)], [1, 0], { extrapolateRight: 'clamp' });
  const scanX = interpolate(frame, [0, S(2.0)], [-200, 1200]);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: exit, zIndex: Z.hookText }}>
      <div style={{ position: 'absolute', inset: 0, background: BRAND.cyan, opacity: flash * 0.15, mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: scanX, width: 80, background: `linear-gradient(90deg, transparent, ${BRAND.cyan}30, transparent)`, transform: 'skewX(-20deg)' }} />

      {['THE WALL', 'IS NOT ON', 'YOUR CHART'].map((line, i) => {
        const r = spring({ frame: Math.max(0, frame - i * 1.0), fps, config: { damping: 14, stiffness: 250, mass: 0.4 } });
        const isCyan = line === 'THE WALL';
        const isFocus = line === 'YOUR CHART';
        return (
          <div key={i} style={{
            color: isCyan ? BRAND.cyan : (isFocus ? '#ffffff' : '#f1f5f9'),
            fontSize: SCALE.hook,
            fontWeight: isFocus ? 900 : 800,
            fontFamily: TYPE.family, letterSpacing: '-0.02em',
            lineHeight: 1.1, textAlign: 'center',
            opacity: isFocus ? r : r * 0.95,
            transform: `scale(${interpolate(r, [0, 1], [0.92, 1])})`,
            textShadow: isCyan ? SHADOW.cyan : SHADOW.hero,
          }}>
            {line}
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2.0-5.0s: Concrete Payoff
// ---------------------------------------------------------------------------
const ConcretePayoffV9: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spring({ frame: Math.max(0, frame - S(0.2)), fps, config: { damping: 16, stiffness: 180, mass: 0.4 } });
  const pulse = interpolate(frame % S(1.5), [0, S(0.3), S(1.5)], [0, 1, 0]);
  const exit = interpolate(frame, [S(2.6), S(3.0)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }); 

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: Math.min(r, exit), zIndex: Z.hookText, marginTop: -200 }}>
      <div style={{ color: BRAND.text, fontSize: SCALE.insight - 10, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.01em', textShadow: SHADOW.hero, transform: `translateY(${(1 - r) * 15}px)` }}>SPY IS <span style={{color: BRAND.amber, fontSize: SCALE.number}}>1.3%</span></div>
      <div style={{ color: BRAND.textSecondary, fontSize: SCALE.label, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.04em', textShadow: SHADOW.caption, transform: `translateY(${(1 - r) * 18}px)` }}>BELOW A HIDDEN</div>
      <div style={{ color: BRAND.coral, fontSize: SCALE.insight + 10, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.02em', textShadow: SHADOW.coral, marginTop: -5, transform: `translateY(${(1 - r) * 22}px) scale(${1 + pulse * 0.05})`, filter: `brightness(${1 + pulse * 0.5})` }}>CALL WALL</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 5.0-9.0s: Why Care
// ---------------------------------------------------------------------------
const WhyCareTextV9: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r1 = spring({ frame: Math.max(0, frame - S(0.2)), fps, config: { damping: 20, stiffness: 120, mass: 0.6 } });
  const r2 = spring({ frame: Math.max(0, frame - S(1.0)), fps, config: { damping: 20, stiffness: 120, mass: 0.6 } });
  const exit = interpolate(frame, [S(3.6), S(4.0)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: exit, zIndex: Z.hookText, marginTop: 200 }}>
      <div style={{ color: BRAND.text, fontSize: SCALE.insight - 20, fontWeight: 800, fontFamily: TYPE.family, opacity: r1, textShadow: SHADOW.caption, transform: `translateY(${(1 - r1) * 15}px)` }}>THIS IS WHERE</div>
      <div style={{ color: BRAND.coral, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', opacity: r2, textShadow: SHADOW.coral, transform: `translateY(${(1 - r2) * 15}px)` }}>PRESSURE MAY CLUSTER.</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 9.0-13.0s: Pressure Map Reveal
// ---------------------------------------------------------------------------
const MeaningTextV9: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r1 = spring({ frame: Math.max(0, frame - S(0.2)), fps, config: { damping: 20, stiffness: 120, mass: 0.6 } });
  const r2 = spring({ frame: Math.max(0, frame - S(1.0)), fps, config: { damping: 20, stiffness: 120, mass: 0.6 } });
  const exit = interpolate(frame, [S(3.6), S(4.0)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: exit, zIndex: Z.hookText, marginTop: -250 }}>
      <div style={{ color: BRAND.textSecondary, fontSize: SCALE.insight - 30, fontWeight: 800, fontFamily: TYPE.family, opacity: r1, textShadow: SHADOW.caption, transform: `translateY(${(1 - r1) * 15}px)` }}>NOT A PREDICTION.</div>
      <div style={{ color: BRAND.purple, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', opacity: r2, textShadow: SHADOW.purple, transform: `translateY(${(1 - r2) * 15}px)` }}>A PRESSURE MAP.</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 13.0-18.0s: Product Value Transformation
// ---------------------------------------------------------------------------
const ProductNeedV9: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 22, stiffness: 100, mass: 0.7 } });
  
  // The toggle switches AT 2.0 SECONDS (frame 60)
  const toggleProgress = spring({ frame: Math.max(0, frame - S(2.0)), fps, config: { damping: 14, stiffness: 180 } });
  const exit = interpolate(frame, [S(4.6), S(5.0)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const isHiddenLayerOn = toggleProgress > 0.5;

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: Math.min(enter, exit), zIndex: Z.wallViz }}>
      
      {/* Central Visual Area */}
      <div style={{ position: 'absolute', top: 300, left: 100, right: 100, height: 500 }}>
        
        {/* Environment Shift */}
        <div style={{ position: 'absolute', inset: -150, background: BRAND.cyan, opacity: toggleProgress * 0.05, mixBlendMode: 'screen', filter: 'blur(50px)' }} />

        {/* Normal Chart (Visible before toggle, fades out completely) */}
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - toggleProgress }}>
          <svg width="880" height="300" viewBox="0 0 880 300" style={{ position: 'absolute', top: 50 }}>
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BRAND.muted} stopOpacity={0.5} />
                <stop offset="100%" stopColor={BRAND.muted} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d="M 0,200 C 100,180 150,220 220,170 C 300,120 350,160 440,140 C 520,125 580,150 660,120 C 720,100 780,130 880,90"
              stroke={BRAND.mutedLight} strokeWidth={4} fill="none" strokeLinecap="round" />
            <path d="M 0,200 C 100,180 150,220 220,170 C 300,120 350,160 440,140 C 520,125 580,150 660,120 C 720,100 780,130 880,90 L 880,300 L 0,300 Z"
              fill="url(#chartGradient)" />
          </svg>
          <div style={{ position: 'absolute', top: 380, left: 0, right: 0, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ color: BRAND.muted, fontSize: SCALE.label, fontFamily: TYPE.family, fontWeight: 700, letterSpacing: '0.1em' }}>NORMAL CHART</span>
            <span style={{ color: BRAND.text, fontSize: SCALE.insight - 20, fontFamily: TYPE.family, fontWeight: 900, opacity: 0.8 }}>PRICE ONLY</span>
          </div>
        </div>

        {/* Hidden Layer (Visible after toggle) with staggered reveal */}
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ opacity: interpolate(toggleProgress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }) }}>
            <div style={{ position: 'absolute', top: 110, left: 0, right: 0, height: 6, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
            <div style={{ position: 'absolute', top: 50, right: 0, color: BRAND.coral, fontSize: SCALE.label + 10, fontWeight: 900, fontFamily: TYPE.family }}>CALL WALL $600</div>
          </div>
          <div style={{ opacity: interpolate(toggleProgress, [0.4, 0.8], [0, 1], { extrapolateRight: 'clamp' }) }}>
            <div style={{ position: 'absolute', top: 280, left: 0, right: 0, height: 4, background: BRAND.emerald }} />
            <div style={{ position: 'absolute', top: 295, right: 0, color: BRAND.emerald, fontSize: SCALE.label, fontWeight: 800, fontFamily: TYPE.family }}>PUT FLOOR $580</div>
          </div>
          <div style={{ opacity: interpolate(toggleProgress, [0.7, 1.0], [0, 1], { extrapolateRight: 'clamp' }) }}>
            <div style={{ position: 'absolute', top: 200, left: 0, right: 0, height: 4, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 16px, transparent 16px, transparent 32px)` }} />
            <div style={{ position: 'absolute', top: 155, left: 0, color: BRAND.purple, fontSize: SCALE.label, fontWeight: 800, fontFamily: TYPE.family }}>GAMMA FLIP $588</div>
          </div>
          <div style={{ position: 'absolute', top: 380, left: 0, right: 0, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 5, opacity: toggleProgress }}>
            <span style={{ color: BRAND.cyan, fontSize: SCALE.label, fontFamily: TYPE.family, fontWeight: 900, letterSpacing: '0.1em' }}>SIGNUMHQ LAYER</span>
            <span style={{ color: BRAND.text, fontSize: SCALE.insight - 20, fontFamily: TYPE.family, fontWeight: 900 }}>WALL / FLOOR / FLIP</span>
          </div>
        </div>

        {/* Toggle Switch */}
        <div style={{ position: 'absolute', top: 520, left: '50%', transform: 'translateX(-50%) scale(1.6)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 60, height: 32, borderRadius: 16, background: isHiddenLayerOn ? BRAND.cyan : BRAND.muted, border: `2px solid ${isHiddenLayerOn ? BRAND.cyan : BRAND.mutedLight}`, transition: 'all 0.2s', position: 'relative', boxShadow: isHiddenLayerOn ? `0 0 20px ${BRAND.cyanGlow}` : 'none' }}>
            <div style={{ position: 'absolute', top: 2, left: isHiddenLayerOn ? 30 : 2, width: 24, height: 24, borderRadius: '50%', background: BRAND.text, transition: 'all 0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 18.0-22.0s: Brand CTA (4.0s)
// ---------------------------------------------------------------------------
const BrandCTAV9: React.FC<{ cta: string }> = ({ cta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spring({ frame, fps, config: { damping: 18, stiffness: 140, mass: 0.6 } });
  const pulsePos = interpolate(frame % S(2), [0, S(2)], [-150, 500]);
  const exit = interpolate(frame, [S(3.6), S(4.0)], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: Math.min(r, exit), zIndex: Z.hookText }}>
      <div style={{ marginBottom: 50, transform: `scale(${interpolate(r, [0, 1], [0.8, 1])})` }}>
        <svg width="140" height="140" viewBox="246 247 530 530" fill="none">
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.text} />
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 50, transform: `translateY(${(1 - r) * 15}px)` }}>
        <span style={{ color: BRAND.text, fontSize: 80, fontWeight: 900, letterSpacing: '0.18em', fontFamily: TYPE.family }}>SIGNUM</span>
        <span style={{ color: BRAND.cyan, fontSize: 80, fontWeight: 900, letterSpacing: '0.18em', fontFamily: TYPE.family, textShadow: SHADOW.cyan }}>HQ</span>
      </div>
      <div style={{ width: 250, height: 5, marginBottom: 50, background: BRAND.gradientCyanPurple, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: pulsePos, width: 100, background: 'linear-gradient(90deg, transparent, #fff, transparent)', boxShadow: '0 0 20px #fff' }} />
      </div>
      <div style={{ color: BRAND.text, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, textAlign: 'center', letterSpacing: '-0.01em', textShadow: SHADOW.hero, transform: `translateY(${(1 - r) * 20}px)` }}>{cta}</div>
      <div style={{ marginTop: 40, color: BRAND.cyan, fontSize: SCALE.label + 10, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em', transform: `translateY(${(1 - r) * 25}px)`, textShadow: SHADOW.cyan }}>SIGNUMHQ.COM</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DYNAMIC WALL LEVEL VIZ (Camera Pan & Zoom)
// Covers 0.0 - 13.0s (Hook -> Map Assembly)
// ---------------------------------------------------------------------------
const DynamicWallLevelViz: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!data.callWall || !data.putFloor) return null;
  const { price, callWall, putFloor, gammaFlipLevel } = data;

  const range = callWall - putFloor;
  const pad = range * 0.25;
  const vMin = putFloor - pad;
  const vMax = callWall + pad;
  const toY = (v: number) => 100 + (1 - (v - vMin) / (vMax - vMin)) * 700;

  // Global Animations
  const wallGrow = interpolate(frame, [0, S(2.0)], [0, 1], { extrapolateRight: 'clamp' });
  const priceReveal = interpolate(frame, [S(1.0), S(2.0)], [0, 1], { extrapolateRight: 'clamp' });

  // 5.0s - 9.0s: Pressure Compression
  const approach = interpolate(frame, [S(5.0), S(9.0)], [0, 0.7], { extrapolateRight: 'clamp' });
  const priceY = toY(price) + (toY(callWall) - toY(price)) * approach * 0.35;
  const pressure = interpolate(approach, [0, 0.7], [0, 1], { extrapolateRight: 'clamp' });
  
  const wallY = toY(callWall);
  const floorY = toY(putFloor);
  const flipY = gammaFlipLevel ? toY(gammaFlipLevel) : null;

  // Bracket
  const bracketGrow = spring({ frame: Math.max(0, frame - S(2.5)), fps, config: { damping: 18, stiffness: 120 } });
  const bracketH = Math.max(0, priceY - wallY);

  // 9.0s: Map Assembly
  const mapFrame = Math.max(0, frame - S(9.0));
  const showMap = mapFrame > 0;

  // Camera Pan/Zoom based on layout zones (preventing text overlap)
  // For 2.0 - 5.0s, we want the data pushed down so top text has room.
  const panY = interpolate(frame, [0, S(2.0)], [0, 150], { extrapolateRight: 'clamp' });
  const zoomScale = interpolate(frame, [S(5.0), S(13.0)], [1, 1.15], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', top: 300, left: 0, width: 1080, height: 900, zIndex: Z.wallViz,
      transform: `scale(${zoomScale}) translateY(${panY}px)`, transformOrigin: 'center center'
    }}>
      
      {/* ── GLASS WALL BARRIER ── */}
      <div style={{
        position: 'absolute', left: 60, right: 60, top: wallY - 200, height: 200,
        background: `linear-gradient(180deg, ${BRAND.coral}05 0%, ${BRAND.coral}18 70%, ${BRAND.coral}35 100%)`,
        borderTop: `1px solid ${BRAND.coral}30`,
        borderLeft: `2px solid ${BRAND.coral}50`,
        borderRight: `2px solid ${BRAND.coral}50`,
        opacity: wallGrow,
        backdropFilter: 'blur(12px)',
      }} />

      {/* Wall line */}
      <div style={{
        position: 'absolute', left: 60, right: 60, top: wallY - 4, height: 8,
        background: BRAND.coral,
        boxShadow: `0 0 50px ${BRAND.coral}, 0 0 100px ${BRAND.coral}80`,
        opacity: wallGrow,
      }} />

      {/* ── INTENSE PRESSURE ZONE ── */}
      <div style={{
        position: 'absolute', left: 100, right: 350,
        top: wallY + 4, height: Math.max(0, priceY - wallY - 4),
        background: `linear-gradient(180deg, ${BRAND.coral}35 0%, ${BRAND.cyan}15 50%, transparent 100%)`,
        opacity: pressure,
        borderLeft: `2px dashed ${BRAND.coral}50`,
      }} />

      {/* ── MEASUREMENT BRACKET ── */}
      {bracketGrow > 0.01 && (
        <div style={{
          position: 'absolute', right: 330, top: wallY, height: bracketH, width: 20,
          borderRight: `4px solid ${BRAND.amber}`,
          borderTop: `4px solid ${BRAND.amber}`,
          borderBottom: `4px solid ${BRAND.amber}`,
          opacity: bracketGrow * (0.6 + pressure * 0.4),
          boxShadow: `inset -10px 0 20px ${BRAND.amberGlow}`,
          transformOrigin: 'top right',
          transform: `scaleY(${bracketGrow})`
        }} />
      )}

      {/* ── CURRENT PRICE ── */}
      <div style={{
        position: 'absolute', left: 60, top: priceY - 2, height: 8, width: 600 * priceReveal,
        background: BRAND.cyan, boxShadow: `0 0 40px ${BRAND.cyan}, 0 0 80px ${BRAND.cyanGlow}`,
        borderRadius: 4, opacity: priceReveal,
      }} />
      
      <div style={{
        position: 'absolute', left: 60 + 600 * priceReveal - 16, top: priceY - 16,
        width: 32, height: 32, borderRadius: '50%', background: BRAND.text, border: `6px solid ${BRAND.cyan}`,
        boxShadow: `0 0 35px ${BRAND.cyan}, 0 0 90px ${BRAND.cyanGlow}`, opacity: priceReveal,
      }} />

      {/* Price Label */}
      <div style={{
        position: 'absolute', left: 60 + 600 * priceReveal + 40, top: priceY + 5,
        opacity: priceReveal,
      }}>
        <div style={{ color: BRAND.text, fontSize: SCALE.label, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em', opacity: 0.9 }}>SPY PRICE</div>
        <div style={{ color: BRAND.cyan, fontSize: SCALE.label + 12, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.cyan, letterSpacing: '-0.02em', marginTop: -4 }}>
          ${price.toFixed(2)}
        </div>
      </div>

      {/* ── 9.0s: SECONDARY MAP ASSEMBLY ── */}
      {showMap && (
        <div style={{ opacity: interpolate(mapFrame, [0, S(1.0)], [0, 1], { extrapolateRight: 'clamp' }) }}>
          {/* Put Floor */}
          <div style={{
            position: 'absolute', left: 60, right: 300, top: floorY - 2, height: 4,
            background: `linear-gradient(90deg, ${BRAND.emerald}90 0%, transparent 100%)`,
            opacity: interpolate(mapFrame, [S(1.0), S(2.0)], [0, 1], { extrapolateRight: 'clamp' })
          }} />
          <div style={{ 
            position: 'absolute', right: 80, top: floorY + 8,
            opacity: interpolate(mapFrame, [S(1.0), S(2.0)], [0, 1], { extrapolateRight: 'clamp' })
          }}>
            <div style={{ color: BRAND.emerald, fontSize: SCALE.label, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em', textAlign: 'right' }}>PUT FLOOR</div>
            <div style={{ color: BRAND.text, fontSize: SCALE.label + 10, fontWeight: 900, fontFamily: TYPE.family, textAlign: 'right', opacity: 0.95 }}>${putFloor}</div>
          </div>

          {/* Gamma Flip */}
          {flipY !== null && gammaFlipLevel && (
            <div style={{
              opacity: interpolate(mapFrame, [S(0.5), S(1.5)], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `translateX(${interpolate(mapFrame, [S(0.5), S(1.5)], [-50, 0], { extrapolateRight: 'clamp' })}px)`
            }}>
              <div style={{
                position: 'absolute', left: 60, top: flipY, width: 450, height: 4,
                background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 16px, transparent 16px, transparent 32px)`,
                opacity: 0.85,
              }} />
              <div style={{ position: 'absolute', left: 100, top: flipY - 45 }}>
                <span style={{ color: BRAND.purple, fontSize: SCALE.label, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>GAMMA FLIP</span>
                <span style={{ color: BRAND.text, fontSize: SCALE.label + 10, fontWeight: 900, fontFamily: TYPE.family, marginLeft: 12 }}>${gammaFlipLevel}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};


// ---------------------------------------------------------------------------
// BACKGROUND LAYER CONTROLLER
// ---------------------------------------------------------------------------
const DynamicAtmosphere: React.FC = () => {
  const frame = useCurrentFrame();

  const env1 = interpolate(frame, [S(0), S(5.0)], [1, 0.3], { extrapolateRight: 'clamp' }); // Hook Wall
  const env2 = interpolate(frame, [S(4.5), S(5.5), S(12.5), S(13.5)], [0, 0.8, 0.8, 0], { extrapolateRight: 'clamp' }); // Pressure Compression

  const zoomInOut = interpolate(frame, [0, S(22)], [1, 1.15]); 

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', backgroundColor: BRAND.bg }}>
      <div style={{ position: 'absolute', inset: -50, transform: `scale(${zoomInOut})` }}>
        
        {/* Hook Environment */}
        <div style={{ position: 'absolute', inset: 0, opacity: env1 }}>
          <Img src={staticFile('shorts/broll/hook_v9a.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} />
        </div>

        {/* Pressure Environment */}
        <div style={{ position: 'absolute', inset: 0, opacity: env2 }}>
          <Img src={staticFile('shorts/broll/pressure_v9a.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }} />
        </div>

        {/* Global Dark Gradient to ensure text readability */}
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to top, ${BRAND.bg} 0%, ${BRAND.bg} 15%, transparent 50%, ${BRAND.bg} 100%)` }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(5, 10, 20, 0.5)' }} />
      </div>
    </div>
  );
};


// ---------------------------------------------------------------------------
// MAIN COMPOSITION (22.0s total)
// ---------------------------------------------------------------------------
export const MarketPressureBrief: React.FC<MarketPressureBriefProps> = (props) => {
  const { structureVisual, disclaimer, cta = 'SEE WHAT OTHERS CANNOT.' } = props;

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <DynamicAtmosphere />

      {/* 0.0 - 13.0s: Dynamic Wall Level Viz */}
      {structureVisual && (
        <Sequence from={0} durationInFrames={S(13.0)}>
          <DynamicWallLevelViz data={structureVisual} />
        </Sequence>
      )}

      <Sequence from={0} durationInFrames={S(2.0)}><HookTextV9 /></Sequence>
      <Sequence from={S(2.0)} durationInFrames={S(3.0)}><ConcretePayoffV9 /></Sequence>
      <Sequence from={S(5.0)} durationInFrames={S(4.0)}><WhyCareTextV9 /></Sequence>
      <Sequence from={S(9.0)} durationInFrames={S(4.0)}><MeaningTextV9 /></Sequence>
      <Sequence from={S(13.0)} durationInFrames={S(5.0)}><ProductNeedV9 /></Sequence>
      <Sequence from={S(18.0)} durationInFrames={S(4.0)}><BrandCTAV9 cta={cta} /></Sequence>

      <Sequence from={0} durationInFrames={S(18.0)}><BrandBug /></Sequence>
      <ComplianceFooter text={disclaimer} />
      
      {props.captions && props.captions.length > 0 && (
        <CaptionOverlay captions={props.captions} />
      )}

      {/* ProgressBar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, background: 'rgba(255,255,255,0.05)', zIndex: Z.progress }}>
        <div style={{ height: '100%', width: `${(useCurrentFrame() / useVideoConfig().durationInFrames) * 100}%`, background: BRAND.gradientCyanPurple }} />
      </div>
    </AbsoluteFill>
  );
};
