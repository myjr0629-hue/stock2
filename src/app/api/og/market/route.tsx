// ============================================================================
// /api/og/market — Premium OG Image v3.0 (GPT+Gemini Fusion)
// GEX Hero + Scale Bar + Signal Ring + 3 Metric Cards
// ============================================================================

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const C = {
  bg: '#06090f',
  card: 'rgba(15,23,42,0.85)',
  cardBorder: 'rgba(100,160,220,0.12)',
  cardBorderHi: 'rgba(34,211,238,0.18)',
  cyan: '#22d3ee',
  cyanDim: '#06b6d4',
  purple: '#a78bfa',
  green: '#34d399',
  greenBright: '#4ade80',
  red: '#f87171',
  amber: '#fbbf24',
  white: '#f1f5f9',
  muted: '#94a3b8',
  dim: '#64748b',
  dimmer: '#475569',
};

const L: Record<string, Record<string, string>> = {
  en: {
    pulse: 'MARKET PULSE', event: 'STRUCTURAL ALERT', education: 'MARKET INSIGHT',
    morning: 'PRE-MARKET BRIEF', weekly: 'WEEKLY STRUCTURE', spotlight: 'TICKER SPOTLIGHT',
    gexLabel: 'GEX REGIME', gexScale: 'GEX REGIME SCALE',
    positive: 'POSITIVE', negative: 'NEGATIVE', neutral: 'NEUTRAL', transition: 'TRANSITION',
    gexDescPos: 'Dealer positioning may dampen volatility and support mean reversion.',
    gexDescNeg: 'Dealer hedging amplifies directional moves — trend acceleration likely.',
    gexDescNeu: 'No directional conviction from dealers — watch for breakout.',
    gexDescTra: 'Regime shifting — structural transition in progress.',
    gexSignal: 'GEX SIGNAL', strong: 'STRONG', weak: 'WEAK', mixed: 'MIXED',
    sp500: 'S&P 500', todayChange: "TODAY'S CHANGE",
    dpLabel: 'DARK POOL', dpSub: 'INSTITUTIONAL ACTIVITY',
    vixLabel: 'VIX', vixSub: 'MARKET VOLATILITY',
    vixLow: 'CALM', vixMid: 'ELEVATED', vixHigh: 'HIGH', vixExt: 'EXTREME',
    tagline: 'See What Others Cannot',
    footer: 'Institutional Intelligence, Democratized',
    footerSub: 'GEX · Dark Pool · Options Flow · AI Verdicts',
  },
  ko: {
    pulse: 'MARKET PULSE', event: 'STRUCTURAL ALERT', education: 'MARKET INSIGHT',
    morning: 'PRE-MARKET BRIEF', weekly: 'WEEKLY STRUCTURE', spotlight: 'TICKER SPOTLIGHT',
    gexLabel: 'GEX REGIME', gexScale: 'GEX REGIME SCALE',
    positive: 'POSITIVE', negative: 'NEGATIVE', neutral: 'NEUTRAL', transition: 'TRANSITION',
    gexDescPos: '딜러 포지셔닝이 변동성을 억제하고 평균 회귀를 지지합니다.',
    gexDescNeg: '딜러 헤징이 방향성 움직임을 증폭합니다.',
    gexDescNeu: '딜러 방향성 확신 없음 — 돌파 주시.',
    gexDescTra: '레짐 전환 중 — 구조적 전환 진행.',
    gexSignal: 'GEX SIGNAL', strong: 'STRONG', weak: 'WEAK', mixed: 'MIXED',
    sp500: 'S&P 500', todayChange: '당일 변동',
    dpLabel: 'DARK POOL', dpSub: '기관 활동',
    vixLabel: 'VIX', vixSub: '시장 변동성',
    vixLow: 'CALM', vixMid: 'ELEVATED', vixHigh: 'HIGH', vixExt: 'EXTREME',
    tagline: 'See What Others Cannot',
    footer: 'Institutional Intelligence, Democratized',
    footerSub: 'GEX · Dark Pool · Options Flow · AI Verdicts',
  },
  ja: {
    pulse: 'MARKET PULSE', event: 'STRUCTURAL ALERT', education: 'MARKET INSIGHT',
    morning: 'PRE-MARKET BRIEF', weekly: 'WEEKLY STRUCTURE', spotlight: 'TICKER SPOTLIGHT',
    gexLabel: 'GEX REGIME', gexScale: 'GEX REGIME SCALE',
    positive: 'POSITIVE', negative: 'NEGATIVE', neutral: 'NEUTRAL', transition: 'TRANSITION',
    gexDescPos: 'ディーラーポジショニングがボラティリティを抑制。',
    gexDescNeg: 'ディーラーヘッジが方向性を増幅。',
    gexDescNeu: 'ディーラー方向性確信なし — ブレイクアウト注視。',
    gexDescTra: 'レジーム転換中 — 構造的転換進行。',
    gexSignal: 'GEX SIGNAL', strong: 'STRONG', weak: 'WEAK', mixed: 'MIXED',
    sp500: 'S&P 500', todayChange: '本日の変動',
    dpLabel: 'DARK POOL', dpSub: '機関活動',
    vixLabel: 'VIX', vixSub: 'ボラティリティ',
    vixLow: 'CALM', vixMid: 'ELEVATED', vixHigh: 'HIGH', vixExt: 'EXTREME',
    tagline: 'See What Others Cannot',
    footer: 'Institutional Intelligence, Democratized',
    footerSub: 'GEX · Dark Pool · Options Flow · AI Verdicts',
  },
};

function changeColor(v: number) { return v > 0 ? C.green : v < 0 ? C.red : C.muted; }
function fmt(v: number) { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }

function gexTheme(gex: string) {
  const g = gex.toLowerCase();
  if (g === 'positive') return { color: C.green, colorBright: C.greenBright, ringBg: 'rgba(52,211,153,0.12)', pct: 80, signal: 'STRONG' };
  if (g === 'negative') return { color: C.red, colorBright: '#fb923c', ringBg: 'rgba(248,113,113,0.12)', pct: 20, signal: 'WEAK' };
  if (g === 'transition') return { color: C.amber, colorBright: '#fcd34d', ringBg: 'rgba(251,191,36,0.12)', pct: 50, signal: 'MIXED' };
  return { color: C.muted, colorBright: '#cbd5e1', ringBg: 'rgba(148,163,184,0.08)', pct: 50, signal: 'MIXED' };
}

function vixInfo(v: number, l: Record<string, string>) {
  if (v >= 30) return { color: C.red, label: l.vixExt };
  if (v >= 25) return { color: '#f97316', label: l.vixHigh };
  if (v >= 18) return { color: C.amber, label: l.vixMid };
  return { color: C.green, label: l.vixLow };
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

const B = (extra: Record<string, string | number> = {}) => ({
  display: 'flex' as const, ...extra,
});

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

  // Formatted date: "May 11, 2026"
  const dateFormatted = (() => {
    try {
      return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return date; }
  })();

  return new ImageResponse(
    (
      <div style={B({
        width: `${W}px`, height: `${H}px`, flexDirection: 'column',
        backgroundColor: C.bg,
        backgroundImage: `radial-gradient(ellipse 120% 80% at 70% 20%, rgba(34,211,238,0.06) 0%, transparent 50%), radial-gradient(ellipse 80% 60% at 20% 80%, rgba(99,102,241,0.05) 0%, transparent 50%)`,
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '32px 44px 24px',
        position: 'relative', overflow: 'hidden',
      })}>

        {/* Background grid */}
        <div style={B({
          position: 'absolute', top: '0', left: '0', right: '0', bottom: '0',
          backgroundImage: `linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        })} />

        {/* ── Header ── */}
        <div style={B({ alignItems: 'center', justifyContent: 'space-between', height: '44px', position: 'relative' })}>
          <div style={B({ alignItems: 'center', gap: '14px' })}>
            <div style={B({
              width: '38px', height: '38px', borderRadius: '10px',
              alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
            })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={await getLogoDataUri()} alt="" width={26} height={26} style={{ objectFit: 'contain' }} />
            </div>
            <span style={{ fontSize: '20px', fontWeight: 900, color: C.white, letterSpacing: '3px' }}>SIGNUM HQ</span>
            <div style={B({ width: '1px', height: '20px', background: C.dimmer, marginLeft: '4px', marginRight: '4px' })} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: C.muted, letterSpacing: '2px' }}>{title}</span>
          </div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: C.dim, letterSpacing: '1px' }}>{dateFormatted}</span>
        </div>

        {/* ── GEX Hero Section ── */}
        <div style={B({
          marginTop: '16px', padding: '20px 28px', borderRadius: '16px',
          backgroundColor: 'rgba(15,23,42,0.9)',
          border: `1px solid ${C.cardBorder}`,
          justifyContent: 'space-between', alignItems: 'center',
          height: '175px',
        })}>
          {/* Left: GEX info */}
          <div style={B({ flexDirection: 'column', flex: '1' })}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: C.dim, letterSpacing: '3px' }}>{l.gexLabel}</span>
            <span style={{ fontSize: '48px', fontWeight: 900, color: gt.color, letterSpacing: '3px', lineHeight: '1.1', marginTop: '4px' }}>{gexLabel}</span>
            <span style={{ fontSize: '12px', color: C.muted, marginTop: '6px', lineHeight: '1.4', maxWidth: '480px' }}>{gexDesc(gex, l)}</span>

            {/* GEX Scale Bar */}
            <div style={B({ flexDirection: 'column', marginTop: '14px', width: '420px' })}>
              <div style={B({ width: '100%', height: '6px', borderRadius: '3px', background: 'linear-gradient(90deg, rgba(248,113,113,0.4), rgba(148,163,184,0.2) 50%, rgba(52,211,153,0.4))', position: 'relative' })}>
                <div style={B({
                  width: '12px', height: '12px', borderRadius: '50%',
                  background: gt.color, border: `2px solid ${C.white}`,
                  position: 'absolute', top: '-3px',
                  left: `${gt.pct}%`,
                })} />
              </div>
              <div style={B({ justifyContent: 'space-between', marginTop: '4px', width: '100%' })}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: C.red, letterSpacing: '1px' }}>NEGATIVE</span>
                <span style={{ fontSize: '9px', fontWeight: 700, color: C.dim, letterSpacing: '1px' }}>NEUTRAL</span>
                <span style={{ fontSize: '9px', fontWeight: 700, color: C.green, letterSpacing: '1px' }}>POSITIVE</span>
              </div>
            </div>
          </div>

          {/* Right: GEX Signal Ring */}
          <div style={B({ flexDirection: 'column', alignItems: 'center', gap: '6px', marginLeft: '20px' })}>
            <div style={B({
              width: '90px', height: '90px', borderRadius: '50%',
              alignItems: 'center', justifyContent: 'center',
              background: gt.ringBg,
              border: `2px solid ${gt.color}44`,
            })}>
              <div style={B({
                width: '70px', height: '70px', borderRadius: '50%',
                alignItems: 'center', justifyContent: 'center',
                border: `3px solid ${gt.color}`,
                flexDirection: 'column',
              })}>
                <div style={B({ width: '8px', height: '8px', borderRadius: '50%', background: gt.color })} />
              </div>
            </div>
            <span style={{ fontSize: '9px', fontWeight: 700, color: C.dim, letterSpacing: '2px' }}>{l.gexSignal}</span>
            <span style={{ fontSize: '13px', fontWeight: 900, color: gt.color, letterSpacing: '2px', fontStyle: 'italic' }}>{gt.signal}</span>
          </div>
        </div>

        {/* ── Three Metric Cards ── */}
        <div style={B({ marginTop: '14px', gap: '12px', flex: '1' })}>

          {/* S&P 500 */}
          <div style={B({
            flex: '1', flexDirection: 'column', justifyContent: 'center',
            padding: '16px 20px', borderRadius: '14px',
            background: C.card, border: `1px solid ${C.cardBorder}`,
          })}>
            <div style={B({ justifyContent: 'space-between', alignItems: 'center' })}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: C.dim, letterSpacing: '2px' }}>{l.sp500}</span>
              <span style={{ fontSize: '16px', color: changeColor(spy) }}>/</span>
            </div>
            <span style={{ fontSize: '34px', fontWeight: 900, color: changeColor(spy), lineHeight: '1.2', marginTop: '6px' }}>{fmt(spy)}</span>
            <div style={B({ alignItems: 'center', gap: '6px', marginTop: '6px' })}>
              <div style={B({ width: '6px', height: '6px', borderRadius: '50%', background: changeColor(spy) })} />
              <span style={{ fontSize: '9px', color: C.dim, letterSpacing: '1px' }}>{l.todayChange}</span>
            </div>
          </div>

          {/* Dark Pool */}
          <div style={B({
            flex: '1', flexDirection: 'column', justifyContent: 'center',
            padding: '16px 20px', borderRadius: '14px',
            background: C.card, border: `1px solid ${C.cardBorder}`,
          })}>
            <div style={B({ justifyContent: 'space-between', alignItems: 'center' })}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: C.dim, letterSpacing: '2px' }}>{l.dpLabel}</span>
              <span style={{ fontSize: '14px', color: dpColor }}>o</span>
            </div>
            <span style={{ fontSize: '34px', fontWeight: 900, color: dpColor, lineHeight: '1.2', marginTop: '6px' }}>
              {dpPct > 0 ? `${dpPct.toFixed(1)}%` : '—'}
            </span>
            {dpPct > 0 ? (
              <div style={B({ flexDirection: 'column', marginTop: '6px', gap: '3px' })}>
                <div style={B({ width: '100%', height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)' })}>
                  <div style={{ display: 'flex', width: `${Math.min(dpPct * 2, 100)}%`, height: '5px', borderRadius: '3px', background: `linear-gradient(90deg, ${C.cyanDim}, ${dpColor})` }} />
                </div>
                <div style={B({ justifyContent: 'space-between' })}>
                  <span style={{ fontSize: '8px', color: C.dimmer }}>0%</span>
                  <span style={{ fontSize: '8px', color: C.dimmer }}>50%</span>
                  <span style={{ fontSize: '8px', color: C.dimmer }}>100%</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* VIX */}
          <div style={B({
            flex: '1', flexDirection: 'column', justifyContent: 'center',
            padding: '16px 20px', borderRadius: '14px',
            background: C.card, border: `1px solid ${C.cardBorder}`,
          })}>
            <div style={B({ justifyContent: 'space-between', alignItems: 'center' })}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: C.dim, letterSpacing: '2px' }}>{l.vixLabel}</span>
              <span style={{ fontSize: '14px', color: vi.color }}>~</span>
            </div>
            <div style={B({ alignItems: 'center', gap: '12px', marginTop: '6px' })}>
              <span style={{ fontSize: '34px', fontWeight: 900, color: vi.color, lineHeight: '1.2' }}>{vix.toFixed(1)}</span>
              <span style={{
                fontSize: '10px', fontWeight: 800, color: vi.color,
                padding: '3px 10px', borderRadius: '6px',
                background: `${vi.color}18`, border: `1px solid ${vi.color}33`,
                letterSpacing: '1px',
              }}>{vi.label}</span>
            </div>
            <div style={B({ alignItems: 'center', gap: '6px', marginTop: '6px' })}>
              <div style={B({ width: '6px', height: '6px', borderRadius: '50%', background: vi.color })} />
              <span style={{ fontSize: '9px', color: C.dim, letterSpacing: '1px' }}>{l.vixSub}</span>
            </div>
          </div>
        </div>

        {/* ── Event banner ── */}
        {type === 'event' && event ? (
          <div style={B({
            alignItems: 'center', justifyContent: 'center',
            marginTop: '8px', padding: '8px 20px', borderRadius: '10px',
            background: 'linear-gradient(90deg, rgba(168,85,247,0.08), rgba(34,211,238,0.08))',
            border: '1px solid rgba(168,85,247,0.15)',
          })}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: C.white }}>{event}</span>
          </div>
        ) : null}

        {/* ── Footer ── */}
        <div style={B({
          alignItems: 'center', justifyContent: 'space-between',
          marginTop: '10px', paddingTop: '10px',
          borderTop: `1px solid rgba(255,255,255,0.06)`,
          position: 'relative',
        })}>
          <div style={B({ alignItems: 'center', gap: '10px' })}>
            <div style={B({
              width: '22px', height: '22px', borderRadius: '6px',
              alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
            })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={await getLogoDataUri()} alt="" width={15} height={15} style={{ objectFit: 'contain' }} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 800, color: C.cyan, letterSpacing: '2px' }}>SIGNUM HQ</span>
          </div>
          <div style={B({ flexDirection: 'column', alignItems: 'center' })}>
            <span style={{ fontSize: '10px', color: C.muted, letterSpacing: '1px' }}>{l.tagline}</span>
          </div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: C.dim }}>signumhq.com</span>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: await loadFonts() }
  );
}

// ---------------------------------------------------------------------------
// Font loader
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
  } catch { _fontCache = []; }
  return _fontCache;
}

// ---------------------------------------------------------------------------
// Logo loader
// ---------------------------------------------------------------------------
let _logoCache: string | null = null;

async function getLogoDataUri(): Promise<string> {
  if (_logoCache) return _logoCache;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
    const res = await fetch(`${baseUrl}/icons/icon-192x192.png`);
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    _logoCache = `data:image/png;base64,${b64}`;
  } catch {
    _logoCache = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }
  return _logoCache;
}
