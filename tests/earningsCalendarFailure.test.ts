/** N7 회귀: 외부 I/O 없이 실패 계약·앱 캐시·백오프·언마운트를 재현한다. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { daysBetweenYmd, etDateOf } from '../src/lib/marketCalendar';
import { attachImplied, impliedPctText, type RowImplied } from '../src/lib/earnings/earningsImplied';

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
const realDateNow = Date.now;
let nowMs = Date.parse('2026-10-19T12:00:00Z');
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
  Date.now = () => nowMs + clock;
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
    const times: string[] = [];
    const stop = watchEarningsCalendar((rows, at) => { seen.push(rows); times.push(at); });
    await flush();
    await advance(90_000); await advance(180_000); await advance(360_000);
    assert.equal(calls, 4); assert.deepEqual(seen, [good.rows]);
    assert.deepEqual(times, [good.generatedAt]);
    assert.deepEqual(JSON.parse(storage.get(cacheKey)!), good); stop();
  });
  await test('밤 검토 재현: 9/19 저장·9/25 발표 + 10/19 API 실패 → 과거 일정 복원 안 함', async () => {
    const snapshot = { ...good, generatedAt: '2026-09-19T12:00:00Z', rows: [{ ...row, date: '2026-09-25' }] };
    const { watchEarningsCalendar } = client(snapshot);
    const seen: unknown[] = [];
    const stop = watchEarningsCalendar((rows) => seen.push(rows));
    await flush(); await advance(90_000); await advance(180_000); await advance(360_000);
    assert.equal(calls, 4); assert.deepEqual(seen, []);
    assert.deepEqual(JSON.parse(storage.get(cacheKey)!), snapshot); stop();
  });
  await test('최근 캐시의 지난 일정 제외 → 건수·최다 발표일·D−n은 오늘 ET 이후만 집계', async () => {
    const snapshot = { ...good, rows: [
      ...['PAST1', 'PAST2', 'PAST3'].map((ticker) => ({ ...row, ticker, date: '2026-10-18' })),
      { ...row, ticker: 'TODAY', date: '2026-10-19' },
      { ...row, ticker: 'NEXT1', date: '2026-10-20' },
      { ...row, ticker: 'NEXT2', date: '2026-10-20' },
    ] };
    const { watchEarningsCalendar } = client(snapshot);
    const seen: Array<typeof row[]> = [];
    const stop = watchEarningsCalendar<typeof row>((rows) => seen.push(rows));
    await flush();
    assert.equal(seen.length, 1); assert.equal(seen[0].length, 3);
    const counts = new Map<string, number>();
    for (const r of seen[0]) {
      assert.ok(daysBetweenYmd(etDateOf(nowMs), r.date)! >= 0, '음수 D−n 없음');
      counts.set(r.date, (counts.get(r.date) ?? 0) + 1);
    }
    assert.equal(counts.size, 2);
    assert.deepEqual([...counts].sort((a, b) => b[1] - a[1])[0], ['2026-10-20', 2]);
    assert.deepEqual(JSON.parse(storage.get(cacheKey)!), snapshot, '원본은 그대로 보존'); stop();
  });
  await test('ET 자정 경계(여름·겨울): UTC·한국 날짜가 앞서도 ET 오늘 일정 유지', async () => {
    const fixedNow = nowMs;
    try {
      for (const [iso, today, yesterday] of [
        ['2026-10-20T03:59:59Z', '2026-10-19', '2026-10-18'],
        ['2026-10-20T04:00:00Z', '2026-10-20', '2026-10-19'],
        ['2026-12-20T04:59:59Z', '2026-12-19', '2026-12-18'],
        ['2026-12-20T05:00:00Z', '2026-12-20', '2026-12-19'],
      ]) {
        nowMs = Date.parse(iso);
        const { watchEarningsCalendar } = client({ ...good, generatedAt: new Date(nowMs - 60_000).toISOString(),
          rows: [{ ...row, date: yesterday }, { ...row, date: today }] });
        const seen: Array<typeof row[]> = [];
        const stop = watchEarningsCalendar<typeof row>((rows) => seen.push(rows));
        await flush(); assert.deepEqual(seen, [[{ ...row, date: today }]], iso); stop();
      }
    } finally { nowMs = fixedNow; }
  });
  await test('7일 상한: 정확히 7일은 복원, 7일+1ms·미래·잘못된 시각은 거절', async () => {
    for (const [age, valid] of [[7 * 86400_000, true], [7 * 86400_000 + 1, false], [-1, false]] as const) {
      const at = new Date(nowMs - age).toISOString();
      const { watchEarningsCalendar } = client({ ...good, generatedAt: at });
      const seen: unknown[] = [];
      const stop = watchEarningsCalendar((rows, generatedAt) => seen.push({ rows, generatedAt }));
      await flush(); assert.deepEqual(seen, valid ? [{ rows: good.rows, generatedAt: at }] : []); stop();
    }
    const { watchEarningsCalendar } = client({ ...good, generatedAt: 'invalid' });
    const stop = watchEarningsCalendar(() => assert.fail('손상 시각 복원')); await flush(); stop();
  });
  await test('저장소 차단: 메모리도 지난 일정·7일 상한을 재마운트 때 재검사', async () => {
    const fixedNow = nowMs;
    try {
      for (const mode of ['past', 'expired']) {
        nowMs = fixedNow;
        const { watchEarningsCalendar } = client(); blockedStorage = true;
        replies = [reply({ ...good, rows: [{ ...row, date: mode === 'past' ? '2026-10-19' : '2026-11-01' }] })];
        const stop = watchEarningsCalendar(() => {}); await flush(); stop();
        nowMs = fixedNow + (mode === 'past' ? 86400_000 : 8 * 86400_000);
        const seen: unknown[] = [];
        const stop2 = watchEarningsCalendar((rows) => seen.push(rows));
        await flush(); assert.deepEqual(seen, [], mode); stop2();
      }
    } finally { nowMs = fixedNow; }
  });
  await test('10/19 조회 실패 + 10/16 만기 ±4.2% 캐시 → 행 유지·변동폭만 —, 서버와 동일', async () => {
    const implied: RowImplied = { pct: 4.2, expiry: '2026-10-16', basis: 'eod', session: '2026-10-15' };
    const cachedRow = { ...row, implied, brief: { ko: { name: '회사', watch: '관전 포인트' } } };
    const snapshot = { ...good, rows: [cachedRow], generatedAt: '2026-10-16T12:00:00Z' };
    const { watchEarningsCalendar } = client(snapshot);
    const seen: Array<typeof cachedRow[]> = [];
    const stop = watchEarningsCalendar<typeof cachedRow>((rows) => seen.push(rows));
    await flush(); await advance(90_000); await advance(180_000); await advance(360_000);
    assert.equal(calls, 4);
    assert.deepEqual(seen, [[{ ...cachedRow, implied: null }]]);
    assert.equal(impliedPctText(seen[0][0].implied?.pct), '—');
    const server = attachImplied([row], { v: 1, at: nowMs, day: '2026-10-19', cells: {
      [`${row.ticker}|${row.date}`]: { p: 4.2, e: implied.expiry, b: implied.basis, s: implied.session, r: null, f: implied.expiry },
    } });
    assert.equal(seen[0][0].implied, server.rows[0].implied);
    assert.deepEqual(JSON.parse(storage.get(cacheKey)!), snapshot, '정상 원본·기준 시각은 보존');
    stop();
  });
  await test('캐시 복원도 ET 발표 완료 경계·만기 당일·다음 날 경계를 서버와 같이 적용', async () => {
    const implied: RowImplied = { pct: 4.2, expiry: '2026-10-23', basis: 'live', session: '2026-10-19' };
    const fixedNow = nowMs;
    try {
      for (const [iso, date, hour, expiry, valid] of [
        ['2026-10-19T13:29:59Z', '2026-10-19', 'bmo', '2026-10-23', true],
        ['2026-10-19T13:29:59Z', '2026-10-19', 'bmo', '2026-10-19', true],
        ['2026-10-19T13:29:59Z', '2026-10-19', 'amc', '2026-10-19', false],
        ['2026-10-19T13:29:59Z', '2026-10-19', '', '2026-10-19', false],
        ['2026-10-19T13:30:00Z', '2026-10-19', 'bmo', '2026-10-23', false],
        ['2026-10-19T21:59:59Z', '2026-10-19', 'amc', '2026-10-23', true],
        ['2026-10-19T22:00:00Z', '2026-10-19', 'amc', '2026-10-23', false],
        ['2026-10-20T03:59:59Z', '2026-10-19', '', '2026-10-23', true],
        ['2026-10-20T04:00:00Z', '2026-10-19', '', '2026-10-23', false],
        // An expiry before the announcement is invalid even before ET midnight.
        ['2026-10-20T03:59:59Z', '2026-10-21', '', '2026-10-19', false],
        ['2026-10-20T04:00:00Z', '2026-10-21', '', '2026-10-19', false],
      ] as const) {
        nowMs = Date.parse(iso);
        const cachedRow = { ...row, date, hour, implied: { ...implied, expiry } };
        const { watchEarningsCalendar } = client({ ...good, rows: [cachedRow] });
        let restored: RowImplied | null | undefined;
        const stop = watchEarningsCalendar<typeof cachedRow>((rows) => { restored = rows[0].implied; });
        await flush();
        const past = date < etDateOf(nowMs);
        assert.deepEqual(restored, past ? undefined : valid ? cachedRow.implied : null, iso);
        const server = attachImplied([cachedRow], { v: 1, at: nowMs, day: date, cells: {
          [`${row.ticker}|${date}`]: { p: 4.2, e: expiry, b: implied.basis, s: implied.session, r: null, f: expiry },
        } });
        if (!past) assert.deepEqual(restored, server.rows[0].implied, `서버 대조 ${iso}`);
        stop();
      }
    } finally { nowMs = fixedNow; }
  });
  await test('저장소 차단·메모리 캐시도 재마운트 시점에 만기 재검사', async () => {
    const { watchEarningsCalendar } = client(); blockedStorage = true;
    const implied: RowImplied = { pct: 4.2, expiry: '2026-10-19', basis: 'eod', session: '2026-10-16' };
    const cachedRow = { ...row, implied };
    replies = [reply({ ...good, rows: [cachedRow] })];
    const stop = watchEarningsCalendar(() => {}); await flush(); stop();
    const fixedNow = nowMs;
    try {
      nowMs = Date.parse('2026-10-20T12:00:00Z');
      const seen: unknown[] = [];
      const stop2 = watchEarningsCalendar((rows) => seen.push(rows));
      await flush();
      assert.deepEqual(seen, [[{ ...cachedRow, implied: null }]]);
      assert.equal(storage.has(cacheKey), false); stop2();
    } finally { nowMs = fixedNow; }
  });
  await test('재조회 정상 복구 → 새 정상본 저장·재조회 중단·다시 마운트 시 복원', async () => {
    const { watchEarningsCalendar } = client();
    const seen: unknown[] = [];
    replies = [fail, reply(good)];
    const times: string[] = [];
    const stop = watchEarningsCalendar((rows, at) => { seen.push(rows); times.push(at); });
    await flush(); await advance(90_000);
    assert.deepEqual(times, [good.generatedAt]);
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
  Date.now = realDateNow;
  if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});
