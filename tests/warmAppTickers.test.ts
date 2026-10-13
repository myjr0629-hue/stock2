/**
 * 구조 판본 사전 갱신 대상에 «앱이 실제로 여는 종목» 넣기 + 클래스 주식 표기(BRK-B) — 2026-10-14
 * 실행: NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/warmAppTickers.test.ts
 *
 * 출발점(무결성 감시기 LV_CHAIN_UNKNOWN/OLD): GME·SNDK·BABA·BRK.B·CLOV 는 밤 사전 갱신 대상 300 밖이라 주말·밤 뒤 첫 열람이 한 레코드(주말엔 3일) 뒤 판본을 받았다.
 * 지키는 것:
 *   1. 고정 목록이 원본(Intel 설정/엔진 목록 · 빠른 선택 칩 · 대시보드 섹터 ETF · 무결성 감시기 고정 종목)과 어긋나지 않는다 — 어긋나면 이 시험이 실패한다
 *   2. buildWarmTargets — 앱 고정 종목은 전부 대상 · 예전 순위의 상위 n 은 하나도 밀려나지 않는다 · 늘어나는 수는 핵심 300 밖에서 새로 들어오는 만큼 · appFixed 가 없으면 예전과 같다
 *   3. 호출량 — 새로 들어오는 종목 수 × 종목당 호출 / 호출 관문 속도(초당 2콜 = 계약 분당 2,000의 6% 상한은 그대로)
 *   4. 크론 라우트의 대상(?dry=1&targets=1)에 5종목이 들어 있다
 *   5. 클래스 주식 표기 — BRK-B · BRK/B 는 정본 BRK.B 로 읽고 쓴다 · 응답/결과는 요청한 표기로도 낸다 · 우선주(BAC-PK) 등은 그대로
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.INTRINIO_API_KEY = 'test-key';
const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const W = require('../src/lib/appWarmTickers') as typeof import('../src/lib/appWarmTickers');
const P = require('../src/lib/structureWarmPlan') as typeof import('../src/lib/structureWarmPlan');
const T = require('../src/lib/tickerSymbol') as typeof import('../src/lib/tickerSymbol');
const CORE: string[] = require('../data/stock_universe_us300.json').symbols;

let pass = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e: any) { console.error(`  ✗ ${name}\n    ${e?.stack || e}`); process.exitCode = 1; }
};
/** 소스에서 `NAME = [ 'A', 'B' ]` 배열의 따옴표 문자열을 뽑는다 */
const arrayOf = (src: string, name: string): string[] => {
  const m = new RegExp(`${name}\\s*(?::[^=]+)?=\\s*\\[([^\\]]*)\\]`).exec(src);
  assert.ok(m, `${name} 배열을 소스에서 못 찾았다`);
  return [...m![1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
};

(async () => {
  console.log('1. 고정 목록 — 원본과 대조');
  await t('무결성 감시기 고정 종목(CHIPS+OUTSIDE)이 전부 들어 있다 — GME·SNDK·BABA·BRK.B·CLOV 포함', () => {
    const w = read('scripts/integrity/watch.js');
    const src = [...arrayOf(w, 'const CHIPS'), ...arrayOf(w, 'const OUTSIDE')];
    assert.ok(src.length >= 30);
    for (const s of src) assert.ok(W.APP_WARM_FIXED.includes(s), `${s} 가 APP_WARM_FIXED 에 없다`);
    assert.deepEqual([...W.INTEGRITY_WATCH_FIXED].sort(), [...src].sort(), 'INTEGRITY_WATCH_FIXED 가 감시기 목록과 다르다');
    for (const s of ['GME', 'SNDK', 'BABA', 'BRK.B', 'CLOV']) assert.ok(W.APP_WARM_FIXED.includes(s), s);
  });
  await t('Intel 서버 엔진 목록(useIntelSharedData 의 *_TICKERS 10개)과 ENGINE_INTEL_TICKERS 가 같다', () => {
    const h = read('src/hooks/useIntelSharedData.ts');
    const names = ['M7', 'PHYSICAL_AI', 'SILICON_CORE', 'POWER_MATRIX', 'BIO_PULSE', 'CYBER_SHIELD', 'ORBIT_DEFENSE', 'QUANTUM_EDGE', 'FINTECH_PULSE', 'CLOUD_FORTRESS'];
    const src = names.flatMap((n) => arrayOf(h, `const ${n}_TICKERS`));
    assert.equal(src.length, 70);
    assert.deepEqual([...W.ENGINE_INTEL_TICKERS].sort(), [...src].sort());
  });
  await t('앱 Intel 설정 목록(APP_SECTOR_STOCKS) · 빠른 선택 칩(cmd·flow) · 대시보드 섹터 ETF · 섹터 헤드라인 목록이 전부 들어 있다', () => {
    const { APP_SECTOR_STOCKS } = require('../src/lib/app/intelSectorLists');
    for (const s of Object.values(APP_SECTOR_STOCKS).flat() as string[]) assert.ok(W.APP_WARM_FIXED.includes(s), `Intel 설정 ${s}`);
    for (const f of ['src/app/[locale]/app-view/cmd/page.tsx', 'src/app/[locale]/app-view/flow/page.tsx']) for (const s of arrayOf(read(f), 'const POPULAR_TICKERS')) assert.ok(W.APP_WARM_FIXED.includes(s), `칩 ${s}`);
    const dash = /api\/live\/quotes\?symbols=([A-Z,]+)'/.exec(read('src/app/[locale]/app-view/dash/page.tsx'));
    assert.ok(dash, '대시보드 섹터 ETF 요청을 못 찾았다');
    for (const s of dash![1].split(',')) assert.ok(W.APP_WARM_FIXED.includes(s), `대시보드 ${s}`);
    const { SECTOR_TICKERS } = require('../src/lib/sectorConstants');
    for (const s of [...Object.keys(SECTOR_TICKERS), ...Object.values(SECTOR_TICKERS).flat() as string[]]) assert.ok(W.APP_WARM_FIXED.includes(s), `헤드라인 ${s}`);
  });
  await t('모양 — 중복 없음 · 티커 모양 · 점 표기(하이픈·슬래시 없음)', () => {
    assert.equal(new Set(W.APP_WARM_FIXED).size, W.APP_WARM_FIXED.length);
    for (const s of W.APP_WARM_FIXED) assert.match(s, /^[A-Z][A-Z0-9.]{0,6}$/, s);
    assert.deepEqual(W.dedupeCanonical([['BRK-B', 'brk.b', 'BRK/B', 'x y', 'nvda', 'NVDA']]), ['BRK.B', 'NVDA']);
  });

  console.log('2. buildWarmTargets');
  const oi = new Map<string, number>(CORE.map((c, i) => [c, 1_000_000 - i * 1000]));
  for (let i = 0; i < 50; i++) oi.set(`ZZ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`, 100 + i);
  const demand = [{ ticker: 'TSLA', score: 9 }, { ticker: 'KRMN', score: 3 }];
  const inp = { demand, oi, core: CORE, pinned: P.WARM_PINNED };
  const old = P.buildWarmTargets(inp);
  await t('appFixed 가 없으면(또는 비면) 예전과 정확히 같다', () => {
    assert.equal(old.length, P.WARM_TARGETS);
    assert.deepEqual(P.buildWarmTargets({ ...inp, appFixed: [] }), old);
    assert.deepEqual(P.buildWarmTargets({ ...inp, appFixed: undefined }), old);
  });
  const withFixed = P.buildWarmTargets({ ...inp, appFixed: W.APP_WARM_FIXED });
  const oldSet = new Set(old);
  const extra = W.APP_WARM_FIXED.filter((x) => !oldSet.has(x));
  await t('앱 고정 종목은 전부 대상 · 예전 상위 n 은 하나도 안 밀려난다 · 늘어난 수 = 예전 순위 밖에서 새로 들어온 고정 종목 수', () => {
    for (const s of W.APP_WARM_FIXED) assert.ok(withFixed.includes(s), s);
    for (const s of old) assert.ok(withFixed.includes(s), `밀려남: ${s}`);
    assert.equal(withFixed.length, P.WARM_TARGETS + extra.length);
    assert.equal(new Set(withFixed).size, withFixed.length);
  });
  await t('우선순위 — 고정 ETF → 앱 고정 종목 → 나머지(예전 순서 유지)', () => {
    const head = withFixed.slice(0, P.WARM_PINNED.length);
    assert.deepEqual(head, P.WARM_PINNED);
    const fixedPart = new Set(W.APP_WARM_FIXED);
    const firstNonFixed = withFixed.findIndex((x) => !fixedPart.has(x) && !P.WARM_PINNED.includes(x));
    for (const s of W.APP_WARM_FIXED) assert.ok(withFixed.indexOf(s) < firstNonFixed, `${s} 가 일반 대상보다 뒤에 있다`);
    const rest = withFixed.slice(firstNonFixed);
    assert.deepEqual(rest, old.filter((x) => !fixedPart.has(x) && !P.WARM_PINNED.includes(x)), '나머지는 예전 순서 그대로');
  });

  console.log('3. 호출량');
  await t('핵심 300 밖에서 새로 들어오는 종목은 소수(≤ 30) — 호출 속도 상한(분당 120콜 = 계약 2,000/분의 6%)은 그대로', () => {
    const CALLS_PER_TICKER = 12;   // 10/12·13 운영 실측 11.1~13.1콜/종목(structure-warm:last callsPerTicker)
    const extraCalls = extra.length * CALLS_PER_TICKER;
    assert.ok(extra.length <= 30, `새로 들어오는 종목 ${extra.length}개 — ${extra.join(',')}`);
    const perMinCap = P.WARM_RATE_PER_SEC * 60;
    assert.ok(perMinCap / 2000 <= 0.06 + 1e-9);
    console.log(`    새로 들어오는 ${extra.length}종목(${extra.join(' ')}) × ${CALLS_PER_TICKER}콜 ≈ ${extraCalls}콜/밤 · 관문 속도 ${perMinCap}콜/분(한도의 ${(perMinCap / 20).toFixed(0)}%)에서 +${(extraCalls / P.WARM_RATE_PER_SEC / 60).toFixed(1)}분`);
  });

  console.log('4. 크론 라우트 — 대상 계획');
  const mem = new Map<string, any>();
  const stub = (id: string, exports: any) => { require.cache[id] = { id, filename: id, loaded: true, exports, children: [], paths: [] } as any; };
  stub(require.resolve('../src/services/redisClient'), { getFromCache: async (k: string) => (mem.has(k) ? mem.get(k) : null), setInCache: async () => true, mgetFromCache: async (ks: string[]) => ks.map(() => null) });
  stub(require.resolve('../src/services/intrinioClient'), { probeVendorEodDate: async () => '2026-10-13' });
  stub(require.resolve('../src/lib/ai/deepDemand'), { loadDemandTop: async () => [] });
  stub(require.resolve('../src/services/structureService'), {
    inspectStoredVersions: async (ts: string[]) => new Map(ts.map((x) => [x, { hasVersion: true, chainDate: '2026-10-12', timestamp: 1, status: 'OK', usable: true, legacy: false }])),
    refreshStructureForWarm: async (tk: string) => ({ ticker: tk, outcome: 'stored', chainDate: '2026-10-13', status: 'OK', partial: false, ms: 1 }),
  });
  const Route = require('../src/app/api/cron/structure-warm/route') as typeof import('../src/app/api/cron/structure-warm/route');
  await t('?dry=1&targets=1 — 대상에 GME·SNDK·BABA·BRK.B·CLOV 와 앱 고정 종목 전부, 고정 ETF 가 맨 앞', async () => {
    const res = await Route.GET(new Request('https://x.test/api/cron/structure-warm?dry=1&targets=1') as any);
    const j: any = await res.json();
    for (const s of ['GME', 'SNDK', 'BABA', 'BRK.B', 'CLOV', 'AXON', 'SPCX', 'RGTI', 'QBTS']) assert.ok(j.order.includes(s), s);
    for (const s of W.APP_WARM_FIXED) assert.ok(j.order.includes(s), s);
    assert.deepEqual(j.order.slice(0, P.WARM_PINNED.length), P.WARM_PINNED);
    assert.equal(j.targets, j.order.length);
    assert.ok(j.targets >= P.WARM_TARGETS && j.targets <= P.WARM_TARGETS + 30);
  });

  console.log('5. 클래스 주식 표기');
  await t('canonicalShareClass — 한 글자 클래스 접미만 점으로, 그 밖은 대문자만', () => {
    for (const [a, b] of [['BRK-B', 'BRK.B'], ['brk-b', 'BRK.B'], ['BRK/B', 'BRK.B'], ['BF-B', 'BF.B'], ['LEN-B', 'LEN.B'], ['BRK.B', 'BRK.B'], ['BRKB', 'BRKB'], ['BAC-PK', 'BAC-PK'], ['NVDA', 'NVDA'], ['  nvda ', 'NVDA'], ['A-B-C', 'A-B-C'], ['BRK-', 'BRK-'], ['', ''], [null, ''], [12, '']] as Array<[any, string]>) assert.equal(T.canonicalShareClass(a), b, String(a));
  });

  // 판본 읽기(Redis 모의) — structure:v2:BRK.B 만 저장돼 있고, BRK-B 로 열어도 같은 판본이 나온다
  process.env.EC2_REDIS_PROXY_URL = 'http://ec2.test'; process.env.EC2_REDIS_PROXY_KEY = 'k';
  process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test'; process.env.UPSTASH_REDIS_REST_TOKEN = 't';
  delete require.cache[require.resolve('../src/services/redisClient')];
  delete require.cache[require.resolve('../src/services/structureService')];
  const store = new Map<string, any>();
  const mgets: string[][] = [];
  (globalThis as any).fetch = async (input: any) => {
    const url = String(input);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.startsWith('http://ec2.test/mget')) { const keys = decodeURIComponent(url.split('keys=')[1]).split(','); mgets.push(keys); return json({ results: keys.map((k) => (store.has(k) ? store.get(k) : null)) }); }
    if (url.startsWith('http://ec2.test/')) return json({ result: null, ok: true });
    if (url.startsWith('https://upstash.test')) return json({ result: null });
    throw new Error('unexpected fetch ' + url);
  };
  const ver = (ticker: string, S: number) => ({
    timestamp: Date.now() - 60_000,
    data: {
      ticker, levelsProducer: 'structureService', options_status: 'OK', expiration: '2099-01-16', chainDate: '2026-10-12', underlyingPrice: S,
      maxPain: S, levels: { callWall: Math.round(S * 1.1), putFloor: Math.round(S * 0.9), pinZone: S }, gammaFlipLevel: null, gammaFlipType: 'ALL_LONG',
      structure: { strikes: [Math.round(S * 0.9), S, Math.round(S * 1.1)], callsOI: [1, 5, 9], putsOI: [9, 5, 1], gexCum: [1, 2, 3] }, debug: { chainSource: 'vendor-direct' },
    },
  });
  store.set('structure:v2:BRK.B', ver('BRK.B', 520));
  const SS = require('../src/services/structureService') as typeof import('../src/services/structureService');
  await t('peekStructureLevelsDetailed — BRK-B 로 물어도 BRK.B 판본의 레벨이 나온다(요청 표기로도 · 정본 표기로도) · 키는 정본 하나만 읽는다', async () => {
    mgets.length = 0;
    const { levels, noSnapshot } = await SS.peekStructureLevelsDetailed(['BRK-B', 'BRK.B', 'NVDA']);
    assert.equal(levels.get('BRK.B')?.maxPain, 520);
    assert.equal(levels.get('BRK-B')?.maxPain, 520);
    assert.equal(levels.get('BRK-B')?.levelsTicker, 'BRK-B');
    assert.deepEqual(noSnapshot.sort(), ['NVDA']);
    assert.equal(mgets.length >= 1, true);
    assert.ok(mgets[0].includes('structure:v2:BRK.B') && !mgets[0].some((k) => k.includes('BRK-B')), '정본 키만 읽는다: ' + mgets[0].join(','));
  });
  await t('peekStructureLevelsDetailed — 판본이 없으면 noSnapshot 에 요청한 표기로도 실린다', async () => {
    store.delete('structure:v2:BRK.B');
    const { levels, noSnapshot } = await SS.peekStructureLevelsDetailed(['BRK-B']);
    assert.equal(levels.size, 0);
    assert.ok(noSnapshot.includes('BRK-B') && noSnapshot.includes('BRK.B'), JSON.stringify(noSnapshot));
    store.set('structure:v2:BRK.B', ver('BRK.B', 520));
  });
  await t('peekStructureLevelsDetailed — 별칭이 없으면(일반 종목) 예전 경로 그대로', async () => {
    store.set('structure:v2:NVDA', ver('NVDA', 225));
    const { levels } = await SS.peekStructureLevelsDetailed(['NVDA']);
    assert.equal(levels.get('NVDA')?.maxPain, 225);
    assert.equal(levels.size, 1);
  });
  await t('getStructureData — BRK-B 는 BRK.B 판본을 내고 응답 ticker 는 요청한 표기 그대로(화면 키) · 일반 종목은 그대로', async () => {
    const a: any = await SS.getStructureData('BRK-B');
    assert.equal(a.ticker, 'BRK-B');
    assert.equal(a.maxPain, 520);
    assert.equal(a.options_status, 'OK');
    const b: any = await SS.getStructureData('BRK.B');
    assert.equal(b.ticker, 'BRK.B'); assert.equal(b.maxPain, 520);
    const c: any = await SS.getStructureData('NVDA');
    assert.equal(c.ticker, 'NVDA'); assert.equal(c.maxPain, 225);
    const keys = new Set(mgets.flat());
    assert.ok(![...keys].some((k) => k.includes('BRK-B') || k.includes('BRK/B')), '하이픈 표기 키를 읽지 않았다');
  });

  console.log(`warmAppTickers: ${pass} passed`);
})().catch((e) => { console.error('실패', e?.stack || e); process.exit(1); });
