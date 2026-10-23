// 실행: node --test tests/earningsScenario.test.cjs — 합성 자료, 브라우저·환경 파일·운영망 접근 없음.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const BASE_COMMIT = '72bb6d891'; // 재배치한 origin/main (fix/greeks-null-not-zero 병합 뒤)
const COPY_BASE_COMMIT = '927bf01d3'; // 이번 문구 수정의 운영 반영 기준
const NOW = Date.parse('2026-10-22T03:00:00Z');
globalThis.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage;
const originalNow = Date.now;
Date.now = () => NOW;
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) { return resolve.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, ...args); };
const compile = (source, fileName) => ts.transpileModule(source, { fileName, compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, name) => mod._compile(compile(fs.readFileSync(name, 'utf8'), name), name);
const stub = (name, exports) => { const id = require.resolve(name); require.cache[id] = { id, filename: id, loaded: true, exports }; };
const load = (file, source, overrides = {}) => {
  const exports = {}, localRequire = Module.createRequire(path.join(root, file));
  vm.runInNewContext(compile(source, file), { exports, Date, Response, Request, URL, AbortSignal, setTimeout, clearTimeout,
    process: { env: {} }, require: id => Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id) }, { filename: file });
  return exports;
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const model = require('../src/lib/earningsScenario/model');
const snap = require('../src/lib/earningsScenario/snapshot');
const { CONFIRMED_EARNINGS } = require('../src/lib/earningsConfirmed');
const eligibleEvents = CONFIRMED_EARNINGS.filter(e => snap.SCENARIO_TICKERS.includes(e.ticker) && e.date > '2026-10-21');
const expiryFor = e => e.date < '2026-10-30' ? '2026-10-30' : '2026-11-06';
const chainFor = expiry => { const raw = chain(); raw.chain.forEach(r => r.option.expiration = expiry); return raw; };
const { SCENARIO_COPY } = require('../src/lib/earningsScenario/copy');
const { blackScholes: bs, scenario, closeAt } = model;
const event = { ticker: 'AAPL', date: '2026-10-29', hour: 'amc' };
const contract = (side = 'call', strike = 100, changes = {}) => ({ option: { code: `AAPL-${strike}-${side}`, strike, type: side, expiration: '2026-10-30' },
  prices: { date: '2026-10-21', close_bid: side === 'call' ? 4.9 : 4.5, close_ask: side === 'call' ? 5.1 : 4.7,
    implied_volatility: 0.6, delta: side === 'call' ? 0.54 : -0.46, gamma: 0.03, theta: -0.2, vega: 0.12, ...changes } });
const chain = () => ({ chain: [contract(), contract('put'), contract('call', 105), contract('put', 105)] });
const eod = () => ({ date: '2026-10-21', rows: snap.SCENARIO_TICKERS.map(t => [t, 99, 101, 98, 100, 1000000]) });
const implied = () => ({ v: 1, cells: { 'AAPL|2026-10-29': { p: 6, e: '2026-10-30', s: '2026-10-21', b: 'eod', method: 'weekly' } } });
const makeRow = (raw = chain(), stock = eod(), move = implied()) => snap.buildRow('AAPL', event, '2026-10-30', raw, stock, move, NOW);
const rows = () => snap.SCENARIO_TICKERS.slice(0, 5).map(ticker => ({ ...makeRow(), ticker }));
const approx = (a, b, tolerance = 2e-5) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);
let reads = [], fail = false, vendorCalls = [], vendorStatus = 200;
const values = new Map();
const oldFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('실제 외부 접근 금지'); };
stub('../src/services/redisClient', { mgetFromCache: async keys => {
  reads.push(keys); await new Promise(r => setImmediate(r)); if (fail) throw new Error('합성 읽기 장애'); return keys.map(k => values.get(k) ?? null);
}, setInCache: () => { throw new Error('운영 쓰기 금지'); } });
stub('../src/lib/net/publicBase', { publicBase: () => 'https://www.signumhq.com' });
const cache = new Map();
globalThis.__incrementalCache = { generateCacheKey: async k => k,
  get: async (k, ctx) => { assert.equal(ctx.revalidate, 300); return cache.get(k) ?? null; },
  set: async (k, value) => cache.set(k, { value, isStale: false }) };
// 실제 환경과 무관한 공급사 합성 런타임. 비밀값·환경 파일을 읽지 않는다.
const serviceFile = 'src/services/earningsScenarioService.ts';
let mockEnv = {};
const vendorFetch = async (input, init) => {
  vendorCalls.push({ path: new URL(input).pathname, method: init.method, date: new URL(input).searchParams.get('date') });
  assert.equal(init.method, 'GET'); assert.equal(init.cache, 'no-store');
  return Response.json(new URL(input).pathname.includes('/expirations/') ? { expirations: ['2026-10-30', '2026-11-06'] }
    : chainFor(new URL(input).pathname.split('/')[4]), { status: vendorStatus });
};
const serviceExports = {};
vm.runInNewContext(compile(fs.readFileSync(path.join(root, serviceFile), 'utf8'), serviceFile), {
  exports: serviceExports, require, process: { env: mockEnv }, Date, URL, AbortSignal, fetch: vendorFetch,
});
let pageSnapshot = { readAt: new Date(NOW).toISOString(), rows: rows() };
stub('../src/services/earningsScenarioService', { scenarioSnapshot: async () => pageSnapshot });
const page = require('../src/app/[locale]/tools/earnings-scenario/page');
const props = l => ({ params: Promise.resolve({ locale: l }) });
const render = async l => renderToStaticMarkup(await page.default(props(l)));

function fillCaches() {
  values.clear(); reads = []; vendorCalls = []; vendorStatus = 200; fail = false; delete mockEnv.INTRINIO_API_KEY;
  values.set('market:earnings-calendar:v4', { rows: snap.SCENARIO_TICKERS.map(ticker => ({ ...event, ticker })) });
  values.set('intrinio:eod:snapshot', JSON.stringify(eod())); values.set('earnings:implied:v1', implied());
  for (const t of snap.SCENARIO_TICKERS) {
    values.set(snap.rawExpirationsKey(t, '2026-10-21'), { expirations: ['2026-10-30', '2026-11-06'] });
    values.set(snap.rawChainKey(t, '2026-10-30'), JSON.stringify(chain()));
  }
  for (const e of eligibleEvents) values.set(snap.rawChainKey(e.ticker, expiryFor(e)), JSON.stringify(chainFor(expiryFor(e))));
}

test('BS 교과서 기준값·풋콜 패리티·만기·무변동·잘못된 입력', () => {
  // Hull 교과서 예제: S=42,K=40,r=10%,σ=20%,T=0.5, 콜 4.75942.
  approx(bs('call', 42, 40, 0.5, 0.2, 0.1), 4.75942);
  // 널리 쓰이는 교과서 매개변수: S=K=100,r=5%,σ=20%,T=1.
  approx(bs('call', 100, 100, 1, 0.2, 0.05), 10.450583572185565);
  approx(bs('put', 100, 100, 1, 0.2, 0.05), 5.573526022256971);
  for (const iv of [0.01, 0.2, 0.8, 2]) approx(bs('call', 105, 100, 0.1, iv, 0.04) - bs('put', 105, 100, 0.1, iv, 0.04), 105 - 100 * Math.exp(-0.004), 1e-10);
  assert.equal(bs('call', 110, 100, 0, 0.3, 0.04), 10); assert.equal(bs('put', 90, 100, 0, 0.3, 0.04), 10);
  approx(bs('call', 100, 100, 1, 0, 0.04), 100 - 100 * Math.exp(-0.04), 1e-12);
  assert.equal(bs('call', 0, 100, 1, 0.2, 0.04), null); assert.equal(bs('put', 100, 100, -1, 0.2, 0.04), null);
  assert.equal(bs('put', 100, 100, 1, NaN, 0.04), null);
});
test('분해 240조합: 세 효과 합=총 변화, 기준 차이+총 변화=손익, 결정성', () => {
  const row = makeRow();
  for (const side of ['call', 'put']) for (const stock of [-30, -5, 0, 5, 30]) for (const iv of [-60, -10, 0, 50]) for (const d of [0, 4, row.years * 365]) {
    const r = scenario(row[side], row.spot, row.years, stock, iv, d);
    assert.ok(r); approx(r.direction + r.volatility + r.time, r.total, 1e-9); approx(r.total + r.basis, r.pnl, 1e-9);
    assert.deepEqual(r, scenario(row[side], row.spot, row.years, stock, iv, d));
    assert.ok(r.nextIv >= 0.01);
  }
  const r = scenario(row.call, row.spot, row.years, 0, 0, 0);
  assert.equal(r.total, 0); assert.equal(r.direction, 0); assert.equal(r.volatility, 0); assert.equal(r.time, 0);
  // 방향이 유리해도 IV 하락·시간 경과로 손해가 되는 실제 모델 사례.
  const loss = scenario(row.call, row.spot, row.years, 1, -40, 8);
  assert.ok(loss.direction > 0 && loss.pnl < 0);
});
test('결측 그릭스는 0 보간 없이 미계산; 실제 원본 0은 보존', () => {
  for (const key of ['delta', 'gamma', 'theta', 'vega']) for (const missing of [null, undefined, NaN, Infinity, '0']) {
    const raw = chain(); raw.chain[0].prices[key] = missing;
    const row = makeRow(raw); assert.equal(row.call, null, key); assert.equal(scenario(row.call, row.spot, row.years, 0, 0, 0), null);
  }
  for (const key of ['delta', 'gamma', 'theta', 'vega']) { const raw = chain(); raw.chain[0].prices[key] = 0; assert.ok(makeRow(raw).call, key); }
  for (const key of ['close_bid', 'close_ask', 'implied_volatility']) {
    const raw = chain(); raw.chain[0].prices[key] = null; assert.equal(makeRow(raw).call, null);
  }
});
test('ATM·첫 만기·페이지 잘림: 결측을 먼 행사가/먼 만기로 가리지 않음', () => {
  const raw = chain(); raw.chain[0].prices.vega = null;
  assert.equal(makeRow(raw).call, null); assert.equal(makeRow({ ...chain(), next_page: '합성-다음' }).call, null);
  const p = { expirations: ['2026-10-29', '2026-10-30', '2026-11-06'] };
  assert.equal(snap.firstExpiry({ probeResults: [{ details: { expiration_date: '2026-11-06' } }] }, event), null);
  assert.equal(snap.firstExpiry(p, event), '2026-10-30'); assert.equal(snap.firstExpiry(p, { ...event, hour: 'bmo' }), '2026-10-29');
  assert.equal(snap.firstExpiry(p, { ...event, hour: '' }), '2026-10-30');
  const noNearestPut = chain(); noNearestPut.chain = noNearestPut.chain.filter(r => r.option.strike !== 100 || r.option.type !== 'put');
  assert.equal(makeRow(noNearestPut).put, null); assert.equal(makeRow(noNearestPut).call.strike, 100);
});
test('관측일 일치·7일·IV 기본 분산식·예상 변동 묶음 없으면 같은 운영 ATM 정의', () => {
  const stale = eod(); stale.date = '2026-10-10'; assert.equal(makeRow(chain(), stale).call, null);
  const mixed = chain(); mixed.chain[0].prices.date = '2026-10-20'; assert.equal(makeRow(mixed).call, null);
  const row = makeRow(); approx(row.defaultIvPp, model.defaultIvChange(0.6, 6, row.years), 1e-12);
  const fallback = makeRow(chain(), eod(), null); approx(fallback.movePct, 9.6, 1e-10);
  assert.equal(fallback.moveMethod, 'chain-straddle');
  const wrong = implied(); wrong.cells['AAPL|2026-10-29'].s = '2026-10-20';
  assert.equal(makeRow(chain(), eod(), wrong).moveMethod, 'chain-straddle');
  assert.equal(model.defaultIvChange(0.6, null, row.years), null);
  assert.ok(model.defaultIvChange(0.6, 99, row.years) > -60);
});
test('관문 재현: ATM 양쪽이 이전 세션이어도 현재 세션의 102.5로 바꾸지 않음', () => {
  for (const date of ['2026-10-20', null, undefined]) {
    const raw = { chain: [contract('call', 100, { date }), contract('put', 100, { date }),
      contract('call', 102.5), contract('put', 102.5)] };
    const row = makeRow(raw);
    assert.equal(row.call, null); assert.equal(row.put, null);
    assert.equal(snap.completeRow(row), false); assert.equal(row.defaultIvPp, null);
  }
});
test('관문 재현: 확정 당일·과거·미확정 종목을 공급사 추정일로 되살리지 않음', async () => {
  const tsla = CONFIRMED_EARNINGS.filter(r => r.ticker === 'TSLA');
  assert.equal(snap.eventFor('TSLA', tsla, '2026-10-21'), null);
  assert.equal(snap.eventFor('TSLA', tsla, '2026-10-22'), null);
  assert.equal(snap.eventFor('META', CONFIRMED_EARNINGS, '2026-10-22'), null);
  fillCaches(); values.delete('intrinio:eod:snapshot');
  values.set('market:earnings-calendar:v4', { rows: snap.SCENARIO_TICKERS.map(ticker => ({ ticker, date: '2026-10-28', hour: 'amc', dateStatus: 'confirmed' })) });
  const out = await serviceExports.loadScenarioSnapshot();
  assert.ok(out.rows.length > 0);
  for (const row of out.rows) assert.ok(eligibleEvents.some(e => e.ticker === row.ticker && e.date === row.earnings));
  assert.ok(!reads.flat().includes('market:earnings-calendar:v4'));
  assert.equal(vendorCalls.length, 0);
});
test('관문 재현: 3언어 관측 100·60%와 가정 110·40%, IV 기본값·경과일 숫자 분리', () => {
  const file = 'src/app/[locale]/tools/earnings-scenario/ScenarioClient.tsx';
  for (const locale of ['ko', 'en', 'ja']) {
    let cursor = 0;
    const client = load(file, fs.readFileSync(path.join(root, file), 'utf8'), { react: { ...React, useState: () => {
      const value = [0, 'call', 10, -20, 2][cursor++]; return [value, () => {}];
    } } }).default;
    const rr = rows(), c = SCENARIO_COPY[locale];
    const html = renderToStaticMarkup(client({ locale, rows: rr }));
    const cell = (label, value) => assert.ok(html.includes(`<dt>${label}</dt><dd>${value}</dd>`), `${locale}: ${label} = ${value}`);
    assert.ok(c.assumedSpot && c.assumedIv && c.defaultDays);
    cell(c.spot, '$100.00'); cell(c.currentIv, '60.00%');
    cell(c.assumedSpot, '$110.00'); cell(c.assumedIv, '40.00%');
    cell(c.default, `${rr[0].defaultIvPp.toFixed(2)} %p`); cell(c.defaultDays, rr[0].defaultDays.toFixed(1));
    // 음수 금액은 «-$1.23» 표기(«$-1.23» 금지). IV −20%p 가정의 변동성 효과는 음수다.
    assert.ok(!html.includes('$-')); assert.match(html, /<dt>[^<]+<\/dt><dd>-\$\d/);
    const resultHtml = html.split('<dl class="es-result">')[1];
    assert.ok(!resultHtml.includes(`<dt>${c.spot}</dt>`)); assert.ok(!resultHtml.includes(`<dt>${c.currentIv}</dt>`));
  }
});
test('ET 마감 시각: DST·조기폐장·만기 잔존시간', () => {
  assert.equal(new Date(closeAt('2026-10-30')).toISOString(), '2026-10-30T20:00:00.000Z');
  assert.equal(new Date(closeAt('2026-11-06')).toISOString(), '2026-11-06T21:00:00.000Z');
  assert.equal(new Date(closeAt('2026-11-27')).toISOString(), '2026-11-27T18:00:00.000Z');
  const row = makeRow(), r = scenario(row.call, 100, row.years, 10, -20, row.years * 365);
  assert.equal(r.remaining, 0); assert.equal(r.final, 10.000000000000014);
});
test('5종목 선택: 완전 자료 우선, 전체 결측에도 5칸 유지', () => {
  const rr = snap.SCENARIO_TICKERS.map((ticker, i) => ({ ...makeRow(), ticker, call: i < 3 ? null : makeRow().call }));
  assert.deepEqual(snap.selectFive(rr).map(r => r.ticker), snap.SCENARIO_TICKERS.slice(3, 8));
  assert.equal(snap.selectFive(rr.map(r => ({ ...r, call: null, put: null }))).length, 5);
});
test('서비스: 실제 5분 캐시·동시 미스 병합·2회 MGET, 공급사/운영쓰기 0', async () => {
  fillCaches(); cache.clear();
  const out = await Promise.all([serviceExports.scenarioSnapshot(), serviceExports.scenarioSnapshot(), serviceExports.scenarioSnapshot()]);
  assert.equal(reads.length, 2); assert.equal(vendorCalls.length, 0); assert.equal(out[0].rows.length, 5);
  assert.ok(out[0].rows.every(snap.completeRow)); assert.deepEqual(out[0], out[1]);
  for (const row of out[0].rows) {
    const announced = eligibleEvents.find(e => e.ticker === row.ticker);
    assert.ok(announced); assert.equal(row.earnings, announced.date);
    assert.equal(row.expiry, expiryFor(announced));
    assert.equal(row.call.expiry, row.expiry); assert.equal(row.put.expiry, row.expiry);
  }
  await serviceExports.scenarioSnapshot(); assert.equal(reads.length, 2);
});
test('서비스: 원본 캐시 없으면 공급사 GET만, 최대24회·재시도 없음', async () => {
  fillCaches(); mockEnv.INTRINIO_API_KEY = '합성인증';
  for (const e of eligibleEvents) { values.delete(snap.rawExpirationsKey(e.ticker, '2026-10-21')); values.delete(snap.rawChainKey(e.ticker, expiryFor(e))); }
  const out = await serviceExports.loadScenarioSnapshot();
  assert.equal(vendorCalls.length, eligibleEvents.length * 2); assert.ok(vendorCalls.length <= 24); assert.ok(out.rows.every(snap.completeRow));
  assert.ok(vendorCalls.every(c => c.method === 'GET'));
  vendorCalls = []; vendorStatus = 429; await serviceExports.loadScenarioSnapshot(); assert.ok(vendorCalls.length <= 3);
  fillCaches(); fail = true;
  const empty = await serviceExports.loadScenarioSnapshot(); assert.equal(empty.rows.length, 5); assert.ok(empty.rows.every(r => !r.call));
  assert.equal(vendorCalls.length, 0); fail = false;
});
test('서비스: 옵션 최신판이 먼저 갱신돼도 현물 세션 날짜로 원본 요청', async () => {
  fillCaches(); mockEnv.INTRINIO_API_KEY = '합성인증';
  for (const e of eligibleEvents) {
    const newer = chainFor(expiryFor(e)); newer.chain.forEach(r => r.prices.date = '2026-10-22');
    values.set(snap.rawChainKey(e.ticker, expiryFor(e)), newer);
  }
  const out = await serviceExports.loadScenarioSnapshot();
  assert.equal(vendorCalls.length, eligibleEvents.length); assert.ok(out.rows.every(snap.completeRow));
  assert.ok(vendorCalls.every(c => c.date === '2026-10-21'));
  fillCaches();
});
test('3언어 실제 SSR: 슬라이더3·매수1계약·5종목·분해·손익·면책·메타', async () => {
  pageSnapshot = { readAt: new Date(NOW).toISOString(), rows: rows() };
  for (const l of ['ko', 'en', 'ja']) {
    const h = await render(l), c = SCENARIO_COPY[l];
    assert.ok(h.includes(`lang="${l}"`)); assert.ok(h.includes(c.title)); assert.ok(h.includes(c.disclaimer));
    assert.equal((h.match(/type="range"/g) ?? []).length, 3); assert.equal((h.match(/type="radio"/g) ?? []).length, 2);
    assert.equal((h.match(/<option /g) ?? []).length, 5);
    for (const label of [c.direction, c.volatility, c.time, c.total, c.pnl, c.basis]) assert.ok(h.includes(label), label);
    assert.ok(h.includes(`https://www.signumhq.com/app?from=scenario_${l}`));
    const m = await page.generateMetadata(props(l));
    assert.equal(m.alternates.canonical, `https://www.signumhq.com/${l}/tools/earnings-scenario`);
    assert.equal(Object.keys(m.alternates.languages).length, 4); assert.equal(m.robots.index, true);
    assert.equal(m.openGraph.images[0].url, `${m.alternates.canonical}/og`);
  }
});
test('문구 수정: 3언어 렌더 스냅샷의 내부 용어 0, 네 가지 산출 방식·결측·메타 포함', async () => {
  const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'signum-scenario-copy-'));
  const internal = /운영|원천|원본|적재|캐시|호출|運用|原資料|原チェーン|保存|キャッシュ|読み取り専用|呼び出し|\b(?:operating|source|cache|cached|api|intrinio|redis|stored|read-only|bundle|calls)\b/i;
  const labels = { ko: '현재 가격 대비 손익 / 1계약', en: 'vs. current price · per contract', ja: '現在価格比の損益・1枚' };
  const saved = pageSnapshot;
  try {
    for (const l of ['ko', 'en', 'ja']) {
      const c = SCENARIO_COPY[l];
      assert.equal(c.pnl, labels[l]);
      assert.doesNotMatch(JSON.stringify(c), internal, `${l}: 문구 사전 전체`);
      for (const method of ['weekly', 'monthly', 'event-split', 'chain-straddle', 'missing']) {
        pageSnapshot = { readAt: new Date(NOW).toISOString(), rows: rows().map(r => ({ ...r, moveMethod: method,
          ...(method === 'missing' ? { call: null, put: null, defaultIvPp: null } : {}) })) };
        const h = await render(l);
        assert.doesNotMatch(h, internal, `${l}: ${method} 렌더`);
        assert.ok(h.includes(labels[l]));
        assert.equal((h.match(/type="range"/g) ?? []).length, 3);
        assert.equal((h.match(/<dd>/g) ?? []).length, 20);
        fs.writeFileSync(path.join(out, `${l}-${method}.html`), h);
      }
      assert.doesNotMatch(JSON.stringify(await page.generateMetadata(props(l))), internal, `${l}: 메타`);
    }
  } finally { pageSnapshot = saved; }
  console.log(`문구 검수용 합성 렌더 스냅샷 15개: ${out}`);
});
test('문구 수정: 운영 반영 기준 대비 600조합 계산 입력·출력·표시 금액 바이트 동일, 경과일만 한 자리', () => {
  const sourceAtBase = file => execFileSync('git', ['show', `${COPY_BASE_COMMIT}:${file}`], { cwd: root, encoding: 'utf8' });
  const clientFile = 'src/app/[locale]/tools/earnings-scenario/ScenarioClient.tsx';
  const copyFile = 'src/lib/earningsScenario/copy.ts', modelFile = 'src/lib/earningsScenario/model.ts';
  const baselineCopy = load(copyFile, sourceAtBase(copyFile)).SCENARIO_COPY;
  const baselineModel = load(modelFile, sourceAtBase(modelFile));
  // 이 기능의 공유 계산·자료 함수는 문구 변경으로 달라지면 안 된다.
  // 과거 커밋 이후 src 전체의 변경 목록을 고정하면 무관한 후속 수리도 실패한다.
  assert.equal(fs.readFileSync(path.join(root, modelFile), 'utf8'), sourceAtBase(modelFile));
  const modified = execFileSync('git', ['diff', COPY_BASE_COMMIT, '--name-only', '--',
    ':(literal)src/app/[locale]/tools/earnings-scenario', 'src/lib/earningsScenario', 'src/services/earningsScenarioService.ts'],
    { cwd: root, encoding: 'utf8' }).trim().split('\n').sort();
  assert.deepEqual(modified, [clientFile, copyFile].sort());
  const harness = (source, copy, implementation) => {
    let cursor, values, trace;
    const client = load(clientFile, source, {
      react: { ...React, useState: () => [values[cursor++], () => {}] },
      '@/lib/earningsScenario/copy': { SCENARIO_COPY: copy },
      '@/lib/earningsScenario/model': { ...implementation, scenario: (...args) => {
        const result = implementation.scenario(...args);
        trace.push({ args, result }); return result;
      } },
    }).default;
    return (locale, rr, state) => {
      cursor = 0; values = state; trace = [];
      const h = renderToStaticMarkup(client({ locale, rows: rr }));
      return { h, bytes: Buffer.from(JSON.stringify(trace)) };
    };
  };
  const before = harness(sourceAtBase(clientFile), baselineCopy, baselineModel);
  const after = harness(fs.readFileSync(path.join(root, clientFile), 'utf8'), SCENARIO_COPY, model);
  const rr = rows().map(r => ({ ...r, years: 15 / 365, defaultDays: 13.04, expiry: '2026-11-05',
    call: { ...r.call, expiry: '2026-11-05' }, put: { ...r.put, expiry: '2026-11-05' } }));
  let count = 0;
  for (const locale of ['ko', 'en', 'ja']) for (const side of ['call', 'put'])
    for (const stock of [-30, -5, 0, 5, 30]) for (const iv of [-60, -10, 0, 50]) for (const days of [0, 0.04, 2.35, 13.04, 15]) {
      const state = [0, side, stock, iv, days], a = before(locale, rr, state), b = after(locale, rr, state);
      assert.deepEqual(b.bytes, a.bytes, `${locale}/${side}/${stock}/${iv}/${days}: 계산 입력·출력`);
      const results = h => Buffer.from(h.split('<dl class="es-result">')[1].match(/<dd>[^<]*<\/dd>/g).join('\n'));
      assert.deepEqual(results(b.h), results(a.h), '모든 결과 금액·가정값');
      const observed = h => [...h.matchAll(/<dd>([^<]*)<\/dd>/g)].slice(0, 9).map(m => m[1]).join('\n');
      assert.equal(observed(b.h), observed(a.h), '관측 가격·IV·기본 IV 등 표시값');
      assert.ok(b.h.includes(`<output for="scenario-days">${days.toFixed(1)}</output>`));
      assert.ok(b.h.includes(`<dt>${SCENARIO_COPY[locale].defaultDays}</dt><dd>13.0</dd>`));
      assert.match(b.h, new RegExp(`id="scenario-days"[^>]*step="any"[^>]*value="${String(days).replace('.', '\\.')}"`));
      count++;
    }
  assert.equal(count, 600);
});
test('슬라이더3·콜/풋·종목 변경·리셋: 실제 클라이언트 이벤트가 계산 결과에 반영', () => {
  const file = 'src/app/[locale]/tools/earnings-scenario/ScenarioClient.tsx';
  let cursor = 0; const state = [];
  const client = load(file, fs.readFileSync(path.join(root, file), 'utf8'), { react: { ...React, useState: initial => {
    const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], v => { state[i] = v; }];
  } } }).default;
  const rr = rows(); rr[1].defaultIvPp = -10;
  const tree = () => { cursor = 0; return client({ locale: 'ko', rows: rr }); };
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) { const x = find(child, predicate); if (x) return x; }
    return null;
  };
  const htmlBefore = renderToStaticMarkup(tree());
  for (const [id, value] of [['stock', 5], ['iv', -15], ['days', 2]]) find(tree(), n => n.props?.id === `scenario-${id}`).props.onChange({ target: { value: String(value) } });
  assert.notEqual(renderToStaticMarkup(tree()), htmlBefore);
  assert.deepEqual(state.slice(2), [5, -15, 2]);
  find(tree(), n => n.props?.value === 'put').props.onChange(); assert.equal(state[1], 'put');
  find(tree(), n => n.props?.id === 'scenario-ticker').props.onChange({ target: { value: '1' } });
  assert.deepEqual(state.slice(2), [0, -10, rr[1].defaultDays]);
  find(tree(), n => n.props?.id === 'scenario-stock').props.onChange({ target: { value: '10' } });
  find(tree(), n => n.type === 'button').props.onClick(); assert.equal(state[2], 0);
});
test('3언어 결측 SSR: 모든 결과칸·입력 유지, 계산 비활성화', async () => {
  pageSnapshot.rows = rows().map(r => ({ ...r, call: null, put: null, defaultIvPp: null }));
  for (const l of ['ko','en','ja']) {
    const h = await render(l); assert.ok(h.includes(SCENARIO_COPY[l].missing));
    assert.equal((h.match(/type="range"/g) ?? []).length, 3); assert.equal((h.match(/ disabled=""/g) ?? []).length, 3);
    assert.ok(h.includes(SCENARIO_COPY[l].total));
  }
  pageSnapshot.rows = rows();
});
test('사이트맵: 신규3개·ko전용1개·hreflang, 기존 XML 바이트 동일', async () => {
  stub('../src/services/todayPicksService', { readPicks: async () => ({ doc: null, off: false }) });
  const file = 'src/lib/seo/sitemap.ts';
  const before = load(file, execFileSync('git', ['show', `${BASE_COMMIT}:${file}`], { cwd: root, encoding: 'utf8' }));
  const after = require('../src/lib/seo/sitemap');
  const { resolveSitemap } = require('next/dist/build/webpack/loaders/metadata/resolve-route-data');
  for (const locales of [undefined, ['ko']]) {
    const old = await before.buildSitemap(locales), current = await after.buildSitemap(locales);
    const added = current.filter(r => r.url.endsWith('/tools/earnings-scenario'));
    assert.equal(added.length, locales ? 1 : 3);
    assert.ok(added.every(r => Object.keys(r.alternates.languages).length === 4 && !r.lastModified));
    assert.equal(resolveSitemap(current.filter(r => !r.url.endsWith('/tools/earnings-scenario'))), resolveSitemap(old));
  }
});
test('기존 영수증·read-check 소스 바이트 동일, 기존 페이지3언어 HTML 동일', async () => {
  const modified = execFileSync('git', ['diff', BASE_COMMIT, '--name-only', '--diff-filter=MDR', '--',
    'src/lib/seo/sitemap.ts', ':(literal)src/app/[locale]/tools/read-check', ':(literal)src/app/[locale]/receipts/earnings',
    'src/services/readCheckService.ts', 'src/services/earningsReceiptsService.ts'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(modified, 'src/lib/seo/sitemap.ts');
  stub('../src/services/readCheckService', { readCheckSnapshot: async () => ({ readAt: new Date(NOW).toISOString(),
    rows: ['NVDA','AAPL','MSFT','TSLA','AMZN','META','GOOGL','AMD'].map(ticker => ({ ticker, options: null, darkPool: null, insider: null })) }) });
  let receipt = { week: '2026-10-12', weekEnd: '2026-10-18', asOf: new Date(NOW).toISOString(), rows: [], emptyReason: 'no_schedule',
    summary: { total: 0, pre: 0, within: 0, outside: 0, backfilled: 0, unverified: 0, missing: 0 } };
  stub('../src/services/earningsReceiptsService', { readEarningsReceipts: async () => receipt });
  stub('../src/components/share/ShareLanding', { ShareLanding: () => null });
  for (const file of ['src/app/[locale]/tools/read-check/page.tsx', 'src/app/[locale]/receipts/earnings/page.tsx']) {
    const source = fs.readFileSync(path.join(root, file));
    const oldSource = execFileSync('git', ['show', `${BASE_COMMIT}:${file}`], { cwd: root }); assert.deepEqual(source, oldSource);
    const before = load(file, oldSource.toString()), after = require(path.join(root, file));
    for (const l of ['ko','en','ja']) {
      const p = { ...props(l), searchParams: Promise.resolve({ week: '2026-10-12' }) };
      assert.equal(renderToStaticMarkup(await after.default(p)), renderToStaticMarkup(await before.default(p)));
    }
  }
});
test('OG: 실제 PNG 1200×630·3언어, 외부 글꼴 실패시 영문 대체', async () => {
  const og = require('../src/app/[locale]/tools/earnings-scenario/og/route');
  for (const l of ['ko','en','ja']) {
    const res = await og.GET(new Request('http://localhost'), props(l));
    const png = Buffer.from(await res.arrayBuffer());
    assert.equal(res.status, 200); assert.equal(png.subarray(1,4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
  }
});
test('375 검토 산출물: 실제3언어 SSR·동일 클라이언트 수식·오프라인 조작 번들', async () => {
  const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'signum-scenario-preview-'));
  const clientPath = 'src/app/[locale]/tools/earnings-scenario/ScenarioClient.tsx';
  const client = require(path.join(root, clientPath)).default;
  const file = 'src/app/[locale]/tools/earnings-scenario/page.tsx';
  const wrapped = load(file, fs.readFileSync(path.join(root, file), 'utf8'), {
    './ScenarioClient': { __esModule: true, default: p => React.createElement('div', { id: 'scenario-preview' }, React.createElement(client, p)) },
  });
  // 브라우저 실행 없이 번들만 생성한다. 서버/운영 자료·네트워크가 없는 합성 검토물이다.
  const build = require('esbuild').buildSync({ absWorkingDir: root, stdin: { contents: `import React from 'react'; import {hydrateRoot} from 'react-dom/client'; import Client from './${clientPath}'; const p=JSON.parse(document.getElementById('scenario-data').textContent);hydrateRoot(document.getElementById('scenario-preview'),React.createElement(Client,p));`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', minify: true, define: { 'process.env.NODE_ENV': '"production"' } });
  fs.writeFileSync(path.join(out, 'preview.js'), build.outputFiles[0].contents);
  for (const l of ['ko','en','ja']) {
    const h = renderToStaticMarkup(await wrapped.default(props(l)));
    const css = h.match(/<style>([\s\S]*?)<\/style>/)[1];
    assert.match(css, /width:100%;max-width:760px/); assert.match(css, /min-height:44px/);
    assert.match(css, /overflow-wrap:anywhere/); assert.doesNotMatch(css, /display:none/);
    const data = JSON.stringify({ locale: l, rows: rows() }).replace(/</g, '\\u003c');
    fs.writeFileSync(path.join(out, `${l}.html`), `<!doctype html><html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>합성 자료 · 375 화면 검토</title><style>html,body{margin:0;background:#1f2533;font-family:system-ui,sans-serif}</style></head><body>${h}<script type="application/json" id="scenario-data">${data}</script><script src="./preview.js"></script></body></html>`);
  }
  console.log(`375 수동 확인용 합성 오프라인 HTML: ${out}`);
});
test.after(() => { Date.now = originalNow; globalThis.fetch = oldFetch; delete globalThis.__incrementalCache; });
