#!/usr/bin/env node
// ============================================================================
// tag-suggest — 태그를 «측정»에서 뽑는다. 손으로 고르지 않는다
// ----------------------------------------------------------------------------
// 왜 (2026-08-20 대표 지적: "우리 추측으로 하는것이 아닌")
//   나는 태그를 «감»으로 골라왔다. 실측한 적이 없다.
//
// 실측 결과 (레퍼런스 2,144편 · 채널내 z + 순열검정)
//   · 태그 «개수» ↔ 조회수  r = -0.01           → 개수는 무의미
//   · 태그 «선택» 으로 유의하게 나온 것들은 전부
//     **1~3개 채널만 쓰는 어휘**였다 (nifty news 1곳 · broker reviews 1곳 · stockxp 1곳).
//     6곳 이상이 공유하는 태그는 15개뿐이고 전부 일반어(business·news·finance…).
//     ⇒ **이식 가능한 «성과» 신호는 없다.**
//   · 1,500만 영상은 태그가 **0개**다.
//
// ⛔ 그렇다고 «우리 색»만 고집하지 않는다 (대표 지시 2026-08-20):
//   "조회수가 많이 나오고 사람들 관심이 많은 것을 레퍼런스 삼는다는 것은 검증이 어느정도 된 것이니
//    우리 색만 강요할 필요는 없다. 그것을 우리 색을 입혀서 만든다는 개념으로 접근해야지"
//   ⇒ 조회수 자체가 검증이다. 이식을 «통계로 증명»할 때까지 기다리지 않는다.
//
// 세 층에서 뽑는다. 지어낸 말은 넣지 않는다.
//   ① .agent/TAG_CANON.json — 조회 상위 절반이 «4개 채널 이상» 공유하는 공통 어휘 (검증된 계급의 말)
//   ② .agent/DEMAND.json    — 실제로 검색되는 문구 (수요 실측치 동반)     ← 우리 색
//   ③ 영상에 실제로 나오는 개체 — 티커·회사명. 사실이지 추측이 아니다      ← 우리 색
//
// 사용: node scripts/tag-suggest.mjs "<주제 문장>" [티커...]
//   예: node scripts/tag-suggest.mjs "max pain and open interest on AMD" AMD
// ============================================================================

import { readFileSync, existsSync } from 'node:fs';

const D = existsSync('.agent/DEMAND.json')
  ? JSON.parse(readFileSync('.agent/DEMAND.json', 'utf8')) : { terms: {}, homonyms: {} };
const C = existsSync('.agent/TAG_CANON.json')
  ? JSON.parse(readFileSync('.agent/TAG_CANON.json', 'utf8')) : { canon: [] };

const COUNT = 12;              // 레퍼런스 중앙 14개 · 게이트 8~15

/** 주제 문장과 «겹치는 말»이 있는 수요 문구만 남긴다 — 무관한 고수요어를 붙이지 않는다 */
function relevant(topic) {
  const words = new Set(String(topic).toLowerCase().replace(/[^a-z0-9$ ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
  return Object.entries(D.terms || {})
    .map(([term, vol]) => {
      const tw = term.toLowerCase().split(/\s+/);
      const hit = tw.filter((w) => words.has(w)).length;
      return { term, vol, hit, ratio: hit / tw.length, headHit: words.has(tw[0]) };
    })
    // ⛔ 절반만 겹치면 «vwap explained» 가 "explained" 하나로 딸려 들어온다 (실측).
    //    핵심어(첫 단어)가 주제에 있어야 «관련»으로 본다.
    .filter((x) => x.ratio >= 0.5 && x.headHit)
    .sort((a, b) => b.vol - a.vol);
}

export function suggestTags(topic, tickers = []) {
  const rel = relevant(topic);
  const out = [];
  const seen = new Set();
  const push = (t, why) => {
    const k = t.toLowerCase();
    if (seen.has(k) || out.length >= COUNT) return;
    seen.add(k); out.push({ tag: t, why });
  };

  // ② 우리 색 먼저 — 이 영상만의 수요 문구
  for (const r of rel) push(r.term, `수요 ${r.vol.toLocaleString()}`);

  // ③ 영상에 실제로 나오는 개체
  for (const t of tickers) {
    push(t.toUpperCase(), '영상에 나오는 티커');
    push(`${t.toUpperCase()} stock`, '티커 + stock');
  }

  // ① 검증된 계급의 공통 어휘로 «나머지를 채운다» — 조회수가 검증이다
  for (const c of (C.canon || [])) push(c.tag, `검증 계급 공통어 (채널 ${c.channels}곳)`);

  return { tags: out, relevant: rel };
}

if (String(process.argv[1] || '').endsWith('tag-suggest.mjs')) {
  const topic = process.argv[2];
  if (!topic) { console.error('사용: tag-suggest "<주제 문장>" [티커...]'); process.exit(1); }
  const { tags, relevant: rel } = suggestTags(topic, process.argv.slice(3));
  console.log(`\n  주제: ${topic}`);
  console.log(`  수요표에서 관련 문구 ${rel.length}개 발견\n`);
  console.log('  ' + '태그'.padEnd(30) + '근거');
  console.log('  ' + '-'.repeat(58));
  for (const t of tags) console.log('  ' + t.tag.padEnd(30) + t.why);
  const clash = Object.keys(D.homonyms || {}).filter((k) => tags.some((t) => t.tag.toLowerCase() === k));
  if (clash.length) {
    console.log('\n  ⚠ 동음이의 주의 — 태그로는 두되 «제목 앞»에는 쓰지 않는다');
    for (const c of clash) console.log(`    ${c}: ${D.homonyms[c]}`);
  }
  console.log(`\n  → ${tags.length}개 (게이트 기준 8~15)\n`);
  console.log('  ' + JSON.stringify(tags.map((t) => t.tag)));
}
