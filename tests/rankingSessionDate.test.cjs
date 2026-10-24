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
    timestamp, chainDate, optionBasis: 'eod', premiumBasis: 'volume-close', totalCallOI: 50000, totalPutOI: 50000,
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

// 실제 Lambda 어댑터·라우터를 실행하고 공급사만 메모리 응답으로 바꾼다.
function lambdaChainFixture({ session = '2026-10-21', premium = 20000000, failed = [], listFails = false, empty = false, malformed = false } = {}) {
    const calls = [], expirations = ['2026-10-23', '2026-10-30'];
    const adapter = compile(`${fnSource('harvest_lambda/intrinio-adapter.js', 'getOptionChain')}\n${fnSource('harvest_lambda/intrinio-adapter.js', 'routeMassiveUrl')}\nexports.run = routeMassiveUrl;`, {}, {
        INTRINIO_KEY: true, PASSTHROUGH: [], UNSUPPORTED: [],
        num: x => x ?? null, greekNumber: x => x ?? null, dateToMs: Date.parse,
        callIntrinio: async path => {
            calls.push(path);
            if (path.startsWith('options/expirations/')) {
                if (listFails) throw new Error('fixture expiration list failure');
                return { expirations };
            }
            if (path.startsWith('securities/')) return { last_price: 100 };
            const expiration = path.split('/').at(-2);
            if (failed.includes(expiration)) throw new Error('fixture expiry failure');
            if (malformed) return { chain: {} };
            assert.ok(expirations.includes(expiration));
            return { chain: empty ? [] : ['call', 'put'].map(type => ({
                option: { code: `${expiration}-${type}`, expiration, strike: 100, type },
                prices: { date: session, open_interest: 25000, close: 2, volume: premium / 800,
                    gamma: .01, delta: .5, implied_volatility: .2 },
            })) };
        },
    });
    return { ...adapter, calls };
}

test('Lambda 어댑터·라우터: 만기 실패 수·요청 수, 전체 실패·빈 성공·목록 실패를 구분하고 재호출하지 않는다', async () => {
    for (const failed of [[], ['2026-10-23'], ['2026-10-30'], ['2026-10-23', '2026-10-30']]) {
        const fixture = lambdaChainFixture({ failed });
        const data = await fixture.run('/v3/snapshot/options/TEST?contract_type=call');
        assert.equal(data.requestedExpirations, 2);
        assert.equal(data.failedExpirations, failed.length);
        assert.equal(data.partial, failed.length > 0);
        assert.equal(data.results.length, 2 - failed.length);
        assert.equal(data.count, data.results.length);
        assert.equal(fixture.calls.length, 4, '목록 1 + 시세 1 + 만기 2, 실패 재시도 없음');
    }
    const exact = lambdaChainFixture({ failed: ['2026-10-23'] });
    const exactData = await exact.run('/v3/snapshot/options/TEST?expiration_date=2026-10-23');
    assert.equal(exactData.requestedExpirations, 1);
    assert.equal(exactData.failedExpirations, 1);
    assert.equal(exactData.partial, true);
    assert.equal(exact.calls.length, 2);
    const empty = lambdaChainFixture({ empty: true });
    assert.equal((await empty.run('/v3/snapshot/options/TEST')).partial, false);
    const malformed = lambdaChainFixture({ malformed: true });
    const malformedData = await malformed.run('/v3/snapshot/options/TEST');
    assert.equal(malformedData.failedExpirations, 2);
    assert.equal(malformedData.partial, true);
    assert.equal(malformedData.results.length, 0);
    const list = lambdaChainFixture({ listFails: true });
    const listData = await list.run('/v3/snapshot/options/TEST');
    assert.equal(listData.partial, true);
    assert.equal(listData.requestedExpirations, 0);
    assert.equal(listData.failedExpirations, 0);
    assert.equal(list.calls.length, 1);
});

test('만기 2개 중 1개 실패한 8세션: 실제 어댑터→수집→저장→기준군에서 2.3배 가짜 이탈 차단, 기존 행 규칙 유지', async () => {
    const savedNow = now, histories = [], callCounts = [];
    let fixture;
    const get = compile(`${fnSource('harvest_lambda/index.js', 'getAllOptions')}\nexports.run = getAllOptions;`, {}, {
        POLYGON_KEY: '', httpsGet: url => fixture.run(url),
    });
    const writes = [];
    const harvest = compile(`${fnSource('harvest_lambda/index.js', 'harvestGex')}\nexports.run = harvestGex;`, {}, {
        GEX_TICKERS: ['TEST'], getAllOptions: get.run, optionHistoryDate,
        __iv30Pending: [], __iv30: { planIv30: () => ({ iv30: null }), rowFields: () => ({}) },
        client: { send: async command => { writes.push(command); } },
        PutCommand: class { constructor(args) { Object.assign(this, args); } }, console: { log() {} },
    });
    try {
        for (const mode of ['complete', 'partial-past', 'partial-today']) {
            const rows = [], counts = [];
            for (const [i, session] of [...baselineDates, '2026-10-21'].entries()) {
                now = Date.parse(`${session}T21:00:00Z`);
                const partial = mode === 'partial-past' ? i < 8 : mode === 'partial-today' && i === 8;
                fixture = lambdaChainFixture({ session, premium: i < 8 ? [18, 19, 21, 22, 18, 19, 21, 22][i] * 1000000 : mode === 'partial-today' ? 92000000 : 23000000,
                    failed: partial ? ['2026-10-30'] : [] });
                writes.length = 0;
                await harvest.run({ TEST: 100 });
                counts.push(fixture.calls.length);
                assert.equal(writes.length, 2);
                assert.ok(writes.every(w => w.Item.partial === partial));
                rows.push(writes.find(w => w.TableName === 'signum-flow-history').Item);
            }
            histories.push(rows);
            callCounts.push(counts);
        }
    } finally { now = savedNow; }
    assert.deepEqual(callCounts[0], Array(9).fill(4));
    assert.deepEqual(callCounts[1], callCounts[0], '공급사 호출 증가 0');
    assert.deepEqual(callCounts[2], callCounts[0], '부분 오늘도 공급사 호출 증가 0');
    const [full, missing, partialToday] = histories;
    const before = missing.map(({ partial, ...r }) => r); // 부분 표시가 없던 저장 행
    const legacy = engine.deviationOf(engine.dailySnapshots(before), 'totalPremium').ok;
    assert.equal(legacy.baseline, 10000000);
    assert.equal(legacy.ratio, 2.3);
    assert.equal(legacy.sessions, 8);
    const fullSeries = engine.deviationSeries(engine.dailySnapshots(full), 'totalPremium');
    assert.equal(engine.median(fullSeries.slice(0, -1).map(r => r.v)), 20000000);
    assert.equal(engine.deviationOf(engine.dailySnapshots(full), 'totalPremium').ok, null);
    assert.equal(engine.deviationSeries(engine.dailySnapshots(missing), 'totalPremium').length, 1);
    assert.equal(engine.deviationOf(engine.dailySnapshots(missing), 'totalPremium').ok, null);
    const shared = await runSharedRanking(missing);
    assert.equal(shared.out.results.deviation.items.length, 0);
    const separate = await runSeparateDeviation(missing);
    assert.equal(separate.writes[0][1].found.some(r => r.metric === 'totalPremium'), false);
    assert.equal(shared.out.partial, false, '부분 과거 제외 뒤 완결 오늘 표식');
    assert.equal(separate.out.partial, false);
    const todayShared = await runSharedRanking(partialToday);
    assert.equal(todayShared.out.partial, true);
    assert.equal(todayShared.out.results.deviation.items[0].partial, true);
    const todaySeparate = await runSeparateDeviation(partialToday);
    assert.equal(todaySeparate.out.partial, true);
    assert.equal(todaySeparate.writes[0][1].found.find(r => r.metric === 'totalPremium').partial, true);
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

test('P2: 부분 원천만 있어도 PRE 레거시를 다시 선택하지 않는다 — 모든 전환 호출자', async () => {
    const source = row('2026-10-21', now - 1000, { partial: true, callPremium: 30, putPremium: 30, atmIv: 25 });
    const legacy = { timestamp: now, totalCallOI: 50000, totalPutOI: 50000,
        callPremium: 200, putPremium: 30, pcr: 9, atmIv: 99 };
    for (const input of [[legacy, source], [source, legacy]]) {
        const snaps = engine.dailySnapshots(input);
        assert.deepEqual(plain(snaps.map(r => r._d)), ['2026-10-21']);
        assert.equal(snaps[0].partial, true);
        assert.equal(engine.isCompleteOptionEod(snaps[0]), false);
        const latest = engine.latestWith(input, ['callPremium', 'putPremium', 'totalCallOI', 'totalPutOI']);
        assert.equal(latest._d, '2026-10-21');
        assert.equal(latest.callPremium / latest.putPremium, 1);
        for (const series of [engine.dailyValues(input, 'atmIv'), engine.sessionValues(input, 'atmIv')]) {
            assert.deepEqual(plain(series), [{ d: '2026-10-21', v: 25 }]);
        }
        assert.equal(engine.readinessOf({ TEST: input }, 'atmIv', 2).ready, false);
        const shared = await runSharedRanking(input);
        assert.equal(shared.out.optionSession, '2026-10-21');
        assert.equal(shared.out.results['money-vs-oi'].items.length, 0, '레거시 6.67배 후보 차단');
        assert.equal(shared.out.partial, true);
        const separate = await runSeparateDeviation(input);
        assert.equal(separate.out.partial, true);
        assert.equal(separate.writes[0][1].found.length, 0);
    }
    // 측정·날짜·시각이 없는 원천 행이 전환을 시작해서는 안 된다.
    for (const unusable of [
        { ...source, timestamp: NaN }, { ...source, chainDate: null }, { ...source, chainDate: '2026-02-30' },
    ]) {
        assert.equal(engine.dailySnapshots([legacy, unusable])[0]._d, '2026-10-22');
        assert.equal(engine.latestWith([legacy, unusable], ['callPremium', 'putPremium'])._d, '2026-10-22');
    }
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
    for (const partial of [false, true]) {
        const writes = [];
        const input = contracts();
        input.partial = partial;
        const harvest = compile(`${fnSource('harvest_lambda/index.js', 'harvestGex')}\nexports.run = harvestGex;`, {}, {
            GEX_TICKERS: ['TEST'], getAllOptions: async () => input, optionHistoryDate,
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
            assert.equal(w.Item.partial, partial);
        }
        const flow = writes.find(x => x.TableName === 'signum-flow-history').Item;
        assert.equal(flow.totalPremium, (10 + 11) * 2 * 100);
        assert.equal(flow.premiumBasis, 'volume-trade-or-close');
    }
});

test('FlowWarm 실제 함수: 원천 날짜를 운반하며 volume·OI 대체 계산은 유지한다', async () => {
    for (const partial of [false, true]) {
        for (const volume of [true, false]) {
            const writes = [];
            const input = contracts().map(c => ({ ...c, day: { ...c.day, volume: volume ? c.day.volume : 0 } }));
            const warm = compile(`${fnSource('harvest_lambda/index.js', 'warmFlowCache')}\nexports.run = warmFlowCache;`, {}, {
                getRedis: () => ({}), redisGet: async () => null, redisSet: async () => true,
                UNIVERSE: ['TEST'], POLYGON_KEY: '', process: { env: {} }, optionHistoryDate,
                httpsGet: async () => ({ results: input, ...(partial ? { next_url: 'https://fixture/next' } : {}) }),
                client: { send: async command => { writes.push(command); } },
                PutCommand: class { constructor(args) { Object.assign(this, args); } },
                console: { log() {}, warn() {} },
            });
            await warm.run({ TEST: { price: 100 } });
            assert.equal(writes.length, 1);
            assert.equal(writes[0].Item.chainDate, '2026-10-21');
            assert.equal(writes[0].Item.premiumBasis, volume ? 'volume-close' : 'oi-prev-close');
            assert.equal(writes[0].Item.totalPremium, volume ? 4200 : 10000000);
            assert.equal(writes[0].Item.partial, partial);
        }
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

test('P1 구조 8세션: 실제 생산자→구조 배치→저장→양 API에서 부분 기준군 제외·오늘 partial 보존', async () => {
    const savedNow = now, histories = [], counts = [];
    try {
        for (const missing of [false, true]) {
            const rows = [], calls = [];
            for (const [i, session] of [...baselineDates, '2026-10-21'].entries()) {
                now = Date.parse(`${session}T21:00:00Z`);
                const partial = missing && i < 8;
                const pcr = i < 8 ? [1.8, 1.9, 2.1, 2.2, 1.8, 1.9, 2.1, 2.2][i] / (partial ? 2 : 1) : 2.3;
                const input = contracts().map((c, k) => ({ ...c, eodDate: session,
                    open_interest: k ? pcr * 50000 : 50000 }));
                const fixture = structureService([], {
                    exactResults: input, weeklyExpiry: '2026-10-23', chainDate: session, _ts: now,
                    expirationsTruncated: partial ? ['2026-10-23'] : [],
                });
                const { writes, caches } = await runStructureBuild((...args) => fixture.service.getStructureData(...args));
                assert.equal(writes.length, 1);
                assert.equal(writes[0].partial, partial);
                assert.equal(caches[0][1].rows[0].partial, partial);
                assert.equal(writes[0].chainDate, session);
                assert.equal(writes[0].pcr, pcr);
                rows.push(writes[0]);
                calls.push(fixture.calls.length);
            }
            histories.push(rows);
            counts.push(calls);
        }
    } finally { now = savedNow; }
    assert.deepEqual(counts[0], Array(9).fill(0), '프로브 사용: 공급사 호출 없음');
    assert.deepEqual(counts[1], counts[0], '공급사 호출 증가 0');
    const [full, missing] = histories;
    const before = missing.map(({ partial, ...r }) => r);
    const vulnerable = engine.deviationOf(engine.dailySnapshots(before), 'pcr').ok;
    assert.equal(vulnerable.baseline, 1);
    assert.equal(vulnerable.ratio, 2.3);
    assert.equal(engine.median(engine.deviationSeries(engine.dailySnapshots(full), 'pcr').slice(0, -1).map(r => r.v)), 2);
    assert.equal(engine.deviationOf(engine.dailySnapshots(full), 'pcr').ok, null);
    assert.equal(engine.deviationSeries(engine.dailySnapshots(missing), 'pcr').length, 1);
    for (const [rows, expectedPartial] of [[full, false], [missing, false]]) {
        const shared = await runSharedRanking(rows);
        assert.equal(shared.out.results.deviation.items.length, 0);
        assert.equal(shared.out.partial, expectedPartial);
        const separate = await runSeparateDeviation(rows);
        assert.equal(separate.writes[0][1].found.length, 0);
        assert.equal(separate.out.partial, expectedPartial);
    }
    // 실제 구조 생산자가 부분 오늘을 만들었을 때도, 과거 완결 8세션은 유지한다.
    const fixture = structureService([], {
        exactResults: contracts().map((c, i) => ({ ...c, open_interest: i ? 230000 : 50000 })),
        weeklyExpiry: '2026-10-23', chainDate: '2026-10-21', _ts: now,
        expirationsTruncated: ['2026-10-23'],
    });
    const { writes } = await runStructureBuild((...args) => fixture.service.getStructureData(...args));
    assert.equal(fixture.calls.length, 0);
    const rows = [...full.slice(0, -1), ...writes];
    const shared = await runSharedRanking(rows);
    assert.equal(shared.out.partial, true);
    assert.equal(shared.out.results.deviation.items[0].partial, true);
    assert.equal(shared.out.results.deviation.items[0].baseline, 2);
    const separate = await runSeparateDeviation(rows);
    assert.equal(separate.out.partial, true);
    assert.equal(separate.writes[0][1].partial, true);
    assert.equal(separate.writes[0][1].found.find(r => r.metric === 'pcr').partial, true);
    const parts = Array.from({ length: 8 }, (_, i) => i === 0 ? separate.writes[0][1] : { found: [], ratioPool: {}, partial: false });
    const merged = await runSeparateDeviation([], parts);
    assert.equal(merged.out.partial, true);
    assert.equal(merged.out.groups.pcr[0].partial, true);
});

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
        '@/lib/aws/dynamoClient': { TABLES: { FLOW_HISTORY: 'flow', GEX_HISTORY: 'gex' }, queryItems: async (_table, _condition, values) => Array.isArray(input) ? input : input[values[':t']] || [] },
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

async function runSeparateDeviation(input, parts = null) {
    const writes = [], reads = [];
    const route = compile(read('src/app/api/ranking/deviation/route.ts'), {
        'next/server': { NextResponse: { json: x => x } },
        '@/lib/aws/dynamoClient': { TABLES: { FLOW_HISTORY: 'flow' }, queryItems: async () => input },
        '@/services/redisClient': { getFromCache: async key => {
            reads.push(key);
            return parts && /^ranking:deviation:part:v13:30:\d$/.test(key) ? parts[Number(key.split(':').at(-1))] : null;
        }, setInCache: async (...args) => { writes.push(args); } },
        '@/services/darkPool': {}, '@/lib/rankings/engine': engine,
        '@/../data/stock_universe_us800.json': { symbols: ['TEST'] },
    });
    const out = await route.GET({ nextUrl: new URL(`http://fixture/api/ranking/deviation${parts ? '' : '?build=0'}`) });
    return { out, writes, reads };
}

test('별도 deviation API도 같은 세션별 대표 행과 새 조각 캐시를 사용한다', async () => {
    const { out, writes } = await runSeparateDeviation(history());
    assert.equal(out.mode, 'build');
    assert.ok(out.candidates > 0);
    assert.equal(writes[0][0], 'ranking:deviation:part:v13:30:0');
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

const earlyDates = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07'];
const cohort = (dates, center, oi, extra = {}) => dates.map((d, i) => row(d, Date.parse(`${d}T21:00:00Z`), {
    totalCallOI: oi / 2, totalPutOI: oi / 2,
    totalPremium: center + [-10, -8, -5, -2, 2, 5, 8, 10][i] * Math.round(center / 100), ...extra,
}));

const withoutMarkers = rows => rows.map(({ chainDate, optionBasis, premiumBasis, partial, ...legacy }) => legacy);

test('옛 행 호환: 날짜·금액 표식 없는 기준군과 오늘은 기존 수치·순위를 유지한다', async () => {
    const marked = history();
    const old = withoutMarkers(marked);
    // 수집일이 원천일과 같은 옛 자료를 사용한다.
    old.at(-1).timestamp = Date.parse('2026-10-21T21:00:00Z');
    for (const key of ['pcr', 'totalPremium', 'totalCallOI', 'totalPutOI']) {
        assert.deepEqual(plain(engine.deviationOf(engine.dailySnapshots(old), key)),
            plain(engine.deviationOf(engine.dailySnapshots(marked), key)));
    }
    const legacy = await runSharedRanking(old), reference = await runSharedRanking(marked);
    for (const id of ['deviation', 'multi-axis', 'money-vs-oi']) {
        assert.deepEqual(plain(legacy.out.results[id].items), plain(reference.out.results[id].items));
        assert.equal(legacy.out.results[id].candidates, reference.out.results[id].candidates);
        assert.equal(legacy.out.results[id].partial, false);
    }
    const mixed = [...old.slice(0, -1), marked.at(-1)];
    assert.equal(engine.deviationOf(engine.dailySnapshots(mixed), 'totalPremium').ok.baseline, 1000);
    const separate = await runSeparateDeviation(mixed);
    assert.ok(separate.writes[0][1].found.some(x => x.metric === 'pcr'));
    assert.equal(separate.out.partial, false);
    mixed[mixed.length - 1] = { ...mixed.at(-1), totalPremium: 2300 };
    const separatePremium = await runSeparateDeviation(mixed);
    assert.equal(separatePremium.writes[0][1].found.find(x => x.metric === 'totalPremium').baseline, 1000);
});

test('옛 행 호환: partial:true·명시적 비EOD만 제외하고 정상 옛 행은 남긴다', () => {
    const old = withoutMarkers(history().slice(0, -1));
    const excluded = [
        { ...old[0], timestamp: Date.parse('2026-10-01T21:00:00Z'), partial: true },
        { ...old[1], timestamp: Date.parse('2026-10-02T21:00:00Z'), optionBasis: 'intraday', chainDate: '2026-10-02' },
        { ...old[2], timestamp: Date.parse('2026-10-05T21:00:00Z'), optionBasis: 'intraday' },
    ];
    const today = history().at(-1);
    const reference = engine.deviationOf(engine.dailySnapshots([...old, today]), 'totalPremium');
    // 과거 원천의 전환일이 옛 행을 지우지 않도록 서로 다른 날짜에서 검사한다.
    for (const extra of [excluded[0], excluded[2]]) {
        const snaps = engine.dailySnapshots([...old, extra, today]);
        assert.equal(engine.deviationSeries(snaps, 'totalPremium').length, 9);
        assert.deepEqual(plain(engine.deviationOf(snaps, 'totalPremium')), plain(reference));
    }
    assert.equal(engine.isCompleteOptionEod(excluded[1]), false);
    assert.equal(engine.isCompleteOptionEod({ ...old[0], partial: false }), true);
});

test('운영 형태 fixture: 옛 행 2,995개+오늘 표식 5개, 카드 5·1·19와 LLY 1위를 보존한다', async () => {
    const { fixture } = require('./fixtures/deviationLegacyHistory.cjs');
    const savedNow = now;
    now = Date.parse('2026-10-24T09:00:00Z');
    try {
        const old = fixture({ legacyToday: true }), mixed = fixture();
        assert.equal(mixed.AVGO.length, 3000);
        assert.equal(mixed.AVGO.filter(x => x.optionBasis === 'eod').length, 5);
        const legacy = (await runSharedRanking(old)).out;
        const current = (await runSharedRanking(mixed)).out;
        for (const out of [legacy, current]) {
            assert.deepEqual(plain(out.results.deviation.items.map(x => x.ticker)), ['AAPL', 'AVGO', 'MU', 'AMD', 'MSFT']);
            assert.deepEqual(plain(out.results['multi-axis'].items.map(x => x.ticker)), ['AVGO']);
            assert.equal(out.results['money-vs-oi'].candidates, 19);
            assert.equal(out.results['money-vs-oi'].items[0].ticker, 'LLY');
            assert.equal(out.results['money-vs-oi'].items.length, 10, 'top=10 표시 한도');
        }
        for (const id of ['deviation', 'multi-axis', 'money-vs-oi']) {
            assert.deepEqual(plain(current.results[id]), plain(legacy.results[id]));
        }
        assert.equal(engine.deviationSeries(engine.dailySnapshots(mixed.AVGO), 'totalPremium').length, 24);
    } finally { now = savedNow; }
});

test('합성 조건 1·2: OI 감소 시 두 옛 선택 규칙의 43,302,986→111,623 급락을 차단한다', () => {
    const full = cohort(baselineDates, 43302986, 1000000);
    const partial = cohort(earlyDates, 111623, 100000, { partial: true });
    const first = row('2026-10-21', now, { totalCallOI: 500000, totalPutOI: 500000, totalPremium: 86605972 });
    const next = row('2026-10-22', now, { totalPremium: 230000 }); // 같은 날짜 05 ET, 아직 EOD 아님
    const rows = [...partial, ...full, first];
    // 동률이 없는 이 재현에서는 d78 전(첫 행)·d78(최신 행) 대표 규칙 모두 같은 OI 비교군을 만든다.
    for (const latestOnTie of [false, true]) {
        const vulnerable = input => {
            const days = new Map();
            for (const r of input) {
                const prev = days.get(r.chainDate), oi = r.totalCallOI + r.totalPutOI;
                if (!prev || oi > prev.oi || (latestOnTie && oi === prev.oi && r.timestamp > prev.timestamp)) {
                    days.set(r.chainDate, { ...r, oi });
                }
            }
            const series = [...days.values()].sort((a, b) => a.chainDate.localeCompare(b.chainDate));
            const today = series.at(-1);
            return engine.median(series.slice(0, -1).filter(r => r.oi >= today.oi * .5 && r.oi <= today.oi * 2).map(r => r.totalPremium));
        };
        assert.equal(vulnerable(rows), 43302986);
        assert.equal(vulnerable([...rows, next]), 111623);
    }
    assert.equal(engine.deviationOf(engine.dailySnapshots(rows), 'totalPremium').ok.baseline, 43302986);
    const fixed = engine.deviationOf(engine.dailySnapshots([...rows, next]), 'totalPremium');
    assert.equal(fixed.ok, null, '완결 EOD의 OI 비교군이 없으면 부분 기준선을 만들지 않는다');
    assert.equal(fixed.reason, '비교일부족(만기롤오버)');
});

test('합성 조건 3: 같은 세션·OI의 작은 늦은 프리미엄이 큰 완결 측정을 덮지 않는다', () => {
    const full = row('2026-10-21', now, { totalPremium: 43302986 });
    for (const extra of [{}, { partial: true }, { totalCallOI: 500000, totalPutOI: 500000, partial: true }]) {
        const late = { ...full, timestamp: now + 1000, totalPremium: 111623, ...extra };
        for (const input of [[full, late], [late, full]]) assert.equal(engine.dailySnapshots(input)[0].totalPremium, 43302986);
    }
});

test('합성 조건 4: OI 없는 원천 행 하나로 레거시 대표 17개를 8개로 줄이지 않는다', () => {
    const legacy = Array.from({ length: 17 }, (_, i) => ({ timestamp: Date.UTC(2026, 9, 1 + i, 21),
        totalCallOI: 50000, totalPutOI: 50000, atmIv: 20 + i, callPremium: 200, putPremium: 30 }));
    const unusable = { timestamp: now, chainDate: '2026-10-09', optionBasis: 'eod' };
    for (const input of [legacy, [...legacy, unusable]]) {
        assert.equal(engine.dailySnapshots(input).length, 17);
        assert.equal(engine.dailyValues(input, 'atmIv').length, 17);
        assert.equal(engine.sessionValues(input, 'atmIv').length, engine.sessionValues(legacy, 'atmIv').length);
        assert.equal(engine.latestWith(input, ['callPremium', 'putPremium'])._d, '2026-10-17');
    }
    assert.equal(engine.deviationSeries(engine.dailySnapshots(legacy), 'totalCallOI').length, 17, '표식 없는 옛 행은 기존 기준군에 남는다');
});

test('완결 EOD 판정: 부분·당일 PRE/장중·날짜 불명·휴장 제외, 전날 EOD 재수집·조기 마감 허용', () => {
    for (const r of [row(null), row('2026-10-22'), row('2026-10-21', now, { partial: true }),
        row('2026-10-21', now, { optionBasis: 'intraday' }), row('2026-10-17'),
        row('2026-10-22', Date.parse('2026-10-22T19:59:00Z')),
        row('2026-11-27', Date.parse('2026-11-27T17:59:00Z'))]) assert.equal(engine.isCompleteOptionEod(r), false);
    for (const r of [row('2026-10-21'), row('2026-10-22', Date.parse('2026-10-22T20:00:00Z')),
        row('2026-11-27', Date.parse('2026-11-27T18:00:00Z'))]) assert.equal(engine.isCompleteOptionEod(r), true);
    const input = [...history(), ...cohort(earlyDates, 111623, 100000, { partial: true }), row(null)];
    assert.equal(engine.deviationOf(engine.dailySnapshots(input), 'totalPremium').ok.baseline, 1000);
});

test('premiumBasis: 명시된 서로 다른 기준은 분리하고, 없는 기준은 기존 비교를 유지한다', () => {
    const volume = cohort(baselineDates, 1000, 100000);
    const oi = cohort(earlyDates, 100, 100000, { premiumBasis: 'oi-prev-close' });
    for (const [basis, center] of [['volume-close', 1000], ['oi-prev-close', 100]]) {
        const today = row('2026-10-21', now, { premiumBasis: basis, totalPremium: center * 2.3 });
        const result = engine.deviationOf(engine.dailySnapshots([...volume, ...oi, today]), 'totalPremium').ok;
        assert.equal(result.baseline, center);
        assert.equal(result.sessions, 8);
    }
    for (const premiumBasis of [undefined, null, '']) {
        const rows = [...history().slice(0, -1), row('2026-10-21', now, { premiumBasis })];
        assert.equal(engine.deviationOf(engine.dailySnapshots(rows), 'totalPremium').ok.baseline, 1000);
        assert.ok(engine.deviationOf(engine.dailySnapshots(rows), 'pcr').ok);
    }
    const other = [...history().slice(0, -1), row('2026-10-21', now, { premiumBasis: 'other-basis' })];
    assert.equal(engine.deviationOf(engine.dailySnapshots(other), 'totalPremium').ok, null);
    for (const input of [[volume[0], { ...volume[0], premiumBasis: 'oi-prev-close', totalPremium: 9999999 }],
        [{ ...volume[0], premiumBasis: 'oi-prev-close', totalPremium: 9999999 }, volume[0]]]) {
        assert.equal(engine.dailySnapshots(input)[0].premiumBasis, 'volume-close');
    }
});

test('공유·별도 API: 부분 오늘의 날짜·수치 유지, partial을 항목·응답·조각에 전달', async () => {
    const rows = history();
    rows.at(-1).partial = true;
    rows.at(-1).totalPremium = 2300;
    const { out } = await runSharedRanking(rows);
    assert.equal(out.partial, true);
    for (const id of ['deviation', 'multi-axis', 'money-vs-oi']) {
        assert.equal(out.results[id].partial, true);
        assert.equal(out.results[id].items[0].partial, true);
        assert.equal(out.results[id].items[0].date, '2026-10-21');
    }
    const separate = await runSeparateDeviation(rows);
    assert.equal(separate.out.partial, true);
    assert.equal(separate.writes[0][1].partial, true);
    const fund = separate.writes[0][1].found.find(x => x.metric === 'totalPremium');
    assert.equal(fund.baseline, 1000);
    assert.equal(fund.today, 2300);
    assert.equal(fund.partial, true);
    const parts = Array.from({ length: 8 }, (_, i) => i === 0 ? separate.writes[0][1] : { found: [], ratioPool: {}, partial: false });
    const merged = await runSeparateDeviation([], parts);
    assert.equal(merged.out.partial, true, '부분 오늘 표식이 8조각 병합 뒤에도 남는다');
    assert.equal(merged.out.groups.totalPremium[0].partial, true);
    assert.ok(merged.reads.includes('ranking:deviation:v14:30:5'));
    const complete = await runSharedRanking(history());
    assert.equal(complete.out.partial, false);
    const empty = await runSharedRanking([...history(), row('2026-10-22', now, { totalCallOI: 5, totalPutOI: 5 })]);
    assert.equal(empty.out.results.deviation.items.length, 0);
    assert.equal(empty.out.partial, true, '비교군 부족으로 후보가 없어도 부분 자료임을 응답한다');
});

test('별도 API: 최신 세션 프리미엄 결측을 과거 측정으로 대체하지 않는다', async () => {
    const rows = history();
    rows.at(-1).totalPremium = null;
    const { writes } = await runSeparateDeviation(rows);
    assert.equal(writes[0][1].found.some(x => x.metric === 'totalPremium'), false);
});

test('수집기 getAllOptions: 페이지 상한 부분 표식, IV Surface 호출자가 쓰는 배열 형태 유지', async () => {
    for (const truncated of [false, true]) {
        let calls = 0;
        const get = compile(`${fnSource('harvest_lambda/index.js', 'getAllOptions')}\nexports.run = getAllOptions;`, {}, {
            POLYGON_KEY: '', httpsGet: async () => { calls++; return { results: [{ open_interest: 1 }],
                ...(truncated ? { next_url: 'https://fixture/next' } : {}) }; },
        });
        const result = await get.run('TEST');
        assert.equal(Array.isArray(result), true);
        assert.equal(calls, truncated ? 20 : 1);
        assert.equal(result.partial, truncated);
        assert.equal(result.reduce((s, r) => s + r.open_interest, 0), calls);
    }
});

test('getAllOptions의 다른 호출자 computeIvSurface도 부분 표식이 붙은 배열을 그대로 소비한다', async () => {
    const input = contracts().map(c => ({ ...c, greeks: { implied_volatility: .2, delta: c.details.contract_type === 'call' ? .25 : -.25 } }));
    input.partial = true;
    const writes = [];
    const surface = compile(`${fnSource('harvest_lambda/index.js', 'computeIvSurface')}\nexports.run = computeIvSurface;`, {}, {
        DETAIL_TICKERS: ['TEST'], getAllOptions: async () => input,
        client: { send: async command => { writes.push(command); } },
        PutCommand: class { constructor(args) { Object.assign(this, args); } },
        console: { log() {} },
    });
    assert.equal(await surface.run({ TEST: 100 }), 1);
    assert.equal(writes[0].Item.surface[0].atmCallIv, 20);
    assert.equal(writes[0].Item.surface[0].atmPutIv, 20);
});

test('getAllOptions: 첫 페이지의 공급사 partial을 뒤 페이지가 지우지 않으며 표시 없는 응답은 기존 판정 유지', async () => {
    for (const partial of [undefined, false, true]) {
        let calls = 0;
        const get = compile(`${fnSource('harvest_lambda/index.js', 'getAllOptions')}\nexports.run = getAllOptions;`, {}, {
            POLYGON_KEY: '', httpsGet: async () => ({ results: [{}],
                ...(calls++ === 0 ? { partial, next_url: 'https://fixture/next' } : { partial: false }) }),
        });
        const result = await get.run('TEST');
        assert.equal(calls, 2);
        assert.equal(result.length, 2);
        assert.equal(result.partial, !!partial);
    }
});

test('FlowWarm: exact·probe 어댑터 partial을 선택한 체인 이력에 전달한다', async () => {
    for (const fallback of [false, true]) {
        for (const partial of [false, true]) {
            const writes = [];
            let calls = 0;
            const warm = compile(`${fnSource('harvest_lambda/index.js', 'warmFlowCache')}\nexports.run = warmFlowCache;`, {}, {
                getRedis: () => ({}), redisGet: async () => null, redisSet: async () => true,
                UNIVERSE: ['TEST'], POLYGON_KEY: '', process: { env: {} }, optionHistoryDate,
                httpsGet: async url => {
                    calls++;
                    if (url.includes('/SPY?')) return { results: contracts() };
                    return url.includes('expiration_date.gte=') ? { results: contracts(), partial: fallback ? partial : !partial }
                        : { results: fallback ? [] : contracts(), partial: fallback ? !partial : partial };
                },
                client: { send: async command => { writes.push(command); } },
                PutCommand: class { constructor(args) { Object.assign(this, args); } },
                console: { log() {}, warn() {} },
            });
            await warm.run({ TEST: { price: 100 } });
            assert.equal(calls, 3, '기존 pilot 1 + probe 1 + exact 1');
            assert.equal(writes.length, 1);
            assert.equal(writes[0].Item.partial, partial);
            assert.equal(writes[0].Item.totalPremium, 4200);
        }
    }
});

test('FlowWarm: exact 체인 실패 뒤 부분 probe로 대체하면 이력에도 partial을 유지한다', async () => {
    const writes = [];
    const warm = compile(`${fnSource('harvest_lambda/index.js', 'warmFlowCache')}\nexports.run = warmFlowCache;`, {}, {
        getRedis: () => ({}), redisGet: async () => null, redisSet: async () => true,
        UNIVERSE: ['TEST'], POLYGON_KEY: '', process: { env: {} }, optionHistoryDate,
        httpsGet: async url => url.includes('expiration_date.gte=')
            ? { results: contracts(), next_url: 'https://fixture/next' } : { results: [] },
        client: { send: async command => { writes.push(command); } },
        PutCommand: class { constructor(args) { Object.assign(this, args); } },
        console: { log() {}, warn() {} },
    });
    await warm.run({ TEST: { price: 100 } });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].Item.partial, true);
    assert.equal(writes[0].Item.chainDate, '2026-10-21');
});

// ── r5: «돈과 포지션의 불일치» = 구조 EOD 로 검증한 최신 세션 완결 행 ───────────────
// 운영 10/23 행 모양(값은 운영 실측을 옮긴 것: flowwarm 흐름 행·Lambda 장중 행·구조 EOD 행). 비밀값 없음.
const etMs = s => Date.parse(`${s}-04:00`);
const flowRow = (at, cOI, pOI, cp, pp, extra = {}) => ({ timestamp: etMs(at), totalCallOI: cOI, totalPutOI: pOI, callPremium: cp, putPremium: pp, totalPremium: cp + pp, pcr: pOI / cOI, ...extra });
const structEod = (at, chainDate, cOI, pOI) => ({ timestamp: etMs(at), chainDate, optionBasis: 'eod', totalCallOI: cOI, totalPutOI: pOI, pcr: pOI / cOI });
const opsShape = () => ({
    AVGO: [
        flowRow('2026-10-21T20:47', 63873, 40626, 11541079, 6398066),
        flowRow('2026-10-22T20:48', 68038, 41041, 6105897, 61061102),
        structEod('2026-10-23T11:05', '2026-10-22', 68038, 41041),
        flowRow('2026-10-23T16:47', 150000, 100000, 9000000, 8000000),      // Lambda 장중 행(다른 범위)
        structEod('2026-10-23T17:06', '2026-10-23', 67700, 43716),
        flowRow('2026-10-23T20:47', 67700, 43716, 4006688, 10287084),
        flowRow('2026-10-24T04:03', 67700, 43716, 1, 1),                    // 토요일 — 세션 아님
    ],
    LLY: [
        flowRow('2026-10-21T20:48', 21347, 20574, 23219269, 957027),
        flowRow('2026-10-22T20:48', 21758, 20608, 8955788, 2241901),
        flowRow('2026-10-23T07:18', 21758, 20608, 8955788, 2241901),        // PRE — 직전 세션 자료
        structEod('2026-10-23T15:06', '2026-10-22', 21758, 20608),
        flowRow('2026-10-23T15:48', 21758, 20608, 7000000, 2000000),        // 만기 소멸 전 마지막 완결 행
        flowRow('2026-10-23T20:48', 8000, 11876, 4604040, 3464012),         // 표식 없는 다른 체인(−53%)
    ],
    XOM: [
        flowRow('2026-10-21T20:50', 49999, 14657, 3000000, 1000000),
        flowRow('2026-10-22T20:50', 51656, 15275, 2500000, 900000),
        structEod('2026-10-23T09:05', '2026-10-22', 51656, 15275),
        flowRow('2026-10-23T10:00', 51656, 15275, 400000, 2600000),
        { timestamp: etMs('2026-10-23T17:05'), optionBasis: 'eod', totalCallOI: 0, totalPutOI: 0 },   // 실패한 구조 행
        flowRow('2026-10-23T20:50', 11660, 7601, 1200000, 300000),          // −71%
    ],
});
const K4 = ['callPremium', 'putPremium', 'totalCallOI', 'totalPutOI'];

test('r5 money-vs-oi: 운영 형태 10/23 — 구조 EOD 일치 행 우선, 부분 의심 제외, 2세션 전 낙하 없음', () => {
    const shape = opsShape();
    const avgo = engine.latestCompleteWith(shape.AVGO, K4);
    assert.equal(avgo._d, '2026-10-23'); assert.equal(avgo._oiCheck, 'match');
    assert.equal(avgo.totalCallOI, 67700); assert.equal(avgo.callPremium, 4006688);
    const lly = engine.latestCompleteWith(shape.LLY, K4);
    assert.equal(lly._d, '2026-10-23'); assert.equal(lly.totalCallOI, 21758); assert.equal(lly.callPremium, 7000000);
    assert.equal(lly._oiCheck, 'unverified');
    const xom = engine.latestCompleteWith(shape.XOM, K4);
    assert.equal(xom._d, '2026-10-23'); assert.equal(xom.totalCallOI, 51656); assert.equal(xom.putPremium, 2600000);
    // r4 미리보기 결함 재현: latestWith 는 만기 소멸 뒤 다른 체인(콜 OI 8,000) 행을 골랐다.
    assert.equal(engine.latestWith(shape.LLY, K4).totalCallOI, 8000);
    // 운영(main) 결함 재현: 구조 행을 이력 시작점으로 세면 10/21 행(2세션 전)으로 떨어진다.
    const mainRule = (items) => {
        const start = items.filter(r => r.chainDate).map(r => r.chainDate).sort()[0];
        return items.filter(r => K4.every(k => Number(r[k]) > 0) && !(start && !r.chainDate && engine.optionSessionDate(r) >= start))
            .sort((a, b) => a.timestamp - b.timestamp).pop();
    };
    assert.equal(engine.optionSessionDate(mainRule(shape.LLY)), '2026-10-21');
});

test('r5 money-vs-oi: 같은 세션 구조 EOD 와 어긋난 행은 제외, 그 세션에 맞는 행이 없으면 직전 세션(2세션 전 아님)', () => {
    const rows = [
        flowRow('2026-10-21T20:48', 30000, 30000, 1, 9),
        flowRow('2026-10-22T20:48', 30000, 30000, 2, 8),
        structEod('2026-10-23T09:05', '2026-10-22', 30000, 30000),
        structEod('2026-10-23T17:06', '2026-10-23', 31000, 29000),
        flowRow('2026-10-23T20:48', 25000, 29000, 3, 7),                    // 콜 OI −19% → 불일치
    ];
    const s = engine.latestCompleteWith(rows, K4);
    assert.equal(s._d, '2026-10-22'); assert.equal(s._oiCheck, 'match'); assert.equal(s.callPremium, 2);
    // 허용 오차(±2%) 안이면 같은 세션 일치
    rows.push(flowRow('2026-10-23T19:00', 31500, 28500, 4, 6));
    const t = engine.latestCompleteWith(rows, K4);
    assert.equal(t._d, '2026-10-23'); assert.equal(t._oiCheck, 'match'); assert.equal(t.callPremium, 4);
    assert.equal(engine.MONEY_OI_MATCH_TOLERANCE, 0.02); assert.equal(engine.MONEY_OI_SUSPECT_RATIO, 0.65);
});

test('r5 money-vs-oi: 구조 EOD 가 없는 종목·장중 행은 예전처럼 최신 행, 명시적 partial·비EOD 는 제외', () => {
    const plainRows = [flowRow('2026-10-22T20:48', 100, 100, 5, 5), flowRow('2026-10-23T11:00', 100, 100, 6, 4)];
    assert.equal(engine.latestCompleteWith(plainRows, K4)._d, '2026-10-23');
    // 같은 세션에 완결 행이 있으면 더 늦은 «밝힌 부분» 행보다 완결 행, 부분 행만 있으면 그 세션을 partial 로(과거로 대체 안 함)
    const marked = [...plainRows, flowRow('2026-10-23T12:00', 100, 100, 9, 1, { chainDate: '2026-10-23', optionBasis: 'eod', partial: true })];
    assert.equal(engine.latestCompleteWith(marked, K4).callPremium, 6);
    const onlyPartial = [plainRows[0], marked[2]];
    const op = engine.latestCompleteWith(onlyPartial, K4);
    assert.equal(op._d, '2026-10-23'); assert.equal(engine.isCompleteOptionEod(op), false);
    // 장중(같은 세션 구조 없음): 직전 구조 대비 정상 범위면 오늘 행
    const live = [structEod('2026-10-23T09:05', '2026-10-22', 100, 100), flowRow('2026-10-23T11:00', 98, 103, 6, 4)];
    assert.equal(engine.latestCompleteWith(live, K4)._d, '2026-10-23');
});

test('r5 공유 GET: money-vs-oi 는 세 종목 모두 10/23 행, deviation·multi-axis 계산 경로는 그대로', async () => {
    const savedNow = now;
    now = Date.parse('2026-10-24T07:30:00Z');
    try {
        const { out } = await runSharedRanking(opsShape());
        const items = out.results['money-vs-oi'].items;
        assert.ok(items.length >= 2);
        for (const it of items) assert.equal(it.date, '2026-10-23', it.ticker);
        const lly = items.find(x => x.ticker === 'LLY');
        if (lly) { assert.equal(lly.callOI, 21758); assert.equal(lly.callPremium, 7000000); }
        const avgo = items.find(x => x.ticker === 'AVGO');
        if (avgo) assert.equal(avgo.callOI, 67700);
        assert.equal(keys.RANKING_CACHE_VERSION, 'v16');
    } finally { now = savedNow; }
});
