// Offline integration: actual stockApi session mask → actual VWAP, with all I/O blocked.
// Run: node --test tests/earlyCloseVwap.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const compiled = new Map();
function load(relative, dependencies = {}, DateImpl = Date) {
    if (!compiled.has(relative)) {
        const source = fs.readFileSync(path.join(root, relative), 'utf8');
        compiled.set(relative, ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        }).outputText);
    }
    const exports = {};
    vm.runInNewContext(compiled.get(relative), {
        exports, Date: DateImpl, Response, URL, process: { env: {} }, console: { log() {}, warn() {}, error() {} },
        fetch: () => { throw new Error('Unexpected network access'); },
        require(id) {
            if (Object.hasOwn(dependencies, id)) return dependencies[id];
            throw new Error(`Unexpected dependency: ${id}`);
        },
    }, { filename: relative });
    return exports;
}
const calendar = load('src/lib/marketCalendar.ts');
const { sessionVwapFromBars } = load('src/lib/vwap.ts');
const blocked = new Proxy({}, { get: () => () => { throw new Error('Unexpected I/O call'); } });
function stockApi(massive = blocked, DateImpl = Date) {
    return load('src/services/stockApi.ts', {
        '@/lib/marketCalendar': calendar,
        './extendedSessionClose': blocked,
        '@/services/stockTypes': blocked,
        './massiveClient': massive,
        './weekendOptionsCache': blocked,
    }, DateImpl);
}
const { maskOneDaySessions } = stockApi();
const et = (day, time) => Date.parse(`${day}T${time}:00-05:00`); // Fixtures below are all EST.
const bar = (day, time, price = 100, volume = 500) => ({
    date: new Date(et(day, time)).toISOString(),
    open: price, high: price, low: price, close: price, volume,
});
const realRows = rows => Array.from(rows).filter(r => !r._gapBreak && !r._syntheticAnchor);
const dateAt = now => class extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
};

test('2026-11-27: 12:59 500주@$100 + 14:00 500주@$200 → 정규장 VWAP $100', () => {
    const day = '2026-11-27';
    const rows = maskOneDaySessions([bar(day, '12:59'), bar(day, '14:00', 200)], et(day, '14:15'));
    assert.deepEqual(realRows(rows).map(r => r.session), ['REG', 'POST']);
    assert.equal(realRows(rows).length, 2, '시간외 봉도 보존한다');
    assert.deepEqual({ ...sessionVwapFromBars(rows) }, { vwap: 100, date: day, bars: 1 });
});

for (const day of ['2026-11-27', '2026-12-24', '2027-11-26']) {
    test(`${day}: 09:30 개장 · 13:00부터 POST · 20:00 종료`, () => {
        const times = ['03:59', '04:00', '09:29', '09:30', '12:59', '13:00', '14:00', '19:59', '20:00'];
        const rows = maskOneDaySessions(times.map(t => bar(day, t)), et(day, '14:15'));
        assert.deepEqual(realRows(rows).map(r => [r.etMinute, r.session]), [
            [240, 'PRE'], [569, 'PRE'], [570, 'REG'], [779, 'REG'],
            [780, 'POST'], [840, 'POST'], [1199, 'POST'],
        ]);
        assert.equal(rows.sessionMaskDebug.currentSession, 'POST');
        assert.equal(sessionVwapFromBars(rows).bars, 2);
    });
}

test('일반 거래일 2026-11-25: 13시·15:59는 REG, 16:00부터 POST', () => {
    const day = '2026-11-25';
    const rows = maskOneDaySessions([
        bar(day, '09:29', 900), bar(day, '09:30'), bar(day, '13:00'),
        bar(day, '15:59'), bar(day, '16:00', 200), bar(day, '20:00', 900),
    ], et(day, '16:15'));
    assert.deepEqual(realRows(rows).map(r => r.session), ['PRE', 'REG', 'REG', 'REG', 'POST']);
    assert.deepEqual({ ...sessionVwapFromBars(rows) }, { vwap: 100, date: day, bars: 3 });
});

test('주말·연도별 휴장일 봉은 REG가 되지 않는다', () => {
    for (const day of ['2026-11-26', '2026-11-28', '2027-11-25']) {
        const rows = maskOneDaySessions([bar(day, '12:00')], et(day, '14:15'));
        assert.equal(rows.length, 0, day);
        assert.equal(sessionVwapFromBars(rows), null);
    }
    const day = '2027-11-26'; // 2026년 추수감사절의 월/일을 다음 해에 재사용하지 않는다.
    assert.equal(realRows(maskOneDaySessions([bar(day, '12:00')], et(day, '12:15')))[0].session, 'REG');
});

test('조기 폐장일 POST 봉만 있으면 정규장 VWAP는 null', () => {
    const day = '2026-11-27';
    const rows = maskOneDaySessions([bar(day, '13:00', 200), bar(day, '14:00', 200)], et(day, '14:15'));
    assert.equal(realRows(rows).length, 2);
    assert.equal(sessionVwapFromBars(rows), null);
});

test('조기 폐장일 시간외 합성 시작점은 13:00, 거래량 0이므로 VWAP 제외', () => {
    const rows = maskOneDaySessions([bar('2026-11-25', '12:59')], et('2026-11-27', '13:01'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]._syntheticAnchor, true);
    assert.equal(rows[0].session, 'POST');
    assert.equal(rows[0].etMinute, 780);
    assert.equal(rows[0].volume, 0);
    assert.equal(sessionVwapFromBars(rows), null);
});

test('조회 창에 조기 폐장 후 봉 30개만 있으면 5일 재조회로 정규장 봉을 찾는다', async () => {
    const day = '2026-11-27';
    const now = et(day, '14:15');
    const post = Array.from({ length: 30 }, (_, i) => ({
        t: et(day, '13:00') + i * 60_000, o: 200, h: 200, l: 200, c: 200, v: 500,
    }));
    const calls = [];
    const api = stockApi({ fetchMassive: async endpoint => {
        calls.push(endpoint);
        return { results: calls.length === 1 ? post : [
            { t: et(day, '12:59'), o: 100, h: 100, l: 100, c: 100, v: 500 }, ...post,
        ] };
    } }, dateAt(now));
    const rows = await api.getStockChartData('TEST', '1d');
    assert.equal(calls.length, 2);
    assert.ok(calls[0].includes('/2026-11-25/2026-11-27'));
    assert.ok(calls[1].includes('/2026-11-22/2026-11-27'));
    assert.deepEqual({ ...sessionVwapFromBars(rows) }, { vwap: 100, date: day, bars: 1 });
    assert.equal(realRows(rows).filter(r => r.session === 'POST').length, 30);
});

for (const [day, time, cachedPhase, expectedFetches] of [
    ['2026-11-27', '13:00', 'POST', 0],
    ['2026-11-27', '14:15', 'POST', 0],
    ['2026-11-27', '13:00', 'REG', 1],
    ['2026-11-25', '15:00', 'REG', 0],
    ['2026-11-25', '16:00', 'REG', 1],
]) {
    test(`차트 캐시 ${day} ${time} / ${cachedPhase}: 두 요청에 재조회 ${expectedFetches}회`, async () => {
        const now = et(day, time);
        const FixedDate = dateAt(now);
        const rows = maskOneDaySessions(
            ['09:30', '09:31', '12:57', '12:58', '12:59', '13:00'].map(t => bar(day, t)), now,
        );
        let cached = { data: rows, sessionMaskDebug: { currentSession: cachedPhase }, _builtAt: now };
        let fetches = 0;
        const route = load('src/app/api/chart/route.ts', {
            'next/server': { NextResponse: { json: data => Response.json(data) } },
            '@/lib/marketCalendar': calendar,
            '@/services/timezoneUtils': load('src/services/timezoneUtils.ts', {}, FixedDate),
            '@/services/buildIdSSOT': { getBuildId: () => 'offline' },
            '@/services/stockApi': { getStockChartData: async () => { fetches++; return rows; } },
            '@/services/redisClient': {
                getFromCache: async () => cached,
                setInCache: async (_key, value) => { cached = value; },
            },
        }, FixedDate);
        for (let i = 0; i < 2; i++) {
            const response = await route.GET({ url: 'https://offline.invalid/api/chart?symbol=TEST&range=1d' });
            assert.equal(response.status, 200);
            const body = await response.json();
            assert.equal(body.data.length, rows.length);
            if (i === 1 || expectedFetches === 0) assert.equal(body.meta._cached, true);
        }
        assert.equal(fetches, expectedFetches);
    });
}
