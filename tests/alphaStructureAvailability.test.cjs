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
    'src/services/marketDaySSOT.ts', 'src/lib/optionObservation.ts',
    'src/lib/optionMetrics.ts', 'src/lib/app/intelOptionsBasis.ts', 'src/lib/putCall.ts',
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
const observations = load('src/lib/optionObservation.ts');
const canonical = load('src/lib/optionMetrics.ts');
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
const routes = [
    ['detail', 0], ['watchlist', 0], ['watchlist', 1], ['watchlist', 2],
    ['portfolio', 0], ['portfolio', 1], ['dashboard', 0], ['report', 0],
];
function mappedInput(source, pcr, gex, context = {}) {
    const metrics = { pcr, gex };
    return vm.runInNewContext(ts.transpileModule(`const input = ${source}; exports.input = input;`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText, {
        exports: {}, ...observations, ticker: 'TEST', metrics: new Map([['TEST', metrics]]),
        canonicalOptions: metrics, effectiveGex: gex, alphaRawChain: [],
        analysis: metrics, dynamoAnalysis: metrics,
        data: { ...metrics, netGex: gex, _rawChain: [], options_status: 'OK' },
        evidence: { options: { ...metrics, rawChain: [], complete: true, status: 'OK' } },
        gex, alphaPcr: pcr, alphaGex: gex, rawContracts: [], opts: null,
        alphaLevels: {}, alphaCallWall: null, alphaPutFloor: null, alphaGammaFlip: null,
        alphaSqueezeScore: null, squeezeScore: null, ivSkew: null,
        computeIVSkew: engine.computeIVSkew, price: base.price,
        structureResult: null, flowData: null, directCallWall: null, directPutFloor: null, optionsComplete: false,
        structureRes: null, ...context,
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
test('DynamoDB fallback producer preserves actual PCR/GEX zero', () => {
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
        const result = vm.runInNewContext(ts.transpileModule(`exports.out = ${source}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, { exports: {}, ...observations, gd: { netGex: value, pcRatio: value } });
        assert.deepEqual(plain(result), { gex: value ?? null, gexM: value === 0 ? 0 : null, pcr: value ?? null });
    }
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
async function structureResponse({ missingOi = 6, price = 100, putOi = 600 } = {}) {
    const now = Date.parse('2026-10-19T15:00:00Z'), expiration = '2026-11-06';
    class ClockDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const contracts = [90, 100, 110].flatMap(strike => ['call', 'put'].map(type => ({
        details: { strike_price: strike, contract_type: type, expiration_date: expiration },
        open_interest: type === 'call' ? 1000 : putOi,
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
            const opts = { options_status: 'OK', putCallRatio: pcr, gex, rawChain: [] };
            const mapped = inputFromStructure(route, { ...response, pcr, netGex: gex, optionObservations: { pcr: pcr != null, netGex: gex != null } }, opts);
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

// Evaluate the production declarations BEFORE each Alpha call as well as the call
// expression. Supplying alphaGex/gex by hand would hide the exact report failure.
function declarations(file, names) {
    const tree = ast(file), found = new Map();
    function visit(node) {
        if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(tree))) {
            const name = node.name.getText(tree);
            assert.ok(!found.has(name), `ambiguous declaration ${file}:${name}`);
            found.set(name, node.getText(tree));
        }
        ts.forEachChild(node, visit);
    }
    visit(tree);
    return names.map(name => { assert.ok(found.has(name), `${file}:${name}`); return found.get(name); });
}
function productionFunction(file, name, context = {}, source = read(file)) {
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const node = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(node, `${file}:${name}`);
    return vm.runInNewContext(ts.transpileModule(`${node.getText(tree)}\nexports.fn = ${name};`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText, { exports: {}, ...observations, ...context });
}
const detailLevels = productionFunction(files.detail, 'pickAlphaLevels', {
    levelsFromStructure: s => ({ ...s.levels, gammaFlipLevel: s.gammaFlipLevel }),
    bandedWalls: () => ({ callWall: null, putFloor: null }),
});
const reportGexTree = ast(files.report);
let reportGexDeclaration;
function collectReportGex(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(reportGexTree) === 'gex'
        && node.initializer?.getText(reportGexTree).includes("optionNumber(evidence?.options")) {
        assert.equal(reportGexDeclaration, undefined);
        reportGexDeclaration = node.getText(reportGexTree);
    }
    ts.forEachChild(node, collectReportGex);
}
collectReportGex(reportGexTree);
assert.ok(reportGexDeclaration);
const detailPrelude = declarations(files.detail, ['effectiveGex', 'alphaRawChain']);
const watchPrelude = declarations(files.watchlist, ['alphaGex', 'alphaPcr', 'alphaGammaFlip', 'alphaSqueezeScore', 'rawContracts', 'ivSkew']);
const portfolioPrelude = declarations(files.portfolio, [...portfolioNames, 'rawContracts', 'ivSkew']);
const dynamoTree = ast(files.watchlist);
let dynamoFields;
function collectDynamo(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(dynamoTree) === 'dynamoAnalysis') {
        dynamoFields = node.initializer.properties.filter(p => structureKeys.has(p.name?.getText(dynamoTree))).map(p => p.getText(dynamoTree));
    }
    ts.forEachChild(node, collectDynamo);
}
collectDynamo(dynamoTree);
const wallLoopStart = read(files.watchlist).indexOf('            let maxCallOI = 0, maxPutOI = 0;');
const wallLoopEnd = read(files.watchlist).indexOf('            // ★★ [2026-09-29]', wallLoopStart);
assert.ok(wallLoopStart > 0 && wallLoopEnd > wallLoopStart);
const watchWallLoop = read(files.watchlist).slice(wallLoopStart, wallLoopEnd);
function productionInput(route, index, response, overrides = {}) {
    const now = Date.parse('2026-10-19T15:00:00Z');
    // This is the REAL source-to-canonical adapter, including the independent OI row.
    const normalized = canonical.optionMetrics(response, { ...response, timestamp: now }, now);
    const opts = overrides.opts === undefined ? response : overrides.opts;
    const context = {
        ...observations, ticker: 'TEST', price: 100, currentPrice: 100,
        metrics: new Map([['TEST', normalized]]), canonicalOptions: normalized,
        analysis: { ...response, ...normalized }, gd: response, dynAny: { squeeze: response },
        opts, structureRes: response, structureResult: response, flowData: response,
        data: response, evidence: { options: response },
        computeIVSkew: engine.computeIVSkew, pickAlphaLevels: detailLevels,
        alphaLevels: detailLevels(response, response, 100), ivSkew: null,
        directCallWall: 0, directPutFloor: 0, ...overrides,
    };
    let prelude = [];
    if (route === 'detail') prelude = detailPrelude;
    if (route === 'watchlist' && index === 1) prelude = [`dynamoAnalysis = ({${dynamoFields.join(',')}})`];
    if (route === 'watchlist' && index === 2) prelude = watchPrelude;
    if (route === 'portfolio' && index === 1) prelude = portfolioPrelude;
    if (route === 'report') prelude = [reportGexDeclaration];
    const definitions = prelude.map(d => `const ${d};`).join('\n');
    const walls = route === 'watchlist' && index === 2 ? watchWallLoop : '';
    const code = `(() => { ${definitions}\n${walls}\nreturn ${inputs[route][index]}; })()`;
    return mappedInput(code, null, null, context);
}
function sourceResponse(status, value = 0) {
    return {
        options_status: status, status, complete: status === 'OK',
        pcr: value, putCallRatio: value, pcRatio: value, gex: value, netGex: value,
        gems: { gex: value, gammaFlipLevel: 0 },
        squeezeScore: value, riskScore: value, callWall: 0, putFloor: 0,
        gammaFlipLevel: 0, ivSkew: null, _ivSkew: null,
        levels: { callWall: 0, putFloor: 0 }, rawChain: [], rawContracts: [], _rawChain: [],
    };
}
const assertMissing = mapped => {
    const result = engine.calculateAlphaScore({ ...base, ...mapped });
    assert.deepEqual(plain(result.pillars.structure), plain(engine.calculateAlphaScore(base).pillars.structure));
    assert.equal(result.pillars.structure.score, 8);
    assert.equal(result.score, 41);
    assert.ok(result.pillars.structure.factors.every(f => !/PCR|GEX/.test(f.detail)));
};
for (const [route, index] of routes) {
    test(`${route}[${index}]: production pre-mapping rejects failed zero for every source status`, () => {
        for (const status of ['PENDING', 'FAILED', 'NO_OPTIONS', 'NO_MARKET']) {
            const mapped = productionInput(route, index, sourceResponse(status));
            assert.equal(mapped.pcr, null, `${status}:pcr`);
            assert.equal(mapped.gex, null, `${status}:gex`);
            assertMissing(mapped);
        }
    });
    test(`${route}[${index}]: successful measured zero survives the same production pre-mapping`, () => {
        const source = sourceResponse('OK');
        // A zero all-expiry PCR requires observed call/put quantities, not a default row.pcr=0.
        source.totalCallOI = 100; source.totalPutOI = 0;
        const mapped = productionInput(route, index, source);
        assert.equal(mapped.pcr, 0);
        assert.equal(mapped.gex, 0);
        const result = engine.calculateAlphaScore({ ...base, ...mapped });
        assert.ok(result.pillars.structure.factors.every(f => f.name !== 'optionsData'));
    });
    test(`${route}[${index}]: failure cannot smuggle a stale chain or positive level into structure`, () => {
        const failed = { ...sourceResponse('FAILED'), callWall: 110, putFloor: 90,
            gammaFlipLevel: 100, ivSkew: 1.2, _ivSkew: 1.2,
            levels: { callWall: 110, putFloor: 90 },
            rawChain: [{ open_interest: 100 }], rawContracts: [{ open_interest: 100 }],
            _rawChain: [{ open_interest: 100 }] };
        assertMissing(productionInput(route, index, failed));
    });
}
test('all error fallbacks carry no fabricated options data', () => {
    assertMissing(productionInput('watchlist', 3, sourceResponse('FAILED')));
    assertMissing(productionInput('portfolio', 2, sourceResponse('FAILED')));
});
test('null is authoritative; only undefined permits the compatibility alias', () => {
    for (const status of ['OK', 'READY']) {
        const source = { status, pcr: null, putCallRatio: 0.6, gex: 0 };
        assert.equal(observations.optionNumber(source, 'pcr', 'putCallRatio'), null);
        delete source.pcr;
        assert.equal(observations.optionNumber(source, 'pcr', 'putCallRatio'), 0.6);
        assert.equal(observations.optionNumber(source, 'gex'), 0);
        for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
            assert.equal(observations.optionNumber({ status, gex: value }, 'gex'), null);
        }
    }
    assert.equal(observations.optionNumber({ status: 'PENDING', pcr: 0 }, 'pcr'), null);
    assert.equal(observations.optionNumber({ status: 'PENDING', pcr: 0, optionObservations: { pcr: true } }, 'pcr'), 0);
});
test('partial failure never vetoes an independent successful source (including zero)', () => {
    const failed = sourceResponse('FAILED');
    for (const value of [0, 0.6]) {
        const good = { ...sourceResponse('OK', value), totalCallOI: 100, totalPutOI: value * 100 };
        const metrics = canonical.optionMetrics(good, { ...good, timestamp: Date.now() });
        // Independent good canonical measurements alongside a failed analysis source.
        for (const route of ['watchlist', 'portfolio']) {
            const mapped = productionInput(route, 0, failed, { metrics: new Map([['TEST', metrics]]) });
            assert.equal(mapped.pcr, value); assert.equal(mapped.gex, value);
        }
        const portfolio = productionInput('portfolio', 1, failed, { opts: good });
        assert.equal(portfolio.pcr, value); assert.equal(portfolio.gex, value);
        const report = productionInput('report', 0, failed, { evidence: { options: failed, flow: { complete: true, gammaExposure: value } } });
        assert.equal(report.pcr, null); assert.equal(report.gex, value);
    }
});
const terminalFile = 'src/services/terminalEnricher.ts';
const terminalContext = { wallRangePct: load('src/lib/impliedMove.ts').wallRangePct };
const buildOptions = productionFunction(terminalFile, 'buildOptionsEvidence', terminalContext);
const incompleteItem = productionFunction(terminalFile, 'createIncompleteItem');
test('report: actual missing/failed terminal producers carry null through the report and real engine', () => {
    const pending = buildOptions(null, 100);
    const failed = incompleteItem('TEST', {}).evidence.options;
    for (const options of [pending, failed, buildOptions(sourceResponse('FAILED'), 100), buildOptions(sourceResponse('NO_OPTIONS'), 100)]) {
        assert.equal(options.pcr, null); assert.equal(options.gex, null);
        assertMissing(productionInput('report', 0, options));
    }
});
test('report: actual fetchOptionsChain keeps failed fields absent and successful zero measured', async () => {
    for (const status of ['FAILED', 'NO_OPTIONS', 'OK']) {
        const cacheWrites = [];
        const fetchOptions = productionFunction(terminalFile, 'fetchOptionsChain', {
            getOptionsFromCache: async () => null,
            getOptionsData: async () => sourceResponse(status),
            setOptionsToCache: async (...args) => { cacheWrites.push(args); },
            console: { log() {}, warn() {} },
        });
        const fetched = await fetchOptions('TEST', 100);
        assert.equal(cacheWrites.length, 1, 'only an in-memory mock write');
        const measured = status === 'OK' ? 0 : null;
        assert.equal(fetched.pcr, measured); assert.equal(fetched.gex, measured);
        const evidence = buildOptions(fetched, 100);
        assert.equal(evidence.pcr, measured); assert.equal(evidence.gex, measured);
        if (status !== 'OK') assertMissing(productionInput('report', 0, evidence));
    }
});
test('gate reproduction: old terminal PENDING zero was structure 5; current report maps it to missing 8', () => {
    const { execFileSync } = require('node:child_process');
    const oldSource = execFileSync('git', ['show', `ad608fb97da8002c0050cdb4440ed77708136658:${terminalFile}`], { cwd: root, encoding: 'utf8' });
    const oldBuild = productionFunction(terminalFile, 'buildOptionsEvidence', terminalContext, oldSource);
    const options = oldBuild(null, 100);
    assert.equal(options.pcr, 0); assert.equal(options.gex, 0); assert.equal(options.status, 'PENDING');
    const oldResult = engine.calculateAlphaScore({ ...base, pcr: options.pcr, gex: options.gex });
    assert.equal(oldResult.pillars.structure.score, 5);
    assert.equal(oldResult.score, 41);
    assertMissing(productionInput('report', 0, options));
});
test('source inventory includes all production direct callers and quick/batch wrappers', () => {
    const callers = [];
    function walk(directory) {
        for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
            const file = path.posix.join(directory, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (/\.tsx?$/.test(file) && /\bcalculateAlphaScore\s*\(/.test(read(file))) {
                const tree = ast(file);
                function visit(node) {
                    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'calculateAlphaScore') callers.push(file);
                    ts.forEachChild(node, visit);
                }
                visit(tree);
            }
        }
    }
    walk('src');
    const expected = [...Object.values(files).flatMap(file => alphaInputs(file).map(() => file)),
        'src/services/alphaEngine.ts', 'src/services/alphaEngine.ts'];
    assert.deepEqual(callers.sort(), expected.sort());
    assert.equal(inputs.watchlist.length, 4); assert.equal(inputs.portfolio.length, 3);
});

for (const price of [100, 0]) {
    test(`partial producer with price ${price}: observed PCR zero survives PENDING with field evidence`, async () => {
        const { response } = await structureResponse({ missingOi: 2, putOi: 0, price });
        assert.equal(response.options_status, 'PENDING');
        assert.equal(response.pcr, 0);
        assert.equal(response.optionObservations.pcr, true);
        const mapped = productionInput('dashboard', 0, response);
        assert.equal(mapped.pcr, 0);
        assert.equal(mapped.gex, null);
        const expected = engine.calculateAlphaScore({ ...base, pcr: 0 });
        assert.deepEqual(plain(engine.calculateAlphaScore({ ...base, ...mapped }).pillars.structure), plain(expected.pillars.structure));
    });
}
test('failed OI row never claims measured quantities that would block the detail fallback', () => {
    const now = Date.parse('2026-10-19T15:00:00Z');
    const failed = { status: 'FAILED', pcr: 0, timestamp: now, totalCallOI: 100, totalPutOI: 0 };
    const out = canonical.optionMetrics(sourceResponse('FAILED'), failed, now);
    assert.equal(out.pcr, null);
    assert.equal(canonical.optionMetricsRowHasOi(out), false);
});
