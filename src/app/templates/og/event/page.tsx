'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const EVENT_SVG = `<svg viewBox="0 0 560 460" fill="none" style="width:100%;height:100%;overflow:visible">
<defs>
<radialGradient id="eG" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(280 220) rotate(90) scale(160)"><stop stop-color="#fbbf24" stop-opacity=".6"/><stop offset=".18" stop-color="#f87171" stop-opacity=".38"/><stop offset="1" stop-color="#f87171" stop-opacity="0"/></radialGradient>
<linearGradient id="eC" x1="240" y1="30" x2="310" y2="420" gradientUnits="userSpaceOnUse"><stop stop-color="#f87171"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#f87171"/></linearGradient>
<linearGradient id="eN" x1="20" y1="60" x2="520" y2="400" gradientUnits="userSpaceOnUse"><stop stop-color="#22d3ee"/><stop offset=".55" stop-color="#f87171"/><stop offset="1" stop-color="#fbbf24"/></linearGradient>
<filter id="gR" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feColorMatrix in="b" type="matrix" values="0 0 0 0 1 0 0 0 0 .22 0 0 0 0 .2 0 0 0 .95 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="gA" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feColorMatrix in="b" type="matrix" values="0 0 0 0 .98 0 0 0 0 .75 0 0 0 0 .14 0 0 0 .8 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect x="60" y="0" width="460" height="460" fill="url(#eG)" opacity=".7"/>
<g opacity=".6"><circle cx="280" cy="220" r="45" stroke="#fbbf24" stroke-width="1.3"/><circle cx="280" cy="220" r="70" stroke="#f87171" stroke-width="1.1" stroke-dasharray="4 6"/><circle cx="280" cy="220" r="95" stroke="#f87171" stroke-opacity=".7" stroke-width="1.1" stroke-dasharray="3 8"/><circle cx="280" cy="220" r="122" stroke="#f87171" stroke-opacity=".5" stroke-width="1" stroke-dasharray="3 9"/><circle cx="280" cy="220" r="152" stroke="#f87171" stroke-opacity=".35" stroke-width="1" stroke-dasharray="3 10"/><circle cx="280" cy="220" r="185" stroke="#f87171" stroke-opacity=".25" stroke-width="1" stroke-dasharray="3 12"/></g>
<g opacity=".75" stroke="url(#eN)" stroke-width="1.1"><path d="M20 70 90 100 150 70 220 118 280 220 370 100 470 150 540 95"/><path d="M35 340 100 290 160 315 220 265 280 220 365 290 445 260 530 320"/><path d="M100 290 90 100 220 118 220 265 150 70 365 290 370 100 445 260" opacity=".6"/></g>
<g><circle cx="90" cy="100" r="4" fill="#f87171" filter="url(#gR)"/><circle cx="150" cy="70" r="3.5" fill="#22d3ee"/><circle cx="220" cy="118" r="4" fill="#f87171" filter="url(#gR)"/><circle cx="370" cy="100" r="4.5" fill="#fbbf24" filter="url(#gA)"/><circle cx="470" cy="150" r="4.5" fill="#fbbf24" filter="url(#gA)"/><circle cx="540" cy="95" r="3.5" fill="#f87171" filter="url(#gR)"/><circle cx="100" cy="290" r="4.5" fill="#22d3ee"/><circle cx="160" cy="315" r="3.5" fill="#a78bfa"/><circle cx="365" cy="290" r="4" fill="#f87171" filter="url(#gR)"/><circle cx="445" cy="260" r="4.5" fill="#fbbf24" filter="url(#gA)"/><circle cx="530" cy="320" r="4.5" fill="#f87171" filter="url(#gR)"/></g>
<g filter="url(#gR)"><path d="M288 10 260 110 284 98 262 205 300 178 277 280 306 258 285 420" stroke="url(#eC)" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M288 10 260 110 284 98 262 205 300 178 277 280 306 258 285 420" stroke="#fff" stroke-opacity=".4" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M270 125 230 150 190 135" stroke="#f87171" stroke-opacity=".5" stroke-width="1.4"/><path d="M270 195 230 225 195 220" stroke="#f87171" stroke-opacity=".5" stroke-width="1.4"/><path d="M292 185 340 162 395 175" stroke="#f87171" stroke-opacity=".5" stroke-width="1.4"/><path d="M286 288 335 325 390 310" stroke="#f87171" stroke-opacity=".4" stroke-width="1.3"/></g>
<circle cx="280" cy="220" r="16" fill="#fbbf24" filter="url(#gA)"/><circle cx="280" cy="220" r="6" fill="#fff7ed"/>
</svg>`;

function EventContent() {
  const sp = useSearchParams();
  const ticker = sp.get('ticker') || sp.get('t') || 'NVDA';
  const event = sp.get('event') || 'GEX Regime Shift Detected';
  const detail = sp.get('detail') || 'Positive → Negative regime transition';
  const spy = sp.get('spy') || '+0.84%';
  const vix = sp.get('vix') || '18.2';
  const dp = sp.get('dp') || '39.2';
  const time = sp.get('time') || 'Detected 2 min ago';
  const spyPositive = !spy.startsWith('-');

  return (
    <div className="ready" style={{
      width: 1200, height: 630, position: 'relative', overflow: 'hidden',
      color: '#f1f5f9', fontFamily: "'Inter', system-ui, sans-serif",
      background: `
        radial-gradient(circle at 84% 7%, rgba(248,113,113,0.24), transparent 28%),
        radial-gradient(circle at 75% 55%, rgba(248,113,113,0.16), transparent 34%),
        radial-gradient(circle at 2% 91%, rgba(34,211,238,0.13), transparent 25%),
        linear-gradient(135deg, #06090f 0%, #070b14 52%, #05070d 100%)
      `, isolation: 'isolate',
    }}>
      {/* Grid */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.12,
        backgroundImage: 'linear-gradient(rgba(34,211,238,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(248,113,113,0.4) 1px, transparent 1px)',
        backgroundSize: '36px 36px',
        maskImage: 'radial-gradient(circle at 87% 22%, black 0%, transparent 34%)',
        WebkitMaskImage: 'radial-gradient(circle at 87% 22%, black 0%, transparent 34%)',
      }} />
      {/* Scanline */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 80, pointerEvents: 'none', opacity: 0.045,
        background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.85) 0, rgba(255,255,255,0.85) 1px, transparent 1px, transparent 5px)',
        mixBlendMode: 'overlay',
      }} />
      {/* Frame lines */}
      <div style={{ position: 'absolute', inset: 15, zIndex: 20, borderTop: '1px solid rgba(255,255,255,0.12)', borderBottom: '1px solid rgba(255,255,255,0.12)', pointerEvents: 'none' }} />

      {/* ── Header ── */}
      <div style={{ position: 'absolute', left: 38, right: 40, top: 28, zIndex: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <img src="/icons/icon-192x192.png" alt="" style={{ width: 52, height: 52, borderRadius: 10, filter: 'drop-shadow(0 0 16px rgba(34,211,238,0.24))' }} />
          <div style={{ width: 1, height: 52, background: 'linear-gradient(to bottom, transparent, rgba(34,211,238,0.86), transparent)' }} />
          <div>
            <div style={{ fontSize: 28, lineHeight: 0.94, fontWeight: 900, letterSpacing: '0.09em' }}>SIGNUM <span style={{ color: '#22d3ee' }}>HQ</span></div>
            <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 13, fontWeight: 700 }}>See What Others Cannot</div>
          </div>
        </div>
        {/* Alert badge */}
        <div style={{
          padding: '10px 22px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12,
          border: '1.5px solid rgba(248,113,113,0.72)',
          background: 'linear-gradient(135deg, rgba(248,113,113,0.17), rgba(248,113,113,0.06))',
          color: '#ffb4a8', fontSize: 18, fontWeight: 900, letterSpacing: '0.10em', textTransform: 'uppercase' as const,
          boxShadow: '0 0 24px rgba(248,113,113,0.28)', textShadow: '0 0 12px rgba(248,113,113,0.50)',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffdf82" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.58))' }}>
            <path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z" />
          </svg>
          STRUCTURAL ALERT
        </div>
      </div>

      {/* ── Hero ── */}
      <div style={{ position: 'absolute', left: 38, top: 110, width: 560, zIndex: 25 }}>
        <div style={{ margin: 0, fontSize: 62, lineHeight: 0.96, fontWeight: 900, letterSpacing: '-0.06em', color: '#f1f5f9', textShadow: '0 5px 24px rgba(0,0,0,0.35)' }}
          dangerouslySetInnerHTML={{ __html: event.replace(/\n/g, '<br/>') }}
        />
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-0.035em', color: '#22d3ee', textShadow: '0 0 24px rgba(34,211,238,0.34)' }}>
            ${ticker}
          </div>
          <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 18, fontWeight: 800 }}>{detail}</div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, color: '#ff4949', fontSize: 18, fontWeight: 900, textShadow: '0 0 13px rgba(248,113,113,0.34)' }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%', display: 'inline-grid', placeItems: 'center',
              background: 'rgba(248,113,113,0.17)', boxShadow: '0 0 0 4px rgba(248,113,113,0.08), 0 0 16px rgba(248,113,113,0.75)',
            }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff3b3b', boxShadow: '0 0 14px rgba(248,113,113,0.88)' }} />
            </div>
            {time}
          </div>
        </div>
      </div>

      {/* ── Metrics ── */}
      <div style={{ position: 'absolute', left: 38, top: 440, display: 'flex', gap: 16, zIndex: 25 }}>
        {[
          { label: 'SPY', value: spy, color: spyPositive ? '#34d399' : '#f87171' },
          { label: 'VIX', value: vix, color: '#fbbf24' },
          { label: 'DARK POOL', value: `${dp}%`, color: '#a78bfa' },
        ].map((m, i) => (
          <div key={i} style={{
            width: 175, height: 72, borderRadius: 10, padding: '12px 16px',
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015))',
            backdropFilter: 'blur(14px)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 20px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#cbd5e1', letterSpacing: '0.06em', opacity: 0.85 }}>{m.label}</div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', color: m.color, textShadow: `0 0 16px ${m.color}40` }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* ── Right SVG ── */}
      <div style={{ position: 'absolute', right: 10, top: 60, width: 540, height: 440, zIndex: 10 }}
        dangerouslySetInnerHTML={{ __html: EVENT_SVG }}
      />

      {/* ── Right readouts ── */}
      <div style={{ position: 'absolute', right: 40, top: 320, width: 120, zIndex: 24, display: 'grid', gap: 14 }}>
        {[
          { label: 'GEX Momentum', color: '#ff3f3f', bars: true },
          { label: 'Regime Risk', value: 'Very High ⚠', color: '#ff3f3f' },
          { label: 'Vol Surface', value: 'Elevated', color: '#fbbf24' },
          { label: 'Liquidity', value: 'Fragile', color: '#22d3ee' },
        ].map((r, i) => (
          <div key={i} style={{ color: r.color, fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
            {r.label}
            {r.bars ? (
              <div style={{ display: 'flex', gap: 2, marginTop: 5 }}>
                {Array.from({ length: 14 }).map((_, j) => (
                  <div key={j} style={{ width: 6, height: 5, background: 'currentColor', boxShadow: '0 0 6px currentColor' }} />
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 900, letterSpacing: '0.03em' }}>{r.value}</div>
            )}
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <div style={{ position: 'absolute', left: 38, right: 38, bottom: 14, zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', height: 20 }}>
          <div style={{ position: 'absolute', left: 0, top: 9, width: 380, height: 2, background: 'linear-gradient(90deg, rgba(34,211,238,0.75), rgba(255,255,255,0.18), transparent)', boxShadow: '0 0 12px rgba(34,211,238,0.34)' }} />
          <div style={{ position: 'absolute', right: 0, top: 9, width: 380, height: 2, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.16), rgba(248,113,113,0.78))', boxShadow: '0 0 12px rgba(248,113,113,0.34)' }} />
          <div style={{ color: '#94a3b8', fontSize: 14, fontWeight: 800, letterSpacing: '0.42em' }}>signumhq.com</div>
        </div>
        <div style={{ marginTop: 4, color: '#64748b', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>Data-driven context. Not financial advice.</div>
      </div>
    </div>
  );
}

export default function EventOGPage() {
  return (
    <Suspense fallback={<div style={{ width: 1200, height: 630, background: '#04070d' }} />}>
      <EventContent />
    </Suspense>
  );
}
