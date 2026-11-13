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

function seed(opts: { kind: 'full' | 'slim'; spot?: number; probeAgeMs?: number; structureAgeMs?: number; structureSession?: string; prevClose?: number; mutate?: (strike: number, type: 'call' | 'put', leg: Leg) => Leg; obs?: boolean; now?: string }) {
  store.clear();
  RC._resetEcBreakerForTest();
  IMS._resetImpliedPackMemoForTest();
  const now = ms(opts.now ?? REG);
  legObsAt = new Date(now - 60_000).toISOString();
  store.set('structure:v2:NVDA', { data: {
    ticker: 'NVDA', options_status: 'OK', expiration: WEEKLY, availableExpirations: [WEEKLY, EARN, '2026-11-20'],
    chainDate: PREV, underlyingPrice: opts.spot ?? 149, prevClose: opts.prevClose ?? 173.73, session: opts.structureSession ?? 'REG', impliedMove: weeklyIm,
    structure: { strikes: [150], callsOI: [1], putsOI: [1] },
  }, timestamp: now - (opts.structureAgeMs ?? 30_000) });
  // readEodCloses 는 프로세스 안에서 5분 기억한다 — 모든 시나리오 종목을 한 스냅샷에 둔다
  store.set('intrinio:eod:snapshot', { date: PREV, rows: [['NVDA', 0, 0, 0, 173.73, 0, 0, 0], ['MONO', 0, 0, 0, 173.73, 0, 0, 0], ['ATMX', 0, 0, 0, 100, 0, 0, 0]] });
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
  ok('② slim chain + rejected live → stored closing observation (EOD 9.3), not the mixed legacy live 15.0');

  // ② 슬림 + 무효 + EOD 관측 없음 → main 과 같은 결과(기존 legacy live 15.0 — 이 수리가 새로 만들거나 지우지 않는다 · 관문 11130808 ③)
  seed({ kind: 'slim', spot: 173.73, obs: false });
  [r] = await readEarn();
  assert.equal(r.basis, 'live'); assert.equal(r.impliedMovePct, 15.0, `same as origin/main legacy — got ${r.impliedMovePct}`);
  ok('② slim + rejected live + no EOD observation → unchanged origin/main result (legacy live 15.0)');

  // ② 개장 1분 뒤(09:31 ET) · 체인 저장 09:30 · 다리 수신 09:20(장전) → «지금 live» 아님 → EOD (관문 11130808 ①)
  {
    const T931 = '2026-11-12T14:31:00Z';
    seed({ kind: 'full', now: T931, mutate: (_k, _t, leg) => ({ ...leg, obsAt: '2026-11-12T14:20:00Z' }) });
    [r] = await readEarn(T931);
    assert.equal(r.basis, 'eod', `pre-open leg receipt must not ship as live — got ${r.basis} ${r.impliedMovePct}`);
    assert.equal(r.impliedMovePct, 9.3);
    ok('② legs received before the open (09:20 ET) → EOD fallback');
  }
  // ② 현물(구조 저장 12분 전)과 다리 수신(1분 전) 시각 차 11분 > 6분 → EOD (관문 11130808 ②)
  seed({ kind: 'full', structureAgeMs: 12 * 60_000 });
  [r] = await readEarn();
  assert.equal(r.basis, 'eod', `spot/leg time skew must reject — got ${r.basis} ${r.impliedMovePct}`);
  assert.equal(r.impliedMovePct, 9.3);
  ok('② structure spot 12 min old vs legs 1 min → skew > 6 min → EOD fallback');
  // ② 관문 11130824 반례 — 만기 36일(12/18)·실제 할인율 5.5%·저장 현물 150.59(실제 150)·C+P=60: 금리 근사 불확실성까지 더하면 증명 못 함
  //   → 새 분기는 후보를 만들지 않고 예전 순서(직접 경로 원본 = strict EOD)
  {
    const EXP2 = '2026-12-18';
    seed({ kind: 'full', spot: 150.59, obs: false });
    const pc: any = store.get('polygon:snapshot:probe:NVDA');
    const legs: Array<[number, Leg, Leg]> = [
      [150, { live: 30.41, bid: 40, ask: 41 }, { live: 29.59, bid: 15, ask: 16 }],
      [172.5, { live: 20, bid: 30.0, ask: 30.4 }, { live: 42, bid: 26.0, ask: 26.4 }],
    ];
    const rows: any[] = [];
    for (const [k, c, p] of legs) rows.push(fullRow(EXP2, k, 'call', c), fullRow(EXP2, k, 'put', p));
    store.set('polygon:snapshot:probe:NVDA', { ...pc, expirations: [WEEKLY, EXP2], chainDates: { ...pc.chainDates, [EXP2]: PREV }, probeResults: [...pc.probeResults, ...rows] });
    const [x] = await at(REG, () => IMS.readImpliedMoveRows([{ ticker: 'NVDA', after: '2026-12-14', timing: 'unknown' }], '2026-11-12'));
    assert.equal(x.expiry, EXP2);
    assert.equal(x.basis, 'eod', `rate-approx uncertainty must not pass as proven live — got ${x.basis} ${x.impliedMovePct}`);
    assert.equal(x.impliedMovePct, 32.5);
    ok('② gate 11130824: 36-day expiry, rate uncertainty consumes the budget → not a candidate → strict EOD as before');
  }
  // ② 관문 11130827 반례 — 저장 현물 100.1·실제 99.9·행사가 99/101: 증명된 현물 오차 범위가 중간점(100)을 넘어 ATM 이 바뀔 수 있다
  //   → 후보 아님 → 예전 순서(직접 경로 원본 = strict EOD 99 행사가)
  {
    const now = ms(REG);
    store.set('structure:v2:ATMX', { data: { ticker: 'ATMX', options_status: 'OK', expiration: WEEKLY, availableExpirations: [WEEKLY, EARN],
      chainDate: PREV, underlyingPrice: 100.1, prevClose: 100, session: 'REG', impliedMove: null, structure: { strikes: [100], callsOI: [1], putsOI: [1] } }, timestamp: now - 30_000 });
    const legs: Array<[number, Leg, Leg]> = [
      [99, { live: 5.484, bid: 2.9, ask: 3.1 }, { live: 4.516, bid: 2.0, ask: 2.2 }],
      [101, { live: 5.2345, bid: 2.0, ask: 2.2 }, { live: 6.2655, bid: 3.0, ask: 3.2 }],
    ];
    const rows: any[] = [];
    for (const [k, c, p] of legs) rows.push(fullRow(EARN, k, 'call', c), fullRow(EARN, k, 'put', p));
    store.set('polygon:snapshot:probe:ATMX', { greeksSource: 'realtime', _ts: now - 60_000, chainDate: PREV, chainDates: { [WEEKLY]: PREV, [EARN]: PREV },
      weeklyExpiry: WEEKLY, expirations: [WEEKLY, EARN], expirationsMissing: [], exactResults: [], probeResults: rows });
    const [x] = await at(REG, () => IMS.readImpliedMoveRows([{ ticker: 'ATMX', after: AFTER, timing: 'unknown' }], '2026-11-12'));
    assert.ok(!(x.basis === 'live' && x.strike === 101), `ambiguous ATM must not ship live @101 — got ${x.basis} ${x.strike} ${x.impliedMovePct}`);
    assert.equal(x.basis, 'eod'); assert.equal(x.strike, 99); assert.equal(x.impliedMovePct, 5.1);
    ok('② gate 11130827: spot error range crosses the 99/101 midpoint → not a candidate → strict EOD @99');
  }
  // ② 관문 11130829 경계 — 분모가 작아지는 쪽 오차도 정확히: 허용치(0.001·S²/스트래들)는 통과해도 정확 오차 > 0.1%p 면 후보 아님.
  //   구조 만기 목록에 실적 만기를 빼 legacy(예전 규칙)가 값을 못 내게 해, 새 분기만 값을 낼 수 있는 상황으로 만든다(예전 결과 = null).
  {
    const now = ms(REG);
    const T = (Date.parse(`${EARN}T21:00:00Z`) - now) / (365 * 86400_000);
    const S = 150, K = 150, sum = 30;
    const tol = 0.001 * S * S / sum;                       // 0.75
    const spotErr = 0.999 * tol;                           // 허용치 바로 안
    const Strue = S - (spotErr - K * T * 0.02);            // gap = spotErr − 금리 여유
    const diff = Strue - K * Math.exp(-0.04 * T);
    const legs: Array<[number, Leg, Leg]> = [[K, { live: (sum + diff) / 2, bid: 9, ask: 9.4 }, { live: (sum - diff) / 2, bid: 5, ask: 5.4 }]];
    const rows: any[] = [];
    for (const [k, c, p] of legs) rows.push(fullRow(EARN, k, 'call', c), fullRow(EARN, k, 'put', p));
    store.set('structure:v2:ATMX', { data: { ticker: 'ATMX', options_status: 'OK', expiration: WEEKLY, availableExpirations: [WEEKLY],
      chainDate: PREV, underlyingPrice: S, prevClose: 100, session: 'REG', impliedMove: null, structure: { strikes: [150], callsOI: [1], putsOI: [1] } }, timestamp: now - 30_000 });
    store.set('polygon:snapshot:probe:ATMX', { greeksSource: 'realtime', _ts: now - 60_000, chainDate: PREV, chainDates: { [WEEKLY]: PREV, [EARN]: PREV },
      weeklyExpiry: WEEKLY, expirations: [WEEKLY, EARN], expirationsMissing: [], exactResults: [], probeResults: rows });
    const [x] = await at(REG, () => IMS.readImpliedMoveRows([{ ticker: 'ATMX', after: AFTER, timing: 'unknown' }], '2026-11-12'));
    const exactPp = 100 * sum * spotErr / (S * (S - spotErr));
    assert.ok(exactPp > 0.1, `fixture: exact error must exceed the budget — ${exactPp}`);
    assert.equal(x.impliedMovePct, null, `edge beyond 0.1pp must not ship (origin/main = null here) — got ${x.basis} ${x.impliedMovePct}`);
    // 같은 체인에서 현물을 실제 값으로 두면 증명 → live
    store.set('structure:v2:ATMX', { data: { ...(store.get('structure:v2:ATMX') as any).data, underlyingPrice: Math.round(Strue * 100) / 100 }, timestamp: now - 30_000 });
    const [y] = await at(REG, () => IMS.readImpliedMoveRows([{ ticker: 'ATMX', after: AFTER, timing: 'unknown' }], '2026-11-12'));
    assert.equal(y.basis, 'live', `true spot → proven live — got ${y.basis} ${y.impliedMovePct}`);
    ok(`② gate 11130829: exact error ${exactPp.toFixed(4)}pp > 0.1 → no value (= origin/main) · true spot → live ${y.impliedMovePct}`);
  }
  // ③ 구조 현물이 «전일 종가 대체»(현물 = prevClose — 체결 없음)·정규장 밖에서 계산된 구조 → 현물 시각 근거 없음 → 예전 순서(strict EOD) (관문 11130811)
  seed({ kind: 'full', prevClose: 149 });
  [r] = await readEarn();
  assert.equal(r.basis, 'eod', `spot equal to prior close is not a current spot — got ${r.basis}`); assert.equal(r.impliedMovePct, 9.3);
  seed({ kind: 'full', structureSession: 'PRE' });
  [r] = await readEarn();
  assert.equal(r.basis, 'eod', `structure not computed in REG — got ${r.basis}`); assert.equal(r.impliedMovePct, 9.3);
  ok('③ structure spot = prior close fill or non-REG structure → not a live-first candidate → strict EOD as before');
  // ② 현물이 1.5% 어긋남(구조가 장전 체결가 146.8 을 정규장 현재가로 저장 — 저장 시각·세션은 정상) → 패리티 탈락 → EOD (관문 11130817)
  seed({ kind: 'full', spot: 146.8 });
  [r] = await readEarn();
  assert.equal(r.basis, 'eod', `spot 1.5% off the legs must be rejected — got ${r.basis} ${r.impliedMovePct}`); assert.equal(r.impliedMovePct, 9.3);
  // 현물 0.2% 차(148.7)는 패리티 안 — 예상폭 영향 0.02%p(표시 반올림 안)
  seed({ kind: 'full', spot: 148.7 });
  [r] = await readEarn();
  assert.equal(r.basis, 'live'); assert.equal(r.impliedMovePct, 11.6);
  ok('② parity: spot 1.5% off → EOD fallback · 0.2% off → live (error below display rounding)');
  // ② 관문 11130820 반례 — 큰 예상폭(±26%대)에서 현물 1.3% 어긋남(실제 150 · 저장 151.9 · K150 · C20.05·P19.95) → 0.4%p 오차 → 탈락
  {
    const big: Array<[number, Leg, Leg]> = [[150, { live: 20.05, bid: 40, ask: 41 }, { live: 19.95, bid: 1, ask: 1.2 }], [155, { live: 17.6, bid: 36, ask: 37 }, { live: 22.5, bid: 2, ask: 2.2 }]];
    const saved = earnLegs.splice(0, earnLegs.length, ...big);
    seed({ kind: 'slim', spot: 151.9 });
    [r] = await readEarn();
    assert.ok(!(r.basis === 'live' && r.impliedMovePct === 26.3), `0.4pp-off live must not pass — got ${r.basis} ${r.impliedMovePct}`);
    assert.equal(r.basis, 'eod'); assert.equal(r.impliedMovePct, 9.3);
    seed({ kind: 'slim', spot: 150 });
    [r] = await readEarn();
    assert.equal(r.basis, 'live'); assert.equal(r.impliedMovePct, 26.7);
    earnLegs.splice(0, earnLegs.length, ...saved);
    ok('② gate 11130820: ±26% straddle with spot 1.3% off → EOD observation · true spot → live 26.7');
  }

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
  // ③ 다리별 수신 시각이 없는 행(실시간 FMV 는 있으나 IV 없음 → ivObservedAt null) → live 를 증명 못 함 → 예전 순서(strict EOD) (관문 11130803)
  seed({ kind: 'full', mutate: (k, t, leg) => (k === 150 && t === 'put' ? { ...leg, obsAt: null } : leg) });
  [r] = await readEarn();
  assert.equal(r.basis, 'eod', `leg without receipt time must not ship as live — got ${r.basis} ${r.impliedMovePct}`);
  assert.equal(r.impliedMovePct, 9.3);
  ok('③ one ATM leg without per-leg receipt time → not a live-first candidate → strict EOD as before');

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

  // ⑦ [11/14] 11/13 장중 실측 재현(23:37 KST = 09:37 ET, 운영 vs 미리보기 measure-2337) — 실제 1분봉(앱 /api/chart 1d)으로 «진짜 live» 판정.
  //   수집기 슬림 체인(재배포 뒤 계약별 _quoteSource·ivObservedAt 있음). 다리 값은 «실제 현물»에서 패리티로 만든다.
  {
    const NOW = '2026-11-13T14:37:40Z';             // 09:37:40 ET
    const P12 = '2026-11-12';
    const M20 = '2026-11-20', W18 = '2026-11-18', W27 = '2026-11-27';
    const yrs = (exp: string) => (Date.parse(`${exp}T21:00:00Z`) - ms(NOW)) / (365 * 86400_000);
    /** 실제 현물 trueS 에서 만든 실시간 다리(C−P = S − K·e^(−0.04T), C+P = base + slope·|S−K|) */
    const legsAt = (exp: string, trueS: number, strikes: number[], base: number, slope: number, obsAt: string) => {
      const rows: any[] = [];
      for (const K of strikes) {
        const sum = base + slope * Math.abs(trueS - K);
        const diff = trueS - K * Math.exp(-0.04 * yrs(exp));
        const c = Math.round((sum + diff) / 2 * 100) / 100, p = Math.round((sum - diff) / 2 * 100) / 100;
        for (const [type, v] of [['call', c], ['put', p]] as const) rows.push({
          details: { expiration_date: exp, strike_price: K, contract_type: type },
          _quoteSource: 'live', ivObservedAt: obsAt, day: { close: v }, last_quote: { midpoint: v },
        });
      }
      return rows;
    };
    const seedT = (T: string, o: { spot: number; prevClose: number; exp: string; rows: any[]; chainAgeMs: number; obs?: any; after: string }) => {
      store.clear(); RC._resetEcBreakerForTest(); IMS._resetImpliedPackMemoForTest();
      const now = ms(NOW);
      store.set(`structure:v2:${T}`, { data: { ticker: T, options_status: 'OK', expiration: o.exp, availableExpirations: [o.exp, W27],
        chainDate: P12, underlyingPrice: o.spot, prevClose: o.prevClose, session: 'REG', impliedMove: null, structure: { strikes: [o.spot], callsOI: [1], putsOI: [1] } }, timestamp: now - 30_000 });
      store.set('intrinio:eod:snapshot', { date: P12, rows: [[T, 0, 0, 0, o.prevClose, 0, 0, 0]] });
      store.set(`polygon:snapshot:probe:${T}`, { greeksSource: 'realtime', _ts: now - o.chainAgeMs, chainDate: P12, chainDates: { [o.exp]: P12, [W27]: P12 },
        weeklyExpiry: o.exp, expirations: [o.exp, W27], expirationsMissing: [], exactResults: [], probeResults: o.rows, _source: 'lambda-flow-harvest' });
      if (o.obs) store.set(EI.earningsObservationKey(T, o.after, false), { im: o.obs, checkedAt: now - 3600_000, first: o.exp });
    };
    const read = (T: string, after: string) => at(NOW, () => IMS.readImpliedMoveRows([{ ticker: T, after, timing: 'amc' }], '2026-11-13'));
    const eodObs = (exp: string, strike: number, spot: number, c: number, p: number) => ({ def: IM.IMPLIED_MOVE_DEF, pct: Math.round((c + p) / spot * 1000) / 10,
      straddle: Math.round((c + p) * 100) / 100, strike, expiry: exp, callPrice: c, putPrice: p, spot, basis: 'eod' as const, asOf: null, chainDate: P12, session: P12, method: 'monthly' as const });

    // PANW — 구조 현물 333.9002(09:20~09:25 장전 334.0~334.2 와 같은 값), 실제 09:32~09:37 은 320.1~327.3 · 체인 09:32:49(실제 약 326)
    //   운영(main) = live 11.0 @335/333.90(장전 현물 + 오늘 다리 혼합) · 미리보기 = 11/12 EOD 관측 11.1 @322.5/322.66 → 패리티 탈락이 맞다
    const panwObs = eodObs(M20, 322.5, 322.66, 17.95, 17.77);
    seedT('PANW', { spot: 333.9002, prevClose: 322.66, exp: M20, after: W18, chainAgeMs: 291_000, obs: panwObs,
      rows: legsAt(M20, 326, [320, 325, 330, 335, 340], 36, 0.25, '2026-11-13T14:32:49Z') });
    let [x] = await read('PANW', W18);
    assert.equal(x.basis, 'eod', `PANW pre-open spot + live legs must not ship live — got ${x.basis} ${x.impliedMovePct} @${x.strike}`);
    assert.equal(x.session, P12); assert.equal(x.strike, 322.5); assert.equal(x.impliedMovePct, 11.1);
    // 같은 체인에서 현물이 실제 값(326.0)이면 증명된 live(ATM 325) — 다리 시각 09:32:49 · 현물 저장 09:37:10 → 차 4.4분 ≤ 6분
    seedT('PANW', { spot: 326.0123, prevClose: 322.66, exp: M20, after: W18, chainAgeMs: 291_000, obs: panwObs,
      rows: legsAt(M20, 326, [320, 325, 330, 335, 340], 36, 0.25, '2026-11-13T14:32:49Z') });
    [x] = await read('PANW', W18);
    assert.equal(x.basis, 'live', `PANW true spot → live — got ${x.basis} ${x.impliedMovePct}`); assert.equal(x.strike, 325); assert.equal(x.session, '2026-11-13');
    ok(`⑦ 11/13 PANW replay: pre-open spot 333.90 (real ~326) → EOD obs 11.1 (not mixed live @335) · true spot → live ${x.impliedMovePct} @325`);

    // SNOW — 구조 현물 302.6043(장전 302.2 대), 실제 09:36 은 293.7~294.5 · 체인 09:36:24 → 패리티 탈락 → 11/12 EOD 관측
    const snowObs = eodObs('2026-12-04', 300, 298.7, 24.03, 24.54);
    const D04 = '2026-12-04';
    seedT('SNOW', { spot: 302.6043, prevClose: 298.7, exp: D04, after: '2026-12-02', chainAgeMs: 76_000, obs: { ...snowObs, method: 'weekly' },
      rows: legsAt(D04, 294.2, [290, 295, 300, 305, 310], 48.4, 0.2, '2026-11-13T14:36:24Z') });
    store.set('polygon:snapshot:probe:SNOW', { ...(store.get('polygon:snapshot:probe:SNOW') as any), expirations: [W27, D04], chainDates: { [W27]: P12, [D04]: P12 } });
    [x] = await read('SNOW', '2026-12-02');
    assert.equal(x.basis, 'eod', `SNOW pre-open spot must not ship live — got ${x.basis} ${x.impliedMovePct} @${x.strike}`);
    assert.equal(x.impliedMovePct, 16.3); assert.equal(x.strike, 300);
    ok('⑦ 11/13 SNOW replay: pre-open spot 302.60 (real ~294) → EOD obs 16.3 (not mixed live @305)');

    // LOW — 구조 현물 227.46 = 11/12 종가(전일 종가 대체), 실제 09:31 은 224.8~225.3 · 체인 09:31:07(실제 225.3)
    //   패리티는 허용치 안(차 2.16 ≤ 2.27)이지만 증명 범위 양 끝에서 ATM 이 225/227.5 로 갈려 «후보 아님» → 예전엔 legacy live 5.8 @227.5(혼합)
    //   [11/14] 현물 = 전일 종가 대체가 확인되면 legacy live 도 혼합값 → 같은 첫 만기 EOD 관측 · 관측 없으면 main 그대로(새 «—» 없음)
    const lowRows = legsAt(M20, 225.3, [220, 222.5, 225, 227.5, 230, 232.5], 12.8, 0.2, '2026-11-13T14:31:07Z');
    const lowObs = eodObs(M20, 227.5, 227.46, 6.4, 6.45);
    seedT('LOW', { spot: 227.46, prevClose: 227.46, exp: M20, after: W18, chainAgeMs: 393_000, obs: lowObs, rows: lowRows });
    [x] = await read('LOW', W18);
    assert.equal(x.basis, 'eod', `LOW prior-close spot + live legs must fall back to EOD obs — got ${x.basis} ${x.impliedMovePct} @${x.strike}`);
    assert.equal(x.session, P12); assert.equal(x.impliedMovePct, 5.6); assert.equal(x.spot, 227.46);
    seedT('LOW', { spot: 227.46, prevClose: 227.46, exp: M20, after: W18, chainAgeMs: 393_000, rows: lowRows });
    [x] = await read('LOW', W18);
    assert.equal(x.basis, 'live', `LOW without EOD observation stays origin/main (legacy live) — got ${x.basis} ${x.impliedMovePct}`);
    assert.equal(x.strike, 227.5);
    ok(`⑦ 11/13 LOW replay: prior-close-fill spot 227.46 (real ~225.3) → EOD obs 5.6 · no obs → unchanged origin/main live ${x.impliedMovePct}`);
    // 관문 11140621 반례 — 진짜 정규장 체결가가 전일 종가와 우연히 같다(실제 227.46 = prevClose): 다리가 이 현물과 맞으면(증명) main 그대로 live
    seedT('LOW', { spot: 227.46, prevClose: 227.46, exp: M20, after: W18, chainAgeMs: 393_000, obs: lowObs,
      rows: legsAt(M20, 227.46, [220, 222.5, 225, 227.5, 230, 232.5], 12.8, 0.2, '2026-11-13T14:31:07Z') });
    [x] = await read('LOW', W18);
    assert.equal(x.basis, 'live', `genuine price equal to prior close must keep origin/main live — got ${x.basis} ${x.impliedMovePct}`);
    assert.equal(x.strike, 227.5); assert.equal(x.session, '2026-11-13');
    ok(`⑦ gate 11140621: genuine REG price == prior close, legs consistent → origin/main live ${x.impliedMovePct} kept (not EOD)`);
    // 관문 11140623 ① 반례 — 옛 슬림 체인(계약별 _quoteSource 없음, 체인 수준 greeksSource realtime 만)·현물 = 전일 종가·EOD 관측 있음
    //   → 새 분기는 계산 자체를 못 한다(증명 대상 아님) → main 그대로(legacy live)
    seedT('LOW', { spot: 227.46, prevClose: 227.46, exp: M20, after: W18, chainAgeMs: 393_000, obs: lowObs,
      rows: legsAt(M20, 227.46, [220, 222.5, 225, 227.5, 230, 232.5], 12.8, 0.2, '2026-11-13T14:31:07Z').map(({ _quoteSource, ivObservedAt, ...r }: any) => r) });
    [x] = await read('LOW', W18);
    assert.equal(x.basis, 'live', `old slim chain without per-contract flags must stay origin/main — got ${x.basis} ${x.impliedMovePct}`);
    ok(`⑦ gate 11140623 ①: old slim chain (no per-contract live flags) + prior-close-equal spot → origin/main live ${x.impliedMovePct} kept`);

    // NVDA — 구조 현물 166.0911, 실제 09:33 은 166.02~166.84 · 체인 09:32:27 → 진짜 live(운영·미리보기 모두 live 8.8 @165)
    const W18N = '2026-11-18';
    seedT('NVDA', { spot: 166.0911, prevClose: 166.19, exp: W18N, after: '2026-11-17', chainAgeMs: 313_000, obs: { ...eodObs(W18N, 165, 166.19, 7.6, 7.3), method: 'weekly' },
      rows: legsAt(W18N, 166.0911, [160, 162.5, 165, 167.5, 170], 14.36, 0.25, '2026-11-13T14:33:27Z') });
    [x] = await read('NVDA', '2026-11-17');
    assert.equal(x.basis, 'live', `NVDA genuine live must stay live — got ${x.basis} ${x.impliedMovePct}`);
    assert.equal(x.strike, 165); assert.equal(x.session, '2026-11-13'); assert.equal(x.impliedMovePct, 8.8);
    ok(`⑦ 11/13 NVDA replay: genuine live spot 166.09 → proven live ${x.impliedMovePct} @165 (kept)`);
  }

  assert.equal(vendor, 0, `supplier calls must be 0 — got ${vendor}`);
  assert.equal(writes, 0, `Redis writes must be 0 — got ${writes}`);
  ok('supplier calls 0 · Redis writes 0 across all scenarios');
  console.log(`earningsRegularLiveFirst: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
