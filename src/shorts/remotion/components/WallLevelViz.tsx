// ============================================================================
// WallLevelViz V7 — Insight Message Rebuild
// 0 - 10.5s timeline handled perfectly.
// ============================================================================

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import type { StructureVisualInput } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS } from '../brand/signumBrand';

interface WallLevelVizProps {
  data: StructureVisualInput;
  enterFrame: number;
}

export const WallLevelViz: React.FC<WallLevelVizProps> = ({ data, enterFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lf = Math.max(0, frame - enterFrame);

  if (!data.callWall || !data.putFloor) return null;
  const { price, callWall, putFloor, gammaFlipLevel } = data;

  const range = callWall - putFloor;
  const pad = range * 0.25;
  const vMin = putFloor - pad;
  const vMax = callWall + pad;
  const toY = (v: number) => 100 + (1 - (v - vMin) / (vMax - vMin)) * 700;

  // Global Animations
  const reveal = spring({ frame: lf, fps, config: { damping: 25, stiffness: 70, mass: 0.9 } });
  const wallGrow = interpolate(lf, [0, fps * 1.5], [0, 1], { extrapolateRight: 'clamp' }); // Slower grow
  const priceReveal = interpolate(lf, [fps * 0.3, fps * 1.5], [0, 1], { extrapolateRight: 'clamp' });
  
  // Interactive HUD Scanning / Lock-on (1.5s - 4.0s detection zone)
  const scanlineY = interpolate(lf, [0, fps * 1.5], [-100, 900], { extrapolateRight: 'clamp' });
  const detectionFlash = interpolate(lf, [fps * 1.5, fps * 1.8, fps * 2.1], [0, 1, 0], { extrapolateRight: 'clamp' });
  const lockRingSize = spring({ frame: Math.max(0, lf - fps * 1.6), fps, config: { damping: 12, stiffness: 150 } });

  // 4.0s - 7.0s Contrast/Pressure zone (Price actively moves towards the wall)
  const approach = interpolate(lf, [fps * 4.0, fps * 7.0], [0, 0.7], { extrapolateRight: 'clamp' });
  const priceY = toY(price) + (toY(callWall) - toY(price)) * approach * 0.35;

  const pressure = interpolate(approach, [0, 0.7], [0, 1], { extrapolateRight: 'clamp' });
  const pulse = interpolate(lf % (fps * 2), [0, fps * 1, fps * 2], [0.6, 1, 0.6]);

  const wallY = toY(callWall);
  const floorY = toY(putFloor);
  const flipY = gammaFlipLevel ? toY(gammaFlipLevel) : null;

  // Measurement Bracket
  const bracketGrow = spring({ frame: Math.max(0, lf - fps * 3.8), fps, config: { damping: 18, stiffness: 120 } });
  const bracketH = Math.max(0, priceY - wallY);

  // 7.0s Map Assembly
  const mapLf = Math.max(0, lf - fps * 7.0);
  const showMap = mapLf > 0;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: 1080, height: 900, opacity: reveal, zIndex: Z.wallViz }}>
      
      {/* ── INITIAL X-RAY SCANLINE ── */}
      {lf < fps * 1.5 && (
        <div style={{
          position: 'absolute', left: 40, right: 40, top: scanlineY, height: 4,
          background: BRAND.cyan, boxShadow: `0 0 30px ${BRAND.cyan}, 0 40px 100px ${BRAND.cyanGlow}`,
          zIndex: 1000
        }} />
      )}

      {/* ── GLASS WALL BARRIER ── */}
      <div style={{
        position: 'absolute', left: 60, right: 60, top: wallY - 200, height: 200,
        background: `linear-gradient(180deg, ${BRAND.coral}05 0%, ${BRAND.coral}18 70%, ${BRAND.coral}35 100%)`,
        borderTop: `1px solid ${BRAND.coral}30`,
        borderLeft: `2px solid ${BRAND.coral}50`,
        borderRight: `2px solid ${BRAND.coral}50`,
        opacity: wallGrow * pulse,
        backdropFilter: 'blur(12px)',
        clipPath: `polygon(0 ${Math.max(0, scanlineY - (wallY - 200))}px, 100% ${Math.max(0, scanlineY - (wallY - 200))}px, 100% 100%, 0 100%)`
      }} />

      {/* Wall line */}
      <div style={{
        position: 'absolute', left: 60, right: 60, top: wallY - 4, height: 8,
        background: BRAND.coral,
        boxShadow: `0 0 50px ${BRAND.coral}, 0 0 100px ${BRAND.coral}80, 0 0 200px ${BRAND.coral}40`,
        opacity: wallGrow,
        clipPath: `polygon(0 ${Math.max(0, scanlineY - wallY)}px, 100% ${Math.max(0, scanlineY - wallY)}px, 100% 100%, 0 100%)`
      }} />

      {/* ── WALL LABEL ── */}
      <div style={{
        position: 'absolute', right: 80, top: wallY - 85,
        opacity: lf < fps * 1.5 ? 0 : wallGrow, textAlign: 'right', // Hidden during hook
        clipPath: `polygon(0 ${Math.max(0, scanlineY - (wallY - 85))}px, 100% ${Math.max(0, scanlineY - (wallY - 85))}px, 100% 100%, 0 100%)`
      }}>
        <div style={{ color: BRAND.text, fontSize: TYPE.labelSize, fontWeight: TYPE.labelWeight, fontFamily: TYPE.family, letterSpacing: TYPE.labelTracking, textTransform: 'uppercase', textShadow: SHADOW.hero }}>CALL WALL</div>
        <div style={{ color: BRAND.coral, fontSize: TYPE.metricSize, fontWeight: TYPE.metricWeight, fontFamily: TYPE.family, textShadow: SHADOW.coral, letterSpacing: '-0.02em', filter: `brightness(${1 + detectionFlash})` }}>${callWall}</div>
      </div>

      {/* ── INTENSE PRESSURE ZONE ── */}
      <div style={{
        position: 'absolute', left: 100, right: 350,
        top: wallY + 4, height: Math.max(0, priceY - wallY - 4),
        background: `linear-gradient(180deg, ${BRAND.coral}35 0%, ${BRAND.cyan}15 50%, transparent 100%)`,
        opacity: pressure,
        borderLeft: `2px dashed ${BRAND.coral}50`,
      }} />

      {/* Pressure particles */}
      {pressure > 0.01 && Array.from({ length: 30 }).map((_, i) => {
        const speed = 1.0 + (i % 4) * 0.5;
        const cycle = (lf * speed + i * 25) % (fps * 1.5);
        const py = interpolate(cycle, [0, fps * 1.5], [priceY, wallY + 6]);
        const px = 100 + (i * 25) + Math.sin(cycle * 0.15) * 35;
        const op = interpolate(cycle, [0, fps * 0.2, fps * 1.2, fps * 1.5], [0, 0.9, 0.9, 0]);
        const isCyan = i % 3 === 0;
        return (
          <div key={i} style={{
            position: 'absolute', left: px, top: py,
            width: isCyan ? 5 : 6, height: isCyan ? 5 : 6, borderRadius: '50%',
            background: isCyan ? BRAND.cyan : BRAND.coral,
            boxShadow: `0 0 ${isCyan ? 20 : 16}px ${isCyan ? BRAND.cyan : BRAND.coral}`,
            opacity: op * pressure,
          }} />
        );
      })}

      {/* ── MEASUREMENT BRACKET ── */}
      {bracketGrow > 0.01 && (
        <div style={{
          position: 'absolute', right: 330, top: wallY, height: bracketH, width: 20,
          borderRight: `3px solid ${BRAND.amber}`,
          borderTop: `3px solid ${BRAND.amber}`,
          borderBottom: `3px solid ${BRAND.amber}`,
          opacity: bracketGrow * (0.6 + pressure * 0.4),
          boxShadow: `inset -10px 0 20px ${BRAND.amberGlow}`,
          transformOrigin: 'top right',
          transform: `scaleY(${bracketGrow})`
        }} />
      )}

      {/* ── CURRENT PRICE + HUD LOCK-ON ── */}
      <div style={{
        position: 'absolute', left: 60, top: priceY - 2, height: 6, width: 600 * priceReveal,
        background: BRAND.cyan, boxShadow: `0 0 40px ${BRAND.cyan}, 0 0 80px ${BRAND.cyanGlow}`,
        borderRadius: 3, opacity: priceReveal,
      }} />
      
      <div style={{
        position: 'absolute', left: 60 + 600 * priceReveal - 16, top: priceY - 16,
        width: 32, height: 32, borderRadius: '50%', background: BRAND.text, border: `6px solid ${BRAND.cyan}`,
        boxShadow: `0 0 35px ${BRAND.cyan}, 0 0 90px ${BRAND.cyanGlow}`, opacity: priceReveal,
      }} />

      {lockRingSize > 0 && (
        <div style={{
          position: 'absolute', left: 60 + 600 * priceReveal - 24, top: priceY - 24,
          width: 48, height: 48, borderRadius: '50%', border: `2px dashed ${BRAND.cyan}`,
          opacity: interpolate(lockRingSize, [0, 1, 1.2], [0, 1, 0]), transform: `scale(${lockRingSize})`,
        }} />
      )}

      {/* Price Label (Hidden during hook) */}
      <div style={{
        position: 'absolute', left: 60 + 600 * priceReveal + 40, top: priceY + 5,
        opacity: lf < fps * 1.5 ? 0 : priceReveal,
      }}>
        <div style={{ color: BRAND.text, fontSize: TYPE.labelSize, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em', opacity: 0.9 }}>SPY PRICE</div>
        <div style={{ color: BRAND.cyan, fontSize: TYPE.metricSize, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.cyan, letterSpacing: '-0.02em', marginTop: -4 }}>
          ${price.toFixed(2)}
        </div>
      </div>

      {/* ── DISTANCE (Hidden during hook) ── */}
      {data.distancePercent !== null && (
        <div style={{
          position: 'absolute', right: 80,
          top: (wallY + priceY) / 2 - 40, textAlign: 'right',
          opacity: lf < fps * 1.5 ? 0 : interpolate(lf, [fps * 1.5, fps * 2.5], [0, 1], { extrapolateRight: 'clamp' }),
          transform: `scale(${1 + pressure * 0.15})`,
        }}>
          <div style={{ color: BRAND.amber, fontSize: TYPE.metricSize + 10, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber }}>↕ {data.distancePercent}%</div>
          <div style={{ color: BRAND.text, fontSize: TYPE.labelSize, fontWeight: 700, fontFamily: TYPE.family, textTransform: 'uppercase', opacity: 1, marginTop: -6 }}>TO CALL WALL</div>
        </div>
      )}

      {/* ── 7.0s: SECONDARY MAP ASSEMBLY ── */}
      {showMap && (
        <div style={{ opacity: interpolate(mapLf, [0, fps * 0.3], [0, 1], { extrapolateRight: 'clamp' }) }}>
          {/* Put Floor (Appears second) */}
          <div style={{
            position: 'absolute', left: 60, right: 300, top: floorY - 2, height: 4,
            background: `linear-gradient(90deg, ${BRAND.emerald}90 0%, transparent 100%)`,
            opacity: interpolate(mapLf, [fps * 0.6, fps * 1.0], [0, 1], { extrapolateRight: 'clamp' })
          }} />
          <div style={{ 
            position: 'absolute', right: 80, top: floorY + 8,
            opacity: interpolate(mapLf, [fps * 0.6, fps * 1.0], [0, 1], { extrapolateRight: 'clamp' })
          }}>
            <div style={{ color: BRAND.emerald, fontSize: TYPE.labelSize, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em', textAlign: 'right' }}>PUT FLOOR</div>
            <div style={{ color: BRAND.text, fontSize: TYPE.metricSize - 10, fontWeight: 900, fontFamily: TYPE.family, textAlign: 'right', opacity: 0.95 }}>${putFloor}</div>
          </div>

          {/* Gamma Flip (Slides in first) */}
          {flipY !== null && gammaFlipLevel && (
            <div style={{
              opacity: interpolate(mapLf, [fps * 0.2, fps * 0.6], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `translateX(${interpolate(mapLf, [fps * 0.2, fps * 0.6], [-50, 0], { extrapolateRight: 'clamp' })}px)`
            }}>
              <div style={{
                position: 'absolute', left: 60, top: flipY, width: 450, height: 4,
                background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 12px, transparent 12px, transparent 24px)`,
                opacity: 0.85,
              }} />
              <div style={{ position: 'absolute', left: 100, top: flipY - 35 }}>
                <span style={{ color: BRAND.purple, fontSize: TYPE.labelSize, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>GAMMA FLIP</span>
                <span style={{ color: BRAND.text, fontSize: TYPE.metricSize - 15, fontWeight: 900, fontFamily: TYPE.family, marginLeft: 12 }}>${gammaFlipLevel}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
