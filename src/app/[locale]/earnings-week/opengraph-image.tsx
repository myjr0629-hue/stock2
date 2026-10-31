import { ImageResponse } from 'next/og';
import { getEarningsWeek } from '@/services/earningsWeekService';
import { COPY, hourText, mdw, pctText, phaseOf, rangeText, toLoc, type Loc } from '@/lib/earningsWeek';
import { fmtLevel, topLineOf } from '@/lib/earningsWeekView';

// ============================================================================
// /[locale]/earnings-week 의 공유 카드(og:image) — 언어별 · 이번 주 상위 종목 표 (2026-10-11)
//
// · 매 요청 생성(force-dynamic): 빌드 때 그리면 그 순간의 숫자가 박제된다. 숫자는 페이지와 «같은 서비스·같은 변환»(earningsWeekService · earningsWeekView)이다.
// · 글꼴: 영어는 Inter, 한국어·일본어는 Noto Sans(KR/JP)을 «쓰는 글자만» Google Fonts 에서 받는다(글자 부분집합 TTF). 못 받으면 영어판으로 그린다 — 카드는 항상 나온다.
// · 읽는 데이터가 없으면(Redis 장애 등) 표 없이 제목만 그린다.
// ============================================================================
export const dynamic = 'force-dynamic';
export const alt = 'SIGNUM HQ — US earnings this week';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const C = { bg: '#0B0E14', title: '#F4F1E8', label: '#8B92A5', value: '#D2D8E4', line: '#232B3B', accent: '#F59E4B', foot: '#566074' };

type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' };
let latinCache: Font[] | null = null;
async function latinFonts(): Promise<Font[]> {
  if (latinCache) return latinCache;
  try {
    const [regular, bold] = await Promise.all([
      fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf').then((r) => r.arrayBuffer()),
      fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf').then((r) => r.arrayBuffer()),
    ]);
    latinCache = [
      { name: 'Inter', data: regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: bold, weight: 700, style: 'normal' },
    ];
  } catch { latinCache = []; }
  return latinCache;
}

const cjkCache = new Map<string, ArrayBuffer>();
async function cjkFont(loc: 'ko' | 'ja', text: string): Promise<ArrayBuffer | null> {
  const family = loc === 'ko' ? 'Noto+Sans+KR' : 'Noto+Sans+JP';
  const chars = Array.from(new Set(text.split(''))).sort().join('');
  const key = `${loc}:${chars}`;
  const hit = cjkCache.get(key);
  if (hit) return hit;
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@700&text=${encodeURIComponent(chars)}`, { signal: AbortSignal.timeout(4000) }).then((r) => r.text());
    const m = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype)'\)/);
    if (!m) return null;
    const data = await fetch(m[1], { signal: AbortSignal.timeout(4000) }).then((r) => r.arrayBuffer());
    if (cjkCache.size > 20) cjkCache.clear();
    cjkCache.set(key, data);
    return data;
  } catch { return null; }
}

export default async function EarningsWeekOg({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const want: Loc = toLoc(locale);
  const data = await getEarningsWeek({ calendarOnly: true }).catch(() => null);
  const now = Date.now();

  // 글꼴 먼저 — 못 받으면 영어로
  let loc: Loc = want;
  let cjk: ArrayBuffer | null = null;
  const build = (l: Loc) => {
    const c = COPY[l];
    const range = data ? rangeText(data.range.start, data.range.end, l) : '';
    const ranked = (data?.rows ?? [])
      .map((r) => ({ r, phase: phaseOf(r.date, r.hour, now) }))
      .filter((x) => x.phase !== 'done' && x.r.impliedMovePct != null)
      .sort((a, b) => (b.r.impliedMovePct! - a.r.impliedMovePct!) || a.r.date.localeCompare(b.r.date))
      .slice(0, 5);
    const lines = ranked.map(({ r }) => ({
      ticker: r.ticker,
      when: `${mdw(r.date, l)} ${r.etTime ? `${r.etTime} ET` : hourText(r.hour, c)}`,
      move: pctText(r.impliedMovePct),
      mp: fmtLevel(r.maxPain) ?? '—',
    }));
    const title = l === 'ko' ? '이번 주 미국 실적' : l === 'ja' ? '今週の米国決算' : 'US earnings this week';
    const sub = l === 'ko' ? '옵션이 반영한 예상 변동폭 · Max Pain' : l === 'ja' ? 'オプションが織り込む予想変動幅 · Max Pain' : 'Options-implied move · Max Pain';
    const empty = l === 'ko' ? '회사가 공지한 발표 일정만 · 무료' : l === 'ja' ? '企業が告知した日程のみ · 無料' : 'Company-announced dates only · Free';
    const foot = l === 'ko' ? '무료 · 가입 없이 · iOS·안드로이드' : l === 'ja' ? '無料 · 登録不要 · iOS・Android' : 'Free · no account · iOS & Android';
    const top = data ? topLineOf(data, l, now) : null;
    const heads = l === 'ko' ? ['종목', '발표', '예상 변동폭', 'Max Pain'] : l === 'ja' ? ['銘柄', '発表', '予想変動幅', 'Max Pain'] : ['Stock', 'Report', 'Implied move', 'Max Pain'];
    return { c, range, lines, title, sub, empty, foot, top, heads };
  };
  let v = build(loc);
  if (want !== 'en') {
    const all = [v.title, v.sub, v.empty, v.foot, v.top ?? '', v.range, ...v.heads, ...v.lines.flatMap((x) => [x.ticker, x.when, x.move, x.mp]), 'SIGNUM HQ · EARNINGS WEEK ET0123456789:/()-–—±%$.,·→ '].join('');
    cjk = await cjkFont(want, all);
    if (!cjk) { loc = 'en'; v = build('en'); }
  }
  const fonts: Font[] = cjk
    ? [{ name: 'Noto', data: cjk, weight: 700, style: 'normal' }, { name: 'Noto', data: cjk, weight: 400, style: 'normal' }]
    : await latinFonts();
  const family = cjk ? 'Noto' : 'Inter';

  const colW = { tk: 190, wh: 360, mv: 280 };
  return new ImageResponse(
    (
      <div style={{
        width: '1200px', height: '630px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        backgroundColor: C.bg, padding: '38px 68px 34px', fontFamily: `${family}, sans-serif`,
        backgroundImage: 'radial-gradient(ellipse 90% 70% at 85% 5%, rgba(245,158,75,0.14), transparent 55%)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '5px', backgroundColor: C.accent }} />
            <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '0.14em', color: C.accent }}>{'SIGNUM HQ · EARNINGS WEEK'}</div>
            <div style={{ fontSize: '20px', color: C.label, display: 'flex', marginLeft: '8px' }}>{v.range}</div>
          </div>
          <div style={{ fontSize: '54px', fontWeight: 700, color: C.title, marginTop: '10px', lineHeight: 1.12, display: 'flex' }}>{v.title}</div>
          <div style={{ fontSize: '24px', color: C.label, marginTop: '4px', display: 'flex' }}>{v.lines.length ? v.sub : v.empty}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {v.lines.length > 0 && (
            <div style={{ display: 'flex', fontSize: '18px', color: C.label, paddingBottom: '8px' }}>
              <div style={{ display: 'flex', width: `${colW.tk}px` }}>{v.heads[0]}</div>
              <div style={{ display: 'flex', width: `${colW.wh}px` }}>{v.heads[1]}</div>
              <div style={{ display: 'flex', width: `${colW.mv}px` }}>{v.heads[2]}</div>
              <div style={{ display: 'flex', flexGrow: 1 }}>{v.heads[3]}</div>
            </div>
          )}
          {v.lines.map((x, i) => (
            <div key={`${x.ticker}-${i}`} style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${C.line}`, padding: '7px 0' }}>
              <div style={{ display: 'flex', width: `${colW.tk}px`, fontSize: '31px', fontWeight: 700, color: C.title }}>{x.ticker}</div>
              <div style={{ display: 'flex', width: `${colW.wh}px`, fontSize: '23px', color: C.value }}>{x.when}</div>
              <div style={{ display: 'flex', width: `${colW.mv}px`, fontSize: '31px', fontWeight: 700, color: C.accent }}>{x.move}</div>
              <div style={{ display: 'flex', flexGrow: 1, fontSize: '26px', color: C.value }}>{x.mp}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', color: C.foot }}>
          <div style={{ display: 'flex' }}>{v.foot}</div>
          <div style={{ display: 'flex' }}>signumhq.com</div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
