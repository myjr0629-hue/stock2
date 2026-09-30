#!/usr/bin/env node
/**
 * 검색 표면 감사 — «첫 방문자가 보는 것»을 잰다.
 *
 * 왜 (2026-09-28): 종목 페이지가 데이터 캐시의 «직전 방문 사본»을 첫 방문자(대개 크롤러)에게
 * 줬다 — /ja/flow/SSD 첫 요청 «09/18時点», 1분 뒤 «09/25時点». 두 번째 요청만 재면 정상으로
 * 보이므로 이 감사는 «각 URL 의 첫 요청»만 판정한다. 같은 날 /en·/ja/rankings/* 22장의 메타
 * 설명·OG·구조화 데이터·본문이 한국어였다 — 영어·일본어 페이지에 한글이 있으면 실패다.
 *
 * 검사
 *   ① 한글 누출: en·ja 의 제목·메타 설명·OG·트위터·JSON-LD·본문(<main>) — 하나라도 있으면 실패
 *   ② 종목 페이지 첫 요청의 설명 날짜(MM/DD) = 그 종목의 FINRA 저장 판본 날짜 — 다르면 실패
 *   ③ 종목 페이지 제목에 맥스페인 «숫자»가 있으면 본문 레벨 칸에 «기준일» 표시가 없어야 한다
 *      (낡은 사본의 레벨을 제목에 쓰지 않는다는 규칙의 확인)
 *   ④ 랭킹 페이지 첫 요청의 «갱신» 시각 나이(정보) — 공용 스냅샷의 나이
 *
 * 사용: node scripts/audit-seo-freshness.js [--deployment <프리뷰 URL>] [--sample 12]
 *   --deployment: 보호된 프리뷰는 `vercel curl` 이 우회 토큰을 헤더로 붙인다(Node fetch 는 로그인 302 를 잰다).
 *     vercel 에 연결된 폴더에서 돈다(저장소 루트). 작업트리에서 돌릴 땐 VERCEL_CWD=<연결된 폴더>.
 * ⚠️ 운영에 돌리면 «첫 요청»이 그 페이지의 데이터 캐시를 갱신시킨다(보통 방문과 같은 효과).
 *    같은 페이지를 바로 다시 재면 ②는 무의미하다 — 표본은 실행마다 바꾼다(--seed).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ARGS = process.argv.slice(2);
const arg = (k, d) => { const i = ARGS.indexOf(k); return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : d; };
const DEPLOYMENT = arg('--deployment', null);
const SAMPLE = Number(arg('--sample', 12));
const SEED = Number(arg('--seed', Math.floor(Date.now() / 3600e3)));
const BASE = 'https://www.signumhq.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const HANGUL = /[가-힣]/;

async function get(p) {
  if (!DEPLOYMENT) {
    const r = await fetch(BASE + p, { headers: { 'user-agent': UA } });
    return { status: r.status, body: await r.text() };
  }
  try {
    const out = execFileSync('vercel', ['curl', p, '--deployment', DEPLOYMENT, '--', '--silent', '--max-time', '90', '-A', UA, '-w', '\n%{http_code}'], {
      cwd: process.env.VERCEL_CWD || path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const i = out.lastIndexOf('\n');
    return { status: Number(out.slice(i + 1)) || 0, body: out.slice(0, i) };
  } catch (e) { return { status: 0, body: '' }; }
}

const pick = (h, re) => (h.match(re) || [])[1] || '';
function parts(h) {
  return {
    title: pick(h, /<title>([^<]*)<\/title>/),
    desc: pick(h, /<meta name="description" content="([^"]*)"/),
    og: pick(h, /<meta property="og:title" content="([^"]*)"/) + ' ' + pick(h, /<meta property="og:description" content="([^"]*)"/),
    tw: pick(h, /<meta name="twitter:description" content="([^"]*)"/),
    ld: [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join(' '),
    main: (h.match(/<main[\s\S]*?<\/main>/) || [''])[0].replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' '),
  };
}

// 결정적 표본 — 머리(유동성 상위)와 꼬리(드문 페이지)를 섞는다
function sampleTickers() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/lib/seo/flowTickers.ts'), 'utf8');
  const all = [...src.slice(src.indexOf('export const FLOW_TICKERS')).matchAll(/'([A-Z]{1,6})'/g)].map((m) => m[1]);
  let x = SEED % 2147483647 || 1;
  const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647;
  const head = all.slice(0, 200), tail = all.slice(200);
  const out = new Set();
  while (out.size < Math.ceil(SAMPLE / 3)) out.add(head[Math.floor(rnd() * head.length)]);
  while (out.size < SAMPLE) out.add(tail[Math.floor(rnd() * tail.length)]);
  return [...out];
}

(async () => {
  const fails = [];
  const note = (ok, line) => { console.log(`${ok ? '  ✓' : '  ✗'} ${line}`); if (!ok) fails.push(line); };

  // ── ① 한글 누출 (en·ja) ───────────────────────────────────────────────
  const reg = fs.readFileSync(path.join(__dirname, '..', 'src/lib/rankings/registry.ts'), 'utf8');
  const RANK_IDS = [...reg.matchAll(/\bid: '([a-z-]+)'/g)].map((m) => m[1]);
  const con = fs.readFileSync(path.join(__dirname, '..', 'src/lib/seo/concepts.ts'), 'utf8');
  const CONCEPTS = [...new Set([...con.matchAll(/slug: '([a-z-]+)'/g)].map((m) => m[1]))];
  const tickers = sampleTickers();
  console.log(`표본(seed ${SEED}): ${tickers.join(' ')}`);
  console.log('\n① en·ja 한글 누출');
  for (const l of ['en', 'ja']) {
    const pages = ['', '/tickers', '/learn', '/dark-pool', '/options-flow', '/rankings',
      ...RANK_IDS.map((id) => `/rankings/${id}`), ...CONCEPTS.map((c) => `/learn/${c}`), ...tickers.slice(0, 4).map((t) => `/flow/${t}`)];
    let bad = 0;
    for (const p of pages) {
      const r = await get(`/${l}${p}`);
      if (r.status !== 200) { note(false, `/${l}${p} 상태 ${r.status}`); bad++; continue; }
      const x = parts(r.body);
      const hit = Object.entries(x).filter(([, v]) => HANGUL.test(v)).map(([k]) => k);
      if (hit.length) { note(false, `/${l}${p} 한글: ${hit.join('+')} «${(x[hit[0]].match(/[가-힣][^<>]{0,40}/) || [''])[0].trim()}»`); bad++; }
    }
    if (!bad) note(true, `${l} ${pages.length}장 한글 0`);
  }

  // ── ②③ 종목 페이지 «첫 요청» ─────────────────────────────────────────
  console.log('\n②③ 종목 페이지 첫 요청 — 설명 날짜 = FINRA 저장 판본');
  const dpr = await get(`/api/flow/dark-pool?t=${tickers.join(',')}`);
  let rows = {};
  try { const j = JSON.parse(dpr.body); rows = j?.tickers || j?.data || (j?.ticker ? { [j.ticker]: j } : {}); } catch { }
  for (const t of tickers) {
    const want = rows[t]?.date ? rows[t].date.slice(5).replace('-', '/') : null;
    for (const l of ['en', 'ko', 'ja']) {
      const r = await get(`/${l}/flow/${t}`);
      if (r.status !== 200) { note(false, `/${l}/flow/${t} 상태 ${r.status}`); continue; }
      const x = parts(r.body);
      const got = (x.desc.match(/(\d{2}\/\d{2})/) || [])[1] || null;
      if (want) note(got === want, `/${l}/flow/${t} 설명 ${got ?? '(날짜 없음)'} · FINRA ${want}`);
      else console.log(`  · /${l}/flow/${t} FINRA 행 없음 — 설명 ${got ?? '(날짜 없음)'}`);
      const titleMp = /(?:Max Pain|맥스페인|マックスペイン)\s?\$[\d,]+/.test(x.title);
      const asOfShown = /as of \d{2}\/\d{2}|\d{2}\/\d{2} 기준|\d{2}\/\d{2}時点/.test(x.main);
      if (titleMp && asOfShown) note(false, `/${l}/flow/${t} 제목에 맥스페인 숫자가 있는데 본문 레벨은 «기준일» 표시(낡은 사본)`);
    }
  }

  // ── ④ 랭킹 «갱신» 나이 (정보) ────────────────────────────────────────
  console.log('\n④ 랭킹 첫 요청의 «갱신» 나이');
  for (const p of ['/en/rankings', '/ja/rankings/maxpain-gap', '/ko/rankings/stealth', '/en/rankings/insider-conviction']) {
    const r = await get(p);
    const u = (r.body.match(/(?:Updated|갱신|更新)(?:<!-- -->)?:\s*(?:<!-- -->)?\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/) || [])[1];
    const ageMin = u ? Math.round((Date.now() - Date.parse(u.replace(' ', 'T') + 'Z')) / 60000) : null;
    console.log(`  · ${p} 갱신 ${u || '(없음)'} UTC · ${ageMin != null ? `${ageMin}분 전` : '-'}`);
  }

  console.log(`\n${fails.length ? `✗ 실패 ${fails.length}건` : '✓ 전부 통과'}`);
  process.exit(fails.length ? 1 : 0);
})();
