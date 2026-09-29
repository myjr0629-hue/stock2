/**
 * /api/market/earnings-calendar — 실패 결과는 90초 캐시한다(2026-09-29 최종 점검① E1)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/earningsCalendarRoute.test.ts
 *
 * 지키는 것:
 *   · FMP 가 빈 응답이면 {rows:[], reason:'fmp-empty'} 를 «실패 키»에 60~120초(90 ± 지터) 남긴다
 *   · 그 안의 요청은 FMP 를 부르지 않고 같은 실패를 돌려준다(_cache:'fail-hit') — 예전엔 요청마다 14일 창 9콜
 *   · 실패 키가 지나면 다시 FMP 를 부른다 · ?fresh=1 은 실패 키를 건너뛴다
 *   · 성공은 예전 그대로(6시간 성공 키 · 실패 키는 쓰지 않는다)
 * /api/live/earnings(Command 실적 D-n) — 9/30: 미국 동부 «시장 날짜»로 센다(서버 UTC 날짜 아님) · D-n 은 요청마다(캐시에 굳히지 않는다)
 */
import assert from 'node:assert/strict';

// Redis(EC2 프록시) · FMP · Finnhub 흉내 — 모듈을 부르기 «전에» 환경을 둔다
process.env.FMP_API_KEY = 'test-fmp';
process.env.EC2_REDIS_PROXY_KEY = 'test-proxy';
process.env.FINNHUB_API_KEY = 'test-finnhub';   // 발표 시각 채우기(성공 경로) — 흉내 fetch 가 빈 목록을 준다
const store = new Map<string, { value: unknown; ttl?: number }>();
let fmpMode: 'empty' | 'ok' = 'empty';
let fmpCalls = 0;
/** Finnhub 실적 달력 흉내 — 요청한 from~to 창 안의 행만 준다(진짜처럼) · 요청 주소를 적는다 */
let finnhubRows: Array<Record<string, unknown>> = [];
const finnhubUrls: string[] = [];
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
  if (u.hostname.includes('finnhub')) {
    finnhubUrls.push(url);
    const from = u.searchParams.get('from') || '0000-00-00', to = u.searchParams.get('to') || '9999-99-99';
    return Response.json({ earningsCalendar: finnhubRows.filter((r) => String(r.date) >= from && String(r.date) <= to) });
  }
  return new Response('not found', { status: 404 });
};

const { GET } = require('../src/app/api/market/earnings-calendar/route') as typeof import('../src/app/api/market/earnings-calendar/route');
const LIVE = require('../src/app/api/live/earnings/route') as typeof import('../src/app/api/live/earnings/route');
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

  console.log('━━━ /api/live/earnings — 미국 동부 시장 날짜(9/30) ━━━');
  const etAt = (iso: string) => Date.parse(iso);                  // 오프셋 붙은 ET 시각
  const liveAt = async (iso: string, t = 'MU') => {
    const real = Date.now;
    const at = etAt(iso);
    Date.now = () => at;
    try { return await (await LIVE.GET(new Request(`http://localhost/api/live/earnings?t=${t}`) as any)).json() as any; }
    finally { Date.now = real; }
  };
  const MU_ROWS = [
    { symbol: 'MU', date: '2026-09-30', hour: 'amc', epsEstimate: 1.5, quarter: 4, year: 2026 },
    { symbol: 'MU', date: '2026-12-17', hour: 'amc', epsEstimate: 1.7, quarter: 1, year: 2027 },
  ];
  await ta('★ ET 20:30(= UTC 다음 날 00:30 · 한국 오전) — 9/30 실적은 D-1(예전 UTC 계산은 «today») · Finnhub 조회 시작일도 ET 날짜', async () => {
    store.clear(); fmpMode = 'empty'; finnhubRows = MU_ROWS; finnhubUrls.length = 0;
    const r = await liveAt('2026-09-29T20:30:00-04:00');
    assert.equal(r.nextEarningsDate, '2026-09-30');
    assert.equal(r.daysUntilEarnings, 1);
    assert.equal(r.daysLabel, 'D-1');
    assert.equal(new URL(finnhubUrls[0]).searchParams.get('from'), '2026-09-29', '예전엔 UTC 날짜(9/30)부터 물었다');
  });
  await ta('★ 실적 당일 ET 21:00 — 그날 실적이 목록에서 빠지지 않는다(«today») · 예전엔 UTC 날짜로 «지났다» 처리해 12/17 이 나왔다', async () => {
    store.clear(); finnhubUrls.length = 0;
    const r = await liveAt('2026-09-30T21:00:00-04:00');
    assert.equal(r.nextEarningsDate, '2026-09-30');
    assert.equal(r.daysLabel, 'today');
    assert.equal(r.daysUntilEarnings, 0);
    assert.equal(new URL(finnhubUrls[0]).searchParams.get('from'), '2026-09-30');
  });
  await ta('★ D-n 은 요청마다 다시 센다 — ET 23:30 에 담은 캐시를 자정 넘어 00:30 에 읽어도 «today»(캐시에 굳은 D-1 이 아니다)', async () => {
    store.clear(); finnhubUrls.length = 0;
    const a = await liveAt('2026-09-29T23:30:00-04:00');
    assert.equal(a.daysLabel, 'D-1');
    const b = await liveAt('2026-09-30T00:30:00-04:00');
    assert.equal(b._cache, 'hit', '1시간 캐시 안');
    assert.equal(finnhubUrls.length, 1, 'Finnhub 는 한 번만');
    assert.equal(b.daysLabel, 'today');
    assert.equal(b.daysUntilEarnings, 0);
    assert.equal(b.color, 'text-rose-400');
  });
  await ta('다가오는 실적이 없으면 마지막 실적을 D+n 으로(예전과 같은 규칙) · 날짜 없으면 TBD', async () => {
    store.clear();
    finnhubRows = [{ symbol: 'NKE', date: '2026-10-01', hour: 'amc' }];
    const r = await liveAt('2026-10-03T12:00:00-04:00', 'NKE');
    assert.equal(r.hasData, false, 'Finnhub 창(ET 오늘부터)에 지난 실적은 없다 → TBD');
    assert.equal(r.daysLabel, 'TBD');
    finnhubRows = [];
  });
  (globalThis as any).fetch = realFetch;
  console.log(`\n${n}/${n} 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
