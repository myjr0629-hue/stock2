import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import { buildHomeSectors } from '../src/lib/app/homeSectors';
import { sectorMeanChange, rotationPct, normalizeSectorRotation, rotationBarWidth, formatRotationPct } from '../src/lib/ai/sectorRotation';
const lambda = require('../scripts/lambda-cross-sector/sectorRotation');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const reason = { ko: '근거', en: 'reason', ja: '理由' };
const brief = (change: string, changePct?: number | null) => ({ sectorRotation: {
  winners: [{ sector: 'M7', change, changePct, reason }],
  losers: [{ sector: 'Power Matrix', change: 'Laggard SMR -5.20%', reason }],
} });

// Render the actual page map expressions without opening a browser or mounting network effects.
function pageExpression(file: string, match: (n: ts.Node, source: ts.SourceFile) => boolean) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.Node | undefined;
  function visit(n: ts.Node) { if (match(n, source)) found = n; else ts.forEachChild(n, visit); }
  visit(source);
  assert.ok(found, file);
  return found.getText(source);
}
function renderExpression(expression: string, context: Record<string, unknown>) {
  const code = ts.transpileModule(`const render = () => (${expression});`, {
    fileName: 'render.tsx', compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return renderToStaticMarkup(new Function('React', ...Object.keys(context), `${code}; return render();`)(React, ...Object.values(context)));
}

test('actual home tile markup contains all eight labels and no demo returns on missing data', () => {
  const expression = pageExpression('src/app/[locale]/app-view/dash/page.tsx',
    (n, source) => ts.isCallExpression(n) && n.expression.getText(source) === 'sectors.map');
  const context = { sectors: buildHomeSectors({}), SECTOR_ETF: {}, wsGetPrice: () => null,
    shouldUseWsQuote: () => false, oneNumberPct: () => null, SECTOR_COLOR: {}, SECTOR_ICON: {},
    n9: new Proxy({}, { get: (_, name) => String(name) }), sectorLabel: (name: string) => name,
    locale: 'en', fmtChg: (n: number) => formatRotationPct(n) };
  const html = renderExpression(expression, context);
  assert.equal((html.match(/>—<\/span>/g) || []).length, 8);
  assert.ok(!html.includes('%'));
  assert.ok(html.includes('Tech') && html.includes('Utilities'));
  const real = buildHomeSectors({ XLK: { price: 100, changePercent: -1.87, regularDate: '2026-10-16' } });
  const fallback = renderExpression(expression, { ...context, sectors: buildHomeSectors({}, real) });
  assert.ok(fallback.includes('-1.87%') && fallback.includes('2026-10-16'));
  const latest = buildHomeSectors({ XLK: { price: 103, changePercent: 3, regularDate: '2026-10-19', session: 'regular' } }, [], '', '2026-10-19');
  const old = { XLK: { price: 98, changePercent: -2, regularDate: '2026-10-16', session: 'regular' } };
  for (const [previous, pct, date] of [[latest, '+3.00%', '2026-10-19'], [[], '-2.00%', '2026-10-16']] as const) {
    const sectors = buildHomeSectors(old, [...previous], '', '2026-10-19');
    // Even an available socket cannot remove the source date from a fallback tile.
    const markup = renderExpression(expression, { ...context, sectors,
      shouldUseWsQuote: () => true, wsGetPrice: () => ({ price: 50, changePct: -50 }) });
    assert.ok(markup.includes(pct));
    assert.ok(markup.includes(date));
    assert.ok(!markup.includes('-50.00%'));
  }
});

test('actual Intel row markup uses the same numeric return for text and bar on old/new payloads', () => {
  const expression = pageExpression('src/app/[locale]/app-view/intel/page.tsx',
    (n, source) => ts.isCallExpression(n) && n.expression.getText(source) === 'brief.sectorRotation.winners.slice(0, 3).map');
  for (const input of [brief('+1.25%'), brief('ignored', 1.25), brief('+52.2% avgAlpha')]) {
    const good = normalizeSectorRotation(brief('numeric', 1.25));
    const normalized = normalizeSectorRotation(input, [], good);
    const html = renderExpression(expression, { brief: normalized, rotationBarWidth, formatRotationPct });
    assert.ok(html.includes('+1.25%'));
    assert.ok(html.includes('width:13.75%'));
    assert.ok(!html.includes('avgAlpha'));
  }
});

test('cold/missing/error quotes keep all eight tiles with zero demo numbers', () => {
  for (const q of [{}, { XLK: { price: 0, changePercent: 0 } }, { XLK: { price: 100, changePercent: null } },
    { XLK: { price: Infinity, changePercent: 2.1 } }, { XLK: { price: 100, changePercent: 2.1, error: 'missing' } }]) {
    const sectors = buildHomeSectors(q);
    assert.equal(sectors.length, 8);
    assert.ok(sectors.every(s => s.pct === null && s.riskPct === undefined));
  }
});
test('real zero is shown; loss of data keeps dated regular value and blocks its risk contribution', () => {
  const real = buildHomeSectors({ XLK: { price: 100, previousClose: 100, changePercent: 0, regularDate: '2026-10-16' } });
  assert.equal(real[0].pct, 0);
  const missing = buildHomeSectors({}, JSON.parse(JSON.stringify(real)));
  assert.equal(missing[0].pct, 0);
  assert.equal(missing[0].fallbackDate, '2026-10-16');
  assert.equal(missing[0].riskPct, undefined);
});
test('extended quote never replaces the remembered regular-session return/date', () => {
  const pre = buildHomeSectors({ XLK: { price: 100, changePercent: -1.25, regularDate: '2026-10-16', extendedPrice: 103, extendedDate: '2026-10-19', session: 'pre' } }, [], '', '2026-10-19');
  assert.equal(pre[0].pct, 3);
  const missing = buildHomeSectors({}, pre);
  assert.equal(missing[0].pct, -1.25);
  assert.equal(missing[0].fallbackDate, '2026-10-16');
  assert.equal(buildHomeSectors({}, [{ name: 'Tech', pct: 2.1 }])[0].pct, null);
});
test('both producers ground numeric returns to actual ticker means, with alpha separate', () => {
  const changePct = sectorMeanChange([{ change_pct: -1 }, { change_pct: 0 }, { change_pct: -2 }, { change_pct: null }]);
  assert.equal(changePct, -1);
  assert.equal(sectorMeanChange([{ change_pct: null }, { change_pct: '2.1' }]), null);
  const measurements = [{ sector: 'M7 (Magnificent 7)', changePct, changeDate: '2026-10-16', avgAlpha: 52.2 },
    { sector: 'Power Matrix (Energy & Nuclear)', changePct: -2.02, changeDate: '2026-10-16', avgAlpha: 40 }];
  for (const normalizer of [normalizeSectorRotation, lambda.normalizeSectorRotation]) {
    const result = normalizer(brief('+52.2% avgAlpha', 999), measurements, undefined, true);
    assert.equal(result.sectorRotation.winners[0].changePct, -1);
    assert.equal(result.sectorRotation.winners[0].avgAlpha, 52.2);
    assert.equal(result.sectorRotation.losers[0].changePct, -2.02);
    assert.equal(result.sectorRotation.winners[0].change, '-1.00%');
  }
});
test('old and new responses render only safe numeric changes and correct widths', () => {
  for (const input of [brief('numeric', 1.25), brief('+52.2% avgAlpha', 1.25)]) {
    const result = normalizeSectorRotation(input);
    assert.equal(formatRotationPct(result.sectorRotation.winners[0].changePct), '+1.25%');
    assert.equal(rotationBarWidth(result.sectorRotation.winners[0].changePct), 13.75);
  }
  assert.equal(rotationBarWidth(0), 0);
  assert.equal(rotationBarWidth(-2), 22);
  assert.equal(rotationBarWidth(null), 0);
  assert.equal(rotationBarWidth(NaN), 0);
  for (const change of ['+52.2%', '+52.2% avgAlpha', 'Laggard SMR -5.20%', 'Infinity%', '', '1.2% garbage']) {
    const broken = brief(change);
    assert.equal(rotationPct(broken.sectorRotation.winners[0]), null);
    const good = normalizeSectorRotation(brief('numeric', -1.87));
    good.sectorRotation.winners[0].changeDate = '2026-10-16';
    const result = normalizeSectorRotation(broken, [], good);
    assert.equal(result.sectorRotation.winners[0].changePct, -1.87);
    assert.equal(result.sectorRotation.winners[0].changeDate, '2026-10-16');
    assert.equal(rotationBarWidth(result.sectorRotation.winners[0].changePct), 20.57);
  }
});
