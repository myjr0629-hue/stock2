'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// ============================================================================
// Pinterest Market Close — Full Dashboard Pin (1000×1500)
// 3대 지수 스파크라인 + VIX + Dark Pool + GEX Regime + Fear & Greed
// ============================================================================

function MarketClosePinContent() {
  const sp = useSearchParams();
  const spy = parseFloat(sp.get('spy') || '0');
  const qqq = parseFloat(sp.get('qqq') || '0');
  const dia = parseFloat(sp.get('dia') || '0');
  const vix = parseFloat(sp.get('vix') || '18');
  const dp = parseFloat(sp.get('dp') || '0');
  const gex = (sp.get('gex') || 'neutral').toLowerCase();
  const fgi = parseInt(sp.get('fgi') || '50', 10);
  const date = sp.get('date') || new Date().toISOString().split('T')[0];

  // Format helpers
  const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const clr = (v: number) => v > 0 ? '#34d399' : v < 0 ? '#f87171' : '#94a3b8';

  // VIX
  const vixColor = vix >= 30 ? '#f87171' : vix >= 25 ? '#f97316' : vix >= 18 ? '#fbbf24' : '#34d399';
  const vixLabel = vix >= 30 ? 'EXTREME' : vix >= 25 ? 'HIGH' : vix >= 18 ? 'ELEVATED' : 'CALM';

  // GEX
  const gexCfg: Record<string, { color: string; label: string; pct: number }> = {
    positive:   { color: '#34d399', label: 'POSITIVE',   pct: 73 },
    negative:   { color: '#f87171', label: 'NEGATIVE',   pct: 18 },
    neutral:    { color: '#94a3b8', label: 'NEUTRAL',    pct: 50 },
    transition: { color: '#fbbf24', label: 'TRANSITION', pct: 50 },
  };
  const g = gexCfg[gex] || gexCfg.neutral;

  // Fear & Greed
  const fgiLabel = fgi >= 75 ? 'EXTREME GREED' : fgi >= 55 ? 'GREED' : fgi >= 45 ? 'NEUTRAL' : fgi >= 25 ? 'FEAR' : 'EXTREME FEAR';
  const fgiColor = fgi >= 55 ? '#34d399' : fgi >= 45 ? '#fbbf24' : '#f87171';
  const needleAngle = -90 + (fgi / 100) * 180;

  // Dark pool
  const dpColor = dp >= 40 ? '#fbbf24' : '#22d3ee';

  // Date format
  const dateFmt = (() => {
    try { return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return date; }
  })();

  // Sparkline generator
  const makeSpark = (val: number, seed: number) => {
    const pts: number[] = [];
    let y = 40;
    for (let i = 0; i <= 12; i++) {
      const noise = Math.sin(i * 1.7 + seed) * 12 + Math.cos(i * 0.9 + seed * 2) * 8;
      y = 44 - (val * 30) + noise + (i / 12) * (val * -20);
      pts.push(Math.max(4, Math.min(84, y)));
    }
    const step = 440 / 12;
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(0)} ${p.toFixed(0)}`).join(' ');
  };

  const indices = [
    { title: 'S&P 500', val: spy, spark: makeSpark(spy, 1) },
    { title: 'NASDAQ',  val: qqq, spark: makeSpark(qqq, 2) },
    { title: 'DOW',     val: dia, spark: makeSpark(dia, 3) },
  ];

  const cardBase: React.CSSProperties = {
    position: 'relative',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.070), rgba(255,255,255,0.018)), rgba(10,17,30,0.72)',
    border: '1px solid rgba(255,255,255,0.16)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 42px rgba(0,0,0,0.28)',
    backdropFilter: 'blur(14px)',
    overflow: 'hidden',
  };

  return (
    <div className="ready" style={{
      position: 'relative', width: 1000, height: 1500, overflow: 'hidden',
      color: '#f1f5f9', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
      background: `
        radial-gradient(circle at 88% 14%, rgba(167,139,250,0.24), transparent 34%),
        radial-gradient(circle at 5% 92%, rgba(34,211,238,0.23), transparent 34%),
        linear-gradient(135deg, #040710 0%, #060d1a 100%)
      `,
      isolation: 'isolate',
    }}>
      {/* Grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, opacity: 0.42,
        backgroundImage: 'linear-gradient(rgba(34,211,238,0.075) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.075) 1px, transparent 1px)',
        backgroundSize: '36px 36px',
        maskImage: 'radial-gradient(circle at 50% 48%, black 0%, transparent 86%)',
        WebkitMaskImage: 'radial-gradient(circle at 50% 48%, black 0%, transparent 86%)',
      }} />
      {/* Scanline */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 90, pointerEvents: 'none', opacity: 0.045,
        background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.90) 0, rgba(255,255,255,0.90) 1px, transparent 1px, transparent 5px)',
        mixBlendMode: 'overlay' as const,
      }} />
      {/* Floor grid */}
      <div style={{
        position: 'absolute', left: -100, right: -100, bottom: -120, height: 265, opacity: 0.24, zIndex: 0,
        transform: 'perspective(500px) rotateX(62deg)', transformOrigin: 'bottom center',
        backgroundImage: 'linear-gradient(rgba(34,211,238,0.26) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.26) 1px, transparent 1px)',
        backgroundSize: '34px 34px',
      }} />

      {/* ── Header ── */}
      <div style={{
        position: 'absolute', left: 48, right: 48, top: 43, zIndex: 20,
        display: 'grid', gridTemplateColumns: '1fr 380px', alignItems: 'start',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192x192.png" alt="" style={{
            width: 70, height: 70, borderRadius: 13,
            filter: 'drop-shadow(0 0 20px rgba(34,211,238,0.28))',
          }} />
          <div style={{
            width: 1, height: 70,
            background: 'linear-gradient(to bottom, transparent, #22d3ee, transparent)',
            boxShadow: '0 0 18px rgba(34,211,238,0.48)',
          }} />
          <div>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em', textShadow: '0 0 18px rgba(255,255,255,0.10)' }}>
              SIGNUM <span style={{ color: '#22d3ee' }}>HQ</span>
            </div>
            <div style={{ marginTop: 10, color: '#94a3b8', fontSize: 17, fontWeight: 500 }}>See What Others Cannot</div>
          </div>
        </div>
        {/* Title */}
        <div style={{ textAlign: 'right', paddingTop: 15 }}>
          <div style={{ fontSize: 27, fontWeight: 900, letterSpacing: '0.46em', textTransform: 'uppercase' as const, textShadow: '0 0 18px rgba(255,255,255,0.16)' }}>MARKET CLOSE</div>
          <div style={{ width: 310, height: 3, marginTop: 19, marginLeft: 'auto', borderRadius: 999, background: 'linear-gradient(90deg, transparent, #22d3ee, #a78bfa, transparent)', boxShadow: '0 0 18px rgba(34,211,238,0.52)' }} />
          <div style={{ marginTop: 24, color: '#94a3b8', fontSize: 23, fontWeight: 500, letterSpacing: '0.10em' }}>{dateFmt}</div>
        </div>
      </div>

      {/* ── 3 Major Indices ── */}
      <div style={{ position: 'absolute', left: 46, right: 46, top: 182, zIndex: 15 }}>
        {indices.map((idx, i) => (
          <div key={idx.title} style={{
            ...cardBase,
            height: 172,
            display: 'grid', gridTemplateColumns: '350px 1fr', alignItems: 'center',
            padding: '26px 23px 20px 35px',
            borderColor: `${clr(idx.val)}44`,
            borderRadius: i === 0 ? '16px 16px 0 0' : i === 2 ? '0 0 16px 16px' : 0,
          }}>
            <div>
              <div style={{ fontSize: 29, fontWeight: 900, letterSpacing: '0.10em', textTransform: 'uppercase' as const }}>{idx.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 22 }}>
                <span style={{ color: clr(idx.val), fontSize: 74, lineHeight: 0.86, fontWeight: 900, letterSpacing: '-0.07em', textShadow: `0 0 32px ${clr(idx.val)}46` }}>{fmt(idx.val)}</span>
                <span style={{ color: clr(idx.val), fontSize: 43, filter: `drop-shadow(0 0 16px ${clr(idx.val)}50)` }}>{idx.val >= 0 ? '▲' : '▼'}</span>
              </div>
            </div>
            <div style={{ position: 'relative', height: 125 }}>
              <svg viewBox="0 0 440 88" style={{ width: '100%', height: '100%' }} fill="none">
                <path d={idx.spark} stroke={clr(idx.val)} strokeWidth="2.5" strokeLinecap="round" />
                <path d={`${idx.spark}V88H0Z`} fill={clr(idx.val)} opacity="0.14" />
                <path d="M0 44H440" stroke="rgba(255,255,255,0.25)" strokeDasharray="4 8" />
              </svg>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: -5, display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 14, fontWeight: 500 }}>
                <span>9:30</span><span>12:30</span><span>4:00</span>
              </div>
              <div style={{ position: 'absolute', right: 0, top: 4, bottom: 12, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'right', fontSize: 13, fontWeight: 700 }}>
                <span style={{ color: '#34d399' }}>+1%</span>
                <span style={{ color: '#f1f5f9' }}>0%</span>
                <span style={{ color: '#f87171' }}>-1%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Metric Cards ── */}
      <div style={{ position: 'absolute', left: 46, right: 46, top: 710, display: 'grid', gap: 12, zIndex: 18 }}>
        {/* VIX */}
        <div style={{ ...cardBase, borderColor: 'rgba(167,139,250,0.42)', borderRadius: 14, height: 150, padding: '24px 29px', display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 42px rgba(0,0,0,0.28), 0 0 24px rgba(167,139,250,0.08)' }}>
          <div style={{ width: 90, height: 90, borderRadius: '50%', border: '2px solid #a78bfa', display: 'grid', placeItems: 'center', boxShadow: '0 0 18px rgba(167,139,250,0.3)' }}>
            <svg width="48" height="48" viewBox="0 0 56 56" fill="none" stroke="#a78bfa" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 29h12l5-18 10 37 6-19h11" /></svg>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.16em' }}>VIX</div>
              <div style={{ marginTop: 10, fontSize: 58, lineHeight: 0.88, fontWeight: 900, letterSpacing: '-0.075em', color: vixColor, textShadow: `0 0 28px ${vixColor}38` }}>{vix.toFixed(1)}</div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 42, padding: '0 28px', borderRadius: 999, fontSize: 20, fontWeight: 900, letterSpacing: '0.17em', color: vixColor, border: `1.5px solid ${vixColor}bb`, background: `${vixColor}0f` }}>{vixLabel}</div>
          </div>
        </div>

        {/* Dark Pool */}
        <div style={{ ...cardBase, borderColor: 'rgba(34,211,238,0.58)', borderRadius: 14, height: 150, padding: '24px 29px', display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 42px rgba(0,0,0,0.28), 0 0 24px rgba(34,211,238,0.12)' }}>
          <div style={{ width: 90, height: 90, borderRadius: '50%', border: '2px solid #22d3ee', display: 'grid', placeItems: 'center', boxShadow: '0 0 18px rgba(34,211,238,0.3)' }}>
            <svg width="48" height="48" viewBox="0 0 56 56" fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M28 5C18 19 12 28 12 37a16 16 0 0 0 32 0c0-9-6-18-16-32Z" /></svg>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.16em' }}>DARK POOL</div>
              <div style={{ marginTop: 10, fontSize: 58, lineHeight: 0.88, fontWeight: 900, letterSpacing: '-0.075em', color: dpColor, textShadow: `0 0 28px ${dpColor}38` }}>{dp > 0 ? `${dp.toFixed(1)}%` : '—'}</div>
            </div>
            <div>
              <div style={{ height: 18, borderRadius: 999, background: 'rgba(148,163,184,0.12)', border: '1px solid rgba(34,211,238,0.48)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(dp * 2, 100)}%`, height: '100%', borderRadius: 'inherit', background: `linear-gradient(90deg, #22d3ee, ${dpColor})`, boxShadow: `0 0 23px ${dpColor}55` }} />
              </div>
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: 15, fontWeight: 500 }}><span>0%</span><span>100%</span></div>
            </div>
          </div>
        </div>

        {/* GEX Regime */}
        <div style={{ ...cardBase, borderColor: `${g.color}44`, borderRadius: 14, height: 150, padding: '24px 29px', display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 42px rgba(0,0,0,0.28), 0 0 24px ${g.color}14` }}>
          <div style={{ width: 90, height: 90, borderRadius: '50%', border: `2px solid ${g.color}`, display: 'grid', placeItems: 'center', boxShadow: `0 0 18px ${g.color}50` }}>
            <svg width="48" height="48" viewBox="0 0 56 56" fill="none" stroke={g.color} strokeWidth="4" strokeLinecap="round"><path d="M4 31c10-18 19-18 29 0s16 18 23 0" /></svg>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.16em' }}>GEX REGIME</div>
              <div style={{ marginTop: 10, fontSize: 52, lineHeight: 0.88, fontWeight: 900, letterSpacing: '-0.045em', color: g.color, textShadow: `0 0 26px ${g.color}36` }}>{g.label}</div>
            </div>
            <div>
              <div style={{ position: 'relative', height: 14, borderRadius: 999, background: 'linear-gradient(90deg, #f87171, #667085 48%, #34d399)' }}>
                <span style={{ position: 'absolute', left: `${g.pct}%`, top: -22, transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderTop: `22px solid ${g.color}`, filter: `drop-shadow(0 0 10px ${g.color}65)` }} />
              </div>
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800 }}>
                <span style={{ color: '#f87171' }}>Negative</span>
                <span style={{ color: '#94a3b8' }}>Neutral</span>
                <span style={{ color: '#34d399' }}>Positive</span>
              </div>
            </div>
          </div>
        </div>

        {/* Fear & Greed */}
        <div style={{ ...cardBase, borderColor: 'rgba(167,139,250,0.42)', borderRadius: 14, height: 150, padding: '24px 29px', display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 42px rgba(0,0,0,0.28), 0 0 24px rgba(167,139,250,0.08)' }}>
          <div style={{ width: 90, height: 90, borderRadius: '50%', border: '2px solid #e9d5ff', display: 'grid', placeItems: 'center', boxShadow: '0 0 18px rgba(233,213,255,0.2)' }}>
            <svg width="48" height="48" viewBox="0 0 56 56" fill="none" stroke="#e9d5ff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 39a18 18 0 0 1 36 0" /><path d="M28 39l10-16" /></svg>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 250px', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.16em' }}>FEAR &amp; GREED</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 10 }}>
                <span style={{ fontSize: 55, fontWeight: 900, lineHeight: 0.9, letterSpacing: '-0.075em' }}>{fgi}</span>
                <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '0.10em', color: fgiColor }}>{fgiLabel}</span>
              </div>
            </div>
            <svg viewBox="0 0 260 135" width={250} height={130} fill="none">
              <defs>
                <linearGradient id="fgGrad" x1="25" y1="112" x2="235" y2="112" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#f87171" /><stop offset="0.48" stopColor="#fbbf24" /><stop offset="1" stopColor="#34d399" />
                </linearGradient>
              </defs>
              <path d="M31 112A99 99 0 0 1 229 112" stroke="url(#fgGrad)" strokeWidth="16" strokeLinecap="butt" />
              <line x1="130" y1="112" x2={130 + 60 * Math.cos((needleAngle - 90) * Math.PI / 180)} y2={112 + 60 * Math.sin((needleAngle - 90) * Math.PI / 180)} stroke="#f1f5f9" strokeWidth="5" strokeLinecap="round" />
              <circle cx="130" cy="112" r="12" fill="#0b1220" stroke="#94a3b8" strokeWidth="2" />
              <text x="22" y="132" fill="#f87171" fontSize="17" fontWeight="800">0</text>
              <text x="220" y="132" fill="#34d399" fontSize="17" fontWeight="800">100</text>
            </svg>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 36, textAlign: 'center', color: '#94a3b8', fontSize: 15, fontWeight: 700, letterSpacing: '0.22em', zIndex: 20 }}>
        SIGNUM HQ&nbsp;&nbsp;·&nbsp;&nbsp;See What Others Cannot&nbsp;&nbsp;·&nbsp;&nbsp;signumhq.com
      </div>
    </div>
  );
}

export default function MarketClosePinPage() {
  return (
    <Suspense fallback={<div style={{ width: 1000, height: 1500, background: '#040710' }} />}>
      <MarketClosePinContent />
    </Suspense>
  );
}
