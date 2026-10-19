/** NB3 offline replay. No browser, network, env file, Redis or DB.
 * node -r ts-node/register/transpile-only -r tsconfig-paths/register tests/nb3FlowBasis.test.ts <reg-snapshots> [integrity-sweep]
 * TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx"}'
 * Replays both saved REG payloads and actual CLOSED payloads without changing their metadata.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { datedEodChain, matchingOptionDate } from '../src/lib/optionFlowDate';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { optionFlowBasisLabel } from '../src/lib/app/optionFlowBasis';
import { OptionFlowBasisDate } from '../src/components/app/OptionFlowBasisDate';
import { netPremiumOf, totalPremiumOf, premiumLabel } from '../src/lib/premiumFlow';

const realFetch = globalThis.fetch;
globalThis.fetch = (() => { throw new Error('NB3 replay must stay offline'); }) as any;
process.on('exit', () => { globalThis.fetch = realFetch; });

// Load the actual service with a forbidden default read. Every replay supplies saved data.
const serviceModule = { exports: {} as any };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/optionFlowDate.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: serviceModule.exports, module: serviceModule, Set,
  require: (name: string) => {
    if (name === '@/lib/optionFlowDate') return require('../src/lib/optionFlowDate');
    if (name === '@/services/redisClient') return { mgetFromCache: () => { throw new Error('live cache access forbidden'); } };
    throw new Error(`unexpected service import ${name}`);
  },
});
const restoreOptionFlowDate: typeof import('../src/services/optionFlowDate').restoreOptionFlowDate = serviceModule.exports.restoreOptionFlowDate;
const cacheRead = (records: any[], seen?: string[][]): any => async (keys: string[]) => { seen?.push([...keys]); return records; };

function page(which: 'flow' | 'cmd') {
  const source = fs.readFileSync(`src/app/[locale]/app-view/${which}/page.tsx`, 'utf8');
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map<string, ts.VariableDeclaration>();
  const nodes: ts.Node[] = [];
  (function visit(n: ts.Node) {
    nodes.push(n);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && !declarations.has(n.name.text)) declarations.set(n.name.text, n);
    ts.forEachChild(n, visit);
  })(ast);
  const evaluate = (code: string, ctx: Record<string, any>) => {
    const js = ts.transpileModule(`(${code})`, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    return vm.runInNewContext(js, { require, exports: {}, useMemo: (fn: () => any) => fn(), optionFlowBasisLabel,
      OptionFlowBasisDate, netPremiumOf, premiumLabel, ...ctx });
  };
  return {
    value(name: string, ctx: Record<string, any> = {}) {
      const init = declarations.get(name)?.initializer;
      assert.ok(init, `${which}.${name} exists`);
      return evaluate(init.getText(ast), ctx);
    },
    renderSmallest(fragment: string, ctx: Record<string, any>) {
      const matches = nodes.filter(n => (ts.isJsxElement(n) || ts.isJsxFragment(n))
        && n.getText(ast).includes(fragment) && n.getText(ast).includes('<OptionFlowBasisDate'));
      matches.sort((a, b) => a.getWidth(ast) - b.getWidth(ast));
      assert.ok(matches.length, `${which}: date is adjacent to ${fragment}`);
      return renderToStaticMarkup(evaluate(matches[0].getText(ast), ctx));
    },
  };
}
const flow = page('flow');
const cmd = page('cmd');
const flowCopy = flow.value('APP_FLOW_COPY').ko;
const s = new Proxy({}, { get: (_, key) => String(key) });
const json = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const eod = { dataFreshness: { premium: 'EOD', volume: 'EOD', greeks: 'REALTIME', chainDate: '2026-10-16' } };

test('basis depends on each metric, never on realtime Greeks, quotes, OI date or wall clock', () => {
  assert.equal(optionFlowBasisLabel(eod, 'ko'), '10/16 기준');
  assert.equal(optionFlowBasisLabel(eod, 'en'), 'as of 10/16');
  assert.equal(optionFlowBasisLabel(eod, 'ja'), '10/16 時点');
  const mixed = { dataFreshness: { ...eod.dataFreshness, premium: 'REALTIME' } };
  assert.equal(optionFlowBasisLabel(mixed, 'ko', ['premium']), null);
  assert.equal(optionFlowBasisLabel(mixed, 'ko', ['volume']), '10/16 기준');
  assert.equal(optionFlowBasisLabel(mixed, 'ko'), '10/16 기준');
  assert.equal(optionFlowBasisLabel({ dataFreshness: { ...mixed.dataFreshness, volume: 'REALTIME' } }, 'ko'), null);
  for (const chainDate of [null, '', '2026-02-30', '2026-13-01', 1792195200000, '2026-10-16T20:00:00Z']) {
    assert.equal(optionFlowBasisLabel({ dataFreshness: { premium: 'EOD', chainDate }, prevDate: '2026-10-15', timestampET: '2026-10-19' }, 'ko'), null);
  }
  assert.equal(renderToStaticMarkup(createElement(OptionFlowBasisDate, { label: null })), '');
});

test('cmd fallback date follows the selected observed premium, including zero', () => {
  const structure = { chainDate: '2026-10-15', netPremium: 2_000_000, premiumContracts: 5 };
  const raw = { ...eod, netPremium: 0, contractsProcessed: 5 };
  const label = (rawFlow: any, fallback = structure) => cmd.value('premiumBasisLabel', {
    data: { rawTickerData: { flow: rawFlow }, unified: { structure: fallback } }, locale: 'ko',
  });
  assert.equal(label(raw), '10/16 기준', 'observed zero keeps its own source');
  assert.equal(label({ ...raw, contractsProcessed: 0 }), '10/15 기준');
  assert.equal(label({ ...raw, error: 'offline failure' }), '10/15 기준');
  assert.equal(label({ ...raw, dataFreshness: { ...eod.dataFreshness, premium: 'REALTIME' } }), null);
});

test('gate 10200214: stock dates and healthy response ages cannot date undated options', () => {
  const source = { netPremium: 400, contractsProcessed: 2,
    dataFreshness: { premium: 'EOD', volume: 'EOD', chainDate: null } };
  for (const age of [0, 1, 300_000]) {
    const rawTickerData = { flow: source, session: 'CLOSED', _stale: false, _lastGoodAgeMs: age,
      prices: { regularDate: '2026-10-16' }, baseline: { shownSessionET: '2026-10-16' } };
    assert.equal(cmd.value('premiumBasisLabel', { data: { rawTickerData }, locale: 'ko' }), null);
  }
});

test('cmd never gives an undated structure fallback the ticker session date', () => {
  const rawTickerData = { session: 'CLOSED', _stale: false, _lastGoodAgeMs: 0,
    prices: { regularDate: '2026-10-16' }, baseline: { shownSessionET: '2026-10-16' },
    flow: { netPremium: 0, contractsProcessed: 0 } };
  const structure = { netPremium: 2_000_000, premiumContracts: 5, dataFreshness: { premium: 'EOD' } };
  assert.equal(cmd.value('premiumBasisLabel', { data: { rawTickerData, unified: { structure } }, locale: 'ko' }), null);
  rawTickerData.flow.contractsProcessed = 1;
  Object.assign(rawTickerData.flow, { dataFreshness: { premium: 'EOD', chainDate: null } });
  assert.equal(cmd.value('premiumBasisLabel', { data: { rawTickerData, unified: { structure } }, locale: 'ko' }), null, 'an undated observed zero cannot borrow the stock session date');
});

function replayCmd(payload: any, expected?: readonly number[]) {
  const before = JSON.stringify(payload);
  const data = { rawTickerData: payload, unified: {}, premium: { netPremium: netPremiumOf(payload.flow) } };
  const cmdLabel = cmd.value('premiumBasisLabel', { data, locale: 'ko' });
  assert.equal(cmdLabel, '10/16 기준');
  assert.match(cmd.renderSmallest("premiumLabel('net', locale)", { data, locale: 'ko', premiumBasisLabel: cmdLabel, s, MetricInfo: () => null }), /순 프리미엄[\s\S]*10\/16 기준/);
  assert.equal(cmd.value('sessionLabel', { effectiveSession: payload.session }), payload.session === 'REG' ? 'MARKET OPEN' : 'MARKET CLOSED');
  assert.equal(data.premium.netPremium, payload.flow.netPremium);
  if (expected) assert.deepEqual([totalPremiumOf(payload.flow), data.premium.netPremium], [...expected.slice(0, 2)]);
  assert.equal(JSON.stringify(payload), before, 'cmd replay never changes source values');
}

function replay(tickerData: any, session: 'REG' | 'CLOSED', expected?: readonly number[]) {
  const before = JSON.stringify(tickerData);
  const ticker = tickerData.ticker;
  const payload = { ...tickerData, session };
  const ctx: Record<string, any> = { tickerData: payload, ticker, locale: 'ko', flowCopy, s,
    effectiveSession: session, opi: 42, t: { opiGauge: '옵션 압박 지수 (OPI)' }, renderInfoBtn: () => null };
  for (const name of ['flowBasisLabel', 'premiumBasisLabel', 'volumeBasisLabel', 'opiCalculated']) ctx[name] = flow.value(name, ctx);
  assert.equal(ctx.flowBasisLabel, '10/16 기준');
  assert.equal(ctx.premiumBasisLabel, '10/16 기준');
  assert.equal(ctx.volumeBasisLabel, '10/16 기준');
  assert.match(flow.renderSmallest('flowCopy.intraday', ctx), new RegExp(`${session === 'REG' ? '장중 작동' : '장마감'}[\\s\\S]*10/16 기준`));
  assert.match(flow.renderSmallest('flowCopy.estimatedSource', ctx), new RegExp(`${session === 'REG' ? 'LIVE FLOW' : 'ESTIMATED'}[\\s\\S]*10/16 기준`));
  assert.match(flow.renderSmallest('{flowCopy.liveSource}', ctx), /LIVE FLOW[\s\S]*10\/16 기준/);
  assert.match(flow.renderSmallest('주간 만기 거래량', ctx), /주간 만기 거래량[\s\S]*10\/16 기준/);
  assert.match(flow.renderSmallest("premiumLabel('net', locale)", ctx), /순 프리미엄[\s\S]*10\/16 기준/);

  replayCmd(payload, expected);

  ctx.rawChain = flow.value('rawChain', ctx);
  ctx.chainVolumes = flow.value('chainVolumes', ctx);
  ctx.callPct = ctx.chainVolumes.callPct;
  ctx.absNetPrem = Math.abs(payload.flow.netPremium);
  const net = flow.value('netPremiumOverview', ctx);
  assert.equal(net, tickerData.flow.netPremium);
  assert.equal(totalPremiumOf(payload.flow), tickerData.flow.totalPremium);
  if (expected) assert.deepEqual([totalPremiumOf(payload.flow), net, ctx.chainVolumes.call, ctx.chainVolumes.put, ctx.callPct], [...expected]);
  assert.equal(JSON.stringify(tickerData), before, 'replay never changes source values');
}

const snapshots = process.argv[2];
const sweep = process.argv[3];
const expected: Record<string, readonly number[]> = {
  NVDA: [116404820.00250909, 4314055.126720481, 339198, 237475, 58.8],
  AAPL: [64269461.28522344, -43913.549771904945, 81725, 126619, 39.2],
  TSLA: [150568733.52550194, 26142417.74239689, 173181, 138688, 55.5],
  SPY: [248155555.28481603, -108777044.33421046, 256782, 465278, 35.6],
  WTFC: [3460.9999775886536, 1990.999948978424, 8, 5, 61.5],
  MSFT: [33989968.881406635, -4306398.892598972, 42024, 41632, 50.2],
  FITB: [101724.00187980384, 56114.00184202939, 2011, 185, 91.6],
};
for (const ticker of ['NVDA', 'AAPL', 'TSLA', 'SPY', 'WTFC']) {
  for (const session of ['REG', 'CLOSED'] as const) {
    test(`${ticker}: 23:10 KST saved ticker/options-eod/ivp/quotes, ${session}`, { skip: !snapshots }, () => {
      const payload = json(path.join(snapshots, `ticker-${ticker}-2310.json`));
      const options = json(path.join(snapshots, `options-eod-${ticker}-2310.json`));
      const ivp = json(path.join(snapshots, `ivp-${ticker}-2310.json`));
      const quotes = json(path.join(snapshots, 'quotes-2310.json'));
      assert.equal(payload.session, 'REG');
      assert.equal(quotes.session, 'regular');
      assert.equal(ivp.currentSession ?? null, ticker === 'WTFC' ? null : '2026-10-16');
      if (ticker === 'WTFC') assert.equal(ivp.sampleSize, 0, 'missing IVP must not erase the premium date');
      if (options.available) {
        assert.equal(options.date, '2026-10-16');
        assert.equal(options.prevDate, '2026-10-15', 'OI change date must not replace premium date');
      }
      assert.ok(quotes.data[ticker].price > 0, 'live underlying stays populated');
      replay(payload, session, expected[ticker]);
    });
  }
}
for (const ticker of ['NVDA', 'AAPL', 'TSLA', 'SPY', 'MSFT', 'WTFC', 'FITB']) {
  test(`${ticker}: sweep operating API evidence, REG + CLOSED`, { skip: !sweep }, () => {
    const rows = json(path.join(sweep, 'live', `flow_${ticker}`, 'api.json'));
    const row = rows.filter((r: any) => r.status === 200 && r.url.includes('/api/live/ticker?')).at(-1);
    assert.ok(row, 'saved ticker response exists');
    const payload = typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
    assert.equal(payload.session, 'REG');
    replay(payload, 'REG');
    replay(payload, 'CLOSED');
  });
}

// Gate 10200159: actual CLOSED payloads have null chainDate for NVDA/MSFT/WTFC/FITB.
for (const ticker of ['NVDA', 'AAPL', 'TSLA', 'SPY', 'MSFT', 'WTFC', 'FITB']) {
  for (const screen of ['flow', 'cmd']) {
    test(`${ticker}/${screen}: actual CLOSED operating API snapshot (gate 10200159)`, { skip: !sweep }, async () => {
      const rows = json(path.join(sweep, 'closed', `${screen}_${ticker}`, 'api.json'));
      const row = rows.filter((r: any) => r.status === 200 && r.url.includes('/api/live/ticker?')).at(-1);
      assert.ok(row, 'actual saved CLOSED response exists');
      const payload = typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
      assert.equal(payload.session, 'CLOSED');
      assert.equal(payload.prices.regularDate, '2026-10-16');
      assert.equal(payload.baseline.shownSessionET, '2026-10-16');
      if (screen === 'flow') assert.equal(payload.flow.dataFreshness.chainDate, ['NVDA', 'MSFT', 'WTFC', 'FITB'].includes(ticker) ? null : '2026-10-16');
      const liveRows = json(path.join(sweep, 'live', `flow_${ticker}`, 'api.json'));
      const liveRow = liveRows.filter((r: any) => r.status === 200 && r.url.includes('/api/live/ticker?')).at(-1);
      const dated = (typeof liveRow.body === 'string' ? JSON.parse(liveRow.body) : liveRow.body).flow;
      assert.equal(dated.dataFreshness.chainDate, '2026-10-16');
      // Reconstruction of the existing probe-cache shape from a dated saved ticker.
      // This is an offline source fixture, not a claim that production Redis was measured.
      const probe = { weeklyExpiry: dated.weeklyExpiration, chainDate: dated.dataFreshness.chainDate, exactResults: dated.rawChain };
      const original = JSON.stringify(payload);
      for (const age of [0, 1]) {
        const seen: string[][] = [];
        const recovered = await restoreOptionFlowDate(payload.flow, ticker, cacheRead([null, null, probe], seen));
        const repaired = { ...payload, _lastGoodAgeMs: age, flow: recovered };
        if (screen === 'flow') replay(repaired, 'CLOSED', expected[ticker]);
        else replayCmd(repaired, expected[ticker]);
        if (payload.flow.dataFreshness.chainDate == null) {
          assert.equal(seen.length, 1);
          assert.equal(seen[0][2], `polygon:snapshot:probe:${ticker}`);
        } else assert.equal(seen.length, 0);
      }
      assert.equal(JSON.stringify(payload), original, 'raw CLOSED evidence was not changed');
    });
  }
}

const weekly = '2026-10-23';
const sampleChain = [
  { details: { expiration_date: weekly, contract_type: 'call', strike_price: 100 }, day: { volume: 2, close: 3 } },
  { details: { expiration_date: weekly, contract_type: 'put', strike_price: 100 }, day: { volume: 1, close: 2 } },
];
const sampleFlow = { weeklyExpiration: weekly, optionsCount: 2, contractsProcessed: 2,
  callPremium: 600, putPremium: 200, totalPremium: 800, netPremium: 400,
  volumePcrCallVol: 2, volumePcrPutVol: 1, rawChain: sampleChain,
  dataFreshness: { premium: 'EOD', volume: 'EOD', chainDate: null } };
const sourceEod = (date = '2026-10-15') => ({ chain: sampleChain.map(c => ({
  option: { expiration: c.details.expiration_date, type: c.details.contract_type, strike: c.details.strike_price },
  prices: { date, close: c.day.close, volume: c.day.volume },
})) });

test('gate 10200214: 72h old options retain their own 10/15 date across REG/PRE/POST/CLOSED, ages 0 and 1', async () => {
  for (const session of ['REG', 'PRE', 'POST', 'CLOSED']) for (const age of [0, 1]) {
    const snapshot = { session, _stale: false, _lastGoodAgeMs: age,
      prices: { regularDate: '2026-10-16' }, baseline: { shownSessionET: '2026-10-16' } };
    const recovered = await restoreOptionFlowDate(sampleFlow, 'TEST', cacheRead([sourceEod(), null, null]));
    const data = { rawTickerData: { ...snapshot, flow: recovered } };
    assert.equal(cmd.value('premiumBasisLabel', { data, locale: 'ko' }), '10/15 기준');
    assert.equal(optionFlowBasisLabel(recovered, 'ko'), '10/15 기준');
  }
});

test('legacy chain=0 recovery requires every independent total; actual contracts require complete value identity', async () => {
  assert.equal(matchingOptionDate(sampleFlow, sampleChain, '2026-10-15'), '2026-10-15');
  for (const key of ['optionsCount', 'contractsProcessed', 'callPremium', 'putPremium', 'totalPremium', 'netPremium', 'volumePcrCallVol', 'volumePcrPutVol']) {
    const changed = { ...sampleFlow, rawChain: undefined, [key]: (sampleFlow as any)[key] + 1 };
    assert.equal(matchingOptionDate(changed, sampleChain, '2026-10-15'), null, key);
  }
  const changedChain = structuredClone(sampleChain);
  changedChain[0].details.strike_price = 105;
  assert.equal(matchingOptionDate(sampleFlow, changedChain, '2026-10-15'), null, 'same totals at different strikes are not the same chain');
  const recovered = await restoreOptionFlowDate({ ...sampleFlow, rawChain: undefined }, 'TEST', cacheRead([sourceEod(), null, null]));
  assert.equal(optionFlowBasisLabel(recovered, 'ko'), '10/15 기준');
});

test('missing/mismatching/conflicting/partial/mixed-date evidence never becomes a stock-session date or changes values', async () => {
  const changed = sourceEod(); changed.chain[0].prices.close++;
  const mixed = sourceEod(); mixed.chain[0].prices.date = '2026-10-16';
  const partial = { ...sourceEod(), next_page: 'more' };
  const invalid = sourceEod('2026-02-30');
  for (const records of [[null, null, null], [changed, null, null], [mixed, null, null], [partial, null, null], [invalid, null, null],
    [sourceEod('2026-10-15'), sourceEod('2026-10-16'), null]]) {
    assert.equal(await restoreOptionFlowDate(sampleFlow, 'TEST', cacheRead(records)), sampleFlow);
  }
  assert.equal(await restoreOptionFlowDate(sampleFlow, 'TEST', (async () => { throw new Error('offline'); }) as any), sampleFlow);
  assert.equal(datedEodChain(mixed), null);
  assert.equal(datedEodChain(partial), null);
  assert.equal(optionFlowBasisLabel(sampleFlow, 'ko'), null, 'unknown date remains unknown, values remain present');
});

test('dated source bypasses cache reads; calculated fallback, empty observations and unrelated expiry cannot be dated by EOD volume', async () => {
  let calls = 0;
  const read = cacheRead([sourceEod(), null, null]);
  const known = { ...sampleFlow, dataFreshness: { ...sampleFlow.dataFreshness, chainDate: '2026-10-14' } };
  assert.equal(await restoreOptionFlowDate(known, 'TEST', (async () => { calls++; return []; }) as any), known);
  assert.equal(calls, 0);
  for (const data of [{ ...sampleFlow, dataSource: 'CALCULATED' }, { ...sampleFlow, contractsProcessed: 0 },
    { ...sampleFlow, weeklyExpiration: '2026-11-20' }, { ...sampleFlow, optionsCount: 0 }]) {
    assert.equal(await restoreOptionFlowDate(data, 'TEST', read), data);
  }
});

test('production ticker output applies recovery on cache hits and final/last-good responses before emitting flow', async () => {
  const route = fs.readFileSync('src/app/api/live/ticker/route.ts', 'utf8');
  const ast = ts.createSourceFile('route.ts', route, ts.ScriptTarget.Latest, true);
  const exit = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'withExitLevels');
  assert.ok(exit);
  const js = ts.transpileModule(`${exit.getText(ast)}; withExitLevels;`, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const output = vm.runInNewContext(js, {
    dropStaleLiveVwap: (p: any) => p, priceAsOfET: () => '', readOptionAlpha: async () => new Map(),
    readOptionMetrics: async () => new Map(), applyOptionMetrics: (f: any) => f,
    restoreOptionFlowDate: (f: any, t: string) => restoreOptionFlowDate(f, t, cacheRead([sourceEod(), null, null])),
    displayLevels: () => ({}), gammaFlipTypeOf: () => null,
  });
  for (const extra of [{ _cached: true }, { _stale: false, _lastGoodAgeMs: 1 }, { _stale: true, _lastGoodAgeMs: 300_000 }]) {
    const payload = { ticker: 'TEST', session: 'CLOSED', flow: sampleFlow, ...extra };
    const repaired = await output(payload, async () => new Map(), 'TEST');
    assert.equal(optionFlowBasisLabel(repaired.flow, 'ko'), '10/15 기준');
    assert.equal(repaired.flow.netPremium, 400);
    assert.equal(payload.flow, sampleFlow);
  }
  assert.match(route, /withExitLevels\(\{ \.\.\.cached/);
  assert.match(route, /withExitLevels\(finalPayload/);
});
