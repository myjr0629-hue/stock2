// Offline regression: execute production caller input expressions and the real Alpha engine.
// No environment files, provider modules, network or production writes are loaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const modules = new Map();
const allowed = new Set([
    'src/services/alphaEngine.ts', 'src/services/alphaEngineV2.ts',
    'src/lib/optionLevelGate.ts', 'src/lib/impliedMove.ts', 'src/lib/marketCalendar.ts',
    'src/lib/gammaFlipDistance.ts', 'src/lib/metrics/observation.ts',
    'src/lib/quoteBasis.ts', 'src/lib/ivSkew.ts', 'src/lib/ivRank.ts',
    'src/lib/tickerSymbol.ts', 'src/lib/levelsSupplierDelay.ts',
    'src/lib/app/watchlistInsights.ts', 'src/utils/calcPriceDisplay.ts',
    'src/services/marketDaySSOT.ts',
]);
function load(file) {
    if (modules.has(file)) return modules.get(file);
    assert.ok(allowed.has(file), `Unexpected module: ${file}`);
    const exports = {};
    modules.set(file, exports);
    const code = ts.transpileModule(read(file), { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    } }).outputText;
    vm.runInNewContext(code, { exports, require(id) {
        if (file === 'src/services/alphaEngine.ts' && id === './xsScores') return { xsOverride: x => x };
        if (id.startsWith('@/')) return load(`src/${id.slice(2)}.ts`);
        assert.ok(id.startsWith('.'), `Unexpected import: ${id}`);
        return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), id)) + '.ts');
    } }, { filename: file });
    return exports;
}
const engine = load('src/services/alphaEngine.ts');
const base = { ticker: 'TEST', session: 'REG', price: 100, prevClose: 100, changePct: 0 };
const structureKeys = new Set([
    'pcr', 'gex', 'rawChain', 'callWall', 'putFloor', 'gammaFlipLevel',
    'squeezeScore', 'ivSkew', 'optionsDataAvailable',
]);
function ast(file) {
    return ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
}
function alphaInputs(file) {
    const tree = ast(file), result = [];
    function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(tree) === 'calculateAlphaScore') {
            const input = node.arguments[0];
            assert.ok(ts.isObjectLiteralExpression(input));
            const properties = input.properties.filter(p => structureKeys.has(p.name?.getText(tree)));
            result.push(`({${properties.map(p => p.getText(tree)).join(',')}})`);
        }
        ts.forEachChild(node, visit);
    }
    visit(tree);
    return result;
}
const files = {
    detail: 'src/app/api/live/ticker/route.ts',
    watchlist: 'src/services/watchlistBatchService.ts',
    portfolio: 'src/services/portfolioBatchService.ts',
    dashboard: 'src/app/api/dashboard/unified/route.ts',
    report: 'src/services/powerEngine.ts',
};
const inputs = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, alphaInputs(file)]));
// The report input reads local declarations; execute them from the real source, not a substitute.
function declarations(file, names) {
    const tree = ast(file), found = new Map();
    function visit(node) {
        // Same-named locals exist elsewhere in the file; take the ones in the Alpha V3 block (after optionsComplete).
        if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(tree)) && !found.has(node.name.getText(tree))
            && (found.has(names[0]) || node.name.getText(tree) === names[0])) {
            found.set(node.name.getText(tree), node.getText(tree));
        }
        ts.forEachChild(node, visit);
    }
    visit(tree);
    assert.deepEqual([...found.keys()].sort(), [...names].sort(), `${file} declarations`);
    return names.map(name => found.get(name));
}
const reportDeclarations = declarations(files.report, ['optionsComplete', 'alphaOptions', 'gex']);
inputs.report = inputs.report.map(source => `(() => { const ${reportDeclarations.join(',')}; return ${source}; })()`);
const routes = [
    ['detail', 0], ['watchlist', 0], ['watchlist', 1], ['watchlist', 2],
    ['portfolio', 0], ['portfolio', 1], ['dashboard', 0], ['report', 0],
];
function mappedInput(source, pcr, gex, context = {}) {
    const metrics = { pcr, gex };
    return vm.runInNewContext(ts.transpileModule(`const input = ${source}; exports.input = input;`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText, {
        exports: {}, canonicalOptions: metrics, effectiveGex: gex, alphaRawChain: [],
        analysis: metrics, dynamoAnalysis: metrics,
        data: { ...metrics, netGex: gex, _rawChain: [], options_status: 'PENDING' },
        evidence: { options: { ...metrics, rawChain: [], complete: true, status: 'OK' } },
        gex, alphaPcr: pcr, alphaGex: gex, rawContracts: [], opts: null,
        alphaLevels: {}, alphaCallWall: null, alphaPutFloor: null, alphaGammaFlip: null,
        alphaSqueezeScore: null, squeezeScore: null, ivSkew: null,
        computeIVSkew: engine.computeIVSkew, price: base.price,
        structureRes: null, directCallWall: null, directPutFloor: null, optionsComplete: false,
        ...context,
    }) || {};
}
// vm.runInNewContext returns the final assignment's value (the production input object).
const cases = [
    ['PCR only', 0.6, null, 6, false],
    ['GEX only', null, -6000, 8, false],
    ['PCR + GEX', 0.6, -6000, 9, false],
    ['empty chain, no metrics', null, null, 8, true],
];
for (const [route, index] of routes) {
    assert.ok(inputs[route][index], `${route} input ${index} exists`);
    for (const [name, pcr, gex, score, missing] of cases) {
        test(`${route}[${index}]: ${name} (chain length 0)`, () => {
            const mapped = mappedInput(inputs[route][index], pcr, gex);
            assert.equal(mapped.pcr, pcr);
            assert.equal(mapped.gex, gex);
            const result = engine.calculateAlphaScore({ ...base, ...mapped });
            assert.equal(result.pillars.structure.score, score);
            assert.equal(result.pillars.structure.factors.some(f => f.name === 'optionsData'), missing);
            if (!missing) {
                const expected = engine.calculateAlphaScore({ ...base, pcr, gex, rawChain: [] });
                assert.deepEqual(plain(result.pillars.structure), plain(expected.pillars.structure));
            }
        });
    }
}
test('all production callers delegate availability, including error fallbacks', () => {
    for (const [route, objects] of Object.entries(inputs)) {
        assert.ok(objects.length);
        for (const object of objects) assert.doesNotMatch(object, /optionsDataAvailable/);
    }
});
test('legacy false hint cannot veto a real metric; true cannot invent data', () => {
    for (const flag of [false, true, undefined]) {
        for (const [name, pcr, gex, score, missing] of cases) {
            const result = engine.calculateAlphaScore({ ...base, pcr, gex, optionsDataAvailable: flag });
            assert.equal(result.pillars.structure.score, score, name);
            assert.equal(result.pillars.structure.factors.some(f => f.name === 'optionsData'), missing);
        }
    }
});
test('measured zero survives caller mapping and is available; nonfinite values are absent', () => {
    for (const [route, index] of routes) {
        for (const [pcr, gex] of [[0, null], [null, 0], [0, 0]]) {
            const mapped = mappedInput(inputs[route][index], pcr, gex);
            const result = engine.calculateAlphaScore({ ...base, ...mapped });
            assert.equal(result.pillars.structure.factors.some(f => f.name === 'optionsData'), false);
        }
    }
    for (const value of [undefined, null, NaN, Infinity, -Infinity]) {
        const result = engine.calculateAlphaScore({ ...base, pcr: value, gex: value, rawChain: [] });
        assert.equal(result.pillars.structure.score, 8);
        assert.equal(result.pillars.structure.factors[0].name, 'optionsData');
    }
});
test('other observed structure factors and chain alone use the existing formula', () => {
    for (const input of [
        { callWall: 104 }, { putFloor: 96 }, { gammaFlipLevel: 100 },
        { squeezeScore: 0 }, { ivSkew: 1.25 }, { rawChain: [{ open_interest: 100 }] },
    ]) {
        const result = engine.calculateAlphaScore({ ...base, ...input, optionsDataAvailable: false });
        assert.equal(result.pillars.structure.factors.some(f => f.name === 'optionsData'), false);
    }
});
test('full-input score, factor weights and V8 total remain unchanged', () => {
    const full = { ...base, pcr: 0.6, gex: -6000, callWall: 104, putFloor: 96,
        gammaFlipLevel: 100, squeezeScore: 65, ivSkew: 1.25,
        rawChain: [100, 200, 300].map(open_interest => ({ open_interest })) };
    const result = engine.calculateAlphaScore(full);
    assert.equal(result.pillars.structure.score, 21);
    assert.deepEqual(plain(result.pillars.structure.factors.map(f => [f.name, f.value, f.max])), [
        ['oiHeat', 5, 5], ['gammaSetup', 5, 5], ['wallSandwich', 5, 5],
        ['pcrBalance', 4, 5], ['squeezePotential', 4, 5], ['ivSkew', -2, 2],
    ]);
    for (const flag of [true, false]) {
        const other = engine.calculateAlphaScore({ ...full, optionsDataAvailable: flag });
        assert.deepEqual(plain(other.pillars), plain(result.pillars));
        assert.equal(other.score, result.score);
    }
    const absent = engine.calculateAlphaScore(base);
    assert.equal(absent.score, engine.calculateAlphaScore({ ...base, pcr: 0.6, gex: -6000 }).score);
});
test('DynamoDB fallback producer keeps the original zero-as-missing mapping (placeholder 0 is not an observation)', () => {
    const file = files.watchlist, tree = ast(file);
    let fields;
    function visit(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'dynamoAnalysis') {
            fields = node.initializer.properties.filter(p => ['pcr', 'gex', 'gexM'].includes(p.name?.getText(tree)));
        }
        ts.forEachChild(node, visit);
    }
    visit(tree);
    assert.equal(fields?.length, 3);
    const source = `({${fields.map(p => p.getText(tree)).join(',')}})`;
    for (const value of [0, null, undefined]) {
        const result = vm.runInNewContext(source, { gd: { netGex: value, pcRatio: value } });
        assert.deepEqual(plain(result), { gex: null, gexM: null, pcr: null });
    }
    const real = vm.runInNewContext(source, { gd: { netGex: -6000000, pcRatio: 0.6 } });
    assert.deepEqual(plain(real), { gex: -6000000, gexM: -6, pcr: 0.6 });
});
test('quick/batch callers inherit the same availability decision', () => {
    const extras = { pcr: 0.6, gex: null, optionsDataAvailable: false };
    const expected = engine.calculateAlphaScore({ ...base, ...extras });
    assert.deepEqual(plain(engine.calculateAlphaScoreQuick('TEST', 100, 100, 'REG', extras).pillars.structure), plain(expected.pillars.structure));
    assert.deepEqual(plain(engine.calculateAlphaScoreBatch([{ ...base, ...extras }])[0].pillars.structure), plain(expected.pillars.structure));
});

// Execute the actual producer, sealing storage and provider imports before loading.
// A fresh VM per response also prevents cache/memo state from hiding the failure branch.
const structureCode = ts.transpileModule(read('src/services/structureService.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
async function structureResponse({ missingOi = 6, price = 100 } = {}) {
    const now = Date.parse('2026-10-19T15:00:00Z'), expiration = '2026-11-06';
    class ClockDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const contracts = [90, 100, 110].flatMap(strike => ['call', 'put'].map(type => ({
        details: { strike_price: strike, contract_type: type, expiration_date: expiration },
        open_interest: type === 'call' ? 1000 : 600,
        greeks: { gamma: 0.02 },
    })));
    contracts.slice(0, missingOi).forEach(c => { c.open_interest = null; });
    const writes = [];
    const probe = { exactResults: contracts, weeklyExpiry: expiration, expirations: [expiration],
        chainDate: '2026-10-16', _ts: now };
    const forbidden = () => { throw new Error('Unexpected external I/O'); };
    const mocks = {
        '@/services/redisClient': {
            getFromCache: async key => key === 'polygon:snapshot:probe:TEST' ? probe : null,
            mgetFromCache: async keys => keys.map(() => null),
            setInCache: async (...args) => { writes.push(args); return true; },
        },
        '@/services/massiveClient': { CACHE_POLICY: { LIVE: 'LIVE' }, fetchMassive: async url => {
            assert.equal(price, 0, 'spot is injected for every priced scenario');
            assert.equal(url, '/v2/snapshot/locale/us/markets/stocks/tickers/TEST');
            return { ticker: {} };
        } },
        './extendedSessionClose': { isTradeInExtSession: () => false },
        '@/services/holidayCache': { findWeeklyExpiration: forbidden },
        '@/lib/sessionArchive': { saveSessionArchive: async () => {}, readSessionArchiveMany: forbidden,
            isTradingDay: () => true },
    };
    const exports = {};
    vm.runInNewContext(structureCode, {
        exports, Date: ClockDate, console: { log() {}, warn() {}, error() {} },
        fetch: forbidden, setTimeout: forbidden,
        require(id) {
            if (Object.hasOwn(mocks, id)) return mocks[id];
            if (id.startsWith('@/')) return load(`src/${id.slice(2)}.ts`);
            assert.ok(id.startsWith('.'), `Unexpected producer import: ${id}`);
            return load(path.posix.normalize(path.posix.join('src/services', id)) + '.ts');
        },
    }, { filename: 'src/services/structureService.ts' });
    const response = await exports.getStructureData('TEST', null, { price, prevClose: 100 }, true, { noRefresh: true });
    return { response, writes };
}

// Include the full-mode portfolio pre-mapping; substituting alphaSqueezeScore=null here
// would conceal the original bug even while testing the real engine call expression.
const portfolioNames = ['alphaGex', 'alphaPcr', 'alphaCallWall', 'alphaPutFloor', 'alphaGammaFlip', 'alphaSqueezeScore'];
const portfolioTree = ast(files.portfolio), portfolioDeclarations = [];
function collectPortfolio(node) {
    if (ts.isVariableDeclaration(node) && portfolioNames.includes(node.name.getText(portfolioTree))) {
        portfolioDeclarations.push(node.getText(portfolioTree));
    }
    ts.forEachChild(node, collectPortfolio);
}
collectPortfolio(portfolioTree);
assert.equal(portfolioDeclarations.length, portfolioNames.length);
function inputFromStructure(route, response, opts = null) {
    const source = route === 'portfolio'
        ? `(() => { const ${portfolioDeclarations.join(',')}; return ${inputs.portfolio[1]}; })()`
        : inputs.dashboard[0];
    return mappedInput(source, null, null, { data: response, structureRes: response, opts });
}

test('failed producer: all OI missing is unmeasured squeeze, without storage writes', async () => {
    const { response, writes } = await structureResponse();
    assert.equal(response.options_status, 'PENDING');
    assert.equal(response.partialReason, 'oi_missing:6/6');
    assert.equal(response.pcr, null);
    assert.equal(response.netGex, null);
    assert.equal(response.gammaFlipLevel, null);
    assert.deepEqual(plain(response.levels), { callWall: null, putFloor: null, pinZone: null });
    assert.equal(response.squeezeScore, null);
    assert.equal(writes.length, 0);
});
for (const route of ['dashboard', 'portfolio']) {
    test(`${route}: actual failed producer and empty separate chain retain missing baseline 8 and V8 total 41`, async () => {
        const { response } = await structureResponse();
        const mapped = inputFromStructure(route, response);
        const result = engine.calculateAlphaScore({ ...base, ...mapped });
        const expected = engine.calculateAlphaScore(base);
        assert.equal(result.pillars.structure.score, 8);
        assert.deepEqual(plain(result.pillars.structure), plain(expected.pillars.structure));
        assert.equal(mapped.squeezeScore, null);
        assert.equal(result.pillars.structure.factors[0].name, 'optionsData');
        assert.equal(result.score, 41);
    });
    test(`${route}: failed producer does not veto independently observed PCR/GEX, including zero`, async () => {
        // 2/6 OI missing makes the producer PENDING, with the remaining PCR still observed.
        const { response } = await structureResponse({ missingOi: 2 });
        assert.equal(response.options_status, 'PENDING');
        assert.equal(response.pcr, 0.6);
        assert.equal(response.squeezeScore, null);
        for (const [pcr, gex] of [[response.pcr, null], [0, null], [null, -6000], [null, 0]]) {
            const opts = { putCallRatio: pcr, gex, rawChain: [] };
            const mapped = inputFromStructure(route, { ...response, pcr, netGex: gex }, opts);
            assert.equal(mapped.pcr, pcr);
            assert.equal(mapped.gex, gex);
            const result = engine.calculateAlphaScore({ ...base, ...mapped });
            const expected = engine.calculateAlphaScore({ ...base, pcr, gex });
            assert.deepEqual(plain(result.pillars.structure), plain(expected.pillars.structure));
            assert.ok(result.pillars.structure.factors.every(f => f.name !== 'optionsData'));
        }
    });
    test(`${route}: measured squeeze zero and successful producer values retain existing scoring`, async () => {
        const { response } = await structureResponse({ missingOi: 0 });
        assert.equal(response.options_status, 'OK');
        assert.ok(Number.isFinite(response.squeezeScore));
        for (const squeezeScore of [response.squeezeScore, 0]) {
            const measured = { ...response, squeezeScore };
            const mapped = inputFromStructure(route, measured, { putCallRatio: measured.pcr });
            assert.equal(mapped.squeezeScore, squeezeScore);
            const result = engine.calculateAlphaScore({ ...base, ...mapped });
            const expected = engine.calculateAlphaScore({ ...base, pcr: measured.pcr, gex: measured.netGex,
                callWall: measured.levels.callWall, putFloor: measured.levels.putFloor,
                gammaFlipLevel: measured.gammaFlipLevel, squeezeScore });
            assert.deepEqual(plain(result.pillars.structure), plain(expected.pillars.structure));
        }
    });
}
test('missing underlying price: status downgrade retains PCR but never invents squeeze zero', async () => {
    const { response, writes } = await structureResponse({ missingOi: 0, price: 0 });
    assert.equal(response.options_status, 'PENDING');
    assert.equal(response.pcr, 0.6);
    assert.equal(response.squeezeScore, null);
    assert.equal(writes.length, 0);
});

// ── r4: report source-failure placeholders, gate-3 regressions (portfolio order, detail DynamoDB fallback) ──
function literalAt(file, pick) {
    const tree = ast(file);
    let text;
    function visit(node) { if (!text) { text = pick(node, tree); ts.forEachChild(node, visit); } }
    visit(tree);
    assert.ok(text, `${file} literal`);
    return vm.runInNewContext(`(${text})`, {});
}
// Actual producer literals: buildOptionsEvidence(null) and createIncompleteItem().evidence.options.
const enricher = 'src/services/terminalEnricher.ts';
const pendingPlaceholder = literalAt(enricher, (node, tree) => ts.isFunctionDeclaration(node) && node.name?.getText(tree) === 'buildOptionsEvidence'
    ? node.body.statements.find(ts.isIfStatement).thenStatement.statements.find(ts.isReturnStatement).expression.getText(tree) : undefined);
const failedPlaceholder = literalAt(enricher, (node, tree) => ts.isPropertyAssignment(node) && node.name.getText(tree) === 'options'
    && ts.isObjectLiteralExpression(node.initializer) && /^\{\s*status: 'FAILED'/.test(node.initializer.getText(tree)) ? node.initializer.getText(tree) : undefined);
const reportInput = options => mappedInput(inputs.report[0], null, null, { evidence: { options } });
test('report: producer placeholders (PENDING no-data, FAILED item) are not observations → baseline 8, V8 total unchanged', () => {
    assert.equal(pendingPlaceholder.status, 'PENDING');
    assert.equal(pendingPlaceholder.pcr, 0);
    assert.equal(failedPlaceholder.status, 'FAILED');
    assert.equal(failedPlaceholder.gex, 0);
    // fetchOptionsChain after a non-OK getOptionsData (pcr/gex null → `|| 0`), and NO_OPTIONS (complete but no listed options)
    const pendingWithData = { status: 'PENDING', pcr: 0, gex: 0, callWall: 0, putFloor: 0, maxPain: 0, rawChain: [], squeezeScore: null, complete: false };
    const noOptions = { status: 'NO_OPTIONS', pcr: 0, gex: 0, callWall: 0, putFloor: 0, maxPain: 0, rawChain: [], squeezeScore: null, complete: true };
    const expected = engine.calculateAlphaScore(base);
    for (const options of [pendingPlaceholder, failedPlaceholder, pendingWithData, noOptions, undefined]) {
        const mapped = reportInput(options);
        assert.equal(mapped.pcr, null);
        assert.equal(mapped.gex, null);
        const result = engine.calculateAlphaScore({ ...base, ...mapped });
        assert.equal(result.pillars.structure.score, 8);
        assert.equal(result.pillars.structure.factors[0].name, 'optionsData');
        assert.equal(result.score, expected.score);
    }
});
test('report: successful evidence keeps PCR-only / GEX-only / both partial scoring identical to direct input', () => {
    for (const [pcr, gex] of [[0.6, null], [null, -6000], [0.6, -6000]]) {
        const mapped = reportInput({ status: 'OK', complete: true, pcr, gex, callWall: 0, putFloor: 0, rawChain: [] });
        const result = engine.calculateAlphaScore({ ...base, ...mapped });
        const expected = engine.calculateAlphaScore({ ...base, pcr, gex });
        assert.deepEqual(plain(result.pillars.structure), plain(expected.pillars.structure));
        assert.ok(result.pillars.structure.factors.every(f => f.name !== 'optionsData'));
    }
});

const tickerFile = files.detail;
const tickerFns = ['bandedWalls', 'pickAlphaLevels'].map(name => {
    const tree = ast(tickerFile);
    let text;
    (function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.getText(tree) === name) text = node.getText(tree); ts.forEachChild(node, visit); })(tree);
    assert.ok(text, name);
    return text;
}).join('\n');
function detailLevels(structureResult, flowData, spot = 100) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(`${tickerFns}\nexports.pick = pickAlphaLevels;`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText, { exports, levelsFromStructure: load('src/lib/optionLevelGate.ts').levelsFromStructure });
    return exports.pick(structureResult, flowData, spot);
}
const detailFailStructure = { squeezeScore: null, squeezeRisk: null, atmIv: null, netGex: null, pcr: null, gammaFlipLevel: null, callWall: null, putFloor: null };
const detailFailFlow = { dataSource: 'NONE', rawChain: [], error: 'boom' };
function detailInput(structureResult, flowData, canonical = { pcr: null, gex: null, squeezeScore: null }) {
    return mappedInput(inputs.detail[0], null, null, {
        canonicalOptions: canonical, effectiveGex: canonical.gex ?? null, squeezeScore: canonical.squeezeScore ?? null,
        alphaLevels: detailLevels(structureResult, flowData), alphaRawChain: flowData.rawChain ?? [], ivSkew: null,
    });
}
test('detail: structure+flow FINAL FAIL defaults and empty chain → baseline 8', async () => {
    for (const structure of [detailFailStructure, (await structureResponse()).response]) {
        const mapped = detailInput(structure, detailFailFlow);
        const result = engine.calculateAlphaScore({ ...base, ...mapped });
        assert.equal(result.pillars.structure.score, 8);
        assert.equal(result.pillars.structure.factors[0].name, 'optionsData');
    }
});
test('detail: PENDING structure + failed chain + DynamoDB fallback keeps walls/flip (gate-3 regression)', async () => {
    const { response } = await structureResponse();   // PENDING, all levels null
    for (const structureBase of [response, detailFailStructure]) {
        // The route's AWS fallback mutates structure/flow in place (live/ticker «AWS 저장소 폴백»).
        const sr = JSON.parse(JSON.stringify(structureBase));
        sr.gammaFlipLevel = 100;
        sr.levels = { ...(sr.levels || {}), callWall: 104, putFloor: 96 };
        const fr = { ...detailFailFlow, maxPain: 100, callWall: 104, putFloor: 96, dataSource: 'dynamodb-gex', _awsFallback: true };
        const levels = detailLevels(sr, fr);
        assert.equal(levels.callWall, 104);
        assert.equal(levels.putFloor, 96);
        assert.equal(levels.gammaFlipLevel, 100);
        const mapped = detailInput(sr, fr);
        const result = engine.calculateAlphaScore({ ...base, ...mapped });
        const expected = engine.calculateAlphaScore({ ...base, callWall: 104, putFloor: 96, gammaFlipLevel: 100 });
        assert.deepEqual(plain(result.pillars.structure), plain(expected.pillars.structure));
        assert.ok(result.pillars.structure.factors.every(f => f.name !== 'optionsData'));
    }
});
test('detail: canonical PCR-only / GEX-only / both with empty chain → partial score (no chain veto)', () => {
    for (const [pcr, gex] of [[0.6, null], [null, -6000], [0.6, -6000]]) {
        const mapped = detailInput(detailFailStructure, detailFailFlow, { pcr, gex, squeezeScore: null });
        const result = engine.calculateAlphaScore({ ...base, ...mapped });
        assert.deepEqual(plain(result.pillars.structure), plain(engine.calculateAlphaScore({ ...base, pcr, gex }).pillars.structure));
    }
});
test('watchlist full: failed structure + null metrics → baseline 8', async () => {
    const { response } = await structureResponse();
    const mapped = mappedInput(inputs.watchlist[2], null, null, {
        alphaPcr: null, alphaGex: null, rawContracts: [], directCallWall: 0, directPutFloor: 0,
        structureRes: response, alphaGammaFlip: response.gammaFlipLevel ?? null, alphaSqueezeScore: null, ivSkew: null,
    });
    const result = engine.calculateAlphaScore({ ...base, ...mapped });
    assert.equal(result.pillars.structure.score, 8);
});
test('portfolio: option metrics are read after the core computes (gate-3 regression: fresh GEX/squeeze kept)', () => {
    const tree = ast(files.portfolio);
    let body;
    (function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.getText(tree) === 'processPortfolioBatch') body = node.body.getText(tree); ts.forEachChild(node, visit); })(tree);
    assert.ok(body);
    const core = body.indexOf('processPortfolioBatchCore('), metrics = body.indexOf('readOptionMetrics(');
    assert.ok(core >= 0 && metrics > core, 'readOptionMetrics must follow processPortfolioBatchCore');
    assert.match(body, /processPortfolioBatchCore\(tickers, mode\)/);
});
