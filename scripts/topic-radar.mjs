#!/usr/bin/env node
// ============================================================================
// topic-radar — 「우리 데이터에서 소재를 «캐낸다»」
// ----------------------------------------------------------------------------
// ⛔ 대표 지적 (2026-08-21):
//   "너 소제 선정하는것보면 너무 평이하고 너무 창의력이없다"
//   "실제 실측으로 추측이 아닌 소제를 찾는것이 너의 능력이고"
//   "예를 들기만하면 그냥 그것만 생각하고 확장해서 생각을 못하니"
//
// 무엇이 빠져 있었나
//   market-wants.mjs 는 «시장이 무엇을 검색하는가»만 봤다 → 검색어 순위표.
//   그건 «문»이지 «소재»가 아니다. 검색어를 그대로 제목에 쓰면 남들과 같은 영상이 된다.
//
//   소재 = 「시장이 찾는 문」 × 「우리만 아는 이상값」
//   이 스크립트는 뒤쪽을 자동으로 캔다. 매일 돌려서 «오늘 할 말»을 받는다.
//
// ⛔ 이상값의 정의 — 전부 «비교 기준»이 있어야 한다. 수준값은 소재가 아니다.
//   ① 괴리   : 두 값이 «반대로» 움직임 (가격 ↑ 인데 돈 ↓ 등)
//   ② 극단   : 자기 이력 분포의 꼬리 (백분위 <=10 또는 >=90)
//   ③ 전환   : 관계의 «부호가 바뀜» (상관 +→−)
//   ④ 임박   : 가격이 구조적 레벨에 붙음 (맥스페인·콜월·감마플립)
//
// 출력: .agent/TOPIC_RADAR.json + 콘솔. 각 항목은 «훅 문장»까지 같이 낸다.
// 사용: node scripts/topic-radar.mjs
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf8');
const g = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : null; };
const FMP = g('FMP_API_KEY');
const RU = g('UPSTASH_REDIS_REST_URL'), RT = g('UPSTASH_REDIS_REST_TOKEN');

const bars = async (s, from = '2025-06-01', to = '2026-08-20') => {
  const r = await fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(s)}&from=${from}&to=${to}&apikey=${FMP}`);
  const t = await r.text();
  return t.startsWith('[') ? JSON.parse(t).slice().reverse() : null;
};
const corr = (x, y) => {
  const n = Math.min(x.length, y.length); x = x.slice(-n); y = y.slice(-n);
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { const p = x[i] - mx, q = y[i] - my; a += p * q; b += p * p; c += q * q; }
  return b && c ? a / Math.sqrt(b * c) : 0;
};
const ret = (a) => a.slice(1).map((x, i) => x.close / a[i].close - 1);
const pct = (arr, v) => arr.filter((x) => x < v).length / arr.length * 100;

const found = [];
const add = (o) => { found.push(o); console.log(`  [${o.kind}] ${o.hook}`); };

// ── ④ 임박 — 우리 옵션 북 (Redis). 오늘만 아는 값이다 ──────────────────────
if (RU) {
  try {
    const keys = await (await fetch(`${RU}/keys/cache:command:unified:*`, { headers: { Authorization: `Bearer ${RT}` } })).json();
    for (const k of (keys.result || [])) {
      const v = await (await fetch(`${RU}/get/${encodeURIComponent(k)}`, { headers: { Authorization: `Bearer ${RT}` } })).json();
      let d; try { d = JSON.parse(v.result); } catch { continue; }
      const t = k.split(':').pop(), st = d.structure || {};
      const px = st.underlyingPrice, mp = st.maxPain, np = st.netPremium, cw = st.levels && st.levels.callWall;
      if (!px || !mp) continue;
      const gap = (px / mp - 1) * 100;
      if (Math.abs(gap) >= 4)
        add({ kind: '임박', sym: t, metric: 'price vs max pain', value: +gap.toFixed(1),
          hook: `${t} sits ${Math.abs(gap).toFixed(1)}% ${gap > 0 ? 'above' : 'below'} max pain ($${mp}) into expiry`,
          detail: { price: px, maxPain: mp, callWall: cw, netPremium: np } });
      // ① 괴리 — 가격은 버텼는데 돈은 나갔다
      if (np != null && np < -2e6 && gap > 0)
        add({ kind: '괴리', sym: t, metric: 'price above max pain while premium leaves',
          value: +(np / 1e6).toFixed(2),
          hook: `${t} held above max pain while $${Math.abs(np / 1e6).toFixed(1)}M of option premium left`,
          detail: { price: px, maxPain: mp, netPremium: np } });
    }
  } catch (e) { console.log('  (redis skip)', String(e.message).slice(0, 60)); }
}

// ── ②③ 극단·전환 — 관계쌍을 훑는다 ────────────────────────────────────────
const PAIRS = [
  ['GLD', 'IBIT', '금과 비트코인'], ['GLD', 'UUP', '금과 달러'],
  ['SPY', 'TLT', '주식과 장기채'], ['SPY', 'UUP', '주식과 달러'],
  ['QQQ', 'TLT', '나스닥과 금리'], ['NVDA', 'AMD', '엔비디아와 AMD'],
  ['SPY', 'GLD', '주식과 금'], ['SMH', 'SPY', '반도체와 지수'],
  ['XLU', 'SPY', '유틸리티와 지수'], ['HYG', 'SPY', '하이일드와 주식'],
];
const WIN = 42;
for (const [a, b, label] of PAIRS) {
  const A = await bars(a), B = await bars(b);
  if (!A || !B || A.length < 120 || B.length < 120) continue;
  const mb = Object.fromEntries(B.map((x) => [x.date, x.close]));
  const d = A.filter((x) => mb[x.date]);
  if (d.length < 120) continue;
  const ra = ret(d), rb = ret(d.map((x) => ({ date: x.date, close: mb[x.date] })));
  const roll = [];
  for (let i = WIN; i <= ra.length; i++) roll.push(corr(ra.slice(i - WIN, i), rb.slice(i - WIN, i)));
  if (roll.length < 60) continue;
  const now = roll[roll.length - 1], p = pct(roll, now), medv = roll.slice().sort((x, y) => x - y)[Math.floor(roll.length / 2)];
  if (p >= 90 || p <= 10)
    add({ kind: '극단', sym: `${a}/${b}`, metric: `${WIN}일 상관`, value: +now.toFixed(2),
      hook: `${label} correlation is ${now.toFixed(2)} - the ${p >= 90 ? 'highest' : 'lowest'} in ${roll.length} windows (median ${medv.toFixed(2)})`,
      detail: { now: +now.toFixed(2), median: +medv.toFixed(2), percentile: +p.toFixed(0), windows: roll.length } });
  const early = roll.slice(0, 20).reduce((x, y) => x + y, 0) / 20;
  if (Math.sign(early) !== Math.sign(now) && Math.abs(now - early) > 0.35)
    add({ kind: '전환', sym: `${a}/${b}`, metric: `${WIN}일 상관 부호 전환`, value: +now.toFixed(2),
      hook: `${label} flipped from ${early.toFixed(2)} to ${now.toFixed(2)} - the relationship reversed sign`,
      detail: { was: +early.toFixed(2), now: +now.toFixed(2) } });
}

// ── ② 극단 — 개별 종목이 자기 분포의 꼬리에 있는가 ─────────────────────────
for (const s of ['NVDA', 'AMD', 'AVGO', 'TSLA', 'AAPL', 'MSFT', 'GLD', 'TLT', 'SPY']) {
  const b = await bars(s, '2024-01-01');
  if (!b || b.length < 250) continue;
  const r = ret(b);
  // ⛔ 이상치 방어 (2026-08-21). MSFT 가 «실현변동성 60% · 상위 1%» 로 잡혔는데
  //   파보니 창 안의 «하루 15.5%» 한 건이 만든 값이었고, 그 하루는 데이터 오류였다.
  //   그 숫자를 제목에 박았으면 사고다. 하루 |수익률| 12% 초과는 버린다.
  const clean = r.filter((x) => Math.abs(x) < 0.12);
  const dropped = r.length - clean.length;
  if (dropped) console.log(`     (${s}: 이상치 ${dropped}일 제외)`);
  const vol = [];
  for (let i = 21; i <= clean.length; i++) {
    const w = clean.slice(i - 21, i); const m = w.reduce((x, y) => x + y, 0) / 21;
    vol.push(Math.sqrt(w.reduce((x, y) => x + (y - m) ** 2, 0) / 20) * Math.sqrt(252) * 100);
  }
  const now = vol[vol.length - 1], p = pct(vol, now);
  if (p <= 8 || p >= 92)
    add({ kind: '극단', sym: s, metric: '21일 실현변동성', value: +now.toFixed(1),
      hook: `${s} realized volatility is ${now.toFixed(0)}% - ${p >= 92 ? 'top' : 'bottom'} ${p >= 92 ? (100 - p).toFixed(0) : p.toFixed(0)}% of the last ${vol.length} readings`,
      detail: { now: +now.toFixed(1), percentile: +p.toFixed(0), n: vol.length } });
}

// ── 수요표와 붙인다 — 「문」이 있는 소재만 쓸모가 있다 ──────────────────────
let demand = {};
if (existsSync('.agent/DEMAND.json')) demand = JSON.parse(readFileSync('.agent/DEMAND.json', 'utf8')).terms || {};
const DOORS = [
  [/max pain|expiry|option premium/i, 'options trading explained'],
  [/correlation|flipped|relationship/i, 'is the ai bubble popping'],
  [/volatility/i, 'stock market crash coming'],
  [/gold|GLD/i, 'why gold is going up'],
  [/TLT|bond|yield/i, 'bond yields explained'],
];
for (const f of found) {
  const hit = DOORS.find(([re]) => re.test(f.hook + ' ' + (f.metric || '')));
  f.door = hit ? hit[1] : null;
  f.doorDemand = hit ? (demand[hit[1]] ?? null) : null;
}

found.sort((a, b) => (b.doorDemand ?? 0) - (a.doorDemand ?? 0));
writeFileSync('.agent/TOPIC_RADAR.json', JSON.stringify({ scannedAt: '2026-08-21', found }, null, 1));

console.log(`\n  ══ 오늘 캔 소재 ${found.length}건 ══\n`);
console.log(`  ${'유형'.padEnd(6)}${'수요문'.padEnd(30)}훅`);
for (const f of found)
  console.log(`  ${f.kind.padEnd(6)}${String(f.door ?? '-').padEnd(30)}${f.hook}`);
console.log('\n  -> .agent/TOPIC_RADAR.json');
