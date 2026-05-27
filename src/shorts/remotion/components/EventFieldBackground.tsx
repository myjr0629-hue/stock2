// ============================================================================
// EventFieldBackground — Multi-layer background system for all scenes
// Replaces pure black with cinematic depth layers
// ============================================================================
import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Img,
  staticFile,
  random,
} from 'remotion';
import { BRAND, Z, LAYOUT } from '../brand/signumBrand';

interface EventFieldBackgroundProps {
  sceneName?: string;
  intensity?: number; // 0-1, controls overall brightness of layers, default 0.5
  brollSrc?: string; // path to image in public/ folder
  warmth?: number; // 0-1, shifts gradient from cool navy (0) to warm red-tint (1), default 0
}

// ── Bokeh particle config ──────────────────────────────────────────────────
interface BokehParticle {
  x: number;
  size: number;
  baseOpacity: number;
  speed: number;
  sineAmp: number;
  sineFreq: number;
  color: string;
}

const makeBokehParticles = (seed: string): BokehParticle[] =>
  Array.from({ length: 6 }, (_, i) => ({
    x: random(`${seed}-bk-x-${i}`) * LAYOUT.w,
    size: 80 + random(`${seed}-bk-s-${i}`) * 160,
    baseOpacity: 0.06 + random(`${seed}-bk-o-${i}`) * 0.06,
    speed: 0.15 + random(`${seed}-bk-sp-${i}`) * 0.25,
    sineAmp: 20 + random(`${seed}-bk-sa-${i}`) * 40,
    sineFreq: 0.008 + random(`${seed}-bk-sf-${i}`) * 0.012,
    color: i % 2 === 0 ? BRAND.cyan : BRAND.purple,
  }));

// ── Component ──────────────────────────────────────────────────────────────
const EventFieldBackground: React.FC<EventFieldBackgroundProps> = ({
  sceneName = 'default',
  intensity = 0.5,
  brollSrc,
  warmth = 0,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const particles = React.useMemo(() => makeBokehParticles(sceneName), [sceneName]);

  // Clamp helpers
  const int = Math.max(0, Math.min(1, intensity));
  const wrm = Math.max(0, Math.min(1, warmth));

  // Warmth color blending — cool navy → warm red-tint
  const coolCore = '#060c1a';
  const warmCore = '#1a0a0c';
  const coolEdge = '#081020';
  const warmEdge = '#140810';

  // Simple hex blend helper
  const blendHex = (a: string, b: string, t: number): string => {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    const blended = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
    return `#${blended.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };

  const coreColor = blendHex(coolCore, warmCore, wrm);
  const edgeColor = blendHex(coolEdge, warmEdge, wrm);

  // ── L0: Deep gradient background ──────────────────────────────────────
  const L0_gradient: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: `
      radial-gradient(ellipse 120% 80% at 50% 40%, ${coreColor} 0%, ${BRAND.bg} 70%),
      radial-gradient(ellipse 100% 60% at 30% 70%, ${edgeColor} 0%, transparent 60%),
      linear-gradient(180deg, ${BRAND.bg} 0%, ${coreColor} 35%, ${edgeColor} 65%, ${BRAND.bg} 100%)
    `,
    zIndex: Z.bg,
  };

  // ── L1: B-roll image layer ────────────────────────────────────────────
  const brollScale = interpolate(frame, [0, durationInFrames], [1.0, 1.08], {
    extrapolateRight: 'clamp',
  });

  // ── L2: Bokeh particles ───────────────────────────────────────────────
  const renderBokeh = () =>
    particles.map((p, i) => {
      const yTravel = LAYOUT.h + p.size;
      const rawY = LAYOUT.h + p.size / 2 - frame * p.speed * 2;
      const y = ((rawY % yTravel) + yTravel) % yTravel - p.size / 2;
      const xOffset = Math.sin(frame * p.sineFreq) * p.sineAmp;
      const opacity = p.baseOpacity * int;

      return (
        <div
          key={`bokeh-${i}`}
          style={{
            position: 'absolute',
            left: p.x + xOffset,
            top: y,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${p.color} 0%, transparent 70%)`,
            opacity,
            filter: `blur(${p.size * 0.35}px)`,
            pointerEvents: 'none',
          }}
        />
      );
    });

  // ── L3: Institutional grid ────────────────────────────────────────────
  const gridOpacity = 0.03 * int;
  const gridSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
      <line x1="0" y1="0" x2="120" y2="0" stroke="rgba(241,245,249,${gridOpacity})" stroke-width="0.5"/>
      <line x1="0" y1="0" x2="0" y2="120" stroke="rgba(241,245,249,${gridOpacity})" stroke-width="0.5"/>
    </svg>
  `;
  const gridDataUri = `data:image/svg+xml,${encodeURIComponent(gridSvg.trim())}`;

  // ── L4: Vignette ──────────────────────────────────────────────────────
  const vignetteStrength = 0.7 + (1 - int) * 0.2;

  // ── L5: Film grain ────────────────────────────────────────────────────
  const grainSeed = Math.floor(random(`grain-${sceneName}-${frame}`) * 1000);
  const grainTx = (random(`grain-tx-${frame}`) - 0.5) * 4;
  const grainTy = (random(`grain-ty-${frame}`) - 0.5) * 4;

  return (
    <AbsoluteFill style={{ zIndex: Z.bg }}>
      {/* L0 — Deep gradient */}
      <div style={L0_gradient} />

      {/* L1 — B-roll image (optional) */}
      {brollSrc && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            zIndex: Z.broll,
          }}
        >
          <Img
            src={staticFile(brollSrc)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.1 * int,
              mixBlendMode: 'screen',
              transform: `scale(${brollScale})`,
              transformOrigin: 'center center',
            }}
          />
        </div>
      )}

      {/* L2 — Bokeh particles */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          zIndex: Z.glows,
          pointerEvents: 'none',
        }}
      >
        {renderBokeh()}
      </div>

      {/* L3 — Institutional grid */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundImage: `url("${gridDataUri}")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '120px 120px',
          zIndex: Z.grid,
          pointerEvents: 'none',
        }}
      />

      {/* L4 — Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: `radial-gradient(ellipse 70% 55% at 50% 45%, transparent 0%, rgba(0,0,0,${vignetteStrength}) 100%)`,
          zIndex: Z.glows + 1,
          pointerEvents: 'none',
        }}
      />

      {/* L5 — Film grain (SVG feTurbulence) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: Z.glows + 2,
          pointerEvents: 'none',
          opacity: 0.035,
          transform: `translate(${grainTx}px, ${grainTy}px)`,
        }}
      >
        <svg
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block' }}
        >
          <filter id={`grain-${sceneName}`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves="3"
              seed={grainSeed}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect
            width="100%"
            height="100%"
            filter={`url(#grain-${sceneName})`}
            opacity="1"
          />
        </svg>
      </div>

      {/* L6 — Institutional Terminal Border Overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 30,
          border: '1.5px solid rgba(34, 211, 238, 0.06)',
          pointerEvents: 'none',
          zIndex: Z.grid + 2,
        }}
      >
        {/* Corner Crosshairs */}
        <div style={{ position: 'absolute', top: -5, left: -5, width: 14, height: 14, borderTop: '2px solid rgba(34,211,238,0.3)', borderLeft: '2px solid rgba(34,211,238,0.3)' }} />
        <div style={{ position: 'absolute', top: -5, right: -5, width: 14, height: 14, borderTop: '2px solid rgba(34,211,238,0.3)', borderRight: '2px solid rgba(34,211,238,0.3)' }} />
        <div style={{ position: 'absolute', bottom: -5, left: -5, width: 14, height: 14, borderBottom: '2px solid rgba(34,211,238,0.3)', borderLeft: '2px solid rgba(34,211,238,0.3)' }} />
        <div style={{ position: 'absolute', bottom: -5, right: -5, width: 14, height: 14, borderBottom: '2px solid rgba(34,211,238,0.3)', borderRight: '2px solid rgba(34,211,238,0.3)' }} />

        {/* Small telemetries */}
        <div style={{ position: 'absolute', top: 8, left: 12, color: 'rgba(34,211,238,0.3)', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: '0.05em' }}>SYS: ACTIVE</div>
        <div style={{ position: 'absolute', top: 8, right: 12, color: 'rgba(34,211,238,0.3)', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: '0.05em' }}>NET: LIVE_STRM</div>
        
        <div style={{ position: 'absolute', bottom: 8, left: 12, color: 'rgba(255,255,255,0.15)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>[SCALE: 9:16 ENHANCED]</div>
        <div style={{ position: 'absolute', bottom: 8, right: 12, color: 'rgba(255,255,255,0.15)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>[MODE: OVERLAY]</div>

        {/* Vertical Ticks on Right Border */}
        <div style={{ position: 'absolute', right: -40, top: 400, color: 'rgba(255,255,255,0.15)', fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>— 605.00</div>
        <div style={{ position: 'absolute', right: -40, top: 560, color: 'rgba(248,113,113,0.3)', fontSize: 14, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>— 600.00</div>
        <div style={{ position: 'absolute', right: -40, top: 720, color: 'rgba(255,255,255,0.15)', fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>— 595.00</div>
        <div style={{ position: 'absolute', right: -40, top: 880, color: 'rgba(167,139,250,0.3)', fontSize: 14, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>— 588.00</div>
        <div style={{ position: 'absolute', right: -40, top: 1040, color: 'rgba(255,255,255,0.15)', fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>— 585.00</div>
        <div style={{ position: 'absolute', right: -40, top: 1200, color: 'rgba(52,211,153,0.3)', fontSize: 14, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>— 580.00</div>
      </div>
    </AbsoluteFill>
  );
};

export default EventFieldBackground;
