#!/usr/bin/env node
/**
 * 마케팅 엔진 — 채널 정본(.agent/marketing/channels.json)을 읽어 «지금 뭘 해야 하는지»를 낸다.
 *
 *   node scripts/marketing-engine.js            상태판
 *   node scripts/marketing-engine.js next       오늘 할 일
 *   node scripts/marketing-engine.js blockers   막힌 것만 (대표 개입 필요)
 *   node scripts/marketing-engine.js links      채널별 앱 스마트링크 (?from= 검증 포함)
 *
 * 왜 이 도구가 있나: 채널을 머리로 관리하면 반드시 빠뜨린다. 실측 근거는
 * 게시물 1,000편 이상에 팔로워 0~23 — «어디에 힘을 쓸지»를 눈으로 봐야 한다.
 */
const fs = require('fs');
const path = require('path');

const REG = path.join(__dirname, '..', '.agent', 'marketing', 'channels.json');
const d = JSON.parse(fs.readFileSync(REG, 'utf8'));

const C = { g:'\x1b[32m', y:'\x1b[33m', r:'\x1b[31m', b:'\x1b[34m', dim:'\x1b[2m', bold:'\x1b[1m', x:'\x1b[0m' };
const pad = (s, n) => { // 한글 폭 보정
  const w = [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x1100 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
};

// ?from= 태그 규칙: [a-z0-9_] 만. 하이픈이 들어가면 install referrer 가 통째로 죽는다.
const TAG_RE = /^[a-z0-9_]+$/;

function statusOf(c) {
  if (c.status === 'KILLED') return { s: '정지', col: C.dim };
  if (c.status === 'BANNED') return { s: '제재', col: C.r };
  if (c.login === 'blocked') return { s: '로그인막힘', col: C.r };
  if (c.profile === 'partial') return { s: '프로필미완', col: C.y };
  return { s: '가동', col: C.g };
}

function board() {
  console.log(`\n${C.bold}채널 상태판${C.x} ${C.dim}(${d._updated} 기준)${C.x}\n`);
  for (const tier of ['A', 'B', 'C', '-']) {
    const rows = d.channels.filter((c) => c.tier === tier);
    if (!rows.length) continue;
    console.log(`${C.bold}[${tier}] ${d._tiers[tier] || '중단'}${C.x}`);
    for (const c of rows) {
      const st = statusOf(c);
      const reach = c.followers != null ? `팔로워 ${c.followers}` : (c.karma != null ? `카르마 ${c.karma}` : '');
      const posts = c.posts != null ? `${c.posts}글` : '';
      console.log(`  ${st.col}${pad(st.s, 12)}${C.x}${pad(c.name, 22)}${C.dim}${pad(posts, 8)}${reach}${C.x}`);
      if (c.blocker) console.log(`  ${' '.repeat(12)}${C.r}└ ${c.blocker}${C.x}`);
    }
    console.log('');
  }
  const live = d.channels.filter((c) => statusOf(c).s === '가동').length;
  console.log(`${C.dim}가동 ${live} / 전체 ${d.channels.length} · 후보 ${d.candidates.length}${C.x}\n`);
}

function next() {
  console.log(`\n${C.bold}오늘 할 일${C.x}\n`);
  // A형이 먼저다 — 청중 없이도 효과가 난다.
  const order = { A: 0, B: 1, C: 2 };
  const todo = d.channels
    .filter((c) => c.action && c.action !== 'none')
    .sort((a, b) => (order[a.tier] ?? 9) - (order[b.tier] ?? 9));
  const verb = { post:'올린다', reply_only:'답글로 간다(원글 금지)', answer:'질문에 답한다', build:'쌓는다', submit:'제출한다' };
  for (const c of todo) console.log(`  ${C.dim}[${c.tier}]${C.x} ${pad(c.name, 22)}${verb[c.action] || c.action}`);
  console.log(`\n${C.bold}뚫을 후보${C.x}\n`);
  for (const c of d.candidates.filter((x) => x.status === 'todo')) {
    console.log(`  ${C.dim}[${c.tier}]${C.x} ${pad(c.name, 26)}${C.dim}${c.why}${C.x}`);
  }
  console.log('');
}

function blockers() {
  console.log(`\n${C.bold}막힌 것 — 대표 개입 필요${C.x}\n`);
  const rows = d.channels.filter((c) => c.blocker);
  if (!rows.length) return console.log(`  ${C.g}없음${C.x}\n`);
  rows.forEach((c, i) => console.log(`  ${i + 1}. ${C.bold}${c.name}${C.x} — ${c.blocker}`));
  console.log('');
}

function links() {
  console.log(`\n${C.bold}채널별 앱 스마트링크${C.x}\n`);
  let bad = 0;
  for (const c of d.channels.filter((x) => x.link)) {
    const tag = new URL(c.link).searchParams.get('from') || '';
    const ok = TAG_RE.test(tag);
    if (!ok) bad++;
    console.log(`  ${ok ? C.g + '✓' : C.r + '✗'}${C.x} ${pad(c.name, 20)}${C.dim}${c.link}${C.x}`);
  }
  console.log(bad ? `\n  ${C.r}태그 규칙 위반 ${bad}건 — [a-z0-9_] 만 허용(하이픈은 install referrer 를 죽인다)${C.x}\n`
                  : `\n  ${C.g}전부 규칙 통과${C.x}\n`);
}

({ next, blockers, links }[process.argv[2]] || board)();
