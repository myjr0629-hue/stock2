'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const SUNRISE_SVG = `<svg viewBox="0 0 600 370" fill="none" style="width:100%;height:100%;overflow:visible">
<defs>
<radialGradient id="sG" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(300 232) rotate(90) scale(130)"><stop stop-color="#fbbf24"/><stop offset=".35" stop-color="#f59e0b" stop-opacity=".9"/><stop offset=".7" stop-color="#22d3ee" stop-opacity=".5"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
<radialGradient id="sH" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(300 232) rotate(90) scale(250 320)"><stop stop-color="#fbbf24" stop-opacity=".45"/><stop offset=".3" stop-color="#f59e0b" stop-opacity=".2"/><stop offset=".55" stop-color="#22d3ee" stop-opacity=".12"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
<linearGradient id="sL" x1="0" y1="232" x2="600" y2="232" gradientUnits="userSpaceOnUse"><stop stop-color="#06090f" stop-opacity="0"/><stop offset=".15" stop-color="#22d3ee" stop-opacity=".4"/><stop offset=".35" stop-color="#fbbf24" stop-opacity=".7"/><stop offset=".52" stop-color="#f1f5f9" stop-opacity="1"/><stop offset=".68" stop-color="#fbbf24" stop-opacity=".6"/><stop offset=".85" stop-color="#22d3ee" stop-opacity=".4"/><stop offset="1" stop-color="#06090f" stop-opacity="0"/></linearGradient>
<linearGradient id="nG" x1="40" y1="50" x2="570" y2="290" gradientUnits="userSpaceOnUse"><stop stop-color="#a78bfa"/><stop offset=".45" stop-color="#fbbf24"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>
<radialGradient id="hG" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(300 240) scale(300 60)"><stop stop-color="#22d3ee" stop-opacity=".35"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
<filter id="gC" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" result="b"/><feColorMatrix in="b" type="matrix" values="0 0 0 0 .13 0 0 0 0 .83 0 0 0 0 .93 0 0 0 .72 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="gA" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" result="b"/><feColorMatrix in="b" type="matrix" values="0 0 0 0 .98 0 0 0 0 .75 0 0 0 0 .14 0 0 0 .72 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="sunGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="18" result="b"/><feColorMatrix in="b" type="matrix" values="0 0 0 0 .98 0 0 0 0 .75 0 0 0 0 .14 0 0 0 .85 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<!-- Ambient halo -->
<rect x="0" y="0" width="600" height="370" fill="url(#sH)" opacity=".9"/>
<!-- Orbital arcs -->
<g opacity=".7"><path d="M80 230C145 80 460 72 520 228" stroke="#fbbf24" stroke-opacity=".5" stroke-width="1.2"/><path d="M40 230C120 20 488 14 565 226" stroke="#f1f5f9" stroke-opacity=".5" stroke-width="1" stroke-dasharray="2 4"/><path d="M140 230C180 130 420 124 460 228" stroke="#fbbf24" stroke-opacity=".35" stroke-width="1"/><ellipse cx="300" cy="228" rx="175" ry="28" stroke="#f1f5f9" stroke-opacity=".55"/><ellipse cx="300" cy="234" rx="210" ry="38" stroke="#22d3ee" stroke-opacity=".3"/><ellipse cx="300" cy="240" rx="270" ry="50" stroke="#fbbf24" stroke-opacity=".18"/></g>
<!-- Sun body with glow -->
<path d="M205 232A95 95 0 0 1 395 232Z" fill="url(#sG)" opacity="1" filter="url(#sunGlow)"/>
<path d="M215 232A85 85 0 0 1 385 232Z" fill="#fbbf24" opacity=".85"/>
<path d="M230 232A70 70 0 0 1 370 232Z" fill="#fde68a" opacity=".5"/>
<!-- Horizon line with strong cyan glow -->
<rect x="0" y="228" width="600" height="12" fill="url(#hG)"/>
<line x1="0" y1="232" x2="600" y2="232" stroke="url(#sL)" stroke-width="2.5"/>
<line x1="40" y1="234" x2="560" y2="234" stroke="#22d3ee" stroke-opacity=".35" stroke-width="1"/>
<!-- Dark lower sea grid -->
<g opacity=".3"><path d="M0 250H600M0 264H600M0 278H600M0 292H600M0 306H600M0 320H600M0 334H600" stroke="#22d3ee" stroke-opacity=".2"/><path d="M80 232C65 260 48 295 24 340M148 232C142 264 132 300 118 350M300 232V365M455 232C462 264 472 302 488 350M525 232C544 262 565 298 596 348" stroke="#22d3ee" stroke-opacity=".13"/></g>
<!-- Rising data nodes and lines -->
<g stroke="url(#nG)" stroke-width="1.2" opacity=".78"><path d="M48 205 110 162 160 198 215 132 280 198 345 118 400 170 468 95 548 170"/><path d="M110 162V108M160 198V62M215 132V80M280 198V36M345 118V62M400 170V72M468 95V38M548 170V82"/></g>
<g><circle cx="48" cy="205" r="4.5" fill="#22d3ee" filter="url(#gC)"/><circle cx="110" cy="162" r="4.5" fill="#fbbf24" filter="url(#gA)"/><circle cx="160" cy="198" r="6" fill="#22d3ee" filter="url(#gC)"/><circle cx="215" cy="132" r="6" fill="#a78bfa"/><circle cx="280" cy="198" r="4" fill="#f1f5f9"/><circle cx="345" cy="118" r="4.5" fill="#fbbf24" filter="url(#gA)"/><circle cx="400" cy="170" r="4" fill="#fff7ed"/><circle cx="468" cy="95" r="5" fill="#22d3ee" filter="url(#gC)"/><circle cx="548" cy="170" r="7" fill="#22d3ee" filter="url(#gC)"/><circle cx="110" cy="108" r="3" fill="#fbbf24"/><circle cx="160" cy="62" r="3" fill="#22d3ee"/><circle cx="215" cy="80" r="4" fill="#fbbf24"/><circle cx="280" cy="36" r="4" fill="#fbbf24"/><circle cx="345" cy="62" r="3" fill="#22d3ee"/><circle cx="400" cy="72" r="4" fill="#94a3b8"/><circle cx="468" cy="38" r="4" fill="#22d3ee"/><circle cx="548" cy="82" r="3" fill="#22d3ee"/></g>
<!-- Sparkles -->
<g fill="#f1f5f9" opacity=".85"><circle cx="70" cy="38" r="1.5"/><circle cx="130" cy="82" r="1.5"/><circle cx="195" cy="38" r="1.4"/><circle cx="260" cy="25" r="1.3"/><circle cx="325" cy="32" r="1.4"/><circle cx="480" cy="22" r="1.4"/><circle cx="580" cy="142" r="1.3"/><circle cx="540" cy="50" r="1.2"/><circle cx="380" cy="45" r="1.3"/></g>
</svg>`;


function MorningContent() {
  const sp = useSearchParams();
  const spy = sp.get('spy') || '+0.84';
  const vix = sp.get('vix') || '18.2';
  const gex = sp.get('gex') || 'positive';
  const dp = sp.get('dp') || '39.2';
  const insight = sp.get('insight') || 'Dealers expected to dampen volatility today. Key level: SPY $542';
  const format = sp.get('format') || 'og';
  const isStory = format === 'story';
  const now = new Date();
  const dateStr = sp.get('date') || now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const spyVal = parseFloat(spy);
  const spyPositive = spyVal >= 0;
  const gexPositive = gex.toLowerCase() === 'positive';
  const gexColor = gexPositive ? '#34d399' : '#f87171';
  const spyDisplay = spyPositive ? `+${Math.abs(spyVal).toFixed(2)}%` : `${spyVal.toFixed(2)}%`;

  const vixNum = parseFloat(vix);
  const vixStatus = vixNum < 16 ? 'LOW' : vixNum < 20 ? 'CALM' : vixNum < 25 ? 'ELEVATED' : vixNum < 30 ? 'HIGH' : 'EXTREME';
  const vixBadgeColor = vixNum < 20 ? '#34d399' : vixNum < 25 ? '#fbbf24' : '#f87171';

  // Story format: 1080×1920 vertical layout
  if (isStory) {
    return (
      <div className="ready" style={{
        width: 1080, height: 1920, position: 'relative', overflow: 'hidden',
        color: '#f1f5f9', fontFamily: "'Inter', system-ui, sans-serif",
        background: `
          radial-gradient(circle at 50% 25%, rgba(251,191,36,0.12), transparent 40%),
          radial-gradient(circle at 50% 70%, rgba(34,211,238,0.08), transparent 35%),
          #06090f
        `, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Scanline */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 80, pointerEvents: 'none', opacity: 0.03,
          background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.9) 0, rgba(255,255,255,0.9) 1px, transparent 1px, transparent 5px)',
        }} />
        {/* Brand */}
        <div style={{ position: 'absolute', top: 80, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 20 }}>
          <img src="/icons/icon-192x192.png" alt="" style={{ width: 72, height: 72, borderRadius: 16, filter: 'drop-shadow(0 0 20px rgba(34,211,238,0.3))' }} />
          <div style={{ marginTop: 20, fontSize: 36, fontWeight: 900, letterSpacing: '0.14em' }}>SIGNUM <span style={{ color: '#22d3ee' }}>HQ</span></div>
          <div style={{ marginTop: 8, color: '#fbbf24', fontSize: 20, fontWeight: 900, letterSpacing: '0.35em' }}>MORNING BRIEF</div>
          <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 18, letterSpacing: '0.05em' }}>{dateStr}</div>
        </div>
        {/* Sunrise SVG */}
        <div style={{ position: 'absolute', top: 280, left: '50%', transform: 'translateX(-50%)', width: 700, height: 430, zIndex: 5, opacity: 0.7 }}
          dangerouslySetInnerHTML={{ __html: SUNRISE_SVG }}
        />
        {/* Title */}
        <div style={{ position: 'absolute', top: 620, left: 0, right: 0, textAlign: 'center', zIndex: 15 }}>
          <h1 style={{
            margin: 0, fontSize: 88, lineHeight: 0.95, fontWeight: 900, letterSpacing: '-0.06em',
            background: 'linear-gradient(105deg, #c084fc, #a78bfa 30%, #67e8f9 70%, #22d3ee)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>Pre-Market<br/>Structure</h1>
          <div style={{ width: 300, height: 3, margin: '24px auto 0', background: 'linear-gradient(90deg, #a78bfa, #22d3ee)', borderRadius: 999, boxShadow: '0 0 20px rgba(34,211,238,0.5)' }} />
        </div>
        {/* Metric Cards — 2×2 grid */}
        <div style={{ position: 'absolute', top: 900, left: 60, right: 60, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, zIndex: 16 }}>
          <div style={{ padding: '24px 28px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(8,15,27,0.75)', backdropFilter: 'blur(12px)' }}>
            <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 900, letterSpacing: '0.25em' }}>SPY</div>
            <div style={{ marginTop: 16, fontSize: 48, fontWeight: 900, color: spyPositive ? '#34d399' : '#f87171' }}>{spyDisplay} {spyPositive ? '▲' : '▼'}</div>
          </div>
          <div style={{ padding: '24px 28px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(8,15,27,0.75)', backdropFilter: 'blur(12px)' }}>
            <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 900, letterSpacing: '0.25em' }}>VIX LEVEL</div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 48, fontWeight: 900 }}>{vix}</span>
              <span style={{ padding: '8px 16px', borderRadius: 999, border: `1px solid ${vixNum < 20 ? '#34d399' : vixNum < 25 ? '#fbbf24' : '#f87171'}60`, background: `${vixNum < 20 ? '#34d399' : vixNum < 25 ? '#fbbf24' : '#f87171'}18`, color: vixNum < 20 ? '#34d399' : vixNum < 25 ? '#fbbf24' : '#f87171', fontSize: 18, fontWeight: 900, letterSpacing: '0.12em' }}>{vixNum < 16 ? 'LOW' : vixNum < 20 ? 'CALM' : vixNum < 25 ? 'ELEVATED' : 'HIGH'}</span>
            </div>
          </div>
          <div style={{ padding: '24px 28px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(8,15,27,0.75)', backdropFilter: 'blur(12px)' }}>
            <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 900, letterSpacing: '0.25em' }}>GEX REGIME</div>
            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: gexColor, boxShadow: `0 0 22px ${gexColor}` }} />
              <span style={{ color: gexColor, fontSize: 36, fontWeight: 900, letterSpacing: '0.05em' }}>{gex.toUpperCase()}</span>
            </div>
          </div>
          <div style={{ padding: '24px 28px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(8,15,27,0.75)', backdropFilter: 'blur(12px)' }}>
            <div style={{ color: '#94a3b8', fontSize: 13, fontWeight: 900, letterSpacing: '0.25em' }}>DARK POOL</div>
            <div style={{ marginTop: 16, fontSize: 48, fontWeight: 900, color: '#a855f7', textShadow: '0 0 20px rgba(167,139,250,0.22)' }}>{dp}%</div>
          </div>
        </div>
        {/* Insight */}
        <div style={{ position: 'absolute', top: 1320, left: 60, right: 60, zIndex: 18, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ width: 4, minHeight: 40, borderRadius: 999, background: 'linear-gradient(to bottom, #22d3ee, rgba(34,211,238,0.3))', boxShadow: '0 0 14px rgba(34,211,238,0.5)', flexShrink: 0 }} />
          <div style={{ color: '#cbd5e1', fontSize: 22, fontWeight: 500, fontStyle: 'italic', lineHeight: 1.5 }}>{insight}</div>
        </div>
        {/* Footer */}
        <div style={{ position: 'absolute', bottom: 60, left: 0, right: 0, textAlign: 'center', zIndex: 24 }}>
          <div style={{ color: '#94a3b8', fontSize: 18, fontWeight: 500, letterSpacing: '0.4em' }}>signumhq.com</div>
        </div>
      </div>
    );
  }



  const cardStyle: React.CSSProperties = {
    position: 'relative', height: 96, padding: '14px 20px', borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.065), rgba(255,255,255,0.018)), rgba(8,15,27,0.70)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), 0 12px 30px rgba(0,0,0,0.24)',
    backdropFilter: 'blur(12px)', overflow: 'hidden',
  };

  return (
    <div className="ready" style={{
      width: 1200, height: 630, position: 'relative', overflow: 'hidden',
      color: '#f1f5f9', fontFamily: "'Inter', system-ui, sans-serif",
      background: `
        radial-gradient(circle at 73% 48%, rgba(34,211,238,0.10), transparent 34%),
        radial-gradient(circle at 72% 10%, rgba(251,191,36,0.075), transparent 30%),
        linear-gradient(180deg, rgba(251,191,36,0.035), transparent 35%),
        #06090f
      `, isolation: 'isolate',
    }}>
      {/* Grid */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.10,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
        backgroundSize: '36px 36px',
        maskImage: 'radial-gradient(circle at 88% 24%, black 0%, transparent 42%)',
        WebkitMaskImage: 'radial-gradient(circle at 88% 24%, black 0%, transparent 42%)',
      }} />
      {/* Scanline */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 80, pointerEvents: 'none', opacity: 0.035,
        background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.9) 0, rgba(255,255,255,0.9) 1px, transparent 1px, transparent 5px)',
        mixBlendMode: 'overlay',
      }} />
      {/* Top amber glow */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 180, zIndex: 0,
        background: 'radial-gradient(ellipse at 55% 0%, rgba(251,191,36,0.13), transparent 55%)', opacity: 0.75,
      }} />

      {/* ── Header ── */}
      <div style={{ position: 'absolute', left: 36, right: 36, top: 24, zIndex: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <img src="/icons/icon-192x192.png" alt="" style={{ width: 50, height: 50, borderRadius: 12, filter: 'drop-shadow(0 0 16px rgba(34,211,238,0.24))' }} />
          <div style={{ width: 1, height: 50, background: 'linear-gradient(to bottom, transparent, rgba(34,211,238,0.90), transparent)', boxShadow: '0 0 13px rgba(34,211,238,0.32)' }} />
          <div>
            <div style={{ fontSize: 28, lineHeight: 0.92, fontWeight: 900, letterSpacing: '0.14em' }}>SIGNUM <span style={{ color: '#22d3ee' }}>HQ</span></div>
            <div style={{ marginTop: 10, color: '#d2d9e6', fontSize: 13, fontWeight: 500 }}>See What Others Cannot</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', marginTop: 8 }}>
          <div style={{ color: '#fbbf24', fontSize: 16, fontWeight: 900, letterSpacing: '0.40em', textTransform: 'uppercase' as const, textShadow: '0 0 18px rgba(251,191,36,0.20)' }}>MORNING BRIEF</div>
          <div style={{ marginTop: 10, color: '#94a3b8', fontSize: 15, fontWeight: 500, letterSpacing: '0.05em' }}>{dateStr}</div>
        </div>
      </div>

      {/* ── Hero Title ── */}
      <div style={{ position: 'absolute', left: 36, top: 104, width: 540, zIndex: 15 }}>
        <h1 style={{
          margin: 0, fontSize: 74, lineHeight: 0.98, fontWeight: 900, letterSpacing: '-0.065em',
          background: 'linear-gradient(105deg, #c084fc 0%, #a78bfa 30%, #67e8f9 70%, #22d3ee 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          filter: 'brightness(1.15)',
          WebkitTextStroke: '0.5px rgba(255,255,255,0.08)',
        }}>Pre-Market<br/>Structure</h1>
        <div style={{ width: 260, height: 3, marginTop: 22, background: 'linear-gradient(90deg, #a78bfa, #22d3ee)', borderRadius: 999, boxShadow: '0 0 20px rgba(34,211,238,0.55)' }} />
      </div>

      {/* ── 4 Metric Cards ── */}
      <div style={{ position: 'absolute', left: 36, top: 306, width: 550, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, zIndex: 16 }}>
        {/* SPY */}
        <div style={cardStyle}>
          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: '0.28em' }}>SPY</div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, fontSize: 36, fontWeight: 900, letterSpacing: '-0.06em', color: spyPositive ? '#34d399' : '#f87171', textShadow: `0 0 20px ${spyPositive ? 'rgba(52,211,153,0.22)' : 'rgba(248,113,113,0.22)'}` }}>
            {spyDisplay}
            <span style={{ fontSize: 20, filter: `drop-shadow(0 0 12px ${spyPositive ? 'rgba(52,211,153,0.42)' : 'rgba(248,113,113,0.42)'})` }}>{spyPositive ? '▲' : '▼'}</span>
          </div>
        </div>
        {/* VIX */}
        <div style={cardStyle}>
          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: '0.28em' }}>VIX LEVEL</div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 14, fontSize: 36, fontWeight: 900, letterSpacing: '-0.06em' }}>
            {vix}
            <span style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 999, border: `1px solid ${vixBadgeColor}60`, background: `${vixBadgeColor}18`, color: vixBadgeColor, fontSize: 16, fontWeight: 900, letterSpacing: '0.14em' }}>{vixStatus}</span>
          </div>
        </div>
        {/* GEX */}
        <div style={cardStyle}>
          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: '0.28em' }}>GEX REGIME</div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: gexColor, boxShadow: `0 0 0 10px ${gexColor}18, 0 0 22px ${gexColor}` }} />
            <span style={{ color: gexColor, fontSize: 30, fontWeight: 900, letterSpacing: '0.05em', textShadow: `0 0 20px ${gexColor}40` }}>{gex.toUpperCase()}</span>
          </div>
        </div>
        {/* Dark Pool */}
        <div style={{ ...cardStyle, paddingBottom: 28 }}>
          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: '0.28em' }}>DARK POOL ACTIVITY</div>
          <div style={{ marginTop: 12, fontSize: 36, fontWeight: 900, letterSpacing: '-0.06em', color: '#a855f7', textShadow: '0 0 20px rgba(167,139,250,0.22)' }}>{dp}%</div>
          <div style={{ position: 'absolute', left: 20, right: 20, bottom: 14, height: 6, borderRadius: 999, background: '#1e293b', overflow: 'hidden' }}>
            <div style={{ width: `${dp}%`, height: '100%', borderRadius: 'inherit', background: 'linear-gradient(90deg, #a78bfa, #a855f7)', boxShadow: '0 0 16px rgba(167,139,250,0.55)' }} />
          </div>
        </div>
      </div>

      {/* ── Right SVG ── */}
      <div style={{ position: 'absolute', right: 0, top: 80, width: 600, height: 370, zIndex: 10 }}
        dangerouslySetInnerHTML={{ __html: SUNRISE_SVG }}
      />

      {/* ── Insight ── */}
      <div style={{ position: 'absolute', left: 36, top: 520, width: 860, zIndex: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 4, height: 28, borderRadius: 999, background: 'linear-gradient(to bottom, #22d3ee, rgba(34,211,238,0.35))', boxShadow: '0 0 14px rgba(34,211,238,0.50)', flexShrink: 0 }} />
        <div style={{ color: '#cbd5e1', fontSize: 16, fontWeight: 500, fontStyle: 'italic', letterSpacing: '-0.02em' }}>{insight}</div>
      </div>

      {/* ── Footer ── */}
      <div style={{ position: 'absolute', left: 36, right: 36, bottom: 14, zIndex: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 30 }}>
        <div style={{ position: 'absolute', left: 0, top: '50%', width: 400, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.20), transparent)' }} />
        <div style={{ position: 'absolute', right: 0, top: '50%', width: 400, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.20), transparent)' }} />
        <div style={{ color: '#94a3b8', fontSize: 14, fontWeight: 500, letterSpacing: '0.45em' }}>signumhq.com</div>
      </div>
    </div>
  );
}

export default function MorningOGPage() {
  return (
    <Suspense fallback={<div style={{ width: 1200, height: 630, background: '#04070d' }} />}>
      <MorningContent />
    </Suspense>
  );
}
