import assert from 'node:assert/strict';

// [10/31 첫 만기 통일] 실적 «예상 변동폭»은 모든 경로에서 «발표 직후 첫 만기» 하나.
//   운영 실측(10/31 09:42 KST): AAPL 11/2 AMC — 실적 경로 5.5%(11/20 월물 대체 · 10/29 세션) vs 첫 만기 11/4 = 4.3%.
//   ① 뒤 월물 대체 금지  ② 확인된 첫 만기 값은 갱신 실패 때 유지  ③ 한 번도 못 구했으면 «—»
//   ④ 묶음 병합·앱 복원·영수증도 같은 첫 만기만. 네트워크 전부 가짜(자격 증명·외부 I/O 없음).
process.env.EC2_REDIS_PROXY_KEY = 'fixture';
process.env.INTRINIO_API_KEY = 'fixture';
const store = new Map<string, any>();
const calls: string[] = [];
const writes: string[] = [];
const NOW = Date.parse('2026-10-31T15:00:00Z');   // 토 11:00 ET — 마지막 정규장 10/30
const SESSION = '2026-10-30';
const AFTER = '2026-11-02';                         // AMC
const E1 = '2026-11-04', E2 = '2026-11-06', M = '2026-11-20';
const LIST = ['2026-11-02', E1, E2, '2026-11-13', M];
/** 실패하는 첫 만기 체인(빈 체인) — 종목별 */
const failFirst = new Set<string>();
const DEF = 'atm-straddle-mid/1' as const;

function chain(ticker: string, expiry: string) {
  if (failFirst.has(ticker) && expiry === E1) return [];
  const mid = expiry === E1 ? 2.15 : expiry === E2 ? 2.35 : 2.75;   // 4.3% · 4.7% · 5.5%
  return ['call', 'put'].map((type) => ({
    option: { code: `${ticker}${expiry}${type}`, expiration: expiry, strike: 100, type },
    prices: { date: SESSION, close_bid: mid - 0.05, close_ask: mid + 0.05, implied_volatility: 0.4 },
  }));
}
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = new URL(url);
  if (u.hostname.includes('intrinio')) {
    calls.push(u.pathname);
    const bits = u.pathname.split('/');
    if (u.pathname.includes('/expirations/')) return Response.json({ expirations: LIST });
    if (u.pathname.includes('/chain/')) return Response.json({ chain: chain(bits[3], bits[4]) });
    return Response.json({ contracts: [{ option: { code: 'unrelated' }, greeks: {} }] });
  }
  if (u.pathname === '/get') return Response.json({ result: store.get(u.searchParams.get('key') || '') ?? null });
  if (u.pathname === '/mget') return Response.json({ results: (u.searchParams.get('keys') || '').split(',').filter(Boolean).map(decodeURIComponent).map(k => store.get(k) ?? null) });
  if (u.pathname === '/set' && init?.method === 'POST') {
    const b = JSON.parse(init.body || '{}'); store.set(b.key, b.value); writes.push(b.key);
    return Response.json({ ok: true });
  }
  throw new Error(`Unmocked endpoint: ${u.hostname}${u.pathname}`);
};
const IMS = require('../src/services/impliedMoveService') as typeof import('../src/services/impliedMoveService');
const EIS = require('../src/services/earningsImpliedService') as typeof import('../src/services/earningsImpliedService');
const EI = require('../src/lib/earnings/earningsImplied') as typeof import('../src/lib/earnings/earningsImplied');
const EAS = require('../src/services/earningsActualsService') as typeof import('../src/services/earningsActualsService');
const MM = require('../src/lib/app/moneyMap') as typeof import('../src/lib/app/moneyMap');
const RC = require('../src/services/redisClient') as typeof import('../src/services/redisClient');

const move = (pct: number, expiry: string, session: string, method?: 'weekly' | 'monthly') => ({
  def: DEF, pct, straddle: pct, strike: 100, expiry, callPrice: pct / 2, putPrice: pct / 2, spot: 100,
  basis: 'eod' as const, asOf: null, chainDate: session, session, ...(method ? { method } : {}),
});
const ALL = ['AAPL', 'KEEP', 'NEWCO', 'SLICE', 'BMO'];
const obsKey = (t: string) => EI.earningsObservationKey(t, AFTER, false);
function seed(tickers: string[]) {
  RC._resetEcBreakerForTest();
  // 종가 묶음은 프로세스 메모가 있어 처음부터 모든 종목을 싣는다(월물 대체 경로가 종가 부족으로 우연히 막히지 않게)
  store.set('intrinio:eod:snapshot', { date: SESSION, rows: ALL.map(t => [t, 0, 0, 0, 100, 0, 0, 0]) });
  for (const t of tickers) {
    // 구조 사본: 레벨 주간 만기 11/6(4.7%) — 목록에는 첫 만기 11/4 도 있다(운영 AAPL 과 같은 모양)
    store.set(`structure:v2:${t}`, { timestamp: NOW - 1000, data: {
      ticker: t, options_status: 'OK', expiration: E2, availableExpirations: LIST, chainDate: SESSION,
      underlyingPrice: 100, impliedMove: move(4.7, E2, SESSION),
    } });
  }
}
const req = (ticker: string) => ({ ticker, after: AFTER, timing: 'amc' as const });
const row = async (ticker: string) => (await IMS.readImpliedMoveRows([req(ticker)], undefined, { withFirstExpiry: true }))[0];

(async () => {
  const realNow = Date.now; Date.now = () => NOW;
  try {
    // ① 운영 재현 — 옛 관측 저장본이 월물 대체값(11/20 5.5% · 10/29), 첫 만기 미확인(first 없음)
    seed(['AAPL']);
    store.set(obsKey('AAPL'), { im: move(5.5, M, '2026-10-29', 'monthly'), checkedAt: NOW - 2 * 3600_000 });
    let r = await row('AAPL');
    assert.equal(r.impliedMovePct, null, '뒤 월물 11/20 5.5% 는 첫 만기 값이 아니다 — 대체 금지');
    assert.equal(r.firstExpiry, E1, '첫 만기 = 구조 목록의 발표 뒤 첫 만기 11/4');
    assert.notEqual(r.expiry, E2, '레벨 주간 11/6 도 첫 만기가 아니다');
    assert.equal(calls.length, 0); assert.equal(writes.length, 0);
    const legacyReceipt = await EAS.readEarningsObservation({ ticker: 'AAPL', date: AFTER, hour: 'amc' }, false);
    assert.equal(legacyReceipt, null, '영수증도 첫 만기 미확인 월물 관측을 쓰지 않는다');
    console.log('✓ ① 옛 월물 대체 관측(11/20 5.5%)·레벨 주간(11/6 4.7%) 모두 버림 — 읽기 전용, 공급사 0·쓰기 0');

    // ② 묶음 갱신(공급사 목록 확인) → 첫 만기 11/4 4.3% · 묶음·API·영수증 같은 값
    let pack = await EIS.buildImpliedPack([{ ticker: 'AAPL', date: AFTER, hour: 'amc' }], NOW, { probeMonthly: true });
    const cell = pack.cells[EI.impliedRowKey('AAPL', AFTER)];
    assert.equal(cell.p, 4.3); assert.equal(cell.e, E1); assert.equal(cell.f, E1); assert.equal(cell.method, 'weekly');
    assert.ok(!calls.some(p => p.includes(`/${M}/`)), '월물 체인은 부르지 않는다');
    assert.equal(store.get(obsKey('AAPL')).first, E1, '관측 저장본에 첫 만기 기록');
    r = await row('AAPL');
    assert.equal(r.impliedMovePct, 4.3); assert.equal(r.expiry, E1); assert.equal(r.firstExpiry, E1);
    const [publicRow] = await IMS.readImpliedMoveRows([req('AAPL')]);
    assert.equal(publicRow.impliedMovePct, 4.3); assert.ok(!('firstExpiry' in publicRow), '공개 응답(API·실적 주간) 모양 불변');
    const attached = EI.impliedForRow({ ticker: 'AAPL', date: AFTER, hour: 'amc' }, pack, NOW)!;
    assert.equal(attached.pct, 4.3); assert.equal(attached.expiry, E1);
    const unmarked = { ...pack, cells: { [EI.impliedRowKey('AAPL', AFTER)]: { ...cell, f: undefined } } };
    assert.equal(EI.impliedForRow({ ticker: 'AAPL', date: AFTER, hour: 'amc' }, unmarked as any, NOW), null, '첫 만기 표식 없는 옛 칸은 내지 않는다');
    const receipt = await EAS.readEarningsObservation({ ticker: 'AAPL', date: AFTER, hour: 'amc' }, false);
    assert.equal(receipt?.impliedMovePct, 4.3); assert.equal(receipt?.expiry, E1);
    console.log('✓ ② 첫 만기 11/4 4.3% — 캘린더 묶음·implied-move API(after)·영수증 관측이 한 값');

    // ③ 확인된 첫 만기 값 유지 — 다음 갱신에서 첫 만기 체인 실패(월물은 정상)여도 11/4 값을 지키고 11/20 으로 바꾸지 않는다
    seed(['KEEP']);
    store.set(obsKey('KEEP'), { im: move(4.3, E1, '2026-10-29', 'weekly'), checkedAt: NOW - 2 * 3600_000, first: E1 });
    failFirst.add('KEEP');
    pack = await EIS.buildImpliedPack([{ ticker: 'KEEP', date: AFTER, hour: 'amc' }], NOW, { probeMonthly: true });
    const kept = pack.cells[EI.impliedRowKey('KEEP', AFTER)];
    assert.equal(kept.p, 4.3, '갱신 실패 — 확인된 첫 만기 값 유지(빈값 금지)'); assert.equal(kept.e, E1); assert.equal(kept.s, '2026-10-29');
    assert.equal(store.get(obsKey('KEEP')).im?.expiry, E1, '저장본을 월물로 덮지 않는다');
    r = await row('KEEP');
    assert.equal(r.impliedMovePct, 4.3); assert.equal(r.expiry, E1);
    console.log('✓ ③ 첫 만기 체인 실패 → 확인된 11/4 값 유지(세션 표기 10/29 그대로), 월물 대체 0');

    // ④ 한 번도 못 구한 첫 만기 + 체인 실패 → «—»(null) · 월물·레벨 주간 대체 0
    seed(['NEWCO']);
    failFirst.add('NEWCO');
    pack = await EIS.buildImpliedPack([{ ticker: 'NEWCO', date: AFTER, hour: 'amc' }], NOW, { probeMonthly: true });
    const none = pack.cells[EI.impliedRowKey('NEWCO', AFTER)];
    assert.equal(none.p, null); assert.equal(none.e, null); assert.equal(none.f, E1);
    assert.equal(store.get(obsKey('NEWCO')).im, null);
    console.log('✓ ④ 첫 만기 값을 한 번도 못 구함 → null(«—»), 뒤 만기 대체 0');

    // ⑤ 묶음 병합 — 같은 첫 만기 값만 잇는다 · 첫 만기를 모르는 칸(시간 초과 read_failed)은 기존대로 잇는다
    const key = EI.impliedRowKey('AAPL', AFTER);
    const prev = (c: any): any => ({ v: 1, at: NOW - 60_000, day: '2026-10-31', cells: { [key]: c } });
    const next = (c: any): any => ({ v: 1, at: NOW, day: '2026-10-31', cells: { [key]: c } });
    const rows = [{ ticker: 'AAPL', date: AFTER, hour: 'amc' }];
    const oldMonthly = { p: 5.5, e: M, b: 'eod', s: '2026-10-29', r: null };
    const oldFirst = { p: 4.3, e: E1, b: 'eod', s: '2026-10-29', r: null, f: E1 };
    const oldUnmarked = { p: 4.3, e: E1, b: 'eod', s: '2026-10-29', r: null };
    let merged = EI.mergeImpliedPacks(next({ p: null, e: null, b: null, s: null, r: 'no_straddle', f: E1 }), prev(oldMonthly), NOW, rows);
    assert.equal(merged.cells[key].p, null, '직전 월물 값은 첫 만기 값이 아니다');
    merged = EI.mergeImpliedPacks(next({ p: null, e: null, b: null, s: null, r: 'no_straddle', f: E1 }), prev(oldFirst), NOW, rows);
    assert.equal(merged.cells[key].p, 4.3); assert.equal(merged.cells[key].k, 1);
    merged = EI.mergeImpliedPacks(next({ p: null, e: null, b: null, s: null, r: 'read_failed' }), prev(oldFirst), NOW, rows);
    assert.equal(merged.cells[key].p, 4.3, '시간 초과로 못 읽은 칸 — 확인된 값 유지');
    merged = EI.mergeImpliedPacks(next({ p: null, e: null, b: null, s: null, r: 'read_failed' }), prev(oldUnmarked), NOW, rows);
    assert.equal(merged.cells[key].p, null, '첫 만기 표식 없는 옛 칸은 시간 초과 때도 잇지 않는다');
    merged = EI.mergeImpliedPacks(next({ p: null, e: null, b: null, s: null, r: 'no_straddle', f: E1 }), prev(oldUnmarked), NOW, rows);
    assert.equal(merged.cells[key].p, 4.3, '이번 읽기가 첫 만기를 확인하면 같은 만기의 옛 칸은 잇는다');
    assert.equal(EI.impliedPackStale(prev(oldUnmarked), NOW), true, '표식 이전 묶음은 바로 다시 만든다');
    assert.equal(EI.impliedPackStale(prev(oldFirst), NOW), false);
    console.log('✓ ⑤ 묶음 병합: 같은 첫 만기만 잇고, 시간 초과 칸은 기존대로 유지');

    // ⑥ 수집기 체인 경로 — 첫 만기 다리가 불완전하면 다음 만기(11/6)로 넘어가지 않는다
    seed(['SLICE']);
    store.set('structure:v2:SLICE', { timestamp: NOW - 1000, data: {
      ticker: 'SLICE', options_status: 'OK', expiration: E2, availableExpirations: [E2, M], chainDate: SESSION, underlyingPrice: 100, impliedMove: null,
    } });
    const probeRow = (expiry: string, type: 'call' | 'put') => ({ details: { expiration_date: expiry, strike_price: 100, contract_type: type },
      last_quote: { bid: 2.3, ask: 2.4 }, _intrinio: { date: SESSION } });
    store.set('polygon:snapshot:probe:SLICE', { greeksSource: 'eod', chainDates: { [E1]: SESSION, [E2]: SESSION },
      probeResults: [probeRow(E1, 'call'), probeRow(E2, 'call'), probeRow(E2, 'put')] });
    r = await row('SLICE');
    assert.equal(r.impliedMovePct, null, '첫 만기 11/4 (체인에 실재) 다리 불완전 → 11/6 대체 금지');
    assert.equal(r.firstExpiry, E1);
    console.log('✓ ⑥ 수집기 체인: 첫 만기 다리 불완전 → 뒤 만기로 넘어가지 않음');

    // ⑦ BMO = 발표일 포함 첫 만기, AMC = 다음 날 이후 첫 만기
    seed(['BMO']);
    store.set('structure:v2:BMO', { timestamp: NOW - 1000, data: {
      ticker: 'BMO', options_status: 'OK', expiration: E1, availableExpirations: [E1, E2], chainDate: SESSION, underlyingPrice: 100, impliedMove: move(4.3, E1, SESSION),
    } });
    const [bmo, amc] = await IMS.readImpliedMoveRows([{ ticker: 'BMO', after: E1, timing: 'bmo' }, { ticker: 'BMO', after: E1, timing: 'amc' }], undefined, { withFirstExpiry: true });
    assert.equal(bmo.firstExpiry, E1); assert.equal(bmo.impliedMovePct, 4.3);
    assert.equal(amc.firstExpiry, E2); assert.equal(amc.impliedMovePct, null, 'AMC 는 발표일 만기를 쓰지 않는다');
    console.log('✓ ⑦ BMO 발표일 포함 · AMC 다음 날부터');

    // ⑧ 앱 Money Map 복원 — 첫 만기 표식이 있는 값만 잇는다
    const src = (implied: any): any => ({ sectors: [], earnings: [{ ticker: 'AAPL', date: AFTER, hour: 'amc', implied }],
      earningsAt: new Date(NOW).toISOString(), earningsRange: { from: '2026-10-26', to: '2026-11-13' }, earningsStatus: 'ok', events: [], eventsAt: null, eventsRange: null });
    const unknown = src(null); delete unknown.earnings[0].implied;   // 서버가 묶음을 못 읽음
    const restored = MM.mergeMoneyMapSources(unknown, src({ pct: 4.3, session: SESSION, expiry: E1, first: E1 }), NOW);
    assert.equal(restored.earnings[0].implied?.pct, 4.3);
    assert.equal(MM.mergeMoneyMapSources(src(null), src({ pct: 4.3, session: SESSION, expiry: E2, first: E2 }), NOW).earnings[0].implied, null,
      '서버가 null 을 보내면(첫 만기 11/4 값 없음) 직전 11/6 값을 되살리지 않는다');
    const notRestored = MM.mergeMoneyMapSources(unknown, src({ pct: 5.5, session: '2026-10-29', expiry: M }), NOW);
    assert.equal(notRestored.earnings[0].implied, null, '표식 없는 옛 값(월물 대체일 수 있다)은 잇지 않는다');
    console.log('✓ ⑧ 앱 복원: 첫 만기 확인값만');
    console.log('earningsFirstExpiryUnify: 8 scenarios passed');
  } finally { Date.now = realNow; }
})().catch(e => { console.error(e); process.exit(1); });
