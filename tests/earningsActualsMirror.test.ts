/**
 * T56b (2026-11-05) — 실적 채점 기록의 Upstash 사본 · EC2 미스 때 사본 읽기 · 크론 자가 복구
 * 실행: node -r ./scripts/offline-test-typescript.cjs --test tests/earningsActualsMirror.test.ts
 *
 * 왜: ElastiCache(volatile-lru) 축출이 11/3·11/4·11/5 세 번 TTL 붙은 채점 기록을 지웠다(11/5 05:47Z 19,894키, 남은 키 111 = TTL 없는 키뿐).
 *   TTL 없는 키는 축출되지 않지만 단일 노드(백업 없음)라 노드 교체·재부팅이면 전부 사라진다 → 쓰기마다 Upstash 사본,
 *   읽기는 EC2 미스일 때만 사본(발표일 기록 키만 — 포인터는 아님), 크론 병합 쓰기는 EC2 미스면 사본의 expected 를 지킨다.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.EC2_REDIS_PROXY_KEY = 'test-proxy';
process.env.FMP_API_KEY = 'test-fmp';
process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

const ec2 = new Map<string, unknown>();
const up = new Map<string, string>();
const ec2Writes: Array<{ key: string; ttl?: number }> = [];
const upCmds: string[] = [];
let upDown = false;
let upHang = false;
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
function upRun(c: (string | number)[]): unknown {
  const op = String(c[0]).toUpperCase();
  upCmds.push(`${op} ${String(c[1] ?? '')}`);
  if (op === 'GET') return up.has(String(c[1])) ? b64(up.get(String(c[1]))!) : null;
  if (op === 'MGET') return c.slice(1).map((k) => (up.has(String(k)) ? b64(up.get(String(k))!) : null));
  if (op === 'SET') { up.set(String(c[1]), String(c[2])); return 'OK'; }
  if (op === 'EVAL') {
    // ACTUALS_MIRROR_SET_LUA 와 같은 규칙: [EVAL, script, 1, key, json]
    assert.equal(String(c[1]), RC.ACTUALS_MIRROR_SET_LUA);
    const key = String(c[3]); const next = JSON.parse(String(c[4]));
    upCmds[upCmds.length - 1] = `EVAL ${key}`;
    const cur = up.has(key) ? JSON.parse(up.get(key)!) : null;
    if (cur && typeof cur === 'object' && typeof next === 'object') {
      if (typeof cur.at === 'number' && typeof next.at === 'number') {
        if (cur.at > next.at) return 0;
        const has = (t: any, k: string) => t[k] != null;
        if (cur.at === next.at && ((has(cur, 'expected') && !has(next, 'expected')) || (has(cur, 'actual') && !has(next, 'actual')))) return 0;
      }
      if (cur.v == null && next.v == null && typeof cur.date === 'string' && typeof next.date === 'string' && cur.date > next.date) return 0;
    }
    up.set(key, String(c[4])); return 1;
  }
  throw new Error('unexpected upstash op ' + op);
}
(globalThis as any).fetch = async (input: any, init?: { method?: string; body?: string }) => {
  const url = String(input);
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('https://upstash.test')) {
    if (upDown) throw new TypeError('fetch failed');
    if (upHang) return new Promise<Response>(() => {});
    const body = JSON.parse(init?.body || '[]');
    if (url.endsWith('/pipeline')) return json((body as (string | number)[][]).map((c) => ({ result: upRun(c) })));
    return json({ result: upRun(body) });
  }
  const u = new URL(url);
  if (u.pathname === '/get') return json({ result: ec2.get(u.searchParams.get('key') || '') ?? null });
  if (u.pathname === '/mget') {
    const keys = (u.searchParams.get('keys') || '').split(',').filter(Boolean).map(decodeURIComponent);
    return json({ results: keys.map((k) => ec2.get(k) ?? null) });
  }
  if (u.pathname === '/set' && init?.method === 'POST') {
    const b = JSON.parse(init.body || '{}');
    ec2.set(b.key, b.value); ec2Writes.push({ key: b.key, ttl: b.ttl });
    return json({ ok: true });
  }
  if (u.hostname === 'financialmodelingprep.com') return json([]);
  return new Response('not found', { status: 404 });
};
const fmpClientPath = require.resolve('../src/lib/fmpClient');
require.cache[fmpClientPath] = { id: fmpClientPath, filename: fmpClientPath, loaded: true,
  exports: { fmpFetch: (url: string) => globalThis.fetch(url) } } as NodeModule;

const A = require('../src/lib/earnings/earningsActuals') as typeof import('../src/lib/earnings/earningsActuals');
const SVC = require('../src/services/earningsActualsService') as typeof import('../src/services/earningsActualsService');
const RC = require('../src/services/redisClient') as typeof import('../src/services/redisClient');
const SC = require('../src/services/earningsScorecardService') as typeof import('../src/services/earningsScorecardService');

const reset = () => { ec2.clear(); up.clear(); ec2Writes.length = 0; upCmds.length = 0; upDown = false; upHang = false; RC._resetEcBreakerForTest(); RC._resetActualsMirrorForTest(); };
const entry = (ticker: string, date: string, hour: 'amc' | 'bmo') => ({
  ticker, date, hour, sourceKind: 'company-pr' as const, sourceUrl: 'https://example.com', announcedOn: '', verifiedAt: '2026-10-11T00:00:00Z', quote: 'x',
}) as any;
const barsFrom = (m: Record<string, Array<[string, number]>>) => async (tk: string) => (m[tk] || []).map(([date, close]) => ({ date, close }));
const jpmBars = barsFrom({ JPM: [['2026-10-09', 332.99], ['2026-10-12', 334.3], ['2026-10-13', 331.43]] });
const NOW_AFTER = Date.parse('2026-10-13T21:30:00Z');
const EXP = { pct: 3.2, method: 'monthly', straddlePct: 3.2, expiry: '2026-10-16', session: '2026-10-12', basis: 'eod', strike: 335, straddle: 10.58, spot: 334.3, capturedAt: 1, src: 'eod-chain' };
const KEY = A.actualsKey('JPM', '2026-10-13');

test('정책 — 발표일 기록 키만 EC2 미스 때 Upstash 사본을 읽는다(포인터·잠금·다른 접두사는 아님)', () => {
  assert.equal(RC.shouldFallbackToUpstash(KEY, true), true);
  assert.equal(RC.shouldFallbackToUpstash('earnings:actuals:v1:BRK.B:2026-11-01', true), true);
  assert.equal(RC.shouldFallbackToUpstash(A.actualsLatestKey('JPM'), true), false, '포인터 미스는 Upstash 를 부르지 않는다(크롤러가 훑는 종목 페이지)');
  assert.equal(RC.shouldFallbackToUpstash('earnings:actuals:v1:run-lock', true), false);
  assert.equal(RC.shouldFallbackToUpstash('earnings:implied:v1:JPM', true), false);
});

test('크론 쓰기 — EC2 에 TTL 없이 쓰고 같은 값을 Upstash 에도 둔다', async () => {
  reset();
  ec2.set(KEY, { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP, actual: null, at: 1 });
  const r = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list: [entry('JPM', '2026-10-13', 'bmo')], deps: { bars: jpmBars, fmp: jpmBars, readObservation: async () => null, runLock: async () => 'ok' } });
  assert.deepEqual(r.actualsSaved, ['JPM|2026-10-13:-0.8585']);
  assert.equal(ec2Writes.at(-1)?.ttl, undefined, 'EC2 TTL 없음');
  const copy = JSON.parse(up.get(KEY) || 'null');
  assert.deepEqual(copy, ec2.get(KEY), 'Upstash 사본 = EC2 값');
  assert.equal(copy.expected.pct, 3.2); assert.equal(copy.actual.pct, -0.8585);
});

test('★ 축출 뒤 — EC2 에 기록이 없어도 크론은 Upstash 사본의 expected 를 지키고 EC2 를 다시 채운다', async () => {
  reset();
  up.set(KEY, JSON.stringify({ v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP, actual: null, at: 1 }));
  await SVC.runActualsCycle({ nowMs: NOW_AFTER, list: [entry('JPM', '2026-10-13', 'bmo')], deps: { bars: jpmBars, fmp: jpmBars, readObservation: async () => null, runLock: async () => 'ok' } });
  const rec = ec2.get(KEY) as any;
  assert.ok(rec, 'EC2 다시 채움');
  assert.equal(rec.expected?.pct, 3.2, '사본의 expected 를 빈 값으로 덮지 않는다');
  assert.equal(rec.actual?.pct, -0.8585);
  assert.equal(JSON.parse(up.get(KEY)!).actual.pct, -0.8585, '사본도 갱신');
});

test('EC2 에 기록이 있으면 Upstash 장애여도 크론 쓰기는 예전처럼 EC2 에 된다', async () => {
  reset();
  upDown = true;
  const t0 = Date.now();
  ec2.set(KEY, { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP, actual: null, at: 1 });
  const r = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list: [entry('JPM', '2026-10-13', 'bmo')], deps: { bars: jpmBars, fmp: jpmBars, readObservation: async () => null, runLock: async () => 'ok' } });
  assert.deepEqual(r.actualsSaved, ['JPM|2026-10-13:-0.8585']);
  assert.equal((ec2.get(KEY) as any).actual.pct, -0.8585);
  assert.ok(Date.now() - t0 < 2000, `Upstash 장애가 크론을 붙잡지 않는다(재시도 0·쿨다운) — ${Date.now() - t0}ms`);
});

test('★ 채점표 읽기 — EC2 미스인 기록은 Upstash 사본으로 채운다(축출돼도 주간 행이 사라지지 않는다)', async () => {
  reset();
  const rec = { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP,
    actual: { pct: -0.8585, baseDate: '2026-10-12', baseClose: 334.3, reactDate: '2026-10-13', reactClose: 331.43, src: 'intrinio-daily', check: 'fmp', at: Date.parse('2026-10-14T00:00:00Z') }, at: 1 };
  up.set(KEY, JSON.stringify(rec));
  const before = upCmds.length;
  const recs = await SVC.readActualRecords([{ ticker: 'JPM', date: '2026-10-13' }]);
  assert.equal(recs.get('JPM|2026-10-13')?.actual?.pct, -0.8585);
  assert.ok(upCmds.slice(before).some((c) => c.startsWith('MGET')), 'EC2 미스분만 Upstash MGET');
  const card = await SC.readEarningsScorecard('2026-10-12', Date.parse('2026-11-05T12:00:00Z'));
  assert.ok((card as any).rows.some((r: any) => r.ticker === 'JPM' && r.date === '2026-10-13'), '채점표에 JPM 행');
});

test('포인터 쓰기도 Upstash 사본을 둔다', async () => {
  reset();
  const rec = { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP,
    actual: { pct: -0.8585, baseDate: '2026-10-12', baseClose: 334.3, reactDate: '2026-10-13', reactClose: 331.43, src: 'intrinio-daily', check: 'fmp', at: Date.parse('2026-10-14T00:00:00Z') }, at: 1 };
  ec2.set(KEY, rec);
  const out = await SVC.syncActualsLatestPointers({ nowMs: Date.parse('2026-11-05T12:00:00Z'), list: [entry('JPM', '2026-10-13', 'bmo')] });
  assert.deepEqual(out.written, ['JPM|2026-10-13']);
  assert.deepEqual(JSON.parse(up.get(A.actualsLatestKey('JPM')) || 'null'), { date: '2026-10-13' });
  assert.equal(ec2Writes.find((w) => w.key === A.actualsLatestKey('JPM'))?.ttl, undefined);
});

test('★ 축출 + Upstash 장애가 겹치면 쓰지 않는다 — 사본의 expected 를 모른 채 덮지 않는다(다음 회차)', async () => {
  reset();
  up.set(KEY, JSON.stringify({ v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP, actual: null, at: 1 }));
  upDown = true;
  const r = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list: [entry('JPM', '2026-10-13', 'bmo')], deps: { bars: jpmBars, fmp: jpmBars, readObservation: async () => null, runLock: async () => 'ok' } });
  assert.equal(ec2.get(KEY), undefined, 'EC2 쓰기 0');
  assert.ok(r.skipped.some((x) => x.reason === 'read_failed'));
  assert.deepEqual(r.actualsSaved, []);
  upDown = false; RC._resetActualsMirrorForTest();
  await SVC.runActualsCycle({ nowMs: NOW_AFTER, list: [entry('JPM', '2026-10-13', 'bmo')], deps: { bars: jpmBars, fmp: jpmBars, readObservation: async () => null, runLock: async () => 'ok' } });
  assert.equal((ec2.get(KEY) as any)?.expected?.pct, 3.2, '다음 회차 — 사본 expected 와 함께 복구');
});

test('Upstash 응답 멈춤 — 사본 요청은 1.5초 상한, 이후 쿨다운으로 바로 건너뛴다', async () => {
  reset();
  ec2.set(KEY, { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP, actual: null, at: 1 });
  upHang = true;
  const t0 = Date.now();
  const ok = await RC.setActualsDurable(KEY, { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP, actual: null, at: 2 });
  const dt = Date.now() - t0;
  assert.equal(ok, true, 'EC2 결과가 답');
  assert.ok(dt >= 1400 && dt < 2500, `상한 ${dt}ms`);
  const t1 = Date.now();
  await RC.setActualsDurable(KEY, { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP, actual: null, at: 3 });
  assert.ok(Date.now() - t1 < 300, '쿨다운 중엔 사본을 기다리지 않는다');
});

test('사본 맞추기 — 없는·다른 사본만 다시 쓰고, 같은 것은 건드리지 않는다', async () => {
  reset();
  const k2 = A.actualsKey('C', '2026-10-13'), k3 = A.actualsKey('GS', '2026-10-13');
  up.set(k2, JSON.stringify({ same: 1 }));
  up.set(k3, JSON.stringify({ old: 1 }));
  const rep = await RC.repairActualsMirror([{ key: KEY, value: { a: 1 } }, { key: k2, value: { same: 1 } }, { key: k3, value: { new: 1 } }, { key: A.actualsKey('X', '2026-10-13'), value: null }]);
  assert.deepEqual(rep.repaired.sort(), [KEY, k3].sort());
  assert.deepEqual(JSON.parse(up.get(k3)!), { new: 1 });
  assert.equal(up.has(A.actualsKey('X', '2026-10-13')), false, 'EC2 값이 없는 키는 사본을 만들지도 지우지도 않는다');
});

test('★ 포인터 — EC2 에서 사라져도 더 최신 사본이 있으면 옛 날짜로 덮지 않고 그 값으로 되살린다', async () => {
  reset();
  const rec = { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP,
    actual: { pct: -0.8585, baseDate: '2026-10-12', baseClose: 334.3, reactDate: '2026-10-13', reactClose: 331.43, src: 'intrinio-daily', check: 'fmp', at: Date.parse('2026-10-14T00:00:00Z') }, at: 1 };
  ec2.set(KEY, rec);
  up.set(A.actualsLatestKey('JPM'), JSON.stringify({ date: '2027-01-14' }));
  const out = await SVC.syncActualsLatestPointers({ nowMs: Date.parse('2026-11-05T12:00:00Z'), list: [entry('JPM', '2026-10-13', 'bmo')] });
  assert.deepEqual(out.written, []);
  assert.deepEqual(ec2.get(A.actualsLatestKey('JPM')), { date: '2027-01-14' }, 'EC2 를 사본 값으로');
  assert.deepEqual(JSON.parse(up.get(A.actualsLatestKey('JPM'))!), { date: '2027-01-14' }, '사본은 그대로');
});

test('포인터 동기화 회차가 기록 사본 누락을 메운다', async () => {
  reset();
  const rec = { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP,
    actual: { pct: -0.8585, baseDate: '2026-10-12', baseClose: 334.3, reactDate: '2026-10-13', reactClose: 331.43, src: 'intrinio-daily', check: 'fmp', at: Date.parse('2026-10-14T00:00:00Z') }, at: 1 };
  ec2.set(KEY, rec);
  ec2.set(A.actualsLatestKey('JPM'), { date: '2026-10-13' });
  const out = await SVC.syncActualsLatestPointers({ nowMs: Date.parse('2026-11-05T12:00:00Z'), list: [entry('JPM', '2026-10-13', 'bmo')] });
  assert.equal(out.mirrorRepaired, 2, '기록 + 포인터');
  assert.deepEqual(JSON.parse(up.get(KEY)!), rec);
});

test('★ 사본 조건부 쓰기 — 늦게 도착한 옛 값(at 이 작음·포인터 날짜가 이름)은 새 사본을 덮지 않는다', async () => {
  reset();
  ec2.set(KEY, { x: 1 });
  up.set(KEY, JSON.stringify({ v: 1, at: 200, tag: 'new' }));
  await RC.setActualsDurable(KEY, { v: 1, at: 100, tag: 'old' });
  assert.equal(JSON.parse(up.get(KEY)!).tag, 'new');
  await RC.setActualsDurable(KEY, { v: 1, at: 300, tag: 'newer' });
  assert.equal(JSON.parse(up.get(KEY)!).tag, 'newer');
  const P = A.actualsLatestKey('JPM');
  up.set(P, JSON.stringify({ date: '2026-11-03' }));
  await RC.setActualsDurable(P, { date: '2026-10-13' });
  assert.deepEqual(JSON.parse(up.get(P)!), { date: '2026-11-03' });
});

test('★ 포인터를 앞으로 옮긴 회차의 사본 맞추기가 옛 포인터로 사본을 되돌리지 않는다', async () => {
  reset();
  const recOf = (d: string, react: string) => ({ v: 1, ticker: 'JPM', date: d, hour: 'bmo', expected: { ...EXP, session: d === '2026-10-13' ? '2026-10-12' : '2027-01-13' },
    actual: { pct: -0.8585, baseDate: '2026-10-12', baseClose: 334.3, reactDate: react, reactClose: 331.43, src: 'intrinio-daily', check: 'fmp', at: Date.parse('2026-10-14T00:00:00Z') }, at: 1 });
  ec2.set(KEY, recOf('2026-10-13', '2026-10-13'));
  ec2.set(A.actualsLatestKey('JPM'), { date: '2026-07-14' });
  up.set(A.actualsLatestKey('JPM'), JSON.stringify({ date: '2026-07-14' }));
  const out = await SVC.syncActualsLatestPointers({ nowMs: Date.parse('2026-11-05T12:00:00Z'), list: [entry('JPM', '2026-10-13', 'bmo')] });
  assert.deepEqual(out.written, ['JPM|2026-10-13']);
  assert.deepEqual(JSON.parse(up.get(A.actualsLatestKey('JPM'))!), { date: '2026-10-13' }, '사본도 새 날짜');
});

test('발표 전 기록(크론 창)의 사본 누락도 맞춘다 · 완성 기록이 하나도 없어도 돈다', async () => {
  reset();
  const k = A.actualsKey('NVDA', '2026-11-07');
  const rec = { v: 1, ticker: 'NVDA', date: '2026-11-07', hour: 'amc', expected: { ...EXP, session: '2026-11-07' }, actual: null, at: 5 };
  ec2.set(k, rec);
  const out = await SVC.syncActualsLatestPointers({ nowMs: Date.parse('2026-11-05T12:00:00Z'), list: [entry('NVDA', '2026-11-07', 'amc')] });
  assert.equal(out.mirrorRepaired, 1);
  assert.deepEqual(JSON.parse(up.get(k)!), rec);
});

test('채점표 읽기 — Upstash 가 멈춰도 사본 채우기는 1.5초 안에 포기하고 EC2 값으로 답한다', async () => {
  reset();
  upHang = true;
  const t0 = Date.now();
  const recs = await SVC.readActualRecords([{ ticker: 'JPM', date: '2026-10-13' }]);
  const dt = Date.now() - t0;
  assert.equal(recs.size, 0);
  assert.ok(dt < 2500, `${dt}ms`);
});

test('★ 같은 at(같은 회차 actual → expected) — 늦게 온 앞선 쓰기(expected 없음)는 expected 있는 사본을 덮지 않는다', async () => {
  reset();
  ec2.set(KEY, { x: 1 });
  up.set(KEY, JSON.stringify({ v: 1, at: 500, expected: EXP, actual: { pct: 1 } }));
  await RC.setActualsDurable(KEY, { v: 1, at: 500, expected: null, actual: { pct: 1 } });
  assert.deepEqual(JSON.parse(up.get(KEY)!).expected, EXP);
  await RC.setActualsDurable(KEY, { v: 1, at: 500, expected: EXP, actual: { pct: 1 }, extra: 1 });
  assert.equal(JSON.parse(up.get(KEY)!).extra, 1, '같은 at 이라도 칸을 비우지 않는 값은 쓴다');
});

test('사본 맞추기는 마감 시각이 가까우면 새 요청을 시작하지 않는다', async () => {
  reset();
  const rep = await RC.repairActualsMirror([{ key: KEY, value: { a: 1 } }], 40, Date.now() + 1000);
  assert.deepEqual(rep, { checked: 0, repaired: [] });
  assert.equal(upCmds.length, 0);
});
