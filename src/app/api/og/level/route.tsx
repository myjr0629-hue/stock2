// ============================================================================
// /api/og/level — Level-ladder card generator v2 (daily anchor franchise)
// Parametrized. Any ticker → hosted 1200×675 PNG. Highlighted row = price (gold).
// v2: radial-glow depth + grid + logo mark + gold glow band + per-level gap%.
// Keeps the single-idea focus (levels) — NOT the retired 4-metric dashboard.
// Example:
//   /api/og/level?ticker=NVDA&price=207.83&callWall=220&gammaFlip=205&maxPain=200&putFloor=180
// ============================================================================

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const C = {
  bg: '#06090f',
  ticker: '#F4F1E8',
  brand: '#8791A6',
  label: '#8B92A5',
  value: '#D2D8E4',
  line: '#222A3B',
  gold: '#E7C25A',
  goldLine: '#D4AF37',
  gap: '#59627A',
  foot: '#48515F',
};

const LABELS: Record<string, Record<string, string>> = {
  en: { CALL_WALL: 'CALL WALL', GAMMA_FLIP: 'GAMMA FLIP', MAX_PAIN: 'MAX PAIN', PUT_FLOOR: 'PUT FLOOR', LAST: 'LAST', note: 'Live options levels' },
  ja: { CALL_WALL: 'CALL WALL', GAMMA_FLIP: 'GAMMA FLIP', MAX_PAIN: 'MAX PAIN', PUT_FLOOR: 'PUT FLOOR', LAST: 'LAST', note: 'Live options levels' },
  ko: { CALL_WALL: 'CALL WALL', GAMMA_FLIP: 'GAMMA FLIP', MAX_PAIN: 'MAX PAIN', PUT_FLOOR: 'PUT FLOOR', LAST: 'LAST', note: 'Live options levels' },
};

function toNum(v: string | null): number | null {
  if (v == null || v === '') return null;
  const n = parseFloat(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
function gapStr(level: number, price: number | null): string {
  if (price == null || !Number.isFinite(price) || price === 0) return '';
  const g = ((level - price) / price) * 100;
  return `${g >= 0 ? '+' : '-'}${Math.abs(g).toFixed(1)}%`;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const ticker = (p.get('ticker') || 'SPY').toUpperCase();
  const lang = p.get('lang') || 'en';
  const L = LABELS[lang] || LABELS.en;
  const priceLabel = (p.get('priceLabel') || L.LAST).toUpperCase();
  const dateStr = p.get('date') || new Date().toISOString().split('T')[0];
  const note = p.get('note') || `${L.note} · not investment advice`;
  const showGap = p.get('gap') !== '0';

  const priceN = toNum(p.get('price'));
  const rows = [
    { label: L.CALL_WALL, raw: p.get('callWall'), hi: false },
    { label: priceLabel, raw: p.get('price'), hi: true },
    { label: L.GAMMA_FLIP, raw: p.get('gammaFlip'), hi: false },
    { label: L.MAX_PAIN, raw: p.get('maxPain'), hi: false },
    { label: L.PUT_FLOOR, raw: p.get('putFloor'), hi: false },
  ]
    .map((r) => ({ ...r, n: toNum(r.raw), display: (r.raw || '').replace(/,/g, '') }))
    .filter((r) => r.n != null)
    .sort((a, b) => (b.n as number) - (a.n as number))
    .map((r) => ({ ...r, gap: !r.hi && showGap ? gapStr(r.n as number, priceN) : '' }));

  const logo = await getLogoDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '675px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: C.bg,
          backgroundImage:
            'radial-gradient(ellipse 90% 70% at 82% 8%, rgba(231,194,90,0.11), transparent 55%), radial-gradient(ellipse 70% 60% at 8% 96%, rgba(34,211,238,0.06), transparent 55%)',
          padding: '52px 72px',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
        }}
      >
        {/* grid overlay */}
        <div
          style={{
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            display: 'flex',
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                display: 'flex',
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" width={30} height={30} style={{ objectFit: 'contain' }} />
            </div>
            <span style={{ color: C.ticker, fontSize: '46px', fontWeight: 700, letterSpacing: '1px' }}>${ticker}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ color: C.brand, fontSize: '18px', fontWeight: 700, letterSpacing: '4px' }}>SIGNUM HQ</span>
            <span style={{ color: C.foot, fontSize: '15px', letterSpacing: '1px', marginTop: '5px' }}>{dateStr}</span>
          </div>
        </div>

        {/* Ladder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
          {rows.map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '22px',
                padding: '9px 16px',
                borderRadius: '10px',
                ...(r.hi
                  ? { backgroundImage: 'linear-gradient(90deg, rgba(231,194,90,0.16), rgba(231,194,90,0.05) 55%, transparent)' }
                  : {}),
              }}
            >
              <span
                style={{
                  display: 'flex',
                  width: '188px',
                  color: r.hi ? C.gold : C.label,
                  fontSize: '21px',
                  fontWeight: r.hi ? 700 : 500,
                  letterSpacing: '2px',
                }}
              >
                {r.label}
              </span>
              <div
                style={{
                  display: 'flex',
                  flex: 1,
                  height: '1px',
                  borderTop: `${r.hi ? 3 : 1.5}px solid ${r.hi ? C.goldLine : C.line}`,
                }}
              />
              <span style={{ display: 'flex', width: '76px', justifyContent: 'flex-end', color: C.gap, fontSize: '17px' }}>
                {r.gap}
              </span>
              <span
                style={{
                  display: 'flex',
                  width: '160px',
                  justifyContent: 'flex-end',
                  color: r.hi ? C.gold : C.value,
                  fontSize: r.hi ? '46px' : '30px',
                  fontWeight: r.hi ? 800 : 500,
                }}
              >
                {r.display}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
          <span style={{ color: C.foot, fontSize: '17px' }}>{note}</span>
          <span style={{ color: C.brand, fontSize: '17px', letterSpacing: '1px' }}>signumhq.com</span>
        </div>
      </div>
    ),
    { width: 1200, height: 675, fonts: await loadFonts() }
  );
}

let _fontCache: { name: string; data: ArrayBuffer; weight: 400 | 500 | 700 | 800; style: 'normal' }[] | null = null;
async function loadFonts() {
  if (_fontCache) return _fontCache;
  try {
    const [regular, bold] = await Promise.all([
      fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf').then((r) => r.arrayBuffer()),
      fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf').then((r) => r.arrayBuffer()),
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

let _logoCache: string | null = null;
async function getLogoDataUri(): Promise<string> {
  if (_logoCache) return _logoCache;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://signumhq.com';
    const res = await fetch(`${baseUrl}/icons/icon-192x192.png`);
    const buf = await res.arrayBuffer();
    _logoCache = `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
  } catch {
    _logoCache = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }
  return _logoCache;
}
