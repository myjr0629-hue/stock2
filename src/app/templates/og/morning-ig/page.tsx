'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// ============================================================================
// Instagram Morning Briefing — Single Image (1080×1080)
// SPY Overnight + VIX + GEX Regime + Dark Pool + Sunrise SVG
// ============================================================================

const SUNRISE_SVG = `<svg viewBox="0 0 660 420" fill="none">
<defs>
<radialGradient id="sunGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(384 300) rotate(90) scale(145 220)"><stop stop-color="#fbbf24" stop-opacity="0.55"/><stop offset="0.42" stop-color="#22d3ee" stop-opacity="0.18"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
<linearGradient id="sunGrad" x1="300" y1="230" x2="470" y2="333" gradientUnits="userSpaceOnUse"><stop stop-color="#fbbf24"/><stop offset="1" stop-color="#f97316"/></linearGradient>
<linearGradient id="horizonGrad" x1="0" y1="313" x2="660" y2="313" gradientUnits="userSpaceOnUse"><stop stop-color="#22d3ee" stop-opacity="0"/><stop offset="0.18" stop-color="#22d3ee"/><stop offset="0.42" stop-color="#fbbf24"/><stop offset="0.52" stop-color="#ffffff"/><stop offset="0.70" stop-color="#fbbf24"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></linearGradient>
<linearGradient id="nodeGrad" x1="92" y1="300" x2="640" y2="50" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset="0.48" stop-color="#fbbf24"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>
<filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="660" height="420" fill="url(#sunGlow)" opacity="0.95"/>
<g opacity="0.60" stroke-width="1.2"><path d="M154 313C204 170 520 164 581 313" stroke="#fbbf24" stroke-opacity="0.45"/><path d="M94 313C170 100 560 92 648 313" stroke="#22d3ee" stroke-opacity="0.25" stroke-dasharray="4 8"/><path d="M220 313C260 220 466 214 506 313" stroke="#fbbf24" stroke-opacity="0.28"/><path d="M270 313C300 250 430 246 456 313" stroke="#fbbf24" stroke-opacity="0.22"/></g>
<path d="M304 313A80 80 0 0 1 464 313Z" fill="url(#sunGrad)" opacity="0.98"/>
<path d="M304 313A80 80 0 0 1 464 313" stroke="#fff7ed" stroke-opacity="0.70" stroke-width="1.5"/>
<line x1="0" y1="313" x2="660" y2="313" stroke="url(#horizonGrad)" stroke-width="3"/>
<g opacity="0.42" stroke="#22d3ee"><path d="M0 334H660M0 352H660M0 370H660M0 388H660M0 406H660" stroke-opacity="0.22"/><path d="M74 313C56 342 37 380 15 420M156 313C142 348 128 384 112 420M384 313V420M548 313C568 352 590 386 620 420" stroke-opacity="0.15"/></g>
<g stroke="url(#nodeGrad)" stroke-width="1.5" opacity="0.95"><path d="M70 304 132 276 184 288 234 250 286 270 338 236 384 258 432 209 482 230 530 176 584 105 638 73"/><path d="M132 276V210M234 250V185M338 236V150M432 209V126M530 176V92M584 105V58" opacity="0.55"/></g>
<g filter="url(#nodeGlow)"><circle cx="70" cy="304" r="4" fill="#a78bfa"/><circle cx="132" cy="276" r="5" fill="#fbbf24"/><circle cx="184" cy="288" r="4" fill="#a78bfa"/><circle cx="234" cy="250" r="5" fill="#fbbf24"/><circle cx="286" cy="270" r="4" fill="#fbbf24"/><circle cx="338" cy="236" r="5" fill="#fbbf24"/><circle cx="384" cy="258" r="5" fill="#fff7ed"/><circle cx="432" cy="209" r="5" fill="#fbbf24"/><circle cx="482" cy="230" r="5" fill="#22d3ee"/><circle cx="530" cy="176" r="5" fill="#22d3ee"/><circle cx="584" cy="105" r="5" fill="#22d3ee"/><circle cx="638" cy="73" r="6" fill="#22d3ee"/></g>
</svg>`;

function MorningIGContent() {
  const sp = useSearchParams();
  const spy = parseFloat(sp.get('spy') || '0');
  const vix = parseFloat(sp.get('vix') || '18');
  const gex = (sp.get('gex') || 'neutral').toLowerCase();
  const dp = parseFloat(sp.get('dp') || '0');
  const insight = sp.get('insight') || '';
  const date = sp.get('date') || new Date().toISOString().split('T')[0];

  // SPY
  const spyPositive = spy >= 0;
  const spyColor = spyPositive ? '#34d399' : '#f87171';
  const spyDisplay = `${spyPositive ? '+' : ''}${spy.toFixed(2)}%`;

  // VIX
  const vixColor = vix >= 30 ? '#f87171' : vix >= 25 ? '#f97316' : vix >= 18 ? '#fbbf24' : '#34d399';
  const vixLabel = vix >= 30 ? 'EXTREME' : vix >= 25 ? 'HIGH' : vix >= 18 ? 'ELEVATED' : 'CALM';

  // GEX
  const gexCfg: Record<string, { color: string; label: string }> = {
    positive:   { color: '#34d399', label: 'POSITIVE' },
    negative:   { color: '#f87171', label: 'NEGATIVE' },
    neutral:    { color: '#94a3b8', label: 'NEUTRAL' },
    transition: { color: '#fbbf24', label: 'TRANSITION' },
  };
  const g = gexCfg[gex] || gexCfg.neutral;

  // DP
  const dpColor = dp >= 40 ? '#fbbf24' : '#a855f7';

  // Date
  const dateFmt = (() => {
    try { return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return date; }
  })();

  // Sparkline
  const makeSpark = (val: number) => {
    const pts: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const noise = Math.sin(i * 1.7 + 1) * 8 + Math.cos(i * 0.9 + 2) * 5;
      const y = 30 - (val * 20) + noise + (i / 10) * (val * -15);
      pts.push(Math.max(4, Math.min(48, y)));
    }
    const step = 345 / 10;
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(0)} ${p.toFixed(0)}`).join(' ');
  };
  const sparkPath = makeSpark(spy);

  const cardBase: React.CSSProperties = {
    position: 'relative', borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.070), rgba(255,255,255,0.018)), rgba(8,15,27,0.75)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 42px rgba(0,0,0,0.28)',
    backdropFilter: 'blur(14px)', overflow: 'hidden', padding: '28px 32px',
  };

  return (
    <div className="ready" style={{
      position: 'relative', width: 1080, height: 1080, overflow: 'hidden',
      color: '#f1f5f9', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
      background: `
        radial-gradient(ellipse at 50% 0%, rgba(251,191,36,0.13), transparent 45%),
        radial-gradient(circle at 85% 50%, rgba(34,211,238,0.10), transparent 35%),
        linear-gradient(135deg, #06090f 0%, #060d1a 100%)
      `,
      isolation: 'isolate',
    }}>
      {/* Grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, opacity: 0.36,
        backgroundImage: 'linear-gradient(rgba(34,211,238,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.08) 1px, transparent 1px)',
        backgroundSize: '36px 36px',
        maskImage: 'radial-gradient(circle at 85% 20%, black 0%, transparent 50%)',
        WebkitMaskImage: 'radial-gradient(circle at 85% 20%, black 0%, transparent 50%)',
      }} />
      {/* Scanline */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 100, pointerEvents: 'none', opacity: 0.03,
        background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.9) 0, rgba(255,255,255,0.9) 1px, transparent 1px, transparent 6px)',
        mixBlendMode: 'overlay' as const,
      }} />

      {/* ── Header ── */}
      <div style={{
        position: 'absolute', left: 50, right: 50, top: 52, zIndex: 30,
        display: 'grid', gridTemplateColumns: '360px 1fr', alignItems: 'start',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192x192.png" alt="" style={{
            width: 70, height: 70, borderRadius: 14,
            filter: 'drop-shadow(0 0 20px rgba(34,211,238,0.28))',
          }} />
          <div style={{ fontSize: 35, fontWeight: 800, letterSpacing: '-0.035em', textShadow: '0 0 18px rgba(255,255,255,0.10)' }}>
            SIGNUM <span style={{ color: '#22d3ee' }}>HQ</span>
          </div>
        </div>
        <div style={{ justifySelf: 'end', textAlign: 'right', paddingTop: 7 }}>
          <div style={{ color: '#fbbf24', fontSize: 27, fontWeight: 900, letterSpacing: '0.35em', textTransform: 'uppercase' as const, textShadow: '0 0 18px rgba(251,191,36,0.20)' }}>MORNING BRIEF</div>
          <div style={{ width: 310, height: 2, marginTop: 22, marginLeft: 'auto', borderRadius: 999, background: 'linear-gradient(90deg, transparent, #22d3ee, #a78bfa, transparent)', boxShadow: '0 0 18px rgba(34,211,238,0.48)' }} />
          <div style={{ marginTop: 24, color: '#94a3b8', fontSize: 24, fontWeight: 500, letterSpacing: '0.10em' }}>{dateFmt}</div>
        </div>
      </div>

      {/* ── Hero Title ── */}
      <div style={{ position: 'absolute', left: 50, top: 216, width: 575, zIndex: 18 }}>
        <h1 style={{
          margin: 0, fontSize: 82, lineHeight: 0.95, fontWeight: 900, letterSpacing: '-0.06em',
          background: 'linear-gradient(105deg, #c084fc, #a78bfa 30%, #67e8f9 70%, #22d3ee)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>Pre-Market<br/>Structure</h1>
        <div style={{ width: 315, height: 3, marginTop: 42, borderRadius: 999, background: 'linear-gradient(90deg, #a78bfa, #22d3ee)', boxShadow: '0 0 22px rgba(34,211,238,0.55)' }} />
      </div>

      {/* ── Sunrise SVG ── */}
      <div style={{ position: 'absolute', right: -26, top: 152, width: 660, height: 420, zIndex: 10 }}
        dangerouslySetInnerHTML={{ __html: SUNRISE_SVG }}
      />

      {/* ── 4 Metric Cards (2×2) ── */}
      <div style={{ position: 'absolute', left: 48, right: 48, top: 570, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, zIndex: 25 }}>
        {/* SPY Overnight */}
        <div style={{ ...cardBase, borderColor: `${spyColor}66`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), 0 0 26px ${spyColor}14, 0 18px 42px rgba(0,0,0,0.28)`, height: 210 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 25, alignItems: 'center', height: '100%' }}>
            <div style={{ width: 112, height: 112, borderRadius: '50%', border: `1.6px solid ${spyColor}`, display: 'grid', placeItems: 'center', boxShadow: `0 0 18px ${spyColor}40` }}>
              <svg width="70" height="70" viewBox="0 0 70 70" fill="none" stroke={spyColor} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 54V34M28 54V22M42 54V30M56 54V18" /><path d="M14 34l14-12 14 8 14-16" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 25, fontWeight: 900, letterSpacing: '0.20em' }}>SPY</div>
              <div style={{ marginTop: 21, fontSize: 62, lineHeight: 0.88, fontWeight: 900, letterSpacing: '-0.07em', color: spyColor, textShadow: `0 0 26px ${spyColor}36` }}>
                {spyDisplay} <span style={{ marginLeft: 18, fontSize: 36, filter: `drop-shadow(0 0 12px ${spyColor}52)` }}>{spyPositive ? '▲' : '▼'}</span>
              </div>
            </div>
          </div>
          {/* Sparkline */}
          <svg style={{ position: 'absolute', left: 158, right: 30, bottom: 18, height: 52, opacity: 0.95 }} viewBox="0 0 345 52" fill="none">
            <path d={sparkPath} stroke={spyColor} strokeWidth="2.6" strokeLinecap="round" />
            <path d={`${sparkPath}V52H0Z`} fill={spyColor} opacity="0.13" />
            <path d="M0 38H345" stroke="rgba(255,255,255,0.30)" strokeDasharray="5 8" />
          </svg>
        </div>

        {/* VIX Level */}
        <div style={{ ...cardBase, borderColor: 'rgba(34,211,238,0.46)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 0 26px rgba(34,211,238,0.08), 0 18px 42px rgba(0,0,0,0.28)', height: 210 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 25, alignItems: 'center', height: '100%' }}>
            <div style={{ width: 112, height: 112, borderRadius: '50%', border: '1.6px solid #a78bfa', display: 'grid', placeItems: 'center', boxShadow: '0 0 18px rgba(167,139,250,0.40)' }}>
              <svg width="70" height="70" viewBox="0 0 70 70" fill="none" stroke="#a78bfa" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 36h14l6-22 12 46 7-24h15" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 25, fontWeight: 900, letterSpacing: '0.20em' }}>VIX LEVEL</div>
              <div style={{ marginTop: 21, display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 62, lineHeight: 0.88, fontWeight: 900, letterSpacing: '-0.07em', textShadow: '0 8px 26px rgba(0,0,0,0.30)' }}>{vix.toFixed(1)}</span>
                <span style={{ marginLeft: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 48, padding: '0 28px', borderRadius: 999, fontSize: 22, fontWeight: 900, letterSpacing: '0.12em', color: vixColor, border: `1.5px solid ${vixColor}a8`, background: `${vixColor}14` }}>{vixLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* GEX Regime */}
        <div style={{ ...cardBase, borderColor: `${g.color}66`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), 0 0 26px ${g.color}14, 0 18px 42px rgba(0,0,0,0.28)`, height: 210 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 25, alignItems: 'center', height: '100%' }}>
            <div style={{ width: 112, height: 112, borderRadius: '50%', border: `1.6px solid ${g.color}`, display: 'grid', placeItems: 'center', boxShadow: `0 0 18px ${g.color}40` }}>
              <svg width="70" height="70" viewBox="0 0 70 70" fill="none" stroke={g.color} strokeWidth="5" strokeLinecap="round"><path d="M8 39c11-20 22-20 34 0s19 20 27 0" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 25, fontWeight: 900, letterSpacing: '0.20em' }}>GEX REGIME</div>
              <div style={{ marginTop: 21, fontSize: 62, lineHeight: 0.88, fontWeight: 900, letterSpacing: '-0.07em', color: g.color, textShadow: `0 0 26px ${g.color}36` }}>
                <span style={{ display: 'inline-block', width: 29, height: 29, borderRadius: '50%', marginRight: 18, background: g.color, boxShadow: `0 0 0 9px ${g.color}18, 0 0 24px ${g.color}`, verticalAlign: 'middle', transform: 'translateY(-5px)' }} />
                {g.label}
              </div>
            </div>
          </div>
        </div>

        {/* Dark Pool */}
        <div style={{ ...cardBase, borderColor: 'rgba(167,139,250,0.46)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 0 26px rgba(167,139,250,0.08), 0 18px 42px rgba(0,0,0,0.28)', height: 210, padding: '22px 28px 16px', display: 'flex', flexDirection: 'column' }}>
          {/* Row 1: Title + inline icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="24" height="24" viewBox="0 0 70 70" fill="none" stroke="#a78bfa" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"><path d="M35 8C23 24 16 35 16 46a19 19 0 0 0 38 0c0-11-7-22-19-38Z" /></svg>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.20em' }}>DARK POOL</div>
          </div>
          {/* Row 2: Big number */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ fontSize: 58, lineHeight: 1, fontWeight: 900, letterSpacing: '-0.06em', color: dpColor, textShadow: `0 0 26px ${dpColor}34` }}>
              {dp > 0 ? `${dp.toFixed(1)}%` : '—'}
              <span style={{ marginLeft: 16, fontSize: 20, fontWeight: 700, letterSpacing: '0.10em', color: dp >= 40 ? '#fbbf24' : '#a78bfa', opacity: 0.85, verticalAlign: 'middle' }}>{dp >= 40 ? 'HIGH' : 'MODERATE'}</span>
            </div>
          </div>
          {/* Row 3: Progress bar pinned to bottom */}
          <div>
            <div style={{ height: 14, borderRadius: 999, background: 'rgba(148,163,184,0.12)', border: '1px solid rgba(167,139,250,0.60)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(dp * 2, 100)}%`, height: '100%', borderRadius: 'inherit', background: 'linear-gradient(90deg, #a78bfa, #e879f9)', boxShadow: '0 0 24px rgba(167,139,250,0.56)' }} />
            </div>
            <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: 14, fontWeight: 500 }}><span>0%</span><span>100%</span></div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', left: 50, right: 50, bottom: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30 }}>
        <div style={{ position: 'absolute', left: 0, top: '50%', width: 320, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.26), transparent)' }} />
        <div style={{ position: 'absolute', right: 0, top: '50%', width: 320, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.26), transparent)' }} />
        <div style={{ color: '#94a3b8', fontSize: 23, fontWeight: 500, letterSpacing: '0.40em' }}>signumhq.com</div>
      </div>
    </div>
  );
}

export default function MorningIGPage() {
  return (
    <Suspense fallback={<div style={{ width: 1080, height: 1080, background: '#06090f' }} />}>
      <MorningIGContent />
    </Suspense>
  );
}
