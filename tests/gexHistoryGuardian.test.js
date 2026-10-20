/** 관문 회귀: 실제 guardian 생산자 → 메모리 DynamoDB → 두 이력 API·Command 통계. 외부 I/O 없음. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const NOW = Date.parse('2026-10-20T20:30:00Z');
let now = NOW;
class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
}
const rows = [];
const queries = [];
let backfill = [];
const modules = new Map();
const quiet = { log() {}, warn() {}, error() {} };
const queryItems = async (table, _key, values, options) => {
    queries.push({ table, values, options });
    if (table === 'signum-flow-history') return [];
    assert.equal(table, 'signum-gex-history');
    return rows.filter(p => p.ticker === (values[':t'] ?? values[':tk'])
        && (values[':since'] === undefined || p.timestamp > values[':since']))
        .sort((a, b) => options.scanForward ? a.timestamp - b.timestamp : b.timestamp - a.timestamp)
        .slice(0, options.maxItems ?? options.limit);
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
const context = (relative = '') => ({
    console: quiet, Date: Clock, process: { env: {} }, URL, AbortController,
    setTimeout: (...args) => { const timer = setTimeout(...args); timer.unref(); return timer; }, clearTimeout,
    fetch: async url => {
        assert.match(url, /\/get\?key=intrinio%3Agex%3Abf%3A(SPY|QQQ|SPX)$/);
        return { ok: true, json: async () => ({ result: { points: backfill } }) };
    },
    require: id => {
        if (id === 'next/server') return { NextResponse: { json: value => value } };
        if (id.startsWith('@aws-sdk/')) return sdk;
        if (id === './dynamoClient') return { queryItems, TABLES: tables };
        if (id === '@/services/redisClient') return { getFromCache: async () => null, setInCache: async () => {} };
        if (id.startsWith('@/')) return load('src/' + id.slice(2) + '.ts');
        if (id.startsWith('.')) return load(path.relative(root, path.resolve(root, path.dirname(relative), id + '.ts')));
        throw new Error('허용하지 않은 의존성: ' + id);
    },
});
const tables = { GEX_HISTORY: 'signum-gex-history', FLOW_HISTORY: 'signum-flow-history' };
function load(relative) {
    if (modules.has(relative)) return modules.get(relative);
    const exports = {};
    modules.set(relative, exports);
    vm.runInNewContext(compile(fs.readFileSync(path.join(root, relative), 'utf8')),
        { ...context(relative), exports }, { filename: relative });
    return exports;
}
const store = load('src/lib/aws/historyStore.ts');
const { mergeGexHistory, etCloseMs } = load('src/lib/gexBackfillMerge.ts');
const api = load('src/app/api/history/route.ts');
const awsApi = load('src/app/api/aws/history/route.ts');
const intelApi = load('src/app/api/intel/gex-history/route.ts');
const provider = load('src/lib/aws/dynamoDataProvider.ts');
const basis = load('src/lib/app/intelOptionsBasis.ts');
const ivApi = load('src/app/api/flow/iv-percentile/route.ts');
const enhancedApi = load('src/app/api/flow/enhanced-metrics/route.ts');
const rankingFile = 'src/app/api/ranking/route.ts';
const rankingTree = ts.createSourceFile(rankingFile, fs.readFileSync(path.join(root, rankingFile), 'utf8'), ts.ScriptTarget.Latest, true);
const histNode = rankingTree.statements.find(n => ts.isVariableStatement(n)
    && n.declarationList.declarations.some(d => d.name.getText(rankingTree) === 'hist'));
assert.ok(histNode);
const rankingHistory = vm.runInNewContext(compile(histNode.getText(rankingTree) + '\nhist;'), {
    ...context(), queryItems, TABLES: tables, isGuardianSnapshotRow: basis.isGuardianSnapshotRow,
});
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

    await test('2차 관문 재현: 실제 생산자 SPX 지수 8·9 → Intel 이력 API의 이전값·차이·레짐·PCR에 미사용', async () => {
        now += 1000;
        await writer.exports.writeSnapshot({ rlsi: { score: 50 }, gammaShield: {
            gexIndex: 9, currentPrice: 7655, resistanceWall: 7900, supportWall: 7450,
        } });
        const result = await intelApi.GET({ url: 'http://localhost/api/intel/gex-history?tickers=SPX&regimes=LONG' });
        const ctx = result.SPX;
        assert.equal(rows.length, 2);
        assert.equal(ctx.prevGex, null); assert.equal(ctx.gexDelta, null);
        assert.equal(ctx.prevRegime, null); assert.equal(ctx.regimeChanged, false); assert.equal(ctx.pcrTrend, null);
        assert.equal(await provider.getLatestGex('SPX'), null);
        assert.equal((await provider.getGexHistory('SPX', 10)).length, 0);
        assert.equal((await rankingHistory(tables.GEX_HISTORY, 'SPX', 30)).length, 0);
        now = NOW;
    });

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
        const ctx = (await intelApi.GET({ url: `http://localhost/api/intel/gex-history?tickers=${ticker}&regimes=LONG` }))[ticker];
        assert.equal(ctx.prevGex, -300_000_000); assert.equal(ctx.gexDelta, 300_000_000);
        assert.equal((await provider.getLatestGex(ticker)).gex, 0);
        assert.deepEqual(Array.from(await provider.getGexHistory(ticker, 10), p => p.gex), [0, -300_000_000]);
        assert.deepEqual(Array.from(await rankingHistory(tables.GEX_HISTORY, ticker, 30), p => p.gex), [-300_000_000, 0]);
    });
    await test('단위만 남은 행·출처만 남은 행·레거시 행 모두 제외하되 정상 SPX 달러 GEX는 보존', async () => {
        rows.splice(0, rows.length,
            { ...collector('SPX'), gex: 8, source: 'ec2-guardian' },
            { ...collector('SPX'), gex: 9, source: 'live', gexBasis: 'normalized_index' },
            legacy('SPX'), collector('SPX'));
        assert.equal((await provider.getLatestGex('SPX')).gex, -300_000_000);
        for (const history of [await provider.getGexHistory('SPX', 10), await store.getGexHistory('SPX', 30),
            await rankingHistory(tables.GEX_HISTORY, 'SPX', 30), mergeGexHistory('SPX', rows, [], 0).data]) {
            assert.deepEqual(Array.from(history, p => p.gex), [-300_000_000]);
        }
        const flow = await rankingHistory(tables.FLOW_HISTORY, 'SPX', 30);
        assert.equal(flow.length, 0);
    });
    await test('이전 거래일·PCR 추세는 정상 수집 행만으로 계산', async () => {
        rows.splice(0, rows.length, written,
            { ...collector('SPX'), gex: 0, timestamp: NOW - 1000, gammaRegime: 'LONG', pcr: 1.3 },
            { ...collector('SPX'), gex: -100, timestamp: NOW - 60_000, gammaRegime: 'LONG', pcr: 1.2 },
            { ...collector('SPX'), gex: -200, timestamp: NOW - 86400_000, gammaRegime: 'SHORT', pcr: 1.1 });
        const ctx = (await intelApi.GET({ url: 'http://localhost/api/intel/gex-history?tickers=SPX&regimes=LONG' })).SPX;
        assert.equal(ctx.prevGex, -100); assert.equal(ctx.gexDelta, 100);
        assert.equal(ctx.prevRegime, 'SHORT'); assert.equal(ctx.regimeChanged, true); assert.equal(ctx.pcrTrend, 'falling');
    });
    await test('IV 창: guardian 제외 후 200개 미만이어도 기존 600행 상한으로 한 번 확장', async () => {
        const end = Date.parse('2026-10-20T20:00:00Z');
        rows.splice(0, rows.length);
        for (let i = 0; i < 200; i++) {
            const timestamp = end - i * 30 * 60_000;
            rows.push({ ...collector('SPY'), timestamp, atmIv: 16, iv30: 14 + (i % 17) / 10,
                iv30Def: 'cm30-v1' }, { ...written, ticker: 'SPY', timestamp: timestamp + 1000 });
        }
        const before = queries.length;
        const result = await ivApi.GET({ url: 'http://localhost/api/flow/iv-percentile?t=SPY' });
        assert.equal(result._source, 'dynamodb-true-percentile'); assert.equal(result.window, 200);
        assert.deepEqual(queries.slice(before).map(q => q.options.limit), [200, 600]);
        // 앞 200행이 전부 guardian이어도 뒤에 있는 정상 옵션 표본을 가리지 않는다.
        rows.splice(0, rows.length, ...rows.filter(p => !basis.isGuardianSnapshotRow(p)));
        for (let i = 0; i < 200; i++) rows.push({ ...written, ticker: 'SPY', timestamp: NOW - i * 1000 });
        const beforeEmpty = queries.length;
        const recovered = await ivApi.GET({ url: 'http://localhost/api/flow/iv-percentile?t=SPY' });
        assert.equal(recovered._source, 'dynamodb-true-percentile');
        assert.equal(recovered.percentile, result.percentile);
        assert.deepEqual(queries.slice(beforeEmpty).map(q => q.options.limit), [200, 600]);
        rows.splice(0, rows.length, written);
        const noOptions = await enhancedApi.GET({ url: 'http://localhost/api/flow/enhanced-metrics?t=SPX' });
        assert.equal(noOptions.uoa.zScore, null); assert.equal(noOptions.uoa.currentOI, null);
    });
    await test('조회 경계 감사: 운영 소스의 GEX 테이블 접근은 검증한 세 경계와 테이블 선언뿐', () => {
        const found = [];
        const walk = dir => {
            for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
                const relative = dir + '/' + entry.name;
                if (entry.isDirectory()) { walk(relative); continue; }
                if (!/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
                const text = fs.readFileSync(path.join(root, relative), 'utf8');
                if (!/signum-gex-history|GEX_HISTORY/.test(text)) continue;
                const tree = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true);
                let readsTable = false;
                const visit = node => {
                    if ((ts.isStringLiteralLike(node) && node.text === tables.GEX_HISTORY)
                        || (ts.isPropertyAccessExpression(node) && node.name.text === 'GEX_HISTORY')) readsTable = true;
                    ts.forEachChild(node, visit);
                };
                visit(tree);
                if (readsTable) found.push(relative);
            }
        };
        walk('src');
        assert.deepEqual(found.sort(), ['src/app/api/ranking/route.ts', 'src/lib/aws/dynamoClient.ts',
            'src/lib/aws/dynamoDataProvider.ts', 'src/lib/aws/historyStore.ts'].sort(),
        '새 직접 조회는 필터·소비 경로 회귀시험과 함께 경계 목록을 검토해야 한다');
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
