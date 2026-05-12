// ============================================================================
// Scene 3: X-RAY SCAN (8~14s) — GEX 게이지 + Dark Pool
// GPT 베이스 (레이저 스캔→위치 기반 reveal + 게이지 + 노드 네트워크)
// + Claude 숫자 카운트업 + 끝점 글로우 + "SCANNING" 텍스트
// ============================================================================
import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import { C, WIDTH, HEIGHT } from '../design';

interface Scene3Props {
  ticker: string;
  gexRegime: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  gexLabel: string;
  darkPool: number;
  buyRatio: number;
  sellRatio: number;
  lang: 'en' | 'ko' | 'ja';
}

const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

const L = {
  en: { xray: 'Structural X-Ray', regime: 'GEX REGIME', dp: 'Dark Pool Activity', buy: 'Buy Flow', sell: 'Sell Flow', scan: 'SCANNING MARKET STRUCTURE', status: 'Detected status' },
  ko: { xray: '구조 X-Ray 분석', regime: 'GEX 레짐', dp: '다크풀 활동', buy: '매수 흐름', sell: '매도 흐름', scan: '시장 구조 스캔중', status: '감지 상태' },
  ja: { xray: '構造X-Ray分析', regime: 'GEXレジーム', dp: 'ダークプール', buy: '買いフロー', sell: '売りフロー', scan: '市場構造スキャン中', status: '検出ステータス' },
};

const regimeMeta = (regime: string) => {
  if (regime === 'NEGATIVE') return { color: C.red, target: 0.24, needle: -52, copy: 'MOVE AMPLIFICATION' };
  if (regime === 'NEUTRAL') return { color: C.muted, target: 0.5, needle: 0, copy: 'BALANCED STRUCTURE' };
  return { color: C.emerald, target: 0.78, needle: 52, copy: 'VOLATILITY DAMPENING' };
};

// ── Laser X-Ray Line ──
const XRayLaser: React.FC<{ scanX: number; label: string }> = ({ scanX, label }) => (
  <>
    <div style={{
      position: 'absolute', top: 130, bottom: 150, left: scanX, width: 4,
      background: `linear-gradient(to bottom, transparent, ${C.cyan}, #fff, ${C.cyan}, transparent)`,
      boxShadow: `0 0 22px ${C.cyan}, 0 0 70px rgba(34,211,238,.55)`,
      zIndex: 80,
    }} />
    <div style={{
      position: 'absolute', top: 130, bottom: 150, left: scanX - 85, width: 170,
      background: `linear-gradient(90deg, transparent, rgba(34,211,238,.10), rgba(34,211,238,.24), rgba(34,211,238,.10), transparent)`,
      mixBlendMode: 'screen', zIndex: 75,
    }} />
    <div style={{
      position: 'absolute', top: scanX > 200 && scanX < 900 ? 'auto' : '-999px',
      bottom: 160, left: 0, right: 0, textAlign: 'center',
      color: C.cyan, fontSize: 18, fontWeight: 700, letterSpacing: '0.3em',
      opacity: scanX > 200 && scanX < 900 ? 0.7 : 0, zIndex: 85,
      fontFamily: 'Inter',
    }}>◢ {label} ◣</div>
  </>
);

// ── Semi Gauge (GEX) ──
const SemiGauge: React.FC<{ regime: string; frame: number; fps: number; l: typeof L.en }> = ({ regime, frame, fps, l }) => {
  const meta = regimeMeta(regime);
  const gs = spring({ frame: frame - 48, fps, config: { damping: 20, stiffness: 95, mass: 0.9 } });
  const fill = interpolate(gs, [0, 1], [0, meta.target], clamp);
  const needleAngle = interpolate(gs, [0, 1], [-68, meta.needle], clamp);
  const labelOp = interpolate(frame, [52, 82], [0, 1], clamp);
  const labelY = interpolate(frame, [52, 82], [18, 0], clamp);

  return (
    <div style={{
      position: 'absolute', left: 90, right: 90, top: 650, height: 520,
      borderRadius: 34, border: '1px solid rgba(255,255,255,.08)',
      background: 'linear-gradient(135deg, rgba(255,255,255,.055), rgba(255,255,255,.015))',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.10), 0 24px 70px rgba(0,0,0,.28)',
      overflow: 'hidden',
    }}>
      <svg viewBox="0 0 900 500" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
          <linearGradient id="semiGG" x1="120" y1="0" x2="780" y2="0">
            <stop stopColor={C.red} /><stop offset="0.5" stopColor={C.purple} /><stop offset="1" stopColor={C.emerald} />
          </linearGradient>
          <filter id="gGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d="M150 350 A300 300 0 0 1 750 350" fill="none" stroke="#1e293b" strokeWidth="34" strokeLinecap="round" />
        <path d="M150 350 A300 300 0 0 1 750 350" fill="none" stroke="url(#semiGG)" strokeWidth="34" strokeLinecap="round"
          pathLength={1} strokeDasharray={1} strokeDashoffset={1 - fill} filter="url(#gGlow)" />
        {[-60, -30, 0, 30, 60].map(a => (
          <line key={a} x1="450" y1="92" x2="450" y2="123" stroke="rgba(241,245,249,.34)" strokeWidth="3" strokeLinecap="round" transform={`rotate(${a} 450 350)`} />
        ))}
        <line x1="450" y1="350" x2="450" y2="136" stroke={meta.color} strokeWidth="8" strokeLinecap="round"
          transform={`rotate(${needleAngle} 450 350)`} filter="url(#gGlow)" />
        <circle cx="450" cy="350" r="34" fill="#0f172a" stroke={meta.color} strokeWidth="6" />
        <circle cx="450" cy="350" r="12" fill={meta.color} />
        <text x="160" y="420" fill={C.red} fontSize="22" fontWeight="900" letterSpacing="3">AMPLIFY</text>
        <text x="385" y="452" fill={C.muted} fontSize="22" fontWeight="900" letterSpacing="3">NEUTRAL</text>
        <text x="640" y="420" fill={C.emerald} fontSize="22" fontWeight="900" letterSpacing="3">DAMPEN</text>
      </svg>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 108, textAlign: 'center',
        opacity: labelOp, transform: `translateY(${labelY}px)`,
      }}>
        <div style={{ color: C.muted, fontSize: 18, fontWeight: 900, letterSpacing: '0.34em', textTransform: 'uppercase' }}>{l.regime}</div>
        <div style={{ marginTop: 18, color: meta.color, fontSize: 66, lineHeight: 0.9, fontWeight: 900, letterSpacing: '-0.05em', textShadow: `0 0 28px ${meta.color}66` }}>{regime}</div>
      </div>
    </div>
  );
};

// ── Dark Pool Panel ──
const DarkPoolPanel: React.FC<{ dp: number; buy: number; sell: number; frame: number; fps: number; l: typeof L.en }> = ({ dp, buy, sell, frame, fps, l }) => {
  const reveal = spring({ frame: frame - 72, fps, config: { damping: 22, stiffness: 110, mass: 0.8 } });
  const width = interpolate(reveal, [0, 1], [0, dp], clamp);
  const opacity = interpolate(frame, [62, 92], [0, 1], clamp);
  const y = interpolate(frame, [62, 92], [28, 0], clamp);

  return (
    <div style={{
      position: 'absolute', left: 90, right: 90, top: 1220, height: 310, borderRadius: 34,
      border: '1px solid rgba(255,255,255,.08)',
      background: 'linear-gradient(135deg, rgba(255,255,255,.055), rgba(255,255,255,.015))',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.10), 0 24px 70px rgba(0,0,0,.28)',
      padding: '44px 46px', opacity, transform: `translateY(${y}px)`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: C.muted, fontSize: 18, fontWeight: 900, letterSpacing: '0.34em', textTransform: 'uppercase' }}>{l.dp}</div>
          <div style={{ marginTop: 22, color: C.purple, fontSize: 72, lineHeight: 0.85, fontWeight: 900, letterSpacing: '-0.06em', textShadow: `0 0 30px ${C.purple}66` }}>{dp.toFixed(1)}%</div>
        </div>
        <div style={{ padding: '13px 21px', borderRadius: 999, border: `1px solid rgba(245,158,11,.44)`, background: 'rgba(245,158,11,.08)', color: C.amber, fontSize: 18, fontWeight: 900, letterSpacing: '0.14em' }}>ELEVATED</div>
      </div>
      <div style={{ marginTop: 44, width: '100%', height: 18, borderRadius: 999, background: '#1e293b', overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: `${width}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${C.purple}, ${C.cyan})`, boxShadow: `0 0 26px ${C.purple}` }} />
        {width > 5 && <div style={{
          position: 'absolute', top: '50%', left: `${width}%`, transform: 'translate(-50%, -50%)',
          width: 28, height: 28, borderRadius: '50%', background: C.cyan,
          boxShadow: `0 0 30px ${C.cyan}, 0 0 60px rgba(34,211,238,0.5)`,
        }} />}
      </div>
      <div style={{ marginTop: 31, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div>
          <div style={{ color: C.muted, fontSize: 16, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{l.buy}</div>
          <div style={{ marginTop: 8, color: C.emerald, fontSize: 34, fontWeight: 900 }}>{buy}%</div>
        </div>
        <div>
          <div style={{ color: C.muted, fontSize: 16, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{l.sell}</div>
          <div style={{ marginTop: 8, color: C.red, fontSize: 34, fontWeight: 900 }}>{sell}%</div>
        </div>
      </div>
    </div>
  );
};

// ── Main Export ──
export const Scene3_XRay: React.FC<Scene3Props> = ({ ticker, gexRegime, gexLabel, darkPool, buyRatio, sellRatio, lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const meta = regimeMeta(gexRegime);
  const l = L[lang] || L.en;

  const scanX = interpolate(frame, [0, 150], [-140, WIDTH + 140], clamp);
  const titleSpring = spring({ frame: frame - 8, fps, config: { damping: 20, stiffness: 115, mass: 0.8 } });
  const titleOp = interpolate(frame, [0, 24], [0, 1], clamp);
  const titleY = interpolate(titleSpring, [0, 1], [42, 0], clamp);

  const revealFromScan = (x: number) => interpolate(scanX, [x - 190, x + 60], [0, 1], clamp);
  const gaugeReveal = revealFromScan(355);
  const poolReveal = revealFromScan(620);

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, fontFamily: 'Inter, sans-serif', color: C.text, overflow: 'hidden' }}>
      {/* Background */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 75% 38%, rgba(34,211,238,.13), transparent 34%), radial-gradient(circle at 30% 42%, rgba(168,85,247,.12), transparent 38%), ${C.bg}`,
      }} />
      <div style={{ position: 'absolute', inset: 0, opacity: 0.32, backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

      {/* Title */}
      <div style={{ position: 'absolute', left: 68, top: 180, opacity: titleOp, transform: `translateY(${titleY}px)`, zIndex: 25 }}>
        <div style={{ color: C.muted, fontSize: 18, fontWeight: 900, letterSpacing: '0.34em', textTransform: 'uppercase', marginBottom: 22 }}>{l.xray}</div>
        <h2 style={{ margin: 0, color: C.text, fontSize: 76, lineHeight: 0.98, fontWeight: 900, letterSpacing: '-0.065em', maxWidth: 850 }}>
          {l.regime}<br />
          <span style={{ background: `linear-gradient(105deg, ${C.purple}, ${C.cyan})`, WebkitBackgroundClip: 'text', color: 'transparent' }}>X-Ray Scan</span>
        </h2>
        <div style={{ marginTop: 30, display: 'flex', alignItems: 'center', gap: 16, color: '#cbd5e1', fontSize: 25, fontWeight: 700 }}>
          <span style={{ color: C.cyan, fontWeight: 900 }}>${ticker}</span>
          <span style={{ color: C.muted }}>•</span>
          <span>{gexLabel}</span>
        </div>
      </div>

      {/* Panels revealed by scan */}
      <div style={{ opacity: gaugeReveal }}>
        <SemiGauge regime={gexRegime} frame={frame} fps={fps} l={l} />
      </div>
      <div style={{ opacity: poolReveal }}>
        <DarkPoolPanel dp={darkPool} buy={buyRatio} sell={sellRatio} frame={frame} fps={fps} l={l} />
      </div>

      {/* Status strip */}
      <div style={{
        position: 'absolute', left: 90, right: 90, bottom: 250, height: 82, borderRadius: 18,
        border: `1px solid ${meta.color}55`, background: `linear-gradient(90deg, ${meta.color}16, rgba(255,255,255,.02))`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 30px',
        opacity: interpolate(frame, [105, 135], [0, 1], clamp), zIndex: 30,
      }}>
        <span style={{ color: C.muted, fontSize: 18, fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase' }}>{l.status}</span>
        <span style={{ color: meta.color, fontSize: 28, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', textShadow: `0 0 18px ${meta.color}66` }}>{meta.copy}</span>
      </div>

      <XRayLaser scanX={scanX} label={l.scan} />
    </AbsoluteFill>
  );
};
