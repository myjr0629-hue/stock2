/**
 * 공유 카드(OG 이미지) 공용 글꼴·아이콘 — 2026-10-14 (브랜치 feat/viral-loop). 엣지·노드 둘 다 쓰는 순수 fetch 코드.
 *   Satori 는 woff2 를 못 읽는다 → Latin 은 Inter TTF, 한국어·일본어는 Google Fonts `text=` 서브셋 TTF(쓰는 글자만 — 9~15KB).
 *   못 받으면 호출자가 영어판으로 그린다(카드는 항상 나온다) — null 이면 CJK 글꼴이 없다는 뜻.
 * 출처 패턴: app/api/og/app/route.tsx · [locale]/today/opengraph-image.tsx (같은 글꼴 주소·같은 서브셋 방식).
 */
export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' };

const INTER_400 = 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf';
const INTER_700 = 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf';

let latin: ArrayBuffer[] | null = null;
async function latinPair(): Promise<ArrayBuffer[] | null> {
  if (latin) return latin;
  try {
    latin = await Promise.all([INTER_400, INTER_700].map((u) => fetch(u, { signal: AbortSignal.timeout(4000) }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })));
    return latin;
  } catch { return null; }
}

const cjkCache = new Map<string, ArrayBuffer>();
async function cjkSubset(lang: 'ko' | 'ja', weight: 400 | 700, text: string): Promise<ArrayBuffer | null> {
  const family = lang === 'ko' ? 'Noto Sans KR' : 'Noto Sans JP';
  const chars = Array.from(new Set(text.split(''))).sort().join('');
  const key = `${lang}:${weight}:${chars}`;
  const hit = cjkCache.get(key);
  if (hit) return hit;
  try {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(chars)}`;
    // 구형 UA 여야 woff2 대신 truetype 을 준다
    const css = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 6.1)' }, signal: AbortSignal.timeout(4000) }).then((r) => r.text());
    const m = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype)'\)/);
    if (!m) return null;
    const data = await fetch(m[1], { signal: AbortSignal.timeout(4000) }).then((r) => r.arrayBuffer());
    if (cjkCache.size > 24) cjkCache.clear();
    cjkCache.set(key, data);
    return data;
  } catch { return null; }
}

/**
 * 카드 글꼴 — family 이름은 호출자가 정한다(기본 'Card').
 * ko·ja 는 Noto 두 무게(400·700)를 «이 카드에 쓰일 글자만»으로 받는다. 하나라도 못 받으면 cjk=false(호출자가 영어판으로 다시 그린다).
 * 영어는 Inter 두 무게. Inter 가 안 와도 cjk 만으로 그릴 수 있고, 둘 다 없으면 fonts=[] (Satori 기본 글꼴).
 */
export async function loadCardFonts(lang: 'ko' | 'en' | 'ja', glyphs: string, family = 'Card'): Promise<{ fonts: OgFont[]; cjk: boolean }> {
  const fonts: OgFont[] = [];
  const lat = await latinPair();
  if (lat) {
    fonts.push({ name: family, data: lat[0], weight: 400, style: 'normal' });
    fonts.push({ name: family, data: lat[1], weight: 700, style: 'normal' });
  }
  if (lang === 'en') return { fonts, cjk: false };
  const [r, b] = await Promise.all([cjkSubset(lang, 400, glyphs), cjkSubset(lang, 700, glyphs)]);
  if (!r || !b) return { fonts: lat ? [{ name: family, data: lat[0], weight: 400, style: 'normal' }, { name: family, data: lat[1], weight: 700, style: 'normal' }] : [], cjk: false };
  fonts.push({ name: family, data: r, weight: 400, style: 'normal' });
  fonts.push({ name: family, data: b, weight: 700, style: 'normal' });
  return { fonts, cjk: true };
}

/** 앱 아이콘을 data: URL 로 — 이미지 요청 한 번(실패하면 null → 호출자가 색 칸으로 대신) */
export async function loadIconDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return `data:image/png;base64,${btoa(bin)}`;
  } catch { return null; }
}
