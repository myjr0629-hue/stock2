'use client';

// ============================================================================
// Marketing Template: Market Pulse V2
// /marketing/templates/pulse?spy=1.2&vix=18.6&gex=positive&dp=42.1&format=tweet&lang=en
// V2: borderLeft badges, GEX gauge, scanline + glow, data hints
// ============================================================================

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const FORMATS: Record<string, { width: number; height: number }> = {
  tweet:    { width: 1200, height: 675 },
  og:       { width: 1200, height: 630 },
  story:    { width: 1080, height: 1920 },
  carousel: { width: 1080, height: 1080 },
  pin:      { width: 1000, height: 1500 },
  square:   { width: 1080, height: 1080 },
};

function PulseCard() {
  const searchParams = useSearchParams();
  const spy    = parseFloat(searchParams.get('spy') || '0');
  const vix    = parseFloat(searchParams.get('vix') || '18');
  const gex    = (searchParams.get('gex') || 'positive').toLowerCase();
  const dp     = parseFloat(searchParams.get('dp') || '0');
  const format = searchParams.get('format') || 'tweet';
  const date   = searchParams.get('date') || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const { width, height } = FORMATS[format] || FORMATS.tweet;
  const isVertical = height > width;

  const gexTheme = {
    positive:   { color: '#34d399', bg: 'rgba(52,211,153,0.06)', border: 'rgba(52,211,153,0.20)', pct: 78, label: 'POSITIVE', desc: 'Dealer hedging absorbs volatility — mean reversion mode', keyword: 'SHOCK ABSORBER' },
    negative:   { color: '#f87171', bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.20)', pct: 22, label: 'NEGATIVE', desc: 'Dealer hedging amplifies moves — volatility expansion mode', keyword: 'MOVE AMPLIFIER' },
    neutral:    { color: '#94a3b8', bg: 'rgba(148,163,184,0.04)', border: 'rgba(148,163,184,0.12)', pct: 50, label: 'NEUTRAL', desc: 'No directional dealer conviction — range-bound regime', keyword: 'RANGE BOUND' },
    transition: { color: '#fbbf24', bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.20)', pct: 55, label: 'TRANSITION', desc: 'Regime shifting — trend acceleration likely', keyword: 'REGIME SHIFT' },
  }[gex] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.04)', border: 'rgba(148,163,184,0.12)', pct: 50, label: gex.toUpperCase(), desc: '', keyword: '' };

  const vixLevel = vix >= 30 ? { color: '#ef4444', label: 'EXTREME', pct: 95 }
    : vix >= 25 ? { color: '#f97316', label: 'HIGH', pct: 78 }
    : vix >= 18 ? { color: '#fbbf24', label: 'ELEVATED', pct: 58 }
    : { color: '#34d399', label: 'CALM', pct: 25 };

  const spyColor = spy > 0 ? '#34d399' : spy < 0 ? '#f87171' : '#94a3b8';
  const dpColor  = dp >= 45 ? '#fbbf24' : '#22d3ee';

  return (
    <div style={{
      width: `${width}px`, height: `${height}px`,
      background: '#080c14',
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      overflow: 'hidden', position: 'relative',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Background effects */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.08 }}>
          <defs>
            <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={gexTheme.color} stopOpacity="0" />
              <stop offset="50%" stopColor={gexTheme.color} stopOpacity="0.6" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`M0,${height*0.3} Q${width*0.25},${height*0.2} ${width*0.5},${height*0.35} T${width},${height*0.25}`} fill="none" stroke="url(#waveGrad)" strokeWidth="1.5" />
          <path d={`M0,${height*0.35} Q${width*0.3},${height*0.28} ${width*0.6},${height*0.4} T${width},${height*0.3}`} fill="none" stroke="url(#waveGrad)" strokeWidth="1" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.02, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      </div>

      {/* Border glow */}
      <div style={{ position: 'absolute', inset: '5px', borderRadius: '12px', border: `1px solid ${gexTheme.color}15`, boxShadow: `0 0 40px ${gexTheme.color}08`, pointerEvents: 'none', zIndex: 1 }} />

      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column',
        height: '100%',
        padding: isVertical ? '44px 40px' : '22px 36px',
      }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 16px rgba(124,58,237,0.3)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192x192.png" alt="SIGNUM" width={26} height={26} style={{ borderRadius: '6px' }} />
            </div>
            <span style={{ fontSize: '17px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '2px' }}>SIGNUM HQ</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              padding: '5px 14px', borderRadius: '20px',
              background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.5"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12" /></svg>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#22d3ee', letterSpacing: '0.15em' }}>MARKET PULSE</span>
            </div>
            <span style={{ fontSize: '11px', color: '#475569' }}>{date}</span>
          </div>
        </div>

        {/* ── GEX Hero ── */}
        <div style={{
          flex: isVertical ? '0 0 auto' : '1 1 0',
          marginTop: isVertical ? '28px' : '12px',
          padding: isVertical ? '28px' : '18px 24px',
          borderRadius: '14px',
          background: gexTheme.bg, border: `1.5px solid ${gexTheme.border}`,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Sparkle bg */}
          <svg style={{ position: 'absolute', right: 0, top: 0, opacity: 0.06 }} width={isVertical ? '100%' : '50%'} height="100%" viewBox="0 0 400 200">
            <path d="M0,100 C50,60 100,140 150,80 C200,20 250,120 300,60 C350,0 400,80 400,100" fill="none" stroke={gexTheme.color} strokeWidth="2" />
            {Array.from({length: 20}).map((_, i) => (
              <circle key={i} cx={20 + i * 20} cy={80 + Math.sin(i * 0.8) * 30} r="1.5" fill={gexTheme.color} opacity={0.3 + Math.random() * 0.4} />
            ))}
          </svg>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', zIndex: 1 }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: gexTheme.color, boxShadow: `0 0 8px ${gexTheme.color}` }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.2em' }}>GEX REGIME</span>
          </div>
          <span style={{
            fontSize: isVertical ? '48px' : '40px', fontWeight: 900, color: gexTheme.color,
            letterSpacing: '3px', lineHeight: 1.1, textShadow: `0 0 30px ${gexTheme.color}30`, zIndex: 1,
          }}>{gexTheme.label}</span>
          <span style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px', zIndex: 1 }}>{gexTheme.desc}</span>

          {/* GEX Gauge bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: isVertical ? '16px' : '10px', zIndex: 1 }}>
            <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)', opacity: 0.3 }} />
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%',
              background: '#1e293b', border: '2px solid rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '8px', fontWeight: 900, color: '#f1f5f9',
              boxShadow: '0 0 8px rgba(0,0,0,0.5)',
              transform: `translateX(${(gexTheme.pct - 50) * 0.5}px)`,
            }}>»</div>
            <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'linear-gradient(90deg, #34d399 0%, #22d3ee 100%)', opacity: 0.3 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px', zIndex: 1 }}>
            <span style={{ fontSize: '7px', fontWeight: 700, color: '#f87171', letterSpacing: '0.1em' }}>NEGATIVE</span>
            <span style={{
              fontSize: '7px', fontWeight: 800, color: gexTheme.color,
              padding: '1px 6px', borderRadius: '4px', background: `${gexTheme.color}12`,
            }}>{gexTheme.keyword}</span>
            <span style={{ fontSize: '7px', fontWeight: 700, color: '#34d399', letterSpacing: '0.1em' }}>POSITIVE</span>
          </div>
        </div>

        {/* ── Metric Cards (borderLeft style) ── */}
        <div style={{
          display: 'flex', flexDirection: isVertical ? 'column' : 'row',
          gap: '8px', marginTop: isVertical ? '20px' : '10px',
          flex: isVertical ? '1 1 0' : '0 0 auto',
        }}>
          {/* S&P 500 */}
          <div style={{
            flex: 1, padding: isVertical ? '18px 20px' : '12px 16px',
            borderRadius: '0 12px 12px 0',
            background: `${spyColor}05`, borderLeft: `3px solid ${spyColor}`,
            display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', overflow: 'hidden',
          }}>
            <svg style={{ position: 'absolute', right: 0, bottom: 0, opacity: 0.05 }} width="100" height="50" viewBox="0 0 120 60">
              <polyline points={spy > 0 ? "0,50 20,45 40,30 60,35 80,15 100,20 120,5" : "0,5 20,20 40,15 60,35 80,30 100,45 120,50"} fill="none" stroke={spyColor} strokeWidth="2" />
            </svg>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${spyColor}10`, border: `1px solid ${spyColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={spyColor} strokeWidth="2.5"><polyline points={spy > 0 ? "22,7 13.5,15.5 8.5,10.5 2,17" : "22,17 13.5,8.5 8.5,13.5 2,7"} /></svg>
            </div>
            <div style={{ zIndex: 1 }}>
              <div style={{ fontSize: '8px', fontWeight: 700, color: '#475569', letterSpacing: '0.12em' }}>S&P 500</div>
              <span style={{ fontSize: isVertical ? '28px' : '22px', fontWeight: 800, color: spyColor }}>{spy >= 0 ? '+' : ''}{spy.toFixed(2)}%</span>
            </div>
          </div>

          {/* Dark Pool */}
          <div style={{
            flex: 1, padding: isVertical ? '18px 20px' : '12px 16px',
            borderRadius: '0 12px 12px 0',
            background: `${dpColor}05`, borderLeft: `3px solid ${dpColor}`,
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${dpColor}10`, border: `1px solid ${dpColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dpColor} strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 2 A10 10 0 0 1 12 22" fill={`${dpColor}20`} /></svg>
            </div>
            <div>
              <div style={{ fontSize: '8px', fontWeight: 700, color: '#475569', letterSpacing: '0.12em' }}>DARK POOL</div>
              <span style={{ fontSize: isVertical ? '28px' : '22px', fontWeight: 800, color: dpColor }}>{dp > 0 ? `${dp.toFixed(1)}%` : '—'}</span>
            </div>
          </div>

          {/* VIX */}
          <div style={{
            flex: 1, padding: isVertical ? '18px 20px' : '12px 16px',
            borderRadius: '0 12px 12px 0',
            background: `${vixLevel.color}05`, borderLeft: `3px solid ${vixLevel.color}`,
            display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', overflow: 'hidden',
          }}>
            <svg style={{ position: 'absolute', right: 0, bottom: 0, opacity: 0.04 }} width="80" height="40" viewBox="0 0 100 50">
              <polyline points="0,25 10,20 20,30 30,15 40,35 50,10 60,28 70,18 80,32 90,12 100,25" fill="none" stroke={vixLevel.color} strokeWidth="1.5" />
            </svg>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${vixLevel.color}10`, border: `1px solid ${vixLevel.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={vixLevel.color} strokeWidth="2"><polyline points="2,12 6,8 10,16 14,6 18,14 22,10" /></svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', zIndex: 1 }}>
              <div>
                <div style={{ fontSize: '8px', fontWeight: 700, color: '#475569', letterSpacing: '0.12em' }}>VIX</div>
                <span style={{ fontSize: isVertical ? '28px' : '22px', fontWeight: 800, color: vixLevel.color }}>{vix.toFixed(1)}</span>
              </div>
              <span style={{ fontSize: '7px', fontWeight: 800, color: vixLevel.color, padding: '2px 5px', borderRadius: '4px', background: `${vixLevel.color}10`, border: `1px solid ${vixLevel.color}20` }}>{vixLevel.label}</span>
            </div>
          </div>
        </div>

        {/* ── Swipe CTA (story only) ── */}
        {isVertical && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 'auto', paddingTop: '20px' }}>
            <span style={{ fontSize: '13px', color: '#06b6d4', fontWeight: 600 }}>Tap to learn more → signumhq.com</span>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: isVertical ? '14px' : '10px', paddingTop: '10px',
          borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px rgba(52,211,153,0.5)' }} />
            <span style={{ fontSize: '10px', color: '#34d399', fontWeight: 700, letterSpacing: '0.1em' }}>REAL-TIME</span>
          </div>
          <span style={{ fontSize: '10px', color: '#475569', letterSpacing: '0.1em' }}>SIGNAL. ANALYZE. EXECUTE.</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#06b6d4' }}>signumhq.com</span>
        </div>
      </div>
    </div>
  );
}

export default function PulseTemplatePage() {
  return (
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { margin: 0; padding: 0; background: #000; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        `}</style>
      </head>
      <body>
        <Suspense fallback={<div style={{color:'#fff'}}>Loading...</div>}>
          <PulseCard />
        </Suspense>
      </body>
    </html>
  );
}
