// Offline: actual cash label + existing marketCalendar-based regular-session predicate.
// Run: node --test tests/marketStatusCashClose.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
const dash = 'src/app/[locale]/app-view/dash/';
function compile(source, dependencies, filename, DateImpl = Date) {
    const exports = {};
    const code = ts.transpileModule(source, {
        fileName: filename,
        compilerOptions: {
            module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
            jsx: ts.JsxEmit.ReactJSX,
        },
    }).outputText;
    vm.runInNewContext(code, {
        exports, Date: DateImpl,
        require(id) {
            if (Object.hasOwn(dependencies, id)) return dependencies[id];
            throw new Error(`Unexpected dependency: ${id}`);
        },
    }, { filename });
    return exports;
}
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const calendar = compile(read('src/lib/marketCalendar.ts'), {}, 'marketCalendar.ts');
const sessions = compile(read('src/lib/signals/calendar.ts'), {
    '@/lib/marketCalendar': calendar,
}, 'calendar.ts');
const jsx = require('react/jsx-runtime');
const labelSource = read(`${dash}CashMarketStatusLabel.tsx`);
function loadLabel(DateImpl = Date) {
    return compile(labelSource, {
        '@/lib/signals/calendar': sessions, 'react/jsx-runtime': jsx,
    }, 'CashMarketStatusLabel.tsx', DateImpl).CashMarketStatusLabel;
}
const CashMarketStatusLabel = loadLabel();

// Explicit UTC offsets exercise both EDT and EST without relying on the machine timezone.
const cases = [
    ['CLOSED before PRE', '2026-10-19T03:59:00-04:00', true],
    ['PRE begins', '2026-10-19T04:00:00-04:00', true],
    ['PRE ends', '2026-10-19T09:29:59-04:00', true],
    ['REG opens', '2026-10-19T09:30:00-04:00', false],
    ['REG midday', '2026-10-19T12:00:00-04:00', false],
    ['REG ends', '2026-10-19T15:59:59-04:00', false],
    ['POST begins', '2026-10-19T16:00:00-04:00', true],
    ['POST ends', '2026-10-19T19:59:59-04:00', true],
    ['CLOSED night', '2026-10-19T20:00:00-04:00', true],
    ['Saturday', '2026-10-17T12:00:00-04:00', true],
    ['Sunday with futures open', '2026-10-18T19:00:00-04:00', true],
    ['Holiday', '2026-11-26T12:00:00-05:00', true],
    ['Early close before cutoff', '2026-11-27T12:59:59-05:00', false],
    ['Early close cutoff', '2026-11-27T13:00:00-05:00', true],
    ['After early close', '2026-11-27T14:00:00-05:00', true],
    ['Christmas Eve early close', '2026-12-24T13:00:00-05:00', true],
    ['Winter REG', '2026-12-23T09:30:00-05:00', false],
];
for (const [locale, label] of [['ko', '현물'], ['en', 'Cash'], ['ja', '現物']]) {
    test(`${locale}: 세션·주말·휴장·조기폐장 17개 시각의 실제 라벨 렌더`, () => {
        for (const [name, instant, closed] of cases) {
            const html = renderToStaticMarkup(React.createElement(CashMarketStatusLabel, {
                label, className: 'cell-label', badgeClassName: 'existing-small-chip',
                nowMs: Date.parse(instant),
            }));
            assert.ok(html.includes(label), name);
            assert.equal(html.includes('CLOSE'), closed, name);
            assert.equal(html.includes('<span class="existing-small-chip">CLOSE</span>'), closed, name);
            assert.equal(html.replace(/<[^>]+>/g, ''), label + (closed ? ' CLOSE' : ''), name);
        }
    });
}

test('앱이 쓰는 기본 시계도 개장·마감 경계에서 다시 판정한다', () => {
    let now;
    const Label = loadLabel(class extends Date { static now() { return now; } });
    for (const [name, instant, closed] of cases) {
        now = Date.parse(instant);
        const html = renderToStaticMarkup(React.createElement(Label, {
            label: '현물', className: 'cell-label', badgeClassName: 'existing-small-chip',
        }));
        assert.equal(html.includes('CLOSE'), closed, name);
    }
});

test('실제 대시보드 현물 칸: CLOSE와 무관하게 기존 등락값·결측 표시를 유지한다', () => {
    const page = ts.createSourceFile('page.tsx', read(`${dash}page.tsx`), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let cashCell;
    function visit(node) {
        if (ts.isJsxElement(node) && node.openingElement.tagName.getText(page) === 'div'
            && node.children.some(child => ts.isJsxSelfClosingElement(child)
                && child.tagName.getText(page) === 'CashMarketStatusLabel')) cashCell = node.getText(page);
        ts.forEachChild(node, visit);
    }
    visit(page);
    assert.ok(cashCell, '앱의 실제 현물 칸을 시험한다');
    const props = {
        copy: { cash: '현물' },
        n9: { e9Cell: 'cell', dn: 'down', e9CellL: 'label', e9CellV: 'value', e9Badge: 'chip' },
        fmtChg: n => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`,
    };
    for (const [, instant, closed] of cases) {
        const Label = loadLabel(class extends Date { static now() { return Date.parse(instant); } });
        // The extracted cell uses the same label component as the page, with a controlled clock.
        // Supply it as a lexical binding without changing the cell's JSX.
        const CellWithLabel = compile(`import { CashMarketStatusLabel } from './label';
            export const Cell = ({copy,n9,cashAvg,indicesReady,fmtChg}) => (${cashCell});`, {
            './label': { CashMarketStatusLabel: Label }, 'react/jsx-runtime': jsx,
        }, 'Cell.tsx').Cell;
        for (const cashAvg of [-0.42, 0, 0.37]) {
            const html = renderToStaticMarkup(React.createElement(CellWithLabel, { ...props, cashAvg, indicesReady: true }));
            assert.ok(html.includes(props.fmtChg(cashAvg)), instant);
            assert.equal(html.includes('CLOSE'), closed, instant);
        }
        const missing = renderToStaticMarkup(React.createElement(CellWithLabel, { ...props, cashAvg: 0, indicesReady: false }));
        assert.ok(missing.includes('—'), instant);
    }
});
