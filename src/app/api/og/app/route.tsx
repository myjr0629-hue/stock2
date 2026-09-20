// ============================================================================
// /api/og/app — 앱 링크 미리보기 카드 1200×675 (SIGNUM / Undercurrent / WIM · ko·ja·en)
//
// ★2026-09-20 만든 이유: `/app-uc`·`/app-wim` 의 og:image 가 1024² «아이콘»뿐이라
//   카드를 작은 summary 로 내려야 했다. 전용 카드가 없다는 이유였는데, 그 판단은 틀렸다 —
//   Google Fonts 의 `text=` 서브셋이 **TTF** 를 준다(한국어 9.5KB). Satori 가 woff2 를
//   못 읽는 것이 제약이었지 «한글 카드를 못 만든다»는 제약이 아니었다.
//
// 문구는 `@/lib/marketing/linkPreview` 의 COPY 를 그대로 쓴다 — 카드와 og:description 이
// 갈라지지 않게 하기 위해서다(같은 것을 두 곳에 적으면 반드시 갈라진다).
//
//   /api/og/app?app=uc&l=ko
// ============================================================================

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { COPY, SITE_NAME, type PreviewLang } from '@/lib/marketing/linkPreview';
import type { StoreApp } from '@/lib/marketing/storeRedirect';

export const runtime = 'edge';

const C = {
  bg: '#06090f',
  title: '#F4F1E8',
  desc: '#98A1B3',
  line: '#1C2434',
  foot: '#5A6376',
};

const ACCENT: Record<StoreApp, string> = {
  signum: '#E7C25A',
  uc: '#4FD1E8',
  wim: '#A78BFA',
};

const ICON: Record<StoreApp, string> = {
  signum: '/app-icons/signum.png',
  uc: '/app-icons/uc.png',
  wim: '/app-icons/wim-1024.png',
};

const FOOT: Record<PreviewLang, string> = {
  en: 'Free · iOS & Android · no account',
  ja: '無料 · iOS / Android · 登録不要',
  ko: '무료 · iOS · Android · 가입 없이',
};

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const app = (['signum', 'uc', 'wim'].includes(sp.get('app') || '') ? sp.get('app') : 'signum') as StoreApp;
  const lang = (['en', 'ja', 'ko'].includes(sp.get('l') || '') ? sp.get('l') : 'en') as PreviewLang;

  const c = COPY[app][lang];
  const foot = FOOT[lang];
  const accent = ACCENT[app];
  const origin = request.nextUrl.origin;

  // 이 카드에 «실제로 그려질 글자»만 모아 폰트를 서브셋으로 받는다.
  const glyphs = `${c.title}${c.desc}${foot}${SITE_NAME[app]}`;
  const [fonts, icon] = await Promise.all([loadFonts(lang, glyphs), loadIcon(origin, ICON[app])]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', background: C.bg, padding: '64px 72px',
          fontFamily: 'Card', position: 'relative',
        }}
      >
        {/* 상단 강조선 — 앱마다 색이 다르다(카드 한 장만 봐도 어느 앱인지 알게) */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 6, background: accent, display: 'flex' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {icon ? (
            <img src={icon} width={76} height={76} style={{ borderRadius: 18 }} alt="" />
          ) : (
            <div style={{ width: 76, height: 76, borderRadius: 18, background: accent, display: 'flex' }} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: C.title }}>{SITE_NAME[app]}</div>
            <div style={{ fontSize: 17, color: accent, marginTop: 4 }}>signumhq.com</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 52, lineHeight: 1.22, fontWeight: 700, color: C.title, letterSpacing: '-0.5px' }}>
            {c.title}
          </div>
          <div style={{ fontSize: 24, lineHeight: 1.5, color: C.desc, marginTop: 22, maxWidth: 1000 }}>
            {c.desc}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderTop: `1px solid ${C.line}`, paddingTop: 22 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: accent, display: 'flex' }} />
          <div style={{ fontSize: 20, color: C.foot }}>{foot}</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 675,
      fonts,
      headers: {
        // 카드는 문구가 바뀌기 전엔 동일하다 → 스크래퍼가 자주 긁으므로 길게 캐시한다.
        // ⚠️ 이건 «이미지»다. 사람/봇으로 갈리는 응답이 아니므로 §50(Vary 누락) 문제와 무관하다.
        'cache-control': 'public, max-age=86400, s-maxage=604800, immutable',
      },
    },
  );
}

/**
 * Latin 은 Inter, 한국어·일본어는 Noto Sans 서브셋.
 * ★Satori 는 woff2 를 못 읽는다 → Google Fonts 에 «구형 UA»로 물어 TTF 를 받는다.
 *   `text=` 로 이 카드에 쓰일 글자만 요청하므로 9~15KB 수준이다(엣지에서 안전).
 */
type Font = { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' };

const INTER_400 = 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf';
const INTER_700 = 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf';

async function loadFonts(lang: PreviewLang, glyphs: string): Promise<Font[]> {
  const out: Font[] = [];
  try {
    const [r, b] = await Promise.all([
      fetch(INTER_400).then((x) => x.arrayBuffer()),
      fetch(INTER_700).then((x) => x.arrayBuffer()),
    ]);
    out.push({ name: 'Card', data: r, weight: 400, style: 'normal' });
    out.push({ name: 'Card', data: b, weight: 700, style: 'normal' });
  } catch { /* Inter 실패해도 CJK 만으로 그린다 */ }

  if (lang === 'ko' || lang === 'ja') {
    const family = lang === 'ko' ? 'Noto Sans KR' : 'Noto Sans JP';
    for (const w of [400, 700] as const) {
      try {
        const sub = await fetchSubsetTtf(family, w, glyphs);
        if (sub) out.push({ name: 'Card', data: sub, weight: w, style: 'normal' });
      } catch { /* 한 무게가 실패해도 나머지로 그린다 */ }
    }
  }
  return out;
}

async function fetchSubsetTtf(family: string, weight: 400 | 700, text: string): Promise<ArrayBuffer | null> {
  const url =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}` +
    `&text=${encodeURIComponent(text)}`;
  // 구형 UA 여야 woff2 대신 truetype 을 준다.
  const css = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 6.1)' } }).then((r) => r.text());
  const m = css.match(/src:\s*url\(([^)]+)\)\s*format\('truetype'\)/);
  if (!m) return null;
  return fetch(m[1]).then((r) => r.arrayBuffer());
}

async function loadIcon(origin: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}${path}`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:image/png;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}
