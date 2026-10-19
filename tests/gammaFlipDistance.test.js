// Offline regression. Run: NODE_PATH=<installed node_modules> node tests/gammaFlipDistance.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

global.fetch = async () => { throw new Error('Unexpected network access'); };
Date.now = () => Date.parse('2026-10-19T14:00:00Z');
const root = path.resolve(__dirname, '..');
let structure;
let snapshot;
const modules = new Map();
const mocks = {
    'next/server': { NextResponse: { json: value => value } },
    '@/lib/aws/dynamoDataProvider': {
        getTickerSnapshot: async () => snapshot,
        getLatestGex: async () => snapshot.gex,
    },
    '@/services/structureService': {
        getStructureData: async () => structure,
        levelsFromStructure: (...args) => gate.levelsFromStructure(...args),
        displayLevels: (...args) => gate.displayLevels(...args),
    },
};
const compile = code => ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
} }).outputText;
function load(relative) {
    const file = path.resolve(root, relative);
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const allowed = /src\/(lib\/(gammaFlipDistance|optionLevelGate|marketCalendar)|services\/volatilityRegime|app\/api\/live\/volatility-regime\/route)\.ts$/;
    assert.match(file, allowed, 'only pure modules and the mocked route may load');
    vm.runInNewContext(compile(fs.readFileSync(file, 'utf8')), {
        exports, Date, console,
        require: id => {
            if (mocks[id]) return mocks[id];
            if (id.startsWith('@/')) return load(`src/${id.slice(2)}.ts`);
            if (id.startsWith('.')) return load(path.resolve(path.dirname(file), `${id}.ts`));
            throw new Error(`Unexpected dependency: ${id}`);
        },
    }, { filename: file });
    return exports;
}
const { gammaFlipDistancePct } = load('src/lib/gammaFlipDistance.ts');
const { computeVolatilityRegime } = load('src/services/volatilityRegime.ts');
const gate = load('src/lib/optionLevelGate.ts');
const route = load('src/app/api/live/volatility-regime/route.ts');
const unifiedFile = 'src/app/api/command/unified/route.ts';
function extract(file, predicate) {
    const ast = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const matches = [];
    const visit = node => { if (predicate(node, ast)) matches.push(node.getText(ast)); ts.forEachChild(node, visit); };
    visit(ast);
    assert.equal(matches.length, 1, `unique production code: ${file}`);
    return matches[0];
}
function run(code, context = {}) {
    return vm.runInNewContext(compile(code), { gammaFlipDistancePct, Date, ...context });
}
function seed(spot = 105.10, flip = 100) {
    structure = { options_status: 'OK', levelsProducer: gate.STRUCTURE_PRODUCER,
        underlyingPrice: spot, gammaFlipLevel: flip, expiration: '2026-10-23',
        netGex: 0, atmIv: 30, levels: {} };
    snapshot = { gex: { flipLevel: 102, gex: 0, price: spot }, price: { close: spot } };
    return gate.levelsFromStructure(structure);
}

test('spot denominator, sign, true zero, invalid prices and unrounded precision', () => {
    assert.ok(Math.abs(gammaFlipDistancePct(105.10, 100) - 4.852521408182678) < 1e-12);
    assert.equal(gammaFlipDistancePct(100, 100), 0);
    assert.equal(gammaFlipDistancePct(100, 105), -5);
    for (const bad of [null, undefined, 0, -1, NaN, Infinity, -Infinity, '100']) {
        assert.equal(gammaFlipDistancePct(bad, 100), null);
        assert.equal(gammaFlipDistancePct(100, bad), null);
    }
});

test('105.10/100 and below/at flip agree across service, unified API exit and SSR exit', async () => {
    const overlay = extract(unifiedFile, n => ts.isFunctionDeclaration(n) && n.name?.text === 'overlayStructureLevels');
    const ssr = extract('src/app/[locale]/ticker/page.tsx', (n, ast) => ts.isIfStatement(n)
        && n.expression.getText(ast) === 'initialUnifiedData?.structure');
    for (const [spot, expected] of [[105.10, 4.9], [94.90, -5.4], [100, 0]]) {
        const lv = seed(spot);
        const service = { ...gate, levelsForExit: async () => new Map([['TEST', lv]]),
            readOptionMetrics: async () => new Map(), applyUnifiedOptionMetrics: d => d,
            readOptionAlpha: async () => new Map() };
        const context = { ...service, require: id => { assert.equal(id, '@/services/structureService'); return service; } };
        const apiExit = run(`${overlay}\noverlayStructureLevels`, context);
        const ssrExit = run(`async function exit(initialUnifiedData, ticker) { ${ssr}; return initialUnifiedData; }\nexit`, context);
        const values = [computeVolatilityRegime(structure), gate.applyLevelsToUnified({ structure, volatility: {} }, lv).volatility];
        for (const exit of [apiExit, ssrExit]) values.push((await exit({ structure, volatility: {} }, 'TEST')).volatility);
        values.push(await route.GET({ nextUrl: new URL('http://localhost?t=TEST') }));
        for (const value of values) {
            assert.equal(value.flipDistance, expected);
            assert.equal(value.flipLevel, 100);
            assert.equal(value.isAboveFlip, spot > 100);
        }
    }
});

test('volatility route reselect/fallback branch uses spot percent after changing flip', async () => {
    seed();
    structure.atmIv = 0;
    const fallbackRouteCode = fs.readFileSync(path.join(root, 'src/app/api/live/volatility-regime/route.ts'), 'utf8');
    // Force closed-market branch without changing the production condition.
    class ClosedDate extends Date {
        constructor(...args) { super(...(args.length ? args : ['2026-10-18T00:00:00Z'])); }
    }
    const closed = {};
    run(fallbackRouteCode, {
        exports: closed, Date: ClosedDate,
        require: id => mocks[id] || (id === '@/services/volatilityRegime' ? { computeVolatilityRegime }
            : id === '@/lib/gammaFlipDistance' ? { gammaFlipDistancePct } : assert.fail(`Unexpected import: ${id}`)),
    });
    const out = await closed.GET({ nextUrl: new URL('http://localhost?t=TEST') });
    assert.equal(out.flipLevel, 100, 'structure replaces fallback flip 102');
    assert.equal(out.flipDistance, 4.9);
});

test('both DynamoDB unified calculation paths use the common distance', async () => {
    seed();
    snapshot.gex.flipLevel = 100;
    const fn = extract(unifiedFile, n => ts.isFunctionDeclaration(n) && n.name?.text === 'getVolatilityFromDynamoGex');
    const get = run(`${fn}\ngetVolatilityFromDynamoGex`, {
        require: id => { assert.equal(id, '@/lib/aws/dynamoDataProvider'); return mocks[id]; },
        setTimeout: () => 0,
    });
    assert.equal((await get('TEST')).flipDistance, 4.9);
    const branch = extract(unifiedFile, (n, ast) => ts.isIfStatement(n) && n.expression.getText(ast) === 'gex'
        && n.thenStatement.getText(ast).includes('volatilityCard = {'));
    const out = run(`let volatilityCard; const gex = input; const p = {}; ${branch}; volatilityCard`, { input: snapshot.gex });
    assert.equal(out.flipDistance, 4.9);
});

test('web and mobile structure fallbacks preserve 4.9% instead of recomputing 5.1%', () => {
    for (const file of ['src/components/LiveTickerDashboard.tsx', 'src/components/intel/mobile/MobileCmdMetrics.tsx']) {
        const memo = extract(file, n => ts.isVariableDeclaration(n) && n.name.getText() === 'effectiveVol');
        const out = run(`const ${memo}; effectiveVol`, { React: { useMemo: fn => fn() }, useMemo: fn => fn(),
            structure: { netGex: 0, gammaFlipLevel: 100, atmIV: 0.3 }, q: { price: 105.10 },
            livePrice: { price: 105.10 }, initialStockData: null, volatilityData: null,
            initialUnifiedData: null, unifiedData: null, volatility: { iv: 30 },
        });
        assert.equal(out.flipDistance, 4.9);
        assert.equal(out.isAboveFlip, true);
    }
});

test('regime proximity uses unrounded spot percent at the 5% boundary', () => {
    assert.equal(computeVolatilityRegime({ underlyingPrice: 105.10, gammaFlipLevel: 100 }).regimeScore, 5);
    // 4.99% rounds to 5.0 for display but still earns the <5% proximity points.
    const out = computeVolatilityRegime({ underlyingPrice: 100, gammaFlipLevel: 95.01 });
    assert.equal(out.flipDistance, 5);
    assert.equal(out.regimeScore, 5);
    assert.equal(computeVolatilityRegime({ underlyingPrice: 100, gammaFlipLevel: 95 }).regimeScore, 0);
    const missing = gate.applyLevelsToUnified({ structure: {}, volatility: {} }, null).volatility;
    assert.equal(missing.flipDistance, null);
    assert.equal(missing.isAboveFlip, null);
});
