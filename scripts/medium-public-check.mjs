#!/usr/bin/env node
// ============================================================================
// medium-public-check — Medium 글 «비로그인» 공개 확인(브라우저 없음·읽기 전용).
//
// 왜(2026-10-05 01시 회차): medium-post.mjs 안에 공개 검증이 들어 있지만 «발행이 끝난 글을 나중에 다시» 확인하는 도구가 없었다.
//   회차가 curl 로 확인하다 Cloudflare 403(«Attention Required»)을 받고 한 번 헛걸음했다 — 이 사이트는 curl 의 TLS 지문을 막고,
//   온전한 크롬 UA 를 단 Node fetch 만 200 이다(medium-post.mjs 머리말에 있던 요령 — MISTAKES #49 «로그에만 있는 검증 요령은 도구로»·#32 «403 은 검사기부터 의심»).
//
// 사용:  node scripts/medium-public-check.mjs <글 URL> [기대 문자열 …]
//   · 기대 문자열은 대소문자·따옴표·HTML 엔티티를 정규화해 «본문 텍스트»에서 찾는다(#45)
//   · 항상 점검: AI 지원 표시 문장 · 스마트링크 a[href] 가 …signumhq.com/app…?from=medium · 글 안 그림(<figure><img>) ≥ 1
//   · 종료 0 = 전부 통과 · 1 = 하나라도 실패 · 2 = 응답 200 아님 또는 «글 자체가 없음»(403 이면 검사기 문제 — 브라우저 UA·헤더를 다시 본다)
//   · 시험(10/5): 양성 = 10/5 XLF 글 + 기대 문자열 → 통과 · 음성 1 = 없는 문구 → 종료 1 · 음성 2 = 없는 글 주소(소프트 404: 200 + 일반 페이지) → 종료 2
// ============================================================================
const args = process.argv.slice(2);
const url = args.find((a) => /^https?:\/\//.test(a));
const expects = args.filter((a) => a !== url && !a.startsWith('--'));
if (!url || !/^https:\/\/medium\.com\//.test(url)) { console.log('사용: node scripts/medium-public-check.mjs https://medium.com/@계정/글-주소 [기대 문자열 …]'); process.exit(2); }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const ctl = new AbortController();
const to = setTimeout(() => ctl.abort(), 30000); // 전체 시간 상한(#49)
let res; let html = '';
try {
  res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: ctl.signal });
  html = await res.text();
} catch (e) { console.log('⛔ 요청 실패:', String((e && e.message) || e).slice(0, 120)); process.exit(2); } finally { clearTimeout(to); }

console.log(`응답 ${res.status} · ${html.length}자 · 최종 주소 ${res.url.split('?')[0]}`);
if (res.status !== 200) {
  console.log(res.status === 403 ? '⛔ 403 — 대개 «검사기» 문제다(curl·짧은 UA 는 Cloudflare 가 막는다). 이 도구는 크롬 UA 로 보낸다 — 그래도 403 이면 글이 아니라 요청 쪽을 먼저 의심한다.' : `⛔ 응답 ${res.status} — 글이 없거나 비공개다.`);
  process.exit(2);
}

// 소프트 404: 없는 글 주소도 «200 + 일반 페이지» 로 온다(10/5 실측 — 제목 «Medium»·본문 article/h1/og:title 없음) → 글이 있는지부터 판정한다
const ogTitle = ((html.match(/<meta[^>]+(?:property|name)="og:title"[^>]*content="([^"]*)"/) || html.match(/<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="og:title"/)) || [])[1];
const hasArticle = /<article/.test(html) && /<h1/.test(html) && !!ogTitle;
if (!hasArticle) { console.log('⛔ 응답은 200 인데 «글»이 없다(article·h1·og:title 없음 — 없는 주소의 일반 페이지). 주소를 다시 확인한다.'); process.exit(2); }
console.log('제목:', (ogTitle || '').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').slice(0, 110));
const dec = (s) => s.replace(/&#x27;|&#39;|&rsquo;|&lsquo;|’|‘/g, "'").replace(/&quot;|&ldquo;|&rdquo;|“|”/g, '"').replace(/&#x3D;/g, '=').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
const text = dec(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').toLowerCase();
const norm = (s) => dec(s).replace(/\s+/g, ' ').toLowerCase();
let fail = 0;
const row = (ok, label, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${label}${extra ? ' · ' + extra : ''}`); if (!ok) fail++; };

for (const e of expects) row(text.includes(norm(e)), '본문 문구', JSON.stringify(e.slice(0, 60)));
row(text.includes('ai assistance'), 'AI 지원 표시 문장');
const hrefs = [...html.matchAll(/<a[^>]+href="([^"]*)"/g)].map((m) => dec(m[1])).filter((h) => /signumhq\.com/.test(h));
const smart = hrefs.filter((h) => /signumhq\.com\/app(-uc|-wim)?\?[^"]*from=medium/.test(h));
row(smart.length > 0, '스마트링크 a[href] (from=medium)', smart[0] ? smart[0].split('&source=')[0] : '없음 — a[href]=' + JSON.stringify(hrefs.slice(0, 3)));
// ★10/5 시험에서 검사기가 틀렸다(#45): 공개 HTML 의 글 그림은 <figure><picture><source srcSet=«miro.medium.com/v2/…»> + src 없는 <img> 라 «img src» 로 찾으면 0개다 → figure 블록 안의 miro v2 주소로 센다
const figs = [...html.matchAll(/<figure[\s\S]*?<\/figure>/g)].filter((m) => /miro\.medium\.com\/v2\//.test(m[0])).length;
row(figs >= 1, '글 안 그림(<figure> 안 miro v2)', `${figs}개`);

console.log(fail ? `\n⛔ 실패 ${fail}건 — «공개 확인됐다»고 쓰지 않는다` : '\n✅ 공개 확인 통과(비로그인)');
process.exit(fail ? 1 : 0);
