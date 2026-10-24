// 실제 모듈 실행. 공급사·저장소는 메모리 모형으로 대체하며 환경파일을 읽지 않는다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, extras = {}) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(code, { exports, URLSearchParams, AbortSignal, setTimeout, Date, JSON,
        process: { env: { FMP_API_KEY: '모형' } },
        fetch: () => { throw Error('금지된 네트워크 접근'); },
        require: id => { assert.ok(Object.hasOwn(mocks, id), `모형 없는 의존성: ${id}`); return mocks[id]; },
        ...extras,
    });
    return exports;
}
const background = load('src/lib/intrinioBackground.ts', { 'node:async_hooks': require('node:async_hooks') });
const calendar = load('src/lib/marketCalendar.ts');
const time = load('src/lib/fmpTime.ts');
const vwap = load('src/lib/vwap.ts');
const day = '2026-10-21';
const at = time => Date.parse(`${day}T${time}-04:00`);
const bar = (minute, price = 100, volume = 100) => ({ date: `${day} 09:${minute}:00`, high: price, low: price, close: price, volume });
const json = value => JSON.parse(JSON.stringify(value));
function harness(options = {}) {
    let now = options.now ?? at('09:31:10');
    const shared = options.shared ?? { cache: new Map(), locks: new Map(), calls: 0, writes: [] };
    const mocks = {
        '@/lib/intrinioBackground': background, '@/lib/fmpTime': time, '@/lib/marketCalendar': calendar, '@/lib/vwap': vwap,
        '@/lib/intrinioMeter': { upstashMeterStore: { setNxEx: async (key, _v, ttl) => {
            if (options.lockError) throw Error('모형 저장소 장애');
            if ((shared.locks.get(key) ?? 0) > now) return false;
            shared.locks.set(key, now + ttl * 1000); return true;
        } } },
        './redisClient': {
            getFromCache: async key => { if (options.readError) throw Error('모형 읽기 장애'); return shared.cache.get(key) ?? null; },
            setInCache: async (key, value, ttl) => {
                if (key.endsWith(':diag:v1')) {
                    if (options.diagError) throw Error('모형 진단 저장 장애');
                } else shared.writes.push(ttl);
                shared.cache.set(key, value); return true;
            },
        },
    };
    const extras = {
        process: { env: { ...(options.noKey ? {} : { FMP_API_KEY: '모형' }), ...(options.disabled ? {} : { ENABLE_FMP_SESSION_VWAP: '1' }) } },
        Date: class extends Date { static now() { return now; } },
        fetch: async (url, init) => {
            const u = new URL(url);
            assert.equal(u.hostname, 'financialmodelingprep.com');
            assert.equal(u.pathname, '/stable/historical-chart/1min');
            assert.equal(u.searchParams.get('from'), day); assert.equal(u.searchParams.get('to'), day);
            assert.equal(init.cache, 'no-store');
            shared.calls++;
            if (options.error) { const error = Error('원천 오류 내용은 노출 금지'); error.name = options.error; throw error; }
            if (options.started) options.started();
            if (options.wait) await options.wait;
            if (options.delay) await new Promise(resolve => setTimeout(resolve, 20));
            return { status: options.status ?? 200, ok: (options.status ?? 200) >= 200 && (options.status ?? 200) < 300, json: async () => { if (options.parseError) throw Error('원천 파싱 오류 노출 금지'); return options.rows ?? [bar('30'), bar('31', 200, 300)]; } };
        },
    };
    mocks['@/lib/fmpClient'] = { fmpFetch: async (url, _caller, opts) => {
        const response = await extras.fetch(url, { cache: 'no-store' });
        opts.onDiagnostic?.({ reason: null, retryMs: null });
        return response;
    } };
    const api = load('src/services/realtimeSessionVwap.ts', mocks, extras);
    return { api, shared, diag: (symbol = 'IBM', date = day) => api.readRealtimeSessionVwapDiagnostics(symbol, date, now), read: (symbol = 'IBM', date = day) => api.readRealtimeSessionVwap(symbol, date, now), setNow: value => { now = value; }, get: (symbol = 'IBM', date = day) => api.getRealtimeSessionVwap(symbol, date, now) };
}

test('개장 첫 봉과 당일 누적 산식: Σ가격×거래량/Σ거래량, 역순·동일 중복 허용', () => {
    const h = harness();
    assert.deepEqual(json(h.api.realtimeVwapFromMinutes([bar('31', 200, 300), bar('30'), bar('30')], day, at('09:31:10'))),
        { vwap: 175, date: day, bars: 2 });
    assert.equal(h.api.realtimeVwapFromMinutes([bar('30')], day, at('09:30:10')).vwap, 100);
});

test('전일·PRE·미래·누락·충돌 중복·지연·무거래 자료는 값으로 꾸미지 않는다', () => {
    const { api } = harness();
    for (const rows of [[], [bar('31')], [bar('30'), bar('32')], [bar('30'), bar('30', 200)],
        [bar('30', 100, 0)], [bar('30', 100, Infinity)], [bar('30', 100, '100')],
        [bar('30', NaN)], [{ ...bar('30'), date: '2026-10-20 09:30:00' }],
        [{ ...bar('30'), date: `${day} 09:29:00` }],
    ]) assert.equal(api.realtimeVwapFromMinutes(rows, day, at('09:32:10')), null);
    assert.equal(api.realtimeVwapFromMinutes([bar('30')], day, at('09:45:00')), null);
    assert.equal(api.realtimeVwapFromMinutes([bar('30')], day, at('09:29:59')), null);
    assert.equal(api.realtimeVwapFromMinutes([bar('30')], day, at('16:00:00')), null);
});

test('동시 20요청·서로 다른 인스턴스 2개: HTTP 1회·경합은 null 즉시·다음 요청 같은 값', async () => {
    const a = harness({ delay: true });
    const b = harness({ shared: a.shared });
    const result = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).get()));
    assert.equal(a.shared.calls, 1);
    assert.ok(result.some(r => r === null));
    for (const r of result.filter(Boolean)) assert.deepEqual(json(r), { vwap: 175, date: day, bars: 2 });
    for (const h of [a, b]) assert.deepEqual(json(await h.get()), { vwap: 175, date: day, bars: 2 });
});

for (const opts of [{ rows: [] }, { status: 429 }, { error: true }]) {
    test(`빈 자료·429·시간 초과: 재시도 없음·null TTL 5초 (${JSON.stringify(opts)})`, async () => {
        const h = harness(opts);
        assert.equal(await h.get(), null); assert.equal(await h.get(), null);
        assert.equal(h.shared.calls, 1); assert.deepEqual(h.shared.writes, [5]);
    });
}

test('공용 공급사 예산: 60초 구간 30회 이하, 다른 종목도 공유', async () => {
    const h = harness();
    for (let sec = 0; sec < 60; sec++) {
        h.setNow(at('09:31:00') + sec * 1000);
        await h.get(`TEST${sec}`);
    }
    assert.equal(h.shared.calls, 30);
});

test('잠금 저장소 장애: 실제 HTTP 0회', async () => {
    const h = harness({ lockError: true });
    assert.equal(await h.get(), null); assert.equal(h.shared.calls, 0);
});

test('PRE·POST·주말·휴장·조기 폐장·전일 요청: 공급사 0회', async () => {
    const h = harness();
    for (const iso of ['2026-10-21T09:29:59-04:00', '2026-10-21T16:00:00-04:00',
        '2026-10-24T10:00:00-04:00', '2026-11-26T10:00:00-05:00', '2026-11-27T13:00:00-05:00']) {
        h.setNow(Date.parse(iso));
        assert.equal(await h.get('IBM', iso.slice(0, 10)), null);
    }
    assert.equal(await h.get('IBM', '2026-10-20'), null); assert.equal(h.shared.calls, 0);
});

async function promptly(work) {
    let timer;
    try {
        return await Promise.race([work, new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error('저장본 읽기가 진행 중 작업을 기다림')), 500);
        })]);
    } finally { clearTimeout(timer); }
}

test('응답용 읽기: 미완료 HTTP·공유 잠금을 기다리지 않고 null, 완료 뒤 두 인스턴스 같은 값', async () => {
    let release, started;
    const wait = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { started = resolve; });
    const a = harness({ wait, started });
    const b = harness({ shared: a.shared });
    assert.equal(await a.read(), null); assert.equal(a.shared.calls, 0); assert.equal(a.shared.locks.size, 0);
    const work = a.get();
    try {
        await promptly(entered);
        assert.equal(await promptly(a.read()), null); assert.equal(await promptly(b.read()), null);
        assert.equal(await promptly(b.get()), null, '잠금 경합에도 폴링하지 않는다');
    } finally { release(); await work; }
    for (const h of [a, b]) assert.deepEqual(json(await h.read()), { vwap: 175, date: day, bars: 2 });
    assert.equal(a.shared.calls, 1);
    a.setNow(at('09:31:26')); b.setNow(at('09:31:26'));
    assert.equal(await a.read(), null); assert.equal(await b.read(), null); assert.equal(a.shared.calls, 1);
});

test('FMP 429: 기존 배경 관문을 닫고 같은 흐름의 다른 종목 호출도 중단', async () => {
    const h = harness({ status: 429 });
    const ctx = background.newBgCtx('vwap:시험', { noRetry429: true, tripOn429: true });
    await background.runWithBg(ctx, async () => {
        assert.equal(await h.get(), null);
        h.setNow(at('09:31:13'));
        assert.equal(await h.get('NVDA'), null);
    });
    assert.equal(ctx.tripped, true); assert.equal(ctx.saw429, 1); assert.equal(h.shared.calls, 1);
});

test('Intrinio 429로 이미 닫힌 관문: FMP 잠금·HTTP 0회', async () => {
    const h = harness();
    const ctx = background.newBgCtx('vwap:시험', { noRetry429: true, tripOn429: true }); ctx.tripped = true;
    await background.runWithBg(ctx, async () => assert.equal(await h.get(), null));
    assert.equal(h.shared.calls, 0); assert.equal(h.shared.locks.size, 0);
});


test('진단 GET용 읽기: 관측 없음을 명시하고 HTTP·잠금·쓰기 0회', async () => {
    const h = harness();
    const before = await h.diag();
    assert.equal(before.fmpKeyPresent, true);
    assert.equal(before.observationState, 'not_observed');
    assert.equal(before.observation, null);
    assert.equal(before.cache.hit, false);
    assert.equal(h.shared.calls, 0); assert.equal(h.shared.locks.size, 0); assert.equal(h.shared.cache.size, 0);
});

test('진단: 실제 HTTP·ET 봉 범위·캐시 적중 및 만료 뒤에도 10분간 사유 보존', async () => {
    const h = harness();
    await h.get();
    const d = await h.diag();
    assert.equal(d.cache.hit, true); assert.equal(d.cache.valuePresent, true);
    assert.equal(d.observation.httpAttempted, true); assert.equal(d.observation.httpStatus, 200);
    assert.equal(d.observation.outcome, 'accepted');
    assert.equal(d.observation.validation.barCount, 2);
    assert.equal(d.observation.validation.firstBarET, `${day} 09:30:00`);
    assert.equal(d.observation.validation.latestBarET, `${day} 09:31:00`);
    const b = harness({ shared: h.shared });
    assert.deepEqual(json((await b.diag()).observation), json(d.observation), '다른 인스턴스에서 관측 공유');
    h.setNow(at('09:31:26'));
    assert.equal((await h.diag()).cache.hit, false);
    assert.equal((await h.diag()).observation.outcome, 'accepted');
    h.setNow(at('09:41:10'));
    assert.equal((await h.diag()).observationState, 'not_observed');
    assert.equal(h.shared.calls, 1); assert.deepEqual(h.shared.writes, [15]);
});

for (const [opts, outcome, status] of [
    [{ noKey: true }, 'missing_fmp_key', null],
    [{ status: 403 }, 'http_error', 403],
    [{ status: 429 }, 'http_error', 429],
    [{ status: 500 }, 'http_error', 500],
    [{ error: 'TimeoutError' }, 'fetch_timeout', null],
    [{ error: 'Error' }, 'fetch_error', null],
    [{ parseError: true }, 'parse_error', 200],
    [{ lockError: true }, 'symbol_lock_error', null],
    [{ readError: true }, 'cache_read_error', null],
    [{ rows: [] }, 'validation_rejected', 200],
]) test(`진단 실패 사유 구별: ${outcome} / ${status} / ${JSON.stringify(opts)}`, async () => {
    const h = harness(opts);
    await h.get();
    const d = await h.diag();
    assert.equal(d.observation.outcome, outcome); assert.equal(d.observation.httpStatus, status);
    assert.equal(d.fmpKeyPresent, !opts.noKey);
    assert.ok(!JSON.stringify(d).includes('원천'));
    if (outcome === 'http_error') assert.equal(d.observation.validation, null, '오류 본문은 해석·반환하지 않는다');
});

test('진단: 공용 예산·종목 잠금·배경 차단을 HTTP 오류와 구별', async () => {
    const h = harness();
    await h.get(); await h.get('NVDA');
    assert.equal((await h.diag('NVDA')).observation.outcome, 'budget_unavailable');
    h.setNow(at('09:31:16')); await h.get('NVDA');
    assert.equal((await h.diag('NVDA')).observation.outcome, 'symbol_lock_unavailable');
    const ctx = background.newBgCtx('모형'); ctx.tripped = true;
    await background.runWithBg(ctx, async () => h.get('AAPL'));
    assert.equal((await h.diag('AAPL')).observation.outcome, 'background_tripped');
    assert.equal(h.shared.calls, 1);
});

test('진단 저장 장애가 기존 계산·15초 TTL을 바꾸지 않음', async () => {
    const h = harness({ diagError: true });
    assert.equal((await h.get()).vwap, 175);
    assert.equal((await h.read()).vwap, 175);
    assert.equal((await h.diag()).observation.outcome, 'accepted');
    assert.deepEqual(h.shared.writes, [15]);
});

for (const [rows, now, date, reason] of [
    [{}, at('09:32:10'), day, 'not_array'],
    [[], at('09:32:10'), '2026-10-20', 'date_mismatch'],
    [[], at('09:29:59'), day, 'outside_regular_session'],
    [[], at('09:32:10'), day, 'no_regular_minutes'],
    [[bar('30', 0)], at('09:32:10'), day, 'invalid_price'],
    [[bar('30', 100, -1)], at('09:32:10'), day, 'invalid_volume'],
    [[bar('30', 100, 10n), bar('30')], at('09:32:10'), day, 'invalid_volume'],
    [[bar('30'), bar('30', 200)], at('09:32:10'), day, 'conflicting_duplicate'],
    [[bar('31')], at('09:32:10'), day, 'missing_open_minute'],
    [[bar('30'), bar('32')], at('09:32:10'), day, 'missing_middle_minutes'],
    [[bar('30')], at('09:33:00'), day, 'stale_latest_minute'],
    [[bar('30', 100, 0)], at('09:32:10'), day, 'session_vwap_unavailable'],
]) test(`분봉 조건별 진단: ${reason}`, () => {
    const result = harness().api.inspectRealtimeVwapMinutes(rows, date, now);
    assert.equal(result.value, null); assert.ok(result.validation.rejected.includes(reason));
});

test('진단: 분 누락 목록·건너뛴 봉의 각 조건, 원천 문자열은 반환하지 않음', () => {
    const rows = [bar('30'), bar('32'), null,
        { ...bar('30'), date: '해석 불가 원천 문자열' },
        { ...bar('30'), date: `${day} 09:33:00` },
        { ...bar('30'), date: '2026-10-20 09:30:00' },
        { ...bar('30'), date: `${day} 09:29:00` }];
    const r = harness().api.inspectRealtimeVwapMinutes(rows, day, at('09:32:10'));
    assert.deepEqual(json(r.validation.missingMinutesET), [`${day} 09:31:00`]);
    assert.deepEqual(json(r.validation.skipped), { invalidTime: 2, future: 1, otherDate: 1, outsideRegular: 1 });
    assert.ok(!JSON.stringify(r).includes('원천 문자열'));
});

test('신선도 경계: 2분 지연 허용·3분 거절, 전부 0 거래량과 누적 오버플로 거절', () => {
    const api = harness().api;
    assert.equal(api.inspectRealtimeVwapMinutes([bar('30')], day, at('09:32:59')).value.vwap, 100);
    assert.equal(api.inspectRealtimeVwapMinutes([bar('30')], day, at('09:33:00')).value, null);
    for (const rows of [[bar('30', 100, 0)], [bar('30', Number.MAX_VALUE, Number.MAX_VALUE)]]) {
        const result = api.inspectRealtimeVwapMinutes(rows, day, at('09:30:10'));
        assert.equal(result.value, null);
        assert.ok(result.validation.rejected.includes('session_vwap_unavailable'));
    }
});

for (const noKey of [false, true]) test(`FMP 기본 disabled: HTTP·잠금·저장소 읽기/쓰기 0 (${noKey})`, async () => {
    const h = harness({ disabled: true, noKey, readError: true });
    assert.equal(await h.get(), null);
    assert.equal(await h.read(), null);
    const d = await h.diag();
    assert.equal(d.observationState, 'disabled'); assert.equal(d.eligible, false);
    assert.equal(d.cache.hit, false); assert.equal(d.observation, null);
    assert.equal(h.shared.calls, 0); assert.equal(h.shared.locks.size, 0); assert.equal(h.shared.cache.size, 0);
});
