'use client';

// ============================================================================
// Marketing Template: Market Pulse
// /marketing/templates/pulse?spy=1.2&vix=18.6&gex=positive&dp=42.1&format=tweet&lang=en
// Puppeteer captures this page → Supabase Storage → Buffer
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
  const lang   = searchParams.get('lang') || 'en';
  const date   = searchParams.get('date') || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const { width, height } = FORMATS[format] || FORMATS.tweet;
  const isVertical = height > width;
  const scale = isVertical ? 0.9 : 1;

  // GEX theme
  const gexTheme = {
    positive:   { color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.25)', glow: '0 0 40px rgba(52,211,153,0.15)', pct: 78, label: 'POSITIVE', desc: 'Dealer hedging absorbs volatility — price stabilization mode' },
    negative:   { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)', glow: '0 0 40px rgba(248,113,113,0.15)', pct: 22, label: 'NEGATIVE', desc: 'Dealer hedging amplifies moves — volatility expansion mode' },
    neutral:    { color: '#94a3b8', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.15)', glow: '0 0 30px rgba(148,163,184,0.08)', pct: 50, label: 'NEUTRAL', desc: 'No directional dealer conviction — range-bound regime' },
    transition: { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.25)', glow: '0 0 40px rgba(251,191,36,0.12)', pct: 55, label: 'TRANSITION', desc: 'Regime shifting — trend acceleration likely' },
  }[gex] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.15)', glow: 'none', pct: 50, label: gex.toUpperCase(), desc: '' };

  // VIX theme
  const vixLevel = vix >= 30 ? { color: '#ef4444', label: 'EXTREME', pct: 95 }
    : vix >= 25 ? { color: '#f97316', label: 'HIGH', pct: 78 }
    : vix >= 18 ? { color: '#fbbf24', label: 'ELEVATED', pct: 58 }
    : { color: '#34d399', label: 'CALM', pct: 25 };

  const spyColor = spy > 0 ? '#34d399' : spy < 0 ? '#f87171' : '#94a3b8';
  const dpColor  = dp >= 45 ? '#fbbf24' : '#22d3ee';

  return (
    <div style={{
      width: `${width}px`, height: `${height}px`,
      background: '#06090f',
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Particle wave background */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.12 }}>
          <defs>
            <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={gexTheme.color} stopOpacity="0" />
              <stop offset="50%" stopColor={gexTheme.color} stopOpacity="0.6" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`M0,${height*0.3} Q${width*0.25},${height*0.2} ${width*0.5},${height*0.35} T${width},${height*0.25}`} fill="none" stroke="url(#waveGrad)" strokeWidth="1.5" />
          <path d={`M0,${height*0.35} Q${width*0.3},${height*0.28} ${width*0.6},${height*0.4} T${width},${height*0.3}`} fill="none" stroke="url(#waveGrad)" strokeWidth="1" />
          <path d={`M0,${height*0.4} Q${width*0.35},${height*0.33} ${width*0.7},${height*0.45} T${width},${height*0.35}`} fill="none" stroke="url(#waveGrad)" strokeWidth="0.5" />
        </svg>
        {/* Grid dots */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.03,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
      </div>

      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
        height: '100%',
        padding: isVertical ? '48px 40px' : '28px 40px',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Logo */}
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(124,58,237,0.3)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192x192.png" alt="SIGNUM" width={30} height={30} style={{ borderRadius: '6px' }} />
            </div>
            <span style={{
              fontSize: '20px', fontWeight: 800, color: '#f1f5f9',
              letterSpacing: '3px',
            }}>SIGNUM HQ</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              padding: '6px 16px', borderRadius: '8px',
              background: 'rgba(34,211,238,0.08)',
              border: '1px solid rgba(34,211,238,0.2)',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.5">
                <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
              </svg>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#22d3ee', letterSpacing: '2px' }}>MARKET PULSE</span>
            </div>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>{date}</span>
          </div>
        </div>

        {/* ── GEX Hero ── */}
        <div style={{
          flex: isVertical ? '0 0 auto' : '1 1 0',
          marginTop: isVertical ? '32px' : '16px',
          padding: isVertical ? '32px' : '20px 32px',
          borderRadius: '16px',
          background: gexTheme.bg,
          border: `1px solid ${gexTheme.border}`,
          boxShadow: gexTheme.glow,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Background sparkle effect */}
          <svg style={{ position: 'absolute', right: 0, top: 0, opacity: 0.08 }} width={isVertical ? '100%' : '50%'} height="100%" viewBox="0 0 400 200">
            <path d="M0,100 C50,60 100,140 150,80 C200,20 250,120 300,60 C350,0 400,80 400,100" fill="none" stroke={gexTheme.color} strokeWidth="2" />
            <path d="M0,120 C60,90 120,150 180,100 C240,50 300,130 360,80 L400,120" fill="none" stroke={gexTheme.color} strokeWidth="1" opacity="0.5" />
            {Array.from({length: 20}).map((_, i) => (
              <circle key={i} cx={20 + i * 20} cy={80 + Math.sin(i * 0.8) * 30} r="1.5" fill={gexTheme.color} opacity={0.3 + Math.random() * 0.4} />
            ))}
          </svg>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', position: 'relative', zIndex: 1 }}>
            {/* GEX icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={gexTheme.color} strokeWidth="2.5">
              <path d="M2 12C2 12 5 4 12 4C19 4 22 12 22 12C22 12 19 20 12 20C5 20 2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '4px' }}>GEX REGIME</span>
          </div>
          <span style={{
            fontSize: isVertical ? '52px' : '44px',
            fontWeight: 900, color: gexTheme.color,
            letterSpacing: '4px', lineHeight: 1.1,
            textShadow: `0 0 40px ${gexTheme.color}40`,
            position: 'relative', zIndex: 1,
          }}>{gexTheme.label}</span>
          <span style={{
            fontSize: '13px', color: '#94a3b8', marginTop: '6px',
            position: 'relative', zIndex: 1,
          }}>{gexTheme.desc}</span>
          {/* Progress bar */}
          <div style={{
            width: '100%', height: '6px', borderRadius: '3px',
            background: 'rgba(255,255,255,0.06)',
            marginTop: isVertical ? '20px' : '14px',
            position: 'relative', zIndex: 1,
          }}>
            <div style={{
              width: `${gexTheme.pct}%`, height: '6px', borderRadius: '3px',
              background: `linear-gradient(90deg, ${gexTheme.color}, ${gexTheme.color}90)`,
              boxShadow: `0 0 12px ${gexTheme.color}40`,
            }} />
          </div>
        </div>

        {/* ── Metric Cards ── */}
        <div style={{
          display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          gap: isVertical ? '12px' : '12px',
          marginTop: isVertical ? '24px' : '14px',
          flex: isVertical ? '1 1 0' : '0 0 auto',
        }}>
          {/* S&P 500 */}
          <div style={{
            flex: 1, padding: isVertical ? '20px 24px' : '14px 20px',
            borderRadius: '14px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', gap: '14px',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Mini chart bg */}
            <svg style={{ position: 'absolute', right: 0, bottom: 0, opacity: 0.06 }} width="120" height="60" viewBox="0 0 120 60">
              <polyline points="0,50 20,45 40,30 60,35 80,15 100,20 120,5" fill="none" stroke={spyColor} strokeWidth="2" />
            </svg>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              background: `${spyColor}12`, border: `1px solid ${spyColor}25`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={spyColor} strokeWidth="2.5">
                <polyline points="22,7 13.5,15.5 8.5,10.5 2,17" />
                <polyline points="16,7 22,7 22,13" />
              </svg>
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', letterSpacing: '2px' }}>S&P 500</div>
              <div style={{ fontSize: isVertical ? '32px' : '26px', fontWeight: 900, color: spyColor, lineHeight: 1.1 }}>
                {spy >= 0 ? '+' : ''}{spy.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Dark Pool */}
          <div style={{
            flex: 1, padding: isVertical ? '20px 24px' : '14px 20px',
            borderRadius: '14px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', gap: '14px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              background: `${dpColor}12`, border: `1px solid ${dpColor}25`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={dpColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2 A10 10 0 0 1 12 22" fill={`${dpColor}30`} />
              </svg>
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', letterSpacing: '2px' }}>DARK POOL</div>
              <div style={{ fontSize: isVertical ? '32px' : '26px', fontWeight: 900, color: dpColor, lineHeight: 1.1 }}>
                {dp > 0 ? `${dp.toFixed(1)}%` : '—'}
              </div>
            </div>
            {/* Mini progress */}
            {dp > 0 && (
              <div style={{
                position: 'absolute', bottom: '8px', left: '20px', right: '20px',
                height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.04)',
              }}>
                <div style={{ width: `${Math.min(dp * 2, 100)}%`, height: '3px', borderRadius: '2px', background: dpColor }} />
              </div>
            )}
          </div>

          {/* VIX */}
          <div style={{
            flex: 1, padding: isVertical ? '20px 24px' : '14px 20px',
            borderRadius: '14px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', gap: '14px',
            position: 'relative', overflow: 'hidden',
          }}>
            <svg style={{ position: 'absolute', right: 0, bottom: 0, opacity: 0.06 }} width="100" height="50" viewBox="0 0 100 50">
              <polyline points="0,25 10,20 20,30 30,15 40,35 50,10 60,28 70,18 80,32 90,12 100,25" fill="none" stroke={vixLevel.color} strokeWidth="1.5" />
            </svg>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              background: `${vixLevel.color}12`, border: `1px solid ${vixLevel.color}25`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={vixLevel.color} strokeWidth="2">
                <polyline points="2,12 6,8 10,16 14,6 18,14 22,10" />
              </svg>
            </div>
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', letterSpacing: '2px' }}>VIX</div>
                <div style={{ fontSize: isVertical ? '32px' : '26px', fontWeight: 900, color: vixLevel.color, lineHeight: 1.1 }}>
                  {vix.toFixed(1)}
                </div>
              </div>
              <span style={{
                fontSize: '9px', fontWeight: 800, color: vixLevel.color,
                padding: '3px 8px', borderRadius: '6px',
                background: `${vixLevel.color}15`, border: `1px solid ${vixLevel.color}30`,
                letterSpacing: '1px',
              }}>{vixLevel.label}</span>
            </div>
          </div>
        </div>

        {/* ── Swipe CTA (story only) ── */}
        {isVertical && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            marginTop: 'auto', paddingTop: '24px',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="8,12 12,8 16,12" />
              <line x1="12" y1="16" x2="12" y2="8" />
            </svg>
            <span style={{ fontSize: '14px', color: '#22d3ee', fontWeight: 600, marginTop: '4px' }}>
              Tap to learn more → signumhq.com
            </span>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: isVertical ? '16px' : '12px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
            </svg>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#22d3ee', letterSpacing: '2px' }}>SIGNUM HQ</span>
          </div>
          <span style={{ fontSize: '12px', color: '#475569', letterSpacing: '2px' }}>SIGNAL. ANALYZE. EXECUTE.</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>signumhq.com</span>
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
