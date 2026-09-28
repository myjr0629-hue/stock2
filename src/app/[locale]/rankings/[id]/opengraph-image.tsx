import { ImageResponse } from 'next/og';
import { byId } from '@/lib/rankings/registry';
import { publicBase } from '@/lib/net/publicBase';

// ============================================================================
// /[locale]/rankings/[id] 의 공유 카드(og:image) — 2026-09-29 공유 루프
//
// 왜: 랭킹 페이지는 og:image 가 «없었다»(2026-09-29 운영 실측: og:title·description 만).
//   앱의 랭킹 공유 버튼이 이 페이지를 보내므로, 카톡·아이메시지·X 에서 그림 없는 회색 링크로 붙었다.
//   파일 규약(opengraph-image)으로 둔다 — page.tsx 의 메타데이터를 건드리지 않아
//   대기 중인 fix/seo-fresh-numbers(같은 파일의 설명문 수리)와 겹치지 않는다.
//
// ⚠️ 글자는 영어만 — 임베드 글꼴(Inter)이 라틴 전용이다(/api/og/leaders·level 과 같은 이유).
// ⚠️ 매 요청 생성: 빌드 때 33장(11종×3언어)을 미리 그리면 그 순간의 순위가 박제된다.
//    순위 자료는 데이터 캐시(15분)로 받고, 못 받으면 순위 없이 제목만 그린다(카드는 항상 나온다).
// ============================================================================

export const dynamic = 'force-dynamic';
export const alt = 'SIGNUM HQ — today’s US stock ranking';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const C = { bg: '#06090f', title: '#F4F1E8', label: '#8B92A5', value: '#D2D8E4', line: '#222A3B', foot: '#48515F' };
// 앱 랭킹 카드의 단계 색(장중 청록·마감 후 보라·상시 금색)과 같게
const ACCENT: Record<string, string> = { intraday: '#4FD1E8', postclose: '#A78BFA', anytime: '#E7C25A' };
const GLOW: Record<string, string> = { intraday: 'rgba(34,211,238,0.13)', postclose: 'rgba(167,139,250,0.13)', anytime: 'rgba(231,194,90,0.11)' };

let fontCache: { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[] | null = null;
async function loadFonts() {
  if (fontCache) return fontCache;
  try {
    const [regular, bold] = await Promise.all([
      fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf').then((r) => r.arrayBuffer()),
      fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf').then((r) => r.arrayBuffer()),
    ]);
    fontCache = [
      { name: 'Inter', data: regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: bold, weight: 700, style: 'normal' },
    ];
  } catch { fontCache = []; }
  return fontCache;
}

type Item = Record<string, any>;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sign = (v: number, d = 1) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`;

/** 한 줄 = [이름, 대표값, 보조] — 앱 랭킹 카드(readRow)와 같은 필드를 영어로. 모르는 모양은 값 없이. */
function row(id: string, it: Item): [string, string, string] {
  const t = String(it.ticker || '');
  const name = t && t !== 'N/A' && t !== 'NONE' ? t : String(it.company || '—').slice(0, 14);
  const lbl = (o: any) => (o && typeof o === 'object' ? String(o.en || '') : '');
  switch (id) {
    case 'deviation': return [name, num(it.ratio) ? `${it.ratio.toFixed(1)}×` : '', `${lbl(it.label)} vs its norm`.trim()];
    case 'multi-axis': return [name, `${it.axisCount ?? ''} axes`, Array.isArray(it.axes) ? it.axes.slice(0, 2).map((a: any) => lbl(a.label)).join(' · ') : ''];
    case 'maxpain-gap': return [name, num(it.gapPct) ? `${sign(it.gapPct)}%` : '', num(it.level) ? `to max pain $${it.level}` : ''];
    case 'gamma-flip': return [name, num(it.gapPct) ? `${sign(it.gapPct)}%` : '', num(it.level) ? `to flip $${it.level}` : ''];
    case 'money-vs-oi': return [name, num(it.dollarRatio) ? `${it.dollarRatio.toFixed(2)}× $` : '', num(it.oiRatio) ? `OI ${it.oiRatio.toFixed(2)}×` : ''];
    case 'darkpool-volume': return [name, num(it.ratio) ? `${it.ratio.toFixed(1)}×` : '', 'off-exchange vs norm'];
    case 'darkpool-short': return [name, num(it.today) ? `${it.today.toFixed(1)}%` : '', num(it.baseline) ? `norm ${it.baseline.toFixed(1)}%` : ''];
    case 'stealth': return [name, num(it.stealth) ? `${it.stealth}/100` : '', String(it.regime || '').toLowerCase()];
    case 'insider-conviction': return [name, num(it.usd) ? `$${(it.usd / 1e6).toFixed(1)}M` : '', num(it.buyerCount) && it.buyerCount > 1 ? `${it.buyerCount} insiders` : 'insider buy'];
    case 'deep-value-fcf': return [name, num(it.fcfYield) ? `FCF ${it.fcfYield.toFixed(1)}%` : '', num(it.evToEbitda) ? `EV/EBITDA ${it.evToEbitda.toFixed(1)}` : ''];
    case 'volatility-bet': return [name, num(it.ivRank) ? `IV rank ${it.ivRank}` : '', num(it.atmIv) ? `ATM IV ${it.atmIv.toFixed(1)}%` : ''];
    default: return [name, '', ''];
  }
}

export default async function RankingOgImage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  const spec = byId(id);
  const title = spec?.name.en || 'Today’s ranking';
  const accent = ACCENT[spec?.phase || 'anytime'] || ACCENT.anytime;
  const glow = GLOW[spec?.phase || 'anytime'] || GLOW.anytime;

  let rows: [string, string, string][] = [];
  let date = '';
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(`${publicBase()}/api/ranking?run=${encodeURIComponent(id)}&top=3`, { next: { revalidate: 900 }, signal: ctl.signal });
    clearTimeout(timer);
    if (r.ok) {
      const j = await r.json();
      const b = j?.results?.[id];
      if (b?.available && Array.isArray(b.items)) rows = b.items.slice(0, 3).map((it: Item) => row(id, it));
      date = String(j?.generatedAt || '').slice(0, 10);
    }
  } catch { /* 순위 없이 제목만 */ }

  const fonts = await loadFonts();
  return new ImageResponse(
    (
      <div style={{
        width: '1200px', height: '630px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        backgroundColor: C.bg, padding: '52px 72px', fontFamily: 'Inter, sans-serif',
        backgroundImage: `radial-gradient(ellipse 90% 70% at 82% 8%, ${glow}, transparent 55%)`,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '5px', backgroundColor: accent }} />
            <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '0.16em', color: accent }}>
              {'SIGNUM HQ · TODAY’S RANKING'}
            </div>
          </div>
          <div style={{ fontSize: '62px', fontWeight: 700, color: C.title, marginTop: '14px', lineHeight: 1.1 }}>{title}</div>
          <div style={{ fontSize: '22px', color: C.label, marginTop: '10px' }}>
            {date ? `Updated ${date} · each name vs its own normal` : 'Each name measured against its own normal'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map(([name, v, sub], i) => (
            <div key={`${name}-${i}`} style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${C.line}`, padding: '16px 0' }}>
              <div style={{ fontSize: '26px', color: C.label, width: '48px' }}>{String(i + 1)}</div>
              <div style={{ fontSize: '38px', fontWeight: 700, color: C.title, width: '300px' }}>{name}</div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: accent, width: '260px' }}>{v}</div>
              <div style={{ fontSize: '24px', color: C.value, display: 'flex', flexGrow: 1 }}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', color: C.foot }}>
          <div style={{ display: 'flex' }}>Free · no account · iOS & Android</div>
          <div style={{ display: 'flex' }}>signumhq.com</div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
