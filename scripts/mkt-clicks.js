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
  const declared = (Array.isArray(ch) ? ch : ch.channels).map((c) => c.id || c.key).filter(Boolean);
  const live = await liveTags();
  const bios = ['reddit_bio', 'quora_bio', 'x_reply', 'github_profile'];
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

  const live2 = rows.filter((r) => r.all).sort((a, b) => b.d3 - a.d3 || b.all - a.all);
  console.log(`채널             3일   오늘/어제/그제      ${days}일`);
  for (const r of live2) {
    console.log(`${r.t.padEnd(16)}${String(r.d3).padStart(4)}   ${r.head.join('/').padEnd(14)}${String(r.all).padStart(5)}`);
  }
  const s3 = live2.reduce((a, b) => a + b.d3, 0);
  const sa = live2.reduce((a, b) => a + b.all, 0);
  console.log(`${'합계'.padEnd(15)}${String(s3).padStart(4)}                 ${String(sa).padStart(5)}`);
  console.log(`\n· 0클릭 채널 ${rows.length - live2.length}개는 생략했다. 태그 ${tags.length}개 전수 조회.`);
})();
