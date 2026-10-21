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
            getFromCache: async key => shared.cache.get(key) ?? null,
            setInCache: async (key, value, ttl) => { shared.cache.set(key, value); shared.writes.push(ttl); return true; },
        },
    };
    const api = load('src/services/realtimeSessionVwap.ts', mocks, {
        Date: class extends Date { static now() { return now; } },
        fetch: async (url, init) => {
            const u = new URL(url);
            assert.equal(u.hostname, 'financialmodelingprep.com');
            assert.equal(u.pathname, '/stable/historical-chart/1min');
            assert.equal(u.searchParams.get('from'), day); assert.equal(u.searchParams.get('to'), day);
            assert.equal(init.cache, 'no-store');
            shared.calls++;
            if (options.error) throw Error('모형 시간 초과');
            if (options.started) options.started();
            if (options.wait) await options.wait;
            if (options.delay) await new Promise(resolve => setTimeout(resolve, 20));
            return { status: options.status ?? 200, ok: options.status !== 429, json: async () => options.rows ?? [bar('30'), bar('31', 200, 300)] };
        },
    });
    return { api, shared, read: (symbol = 'IBM', date = day) => api.readRealtimeSessionVwap(symbol, date, now), setNow: value => { now = value; }, get: (symbol = 'IBM', date = day) => api.getRealtimeSessionVwap(symbol, date, now) };
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
