// ============================================================================
// Scene 6: CTA (25~30s) — 브랜드 각인 + 행동 유도
// GPT 베이스 (SVG S마크, Shine sweep, Orbital)
// + Claude (단어별 태그라인, 입자, 코너마커, 비네팅)
// ============================================================================
import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import { C } from '../design';

interface Scene6Props {
  lang: 'en' | 'ko' | 'ja';
}

const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

const L = {
  en: { tagline: ['See', 'what', 'others', 'cannot.'], bottom: 'Institutional Intelligence · Democratized' },
  ko: { tagline: ['다른곳에서는', '볼수', '없는', '인사이트.'], bottom: '기관급 인텔리전스 · 대중화' },
  ja: { tagline: ['他では', '見えない', 'データを', '可視化.'], bottom: '機関級インテリジェンス · 民主化' },
};

// ── SVG S Mark (GPT path) ──
const GradientSMark: React.FC<{ scale: number; opacity: number }> = ({ scale, opacity }) => (
  <div style={{
    width: 250, height: 250, borderRadius: 56, display: 'grid', placeItems: 'center',
    opacity, transform: `scale(${scale})`,
    background: `radial-gradient(circle at 28% 18%, rgba(255,255,255,0.28), transparent 34%), linear-gradient(135deg, ${C.purple} 0%, #7c3aed 44%, ${C.cyan} 100%)`,
    boxShadow: `0 0 52px rgba(34,211,238,0.32), 0 0 96px rgba(168,85,247,0.20), inset 0 2px 0 rgba(255,255,255,0.24)`,
  }}>
    <svg width="148" height="148" viewBox="0 0 160 160" fill="none">
      <path d="M119 22H64C43 22 29 34 29 52c0 16 10 26 30 34l35 14c10 4 15 9 15 17 0 10-8 16-23 16H38"
        stroke={C.text} strokeWidth="21" strokeLinecap="round" strokeLinejoin="round" opacity="0.98" />
      <path d="M117 22 98 43M40 133 62 112" stroke={C.text} strokeWidth="21" strokeLinecap="round" opacity="0.92" />
    </svg>
  </div>
);

// ── Orbital Background ──
const OrbitalBg: React.FC = () => {
  const frame = useCurrentFrame();
  const rot = interpolate(frame, [0, 150], [0, 32], clamp);
  const revRot = interpolate(frame, [0, 150], [0, -22], clamp);
  const orbPulse = interpolate(frame % 90, [0, 45, 90], [0.86, 1.04, 0.86], clamp);
  const fadeIn = interpolate(frame, [0, 15], [0, 0.85], clamp);

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 36%, rgba(34,211,238,0.13), transparent 34%), radial-gradient(circle at 50% 63%, rgba(168,85,247,0.12), transparent 38%), ${C.bg}` }} />
      <div style={{
        position: 'absolute', left: '50%', top: '43%', width: 920, height: 920, marginLeft: -460, marginTop: -460,
        borderRadius: '50%', transform: `rotate(${rot}deg) scale(${orbPulse})`,
        background: 'conic-gradient(from 0deg, rgba(168,85,247,0.00), rgba(168,85,247,0.18), rgba(34,211,238,0.22), rgba(168,85,247,0.16), rgba(34,211,238,0.00))',
        filter: 'blur(22px)', opacity: fadeIn,
      }} />
      <div style={{
        position: 'absolute', left: '50%', top: '43%', width: 680, height: 680, marginLeft: -340, marginTop: -340,
        borderRadius: '50%', transform: `rotate(${revRot}deg)`,
        border: `1px solid rgba(34,211,238,0.13)`,
        boxShadow: `0 0 80px rgba(34,211,238,0.08), inset 0 0 60px rgba(168,85,247,0.07)`,
      }} />
      <div style={{
        position: 'absolute', left: '50%', top: '43%', width: 460, height: 460, marginLeft: -230, marginTop: -230,
        borderRadius: '50%', transform: `rotate(${rot * 1.35}deg)`, border: '1px dashed rgba(168,85,247,0.16)',
      }} />
    </>
  );
};

// ── Particle Field (Claude) ──
const Particles: React.FC = () => {
  const frame = useCurrentFrame();
  const particles = Array.from({ length: 20 }, (_, i) => i);
  return (
    <AbsoluteFill style={{ opacity: 0.7, pointerEvents: 'none' }}>
      {particles.map(i => {
        const bx = (i * 137.5) % 1080;
        const by = (i * 251.3) % 1920;
        const fx = Math.sin(frame * 0.02 + i) * 30;
        const fy = Math.cos(frame * 0.015 + i * 0.7) * 40;
        const tw = Math.sin(frame * 0.08 + i * 1.3) * 0.5 + 0.5;
        const color = i % 2 === 0 ? C.purple : C.cyan;
        const size = 2 + (i % 3);
        return (
          <div key={i} style={{
            position: 'absolute', left: bx + fx, top: by + fy,
            width: size, height: size, borderRadius: '50%',
            background: color, opacity: tw * 0.7,
            boxShadow: `0 0 ${size * 4}px ${color}`,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

// ── Pulsing CTA Button (GPT shine sweep) ──
const CTAButton: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = interpolate(frame, [72, 96], [0, 1], clamp);
  const y = interpolate(frame, [72, 96], [34, 0], clamp);
  const breath = interpolate(frame % 60, [0, 30, 60], [1, 1.045, 1], clamp);
  const glow = interpolate(frame % 60, [0, 30, 60], [0.22, 0.52, 0.22], clamp);
  const shineX = interpolate(frame % 75, [0, 75], [-170, 420], clamp);

  return (
    <div style={{
      position: 'relative', opacity: fade, transform: `translateY(${y}px) scale(${breath})`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 560, height: 92, padding: '0 48px', borderRadius: 999,
      overflow: 'hidden', color: C.text,
      border: `1px solid rgba(34,211,238,0.48)`,
      background: 'linear-gradient(135deg, rgba(255,255,255,.085), rgba(255,255,255,.025))',
      boxShadow: `0 0 38px rgba(34,211,238,${glow}), 0 0 72px rgba(168,85,247,${glow * 0.46}), inset 0 1px 0 rgba(255,255,255,0.13)`,
      backdropFilter: 'blur(16px)',
    }}>
      <div style={{
        position: 'absolute', top: -20, bottom: -20, left: shineX, width: 120,
        transform: 'rotate(18deg)',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)',
        mixBlendMode: 'screen',
      }} />
      <span style={{ position: 'relative', zIndex: 2, fontSize: 36, lineHeight: 1, fontWeight: 900, letterSpacing: '0.06em' }}>
        signumhq.com →
      </span>
    </div>
  );
};

// ── Corner Markers (Claude) ──
const Corners: React.FC<{ opacity: number }> = ({ opacity }) => {
  const s: React.CSSProperties = { position: 'absolute', width: 60, height: 60, opacity };
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ ...s, top: 60, left: 60, borderTop: `2px solid ${C.purple}`, borderLeft: `2px solid ${C.purple}` }} />
      <div style={{ ...s, top: 60, right: 60, borderTop: `2px solid ${C.cyan}`, borderRight: `2px solid ${C.cyan}` }} />
      <div style={{ ...s, bottom: 60, left: 60, borderBottom: `2px solid ${C.cyan}`, borderLeft: `2px solid ${C.cyan}` }} />
      <div style={{ ...s, bottom: 60, right: 60, borderBottom: `2px solid ${C.purple}`, borderRight: `2px solid ${C.purple}` }} />
    </AbsoluteFill>
  );
};

// ── Main Export ──
export const Scene6_CTA: React.FC<Scene6Props> = ({ lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const l = L[lang] || L.en;

  const markSpring = spring({ frame: frame - 8, fps, config: { damping: 11, stiffness: 145, mass: 0.72 } });
  const markScale = interpolate(markSpring, [0, 1], [0.18, 1], clamp);
  const markOp = interpolate(frame, [4, 18], [0, 1], clamp);

  const wordOp = interpolate(frame, [26, 46], [0, 1], clamp);
  const wordY = interpolate(frame, [26, 46], [28, 0], clamp);
  const ls = interpolate(frame, [26, 88], [0.58, 0.16], clamp);

  const cornerOp = interpolate(frame, [fps * 0.5, fps * 1.5], [0, 0.5], clamp);
  const subtleScale = interpolate(frame, [0, 150], [1.015, 1], clamp);

  // Tagline word-by-word (Claude)
  const taglineOp = interpolate(frame, [55, 70], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: 'hidden', fontFamily: 'Inter, sans-serif', color: C.text }}>
      <OrbitalBg />
      <Particles />
      <Corners opacity={cornerOp} />

      {/* Main content */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 310,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        transform: `scale(${subtleScale})`, transformOrigin: 'center center',
      }}>
        <GradientSMark scale={markScale} opacity={markOp} />

        {/* SIGNUM HQ */}
        <div style={{
          marginTop: 64, opacity: wordOp, transform: `translateY(${wordY}px)`,
          color: C.text, fontSize: 76, lineHeight: 1, fontWeight: 900,
          letterSpacing: `${ls}em`, textAlign: 'center',
          textShadow: '0 0 28px rgba(255,255,255,0.13), 0 12px 44px rgba(0,0,0,0.35)',
        }}>SIGNUM HQ</div>

        {/* Tagline word-by-word */}
        <div style={{
          marginTop: 34, opacity: taglineOp, textAlign: 'center',
          fontSize: 42, fontWeight: 800, fontFamily: 'Inter',
        }}>
          {l.tagline.map((word, i) => {
            const wDelay = 55 + i * fps * 0.15;
            const wOp = interpolate(frame, [wDelay, wDelay + fps * 0.3], [0, 1], clamp);
            const isHighlight = i === l.tagline.length - 1;
            return (
              <span key={i} style={{
                opacity: wOp, display: 'inline-block', marginRight: 12,
                color: isHighlight ? C.cyan : C.text,
                textShadow: isHighlight ? `0 0 20px rgba(34,211,238,0.5)` : 'none',
              }}>{word}</span>
            );
          })}
        </div>

        {/* CTA Button */}
        <div style={{ marginTop: 72 }}>
          <CTAButton />
        </div>
      </div>

      {/* Bottom divider + text */}
      <div style={{
        position: 'absolute', left: 90, right: 90, bottom: 148, height: 1,
        background: `linear-gradient(90deg, transparent, rgba(168,85,247,0.36), rgba(34,211,238,0.40), transparent)`,
      }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 92, textAlign: 'center',
        color: 'rgba(148,163,184,0.68)', fontSize: 18, fontWeight: 700,
        letterSpacing: '0.28em', textTransform: 'uppercase',
      }}>{l.bottom}</div>

      {/* Vignette */}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)',
        pointerEvents: 'none',
      }} />
    </AbsoluteFill>
  );
};
