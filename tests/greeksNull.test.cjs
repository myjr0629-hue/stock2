// 오프라인: 실제 변환 함수·라우터·전달 함수·화면 계산을 실행한다.
// 외부 통신·운영 저장소·환경 파일을 사용하지 않는다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const read = p => fs.readFileSync(p, 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
const parse = p => ts.createSourceFile(p, read(p), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declarations(p, names) {
    const ast = parse(p), found = new Map();
    for (const n of ast.statements) {
        if (ts.isFunctionDeclaration(n) && n.name) found.set(n.name.text, n.getText(ast));
        if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) {
            if (ts.isIdentifier(d.name)) found.set(d.name.text, `const ${d.getText(ast)};`);
        }
    }
    return names.map(name => { assert.ok(found.has(name), `선언 확인: ${name}`); return found.get(name); }).join('\n');
}
function execute(source, globals = {}) {
    const context = vm.createContext({ exports: {}, console, URL, URLSearchParams, ...globals });
    const js = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    vm.runInContext(js, context);
    return context;
}
const fields = ['delta', 'gamma', 'theta', 'vega', 'implied_volatility'];
const values = v => Object.fromEntries(fields.map(f => [f, v]));
const resultValues = c => fields.map(f => f === 'implied_volatility' ? c[f] : c.greeks[f]);
const expiry = '2026-11-20';
function row(code, prices = {}) {
    return { option: { code, expiration: expiry, strike: 100, type: 'call' },
        prices: { date: '2026-10-21', open_interest: 100, close: 5, ...prices } };
}
const adapters = ['scripts/lambda-shared/intrinio-adapter.js', 'scripts/lambda-harvest/intrinio-adapter.js',
    'scripts/lambda-xs/intrinio-adapter.js', 'harvest_lambda/intrinio-adapter.js',
    'scripts/lambda-flow-harvest/intrinio-adapter.js'];
function harness(adapter, rows, realtime = []) {
    const calls = [];
    const callIntrinio = async path => {
        calls.push(path);
        if (path.startsWith('options/chain/')) return { chain: rows };
        if (path.startsWith('options/greeks/')) return { contracts: realtime, _ivObservedAt: '2026-10-22T14:00:00Z' };
        if (path.startsWith('options/expirations/')) return { expirations: [expiry] };
        if (path.startsWith('securities/')) return { last_price: 100 };
        throw new Error(`예상 밖 경로: ${path}`);
    };
    if (adapter) {
        const module = { exports: {} };
        const ctx = vm.createContext({ module, exports: module.exports, console, URL, URLSearchParams,
            process: { env: {} }, setTimeout, clearTimeout, require: id => { throw new Error(`예상 밖 모듈: ${id}`); } });
        vm.runInContext(read(adapter) + '\ncallIntrinio = __fixtureCall;', Object.assign(ctx, { __fixtureCall: callIntrinio }));
        const api = module.exports;
        return { call: () => api.getOptionChain('TEST', { expiration: expiry, underlyingPrice: 100 }), calls };
    }
    const names = ['num', 'greekNumber', 'CHAIN_MAX_PAGES', 'fetchChainPagesIntrinio',
        'getRealtimeGreeksIntrinio', 'getOptionChainSnapshotIntrinio'];
    const ctx = execute(declarations('src/services/intrinioClient.ts', names), {
        callIntrinio, dateToMs: d => Date.parse(d), process: { env: {} },
    });
    return { call: () => ctx.exports.getOptionChainSnapshotIntrinio('TEST', { expiration: expiry, underlyingPrice: 100 }),
        api: ctx.exports, calls };
}
for (const adapter of [null, ...adapters]) {
    test(`${adapter || 'Vercel'}: 결측·유효하지 않은 값은 null, 원천 0·문자열 0은 0`, async () => {
        const inputs = [undefined, null, '', ' ', NaN, Infinity, false, {}, 0, '0', -0.125, '0.25'];
        const h = harness(adapter, inputs.map((v, i) => row(`TEST${i}`, values(v))));
        const result = await h.call();
        assert.equal(result.results.length, inputs.length);
        result.results.forEach((c, i) => {
            const expected = i < 8 ? null : Number(inputs[i]);
            assert.deepEqual(plain(resultValues(c)), fields.map(() => expected));
            assert.deepEqual(plain(resultValues(JSON.parse(JSON.stringify(c)))), fields.map(() => expected));
        });
    });
}
for (const adapter of [null, 'scripts/lambda-flow-harvest/intrinio-adapter.js']) {
    test(`${adapter || 'Vercel'}: 필드별 실시간 우선·결측 EOD 대체·실시간 0 보존`, async () => {
        const base = values(0.25);
        const rt = { delta: 0, gamma: null, theta: '', vega: -0.1, implied_volatility: 0 };
        const h = harness(adapter, [row('A', base), row('B', {}), row('C', base), row('D', base)], [
            { option: { code: 'A' }, greeks: rt },
            { option: { code: 'B' }, greeks: values(null) },
            { option: { code: 'C' }, greeks: { implied_volatility: ' ' } },
            { option: { code: 'D' }, greeks: values(0) },
        ]);
        const result = (await h.call()).results;
        assert.deepEqual(plain(resultValues(result[0])), [0, 0.25, 0.25, -0.1, 0]);
        assert.deepEqual(plain(resultValues(result[1])), fields.map(() => null));
        assert.equal(result[0].ivSourceDate, null);
        assert.equal(result[0].ivObservedAt, '2026-10-22T14:00:00Z');
        assert.equal(result[2].implied_volatility, 0.25);
        assert.equal(result[2].ivSourceDate, '2026-10-21');
        assert.equal(result[2].ivObservedAt, null);
        assert.deepEqual(plain(resultValues(result[3])), fields.map(() => 0));
        assert.equal(h.calls.filter(p => p.startsWith('options/chain/')).length, 1);
        assert.equal(h.calls.filter(p => p.startsWith('options/greeks/')).length, 1);
    });
}

test('실제 라우터·체인/단일 계약 래퍼·슬림 전달: null과 0 및 계약 수 유지', async () => {
    const h = harness(null, [row('A', values(null)), row('B', values(0))]);
    const router = execute(read('src/services/intrinioRouter.ts'), { process: { env: {} }, require: id => {
        if (id === './intrinioClient') return { ...h.api, hasIntrinioKey: () => true,
            getOptionChainSnapshotIntrinio: async () => h.call() };
        if (id === './fmpNewsAdapter') return { hasFmpKey: () => false };
        if (id === '@/lib/marketCalendar') return {};
        throw new Error(`예상 밖 모듈: ${id}`);
    } }).exports;
    const fetchMassive = (url, params) => router.routeToIntrinio(url, params);
    const wrappers = execute(declarations('src/services/massiveClient.ts', [
        'getOptionSnapshot', 'getOptionChainSnapshot', 'fetchOptionSnapshot',
    ]), { fetchMassive, fetchMassiveAll: fetchMassive, assertLiveApiEnabled() {}, notifyStatus() {}, MASSIVE_API_KEY: '' }).exports;
    const chain = await wrappers.getOptionChainSnapshot('TEST');
    assert.equal(chain.length, 2);
    assert.deepEqual(plain(resultValues(chain[0])), fields.map(() => null));
    assert.deepEqual(plain(resultValues(chain[1])), fields.map(() => 0));
    assert.equal((await wrappers.getOptionSnapshot('TEST')).length, 2);
    assert.equal((await wrappers.fetchOptionSnapshot('TEST', 'O:A')).greeks.theta, null);
    assert.equal((await wrappers.fetchOptionSnapshot('TEST', 'O:B')).greeks.vega, 0);
    const slim = execute(declarations('src/app/api/live/ticker/route.ts', ['slimOptionChain']) + '\nexports.slim = slimOptionChain;').exports.slim;
    for (const detail of [true, false]) {
        const output = JSON.parse(JSON.stringify(slim(chain, detail)));
        assert.equal(output.length, 2);
        assert.equal(output[0].greeks.delta, null); assert.equal(output[1].greeks.delta, 0);
        assert.equal(output[0].greeks.gamma, null); assert.equal(output[1].greeks.gamma, 0);
        if (detail) { assert.equal(output[0].implied_volatility, null); assert.equal(output[1].implied_volatility, 0); }
    }
});

const flowAst = parse('src/components/FlowRadar.tsx');
const flowCalculations = new Map();
(function visit(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && ['opi', 'dex', 'ivSkew', 'ivPercentile'].includes(n.name.text)) {
        flowCalculations.set(n.name.text, n.initializer.getText(flowAst));
    }
    ts.forEachChild(n, visit);
})(flowAst);
function flow(name, chain) {
    assert.ok(flowCalculations.has(name));
    const ctx = execute(`exports.result = ${flowCalculations.get(name)};`, {
        rawChain: chain, filteredChain: chain, currentPrice: 100, useMemo: fn => fn(), fm: key => key,
        trueIvData: { percentile: null, currentIv: null, collecting: false }, locale: 'ko',
        ivRankNotProvidedText: () => '미제공',
    });
    return plain(ctx.exports.result);
}
test('Flow OPI·DEX·ATM IV 평균·IV Skew: 결측 계약은 계산 제외, 관측된 0 전달', () => {
    const c = (strike, type, delta, iv) => ({ details: { strike_price: strike, contract_type: type },
        greeks: { delta }, implied_volatility: iv, open_interest: 1000 });
    const valid = [c(101, 'call', 0.5, 0.2), c(99, 'put', -0.4, 0.3), c(102, 'call', 0, 0)];
    const missing = [c(100, 'call', null, null), c(100, 'put', undefined, null)];
    // 델타 결측 계약은 OI에도 접근하지 않는다(관측 0으로 계산한 것이 아님).
    for (const contract of missing) Object.defineProperty(contract, 'open_interest', { get() { throw new Error('결측 델타 계약을 집계함'); } });
    for (const name of flowCalculations.keys()) assert.deepEqual(flow(name, [...valid, ...missing]), flow(name, valid), name);
    assert.equal(flow('ivPercentile', [...valid, ...missing]).atmIvLevel, 25);
    assert.equal(flow('ivSkew', [...valid, ...missing]).value, 10);
    assert.ok(Math.abs(flow('dex', valid).value - 0.01) < 1e-12);
});

test('구조 GEX 집계: gamma 결측 제외·관측 0은 커버리지에 포함', () => {
    const ast = parse('src/services/structureService.ts');
    let callback;
    (function visit(n) {
        if (ts.isCallExpression(n) && n.expression.getText(ast) === 'cleanContracts.forEach' && n.getText(ast).includes('gammaCount++')) callback = n.arguments[0].getText(ast);
        ts.forEachChild(n, visit);
    })(ast);
    assert.ok(callback);
    const ctx = execute(`let gexSum = 0, gammaCount = 0, callPremiumVol = 0, putPremiumVol = 0, premiumContracts = 0;
        cleanContracts.forEach(${callback}); exports.result = { gexSum, gammaCount };`, {
        underlyingPrice: 100, cleanContracts: [null, 0, 0.02].map(gamma => ({ greeks: { gamma }, type: 'call', oi: 100 })),
    });
    assert.deepEqual(plain(ctx.exports.result), { gexSum: -20000, gammaCount: 2 });
});
