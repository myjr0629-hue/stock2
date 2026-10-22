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
    } }).outputText, { exports, Date: Clock, console, URL, URLSearchParams, ...globals, require: name => {
        if (name in imports) return imports[name];
        throw new Error(`Unmocked import: ${name}`);
    } });
    return exports;
}
function fnSource(file, name) {
    const source = read(file);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(fn, name);
    return fn.getText(ast);
}
const calendar = compile(read('src/lib/marketCalendar.ts'));
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

test('구조 생산자 GET: chainDate를 Redis 행과 Dynamo 이력에 전달한다', async () => {
    const writes = [], caches = [];
    const route = compile(read('src/app/api/cron/structure-build/route.ts'), {
        'next/server': { NextResponse: { json: x => x } },
        '@/services/structureService': { getStructureData: async () => ({ underlyingPrice: 100, chainDate: '2026-10-21', session: 'PRE',
            pcr: 1.2, structure: { callsOI: [50000], putsOI: [60000] } }) },
        '@/services/redisClient': { getFromCache: async () => null, setInCache: async (...args) => { caches.push(args); } },
        '@/services/centralDataHub': { sanitizeMaxPain: x => x },
        '@/lib/aws/dynamoClient': { TABLES: { FLOW_HISTORY: 'flow' }, batchPutItems: async (_, items) => { writes.push(...items); return true; } },
        '@/services/marketDaySSOT': { getETComponents: () => ({ dayOfWeek: 4, hour: 5, minute: 0 }) },
        '@/../data/stock_universe_us800.json': { symbols: ['TEST'] },
    }, { fetch: async () => ({ json: async () => ({ data: { TEST: { price: 100 } } }) }) });
    const response = await route.GET({ nextUrl: new URL('http://fixture/api/cron/structure-build?shard=0') });
    assert.equal(response.historyWrote, 1);
    assert.equal(writes[0].timestamp, now);
    assert.equal(writes[0].chainDate, '2026-10-21');
    assert.equal(writes[0].optionBasis, 'eod');
    assert.equal(caches[0][1].rows[0].chainDate, '2026-10-21');
    assert.equal(caches[0][1].rows[0].s, 'PRE');
});

test('공유 GET: deviation·multi-axis·money-vs-oi·optionSession과 새 캐시 키', async () => {
    const registry = compile(read('src/lib/rankings/registry.ts'));
    const specs = registry.RANKINGS.filter(x => ['deviation', 'multi-axis', 'money-vs-oi'].includes(x.id));
    const writes = [], reads = [];
    const route = compile(read('src/app/api/ranking/route.ts'), {
        'next/server': { NextResponse: { json: x => x }, after: () => {} },
        '@/lib/aws/dynamoClient': { TABLES: { FLOW_HISTORY: 'flow', GEX_HISTORY: 'gex' }, queryItems: async () => history() },
        '@/lib/app/intelOptionsBasis': { isGuardianSnapshotRow: () => false },
        '@/services/redisClient': { getFromCache: async k => { reads.push(k); return null; }, setInCache: async (...args) => { writes.push(args); } },
        '@/services/darkPool': {}, '@/lib/rankings/engine': engine,
        '@/lib/rankings/registry': { RANKINGS: specs, byId: id => specs.find(x => x.id === id) },
        '@/lib/rankings/cacheKey': keys, '@/lib/rankings/sources': {}, '@/services/earningsCalendarService': {},
        '@/lib/earningsDate': {}, '@/lib/marketCalendar': calendar, '@/lib/cache/staleLock': {}, '@/services/massiveClient': {},
        '@/lib/rankings/livePrice': { STRUCT_LIVE_RULES: {}, withLivePrices: async x => x },
    });
    const out = await route.GET({ nextUrl: new URL('http://fixture/api/ranking?run=all&top=10') });
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

test('공개 표시 함수: 기존 3개 언어 문구·23% 그대로, 원천 날짜의 요일만 운반', () => {
    const marketSession = compile(read('src/lib/marketSession.ts'), { './marketCalendar': calendar });
    const present = compile(read('src/lib/rankings/present.ts'), {
        '@/lib/net/publicBase': {}, '@/lib/marketSession': marketSession,
    });
    const it = engine.deviationOf(engine.dailySnapshots(history()), 'pcr').ok;
    for (const [locale, weekday] of [['ko', '수요일'], ['en', 'Wednesday'], ['ja', '水曜日']]) {
        const line = present.describeItem(it, locale);
        assert.ok(line.includes('23%'), line);
        assert.ok(line.includes(weekday), line);
    }
});

test('별도 deviation API도 같은 세션별 대표 행과 새 조각 캐시를 사용한다', async () => {
    const writes = [];
    const route = compile(read('src/app/api/ranking/deviation/route.ts'), {
        'next/server': { NextResponse: { json: x => x } },
        '@/lib/aws/dynamoClient': { TABLES: { FLOW_HISTORY: 'flow' }, queryItems: async () => history() },
        '@/services/redisClient': { getFromCache: async () => null, setInCache: async (...args) => { writes.push(args); } },
        '@/services/darkPool': {}, '@/lib/rankings/engine': engine,
        '@/../data/stock_universe_us800.json': { symbols: ['TEST'] },
    });
    const out = await route.GET({ nextUrl: new URL('http://fixture/api/ranking/deviation?build=0') });
    assert.equal(out.mode, 'build');
    assert.ok(out.candidates > 0);
    assert.equal(writes[0][0], 'ranking:deviation:part:v10:30:0');
    assert.ok(writes[0][1].found.every(x => x.date === '2026-10-21'));
});

test('캐시 판본을 올려도 AI 사실 입력 소비자는 공용 기본 키를 그대로 읽는다', () => {
    const service = compile(read('src/services/aiqContextService.ts'), {
        '@/services/redisClient': {}, '@/lib/ai/llmStore': {}, '@/lib/holders13f': {},
        '@/lib/marketCalendar': calendar, '@/lib/ai/aiqContext': {}, '@/lib/rankings/cacheKey': keys,
    });
    assert.equal(service.AIQ_RANK_KEY, keys.rankingCacheKey('all', 30, 5));
});
