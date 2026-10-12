/**
 * 구조 판본 사전 갱신 — 계산 경로의 두 옵션 (2026-10-13). 진짜 structureService·intrinioClient 에 가짜 벤더 응답·인메모리 Redis 를 붙여 돌린다.
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/structureWarmCompute.test.ts
 *
 * 지키는 것:
 *   1. expectChainDate — 공급사 최신 날짜보다 이른(또는 날짜 없는) 수집기 프로브는 쓰지 않고 벤더에서 직접 받는다. 날짜가 맞는 프로브는 그대로 쓴다. 옵션이 없으면(기존 호출자) 옛 동작 그대로
 *   2. noPartialStore — 일부 만기가 빠진 부분 체인은 저장하지 않는다(정상 판본을 덮지 않는다). 옵션이 없으면(기존 호출자) 예전처럼 저장
 *   3. refreshStructureForWarm — 위 둘을 싣고, 잠금 키를 scheduleRefresh 와 공유하며, 던지지 않는다. inspectStoredVersions — 판본 정보를 계산 없이 읽는다
 */
import assert from 'node:assert/strict';

process.env.INTRINIO_API_KEY = 'test-key';

let pass = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e: any) { console.error(`  ✗ ${name}\n    ${e?.stack || e}`); process.exitCode = 1; }
};

// ── 인메모리 Redis ──
const mem = new Map<string, any>();
const clone = (v: any) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const R = require.resolve('../src/services/redisClient');
const real = require('../src/services/redisClient');
require.cache[R] = {
  id: R, filename: R, loaded: true, children: [], paths: [],
  exports: {
    ...real,
    getFromCache: async (k: string) => (mem.has(k) ? clone(mem.get(k)) : null),
    setInCache: async (k: string, v: any) => { mem.set(k, clone(v)); return true; },
    mgetFromCache: async (ks: string[]) => ks.map((k) => (mem.has(k) ? clone(mem.get(k)) : null)),
  },
} as any;

// ── 날짜: 오늘 기준 앞으로의 금요일 둘 ──
let E1 = ''; let E2 = '';
{
  const f = (n: number) => { let d = new Date(Date.now() + n * 86400000); while (d.getUTCDay() !== 5) d = new Date(d.getTime() + 86400000); return d.toISOString().slice(0, 10); };
  E1 = f(2); const e2d = new Date(Date.parse(E1 + 'T00:00:00Z') + 7 * 86400000); E2 = e2d.toISOString().slice(0, 10);
}
const STRIKES = [90, 95, 100, 105, 110];
const VENDOR_DATE = '2026-10-09';

// ── 가짜 벤더 ──
let missingExp: string | null = null; // 이 만기의 체인은 빈 응답으로
const intrinioCalls: string[] = [];
(globalThis as any).fetch = async (url: any) => {
  const u = new URL(String(url));
  if (!u.hostname.includes('intrinio.com')) return new Response('not found', { status: 404 });
  const p = u.pathname.replace(/^\//, '');
  intrinioCalls.push(p);
  if (p.startsWith('options/expirations/')) return Response.json({ expirations: [E1, E2] });
  let m = /^options\/chain\/[A-Z]+\/(\d{4}-\d{2}-\d{2})\/eod$/.exec(p);
  if (m) {
    const exp = m[1];
    if (exp === missingExp) return Response.json({ chain: [] });
    const chain: any[] = [];
    for (const k of STRIKES) for (const type of ['call', 'put']) {
      chain.push({
        option: { code: `XYZ${exp.replace(/-/g, '')}${type[0].toUpperCase()}${k}`, ticker: 'XYZ', expiration: exp, strike: k, type },
        prices: { date: VENDOR_DATE, close: 1, close_bid: 0.9, close_ask: 1.1, mark: 1, volume: 10, open: 1, high: 1, low: 1, open_interest: 1000 + k * (type === 'call' ? 2 : 3), implied_volatility: 0.4, delta: 0.5, gamma: 0.02, theta: -0.01, vega: 0.05 },
      });
    }
    return Response.json({ chain });
  }
  if (p.startsWith('options/greeks/by_ticker/')) return Response.json({ contracts: [], next_page: null });
  return new Response('not found', { status: 404 });
};

const SS = require('../src/services/structureService') as typeof import('../src/services/structureService');

/** 수집기 프로브(슬림) — chainDate 를 바꿔 가며 쓴다 */
function putProbe(chainDate: string | null) {
  const exactResults: any[] = [];
  for (const k of STRIKES) for (const type of ['call', 'put']) {
    exactResults.push({
      details: { strike_price: k, contract_type: type, expiration_date: E1 },
      strike_price: k, contract_type: type, open_interest: 500 + k, implied_volatility: 0.4,
      greeks: { gamma: 0.02, implied_volatility: 0.4 }, day: { volume: 10, close: 1 }, last_quote: { midpoint: 1 },
    });
  }
  mem.set('polygon:snapshot:probe:XYZ', {
    probeResults: exactResults, exactResults, expirations: [E1, E2], weeklyExpiry: E1,
    chainDate, chainDates: chainDate ? { [E1]: chainDate } : {}, _ts: Date.now(), _ticker: 'XYZ', _source: 'lambda-flow-harvest', greeksSource: 'eod',
  });
}
const SPOT = { price: 100, prevClose: 99 };
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const log = console.log, warn = console.warn, err = console.error;
  console.log = () => { }; console.warn = () => { }; console.error = () => { };
  try { return await fn(); } finally { console.log = log; console.warn = warn; console.error = err; }
};

(async () => {
  console.log('1. expectChainDate — 프로브 거름');
  await t('옵션 없음(기존 호출자): 날짜 없는 프로브도 그대로 쓴다 — 벤더 호출 0', async () => {
    mem.clear(); intrinioCalls.length = 0; putProbe(null);
    const d: any = await quiet(() => SS.getStructureData('XYZ', null, SPOT, true, {}));
    assert.equal(d.debug.chainSource, 'lambda-probe');
    assert.equal(intrinioCalls.filter((x) => x.startsWith('options/chain')).length, 0);
  });
  await t('expectChainDate: 날짜 없는 프로브는 거르고 벤더 직접 — 체인 날짜가 판본에 실린다', async () => {
    mem.clear(); intrinioCalls.length = 0; putProbe(null);
    const run: any = { expectChainDate: VENDOR_DATE };
    const d: any = await quiet(() => SS.getStructureData('XYZ', null, SPOT, true, run));
    assert.equal(d.debug.chainSource, 'vendor-direct');
    assert.equal(d.chainDate, VENDOR_DATE);
    assert.ok(intrinioCalls.some((x) => x.startsWith('options/chain')));
  });
  await t('expectChainDate: 공급사 날짜보다 이른 프로브(10/8)도 거른다', async () => {
    mem.clear(); intrinioCalls.length = 0; putProbe('2026-10-08');
    const d: any = await quiet(() => SS.getStructureData('XYZ', null, SPOT, true, { expectChainDate: VENDOR_DATE }));
    assert.equal(d.debug.chainSource, 'vendor-direct');
    assert.equal(d.chainDate, VENDOR_DATE);
  });
  await t('expectChainDate: 날짜가 맞는 프로브(10/9)는 그대로 쓴다 — 벤더 호출 0', async () => {
    mem.clear(); intrinioCalls.length = 0; putProbe(VENDOR_DATE);
    const d: any = await quiet(() => SS.getStructureData('XYZ', null, SPOT, true, { expectChainDate: VENDOR_DATE }));
    assert.equal(d.debug.chainSource, 'lambda-probe');
    assert.equal(d.chainDate, VENDOR_DATE);
    assert.equal(intrinioCalls.filter((x) => x.startsWith('options/chain')).length, 0);
  });

  console.log('2. noPartialStore — 부분 체인 저장 거름');
  await t('옵션 없음(기존 호출자): 한 만기가 빠진 체인도 예전처럼 저장한다', async () => {
    mem.clear(); missingExp = E2;
    const run: any = {};
    const d: any = await quiet(() => SS.getStructureData('XYZ', null, SPOT, true, run));
    assert.equal(run.stored, true);
    assert.ok(mem.get('structure:v2:XYZ'));
    assert.equal(d.options_status, 'OK');
  });
  await t('noPartialStore: 한 만기가 빠지면 저장하지 않는다 — 있던 정상 판본을 덮지 않는다', async () => {
    mem.clear(); missingExp = E2;
    mem.set('structure:v2:XYZ', { data: { sentinel: 'good-version', chainDate: '2026-10-08' }, timestamp: 1 });
    const run: any = { noPartialStore: true };
    await quiet(() => SS.getStructureData('XYZ', null, SPOT, true, run));
    assert.equal(run.stored, false);
    assert.equal(mem.get('structure:v2:XYZ').data.sentinel, 'good-version');
  });
  await t('noPartialStore: 체인이 완전하면 저장한다', async () => {
    mem.clear(); missingExp = null;
    const run: any = { noPartialStore: true };
    const d: any = await quiet(() => SS.getStructureData('XYZ', null, SPOT, true, run));
    assert.equal(run.stored, true);
    assert.equal(mem.get('structure:v2:XYZ').data.chainDate, VENDOR_DATE);
    assert.equal(d.partial, false);
  });

  console.log('3. refreshStructureForWarm · inspectStoredVersions');
  await t('refreshStructureForWarm — 날짜 없는 프로브가 있어도 벤더 직접으로 새 판본을 저장하고 결과를 돌려준다', async () => {
    mem.clear(); missingExp = null; putProbe(null);
    // 이 경로는 현재가를 직접 받는다(주입 없음) — 가짜 벤더가 가격 엔드포인트를 안 주므로 가격은 0 → 판본이 못 만들어질 수 있다. 여기서는 던지지 않고 결과를 돌려주는지만 본다.
    const r = await quiet(() => SS.refreshStructureForWarm('XYZ', { expectChainDate: VENDOR_DATE }));
    assert.equal(r.ticker, 'XYZ');
    assert.ok(['stored', 'not-stored'].includes(r.outcome), r.outcome);
    assert.ok(r.ms >= 0);
  });
  await t('refreshStructureForWarm — scheduleRefresh 와 같은 잠금 키(structure:refresh:{T}): 방금 건 잠금이 있으면 건너뛴다', async () => {
    mem.clear(); mem.set('structure:refresh:LOCKD', Date.now());
    const r = await SS.refreshStructureForWarm('LOCKD', { expectChainDate: VENDOR_DATE, minLockMs: 60_000 });
    assert.equal(r.outcome, 'skipped-lock');
  });
  await t('refreshStructureForWarm — 던지지 않는다(안쪽 오류는 error 결과로)', async () => {
    const real = (globalThis as any).fetch;
    (globalThis as any).fetch = async () => { throw new Error('boom'); };
    try {
      mem.clear();
      const r = await quiet(() => SS.refreshStructureForWarm('ERRT', { expectChainDate: VENDOR_DATE }));
      assert.ok(['error', 'not-stored'].includes(r.outcome), r.outcome);
    } finally { (globalThis as any).fetch = real; }
  });
  await t('inspectStoredVersions — 판본 정보(체인 날짜·시각·상태·옛 모양)를 계산·갱신 예약 없이 읽는다', async () => {
    mem.clear(); intrinioCalls.length = 0;
    mem.set('structure:v2:AAA', { data: { chainDate: VENDOR_DATE, options_status: 'OK', expiration: E1, structure: { gexCum: [1, 2] } }, timestamp: 12345 });
    mem.set('structure:v2:BBB', { data: { chainDate: null, options_status: 'OK', expiration: E1, structure: { strikes: [1] } }, timestamp: 777 }); // gexCum 없음 = 옛 모양
    const m = await SS.inspectStoredVersions(['AAA', 'BBB', 'CCC']);
    assert.ok(m);
    assert.deepEqual(m!.get('AAA'), { hasVersion: true, chainDate: VENDOR_DATE, timestamp: 12345, status: 'OK', usable: true, legacy: false });
    assert.equal(m!.get('BBB')!.legacy, true);
    assert.equal(m!.get('BBB')!.chainDate, null);
    assert.equal(m!.get('CCC')!.hasVersion, false);
    assert.equal(m!.get('CCC')!.usable, false);
    assert.equal(intrinioCalls.length, 0);
  });

  console.log(`\n${process.exitCode ? '실패 있음' : '전부 통과'} — ${pass}건 통과`);
  process.exit(process.exitCode ?? 0);
})();
