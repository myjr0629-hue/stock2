#!/usr/bin/env node
/* ============================================================================
 * x-public-check — X 글을 «로그인 없이» 확인한다(oEmbed + syndication). 사용: node scripts/x-public-check.mjs <status URL> [본문에 있어야 할 글자…]
 *
 * 왜 (2026-10-04): x-post.mjs 의 «공개 검증»은 로그인된 ego 프로필 화면이다 — 내 시야에서 보이는 건 독자가 보는 게 아니다
 *   (memory visible-where-matters). X 글은 JS 없이는 로그인 벽이라 curl 이 막혀 검증이 «보인다»로 끝나기 쉬웠다.
 *   공개 oEmbed(본문·작성자)와 syndication JSON(펼친 링크 expanded_url·사진 크기·작성 시각)은 로그인 없이 200 이다.
 * 출력: 작성자·시각·본문 첫 줄·링크(a[href] 에 해당하는 expanded_url)·사진 수/크기 · 기대 글자 누락은 종료코드 1.
 * ========================================================================== */
const url = process.argv[2] || '';
const want = process.argv.slice(3);
const m = url.match(/^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status\/(\d+)/);
if (!m) { console.error('사용: node scripts/x-public-check.mjs https://x.com/<계정>/status/<id> [기대 글자…]'); process.exit(2); }
const [, handle, id] = m;
const H = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
let bad = 0;
const oe = await fetch('https://publish.twitter.com/oembed?omit_script=1&url=' + encodeURIComponent(url), { headers: H });
console.log('oEmbed', oe.status);
if (oe.status !== 200) bad++;
const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, ''); // react-tweet 과 같은 식
const sy = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}&lang=en`, { headers: H });
console.log('syndication', sy.status);
if (sy.status !== 200) { console.log('⛔ 공개 경로에서 못 읽었다 — «발행했다»고 적지 않는다'); process.exit(1); }
const j = await sy.json();
const text = String(j.text || '');
console.log('작성자', j.user && j.user.screen_name, '· 시각', j.created_at, '· 본문 첫 줄:', text.split('\n')[0].slice(0, 90));
console.log('링크(expanded):', (j.entities && j.entities.urls || []).map((u) => u.expanded_url).join(' | ') || '(없음)');
console.log('사진:', (j.photos || []).map((p) => `${p.width}x${p.height}`).join(', ') || '(없음)');
if (!j.user || j.user.screen_name.toLowerCase() !== handle.toLowerCase()) { console.log('⛔ 작성자가 URL 의 계정과 다르다'); bad++; }
const hay = text + ' ' + (j.entities && j.entities.urls || []).map((u) => u.expanded_url).join(' ');
for (const w of want) { const ok = hay.includes(w); console.log((ok ? '✓' : '✗') + ' ' + w); if (!ok) bad++; }
console.log(bad ? '⛔ 공개 확인 실패 ' + bad + '건' : '✅ 비로그인 공개 확인 통과');
process.exit(bad ? 1 : 0);
