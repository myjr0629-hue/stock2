// 관문 10200755 ②③ — 월간 조회는 첫 429 에서 멈추고, 시간 초과 뒤엔 새 공급사 호출을 시작하지 않는다(모의 네트워크).
import assert from 'node:assert/strict';

process.env.EC2_REDIS_PROXY_KEY = 'test-proxy';
process.env.INTRINIO_API_KEY = 'test-intrinio';
process.env.FMP_API_KEY = 'test-fmp';
const store = new Map<string, unknown>();
let vendorCalls: string[] = [];
let vendorMode: '429' | 'slow' = '429';
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string; signal?: AbortSignal }) => {
  const u = new URL(url);
  if (u.hostname.includes('intrinio')) {
    vendorCalls.push(u.pathname);
    if (vendorMode === '429') return new Response('limit', { status: 429 });
    if ((vendorMode as string) === 'partial') {
      if (u.pathname.includes('/expirations/')) return Response.json({ expirations: ['2026-11-20'] });
      if (u.searchParams.get('next_page')) return new Response('err', { status: 500 });
      if (u.pathname.includes('/options/chain/')) return Response.json({ chain: [
        { option: { code: 'C95', expiration: '2026-11-20', strike: 95, type: 'call' }, prices: { date: '2026-10-16', close_bid: 9, close_ask: 9.2, mark: 9.1 } },
        { option: { code: 'P95', expiration: '2026-11-20', strike: 95, type: 'put' }, prices: { date: '2026-10-16', close_bid: 2.8, close_ask: 3, mark: 2.9 } },
      ], next_page: 'p2' });
      return Response.json({});
    }
    await new Promise((r) => setTimeout(r, 400));
    if (u.pathname.includes('/expirations/')) return Response.json({ expirations: ['2026-11-20'] });
    return Response.json({ chain: [{ option: { code: 'X', expiration: '2026-11-20', strike: 100, type: 'call' }, prices: { date: '2026-10-16', close_bid: 1, close_ask: 1.2 } }], next_page: 'p2' });
  }
  if (u.pathname === '/get') return Response.json({ result: store.get(u.searchParams.get('key') || '') ?? null });
  if (u.pathname === '/mget') {
    const keys = (u.searchParams.get('keys') || '').split(',').filter(Boolean).map(decodeURIComponent);
    return Response.json({ results: keys.map((k) => store.get(k) ?? null) });
  }
  if (u.pathname === '/set' && init?.method === 'POST') {
    try { const b = JSON.parse(init.body || '{}'); store.set(b.key, b.value); } catch { /* */ }
    return Response.json({ ok: true });
  }
  return Response.json([]);
};

const EIS = require('../src/services/earningsImpliedService') as typeof import('../src/services/earningsImpliedService');
const RC = require('../src/services/redisClient') as typeof import('../src/services/redisClient');

const NOW = Date.parse('2026-10-19T15:00:00Z');   // 월요일 장중
const tickers = Array.from({ length: 12 }, (_, i) => `T${String.fromCharCode(65 + i)}${i}`);
function seed() {
  store.clear();
  RC._resetEcBreakerForTest();
  for (const t of tickers) {
    store.set(`structure:v2:${t}`, { data: { ticker: t, options_status: 'OK', expiration: '2026-10-23', availableExpirations: ['2026-10-23'],
      chainDate: '2026-10-16', underlyingPrice: 100, prevClose: 100, impliedMove: null, structure: { strikes: [100], callsOI: [1], putsOI: [1] } }, timestamp: NOW - 60_000 });
  }
  store.set('intrinio:eod:snapshot', { date: '2026-10-16', rows: tickers.map((t) => [t, 0, 0, 0, 100, 0, 0, 0]) });
}
const rows = tickers.map((t) => ({ ticker: t, date: '2026-11-05', hour: 'amc' }));

(async () => {
  const realNow = Date.now;
  Date.now = () => realNow.call(Date) - realNow.call(Date) + NOW + (performance.now() | 0);
  try {
    // ② 결측 12종목 전부 429 — 예전 48회(체인 24 + 그릭스 24) → 첫 429 에서 이 흐름 닫힘
    seed(); vendorCalls = []; vendorMode = '429';
    const pack = await EIS.buildImpliedPack(rows, Date.now(), { probeMonthly: true, deadlineMs: Date.now() + 20_000 });
    assert.ok(vendorCalls.length <= 3, `429 뒤 호출 계속 — ${vendorCalls.length}회 (${vendorCalls.slice(0, 6).join(', ')})`);
    assert.equal(Object.values(pack.cells).filter((c) => c.p != null).length, 0, '429 응답으로 값을 만들지 않는다');
    assert.equal([...store.keys()].filter((k) => k.startsWith('earnings:monthly-probe')).length, 0, '429 는 «확인함»으로 저장하지 않는다');
    console.log(`  ✓ ② 12종목 전부 429 → 공급사 호출 ${vendorCalls.length}회(예전 48)`);

    // ③ 느린 체인 — 시간 초과 뒤 다음 페이지·그릭스 등 새 호출이 시작되지 않는다
    seed(); vendorCalls = []; vendorMode = 'slow';
    const t0 = Date.now();
    await EIS.buildImpliedPack(rows.slice(0, 1), t0, { probeMonthly: true, deadlineMs: t0 + 150 });
    const atDeadline = vendorCalls.length;
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(vendorCalls.length, atDeadline, `시간 초과 뒤 새 호출 ${vendorCalls.length - atDeadline}회 (${vendorCalls.slice(atDeadline).join(', ')})`);
    console.log(`  ✓ ③ 시간 초과 뒤 새 공급사 호출 0 (초과 전 ${atDeadline}회)`);

    // 관문 10200855-2: 월간 체인 첫 페이지 성공·ATM 이 든 다음 페이지 500 → 부분 체인 → 값·«확인함» 저장 없음
    seed(); vendorCalls = []; vendorMode = 'partial' as any;
    const pk = await EIS.buildImpliedPack(rows.slice(0, 1), Date.now(), { probeMonthly: true, deadlineMs: Date.now() + 20_000 });
    assert.equal(Object.values(pk.cells).filter((c) => c.p != null).length, 0, `부분 체인으로 값을 만들지 않는다 — ${JSON.stringify(pk.cells)}`);
    assert.equal([...store.keys()].filter((k) => k.startsWith('earnings:monthly-probe')).length, 0, '부분 체인은 «확인함»으로 저장하지 않는다');
    assert.ok(vendorCalls.some((p) => p.includes('/options/chain/')), `체인 조회가 실제로 나갔다 — ${vendorCalls.join(', ')}`);
    console.log(`  ✓ 부분 체인(다음 페이지 500) → 값 없음·저장 없음 (호출 ${vendorCalls.length}회)`);
    console.log('earningsProbeBudget: 3건 통과');
  } finally { Date.now = realNow; }
})().catch((e) => { console.error(e); process.exit(1); });
