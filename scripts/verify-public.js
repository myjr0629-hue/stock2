#!/usr/bin/env node
/* ============================================================================
 * verify-public — 발행한 글의 «비로그인 공개 페이지»를 새로 열어 본문·링크·이미지·금지어를 한 번에 본다 (2026-10-03 만듦)
 *
 * 왜: 발행 뒤 «공개 확인»을 채널마다 손으로(또는 발행기 안에서만) 했다. 10/3 에는 python urllib 가 Medium 에서 403 이었고
 *     Node fetch(+크롬 UA)는 200 이었다 — 클라이언트에 따라 «막힘»이 달라 검사기 때문에 «안 보인다»고 오판할 뻔했다(검사기부터 의심).
 *     이 도구는 Node fetch 로 열고, HTML 엔티티·\\u0026 이스케이프를 푼 뒤 비교한다(MISTAKES #8).
 *
 * 사용: node scripts/verify-public.js <공개 URL> '<JSON 배열: 본문에 있어야 할 문구>' '<링크 정규식>' ['<금지어 JSON 배열>']
 *   예) node scripts/verify-public.js https://medium.com/... '["Oct 2","233.92"]' 'from=medium'
 * 출력: 상태·문구별 결과·a[href] 스마트링크·og:image·본문 이미지 수·금지어 → 마지막 줄 PASS / FAIL (종료코드 0/1)
 * ========================================================================== */
const [url, mustJson, linkPat, banJson] = process.argv.slice(2);
if (!url || !mustJson || !linkPat) { console.log('사용: node scripts/verify-public.js <URL> \'["문구"]\' <링크정규식> [\'["금지어"]\']'); process.exit(2); }
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const unesc = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\\u0026/g, '&').replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
(async () => {
  let res, raw;
  try { res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9,ko;q=0.8,ja;q=0.7' }, redirect: 'follow' }); raw = await res.text(); }
  catch (e) { console.log('FETCH FAIL', String(e.message).slice(0, 100)); console.log('FAIL'); process.exit(1); }
  try { if (res.status === 403 && /(^|\.)indiehackers\.com$/.test(new URL(url).hostname)) console.log('⚠ Indie Hackers 글 페이지는 curl·Node fetch 모두 Cloudflare 403(10/4 실측) — 이 FAIL 은 «글이 없다»가 아니라 검증기 한계다. 비로그인 브라우저(Claude 브라우저 창)로 새로 열어 본문 문구와 a[href] 를 확인한다.'); } catch {}
  const t = unesc(raw);
  const plain = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const must = JSON.parse(mustJson); const ban = JSON.parse(banJson || '["リアルタイム","実時間","실시간","real-time","realtime","今日の相場","오늘 장"]');
  const out = { status: res.status, bytes: raw.length, finalUrl: res.url.slice(0, 120) };
  for (const m of must) out['문구:' + m.slice(0, 18)] = plain.includes(m) || t.includes(m);
  const hrefs = [...t.matchAll(/href=["']([^"']*signumhq\.com[^"']*)["']/g)].map((x) => x[1]);
  const links = [...t.matchAll(/https?:\/\/(?:www\.)?signumhq\.com\/app\?[^"'\s<>\\]+/g)].map((x) => x[0]);
  const re = new RegExp(linkPat);
  out['a[href]'] = [...new Set(hrefs)].slice(0, 3); out['본문 내 링크'] = [...new Set(links)].slice(0, 3);
  out['링크 일치'] = [...hrefs, ...links].some((x) => re.test(x));
  const og = (t.match(/property=["']og:image["'][^>]*content=["']([^"']+)/) || t.match(/content=["']([^"']+)["'][^>]*property=["']og:image/) || [])[1];
  out['og:image'] = og ? og.slice(0, 110) : null;
  const imgs = new Set([...t.matchAll(/https:\/\/[^"'\s<>\\]+\.(?:png|jpe?g|webp)(?:\?[^"'\s<>\\]*)?/gi)].map((x) => x[0]).filter((u) => !/avatar|logo|icon|favicon|emoji|profile/i.test(u)));
  out['이미지 수(로고 제외)'] = imgs.size;
  out['금지어'] = ban.filter((w) => plain.toLowerCase().includes(w.toLowerCase()));
  console.log(JSON.stringify(out, null, 1));
  const ok = res.status === 200 && must.every((m) => out['문구:' + m.slice(0, 18)]) && out['링크 일치'] && out['금지어'].length === 0 && (og || imgs.size > 0);
  console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
})();
