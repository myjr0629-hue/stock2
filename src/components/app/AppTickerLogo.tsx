'use client';

// ============================================================================
// AppTickerLogo — the ONE ticker-logo component every app-view surface uses
// (Command hero + selector chips, Flow, Movers, Dashboard, Sector Intel), so a
// logo looks identical everywhere. Circular chip on a light neutral background
// so ANY logo stays visible — dark marks (SpaceX's black X), colorful brand
// icons, or the generated initial chip — none crop, none vanish.
// Source is the unified /api/logo (real logo → curated → initial fallback).
// App-only: the marketing web must not import this.
// ============================================================================

import { useState, type CSSProperties } from 'react';

export function AppTickerLogo({
  symbol,
  size = 32,
  radius = '50%',
  style,
}: {
  symbol: string;
  size?: number;
  radius?: string | number;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const sym = (symbol || '').toUpperCase();
  const pad = Math.max(2, Math.round(size * 0.12));

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: pad,
        background: 'radial-gradient(circle at 35% 25%, rgba(255,255,255,0.97), rgba(224,231,240,0.92))',
        border: '1px solid rgba(255,255,255,0.16)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 8px rgba(0,0,0,0.22)',
        ...style,
      }}
    >
      {!failed && sym ? (
        <img
          src={`/api/logo/${sym}?v=2`}
          alt={sym}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          style={{
            fontSize: Math.max(8, Math.round(size * 0.34)),
            fontWeight: 800,
            color: '#0b1220',
            letterSpacing: '-0.03em',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {sym.slice(0, 2)}
        </span>
      )}
    </div>
  );
}

export default AppTickerLogo;
