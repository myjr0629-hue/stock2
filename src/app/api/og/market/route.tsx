// ============================================================================
// /api/og/market — Premium OG Image v2.1 (Signal Card Design)
// GEX Hero + S&P 500 + Dark Pool + VIX
// All dimensions explicitly calculated for Satori compatibility
// ============================================================================

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const C = {
  bg: '#06090f',
  glass: 'rgba(255,255,255,0.04)',
  glassBorder: 'rgba(255,255,255,0.08)',
  cyan: '#22d3ee',
  green: '#34d399',
  red: '#f87171',
  amber: '#fbbf24',
  white: '#f1f5f9',
  muted: '#94a3b8',
  dim: '#64748b',
};

const L: Record<string, Record<string, string>> = {
  en: {
    pulse: 'MARKET PULSE', event: 'STRUCTURAL ALERT', education: 'MARKET INSIGHT',
    morning: 'PRE-MARKET BRIEF', weekly: 'WEEKLY STRUCTURE',
    sub: 'Institutional-Grade Market Structure',
    gexLabel: 'GEX REGIME',
    positive: 'POSITIVE', negative: 'NEGATIVE', neutral: 'NEUTRAL', transition: 'TRANSITION',
    gexDescPos: 'Dealer hedging absorbs volatility shocks',
    gexDescNeg: 'Dealer hedging amplifies price movements',
    gexDescNeu: 'No directional conviction from dealers',
    gexDescTra: 'Regime shifting - trend acceleration likely',
    sp500: 'S&P 500', dpLabel: 'DARK POOL', dpSub: 'Institutional Activity',
    vixLabel: 'VIX', vixSub: 'Fear Index',
    vixLow: 'CALM', vixMid: 'ELEVATED', vixHigh: 'HIGH', vixExt: 'EXTREME',
    tagline: 'See What Others Cannot',
    pinTitle: 'How Gamma Exposure Drives Stock Prices',
    pinSub: 'Institutional Market Structure Analysis',
  },
  ko: {
    pulse: 'MARKET PULSE', event: 'STRUCTURAL ALERT', education: 'MARKET INSIGHT',
    morning: 'PRE-MARKET BRIEF', weekly: 'WEEKLY STRUCTURE',
    sub: 'Institutional-Grade Market Structure',
    gexLabel: 'GEX REGIME',
    positive: 'POSITIVE', negative: 'NEGATIVE', neutral: 'NEUTRAL', transition: 'TRANSITION',
    gexDescPos: 'Dealer hedging absorbs volatility',
    gexDescNeg: 'Dealer hedging amplifies moves',
    gexDescNeu: 'No directional conviction',
    gexDescTra: 'Regime shifting - acceleration likely',
    sp500: 'S&P 500', dpLabel: 'DARK POOL', dpSub: 'Institutional',
    vixLabel: 'VIX', vixSub: 'Fear Index',
    vixLow: 'CALM', vixMid: 'ELEVATED', vixHigh: 'HIGH', vixExt: 'EXTREME',
    tagline: 'See What Others Cannot',
    pinTitle: 'GEX: Options Structure Behind Price Action',
    pinSub: 'Dark Pool and Gamma Exposure Data',
  },
  ja: {
    pulse: 'MARKET PULSE', event: 'STRUCTURAL ALERT', education: 'MARKET INSIGHT',
    morning: 'PRE-MARKET BRIEF', weekly: 'WEEKLY STRUCTURE',
    sub: 'Institutional-Grade Market Structure',
    gexLabel: 'GEX REGIME',
    positive: 'POSITIVE', negative: 'NEGATIVE', neutral: 'NEUTRAL', transition: 'TRANSITION',
    gexDescPos: 'Dealer hedging absorbs volatility',
    gexDescNeg: 'Dealer hedging amplifies moves',
    gexDescNeu: 'No directional conviction',
    gexDescTra: 'Regime shifting - acceleration likely',
    sp500: 'S&P 500', dpLabel: 'DARK POOL', dpSub: 'Institutional',
    vixLabel: 'VIX', vixSub: 'Fear Index',
    vixLow: 'CALM', vixMid: 'ELEVATED', vixHigh: 'HIGH', vixExt: 'EXTREME',
    tagline: 'See What Others Cannot',
    pinTitle: 'Gamma Exposure: How Dealers Move Markets',
    pinSub: 'Options Structure and Dark Pool Analysis',
  },
};

function changeColor(v: number) { return v > 0 ? C.green : v < 0 ? C.red : C.muted; }
function fmt(v: number) { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }

function gexTheme(gex: string) {
  const g = gex.toLowerCase();
  if (g === 'positive') return { color: '#34d399', bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.20)', glow: 'rgba(52,211,153,0.15)', pct: 75 };
  if (g === 'negative') return { color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.20)', glow: 'rgba(248,113,113,0.15)', pct: 25 };
  if (g === 'transition') return { color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.20)', glow: 'rgba(251,191,36,0.12)', pct: 50 };
  return { color: '#94a3b8', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.12)', glow: 'rgba(148,163,184,0.08)', pct: 50 };
}

function vixInfo(v: number, l: Record<string, string>) {
  if (v >= 30) return { color: C.red, label: l.vixExt, pct: 95 };
  if (v >= 25) return { color: '#f97316', label: l.vixHigh, pct: 75 };
  if (v >= 18) return { color: C.amber, label: l.vixMid, pct: 55 };
  return { color: C.green, label: l.vixLow, pct: 25 };
}

function gexDesc(gex: string, l: Record<string, string>) {
  const g = gex.toLowerCase();
  if (g === 'positive') return l.gexDescPos;
  if (g === 'negative') return l.gexDescNeg;
  if (g === 'transition') return l.gexDescTra;
  return l.gexDescNeu;
}

const FORMAT_SIZES: Record<string, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  tweet: { width: 1200, height: 675 },
  carousel: { width: 1080, height: 1350 },
  pin: { width: 1000, height: 1500 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const type   = searchParams.get('type') || 'pulse';
  const lang   = (searchParams.get('lang') || 'en') as 'en' | 'ko' | 'ja';
  const spy    = parseFloat(searchParams.get('spy') || '0');
  const vix    = parseFloat(searchParams.get('vix') || '0');
  const gex    = searchParams.get('gex') || 'neutral';
  const dp     = parseFloat(searchParams.get('dp') || '0');
  const ticker = searchParams.get('ticker') || '';
  const event  = decodeURIComponent(searchParams.get('event') || '');
  const date   = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const format = searchParams.get('format') || 'og';

  const { width: W, height: H } = FORMAT_SIZES[format] || FORMAT_SIZES.og;

  const l = L[lang] || L.en;
  const title = l[type] || l.pulse;
  const gt = gexTheme(gex);
  const gexLabel = l[gex.toLowerCase() as keyof typeof l] || gex.toUpperCase();
  const vi = vixInfo(vix, l);
  const dpPct = dp > 0 ? dp : 0;
  const dpColor = dpPct >= 40 ? C.amber : C.cyan;
  const isPin = format === 'pin';
  const isVertical = H > W;

  // Satori-safe box style helper
  const box = (extra: Record<string, string | number> = {}) => ({
    display: 'flex' as const,
    ...extra,
  });

  return new ImageResponse(
    (
      <div style={box({
        width: `${W}px`, height: `${H}px`, flexDirection: 'column',
        background: C.bg, fontFamily: 'system-ui, sans-serif',
        padding: isPin ? '36px 40px' : '28px 40px',
      })}>

        {/* ── Pinterest SEO Title Overlay (pin format only) ── */}
        {isPin ? (
          <div style={box({ flexDirection: 'column', marginBottom: '20px' })}>
            <span style={{
              fontSize: '36px', fontWeight: 900, color: C.white,
              lineHeight: '1.3', letterSpacing: '0.5px',
            }}>{l.pinTitle}</span>
            <span style={{
              fontSize: '16px', color: C.muted, marginTop: '8px',
              letterSpacing: '1px',
            }}>{l.pinSub}</span>
          </div>
        ) : null}

        {/* ── Row 1: Header (fixed ~60px) ── */}
        <div style={box({ alignItems: 'center', justifyContent: 'space-between', height: '50px' })}>
          <div style={box({ alignItems: 'center', gap: '12px' })}>
            <div style={box({
              width: '40px', height: '40px', borderRadius: '10px',
              alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
            })}>
              <span style={{ fontSize: '18px', fontWeight: 900, color: 'white' }}>S</span>
            </div>
            <div style={box({ flexDirection: 'column' })}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: C.white, letterSpacing: '2px' }}>SIGNUM HQ</span>
              <span style={{ fontSize: '10px', color: C.dim }}>{l.sub}</span>
            </div>
          </div>
          <div style={box({ flexDirection: 'column', alignItems: 'flex-end' })}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: C.muted, letterSpacing: '1px' }}>{title}</span>
            <span style={{ fontSize: '10px', color: C.dim }}>{date}</span>
          </div>
        </div>

        {/* ── Row 2: GEX Hero (fixed ~200px) ── */}
        <div style={box({
          flexDirection: 'column', justifyContent: 'center',
          height: '180px', marginTop: '12px',
          padding: '16px 28px', borderRadius: '14px',
          background: gt.bg, border: `1px solid ${gt.border}`,
        })}>
          <div style={box({ alignItems: 'center', gap: '8px', marginBottom: '6px' })}>
            <div style={{
              display: 'flex', width: '8px', height: '8px', borderRadius: '50%',
              background: gt.color,
            }} />
            <span style={{ fontSize: '11px', fontWeight: 700, color: C.muted, letterSpacing: '3px' }}>{l.gexLabel}</span>
            {ticker ? (
              <span style={{
                fontSize: '12px', fontWeight: 700, color: C.cyan, marginLeft: '8px',
                padding: '1px 8px', borderRadius: '6px',
                background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)',
              }}>{'$' + ticker}</span>
            ) : null}
          </div>
          <span style={{
            fontSize: '32px', fontWeight: 900, color: gt.color,
            letterSpacing: '3px', lineHeight: '1.2',
          }}>{gexLabel}</span>
          <span style={{ fontSize: '12px', color: C.muted, marginTop: '4px' }}>{gexDesc(gex, l)}</span>
          <div style={box({ width: '100%', height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', marginTop: '12px' })}>
            <div style={{ display: 'flex', width: `${gt.pct}%`, height: '5px', borderRadius: '3px', background: gt.color }} />
          </div>
        </div>

        {/* ── Row 3: Metrics (fixed ~130px) ── */}
        <div style={box({ marginTop: '12px', gap: '10px', height: '110px' })}>

          {/* S&P 500 */}
          <div style={box({
            flex: 1, flexDirection: 'column', justifyContent: 'center',
            padding: '12px 16px', borderRadius: '10px',
            background: C.glass, border: `1px solid ${C.glassBorder}`,
          })}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: C.dim, letterSpacing: '2px' }}>{l.sp500}</span>
            <span style={{ fontSize: '28px', fontWeight: 900, color: changeColor(spy), lineHeight: '1.2', marginTop: '4px' }}>{fmt(spy)}</span>
          </div>

          {/* Dark Pool */}
          <div style={box({
            flex: 1, flexDirection: 'column', justifyContent: 'center',
            padding: '12px 16px', borderRadius: '10px',
            background: C.glass, border: `1px solid ${C.glassBorder}`,
          })}>
            <div style={box({ justifyContent: 'space-between', alignItems: 'center' })}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: C.dim, letterSpacing: '2px' }}>{l.dpLabel}</span>
              <span style={{ fontSize: '9px', color: C.dim }}>{l.dpSub}</span>
            </div>
            <span style={{ fontSize: '28px', fontWeight: 900, color: dpColor, lineHeight: '1.2', marginTop: '4px' }}>
              {dpPct > 0 ? `${dpPct.toFixed(1)}%` : '-'}
            </span>
            {dpPct > 0 ? (
              <div style={box({ width: '100%', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', marginTop: '6px' })}>
                <div style={{ display: 'flex', width: `${Math.min(dpPct * 2, 100)}%`, height: '4px', borderRadius: '2px', background: dpColor }} />
              </div>
            ) : null}
          </div>

          {/* VIX */}
          <div style={box({
            flex: 1, flexDirection: 'column', justifyContent: 'center',
            padding: '12px 16px', borderRadius: '10px',
            background: C.glass, border: `1px solid ${C.glassBorder}`,
          })}>
            <div style={box({ justifyContent: 'space-between', alignItems: 'center' })}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: C.dim, letterSpacing: '2px' }}>{l.vixLabel}</span>
              <span style={{
                fontSize: '9px', fontWeight: 700, color: vi.color,
                padding: '1px 6px', borderRadius: '4px',
                background: `${vi.color}18`, border: `1px solid ${vi.color}33`,
              }}>{vi.label}</span>
            </div>
            <span style={{ fontSize: '28px', fontWeight: 900, color: vi.color, lineHeight: '1.2', marginTop: '4px' }}>{vix.toFixed(1)}</span>
            <div style={box({ width: '100%', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', marginTop: '6px' })}>
              <div style={{ display: 'flex', width: `${vi.pct}%`, height: '4px', borderRadius: '2px', background: vi.color }} />
            </div>
          </div>
        </div>

        {/* ── Event banner (optional) ── */}
        {type === 'event' && event ? (
          <div style={box({
            alignItems: 'center', justifyContent: 'center',
            marginTop: '8px', padding: '8px 20px', borderRadius: '10px',
            background: 'linear-gradient(90deg, rgba(168,85,247,0.08), rgba(34,211,238,0.08))',
            border: '1px solid rgba(168,85,247,0.15)',
          })}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: C.white }}>{event}</span>
          </div>
        ) : null}

        {/* ── Row 4: Footer (fixed ~36px) ── */}
        <div style={box({
          alignItems: 'center', justifyContent: 'space-between',
          marginTop: '12px', paddingTop: '10px',
          borderTop: `1px solid ${C.glassBorder}`,
        })}>
          <div style={box({ alignItems: 'center', gap: '8px' })}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: C.cyan, letterSpacing: '2px' }}>SIGNUM HQ</span>
            <span style={{ fontSize: '10px', color: C.dim }}>{l.tagline}</span>
          </div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: C.dim }}>signumhq.com</span>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: await loadFonts() }
  );
}

// ---------------------------------------------------------------------------
// Font loader — Inter from Google Fonts (cached at edge)
// ---------------------------------------------------------------------------
let _fontCache: { name: string; data: ArrayBuffer; weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900; style: 'normal' | 'italic' }[] | null = null;

async function loadFonts() {
  if (_fontCache) return _fontCache;
  try {
    const [regular, bold] = await Promise.all([
      fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf').then(r => r.arrayBuffer()),
      fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf').then(r => r.arrayBuffer()),
    ]);
    _fontCache = [
      { name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const },
      { name: 'Inter', data: bold, weight: 700 as const, style: 'normal' as const },
    ];
  } catch {
    _fontCache = [];
  }
  return _fontCache;
}
