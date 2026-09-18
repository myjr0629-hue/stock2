#!/usr/bin/env node
/**
 * 확장시간(프리·애프터) 데이터 품질 실측 — 순위 설계의 근거를 만드는 도구.
 *
 * 왜 필요한가: /api/market/movers 의 순위는 «직전 정규장» 기준이다(EOD 스냅샷 덮어쓰기).
 *   그래서 프리마켓엔 어제 순위를 보여 준다. 2026-09-18 실측에서 화면의 상승률 TOP5 중
 *   3종목이 프리마켓에 «거래조차 없었다». 순위를 세션별로 바꾸려면 확장시간 값이
 *   믿을 만한지부터 재야 한다 — 틀린 데이터로 만든 순위는 틀린 종목을 1위로 내보낸다.
 *
 * 무엇을 재는가
 *   ① 커버리지    — 확장시간 체결가가 있는 비율
 *   ② 등락률 정합 — 서버의 extendedChangePercent vs 두 가격으로 직접 계산한 값
 *   ③ 기준선      — 확장시간 등락률의 분모가 «맞는 세션»의 종가인가  ★애프터의 핵심
 *   ④ 거래량      — volume 이 확장시간 누적인가(유동성 하한을 만들 수 있는가)
 *   ⑤ 잡주 위험   — 하한 없이 순위를 만들면 무엇이 올라오는가
 *
 *   node scripts/measure-session-quality.js            # 결과를 화면에
 *   node scripts/measure-session-quality.js --save     # /tmp/snapq/<세션>-<시각>.json 에 원본 저장
 *
 * ⚠️ 세션 경계에서 재면 섞인다. 프리는 ET 07:00~09:25, 애프터는 ET 16:05~19:45 사이에 재라.
 */
const BASE = process.env.SIGNUM_BASE || 'https://www.signumhq.com';
const SAVE = process.argv.includes('--save');

const get = async (path) => {
  const r = await fetch(BASE + path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json();
};
const pct = (a, b) => (b > 0 ? ((a - b) / b) * 100 : NaN);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

(async () => {
  const status = await get('/api/market/status');
  const session = status.session;
  console.log(`■ 세션 ${session} · market ${status.market} · ${status.asOfET}`);
  if (session !== 'pre' && session !== 'post') {
    console.log('  ⚠️ 확장시간이 아니다. 프리(ET 07:00~09:25) 또는 애프터(ET 16:05~19:45)에 다시 재라.');
  }

  // 표본: movers 세 목록의 합집합 — 거물과 잡주가 함께 들어와 하한 검증에 맞다
  const mv = await get('/api/market/movers?limit=30');
  const syms = [];
  const regular = {};   // ticker → 이 순위가 쓴 «정규장 종가·등락률»
  for (const k of ['value', 'gainers', 'losers']) {
    for (const m of (mv[k] || [])) {
      if (m.ticker && !syms.includes(m.ticker)) syms.push(m.ticker);
      regular[m.ticker] = { price: m.price, chgPct: m.changePercent, volume: m.volume };
    }
  }
  console.log(`  표본 ${syms.length}종목 · movers eod=${JSON.stringify(mv.eod)}`);

  const q = (await get('/api/live/quotes?symbols=' + syms.join(','))).data || {};

  // ① 커버리지
  const withExt = syms.filter(t => q[t]?.extendedLabel && (q[t]?.extendedPrice || 0) > 0);
  console.log(`\n① 확장시간 체결가 보유 ${withExt.length}/${syms.length} (${(withExt.length / syms.length * 100).toFixed(0)}%)`);

  // ② 등락률 정합
  const bad = [];
  for (const t of withExt) {
    const v = q[t], c = pct(v.extendedPrice, v.price), a = v.extendedChangePercent;
    if (Number.isFinite(c) && Number.isFinite(a) && Math.abs(c - a) > 0.05) bad.push([t, a, c, Math.abs(c - a)]);
  }
  console.log(`② 서버 extendedChangePercent 불일치 ${bad.length}/${withExt.length}`);
  bad.sort((x, y) => y[3] - x[3]).slice(0, 8)
     .forEach(([t, a, c, d]) => console.log(`     ${t.padEnd(6)} API ${a.toFixed(2).padStart(9)}%  계산 ${c.toFixed(3).padStart(9)}%  차이 ${d.toFixed(1)}%p`));

  // ③ 기준선 — quote.price 가 «어느 세션의 종가»인가
  //    애프터라면 price 는 «오늘» 정규장 종가여야 한다. movers 의 정규장 종가와 맞는지 본다.
  let same = 0, diff = 0; const drift = [];
  for (const t of withExt) {
    const r = regular[t]; if (!r?.price) continue;
    const d = Math.abs(q[t].price - r.price) / r.price * 100;
    if (d < 0.01) same++; else { diff++; drift.push([t, q[t].price, r.price, d]); }
  }
  console.log(`③ quote.price 가 movers 의 정규장 종가와 일치 ${same} · 불일치 ${diff}`);
  drift.sort((x, y) => y[3] - x[3]).slice(0, 5)
       .forEach(([t, a, b, d]) => console.log(`     ${t.padEnd(6)} quotes ${a}  movers ${b}  (${d.toFixed(2)}% 차이)`));
  console.log('     → 애프터에 «불일치»가 많으면 기준선이 한 세션 밀린 것이다(=순위가 틀어진다)');

  // ④ 거래량이 확장시간 누적인가
  const ratios = syms.filter(t => q[t]?.volume && regular[t]?.volume)
                     .map(t => q[t].volume / regular[t].volume);
  console.log(`④ volume ÷ 순위기준 거래량 — 중앙값 ${med(ratios).toFixed(4)} (1 보다 훨씬 작으면 확장시간 누적)`);

  // ⑤ 잡주 위험
  const cand = withExt.map(t => {
    const v = q[t]; return { t, pct: pct(v.extendedPrice, v.price), px: v.extendedPrice, val: v.extendedPrice * (v.volume || 0) };
  }).filter(c => Number.isFinite(c.pct));
  const top = (xs) => xs.slice(0, 6).map(c => `${c.t} ${c.pct >= 0 ? '+' : ''}${c.pct.toFixed(2)}% ($${(c.val / 1e6).toFixed(1)}M)`).join(' · ');
  const byPct = [...cand].sort((a, b) => b.pct - a.pct);
  const floor = byPct.filter(c => c.px >= 2 && c.val >= 1e6);
  console.log(`⑤ 하한 없음   ${top(byPct)}`);
  console.log(`   하한 적용   ${top(floor)}   (${floor.length}/${cand.length} 통과 · 주가 $2 + 거래대금 $1M)`);

  if (SAVE) {
    const fs = require('fs'); fs.mkdirSync('/tmp/snapq', { recursive: true });
    const f = `/tmp/snapq/${session}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(f, JSON.stringify({ status, movers: mv, quotes: q }, null, 1));
    console.log(`\n원본 저장 ${f}`);
  }
})().catch(e => { console.error('측정 실패:', e.message); process.exit(1); });
