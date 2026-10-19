import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { buildHomeSectors } from '../src/lib/app/homeSectors';
import { calculateMarketRiskScore } from '../src/lib/marketRiskScore';

// Execute the dashboard sector builder and actual score expressions, including
// dated real-value fallbacks. Testing only calculateMarketRiskScore missed this leak.
const source = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/dash/page.tsx'), 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const expressions: Record<string, string> = {};
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.initializer
      && ['breadthPct', 'riskScore', 'riskTone', 'verdictKey'].includes(node.name.getText(ast))) {
    expressions[node.name.getText(ast)] = node.initializer.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
function evaluate<T>(code: string, context: Record<string, unknown>): T {
  return vm.runInNewContext(ts.transpile(code, { target: ts.ScriptTarget.ES2022 }), context);
}
function dashboard() {
  let sectors = buildHomeSectors({});
  let sectorsReady = false;
  return {
    receive(q: Record<string, unknown>, quotesSession = 'closed') {
      sectorsReady = true;
      sectors = buildHomeSectors(q, sectors, quotesSession, '2026-10-19');
    },
    score() {
      const breadthPct = evaluate<number>(expressions.breadthPct, { sectorsReady, sectors });
      const riskScore = evaluate<number>(expressions.riskScore, {
        calculateMarketRiskScore, futuresAvg: 0, cashAvg: 0, breadthPct, fgValue: 50, vixChange: 0,
      });
      const context = { riskScore, regimeReady: true, copy: { riskOn: 'on', riskOff: 'off', mixed: 'mixed' } };
      return {
        riskScore, rounded: Math.round(riskScore),
        tone: evaluate<string>(expressions.riskTone, context),
        verdict: evaluate<string>(expressions.verdictKey, context),
      };
    },
    displayPcts: () => Array.from(sectors, sector => sector.pct),
  };
}
const symbols = ['XLK', 'XLE', 'XLY', 'XLB', 'XLI', 'XLF', 'XLV', 'XLU'];
const quotes = (quote: Record<string, unknown>) => Object.fromEntries(symbols.map(symbol => [symbol, { regularDate: '2026-10-19', ...quote }]));
const neutral = { riskScore: 50, rounded: 50, tone: 'mixed', verdict: 'mix' };

test('sector seeds contribute zero before the first response', () => {
  assert.deepEqual(dashboard().score(), neutral);
});

test('gate reproduction: HTTP 200 with eight price:0 errors stays 50, not 59/Risk-On', () => {
  const page = dashboard();
  page.receive(quotes({ price: 0, changePercent: 0, error: 'quote unavailable' }));
  assert.deepEqual(page.score(), neutral);
});

test('HTTP 200 with empty or absent sector quotes contributes zero', () => {
  for (const q of [{}, quotes({})]) {
    const page = dashboard();
    page.receive(q);
    assert.deepEqual(page.score(), neutral);
  }
});

test('partial data: each missing sector contributes zero without amplifying the one measured sector', () => {
  for (const [changePercent, expected] of [[1, 52.1875], [-1, 47.8125]]) {
    const page = dashboard();
    page.receive({ XLK: { price: 100, changePercent, regularDate: '2026-10-19' } });
    assert.equal(page.score().riskScore, expected);
  }
});

test('two opposite measured sectors cancel while the other six are missing', () => {
  const page = dashboard();
  page.receive({ XLK: { price: 100, changePercent: 1, regularDate: '2026-10-19' }, XLE: { price: 100, changePercent: -1, regularDate: '2026-10-19' } });
  assert.deepEqual(page.score(), neutral);
});

test('real zero changes count as nonnegative as before, without using nonzero display fallbacks', () => {
  const page = dashboard();
  page.receive(quotes({ price: 100, previousClose: 100, changePercent: 0 }));
  assert.equal(page.score().riskScore, 65);
  assert.deepEqual(page.displayPcts(), Array(8).fill(0));
});

test('a later all-error response contributes zero even if display retains previously measured values', () => {
  const page = dashboard();
  page.receive(quotes({ price: 100, changePercent: 1 }));
  assert.equal(page.score().riskScore, 65);
  page.receive(quotes({ price: 0, changePercent: 0 }));
  assert.deepEqual(page.score(), neutral);
  assert.deepEqual(page.displayPcts(), Array(8).fill(1));
});

test('invalid price or missing/non-finite change is not a measured sector', () => {
  for (const quote of [
    { price: -1, changePercent: 1 }, { price: NaN, changePercent: 1 },
    { price: Infinity, changePercent: 1 }, { price: 100 },
    { price: 100, changePercent: null }, { price: 100, changePercent: NaN },
    { price: 100, changePercent: Infinity }, { price: 100, changePercent: -Infinity },
  ]) {
    const page = dashboard();
    page.receive(quotes(quote));
    assert.deepEqual(page.score(), neutral, JSON.stringify(quote));
  }
});

test('regular and extended sessions use actual changes, including values equal to seed values', () => {
  const page = dashboard();
  page.receive(Object.fromEntries(symbols.map((symbol, i) => [symbol, {
    price: 100, regularDate: '2026-10-19', changePercent: [2.1, 1.2, 0.9, 0.6, -1, -1, -1, -1][i],
  }])));
  assert.deepEqual(page.score(), neutral);
  for (const session of ['pre', 'post']) {
    page.receive(quotes({ price: 100, previousClose: 100, changePercent: -1,
      extendedPrice: 101, extendedDate: '2026-10-19', session }), session);
    assert.equal(page.score().riskScore, 65, session);
  }
});


test('an undated regular quote contributes zero instead of borrowing a date for its value', () => {
  const page = dashboard();
  page.receive(quotes({ price: 100, changePercent: 1, regularDate: undefined }));
  assert.deepEqual(page.score(), neutral);
  assert.deepEqual(page.displayPcts(), Array(8).fill(null));
});

test('gate 2: old regular response cannot flip the risk score or overwrite today\'s real tiles', () => {
  const page = dashboard();
  page.receive(quotes({ price: 103, previousClose: 100, changePercent: 3 }), 'regular');
  assert.equal(page.score().riskScore, 65);
  page.receive(quotes({ price: 98, changePercent: -2, regularDate: '2026-10-16', session: 'regular' }), 'regular');
  assert.deepEqual(page.score(), neutral);
  assert.deepEqual(page.displayPcts(), Array(8).fill(3));
});
