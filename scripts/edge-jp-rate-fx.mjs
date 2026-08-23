#!/usr/bin/env node
// ============================================================================
// edge-jp-rate-fx — 일본 수요 1·2위(米国金利 83,743 · ドル円 45,359)를 «잰다»
// ----------------------------------------------------------------------------
// ⛔ 두 소재 다 우리 영상이 0편이다. 수요는 가장 큰데 한 번도 안 건드렸다.
//   억지로 만들지 않는다 — 아래 판정 기준을 못 넘으면 그대로 적고 각도를 버린다.
//
// ── A) 米国金利: 「金利が上がると株は下がる」는 사실인가 ─────────────────────
//   자료  FRED DGS10 (10년 국채금리, 일간) × SPY 종가
//   지표  SPY 일간수익률 ↔ DGS10 «일간 변화(bp)» 의 252거래일 롤링 상관
//   통념  상관이 «음(-)» 이어야 한다
//   검정  ① 지금 값  ② 전 구간 분포에서의 백분위  ③ 전체 기간 상관과 t
//   판정  백분위 <=10 또는 >=90 → 「지금이 이례적」
//         그게 아니어도 «부호가 시대마다 뒤집히면» 그 자체가 소재다 (통념이 조건부라는 뜻)
//
// ── B) ドル円: 円で持つと値動きは «荒くなるのか» ────────────────────────────
//   지표  ① USDJPY 일간변화 ↔ SPY 일간수익률 상관 (10년)
//         ② 円건 SPY 일간변동성 vs ドル건 SPY 일간변동성 (연율)
//   가설  세우지 않는다 — 어느 쪽이든 쓸 수 있는 질문이다
//   판정  상관이 유의(p<0.05)해야 «관계가 있다»고 말한다
//
// ⛔ 「だから〜せよ」로 쓰지 않는다. 위치와 분포만 보여준다.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
const FMP = env.match(/^FMP_API_KEY=(.+)$/m)[1].trim();
const FRED = env.match(/^FRED_API_KEY=(.+)$/m)[1].trim();

const eod = async (s, from) => {
  const j = await (await fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${s}&from=${from}&to=2026-08-22&apikey=${FMP}`)).json();
  return j.slice().sort((a, b) => a.date.localeCompare(b.date));
};
const fred = async (id, from) => {
  const j = await (await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED}&file_type=json&observation_start=${from}`)).json();
  const o = new Map();
  for (const x of j.observations || []) if (x.value !== '.') o.set(x.date, Number(x.value));
  return o;
};
const corr = (a, b) => {
  const n = a.length, ma = a.reduce((p, c) => p + c, 0) / n, mb = b.reduce((p, c) => p + c, 0) / n;
  let sab = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; sa += x * x; sb += y * y; }
  return sab / Math.sqrt(sa * sb);
};
const tOf = (r, n) => r * Math.sqrt((n - 2) / (1 - r * r));
const out = {};

// ── A ───────────────────────────────────────────────────────────────────────
{
  const spy = await eod('SPY', '2006-01-01');
  const y = await fred('DGS10', '2006-01-01');
  const rows = [];
  for (let i = 1; i < spy.length; i++) {
    const d = spy[i].date, p = spy[i - 1].date;
    if (!y.has(d) || !y.has(p)) continue;
    rows.push({ d, r: spy[i].close / spy[i - 1].close - 1, dy: (y.get(d) - y.get(p)) * 100 });   // bp
  }
  const W = 252, roll = [];
  for (let i = W; i <= rows.length; i++) {
    const s = rows.slice(i - W, i);
    roll.push({ d: s[s.length - 1].d, c: corr(s.map((x) => x.r), s.map((x) => x.dy)) });
  }
  const now = roll[roll.length - 1];
  const all = roll.map((x) => x.c).sort((a, b) => a - b);
  const pc = all.filter((x) => x <= now.c).length / all.length * 100;
  const full = corr(rows.map((x) => x.r), rows.map((x) => x.dy));
  const neg = roll.filter((x) => x.c < 0).length;
  out.A = {
    n: rows.length, from: rows[0].d, to: rows[rows.length - 1].d,
    now: +now.c.toFixed(3), asof: now.d, pctile: +pc.toFixed(1),
    median: +all[Math.floor(all.length / 2)].toFixed(3),
    min: +all[0].toFixed(3), max: +all[all.length - 1].toFixed(3),
    full: +full.toFixed(3), fullT: +tOf(full, rows.length).toFixed(2),
    negShare: +(neg / roll.length * 100).toFixed(1), windows: roll.length,
  };
  console.log(`\n  ══ A) 米国金利 × 米国株 (${out.A.from} ~ ${out.A.to} · ${out.A.n}일) ══`);
  console.log(`   전체 기간 상관 ${out.A.full}  (t=${out.A.fullT})`);
  console.log(`   1년 롤링 상관 — 지금 ${out.A.now} (${out.A.asof}) · 중앙 ${out.A.median} · 범위 ${out.A.min}~${out.A.max}`);
  console.log(`   백분위 ${out.A.pctile}  ${(pc <= 10 || pc >= 90) ? '✅ 이례적' : '⛔ 평범'}`);
  console.log(`   «음의 상관(통념대로)» 이었던 창의 비율 ${out.A.negShare}%  ← 부호가 뒤집히는가`);
}

// ── B ───────────────────────────────────────────────────────────────────────
{
  const [spy, fx] = await Promise.all([eod('SPY', '2016-08-01'), eod('USDJPY', '2016-08-01')]);
  const m = new Map(fx.map((r) => [r.date, r.close]));
  const rows = spy.filter((r) => m.has(r.date)).map((r) => ({ d: r.date, u: r.close, j: r.close * m.get(r.date), f: m.get(r.date) }));
  const ru = [], rj = [], rf = [];
  for (let i = 1; i < rows.length; i++) {
    ru.push(rows[i].u / rows[i - 1].u - 1);
    rj.push(rows[i].j / rows[i - 1].j - 1);
    rf.push(rows[i].f / rows[i - 1].f - 1);
  }
  const sd = (a) => { const m2 = a.reduce((p, c) => p + c, 0) / a.length; return Math.sqrt(a.reduce((p, c) => p + (c - m2) ** 2, 0) / (a.length - 1)); };
  const c = corr(ru, rf), t = tOf(c, ru.length);
  // 「하락일」에 円이 어떻게 움직였나 — 리스크오프 검정
  const down = ru.map((v, i) => [v, rf[i]]).filter(([v]) => v < -0.01);
  const upd = ru.map((v, i) => [v, rf[i]]).filter(([v]) => v > 0.01);
  const avg = (a) => a.reduce((p, x) => p + x[1], 0) / a.length * 100;
  out.B = {
    n: ru.length, from: rows[0].d, to: rows[rows.length - 1].d,
    volUsd: +(sd(ru) * Math.sqrt(252) * 100).toFixed(2),
    volJpy: +(sd(rj) * Math.sqrt(252) * 100).toFixed(2),
    corr: +c.toFixed(3), t: +t.toFixed(2),
    downDays: down.length, fxOnDown: +avg(down).toFixed(3),
    upDays: upd.length, fxOnUp: +avg(upd).toFixed(3),
  };
  console.log(`\n  ══ B) ドル円 × 米国株 (${out.B.from} ~ ${out.B.to} · ${out.B.n}일) ══`);
  console.log(`   年率ボラ  ドル建て ${out.B.volUsd}%  vs  円建て ${out.B.volJpy}%   ${out.B.volJpy > out.B.volUsd ? '→ 円で持つ方が «荒い»' : '→ 円で持つ方が «穏やか»'}`);
  console.log(`   USDJPY 변화 ↔ SPY 수익 상관 ${out.B.corr} (t=${out.B.t}) ${Math.abs(out.B.t) > 1.96 ? '✅ 유의' : '⛔ 유의하지 않다'}`);
  console.log(`   SPY -1% 이하 하락일 ${out.B.downDays}일 · 그날 평균 ドル円 ${out.B.fxOnDown}%`);
  console.log(`   SPY +1% 이상 상승일 ${out.B.upDays}일 · 그날 평균 ドル円 ${out.B.fxOnUp}%`);
}

writeFileSync('.agent/_jp_ratefx.json', JSON.stringify(out, null, 2));
console.log('\n  → .agent/_jp_ratefx.json');
