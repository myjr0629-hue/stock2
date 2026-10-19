/** Offline REG + previous-session replay. Market fields only; all network blocked. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { compactUsd, signedPercent, ivSkewRatioText } from '../src/lib/app/displayNumbers';
import { fmtEpsUsd } from '../src/lib/earnings/earningsBrief';
import { fmtPremiumM } from '../src/lib/premiumFlow';
import { selectWhaleSession } from '../src/lib/app/flowWhaleSession';

const fixture = JSON.parse(fs.readFileSync('tests/fixtures/nb467-market-replay.json', 'utf8'));
globalThis.fetch = async () => { throw new Error('network forbidden in replay'); };
// Explicit read-only baseline reproduction on the branch base, without restoring files.
const source = (path: string) => process.env.NB467_BASELINE === '1'
  ? execFileSync('/usr/bin/git', ['show', `1b31b0a894206b52accaa05b8569dd86463809a7:${path}`], { encoding: 'utf8' })
  : fs.readFileSync(path, 'utf8');
const flow = ts.createSourceFile('flow.tsx', source('src/app/[locale]/app-view/flow/page.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const cmd = ts.createSourceFile('cmd.tsx', source('src/app/[locale]/app-view/cmd/page.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(source: ts.SourceFile, predicate: (n: ts.Node) => boolean): ts.Node {
  let found: ts.Node | undefined;
  const walk = (n: ts.Node) => { if (!found && predicate(n)) found = n; if (!found) ts.forEachChild(n, walk); };
  walk(source); assert.ok(found, 'production JSX expression found'); return found;
}
function evaluate(code: string, context: any): any {
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  return vm.runInNewContext(js, { exports: {}, require, compactUsd, fmtPremiumM, ivSkewRatioText, ...context });
}
function render(node: ts.Node, source: ts.SourceFile, context: any) {
  return renderToStaticMarkup(evaluate(`(${node.getText(source)});`, context)).replace(/<!--.*?-->/g, '');
}
const hero = (source: ts.SourceFile) => find(source, n => ts.isJsxElement(n) && n.openingElement.tagName.getText(source) === 'div'
  && n.openingElement.attributes.getText(source).includes('heroMetricCard') && n.getText(source).includes("premiumLabel('net'"));
const styles = new Proxy({}, { get: (_t, key) => String(key) });
const premiumLabel = () => '순 프리미엄';

test('REG 10:10 ET + prior CLOSED: saved ticker/options-eod/ivp/quotes replay into both actual hero cards', () => {
  for (const [kind, rows] of Object.entries({ regular: fixture.regular, closed: fixture.closed }) as any) {
    for (const [ticker, row] of Object.entries(rows) as any) {
      const payload = kind === 'regular' ? row.ticker : row;
      assert.equal(payload.ticker, ticker, 'capture must match the requested ticker');
      if (kind === 'regular') {
        assert.equal(payload.session, 'REG');
        assert.ok(row.quote); assert.ok(row.ivp); assert.ok(row.optionsEod);
        // Replay preserves existing upstream missing states; formatting never changes the payload.
        if (ticker === 'TSLA') assert.equal(row.optionsEod.available, false);
      }
      const net = payload.flow.netPremium;
      const expected = compactUsd(net, true);
      const bodyText = find(flow, n => ts.isVariableDeclaration(n) && n.name.getText(flow) === 'netPremiumText') as ts.VariableDeclaration;
      assert.equal(evaluate(`(${bodyText.initializer!.getText(flow)});`, { netPremiumOverview: net }), expected);
      const common = { locale: 'ko', s: styles, premiumLabel, MetricInfo: () => null };
      const flowHtml = render(hero(flow), flow, { ...common, netPremiumVal: net });
      const cmdHtml = render(hero(cmd), cmd, { ...common, data: { premium: { netPremium: net } } });
      for (const html of [flowHtml, cmdHtml]) {
        assert.ok(html.includes(expected), `${kind} ${ticker}: ${expected}`);
        assert.doesNotMatch(html, /\$-/);
      }
      assert.doesNotMatch(ivSkewRatioText(payload.flow.ivSkew), /%/);
    }
  }
  assert.equal(fmtPremiumM(fixture.regular.WTFC.ticker.flow.totalPremium), '$3.5K');
  assert.equal(compactUsd(17055844), '$17.1M'); assert.equal(compactUsd(39240500), '$39.2M');
  assert.equal(compactUsd(-44000, true), '−$44.0K');
  assert.equal(compactUsd(0, true), '$0'); assert.equal(compactUsd(null), '—');
  assert.equal(fmtEpsUsd(-0.24), '−$0.24'); assert.equal(fmtEpsUsd(-0.001), '$0.00');
  assert.equal(signedPercent(-0.012), '0.0%'); assert.equal(signedPercent(0.012), '0.0%');
  assert.equal(signedPercent(-1.25), '−1.3%');
});

test('NB6: all 7 saved AI responses render the actual confidence enum in the mobile card', () => {
  const cell = find(cmd, n => ts.isJsxElement(n) && n.openingElement.tagName.getText(cmd) === 'span'
    && n.getText(cmd).includes("['HIGH', 'MEDIUM', 'LOW'].includes(verdictHeader.confidence)"));
  for (const [ticker, payload] of Object.entries(fixture.ai) as any) {
    const html = render(cell, cmd, { verdictHeader: payload });
    assert.ok(html.includes(payload.confidence), ticker);
    if (ticker === 'FITB') assert.ok(html.includes('LOW'));
    else assert.ok(html.includes('MEDIUM'));
  }
  assert.ok(render(cell, cmd, { verdictHeader: { confidence: undefined } }).includes('—'));
});

test('NB7: actual EOD card preserves premium/session without manufacturing a print or BID/ASK', () => {
  const declaration = find(flow, n => ts.isVariableDeclaration(n) && n.name.getText(flow) === 'renderWhaleCard') as ts.VariableDeclaration;
  for (const [key, body] of Object.entries(fixture.whales) as any) {
    const session = key.startsWith('live:') ? 'REG' : 'CLOSED';
    const now = Date.parse(session === 'REG' ? '2026-10-19T14:10:00Z' : '2026-10-18T23:14:00Z');
    const selected = selectWhaleSession(body, session, now);
    assert.equal(selected.basis, 'eod-volume'); assert.equal(selected.sessionDate, '2026-10-16');
    const item = selected.items[0]; assert.ok(item.premium > 0);
    assert.equal(item.side, null); assert.equal(item.timeET, null);
    const fn = evaluate(`(${declaration.initializer!.getText(flow)});`, {
      ticker: key.split(':')[1], displayPrice: 100, whaleBasis: selected.basis, whaleSessionDate: selected.sessionDate,
      whaleCopy: new Proxy({}, { get: (_t, k) => String(k) }),
    });
    const html = renderToStaticMarkup(fn({ ...item, px: item.price, dir: null, time: null }, 0));
    assert.ok(html.includes(compactUsd(item.premium))); assert.ok(html.includes('2026-10-16'));
    assert.doesNotMatch(html, /\bASK\b|\bBID\b/);
    const s: any = { whaleTradesFeed: selected.items, WHALE_PREMIUM_FLOOR: 50_000, useMemo: (fn: () => any) => fn() };
    for (const name of ['whaleSweeps', 'whaleSummary', 'whaleDayTotal', 'whaleDayCount']) {
      const decl = find(flow, n => ts.isVariableDeclaration(n) && n.name.getText(flow) === name) as ts.VariableDeclaration;
      s[name] = evaluate(`(${decl.initializer!.getText(flow)});`, s);
    }
    assert.equal(s.whaleDayCount, body.sessionAggregate.count);
    assert.equal(s.whaleDayTotal, selected.items.reduce((sum: number, x: any) => sum + x.premium, 0));
    const teaser = find(flow, n => ts.isJsxAttribute(n) && n.name.getText(flow) === 'teaser' && n.getText(flow).includes('whaleCopy.freePreview')) as ts.JsxAttribute;
    const expression = (teaser.initializer as ts.JsxExpression).expression!;
    const preview = evaluate(`(${expression.getText(flow)});`, {
      flowTab: 'whale', whaleMeta: body, whaleBasis: selected.basis, whaleDayCount: s.whaleDayCount, whaleDayTotal: s.whaleDayTotal, largestWhalePrint: null,
      whaleCopy: { freePreview: '무료 미리보기', prints: '건' },
      formatCompactMoney: (amount: number) => compactUsd(amount),
    });
    assert.equal(preview.value, `${s.whaleDayCount} 건 / ${compactUsd(s.whaleDayTotal)}`);
  }
});


test('NB4: actual IV skew cells and five-day tape never show ratio percent or negative zero', () => {
  const skewCell = find(flow, n => ts.isJsxElement(n) && n.getText(flow).includes('ivSkewRatioText(ivSkewVal)')
    && n.openingElement.tagName.getText(flow) === 'div' && n.getText(flow).length < 400);
  const skewAxis = find(flow, n => ts.isObjectLiteralExpression(n) && n.properties.some(p =>
    ts.isPropertyAssignment(p) && p.name.getText(flow) === 'label' && p.initializer.getText(flow) === "'IV Skew'"));
  for (const rows of [fixture.regular, fixture.closed]) for (const row of Object.values(rows) as any[]) {
    const value = (row.ticker?.flow ? row.ticker : row).flow.ivSkew;
    assert.ok(render(skewCell, flow, { ivSkewVal: value }).includes(ivSkewRatioText(value)));
    assert.equal(evaluate(`(${skewAxis.getText(flow)});`, { ivSkewVal: value }).value, ivSkewRatioText(value));
  }
  const tape = ts.createSourceFile('tape.tsx', source('src/components/app/App5DayTape.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const cell = find(tape, n => ts.isJsxElement(n) && n.openingElement.tagName.getText(tape) === 'span'
    && n.getText(tape).includes('signedPercent(d.chg)'));
  for (const chg of [-0.012, 0.012, -0, 0]) {
    assert.ok(render(cell, tape, { signedPercent, d: { chg }, GREEN: '#0f0', RED: '#f00' }).includes('0.0%'));
  }
});

test('NB4: compact formatting keeps observations, signs, unit boundaries and EPS parser parity', () => {
  assert.equal(compactUsd(999999), '$1.0M'); assert.equal(compactUsd(-999999999, true), '−$1.0B');
  assert.equal(compactUsd(-0.001, true), '$0'); assert.equal(compactUsd(NaN), '—');
  assert.equal(signedPercent(Infinity), '—'); assert.equal(ivSkewRatioText(null), '—');
  const { checkBriefNumbers, fillBriefNumbers } = require('../src/lib/earnings/earningsBrief');
  const row = { ticker: 'TEST', date: '2026-10-20', epsEstimate: -0.24, revenueEstimate: null };
  const rendered = fillBriefNumbers('EPS {EPS}', row);
  assert.equal(rendered, 'EPS −$0.24');
  // Use the public gate API, accepting both persisted ASCII and newly formatted Unicode signs.
  for (const text of ['EPS −$0.24', 'EPS -$0.24', 'EPS $-0.24']) {
    assert.equal(checkBriefNumbers(text, row).ok, true);
  }
  assert.equal(checkBriefNumbers('EPS −$0.25', row).ok, false);
});

test('NB7 gate: EOD totals never become largest prints; live preview retains its maximum', () => {
  const value = (name: string, context: any) => {
    const declaration = find(flow, n => ts.isVariableDeclaration(n) && n.name.getText(flow) === name) as ts.VariableDeclaration;
    return evaluate(`(${declaration.initializer!.getText(flow)});`, context);
  };
  const insiderStats = { count: 1, largest: 297942896 };
  assert.equal(value('largestWhalePrint', { whaleBasis: 'eod-volume', whaleSweeps: [{ premium: 17055844 }] }), null);
  assert.equal(value('largestInstitutionalPrint', { flowTab: 'whale', largestWhalePrint: null, insiderStats }), null);
  const teaser = find(flow, n => ts.isJsxAttribute(n) && n.name.getText(flow) === 'teaser' && n.getText(flow).includes('whaleCopy.freePreview')) as ts.JsxAttribute;
  const expression = (teaser.initializer as ts.JsxExpression).expression!;
  const preview = evaluate(`(${expression.getText(flow)});`, {
    flowTab: 'whale', whaleMeta: {}, whaleBasis: null, whaleDayCount: 2, whaleDayTotal: 600000, largestWhalePrint: 400000,
    whaleCopy: { freePreview: '무료 미리보기', prints: '건' },
    formatCompactMoney: (amount: number) => compactUsd(amount),
  });
  assert.equal(preview.value, '2 건 / $400.0K');
});

test('NB6: absent confidence does not claim LOW in the actual meter', () => {
  const meter = find(cmd, n => ts.isJsxElement(n) && n.openingElement.attributes.getText(cmd) === 'className="flex items-center gap-1.5"'
    && n.getText(cmd).includes('CONFIDENCE'));
  const missing = render(meter, cmd, { verdictHeader: {} });
  assert.equal((missing.match(/bg-slate-700/g) || []).length, 3);
  assert.doesNotMatch(missing, /bg-cyan-400|>LOW</);
  for (const [confidence, dots] of [['HIGH', 3], ['MEDIUM', 2], ['LOW', 1]] as const) {
    const html = render(meter, cmd, { verdictHeader: { confidence } });
    assert.equal((html.match(/bg-cyan-400/g) || []).length, dots);
    assert.ok(html.includes(`>${confidence}</span>`));
  }
});
