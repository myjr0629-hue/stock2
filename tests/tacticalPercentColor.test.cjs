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
const check = (text, value, color) => assert.ok(markup(text).includes(`<span class="${color ? `text-${color}-400/90 ` : ''}font-semibold">${value}</span>`), markup(text));

const ko = '나스닥 종합은 2.9%, S&P500은 1.8% 내렸고 반도체(SMH) −7%';
check(ko, '2.9%', ''); check(ko, '1.8%', 'rose'); check(ko, '−7%', 'rose');
check('지수 3% 올랐다.', '3%', 'emerald'); check('지수 3% 하락.', '3%', 'rose');
check('NASDAQ fell 2.9% and S&P 500 was down 1.8%.', '2.9%', 'rose');
check('Stocks rose 2% and were up 3%.', '3%', 'emerald');
check('指数は2.9%下落、1.8%下げた。', '1.8%', 'rose'); check('指数は2%上昇。', '2%', 'emerald');
for (const text of ['-7% 상승', '−7% rose', '+7% 下落']) check(text, text.slice(0, 3), text[0] === '+' ? 'emerald' : 'rose');
check('비중은 2.9%. 다음 지수는 상승.', '2.9%', '');
check('Index rose 2% but fell 3%.', '2%', 'emerald');
check('Index rose 2% but fell 3%.', '3%', 'rose');
check('The setup is 2%.', '2%', '');
// All renderColoredText callers share this rendering path: Guardian Tactical,
// market briefing, mobile Flow/Shield, and both Intel typewriter components.
for (const [text, value] of [
    ['하락하지 않고 3%를 유지', '3%'], ['안 상승한 3%', '3%'],
    ["Index didn't fall 3%", '3%'], ['Index did not rise 3%', '3%'],
    ['指数は下落せず3%を維持', '3%'], ['指数は上昇しない3%', '3%'],
    ['3% 상승 하락', '3%'], ['3% rose fell', '3%'], ['3% 上昇 下落', '3%'],
    ['상승, 비중 3%', '3%'], ['rose and held 3%', '3%'], ['上昇、比率3%', '3%'],
]) check(text, value, '');
for (const [text, value, color] of [
    ['하락하지 않고 +3% 유지', '+3%', 'emerald'], ["didn't fall −3%", '−3%', 'rose'],
    ['下落せず -3%', '-3%', 'rose'], ['상승 2%, 하락 3%', '2%', 'emerald'],
    ['상승 2%, 하락 3%', '3%', 'rose'], ['rose 2% but fell 3%', '3%', 'rose'],
    ['지난 상승 3%', '3%', 'emerald'], ['3% 하락했지만 2% 상승', '3%', 'rose'], ['3% 하락했지만 2% 상승', '2%', 'emerald'],
    ['上昇2%、下落3%', '2%', 'emerald'], ['上昇2%、下落3%', '3%', 'rose'],
]) check(text, value, color);
assert.match(markup('[현황] NASDAQ −7%'), /text-cyan-400 font-bold/);
assert.match(markup('[현황] NASDAQ −7%'), /text-white font-semibold/);
assert.match(renderToStaticMarkup(React.createElement(TypewriterText, { text: 'message' })), /animate-pulse/);
// Simulate completed typing so the Intel component's actual render path is checked.
const originalUseState = React.useState;
try {
    for (const text of ['하락하지 않고 3% 유지', "didn't fall 3%", '下落せず3%を維持']) {
        React.useState = initial => [typeof initial === 'string' ? text : initial, () => {}];
        const rendered = renderToStaticMarkup(React.createElement(TypewriterText, { text }));
        assert.match(rendered, /<span class="font-semibold">3%<\/span>/);
        assert.match(rendered, /animate-pulse/);
    }
} finally { React.useState = originalUseState; }
console.log('tactical percentage color: passed');
