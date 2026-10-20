import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { record, NOW } from './earningsScorecardFixture';
import { actualsKey } from '../src/lib/earnings/earningsActuals';

// Redis 모듈을 import 전에 대체: 실제 환경·네트워크·운영 데이터 접근 없음.
const store = new Map<string, unknown>();
let reads = 0, writes = 0, vendors = 0, fail = false;
let keysRead: string[] = [];
require.cache[require.resolve('../src/services/redisClient')] = { exports: {
  mgetFromCache: async (keys: string[]) => {
    reads++; keysRead = keys;
    if (fail) throw new Error('simulated read failure');
    return keys.map((k) => store.get(k) ?? null);
  },
  setInCache: async () => { writes++; throw new Error('writes forbidden'); },
} } as NodeModule;
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { vendors++; throw new Error('network forbidden'); };
const { GET } = require('../src/app/api/earnings/scorecard/route') as typeof import('../src/app/api/earnings/scorecard/route');
const realNow = Date.now;
Date.now = () => NOW;
let n = 0;
async function test(name: string, fn: () => Promise<void>) { await fn(); n++; console.log(`✓ ${name}`); }
const call = (query = '?week=2026-10-12') => GET(new Request(`http://localhost/api/earnings/scorecard${query}`));

(async () => {
  await test('잘못된 주·누락 주는 400/no-store, Redis도 읽지 않음', async () => {
    for (const q of ['', '?week=2026-10-13', '?week=2026-02-30', '?week=invalid']) {
      const res = await call(q);
      assert.equal(res.status, 400); assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal(typeof (await res.json()).error, 'string');
    }
    assert.equal(reads, 0);
  });
  await test('응답 계약·출처·요약, MGET 1회, 결측 생략', async () => {
    store.set(actualsKey('JPM', '2026-10-13'), record('JPM', 3, -5));
    store.set(actualsKey('JNJ', '2026-10-13'), record('JNJ', 3, 0, null));
    // 키와 다른 종목·발표시각은 오염으로 간주한다.
    store.set(actualsKey('C', '2026-10-13'), record('OTHER'));
    store.set(actualsKey('WFC', '2026-10-13'), { ...record('WFC'), hour: 'amc' });
    const res = await call(), data = await res.json();
    assert.equal(res.status, 200); assert.equal(reads, 1);
    assert.ok(keysRead.length > 2 && keysRead.every((k) => /^earnings:actuals:v1:[^:]+:2026-10-1[2-8]$/.test(k)));
    assert.deepEqual(Object.keys(data).sort(), ['asOf', 'dataAsOf', 'notes', 'rows', 'source', 'summary', 'timezone', 'v', 'week', 'weekEnd']);
    assert.equal(data.timezone, 'America/New_York'); assert.equal(data.week, '2026-10-12');
    assert.deepEqual(data.rows.map((r: any) => [r.ticker, r.expectedPct, r.actualPct, r.beyond, r.check]),
      [['JNJ', 3, 0, false, 'intrinio_only'], ['JPM', 3, -5, true, 'fmp']]);
    assert.deepEqual(Object.keys(data.rows[0]).sort(), ['actualPct', 'basis', 'beyond', 'check', 'date', 'expectedPct', 'hour', 'ticker']);
    assert.equal(data.summary.n, 2); assert.equal(data.summary.withinCount, 1); assert.equal(data.summary.beyondCount, 1);
    assert.equal(data.summary.medianAbsActual, 2.5); assert.equal(data.summary.medianExpected, 3);
    assert.equal(data.summary.biggestSurprise.ticker, 'JPM');
    assert.equal(data.asOf, new Date(NOW).toISOString()); assert.equal(typeof data.dataAsOf, 'string');
    assert.match(data.source.records, /earnings:actuals:v1/);
  });
  await test('실제 라우트 JSON → 생성기 → 영어·일본어·한국어 파일', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'signum-scorecard-route-'));
    try {
      const input = join(dir, 'response.json'), output = join(dir, 'drafts');
      await writeFile(input, JSON.stringify(await (await call()).json()));
      execFileSync(process.execPath, ['scripts/earnings-scorecard-post.mjs', '--week', '2026-10-12', '--input', input, '--out', output]);
      assert.deepEqual((await readdir(output)).sort(), ['en.txt', 'ja.txt', 'ko.txt', 'scorecard.json']);
      assert.match(await readFile(join(output, 'en.txt'), 'utf8'), /1 of 2 recorded earnings moves/);
      assert.match(await readFile(join(output, 'ja.txt'), 'utf8'), /2件中1件/);
      assert.match(await readFile(join(output, 'ko.txt'), 'utf8'), /2건 중 1건/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  await test('장중 300초, 장외·주말·휴장·조기폐장 이후 3600초 (ET/DST)', async () => {
    for (const [iso, ttl] of [
      ['2026-10-20T09:29:59-04:00', 3600], ['2026-10-20T09:30:00-04:00', 300],
      ['2026-10-20T15:59:59-04:00', 300], ['2026-10-20T16:00:00-04:00', 3600],
      ['2026-10-24T12:00:00-04:00', 3600], ['2026-11-26T12:00:00-05:00', 3600],
      ['2026-11-27T12:59:59-05:00', 300], ['2026-11-27T13:00:00-05:00', 3600],
      ['2026-11-02T09:30:00-05:00', 300],
    ] as const) {
      Date.now = () => Date.parse(iso);
      assert.equal((await call()).headers.get('cache-control'), `public, max-age=0, s-maxage=${ttl}`, iso);
    }
    Date.now = () => NOW;
  });
  await test('기록 없음은 n=0, 수치 중앙값·최대 이탈은 null', async () => {
    store.clear();
    const data = await (await call()).json();
    assert.deepEqual(data.rows, []);
    assert.deepEqual(data.summary, { n: 0, withinCount: 0, beyondCount: 0, medianAbsActual: null, medianExpected: null, biggestSurprise: null });
    assert.equal(data.dataAsOf, null);
  });
  await test('전파된 읽기 오류는 통계를 만들지 않고 503/no-store', async () => {
    fail = true;
    const res = await call();
    assert.equal(res.status, 503); assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { error: 'scorecard_unavailable' });
    fail = false;
  });
  assert.equal(writes, 0); assert.equal(vendors, 0);
  console.log(`${n} route tests passed; writes=0, vendor/network calls=0`);
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  Date.now = realNow; globalThis.fetch = realFetch;
});
