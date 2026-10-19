// Gate regressions: fixed inputs only. No .env reads, network, browser or external writes.
// node tests/b4bGateFixes.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const transpile = code => ts.transpileModule(code, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const calendarModule = { exports: {} };
vm.runInNewContext(transpile(read('src/lib/marketCalendar.ts')), { exports: calendarModule.exports });
const { optionExpiryJudge } = calendarModule.exports;
const collectorSource = read('scripts/intrinio-options-eod.js');
const { createAggregator, finalizeTickers } = require('../scripts/intrinio-options-eod.js');
let count = 0;
async function test(name, fn) {
  if (process.argv[2] && !name.includes(process.argv[2])) return;
  await fn(); count++; console.log(`PASS ${name}`);
}
const row = (contract, oi, isCall = true) => ({
  sym: 'NVDA', contract, oi, vol: 1, isCall, gamma: 0, strike: 100,
  iv: .3, delta: .5, exp: '2026-11-20',
});

// Run the actual bulk branch and CSV reader; replace only IO with in-memory fixtures.
async function runBulkFixture({ apiContracts = 220, missingTickers = 0 } = {}) {
  const symbols = Array.from({ length: 60 }, (_, i) => `T${i}`);
  const previous = { date: '2026-10-16', complete: true, tickers: symbols, oi: {} };
  const lines = ['CONTRACT,SYMBOL,OPEN_INTEREST,VOLUME,GAMMA,STRIKE,TYPE,EXPIRATION'];
  for (const sym of symbols.slice(missingTickers)) for (let i = 0; i < 200; i++) {
    const contract = `${sym}_${i}`;
    previous.oi[contract] = 10000;
    lines.push(`${contract},${sym},10000,1,0,100,call,2026-11-20`);
  }
  const api = { date: '2026-10-19', source: 'api', tickers: Object.fromEntries(symbols.map(s => [s, { contracts: apiContracts }])) };
  const store = new Map([['intrinio:options:oi', previous], ['intrinio:options:eod', api]]);
  const writes = [];
  const fixtureModule = { exports: {} };
  const failIO = () => { throw new Error('Real IO forbidden'); };
  const context = {
    module: fixtureModule, process: { argv: ['node', 'collector'], env: {}, memoryUsage: () => ({ rss: 0 }) },
    require: name => {
      if (name === 'fs') return { readFileSync: failIO, writeFileSync: failIO };
      if (name === 'http' || name === 'https') return { request: failIO, get: failIO };
      assert(['url', 'zlib', 'readline'].includes(name), name);
      return require(name);
    },
    Buffer, console: { log() {} },
    fixture: {
      get: async key => store.get(key) ?? null,
      set: async (key, value) => { const parsed = JSON.parse(value); writes.push(key); store.set(key, parsed); },
      request: async () => ({ ok: true, json: () => ({ bulk_downloads: [{ name: 'Options EOD', links: [{ name: 'options_prices_eod_2026-10-19.zip', url: 'offline' }] }] }) }),
      stream: async () => Readable.from([lines.join('\n')]),
      universe: async () => new Set(symbols),
    },
  };
  vm.runInNewContext(collectorSource + `
    httpRequest = fixture.request; redisGet = fixture.get; redisSet = fixture.set;
    universe = fixture.universe; openStream = fixture.stream; unzipStream = input => input;
    module.exports.runBulk = runBulk;
  `, context);
  await fixtureModule.exports.runBulk();
  return { baseline: store.get('intrinio:options:oi'), bundle: store.get('intrinio:options:eod'), api, writes };
}

// Execute the actual Flow useMemo callbacks without mounting the network-heavy page.
const flowSource = ts.createSourceFile('flow.tsx', read('src/app/[locale]/app-view/flow/page.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['openingPositions', 'uoaAlert'].includes(node.name.getText(flowSource))) {
    callbacks.set(node.name.getText(flowSource), node.initializer.arguments[0].getText(flowSource));
  }
  ts.forEachChild(node, visit);
}
visit(flowSource);
assert.equal(callbacks.size, 2);
const flowCode = transpile(`const openingPositions = (${callbacks.get('openingPositions')})(); const alert = (${callbacks.get('uoaAlert')})();`);
function flowAt(iso, optionsEod) {
  const context = { optionsEod, optionExpiryJudge, Date: { now: () => Date.parse(iso) } };
  vm.runInNewContext(flowCode, context);
  return vm.runInNewContext('({ openingPositions, alert })', context);
}
const opening = (expiry, added = 20000) => ({ type: 'call', strike: 100, expiry, added, notional: added * 100 * 100 });
const contract = expiry => ({ type: 'call', strike: 100, expiration: expiry, oiChange: 15000, kind: 'OPENING', expired: false });

// Render the actual shared component. Hooks, tooltips and charts are isolated; no effects run.
const gaugeModule = { exports: {} };
const hooks = { ...React, useEffect() {}, useState: value => [value, () => {}], useMemo: fn => fn() };
vm.runInNewContext(transpile(read('src/components/guardian/GravityGauge.tsx')), {
  exports: gaugeModule.exports,
  require: name => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    if (name === 'next-intl') return { useTranslations: () => key => key, useLocale: () => 'ko' };
    if (name === './GuardianTooltip') return { GuardianTooltip: ({ children }) => children };
    if (name === '@/hooks/useMarketStatus') return { useMarketStatus: () => ({ status: { isHoliday: false } }) };
    if (name === '@/lib/fedwatchView') return { formatAsOfEt: () => '', isAsOfStale: () => false };
    if (name === 'next/dynamic') return () => () => null;
    throw new Error(`Unmocked import ${name}`);
  },
});
function renderGauge(sentimentScore, appBlank = false, overrides = {}) {
  const components = { momentumScore: 50, breadthScore: 50, priceActionScore: 50, rotationScore: 50, sentimentScore, ...overrides };
  return renderToStaticMarkup(gaugeModule.exports.default({ score: 50, components, appBlank }));
}
function sentimentRow(html) { return html.slice(html.indexOf('gauge.sentiment'), html.indexOf('gauge.sentiment') + 1500); }

(async () => {
  await test('P1 incomplete bulk: preserve API bundle, persist complete:false for both contract and ticker shortfalls', async () => {
    for (const options of [{}, { apiContracts: 200, missingTickers: 2 }]) {
      const r = await runBulkFixture(options);
      assert.equal(r.bundle, r.api);
      assert.equal(r.baseline.complete, false);
      assert.equal(r.baseline.date, '2026-10-19');
      assert(r.writes.includes('intrinio:options:oi'));
      assert(!r.writes.includes('intrinio:options:eod'));
    }
    const complete = await runBulkFixture({ apiContracts: 200 });
    assert.equal(complete.baseline.complete, true);
    assert.equal(complete.bundle.source, 'bulk');
  });
  await test('P1 next day unchanged 10,000 OI absent yesterday stays unknown, even if legacy baseline says complete:true', () => {
    for (const baselineComplete of [false, true]) for (const trackOi of [false, true]) {
      const a = createAggregator({ OBSERVED: 10000 }, { baselineComplete, baselineTickers: ['NVDA'], trackOi });
      a.add(row('OBSERVED', 10000)); a.add(row('MISSING_YESTERDAY', 10000));
      const raw = finalizeTickers(a.agg).NVDA;
      assert.equal(raw.top.find(c => c.c === 'MISSING_YESTERDAY').d, null);
      assert.equal(raw.top.find(c => c.c === 'OBSERVED').d, 0);
      assert.equal(raw.openingByExpiry == null ? null : Object.keys(raw.openingByExpiry).length, baselineComplete ? 0 : null);
    }
  });
  await test('P1 only observed increases count; genuine zero, low OI, decreases and missing contracts are distinct', () => {
    const a = createAggregator({ ZERO: 0, LOW: 3, CALL: 100, PUT: 100, CLOSE: 1000, MISSING_TODAY: 1000 }, { baselineComplete: true, baselineTickers: ['NVDA'] });
    for (const r of [row('ZERO', 10), row('LOW', 5), row('CALL', 300), row('PUT', 400, false), row('CLOSE', 500), row('UNKNOWN', 10000)]) a.add(r);
    const raw = finalizeTickers(a.agg).NVDA;
    assert.equal(raw.openingByExpiry['2026-11-20'].callContracts, 212);
    assert.equal(raw.openingByExpiry['2026-11-20'].putContracts, 300);
    assert.equal(raw.top.find(c => c.c === 'UNKNOWN').d, null);
    assert.equal(a.oiOut.ZERO, 10);
    // Missing today never gets synthesized as a zero-OI row either.
    assert(!Object.hasOwn(a.oiOut, 'MISSING_TODAY'));
  });
  await test('P2 regular close: cached expired:false / largest +20,000 must not survive 16:00 ET', () => {
    const data = { opening: { largest: opening('2026-10-19') }, contracts: [contract('2026-10-19')] };
    assert.equal(flowAt('2026-10-19T19:59:00Z', data).alert.oiChange, 20000);
    const after = flowAt('2026-10-19T20:01:00Z', data);
    assert.equal(after.alert, null); assert.equal(after.openingPositions.length, 0);
    data.contracts.push(contract('2026-11-20'));
    assert.equal(flowAt('2026-10-19T20:01:00Z', data).alert.expiration, '2026-11-20');
    data.opening.largest = opening('2026-11-20');
    assert.equal(flowAt('2026-10-19T20:01:00Z', data).alert.oiChange, 20000);
  });
  await test('P2 early close: same expiry judge rejects 13:00 ET and weekend expiry after Friday close', () => {
    const data = { opening: { largest: opening('2026-11-27') }, contracts: [] };
    assert(flowAt('2026-11-27T17:59:00Z', data).alert);
    assert.equal(flowAt('2026-11-27T18:00:00Z', data).alert, null);
    assert.equal(flowAt('2026-10-16T20:01:00Z', { opening: { largest: opening('2026-10-17') } }).alert, null);
  });
  await test('P2 PRO missing sentiment: keep all five rows, show —, no weak label or bearish factor on web and app', () => {
    for (const appBlank of [false, true]) for (const value of [null, undefined, NaN, Infinity]) {
      const html = renderGauge(value, appBlank);
      const item = sentimentRow(html);
      assert(item.includes('—')); assert(!item.includes('gauge.weak')); assert(item.includes('width:0%'));
      assert(!html.includes('bearish')); assert(!html.includes('NaN')); assert(!html.includes('Infinity'));
      for (const key of ['momentum', 'breadth', 'priceAction', 'rotation', 'sentiment']) assert(html.includes(`gauge.${key}`));
    }
  });
  await test('P2 observed sentiment zero is still 0/weak/bearish; finite scores keep their factors', () => {
    const zero = renderGauge(0);
    assert(sentimentRow(zero).includes('>0</span>')); assert(sentimentRow(zero).includes('gauge.weak'));
    assert(zero.includes('bearish')); assert(!sentimentRow(zero).includes('—'));
    assert(renderGauge(80).includes('bullish'));
    const mixed = renderGauge(null, false, { momentumScore: 80, breadthScore: 20 });
    assert(mixed.includes('bullish')); assert(mixed.includes('bearish'));
    assert(!mixed.includes('×2'));
  });
  console.log(`${count}/${count} passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
