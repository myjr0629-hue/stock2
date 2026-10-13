import { ImageResponse } from 'next/og';
import { readPicks } from '@/services/todayPicksService';
import { buildView } from '@/lib/todayPicks/view';
import { UI } from '@/lib/todayPicks/copy';
import { toLoc, type Loc } from '@/lib/earningsWeek';

// ============================================================================
// /[locale]/today 의 공유 카드(og:image) — 언어별 · 오늘 볼 것 5개 (2026-10-13)
//
// · 매 요청 생성(force-dynamic): 빌드 때 그리면 그 순간의 숫자가 박제된다. 숫자·문장은 페이지·앱 카드와 «같은 저장본»(readPicks → buildView)이다. AI 호출 0.
// · 글꼴: 영어는 Inter, 한국어·일본어는 Noto Sans(KR/JP)을 «쓰는 글자만» Google Fonts 에서 받는다(글자 부분집합 TTF). 못 받으면 영어판으로 그린다 — 카드는 항상 나온다.
// · 읽는 데이터가 없으면(끄기·저장소 장애) 항목 없이 제목만 그린다.
// ============================================================================
export const dynamic = 'force-dynamic';
export const alt = 'SIGNUM HQ — Worth watching in options today';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const C = { bg: '#0B0E14', title: '#F4F1E8', label: '#8B92A5', value: '#D2D8E4', line: '#232B3B', accent: '#7DD3FC', violet: '#8B5CF6', foot: '#566074' };

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

export default async function TodayOg({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const want: Loc = toLoc(locale);
  const read = await readPicks().catch(() => ({ doc: null, off: false, ageMs: null }));

  const build = (l: Loc) => {
    const ui = UI[l];
    const view = buildView(read.doc, l, read.off);
    const rows = view.items.slice(0, 5).map((p) => ({ ticker: p.ticker, label: p.label, what: p.what, asOf: p.asOf }));
    const sub = l === 'ko' ? '규칙으로 고르고 AI가 한 줄로 풀어 줍니다' : l === 'ja' ? 'ルールで選び、AIが一言で解説' : 'Picked by rules · one-line AI note';
    const foot = l === 'ko' ? '무료 · 가입 없이 · iOS·안드로이드' : l === 'ja' ? '無料 · 登録不要 · iOS・Android' : 'Free · no account · iOS & Android';
    return { ui, rows, sub, foot, picked: view.pickedAt ? ui.pickedLine(view.pickedAt) : '', finra: view.hasFinra ? ui.sourceFinra : '' };
  };
  let loc: Loc = want;
  let v = build(loc);
  let cjk: ArrayBuffer | null = null;
  if (want !== 'en') {
    const all = [v.ui.webH1, v.ui.title, v.sub, v.foot, v.picked, v.finra, ...v.rows.flatMap((r) => [r.ticker, r.label, r.what, r.asOf]), 'SIGNUM HQ · AI ET0123456789:/()-–—±%$.,·→+ '].join('');
    cjk = await cjkFont(want, all);
    if (!cjk) { loc = 'en'; v = build('en'); }
  }
  const fonts: Font[] = cjk
    ? [{ name: 'Noto', data: cjk, weight: 700, style: 'normal' }, { name: 'Noto', data: cjk, weight: 400, style: 'normal' }]
    : await latinFonts();
  const family = cjk ? 'Noto' : 'Inter';

  return new ImageResponse(
    (
      <div style={{
        width: '1200px', height: '630px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        backgroundColor: C.bg, padding: '36px 64px 32px', fontFamily: `${family}, sans-serif`,
        backgroundImage: 'radial-gradient(ellipse 80% 70% at 12% 0%, rgba(124,58,237,0.22), transparent 58%), radial-gradient(ellipse 70% 60% at 100% 100%, rgba(3,105,161,0.20), transparent 60%)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ display: 'flex', padding: '2px 12px', borderRadius: '8px', fontSize: '22px', fontWeight: 700, color: '#FFFFFF', backgroundImage: 'linear-gradient(100deg, #7C3AED, #0369A1)' }}>{'AI'}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '0.12em', color: C.accent, display: 'flex' }}>{'SIGNUM HQ'}</div>
            <div style={{ fontSize: '20px', color: C.label, display: 'flex', marginLeft: '8px' }}>{v.picked}</div>
          </div>
          <div style={{ fontSize: '50px', fontWeight: 700, color: C.title, marginTop: '10px', lineHeight: 1.12, display: 'flex' }}>{v.ui.webH1}</div>
          <div style={{ fontSize: '24px', color: C.label, marginTop: '4px', display: 'flex' }}>{v.sub}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {v.rows.map((r, i) => (
            <div key={`${r.ticker}-${i}`} style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${C.line}`, padding: '7px 0' }}>
              <div style={{ display: 'flex', width: '170px', fontSize: '31px', fontWeight: 700, color: C.title }}>{r.ticker}</div>
              <div style={{ display: 'flex', width: '262px', fontSize: '19px', fontWeight: 700, color: C.accent }}>{r.label}</div>
              <div style={{ display: 'flex', flexGrow: 1, fontSize: '21px', color: C.value }}>{r.what}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', color: C.foot }}>
          <div style={{ display: 'flex' }}>{v.foot}{v.finra ? ` · ${v.finra}` : ''}</div>
          <div style={{ display: 'flex' }}>signumhq.com</div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
