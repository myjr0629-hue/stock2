import assert from 'node:assert/strict';

process.env.EC2_REDIS_PROXY_KEY = 'test-proxy';
process.env.FMP_API_KEY = 'test-fmp';
process.env.FINNHUB_API_KEY = 'test-finnhub';
const store = new Map<string, unknown>();
const writeKeys: string[] = [];
let mgets = 0;
let gets: string[] = [];
let failReads = false;
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = new URL(url);
  if (failReads && (u.pathname === '/get' || u.pathname === '/mget')) throw new Error('redis down');
  if (u.pathname === '/get') { gets.push(u.searchParams.get('key') || ''); return Response.json({ result: store.get(u.searchParams.get('key') || '') ?? null }); }
  if (u.pathname === '/mget') {
    mgets += 1;
    const keys = (u.searchParams.get('keys') || '').split(',').filter(Boolean).map(decodeURIComponent);
    return Response.json({ results: keys.map((k) => store.get(k) ?? null) });
  }
  if (u.pathname === '/set' && init?.method === 'POST') {
    try { const b = JSON.parse(init.body || '{}'); writeKeys.push(b.key); store.set(b.key, b.value); } catch { /* */ }
    return Response.json({ ok: true });
  }
  if (u.hostname === 'financialmodelingprep.com') return Response.json([]);
  return new Response('not found', { status: 404 });
};

const lockModule = require.resolve('../src/services/earningsImpliedLock');
require.cache[lockModule] = { id: lockModule, filename: lockModule, loaded: true, exports: {
  acquireEarningsImpliedLock: async () => {
    const key = 'earnings:implied:v1:lock';
    if (store.has(key)) return false;
    store.set(key, { at: Date.now() }); writeKeys.push(key); return true;
  },
} } as any;

const EI = require('../src/lib/earnings/earningsImplied') as typeof import('../src/lib/earnings/earningsImplied');
const EIS = require('../src/services/earningsImpliedService') as typeof import('../src/services/earningsImpliedService');
const IMS = require('../src/services/impliedMoveService') as typeof import('../src/services/impliedMoveService');
const EB = require('../src/lib/earnings/earningsBrief') as typeof import('../src/lib/earnings/earningsBrief');
const RC = require('../src/services/redisClient') as typeof import('../src/services/redisClient');
const CAL = require('../src/services/earningsCalendarService') as typeof import('../src/services/earningsCalendarService');


const ms = (iso: string) => Date.parse(iso);
const at = async <T,>(iso: string, fn: () => Promise<T>): Promise<T> => {
  const real = Date.now; const v = ms(iso); Date.now = () => v;
  try { return await fn(); } finally { Date.now = real; }
};
const IM = require('../src/lib/impliedMove') as typeof import('../src/lib/impliedMove');
const SUNDAY = '2026-10-11T16:00:00Z';
const row = (type: 'call' | 'put', extra: any) => ({ details: { expiration_date: '2026-10-23', strike_price: 100, contract_type: type }, ...extra });
function seed(chainRows: any[], greeksSource: 'realtime' | 'eod') {
  store.clear();
  RC._resetEcBreakerForTest();
  store.set('structure:v2:GATE', { data: { ticker: 'GATE', options_status: 'OK', expiration: '2026-10-16', availableExpirations: ['2026-10-16'],
    chainDate: '2026-10-09', underlyingPrice: 104, prevClose: 103, impliedMove: null,
    structure: { strikes: [100], callsOI: [1], putsOI: [1] } }, timestamp: ms('2026-10-10T04:07:00Z') });
  store.set('intrinio:eod:snapshot', { date: '2026-10-09', rows: [['GATE', 0, 0, 0, 100, 0, 0, 0]] });
  store.set('polygon:snapshot:probe:GATE', { greeksSource, _ts: ms('2026-10-10T04:00:00Z'), chainDate: '2026-10-09',
    chainDates: { '2026-10-23': '2026-10-09' }, weeklyExpiry: '2026-10-16', expirationsMissing: [], probeResults: chainRows });   // 수집기는 expirationsMissing 을 늘 쓴다(lambda-flow-harvest index.js:370)
}
const read = () => at(SUNDAY, () => IMS.readImpliedMoveRows([{ ticker: 'GATE', after: '2026-10-20', timing: 'amc' }], '2026-10-11'));
(async () => {
  let n = 0;
  const ok = (name: string) => { n++; console.log(`  ✓ ${name}`); };
  // 관문 10200342: 콜만 실시간 그릭스·mark 없음(day.vwap = 마지막 체결 종가 $8) · 마감 호가 중간 콜 $2 / 풋 $3 → 정답 5%
  seed([
    row('call', { _rtGreeks: true, day: { vwap: 8, close: 8 }, last_quote: { midpoint: 2.5, bid: 1.9, ask: 2.1 }, last_trade: { price: 8 } }),
    row('put', { _rtGreeks: false, day: { vwap: 3, close: 3.4 }, last_quote: { midpoint: 3, bid: 2.9, ask: 3.1 } }),
  ], 'realtime');
  let [r] = await read();
  assert.ok(r.impliedMovePct != null && Math.abs(r.impliedMovePct - 5) < 0.051, `gate scenario 5% — got ${r.impliedMovePct}`);
  assert.equal(r.expiry, '2026-10-23');
  ok('gate 10200342: realtime-greeks call without mark uses closing quote mid, not last trade (5%)');
  // 관문 10200755 ①: 슬림 저장 체인(호가 칸 없음)의 midpoint 는 수집기가 bid=0·ask=2 → 1 처럼 한쪽 호가로 만든 값일 수 있다 → 쓰지 않는다
  seed([row('call', { day: { close: 2.2 }, last_quote: { midpoint: 1 } }), row('put', { day: { close: 3.3 }, last_quote: { midpoint: 3 } })], 'eod');
  [r] = await read();
  assert.equal(r.impliedMovePct, null, `slim midpoint (provenance unknown) must not produce a value — got ${r.impliedMovePct}`);
  ok('gate 10200755 ①: slim stored midpoint without both quotes yields no value (was ±4.0%)');
  // 슬림 저장 체인 · 실시간 체인 · 계약 표식 없음 → midpoint 는 FMV 일 수 있다 → EOD 값 없음(지어내지 않음)
  seed([row('call', { day: { close: 8 }, last_quote: { midpoint: 2.5 } }), row('put', { day: { close: 3 }, last_quote: { midpoint: 3.5 } })], 'realtime');
  [r] = await read();
  assert.equal(r.impliedMovePct, null, `slim realtime chain must not invent an EOD value — got ${r.impliedMovePct}`);
  ok('slim realtime chain without per-contract flags yields no EOD value');
  // 원본 행: 한쪽 호가만 있고 mark 없음 → midpoint(반쪽 합) 불신 → 값 없음
  const rows = IM.eodQuoteRows([row('call', { _rtGreeks: false, last_quote: { midpoint: 1, bid: 0, ask: 2 }, day: { vwap: 5, close: 5 } })]);
  assert.equal(rows[0].last_quote.midpoint, null);
  ok('one-sided raw quote with zero default is not a midpoint');
  // 명시 mark 우선
  assert.equal(IM.eodQuoteRows([row('call', { _intrinio: { eod: { mark: 2.05 } }, last_quote: { bid: 1.9, ask: 2.1 }, day: { vwap: 8, close: 8 } })])[0].last_quote.midpoint, 2.05);
  ok('explicit Intrinio mark wins');
  // 한쪽 호가뿐이면 명시 mark 가 있어도 쓰지 않는다(그 mark 도 반쪽 호가로 만든 값일 수 있다)
  assert.equal(IM.eodQuoteRows([row('call', { _intrinio: { eod: { mark: 1 } }, last_quote: { bid: 0, ask: 2 } })])[0].last_quote.midpoint, null);
  assert.equal(IM.eodQuoteRows([row('call', { last_quote: { bid: 2.2, ask: 2 } })])[0].last_quote.midpoint, null, 'crossed quote');
  assert.equal(IM.eodQuoteRows([row('call', { last_quote: { bid: 1.9, ask: 2.1 } })])[0].last_quote.midpoint, 2);
  ok('mark/mid only with both closing quotes');
  // 관문 10200855: 장중 실시간 슬림 체인(콜 bid=0·ask=2 → 수집기 midpoint 1, 풋 3, 현물 100) · 구조 만기 목록엔 발표 뒤 만기 없음
  //   → main=null. live basis 로 우회해 ±4.0% 를 새로 만들면 안 된다.
  store.clear(); RC._resetEcBreakerForTest();
  const REG = '2026-10-19T15:00:00Z';
  store.set('structure:v2:GATE', { data: { ticker: 'GATE', options_status: 'OK', expiration: '2026-10-23', availableExpirations: ['2026-10-23'],
    chainDate: '2026-10-16', underlyingPrice: 100, prevClose: 100, impliedMove: null, structure: { strikes: [100], callsOI: [1], putsOI: [1] } }, timestamp: ms(REG) - 60_000 });
  const live = (type: 'call' | 'put', mid: number) => ({ details: { expiration_date: '2026-10-30', strike_price: 100, contract_type: type }, day: { close: mid }, last_quote: { midpoint: mid } });
  store.set('polygon:snapshot:probe:GATE', { greeksSource: 'realtime', _ts: ms(REG) - 30_000, chainDate: '2026-10-16', weeklyExpiry: '2026-10-23', probeResults: [live('call', 1), live('put', 3)] });
  [r] = await at(REG, () => IMS.readImpliedMoveRows([{ ticker: 'GATE', after: '2026-10-26', timing: 'amc' }], '2026-10-19'));
  assert.equal(r.impliedMovePct, null, `live slim midpoint outside main's rule must not produce a value — got ${r.impliedMovePct}`);
  ok('gate 10200855: realtime slim chain beyond the structure expiry list yields no value (main null)');
  console.log(`earningsMoveDirect: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
