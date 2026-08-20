#!/usr/bin/env node
// ============================================================================
// bank-live — 소재 은행의 조건 중 «지금 발동 중»인 것을 찾는다
// ----------------------------------------------------------------------------
// 재고형 영상은 언제 올려도 되지만, «지금 벌어지고 있는» 조건이면 훅이 훨씬 세다.
//   "Apple just did this. The last 64 times, here is what followed."
// 은행(.agent/TOPIC_BANK.json)의 조건을 최신 시세에 대고 켜져 있는지 본다.
//
// 사용:  node scripts/bank-live.mjs
// ============================================================================

import { readFileSync, existsSync } from 'node:fs';

function polygonKey() {
  if (process.env.POLYGON_API_KEY) return process.env.POLYGON_API_KEY;
  if (existsSync('.env.local')) {
    const m = readFileSync('.env.local', 'utf8').match(/^POLYGON_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  }
  const legacy = '.claude/skills/signum-shorts/scripts/baserate.js';
  const m = readFileSync(legacy, 'utf8').match(/const KEY = '([^']+)'/);
  return m[1];
}
const KEY = polygonKey();
const bank = JSON.parse(readFileSync('.agent/TOPIC_BANK.json', 'utf8'));

const TO = new Date().toISOString().slice(0, 10);
const cache = new Map();
async function load(t) {
  if (cache.has(t)) return cache.get(t);
  const u = `https://api.polygon.io/v2/aggs/ticker/${t}/range/1/day/2025-01-01/${TO}?adjusted=true&limit=5000&apiKey=${KEY}`;
  const j = await (await fetch(u)).json();
  const rows = (j.results || []).map((b) => ({ d: new Date(b.t).toISOString().slice(0, 10), c: b.c }));
  cache.set(t, rows);
  return rows;
}
const pct = (a, b) => ((b / a) - 1) * 100;

// topic-bank.mjs 의 조건 정의와 «같은 규칙»을 현재 상태에 적용한다
function evaluate(id, rows, peerRows) {
  const i = rows.length - 1;
  if (i < 260) return null;
  const s = {
    r: pct(rows[i - 1].c, rows[i].c),
    r5: pct(rows[i - 5].c, rows[i].c),
    r25: pct(rows[i - 25].c, rows[i].c),
    c: rows[i].c,
    hi252: Math.max(...rows.slice(i - 251, i + 1).map((b) => b.c)),
    lo252: Math.min(...rows.slice(i - 251, i + 1).map((b) => b.c)),
    up3: rows[i].c > rows[i - 1].c && rows[i - 1].c > rows[i - 2].c && rows[i - 2].c > rows[i - 3].c,
    dn3: rows[i].c < rows[i - 1].c && rows[i - 1].c < rows[i - 2].c && rows[i - 2].c < rows[i - 3].c,
  };
  if (peerRows) {
    const pby = Object.fromEntries(peerRows.map((x) => [x.d, x.c]));
    const p0 = pby[rows[i - 1].d], p1 = pby[rows[i].d], p25 = pby[rows[i - 25].d];
    if (p0 == null || p1 == null || p25 == null) return null;
    s.pr = pct(p0, p1);
    s.pr25 = pct(p25, p1);
  }
  const suffix = id.replace(/^[A-Z0-9]+-/, '');
  const G = {
    'drop3': () => s.r <= -3, 'pop3': () => s.r >= 3,
    'drop15': () => s.r <= -1.5, 'pop15': () => s.r >= 1.5,
    'hi52': () => s.c >= s.hi252, 'lo52': () => s.c <= s.lo252,
    'up3d': () => s.up3, 'dn3d': () => s.dn3,
    'run5': () => s.r5 >= 5, 'fall5': () => s.r5 <= -5,
    'run25': () => s.r25 >= 12, 'fall25': () => s.r25 <= -12,
  };
  if (G[suffix]) return { on: G[suffix](), state: s };
  if (/-lead-.*-d2$/.test(id)) return { on: s.r - s.pr >= 2, state: s };
  if (/-lead-.*-m8$/.test(id)) return { on: s.r25 - s.pr25 >= 8, state: s };
  if (/-lag-.*-m8$/.test(id)) return { on: s.r25 - s.pr25 <= -8, state: s };
  return null;
}

(async () => {
  console.log(`은행 조건 ${bank.banked.length}건을 «오늘» 상태에 대고 확인\n`);
  const live = [], off = [];
  for (const r of bank.banked) {
    const rows = await load(r.subject);
    const peer = r.peer ? await load(r.peer) : null;
    const e = evaluate(r.id, rows, peer);
    if (!e) { continue; }
    const last = rows[rows.length - 1];
    const item = { ...r, last: last.d, price: last.c, state: e.state };
    (e.on ? live : off).push(item);
  }

  if (!live.length) {
    console.log('지금 켜진 조건 없음 — 재고형은 언제 올려도 되므로 그대로 진행한다.');
  } else {
    console.log(`★ 지금 발동 중 ${live.length}건\n`);
    for (const r of live) {
      const io = r.inSample, oo = r.outOfSample;
      const n = io.n + oo.n;
      const hit = ((io.hit * io.n + oo.hit * oo.n) / n);
      const ctl = ((io.ctl * io.n + oo.ctl * oo.n) / n);
      console.log(`  ${r.label}  (${r.forwardDays}일)`);
      console.log(`     최신 ${r.last} $${r.price.toFixed(2)}  |  표본 ${n}건  상승 ${hit.toFixed(0)}%  대조군 ${ctl.toFixed(0)}%  격차 ${(hit - ctl >= 0 ? '+' : '')}${(hit - ctl).toFixed(0)}%p`);
      console.log(`     전반 ${io.edge.toFixed(0)}%p / 후반 ${oo.edge.toFixed(0)}%p  → ${oo.edge > 0 ? '이후 강함' : '이후 약함'}\n`);
    }
  }
  console.log(`(꺼진 조건 ${off.length}건)`);
})();
