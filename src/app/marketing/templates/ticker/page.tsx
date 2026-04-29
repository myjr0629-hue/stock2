'use client';

// ============================================================================
// Marketing Template: Ticker Spotlight
// /marketing/templates/ticker?t=NVDA&price=890.50&change=-2.14&gex=negative&dp=62&maxpain=880&iv=78&format=tweet
// ============================================================================

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const FORMATS: Record<string, { width: number; height: number }> = {
  tweet:    { width: 1200, height: 675 },
  og:       { width: 1200, height: 630 },
  story:    { width: 1080, height: 1920 },
  square:   { width: 1080, height: 1080 },
};

function TickerCard() {
  const searchParams = useSearchParams();
  const ticker   = searchParams.get('t') || 'NVDA';
  const price    = parseFloat(searchParams.get('price') || '890.50');
  const change   = parseFloat(searchParams.get('change') || '-2.14');
  const gex      = (searchParams.get('gex') || 'negative').toLowerCase();
  const dp       = parseFloat(searchParams.get('dp') || '62');
  const maxpain  = parseFloat(searchParams.get('maxpain') || '880');
  const iv       = parseFloat(searchParams.get('iv') || '78');
  const volume   = searchParams.get('vol') || '47.3M';
  const mktcap   = searchParams.get('cap') || '$2.22T';
  const format   = searchParams.get('format') || 'tweet';
  const date     = searchParams.get('date') || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const session  = searchParams.get('session') || 'MARKET OPEN';

  const { width, height } = FORMATS[format] || FORMATS.tweet;
  const isVertical = height > width;

  const changeColor = change >= 0 ? '#34d399' : '#f87171';
  const regime = change >= 0 ? 'BULLISH' : 'BEARISH';
  const regimeColor = change >= 0 ? '#34d399' : '#f87171';

  const gexTheme = {
    positive:   { color: '#34d399', label: 'POSITIVE', bg: 'rgba(52,211,153,0.06)', border: 'rgba(52,211,153,0.25)' },
    negative:   { color: '#f87171', label: 'NEGATIVE', bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.25)' },
    neutral:    { color: '#94a3b8', label: 'NEUTRAL', bg: 'rgba(148,163,184,0.04)', border: 'rgba(148,163,184,0.15)' },
    transition: { color: '#fbbf24', label: 'TRANSITION', bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.25)' },
  }[gex] || { color: '#94a3b8', label: 'NEUTRAL', bg: 'rgba(148,163,184,0.04)', border: 'rgba(148,163,184,0.15)' };

  const dpColor = dp >= 50 ? '#fbbf24' : '#22d3ee';
  const dpLabel = dp >= 50 ? 'INSTITUTIONAL' : 'RETAIL';
  const ivColor = iv >= 70 ? '#f97316' : iv >= 40 ? '#fbbf24' : '#34d399';
  const ivLabel = iv >= 70 ? 'HIGH' : iv >= 40 ? 'MODERATE' : 'LOW';

  // Mini candlestick data for background
  const candles = Array.from({length: 24}, (_, i) => ({
    x: 8 + i * 8,
    o: 40 + Math.sin(i * 0.5) * 15 + Math.random() * 10,
    h: 0, l: 0, c: 0,
  })).map(c => ({
    ...c,
    h: c.o + Math.random() * 8,
    l: c.o - Math.random() * 8,
    c: c.o + (Math.random() - 0.6) * 12,
  }));

  return (
    <div style={{
      width: `${width}px`, height: `${height}px`,
      background: '#06090f',
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      overflow: 'hidden', position: 'relative',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Grid background */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.02,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
        height: '100%',
        padding: isVertical ? '48px 36px' : '22px 36px',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, marginBottom: isVertical ? '32px' : '14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 16px rgba(124,58,237,0.3)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192x192.png" alt="" width={28} height={28} style={{ borderRadius: '5px' }} />
            </div>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '3px' }}>SIGNUM HQ</span>
            <span style={{
              fontSize: '10px', fontWeight: 700, color: '#22d3ee', letterSpacing: '2px',
              padding: '4px 12px', borderRadius: '6px',
              background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)',
            }}>TICKER SPOTLIGHT</span>
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>{date}</span>
        </div>

        {/* ── Main Content ── */}
        <div style={{
          flex: 1, display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          gap: isVertical ? '20px' : '16px',
          minHeight: 0,
        }}>

          {/* LEFT: Ticker Info */}
          <div style={{
            flex: isVertical ? '0 0 auto' : '0 0 42%',
            padding: '20px 24px', borderRadius: '14px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Mini chart background */}
            <svg style={{ position: 'absolute', right: 0, top: 0, width: '55%', height: '100%', opacity: 0.05 }} viewBox="0 0 200 80" preserveAspectRatio="none">
              {candles.map((c, i) => (
                <g key={i}>
                  <line x1={c.x} y1={c.h} x2={c.x} y2={c.l} stroke={c.c > c.o ? '#34d399' : '#f87171'} strokeWidth="0.5" />
                  <rect x={c.x - 2} y={Math.min(c.o, c.c)} width="4" height={Math.abs(c.c - c.o) || 1} fill={c.c > c.o ? '#34d399' : '#f87171'} />
                </g>
              ))}
            </svg>

            <div style={{ position: 'relative', zIndex: 1 }}>
              <span style={{
                fontSize: isVertical ? '44px' : '36px',
                fontWeight: 900, color: '#22d3ee',
                letterSpacing: '2px',
              }}>${ticker}</span>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '4px' }}>
                <span style={{ fontSize: isVertical ? '36px' : '30px', fontWeight: 900, color: '#f1f5f9' }}>
                  ${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                <span style={{ fontSize: '18px', fontWeight: 800, color: changeColor }}>
                  {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                </span>
              </div>

              {/* Regime badge */}
              <div style={{
                display: 'inline-flex', marginTop: '10px',
                padding: '5px 14px', borderRadius: '6px',
                background: `${regimeColor}12`, border: `1px solid ${regimeColor}30`,
              }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: regimeColor, letterSpacing: '2px' }}>{regime}</span>
              </div>

              {/* Data table */}
              <div style={{
                marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '5px',
                borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px',
              }}>
                {[
                  ['Volume', volume],
                  ['Mkt Cap', mktcap],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{k}</span>
                    <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Session status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px rgba(52,211,153,0.5)' }} />
                <span style={{ fontSize: '9px', color: '#64748b', letterSpacing: '1px' }}>{session}</span>
              </div>
            </div>
          </div>

          {/* RIGHT: Analysis Cards 2×2 */}
          <div style={{
            flex: 1, display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
            gap: '10px',
          }}>
            {/* GEX */}
            <div style={{
              padding: '16px', borderRadius: '12px',
              background: gexTheme.bg, border: `1px solid ${gexTheme.border}`,
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              position: 'relative', overflow: 'hidden',
            }}>
              <svg style={{ position: 'absolute', right: '8px', bottom: '8px', opacity: 0.06 }} width="60" height="40" viewBox="0 0 60 40">
                <polyline points="0,30 10,20 20,25 30,10 40,22 50,8 60,15" fill="none" stroke={gexTheme.color} strokeWidth="2" />
              </svg>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={gexTheme.color} strokeWidth="2.5">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '2px' }}>GEX</span>
              </div>
              <span style={{
                fontSize: '22px', fontWeight: 900, color: gexTheme.color, letterSpacing: '2px',
                textShadow: `0 0 20px ${gexTheme.color}30`,
              }}>{gexTheme.label}</span>
            </div>

            {/* Dark Pool */}
            <div style={{
              padding: '16px', borderRadius: '12px',
              background: `${dpColor}05`, border: `1px solid ${dpColor}15`,
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Donut ring */}
              <svg style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.15 }} width="56" height="56" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                <circle cx="28" cy="28" r="22" fill="none" stroke={dpColor} strokeWidth="6"
                  strokeDasharray={`${dp * 1.38} ${138 - dp * 1.38}`} strokeDashoffset="34.5"
                  strokeLinecap="round" />
              </svg>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={dpColor} strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2 A10 10 0 0 1 12 22" fill={`${dpColor}20`} />
                </svg>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '2px' }}>DARK POOL</span>
              </div>
              <span style={{ fontSize: '24px', fontWeight: 900, color: dpColor }}>{dp.toFixed(0)}%</span>
              <span style={{ fontSize: '9px', fontWeight: 700, color: dpColor, letterSpacing: '1px', marginTop: '2px', opacity: 0.7 }}>{dpLabel}</span>
            </div>

            {/* Max Pain */}
            <div style={{
              padding: '16px', borderRadius: '12px',
              background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.12)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* OI distribution mini chart */}
              <svg style={{ position: 'absolute', right: 0, bottom: 0, opacity: 0.07 }} width="100" height="50" viewBox="0 0 100 50">
                {Array.from({length: 12}).map((_, i) => (
                  <rect key={i} x={4 + i * 8} y={50 - (30 - Math.abs(i - 6) * 5)} width="5" height={30 - Math.abs(i - 6) * 5}
                    fill={i < 6 ? '#34d399' : '#f87171'} rx="1" />
                ))}
              </svg>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '2px' }}>MAX PAIN</span>
              </div>
              <span style={{ fontSize: '24px', fontWeight: 900, color: '#fbbf24' }}>${maxpain.toLocaleString()}</span>
            </div>

            {/* IV Rank */}
            <div style={{
              padding: '16px', borderRadius: '12px',
              background: `${ivColor}05`, border: `1px solid ${ivColor}12`,
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Gauge arc */}
              <svg style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.12 }} width="50" height="30" viewBox="0 0 100 60">
                <path d="M10,55 A45,45 0 0,1 90,55" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="6" strokeLinecap="round" />
                <path d="M10,55 A45,45 0 0,1 90,55" fill="none" stroke={ivColor} strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${iv * 1.4} 140`} />
              </svg>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ivColor} strokeWidth="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '2px' }}>IV RANK</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px', fontWeight: 900, color: ivColor }}>{iv}%</span>
                <span style={{
                  fontSize: '9px', fontWeight: 800, color: ivColor,
                  padding: '2px 6px', borderRadius: '4px',
                  background: `${ivColor}12`, border: `1px solid ${ivColor}25`,
                }}>{ivLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: '12px', paddingTop: '10px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.5">
              <polyline points="4,17 10,11 4,5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            <span style={{ fontSize: '11px', color: '#475569', letterSpacing: '2px', fontWeight: 600 }}>SIGNAL. ANALYZE. EXECUTE.</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px 16px', borderRadius: '8px',
            background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#22d3ee' }}>signumhq.com/command</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TickerTemplatePage() {
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
          <TickerCard />
        </Suspense>
      </body>
    </html>
  );
}
