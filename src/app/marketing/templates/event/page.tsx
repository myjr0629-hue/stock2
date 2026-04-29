'use client';

// ============================================================================
// Marketing Template: Event Alert (Structural Alert)
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

  // Event type themes
  const eventThemes: Record<string, { accent: string; bg: string; border: string; glow: string; icon: string }> = {
    gex_shift:      { accent: '#ef4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.3)', glow: '0 0 60px rgba(239,68,68,0.15), inset 0 0 30px rgba(239,68,68,0.05)', icon: '⚡' },
    unusual_volume: { accent: '#f97316', bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.3)', glow: '0 0 60px rgba(249,115,22,0.15)', icon: '🔥' },
    whale:          { accent: '#a855f7', bg: 'rgba(168,85,247,0.06)', border: 'rgba(168,85,247,0.3)', glow: '0 0 60px rgba(168,85,247,0.15)', icon: '🐋' },
    sec_8k:         { accent: '#3b82f6', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.3)', glow: '0 0 60px rgba(59,130,246,0.15)', icon: '📋' },
  };
  const theme = eventThemes[type] || eventThemes.gex_shift;

  const spyColor = spy > 0 ? '#34d399' : '#f87171';
  const vixColor = vix >= 25 ? '#ef4444' : vix >= 18 ? '#fbbf24' : '#34d399';
  const vixLabel = vix >= 30 ? 'EXTREME' : vix >= 25 ? 'HIGH' : vix >= 18 ? 'ELEVATED' : 'CALM';
  const dpColor  = dp >= 50 ? '#fbbf24' : '#22d3ee';

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
      {/* Red ambient glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse at 50% 40%, ${theme.accent}08 0%, transparent 70%)`,
      }} />
      {/* Scan lines */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.03,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 3px)',
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
        height: '100%',
        padding: isVertical ? '48px 40px' : '24px 40px',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(124,58,237,0.3)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192x192.png" alt="SIGNUM" width={30} height={30} style={{ borderRadius: '6px' }} />
            </div>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '3px' }}>SIGNUM HQ</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 20px', borderRadius: '10px',
            background: `${theme.accent}10`,
            border: `1px solid ${theme.accent}40`,
            boxShadow: `0 0 20px ${theme.accent}15`,
          }}>
            <span style={{ fontSize: '16px' }}>{theme.icon}</span>
            <span style={{ fontSize: '13px', fontWeight: 800, color: theme.accent, letterSpacing: '2px' }}>STRUCTURAL ALERT</span>
          </div>
        </div>

        {/* ── Hero Alert Card ── */}
        <div style={{
          flex: isVertical ? '0 0 auto' : '1 1 0',
          marginTop: isVertical ? '40px' : '16px',
          padding: isVertical ? '40px 32px' : '24px 32px',
          borderRadius: '16px',
          background: theme.bg,
          border: `2px solid ${theme.border}`,
          boxShadow: theme.glow,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Warning pattern */}
          <svg style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', opacity: 0.04 }} width="150" height="150" viewBox="0 0 24 24" fill={theme.accent}>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" stroke="#06090f" strokeWidth="2" />
            <line x1="12" y1="17" x2="12.01" y2="17" stroke="#06090f" strokeWidth="2" />
          </svg>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '3px' }}>${ticker}</span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>•</span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>{date}</span>
            </div>
            <div style={{
              fontSize: isVertical ? '40px' : '36px',
              fontWeight: 900, color: '#f1f5f9',
              lineHeight: 1.15, letterSpacing: '1px',
            }}>{event}</div>
            <div style={{
              fontSize: '14px', color: '#94a3b8', marginTop: '10px', lineHeight: 1.5,
            }}>{detail}</div>
          </div>
        </div>

        {/* ── Context Banner ── */}
        <div style={{
          marginTop: '12px', padding: '12px 20px',
          borderRadius: '10px',
          background: `linear-gradient(90deg, ${theme.accent}08, ${theme.accent}04)`,
          border: `1px solid ${theme.accent}15`,
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.accent} strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 500, lineHeight: 1.4 }}>
            {ticker} gamma exposure shifted — Volatility expansion expected. Monitor support/resistance levels.
          </span>
        </div>

        {/* ── Metric Badges ── */}
        <div style={{
          display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          gap: '10px',
          marginTop: isVertical ? '24px' : '12px',
        }}>
          {/* S&P 500 */}
          <div style={{
            flex: 1, padding: '12px 18px', borderRadius: '12px',
            background: `${spyColor}08`, border: `1px solid ${spyColor}20`,
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={spyColor} strokeWidth="2.5">
              <polyline points={spy > 0 ? "22,7 13.5,15.5 8.5,10.5 2,17" : "22,17 13.5,8.5 8.5,13.5 2,7"} />
            </svg>
            <div>
              <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', letterSpacing: '2px' }}>S&P 500</div>
              <span style={{ fontSize: '22px', fontWeight: 900, color: spyColor }}>{spy >= 0 ? '+' : ''}{spy.toFixed(1)}%</span>
            </div>
          </div>
          {/* VIX */}
          <div style={{
            flex: 1, padding: '12px 18px', borderRadius: '12px',
            background: `${vixColor}08`, border: `1px solid ${vixColor}20`,
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={vixColor} strokeWidth="2">
              <polyline points="2,12 6,8 10,16 14,6 18,14 22,10" />
            </svg>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', letterSpacing: '2px' }}>VIX</div>
                <span style={{ fontSize: '22px', fontWeight: 900, color: vixColor }}>{vix.toFixed(1)}</span>
              </div>
              <span style={{
                fontSize: '8px', fontWeight: 800, color: vixColor,
                padding: '2px 6px', borderRadius: '4px',
                background: `${vixColor}15`, border: `1px solid ${vixColor}30`,
              }}>{vixLabel}</span>
            </div>
          </div>
          {/* Dark Pool */}
          {dp > 0 && (
            <div style={{
              flex: 1, padding: '12px 18px', borderRadius: '12px',
              background: `${dpColor}08`, border: `1px solid ${dpColor}20`,
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={dpColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2 A10 10 0 0 1 12 22" fill={`${dpColor}20`} />
              </svg>
              <div>
                <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', letterSpacing: '2px' }}>DARK POOL</div>
                <span style={{ fontSize: '22px', fontWeight: 900, color: dpColor }}>{dp.toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: isVertical ? 'auto' : '12px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#22d3ee', letterSpacing: '2px' }}>SIGNUM HQ</span>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>signumhq.com/guardian</span>
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
