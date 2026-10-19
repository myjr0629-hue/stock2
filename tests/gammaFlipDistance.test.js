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
let dealerPoints = [];
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
    '@/services/redisClient': { getFromCache: async () => null, setInCache: async () => {} },
    '@/services/guardian/unifiedDataStream': { GuardianDataHub: { getGuardianSnapshot: async () => null } },
    '@/services/institutionalFlow': { getInstitutionalFlowSummary: async () => null },
    '@/services/indexBreadth': { getIndexBreadth: async () => null },
};
const compile = code => ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
} }).outputText;
function load(relative) {
    const file = path.resolve(root, relative);
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const allowed = /src\/(lib\/(gammaFlipDistance|optionLevelGate|marketCalendar|metrics\/\w+|commandVolatilityObservation)|services\/(volatilityRegime|dealerGamma)|app\/api\/live\/(volatility-regime|premium-metrics)\/route)\.ts$/;
    assert.match(file, allowed, 'only pure modules and the mocked route may load');
    vm.runInNewContext(compile(fs.readFileSync(file, 'utf8')), {
        exports, Date, console, process: { env: {} }, AbortController,
        setTimeout, clearTimeout,
        fetch: async url => {
            assert.match(file, /services\/dealerGamma\.ts$/);
            assert.ok(url.endsWith('/get?key=intrinio%3Agex%3Abf%3ASPY'));
            return { ok: true, json: async () => ({ result: { points: dealerPoints } }) };
        },
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
const { computeVolatilityRegime, computeStructureVolatilityRegime } = load('src/services/volatilityRegime.ts');
const { computeUnifiedVolatilityRegime } = load('src/lib/metrics/volatilityRegime.ts');
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
            readOptionMetrics: async () => new Map(), readOptionEditions: async () => new Map(), applyUnifiedOptionMetrics: d => d,
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
        require: id => mocks[id] || (id === '@/services/volatilityRegime' ? { computeVolatilityRegime, computeStructureVolatilityRegime }
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
    const get = run(`${fn}\ngetVolatilityFromDynamoGex`, { computeVolatilityRegime,
        require: id => { assert.equal(id, '@/lib/aws/dynamoDataProvider'); return mocks[id]; },
        setTimeout: () => 0,
    });
    assert.equal((await get('TEST')).flipDistance, 4.9);
    const branch = extract(unifiedFile, (n, ast) => ts.isIfStatement(n) && n.expression.getText(ast) === 'gex'
        && n.thenStatement.getText(ast).includes('volatilityCard = {'));
    const out = run(`let volatilityCard; const gex = input; const p = {}; ${branch}; volatilityCard`, { input: snapshot.gex, computeVolatilityRegime });
    assert.equal(out.flipDistance, 4.9);
});

test('web and mobile structure fallbacks preserve 4.9% instead of recomputing 5.1%', () => {
    for (const file of ['src/components/LiveTickerDashboard.tsx', 'src/components/intel/mobile/MobileCmdMetrics.tsx']) {
        const memo = extract(file, n => ts.isVariableDeclaration(n) && n.name.getText() === 'effectiveVol');
        // B5: both consume the shared calculation on the structure edition's own spot.
        const edition = { structure: { netGex: 0, gammaFlipLevel: 100, underlyingPrice: 105.10, atmIV: 0.3 }, volatility: { iv: 30 } };
        const out = run(`const ${memo}; effectiveVol`, { React: { useMemo: fn => fn() }, useMemo: fn => fn(),
            computeUnifiedVolatilityRegime, volatilityObservation: { data: edition }, unified: edition, volatilityData: undefined,
        });
        assert.equal(out.flipDistance, 4.9);
        assert.equal(out.isAboveFlip, true);
    }
});

test('regime proximity uses unrounded spot percent at the 5% boundary', () => {
    // B5: every regime input is required; the other inputs here contribute 0 points.
    const zero = { netGex: 1, squeezeScore: 0, atmIv: 20, gammaConcentration: 0 };
    assert.equal(computeVolatilityRegime({ ...zero, underlyingPrice: 105.10, gammaFlipLevel: 100 }).regimeScore, 5);
    // 4.99% rounds to 5.0 for display but still earns the <5% proximity points.
    const out = computeVolatilityRegime({ ...zero, underlyingPrice: 100, gammaFlipLevel: 95.01 });
    assert.equal(out.flipDistance, 5);
    assert.equal(out.regimeScore, 5);
    assert.equal(computeVolatilityRegime({ ...zero, underlyingPrice: 100, gammaFlipLevel: 95 }).regimeScore, 0);
    const missing = gate.applyLevelsToUnified({ structure: {}, volatility: {} }, null).volatility;
    assert.equal(missing.flipDistance, null);
    assert.equal(missing.isAboveFlip, null);
});

test('premium-metrics dealer distance and unstable use spot percent before rounding', async () => {
    const premium = load('src/app/api/live/premium-metrics/route.ts');
    const dealer = load('src/services/dealerGamma.ts');
    for (const [spot, flip, gex, expected, unstable] of [
        [105.10, 100, -1, 4.9, false],
        [103.05, 100, -1, 3, true], // raw 2.9597%, previously 3.05% => false
        [100, 97, -1, 3, true],   // exactly 3% is included
        [100, 96.99, -1, 3, false], // rounds to 3% but lies outside
        [100, 102.99, -1, -3, true],
        [100, 103.01, -1, -3, false],
        [100, 100, -1, 0, true],
        [103.05, 100, 1, 3, false], // long gamma never unstable
    ]) {
        seed(spot, flip);
        dealerPoints = [{ date: '2026-10-19', price: spot, gex }];
        const out = await premium.GET({ nextUrl: new URL('http://localhost?locale=ko') });
        assert.equal(out.success, true);
        assert.equal(out.dealerGamma.flipDistancePct, expected, `${spot}/${flip}`);
        assert.equal(out.dealerGamma.unstable, unstable, `${spot}/${flip}, GEX ${gex}`);
    }
    assert.ok(Math.abs(gammaFlipDistancePct(103.05, 100) - 2.9597282872392014) < 1e-12);
    dealerPoints = [{ date: '2026-10-19', price: 103.05, gex: -1 }];
    assert.equal((await dealer.getDealerGamma('SPY', 100)).flipDistancePct, 3, 'history price fallback');
    for (const flip of [null, 0, -1, NaN, Infinity]) {
        const out = await dealer.getDealerGamma('SPY', flip, 103.05);
        assert.equal(out.flipDistancePct, null);
        assert.equal(out.unstable, false);
    }
});

test('Flow overview, AI payload, hero and Command hero use the same spot distance', () => {
    const flow = 'src/app/[locale]/app-view/flow/page.tsx';
    const variable = (file, name, contains) => extract(file, n => ts.isVariableDeclaration(n)
        && n.name.getText() === name && (!contains || n.getText().includes(contains)));
    const snippets = [
        variable(flow, 'dist', 'gammaFlipNum'),
        variable(flow, 'gammaDistancePct'),
        variable(flow, 'gfDiff'),
        variable('src/app/[locale]/app-view/cmd/page.tsx', 'gfDiff'),
        variable('src/app/[locale]/dashboard/DashboardClient.tsx', 'dist', 'flip'),
        variable('src/components/guardian/mobile/MobileGammaShield.tsx', 'flipDistance'),
    ];
    const ai = extract(flow, n => ts.isPropertyAssignment(n) && n.name.getText() === 'flipPercentage');
    for (const spot of [105.10, 103.05, 94.90, 100]) {
        const expected = gammaFlipDistancePct(spot, 100);
        const context = { displayPrice: spot, price: spot, currentPrice: spot,
            gammaFlipNum: 100, gammaFlipNumForOverview: 100, gammaFlipPoint: 100, flip: 100,
            data: { premium: { gammaFlipRaw: 100 } } };
        for (const snippet of snippets) {
            const name = snippet.split('=')[0].trim();
            assert.equal(run(`const ${snippet}; ${name}`, context), expected, snippet);
        }
        assert.equal(run(`({ ${ai} }).flipPercentage`, context), `${expected.toFixed(1)}%`);
    }
});

test('web/mobile dashboard and FlowRadar proximity decisions use unrounded spot distance', () => {
    for (const [file, variable, weight, condition] of [
        ['src/app/[locale]/dashboard/DashboardClient.tsx', 'flipDist', 'flipDistWeight', 'flip > 0 && price > 0'],
        ['src/components/mobile/MobileMetricsTab.tsx', 'flipDist', 'fw', 'flip > 0 && price > 0'],
        ['src/components/FlowRadar.tsx', 'flipDistance', 'flipDistWeight', 'flip && currentPrice > 0'],
    ]) {
        const branch = extract(file, (n, ast) => ts.isIfStatement(n)
            && n.expression.getText(ast) === condition);
        for (const [spot, expectedWeight, expectedRegime] of [
            [105.10, 1, 'STABLE'], [102.03, 0.5, 'TRANSITION'],
            [98.02, 0.2, 'EXPLOSIVE'], [100, 0.3, 'FLIP_ZONE'],
        ]) {
            const out = run(`let ${variable} = 0, ${weight} = 0, flipDir = '', regime = '';
                ${branch}; ({ distance: ${variable}, weight: ${weight}, regime })`,
                { flip: 100, price: spot, currentPrice: spot });
            assert.equal(out.distance, gammaFlipDistancePct(spot, 100), file);
            assert.equal(out.weight, expectedWeight, file);
            assert.equal(out.regime, expectedRegime, file);
        }
    }
    const dex = extract('src/app/[locale]/app-view/flow/page.tsx', n => ts.isVariableDeclaration(n) && n.name.getText() === 'dexScore');
    assert.equal(run(`const ${dex}; dexScore`, { useMemo: fn => fn(), liveGammaFlip: 100, displayPrice: 105.10 }), -5);
});

test('Guardian web/mobile detail and IVSkew proximity agree on spot denominator', () => {
    const sub = extract('src/components/IVSkewCurve.tsx', n => ts.isVariableDeclaration(n) && n.name.getText() === 'getGammaFlipSub');
    const L = { gammaFlipSubClose: 'close', gammaFlipSubAbove: 'above', gammaFlipSubBelow: 'below' };
    for (const [spot, expected] of [[102.03, 'close'], [98.02, 'below'], [105.10, 'above'], [100, 'close']]) {
        assert.equal(run(`const ${sub}; getGammaFlipSub()`, { gammaFlip: 100, resolvedPrice: spot, L }), expected);
    }
    for (const file of ['src/components/guardian/GammaShield.tsx', 'src/components/guardian/mobile/MobileGammaShield.tsx']) {
        const detail = extract(file, n => ts.isJsxExpression(n)
            && n.expression?.getText().endsWith('.toFixed(1)')
            && /gammaFlipPoint|flipDistance/.test(n.expression.getText()));
        for (const spot of [105.10, 103.05, 94.90, 100]) {
            const distance = gammaFlipDistancePct(spot, 100);
            assert.equal(run(`(${detail.slice(1, -1)})`, { currentPrice: spot, gammaFlipPoint: 100, flipDistance: distance }), distance.toFixed(1), file);
        }
    }
});

test('gate 10200719 ①: the unified exit judges the flip with the latest edition spot (not the cached response spot)', async () => {
    const overlay = extract(unifiedFile, n => ts.isFunctionDeclaration(n) && n.name?.text === 'overlayStructureLevels');
    const lv = seed(110, 105);   // latest level set: flip 105, computed at 110
    // Edition shape of lib/optionMetrics optionRegimeInputs (its spot field is checked in b5MetricDefinitions).
    const regime = { underlyingPrice: 110, atmIv: 40, gammaConcentration: 60, gammaConcentrationLabel: 'HIGH' };
    const applyUnifiedOptionMetrics = (d, m, r) => { Object.assign(d.structure, { netGex: m.gex, squeezeScore: m.squeezeScore, atmIv: r.atmIv, gammaConcentration: r.gammaConcentration }); return d; };
    const service = { ...gate, levelsForExit: async () => new Map([['TEST', lv]]),
        readOptionEditions: async () => new Map([['TEST', { metrics: { gex: -1e8, squeezeScore: 40 }, regime }]]),
        applyUnifiedOptionMetrics, readOptionAlpha: async () => new Map() };
    const context = { ...service, require: id => { assert.equal(id, '@/services/structureService'); return service; } };
    const apiExit = run(`${overlay}\noverlayStructureLevels`, context);
    // Cached unified response still carries the older spot 100 (below the flip).
    const out = await apiExit({ structure: { ...structure, underlyingPrice: 100 }, volatility: {} }, 'TEST');
    assert.equal(out.structure.underlyingPrice, 110);
    assert.equal(out.volatility.isAboveFlip, true);
    const r = computeUnifiedVolatilityRegime(out);
    assert.equal(r.isAboveFlip, true); assert.equal(r.regimeScore, computeVolatilityRegime({ netGex: -1e8, gammaFlipLevel: 105, underlyingPrice: 110, squeezeScore: 40, atmIv: 40, gammaConcentration: 60 }).regimeScore);
    // No usable edition: the cached response spot stays (previous behaviour).
    const noEdition = { ...service, readOptionEditions: async () => new Map(), applyUnifiedOptionMetrics: d => d };
    const none = run(`${overlay}\noverlayStructureLevels`, { ...noEdition, require: () => noEdition });
    assert.equal((await none({ structure: { ...structure, underlyingPrice: 100 }, volatility: {} }, 'TEST')).structure.underlyingPrice, 100);
});

test('gate 10200719 ②: volatility-regime / premium-metrics adapter passes the flip judgement (beyond the band is an input)', () => {
    // No crossing within ±15%: flip level null, but the level set says ALL_LONG → 4 measured inputs score.
    const s = { options_status: 'OK', levelsProducer: gate.STRUCTURE_PRODUCER, underlyingPrice: 100, gammaFlipLevel: null,
        expiration: '2026-10-23', netGex: 1e8, squeezeScore: 40, atmIv: null, gammaConcentration: null, levels: {},
        structure: { strikes: [90, 100, 110], callsOI: [10, 10, 10], putsOI: [10, 10, 10], gexCum: [1, 2, 3] } };
    const lv = gate.levelsFromStructure(s);
    const d = gate.displayLevels(lv, 100, 'volatility-regime', Date.now());
    const type = gate.gammaFlipTypeOf(lv, d, 100);
    const out = computeStructureVolatilityRegime(s, Date.now());
    assert.equal(type, 'ALL_LONG');
    assert.equal(out.flipOutOfRange, 'ABOVE'); assert.equal(out.metric.coverage.available, 4);
    assert.equal(out.regimeScore, 10); assert.equal(out.regime, 'CALM');
    // Source check: the adapter forwards gammaFlipTypeOf of the same level set.
    assert.match(fs.readFileSync(path.join(root, 'src/services/volatilityRegime.ts'), 'utf8'), /gammaFlipType: gammaFlipTypeOf\(lv, d, price\)/);
});

test('gate 10200735 ①: SSR first screen uses the same edition spot and inputs as the API exit', async () => {
    const overlay = extract(unifiedFile, n => ts.isFunctionDeclaration(n) && n.name?.text === 'overlayStructureLevels');
    const ssr = extract('src/app/[locale]/ticker/page.tsx', (n, ast) => ts.isIfStatement(n) && n.expression.getText(ast) === 'initialUnifiedData?.structure');
    const lv = seed(110, 105);
    const regime = { underlyingPrice: 110, atmIv: 40, gammaConcentration: 60, gammaConcentrationLabel: 'HIGH' };
    const applyUnifiedOptionMetrics = (d, m, r) => { Object.assign(d.structure, { netGex: m.gex, squeezeScore: m.squeezeScore, atmIv: r.atmIv, gammaConcentration: r.gammaConcentration }); return d; };
    const editions = async () => new Map([['TEST', { metrics: { gex: -1e8, squeezeScore: 40 }, regime }]]);
    const service = { ...gate, levelsForExit: async () => new Map([['TEST', lv]]), readOptionEditions: editions,
        applyUnifiedOptionMetrics, readOptionAlpha: async () => new Map() };
    const mods = { '@/services/structureService': service, '@/services/optionMetricsService': { readOptionEditions: editions }, '@/lib/optionMetrics': { applyUnifiedOptionMetrics } };
    const context = { ...service, require: id => { assert.ok(id in mods, id); return mods[id]; } };
    const apiExit = run(`${overlay}\noverlayStructureLevels`, context);
    const ssrExit = run(`async function exit(initialUnifiedData, ticker) { ${ssr}; return initialUnifiedData; }\nexit`, context);
    const cached = () => ({ structure: { ...structure, underlyingPrice: 100, netGex: 5e7, squeezeScore: 10 }, volatility: {} });
    const api = computeUnifiedVolatilityRegime(await apiExit(cached(), 'TEST'));
    const first = computeUnifiedVolatilityRegime(await ssrExit(cached(), 'TEST'));
    assert.equal(first.isAboveFlip, true); assert.equal(first.regimeScore, api.regimeScore); assert.equal(first.regime, api.regime);
    // Edition read failure: SSR keeps the previous behaviour (levels only on the cached response).
    const failing = { ...mods, '@/services/optionMetricsService': { readOptionEditions: async () => { throw new Error('down'); } } };
    const old = run(`async function exit(initialUnifiedData, ticker) { ${ssr}; return initialUnifiedData; }\nexit`, { require: id => failing[id] });
    const kept = await old(cached(), 'TEST');
    assert.equal(kept.structure.underlyingPrice, 100); assert.equal(kept.structure.gammaFlipLevel, 105); assert.equal(kept.structure.netGex, 5e7);
});
