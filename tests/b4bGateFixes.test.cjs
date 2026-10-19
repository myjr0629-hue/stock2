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
const openingModule = { exports: {} };
vm.runInNewContext(transpile(read('src/lib/whaleOpening.ts')), { exports: openingModule.exports, require: () => calendarModule.exports });
const { summarizeWhaleOpening, openingSideTotal } = openingModule.exports;
const sentimentModule = { exports: {} };
vm.runInNewContext(transpile(read('src/lib/sentimentObservation.ts')), { exports: sentimentModule.exports });
const { retainSentiment, sentimentDate } = sentimentModule.exports;
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
async function runBulkFixture({ apiContracts = 220, missingTickers = 0, firstOi = 10000 } = {}) {
  const symbols = Array.from({ length: 60 }, (_, i) => `T${i}`);
  const previous = { date: '2026-10-16', complete: true, tickers: symbols, oi: {} };
  const lines = ['CONTRACT,SYMBOL,OPEN_INTEREST,VOLUME,GAMMA,STRIKE,TYPE,EXPIRATION'];
  for (const sym of symbols.slice(missingTickers)) for (let i = 0; i < 200; i++) {
    const contract = `${sym}_${i}`;
    previous.oi[contract] = 10000;
    lines.push(`${contract},${sym},${sym === symbols[0] && i === 0 ? firstOi : 10000},1,0,100,call,2026-11-20`);
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
  if (ts.isVariableDeclaration(node) && ['openingPositions', 'liveOpening', 'uoaAlert'].includes(node.name.getText(flowSource))) {
    callbacks.set(node.name.getText(flowSource), node.initializer.arguments[0].getText(flowSource));
  }
  ts.forEachChild(node, visit);
}
visit(flowSource);
assert.equal(callbacks.size, 3);
const flowCode = transpile(`const openingPositions = (${callbacks.get('openingPositions')})(); const liveOpening = (${callbacks.get('liveOpening')})(); const alert = (${callbacks.get('uoaAlert')})();`);
function flowAt(iso, optionsEod) {
  const context = { optionsEod, optionExpiryJudge, summarizeWhaleOpening, Date: { now: () => Date.parse(iso) } };
  vm.runInNewContext(flowCode, context);
  return vm.runInNewContext('({ openingPositions, liveOpening, alert })', context);
}
const opening = (expiry, added = 20000) => ({ type: 'call', strike: 100, expiry, added, notional: added * 100 * 100 });
function flowPayload(largest, contracts = []) {
  const byExpiry = {};
  for (const x of [largest, ...contracts.map(c => opening(c.expiration, c.oiChange))]) {
    if (byExpiry[x.expiry]) continue;
    byExpiry[x.expiry] = { callContracts: x.added, putContracts: 0, callNotional: x.notional, putNotional: 0, largest: x };
  }
  return { date: '2026-10-16', prevDate: '2026-10-15', openingBasis: 'all-contracts-positive-oi-v1', openingByExpiry: byExpiry, opening: { largest }, contracts };
}
const contract = expiry => ({ type: 'call', strike: 100, expiration: expiry, oiChange: 15000, kind: 'OPENING', expired: false });

// Render the actual shared component. Hooks, tooltips and charts are isolated; no effects run.
const gaugeModule = { exports: {} };
const hooks = { ...React, useEffect() {}, useState: value => [value, () => {}], useMemo: fn => fn() };
vm.runInNewContext(transpile(read('src/components/guardian/GravityGauge.tsx')), {
  exports: gaugeModule.exports,
  require: name => {
    if (name === 'react') return hooks;
    if (name === '@/lib/sentimentObservation') return sentimentModule.exports;
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


// Actual OracleHeader rendering and Guardian snapshot merger, without effects or IO.
let headerRlsi;
const headerModule = { exports: {} };
vm.runInNewContext(transpile(read('src/components/guardian/OracleHeader.tsx')), {
  exports: headerModule.exports,
  require: name => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === 'swr') return () => ({ data: null });
    if (name === '@/lib/sentimentObservation') return sentimentModule.exports;
    if (name === '@/hooks/useMacroSnapshot') return { useMacroSnapshot: () => ({ snapshot: null }) };
    if (name === '@/components/guardian/GuardianProvider') return { useGuardian: () => ({ rlsi: headerRlsi }) };
    if (name === '@/i18n/routing') return { Link: ({ children }) => children };
    if (name === 'next-intl') return { useTranslations: () => key => key };
    if (name === 'lucide-react') return { BookOpen: () => null };
    throw new Error(`Unmocked header import ${name}`);
  },
});
function renderHeader(components) {
  headerRlsi = { components };
  return renderToStaticMarkup(React.createElement(headerModule.exports.OracleHeader, {}));
}
const providerSource = ts.createSourceFile('provider.tsx', read('src/components/guardian/GuardianProvider.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let mergeCallback;
(function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(providerSource) === 'mergeSnapshot') mergeCallback = node.initializer.arguments[0].getText(providerSource);
  ts.forEachChild(node, visit);
})(providerSource);
function mergeSnapshot(previous, incoming) {
  let result;
  vm.runInNewContext(transpile(`(${mergeCallback})(incoming);`), {
    incoming, retainSentiment, setData: fn => { result = fn(previous); }, setLoading() {},
  });
  return result;
}
let cnnFixture = null, macroFixture = null, engineFailure = false;
const engineModule = { exports: {} };
vm.runInNewContext(transpile(read('src/services/guardian/rlsiEngine.ts')), {
  exports: engineModule.exports,
  console: { log() {}, error() {} },
  require: name => {
    if (name === '@/lib/sentimentObservation') return sentimentModule.exports;
    if (name === '@/lib/marketIndicators') {
      const mod = { exports: {} }; vm.runInNewContext(transpile(read('src/lib/marketIndicators.ts')), { exports: mod.exports }); return mod.exports;
    }
    if (name === '@/services/massiveClient') return { fetchMassive: async () => ({ results: [] }) };
    if (name === '@/services/fedApiClient') return { getTreasuryYields: async () => ({ us10y: 4 }) };
    if (name === '@/services/macroHubProvider') return { getMacroSnapshotSSOT: async () => { if (!macroFixture) throw new Error('offline missing macro'); return macroFixture; } };
    if (name === './breadthEngine') return { getMarketBreadth: async () => null };
    if (name === '@/services/yahooFinanceHub') return { getYahooDataSSOT: async () => { if (engineFailure) throw new Error('offline failure'); return {}; } };
    if (name === '@/services/redisClient') return { getFromCache: async key => key === 'cnn:feargreed' ? cnnFixture : null, setInCache: async () => { throw new Error('Engine fixture write forbidden'); } };
    throw new Error(`Unmocked engine import ${name}`);
  },
});

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
    const data = flowPayload(opening('2026-10-19'), [contract('2026-10-19')]);
    assert.equal(flowAt('2026-10-19T19:59:00Z', data).alert.oiChange, 20000);
    const after = flowAt('2026-10-19T20:01:00Z', data);
    assert.equal(after.alert, null); assert.equal(after.openingPositions.length, 0);
    data.contracts.push(contract('2026-11-20'));
    data.openingByExpiry['2026-11-20'] = { callContracts: 15000, putContracts: 0, callNotional: 150000000, putNotional: 0, largest: opening('2026-11-20', 15000) };
    assert.equal(flowAt('2026-10-19T20:01:00Z', data).alert.expiration, '2026-11-20');
    data.openingByExpiry['2026-11-20'].largest = opening('2026-11-20');
    assert.equal(flowAt('2026-10-19T20:01:00Z', data).alert.oiChange, 20000);
  });
  await test('P2 early close: same expiry judge rejects 13:00 ET and weekend expiry after Friday close', () => {
    const data = flowPayload(opening('2026-11-27'));
    assert(flowAt('2026-11-27T17:59:00Z', data).alert);
    assert.equal(flowAt('2026-11-27T18:00:00Z', data).alert, null);
    assert.equal(flowAt('2026-10-16T20:01:00Z', flowPayload(opening('2026-10-17'))).alert, null);
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

  await test('P1 second gate: real CSV blank OI stays null in baseline; next day 10,000 is not an increase', async () => {
    for (const firstOi of ['', ' ', 'null', 'NaN']) {
      const r = await runBulkFixture({ apiContracts: 200, firstOi });
      assert.equal(r.baseline.complete, true);
      assert.equal(r.baseline.oiFormat, 'nullable-oi-v1');
      assert.equal(r.baseline.oi.T0_0, null);
      assert.equal(r.bundle.tickers.T0.top.find(c => c.c === 'T0_0').oi, null);
      const a = createAggregator(r.baseline.oi, { baselineComplete: true, baselineTickers: ['NVDA'] });
      a.add(row('T0_0', 10000));
      assert.equal(finalizeTickers(a.agg).NVDA.top[0].d, null);
      assert.equal(Object.keys(finalizeTickers(a.agg).NVDA.openingByExpiry).length, 0);
    }
  });
  await test('P1 API and aggregator distinguish missing current OI from observed zero on both comparison days', () => {
    const { mapApiRow } = require('../scripts/intrinio-options-eod.js');
    for (const value of [null, undefined, '', ' ', 'null', 'bad', NaN, Infinity, -1, false]) {
      const mapped = mapApiRow('NVDA', { option: { code: 'NVDA261120C00100000', expiration: '2026-11-20', type: 'call', strike: 100 }, price: { open_interest: value, volume: 1 } });
      assert.equal(mapped.oi, null);
      const a = createAggregator({ X: 0 }, { baselineComplete: true, baselineTickers: ['NVDA'] });
      a.add(row('X', value));
      assert.equal(a.oiOut.X, null); assert.equal(finalizeTickers(a.agg).NVDA.top[0].d, null);
    }
    for (const value of [0, '0']) {
      const a = createAggregator({}, { baselineComplete: true, baselineTickers: ['NVDA'] }); a.add(row('X', value));
      assert.equal(a.oiOut.X, 0);
      const next = createAggregator(a.oiOut, { baselineComplete: true, baselineTickers: ['NVDA'] }); next.add(row('X', 10000));
      assert.equal(finalizeTickers(next.agg).NVDA.openingByExpiry['2026-11-20'].callContracts, 10000);
    }
  });
  await test('P2 second gate: cached +35,000 becomes live +15,000 at regular and early close; side and largest follow buckets', () => {
    for (const [expiry, before, after] of [
      ['2026-10-19', '2026-10-19T19:59:00Z', '2026-10-19T20:01:00Z'],
      ['2026-11-27', '2026-11-27T17:59:00Z', '2026-11-27T18:00:00Z'],
    ]) {
      const data = flowPayload(opening(expiry), [contract('2026-12-18')]);
      data.opening.callContracts = 35000; data.opening.side = 'call';
      assert.equal(openingSideTotal(flowAt(before, data).liveOpening), 35000);
      const result = flowAt(after, data);
      assert.equal(openingSideTotal(result.liveOpening), 15000);
      assert.equal(result.alert.expiration, '2026-12-18'); assert.equal(result.alert.oiChange, 15000);
      data.openingByExpiry['2026-12-18'] = { callContracts: 0, putContracts: 15000, callNotional: 0, putNotional: 150000000, largest: { ...opening('2026-12-18', 15000), type: 'put' } };
      assert.equal(flowAt(after, data).liveOpening.side, 'put');
      delete data.openingByExpiry;
      assert.equal(flowAt(after, data).liveOpening, null); // legacy CDN has no full-chain basis; top12 cannot stand in for it
    }
    const data = flowPayload(opening('2026-10-19'));
    assert.equal(flowAt('2026-10-19T20:01:00Z', data).liveOpening.contracts, 0);
    const src = read('src/app/[locale]/app-view/flow/page.tsx');
    assert(src.includes('openingSideTotal(liveOpening)')); assert(!src.includes('openingSideTotal(optionsEod?.opening)'));
  });
  await test('P2 second gate: actual engine carries observed sentiment and original date through missing inputs and exceptions', async () => {
    const engine = engineModule.exports;
    const first = await engine.calculateRLSI(true);
    assert.equal(first.components.sentimentScore, null); // absent CNN + rejected macro must not synthesize VIX 15
    cnnFixture = { score: 72, rating: 'greed', updatedAt: '2026-10-16T20:00:00Z' };
    const good = await engine.calculateRLSI(true);
    assert.equal(good.available, true); assert.equal(good.components.sentimentScore, 72);
    assert.equal(good.components.sentimentAsOf, cnnFixture.updatedAt);
    cnnFixture = null;
    for (let i = 0; i < 2; i++) {
      const missing = await engine.calculateRLSI(true);
      assert.equal(missing.available, true); assert.equal(missing.components.sentimentScore, 72);
      assert.equal(missing.components.sentimentAsOf, good.components.sentimentAsOf); assert.equal(missing.components.sentimentCarried, true);
      const html = renderHeader(missing.components);
      assert(html.includes('72.0')); assert(html.includes('GREED')); assert(html.includes('2026-10-16')); assert(!html.includes('EXTREME FEAR'));
      assert(renderGauge(72, false, missing.components).includes('2026-10-16'));
    }
    engineFailure = true;
    const failed = await engine.calculateRLSI(true);
    assert.equal(failed.available, false); assert.equal(failed.components.sentimentScore, 72);
    assert.equal(failed.components.sentimentAsOf, good.components.sentimentAsOf);
    engineFailure = false;
    macroFixture = { vix: 23.5, factors: { vix: { updatedAt: '2026-10-19T15:00:00Z' } } };
    const recovered = await engine.calculateRLSI(true);
    assert.equal(recovered.components.sentimentScore, 50); assert.equal(recovered.components.sentimentCarried, false);
    assert.equal(recovered.components.sentimentAsOf, macroFixture.factors.vix.updatedAt);
  });
  await test('P2 snapshot merger and actual header: no history stays unknown; repeated gaps preserve dated actual zero and verdict', () => {
    for (const value of [null, undefined, NaN, Infinity, -1, 101]) {
      const html = renderHeader({ sentimentScore: value });
      assert(!html.includes('EXTREME FEAR')); assert(!html.includes('NEUTRAL')); assert(!html.includes('NaN')); assert(!html.includes('Infinity'));
    }
    let previous = { rlsi: { components: { sentimentScore: 0, sentimentAsOf: '2026-10-16T20:00:00Z', sentimentSource: 'CNN' } } };
    for (let i = 0; i < 3; i++) {
      previous = mergeSnapshot(previous, { rlsi: { components: { sentimentScore: null, breadthScore: 65 } } });
      assert.equal(previous.rlsi.components.sentimentScore, 0); assert.equal(previous.rlsi.components.breadthScore, 65);
      assert.equal(previous.rlsi.components.sentimentAsOf, '2026-10-16T20:00:00Z');
      const html = renderHeader(previous.rlsi.components);
      assert(html.includes('0.0')); assert(html.includes('EXTREME FEAR')); assert(html.includes('2026-10-16'));
    }
    const unknown = retainSentiment(null, { sentimentScore: 50 });
    assert.equal(unknown.sentimentScore, null); assert.equal(sentimentDate(unknown), ''); // do not invent an observation date
    const restored = mergeSnapshot(previous, { rlsi: { components: { sentimentScore: 82, sentimentAsOf: '2026-10-19T15:00:00Z' } } });
    assert.equal(restored.rlsi.components.sentimentScore, 82); assert.equal(restored.rlsi.components.sentimentCarried, false);
  });

  await test('P1 baseline migration: legacy synthetic zero excluded in bulk/API, new observed zero retained', () => {
    for (const trackOi of [false, true]) for (const baselineZeroObserved of [false, true]) {
      const a = createAggregator({ OLD_ZERO: 0, OBSERVED: 5000 }, { trackOi, baselineZeroObserved, baselineComplete: true, baselineTickers: ['NVDA'] });
      a.add(row('OLD_ZERO', 10000)); a.add(row('OBSERVED', 6000));
      const raw = finalizeTickers(a.agg).NVDA;
      assert.equal(raw.top.find(c => c.c === 'OLD_ZERO').d, baselineZeroObserved ? 10000 : null);
      assert.equal(raw.openingByExpiry['2026-11-20'].callContracts, baselineZeroObserved ? 11000 : 1000);
    }
    // Both production entry points require the stored format marker before accepting zero.
    assert.equal((collectorSource.match(/baselineZeroObserved: prevOi.oiFormat === 'nullable-oi-v1'/g) || []).length, 2);
  });

  console.log(`${count}/${count} passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
