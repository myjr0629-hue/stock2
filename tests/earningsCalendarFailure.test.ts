/** N7 회귀: 외부 I/O 없이 실패 계약·앱 캐시·백오프·언마운트를 재현한다. */
import assert from 'node:assert/strict';
import Module from 'node:module';

function stub(file: string, exports: unknown): void {
  const filename = require.resolve(file);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as Module;
}

let result: any;
stub('../src/services/earningsCalendarService', {
  getMarketEarningsCalendar: async () => {
    if (result instanceof Error) throw result;
    return result;
  },
});
stub('../src/services/redisClient', {
  getFromCache: async () => null,
  setInCache: async () => { throw new Error('unexpected write'); },
});
stub('../src/services/earningsImpliedService', {
  readImpliedPack: async () => null,
  refreshImpliedPack: async () => { throw new Error('unexpected refresh'); },
});
const { GET } = require('../src/app/api/market/earnings-calendar/route');

const row = { ticker: 'NVDA', date: '2026-10-21', hour: 'amc', epsEstimate: 1, revenueEstimate: null, quarter: null, year: null };
const good = { ok: true, rows: [row], generatedAt: '2026-10-19T00:00:00Z' };
const cacheKey = 'signum:earnings-calendar:v1';
const realFetch = globalThis.fetch;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let count = 0;
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  await fn(); count++; console.log(`✓ ${name}`);
}

// 가짜 시계: 90·180·360초를 실제로 기다리지 않으며 타임아웃도 별도로 검증한다.
let clock = 0;
let id = 0;
const timers = new Map<number, { at: number; fn: () => void }>();
const storage = new Map<string, string>();
let blockedStorage = false;
let replies: Array<() => Promise<Response>> = [];
let calls = 0;
let signal: AbortSignal | null | undefined;
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await Promise.resolve(); }
async function advance(ms: number): Promise<void> {
  clock += ms;
  for (const [key, timer] of [...timers]) {
    if (timer.at <= clock) { timers.delete(key); timer.fn(); }
  }
  await flush();
}
const fail = async () => { throw new Error('offline'); };
const reply = (body: unknown, status = 200) => async () => Response.json(body, { status });

function client(initial?: unknown) {
  clock = 0; timers.clear(); storage.clear(); calls = 0; replies = []; blockedStorage = false;
  if (initial !== undefined) storage.set(cacheKey, typeof initial === 'string' ? initial : JSON.stringify(initial));
  delete require.cache[require.resolve('../src/components/app/earningsCalendarData')];
  return require('../src/components/app/earningsCalendarData') as typeof import('../src/components/app/earningsCalendarData');
}

(async () => {
  await test('서버 원천 실패·fail-hit·키 없음 → 503 / ok:false / rows 없음', async () => {
    for (const reason of ['fmp-empty', 'fmp-no-universe-rows', 'no-key', 'upstream-error']) {
      for (const cache of ['miss', 'fail-hit']) {
        result = { ok: false, reason, cache, failedAt: good.generatedAt };
        const response = await GET(new Request('http://localhost/api/market/earnings-calendar'));
        assert.equal(response.status, 503);
        assert.equal(response.headers.get('Retry-After'), '90');
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        const body = await response.json();
        assert.equal(body.ok, false); assert.equal(body.reason, reason);
        assert.equal(body.rows, undefined);
        assert.equal(body.failedAt, good.generatedAt);
        assert.equal(body._cache, cache === 'fail-hit' ? 'fail-hit' : undefined);
      }
    }
  });
  await test('서버 예외 → 503, 정상 0건 → 200 / ok:true / rows:[]', async () => {
    result = new Error('unavailable');
    const failure = await GET(new Request('http://localhost/api/market/earnings-calendar'));
    assert.equal(failure.status, 503); assert.equal((await failure.json()).ok, false);
    result = { ok: true, payload: { ...good, rows: [] }, cache: 'hit' };
    const success = await GET(new Request('http://localhost/api/market/earnings-calendar'));
    assert.equal(success.status, 200);
    const body = await success.json();
    assert.equal(body.ok, true); assert.deepEqual(body.rows, []);
  });

  globalThis.setTimeout = ((fn: () => void, ms: number) => {
    const key = ++id; timers.set(key, { at: clock + ms, fn }); return key;
  }) as any;
  globalThis.clearTimeout = ((key: number) => { timers.delete(key); }) as any;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => { if (blockedStorage) throw new Error('blocked'); return storage.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (blockedStorage) throw new Error('blocked'); storage.set(key, value); },
  } });
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    calls++; signal = init?.signal;
    assert.equal(init?.cache, 'no-store');
    const next = replies.shift();
    return next ? next() : fail();
  }) as typeof fetch;

  await test('캐시 없는 네트워크·503·구버전 200 실패 → 로딩 유지, 최초 + 백오프 3회만', async () => {
    const { watchEarningsCalendar } = client();
    const seen: unknown[] = [];
    replies = [fail, reply({ ok: false, rows: [] }, 503), reply({ ok: true, rows: [], reason: 'fmp-empty' }), fail];
    const stop = watchEarningsCalendar((rows) => seen.push(rows));
    await flush(); assert.equal(calls, 1);
    await advance(89_999); assert.equal(calls, 1);
    await advance(1); assert.equal(calls, 2);
    await advance(180_000); assert.equal(calls, 3);
    await advance(360_000); assert.equal(calls, 4);
    await advance(1_000_000); assert.equal(calls, 4);
    assert.deepEqual(seen, []); assert.equal(storage.has(cacheKey), false); assert.equal(timers.size, 0);
    stop();
  });
  await test('정상 캐시 + 모든 재조회 실패 → 마지막 정상 행·기준 시각 보존', async () => {
    const { watchEarningsCalendar } = client(good);
    const seen: unknown[] = [];
    const stop = watchEarningsCalendar((rows) => seen.push(rows));
    await flush();
    await advance(90_000); await advance(180_000); await advance(360_000);
    assert.equal(calls, 4); assert.deepEqual(seen, [good.rows]);
    assert.deepEqual(JSON.parse(storage.get(cacheKey)!), good); stop();
  });
  await test('재조회 정상 복구 → 새 정상본 저장·재조회 중단·다시 마운트 시 복원', async () => {
    const { watchEarningsCalendar } = client();
    const seen: unknown[] = [];
    replies = [fail, reply(good)];
    const stop = watchEarningsCalendar((rows) => seen.push(rows));
    await flush(); await advance(90_000);
    assert.deepEqual(seen, [good.rows]); assert.equal(timers.size, 0); stop();
    const reload = client(JSON.parse(storage.get(cacheKey)!));
    const restored: unknown[] = [];
    const stop2 = reload.watchEarningsCalendar((rows) => restored.push(rows));
    await flush(); assert.deepEqual(restored, [good.rows]); stop2();
  });
  await test('실제 정상 0건만 [] 전달, 이전 행 캐시도 0건 정상본으로 교체', async () => {
    const { watchEarningsCalendar } = client(good);
    const seen: unknown[] = [];
    replies = [reply({ ...good, rows: [] })];
    const stop = watchEarningsCalendar((rows) => seen.push(rows));
    await flush(); assert.deepEqual(seen, [good.rows, []]);
    assert.deepEqual(JSON.parse(storage.get(cacheKey)!).rows, []); stop();
  });
  await test('이전 0건 캐시·손상 캐시·실패 캐시는 실패 때 0건으로 표시하지 않음', async () => {
    for (const cached of [{ ...good, rows: [] }, '{broken', { ...good, reason: 'fmp-empty' }, { ...good, rows: [null] }]) {
      const { watchEarningsCalendar } = client(cached);
      const seen: unknown[] = [];
      const stop = watchEarningsCalendar((rows) => seen.push(rows));
      await flush(); assert.deepEqual(seen, []); stop();
    }
  });
  await test('성공처럼 보이는 손상 본문·JSON 오류도 정상 캐시를 덮지 못함', async () => {
    for (const response of [reply({ rows: [] }), reply({ ...good, ok: false }), reply({ ...good, rows: [null] }), async () => new Response('{broken')]) {
      const { watchEarningsCalendar } = client(good);
      const seen: unknown[] = [];
      replies = [response];
      const stop = watchEarningsCalendar((rows) => seen.push(rows));
      await flush(); assert.deepEqual(seen, [good.rows]);
      assert.deepEqual(JSON.parse(storage.get(cacheKey)!), good); stop();
    }
  });
  await test('저장소 차단 시에도 메모리 정상본 유지', async () => {
    const { watchEarningsCalendar } = client(); blockedStorage = true;
    replies = [reply(good)];
    const stop = watchEarningsCalendar(() => {}); await flush(); stop();
    const seen: unknown[] = [];
    const stop2 = watchEarningsCalendar((rows) => seen.push(rows));
    await flush(); assert.deepEqual(seen, [good.rows]); stop2();
  });
  await test('60초 무응답은 취소 후 재조회, 언마운트하면 대기 타이머 정리', async () => {
    const { watchEarningsCalendar } = client();
    replies = [() => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })];
    const stop = watchEarningsCalendar(() => { throw new Error('unexpected rows'); });
    await advance(60_000); assert.equal(signal?.aborted, true);
    assert.equal(timers.size, 1); stop(); assert.equal(timers.size, 0);
    await advance(90_000); assert.equal(calls, 1);
  });
  await test('언마운트 후 늦은 정상 응답은 상태·캐시에 반영하지 않음', async () => {
    const { watchEarningsCalendar } = client();
    let resolve!: (response: Response) => void;
    replies = [() => new Promise((done) => { resolve = done; })];
    const seen: unknown[] = [];
    const stop = watchEarningsCalendar((rows) => seen.push(rows));
    stop(); assert.equal(signal?.aborted, true);
    resolve(Response.json(good)); await flush();
    assert.deepEqual(seen, []); assert.equal(storage.has(cacheKey), false); assert.equal(timers.size, 0);
  });
  console.log(`${count} passed`);
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = realFetch; globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout;
  if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});
