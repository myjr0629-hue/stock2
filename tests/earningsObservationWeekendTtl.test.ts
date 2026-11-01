import assert from 'node:assert/strict';

// [11/1 사고] AAPL 11/2 AMC — 일요일 19:4x KST 공개 API(after)·실적 주간이 «—»(no_straddle).
//   첫 만기 11/4 의 «마감 관측»(earnings:event-probe:v3:AAPL:2026-11-02:next)이 금요일 마감 뒤 저장(TTL 36시간)된 뒤,
//   토·일엔 관측이 «최신»(세션 10/30 = 마지막 정규장)이라 다시 저장되지 않아 일요일 저녁에 키가 사라졌다.
//   토요일 수집기 체인은 세션 꼬리표가 없어 대체 근거가 못 된다 → 첫 만기 값 없음 → null.
//   ① 관측 저장 TTL 이 valid() 창(세션 5일)을 덮는다  ② 금요일 관측이 일요일 저녁에도 읽힌다(4.3% 그대로)
//   ③ 옛 36시간 키는 배경 갱신이 하루 넘으면 같은 값으로 다시 써 수명을 늘린다(공급사 호출 0)
//   ④ 하루 안의 최신 관측은 다시 쓰지 않는다(쓰기 0) · 읽기 전용 경로는 다시 쓰지 않는다. 네트워크 전부 가짜.
process.env.EC2_REDIS_PROXY_KEY = 'fixture';
process.env.INTRINIO_API_KEY = 'fixture';
let clock = Date.parse('2026-10-30T22:40:00Z');   // 금 18:40 ET — 10/30 정규장 마감 뒤
const store = new Map<string, { value: any; exp: number }>();
const calls: string[] = [];
const writes: Array<{ key: string; ttl: number | undefined }> = [];
const get = (k: string) => { const e = store.get(k); if (!e) return null; if (e.exp <= clock) { store.delete(k); return null; } return e.value; };
const put = (k: string, value: any, ttl?: number) => store.set(k, { value, exp: ttl ? clock + ttl * 1000 : Infinity });
const SESSION = '2026-10-30';
const AFTER = '2026-11-02';
const E1 = '2026-11-04', E2 = '2026-11-06';
const LIST = [E1, E2, '2026-11-09', '2026-11-13', '2026-11-20'];
const DEF = 'atm-straddle-mid/1' as const;

(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = new URL(url);
  if (u.hostname.includes('intrinio')) {
    calls.push(u.pathname);
    const bits = u.pathname.split('/');
    if (u.pathname.includes('/expirations/')) return Response.json({ expirations: LIST });
    if (u.pathname.includes('/chain/')) {
      const expiry = bits[4];
      const mid = expiry === E1 ? 7.45 : 8.2;   // 11/4: (7.45+7.45)/344.63 = 4.3%
      return Response.json({ chain: ['call', 'put'].map((type) => ({
        option: { code: `AAPL${expiry}${type}`, expiration: expiry, strike: 345, type },
        prices: { date: SESSION, close_bid: mid - 0.05, close_ask: mid + 0.05, implied_volatility: 0.3 },
      })) });
    }
    return Response.json({ contracts: [] });
  }
  if (u.pathname === '/get') return Response.json({ result: get(u.searchParams.get('key') || '') });
  if (u.pathname === '/mget') return Response.json({ results: (u.searchParams.get('keys') || '').split(',').filter(Boolean).map(decodeURIComponent).map(get) });
  if (u.pathname === '/set' && init?.method === 'POST') {
    const b = JSON.parse(init.body || '{}'); put(b.key, b.value, b.ttl); writes.push({ key: b.key, ttl: b.ttl });
    return Response.json({ ok: true });
  }
  throw new Error(`Unmocked endpoint: ${u.hostname}${u.pathname}`);
};
const IMS = require('../src/services/impliedMoveService') as typeof import('../src/services/impliedMoveService');
const EIS = require('../src/services/earningsImpliedService') as typeof import('../src/services/earningsImpliedService');
const EI = require('../src/lib/earnings/earningsImplied') as typeof import('../src/lib/earnings/earningsImplied');
const RC = require('../src/services/redisClient') as typeof import('../src/services/redisClient');

const obsKey = EI.earningsObservationKey('AAPL', AFTER, false);
function seed() {
  RC._resetEcBreakerForTest();
  put('intrinio:eod:snapshot', { date: SESSION, rows: [['AAPL', 0, 0, 0, 344.63, 0, 0, 0]] });
  // 운영 구조 사본과 같은 모양 — 레벨 주간 11/6(4.7%), 목록에 첫 만기 11/4. 수집기 체인 캐시 없음(토요일 체인은 세션 꼬리표가 없다).
  put('structure:v2:AAPL', { timestamp: clock - 1000, data: {
    ticker: 'AAPL', options_status: 'OK', expiration: E2, availableExpirations: LIST, chainDate: SESSION, underlyingPrice: 344.79,
    impliedMove: { def: DEF, pct: 4.7, straddle: 16.35, strike: 345, expiry: E2, callPrice: 8.225, putPrice: 8.125, spot: 344.79,
      basis: 'eod', asOf: null, chainDate: SESSION, session: SESSION },
  } });
}
const publicRow = async () => (await IMS.readImpliedMoveRows([{ ticker: 'AAPL', after: AFTER, timing: 'amc' }]))[0];
const build = () => EIS.buildImpliedPack([{ ticker: 'AAPL', date: AFTER, hour: 'amc' }], clock, { probeMonthly: true });

(async () => {
  const realNow = Date.now; Date.now = () => clock;
  try {
    // ① 금요일 마감 뒤 배경 갱신 — 첫 만기 11/4 관측 4.3% 저장, TTL 은 세션 5일 창을 덮는다
    seed();
    let pack = await build();
    assert.equal(pack.cells[EI.impliedRowKey('AAPL', AFTER)].p, 4.3);
    const saved = writes.filter((w) => w.key === obsKey);
    assert.equal(saved.length, 1);
    assert.ok((saved[0].ttl ?? 0) >= 5 * 86400, `관측 TTL ${saved[0].ttl}s — 주말·연휴(세션 5일 창)를 덮어야 한다`);
    console.log('✓ ① 금요일 관측 저장 TTL ≥ 5일');

    // ② 일요일 19:45 KST(10:45 UTC) — 그 사이 배경 갱신 없음(주말 크론 쉼). 공개 API(after) 경로가 여전히 4.3%
    clock = Date.parse('2026-11-01T10:45:00Z');
    seed();
    let r = await publicRow();
    assert.equal(r.impliedMovePct, 4.3, '일요일 저녁에도 첫 만기 11/4 관측 그대로(«—» 금지)');
    assert.equal(r.expiry, E1); assert.equal(r.session, SESSION); assert.equal(r.source, 'probe');
    console.log('✓ ② 일요일 19:45 KST 공개 API(after) AAPL 4.3% · 11/4 · 세션 10/30');

    // ③ 옛 코드가 36시간으로 저장한 키(운영 AMD 와 같은 모양) — 배경 갱신이 하루 넘었으면 같은 값으로 다시 써 수명 연장, 공급사 0
    clock = Date.parse('2026-11-01T11:00:00Z');
    const old = get(obsKey);
    put(obsKey, { ...old, checkedAt: Date.parse('2026-10-31T01:13:00Z') }, Math.round((Date.parse('2026-11-01T13:13:00Z') - clock) / 1000));
    seed();
    calls.length = 0; writes.length = 0;
    pack = await build();
    assert.equal(pack.cells[EI.impliedRowKey('AAPL', AFTER)].p, 4.3);
    assert.equal(calls.length, 0, '최신 관측의 수명 연장은 공급사를 부르지 않는다');
    const re = writes.filter((w) => w.key === obsKey);
    assert.equal(re.length, 1, '하루 넘은 최신 관측은 다시 쓴다'); assert.ok((re[0].ttl ?? 0) >= 5 * 86400);
    assert.deepEqual(get(obsKey).im, old.im, '값·세션은 그대로'); assert.equal(get(obsKey).first, E1);
    clock = Date.parse('2026-11-02T12:00:00Z');   // 옛 TTL(일 13:13 UTC)을 지나 월요일 아침
    seed();
    r = await publicRow();
    assert.equal(r.impliedMovePct, 4.3, '옛 36시간 키였어도 다시 쓴 뒤엔 월요일까지 남는다');
    console.log('✓ ③ 옛 36시간 키 — 하루 넘으면 같은 값으로 다시 써 수명 연장(공급사 0), 월요일 아침에도 4.3%');

    // ④ 하루 안의 최신 관측은 다시 쓰지 않는다 · 읽기 전용(공개 API) 경로는 쓰지 않는다
    await build();   // 월 07:00 ET — 마지막 다시 쓰기(일 11:00 UTC)에서 하루 넘음 → 한 번 더 쓴다
    calls.length = 0; writes.length = 0;
    clock += 6 * 3600_000;
    seed(); writes.length = 0;
    await build();
    assert.equal(writes.filter((w) => w.key === obsKey).length, 0, '방금 다시 쓴 관측은 또 쓰지 않는다');
    assert.equal(calls.length, 0);
    clock = Date.parse('2026-11-03T13:00:00Z') - 3600_000;   // 다시 하루 넘음 — 공개 읽기는 여전히 쓰기 0
    writes.length = 0;
    await publicRow();
    assert.equal(writes.length, 0, '읽기 전용 경로는 관측을 쓰지 않는다');
    console.log('✓ ④ 하루 안 재쓰기 0 · 읽기 전용 경로 쓰기 0');
    console.log('earningsObservationWeekendTtl: 4 scenarios passed');
  } finally { Date.now = realNow; }
})().catch(e => { console.error(e); process.exit(1); });
