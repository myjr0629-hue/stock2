/* ============================================================================
 * threads-public-check — Threads 글 «비로그인» 공개 확인(브라우저 없음). 2026-10-04 신설.
 *
 * 왜: threads-post.mjs 의 «새 글 확인»은 로그인한 내 프로필 시야다 — 독자가 보는 페이지가 아니다
 *   (MISTAKES #33: 레딧과 같은 종류. 편집기·내 프로필에서 보이는 것은 증거가 아니다). 그래서 그동안 Threads 공개 확인은
 *   회차마다 손으로 curl 을 짜서 했다 → 도구로 고정한다(발행 즉시 «본문·이미지·a[href]» 검증 규칙).
 *
 * 사용(저장소 루트에서):
 *   node scripts/threads-public-check.mjs <글 URL> [기대 문자열…] [--from=<채널 태그>]
 *   예) node scripts/threads-public-check.mjs https://www.threads.com/@signumhq_official/post/XXXX 333.69 맥스페인 --from=threads
 *
 * 검사: ① 페이지 200 ② 본문(기대 문자열 전부) ③ og:image 200·image/* ④ 스마트링크 signumhq.com/app + from 태그
 *   · 비교 전에 «정규화»한다(\uXXXX·\/·HTML 엔티티(숫자 포함)·%XX·공백) — MISTAKES #29·#45
 *   · 종료코드 0 = 전부 통과 · 1 = 하나라도 실패 · 2 = 사용법
 *   · 막혔을 때(비로그인 시야에 본문이 안 실림 등)는 «공개 확인 실패»로 적는다 — «발행했다»고 쓰지 않는다
 * ========================================================================== */
// ★브라우저 UA 로는 «앱 셸»(title=Threads·og 없음·본문 없음)만 내려온다(10/3 14시 기록·10/4 08시 실측 — 첫 판은 이 UA 로
//   만들어 전부 FAIL 이 났다: 검사기가 틀렸지 글이 틀린 게 아니었다 · MISTAKES #45). 공개 검증은 «크롤러 UA»로 — og:description 에 본문 전체가 실린다.
const CRAWLER_UAS = ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Twitterbot/1.0'];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'; // og:image 받기용
const argv = process.argv.slice(2);
const url = argv.find((a) => /^https:\/\/www\.threads\.(com|net)\//.test(a));
const fromArg = (argv.find((a) => a.startsWith('--from=')) || '').slice(7);
const expects = argv.filter((a) => a !== url && !a.startsWith('--'));
if (!url) { console.log('사용: node scripts/threads-public-check.mjs <Threads 글 URL> [기대 문자열…] [--from=<태그>]'); process.exit(2); }

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
function normalize(raw) {
  let t = String(raw);
  t = t.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));   // JSON 유니코드 이스케이프
  t = t.replace(/\\\//g, '/').replace(/\\n/g, '\n').replace(/\\"/g, '"');
  t = t.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))   // 숫자 엔티티까지 푼다(MISTAKES #29)
       .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
       .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  t = safeDecode(t);                                                                        // l.threads.com/?u=<인코딩 링크> 풀기
  return t.replace(/\s+/g, ' ');
}

const rows = [];
const add = (name, ok, detail) => rows.push({ name, ok, detail });

let html = '';
let status = 0;
let usedUa = '';
for (const ua of CRAWLER_UAS) {                       // og:description 이 실린 응답이 나올 때까지 크롤러 UA 를 차례로
  try {
    const r = await fetch(url, { headers: { 'user-agent': ua, 'accept-language': 'ko,ja;q=0.8,en;q=0.5', accept: 'text/html,application/xhtml+xml' }, redirect: 'follow' });
    status = r.status;
    html = await r.text();
    usedUa = ua.split('/')[0];
    if (/property=["']og:description["']/i.test(html)) break;
  } catch (e) { add('페이지 200', false, String(e.message).slice(0, 80)); }
}
if (status) add('페이지 200', status === 200, `HTTP ${status} · ${html.length}자 · UA ${usedUa}`);

const norm = normalize(html);

// ② 본문 — 기대 문자열 전부(정규화 후 부분 일치)
for (const ex of expects) {
  const e = normalize(ex);
  add(`본문 «${ex.slice(0, 24)}»`, norm.includes(e), norm.includes(e) ? '있음' : '없음');
}

// ③ og:image — 속성 순서가 달라도 잡는다
const metaImg = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
if (!metaImg) add('og:image', false, '메타 없음');
else {
  const img = normalize(metaImg[1]).replace(/ /g, '');
  try {
    const r = await fetch(img, { headers: { 'user-agent': UA }, redirect: 'follow' });
    const ct = r.headers.get('content-type') || '';
    const len = (await r.arrayBuffer()).byteLength;
    add('og:image', r.status === 200 && /^image\//.test(ct), `HTTP ${r.status} ${ct} ${len}B`);
  } catch (e) { add('og:image', false, String(e.message).slice(0, 80)); }
}

// ④ 스마트링크 — 링크 자체와 from 태그(Threads 는 링크를 l.threads.com/?u=<인코딩> 으로 감싼다 → 정규화 후 찾는다)
const links = [...new Set((norm.match(/signumhq\.com\/app\?[^\s"'\\<>)]*/g) || []))];
add('스마트링크 signumhq.com/app', links.length > 0, links.length ? links[0].slice(0, 70) : '없음');
if (fromArg) {
  const hit = links.some((l) => new RegExp(`[?&]from=${fromArg}(&|$)`).test(l));
  add(`from=${fromArg} 태그`, hit, hit ? '있음' : `없음(찾은 링크: ${links.join(' ').slice(0, 80) || '없음'})`);
}

console.log(`\nThreads 공개 확인(비로그인) — ${url}`);
for (const r of rows) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  — ${r.detail}`);
const allOk = rows.length > 0 && rows.every((r) => r.ok);
console.log(allOk ? '\n결과: 전부 통과 — 공개 확인 완료' : '\n결과: 실패 있음 — «공개 확인 실패»로 기록한다(발행했다고 쓰지 않는다)');
process.exit(allOk ? 0 : 1);
