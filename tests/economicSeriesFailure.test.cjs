// 실행: node --test tests/economicSeriesFailure.test.cjs (외부 통신·운영 저장소 접근 없음)
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const intrinioFile = 'src/services/intrinioClient.ts';
const fredFile = 'src/lib/macroFredFallback.ts';
const macroFile = 'src/services/macroHubProvider.ts';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function declarations(file, names) {
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    const nodes = ast.statements.filter(n => names.includes(n.name?.text));
    assert.equal(nodes.length, names.length, '시험 대상 실제 함수를 모두 추출한다');
    return nodes.map(n => n.getText(ast)).join('\n');
}
function compile(source, globals = {}) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText, { exports, URLSearchParams, AbortController, setTimeout, clearTimeout,
        require: () => assert.fail('모의 처리하지 않은 모듈 접근 금지'), ...globals });
    return exports;
}
const carry = compile(read('src/lib/macroSnapshotCarry.ts'));
const fredHelpers = compile(read(fredFile)); // 타입 전용 import만 있으며 최상위 외부 호출 없음
const nowMs = Date.parse('2026-10-22T01:00:00Z');
class Clock extends Date { static now() { return nowMs; } }
const gatewaySource = declarations(intrinioFile, ['vendorTtlSec', '_looksEmpty', 'callIntrinio', 'getEconomicSeries', 'getCreditSpread']);
function gateway(response, opts = {}) {
    let now = nowMs, calls = 0;
    const cache = new Map(), writes = [], logs = [], leaves = [], statuses = [];
    const warmGate = { enter: async () => {}, leave: x => leaves.push(x) };
    const state = { response, cacheDown: false };
    const bg = opts.bg;
    const api = compile(`let _lastFailure = null;\n${gatewaySource}\nexports.call = callIntrinio; exports.empty = _looksEmpty; exports.failure = () => _lastFailure;`, {
        INTRINIO_API_KEY: opts.key === false ? '' : 'offline-placeholder', INTRINIO_BASE: 'https://offline.invalid',
        INTRINIO_MAX_ATTEMPTS: 2, VENDOR_CACHE_PREFIX: 'offline:', HY_OAS_SYMBOL: '$BAMLH0A0HYM2',
        RETRYABLE_STATUS: new Set([408, 425, 429, 500, 502, 503, 504]), _inflight: new Map(),
        _acquire: async () => {}, _release() {}, _sleep: async () => {},
        bgStore: { getStore: () => bg }, warmGateStore: { getStore: () => warmGate },
        noteCall: (_label, status) => statuses.push(status), note429() {},
        console: { warn: (...args) => logs.push(args) },
        getFromCache: async key => {
            if (state.cacheDown) throw new Error('모의 캐시 장애');
            const hit = cache.get(key); return hit && hit.expires > now ? hit.data : null;
        },
        setInCache: async (key, data, ttl) => {
            if (state.cacheDown) throw new Error('모의 캐시 장애');
            writes.push({ key, data, ttl }); cache.set(key, { data, expires: now + ttl * 1000 });
        },
        fetch: async () => {
            calls++;
            const res = typeof state.response === 'function' ? state.response(calls) : state.response;
            if (res instanceof Error) throw res;
            return { status: res.status, ok: res.status >= 200 && res.status < 300, json: async () => res.data };
        },
    });
    return { ...api, state, logs, writes, leaves, statuses, calls: () => calls,
        advance: ms => { now += ms; },
        seed: (endpoint, params, data) => cache.set(`offline:${endpoint}::${JSON.stringify(params)}`, { data, expires: now + 60_000 }),
    };
}
const endpoint = 'indices/economic/%24T5YIE/historical_data/level';
const normal = { status: 200, data: { historical_data: [
    { date: '2026-10-20', value: 2.3 }, { date: '2026-10-21', value: 2.4 },
] } };

test('경제계열 빈 배열은 2회 뒤 실패하고 10초 음성캐시를 거쳐 회복한다', async () => {
    const h = gateway({ status: 200, data: { historical_data: [] } });
    await assert.rejects(h.call(endpoint), e => e.status === 200 && e.economicReason === '빈 응답');
    assert.equal(h.calls(), 2);
    assert.equal(h.writes.length, 1); assert.equal(h.writes[0].ttl, 10);
    assert.equal(h.writes[0].data.historical_data, undefined);
    assert.ok(h.leaves.every(x => x.empty));
    await assert.rejects(h.call(endpoint));
    assert.equal(h.calls(), 2); assert.equal(h.logs.at(-1)[1].경로, '음성캐시');
    assert.deepEqual(plain(h.logs[0][1]), { 계열: 'T5YIE', 코드: 200, 행수: 0, 최신관측일: null, 상태: '빈 응답', 경로: '원천' });
    h.advance(10_001); h.state.response = normal;
    assert.equal((await h.call(endpoint)).historical_data.length, 2);
    assert.equal(h.calls(), 3); assert.equal(h.writes.at(-1).ttl, 60);
});

for (const status of [500, 429]) test(`HTTP ${status}를 계열별로 기록하고 재시도 상한·음성캐시를 지킨다`, async () => {
    const h = gateway({ status });
    assert.deepEqual(plain(await h.getEconomicSeries('$DGS10', 10)), []);
    assert.equal(h.calls(), 2); assert.equal(h.writes[0].ttl, 10);
    await h.getEconomicSeries('$DGS10', 10); assert.equal(h.calls(), 2);
    assert.ok(h.logs.every(([, x]) => x.계열 === 'DGS10' && x.코드 === status && x.행수 === null && x.최신관측일 === null));
    assert.equal(h.statuses.filter(x => x === status).length, 2);
});

test('정상 관측·최신일·60초 공유캐시와 배열 반환 계약을 유지한다', async () => {
    const h = gateway(normal);
    assert.deepEqual(plain(await h.getEconomicSeries('$T5YIE')), normal.data.historical_data);
    await h.getEconomicSeries('$T5YIE');
    assert.equal(h.calls(), 1); assert.equal(h.writes[0].ttl, 60);
    assert.equal(h.logs[0][1].최신관측일, '2026-10-21');
    assert.equal(h.logs.at(-1)[1].경로, '공유캐시');
});

test('이전 코드가 저장한 빈 성공 캐시는 무시한다', async () => {
    const h = gateway(normal);
    h.seed(endpoint, {}, { historical_data: [] });
    assert.equal((await h.call(endpoint)).historical_data.length, 2);
    assert.equal(h.calls(), 1);
});

test('빈 응답 뒤 2번째 시도 정상은 음성캐시에 넣지 않는다', async () => {
    const h = gateway(n => n === 1 ? { status: 200, data: { historical_data: [] } } : normal);
    await h.call(endpoint);
    assert.equal(h.calls(), 2); assert.deepEqual(h.writes.map(x => x.ttl), [60]);
});

test('경제계열 스키마 누락은 실패하고 비경제계열의 빈 배열 동작은 유지한다', async () => {
    const h = gateway({ status: 200, data: {} });
    await assert.rejects(h.call(endpoint));
    assert.equal(h.empty('companies/TEST', { historical_data: [] }), false);
    h.state.response = { status: 200, data: { contracts: [] } };
    assert.deepEqual(plain(await h.call('options/expirations/TEST/eod')), { contracts: [] });
    assert.equal(h.writes.length, 1, '비경제계열 빈 배열은 성공/음성 캐시에 넣지 않는다');
});

test('캐시 장애에도 정상 관측과 실패 반환 계약을 유지한다', async () => {
    const h = gateway(normal); h.state.cacheDown = true;
    assert.equal((await h.getEconomicSeries('$DGS10')).length, 2);
    h.state.response = { status: 500 };
    assert.equal(await h.getCreditSpread(), null);
});

test('Intrinio 키 미설정·네트워크 오류는 원문 없이 사유를 기록한다', async () => {
    const missing = gateway(normal, { key: false });
    await missing.getEconomicSeries('$DGS10');
    assert.equal(missing.calls(), 0); assert.equal(missing.logs[0][1].상태, '키 미설정');
    const h = gateway(new Error('모의 원문: URL_QUERY_SHOULD_NOT_APPEAR'));
    await h.getEconomicSeries('$DGS10');
    assert.equal(h.logs[0][1].상태, '요청 실패');
    assert.ok(!JSON.stringify([h.logs, h.failure()]).includes('URL_QUERY_SHOULD_NOT_APPEAR'));
    assert.ok(!JSON.stringify(h.logs).includes('offline.invalid'));
});

test('배경 429 즉시 중단 규칙은 유지한다', async () => {
    const bg = { label: 'offline', calls: 0, saw429: 0, noRetry429: true, tripOn429: true };
    const h = gateway({ status: 429 }, { bg });
    await h.getEconomicSeries('$DGS10');
    assert.equal(h.calls(), 1); assert.equal(bg.tripped, true);
});

function fred(response, key = true) {
    const logs = []; let calls = 0;
    const api = compile(`${read(fredFile)}\nexports.observations = fredObservations;`, {
        process: { env: { FRED_API_KEY: key ? 'offline-placeholder' : '' } },
        console: { warn: (...args) => logs.push(args) },
        fetch: async () => {
            calls++; if (response instanceof Error) throw response;
            return { status: response.status, ok: response.status === 200, json: async () => response.data };
        },
    });
    return { ...api, logs, calls: () => calls };
}

test('FRED도 빈 배열·500·429·정상·키 부재·네트워크 오류를 구분한다', async () => {
    for (const status of [200, 500, 429]) {
        const h = fred({ status, data: { observations: [] } });
        await h.observations('T5YIE', 10);
        assert.equal(h.logs[0][1].코드, status);
        assert.equal(h.logs[0][1].행수, status === 200 ? 0 : null);
    }
    const good = fred({ status: 200, data: { observations: [{ date: '2026-10-21', value: '2.3' }] } });
    assert.equal((await good.observations('T5YIE', 10)).length, 1);
    assert.equal(good.logs[0][1].최신관측일, '2026-10-21');
    const missing = fred(null, false); await missing.observations('T5YIE', 10);
    assert.equal(missing.calls(), 0); assert.equal(missing.logs[0][1].상태, '키 미설정');
    const network = fred(new Error('모의 원문: URL_QUERY_SHOULD_NOT_APPEAR'));
    await network.observations('T5YIE', 10);
    assert.equal(network.logs[0][1].상태, '요청 실패');
    assert.ok(!JSON.stringify(network.logs).includes('URL_QUERY_SHOULD_NOT_APPEAR'));
});

// 실제 매크로 재계산 함수 → FRED 폴백 → 보관본 잇기를 연결한다. 다른 원천·저장소는 메모리 모의다.
async function snapshot(h, fredOk, lastGood) {
    const factor = { level: 4.1, chgPct: 0, source: 'YAHOO', status: 'OK' };
    const quote = { source: 'YAHOO', price: 4.1 };
    const yahoo = Object.fromEntries(['nq', 'vix', 'spx', 'btc', 'gold', 'oil', 'sox', 'rut', 'tnx', 'dxy'].map(k => [k, quote]));
    let fallbackCalls = 0, remembered;
    const api = compile(declarations(macroFile, ['realYieldFromSameDatePair', 'fetchMacroSnapshotFresh']) + '\nexports.fresh = fetchMacroSnapshotFresh; exports.pair = realYieldFromSameDatePair;', {
        ...carry, ...h, Date: Clock, cache: { data: null }, CACHE_TTL_MS: 60_000,
        MACRO_REDIS_KEY: 'offline:macro', MACRO_RETENTION_SEC: 900,
        console: { log() {}, warn() {} },
        SYMBOLS: {}, MULTIPLIERS: {}, getMarketStatusSSOT: async () => ({ session: 'REG' }),
        getYahooDataSSOT: async () => yahoo, fetchIndexSnapshot: async () => factor,
        fetchFedYield: async () => factor, fetchYieldCurveData: async () => null,
        triggerCronIfNeeded() {}, createYahooFactor: () => factor, unifyUs10y: () => factor,
        getFromCache: async () => null, setInCache: async () => {}, fetchMassive: async () => null,
        fetchRealYieldData: async () => api.pair(),
        fredCreditSpread: async () => { fallbackCalls++; return fredOk ? fredHelpers.creditSpreadFromSeries(Array.from({ length: 5 }, () => ({ date: '2026-10-21', v: 2.9 }))) : null; },
        fredRealPair: async () => { fallbackCalls++; return fredOk ? fredHelpers.realPairFromSeries([{ date: '2026-10-21', v: 4.1 }], [{ date: '2026-10-21', v: 2.3 }], nowMs) : null; },
        rememberLastGood: s => { remembered = carry.mergeLastGood(lastGood, carry.extractLastGood(s)); },
        loadLastGood: async () => remembered,
    });
    return { data: await api.fresh(), fallbackCalls, remembered };
}
const saved = carry.extractLastGood({
    realYieldObserved: { us10y: 4.1, inflationExpectation: 2.35, realYield: 1.75, stance: 'TIGHT', asOf: '2026-10-20' },
    creditSpread: { value: 2.91, date: '2026-10-20', change20d: 0.05, percentile: 12, regime: 'WIDENING' },
});
for (const status of [200, 500, 429]) test(`Intrinio ${status}${status === 200 ? ' 빈 배열' : ''} → FRED 실패 → 보관 관측일을 유지해 잇는다`, async () => {
    const h = gateway({ status, data: { historical_data: [] } });
    const result = await snapshot(h, false, saved);
    assert.equal(result.fallbackCalls, 2);
    assert.equal(result.data.realYieldObserved.asOf, '2026-10-20');
    assert.equal(result.data.realYieldObserved.realYield, 1.75);
    assert.equal(result.data.realYield, undefined, '보관 관측을 점수 입력으로 승격하지 않는다');
    assert.deepEqual(plain(result.data.creditSpread), plain(saved.creditSpread));
    assert.deepEqual(plain(result.remembered), plain(saved));
});

test('Intrinio 실패 → FRED 정상은 새 관측을 쓰고, 양쪽 실패·보관본 부재는 값을 만들지 않는다', async () => {
    const h = gateway({ status: 200, data: { historical_data: [] } });
    const fallback = await snapshot(h, true, saved);
    assert.equal(fallback.data.realYieldObserved.asOf, '2026-10-21');
    assert.equal(fallback.data.creditSpread.date, '2026-10-21');
    const empty = await snapshot(h, false, {});
    assert.equal(empty.data.realYieldObserved, undefined); assert.equal(empty.data.creditSpread, undefined);
});

test('Intrinio 정상은 FRED를 호출하지 않고 정상 계열·신용스프레드 계산을 유지한다', async () => {
    const h = gateway({ status: 200, data: { historical_data: Array.from({ length: 65 }, (_, i) => ({
        date: i === 0 ? '2026-10-21' : '2026-10-20', value: 2.9 + (i % 10) * 0.01,
    })) } });
    const result = await snapshot(h, false, saved);
    assert.equal(result.fallbackCalls, 0);
    assert.equal(result.data.realYieldObserved.asOf, '2026-10-21');
    assert.equal(result.data.creditSpread.date, '2026-10-21');
    assert.equal(result.data.creditSpread.value, 2.9);
    assert.equal(result.data.creditSpread.change20d, 0);
    assert.equal(result.data.creditSpread.percentile, 0);
    assert.equal(result.data.creditSpread.regime, 'STABLE');
});
