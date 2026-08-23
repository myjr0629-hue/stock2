#!/usr/bin/env node
// ============================================================================
// edge-jp-yen — 「円で買ったS&P500」의 수익 중 «시장»과 «円安»의 몫을 가른다
// ----------------------------------------------------------------------------
// ⛔ 왜 이 각도인가 (2026-08-23)
//   S&P500 갈래의 원래 각도(지수는 조용한데 안은 갈라졌다)는 오늘 수치로 «탈락»했다:
//   SPY-RSP 1년 격차 1.15%pt = 4,748개 창 중 상위 51.0% (정중앙). 억지로 쓰지 않는다.
//   대신 일본 수요 1·2위 어휘(米国金利·ドル円)와 S&P500 을 «교차»한다.
//
// ── 사전등록 (재기 «전»에 정한다) ────────────────────────────────────────────
//   지표  SPY 총수익(배수)을 ① 달러 기준 ② 엔 환산 기준 두 가지로 계산
//         엔 환산 = SPY종가 × USDJPY. «엔 약세 기여분» = 1 - (달러배수 / 엔배수)
//   기간  10년 · 5년 · 3년 (셋 다 적는다 — 하나만 고르면 그게 체리피킹이다)
//   판정  기여분 >= 25% 면 인사이트로 인정. 미만이면 «환율은 크지 않았다»로 그대로 쓴다
//   ⛔ 「だから円で持て」같은 조언으로 쓰지 않는다. 분해만 보여준다.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = readFileSync('.env.local', 'utf8').match(/^FMP_API_KEY=(.+)$/m)[1].trim();
const eod = async (sym, from) => {
  const j = await (await fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${sym}&from=${from}&to=2026-08-22&apikey=${KEY}`)).json();
  if (!Array.isArray(j)) throw new Error(sym + ' ' + JSON.stringify(j).slice(0, 150));
  return j.slice().sort((a, b) => a.date.localeCompare(b.date));
};

const spy = await eod('SPY', '2016-08-01');
const fx = await eod('USDJPY', '2016-08-01');
const m = new Map(fx.map((r) => [r.date, r.close]));
const rows = spy.filter((r) => m.has(r.date)).map((r) => ({ d: r.date, usd: r.close, jpy: r.close * m.get(r.date), rate: m.get(r.date) }));
console.log(`  겹치는 거래일 ${rows.length}일 · ${rows[0].d} → ${rows[rows.length - 1].d}`);

const last = rows[rows.length - 1];
const at = (yrs) => {
  const target = new Date(last.d); target.setFullYear(target.getFullYear() - yrs);
  const t = target.toISOString().slice(0, 10);
  return rows.find((r) => r.d >= t) || rows[0];
};

const out = { asof: last.d, rate_now: +last.rate.toFixed(2), spy_now: last.usd, spans: [] };
for (const y of [10, 5, 3]) {
  const b = at(y);
  const xUsd = last.usd / b.usd, xJpy = last.jpy / b.jpy, xFx = last.rate / b.rate;
  const share = (1 - Math.log(xUsd) / Math.log(xJpy)) * 100;   // 로그 기여분 — 곱셈 분해라 로그가 정직하다
  out.spans.push({
    y, from: b.d, rate_then: +b.rate.toFixed(2),
    usd_x: +xUsd.toFixed(3), jpy_x: +xJpy.toFixed(3), fx_x: +xFx.toFixed(3),
    yen_share: +share.toFixed(1),
    man_usd: Math.round(100 * xUsd), man_jpy: Math.round(100 * xJpy),   // 100만엔 기준 만엔 단위
  });
  const o = out.spans[out.spans.length - 1];
  console.log(`\n  ══ ${y}년 (${b.d} · ${o.rate_then}円 → ${out.rate_now}円) ══`);
  console.log(`   ドル建て ${o.usd_x}倍   円建て ${o.jpy_x}倍   為替だけで ${o.fx_x}倍`);
  console.log(`   100万円 → 円建て ${o.man_jpy}万円 (ドル建て換算なら ${o.man_usd}万円)`);
  console.log(`   円安の寄与 ${o.yen_share}%  ${o.yen_share >= 25 ? '✅ 인정' : '⛔ 기준 미달'}`);
}
writeFileSync('.agent/_jp_yen.json', JSON.stringify(out, null, 2));
console.log('\n  → .agent/_jp_yen.json');
