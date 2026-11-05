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
let upDelayMs = 0;
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
    if (upDelayMs) await new Promise((res) => setTimeout(res, upDelayMs));
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
/** 사본 쓰기(유일한 경로 = 사본 맞추기) 한 건 */
const mirrorOne = (key: string, value: unknown) => RC.repairActualsMirror([{ key, value }]);

test('정책 — 사본은 읽지 않는 백업: EC2 미스여도 earnings:actuals 는 Upstash 를 읽지 않는다(읽기 경로 = main)', () => {
  assert.equal(RC.shouldFallbackToUpstash(KEY, true), false);
  assert.equal(RC.shouldFallbackToUpstash(A.actualsLatestKey('JPM'), true), false);
});

test('읽기 — EC2 미스인 기록은 사본이 있어도 비어 있다(main 과 같다) · Upstash 호출 0', async () => {
  reset();
  up.set(KEY, JSON.stringify({ v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP, actual: null, at: 1 }));
  const recs = await SVC.readActualRecords([{ ticker: 'JPM', date: '2026-10-13' }]);
  assert.equal(recs.size, 0);
  assert.equal(upCmds.length, 0);
});

test('★ 사고 대응 — restoreActualsFromMirror 는 EC2 에 «없는» 키만 사본 값으로 되살린다(있는 키·읽기 실패 키는 그대로)', async () => {
  reset();
  const k2 = A.actualsKey('C', '2026-10-13'), k3 = A.actualsKey('GS', '2026-10-13');
  const recv = (tk: string) => ({ v: 1, ticker: tk, date: '2026-10-13', hour: 'bmo', expected: EXP, actual: null, at: 7 });
  const rows = [{ key: KEY, value: recv('JPM') }, { key: k2, value: recv('C') }, { key: k3, value: recv('GS') }, { key: 'earnings:actuals:v1:run-lock', value: '1' }];
  ec2.set(k2, { v: 1, tag: 'ec2-c' });
  const getStrict = async (k: string) => (k === k3 ? { ok: false, value: null } : { ok: true, value: ec2.get(k) ?? null });
  const dry = await SVC.restoreActualsFromMirror({ dryRun: true, deps: { list: async () => rows, getStrict } });
  assert.deepEqual(dry.restored, [KEY]); assert.equal(ec2.has(KEY), false, 'dry 는 쓰기 0');
  const r = await SVC.restoreActualsFromMirror({ deps: { list: async () => rows, getStrict, runLock: async () => 'ok' } });
  assert.deepEqual(r.restored, [KEY]); assert.equal(r.present, 1); assert.deepEqual(r.readFailed, [k3]);
  assert.deepEqual(ec2.get(KEY), recv('JPM'));
  assert.deepEqual(ec2.get(k2), { v: 1, tag: 'ec2-c' }, 'EC2 값은 건드리지 않는다');
  assert.equal(ec2Writes.find((w) => w.key === KEY)?.ttl, undefined, 'TTL 없음');
  assert.equal(ec2.has('earnings:actuals:v1:run-lock'), false);
});
test('★ 크론 채우기 회차는 Upstash 를 부르지 않는다(EC2 경로 = main) · 같은 크론의 포인터 동기화 끝에서 사본이 된다', async () => {
  reset();
  ec2.set(KEY, { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP, actual: null, at: 1 });
  const r = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list: [entry('JPM', '2026-10-13', 'bmo')], deps: { bars: jpmBars, fmp: jpmBars, readObservation: async () => null, runLock: async () => 'ok' } });
  assert.deepEqual(r.actualsSaved, ['JPM|2026-10-13:-0.8585']);
  assert.equal(ec2Writes.at(-1)?.ttl, undefined, 'EC2 TTL 없음');
  assert.equal(upCmds.length, 0, '채우기 회차의 Upstash 호출 0');
  await SVC.syncActualsLatestPointers({ nowMs: Date.parse('2026-11-05T12:00:00Z'), list: [entry('JPM', '2026-10-13', 'bmo')] });
  const copy = JSON.parse(up.get(KEY) || 'null');
  assert.deepEqual(copy, ec2.get(KEY), 'Upstash 사본 = EC2 값');
  assert.equal(copy.expected.pct, 3.2); assert.equal(copy.actual.pct, -0.8585);
});

test('EC2 에 기록이 있으면 Upstash 장애여도 크론 쓰기는 예전처럼 EC2 에 된다', async () => {
  reset();
  upDown = true;
  const t0 = Date.now();
  ec2.set(KEY, { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP, actual: null, at: 1 });
  const r = await SVC.runActualsCycle({ nowMs: NOW_AFTER, list: [entry('JPM', '2026-10-13', 'bmo')], deps: { bars: jpmBars, fmp: jpmBars, readObservation: async () => null, runLock: async () => 'ok' } });
  assert.deepEqual(r.actualsSaved, ['JPM|2026-10-13:-0.8585']);
  assert.equal((ec2.get(KEY) as any).actual.pct, -0.8585);
  assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0}ms`);
  assert.equal(upCmds.length, 0);
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

test('Upstash 응답 멈춤 — 사본 요청은 0.8초 상한, 이후 쿨다운으로 바로 건너뛴다', async () => {
  reset();
  ec2.set(KEY, { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP, actual: null, at: 1 });
  upHang = true;
  const t0 = Date.now();
  const rep = await mirrorOne(KEY, { v: 1, at: 2 });
  const dt = Date.now() - t0;
  assert.deepEqual(rep.repaired, []);
  assert.ok(dt >= 700 && dt < 1500, `상한 ${dt}ms`);
  const t1 = Date.now();
  await mirrorOne(KEY, { v: 1, at: 3 });
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
  await mirrorOne(KEY, { v: 1, at: 100, tag: 'old' });
  assert.equal(JSON.parse(up.get(KEY)!).tag, 'new');
  await mirrorOne(KEY, { v: 1, at: 300, tag: 'newer' });
  assert.equal(JSON.parse(up.get(KEY)!).tag, 'newer');
  const P = A.actualsLatestKey('JPM');
  up.set(P, JSON.stringify({ date: '2026-11-03' }));
  await mirrorOne(P, { date: '2026-10-13' });
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

test('★ 같은 at(같은 회차 actual → expected) — 늦게 온 앞선 쓰기(expected 없음)는 expected 있는 사본을 덮지 않는다', async () => {
  reset();
  ec2.set(KEY, { x: 1 });
  up.set(KEY, JSON.stringify({ v: 1, at: 500, expected: EXP, actual: { pct: 1 } }));
  await mirrorOne(KEY, { v: 1, at: 500, expected: null, actual: { pct: 1 } });
  assert.deepEqual(JSON.parse(up.get(KEY)!).expected, EXP);
  await mirrorOne(KEY, { v: 1, at: 500, expected: EXP, actual: { pct: 1 }, extra: 1 });
  assert.equal(JSON.parse(up.get(KEY)!).extra, 1, '같은 at 이라도 칸을 비우지 않는 값은 쓴다');
});

test('사본 맞추기는 마감 시각이 가까우면 새 요청을 시작하지 않는다', async () => {
  reset();
  const rep = await RC.repairActualsMirror([{ key: KEY, value: { a: 1 } }], 40, Date.now() + 1000);
  assert.deepEqual(rep, { checked: 0, repaired: [] });
  assert.equal(upCmds.length, 0);
});

test('★ 느린 Upstash(성공이지만 0.3초 초과) — 동기화의 사본 일에 더해지는 지연은 첫 느린 호출 1번(≤0.8초)뿐', async () => {
  reset();
  const list = Array.from({ length: 12 }, (_, i) => entry(`T${i}`, '2026-10-13', 'bmo'));
  for (const c of list) ec2.set(A.actualsKey(c.ticker, c.date), { v: 1, ticker: c.ticker, date: c.date, hour: 'bmo', expected: EXP, actual: null, at: 1 });
  upDelayMs = 600;
  const t0 = Date.now();
  await SVC.syncActualsLatestPointers({ nowMs: Date.parse('2026-11-05T12:00:00Z'), list });
  const dt = Date.now() - t0;
  upDelayMs = 0;
  assert.ok(dt < 1200, `${dt}ms`);
});

test('★ 사고 대응 복구는 크론 쓰기 잠금을 얻어야만 쓴다(없음 확인 → 쓰기 사이에 크론이 끼어들지 않게)', async () => {
  reset();
  const rows = [{ key: KEY, value: { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP, actual: null, at: 7 } }];
  const getStrict = async (k: string) => ({ ok: true, value: ec2.get(k) ?? null });
  const busy = await SVC.restoreActualsFromMirror({ deps: { list: async () => rows, getStrict, runLock: async () => 'busy' } });
  assert.equal(busy.locked, true); assert.equal(ec2.has(KEY), false, '잠금 실패 — 쓰기 0');
  const ok = await SVC.restoreActualsFromMirror({ deps: { list: async () => rows, getStrict, runLock: async () => 'ok' } });
  assert.deepEqual(ok.restored, [KEY]);
});

test('★ 복구는 크론이 나중에 지울 수 있는 actual(Intrinio 단독·정착 전)을 비우고 되살린다 — 대조·정착 끝난 actual 만 그대로', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  const base = { v: 1, ticker: 'JPM', date: '2026-10-13', hour: 'bmo', expected: EXP, at: 9 };
  const settled = Date.parse('2026-10-13T20:30:00Z') + A.ACTUAL_SETTLE_MS;   // 10/13 16:00 ET 마감 + 30분 + 2시간
  const act = (check: 'fmp' | null, at: number) => ({ pct: -0.8585, baseDate: '2026-10-12', baseClose: 334.3, reactDate: '2026-10-13', reactClose: 331.43, src: 'intrinio-daily', check, at });
  assert.deepEqual((SVC.restorableValue(KEY, { ...base, actual: act('fmp', settled + 1) }, now) as any).actual.pct, -0.8585, '대조·정착 끝 — 그대로');
  const stripped = SVC.restorableValue(KEY, { ...base, actual: act(null, settled + 1) }, now) as any;
  assert.equal(stripped.actual, null, 'Intrinio 단독 — 비움'); assert.equal(stripped.at, now, '비운 값은 at = 복구 시각(사본 맞추기가 반영)');
  assert.equal((SVC.restorableValue(KEY, { ...base, actual: act('fmp', settled - 1) }, now) as any).actual, null, '정착 전 저장 — 비움');
  assert.equal((SVC.restorableValue(KEY, { ...base, actual: act(null, 1) }, now) as any).expected.pct, 3.2, 'expected 는 그대로');
  assert.equal(SVC.restorableValue(KEY, { v: 9 }, now), null, '모양 오류 — 건너뜀');
  assert.equal(SVC.restorableValue(A.actualsKey('C', '2026-10-13'), { ...base, actual: null }, now), null, '키와 기록이 다르면 건너뜀');
  assert.deepEqual(SVC.restorableValue(A.actualsLatestKey('JPM'), { date: '2026-10-13' }, now), { date: '2026-10-13' });
});

test('사본 맞추기 — 거절(사본이 더 새 값)은 한도를 쓰지 않아 뒤의 기록이 밀리지 않는다', async () => {
  reset();
  const rows: Array<{ key: string; value: unknown }> = [];
  for (let i = 0; i < 3; i++) { const k = A.actualsKey(`OLD${i}`, '2026-10-13'); up.set(k, JSON.stringify({ v: 1, at: 999 })); rows.push({ key: k, value: { v: 1, at: 1 } }); }
  rows.push({ key: KEY, value: { v: 1, at: 5 } });
  const rep = await RC.repairActualsMirror(rows, 1);
  assert.deepEqual(rep.repaired, [KEY]);
  assert.deepEqual(JSON.parse(up.get(KEY)!), { v: 1, at: 5 });
});
