import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { calculateMarketRiskScore, type MarketRiskInputs } from '../src/lib/marketRiskScore';

// Frozen pre-fix formula, kept only to document the saturation regression.
function legacyScore(input: MarketRiskInputs): number {
  const score = 50 + (input.futuresAvg ?? 0) * 7 + (input.cashAvg ?? 0) * 4
    + ((input.breadthPct ?? 50) - 50) * 0.35
    + ((input.fearGreed ?? 50) - 50) * 0.25
    - Math.max(0, input.vixChangePct ?? 0) * 2.5;
  return Math.max(0, Math.min(100, score));
}

// User-supplied 10/16 close measurements. F&G was not supplied: missing = zero contribution.
const october16: MarketRiskInputs = {
  futuresAvg: -1.76, cashAvg: -1.19, vixChangePct: 21.45, breadthPct: (4 / 8) * 100,
};
const goldens = [
  { name: '10/16 close stays Risk-Off without saturating', input: october16, min: 15, max: 30 },
  { name: 'broad extreme selloff can still reach zero', input: {
    futuresAvg: -5, cashAvg: -5, vixChangePct: 60, breadthPct: 0, fearGreed: 10,
  }, min: 0, max: 5 },
  { name: 'calm rally stays Risk-On', input: {
    futuresAvg: 0.6, cashAvg: 0.6, vixChangePct: -5, breadthPct: (6 / 8) * 100, fearGreed: 60,
  }, min: 62, max: 75 },
  { name: 'flat market stays exactly neutral', input: {
    futuresAvg: 0, cashAvg: 0, vixChangePct: 0, breadthPct: (4 / 8) * 100, fearGreed: 50,
  }, min: 50, max: 50 },
];

test('original 10/16 formula reproduces 0/100 from the VIX penalty alone', () => {
  assert.equal(Math.max(0, october16.vixChangePct!) * 2.5, 53.625);
  assert.equal(legacyScore(october16), 0);
});

for (const { name, input, min, max } of goldens) {
  test(name, () => {
    const score = calculateMarketRiskScore(input);
    console.log(`${name}: previous=${legacyScore(input).toFixed(2)}, new=${score.toFixed(2)}`);
    assert.ok(score >= min && score <= max, `${score} outside [${min}, ${max}]`);
  });
}

test('a single input cannot move the neutral score by more than its budget', () => {
  const caps: Record<keyof MarketRiskInputs, number> = {
    futuresAvg: 15, cashAvg: 15, breadthPct: 15, fearGreed: 10, vixChangePct: 15,
  };
  for (const [field, cap] of Object.entries(caps)) {
    for (const value of [-Number.MAX_VALUE, -100, 0, 100, Number.MAX_VALUE]) {
      const score = calculateMarketRiskScore({ [field]: value });
      assert.ok(Number.isFinite(score) && Math.abs(score - 50) <= cap, `${field}=${value}: ${score}`);
    }
  }
});

test('each missing or non-finite input contributes zero, preserving other inputs', () => {
  assert.equal(calculateMarketRiskScore({}), 50);
  const full = { futuresAvg: 0.6, cashAvg: -0.3, breadthPct: 75, fearGreed: 60, vixChangePct: 4 };
  for (const field of Object.keys(full)) {
    const omitted = { ...full } as MarketRiskInputs;
    delete omitted[field as keyof MarketRiskInputs];
    const expected = calculateMarketRiskScore(omitted);
    for (const value of [undefined, null, NaN, Infinity, -Infinity]) {
      assert.equal(calculateMarketRiskScore({ ...full, [field]: value }), expected, `${field}=${value}`);
    }
  }
  assert.equal(calculateMarketRiskScore({ fearGreed: 0 }), 40, 'a real zero is not missing');
});

test('VIX penalty is monotone, bounded, and falling VIX retains zero penalty', () => {
  const scores = [-60, -5, 0, 2, 5, 10, 21.45, 60, 1000]
    .map(vixChangePct => calculateMarketRiskScore({ vixChangePct }));
  assert.equal(scores[0], 50);
  assert.equal(scores[1], 50);
  assert.equal(scores[2], 50);
  for (let i = 1; i < scores.length; i++) assert.ok(scores[i] <= scores[i - 1]);
  assert.equal(scores.at(-1), 35);
});

test('dashboard «리스크» score is the shared downside risk (100 − RLSI, CEO decision D30) with 58/42 boundaries', () => {
  // D30 (10/19): the «리스크 점수» label shows the score that measures market downside risk — 100 − RLSI
  // (lib/marketIndicators.marketDownsideRisk), shared by dash and guardian. Higher = riskier, so ≥58 is risk-off.
  const { marketDownsideRisk } = require('../src/lib/marketIndicators');
  const source = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/dash/page.tsx'), 'utf8');
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const expressions: Record<string, string> = {};
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.initializer
        && ['riskScore', 'riskTone', 'verdictKey', 'fgValue', 'breadthPct'].includes(node.name.getText(ast))) {
      expressions[node.name.getText(ast)] = node.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const rlsi of [{ score: 70 }, { score: 0 }, { score: 100 }, { score: 41.6 }, { available: false, score: 50 }, null]) {
    assert.equal(vm.runInNewContext(expressions.riskScore, { marketDownsideRisk, rlsi }), marketDownsideRisk(rlsi));
  }
  for (const [riskScore, tone, key] of [[58, 'off', 'off'], [57.99, 'mixed', 'mix'],
    [42.01, 'mixed', 'mix'], [42, 'on', 'on'], [null, 'mixed', 'mix']] as const) {
    const context = { riskScore, copy: { riskOn: 'on', riskOff: 'off', mixed: 'mixed' } };
    assert.equal(vm.runInNewContext(expressions.riskTone, context), tone);
    assert.equal(vm.runInNewContext(expressions.verdictKey, context), key);
  }
  // The dash no longer composes a second risk formula from DEMO seeds (fgValue/breadthPct removed with D30).
  assert.equal(expressions.fgValue, undefined); assert.equal(expressions.breadthPct, undefined);
});
