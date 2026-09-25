#!/usr/bin/env node
/**
 * mkt-clicks — 채널별 클릭을 «3일»과 «21일»로 같이 잰다. (ENGINE §23·§25)
 *
 * 왜 이 스크립트가 있나 (2026-09-17):
 *   클릭 표를 손으로 쓸 때마다 태그 목록을 «머리에서» 적었고, 그래서 `from=home` 을
 *   21일 내내 한 번도 세지 않았다. 나중에 재 보니 home 이 412클릭 — 전 채널 1위였다.
 *   프록시는 키 목록(KEYS/SCAN)을 주지 않는다. 그래서 태그의 유일한 정본은 «라이브 HTML» 이다.
 *   이 스크립트는 매번 실제 페이지에서 from= 을 긁어 와 channels.json 과 합집합을 만든다.
 *
 * 주의: 날짜는 «ET» 다. UTC 로 물으면 0 이 나온다.
 * 사용: node scripts/mkt-clicks.js [일수=21]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const BASE = 'http://52.23.98.13:8081'; // ← const 이름을 URL 로 쓰면 전역 URL 클래스를 가려 fetch 가 조용히 죽는다
const KEY = (fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  .match(/^EC2_REDIS_PROXY_KEY=(.+)$/m) || [])[1]?.trim();
const SITE = 'https://www.signumhq.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
const PAGES = ['/en', '/ko', '/ja', '/en/flow/NVDA', '/en/dark-pool'];

const etDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);

async function liveTags() {
  const found = new Set();
  await Promise.all(PAGES.map(async (p) => {
    try {
      const html = await fetch(SITE + p, { headers: { 'User-Agent': UA } }).then((r) => r.text());
      for (const m of html.matchAll(/from=([a-z0-9_]+)/g)) found.add(m[1]);
    } catch { /* 페이지 하나 실패가 전체를 죽이지 않게 */ }
  }));
  return found;
}

(async () => {
  const days = Number(process.argv[2] || 21);
  const ch = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/channels.json'), 'utf8'));
  // ★2026-09-26 수리 — 예전엔 채널 «id»만 조회했다. 그런데 bluesky_buildinpublic 의 게시 링크는 from=bluesky_bip 라
  //   이틀 22클릭(9/24 18·9/25 4, 레디스 실측)이 표에서 통째로 빠졌고, slot 은 그 채널을 «건당 0 ▼(줄임)»으로 띄웠다.
  //   mkt-clicks-platform.js 는 9/23 에 id·tag 합집합으로 고쳐졌는데 이 파일만 남아 있었다(같은 고장, 다른 파일).
  const CH = Array.isArray(ch) ? ch : ch.channels;
  const declared = [...new Set(CH.flatMap((c) => [c.id || c.key, c.tag]).filter((t) => /^[a-z0-9_]{1,24}$/.test(t || '')))];
  const live = await liveTags();
  const bios = ['reddit_bio', 'quora_bio', 'x_reply', 'github_profile', 'bluesky_bio', 'threads_bio'];
  const tags = [...new Set([...declared, ...live, ...bios])];
  const missing = [...live].filter((t) => !declared.includes(t));
  if (missing.length) console.log(`⚠ 라이브 페이지에만 있는 태그 ${missing.length}개(channels.json 미등록): ${missing.join(', ')}\n`);

  const dates = [...Array(days)].map((_, i) => etDay(new Date(Date.now() - i * 864e5)));
  // ★ 실패를 «0» 으로 삼키면 안 된다. 2026-09-17 실측: 1,071건을 동시에 던지자 프록시가
  //    일부를 거절해 home 이 412 → 140 으로 «조용히» 줄었다. 같은 키를 두 번 재서 다른 답이
  //    나오면 숫자가 아니라 측정기를 의심한다. 그래서 동시 12건으로 제한 + 3회 재시도 + 실패 집계.
  let failed = 0;
  const hit = async (t, d) => {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(`${BASE}/get?key=mkt:attr:hit:${t}:${d}`, { headers: { Authorization: 'Bearer ' + KEY } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        return Number(j?.value ?? j?.result ?? 0) || 0;
      } catch { await new Promise((z) => setTimeout(z, 250 * (i + 1))); }
    }
    failed++; return null; // null 은 «못 쟀다» 다. 0 과 구분한다.
  };
  const jobs = [];
  for (const t of tags) for (const d of dates) jobs.push([t, d]);
  const got = new Map();
  const LIMIT = 12;
  let idx = 0;
  await Promise.all([...Array(LIMIT)].map(async () => {
    while (idx < jobs.length) {
      const [t, d] = jobs[idx++];
      got.set(t + '|' + d, await hit(t, d));
    }
  }));
  if (failed) console.log(`⛔ ${failed}건을 못 쟀다 — 아래 숫자는 «하한»이다. 다시 돌릴 것.\n`);
  const rows = tags.map((t) => {
    const v = dates.map((d) => got.get(t + '|' + d) ?? 0);
    return { t, d3: v.slice(0, 3).reduce((a, b) => a + b, 0), all: v.reduce((a, b) => a + b, 0), head: v.slice(0, 3) };
  });

  // ★2026-09-20 — 내가 점검하며 만든 클릭을 빼고 «실사용자 추정»을 같이 찍는다.
  //   실제로 2026-09-19(ET) 에 스마트링크 점검으로 bluesky+6·okky+10·note+7 를 내가 만들었고,
  //   그걸 모르면 「블루스카이가 또 올랐다」로 오독한다. 추측으로 빼지 않는다 — 보낸 요청 수만 적는다.
  let CONTAM = {};
  try {
    const cf = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/clicks-contamination.json'), 'utf8'));
    for (const e of cf.entries || []) {
      if (!dates.includes(e.et)) continue;
      const recent = dates.slice(0, 3).includes(e.et);
      for (const [t, n] of Object.entries(e.hits || {})) {
        CONTAM[t] = CONTAM[t] || { d3: 0, all: 0 };
        if (recent) CONTAM[t].d3 += n;
        CONTAM[t].all += n;
      }
    }
  } catch { /* 파일 없으면 그냥 원값 */ }

  const live2 = rows.filter((r) => r.all).sort((a, b) => b.d3 - a.d3 || b.all - a.all);
  const anyC = Object.keys(CONTAM).length > 0;
  console.log(`채널             3일   오늘/어제/그제      ${days}일` + (anyC ? '   내점검   실3일' : ''));
  for (const r of live2) {
    const cm = CONTAM[r.t];
    const tail = anyC ? (cm ? String(-cm.d3).padStart(7) + String(Math.max(0, r.d3 - cm.d3)).padStart(7)
                            : ''.padStart(7) + String(r.d3).padStart(7)) : '';
    console.log(`${r.t.padEnd(16)}${String(r.d3).padStart(4)}   ${r.head.join('/').padEnd(14)}${String(r.all).padStart(5)}${tail}`);
  }
  if (anyC) console.log('\n⚠ «내점검» 은 내가 점검하며 만든 클릭이다(.agent/marketing/clicks-contamination.json). «실3일» 로 판단한다.');
  const s3 = live2.reduce((a, b) => a + b.d3, 0);
  const sa = live2.reduce((a, b) => a + b.all, 0);
  console.log(`${'합계'.padEnd(15)}${String(s3).padStart(4)}                 ${String(sa).padStart(5)}`);
  console.log(`\n· 0클릭 채널 ${rows.length - live2.length}개는 생략했다. 태그 ${tags.length}개 전수 조회.`);

  // ★2026-09-21 «건당 클릭» — 총클릭만 보면 «많이 한 채널»이 위로 올라온다(레딧이 그랬다: 15건 발행).
  //   발행 건수로 나눠야 효율이 보인다. 이 값을 캐시에 실어 slot 이 «줄일 것»을 같이 보여 준다(ENGINE §57).
  //   · 상시 표면(자사 웹·SEO·피드류)은 «발행 1건»이 아니므로 제외한다.
  //   · 본문 링크가 금지된 채널(레딧·쿼라)은 프로필 경유 태그를 «합산»해야 공정하다.
  const STANDING = new Set(['home','seo','seo_darkpool','seo_uc','seo_sg','seo_wim','llms_txt',
    'indexnow','rss_feed','github_pages','hf_datasets','aso','google_dataset_search']);
  const PAIR = { reddit: ['reddit','reddit_bio'], quora: ['quora','quora_bio'] };
  const LEDGER_ALIAS = { note_jp:'note', x_post:'x_us', x:'x_us', quora_en:'quora' };
  let perPost = {};
  try {
    const led = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/PUBLISH-LEDGER.json'), 'utf8')).entries || [];
    const cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const nPosts = {};
    for (const r of led) {
      const d = r.kst || r.utc || String(r.at || '').slice(0, 10);
      if (d < cut) continue;
      const ch = LEDGER_ALIAS[r.ch] || r.ch;
      nPosts[ch] = (nPosts[ch] || 0) + 1;
    }
    const netAll = (t) => Math.max(0, (rows.find((x) => x.t === t) || {}).all || 0) - ((CONTAM[t] || {}).all || 0);
    // ★2026-09-26 — 게시 링크 태그가 채널 id 와 다른 채널(bluesky_buildinpublic → bluesky_bip)은 그 태그로 센다.
    //   단 다른 채널의 id 이거나(bluesky_reply → bluesky: 본글 클릭을 가로챈다) 프로필 태그(*_bio)면 쓰지 않는다.
    const ids = new Set(CH.map((c) => c.id));
    const tagsOf = (ch) => {
      if (PAIR[ch]) return PAIR[ch];
      const own = (CH.find((c) => c.id === ch) || {}).tag;
      return own && own !== ch && !ids.has(own) && !/_bio$/.test(own) ? [ch, own] : [ch];
    };
    for (const [ch, n] of Object.entries(nPosts)) {
      if (STANDING.has(ch) || n < 2) continue;          // 표본 1건은 순위로 쓰지 않는다
      const clicks = tagsOf(ch).reduce((a, t) => a + Math.max(0, netAll(t)), 0);
      // ★2026-09-21(2차) «신선도» — 21일 건당만 보면 «죽은 채널»과 «가속 중»이 구분되지 않는다.
      //   실제로 x_us 는 건당 13.67 로 1위인데 최근 3일 클릭이 0 이었고(죽음),
      //   indiehackers 는 건당 3.67 로 9위인데 21일치의 82%가 최근 3일에 났다(가속).
      //   «어디로 옮길지»는 건당 × 신선도 둘 다 봐야 한다.
      const net3 = (t) => Math.max(0, ((rows.find((x) => x.t === t) || {}).d3 || 0) - ((CONTAM[t] || {}).d3 || 0));
      const c3 = tagsOf(ch).reduce((a, t) => a + net3(t), 0);
      perPost[ch] = { n, clicks, per: +(clicks / n).toFixed(2),
                      d3: c3, fresh: clicks ? Math.round((c3 / clicks) * 100) : 0 };
    }
    const ranked = Object.entries(perPost).sort((a, b) => b[1].per - a[1].per);
    if (ranked.length) {
      console.log('\n── 건당 클릭 (' + days + '일 · 발행 2건 이상 · 상시표면 제외 · 레딧/쿼라는 프로필 경유 합산) ──');
      console.log('채널             발행   클릭    건당   3일   신선도');
      for (const [ch, v] of ranked)
        console.log(ch.padEnd(16) + String(v.n).padStart(4) + String(v.clicks).padStart(7) + String(v.per).padStart(8)
                    + String(v.d3).padStart(6) + (String(v.fresh) + '%').padStart(8) + (v.fresh === 0 ? '  ← 최근 3일 0' : ''));
      const lose = ranked.filter(([, v]) => v.per < 1).map(([ch]) => ch);
      if (lose.length) console.log('⚠ 건당 1 미만 — 신규 투입을 줄일 후보: ' + lose.join(', '));
      const dead = ranked.filter(([, v]) => v.per >= 4 && v.d3 === 0).map(([ch, v]) => ch + '(건당 ' + v.per + ')');
      if (dead.length) console.log('⚠ 건당은 높은데 «최근 3일 0» — 과거 실적이다, 여기로 옮기지 말 것: ' + dead.join(', '));
      const rising = ranked.filter(([, v]) => v.fresh >= 50 && v.d3 >= 3).map(([ch, v]) => ch + '(3일 ' + v.d3 + '·' + v.fresh + '%)');
      if (rising.length) console.log('▲ 가속 중(순위가 낮아도 여기에 더 쓴다): ' + rising.join(', '));
    }
  } catch (e) { console.log('· 건당 클릭 계산 실패: ' + String(e.message).slice(0, 60)); }

  // ★2026-09-20 — 이 표를 «큐»가 쓰게 한다.
  //   mkt-plan.js slot 은 «오래 방치된 순»으로만 골라서, 매일 클릭을 내는 채널(bluesky)이
  //   4사이클 내리 «대상 아님»에 있었다. 이긴 것을 키우라는 규칙과 정면으로 어긋난다.
  //   그래서 여기서 캐시를 남기고 slot 이 «키우기» 레인으로 먼저 보여 준다.
  try {
    const cache = { at: new Date().toISOString(), days, failed,
      // d3 는 «내 점검분을 뺀» 값이다 — 큐가 이걸로 키울 채널을 고른다.
      d3: Object.fromEntries(live2.map((r) => [r.t, Math.max(0, r.d3 - ((CONTAM[r.t] || {}).d3 || 0))])),
      d3raw: Object.fromEntries(live2.map((r) => [r.t, r.d3])),
      contam: Object.fromEntries(Object.entries(CONTAM).map(([t, v]) => [t, v.d3])),
      all: Object.fromEntries(live2.map((r) => [r.t, Math.max(0, r.all - ((CONTAM[r.t] || {}).all || 0))])),
      perPost };
    fs.writeFileSync(path.join(ROOT, '.agent/marketing/clicks-cache.json'), JSON.stringify(cache, null, 1) + '\n');
    console.log('· 캐시 기록: .agent/marketing/clicks-cache.json (slot 의 «키우기» 레인이 읽는다)');
  } catch (e) { console.log('· 캐시 기록 실패: ' + String(e.message).slice(0, 60)); }
})();
