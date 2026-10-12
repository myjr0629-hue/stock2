/**
 * 구조 판본 사전 갱신 (2026-10-13) — 새 EOD 레코드가 올라온 직후 상위 종목의 structure:v2 를 미리 다시 계산한다.
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/structureWarm.test.ts
 *
 * 지키는 것:
 *   1. 호출 관문 — 초당 상한 간격 · 동시성 · 429 에 물러섰다 다시(속도 절반) · 빈 응답/오류는 «연속»일 때만 사건 · 사건이 쌓이면 닫힌다
 *   2. 사용자 경로 불변 — 관문 밖(저장소 없음)의 callIntrinio 는 아무것도 세지 않고 아무것도 기다리지 않는다 · 관문 안 호출만 센다
 *   3. 계획 — 새 레코드가 필요한 판본만(체인 날짜가 이르다 · 날짜 없는 판본은 공표 시각 전에 만든 것) · 우선순위 · 시도 상한 · 서머타임/표준시 공표 시각
 *   4. 라우트 — 끄는 스위치 · 공급사 날짜 모름 · 할 일 없음(done) · 정상 갱신 · 429 로 중단(2번 중단하면 포기) · behind 시도 상한 · 도중에 끄기 · dry · 인증
 *   5. 구조 — 사용자 경로 파일은 관문/계획을 가져가지 않는다 · 크론 등록 · 조각 키가 structure-build 와 같다
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.INTRINIO_API_KEY = 'test-key';

const G = require('../src/lib/intrinioWarmGate') as typeof import('../src/lib/intrinioWarmGate');
const P = require('../src/lib/structureWarmPlan') as typeof import('../src/lib/structureWarmPlan');

let pass = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e: any) { console.error(`  ✗ ${name}\n    ${e?.stack || e}`); process.exitCode = 1; }
};

/** 가짜 시계 — sleep 이 시계를 앞으로 민다(실제로 기다리지 않는다) */
function fakeClock() {
  let ms = 1_000_000;
  return { now: () => ms, sleep: async (d: number) => { ms += d; }, advance: (d: number) => { ms += d; }, get t() { return ms; } };
}
const mk = (c: ReturnType<typeof fakeClock>, o: Partial<import('../src/lib/intrinioWarmGate').WarmGateOpts> = {}) =>
  G.createWarmGate({ maxPerSec: 4, maxConcurrent: 2, backoffMs: [15_000, 30_000, 60_000], maxIncidents: 3, now: c.now, sleep: c.sleep, ...o });

(async () => {
  console.log('1. 호출 관문');
  await t('초당 4콜 = 호출 시작 간격 250ms (순차 5콜 → 1,000ms)', async () => {
    const c = fakeClock(); const g = mk(c);
    const starts: number[] = [];
    for (let i = 0; i < 5; i++) { await g.enter(); starts.push(c.t); g.leave({ status: 200, empty: false }); }
    assert.deepEqual(starts.slice(1).map((x, i) => x - starts[i]), [250, 250, 250, 250]);
    assert.equal(g.stats().calls, 5);
  });
  await t('동시 2콜 상한 — 세 번째 enter 는 leave 가 있을 때까지 기다린다', async () => {
    const c = fakeClock(); const g = mk(c);
    await g.enter(); await g.enter();
    let third = false;
    const p = g.enter().then(() => { third = true; });
    await new Promise((r) => setImmediate(r));
    assert.equal(third, false);
    g.leave({ status: 200, empty: false });
    await p;
    assert.equal(third, true);
  });
  await t('429 한 번 = 사건: 15초 쉬고, 간격이 두 배(500ms)로 늘고, 사건이 세 번이면 닫혀 enter 가 던진다', async () => {
    const c = fakeClock(); const g = mk(c);
    await g.enter(); g.leave({ status: 429, empty: false });
    const before = c.t;
    await g.enter();
    assert.ok(c.t - before >= 15_000, `쉼 ${c.t - before}`);
    g.leave({ status: 200, empty: false });
    const s1 = c.t; await g.enter(); assert.ok(c.t - s1 >= 500, `간격 ${c.t - s1}`);
    g.leave({ status: 429, empty: false });
    await g.enter(); g.leave({ status: 429, empty: false });
    assert.equal(g.aborted, true);
    assert.equal(g.stats().status429, 3);
    await assert.rejects(() => g.enter(), (e: any) => e.name === 'WarmGateAborted');
  });
  await t('빈 응답 한 번은 사건이 아니다(실시간 그릭스 없는 종목의 contracts: []) — 연속 3번이면 사건, 정상 응답이 끼면 끊긴다', async () => {
    const c = fakeClock(); const g = mk(c);
    for (let i = 0; i < 2; i++) { await g.enter(); g.leave({ status: 200, empty: true }); }
    assert.equal(g.stats().incidents, 0);
    await g.enter(); g.leave({ status: 200, empty: false });
    for (let i = 0; i < 2; i++) { await g.enter(); g.leave({ status: 200, empty: true }); }
    assert.equal(g.stats().incidents, 0, '정상 응답이 연속을 끊는다');
    await g.enter(); g.leave({ status: 200, empty: true });
    assert.equal(g.stats().incidents, 1);
  });
  await t('연속 오류(5xx·네트워크 0) 5번 = 사건 하나 · 404 같은 정상 «없음»은 오류가 아니다', async () => {
    const c = fakeClock(); const g = mk(c, { sleep: async (d) => { c.advance(d); } });
    for (let i = 0; i < 4; i++) { await g.enter(); g.leave({ status: 404, empty: false }); }
    assert.equal(g.stats().errors, 0);
    for (let i = 0; i < 5; i++) { await g.enter(); g.leave({ status: i % 2 ? 503 : 0, empty: false }); }
    assert.equal(g.stats().incidents, 1);
  });
  await t('close() 는 기다리던 enter 를 깨워 던지게 한다', async () => {
    const c = fakeClock(); const g = mk(c, { maxConcurrent: 1 });
    await g.enter();
    const p = g.enter();
    g.close();
    await assert.rejects(p, (e: any) => e.name === 'WarmGateAborted');
  });

  console.log('2. 사용자 경로 불변 (callIntrinio 통합)');
  const realFetch = globalThis.fetch;
  let hits = 0; let mode: 'ok' | '429' = 'ok';
  (globalThis as any).fetch = async (url: any) => {
    const u = String(url);
    if (u.includes('api-v2.intrinio.com')) {
      hits++;
      if (mode === '429') return new Response('{"error":"slow down"}', { status: 429 });
      return Response.json({ chain: [{ option: { code: 'X' }, prices: { date: '2026-10-09' } }] });
    }
    return new Response('not found', { status: 404 });
  };
  const IC = require('../src/services/intrinioClient') as typeof import('../src/services/intrinioClient');
  await t('관문 밖 호출은 관문을 보지 않는다(저장소 없음) — 같은 응답·기다림 없음', async () => {
    const c = fakeClock(); const g = mk(c); // 만들기만 하고 runInWarmGate 로 감싸지 않는다
    const r = await IC.intrinioOptionsDiagGet('options/chain/AAA/2026-10-16/eod', { n: 'outside-1' });
    assert.equal(r.chain.length, 1);
    assert.equal(g.stats().calls, 0);
    assert.equal(G.warmGateStore.getStore(), undefined);
  });
  await t('관문 안 호출은 센다(실제 HTTP 만 — 합치기/캐시 적중은 안 센다)', async () => {
    const c = fakeClock(); const g = mk(c);
    hits = 0;
    await G.runInWarmGate(g, async () => {
      await IC.intrinioOptionsDiagGet('options/chain/BBB/2026-10-16/eod', { n: 'in-1' });
      await IC.intrinioOptionsDiagGet('options/chain/BBB/2026-10-16/eod', { n: 'in-2' });
    });
    assert.equal(g.stats().calls, 2);
    assert.equal(hits, 2);
  });
  await t('관문 안에서 429 → 사건으로 세고 물러선다(callIntrinio 재시도 2번 모두 관문을 지난다)', async () => {
    const c = fakeClock(); const g = mk(c);
    mode = '429';
    await G.runInWarmGate(g, async () => {
      await IC.intrinioOptionsDiagGet('options/chain/CCC/2026-10-16/eod', { n: 'in-429' }).then(() => assert.fail('던져야 한다'), () => undefined);
    });
    mode = 'ok';
    const s = g.stats();
    assert.equal(s.status429, 2);
    assert.ok(s.incidents >= 2);
    assert.ok(s.pausedMs >= 15_000, `쉼 ${s.pausedMs}`);
  });
  await t('관문이 닫힌 뒤의 호출은 던진다(벤더로 나가지 않는다)', async () => {
    const c = fakeClock(); const g = mk(c); g.close();
    hits = 0;
    await G.runInWarmGate(g, async () => {
      await IC.intrinioOptionsDiagGet('options/chain/DDD/2026-10-16/eod', { n: 'closed' }).then(() => assert.fail('던져야 한다'), (e: any) => assert.equal(e.name, 'WarmGateAborted'));
    });
    assert.equal(hits, 0);
  });
  await t('probeVendorEodDate — SPY 가까운 만기 체인이 스스로 밝힌 가장 늦은 날짜', async () => {
    (globalThis as any).fetch = async (url: any) => {
      const u = String(url);
      if (u.includes('/options/expirations/SPY/eod')) return Response.json({ expirations: ['2099-01-01', '2099-01-02'] });
      if (u.includes('/options/chain/SPY/2099-01-01/eod')) return Response.json({ chain: [{ prices: { date: '2026-10-08' } }, { prices: { date: '2026-10-09' } }] });
      return new Response('x', { status: 404 });
    };
    assert.equal(await IC.probeVendorEodDate(), '2026-10-09');
    (globalThis as any).fetch = async () => new Response('x', { status: 500 });
    assert.equal(await IC.probeVendorEodDate(), null);
  });
  (globalThis as any).fetch = realFetch;

  console.log('3. 계획');
  const info = (o: Partial<import('../src/lib/structureWarmPlan').WarmInfo> = {}): import('../src/lib/structureWarmPlan').WarmInfo =>
    ({ hasVersion: true, chainDate: '2026-10-08', timestamp: 1, status: 'OK', usable: true, legacy: false, ...o });
  const readyAt = P.warmReadyAtMs('2026-10-09')!;
  await t('공표 시각: 서머타임 10/9 16:50 ET = 20:50Z · 표준시 11/6 16:50 ET = 21:50Z', () => {
    assert.equal(new Date(P.warmReadyAtMs('2026-10-09')!).toISOString(), '2026-10-09T20:50:00.000Z');
    assert.equal(new Date(P.warmReadyAtMs('2026-11-06')!).toISOString(), '2026-11-06T21:50:00.000Z');
    assert.equal(P.warmReadyAtMs('garbage'), null);
  });
  await t('needsWarm — 체인 날짜가 이르면 필요 · 같거나 늦으면 불필요', () => {
    assert.equal(P.needsWarm(info({ chainDate: '2026-10-08' }), '2026-10-09', readyAt), true);
    assert.equal(P.needsWarm(info({ chainDate: '2026-10-09' }), '2026-10-09', readyAt), false);
    assert.equal(P.needsWarm(info({ chainDate: '2026-10-12' }), '2026-10-09', readyAt), false);
  });
  await t('needsWarm — 날짜 없는 판본은 공표 시각보다 먼저 만들었으면 필요(토요일 판본), 뒤에 만들었으면 불필요', () => {
    assert.equal(P.needsWarm(info({ chainDate: null, timestamp: readyAt - 1 }), '2026-10-09', readyAt), true);
    assert.equal(P.needsWarm(info({ chainDate: null, timestamp: readyAt + 1 }), '2026-10-09', readyAt), false);
    assert.equal(P.needsWarm(info({ chainDate: null, timestamp: null }), '2026-10-09', readyAt), true);
    assert.equal(P.needsWarm(info({ chainDate: null, timestamp: 1 }), '2026-10-09', null), false, '공표 시각을 모르면 날짜 없는 판본은 건드리지 않는다');
  });
  await t('needsWarm — 판본 없음/못 씀/옛 모양은 필요 · 옵션 없음(NO_MARKET)은 불필요 · 정보 자체가 없으면 필요', () => {
    assert.equal(P.needsWarm(info({ hasVersion: false }), '2026-10-09', readyAt), true);
    assert.equal(P.needsWarm(info({ usable: false, chainDate: '2026-10-09' }), '2026-10-09', readyAt), true);
    assert.equal(P.needsWarm(info({ legacy: true, chainDate: '2026-10-09' }), '2026-10-09', readyAt), true);
    assert.equal(P.needsWarm(info({ status: 'NO_MARKET' }), '2026-10-09', readyAt), false);
    assert.equal(P.needsWarm(undefined, '2026-10-09', readyAt), true);
  });
  await t('buildWarmTargets — 고정 ETF → 열람 수요 → 핵심(미결제약정 큰 순) → 그 밖, 중복 없이 n개 · 잘못된 티커 제외', () => {
    const oi = new Map<string, number>([['AAA', 100], ['BBB', 900], ['CCC', 500], ['DDD', 800], ['EEE', 50], ['bad ticker', 9999]]);
    const out = P.buildWarmTargets({ pinned: ['SPY', 'QQQ'], demand: [{ ticker: 'EEE', score: 5 }, { ticker: 'SPY', score: 9 }, { ticker: 'AAA', score: 7 }], oi, core: ['CCC', 'BBB', 'AAA'] }, 7);
    assert.deepEqual(out, ['SPY', 'QQQ', 'AAA', 'EEE', 'BBB', 'CCC', 'DDD']);
    assert.deepEqual(P.buildWarmTargets({ pinned: ['SPY'], demand: [], oi: new Map(), core: [] }, 0), []);
  });
  await t('pickWarmBatch — 필요한 것만 우선순위 순 · 시도 상한(2)에 걸린 종목은 제외 · 한 번에 maxPerRun', () => {
    const infos = new Map([['A', info({ chainDate: '2026-10-09' })], ['B', info()], ['C', info()], ['D', info()], ['E', info()]]);
    const r = P.pickWarmBatch(['A', 'B', 'C', 'D', 'E'], infos, '2026-10-09', readyAt, { C: 2, D: 1 }, { maxPerRun: 2 });
    assert.deepEqual(r.needing, ['B', 'C', 'D', 'E']);
    assert.deepEqual(r.exhausted, ['C']);
    assert.deepEqual(r.batch, ['B', 'D']);
  });
  await t('classifyWarmResult / bumpTries — behind·fail 만 시도로 센다(skip 은 안 센다)', () => {
    assert.equal(P.classifyWarmResult({ outcome: 'stored', chainDate: '2026-10-09' }, '2026-10-09'), 'ok');
    assert.equal(P.classifyWarmResult({ outcome: 'stored', chainDate: null }, '2026-10-09'), 'ok');
    assert.equal(P.classifyWarmResult({ outcome: 'stored', chainDate: '2026-10-08' }, '2026-10-09'), 'behind');
    assert.equal(P.classifyWarmResult({ outcome: 'not-stored', chainDate: '2026-10-09' }, '2026-10-09'), 'fail');
    assert.equal(P.classifyWarmResult({ outcome: 'error', chainDate: null }, '2026-10-09'), 'fail');
    assert.equal(P.classifyWarmResult({ outcome: 'skipped-lock', chainDate: null }, '2026-10-09'), 'skip');
    assert.deepEqual(P.bumpTries({}, 'A', 'ok'), {});
    assert.deepEqual(P.bumpTries({}, 'A', 'skip'), {});
    assert.deepEqual(P.bumpTries({ A: 1 }, 'A', 'behind'), { A: 2 });
  });
  await t('oiMapFromParts — 조각 행에서 종목별 총 미결제약정(큰 값)', () => {
    const m = P.oiMapFromParts([{ rows: [{ t: 'NVDA', oi: 5 }, { t: 'x y', oi: 9 }] }, null, { rows: [{ t: 'NVDA', oi: 7 }, { t: 'AAPL', oi: 0 }] }]);
    assert.equal(m.get('NVDA'), 7);
    assert.equal(m.has('AAPL'), false);
    assert.equal(m.size, 1);
  });

  console.log('4. 라우트');
  // 모듈 대체 — 인메모리 Redis · 가짜 공급사 날짜 · 가짜 판본 정보/갱신
  const mem = new Map<string, any>();
  const R = require.resolve('../src/services/redisClient');
  const IClient = require.resolve('../src/services/intrinioClient');
  const SS = require.resolve('../src/services/structureService');
  const DD = require.resolve('../src/lib/ai/deepDemand');
  const stub = (id: string, exports: any) => { require.cache[id] = { id, filename: id, loaded: true, exports, children: [], paths: [] } as any; };
  stub(R, { getFromCache: async (k: string) => (mem.has(k) ? mem.get(k) : null), setInCache: async (k: string, v: any) => { mem.set(k, JSON.parse(JSON.stringify(v))); return true; }, mgetFromCache: async (ks: string[]) => ks.map((k) => (mem.has(k) ? mem.get(k) : null)) });
  let vendorEod: string | null = '2026-10-09';
  stub(IClient, { probeVendorEodDate: async () => vendorEod });
  stub(DD, { loadDemandTop: async () => [{ ticker: 'TSLA', score: 9 }] });
  let infoOf: (t: string) => any = () => ({ hasVersion: true, chainDate: '2026-10-08', timestamp: 1, status: 'OK', usable: true, legacy: false });
  const refreshed: string[] = [];
  let refreshImpl: (t: string, o: any) => Promise<any> = async (tk) => ({ ticker: tk, outcome: 'stored', chainDate: '2026-10-09', status: 'OK', partial: false, ms: 1 });
  stub(SS, {
    inspectStoredVersions: async (ts: string[]) => new Map(ts.map((x) => [x, infoOf(x)])),
    refreshStructureForWarm: async (tk: string, o: any) => { refreshed.push(tk); return refreshImpl(tk, o); },
  });
  const Route = require('../src/app/api/cron/structure-warm/route') as typeof import('../src/app/api/cron/structure-warm/route');
  const call = async (qs = '', headers: Record<string, string> = {}) => {
    const res = await Route.GET(new Request(`https://x.test/api/cron/structure-warm${qs}`, { headers }) as any);
    return res.json();
  };
  const reset = () => { mem.clear(); refreshed.length = 0; vendorEod = '2026-10-09'; infoOf = () => ({ hasVersion: true, chainDate: '2026-10-08', timestamp: 1, status: 'OK', usable: true, legacy: false }); refreshImpl = async (tk) => ({ ticker: tk, outcome: 'stored', chainDate: '2026-10-09', status: 'OK', partial: false, ms: 1 }); };
  const FORCE = '?force=1&max=6'; // 휴장/주말에도 돌고, 한 번에 6종목

  await t('끄는 스위치 structure-warm:off 가 있으면 아무것도 안 한다', async () => {
    reset(); mem.set(P.WARM_OFF_KEY, 1);
    const r = await call(FORCE);
    assert.equal(r.skipped, 'off');
    assert.equal(refreshed.length, 0);
  });
  await t('공급사 날짜를 모르면(probe 실패) 건너뛴다', async () => {
    reset(); vendorEod = null;
    const r = await call(FORCE);
    assert.equal(r.skipped, 'vendor-date-unknown');
    assert.equal(refreshed.length, 0);
  });
  await t('정상 — 새 레코드가 필요한 종목을 우선순위 순으로 갱신, 호출 관문 요약·남은 수를 싣는다', async () => {
    reset();
    const r = await call('?force=1&max=20');
    assert.equal(r.vendorEod, '2026-10-09');
    assert.equal(r.refreshed.ok, 20);
    assert.equal(refreshed.length, 20);
    assert.deepEqual(refreshed.slice(0, 2).sort(), ['QQQ', 'SPY'], '고정 ETF 가 먼저(종목 둘을 동시에 시작한다)');
    assert.ok(refreshed.indexOf('TSLA') >= P.WARM_PINNED.length - 1, '열람 수요 종목은 고정 ETF 다음');
    assert.ok(refreshed.includes('TSLA'), '열람 수요 종목');
    assert.ok(r.remaining > 0, '남은 종목이 있다 → 다음 실행이 이어서');
    assert.ok(r.gate && typeof r.gate.calls === 'number');
    assert.ok(mem.get(P.WARM_LAST_KEY), '실행 요약 저장');
  });
  await t('모두 끝나면 done 표시 → 다음 실행은 공급사 날짜만 묻고 건너뛴다', async () => {
    reset(); infoOf = () => ({ hasVersion: true, chainDate: '2026-10-09', timestamp: 1, status: 'OK', usable: true, legacy: false });
    const r1 = await call(FORCE);
    assert.equal(r1.done, true);
    assert.equal(refreshed.length, 0);
    const r2 = await call('');
    assert.equal(r2.skipped, 'done');
  });
  await t('429 로 관문이 닫히면 멈춘다 — 중단 2번이면 그 공급사 날짜는 포기(gave-up), 나머지는 기존 SWR', async () => {
    reset();
    refreshImpl = async (tk) => {
      const gate = G.warmGateStore.getStore()!;
      for (let i = 0; i < 3; i++) gate.leave({ status: 429, empty: false }); // 사건 3번 → 닫힘
      return { ticker: tk, outcome: 'not-stored', chainDate: null, status: null, partial: true, ms: 1 };
    };
    const a = await call(FORCE);
    assert.equal(a.stopped, 'gate-aborted');
    assert.equal(a.gate.aborted, true);
    assert.ok(refreshed.length <= 2, `닫힌 뒤 더 시작하지 않는다(${refreshed.length})`);
    const b = await call(FORCE);
    assert.equal(b.stopped, 'gate-aborted');
    const c = await call('');
    assert.equal(c.skipped, 'gave-up');
    assert.equal(mem.get(P.warmStateKey('2026-10-09')).aborts, 2);
    // 관문이 닫힌 뒤의 실패는 종목 탓이 아니라 시도로 세지 않는다
    assert.deepEqual(Object.keys(mem.get(P.warmStateKey('2026-10-09')).tries || {}), []);
  });
  await t('behind(공급사가 그 종목만 아직 새 레코드를 안 냄)는 시도 상한 2번까지만 다시', async () => {
    reset();
    refreshImpl = async (tk) => ({ ticker: tk, outcome: 'stored', chainDate: '2026-10-08', status: 'OK', partial: false, ms: 1 });
    const q = '?force=1&t=AAA,BBB';
    const a = await call(q); assert.equal(a.refreshed.behind, 2);
    const b = await call(q); assert.equal(b.refreshed.behind, 2);
    refreshed.length = 0;
    const c = await call(q);
    assert.equal(refreshed.length, 0, '상한 뒤에는 다시 부르지 않는다');
    assert.equal(c.exhausted, 2);
  });
  await t('도중에 스위치를 켜면 멈춘다(5종목마다 확인)', async () => {
    reset();
    refreshImpl = async (tk) => { if (refreshed.length === 5) mem.set(P.WARM_OFF_KEY, 1); return { ticker: tk, outcome: 'stored', chainDate: '2026-10-09', status: 'OK', partial: false, ms: 1 }; };
    const r = await call('?force=1&max=40');
    assert.equal(r.stopped, 'off-switch');
    assert.ok(refreshed.length < 40);
  });
  await t('dry=1 은 계획만 — 갱신 0, 기록 0', async () => {
    reset();
    const r = await call('?force=1&dry=1');
    assert.equal(r.dry, true);
    assert.ok(r.plan.length > 0);
    assert.equal(refreshed.length, 0);
    assert.equal(mem.has(P.WARM_LAST_KEY), false);
  });
  await t('운영에서는 크론 비밀로 인증된 호출만(401)', async () => {
    reset();
    const env = process.env as any; const prevNode = env.NODE_ENV; const prevSecret = process.env.CRON_SECRET;
    env.NODE_ENV = 'production'; process.env.CRON_SECRET = 's3cret';
    try {
      assert.equal((await call(FORCE)).error, 'Unauthorized');
      assert.equal((await call(FORCE, { authorization: 'Bearer s3cret' })).vendorEod, '2026-10-09');
    } finally { env.NODE_ENV = prevNode; if (prevSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prevSecret; }
  });

  console.log('5. 구조');
  const root = path.join(__dirname, '..');
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
  await t('관문·계획을 가져가는 파일은 intrinioClient(관문)와 크론 라우트뿐 — 사용자 경로 라우트는 안 가져간다', () => {
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
        const rel = path.join(d, e.name);
        if (e.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(e.name) && /from\s+['"][^'"]*(intrinioWarmGate|structureWarmPlan)['"]/.test(fs.readFileSync(path.join(root, rel), 'utf8'))) hits.push(rel);
      }
    };
    walk('src');
    assert.deepEqual(hits.sort(), [
      'src/app/api/cron/structure-warm/route.ts',
      'src/services/intrinioClient.ts',
    ]);
  });
  await t('callIntrinio 의 관문 호출은 getStore() 가 있을 때만(사용자 경로 불변) — enter/leave 가 한 쌍', () => {
    const src = read('src/services/intrinioClient.ts');
    assert.ok(/const warmGate = warmGateStore\.getStore\(\);/.test(src));
    assert.equal((src.match(/if \(warmGate\) await warmGate\.enter\(\)/g) || []).length, 1);
    assert.equal((src.match(/if \(warmGate\) warmGate\.leave\(/g) || []).length, 1);
  });
  await t('structureService 의 새 옵션(expectChainDate·noPartialStore)은 사전 갱신 경로에서만 싣는다', () => {
    const svc = read('src/services/structureService.ts');
    // 정의 + 사용(프로브 거름·저장 거름) 외에 값을 «싣는» 곳은 refreshStructureForWarm 하나
    assert.equal((svc.match(/expectChainDate: opts\.expectChainDate/g) || []).length, 1);
    assert.equal((svc.match(/noPartialStore: true/g) || []).length, 1);
    // 기존 갱신 경로(scheduleRefresh)는 옵션을 싣지 않는다
    const sched = svc.slice(svc.indexOf('function scheduleRefresh('), svc.indexOf('/**\n * 계산 경로 옵션'));
    assert.ok(!/expectChainDate|noPartialStore/.test(sched));
  });
  await t('크론 등록 — 평일 장 마감 뒤 15분마다(20:45~23:45 UTC) + 개장 전 12:40·13:10 UTC', () => {
    const v = JSON.parse(read('vercel.json'));
    const mine = (v.crons as Array<{ path: string; schedule: string }>).filter((c) => c.path === '/api/cron/structure-warm').map((c) => c.schedule).sort();
    assert.deepEqual(mine, ['0,15,30,45 21-23 * * 1-5', '10 13 * * 1-5', '40 12 * * 1-5', '45 20 * * 1-5']);
  });
  await t('조각 키가 structure-build 와 같다(인기 순위 입력)', () => {
    assert.ok(read('src/app/api/cron/structure-build/route.ts').includes('`structure:part:v2:${i}`'));
    assert.equal(P.WARM_PART_KEY(3), 'structure:part:v2:3');
  });
  await t('호출량 계산 — 초당 4콜 × 300종목 × 종목당 평균 19콜 = 5,700콜 ≈ 24분, 분당 240콜은 계약 2,000콜/분의 12%', () => {
    const perMin = P.WARM_RATE_PER_SEC * 60;
    assert.equal(perMin, 240);
    assert.equal(Math.round((perMin / 2000) * 100), 12);
    assert.equal(Math.round((300 * 19) / perMin), 24);
  });

  console.log(`\n${process.exitCode ? '실패 있음' : '전부 통과'} — ${pass}건 통과`);
})();
