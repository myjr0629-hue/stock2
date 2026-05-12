'use client';

// ============================================================================
// Marketing Template: IG Story — Ticker Spotlight (1080×1920)
// /marketing/templates/story/spotlight?ticker=NVDA&company=NVIDIA+Corp&sector=AI+%26+Semiconductors
//   &price=925.40&change=3.2&dp=68.2&smartFlow=74&ivRank=62&pcr=0.65
//   &shortVol=38&relVol=2.4&squeeze=72&alpha=78
//   &callWall=950&putFloor=880&gammaFlip=900&maxPain=920&gex=positive
//   &insight=Institutional+accumulation+with+positive+GEX
//
// EC2 Puppeteer captures at 1080×1920 viewport
// ============================================================================

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const GEX_MAP: Record<string, { color: string; label: string }> = {
  positive:   { color: '#34d399', label: 'POSITIVE' },
  negative:   { color: '#f87171', label: 'NEGATIVE' },
  neutral:    { color: '#94a3b8', label: 'NEUTRAL' },
  transition: { color: '#fbbf24', label: 'TRANSITION' },
};

function SpotlightStoryCard() {
  const sp = useSearchParams();
  const ticker    = sp.get('ticker') || 'SPY';
  const company   = sp.get('company') || '';
  const sector    = sp.get('sector') || '';
  const price     = sp.get('price') || '';
  const change    = parseFloat(sp.get('change') || '0');
  const dp        = parseFloat(sp.get('dp') || '0');
  const smartFlow = parseFloat(sp.get('smartFlow') || '50');
  const ivRank    = sp.get('ivRank') || '';
  const pcr       = sp.get('pcr') || '';
  const shortVol  = sp.get('shortVol') || '';
  const relVol    = sp.get('relVol') || '';
  const squeeze   = sp.get('squeeze') || '';
  const alpha     = sp.get('alpha') || '';
  const callWall  = sp.get('callWall') || '';
  const putFloor  = sp.get('putFloor') || '';
  const gammaFlip = sp.get('gammaFlip') || '';
  const maxPain   = sp.get('maxPain') || '';
  const gex       = (sp.get('gex') || 'neutral').toLowerCase();
  const insight   = sp.get('insight') || '';
  const date      = sp.get('date') || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const changeColor = change >= 0 ? '#34d399' : '#f87171';
  const changeStr = `${change >= 0 ? '+' : ''}${change.toFixed(1)}% ${change >= 0 ? '▲' : '▼'}`;
  const gexTheme = GEX_MAP[gex] || GEX_MAP.neutral;
  const buyDominant = smartFlow >= 50;
  const accumLabel = buyDominant ? 'ACCUMULATION' : 'DISTRIBUTION';

  // Sparkline direction based on change
  const sparkUp = 'M0 202 C20 196 40 187 82 155 C108 148 127 167 170 136 C214 145 260 82 306 79 C350 88 390 80 435 39 L450 34';
  const sparkDn = 'M0 34 C20 40 40 49 82 81 C108 88 127 69 170 100 C214 91 260 154 306 157 C350 148 390 156 435 197 L450 202';
  const sparkFillUp = sparkUp + ' V244 H0 Z';
  const sparkFillDn = sparkDn + ' V244 H0 Z';

  // Gauge SVG arc helper (semicircle from left to right)
  const gaugeArc = (pct: number, color: string, bgColor: string) => (
    <svg viewBox="0 0 340 200" width="340" height="200">
      <path d="M63 160A107 107 0 0 1 277 160" stroke={bgColor} strokeWidth="22" strokeLinecap="round" fill="none" />
      <path d="M63 160A107 107 0 0 1 277 160" stroke={color} strokeWidth="22" strokeLinecap="round" fill="none"
        pathLength="100" strokeDasharray={`${pct} 100`} />
    </svg>
  );

  const metrics = [
    { label: 'IV Rank', value: ivRank ? `${ivRank}%` : 'N/A', color: '#22d3ee',
      icon: <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="5"><path d="M9 50h8V35H9v15Zm15 0h8V23h-8v27Zm15 0h8V14h-8v36Zm15 0h8V6h-8v44Z"/><path d="M8 26 22 14l10 8L54 5"/></svg> },
    { label: 'PCR', value: pcr || 'N/A', color: '#a78bfa',
      icon: <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="5"><circle cx="32" cy="32" r="23"/><path d="M32 9v23h23"/></svg> },
    { label: 'Short Vol', value: shortVol ? `${shortVol}%` : 'N/A', color: '#22d3ee',
      icon: <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="5"><path d="M32 6 54 15v15c0 15-10 25-22 29C20 55 10 45 10 30V15l22-9Z"/><path d="m22 32 7 7 14-18"/></svg> },
    { label: 'Rel. Volume', value: relVol ? `${relVol}x` : 'N/A', color: '#a78bfa',
      icon: <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="5"><path d="M9 52h8V37H9v15Zm15 0h8V27h-8v25Zm15 0h8V17h-8v35Zm15 0h8V8h-8v44Z"/></svg> },
    { label: 'Squeeze', value: squeeze || 'N/A', color: '#fbbf24',
      icon: <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round"><path d="M35 4 13 36h17l-2 24 23-36H34l1-20Z"/></svg> },
    { label: 'Alpha', value: alpha || 'N/A', color: '#22d3ee',
      icon: <svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="5"><circle cx="32" cy="32" r="10"/><path d="M32 4v13M32 47v13M4 32h13M47 32h13M12 12l9 9M43 43l9 9M52 12l-9 9M21 43l-9 9"/></svg> },
  ];

  const ladderRows = [
    { label: `Call Wall: $${callWall}`, val: callWall, color: '#34d399' },
    { label: `Current: $${price}`, val: price, color: '#f1f5f9' },
    { label: `Gamma Flip: $${gammaFlip}`, val: gammaFlip, color: '#fbbf24' },
    { label: `Put Floor: $${putFloor}`, val: putFloor, color: '#f87171' },
  ].filter(r => r.val);

  return (
    <div style={{
      position: 'relative', width: '1080px', height: '1920px', overflow: 'hidden',
      color: '#f1f5f9',
      fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
      isolation: 'isolate',
    }}>
      {/* BG */}
      <div style={{ position: 'absolute', inset: 0, zIndex: -5,
        background: 'radial-gradient(circle at 42% 18%, rgba(167,139,250,0.15), transparent 34%), radial-gradient(circle at 87% 50%, rgba(139,92,246,0.10), transparent 36%), linear-gradient(180deg, #05080d 0%, #080c14 20%, #0d1117 48%, #080c14 76%, #05080d 100%)',
      }} />
      <div style={{ position: 'absolute', inset: 0, zIndex: -3, opacity: 0.03,
        backgroundImage: 'radial-gradient(circle, rgba(167,139,250,0.4) 1px, transparent 1.5px)', backgroundSize: '24px 24px',
      }} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 80, pointerEvents: 'none', opacity: 0.035, mixBlendMode: 'overlay' as any,
        background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.85) 0, rgba(255,255,255,0.85) 1px, transparent 1px, transparent 5px)',
      }} />

      {/* ═══ HEADER ═══ */}
      <div style={{ position: 'absolute', left: '34px', right: '34px', top: '33px', height: '150px', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/signum-sg-vectorized.svg" alt="SIGNUM HQ" width={104} height={104} style={{ display: 'block', flexShrink: 0 }} />
            <span style={{ color: '#f1f5f9', fontSize: '44px', fontWeight: 800, letterSpacing: '-0.02em', textShadow: '0 0 18px rgba(255,255,255,0.10)' }}>SIGNUM HQ</span>
          </div>
          <div style={{ textAlign: 'right' as any, paddingTop: '10px' }}>
            <div style={{
              height: '72px', display: 'inline-flex', alignItems: 'center', gap: '16px',
              padding: '0 28px', borderRadius: '14px',
              border: '2px solid rgba(167,139,250,0.68)',
              background: 'radial-gradient(circle at 18% 45%, rgba(167,139,250,0.16), transparent 40%), rgba(8,12,20,0.78)',
              color: '#a78bfa', fontSize: '29px', fontWeight: 800, letterSpacing: '0.01em', textTransform: 'uppercase' as any,
              boxShadow: '0 0 26px rgba(167,139,250,0.14), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}>⌕ TICKER SPOTLIGHT</div>
            <div style={{ marginTop: '30px', color: '#64748b', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.02em' }}>{date}</div>
          </div>
        </div>
      </div>

      {/* ═══ TICKER HERO ═══ */}
      <div style={{
        position: 'absolute', left: '34px', right: '34px', top: '177px', height: '375px',
        borderRadius: '16px', border: '1px solid rgba(167,139,250,0.35)',
        background: 'radial-gradient(circle at 72% 50%, rgba(167,139,250,0.12), transparent 45%), linear-gradient(135deg, rgba(167,139,250,0.07), rgba(255,255,255,0.015)), rgba(15,19,24,0.86)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 54px rgba(0,0,0,0.22), -12px 0 35px rgba(167,139,250,0.22)',
        display: 'grid', gridTemplateColumns: '455px 1fr', gap: '16px',
        padding: '46px 46px 36px 58px', overflow: 'hidden', zIndex: 2,
      }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '8px', background: '#a78bfa', boxShadow: '0 0 28px rgba(167,139,250,0.70)' }} />
        <div>
          <div style={{ fontSize: '101px', fontWeight: 900, letterSpacing: '-0.065em', lineHeight: 0.9, textShadow: '0 6px 24px rgba(0,0,0,0.35)' }}>${ticker}</div>
          {company && <div style={{ marginTop: '30px', color: '#94a3b8', fontSize: '38px', fontWeight: 600, letterSpacing: '-0.03em' }}>{company}</div>}
          {sector && <div style={{
            display: 'inline-flex', alignItems: 'center', marginTop: '27px', height: '51px', padding: '0 25px',
            borderRadius: '999px', border: '2px solid #a78bfa', color: '#a78bfa', background: 'rgba(167,139,250,0.05)',
            fontSize: '27px', fontWeight: 600,
          }}>{sector}</div>}
          <div style={{ marginTop: '31px', display: 'flex', alignItems: 'baseline', gap: '30px' }}>
            {price && <span style={{ fontSize: '55px', fontWeight: 800, letterSpacing: '-0.055em' }}>${price}</span>}
            <span style={{ color: changeColor, fontSize: '31px', fontWeight: 800, letterSpacing: '-0.03em', textShadow: `0 0 18px ${changeColor}3d` }}>{changeStr}</span>
          </div>
        </div>
        {/* Chart */}
        <div style={{ position: 'relative', height: '100%', borderLeft: '1px solid rgba(255,255,255,0.07)', paddingLeft: '28px' }}>
          <div style={{ position: 'absolute', right: 0, top: '-7px', color: '#94a3b8', fontSize: '27px', fontWeight: 700 }}>5D</div>
          <svg style={{ position: 'absolute', left: '28px', top: '43px', width: 'calc(100% - 28px)', height: '244px' }} viewBox="0 0 450 244" fill="none">
            <defs><linearGradient id="sf" x1="0" y1="0" x2="0" y2="244"><stop stopColor="#a78bfa" stopOpacity="0.45" /><stop offset="1" stopColor="#a78bfa" stopOpacity="0" /></linearGradient></defs>
            <path d={change >= 0 ? sparkFillUp : sparkFillDn} fill="url(#sf)" />
            <path d={change >= 0 ? sparkUp : sparkDn} stroke="#a78bfa" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="450" cy={change >= 0 ? 34 : 202} r="7" fill="#a78bfa" />
            <g opacity="0.16" stroke="#94a3b8" strokeDasharray="4 12"><path d="M0 54H450M0 108H450M0 162H450M0 216H450" /></g>
          </svg>
        </div>
      </div>

      {/* ═══ INSTITUTIONAL FLOW ═══ */}
      <div style={{
        position: 'absolute', left: '34px', right: '34px', top: '581px', height: '370px',
        borderRadius: '16px', border: '1px solid rgba(255,255,255,0.10)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015)), rgba(15,19,24,0.86)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 54px rgba(0,0,0,0.22)',
        padding: '24px 28px 0 28px', overflow: 'hidden', zIndex: 2,
      }}>
        <div style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '0.03em', textTransform: 'uppercase' as any }}>INSTITUTIONAL FLOW</div>
        <div style={{ marginTop: '22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Dark Pool gauge */}
          <div style={{ position: 'relative', height: '234px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(5,10,18,0.46)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '21px', left: 0, right: 0, textAlign: 'center' as any, fontSize: '24px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' as any, color: '#22d3ee' }}>DARK POOL</div>
            {gaugeArc(dp, '#22d3ee', '#1e293b')}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: '38px', textAlign: 'center' as any, fontSize: '70px', fontWeight: 900, letterSpacing: '-0.06em', color: '#22d3ee', textShadow: '0 0 22px rgba(34,211,238,0.26)' }}>{dp > 0 ? `${dp.toFixed(1)}%` : 'N/A'}</div>
          </div>
          {/* Smart Flow gauge */}
          <div style={{ position: 'relative', height: '234px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(5,10,18,0.46)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '21px', left: 0, right: 0, textAlign: 'center' as any, fontSize: '24px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' as any, color: '#a78bfa' }}>SMART FLOW</div>
            {gaugeArc(smartFlow, '#a78bfa', '#2a1e48')}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: '38px', textAlign: 'center' as any, fontSize: '70px', fontWeight: 900, letterSpacing: '-0.06em', color: '#a78bfa', textShadow: '0 0 22px rgba(167,139,250,0.26)' }}>{Math.round(smartFlow)}</div>
          </div>
        </div>
        <div style={{ height: '62px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: buyDominant ? '#34d399' : '#f87171', fontSize: '27px', fontWeight: 600, letterSpacing: '-0.02em', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0 0 12px 12px', background: 'rgba(5,10,18,0.50)' }}>
          Institutional positioning: <strong>&nbsp;{accumLabel}</strong>
        </div>
      </div>

      {/* ═══ OPTIONS STRUCTURE ═══ */}
      <div style={{
        position: 'absolute', left: '34px', right: '34px', top: '974px', height: '282px',
        borderRadius: '16px', border: '1px solid rgba(255,255,255,0.10)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015)), rgba(15,19,24,0.86)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 54px rgba(0,0,0,0.22)',
        padding: '28px 34px', display: 'grid', gridTemplateColumns: '1fr 250px', gap: '28px',
        overflow: 'hidden', zIndex: 2,
      }}>
        <div>
          <div style={{ fontSize: '29px', fontWeight: 900, letterSpacing: '0.02em', textTransform: 'uppercase' as any, marginBottom: '23px' }}>OPTIONS STRUCTURE</div>
          <div style={{ position: 'relative' }}>
            {ladderRows.map((row, i) => (
              <div key={i} style={{ height: '45px', display: 'grid', gridTemplateColumns: '220px 1fr 70px', alignItems: 'center', gap: '18px', fontSize: '26px', fontWeight: 700, color: row.color }}>
                <span>{row.label}</span>
                <div style={{ height: '3px', background: row.color, opacity: 0.96 }} />
                <span>{row.val}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.18)', display: 'flex', flexDirection: 'column' as any, justifyContent: 'center', alignItems: 'center', gap: '24px', paddingLeft: '20px' }}>
          <div style={{ color: '#94a3b8', fontSize: '25px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as any }}>GEX REGIME</div>
          <div style={{ padding: '18px 26px', borderRadius: '16px', border: `2px solid ${gexTheme.color}b8`, background: `${gexTheme.color}1f`, color: '#f1f5f9', boxShadow: `0 0 22px ${gexTheme.color}42, inset 0 1px 0 rgba(255,255,255,0.08)`, fontSize: '29px', fontWeight: 800, letterSpacing: '0.02em' }}>{gexTheme.label}</div>
          {maxPain && <div style={{ width: '200px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.14)', color: '#94a3b8', textAlign: 'center' as any, fontSize: '24px', fontWeight: 600 }}>Max Pain: ${maxPain}</div>}
        </div>
      </div>

      {/* ═══ KEY METRICS ═══ */}
      <div style={{
        position: 'absolute', left: '34px', right: '34px', top: '1279px', height: '315px',
        borderRadius: '16px', border: '1px solid rgba(255,255,255,0.10)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015)), rgba(15,19,24,0.86)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 54px rgba(0,0,0,0.22)',
        padding: '25px 28px', overflow: 'hidden', zIndex: 2,
      }}>
        <div style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '0.03em', textTransform: 'uppercase' as any }}>KEY METRICS</div>
        <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
          {metrics.map((m, i) => (
            <div key={i} style={{ height: '105px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(5,10,18,0.42)', display: 'grid', gridTemplateColumns: '78px 1fr', alignItems: 'center', padding: '0 22px', overflow: 'hidden' }}>
              <div style={{ color: m.color, width: '54px', height: '54px', display: 'grid', placeItems: 'center' }}>{m.icon}</div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: '24px', fontWeight: 500, letterSpacing: '-0.03em' }}>{m.label}</div>
                <div style={{ marginTop: '11px', fontSize: '38px', fontWeight: 800, letterSpacing: '-0.045em' }}>{m.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ AI ANALYSIS ═══ */}
      {insight && (
        <div style={{
          position: 'absolute', left: '34px', right: '34px', top: '1616px', height: '180px',
          borderRadius: '16px', border: '1px solid rgba(167,139,250,0.38)',
          background: 'radial-gradient(circle at 0% 50%, rgba(167,139,250,0.12), transparent 28%), linear-gradient(135deg, rgba(167,139,250,0.065), rgba(255,255,255,0.015)), rgba(15,19,24,0.86)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 54px rgba(0,0,0,0.20), -8px 0 28px rgba(167,139,250,0.14)',
          padding: '31px 36px 28px 41px', overflow: 'hidden', zIndex: 2,
        }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '6px', background: '#a78bfa', boxShadow: '0 0 20px rgba(167,139,250,0.54)' }} />
          <div style={{ color: '#a78bfa', fontSize: '30px', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' as any }}>AI ANALYSIS</div>
          <div style={{ marginTop: '24px', fontSize: '32px', lineHeight: 1.25, fontWeight: 500, letterSpacing: '-0.04em' }}>{insight}</div>
        </div>
      )}

      {/* ═══ FOOTER ═══ */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: '1817px', textAlign: 'center' as any, zIndex: 2 }}>
        <div style={{ color: '#06b6d4', fontSize: '40px', fontWeight: 800, letterSpacing: '-0.035em', textShadow: '0 0 18px rgba(6,182,212,0.22)' }}>signumhq.com</div>
        <div style={{ marginTop: '22px', color: '#94a3b8', fontSize: '28px', fontWeight: 500, letterSpacing: '-0.03em' }}>Full analysis → Link in bio · Not financial advice</div>
      </div>
    </div>
  );
}

export default function SpotlightStoryPage() {
  return (
    <Suspense fallback={<div style={{ width: '1080px', height: '1920px', background: '#080c14' }} />}>
      <SpotlightStoryCard />
    </Suspense>
  );
}
