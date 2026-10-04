#!/usr/bin/env node
/* ============================================================================
 * instagram-public-check — 인스타그램 게시물 «비로그인» 공개 확인(브라우저 없음·클릭 없음·읽기 전용).
 *
 * 왜(2026-10-04 19시 회차): 인스타 공개 확인을 «비로그인 Claude 브라우저 + 주소 쿼리(?v=pub1)»로 했다 — 도구 호출이 여러 번 들고, 매번 손으로 하는 절차였다.
 *   크롤러 UA(facebookexternalhit)로 같은 주소를 받으면 로그인 벽 아래에서도 og:description(캡션 전문)·og:image 가 그대로 내려온다(10/4 19:01 실측 — 200·701KB).
 *   브라우저 UA 로 받으면 로그인 벽 셸(캡션 없음)이라 무의미하다(channels.json instagram 노트: «curl 은 로그인 셸 627KB»는 «기본 UA»일 때의 얘기).
 *
 * 사용: node scripts/instagram-public-check.mjs <게시물 URL> [기대 문자열 …] [--allowlink]
 *   · og:description 에 «기대 문자열»이 전부 있어야 통과 · og:image 가 200 + image/* 여야 통과
 *   · 캡션 링크는 눌리지 않아 «프로필(bio)»로 안내하는 게 정본이라 본문에 http(s):// 가 «없는 것»이 기본 통과 조건(--allowlink 면 허용)
 *   · 종료 0 = 통과, 1 = 실패(원인 출력). 네트워크 오류·로그인 셸이 오면 «실패»로 읽는다(= «게시했다»고 적지 않는다)
 * 한계: og:description 은 길면 잘릴 수 있다 — 캡션 «끝»(해시태그)이 아니라 «앞·중간 숫자 문구»를 기대 문자열로 준다.
 * ========================================================================== */
const args = process.argv.slice(2);
const allowLink = args.includes('--allowlink');
const [url, ...expects] = args.filter((a) => !a.startsWith('--'));
if (!url || !/^https:\/\/www\.instagram\.com\/([\w.]+\/)?p\/[\w-]+\/?/.test(url)) {
  console.log('사용: node scripts/instagram-public-check.mjs https://www.instagram.com/<계정>/p/<코드>/ [기대 문자열 …] [--allowlink]');
  process.exit(2);
}
const UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const dec = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const meta = (html, p) => {
  const a = html.match(new RegExp(`<meta[^>]+property="${p}"[^>]+content="([^"]*)"`, 'i')) || html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${p}"`, 'i'));
  return a ? dec(a[1]) : null;
};
let ok = true;
const fail = (m) => { ok = false; console.log('  ✗', m); };
const pass = (m) => console.log('  ✓', m);
const bust = `${url}${url.includes('?') ? '&' : '?'}v=pub${Date.now()}`; // 첫 확인이 CDN 스냅샷일 수 있어 쿼리를 매번 바꾼다(IH 에서 2분 걸린 적 있음)
let html = '';
try {
  const r = await fetch(bust, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(40000) });
  html = await r.text();
  console.log(`GET ${url} → HTTP ${r.status} · ${html.length.toLocaleString()}자`);
  if (r.status !== 200) fail(`HTTP ${r.status}`); else pass('HTTP 200');
} catch (e) { fail('요청 실패: ' + String(e.message || e).slice(0, 80)); }
const desc = meta(html, 'og:description');
const img = meta(html, 'og:image');
if (!desc) fail('og:description 없음(로그인 셸이거나 글이 없다)');
else {
  const cap = desc.replace(/^[^"]*?"/, ''); // «0 likes, 0 comments - 계정 on 날짜: "캡션…»
  console.log('  캡션 앞부분:', cap.slice(0, 110).replace(/\n/g, ' / '));
  for (const e of expects) (desc.includes(e) ? pass(`기대 문자열 «${e}»`) : fail(`기대 문자열 없음 «${e}»`));
  if (!allowLink && /https?:\/\//.test(cap)) fail('캡션에 http(s):// 링크가 있다(링크는 bio 로 안내하는 게 정본 — 의도했으면 --allowlink)'); else pass(allowLink ? '링크 허용 모드' : '캡션에 http 링크 없음(의도)');
}
if (!img) fail('og:image 없음');
else {
  try {
    const r = await fetch(img, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    const buf = await r.arrayBuffer();
    (r.status === 200 && /^image\//.test(r.headers.get('content-type') || '')) ? pass(`og:image 200 ${r.headers.get('content-type')} ${buf.byteLength.toLocaleString()}B`) : fail(`og:image HTTP ${r.status} ${r.headers.get('content-type')}`);
  } catch (e) { fail('og:image 요청 실패: ' + String(e.message || e).slice(0, 80)); }
}
console.log(ok ? '✅ 공개 확인 통과(비로그인·크롤러 UA)' : '⛔ 공개 확인 실패 — «게시했다»고 적지 않는다');
process.exit(ok ? 0 : 1);
