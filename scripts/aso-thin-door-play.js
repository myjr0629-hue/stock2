#!/usr/bin/env node
/**
 * aso-thin-door-play — Play 스토어 검색의 «얇은 문»을 브라우저 없이 잰다.
 *
 * 왜: 애플 쪽은 무인증 search API 가 있는데(scripts/aso-thin-door.js) Play 는 없다.
 *   그런데 Play 검색 «웹 페이지»는 curl 로 읽힌다(2026-09-20 실측: 1.2MB, 앱 30개).
 *   Play 는 우리가 약한 쪽(별점 0)이라 여기 측정이 더 급하다.
 *
 * 세는 값: 결과 카드의 «앱 이름»에 질의가 실제로 든 개수 = 진짜 경쟁자.
 *          + 우리 3앱이 결과 안에 있는지(있으면 몇 번째).
 * 사용: node scripts/aso-thin-door-play.js [kr|us|jp|all]
 *   all = 세 지역을 차례로 재고(약 1~2분) «우리 앱이 결과에 있는 질의 수»를 한 줄로 묶어
 *         ~/signum-ego-io/<KST 날짜>/play-thin-door.json 에 덮어쓴다(저장소 밖) — slot ⏱ 줄이 이 파일 시각을 읽는다(주 1회).
 *         한 지역만 돌리면 표만 찍고 저장하지 않는다(부분 기록으로 주간 기록을 덮지 않는다).
 *
 * ★2026-10-05 18시대 회차(개선):
 *   ① 대조군 — 브랜드 질의 «SIGNUM HQ» 에서 본앱이 상위 3 안에 보여야 그 지역 표를 믿는다(MISTAKES #75·#79).
 *      실패·차단이 한 지역이라도 있으면 주간 기록을 남기지 않는다(#101 — 부분 결과로 덮지 않는다).
 *   ② all·저장·slot ⏱ 줄 — 이 도구는 9/20 에 만들어졌지만 «언제 다시 하나»가 어디에도 없어 주간으로 돈 적이 없다(MISTAKES #92).
 *   읽는 법(10/5 실측): Play 등록정보 제목·설명에 질의어(다크풀·옵션 플로우·맥스페인·ダークプール 등)가 «이미» 들어 있는데
 *   우리 앱이 결과에 없으면 문은 «문구»가 아니라 «평점 수·설치 속도»다 — 그때는 등록정보 문구 수정을 제안하지 않는다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REGION = { kr: ['ko', 'KR'], us: ['en', 'US'], jp: ['ja', 'JP'] };
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const OURS = { 'com.signumhq.app': 'SIGNUM', 'com.signumhq.undercurrent': 'UC', 'com.signumhq.wim': 'WIM' };
const BRAND = 'SIGNUM HQ'; // 대조군 질의 — 본앱이 상위 3 안에 보여야 한다

const TERMS = {
  kr: ['미국주식', '미국주식 앱', '프리마켓', '미국주식 실적', '실적발표 일정', '미국증시',
       '다크풀', '맥스페인', '애프터마켓', '시간외 주가', '옵션 플로우', '서학개미',
       '나스닥', '해외주식', '증시 캘린더', '주식 퀴즈'],
  us: ['premarket', 'premarket movers', 'earnings calendar', 'options flow', 'dark pool',
       'max pain', 'after hours stock', 'short volume', 'stock quiz'],
  jp: ['米国株', 'プレマーケット', '決算カレンダー', 'オプション フロー', 'ダークプール', '時間外 株価'],
};
const norm = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));

// 결과 카드에서 (패키지, 이름) 쌍을 뽑는다. Play 는 링크 뒤쪽에 이름이 오는 구조라
// 링크 위치를 기준으로 «뒤 2,000자» 안의 첫 그럴듯한 텍스트를 이름으로 본다.
function cards(html) {
  const out = []; const seen = new Set();
  const re = /\/store\/apps\/details\?id=([A-Za-z0-9_.]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    if (seen.has(id)) continue;
    const win = html.slice(m.index, m.index + 2500);
    const t = [...win.matchAll(/>([^<>{}\n]{3,60})</g)].map((x) => x[1].trim())
      .find((x) => x && !/^https?:|^\/|google|Play$|^앱$|^게임$/i.test(x));
    if (!t) continue;
    seen.add(id); out.push({ id, name: t });
  }
  return out;
}

// 검색 한 번 — 본문이 너무 짧으면 차단 의심(blocked), 아니면 카드 목록(cs)
async function search(term, hl, gl) {
  const url = `https://play.google.com/store/search?q=${encodeURIComponent(term)}&c=apps&hl=${hl}&gl=${gl}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': `${hl}-${gl},${hl};q=0.9` } });
  const html = await r.text();
  return html.length < 200000 ? { blocked: html.length } : { cs: cards(html) };
}

// 우리 본앱의 Play 평점 수(공개 상세 페이지 JSON-LD ratingCount·ratingValue) — 노출의 «문»이 평점 수라는 10/5 진단의 추적값.
// 값이 없으면 평점 0 으로 본다(10/5 실측: US·JP 상세 페이지에는 평점 값 자체가 없고 KR 은 6개·5.0). 판독 실패는 null(0 이 아니다 — MISTAKES #18).
async function ourRating(hl, gl) {
  try {
    const r = await fetch(`https://play.google.com/store/apps/details?id=com.signumhq.app&hl=${hl}&gl=${gl}`,
      { headers: { 'User-Agent': UA, 'Accept-Language': `${hl}-${gl},${hl};q=0.9` } });
    const h = await r.text();
    if (h.length < 200000) return null; // 차단 의심
    const rc = h.match(/"ratingCount"\s*:\s*"?(\d+)/);
    const rv = h.match(/"ratingValue"\s*:\s*"?([\d.]+)/);
    return { count: rc ? Number(rc[1]) : 0, value: rv ? Number(rv[1]) : null };
  } catch { return null; }
}

async function scan(cc) {
  const [hl, gl] = REGION[cc];
  const terms = TERMS[cc];
  console.log(`Play 스토어 «얇은 문» 실측 — gl=${gl} hl=${hl} (검색 웹페이지 스크레이프)\n`);
  // 대조군(MISTAKES #75·#79): 브랜드 질의에서 «본앱(SIGNUM)»이 상위 3 안에 보여야 이 지역 표의 파서·응답을 믿는다
  let control = { rank: null, ok: false };
  try {
    const s = await search(BRAND, hl, gl);
    if (s.cs) {
      const i = s.cs.findIndex((c) => c.id === 'com.signumhq.app');
      control = { rank: i >= 0 ? i + 1 : null, ok: i >= 0 && i < 3 };
    }
  } catch { /* 대조 실패로 처리 */ }
  console.log(`[대조] «${BRAND}» → 본앱 ${control.rank ? '#' + control.rank : '없음'} · ${control.ok ? '통과' : '⚠ 실패 — 이 지역 표를 믿지 않는다'}`);
  await sleep(500);
  console.log('질의                  결과  이름일치  우리순위   1위 앱');
  const rows = [];
  let blocked = 0;
  for (const term of terms) {
    try {
      const s = await search(term, hl, gl);
      if (s.blocked !== undefined) { blocked++; console.log(`  ${term.padEnd(18)} (본문 ${s.blocked} — 차단 의심)`); continue; }
      const cs = s.cs;
      const full = norm(term);
      const exact = cs.filter((c) => norm(c.name).includes(full)).length;
      const mine = cs.map((c, i) => (OURS[c.id] ? `${OURS[c.id]}#${i + 1}` : null)).filter(Boolean).join(',') || '—';
      const mark = exact === 0 ? '★' : exact <= 3 ? '○' : exact <= 7 ? '△' : '✕';
      console.log(`${mark} ${term.padEnd(18)} ${String(cs.length).padStart(4)} ${String(exact).padStart(8)}  ${mine.padEnd(12)} ${(cs[0] ? cs[0].name : '').slice(0, 26)}`);
      rows.push({ term, n: cs.length, exact, mine });
    } catch (e) { blocked++; console.log(`  ${term.padEnd(18)} ERR ${String(e.message).slice(0, 40)}`); }
    await sleep(500);
  }
  const shown = rows.filter((r) => r.mine !== '—').length;
  const shownMain = rows.filter((r) => /SIGNUM#/.test(r.mine)).length;
  console.log(`\n· 우리 앱이 «결과에 아예 없는» 질의: ${rows.length - shown}/${rows.length}`);
  console.log('★=이름일치 0(완전 개방) ○≤3 △≤7 ✕>7');
  const rating = await ourRating(hl, gl);
  console.log(`· 우리 Play 평점(공개 상세 페이지): ${rating ? rating.count + '개' + (rating.value ? ' · ' + rating.value : '') : '판독 실패'} — 노출의 문은 문구가 아니라 평점 수·설치 속도(10/5 진단: 상위 앱 평점 16~292개)`);
  return { cc, hl, gl, control, blocked, total: terms.length, measured: rows.length, shown, shownMain, rating, rows };
}

(async () => {
  const arg = (process.argv[2] || 'kr').toLowerCase();
  if (arg !== 'all' && !REGION[arg]) { console.log('사용: node scripts/aso-thin-door-play.js [kr|us|jp|all]'); process.exit(1); }
  const res = [];
  for (const cc of (arg === 'all' ? ['kr', 'us', 'jp'] : [arg])) { res.push(await scan(cc)); console.log(''); }
  if (arg !== 'all') return;
  const line = res.map((r) => `${r.cc.toUpperCase()} ${r.shown}/${r.measured}`).join(' · ');
  console.log(`· 우리 앱(3종)이 결과에 있는 질의 수: ${line} · 본앱(SIGNUM) 기준 ${res.map((r) => `${r.cc.toUpperCase()} ${r.shownMain}`).join(' · ')}`
    + ` · Play 평점 수 ${res.map((r) => `${r.cc.toUpperCase()} ${r.rating ? r.rating.count : '?'}`).join(' · ')}`);
  const bad = res.filter((r) => !r.control.ok || r.blocked > 0);
  if (bad.length) {
    console.log(`⚠ 대조 실패·차단 의심(${bad.map((r) => r.cc).join(',')}) — 주간 기록(play-thin-door.json)은 덮어쓰지 않았다(slot 일정은 그대로)`);
    process.exitCode = 2;
    return;
  }
  const kstDay = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const dir = path.join(process.env.HOME || require('os').homedir(), 'signum-ego-io', kstDay);
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, 'play-thin-door.json');
  fs.writeFileSync(fp, JSON.stringify({ at: new Date().toISOString(), kst: kstDay, summary: line, regions: res }, null, 1));
  console.log(`· 결과 저장: ${fp} (slot ⏱ 줄이 이 파일 시각을 읽는다)`);
})();
