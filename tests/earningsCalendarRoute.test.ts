/**
 * /api/market/earnings-calendar — 실패 결과는 90초 캐시한다(2026-09-29 최종 점검① E1)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/earningsCalendarRoute.test.ts
 *
 * 지키는 것:
 *   · FMP 가 빈 응답이면 {rows:[], reason:'fmp-empty'} 를 «실패 키»에 60~120초(90 ± 지터) 남긴다
 *   · 그 안의 요청은 FMP 를 부르지 않고 같은 실패를 돌려준다(_cache:'fail-hit') — 예전엔 요청마다 14일 창 9콜
 *   · 실패 키가 지나면 다시 FMP 를 부른다 · ?fresh=1 은 실패 키를 건너뛴다
 *   · 성공은 예전 그대로(6시간 성공 키 · 실패 키는 쓰지 않는다)
 */
import assert from 'node:assert/strict';

// Redis(EC2 프록시) · FMP · Finnhub 흉내 — 모듈을 부르기 «전에» 환경을 둔다
process.env.FMP_API_KEY = 'test-fmp';
process.env.EC2_REDIS_PROXY_KEY = 'test-proxy';
process.env.FINNHUB_API_KEY = 'test-finnhub';   // 발표 시각 채우기(성공 경로) — 흉내 fetch 가 빈 목록을 준다
const store = new Map<string, { value: unknown; ttl?: number }>();
let fmpMode: 'empty' | 'ok' = 'empty';
let fmpCalls = 0;
const realFetch = globalThis.fetch;
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = new URL(url);
  if (u.pathname === '/get') return Response.json({ result: store.get(u.searchParams.get('key') || '')?.value ?? null });
  if (u.pathname === '/set' && init?.method === 'POST') {
    const b = JSON.parse(init.body || '{}');
    store.set(b.key, { value: b.value, ttl: b.ttl });
    return Response.json({ ok: true });
  }
  if (u.hostname === 'financialmodelingprep.com') {
    fmpCalls += 1;
    if (fmpMode === 'empty') return Response.json([]);
    const from = u.searchParams.get('from') || '2026-10-01';
    return Response.json([{ symbol: 'NVDA', date: from, epsEstimated: 1.1, revenueEstimated: 1e9 }]);
  }
  if (u.hostname.includes('finnhub')) return Response.json({ earningsCalendar: [] });
  return new Response('not found', { status: 404 });
};

const { GET } = require('../src/app/api/market/earnings-calendar/route') as typeof import('../src/app/api/market/earnings-calendar/route');
const FAIL_KEY = 'market:earnings-calendar:v4:fail';
const OK_KEY = 'market:earnings-calendar:v4';

let n = 0;
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const call = async (q = '') => (await GET(new Request(`http://localhost/api/market/earnings-calendar${q}`))).json() as Promise<any>;

(async () => {
  console.log('━━━ E1 실패 결과 90초 캐시 — 되먹임 끊기 ━━━');
  await ta('FMP 빈 응답 → fmp-empty 를 실패 키에(60~120초) · 두 번째 요청은 FMP 0콜', async () => {
    store.clear(); fmpCalls = 0; fmpMode = 'empty';
    const a = await call();
    assert.equal(a.reason, 'fmp-empty');
    assert.deepEqual(a.rows, []);
    const first = fmpCalls;
    assert.ok(first >= 9, `14일 창을 전부 물었다(${first}콜)`);
    const f = store.get(FAIL_KEY);
    assert.ok(f, '실패 키에 남겼다');
    assert.ok(f!.ttl != null && f!.ttl >= 60 && f!.ttl <= 120, `TTL ${f!.ttl}`);
    assert.equal(store.has(OK_KEY), false, '성공 키는 비운 채');
    for (let i = 0; i < 5; i++) {
      const b = await call();
      assert.equal(b._cache, 'fail-hit');
      assert.equal(b.reason, 'fmp-empty', '클라이언트가 실패로 읽는 같은 모양');
      assert.deepEqual(b.rows, []);
    }
    assert.equal(fmpCalls, first, '실패 창 안에서는 FMP 를 다시 부르지 않는다');
  });
  await ta('실패 키가 지나면 다시 FMP · ?fresh=1 은 실패 키를 건너뛴다', async () => {
    fmpCalls = 0;
    await call('?fresh=1');
    assert.ok(fmpCalls >= 9, 'fresh=1 은 벤더를 다시 묻는다');
    store.delete(FAIL_KEY);                  // TTL 만료
    fmpCalls = 0;
    const c = await call();
    assert.equal(c._cache, undefined);
    assert.ok(fmpCalls >= 9);
  });
  await ta('성공은 예전 그대로 — 성공 키 6시간 · 실패 키는 쓰지 않는다 · 다음 요청은 hit', async () => {
    store.clear(); fmpCalls = 0; fmpMode = 'ok';
    const a = await call();
    assert.equal(a.reason, undefined);
    assert.ok(a.rows.length > 0 && a.rows.every((r: any) => r.ticker === 'NVDA'));
    assert.ok(store.has(OK_KEY));
    assert.equal(store.has(FAIL_KEY), false);
    const b = await call();
    assert.equal(b._cache, 'hit');
  });
  (globalThis as any).fetch = realFetch;
  console.log(`\n${n}/${n} 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
