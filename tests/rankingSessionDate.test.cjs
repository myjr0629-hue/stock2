// 실행: node --test tests/rankingSessionDate.test.cjs — 모든 I/O는 메모리 대역.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { optionHistoryDate } = require('../harvest_lambda/option-history-date');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
let now = Date.parse('2026-10-22T09:00:00Z'); // 05:00 ET — 원천은 전날 EOD
class Clock extends Date {
    constructor(...args) { if (args.length) super(...args); else super(now); }
    static now() { return now; }
}
function compile(source, imports = {}, globals = {}) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
    } }).outputText, { exports, Date: Clock, console, URL, URLSearchParams, AbortSignal, ...globals, require: name => {
        if (name in imports) return imports[name];
        throw new Error(`Unmocked import: ${name}`);
    } });
    return exports;
}
function fnSource(file, name) {
    const source = read(file);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    let fn;
    const visit = n => {
        if (ts.isFunctionDeclaration(n) && n.name?.text === name) fn = n;
        else ts.forEachChild(n, visit);
    };
    visit(ast);
    assert.ok(fn, name);
    return fn.getText(ast);
}
const calendar = compile(read('src/lib/marketCalendar.ts'));
const ivSkew = compile(read('src/lib/ivSkew.ts'));
const engine = compile(read('src/lib/rankings/engine.ts'), { '@/lib/marketCalendar': calendar });
const keys = compile(read('src/lib/rankings/cacheKey.ts'));
const row = (chainDate, timestamp = now, extra = {}) => ({
    timestamp, chainDate, optionBasis: 'eod', totalCallOI: 50000, totalPutOI: 50000,
    pcr: 23, totalPremium: 230, callPremium: 200, putPremium: 30, ...extra,
});
const baselineDates = ['2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20'];
const history = () => [
    ...baselineDates.map((d, i) => {
        const pcr = [90, 100, 110, 95, 105, 90, 100, 110][i];
        return row(d, Date.parse(`${d}T21:00:00Z`), { pcr, totalPremium: pcr * 10 });
    }),
    row('2026-10-21'),
];

test('어댑터 prices.date → EOD 계약 → 이력: 수집일과 원천 세션이 다르다', async () => {
    const adapter = compile(`${fnSource('harvest_lambda/intrinio-adapter.js', 'getOptionChain')}\nexports.getOptionChain = getOptionChain;`, {}, {
        num: x => x ?? null, greekNumber: x => x ?? null, dateToMs: Date.parse,
        callIntrinio: async () => ({ chain: [{ option: { code: 'fixture', type: 'call', strike: 100, expiration: '2026-10-23' },
            prices: { date: '2026-10-21', volume: 10, close: 2, open_interest: 300 } }] }),
    });
    const data = await adapter.getOptionChain('TEST', { expiration: '2026-10-23', underlyingPrice: 100 });
    assert.equal(data.results[0].eodDate, '2026-10-21');
    assert.deepEqual(optionHistoryDate(data.results), { chainDate: '2026-10-21', optionBasis: 'eod' });
    assert.equal(data.results[0].day.volume, 10);
    assert.equal(data.results[0].day.close, 2);
});

test('합계 원천이 혼합·결측·잘못된 날짜이면 수집일을 원천으로 만들지 않는다', () => {
    for (const contracts of [[], [{}], [{ eodDate: '2026-02-30' }], [{ eodDate: '2026-10-21' }, {}],
        [{ eodDate: '2026-10-20' }, { eodDate: '2026-10-21' }]]) {
        assert.equal(optionHistoryDate(contracts).chainDate, null);
    }
    assert.equal(engine.optionSessionDate(row(null)), null);
    assert.equal(engine.optionSessionDate(row('2026-02-30')), null);
});

test('장 전·장중·주말·휴장 재수집은 원천 날짜 하나로 묶는다', () => {
    for (const timestamps of [
        ['2026-10-22T09:00:00Z', '2026-10-22T15:00:00Z'],
        ['2026-10-23T21:00:00Z', '2026-10-24T12:00:00Z', '2026-10-25T12:00:00Z', '2026-10-26T09:00:00Z'],
        ['2026-09-04T21:00:00Z', '2026-09-07T16:00:00Z'],
    ]) {
        const session = timestamps[0].slice(0, 10) === '2026-10-22' ? '2026-10-21' : timestamps[0].slice(0, 10);
        const snaps = engine.dailySnapshots(timestamps.map(t => row(session, Date.parse(t))));
        assert.equal(snaps.length, 1);
        assert.equal(snaps[0]._d, session);
    }
});

test('OI 최대 대표값 유지, OI 동률이면 같은 세션의 나중 판본으로 교체한다', () => {
    const inputs = [row('2026-10-21', now - 3000, { pcr: 1 }), row('2026-10-21', now - 2000, { pcr: 2 }),
        row('2026-10-21', now, { totalCallOI: 1, totalPutOI: 1, pcr: 9 })];
    assert.equal(engine.dailySnapshots(inputs)[0].pcr, 2);
    assert.equal(engine.dailySnapshots([...inputs].reverse())[0].pcr, 2);
});

const structureRow = (date = '2026-10-21', timestamp = now + 1000) => ({
    timestamp, chainDate: date, optionBasis: 'eod', _source: 'structure-build',
    totalCallOI: 50000, totalPutOI: 50000, pcr: 1,
});

test('회귀: 같은 세션·OI의 구조 행이 FlowWarm 옵션 자금 0.23을 지우지 않는다', () => {
    const flow = row('2026-10-21', now, { _source: 'flow-warm' });
    const rows = [...history().slice(0, -1), flow, structureRow()];
    for (const input of [rows, [...rows].reverse()]) {
        const snaps = engine.dailySnapshots(input);
        assert.equal(snaps.at(-1)._source, 'flow-warm');
        assert.equal(snaps.at(-1).pcr, flow.pcr, '여러 행의 지표를 합치지 않는다');
        assert.equal(engine.deviationOf(snaps, 'totalPremium').ok?.ratio, .23);
    }
});

test('회귀: 동률의 프리미엄 결측은 유효 측정을 덮지 않으며 0도 측정이다', () => {
    for (const missing of [undefined, null, '', ' ', false, Infinity, NaN]) {
        for (const premium of [0, 230, '230']) {
            const flow = row('2026-10-21', now, { totalPremium: premium });
            const incomplete = { ...structureRow(), totalPremium: missing };
            for (const input of [[flow, incomplete], [incomplete, flow]]) {
                assert.equal(engine.dailySnapshots(input)[0].totalPremium, premium);
            }
        }
    }
});

test('회귀: OI 최대·같은 품질의 최신 행·최신 세션 결측 게이트는 유지한다', () => {
    const flow = row('2026-10-21');
    const larger = { ...structureRow(), totalCallOI: 60000 };
    assert.equal(engine.dailySnapshots([flow, larger])[0]._source, 'structure-build');
    const corrected = { ...flow, timestamp: now + 2000, totalPremium: 460 };
    assert.equal(engine.dailySnapshots([corrected, flow])[0].totalPremium, 460);
    const snaps = engine.dailySnapshots([...history(), structureRow('2026-10-22')]);
    assert.equal(engine.deviationOf(snaps, 'totalPremium').ok, null, '과거 세션으로 오늘을 대체하지 않는다');
});

test('같은 수집일에 다른 두 세션을 받은 경우 두 원천 세션을 보존한다', () => {
    assert.deepEqual(plain(engine.dailySnapshots([row('2026-10-20'), row('2026-10-21')]).map(x => x._d)),
        ['2026-10-20', '2026-10-21']);
});

test('deviation 숫자·중앙값·비율·z는 그대로이고 date만 원천 세션이다', () => {
    const snaps = engine.dailySnapshots(history());
    const result = engine.deviationOf(snaps, 'pcr').ok;
    assert.ok(result);
    assert.equal(result.today, 23);
    assert.equal(result.baseline, 100);
    assert.equal(result.ratio, .23);
    assert.equal(result.sessions, 8);
    assert.equal(result.z, (23 - 100) / (1.4826 * 7.5));
    assert.equal(result.date, '2026-10-21');
});

test('레거시 기준선 유지, 새 원천 세션 이후의 날짜 없는 행이 날짜를 앞당기지 않는다', () => {
    const legacy = { timestamp: Date.parse('2026-10-20T20:00:00Z'), totalCallOI: 50000, pcr: 100 };
    assert.equal(engine.dailySnapshots([legacy])[0]._d, '2026-10-20');
    const snaps = engine.dailySnapshots([legacy, { ...legacy, timestamp: now }, row('2026-10-21')]);
    assert.deepEqual(plain(snaps.map(x => x._d)), ['2026-10-20', '2026-10-21']);
});

test('latestWith: 더 늦게 수집한 옛 체인보다 최신 원천 세션, 한 행의 지표를 유지', () => {
    const inputs = [row('2026-10-21', now - 1000), row('2026-10-20', now),
        row('2026-10-22', now + 1000, { putPremium: null })];
    const s = engine.latestWith(inputs, ['callPremium', 'putPremium', 'totalCallOI', 'totalPutOI']);
    assert.equal(s._d, '2026-10-21');
    assert.equal(s.timestamp, now - 1000);
    assert.equal(s.callPremium, 200);
    assert.equal(s.putPremium, 30);
});

test('겨울 ET 자정 경계와 원천 EOD 날짜는 UTC 날짜에서 하루 차감하지 않는다', () => {
    assert.equal(engine.etDay(Date.parse('2026-12-02T04:30:00Z')), '2026-12-01');
    assert.equal(engine.optionSessionDate(row('2026-12-01', Date.parse('2026-12-02T14:00:00Z'))), '2026-12-01');
});

test('GEX 준비도·IV 세션 시계열은 optionSession과 같은 원천 날짜를 사용한다', () => {
    const rows = history().map((r, i) => ({ ...r, atmIv: 20 + i }));
    rows.push({ ...rows.at(-1), timestamp: now + 86400000 });
    for (const series of [engine.dailyValues(rows, 'atmIv'), engine.sessionValues(rows, 'atmIv')]) {
        assert.equal(series.length, 9);
        assert.equal(series.at(-1).d, '2026-10-21');
        assert.equal(series.at(-1).v, 28);
    }
    const ready = engine.readinessOf({ TEST: rows }, 'atmIv', 8);
    assert.equal(ready.ready, true);
    assert.equal(ready.have, 9);
    assert.equal(ready.lastDate, '2026-10-21');
});

const contracts = () => ['call', 'put'].map((type, i) => ({ eodDate: '2026-10-21',
    details: { strike_price: 100, expiration_date: '2026-10-23', contract_type: type },
    day: { volume: 10 + i, close: 2, previous_close: 1 }, open_interest: 50000,
    greeks: { gamma: .01, delta: .5 }, implied_volatility: .2,
}));

// 실제 구조 계산·저장·읽기 경로를 실행한다. 공급사·저장소는 모두 메모리 대역이다.
function structureService(input, probe = null) {
    const memory = new Map(), calls = [];
    if (probe) memory.set('polygon:snapshot:probe:TEST', probe);
    const source = read('src/services/structureService.ts');
    const ast = ts.createSourceFile('structureService.ts', source, ts.ScriptTarget.Latest, true);
    const imports = Object.fromEntries(ast.statements.filter(ts.isImportDeclaration)
        .map(n => [n.moduleSpecifier.text, {}]));
    Object.assign(imports, {
        '@/lib/quoteBasis': { regularReferencePrice: x => x.day.c },
        '@/lib/ivSkew': ivSkew,
        '@/lib/ivRank': { isFreshIvObservation: () => false },
        '@/lib/marketCalendar': calendar,
        '@/services/massiveClient': { CACHE_POLICY: {}, fetchMassive: async url => {
            calls.push(url); return { results: input };
        } },
        './extendedSessionClose': { isTradeInExtSession: () => false },
        '@/lib/tickerSymbol': { canonicalShareClass: () => null },
        '@/services/marketDaySSOT': { getETComponents: () => ({ dayOfWeek: 4, hour: 5, minute: 0 }) },
        '@/services/holidayCache': { findWeeklyExpiration: async exps => exps[0] },
        '@/services/redisClient': {
            getFromCache: async k => memory.get(k) ?? null,
            mgetFromCache: async ks => ks.map(k => memory.get(k) ?? null),
            setInCache: async (k, v) => { memory.set(k, v); return true; },
        },
        '@/lib/optionLevelGate': { STRUCTURE_PRODUCER: 'fixture', LEVEL_BANDS: { maxPain: .35 },
            levelsAt: () => ({ callWall: 100, putFloor: 100, gammaFlipLevel: 100, gammaFlipType: 'cross' }),
            conformStructure: x => x, setLevelEventSink() {},
        },
        '@/lib/app/watchlistInsights': { isTooStaleLevels: () => false },
        '@/lib/levelsSupplierDelay': { staleFields: () => ({}), chainFetchedAt: () => now },
        '@/lib/impliedMove': { atmStraddleImpliedMove: () => null, wallRangePct: () => null },
        '@/lib/sessionArchive': { isTradingDay: () => false },
    });
    const service = compile(source, imports, { console: { log() {}, warn() {}, error() {} } });
    return { service, memory, calls };
}

test('회귀: 실제 구조 계산→저장→GET에서 혼합 날짜 OI 100,000을 10/21로 지정하지 않는다', async () => {
    for (const dates of [
        ['2026-10-21', '2026-10-21'], ['2026-10-20', '2026-10-21'],
        ['2026-10-21', null], ['2026-10-21', '2026-02-30'],
    ]) {
        const input = contracts().map((c, i) => ({ ...c, eodDate: undefined,
            _intrinio: { date: dates[i] }, open_interest: i ? 40000 : 60000,
        }));
        const { service, calls, memory } = structureService(input);
        const d = await service.getStructureData('TEST', null, { price: 100, prevClose: 99 }, false, { noRefresh: true });
        assert.equal(d.options_status, 'OK');
        assert.equal(d.structure.callsOI[0], 60000);
        assert.equal(d.structure.putsOI[0], 40000);
        const expected = dates[0] === dates[1] ? dates[0] : null;
        assert.equal(d.historyChainDate, expected);
        assert.equal(memory.get('structure:v2:TEST').data.historyChainDate, expected);
        const { writes, caches } = await runStructureBuild((...args) => service.getStructureData(...args));
        assert.equal(calls.length, 2, '저장본 읽기는 공급사 호출을 추가하지 않는다');
        assert.equal(writes[0].chainDate, expected);
        assert.equal(writes[0].totalCallOI + writes[0].totalPutOI, 100000);
        assert.equal(caches[0][1].rows[0].chainDate, d.chainDate, '기존 구조 판본 날짜는 유지한다');
        assert.equal(caches[0][1].rows[0].historyChainDate, expected);
        assert.equal(engine.dailySnapshots(writes).length, expected ? 1 : 0);
    }
});

test('회귀: 검증 메타 없는 기존 구조 저장본의 max chainDate를 이력 날짜로 추정하지 않는다', async () => {
    const { writes } = await runStructureBuild(async () => ({ underlyingPrice: 100,
        chainDate: '2026-10-21', structure: { callsOI: [60000], putsOI: [40000] },
    }));
    assert.equal(writes[0].chainDate, null);
    assert.equal(writes[0].optionBasis, 'eod');
    assert.equal(engine.dailySnapshots(writes).length, 0);
});

test('회귀: 날짜 없는 프로브는 체인 메타·OI 합 일치로 이력 세션을 추정하지 않는다', async () => {
    for (const chainDate of [null, '2026-10-21']) {
        const input = contracts().map(({ eodDate, ...c }) => c);
        const { service, calls } = structureService([], {
            exactResults: input, weeklyExpiry: '2026-10-23', chainDate, _ts: now,
        });
        const d = await service.getStructureData('TEST', null, { price: 100, prevClose: 99 }, true, {
            prevChainDate: '2026-10-21', prevOiSum: 100000,
        });
        assert.equal(d.chainDate, '2026-10-21', '기존 구조 판본 추정은 유지한다');
        assert.equal(d.historyChainDate, null);
        assert.equal(d.debug.chainDateInferred, chainDate === null);
        const { writes } = await runStructureBuild((...args) => service.getStructureData(...args));
        assert.equal(writes[0].chainDate, null);
        assert.equal(calls.length, 0);
    }
});

test('회귀: 슬림 프로브도 계약별 OI 원천 날짜를 보존하고 체인 최댓값과 별도로 검증한다', async () => {
    const slim = compile(`${fnSource('scripts/lambda-flow-harvest/index.js', 'slimContract')}\nexports.run = slimContract;`).run;
    for (const mixed of [false, true]) {
        const input = contracts().map((c, i) => slim({ ...c, eodDate: mixed && i ? '2026-10-20' : c.eodDate }));
        assert.equal(input[0].eodDate, '2026-10-21');
        const { service, calls } = structureService([], {
            exactResults: input, weeklyExpiry: '2026-10-23', chainDate: '2026-10-21', _ts: now,
        });
        const d = await service.getStructureData('TEST', null, { price: 100, prevClose: 99 }, false, { noRefresh: true });
        assert.equal(d.historyChainDate, mixed ? null : '2026-10-21');
        const { writes } = await runStructureBuild((...args) => service.getStructureData(...args));
        assert.equal(writes[0].chainDate, mixed ? null : '2026-10-21');
        assert.equal(calls.length, 0, '프로브의 날짜 검증으로 공급사를 다시 부르지 않는다');
    }
});

test('회귀: 수집기 어댑터→슬림 프로브→구조 이력은 계약 날짜를 보존하며 호출 수가 같다', async () => {
    const file = 'scripts/lambda-flow-harvest/intrinio-adapter.js';
    const slim = compile(`${fnSource('scripts/lambda-flow-harvest/index.js', 'slimContract')}\nexports.run = slimContract;`).run;
    for (const mixed of [false, true]) {
        let reads = 0;
        const adapter = compile(`${fnSource(file, 'chainDateOf')}\n${fnSource(file, 'getOptionChain')}\nexports.run = getOptionChain;`, {}, {
            num: x => x ?? null, greekNumber: x => x ?? null, dateToMs: Date.parse,
            process: { env: { INTRINIO_REALTIME_GREEKS: '0' } },
            cachedChain: async () => {
                reads++;
                return { chain: ['call', 'put'].map((type, i) => ({
                    option: { code: `fixture-${type}`, strike: 100, type, expiration: '2026-10-23' },
                    prices: { date: mixed && i ? '2026-10-20' : '2026-10-21', open_interest: i ? 40000 : 60000,
                        gamma: .01, implied_volatility: .2, volume: 10, close: 2 },
                })) };
            },
            followChainPages: async (_sym, _exp, data) => data,
        });
        const result = await adapter.run('TEST', { expiration: '2026-10-23', underlyingPrice: 100 });
        assert.equal(reads, 1);
        assert.equal(result.chainDates['2026-10-23'], '2026-10-21', '기존 판본 날짜는 바꾸지 않는다');
        const input = result.results.map(slim);
        assert.deepEqual(plain(input.map(c => c.eodDate)), ['2026-10-21', mixed ? '2026-10-20' : '2026-10-21']);
        const { service, calls } = structureService([], {
            exactResults: input, weeklyExpiry: '2026-10-23', chainDate: '2026-10-21', _ts: now,
        });
        const { writes } = await runStructureBuild((...args) => service.getStructureData(...args));
        assert.equal(writes[0].chainDate, mixed ? null : '2026-10-21');
        assert.equal(writes[0].totalCallOI + writes[0].totalPutOI, 100000);
        assert.equal(calls.length, 0);
    }
});

test('GEX 수집기 실제 함수: GEX·Flow 두 이력에 원천 날짜와 기존 합계를 저장한다', async () => {
    const writes = [];
    const harvest = compile(`${fnSource('harvest_lambda/index.js', 'harvestGex')}\nexports.run = harvestGex;`, {}, {
        GEX_TICKERS: ['TEST'], getAllOptions: async () => contracts(), optionHistoryDate,
        __iv30Pending: [], __iv30: { planIv30: () => ({ iv30: null }), rowFields: () => ({}) },
        client: { send: async command => { writes.push(command); } },
        PutCommand: class { constructor(args) { Object.assign(this, args); } },
        console: { log() {} },
    });
    await harvest.run({ TEST: 100 });
    assert.equal(writes.length, 2);
    for (const w of writes) {
        assert.equal(w.Item.chainDate, '2026-10-21');
        assert.equal(w.Item.timestamp, now);
        assert.equal(w.Item.totalCallOI, 50000);
        assert.equal(w.Item.totalPutOI, 50000);
    }
    const flow = writes.find(x => x.TableName === 'signum-flow-history').Item;
    assert.equal(flow.totalPremium, (10 + 11) * 2 * 100);
});

test('FlowWarm 실제 함수: 원천 날짜를 운반하며 volume·OI 대체 계산은 유지한다', async () => {
    for (const volume of [true, false]) {
        const writes = [];
        const input = contracts().map(c => ({ ...c, day: { ...c.day, volume: volume ? c.day.volume : 0 } }));
        const warm = compile(`${fnSource('harvest_lambda/index.js', 'warmFlowCache')}\nexports.run = warmFlowCache;`, {}, {
            getRedis: () => ({}), redisGet: async () => null, redisSet: async () => true,
            UNIVERSE: ['TEST'], POLYGON_KEY: '', process: { env: {} }, optionHistoryDate,
            httpsGet: async () => ({ results: input }),
            client: { send: async command => { writes.push(command); } },
            PutCommand: class { constructor(args) { Object.assign(this, args); } },
            console: { log() {}, warn() {} },
        });
        await warm.run({ TEST: { price: 100 } });
        assert.equal(writes.length, 1);
        assert.equal(writes[0].Item.chainDate, '2026-10-21');
        assert.equal(writes[0].Item.premiumBasis, volume ? 'volume-close' : 'oi-prev-close');
        assert.equal(writes[0].Item.totalPremium, volume ? 4200 : 10000000);
    }
});

async function runStructureBuild(getStructureData) {
    const writes = [], caches = [];
    let structureError;
    const route = compile(read('src/app/api/cron/structure-build/route.ts'), {
        'next/server': { NextResponse: { json: x => x } },
        '@/services/structureService': { getStructureData: async (...args) => {
            try { return await getStructureData(...args); }
            catch (e) { structureError = e; throw e; }
        } },
        '@/services/redisClient': { getFromCache: async () => null, setInCache: async (...args) => { caches.push(args); } },
        '@/services/centralDataHub': { sanitizeMaxPain: x => x },
        '@/lib/aws/dynamoClient': { TABLES: { FLOW_HISTORY: 'flow' }, batchPutItems: async (_, items) => { writes.push(...items); return true; } },
        '@/services/marketDaySSOT': { getETComponents: () => ({ dayOfWeek: 4, hour: 5, minute: 0 }) },
        '@/../data/stock_universe_us800.json': { symbols: ['TEST'] },
    }, { fetch: async () => ({ json: async () => ({ data: { TEST: { price: 100 } } }) }) });
    const response = await route.GET({ nextUrl: new URL('http://fixture/api/cron/structure-build?shard=0') });
    if (structureError) throw structureError;
    return { response, writes, caches };
}

test('구조 생산자 GET: 검증한 원천 날짜를 Redis 행과 Dynamo 이력에 전달한다', async () => {
    const { response, writes, caches } = await runStructureBuild(async () => ({
        underlyingPrice: 100, chainDate: '2026-10-21', historyChainDate: '2026-10-21', session: 'PRE',
        pcr: 1.2, structure: { callsOI: [50000], putsOI: [60000] },
    }));
    assert.equal(response.historyWrote, 1);
    assert.equal(writes[0].timestamp, now);
    assert.equal(writes[0].chainDate, '2026-10-21');
    assert.equal(writes[0].optionBasis, 'eod');
    assert.equal(caches[0][1].rows[0].chainDate, '2026-10-21');
    assert.equal(caches[0][1].rows[0].s, 'PRE');
});

async function runSharedRanking(input, structures) {
    const registry = compile(read('src/lib/rankings/registry.ts'));
    const specs = registry.RANKINGS.filter(x => (structures ? ['maxpain-gap', 'gamma-flip'] : ['deviation', 'multi-axis', 'money-vs-oi']).includes(x.id));
    const writes = [], reads = [];
    const route = compile(read('src/app/api/ranking/route.ts'), {
        'next/server': { NextResponse: { json: x => x }, after: () => {} },
        '@/lib/aws/dynamoClient': { TABLES: { FLOW_HISTORY: 'flow', GEX_HISTORY: 'gex' }, queryItems: async () => input },
        '@/lib/app/intelOptionsBasis': { isGuardianSnapshotRow: () => false },
        '@/services/redisClient': { getFromCache: async k => { reads.push(k); return k === 'structure:part:v2:0' && structures ? { rows: structures } : null; }, setInCache: async (...args) => { writes.push(args); } },
        '@/services/darkPool': {}, '@/lib/rankings/engine': engine,
        '@/lib/rankings/registry': { RANKINGS: specs, byId: id => specs.find(x => x.id === id) },
        '@/lib/rankings/cacheKey': keys, '@/lib/rankings/sources': {}, '@/services/earningsCalendarService': {},
        '@/lib/earningsDate': {}, '@/lib/marketCalendar': calendar, '@/lib/cache/staleLock': {}, '@/services/massiveClient': {},
        '@/lib/rankings/livePrice': structures ? compile(read('src/lib/rankings/livePrice.ts')) : { STRUCT_LIVE_RULES: {}, withLivePrices: async x => x },
    });
    const out = await route.GET({ nextUrl: new URL('http://fixture/api/ranking?run=all&top=10') });
    return { out, writes, reads };
}

test('M11 GET: max pain uses (level−price)/price, keeps rank magnitude and carries chain session; flip keeps its sign', async () => {
    const structures = [
        { t: 'NVDA', px: 212.21, mp: 220, fl: 215, oi: 50000, chainDate: '2026-10-22' },
        { t: 'IBM', px: 252.11, mp: 240, fl: 250, oi: 50000, chainDate: '2026-10-22' },
        { t: 'UMC', px: 18.335, mp: 23, fl: 18, oi: 50000, chainDate: '2026-10-22' },
        { t: 'ZERO', px: 100, mp: 100, fl: 100, oi: 50000 },
        { t: 'MISSING', px: 100, mp: null, fl: null, oi: 50000 },
    ];
    const { out } = await runSharedRanking([], structures);
    const mp = out.results['maxpain-gap'].items;
    assert.equal(mp.find(x => x.ticker === 'NVDA').gapPct, 3.7);
    assert.equal(mp.find(x => x.ticker === 'IBM').gapPct, -4.8);
    assert.equal(mp.find(x => x.ticker === 'UMC').gapPct, 25.4);
    assert.deepEqual(plain(mp.map(x => x.ticker)), ['UMC', 'IBM', 'NVDA', 'ZERO']);
    assert.ok(mp.filter(x => x.ticker !== 'ZERO').every(x => x.date === '2026-10-22'));
    assert.equal(mp.find(x => x.ticker === 'ZERO').gapPct, 0);
    assert.equal(mp.find(x => x.ticker === 'ZERO').date, null);
    assert.equal(mp.some(x => x.ticker === 'MISSING'), false);
    assert.equal(out.results['gamma-flip'].items.find(x => x.ticker === 'NVDA').gapPct, -1.3);
    assert.equal(out.results['gamma-flip'].items.find(x => x.ticker === 'NVDA').date, '2026-10-22');
    assert.notEqual(keys.RANKING_CACHE_VERSION, 'v11', 'old opposite-sign cached rows cannot survive the fix');
});

test('공유 GET: deviation·multi-axis·money-vs-oi·optionSession과 새 캐시 키', async () => {
    const { out, writes, reads } = await runSharedRanking(history());
    assert.equal(out.optionSession, '2026-10-21');
    for (const id of ['deviation', 'money-vs-oi']) {
        assert.equal(out.results[id].available, true);
        assert.equal(out.results[id].items[0].date, '2026-10-21');
    }
    assert.equal(out.results.deviation.items[0].ratio, .23);
    assert.equal(out.results['multi-axis'].items[0].date, '2026-10-21');
    assert.equal(out._cache, 'miss');
    assert.ok(reads.includes(keys.rankingCacheKey('all', 30, 10)));
    assert.equal(writes[0][0], keys.rankingCacheKey('all', 30, 10));
    assert.notEqual(keys.RANKING_CACHE_VERSION, 'v10');
});

test('회귀: 공유 GET의 deviation·multi-axis는 구조 행 뒤에도 옵션 자금 측정을 보존한다', async () => {
    const rows = history();
    rows.at(-1).pcr = 40; // 종목별 한 행 선택에서 옵션 자금 이탈이 풋콜 이탈보다 크도록 한다.
    const { out } = await runSharedRanking([...rows, structureRow()]);
    assert.equal(out.optionSession, '2026-10-21');
    const fund = out.results.deviation.items.find(x => x.metric === 'totalPremium');
    assert.equal(fund?.ratio, .23);
    assert.equal(fund?.date, '2026-10-21');
    const multi = out.results['multi-axis'].items[0];
    assert.ok(multi.axes.some(x => x.metric === 'totalPremium'));
    assert.equal(out.results['money-vs-oi'].items[0].date, '2026-10-21');
});

test('공개 표시 함수: 기존 3개 언어 문구·23% 그대로, 원천 날짜의 요일만 운반', () => {
    const marketSession = compile(read('src/lib/marketSession.ts'), { './marketCalendar': calendar });
    const present = compile(read('src/lib/rankings/present.ts'), {
        '@/lib/net/publicBase': {}, '@/lib/marketSession': marketSession,
        './engine': engine,
    });
    const it = engine.deviationOf(engine.dailySnapshots(history()), 'pcr').ok;
    for (const [locale, weekday] of [['ko', '수요일'], ['en', 'Wednesday'], ['ja', '水曜日']]) {
        const line = present.describeItem(it, locale);
        assert.ok(line.includes('23%'), line);
        assert.ok(line.includes(weekday), line);
    }
});

async function runSeparateDeviation(input) {
    const writes = [];
    const route = compile(read('src/app/api/ranking/deviation/route.ts'), {
        'next/server': { NextResponse: { json: x => x } },
        '@/lib/aws/dynamoClient': { TABLES: { FLOW_HISTORY: 'flow' }, queryItems: async () => input },
        '@/services/redisClient': { getFromCache: async () => null, setInCache: async (...args) => { writes.push(args); } },
        '@/services/darkPool': {}, '@/lib/rankings/engine': engine,
        '@/../data/stock_universe_us800.json': { symbols: ['TEST'] },
    });
    const out = await route.GET({ nextUrl: new URL('http://fixture/api/ranking/deviation?build=0') });
    return { out, writes };
}

test('별도 deviation API도 같은 세션별 대표 행과 새 조각 캐시를 사용한다', async () => {
    const { out, writes } = await runSeparateDeviation(history());
    assert.equal(out.mode, 'build');
    assert.ok(out.candidates > 0);
    assert.equal(writes[0][0], 'ranking:deviation:part:v10:30:0');
    assert.ok(writes[0][1].found.every(x => x.date === '2026-10-21'));
});

test('회귀: 별도 deviation API의 옵션 자금 증가도 구조 행 뒤에 보존한다', async () => {
    const rows = history();
    rows.at(-1).totalPremium = 2300; // 별도 API의 magnitude 축은 기존 규칙대로 증가만 통과한다.
    const { writes } = await runSeparateDeviation([...rows, structureRow()]);
    const fund = writes[0][1].found.find(x => x.metric === 'totalPremium');
    assert.equal(fund?.ratio, 2.3);
    assert.equal(fund?.date, '2026-10-21');
});

test('캐시 판본을 올려도 AI 사실 입력 소비자는 공용 기본 키를 그대로 읽는다', () => {
    const service = compile(read('src/services/aiqContextService.ts'), {
        '@/services/redisClient': {}, '@/lib/ai/llmStore': {}, '@/lib/holders13f': {},
        '@/lib/marketCalendar': calendar, '@/lib/ai/aiqContext': {}, '@/lib/rankings/cacheKey': keys,
    });
    assert.equal(service.AIQ_RANK_KEY, keys.rankingCacheKey('all', 30, 5));
});
