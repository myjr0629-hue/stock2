#!/usr/bin/env node
// ============================================================================
// topic-bank — «재고형» 영상의 소재 은행. 수백 조건을 전수 세고, 살아남은 것만 남긴다
// ----------------------------------------------------------------------------
// 왜 필요한가 (2026-08-12):
//   하루 3~5편 구조에서 «실시간형»(장전·장마감)은 캡처가 소재를 만들어 준다.
//   문제는 «재고형»이다 — 계산된 우위가 있어야 만들 수 있는데,
//   morning-edge.mjs 는 조건이 12개뿐이라 통과가 1개밖에 안 나온다. 재고가 안 쌓인다.
//   그래서 조건을 «조합으로 생성»해 수백 개를 한 번에 센다.
//
// ⚠️ 다중검정 함정 — 이 스크립트의 존재 이유이자 가장 중요한 설계
//   수백 개를 스캔하면 «우연히» 8%p 를 넘는 조건이 반드시 나온다. 그걸 소재로 쓰면
//   인샘플 과적합이고, 영상은 틀린 주장을 하게 된다.
//   그래서 표본을 시간으로 반 가른다:
//     · 전반부(IS)  = 2021-01 ~ 2024-06
//     · 후반부(OOS) = 2024-07 ~ 현재     ← «본 적 없는» 구간
//   **양쪽에서 같은 방향으로, 둘 다 판정선을 넘은 것만** 은행에 넣는다.
//   한쪽만 통과한 건 «우연»으로 보고 버린다. (memory: 인샘플 튜닝 금지)
//
// 사용
//   node scripts/topic-bank.mjs              전수 스캔 → .agent/TOPIC_BANK.json
//   node scripts/topic-bank.mjs --all        탈락한 것까지 전부 출력(진단용)
// ============================================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

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
  throw new Error('POLYGON_API_KEY 를 찾지 못했다');
}
const KEY = polygonKey();

const FROM = '2021-01-01';
const SPLIT = '2024-07-01';                 // 여기서 전/후반을 가른다
const TO = new Date().toISOString().slice(0, 10);
const HORIZONS = [5, 10, 21];
const MIN_N = 40;                            // 한쪽 구간 기준 최소 사건 수
const EDGE_BAR = 8;                          // 대조군 대비 상승확률 격차(%p)
const SHOW_ALL = process.argv.includes('--all');

// ── 대상 ────────────────────────────────────────────────────────────────────
// 시청자가 «이름을 아는» 것만. 소형주·마이너 티커는 넣지 않는다(대표 지시 2026-08-12).
const INDEX = ['SPY', 'QQQ', 'IWM', 'DIA'];
const SECTOR = ['XLK', 'XLE', 'XLF', 'XLV', 'XLI', 'XLU', 'XLY', 'XLP', 'XLB'];
const THEME = ['SOXX', 'SMH', 'XME', 'COPX', 'GLD', 'SLV', 'USO', 'TLT', 'HYG', 'UUP', 'VIXY', 'XBI', 'ITA'];
const MEGA = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'TSLA', 'AVGO', 'MU', 'AMD'];
const ALL = [...new Set([...INDEX, ...SECTOR, ...THEME, ...MEGA])];

const bars = new Map();
async function load(t) {
  if (bars.has(t)) return bars.get(t);
  const u = `https://api.polygon.io/v2/aggs/ticker/${t}/range/1/day/${FROM}/${TO}?adjusted=true&limit=50000&apiKey=${KEY}`;
  const j = await (await fetch(u)).json();
  const rows = (j.results || []).map((b) => ({ d: new Date(b.t).toISOString().slice(0, 10), c: b.c }));
  bars.set(t, rows);
  return rows;
}

const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, b) => ((b / a) - 1) * 100;

/**
 * 조건 하나를 전/후반으로 나눠 센다.
 * @param subject 이후 수익률을 재는 대상
 * @param gate    (state) => boolean   그날이 «사건»인지
 * @param fwd     이후 거래일 수
 */
function measure(subject, rows, gate, fwd, peerBy) {
  const seg = { is: { hit: [], all: [] }, oos: { hit: [], all: [] } };
  for (let i = 252; i < rows.length - fwd; i++) {
    const d = rows[i].d;
    const bucket = d < SPLIT ? seg.is : seg.oos;
    const f = pct(rows[i].c, rows[i + fwd].c);
    bucket.all.push(f);
    const st = {
      r: pct(rows[i - 1].c, rows[i].c),
      r5: pct(rows[i - 5].c, rows[i].c),
      r25: pct(rows[i - 25].c, rows[i].c),
      c: rows[i].c,
      hi252: Math.max(...rows.slice(i - 251, i + 1).map((b) => b.c)),
      lo252: Math.min(...rows.slice(i - 251, i + 1).map((b) => b.c)),
      up3: rows[i].c > rows[i - 1].c && rows[i - 1].c > rows[i - 2].c && rows[i - 2].c > rows[i - 3].c,
      dn3: rows[i].c < rows[i - 1].c && rows[i - 1].c < rows[i - 2].c && rows[i - 2].c < rows[i - 3].c,
    };
    if (peerBy) {
      const p0 = peerBy[rows[i - 1].d], p1 = peerBy[rows[i].d];
      const p25 = peerBy[rows[i - 25].d];
      if (p0 == null || p1 == null || p25 == null) continue;
      st.pr = pct(p0, p1);
      st.pr25 = pct(p25, p1);
    }
    if (gate(st)) bucket.hit.push(f);
  }
  const stat = (g) => {
    if (!g.hit.length || !g.all.length) return null;
    const hit = g.hit.filter((x) => x > 0).length / g.hit.length * 100;
    const ctl = g.all.filter((x) => x > 0).length / g.all.length * 100;
    return { n: g.hit.length, hit, ctl, edge: hit - ctl, medHit: med(g.hit), medCtl: med(g.all) };
  };
  return { is: stat(seg.is), oos: stat(seg.oos) };
}

// ── 조건 생성기 ─────────────────────────────────────────────────────────────
// 사전 고정 규칙이다. 결과를 보고 임계값을 바꾸지 않는다.
function conditionsFor(sym) {
  return [
    { id: `${sym}-drop3`, label: `${sym} 하루 -3% 이하`, gate: (s) => s.r <= -3 },
    { id: `${sym}-pop3`, label: `${sym} 하루 +3% 이상`, gate: (s) => s.r >= 3 },
    { id: `${sym}-drop15`, label: `${sym} 하루 -1.5% 이하`, gate: (s) => s.r <= -1.5 },
    { id: `${sym}-pop15`, label: `${sym} 하루 +1.5% 이상`, gate: (s) => s.r >= 1.5 },
    { id: `${sym}-hi52`, label: `${sym} 52주 신고가 마감`, gate: (s) => s.c >= s.hi252 },
    { id: `${sym}-lo52`, label: `${sym} 52주 신저가 마감`, gate: (s) => s.c <= s.lo252 },
    { id: `${sym}-up3d`, label: `${sym} 3일 연속 상승`, gate: (s) => s.up3 },
    { id: `${sym}-dn3d`, label: `${sym} 3일 연속 하락`, gate: (s) => s.dn3 },
    { id: `${sym}-run5`, label: `${sym} 5일 +5% 이상 급등`, gate: (s) => s.r5 >= 5 },
    { id: `${sym}-fall5`, label: `${sym} 5일 -5% 이하 급락`, gate: (s) => s.r5 <= -5 },
    { id: `${sym}-run25`, label: `${sym} 25일 +12% 이상`, gate: (s) => s.r25 >= 12 },
    { id: `${sym}-fall25`, label: `${sym} 25일 -12% 이하`, gate: (s) => s.r25 <= -12 },
  ];
}
// 상대 조건 — «A 가 B 를 앞섰다» (우리 서사에서 가장 잘 먹히는 형태)
const PAIRS = [
  ['XLE', 'XLK'], ['XLK', 'XLE'], ['XME', 'SOXX'], ['SOXX', 'XLK'],
  ['IWM', 'SPY'], ['SPY', 'IWM'], ['XLU', 'SPY'], ['XLF', 'SPY'],
  ['GLD', 'SPY'], ['TLT', 'SPY'], ['COPX', 'NVDA'], ['NVDA', 'SOXX'],
  ['HYG', 'TLT'], ['XLY', 'XLP'], ['XLP', 'XLY'], ['SLV', 'GLD'],
];

(async () => {
  console.log(`SIGNUM 소재 은행 스캔`);
  console.log(`표본 ${FROM} ~ ${TO} · 전/후반 분할점 ${SPLIT}`);
  console.log(`판정선: 전·후반 «양쪽»에서 표본 ${MIN_N}+ AND 격차 ${EDGE_BAR}%p+ AND 같은 방향\n`);

  console.log(`시세 로딩 ${ALL.length}종...`);
  for (const t of ALL) { await load(t); process.stdout.write('.'); }
  console.log('\n');

  const results = [];
  let tested = 0;

  // 단일 조건
  for (const sym of ALL) {
    const rows = bars.get(sym);
    if (!rows || rows.length < 400) continue;
    for (const c of conditionsFor(sym)) {
      for (const fwd of HORIZONS) {
        tested++;
        const m = measure(sym, rows, c.gate, fwd);
        if (!m.is || !m.oos) continue;
        results.push({ ...c, subject: sym, fwd, ...m, kind: 'single' });
      }
    }
  }

  // 상대 조건
  for (const [a, b] of PAIRS) {
    const rows = bars.get(a), peer = bars.get(b);
    if (!rows || !peer || rows.length < 400) continue;
    const peerBy = Object.fromEntries(peer.map((x) => [x.d, x.c]));
    const defs = [
      { id: `${a}-lead-${b}-d2`, label: `${a}가 ${b}를 하루 2%p 이상 앞섬`, gate: (s) => s.r - s.pr >= 2 },
      { id: `${a}-lead-${b}-m8`, label: `${a}가 ${b}를 25일 8%p 이상 앞섬`, gate: (s) => s.r25 - s.pr25 >= 8 },
      { id: `${a}-lag-${b}-m8`, label: `${a}가 ${b}에 25일 8%p 이상 뒤짐`, gate: (s) => s.r25 - s.pr25 <= -8 },
    ];
    for (const c of defs) {
      for (const fwd of HORIZONS) {
        tested++;
        const m = measure(a, rows, c.gate, fwd, peerBy);
        if (!m.is || !m.oos) continue;
        results.push({ ...c, subject: a, peer: b, fwd, ...m, kind: 'pair' });
      }
    }
  }

  // ── 판정 — 양쪽 구간을 다 통과해야 한다 ───────────────────────────────────
  const survives = (r) =>
    r.is.n >= MIN_N && r.oos.n >= MIN_N &&
    Math.abs(r.is.edge) >= EDGE_BAR && Math.abs(r.oos.edge) >= EDGE_BAR &&
    Math.sign(r.is.edge) === Math.sign(r.oos.edge);

  const banked = results.filter(survives)
    .sort((a, b) => Math.min(Math.abs(b.is.edge), Math.abs(b.oos.edge)) - Math.min(Math.abs(a.is.edge), Math.abs(a.oos.edge)));

  const isOnly = results.filter((r) => !survives(r) && r.is.n >= MIN_N && Math.abs(r.is.edge) >= EDGE_BAR);

  console.log(`검정한 조건 ${tested}개 · 유효 ${results.length}개`);
  console.log(`전반부만 통과 ${isOnly.length}개 ← 이만큼이 «우연»이다. 버린다.`);
  console.log(`양쪽 통과 ${banked.length}개 ← 소재 은행\n`);

  if (!banked.length) {
    console.log('은행에 넣을 조건이 없다. 판정선을 낮추지 말 것 — 그건 과적합이다.');
  } else {
    const pad = (s, n) => String(s).padEnd(n);
    console.log(pad('조건', 42) + pad('기간', 6) + pad('전반부 n/격차', 18) + pad('후반부 n/격차', 18) + '방향');
    console.log('─'.repeat(96));
    for (const r of banked) {
      const dir = r.oos.edge > 0 ? '↑ 이후 강함' : '↓ 이후 약함';
      console.log(
        pad(r.label, 42) + pad(`${r.fwd}일`, 6) +
        pad(`${r.is.n} / ${r.is.edge >= 0 ? '+' : ''}${r.is.edge.toFixed(0)}%p`, 18) +
        pad(`${r.oos.n} / ${r.oos.edge >= 0 ? '+' : ''}${r.oos.edge.toFixed(0)}%p`, 18) + dir,
      );
    }
  }

  if (SHOW_ALL && isOnly.length) {
    console.log(`\n── 전반부만 통과(버림) 상위 10 ──`);
    for (const r of isOnly.slice(0, 10)) {
      console.log(`  ${r.label} ${r.fwd}일  IS ${r.is.edge.toFixed(0)}%p → OOS ${r.oos ? r.oos.edge.toFixed(0) + '%p' : '없음'}`);
    }
  }

  const out = {
    scannedAt: TO, from: FROM, split: SPLIT, tested,
    bar: { minN: MIN_N, edgePp: EDGE_BAR, requireBothHalves: true },
    banked: banked.map((r) => ({
      id: r.id, label: r.label, subject: r.subject, peer: r.peer || null, forwardDays: r.fwd,
      inSample: r.is, outOfSample: r.oos,
      direction: r.oos.edge > 0 ? 'stronger' : 'weaker',
    })),
  };
  writeFileSync('.agent/TOPIC_BANK.json', JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`\n→ .agent/TOPIC_BANK.json (${banked.length}건)`);
})();
