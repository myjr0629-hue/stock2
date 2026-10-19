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
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { optionFlowBasisLabel } from '../src/lib/app/optionFlowBasis';
import { OptionFlowBasisDate } from '../src/components/app/OptionFlowBasisDate';
import { netPremiumOf, totalPremiumOf, premiumLabel } from '../src/lib/premiumFlow';

const realFetch = globalThis.fetch;
globalThis.fetch = (() => { throw new Error('NB3 replay must stay offline'); }) as any;
process.on('exit', () => { globalThis.fetch = realFetch; });

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

test('legacy CLOSED fallback requires explicit EOD and matching healthy snapshot session dates', () => {
  const source = { dataFreshness: { premium: 'EOD', volume: 'EOD', chainDate: null } };
  const snapshot = { session: 'CLOSED', _stale: false, _lastGoodAgeMs: 0,
    prices: { regularDate: '2026-10-16' }, baseline: { shownSessionET: '2026-10-16' } };
  const label = (context: any, f: any = source) => optionFlowBasisLabel(f, 'ko', ['premium', 'volume'], context);
  assert.equal(label(snapshot), '10/16 기준');
  for (const session of ['REG', 'PRE', 'POST', undefined]) assert.equal(label({ ...snapshot, session }), null);
  assert.equal(label({ ...snapshot, _stale: true }), null);
  assert.equal(label({ ...snapshot, _stale: undefined }), null);
  assert.equal(label({ ...snapshot, _lastGoodAgeMs: 300_000 }), null);
  assert.equal(label({ ...snapshot, _lastGoodAgeMs: undefined }), null);
  assert.equal(label({ ...snapshot, _stale: undefined, _lastGoodAgeMs: undefined }), '10/16 기준', 'fresh uncached payload has no last-good flags');
  assert.equal(label({ ...snapshot, baseline: { shownSessionET: '2026-10-15' } }), null);
  assert.equal(label({ ...snapshot, prices: null }), null);
  assert.equal(label({ ...snapshot, baseline: null }), null);
  assert.equal(label({ ...snapshot, prices: { regularDate: '2026-02-30' }, baseline: { shownSessionET: '2026-02-30' } }), null);
  assert.equal(label(snapshot, { dataFreshness: { ...source.dataFreshness, volume: 'REALTIME' } }), null);
  assert.equal(label(snapshot, { dataFreshness: { premium: 'EOD' } }), null);
  assert.equal(label(snapshot, { dataFreshness: { ...source.dataFreshness, chainDate: '2026-10-14' } }), '10/14 기준');
  assert.equal(label(snapshot, { ...source, chainDate: '2026-10-13' }), '10/13 기준');
  assert.equal(label(snapshot, { dataFreshness: { ...source.dataFreshness, chainDate: 'invalid' } }), null);
});

test('cmd never gives an undated structure fallback the ticker session date', () => {
  const rawTickerData = { session: 'CLOSED', _stale: false, _lastGoodAgeMs: 0,
    prices: { regularDate: '2026-10-16' }, baseline: { shownSessionET: '2026-10-16' },
    flow: { netPremium: 0, contractsProcessed: 0 } };
  const structure = { netPremium: 2_000_000, premiumContracts: 5, dataFreshness: { premium: 'EOD' } };
  assert.equal(cmd.value('premiumBasisLabel', { data: { rawTickerData, unified: { structure } }, locale: 'ko' }), null);
  rawTickerData.flow.contractsProcessed = 1;
  Object.assign(rawTickerData.flow, { dataFreshness: { premium: 'EOD', chainDate: null } });
  assert.equal(cmd.value('premiumBasisLabel', { data: { rawTickerData, unified: { structure } }, locale: 'ko' }), '10/16 기준', 'observed zero keeps the raw snapshot');
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
    test(`${ticker}/${screen}: actual CLOSED operating API snapshot (gate 10200159)`, { skip: !sweep }, () => {
      const rows = json(path.join(sweep, 'closed', `${screen}_${ticker}`, 'api.json'));
      const row = rows.filter((r: any) => r.status === 200 && r.url.includes('/api/live/ticker?')).at(-1);
      assert.ok(row, 'actual saved CLOSED response exists');
      const payload = typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
      assert.equal(payload.session, 'CLOSED');
      assert.equal(payload.prices.regularDate, '2026-10-16');
      assert.equal(payload.baseline.shownSessionET, '2026-10-16');
      if (screen === 'flow') assert.equal(payload.flow.dataFreshness.chainDate, ['NVDA', 'MSFT', 'WTFC', 'FITB'].includes(ticker) ? null : '2026-10-16');
      if (screen === 'flow') replay(payload, 'CLOSED', expected[ticker]);
      else replayCmd(payload, expected[ticker]);
    });
  }
}
