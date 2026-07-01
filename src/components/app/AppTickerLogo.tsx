'use client';

// ============================================================================
// AppTickerLogo — the ONE ticker-logo component every app-view surface uses
// (Command hero + selector chips, Flow, Movers, Dashboard, Sector Intel), so a
// logo looks identical everywhere. Circular chip, adaptive fill:
//   • opaque square app-icons (Tesla, PANW, MSFT…) fill the circle edge-to-edge
//     like the web (cover, no chip) — decided from the loaded pixels.
//   • transparent/wide marks (SpaceX's black X, Amazon wordmark) sit on a light
//     neutral chip (contain) so they stay visible and never crop.
// Detection is same-origin canvas (no CORS taint) on the loaded image.
// Source is the unified /api/logo (real logo → curated → initial chip fallback).
// App-only: the marketing web must not import this.
// ============================================================================

import { useState, useRef, type CSSProperties } from 'react';

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
  const [fit, setFit] = useState<'contain' | 'cover' | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const sym = (symbol || '').toUpperCase();
  const pad = Math.max(2, Math.round(size * 0.12));

  // On load, decide fill mode from the actual pixels: a near-square image whose
  // corners are opaque is a full app-icon → fill edge-to-edge; anything with
  // transparency (marks/wordmarks) → light chip + contain so it stays visible.
  const decideFit = () => {
    const img = imgRef.current;
    if (!img) return;
    try {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { setFit('contain'); return; }
      const ar = w / h;
      if (ar < 0.82 || ar > 1.22) { setFit('contain'); return; }
      const N = 12;
      const c = document.createElement('canvas');
      c.width = N; c.height = N;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) { setFit('contain'); return; }
      ctx.drawImage(img, 0, 0, N, N);
      const d = ctx.getImageData(0, 0, N, N).data;
      const cornerIdx = [0, N - 1, N * (N - 1), N * N - 1];
      const opaqueCorners = cornerIdx.every((i) => d[i * 4 + 3] > 245);
      setFit(opaqueCorners ? 'cover' : 'contain');
    } catch {
      setFit('contain');
    }
  };

  const isCover = fit === 'cover';

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
        padding: isCover ? 0 : pad,
        // Light chip only when the logo needs a backing (transparent/mark).
        background: isCover
          ? 'transparent'
          : 'radial-gradient(circle at 35% 25%, rgba(255,255,255,0.97), rgba(224,231,240,0.92))',
        border: isCover ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(255,255,255,0.16)',
        boxShadow: isCover ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 8px rgba(0,0,0,0.22)',
        ...style,
      }}
    >
      {!failed && sym ? (
        <img
          ref={imgRef}
          src={`/api/logo/${sym}?v=2`}
          alt={sym}
          loading="lazy"
          onLoad={decideFit}
          style={{ width: '100%', height: '100%', objectFit: isCover ? 'cover' : 'contain' }}
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
