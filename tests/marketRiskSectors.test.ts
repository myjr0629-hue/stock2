import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { marketDownsideRisk } from '../src/lib/marketIndicators';
import { normalizeQuoteSession, oneNumberBase, oneNumberFromQuote } from '../src/utils/calcPriceDisplay';

// Execute the real dashboard state updater and score expressions, including its
// display fallbacks. Testing only calculateMarketRiskScore missed this leak.
const source = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/dash/page.tsx'), 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const expressions: Record<string, string> = {};
const helpers: string[] = [];
let sectorUpdater = '';
let sectorInitial = '';
let sectorReady = '';
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)
      && node.name.elements[0]?.getText(ast) === 'sectors' && node.initializer && ts.isCallExpression(node.initializer)) {
    sectorInitial = node.initializer.arguments[0].getText(ast);
  }
  if (ts.isFunctionDeclaration(node) && node.name
      && ['hasUsableQuote', 'stableChangePct', 'sessionQuote'].includes(node.name.text)) {
    helpers.push(node.getText(ast));
  }
  if (ts.isVariableDeclaration(node) && node.initializer
      && ['DEMO_SECTORS', 'breadthPct', 'riskScore', 'riskTone', 'verdictKey'].includes(node.name.getText(ast))) {
    expressions[node.name.getText(ast)] = node.initializer.getText(ast);
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'setSectors') {
    assert.equal(sectorUpdater, '', 'cover every sector state writer');
    sectorUpdater = node.arguments[0].getText(ast);
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'setSectorsReady') {
    sectorReady = node.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(sectorUpdater && sectorReady);

type Sector = { name: string; pct: number; base?: number; riskPct?: number };
function evaluate<T>(code: string, context: Record<string, unknown>): T {
  return vm.runInNewContext(ts.transpile(code, { target: ts.ScriptTarget.ES2022 }), context);
}
function dashboard() {
  // 현재 대시보드는 데모 시드를 제거하고 빈 목록에서 시작한다.
  let sectors = evaluate<Sector[]>(`(${sectorInitial})`, {});
  let sectorsReady = false;
  return {
    receive(q: Record<string, unknown>, quotesSession = 'closed') {
      const context = {
        q, quotesSession, sectors, normalizeQuoteSession, oneNumberBase, oneNumberFromQuote,
        setSectorsReady: (ready: boolean) => { sectorsReady = ready; },
      };
      evaluate(sectorReady, context); // HTTP 200 branch, even for all-error quotes
      sectors = evaluate<Sector[]>(`${helpers.join('\n')}\n(${sectorUpdater})(sectors)`, context);
    },
    // CEO decision D30 (10/19): the dash «리스크» score is the shared downside risk 100 − RLSI. Sector quotes
    // (good, bad, partial, errored) are display data only and can never move it — neutral RLSI 50 → 50/mixed.
    score() {
      assert.equal(expressions.breadthPct, undefined, 'no sector-derived risk composite remains');
      const riskScore = evaluate<number>(expressions.riskScore, { marketDownsideRisk, rlsi: { score: 50 }, sectorsReady, sectors });
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
const quotes = (quote: Record<string, unknown>) => Object.fromEntries(symbols.map(symbol => [symbol, { ...quote }]));
const neutral = { riskScore: 50, rounded: 50, tone: 'mixed', verdict: 'mix' };

test('첫 응답 전 데모 섹터 값이 없고 리스크는 중립이다', () => {
  assert.deepEqual(dashboard().displayPcts(), []);
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
  for (const [changePercent, expected] of [[1, 50], [-1, 50]]) {
    const page = dashboard();
    page.receive({ XLK: { price: 100, changePercent } });
    assert.equal(page.score().riskScore, expected);
  }
});

test('two opposite measured sectors cancel while the other six are missing', () => {
  const page = dashboard();
  page.receive({ XLK: { price: 100, changePercent: 1 }, XLE: { price: 100, changePercent: -1 } });
  assert.deepEqual(page.score(), neutral);
});

test('real zero changes count as nonnegative as before, without using nonzero display fallbacks', () => {
  const page = dashboard();
  page.receive(quotes({ price: 100, previousClose: 100, changePercent: 0 }));
  assert.equal(page.score().riskScore, 50); // D30: sectors no longer move the risk score
  // Existing sector tile display policy is outside this score repair.
  assert.deepEqual(page.displayPcts(), Array(8).fill(null), '데모 시드 대신 기존 결측 표시');
});

test('a later all-error response contributes zero even if display retains previously measured values', () => {
  const page = dashboard();
  page.receive(quotes({ price: 100, changePercent: 1 }));
  assert.equal(page.score().riskScore, 50); // D30: sectors no longer move the risk score
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
    price: 100, changePercent: [2.1, 1.2, 0.9, 0.6, -1, -1, -1, -1][i],
  }])));
  assert.deepEqual(page.score(), neutral);
  for (const session of ['pre', 'post']) {
    page.receive(quotes({ price: 100, previousClose: 100, changePercent: -1,
      extendedPrice: 101, session }), session);
    assert.equal(page.score().riskScore, 50, session); // D30
  }
});
