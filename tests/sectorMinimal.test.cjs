// 무네트워크: 실제 소스의 매퍼·JSX를 실행한다. 선택 인자는 장중 사본 디렉터리.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const parse = rel => ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, rel.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
function findAll(node, pred) {
  const found = [];
  const visit = n => { if (pred(n)) found.push(n); ts.forEachChild(n, visit); };
  visit(node);
  return found;
}
const find = (node, pred) => { const result = findAll(node, pred)[0]; assert.ok(result, '실제 소스 노드'); return result; };
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const run = (source, deps = {}) => new Function('exports', ...Object.keys(deps), compile(source))({}, ...Object.values(deps));
const decl = (sf, name) => find(sf, n => ts.isVariableDeclaration(n) && n.name.getText(sf) === name);
const dash = parse('src/app/[locale]/app-view/dash/page.tsx');
const intel = parse('src/app/[locale]/app-view/intel/page.tsx');
const route = parse('src/app/api/intel/cross-sector-brief/route.ts');
const calc = { exports: {} };
new Function('exports', compile(read('src/utils/calcPriceDisplay.ts')))(calc.exports);
const fn = name => find(dash, n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(dash);
const update = find(dash, n => ts.isCallExpression(n) && n.expression.getText(dash) === 'setSectors').arguments[0];
const home = (q, prev = [], quotesSession = 'regular') => run(`${['hasUsableQuote', 'stableChangePct', 'sessionQuote'].map(fn).join('\n')} return (${update.getText(dash)})(prev);`, { q, prev, quotesSession, ...calc.exports });
const tile = find(dash, n => ts.isCallExpression(n) && n.expression.getText(dash) === 'sectors.map').arguments[0];
const renderTiles = sectors => renderToStaticMarkup(run(`return <>{sectors.map(${tile.getText(dash)})}</>;`, {
  sectors, require, n9: {}, SECTOR_ETF: {}, SECTOR_ICON: {}, SECTOR_COLOR: {}, locale: 'en', sectorLabel: s => s,
  wsGetPrice: () => null, shouldUseWsQuote: () => false, ...calc.exports,
}));
const summaries = validSnapshots => run(`return ${decl(route, 'sectorSummaries').initializer.getText(route)};`, {
  validSnapshots, SECTOR_LABELS: { m7: 'M7 (Magnificent 7)' },
});
const attach = find(route, n => ts.isForOfStatement(n) && n.expression.getText(route).includes('structured.sectorRotation.winners'));
const produce = (structured, sectorSummaries) => {
  run(attach.getText(route), { structured, sectorSummaries });
  return JSON.parse(JSON.stringify(structured));
};
const rotationMaps = ['winners', 'losers'].map(side => find(intel, n => ts.isCallExpression(n) && n.expression.getText(intel) === `brief.sectorRotation.${side}.slice(0, 3).map`).arguments[0]);
const renderRow = (row, side) => renderToStaticMarkup(run(`return (${rotationMaps[side].getText(intel)})(row, 0);`, { row, require }));
const text = html => html.replace(/<[^>]*>/g, '');
let count = 0;
const test = (name, body) => { body(); count++; console.log(`✓ ${name}`); };

test('홈 초기 상태에 데모 없음; 결측 8칸은 —, 숫자 0회', () => {
  assert.doesNotMatch(dash.text, /DEMO_SECTORS/);
  assert.equal(decl(dash, 'fallback').initializer.parameters.length, 1);
  const rows = home({});
  assert.equal(rows.length, 8);
  assert.ok(rows.every(r => r.pct === null));
  const output = text(renderTiles(rows));
  assert.equal((output.match(/—/g) || []).length, 8);
  assert.doesNotMatch(output, /\d|NaN|undefined/);
});

test('홈 결측은 직전 양수·음수·0 유지; 정상·0 재계산 채택은 기존대로', () => {
  for (const pct of [1.25, -2.5, 0]) assert.equal(home({}, [{ name: 'Tech', pct }])[0].pct, pct);
  assert.equal(home({ XLK: { price: 102, previousClose: 100, changePercent: 0 } })[0].pct, 2);
  assert.equal(home({ XLK: { price: 100, previousClose: 100, changePercent: 0 } })[0].pct, null);
  assert.equal(home({ XLK: { price: 101, changePercent: 1 } })[0].pct, 1);
});

test('생산 행은 유효 등락 평균만 추가; change·reason·분류 유지', () => {
  const rows = summaries([{ id: 'm7', data: { tickers: [{ ticker: 'A', change_pct: 2 }, { ticker: 'B', change_pct: -1 }, { ticker: 'C', change_pct: 0 }, { ticker: 'D', change_pct: null }] } }]);
  assert.equal(rows[0].changePct, 1 / 3);
  const reason = { ko: '기존 근거', en: 'Existing reason', ja: '既存の根拠' };
  for (const name of ['m7', 'M7', 'M7 (Magnificent 7)']) {
    const original = { sectorRotation: { winners: [{ sector: name, change: 'old +9%', reason }], losers: [] } };
    const output = produce(structuredClone(original), rows);
    assert.deepEqual(output, { sectorRotation: { winners: [{ ...original.sectorRotation.winners[0], changePct: 1 / 3 }], losers: [] } });
  }
  const missing = summaries([{ id: 'm7', data: { tickers: [{ change_pct: null }] } }]);
  const old = { sectorRotation: { winners: [], losers: [{ sector: 'M7', change: '-1%', reason }] } };
  assert.deepEqual(produce(structuredClone(old), missing), old);
});

test('로테이션 양쪽: 숫자 필드 ±·0의 표시·막대, 없으면 기존 문자열·막대', () => {
  for (const side of [0, 1]) {
    for (const pct of [2.5, -1.5, 0]) {
      const html = renderRow({ sector: 'M7', change: 'legacy +9%', changePct: pct }, side);
      assert.ok(text(html).includes(`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`));
      assert.ok(html.includes(`width:${Math.max(8, Math.min(100, Math.abs(pct) * 11))}%`));
      assert.doesNotMatch(text(html), /legacy/);
    }
    for (const change of ['+2.25%', '-1.25%', 'M7 +3%', '—']) {
      const html = renderRow({ sector: 'M7', change }, side);
      assert.ok(text(html).endsWith(change));
      assert.ok(html.includes(`width:${Math.max(8, Math.min(100, Math.abs(parseFloat(change) || 0) * 11))}%`));
    }
  }
});

if (process.argv[2]) test('10/19 장중 사본 재생: XL* 없는 원본은 결측 8칸, 직전값 보존', () => {
  const captured = JSON.parse(fs.readFileSync(path.join(process.argv[2], 'quotes-2310.json'), 'utf8'));
  assert.equal(captured.session, 'regular');
  const missing = home(captured.data, [], captured.session);
  assert.equal((text(renderTiles(missing)).match(/—/g) || []).length, 8);
  assert.doesNotMatch(text(renderTiles(missing)), /\d/);
  const prior = missing.map((r, i) => ({ ...r, pct: (i + 1) / 10 }));
  assert.deepEqual(home(captured.data, prior, captured.session).map(r => r.pct), prior.map(r => r.pct));
  // 사본에는 섹터 스냅샷이 없으므로 캡처된 세 종목만 투영한 시험 입력이다.
  const tickers = ['AAPL', 'NVDA', 'TSLA'].map(ticker => ({ ticker, change_pct: captured.data[ticker].changePercent }));
  const measured = summaries([{ id: 'm7', data: { tickers } }]);
  const expected = tickers.reduce((sum, t) => sum + t.change_pct, 0) / tickers.length;
  const output = produce({ sectorRotation: { winners: [{ sector: 'M7', change: 'old', reason: {} }], losers: [] } }, measured);
  assert.ok(Math.abs(output.sectorRotation.winners[0].changePct - expected) < 1e-12);
  assert.ok(text(renderRow(output.sectorRotation.winners[0], 0)).includes(`+${expected.toFixed(2)}%`));
});
console.log(`${count}건 통과`);
