#!/usr/bin/env node
// ============================================================================
// seo-audit — 페이지 «유형별»로 색인 결함을 잡아낸다
// ----------------------------------------------------------------------------
// 왜: 2026-08-22 에 <html lang> 하드코딩 + 로케일 공통 제목 하나로
//     /ko/flow 150건이 통째로 색인에서 빠져 있었다. canonical 은 멀쩡했는데도.
//     같은 «세 로케일이 서로 구별되지 않는» 결함이 다른 유형에도 있는지
//     사람 눈이 아니라 규칙으로 훑는다.
//
// 판정 규칙
//   ① lang 이 경로 로케일과 다르면          → LANG
//   ② 세 로케일의 title 이 완전히 같으면      → DUP-TITLE (중복 색인 위험)
//   ③ canonical 없음                        → NO-CANON
//   ④ description 없음/너무 짧음             → NO-DESC
//   ⑤ og:image 없음                         → NO-OG
//   ⑥ hreflang 3종 + x-default 없음          → NO-HREFLANG
// ============================================================================
const BASE = 'https://www.signumhq.com';
const LOCALES = ['en', 'ko', 'ja'];
const PATHS = [
  '', '/undercurrent', '/wim', '/how-it-works', '/pricing', '/tickers', '/learn',
  '/learn/dark-pool', '/learn/max-pain', '/flow/NVDA', '/flow/USO', '/radar',
];

const get = async (u) => {
  const r = await fetch(u, { redirect: 'follow' });
  return { status: r.status, html: await r.text() };
};
const pick = (h, re) => (h.match(re) || [])[1] || null;

(async () => {
  let problems = 0;
  for (const p of PATHS) {
    const rows = [];
    for (const loc of LOCALES) {
      const url = `${BASE}/${loc}${p}`;
      let d;
      try { d = await get(url); } catch (e) { console.log(`✗ ${url} — ${e.message}`); problems++; continue; }
      rows.push({
        loc, url, status: d.status,
        lang: pick(d.html, /<html lang="([a-z-]+)"/),
        title: pick(d.html, /<title>([^<]*)<\/title>/),
        canon: pick(d.html, /rel="canonical" href="([^"]+)"/),
        desc: pick(d.html, /<meta name="description" content="([^"]*)"/),
        og: pick(d.html, /property="og:image"[^>]*content="([^"]+)"/) || pick(d.html, /content="([^"]+)"[^>]*property="og:image"/),
        xdef: /hrefLang="x-default"|hreflang="x-default"/i.test(d.html),
      });
    }
    const flags = [];
    for (const r of rows) {
      if (r.status !== 200) flags.push(`HTTP${r.status}:${r.loc}`);
      if (r.lang !== r.loc) flags.push(`LANG:${r.loc}=${r.lang}`);
      if (!r.canon) flags.push(`NO-CANON:${r.loc}`);
      if (!r.desc || r.desc.length < 40) flags.push(`NO-DESC:${r.loc}`);
      if (!r.og) flags.push(`NO-OG:${r.loc}`);
      if (!r.xdef) flags.push(`NO-HREFLANG:${r.loc}`);
    }
    const titles = rows.map((r) => r.title);
    if (titles.length === 3 && new Set(titles).size === 1) flags.push('DUP-TITLE(3로케일 동일)');

    const mark = flags.length ? '✗' : '✓';
    console.log(`${mark} ${p || '/(home)'}  ${flags.join(' · ') || 'ok'}`);
    problems += flags.length;
  }
  console.log(`\n결함 ${problems}건`);
  process.exit(problems ? 1 : 0);
})();
