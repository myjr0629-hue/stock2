// ============================================================================
// /api/og/leaders — 순위표 두 장(/dark-pool · /options-flow)의 공유 카드.
//
// 왜 필요한가: 이 페이지들은 «남이 링크하라고» 만든 것이다. 그런데 OG 이미지가
//   없으면 X·슬랙·디스코드에서 링크가 «회색 상자»로 붙는다. 링크될 자산에
//   카드가 없는 건 문을 만들고 간판을 안 단 것과 같다.
//
// ⚠️ 텍스트는 **영어만** 쓴다. 임베드 폰트가 Inter(라틴 전용)라서 CJK 를 넣으면
//    엣지 런타임에서 두부글자(□□□)가 된다 — /api/og/level 이 같은 이유로 이미
//    영어 고정이다. 로케일별로 다른 카드를 원하면 CJK 폰트부터 실어야 한다.
//
// 예: /api/og/leaders?kind=darkpool&date=2026-08-28
//       &r1=FNGR|18.7x vs norm|54.9%25 off-exch
// ============================================================================
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const C = {
  bg: '#06090f',
  title: '#F4F1E8',
  brand: '#8791A6',
  label: '#8B92A5',
  value: '#D2D8E4',
  line: '#222A3B',
  foot: '#48515F',
};

const KINDS: Record<string, { kicker: string; title: string; sub: string; accent: string; glow: string; foot: string }> = {
  darkpool: {
    kicker: 'OFF-EXCHANGE TAPE',
    title: 'Dark Pool Volume Today',
    sub: 'ranked against each name’s own baseline',
    accent: '#4FD1E8',
    glow: 'rgba(34,211,238,0.13)',
    foot: 'Free · no account · Data source: FINRA',
  },
  options: {
    kicker: 'NEW OPTIONS POSITIONS',
    title: 'Unusual Options Activity Today',
    sub: 'positions opened, measured by open interest',
    accent: '#E7C25A',
    glow: 'rgba(231,194,90,0.11)',
    foot: 'Free · no account · open interest that actually increased',
  },
};

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

/** `TICKER|왼쪽 값|오른쪽 값` → 행. 값이 없으면 그 행은 통째로 버린다. */
function parseRow(raw: string | null) {
  if (!raw) return null;
  const [ticker, left, right] = raw.split('|');
  if (!ticker) return null;
  return { ticker: ticker.trim().slice(0, 8), left: (left || '').trim().slice(0, 28), right: (right || '').trim().slice(0, 28) };
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const k = KINDS[p.get('kind') || 'darkpool'] || KINDS.darkpool;
  const date = (p.get('date') || '').slice(0, 10);
  const rows = [p.get('r1'), p.get('r2'), p.get('r3')].map(parseRow).filter(Boolean) as
    { ticker: string; left: string; right: string }[];

  const fonts = await loadFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: C.bg,
          backgroundImage: `radial-gradient(ellipse 90% 70% at 82% 8%, ${k.glow}, transparent 55%), radial-gradient(ellipse 70% 60% at 8% 96%, rgba(34,211,238,0.06), transparent 55%)`,
          padding: '52px 72px',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '5px', backgroundColor: k.accent }} />
            {/* ⚠️ Satori 규칙: 자식이 2개 이상인 div 는 display:flex 가 필수다.
                텍스트 + 표현식도 «자식 2개»로 센다. 문자열을 미리 합쳐 하나로 준다. */}
            <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '0.16em', color: k.accent }}>
              {`SIGNUM HQ · ${k.kicker}`}
            </div>
          </div>
          <div style={{ fontSize: '62px', fontWeight: 700, color: C.title, marginTop: '14px', lineHeight: 1.1 }}>
            {k.title}
          </div>
          {date && (
            <div style={{ fontSize: '22px', color: C.label, marginTop: '10px' }}>
              {`Session of ${date} · ${k.sub}`}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => (
            <div
              key={`${r.ticker}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: `1px solid ${C.line}`,
                padding: '18px 0',
              }}
            >
              <div style={{ fontSize: '38px', fontWeight: 700, color: C.title, width: '220px' }}>{r.ticker}</div>
              <div style={{ fontSize: '30px', color: k.accent, flexGrow: 1 }}>{r.left}</div>
              <div style={{ fontSize: '30px', color: C.value }}>{r.right}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', color: C.foot }}>
          <div style={{ display: 'flex' }}>{k.foot}</div>
          <div style={{ display: 'flex' }}>signumhq.com</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: fonts.length ? (fonts as any) : undefined },
  );
}
