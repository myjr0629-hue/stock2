// ============================================================================
// Scene 1: HOOK (0~3s) — 스크롤 멈추기
// Claude 베이스 + GPT clipPath 글리치
// ============================================================================
import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  random,
} from 'remotion';
import { C, sec } from '../design';

interface Scene1Props {
  ticker: string;
}

const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

// ── Red Flash (더블 플래시) ──
const RedFlash: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const flash1 = interpolate(frame, [0, fps * 0.08, fps * 0.25], [0.7, 0.3, 0], clamp);
  const flash2 = interpolate(frame, [fps * 0.18, fps * 0.25, fps * 0.45], [0, 0.4, 0], clamp);
  return (
    <AbsoluteFill style={{
      backgroundColor: C.red,
      opacity: Math.max(flash1, flash2),
      pointerEvents: 'none',
      zIndex: 100,
    }} />
  );
};

// ── Pulse Rings (4개 충격파) ──
const PulseRings: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const rings = [
    { start: fps * 0.3, dur: fps * 1.8 },
    { start: fps * 0.8, dur: fps * 1.8 },
    { start: fps * 1.3, dur: fps * 1.8 },
    { start: fps * 1.8, dur: fps * 1.8 },
  ];
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
      {rings.map((r, i) => {
        const local = frame - r.start;
        const p = local / r.dur;
        if (p < 0 || p > 1) return null;
        const size = interpolate(p, [0, 1], [0, 1800], clamp);
        const opacity = interpolate(p, [0, 0.2, 1], [0, 0.6, 0], clamp);
        const bw = interpolate(p, [0, 1], [8, 1], clamp);
        return (
          <div key={i} style={{
            position: 'absolute', width: size, height: size, borderRadius: '50%',
            border: `${bw}px solid ${C.red}`,
            opacity,
            boxShadow: `0 0 ${size / 30}px rgba(239,68,68,${opacity * 0.5})`,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

// ── Warning Icon (spring + 진동 + 깜빡임) ──
const WarningIcon: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const startF = fps * 0.3;
  const lf = frame - startF;
  const scale = spring({ frame: lf, fps, from: 0, to: 1, config: { damping: 8, stiffness: 120, mass: 0.6 } });
  const opacity = interpolate(lf, [0, fps * 0.3], [0, 1], clamp);
  const vibrate = lf > fps * 0.4 ? Math.sin(lf * 0.8) * 4 : 0;
  const flicker = Math.sin(lf * 0.3) > 0.7;
  const iconColor = flicker && lf > fps * 0.5 ? C.text : C.red;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
      <div style={{
        transform: `scale(${scale}) translate(${vibrate}px, ${vibrate * 0.5}px)`,
        opacity,
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(239,68,68,0.4) 0%, transparent 70%)',
        }} />
        <svg width="400" height="400" viewBox="0 0 400 400" style={{ position: 'relative' }}>
          <defs>
            <filter id="wGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <polygon points="200,40 380,360 20,360" fill="none" stroke={iconColor} strokeWidth="12" strokeLinejoin="round" filter="url(#wGlow)" />
          <polygon points="200,40 380,360 20,360" fill={C.red} opacity="0.15" />
          <rect x="186" y="130" width="28" height="140" rx="6" fill={iconColor} filter="url(#wGlow)" />
          <circle cx="200" cy="310" r="18" fill={iconColor} filter="url(#wGlow)" />
        </svg>
      </div>
    </AbsoluteFill>
  );
};

// ── Glitch Text (Claude random + GPT clipPath) ──
const GlitchText: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const startF = fps * 0.8;
  const lf = frame - startF;
  if (lf < 0) return null;

  const opacity = interpolate(lf, [0, fps * 0.2], [0, 1], clamp);
  const glitchActive = random(`gl-${Math.floor(lf / 3)}`) > 0.6 && lf < fps * 1.5;
  const rgbOff = glitchActive ? 8 : 0;
  const glitchX = glitchActive ? (random(`gx-${Math.floor(lf / 3)}`) - 0.5) * 6 : 0;

  // GPT clipPath 상/하 분리 글리치
  const clipA = interpolate(lf % 6, [0, 1, 2, 3, 4, 5], [0, -10, 6, -4, 3, 0], clamp);
  const clipB = interpolate(lf % 5, [0, 1, 2, 3, 4], [0, 8, -6, 3, 0], clamp);
  const clipOpA = glitchActive ? 0.85 : 0.15;
  const clipOpB = glitchActive ? 0.75 : 0.10;

  const textStyle: React.CSSProperties = {
    fontSize: 120, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.95,
    fontFamily: 'Inter, sans-serif', textAlign: 'center',
  };

  return (
    <div style={{
      position: 'absolute', top: '60%', left: 0, right: 0,
      textAlign: 'center', opacity, pointerEvents: 'none',
    }}>
      <div style={{ position: 'relative', transform: `translateX(${glitchX}px)` }}>
        {/* Red layer — upper clip */}
        <div style={{
          ...textStyle, position: 'absolute', inset: 0,
          color: C.red, opacity: clipOpA,
          transform: `translateX(${clipA - rgbOff}px)`,
          clipPath: 'inset(0 0 50% 0)',
          textShadow: `0 0 18px rgba(239,68,68,0.35)`,
        }}>STRUCTURAL<br />ALERT</div>
        {/* Cyan layer — lower clip */}
        <div style={{
          ...textStyle, position: 'absolute', inset: 0,
          color: C.cyan, opacity: clipOpB,
          transform: `translateX(${clipB + rgbOff}px)`,
          clipPath: 'inset(50% 0 0 0)',
          textShadow: `0 0 18px rgba(34,211,238,0.28)`,
        }}>STRUCTURAL<br />ALERT</div>
        {/* Main white text */}
        <div style={{
          ...textStyle, position: 'relative', color: C.text,
          textShadow: '0 0 30px rgba(239,68,68,0.6), 0 0 60px rgba(239,68,68,0.3)',
        }}>STRUCTURAL<br /><span style={{ color: C.red }}>ALERT</span></div>
      </div>
      {/* Sub label */}
      <div style={{
        marginTop: 30, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16,
        opacity: interpolate(lf, [fps * 0.5, fps * 1], [0, 1], clamp),
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.red, boxShadow: `0 0 12px ${C.red}` }} />
        <span style={{ color: C.red, fontSize: 24, fontWeight: 800, letterSpacing: '0.4em', fontFamily: 'Inter' }}>
          MARKET STRUCTURE SHIFT
        </span>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.red, boxShadow: `0 0 12px ${C.red}` }} />
      </div>
    </div>
  );
};

// ── Ticker Badge ──
const TickerBadge: React.FC<{ frame: number; fps: number; ticker: string }> = ({ frame, fps, ticker }) => {
  const startF = fps * 1.8;
  const lf = frame - startF;
  if (lf < 0) return null;
  const slideY = spring({ frame: lf, fps, from: 100, to: 0, config: { damping: 14, stiffness: 90 } });
  const opacity = interpolate(lf, [0, fps * 0.4], [0, 1], clamp);
  const pulse = lf > fps * 0.5 ? Math.sin(lf * 0.15) * 0.03 + 1 : 1;

  return (
    <div style={{
      position: 'absolute', bottom: 180, left: 0, right: 0,
      textAlign: 'center', opacity, transform: `translateY(${slideY}px) scale(${pulse})`,
    }}>
      <div style={{ color: '#94a3b8', fontSize: 22, fontWeight: 700, letterSpacing: '0.35em', marginBottom: 16, fontFamily: 'Inter' }}>
        AFFECTED
      </div>
      <div style={{
        display: 'inline-block', padding: '24px 56px',
        background: 'rgba(239,68,68,0.12)', border: `3px solid ${C.red}`, borderRadius: 20,
        boxShadow: `0 0 40px rgba(239,68,68,0.4), inset 0 0 30px rgba(239,68,68,0.1)`,
      }}>
        <span style={{
          color: C.red, fontSize: 96, fontWeight: 900, letterSpacing: '-0.03em',
          fontFamily: 'Inter', textShadow: `0 0 20px rgba(239,68,68,0.6)`,
        }}>${ticker}</span>
      </div>
    </div>
  );
};

// ── Scanline + Vignette ──
const ScanlineOverlay: React.FC = () => (
  <AbsoluteFill style={{
    background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, transparent 1px, transparent 4px)',
    pointerEvents: 'none', mixBlendMode: 'overlay',
  }} />
);

const Vignette: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const intensity = interpolate(frame, [0, fps, fps * 3], [0.3, 0.5, 0.7], clamp);
  return (
    <AbsoluteFill style={{
      background: `radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,${intensity}) 100%)`,
      pointerEvents: 'none',
    }} />
  );
};

// ── Main Export ──
export const Scene1_Hook: React.FC<Scene1Props> = ({ ticker }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const shakeIntensity = interpolate(frame, [0, fps * 0.3, fps * 0.5], [40, 20, 0], clamp);
  const shakeX = (random(`sx-${frame}`) - 0.5) * shakeIntensity;
  const shakeY = (random(`sy-${frame}`) - 0.5) * shakeIntensity;
  const shakeR = (random(`sr-${frame}`) - 0.5) * (shakeIntensity / 20);

  return (
    <AbsoluteFill style={{
      backgroundColor: C.bg, overflow: 'hidden',
      transform: `translate(${shakeX}px, ${shakeY}px) rotate(${shakeR}deg)`,
    }}>
      <RedFlash frame={frame} fps={fps} />
      <PulseRings frame={frame} fps={fps} />
      <WarningIcon frame={frame} fps={fps} />
      <GlitchText frame={frame} fps={fps} />
      <TickerBadge frame={frame} fps={fps} ticker={ticker} />
      <ScanlineOverlay />
      <Vignette frame={frame} fps={fps} />
    </AbsoluteFill>
  );
};
