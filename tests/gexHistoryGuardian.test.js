/** 관문 회귀: 실제 guardian 생산자 → 메모리 DynamoDB → 두 이력 API·Command 통계. 외부 I/O 없음. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const NOW = Date.parse('2026-10-20T20:30:00Z');
class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
}
const rows = [];
let backfill = [];
const modules = new Map();
const quiet = { log() {}, warn() {}, error() {} };
const queryItems = async (table, _key, values) => {
    assert.equal(table, 'signum-gex-history');
    return rows.filter(p => p.ticker === values[':t'] && p.timestamp > values[':since'])
        .sort((a, b) => a.timestamp - b.timestamp);
};
const sdk = {
    DynamoDBClient: class {},
    DynamoDBDocumentClient: { from: () => ({ send: async ({ input }) => {
        if (input.TableName === 'signum-gex-history') rows.push(input.Item);
    } }) },
    PutCommand: class { constructor(input) { this.input = input; } },
};
const compile = code => ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
} }).outputText;
const context = () => ({
    console: quiet, Date: Clock, process: { env: {} }, URL, AbortController, setTimeout, clearTimeout,
    fetch: async url => {
        assert.match(url, /\/get\?key=intrinio%3Agex%3Abf%3A(SPY|QQQ|SPX)$/);
        return { ok: true, json: async () => ({ result: { points: backfill } }) };
    },
    require: id => {
        if (id === 'next/server') return { NextResponse: { json: value => value } };
        if (id.startsWith('@aws-sdk/')) return sdk;
        if (id === './dynamoClient') return { queryItems, TABLES: { GEX_HISTORY: 'signum-gex-history' } };
        if (id.startsWith('@/')) return load('src/' + id.slice(2) + '.ts');
        throw new Error('허용하지 않은 의존성: ' + id);
    },
});
function load(relative) {
    if (modules.has(relative)) return modules.get(relative);
    const exports = {};
    modules.set(relative, exports);
    vm.runInNewContext(compile(fs.readFileSync(path.join(root, relative), 'utf8')),
        { ...context(), exports }, { filename: relative });
    return exports;
}
const store = load('src/lib/aws/historyStore.ts');
const { mergeGexHistory, etCloseMs } = load('src/lib/gexBackfillMerge.ts');
const api = load('src/app/api/history/route.ts');
const awsApi = load('src/app/api/aws/history/route.ts');
const commandFile = 'src/app/api/command/unified/route.ts';
const tree = ts.createSourceFile(commandFile, fs.readFileSync(path.join(root, commandFile), 'utf8'), ts.ScriptTarget.Latest, true);
const statsNode = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'fetchGexHistoryData');
assert.ok(statsNode);
const commandStats = vm.runInNewContext(compile(statsNode.getText(tree) + '\nfetchGexHistoryData;'), context());
const collector = ticker => ({ ticker, timestamp: NOW - 60_000, gex: -300_000_000,
    price: ticker === 'SPX' ? 7655 : ticker === 'SPY' ? 766.48 : 650,
    callWall: 790, putFloor: 745, flipLevel: 770, maxPain: 760,
    gammaRegime: 'NEGATIVE', totalContracts: 1000, totalCallOI: 600, totalPutOI: 400 });
const legacy = ticker => ({ ticker, timestamp: NOW - 120_000, gex: 8, price: 7654,
    callWall: 7900, squeezeLevel: 'MEDIUM' });
const request = (ticker, prefix = '') => ({ url: `http://localhost/api/${prefix}history?type=gex&ticker=${ticker}&days=30` });
let passed = 0, failed = 0;
async function test(name, fn) {
    try { await fn(); passed++; console.log('통과: ' + name); }
    catch (error) { failed++; console.error('실패: ' + name + '\n' + error.stack); }
}
(async () => {
    const writer = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'scripts/ec2-guardian-dynamo.js'), 'utf8'),
        { ...context(), module: writer, exports: writer.exports });
    await writer.exports.writeSnapshot({ rlsi: { score: 50 }, gammaShield: {
        gexIndex: 8, currentPrice: 7654, resistanceWall: 7900, supportWall: 7450,
    } });
    const written = rows[0];
    assert.equal(written.ticker, 'SPX'); assert.equal(written.gex, 8);

    await test('관문 재현: 생산자가 쓴 SPX 정규화 지수 8은 두 옵션 이력 API와 Command 통계에서 제외', async () => {
        for (const route of [api, awsApi]) {
            const result = await route.GET(request('SPX'));
            assert.equal(result.count, 0); assert.equal(result.data.length, 0);
            if (route === api) assert.equal(result.liveCount, 0);
        }
        assert.equal(await commandStats('SPX'), null);
        assert.equal(rows[0], written, '저장된 원시 행은 삭제하지 않는다');
    });
    for (const ticker of ['SPY', 'QQQ', 'SPX']) await test(ticker + ': guardian 혼합 이력에서 정상 옵션 GEX·0·가격·시각과 통계를 보존', async () => {
        rows.splice(0, rows.length, written, legacy(ticker), collector(ticker),
            { ...collector(ticker), timestamp: NOW - 30_000, gex: 0 });
        const history = await store.getGexHistory(ticker, 30);
        assert.deepEqual(Array.from(history, p => p.gex), [-300_000_000, 0]);
        for (const route of [api, awsApi]) {
            const result = await route.GET(request(ticker));
            assert.equal(result.count, 2);
            assert.deepEqual(Array.from(result.data, p => p.gex), [-300_000_000, 0]);
            assert.equal(result.data[0].price, collector(ticker).price);
            assert.equal(result.data[0].timestamp, NOW - 60_000);
            if (route === api) { assert.equal(result.liveCount, 2); assert.equal(result.backfilled, 0); }
        }
        const stats = await commandStats(ticker);
        assert.equal(stats.gex30dCount, 2); assert.equal(stats.gex30dHigh, -300_000_000);
    });
    await test('병합 직접 호출도 출처를 live로 덮기 전에 guardian을 제외하고 해당 날짜의 복원을 허용', () => {
        const date = '2026-10-19';
        const bf = { date, gex: -10_000_000, price: 7650, expiration: '2026-10-23', contracts: 1000, callOI: 600, putOI: 400 };
        const raw = [{ ...written, timestamp: etCloseMs(date) }, { ...legacy('SPX'), timestamp: etCloseMs(date) - 1000 }];
        const result = mergeGexHistory('SPX', raw, [bf], NOW - 30 * 86400_000);
        assert.equal(result.data.length, 1); assert.equal(result.filled, 1);
        assert.equal(result.data[0].source, 'backfill'); assert.equal(result.data[0].gex, bf.gex);
        assert.equal(raw[0].source, 'ec2-guardian', '입력 원시 행은 보존');
        const actual = collector('SPX');
        const live = mergeGexHistory('SPX', [actual, written], [{ ...bf, date: '2026-10-20' }], NOW - 30 * 86400_000);
        assert.equal(live.filled, 0); assert.equal(live.data.length, 1);
        assert.equal(live.data[0].gex, actual.gex); assert.equal(live.data[0].source, 'live');
    });
    await test('정규화 행만 있는 날짜도 정상 복원값으로 응답하며 liveCount에 포함하지 않는다', async () => {
        rows.splice(0, rows.length, written);
        backfill = [{ date: '2026-10-20', gex: -12_000_000, price: 7650, expiration: '2026-10-23', contracts: 1000 }];
        const result = await api.GET(request('SPX'));
        assert.equal(result.count, 1); assert.equal(result.liveCount, 0); assert.equal(result.backfilled, 1);
        assert.equal(result.data[0].gex, -12_000_000); assert.equal(result.data[0].source, 'backfill');
    });
    console.log(`결과: ${passed} 통과 · ${failed} 실패`);
    process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
