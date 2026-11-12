import assert from 'node:assert/strict';

// [11/13] 정규장 실적 만기 «live 우선» — readImpliedMoveRows(after) 수집기 체인 경로.
//   사고: 11/12 NVDA 11/18 만기 23:36 KST live ±11.6% → 23:42 이후 전일 마감 ±9.3%·현물 173.73(실제 약 149).
//   ① 정규장 + 실적 만기(11/18) ≠ 구조 주간(11/13) + 양쪽 마감 호가 체인 → live 우선(예전: strict 전일 EOD 먼저 확정)
//   ② live 무효(현물·다리 패리티 어긋남 / 호가 시각 낡음) → EOD 폴백(strict 또는 저장 관측) — 같은 체인의 legacy live 로 되돌아가지 않음
//   ③ 한 다리라도 실시간 표식 없음 → 후보 없음 → 예전 순서(strict EOD) 그대로
//   ④ 장외(마감 뒤·주말) → EOD 유지(예전 그대로)
//   ⑤ after 미지정(일반 경로) → 구조 주간 값 그대로
//   모든 경우 공급사 호출 0 · Redis 쓰기 0.
// 실행: node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/earningsRegularLiveFirst.test.ts

process.env.EC2_REDIS_PROXY_KEY = 'test-proxy';
process.env.FMP_API_KEY = 'test-fmp';
process.env.FINNHUB_API_KEY = 'test-finnhub';
const store = new Map<string, unknown>();
let writes = 0;
let vendor = 0;
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = new URL(url);
  if (u.pathname === '/get') return Response.json({ result: store.get(u.searchParams.get('key') || '') ?? null });
  if (u.pathname === '/mget') {
    const keys = (u.searchParams.get('keys') || '').split(',').filter(Boolean).map(decodeURIComponent);
    return Response.json({ results: keys.map((k) => store.get(k) ?? null) });
  }
  if (u.pathname === '/set' && init?.method === 'POST') { writes++; return Response.json({ ok: true }); }
  vendor++;
  return new Response('not found', { status: 404 });
};

const IMS = require('../src/services/impliedMoveService') as typeof import('../src/services/impliedMoveService');
const RC = require('../src/services/redisClient') as typeof import('../src/services/redisClient');
const EI = require('../src/lib/earnings/earningsImplied') as typeof import('../src/lib/earnings/earningsImplied');
const IM = require('../src/lib/impliedMove') as typeof import('../src/lib/impliedMove');

const ms = (iso: string) => Date.parse(iso);
const at = async <T,>(iso: string, fn: () => Promise<T>): Promise<T> => {
  const real = Date.now; const v = ms(iso); Date.now = () => v;
  try { return await fn(); } finally { Date.now = real; }
};

// 2026-11-12(목) 10:00 ET = 15:00Z (서머타임 종료 뒤 UTC−5)
const REG = '2026-11-12T15:00:00Z';
const PREV = '2026-11-11';
const WEEKLY = '2026-11-13';
const EARN = '2026-11-18';
const AFTER = '2026-11-17';

type Leg = { live?: number | null; bid: number; ask: number; obsAt?: string | null };
/** 실시간 다리의 계약별 수신 시각(ivObservedAt) — 기본 = 지금 1분 전(seed 가 정함) */
let legObsAt: string | null = null;
/** 직접 경로(vercel-ondemand) 원본 행 — 마감 호가(bid/ask)·EOD 날짜·계약별 출처 표식 */
function fullRow(expiry: string, strike: number, type: 'call' | 'put', leg: Leg) {
  const mark = Math.round((leg.bid + leg.ask) / 2 * 100) / 100;
  const live = leg.live != null && leg.live > 0;
  return {
    details: { expiration_date: expiry, strike_price: strike, contract_type: type },
    day: { vwap: mark, close: mark },
    last_quote: { bid: leg.bid, ask: leg.ask, midpoint: live ? leg.live : mark },
    _intrinio: { date: PREV, eod: { mark } },
    _rtGreeks: live,
    _quoteSource: live ? 'live' : 'eod',
    ivObservedAt: live ? (leg.obsAt !== undefined ? leg.obsAt : legObsAt) : null,
  };
}
/** 수집기 슬림 행 — midpoint·출처 표식만(호가 칸 없음) */
function slimRow(expiry: string, strike: number, type: 'call' | 'put', leg: Leg) {
  const mark = Math.round((leg.bid + leg.ask) / 2 * 100) / 100;
  const live = leg.live != null && leg.live > 0;
  return {
    details: { expiration_date: expiry, strike_price: strike, contract_type: type },
    _quoteSource: live ? 'live' : 'eod',
    ivObservedAt: live ? (leg.obsAt !== undefined ? leg.obsAt : legObsAt) : null,
    day: { close: mark },
    last_quote: { midpoint: live ? leg.live : mark },
  };
}

// 11/18 만기 — 실시간 FMV 는 현물 약 149(오늘), 마감 호가는 11/11 종가 173.73 기준
const earnLegs: Array<[number, Leg, Leg]> = [
  // strike, call, put
  [145, { live: 10.6, bid: 28.4, ask: 29.0 }, { live: 6.5, bid: 0.30, ask: 0.36 }],
  [150, { live: 8.2, bid: 24.0, ask: 24.6 }, { live: 9.1, bid: 0.52, ask: 0.60 }],
  [155, { live: 6.1, bid: 19.8, ask: 20.4 }, { live: 12.1, bid: 0.95, ask: 1.05 }],
  [170, { live: 1.9, bid: 9.9, ask: 10.3 }, { live: 22.6, bid: 6.2, ask: 6.5 }],
  [172.5, { live: 1.5, bid: 8.4, ask: 8.6 }, { live: 24.6, bid: 7.52, ask: 7.72 }],
  [175, { live: 1.2, bid: 7.2, ask: 7.4 }, { live: 26.9, bid: 8.8, ask: 9.1 }],
];
// 구조 주간(11/13) 만기 — 구조 값과 같은 체인(일반 경로용)
const weeklyLegs: Array<[number, Leg, Leg]> = [
  [150, { live: 5.6, bid: 23.6, ask: 24.2 }, { live: 6.4, bid: 0.2, ask: 0.26 }],
];

function chainRows(kind: 'full' | 'slim', mutate?: (strike: number, type: 'call' | 'put', leg: Leg) => Leg) {
  const mk = kind === 'full' ? fullRow : slimRow;
  const out: any[] = [];
  for (const [exp, legs] of [[WEEKLY, weeklyLegs], [EARN, earnLegs]] as const) {
    for (const [k, c, p] of legs) {
      out.push(mk(exp, k, 'call', mutate && exp === EARN ? mutate(k, 'call', c) : c));
      out.push(mk(exp, k, 'put', mutate && exp === EARN ? mutate(k, 'put', p) : p));
    }
  }
  return out;
}

const weeklyIm = {
  def: IM.IMPLIED_MOVE_DEF, pct: 8.1, straddle: 12, strike: 150, expiry: WEEKLY, callPrice: 5.6, putPrice: 6.4,
  spot: 149, basis: 'live' as const, asOf: ms(REG) - 60_000, chainDate: PREV, session: '2026-11-12',
};
// 배경 묶음이 저장한 «마감 관측»(11/11 EOD · 첫 만기 11/18) — 운영 응답의 ±9.3%·173.73·172.5·16.12 그대로
const closingObs = {
  def: IM.IMPLIED_MOVE_DEF, pct: 9.3, straddle: 16.12, strike: 172.5, expiry: EARN, callPrice: 8.5, putPrice: 7.62,
  spot: 173.73, basis: 'eod' as const, asOf: null, chainDate: PREV, session: PREV, method: 'weekly' as const,
};

function seed(opts: { kind: 'full' | 'slim'; spot?: number; probeAgeMs?: number; mutate?: (strike: number, type: 'call' | 'put', leg: Leg) => Leg; obs?: boolean; now?: string }) {
  store.clear();
  RC._resetEcBreakerForTest();
  IMS._resetImpliedPackMemoForTest();
  const now = ms(opts.now ?? REG);
  legObsAt = new Date(now - 60_000).toISOString();
  store.set('structure:v2:NVDA', { data: {
    ticker: 'NVDA', options_status: 'OK', expiration: WEEKLY, availableExpirations: [WEEKLY, EARN, '2026-11-20'],
    chainDate: PREV, underlyingPrice: opts.spot ?? 149, prevClose: 173.73, session: 'REG', impliedMove: weeklyIm,
    structure: { strikes: [150], callsOI: [1], putsOI: [1] },
  }, timestamp: now - 30_000 });
  // readEodCloses 는 프로세스 안에서 5분 기억한다 — 모든 시나리오 종목을 한 스냅샷에 둔다
  store.set('intrinio:eod:snapshot', { date: PREV, rows: [['NVDA', 0, 0, 0, 173.73, 0, 0, 0], ['MONO', 0, 0, 0, 173.73, 0, 0, 0]] });
  store.set('polygon:snapshot:probe:NVDA', {
    greeksSource: 'realtime', _ts: now - (opts.probeAgeMs ?? 60_000), chainDate: PREV,
    chainDates: { [WEEKLY]: PREV, [EARN]: PREV }, weeklyExpiry: WEEKLY,
    expirations: [WEEKLY, EARN, '2026-11-20'], expirationsMissing: [],
    exactResults: [], probeResults: chainRows(opts.kind, opts.mutate),
    _source: opts.kind === 'full' ? 'vercel-ondemand' : 'lambda-flow-harvest',
  });
  if (opts.obs !== false) store.set(EI.earningsObservationKey('NVDA', AFTER, false), { im: closingObs, checkedAt: now - 10 * 60_000, first: EARN });
}

const readEarn = (iso = REG) => at(iso, () => IMS.readImpliedMoveRows([{ ticker: 'NVDA', after: AFTER, timing: 'unknown' }], iso.slice(0, 10)));

(async () => {
  let n = 0;
  const ok = (name: string) => { n++; console.log(`  ✓ ${name}`); };

  // ① 정규장 · 실적 만기 ≠ 주간 · 직접 경로 원본(양쪽 마감 호가 + 같은 세션 종가 → strict 가 가능한 체인)
  seed({ kind: 'full' });
  let [r] = await readEarn();
  assert.equal(r.basis, 'live', `REG must prefer live — got ${r.basis} ${r.impliedMovePct}`);
  assert.equal(r.expiry, EARN);
  assert.equal(r.session, '2026-11-12');
  assert.equal(r.strike, 150);
  assert.equal(r.spot, 149);
  assert.equal(r.impliedMovePct, 11.6, `live 8.2+9.1=17.3/149 → 11.6 — got ${r.impliedMovePct}`);
  assert.equal(r.source, 'probe');
  ok('① REG + earnings expiry ≠ weekly (full chain, strict EOD available) → live 11.6 wins (was EOD 9.3 @173.73)');

  // ① 슬림 체인(수집기) — 같은 결과(관측 EOD 가 이기지 않음)
  seed({ kind: 'slim' });
  [r] = await readEarn();
  assert.equal(r.basis, 'live'); assert.equal(r.impliedMovePct, 11.6); assert.equal(r.spot, 149);
  ok('① slim collector chain in REG → same live 11.6 (stored prior-close observation does not win)');

  // ② live 무효 — 구조 현물이 전일 값(173.73)인데 다리는 오늘 호가 → 패리티 어긋남 → strict EOD(종가 분모·종가 ATM)
  seed({ kind: 'full', spot: 173.73 });
  [r] = await readEarn();
  assert.equal(r.basis, 'eod', `stale spot + live legs must not ship a mixed live value — got ${r.basis} ${r.impliedMovePct}`);
  assert.equal(r.session, PREV); assert.equal(r.spot, 173.73); assert.equal(r.strike, 172.5); assert.equal(r.impliedMovePct, 9.3);
  ok('② live parity fails (stale spot) → EOD fallback 9.3 @172.5/173.73 (consistent same-session strike & denominator)');

  // ② 슬림 체인 + 같은 무효 → legacy live(혼합 14.0)로 되돌아가지 않고 저장 관측 EOD
  seed({ kind: 'slim', spot: 173.73 });
  [r] = await readEarn();
  assert.equal(r.basis, 'eod', `slim + rejected live must fall back to EOD, not legacy live — got ${r.basis} ${r.impliedMovePct}`);
  assert.equal(r.impliedMovePct, 9.3); assert.equal(r.spot, 173.73);
  ok('② slim chain + rejected live → stored closing observation (EOD 9.3), not the mixed legacy live 14.0');

  // ② 슬림 + 무효 + 관측 없음 → 값 없음(지어내지 않음)
  seed({ kind: 'slim', spot: 173.73, obs: false });
  [r] = await readEarn();
  assert.equal(r.impliedMovePct, null, `no valid live and no EOD → null — got ${r.impliedMovePct}`);
  ok('② slim + rejected live + no observation → null («—»), nothing invented');

  // ② 호가 시각 낡음(20분) → 무효 → strict EOD
  seed({ kind: 'full', probeAgeMs: 20 * 60_000 });
  [r] = await readEarn();
  assert.equal(r.basis, 'eod'); assert.equal(r.impliedMovePct, 9.3);
  ok('② quotes older than 15 min → EOD fallback');

  // ③ ATM 근처 풋 다리들에 실시간 표식 없음(_quoteSource eod) → 후보 없음 → 예전 순서(strict EOD)
  seed({ kind: 'full', mutate: (k, t, leg) => (t === 'put' && k <= 155 ? { ...leg, live: null } : leg) });
  [r] = await readEarn();
  assert.equal(r.basis, 'eod'); assert.equal(r.impliedMovePct, 9.3);
  ok('③ legs without per-contract live flag → no live candidate → strict EOD as before');

  // ④ 장외(마감 뒤 17:00 ET) — 예전 그대로 EOD
  seed({ kind: 'full', now: '2026-11-12T22:00:00Z' });
  [r] = await readEarn('2026-11-12T22:00:00Z');
  assert.equal(r.basis, 'eod', `after close stays EOD — got ${r.basis}`);
  assert.equal(r.impliedMovePct, 9.3); assert.equal(r.session, PREV);
  ok('④ after close → EOD kept (unchanged)');
  // ④ 프리마켓(다음 날 08:00 ET) — 예전 그대로 EOD
  seed({ kind: 'full', now: '2026-11-13T13:00:00Z' });
  [r] = await readEarn('2026-11-13T13:00:00Z');
  assert.equal(r.basis, 'eod'); assert.equal(r.impliedMovePct, 9.3);
  ok('④ premarket → EOD kept (unchanged)');

  // ⑤ after 미지정(일반 경로) — 구조 주간 값 그대로
  seed({ kind: 'full' });
  const [g] = await at(REG, () => IMS.readImpliedMoveRows([{ ticker: 'NVDA' }], '2026-11-12'));
  assert.equal(g.source, 'structure'); assert.equal(g.expiry, WEEKLY); assert.equal(g.impliedMovePct, 8.1); assert.equal(g.basis, 'live');
  ok('⑤ after unspecified → structure weekly value unchanged');
  // ⑤ 실적 첫 만기 = 구조 주간 → 구조 값 그대로(이 수리 경로를 타지 않음)
  const [w] = await at(REG, () => IMS.readImpliedMoveRows([{ ticker: 'NVDA', after: '2026-11-12', timing: 'unknown' }], '2026-11-12'));
  assert.equal(w.source, 'structure'); assert.equal(w.expiry, WEEKLY); assert.equal(w.impliedMovePct, 8.1);
  ok('⑤ earnings first expiry == weekly → structure value unchanged');

  // ② 체인 저장 시각(_ts)은 신선한데 고른 다리의 실시간 수신 시각(ivObservedAt)이 20분 전 → 무효 → EOD (관문 11130756 ①)
  seed({ kind: 'full', mutate: (k, _t, leg) => (k === 150 ? { ...leg, obsAt: new Date(ms(REG) - 20 * 60_000).toISOString() } : leg) });
  [r] = await readEarn();
  assert.equal(r.basis, 'eod', `stale per-leg live observation must not pass — got ${r.basis} ${r.impliedMovePct}`);
  assert.equal(r.impliedMovePct, 9.3);
  ok('② per-leg ivObservedAt 20 min old (chain _ts fresh) → EOD fallback');
  // ① 다리별 수신 시각이 없는 옛 행(필드 없음) → 체인 시각으로 판정 → live
  seed({ kind: 'full', mutate: (_k, _t, leg) => ({ ...leg, obsAt: null }) });
  [r] = await readEarn();
  assert.equal(r.basis, 'live'); assert.equal(r.impliedMovePct, 11.6);
  ok('① rows without per-leg observation time → chain _ts rule → live');

  // ⑥ 주간물 없는 종목(월물만) — 저장 관측이 이벤트 분리값이면 정의가 다르다 → live 후보를 만들지 않고 예전 그대로(관문 11130756 ②)
  {
    store.clear(); RC._resetEcBreakerForTest(); IMS._resetImpliedPackMemoForTest();
    const now = ms(REG);
    legObsAt = new Date(now - 60_000).toISOString();
    const M1 = '2026-11-20', M2 = '2026-12-18';
    store.set('structure:v2:MONO', { data: { ticker: 'MONO', options_status: 'OK', expiration: M1, availableExpirations: [M1, M2],
      chainDate: PREV, underlyingPrice: 149, prevClose: 173.73, session: 'REG', impliedMove: null, structure: { strikes: [150], callsOI: [1], putsOI: [1] } }, timestamp: now - 30_000 });
    store.set('intrinio:eod:snapshot', { date: PREV, rows: [['NVDA', 0, 0, 0, 173.73, 0, 0, 0], ['MONO', 0, 0, 0, 173.73, 0, 0, 0]] });
    const rows: any[] = [];
    for (const [k, c, p] of earnLegs) { rows.push(fullRow(M1, k, 'call', c), fullRow(M1, k, 'put', p)); }
    store.set('polygon:snapshot:probe:MONO', { greeksSource: 'realtime', _ts: now - 60_000, chainDate: PREV, chainDates: { [M1]: PREV, [M2]: PREV },
      weeklyExpiry: M1, expirations: [M1, M2], expirationsMissing: [], exactResults: [], probeResults: rows });
    store.set(EI.earningsObservationKey('MONO', AFTER, false), { im: { ...closingObs, expiry: M1, method: 'event-split', eventMovePct: 6.2 }, checkedAt: now - 600_000, first: M1 });
    const [m] = await at(REG, () => IMS.readImpliedMoveRows([{ ticker: 'MONO', after: AFTER, timing: 'unknown' }], '2026-11-12'));
    assert.equal(m.method, 'event-split', `monthly-only event-split must stay — got ${m.method} ${m.basis} ${m.impliedMovePct}`);
    assert.equal(m.impliedMovePct, 6.2); assert.equal(m.basis, 'eod');
    ok('⑥ monthly-only ticker: event-split observation kept (no live straddle substitution)');
  }

  assert.equal(vendor, 0, `supplier calls must be 0 — got ${vendor}`);
  assert.equal(writes, 0, `Redis writes must be 0 — got ${writes}`);
  ok('supplier calls 0 · Redis writes 0 across all scenarios');
  console.log(`earningsRegularLiveFirst: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
