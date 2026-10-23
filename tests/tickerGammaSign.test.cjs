// L9: execute the real API output boundary with every I/O replaced by memory fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function compile(source, context = {}, imports = {}) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    } }).outputText, { exports, Date, Map, ...context, require: id => {
        if (id in imports) return imports[id];
        throw new Error(`Unmocked dependency: ${id}`);
    } });
    return exports;
}
const metrics = compile(read('src/lib/optionMetrics.ts'), {}, {
    './app/intelOptionsBasis': { isFreshOptionsRow: () => false, oiPcrAllExpiries: () => null }, './ivSkew': {},
});
const source = read('src/app/api/live/ticker/route.ts');
const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'withExitLevels');
assert.ok(fn);
let current;
const boundary = compile('export ' + fn.getText(ast), {
    dropStaleLiveVwap: x => x,
    applyOptionMetrics: metrics.applyOptionMetrics,
    optionMetricsRowHasOi: () => true,
    readOptionMetrics: async () => new Map([['SPY', current]]),
    displayLevels: () => ({}), gammaFlipTypeOf: () => null,
});

test('L9: fresh, cached and last-good ticker gamma uses the same dollar GEX edition; missing is null, measured zero survives', async () => {
    for (const netGex of [400297625, -135500000, 0, null, undefined, NaN, Infinity]) {
        current = metrics.optionMetrics({ netGex }, null);
        for (const provenance of [{}, { _cached: true }, { _lastGood: true }]) {
            const payload = { ...provenance, session: 'REG', flow: { gamma: -558000, netGex: 99 } };
            const out = await boundary.withExitLevels(payload, async () => new Map(), 'SPY', undefined, false);
            const expected = typeof netGex === 'number' && Number.isFinite(netGex) ? netGex : null;
            assert.equal(out.flow.gamma, expected);
            assert.equal(out.flow.gamma, out.flow.netGex);
            assert.equal(payload.flow.gamma, -558000, 'cached source object is not mutated');
        }
    }
    current = undefined;
    assert.equal((await boundary.withExitLevels({ flow: { gamma: 5 } }, async () => new Map(), 'SPY', undefined, false)).flow.gamma, null);
});

test('L9: all ticker response paths still pass through the tested output boundary', () => {
    const calls = [];
    function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(ast) === 'withExitLevels') calls.push(node);
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.equal(calls.length, 2, 'cache hit and final (fresh/last-good merged) response');
    assert.equal(calls[1].arguments[0].getText(ast), 'finalPayload');
    assert.ok(source.includes('mergeFreshOverStale(lastGood, response)'), 'last-good joins the final response path');
});
