const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const filename = require('node:path').resolve('src/components/guardian/TypewriterText.tsx');
const source = fs.readFileSync(filename, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const component = new Module(filename, module);
component.filename = filename;
component.paths = Module._nodeModulePaths(require('node:path').dirname(filename));
component._compile(compiled, filename);
const { renderColoredText, TypewriterText } = component.exports;
const markup = text => renderToStaticMarkup(React.createElement('div', null, renderColoredText(text)));
const span = (value, color) => `<span class="${color} font-semibold">${value}</span>`;
const cases = [
    ['2.9% 내렸고 −7%, +1.9%, 하락하지 않고 3% 유지 비율', ['2.9%', '−7%', '+1.9%', '3%']],
    ['fell 2.9%, −7%, +1.9%, did not fall and held 3%', ['2.9%', '−7%', '+1.9%', '3%']],
    ['2.9%下落、−7%、+1.9%、下落せず3%を維持', ['2.9%', '−7%', '+1.9%', '3%']],
];
const colors = ['text-white', 'text-rose-400/90', 'text-emerald-400/90', 'text-white'];
function check(rendered, values) {
    values.forEach((value, i) => assert.ok(rendered.includes(span(value, colors[i])), rendered));
}
// Direct rendering is shared by desktop Guardian, mobile Flow/Shield and MarketBreadthPanel.
for (const [text, values] of cases) check(markup(text), values);
for (const sign of ['-', '−', '–']) {
    assert.ok(markup(`${sign}7% 상승`).includes(span(`${sign}7%`, 'text-rose-400/90')));
}
for (const text of ['3–5%', '3%–5%']) {
    const rendered = markup(text);
    assert.ok(rendered.includes(span('–5%', 'text-white')), rendered);
    assert.doesNotMatch(rendered, /text-rose|text-emerald/);
}
for (const sign of ['+', '-', '−', '–']) {
    for (const prefix of ['3', '3%', '3.']) {
        const rendered = markup(`${prefix}${sign}5%`);
        assert.ok(rendered.includes(span(`${sign}5%`, 'text-white')), rendered);
    }
    for (const prefix of ['', ' ', '(', ',']) {
        const rendered = markup(`${prefix}${sign}7%`);
        assert.ok(rendered.includes(span(`${sign}7%`, sign === '+' ? 'text-emerald-400/90' : 'text-rose-400/90')), rendered);
    }
}
assert.ok(markup('(−7%)').includes(span('−7%', 'text-rose-400/90')));
assert.ok(markup('−7%').includes(span('−7%', 'text-rose-400/90')));
assert.ok(markup('+1.9%').includes(span('+1.9%', 'text-emerald-400/90')));
assert.ok(markup('2.9% 내렸고').includes(span('2.9%', 'text-white')));
assert.ok(markup('+7% 하락').includes(span('+7%', 'text-emerald-400/90')));
assert.match(markup('[현황] NASDAQ −7%'), /text-cyan-400 font-bold/);
assert.ok(markup('[현황] NASDAQ −7%').includes(span('NASDAQ', 'text-white')));
assert.match(renderToStaticMarkup(React.createElement(TypewriterText, { text: 'message' })), /animate-pulse/);
// Simulate completed typing through the component used by both Intel screens.
const originalUseState = React.useState;
try {
    for (const [text, values] of cases) {
        React.useState = initial => [typeof initial === 'string' ? text : initial, () => {}];
        const rendered = renderToStaticMarkup(React.createElement(TypewriterText, { text }));
        check(rendered, values);
        assert.match(rendered, /animate-pulse/);
    }
} finally { React.useState = originalUseState; }
console.log('tactical percentage color: passed');
