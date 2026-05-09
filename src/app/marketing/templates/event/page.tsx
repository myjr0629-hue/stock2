'use client';

// ============================================================================
// Marketing Template: Event Alert V2 — Hybrid
// Gemini 배경패턴 + Claude borderLeft + GPT 정돈 + 기존 Context Banner
// /marketing/templates/event?type=gex_shift&ticker=SPY&event=GEX+Flipped+Negative&spy=-2.1&vix=28.5&dp=58&format=tweet
// ============================================================================

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const FORMATS: Record<string, { width: number; height: number }> = {
  tweet:    { width: 1200, height: 675 },
  og:       { width: 1200, height: 630 },
  story:    { width: 1080, height: 1920 },
  square:   { width: 1080, height: 1080 },
};

function EventCard() {
  const searchParams = useSearchParams();
  const type   = searchParams.get('type') || 'gex_shift';
  const ticker = searchParams.get('ticker') || 'SPY';
  const event  = decodeURIComponent(searchParams.get('event') || 'GEX FLIPPED NEGATIVE');
  const detail = decodeURIComponent(searchParams.get('detail') || 'Dealer hedging now amplifies price movements');
  const spy    = parseFloat(searchParams.get('spy') || '0');
  const vix    = parseFloat(searchParams.get('vix') || '18');
  const dp     = parseFloat(searchParams.get('dp') || '0');
  const format = searchParams.get('format') || 'tweet';
  const date   = searchParams.get('date') || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';

  const { width, height } = FORMATS[format] || FORMATS.tweet;
  const isVertical = height > width;

  // Event type themes with unique backgrounds (Gemini inspired)
  const eventThemes: Record<string, {
    accent: string; bg: string; border: string; glow: string;
    icon: string; label: string; alertLabel: string;
    bgPattern: string; // unique SVG background per event
  }> = {
    gex_shift: {
      accent: '#ef4444', bg: 'rgba(239,68,68,0.05)', border: 'rgba(239,68,68,0.25)',
      glow: '0 0 60px rgba(239,68,68,0.12)', icon: '⚡', label: 'GEX FLIP',
      alertLabel: 'STRUCTURAL ALERT',
      bgPattern: 'chart', // declining chart pattern
    },
    unusual_volume: {
      accent: '#f97316', bg: 'rgba(249,115,22,0.05)', border: 'rgba(249,115,22,0.25)',
      glow: '0 0 60px rgba(249,115,22,0.12)', icon: '🔥', label: 'VOLUME SPIKE',
      alertLabel: 'UNUSUAL ACTIVITY',
      bgPattern: 'bars',
    },
    whale: {
      accent: '#a855f7', bg: 'rgba(168,85,247,0.05)', border: 'rgba(168,85,247,0.25)',
      glow: '0 0 60px rgba(168,85,247,0.12)', icon: '🐋', label: 'WHALE ALERT',
      alertLabel: 'INSTITUTIONAL FLOW',
      bgPattern: 'wave',
    },
    sec_8k: {
      accent: '#3b82f6', bg: 'rgba(59,130,246,0.05)', border: 'rgba(59,130,246,0.25)',
      glow: '0 0 60px rgba(59,130,246,0.12)', icon: '📋', label: 'SEC FILING',
      alertLabel: 'CORPORATE EVENT',
      bgPattern: 'grid',
    },
    insider_trade: {
      accent: '#eab308', bg: 'rgba(234,179,8,0.05)', border: 'rgba(234,179,8,0.25)',
      glow: '0 0 60px rgba(234,179,8,0.12)', icon: '🔍', label: 'INSIDER TRADE',
      alertLabel: 'SEC FORM 4 FILING',
      bgPattern: 'seal',
    },
    fear_resolution: {
      accent: '#06b6d4', bg: 'rgba(6,182,212,0.05)', border: 'rgba(6,182,212,0.25)',
      glow: '0 0 60px rgba(6,182,212,0.12)', icon: '⚡', label: 'FEAR RESOLUTION',
      alertLabel: 'STRUCTURAL ALERT',
      bgPattern: 'radar',
    },
  };
  const theme = eventThemes[type] || eventThemes.gex_shift;

  const spyColor = spy > 0 ? '#34d399' : '#f87171';
  const vixColor = vix >= 25 ? '#ef4444' : vix >= 18 ? '#fbbf24' : '#34d399';
  const vixLabel = vix >= 30 ? 'EXTREME' : vix >= 25 ? 'HIGH' : vix >= 18 ? 'ELEVATED' : 'CALM';
  const dpColor  = dp >= 50 ? '#fbbf24' : '#22d3ee';

  // Background pattern SVG (Gemini inspired — unique per event type)
  const renderBgPattern = () => {
    const style: React.CSSProperties = {
      position: 'absolute', right: 0, bottom: 0, opacity: 0.04, pointerEvents: 'none',
    };
    switch (theme.bgPattern) {
      case 'chart': // declining chart for GEX flip
        return (
          <svg style={{ ...style, width: '400px', height: '300px' }} viewBox="0 0 400 300">
            <polyline points="0,40 40,60 80,50 120,80 160,70 200,120 240,110 280,160 320,200 360,250 400,280" fill="none" stroke={theme.accent} strokeWidth="2" />
            <polygon points="0,40 40,60 80,50 120,80 160,70 200,120 240,110 280,160 320,200 360,250 400,280 400,300 0,300" fill={theme.accent} opacity="0.3" />
            {Array.from({ length: 10 }).map((_, i) => {
              const x = i * 40;
              const h = 20 + Math.random() * 60;
              return <rect key={i} x={x + 5} y={300 - h} width="16" height={h} fill={theme.accent} opacity="0.2" rx="1" />;
            })}
          </svg>
        );
      case 'wave': // whale wave pattern
        return (
          <svg style={{ ...style, width: '400px', height: '250px' }} viewBox="0 0 400 250">
            <path d="M0,125 Q50,80 100,125 Q150,170 200,125 Q250,80 300,125 Q350,170 400,125" fill="none" stroke={theme.accent} strokeWidth="2" />
            <path d="M0,150 Q50,105 100,150 Q150,195 200,150 Q250,105 300,150 Q350,195 400,150" fill="none" stroke={theme.accent} strokeWidth="1.5" opacity="0.5" />
            <circle cx="300" cy="100" r="40" fill="none" stroke={theme.accent} strokeWidth="1" opacity="0.3" />
            <circle cx="300" cy="100" r="25" fill="none" stroke={theme.accent} strokeWidth="1" opacity="0.5" />
          </svg>
        );
      case 'radar': // radar/pulse for fear resolution
        return (
          <svg style={{ ...style, width: '300px', height: '300px' }} viewBox="0 0 300 300">
            <circle cx="150" cy="150" r="120" fill="none" stroke={theme.accent} strokeWidth="1" opacity="0.3" />
            <circle cx="150" cy="150" r="80" fill="none" stroke={theme.accent} strokeWidth="1" opacity="0.4" />
            <circle cx="150" cy="150" r="40" fill="none" stroke={theme.accent} strokeWidth="1" opacity="0.5" />
            <line x1="150" y1="30" x2="150" y2="270" stroke={theme.accent} strokeWidth="0.5" opacity="0.2" />
            <line x1="30" y1="150" x2="270" y2="150" stroke={theme.accent} strokeWidth="0.5" opacity="0.2" />
            <path d="M150,150 L200,80" stroke={theme.accent} strokeWidth="2" opacity="0.6" />
          </svg>
        );
      case 'seal': // official seal for insider trade
        return (
          <svg style={{ ...style, width: '260px', height: '260px' }} viewBox="0 0 260 260">
            <circle cx="130" cy="130" r="110" fill="none" stroke={theme.accent} strokeWidth="2" opacity="0.3" />
            <circle cx="130" cy="130" r="90" fill="none" stroke={theme.accent} strokeWidth="1.5" opacity="0.2" />
            <circle cx="130" cy="130" r="70" fill="none" stroke={theme.accent} strokeWidth="1" opacity="0.15" />
            {Array.from({ length: 24 }).map((_, i) => {
              const angle = (i * 15) * Math.PI / 180;
              const x1 = 130 + Math.cos(angle) * 105;
              const y1 = 130 + Math.sin(angle) * 105;
              const x2 = 130 + Math.cos(angle) * 115;
              const y2 = 130 + Math.sin(angle) * 115;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={theme.accent} strokeWidth="2" opacity="0.3" />;
            })}
            <text x="130" y="125" textAnchor="middle" fill={theme.accent} fontSize="14" fontWeight="bold" opacity="0.4">SEC</text>
            <text x="130" y="145" textAnchor="middle" fill={theme.accent} fontSize="10" opacity="0.3">FORM 4</text>
          </svg>
        );
      default: // grid
        return (
          <svg style={{ ...style, width: '300px', height: '200px' }} viewBox="0 0 300 200">
            {Array.from({ length: 6 }).map((_, i) => <line key={`h${i}`} x1="0" y1={i * 40} x2="300" y2={i * 40} stroke={theme.accent} strokeWidth="0.5" opacity="0.3" />)}
            {Array.from({ length: 8 }).map((_, i) => <line key={`v${i}`} x1={i * 43} y1="0" x2={i * 43} y2="200" stroke={theme.accent} strokeWidth="0.5" opacity="0.3" />)}
          </svg>
        );
    }
  };

  return (
    <div style={{
      width: `${width}px`, height: `${height}px`,
      background: '#080c14',
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      overflow: 'hidden', position: 'relative',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Theme ambient glow */}
      <div style={{
        position: 'absolute', top: '-100px', right: '-100px',
        width: '500px', height: '500px',
        background: `radial-gradient(circle, ${theme.accent}15 0%, transparent 60%)`,
        pointerEvents: 'none',
      }} />

      {/* Scanlines */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.025,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 3px)',
      }} />

      {/* Event-specific background pattern (Gemini inspired) */}
      {renderBgPattern()}

      {/* Border glow */}
      <div style={{
        position: 'absolute', inset: '5px', borderRadius: '12px', pointerEvents: 'none', zIndex: 1,
        border: `1px solid ${theme.accent}18`,
        boxShadow: theme.glow,
      }} />

      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column',
        height: '100%',
        padding: isVertical ? '44px 40px' : '22px 36px',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
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
            <div>
              <span style={{ fontSize: '17px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '2px' }}>SIGNUM HQ</span>
              <div style={{ fontSize: '9px', color: '#64748b', letterSpacing: '0.1em' }}>INSTITUTIONAL INTELLIGENCE, DEMOCRATIZED</div>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '7px 16px', borderRadius: '8px',
            background: `${theme.accent}10`, border: `1.5px solid ${theme.accent}50`,
          }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: theme.accent, boxShadow: `0 0 8px ${theme.accent}` }} />
            <span style={{ fontSize: '11px', fontWeight: 800, color: theme.accent, letterSpacing: '0.18em' }}>{theme.alertLabel}</span>
          </div>
        </div>

        {/* ── Hero Alert Card ── */}
        <div style={{
          flex: isVertical ? '0 0 auto' : '1 1 0',
          marginTop: isVertical ? '36px' : '14px',
          padding: isVertical ? '36px 28px' : '20px 28px',
          borderRadius: '14px',
          background: theme.bg, border: `1.5px solid ${theme.border}`,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Event type tag */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '5px 12px', borderRadius: '16px',
            background: `${theme.accent}10`, border: `1px solid ${theme.accent}30`,
            alignSelf: 'flex-start', marginBottom: '12px',
          }}>
            <span style={{ fontSize: '14px' }}>{theme.icon}</span>
            <span style={{ fontSize: '10px', fontWeight: 800, color: theme.accent, letterSpacing: '0.18em' }}>{theme.label}</span>
          </div>

          {/* Ticker + Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '3px' }}>{ticker}</span>
            <span style={{ fontSize: '11px', color: '#475569' }}>•</span>
            <span style={{ fontSize: '11px', color: '#475569' }}>{date}</span>
          </div>

          {/* Event headline */}
          <div style={{
            fontSize: isVertical ? '42px' : '36px',
            fontWeight: 900, color: '#f1f5f9',
            lineHeight: 1.1, letterSpacing: '-0.01em',
          }}>{event}</div>

          {/* Detail */}
          <div style={{ fontSize: '14px', color: '#94a3b8', marginTop: '10px', lineHeight: 1.5 }}>{detail}</div>
        </div>

        {/* ── Context Banner ── */}
        <div style={{
          marginTop: '10px', padding: '10px 18px',
          borderRadius: '10px',
          background: `linear-gradient(90deg, ${theme.accent}06, ${theme.accent}03)`,
          border: `1px solid ${theme.accent}12`,
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 500, lineHeight: 1.4 }}>
            {type === 'insider_trade' ? `SEC Form 4 filing detected for ${ticker}. Insider activity may signal directional conviction.`
             : type === 'fear_resolution' ? `Fear Resolution Phase: Market declining but volatility easing. Historical hit rate: 89.7% (T+3).`
             : type === 'whale' ? `Significant institutional order flow detected for ${ticker}. Smart money positioning shift.`
             : type === 'sec_8k' ? `Material corporate event filed with the SEC. Potential catalyst for ${ticker}.`
             : `${ticker} gamma exposure shifted — Volatility expansion expected. Monitor support/resistance levels.`}
          </span>
        </div>

        {/* ── Metric Badges (Claude borderLeft style) ── */}
        <div style={{
          display: 'flex', flexDirection: isVertical ? 'column' : 'row',
          gap: '8px', marginTop: isVertical ? '20px' : '10px',
        }}>
          {/* S&P 500 */}
          <div style={{
            flex: 1, padding: '12px 16px', borderRadius: '0 10px 10px 0',
            background: `${spyColor}06`, borderLeft: `3px solid ${spyColor}`,
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={spyColor} strokeWidth="2.5">
              <polyline points={spy > 0 ? "22,7 13.5,15.5 8.5,10.5 2,17" : "22,17 13.5,8.5 8.5,13.5 2,7"} />
            </svg>
            <div>
              <div style={{ fontSize: '8px', fontWeight: 700, color: '#475569', letterSpacing: '0.12em' }}>S&P 500</div>
              <span style={{ fontSize: '20px', fontWeight: 800, color: spyColor }}>{spy >= 0 ? '+' : ''}{spy.toFixed(1)}%</span>
            </div>
          </div>
          {/* VIX */}
          <div style={{
            flex: 1, padding: '12px 16px', borderRadius: '0 10px 10px 0',
            background: `${vixColor}06`, borderLeft: `3px solid ${vixColor}`,
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={vixColor} strokeWidth="2">
              <polyline points="2,12 6,8 10,16 14,6 18,14 22,10" />
            </svg>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div>
                <div style={{ fontSize: '8px', fontWeight: 700, color: '#475569', letterSpacing: '0.12em' }}>VIX</div>
                <span style={{ fontSize: '20px', fontWeight: 800, color: vixColor }}>{vix.toFixed(1)}</span>
              </div>
              <span style={{
                fontSize: '7px', fontWeight: 800, color: vixColor,
                padding: '2px 6px', borderRadius: '4px',
                background: `${vixColor}12`, border: `1px solid ${vixColor}25`,
              }}>{vixLabel}</span>
            </div>
          </div>
          {/* Dark Pool */}
          {dp > 0 && (
            <div style={{
              flex: 1, padding: '12px 16px', borderRadius: '0 10px 10px 0',
              background: `${dpColor}06`, borderLeft: `3px solid ${dpColor}`,
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={dpColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2 A10 10 0 0 1 12 22" fill={`${dpColor}20`} />
              </svg>
              <div>
                <div style={{ fontSize: '8px', fontWeight: 700, color: '#475569', letterSpacing: '0.12em' }}>DARK POOL</div>
                <span style={{ fontSize: '20px', fontWeight: 800, color: dpColor }}>{dp.toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: isVertical ? 'auto' : '10px', paddingTop: '10px',
          borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px rgba(52,211,153,0.5)' }} />
            <span style={{ fontSize: '10px', color: '#34d399', fontWeight: 700, letterSpacing: '0.1em' }}>REAL-TIME</span>
          </div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#06b6d4' }}>signumhq.com</span>
        </div>
      </div>
    </div>
  );
}

export default function EventTemplatePage() {
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
          <EventCard />
        </Suspense>
      </body>
    </html>
  );
}
