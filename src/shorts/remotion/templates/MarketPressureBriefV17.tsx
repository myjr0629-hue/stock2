// ============================================================================
// MarketPressureBrief V17 — Revenue-Grade Rebuild
// NOT a patch. Complete new layout, structure, and storytelling flow.
// Audio: NEW (v17_voice.mp3). SFX: V11 reused. Visual: Rebuilt from scratch.
// ============================================================================

import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile, Audio } from 'remotion';
import type { ShortsVideoInput } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO } from '../brand/signumBrand';
import { ComplianceFooter } from '../components/ComplianceFooter';

export type MarketPressureBriefProps = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

// ─────────────────────────────────────────────────────────────────────────────
// Cinematic Background — subtle depth, not passive black
// ─────────────────────────────────────────────────────────────────────────────
const CinematicBg: React.FC = () => {
  const frame = useCurrentFrame();
  const breathe = interpolate(Math.sin(frame * 0.02), [-1, 1], [0.015, 0.04]);
  return (
    <AbsoluteFill style={{ background: BRAND.gradientBg }}>
      {/* Living grid — subtle breathing opacity */}
      <svg width="1080" height="1920" style={{ position: 'absolute', inset: 0, opacity: breathe }}>
        {Array.from({ length: 32 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 60 + 30} x2="1080" y2={i * 60 + 30} stroke="#fff" strokeWidth="0.3" />
        ))}
        {Array.from({ length: 18 }, (_, i) => (
          <line key={`v${i}`} x1={i * 60 + 30} y1="0" x2={i * 60 + 30} y2="1920" stroke="#fff" strokeWidth="0.3" />
        ))}
      </svg>
      {/* Vignette */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 45%, transparent 30%, ${BRAND.bgDeep} 90%)` }} />
      {/* Audio layers */}
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.18} />
      <Audio src={staticFile('shorts/audio/v17_voice.mp3')} volume={0.88} />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Brand Bug — minimal, fades out before CTA
// ─────────────────────────────────────────────────────────────────────────────
const BrandBug: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [S(0.3), S(1.0), S(14), S(14.5)], [0, 0.6, 0.6, 0], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  return (
    <div style={{ position: 'absolute', top: 40, left: 40, zIndex: Z.brand, opacity: op, display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width="28" height="28" viewBox="246 247 530 530" fill="none">
        <path d={SG_LOGO.upper} fill={BRAND.text} />
        <path d={SG_LOGO.lower} fill={BRAND.cyan} />
      </svg>
      <span style={{ color: BRAND.muted, fontSize: 14, fontWeight: 700, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>SIGNUMHQ</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 0.0–1.6s: Immediate Pattern Interrupt — "A WALL YOU CAN'T SEE"
// ─────────────────────────────────────────────────────────────────────────────
const PatternInterrupt: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;

  const slam = spring({ frame, fps, config: { damping: 10, stiffness: 500, mass: 0.3 } });
  const { price, callWall, putFloor } = data;
  const cWall = callWall ?? 600;
  const pFloor = putFloor ?? 580;
  const range = cWall - pFloor;
  const pad = range * 0.3;
  const vMin = pFloor - pad;
  const vMax = cWall + pad;
  const toY = (v: number) => 200 + (1 - (v - vMin) / (vMax - vMin)) * 500;

  const wallY = toY(cWall);
  const priceY = toY(price);
  const bracketH = priceY - wallY;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.5} />

      {/* Data visualization — center of screen, close-up spatial */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1080, height: 1000, opacity: slam }}>
        {/* Call Wall zone */}
        <div style={{ position: 'absolute', left: 80, right: 80, top: wallY - 120, height: 120, background: `linear-gradient(180deg, transparent 0%, ${BRAND.coral}12 100%)` }} />
        <div style={{ position: 'absolute', left: 80, right: 80, top: wallY, height: 6, background: BRAND.coral, boxShadow: `0 0 30px ${BRAND.coral}, 0 0 60px ${BRAND.coralGlow}` }} />
        {/* Bracket */}
        <div style={{ position: 'absolute', left: 480, top: wallY + 6, width: 6, height: bracketH - 6, background: BRAND.amber, boxShadow: `0 0 20px ${BRAND.amberGlow}`, transformOrigin: 'top', transform: `scaleY(${slam})` }} />
        <div style={{ position: 'absolute', left: 466, top: wallY, width: 20, height: 6, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: 466, top: priceY - 6, width: 20, height: 6, background: BRAND.amber }} />
        {/* Price line */}
        <div style={{ position: 'absolute', left: 80, top: priceY - 3, height: 6, width: 380, background: BRAND.cyan, boxShadow: `0 0 24px ${BRAND.cyan}`, borderRadius: 3 }} />
        {/* Price dot */}
        <div style={{ position: 'absolute', left: 444, top: priceY - 14, width: 28, height: 28, borderRadius: '50%', background: BRAND.text, border: `5px solid ${BRAND.cyan}`, boxShadow: `0 0 20px ${BRAND.cyan}` }} />
        {/* 1.3% — hero number inside bracket area */}
        <div style={{ position: 'absolute', left: 510, top: wallY + bracketH / 2 - 36, opacity: slam }}>
          <span style={{ color: BRAND.amber, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber }}>{data.distancePercent ?? 1.3}%</span>
        </div>
      </div>

      {/* Text — left-aligned, stacked below viz area */}
      <div style={{ position: 'absolute', top: 1000, left: 80, right: 80, transform: `translateY(${(1 - slam) * 40}px)`, opacity: slam }}>
        <div style={{ color: BRAND.text, fontSize: 72, fontWeight: 900, fontFamily: TYPE.family, lineHeight: 1.05, textShadow: SHADOW.hero }}>
          SPY IS
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 8 }}>
          <span style={{ color: BRAND.amber, fontSize: 90, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber }}>1.3%</span>
          <span style={{ color: BRAND.text, fontSize: 64, fontWeight: 800, fontFamily: TYPE.family, textShadow: SHADOW.hero }}>FROM</span>
        </div>
        <div style={{ color: BRAND.coral, fontSize: 60, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.coral, marginTop: 4 }}>
          A WALL YOU CAN'T SEE
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 1.6–3.8s: Reveal the Hidden Wall
// ─────────────────────────────────────────────────────────────────────────────
const RevealWall: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;

  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 220 } });
  const scanX = interpolate(frame, [S(0.3), S(1.5)], [-100, 1200], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  const scanOp = interpolate(frame, [S(0.3), S(0.5), S(1.2), S(1.5)], [0, 1, 1, 0], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  const wallReveal = interpolate(frame, [S(0.5), S(1.2)], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.25} />

      {/* Top text */}
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80, opacity: pop, transform: `translateY(${(1 - pop) * 20}px)` }}>
        <div style={{ color: BRAND.text, fontSize: 72, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero }}>NORMAL CHARTS</div>
        <div style={{ color: BRAND.cyan, fontSize: 72, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.cyan, marginTop: 6 }}>DON'T SHOW IT</div>
      </div>

      {/* Chart area — center */}
      <div style={{ position: 'absolute', top: 460, left: 80, right: 80, height: 600, opacity: pop }}>
        {/* Normal price line (always visible) */}
        <svg width="920" height="200" viewBox="0 0 920 200" style={{ opacity: 0.4 }}>
          <path d="M 0,140 C 80,120 180,160 280,100 C 380,40 440,80 560,60 C 680,45 780,70 920,30" stroke={BRAND.mutedLight} strokeWidth={4} fill="none" strokeLinecap="round" />
        </svg>

        {/* Scanner line */}
        <div style={{ position: 'absolute', top: 0, left: scanX, width: 3, height: 600, background: `linear-gradient(180deg, transparent 0%, ${BRAND.cyan} 20%, ${BRAND.cyan} 80%, transparent 100%)`, boxShadow: `0 0 40px ${BRAND.cyan}`, opacity: scanOp, zIndex: 10 }} />

        {/* Hidden wall layer — revealed after scan */}
        <div style={{ opacity: wallReveal }}>
          {/* Call Wall */}
          <div style={{ position: 'absolute', top: 100, left: 0, right: 0, height: 6, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
          <div style={{ position: 'absolute', top: 60, right: 0, color: BRAND.coral, fontSize: 36, fontWeight: 900, fontFamily: TYPE.family }}>CALL WALL</div>
          {/* Gap indicator */}
          <div style={{ position: 'absolute', top: 106, right: 120, width: 4, height: 80, background: BRAND.amber, boxShadow: `0 0 14px ${BRAND.amberGlow}` }} />
          <div style={{ position: 'absolute', top: 130, right: 140, color: BRAND.amber, fontSize: 48, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber }}>1.3%</div>
          {/* Price level label */}
          <div style={{ position: 'absolute', top: 186, left: 0, height: 4, width: 600, background: BRAND.cyan, opacity: 0.5, boxShadow: `0 0 20px ${BRAND.cyan}` }} />
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 3.8–6.5s: Why It Matters — Pressure Build
// ─────────────────────────────────────────────────────────────────────────────
const PressureBuild: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;

  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 200 } });
  const squeeze = interpolate(frame, [S(0.5), S(2.2)], [0, 0.55], { extrapolateRight: 'clamp' });
  const pulse = interpolate(Math.sin(frame * 0.35), [-1, 1], [1, 1.3]);
  const wallGlow = interpolate(frame, [S(0.5), S(2.2)], [0.3, 1], { extrapolateRight: 'clamp' });

  const wallY = 420;
  const baseGap = 200;
  const gap = baseGap * (1 - squeeze);
  const priceY = wallY + gap;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.25} />
      <Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.35} />

      {/* Text */}
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80, opacity: pop }}>
        <div style={{ color: BRAND.text, fontSize: 68, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero }}>NEAR WALLS,</div>
        <div style={{ color: BRAND.coral, fontSize: 76, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.coral, marginTop: 6 }}>PRESSURE CAN BUILD</div>
      </div>

      {/* Pressure visualization — close-up */}
      <div style={{ position: 'absolute', top: 0, left: 80, right: 80, height: 1200, opacity: pop }}>
        {/* Wall */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: wallY, height: 8, background: BRAND.coral, boxShadow: `0 0 ${wallGlow * 50}px ${BRAND.coral}` }} />
        {/* Pressure gradient in gap */}
        <div style={{ position: 'absolute', left: 0, right: 300, top: wallY + 8, height: gap, background: `linear-gradient(180deg, ${BRAND.coral}50 0%, ${BRAND.amber}20 50%, transparent 100%)`, opacity: wallGlow * 0.6 }} />
        {/* Bracket */}
        <div style={{ position: 'absolute', left: 680, top: wallY + 4, width: 6, height: gap, background: BRAND.amber, boxShadow: `0 0 20px ${BRAND.amberGlow}` }} />
        <div style={{ position: 'absolute', left: 666, top: wallY, width: 20, height: 6, background: BRAND.amber }} />
        <div style={{ position: 'absolute', left: 666, top: priceY, width: 20, height: 6, background: BRAND.amber }} />
        {/* 1.3% label */}
        <div style={{ position: 'absolute', left: 710, top: wallY + gap / 2 - 30 }}>
          <span style={{ color: BRAND.amber, fontSize: 72, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber }}>1.3%</span>
        </div>
        {/* Price line + pulsing dot */}
        <div style={{ position: 'absolute', left: 0, top: priceY - 3, height: 6, width: 660, background: BRAND.cyan, boxShadow: `0 0 20px ${BRAND.cyan}`, borderRadius: 3 }} />
        <div style={{ position: 'absolute', left: 644, top: priceY - 14, width: 28, height: 28, borderRadius: '50%', background: BRAND.text, border: `5px solid ${BRAND.cyan}`, boxShadow: `0 0 20px ${BRAND.cyan}`, transform: `scale(${pulse})` }} />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 6.5–9.2s: Turn Data Into a Map
// ─────────────────────────────────────────────────────────────────────────────
const PressureMap: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!data) return null;
  const { callWall, putFloor, gammaFlipLevel } = data;
  const cWall = callWall ?? 600;
  const pFloor = putFloor ?? 580;

  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 200 } });
  const assembleWall = interpolate(frame, [S(0.3), S(0.8)], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  const assembleFlip = interpolate(frame, [S(0.8), S(1.3)], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  const assembleFloor = interpolate(frame, [S(1.3), S(1.8)], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });

  const mapTop = 440;
  const mapH = 580;
  const toY = (level: number) => mapTop + ((cWall - level) / (cWall - pFloor)) * mapH;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.2} />

      {/* Text */}
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80, opacity: pop }}>
        <div style={{ color: BRAND.textSecondary, fontSize: 60, fontWeight: 800, fontFamily: TYPE.family, textShadow: SHADOW.caption }}>NOT A PREDICTION.</div>
        <div style={{ color: BRAND.purple, fontSize: 72, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.purple, marginTop: 10 }}>A PRESSURE MAP.</div>
      </div>

      {/* Map assembly */}
      <div style={{ position: 'absolute', top: 0, left: 80, right: 80, height: 1200, opacity: pop }}>
        {/* Call Wall */}
        <div style={{ opacity: assembleWall, transform: `translateX(${(1 - assembleWall) * -100}px)` }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: toY(cWall), height: 6, background: BRAND.coral, boxShadow: `0 0 30px ${BRAND.coral}` }} />
          <div style={{ position: 'absolute', right: 0, top: toY(cWall) - 46, color: BRAND.coral, fontSize: 42, fontWeight: 900, fontFamily: TYPE.family }}>CALL WALL ${cWall}</div>
        </div>

        {/* Gamma Flip */}
        {gammaFlipLevel && (
          <div style={{ opacity: assembleFlip, transform: `translateX(${(1 - assembleFlip) * -100}px)` }}>
            <div style={{ position: 'absolute', left: 0, top: toY(gammaFlipLevel), width: 600, height: 5, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 18px, transparent 18px, transparent 36px)` }} />
            <div style={{ position: 'absolute', left: 0, top: toY(gammaFlipLevel) - 46, color: BRAND.purple, fontSize: 42, fontWeight: 900, fontFamily: TYPE.family }}>GAMMA FLIP ${gammaFlipLevel}</div>
          </div>
        )}

        {/* Put Floor */}
        <div style={{ opacity: assembleFloor, transform: `translateX(${(1 - assembleFloor) * -100}px)` }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: toY(pFloor), height: 6, background: BRAND.emerald, boxShadow: `0 0 30px ${BRAND.emerald}` }} />
          <div style={{ position: 'absolute', right: 0, top: toY(pFloor) + 12, color: BRAND.emerald, fontSize: 42, fontWeight: 900, fontFamily: TYPE.family }}>PUT FLOOR ${pFloor}</div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 9.2–13.2s: Product Desire Moment — "PRICE ONLY vs STRUCTURE LAYER"
// ─────────────────────────────────────────────────────────────────────────────
const ProductDesire: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame, fps, config: { damping: 12, stiffness: 250, mass: 0.5 } });
  const scanX = interpolate(frame, [S(0.4), S(2.0)], [-100, 1200], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  const scanOp = interpolate(frame, [S(0.4), S(0.6), S(1.7), S(2.0)], [0, 0.9, 0.9, 0], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  const unlockGlow = interpolate(frame, [S(1.5), S(2.0), S(3.0), S(3.5)], [0, 0.6, 0.4, 0.2], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.wallViz + 10, background: BRAND.bg }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.45} />

      {/* LEFT/TOP: Price Only — dim, boring */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '48%', background: '#050810', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: reveal }}>
        <div style={{ color: BRAND.muted, fontSize: 36, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.12em', marginBottom: 12 }}>PRICE ONLY</div>
        <svg width="700" height="120" viewBox="0 0 700 120" style={{ opacity: 0.35 }}>
          <path d="M 0,90 C 70,70 140,100 240,60 C 340,20 400,50 500,35 C 600,20 660,40 700,15" stroke={BRAND.mutedLight} strokeWidth={3} fill="none" strokeLinecap="round" />
        </svg>
        <div style={{ color: BRAND.muted, fontSize: 24, fontWeight: 700, fontFamily: TYPE.family, marginTop: 20, letterSpacing: '0.1em' }}>INCOMPLETE</div>
      </div>

      {/* Divider */}
      <div style={{ position: 'absolute', top: '48%', left: 80, right: 80, height: 2, background: BRAND.mutedLight, opacity: 0.15 }} />
      <div style={{ position: 'absolute', top: '48%', left: 0, right: 0, display: 'flex', justifyContent: 'center', transform: 'translateY(-16px)', zIndex: 15 }}>
        <div style={{ background: BRAND.bg, padding: '4px 24px', borderRadius: 20, border: `1px solid ${BRAND.muted}` }}>
          <span style={{ color: BRAND.muted, fontSize: 22, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.15em' }}>VS</span>
        </div>
      </div>

      {/* Scanner line */}
      <div style={{ position: 'absolute', top: '48%', left: scanX, width: 4, height: '52%', background: `linear-gradient(180deg, transparent 0%, ${BRAND.cyan} 20%, ${BRAND.cyan} 80%, transparent 100%)`, boxShadow: `0 0 40px ${BRAND.cyan}, 0 0 80px ${BRAND.cyanGlow}`, opacity: scanOp, zIndex: 20 }} />

      {/* RIGHT/BOTTOM: Structure Layer — vivid, alive */}
      <div style={{ position: 'absolute', top: '52%', left: 0, right: 0, height: '48%', background: `radial-gradient(ellipse at 50% 30%, ${BRAND.cyan}15 0%, ${BRAND.bg} 80%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: interpolate(reveal, [0.4, 1], [0, 1]), transform: `translateY(${interpolate(reveal, [0, 1], [120, 0])}px)` }}>
        {/* System glow */}
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 40%, rgba(34,211,238,${unlockGlow * 0.15}) 0%, transparent 70%)`, pointerEvents: 'none' }} />

        {/* Structure lines */}
        <div style={{ width: 800, position: 'relative', height: 280 }}>
          <div style={{ position: 'absolute', top: 20, left: 0, right: 0, height: 6, background: BRAND.coral, boxShadow: `0 0 30px ${BRAND.coral}` }} />
          <div style={{ position: 'absolute', top: 0, right: 0, color: BRAND.coral, fontSize: 32, fontWeight: 900, fontFamily: TYPE.family }}>CALL WALL</div>

          <div style={{ position: 'absolute', top: 110, left: 0, width: 500, height: 4, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 16px, transparent 16px, transparent 32px)` }} />
          <div style={{ position: 'absolute', top: 88, left: 0, color: BRAND.purple, fontSize: 32, fontWeight: 900, fontFamily: TYPE.family }}>GAMMA FLIP</div>

          <div style={{ position: 'absolute', top: 200, left: 0, right: 0, height: 6, background: BRAND.emerald, boxShadow: `0 0 30px ${BRAND.emerald}` }} />
          <div style={{ position: 'absolute', top: 210, right: 0, color: BRAND.emerald, fontSize: 32, fontWeight: 900, fontFamily: TYPE.family }}>PUT FLOOR</div>

          {/* 1.3% gap */}
          <div style={{ position: 'absolute', top: 26, right: 260, width: 4, height: 50, background: BRAND.amber, boxShadow: `0 0 14px ${BRAND.amberGlow}` }} />
          <div style={{ position: 'absolute', top: 30, right: 280, color: BRAND.amber, fontSize: 36, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber }}>1.3%</div>
        </div>

        {/* Badge */}
        <div style={{ marginTop: 30, background: 'rgba(5,10,20,0.9)', padding: '16px 48px', borderRadius: 16, border: `2px solid ${BRAND.cyan}`, boxShadow: `0 0 ${30 + unlockGlow * 30}px ${BRAND.cyanGlow}` }}>
          <div style={{ color: BRAND.cyan, fontSize: 28, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.12em' }}>STRUCTURE LAYER</div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 13.2–16.5s: Insight Recap — WALL. FLOOR. FLIP.
// ─────────────────────────────────────────────────────────────────────────────
const InsightRecap: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wallIn = spring({ frame, fps, config: { damping: 12, stiffness: 300 } });
  const flipIn = spring({ frame: Math.max(0, frame - S(1.0)), fps, config: { damping: 12, stiffness: 300 } });
  const floorIn = spring({ frame: Math.max(0, frame - S(2.0)), fps, config: { damping: 12, stiffness: 300 } });

  const items = [
    { label: 'WALL', color: BRAND.coral, shadow: SHADOW.coral, spring: wallIn, line: 'solid' as const },
    { label: 'FLIP', color: BRAND.purple, shadow: SHADOW.purple, spring: flipIn, line: 'dashed' as const },
    { label: 'FLOOR', color: BRAND.emerald, shadow: SHADOW.amber, spring: floorIn, line: 'solid' as const },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: Z.hookText, background: BRAND.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 80 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 40, opacity: item.spring, transform: `translateX(${(1 - item.spring) * -80}px)` }}>
          <div style={{ width: 200, height: 6, background: item.line === 'dashed' ? `repeating-linear-gradient(90deg, ${item.color} 0px, ${item.color} 16px, transparent 16px, transparent 32px)` : item.color, boxShadow: `0 0 20px ${item.color}` }} />
          <span style={{ color: item.color, fontSize: 110, fontWeight: 900, fontFamily: TYPE.family, textShadow: item.shadow, letterSpacing: '0.08em' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 16.5–20.0s: CTA — Decisive ending
// ─────────────────────────────────────────────────────────────────────────────
const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spring({ frame, fps, config: { damping: 14, stiffness: 240 } });
  const scan = interpolate(frame % S(2.0), [0, S(2.0)], [-200, 500]);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: Z.hookText, background: BRAND.bg }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.25} />

      {/* Logo */}
      <div style={{ marginBottom: 50, opacity: r, transform: `scale(${interpolate(r, [0, 1], [0.7, 1])})` }}>
        <svg width="160" height="160" viewBox="246 247 530 530" fill="none">
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.cyan} />
        </svg>
      </div>

      {/* Tagline */}
      <div style={{ textAlign: 'center', opacity: r, transform: `translateY(${(1 - r) * 30}px)` }}>
        <div style={{ color: BRAND.text, fontSize: 64, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.hero, lineHeight: 1.1 }}>
          SEE THE STRUCTURE
        </div>
        <div style={{ color: BRAND.cyan, fontSize: 64, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.cyan, marginTop: 10, lineHeight: 1.1 }}>
          BEHIND PRICE
        </div>
      </div>

      {/* Accent line */}
      <div style={{ width: 240, height: 4, marginTop: 50, background: BRAND.gradientCyanPurple, position: 'relative', overflow: 'hidden', opacity: r }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: scan, width: 50, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
      </div>

      {/* URL */}
      <div style={{ marginTop: 50, color: BRAND.cyan, fontSize: 52, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.08em', textShadow: SHADOW.cyan, opacity: r, transform: `translateY(${(1 - r) * 40}px)` }}>
        SIGNUMHQ.COM
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Composition — 20s @ 30fps = 600 frames
// ─────────────────────────────────────────────────────────────────────────────
export const MarketPressureBriefV17: React.FC<MarketPressureBriefProps> = (props) => {
  const { structureVisual, disclaimer } = props;

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <CinematicBg />

      <Sequence from={0} durationInFrames={S(1.6)}><PatternInterrupt data={structureVisual} /></Sequence>
      <Sequence from={S(1.6)} durationInFrames={S(2.2)}><RevealWall data={structureVisual} /></Sequence>
      <Sequence from={S(3.8)} durationInFrames={S(2.7)}><PressureBuild data={structureVisual} /></Sequence>
      <Sequence from={S(6.5)} durationInFrames={S(2.7)}><PressureMap data={structureVisual} /></Sequence>
      <Sequence from={S(9.2)} durationInFrames={S(4.0)}><ProductDesire /></Sequence>
      <Sequence from={S(13.2)} durationInFrames={S(3.3)}><InsightRecap /></Sequence>
      <Sequence from={S(16.5)} durationInFrames={S(3.5)}><CTA /></Sequence>

      <BrandBug />
      <ComplianceFooter text={disclaimer} />

      {/* Progress bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.04)', zIndex: Z.progress }}>
        <div style={{ height: '100%', width: `${(useCurrentFrame() / useVideoConfig().durationInFrames) * 100}%`, background: BRAND.gradientCyanPurple }} />
      </div>
    </AbsoluteFill>
  );
};
