// ============================================================================
// /api/og/level — Level-ladder card generator (daily anchor franchise)
// Parametrized version of .agent/assets/card-designs/02-level-ladder.html
// Any ticker → hosted 1200×675 PNG. Highlighted row = current price (gold).
// Example:
//   /api/og/level?ticker=NVDA&price=207.83&priceLabel=LAST
//     &callWall=220&gammaFlip=205&maxPain=200&putFloor=180
// ============================================================================

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const C = {
  bg: '#0B0F1A',
  ticker: '#E8E4D8',
  brand: '#6B7280',
  label: '#8B92A5',
  value: '#C9CFDD',
  line: '#2A3247',
  gold: '#D4AF37',
  foot: '#4B5263',
};

// Label overrides per language (US-stock JP/KR traders still read tickers/levels in EN;
// labels localized only when lang param is passed)
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

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const ticker = (p.get('ticker') || 'SPY').toUpperCase();
  const lang = (p.get('lang') || 'en');
  const L = LABELS[lang] || LABELS.en;
  const priceLabel = (p.get('priceLabel') || L.LAST).toUpperCase();
  const dateStr = p.get('date') || new Date().toISOString().split('T')[0];
  const note = p.get('note') || `${L.note} · ${dateStr} · not investment advice`;

  // Build rows: current price (highlighted) + any provided structural levels, sorted high→low.
  const rows = [
    { label: L.CALL_WALL, raw: p.get('callWall'), hi: false },
    { label: priceLabel, raw: p.get('price'), hi: true },
    { label: L.GAMMA_FLIP, raw: p.get('gammaFlip'), hi: false },
    { label: L.MAX_PAIN, raw: p.get('maxPain'), hi: false },
    { label: L.PUT_FLOOR, raw: p.get('putFloor'), hi: false },
  ]
    .map((r) => ({ ...r, n: toNum(r.raw), display: (r.raw || '').replace(/,/g, '') }))
    .filter((r) => r.n != null)
    .sort((a, b) => (b.n as number) - (a.n as number));

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '675px',
          background: C.bg,
          padding: '56px 76px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ color: C.ticker, fontSize: '40px', fontWeight: 700 }}>${ticker}</span>
          <span style={{ color: C.brand, fontSize: '20px', fontWeight: 700, letterSpacing: '3px' }}>SIGNUM HQ</span>
        </div>

        {/* Ladder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <span
                style={{
                  display: 'flex',
                  width: '210px',
                  color: r.hi ? C.gold : C.label,
                  fontSize: '22px',
                  fontWeight: r.hi ? 700 : 400,
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
                  borderTop: `${r.hi ? 3 : 1.5}px solid ${r.hi ? C.gold : C.line}`,
                }}
              />
              <span
                style={{
                  display: 'flex',
                  color: r.hi ? C.gold : C.value,
                  fontSize: r.hi ? '46px' : '30px',
                  fontWeight: r.hi ? 700 : 400,
                }}
              >
                {r.display}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', color: C.foot, fontSize: '18px' }}>
          <span>{note}</span>
          <span>signumhq.com</span>
        </div>
      </div>
    ),
    { width: 1200, height: 675, fonts: await loadFonts() }
  );
}

let _fontCache: { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[] | null = null;
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
