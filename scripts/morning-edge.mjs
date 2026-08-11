#!/usr/bin/env node
// ============================================================================
// morning-edge — «오늘 무슨 일이 있었나»가 아니라 «무엇에 우위가 있나»부터 본다
// ----------------------------------------------------------------------------
// 왜 이 스크립트가 있나 (2026-08-12):
//   맥 브리핑 포맷(T2·T4·T2B)은 구조·컴플라이언스가 훌륭한데 «인사이트 자리»가 비어 있다.
//   「SIGNUM READ」 비트가 앞에서 보여준 사실을 말로 바꿔 반복할 뿐 계산이 없다.
//   실제로 T2B 소재(반도체 급락)를 세어보니 — 118건, 5일 뒤 상승 58% vs 대조군 56%.
//   **우위가 없었다.** 소재가 정해진 뒤에 인사이트를 찾으면 이렇게 된다.
//
//   그래서 순서를 뒤집는다: **계산을 먼저 돌리고, 우위가 나온 조건을 그날 주제로 쓴다.**
//
// 판정 규율 (memory: 판정은 대량 레코드로만 / 인샘플 튜닝 금지):
//   · 표본 n < MIN_N 이면 «우위 있음»으로 보고하지 않는다 — 잡음이다
//   · 항상 «대조군»(조건 없이 아무 날) 과 나란히 낸다. 절대수치는 의미가 없다
//   · 임계값을 결과 보고 고르지 않는다. 아래 CONDITIONS 는 사전 고정이다
//   · 우위가 없으면 «없음»이 결론이다 — 그것도 정직한 영상 소재다
//
// 사용:  node scripts/morning-edge.mjs [--days 5] [--since 2021-01-01]
// ============================================================================

import { readFileSync, existsSync } from 'node:fs';

// 키는 .env.local 의 POLYGON_API_KEY 우선. 없으면 저장소에 이미 있는 상수로 폴백한다.
// (평문 키를 .env.local 로 옮기는 작업은 대표 지시로 «나중에» — 새 사본을 만들지 않는다)
function polygonKey() {
  if (process.env.POLYGON_API_KEY) return process.env.POLYGON_API_KEY;
  if (existsSync('.env.local')) {
    const m = readFileSync('.env.local', 'utf8').match(/^POLYGON_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  }
  const legacy = '.claude/skills/signum-shorts/scripts/baserate.js';
  if (existsSync(legacy)) {
    const m = readFileSync(legacy, 'utf8').match(/const KEY = '([^']+)'/);
    if (m) return m[1];
  }
  throw new Error('POLYGON_API_KEY 를 찾지 못했다 — .env.local 에 넣어라');
}
const KEY = polygonKey();

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const FWD = Number(arg('--days', 5));
const SINCE = arg('--since', '2021-01-01');
const TO = new Date().toISOString().slice(0, 10);
const MIN_N = 40;          // 이보다 적으면 판정하지 않는다
const EDGE_BAR = 8;        // 대조군 대비 상승확률 격차가 이만큼(%p)은 나야 «우위»

const cache = new Map();
async function bars(t) {
  if (cache.has(t)) return cache.get(t);
  const u = `https://api.polygon.io/v2/aggs/ticker/${t}/range/1/day/${SINCE}/${TO}?adjusted=true&limit=50000&apiKey=${KEY}`;
  const j = await (await fetch(u)).json();
  const rows = (j.results || []).map((b) => ({ d: new Date(b.t).toISOString().slice(0, 10), c: b.c }));
  cache.set(t, rows);
  return rows;
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const chg = (a, b) => ((b / a) - 1) * 100;

// ── 사전 고정 조건표 ─────────────────────────────────────────────────────────
// subject = 이후 수익률을 재는 대상 / gate = 그날이 «사건»인지 판정하는 함수
// 조건은 결과를 보고 고르지 않는다. 새 조건은 «가설»로 추가하고 그대로 둔다.
const CONDITIONS = [
  { id: 'semis-crash', label: '반도체 하루 -3% 이하', subject: 'SOXX',
    gate: (s) => s.r <= -3 },
  { id: 'semis-surge', label: '반도체 하루 +3% 이상', subject: 'SOXX',
    gate: (s) => s.r >= 3 },
  { id: 'spy-drop', label: 'S&P 하루 -1.5% 이하', subject: 'SPY',
    gate: (s) => s.r <= -1.5 },
  { id: 'spy-record', label: 'S&P 52주 신고가 마감', subject: 'SPY',
    gate: (s) => s.c >= s.hi252 },
  { id: 'vol-spike', label: '변동성 하루 +12% 이상', subject: 'SPY', vol: 'VIXY',
    gate: (s) => s.v >= 12 },
  { id: 'vol-crush', label: '변동성 하루 -8% 이하', subject: 'SPY', vol: 'VIXY',
    gate: (s) => s.v <= -8 },
  { id: 'energy-lead', label: '에너지가 기술주를 하루 2%p 이상 앞섬', subject: 'XLE', peer: 'XLK',
    gate: (s) => s.r - s.pr >= 2 },
  { id: 'tech-lead', label: '기술주가 에너지를 하루 2%p 이상 앞섬', subject: 'XLK', peer: 'XLE',
    gate: (s) => s.r - s.pr >= 2 },
  { id: 'gold-surge', label: '금 하루 +2% 이상', subject: 'GLD',
    gate: (s) => s.r >= 2 },
  { id: 'oil-shock', label: '원유 하루 +4% 이상', subject: 'XLE', peer: 'USO',
    gate: (s) => s.pr >= 4 },
  { id: 'miners-lead', label: '광산주가 반도체를 하루 2%p 이상 앞섬', subject: 'XME', peer: 'SOXX',
    gate: (s) => s.r - s.pr >= 2 },
  { id: 'smallcap-lag', label: '소형주가 대형주에 하루 1.5%p 이상 뒤짐', subject: 'IWM', peer: 'SPY',
    gate: (s) => s.r - s.pr <= -1.5 },
];

async function run(cond) {
  const S = await bars(cond.subject);
  const P = cond.peer ? Object.fromEntries((await bars(cond.peer)).map((b) => [b.d, b.c])) : null;
  const V = cond.vol ? Object.fromEntries((await bars(cond.vol)).map((b) => [b.d, b.c])) : null;
  if (S.length < 200) return { ...cond, skip: `데이터 부족 (${S.length}일)` };

  const hits = [], all = [];
  for (let i = 1; i < S.length - FWD; i++) {
    const fwd = chg(S[i].c, S[i + FWD].c);
    all.push(fwd);
    const state = { r: chg(S[i - 1].c, S[i].c), c: S[i].c, d: S[i].d };
    state.hi252 = Math.max(...S.slice(Math.max(0, i - 251), i + 1).map((b) => b.c));
    if (P) { const a = P[S[i - 1].d], b = P[S[i].d]; if (a == null || b == null) continue; state.pr = chg(a, b); }
    if (V) { const a = V[S[i - 1].d], b = V[S[i].d]; if (a == null || b == null) continue; state.v = chg(a, b); }
    if (cond.gate(state)) hits.push({ d: S[i].d, fwd });
  }

  const hitUp = hits.filter((h) => h.fwd > 0).length;
  const ctlUp = all.filter((x) => x > 0).length;
  const hitPct = hits.length ? (hitUp / hits.length) * 100 : 0;
  const ctlPct = (ctlUp / all.length) * 100;
  return {
    ...cond, n: hits.length, hitPct, ctlPct, edge: hitPct - ctlPct,
    hitMed: hits.length ? med(hits.map((h) => h.fwd)) : 0, ctlMed: med(all),
    last: hits.slice(-3).map((h) => h.d),
  };
}

(async () => {
  console.log(`\nSIGNUM 아침 우위 스캔 — ${SINCE} ~ ${TO} · 이후 ${FWD}거래일 기준`);
  console.log(`판정선: 표본 ${MIN_N}건 이상 AND 대조군 대비 ${EDGE_BAR}%p 이상\n`);

  const out = [];
  for (const c of CONDITIONS) { try { out.push(await run(c)); } catch (e) { out.push({ ...c, skip: e.message }); } }
  out.sort((a, b) => Math.abs(b.edge ?? 0) - Math.abs(a.edge ?? 0));

  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('조건', 40) + pad('표본', 7) + pad('상승', 8) + pad('대조군', 8) + pad('격차', 9) + '판정');
  console.log('─'.repeat(84));
  const usable = [];
  for (const r of out) {
    if (r.skip) { console.log(pad(r.label, 40) + r.skip); continue; }
    const ok = r.n >= MIN_N && Math.abs(r.edge) >= EDGE_BAR;
    const why = r.n < MIN_N ? `표본부족(${r.n})` : ok ? '★ 소재 후보' : '우위 없음';
    if (ok) usable.push(r);
    console.log(
      pad(r.label, 40) + pad(r.n, 7) +
      pad(`${r.hitPct.toFixed(0)}%`, 8) + pad(`${r.ctlPct.toFixed(0)}%`, 8) +
      pad(`${r.edge >= 0 ? '+' : ''}${r.edge.toFixed(0)}%p`, 9) + why,
    );
  }

  console.log('\n' + '═'.repeat(84));
  if (!usable.length) {
    console.log('오늘 판정선을 넘은 조건이 없다.');
    console.log('→ 이것도 소재다: "통념을 N번 세어봤더니 동전던지기였다" 는 정직하고 반전이 있다.');
  } else {
    console.log(`소재 후보 ${usable.length}건 — 대본의 «인사이트 비트»에 그대로 꽂는다:\n`);
    for (const r of usable) {
      console.log(`  [${r.id}] ${r.label}`);
      console.log(`     문장: "We counted ${r.n} of them since ${SINCE.slice(0, 4)}. ` +
        `${r.hitPct.toFixed(0)}% were higher ${FWD} days later - against ${r.ctlPct.toFixed(0)}% on any given day."`);
      console.log(`     비주얼 rows: EVENTS ${r.n} / HIGHER ${r.hitPct.toFixed(0)}% / ANY DAY ${r.ctlPct.toFixed(0)}%`);
      console.log(`     중앙 수익률 ${r.hitMed.toFixed(2)}% (대조군 ${r.ctlMed.toFixed(2)}%) · 최근 ${r.last.join(', ')}\n`);
    }
  }
})();
