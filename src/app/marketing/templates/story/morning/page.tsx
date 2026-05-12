'use client';

// ============================================================================
// IG Story Template: Morning Brief (1080×1920)
// /marketing/templates/story/morning?spy=0.5&vix=18&gex=positive&dp=40&insight=...
// ============================================================================

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const GEX_COLORS: Record<string, string> = {
  positive: '#34d399', negative: '#f87171', neutral: '#94a3b8', transition: '#fbbf24',
};

function MorningStoryCard() {
  const p = useSearchParams();
  const spy     = parseFloat(p.get('spy') || '0');
  const vix     = parseFloat(p.get('vix') || '18');
  const gex     = (p.get('gex') || 'neutral').toLowerCase();
  const dp      = parseFloat(p.get('dp') || '0');
  const date    = p.get('date') || new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const insight = p.get('insight') || 'Monitor key structural levels heading into today\'s session.';

  const gexColor = GEX_COLORS[gex] || '#94a3b8';
  const spyColor = spy > 0 ? '#34d399' : spy < 0 ? '#f87171' : '#94a3b8';

  return (
    <div style={{
      position: 'relative', width: '1080px', height: '1920px', overflow: 'hidden',
      color: '#f1f5f9',
      background: 'linear-gradient(175deg, #070a12 0%, #0b1120 30%, #0f172a 55%, #0b1120 80%, #070a12 100%)',
      fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
    }}>
      {/* Grid pattern */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.025,
        backgroundImage: 'linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      {/* ═══ HEADER ═══ */}
      <div style={{
        position: 'absolute', left: '56px', right: '56px', top: '50px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/signum-sg-vectorized.svg" alt="SIGNUM HQ" width={96} height={96} style={{ display: 'block' }} />
          <span style={{ fontSize: '44px', fontWeight: 800, letterSpacing: '-0.02em' }}>SIGNUM HQ</span>
        </div>
        <div style={{
          height: '66px', display: 'flex', alignItems: 'center', gap: '14px',
          padding: '0 28px', borderRadius: '999px',
          border: '2px solid rgba(129,140,248,0.7)', background: 'rgba(8,12,20,0.76)',
          color: '#818cf8', fontSize: '28px', fontWeight: 800, letterSpacing: '0.02em',
          boxShadow: '0 0 20px rgba(129,140,248,0.12)',
        }}>
          <span style={{ width: '15px', height: '15px', borderRadius: '50%', background: '#818cf8', boxShadow: '0 0 14px rgba(129,140,248,0.6)' }} />
          MORNING BRIEF
        </div>
      </div>

      {/* Date */}
      <div style={{ position: 'absolute', left: '56px', top: '175px', color: '#64748b', fontSize: '34px', fontWeight: 500 }}>
        {date}
      </div>

      {/* ═══ PRE-MARKET BANNER ═══ */}
      <div style={{
        position: 'absolute', left: '52px', right: '52px', top: '245px', height: '155px',
        borderRadius: '18px',
        border: '1px solid rgba(129,140,248,0.25)',
        background: 'linear-gradient(135deg, rgba(129,140,248,0.10), rgba(99,102,241,0.04)), rgba(15,19,24,0.84)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '24px',
      }}>
        <svg width="62" height="62" viewBox="0 0 62 62" fill="none" stroke="#818cf8" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="31" cy="31" r="16" />
          <path d="M31 5v8M31 49v8M5 31h8M49 31h8M11 11l6 6M45 45l6 6M11 51l6-6M45 17l6-6" />
        </svg>
        <div>
          <div style={{ color: '#818cf8', fontSize: '22px', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as any }}>
            PRE-MARKET STRUCTURE
          </div>
          <div style={{ marginTop: '12px', color: '#cbd5e1', fontSize: '36px', fontWeight: 600, letterSpacing: '-0.02em' }}>
            Today&apos;s session context at a glance
          </div>
        </div>
      </div>

      {/* ═══ METRICS GRID — 2×2 ═══ */}
      <div style={{
        position: 'absolute', left: '52px', right: '52px', top: '430px',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px',
      }}>
        {/* SPY */}
        <div style={{
          height: '260px', borderRadius: '18px',
          border: `1px solid ${spyColor}33`, background: 'rgba(15,19,24,0.84)',
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 20px ${spyColor}12`,
          padding: '36px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div style={{ color: '#94a3b8', fontSize: '26px', fontWeight: 700, letterSpacing: '0.12em' }}>S&P 500</div>
          <div style={{ color: spyColor, fontSize: '80px', fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.9 }}>
            {spy >= 0 ? '+' : ''}{spy.toFixed(2)}%
          </div>
          <div style={{ color: '#64748b', fontSize: '24px', fontWeight: 500 }}>Prev Close</div>
        </div>

        {/* VIX */}
        <div style={{
          height: '260px', borderRadius: '18px',
          border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(15,19,24,0.84)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          padding: '36px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div style={{ color: '#94a3b8', fontSize: '26px', fontWeight: 700, letterSpacing: '0.12em' }}>VIX</div>
          <div style={{ color: '#fbbf24', fontSize: '80px', fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.9 }}>
            {vix.toFixed(1)}
          </div>
          <div style={{ color: '#64748b', fontSize: '24px', fontWeight: 500 }}>Fear Index</div>
        </div>

        {/* GEX */}
        <div style={{
          height: '260px', borderRadius: '18px',
          border: `1px solid ${gexColor}33`, background: 'rgba(15,19,24,0.84)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          padding: '36px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div style={{ color: '#94a3b8', fontSize: '26px', fontWeight: 700, letterSpacing: '0.12em' }}>GEX REGIME</div>
          <div style={{ color: gexColor, fontSize: '56px', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, textTransform: 'uppercase' as any }}>
            {gex}
          </div>
          <div style={{ height: '16px', borderRadius: '999px', background: `linear-gradient(90deg, #ef4444 0%, #fbbf24 50%, #34d399 100%)`, opacity: 0.6 }} />
        </div>

        {/* Dark Pool */}
        <div style={{
          height: '260px', borderRadius: '18px',
          border: '1px solid rgba(34,211,238,0.25)', background: 'rgba(15,19,24,0.84)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          padding: '36px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div style={{ color: '#94a3b8', fontSize: '26px', fontWeight: 700, letterSpacing: '0.12em' }}>DARK POOL</div>
          <div style={{ color: '#22d3ee', fontSize: '80px', fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.9 }}>
            {dp > 0 ? `${dp.toFixed(1)}%` : '—'}
          </div>
          <div style={{ color: '#64748b', fontSize: '24px', fontWeight: 500 }}>Institutional</div>
        </div>
      </div>

      {/* ═══ GUARDIAN INSIGHT ═══ */}
      <div style={{
        position: 'absolute', left: '52px', right: '52px', top: '1000px',
        borderRadius: '18px',
        borderLeft: '6px solid #818cf8',
        background: 'linear-gradient(135deg, rgba(129,140,248,0.08), rgba(255,255,255,0.015)), rgba(15,19,24,0.84)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 16px 48px rgba(0,0,0,0.22)',
        padding: '48px 54px',
      }}>
        <div style={{ color: '#818cf8', fontSize: '26px', fontWeight: 800, letterSpacing: '0.16em' }}>
          SESSION OUTLOOK
        </div>
        <div style={{
          marginTop: '28px', color: '#e2e8f0', fontSize: '42px', fontWeight: 500,
          lineHeight: 1.35, letterSpacing: '-0.04em',
        }}>
          {insight}
        </div>
      </div>

      {/* ═══ SESSION FOCUS BULLETS ═══ */}
      <div style={{
        position: 'absolute', left: '52px', right: '52px', top: '1380px',
        display: 'flex', flexDirection: 'column', gap: '20px',
      }}>
        {['Track dealer positioning into the open', 'Watch VIX for intraday regime shifts', 'Monitor dark pool for institutional entry'].map((text, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '22px',
            padding: '24px 36px', borderRadius: '14px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(15,19,24,0.60)',
          }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '50%',
              border: '2px solid #818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#818cf8', fontSize: '20px', fontWeight: 800, flexShrink: 0,
            }}>{i + 1}</div>
            <span style={{ color: '#cbd5e1', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em' }}>{text}</span>
          </div>
        ))}
      </div>

      {/* ═══ FOOTER ═══ */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: '1712px', textAlign: 'center' as any }}>
        <div style={{ color: '#818cf8', fontSize: '48px', fontWeight: 800, letterSpacing: '-0.03em', textShadow: '0 0 20px rgba(129,140,248,0.2)' }}>
          signumhq.com
        </div>
        <div style={{ marginTop: '30px', color: '#64748b', fontSize: '31px', fontWeight: 500 }}>
          Structure Before Price
        </div>
        <div style={{ marginTop: '32px', color: 'rgba(241,245,249,0.35)', fontSize: '32px' }}>△</div>
      </div>
    </div>
  );
}

export default function MorningStoryPage() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`body { margin: 0 !important; padding: 0 !important; background: #02040a !important; display: flex !important; align-items: center !important; justify-content: center !important; min-height: 100vh !important; }`}</style>
      <Suspense fallback={<div style={{color:'#fff'}}>Loading...</div>}>
        <MorningStoryCard />
      </Suspense>
    </>
  );
}
