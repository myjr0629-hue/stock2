/**
 * IV30(30일 고정 만기 ATM IV) — 수집 Lambda harvest_lambda/iv30.js 시험
 * 실행: node --test tests/iv30.harvest.test.js
 *
 * 픽스처 모양 = 운영 어댑터(intrinio-adapter getOptionChain) 계약:
 *   { details:{contract_type, expiration_date, strike_price}, implied_volatility, last_quote:{ last_updated: prices.date(00:00Z) × 1e6 } }
 *   10/2(금) 체인 실측 만기 구성: SPY 는 6만기가 10/5~10/12(10일)에서 끝나고, 30일 괄호는 10/30(28일)·11/6(35일).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const iv30 = require('../harvest_lambda/iv30.js');

const ns = (d) => Date.parse(d + 'T00:00:00Z') * 1e6;
/** 한 만기의 체인 — 행사가마다 콜·풋, IV 는 ivFn(strike) */
function chain(exp, chainDate, strikes, ivFn) {
  const rows = [];
  for (const k of strikes) {
    for (const type of ['call', 'put']) {
      rows.push({ details: { contract_type: type, expiration_date: exp, strike_price: k }, implied_volatility: ivFn(k, type), last_quote: { last_updated: ns(chainDate) } });
    }
  }
  return rows;
}
const strikes = (lo, hi, step) => { const a = []; for (let k = lo; k <= hi + 1e-9; k += step) a.push(Math.round(k * 100) / 100); return a; };

test('분산(시간 가중) 보간 — VIX 꼴 · 평평하면 그대로 · 30일 정확히면 near', () => {
  assert.equal(iv30.interpIv30({ days: 28, iv: 0.2 }, { days: 35, iv: 0.2 }), 0.2);
  assert.equal(iv30.interpIv30({ days: 30, iv: 0.25 }, { days: 37, iv: 0.4 }), 0.25);
  // 23일 10% · 37일 30%: w1 = 7/14, w2 = 7/14 → σ² = (0.5·0.01·23 + 0.5·0.09·37)/30
  const want = Math.sqrt((0.5 * 0.01 * 23 + 0.5 * 0.09 * 37) / 30);
  assert.ok(Math.abs(iv30.interpIv30({ days: 23, iv: 0.1 }, { days: 37, iv: 0.3 }) - want) < 1e-12);
  // 한쪽만
  assert.equal(iv30.interpIv30(null, { days: 45, iv: 0.3 }), 0.3);
  assert.equal(iv30.interpIv30({ days: 21, iv: 0.22 }, null), 0.22);
  assert.equal(iv30.interpIv30(null, null), null);
});

test('괄호 고르기 — near = 30일 이하 최원, far = 30일 초과 최근, 1일 미만 버림', () => {
  const L = [3, 10, 28, 35, 63].map((d) => ({ exp: 'e' + d, days: d }));
  assert.deepEqual(iv30.pickBracket(L), { near: { exp: 'e28', days: 28 }, far: { exp: 'e35', days: 35 } });
  assert.deepEqual(iv30.pickBracket(L.slice(0, 3)).far, null);
  assert.deepEqual(iv30.pickBracket(L.slice(3)).near, null);
  assert.deepEqual(iv30.pickBracket([{ exp: 'z', days: 0 }, { exp: 'a', days: 31 }]), { near: null, far: { exp: 'a', days: 31 } });
});

test('ATM IV — 현재가를 사이에 둔 두 행사가 직선 보간 · 범위 밖·먼 행사가는 null(외삽 안 함)', () => {
  const sm = [[95, 0.3], [100, 0.2], [105, 0.25]];
  assert.ok(Math.abs(iv30.atmIvAt(sm, 102.5) - 0.225) < 1e-12);
  assert.equal(iv30.atmIvAt(sm, 100), 0.2);
  assert.equal(iv30.atmIvAt(sm, 106), null);
  assert.equal(iv30.atmIvAt([[80, 0.3], [120, 0.3]], 100), null); // 양쪽 20% 떨어짐
});

test('스마일 — 콜·풋 평균 · 한쪽만이면 그쪽 · ±band · IV 0/500%↑ 제외', () => {
  const rows = [
    { details: { contract_type: 'call', strike_price: 100 }, implied_volatility: 0.2 },
    { details: { contract_type: 'put', strike_price: 100 }, implied_volatility: 0.24 },
    { details: { contract_type: 'put', strike_price: 95 }, implied_volatility: 0.3 },
    { details: { contract_type: 'call', strike_price: 150 }, implied_volatility: 0.5 },
    { details: { contract_type: 'call', strike_price: 105 }, implied_volatility: 0 },
    { details: { contract_type: 'call', strike_price: 110 }, implied_volatility: 7 },
  ];
  assert.deepEqual(iv30.smileOf(rows, 100, 0.15), [[95, 0.3], [100, 0.22]]);
});

test('체인 날짜 = prices.date 최빈값', () => {
  const rows = [{ last_quote: { last_updated: ns('2026-10-02') } }, { last_quote: { last_updated: ns('2026-10-02') } }, { last_quote: { last_updated: ns('2026-10-01') } }, { last_quote: {} }];
  assert.equal(iv30.chainDateOf(rows), '2026-10-02');
  assert.equal(iv30.chainDateOf([]), null);
});

test('주간 만기 종목 — 받은 6만기 안에서 계산(추가 호출 0) · 일수는 «체인 날짜» 기준(주말 실행도 같은 값)', () => {
  const cd = '2026-10-02';
  const exps = ['2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13'];
  const flat = (iv) => () => iv;
  const opts = exps.flatMap((e, i) => chain(e, cd, strikes(90, 110, 2.5), flat(0.2 + i * 0.01)));
  const r = iv30.planIv30(opts, 101, null);
  assert.equal(r.src, 'chain');
  assert.equal(r.near, '2026-10-30'); assert.equal(r.nearDays, 28);
  assert.equal(r.far, '2026-11-06'); assert.equal(r.farDays, 35);
  const want = Math.sqrt(((5 / 7) * 0.23 * 0.23 * 28 + (2 / 7) * 0.24 * 0.24 * 35) / 30);
  assert.equal(r.iv30, Math.round(want * 10000) / 100);
  assert.deepEqual(iv30.rowFields(r), { iv30Def: 'cm30-v1', iv30: r.iv30, iv30Date: cd, iv30Near: '2026-10-30', iv30Far: '2026-11-06' });
});

test('매일 만기 종목 — 6만기가 30일 못 닿으면 GEX 단계는 호출 없이 «보강 필요» · 같은 날짜 캐시면 캐시로 · 날짜 지난 캐시는 다시', async () => {
  const cd = '2026-10-02';
  const daily = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12'];
  const opts = daily.flatMap((e) => chain(e, cd, strikes(760, 780, 1), () => 0.08));
  const r0 = iv30.planIv30(opts, 769.76, null);
  assert.equal(r0.iv30, null); assert.equal(r0.need, 'refresh'); assert.equal(r0.reason, 'cache-miss'); assert.equal(r0.chainDate, cd);

  // 실행 끝 보강 — 만기 목록 1 + 두 만기 2 = 3회
  const calls = [];
  const all = [...daily, '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-06', '2026-12-18'];
  const b = await iv30.refreshBracket({
    ticker: 'SPY', chainDate: cd, spot: 769.76,
    fetchExpirations: async (t, after) => { calls.push(['exp', t, after]); return all; },
    fetchChain: async (t, e) => { calls.push(['chain', t, e]); return chain(e, cd, strikes(650, 890, 5), () => (e === '2026-10-30' ? 0.125 : 0.135)); },
  });
  assert.equal(b.calls, 3); assert.equal(calls.length, 3);
  assert.deepEqual(calls.filter((c) => c[0] === 'chain').map((c) => c[2]), ['2026-10-30', '2026-11-02']);
  assert.equal(b.cache.d, cd); assert.equal(b.cache.n.t, 28); assert.equal(b.cache.f.t, 31);
  assert.ok(b.cache.n.s.every(([k]) => k >= 769.76 * 0.85 && k <= 769.76 * 1.15)); // ±15% 만 캐시

  const r1 = iv30.planIv30(opts, 772.1, b.cache); // 장중 현재가가 움직여도 같은 캐시로
  assert.equal(r1.src, 'cache'); assert.ok(r1.iv30 > 12.5 && r1.iv30 < 13.5);
  const stale = { ...b.cache, d: '2026-10-01' };
  assert.equal(iv30.planIv30(opts, 772.1, stale).reason, 'cache-stale');
  assert.equal(iv30.planIv30(opts, 772.1, { ...b.cache, def: 'cm30-v0' }).need, 'refresh'); // 정의가 다르면 다시
});

test('휴장 사이(성탄 연휴) — 일수는 달력일: 12/24 체인 → 1/22(29일)·1/29(36일)', () => {
  const cd = '2026-12-24';
  const exps = ['2026-12-31', '2027-01-08', '2027-01-15', '2027-01-22', '2027-01-29', '2027-02-05'];
  const opts = exps.flatMap((e) => chain(e, cd, strikes(95, 105, 1), () => 0.3));
  const r = iv30.planIv30(opts, 100, null);
  assert.equal(r.nearDays, 29); assert.equal(r.farDays, 36); assert.equal(r.iv30, 30);
});

test('만기가 한쪽뿐 — 월물만 있고 첫 만기가 45일이면 그 값(평평) · 30일 이하뿐이어도 그 값', async () => {
  const cd = '2026-10-02';
  const b = await iv30.refreshBracket({ ticker: 'X', chainDate: cd, spot: 50,
    fetchExpirations: async () => ['2026-11-16', '2026-12-21'], fetchChain: async (t, e) => chain(e, cd, strikes(40, 60, 2.5), () => 0.42) });
  assert.equal(b.cache.n, null); assert.equal(b.cache.f.t, 45); assert.equal(b.calls, 2);
  const r = iv30.fromBracket(null, { exp: b.cache.f.e, days: b.cache.f.t, smile: b.cache.f.s }, 50, cd, 'refresh');
  assert.equal(r.iv30, 42);
  const r2 = iv30.fromBracket({ exp: 'a', days: 21, smile: [[49, 0.3], [51, 0.3]] }, null, 50, cd, 'refresh');
  assert.equal(r2.iv30, 30);
});

test('섞지 않는다 — near 가 있는데 ATM 을 못 재면 null · 보강 중 원천 날짜가 바뀌면 버림', async () => {
  const r = iv30.fromBracket({ exp: 'a', days: 28, smile: [[10, 0.3]] }, { exp: 'b', days: 35, smile: [[99, 0.3], [101, 0.3]] }, 100, '2026-10-02', 'chain');
  assert.equal(r.iv30, null); assert.equal(r.reason, 'atm-missing');
  const b = await iv30.refreshBracket({ ticker: 'SPY', chainDate: '2026-10-02', spot: 100,
    fetchExpirations: async () => ['2026-10-30', '2026-11-06'], fetchChain: async (t, e) => chain(e, '2026-10-05', strikes(90, 110, 1), () => 0.2) });
  assert.equal(b.cache, null); assert.equal(b.reason, 'chain-date-mismatch');
  assert.deepEqual(iv30.rowFields({ iv30: null, reason: 'x' }), { iv30Def: 'cm30-v1' }); // 값이 없어도 표식은 남긴다
});
