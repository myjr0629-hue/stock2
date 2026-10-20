/** 무네트워크 회귀 시험: 실제 생산자와 모든 최신 GEX 소비 구간을 합성 행으로 실행한다. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const NOW = Date.parse('2026-10-20T13:52:00Z');
const rows = {};
const writes = [];
const queries = [];
const quiet = { log() {}, warn() {}, error() {} };
const compile = code => ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
} }).outputText;
const noNetwork = async () => { throw new Error('외부 통신 금지'); };
const modules = new Map();
const sdk = {
    DynamoDBClient: class {},
    DynamoDBDocumentClient: { from: () => ({ send: async command => { writes.push(command.input); } }) },
    PutCommand: class { constructor(input) { this.input = input; } },
};
const dynamoClient = {
    TABLES: { GEX_HISTORY: 'signum-gex-history' },
    queryItems: async (table, _key, values, options) => {
        queries.push({ table, ticker: values[':tk'], limit: options.limit });
        return table === 'signum-gex-history' ? (rows[values[':tk']] || []).slice(0, options.limit) : [];
    },
};
function load(relative) {
    const file = path.resolve(root, relative);
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    vm.runInNewContext(compile(fs.readFileSync(file, 'utf8')), {
        exports, console: quiet, Date, process: { env: {} }, fetch: noNetwork,
        require: id => {
            if (id === './dynamoClient') return dynamoClient;
            if (id.startsWith('@aws-sdk/')) return sdk;
            if (id.startsWith('@/')) return load('src/' + id.slice(2) + '.ts');
            if (id.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), id + '.ts')));
            throw new Error('허용하지 않은 의존성: ' + id);
        },
    }, { filename: file });
    return exports;
}
const basis = load('src/lib/app/intelOptionsBasis.ts');
const db = load('src/lib/aws/dynamoDataProvider.ts');
const volatility = load('src/lib/metrics/volatilityRegime.ts');
function source(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function ast(file) { return ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true); }
function find(file, predicate) {
    const tree = ast(file), matches = [];
    const visit = node => { if (predicate(node)) matches.push(node.getText(tree)); ts.forEachChild(node, visit); };
    visit(tree);
    assert.equal(matches.length, 1, '실제 코드 구간을 하나만 선택: ' + file);
    return matches[0];
}
function fn(file, name) { return find(file, n => ts.isFunctionDeclaration(n) && n.name?.text === name); }
function segment(file, start, end) {
    const text = source(file), from = text.indexOf(start), to = text.indexOf(end, from);
    assert.ok(from >= 0 && to > from, '실제 코드 구간 존재: ' + file);
    return text.slice(from, to);
}
const timers = [];
function run(code, context = {}) {
    return vm.runInNewContext(compile(code), {
        exports: {}, console: quiet, Date, fetch: noNetwork,
        ...basis, ...volatility,
        setTimeout: (...args) => { const timer = setTimeout(...args); timer.unref(); timers.push(timer); return timer; },
        require: id => {
            if (id === '@/lib/aws/dynamoDataProvider') return db;
            if (id === '@/services/analysisCache') return { getAnalysisCacheForTickers: async () => ({}) };
            throw new Error('허용하지 않은 의존성: ' + id);
        },
        ...context,
    });
}
const commandFile = 'src/app/api/command/unified/route.ts';
const structure = run(fn(commandFile, 'getStructureFromDynamoGex') + '\ngetStructureFromDynamoGex;');
const regime = run(fn(commandFile, 'getVolatilityFromDynamoGex') + '\ngetVolatilityFromDynamoGex;');
const shield = run(fn('src/services/guardian/gammaShieldEngine.ts', 'loadStruct') + '\nloadStruct;', {
    readShared: async () => null, getStructureData: async () => { throw new Error('합성 폴백'); },
});
const intel = run('async function read(tickers) {\n' + segment('src/app/api/intel/fast/route.ts',
    'const gexFallback: Record<string, any> = {};', 'const quotes = tickers.map') + '\nreturn gexFallback; }\nread;');
const watchlist = run('async function read(results) {\n' + segment('src/services/watchlistBatchService.ts',
    'const awsFill: Record<string, any> = {};', 'const whaleFixups:') + '\nreturn awsFill; }\nread;');
const live = run('async function read(ticker) { let structureResult = {}; let flowRes = {dataSource:"NONE"};\n' +
    segment('src/app/api/live/ticker/route.ts', 'const liveOptionsEmpty =', '// Phase 2 results') +
    '\nreturn { structure: structureResult, flow: flowRes }; }\nread;');
db.getLatestFlow = async () => null;

const guardian = (ticker = 'SPY') => ({ ticker, timestamp: NOW, gex: 8, price: 7654,
    callWall: 7900, putFloor: 7450, flipLevel: null, maxPain: null, squeezeLevel: 'MEDIUM' });
const collector = (ticker, price, pcr) => ({ ticker, timestamp: NOW - 60_000, price, pcr,
    gex: -302778704, callWall: price + 20, putFloor: price - 20, flipLevel: price + 1, maxPain: price,
    totalCallOI: 1000, totalPutOI: pcr * 1000, totalContracts: 1800, gammaRegime: 'NEGATIVE',
    atmIv: 15, squeezeScore: 80 });
const collectors = { SPY: collector('SPY', 766.48, 1.67), QQQ: collector('QQQ', 650, 1.38),
    SPX: collector('SPX', 7655, 1.2) };
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('통과: ' + name); }
(async () => {
    await test('쓰기: SPX 키로만 저장하고 같은 시각 SPY 수집 행을 보존', async () => {
        const module = { exports: {} };
        vm.runInNewContext(source('scripts/ec2-guardian-dynamo.js'), {
            module, exports: module.exports, console: quiet, Date, process: { env: {} },
            require: id => { assert.ok(id.startsWith('@aws-sdk/')); return sdk; },
        });
        await module.exports.writeSnapshot({ rlsi: { score: 50 }, gammaShield: {
            gexIndex: 8, currentPrice: 7654, resistanceWall: 7900, supportWall: 7450,
        } });
        const gexWrites = writes.filter(w => w.TableName === 'signum-gex-history');
        assert.equal(gexWrites.length, 1);
        const item = gexWrites[0].Item;
        assert.equal(item.ticker, 'SPX'); assert.equal(item.source, 'ec2-guardian');
        assert.equal(item.gexBasis, 'normalized_index'); assert.equal(item.price, 7654);
        assert.equal(item.callWall, 7900); assert.equal(item.gex, 8);
        const stored = new Map([['SPY:' + item.timestamp, collectors.SPY]]);
        for (const { Item: row } of gexWrites) stored.set(row.ticker + ':' + row.timestamp, row);
        assert.equal(stored.get('SPY:' + item.timestamp), collectors.SPY);
        assert.equal(stored.get('SPX:' + item.timestamp), item);
        assert.equal(basis.isGuardianSnapshotRow(item), true);
        assert.equal(basis.isGuardianSnapshotRow({ ...item, squeezeLevel: undefined, totalCallOI: 100 }), true);
    });
    for (const [ticker, row] of Object.entries(collectors)) {
        rows[ticker] = ticker === 'QQQ' ? [row] : [
            { ...guardian(ticker), ...(ticker === 'SPX' ? { source: 'ec2-guardian' } : {}) }, row, guardian(ticker),
        ];
        await test(ticker + ': 최신·통합 스냅샷·Command 구조/변동성·Intel·관심종목·live·Guardian 값 분리', async () => {
            const before = queries.length;
            const selected = await basis.latestCollectorGexRow(db, ticker);
            assert.equal(selected, row);
            assert.equal(queries.length - before, ticker === 'QQQ' ? 1 : 2);
            assert.equal((await db.getTickerSnapshot(ticker)).gex, row);
            const s = await structure(ticker);
            assert.equal(s.underlyingPrice, row.price); assert.equal(s.levels.callWall, row.callWall);
            assert.equal(s.netGex, row.gex); assert.equal(s.pcRatio, row.pcr);
            const v = await regime(ticker);
            assert.equal(v.pcr, row.pcr);
            assert.equal(v.gammaRegime, row.gammaRegime);
            const expected = volatility.computeVolatilityRegime({ netGex: row.gex, gammaFlipLevel: row.flipLevel,
                underlyingPrice: row.price, atmIv: row.atmIv, squeezeScore: row.squeezeScore });
            assert.equal(v.regimeScore, expected.regimeScore);
            assert.equal(v.underlyingPrice, row.price); assert.equal(v.gex, row.gex);
            for (const output of [await intel([ticker]), await watchlist([{ ticker, realtime: {} }])]) {
                assert.equal(output[ticker].price, row.price); assert.equal(output[ticker].callWall, row.callWall);
                assert.equal(output[ticker].gex, row.gex); assert.equal(output[ticker].pcr, row.pcr);
            }
            const l = await live(ticker);
            assert.equal(l.structure.netGex, row.gex); assert.equal(l.flow.callWall, row.callWall);
            assert.equal(l.flow._awsAsOf, row.timestamp);
            const g = await shield(ticker);
            assert.equal(g.underlyingPrice, row.price); assert.equal(g.netGex, row.gex);
        });
    }
    await test('guardian만 있는 SPY·SPX는 수집 값으로 대체하지 않고 정상 QQQ는 유지', async () => {
        for (const ticker of ['SPY', 'SPX']) {
            rows[ticker] = [guardian(ticker)];
            assert.equal(await basis.latestCollectorGexRow(db, ticker), null);
            assert.equal((await db.getTickerSnapshot(ticker)).gex, null);
            assert.equal(await structure(ticker), null); assert.equal(await regime(ticker), null);
            assert.equal((await intel([ticker]))[ticker], undefined);
            assert.equal((await watchlist([{ ticker, realtime: {} }]))[ticker], undefined);
            assert.equal((await live(ticker)).flow._awsFallback, undefined);
            assert.equal(await shield(ticker), null);
        }
        assert.equal((await intel(['QQQ'])).QQQ.price, collectors.QQQ.price);
        // 원시 조회에서는 SPX 전용 guardian 행을 보존한다. 옵션 수집 행 선택과 용도가 다르다.
        assert.equal((await db.getLatestGex('SPX')).price, 7654);
        assert.equal(await basis.latestCollectorGexRow({ getLatestGex: async () => guardian(),
            getGexHistory: async () => { throw new Error('조회 실패'); } }, 'SPY'), null);
    });
    await test('모든 최신 소비 구간은 원시 getLatestGex 직접 호출 없이 공통 선택 함수를 사용', () => {
        for (const file of [commandFile, 'src/app/api/intel/fast/route.ts', 'src/app/api/live/ticker/route.ts',
            'src/services/watchlistBatchService.ts', 'src/services/guardian/gammaShieldEngine.ts',
            'src/services/optionMetricsService.ts', 'src/app/api/app/oi-pcr/route.ts']) {
            const visit = node => {
                if (ts.isCallExpression(node)) assert.doesNotMatch(node.expression.getText(), /\bgetLatestGex$/);
                ts.forEachChild(node, visit);
            };
            visit(ast(file));
            assert.match(source(file), /latestCollectorGexRow/);
        }
    });
    console.log(`${passed}/${passed} 통과`);
})().catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => timers.forEach(clearTimeout));
