// 실행: /usr/bin/lockf -k /tmp/signum-heavy.lock node --test tests/rankingEtDay.test.cjs
// 외부 I/O 없이 실제 엔진 세 함수의 날짜 정확성·호출 수·성능을 검증한다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const ts = require('typescript');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const source = read('src/lib/rankings/engine.ts');
function compile(text, imports = {}, globals = {}) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(text, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    } }).outputText, { exports, Date, ...globals, require: name => {
        assert.ok(name in imports, `Unmocked import: ${name}`);
        return imports[name];
    } });
    return exports;
}
const calendar = compile(read('src/lib/marketCalendar.ts'));
const engineOf = (calendarOverride = calendar, globals = {}, text = source) =>
    compile(text, { '@/lib/marketCalendar': calendarOverride }, globals);
const HOUR = 3600_000;

test('DST 시작·종료 전후 1시간: 분마다, 정시 ±1ms에서 etDateOf와 일치', () => {
    const engine = engineOf();
    for (let year = 2007; year <= 2040; year++) {
        const marchSunday = 1 + (7 - new Date(Date.UTC(year, 2, 1)).getUTCDay()) % 7;
        const novemberSunday = 1 + (7 - new Date(Date.UTC(year, 10, 1)).getUTCDay()) % 7;
        for (const boundary of [Date.UTC(year, 2, marchSunday + 7, 7), Date.UTC(year, 10, novemberSunday, 6)]) {
            const samples = [];
            for (let minute = -60; minute <= 60; minute++) samples.push(boundary + minute * 60_000);
            samples.push(boundary - 1, boundary + 1);
            // 역순 재방문으로 캐시 적중 결과도 확인한다.
            for (const ms of [...samples, ...samples.reverse()]) {
                assert.equal(engine.etDay(ms), calendar.etDateOf(ms), new Date(ms).toISOString());
            }
        }
    }
});

test('ET 자정·연말·윤일: 겨울 05Z/여름 04Z 경계와 시간 안의 양 끝이 일치', () => {
    const engine = engineOf();
    for (const midnight of ['2026-01-01T05:00:00Z', '2026-03-08T05:00:00Z',
        '2026-03-09T04:00:00Z', '2026-07-01T04:00:00Z', '2026-11-01T04:00:00Z',
        '2026-11-02T05:00:00Z', '2027-01-01T05:00:00Z', '2028-02-29T05:00:00Z']) {
        const boundary = Date.parse(midnight);
        for (const delta of [-HOUR, -1, 0, 1, HOUR - 1, HOUR]) {
            const ms = boundary + delta;
            assert.equal(engine.etDay(ms), calendar.etDateOf(ms), new Date(ms).toISOString());
        }
        assert.notEqual(engine.etDay(boundary - 1), engine.etDay(boundary));
    }
});

test('역사적 비정수 시차·잘못된 시각도 날짜 정본과 같은 결과를 보존한다', () => {
    const engine = engineOf();
    for (const iso of ['1883-11-17T04:56:01Z', '1883-11-17T04:56:02Z',
        '1883-11-18T16:59:59Z', '1883-11-18T17:00:00Z', '1974-01-07T04:59:59Z']) {
        const ms = Date.parse(iso);
        assert.equal(engine.etDay(ms), calendar.etDateOf(ms), iso);
    }
    // Date 상한의 유효 시각과 바로 다음 무효 시각도 같은 캐시 키로 섞이지 않는다.
    for (const ms of [NaN, Infinity, -Infinity, -0.1, 8.64e15, 8.64e15 + 1, 8.64e15]) {
        assert.equal(engine.etDay(ms), calendar.etDateOf(ms), String(ms));
    }
});

test('같은 UTC 시간은 한 번만 변환하며 캐시는 4,096개를 넘지 않는다', () => {
    let calls = 0, peak = 0;
    class ObservedMap extends Map {
        set(key, value) { super.set(key, value); peak = Math.max(peak, this.size); return this; }
    }
    const engine = engineOf({ ...calendar, etDateOf: ms => { calls++; return calendar.etDateOf(ms); } }, { Map: ObservedMap });
    const start = Date.parse('2026-01-01T00:00:00Z');
    for (const offset of [0, 1, HOUR / 2, HOUR - 1]) engine.etDay(start + offset);
    assert.equal(calls, 1);
    for (let hour = 1; hour <= 4096; hour++) engine.etDay(start + hour * HOUR);
    assert.equal(peak, 4096);
    const before = calls;
    assert.equal(engine.etDay(start), calendar.etDateOf(start));
    assert.equal(calls, before + 1, '가장 오래된 시간은 퇴출 후 다시 계산한다');
});

test('세 집계 함수가 같은 시간 캐시를 공유한다', () => {
    let calls = 0;
    const engine = engineOf({ ...calendar, etDateOf: ms => { calls++; return calendar.etDateOf(ms); } });
    const rows = Array.from({ length: 4 }, (_, i) => ({ timestamp: Date.parse('2026-12-02T04:00:00Z') + i * 900_000,
        totalCallOI: 100 + i, totalPutOI: 100, atmIv: 20 + i }));
    assert.equal(engine.dailySnapshots(rows)[0]._d, '2026-12-01');
    assert.equal(engine.latestWith(rows, ['totalCallOI'])._d, '2026-12-01');
    assert.equal(engine.dailyValues(rows, 'atmIv')[0].d, '2026-12-01');
    assert.equal(calls, 1);
});

test('성능: 25종목 × 8,640행, 세 함수 합계가 고정 −4h 대비 1.5배 이내', t => {
    // DST 중인 90일의 레거시 이력: 고정 −4h 기준과 결과까지 같게 비교한다.
    const tickers = Array.from({ length: 25 }, (_, ticker) => Array.from({ length: 8640 }, (_, i) => ({
        timestamp: Date.parse('2026-06-01T00:00:00Z') + i * 900_000 + ticker * 1000,
        totalCallOI: 1000 + i % 97, totalPutOI: 500 + i % 31,
        callPremium: 200 + i % 17, putPremium: 100 + i % 11, atmIv: 20 + i % 13,
    })));
    const ast = ts.createSourceFile('engine.ts', source, ts.ScriptTarget.Latest, true);
    const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'etDay');
    assert.ok(fn, '기준선은 etDay만 교체하고 나머지 엔진 코드는 동일하게 실행한다');
    const fixedSource = source.slice(0, fn.getStart(ast)) +
        'export const etDay = (ms: number) => new Date(ms - 4 * 3600_000).toISOString().slice(0, 10);' + source.slice(fn.end);
    function run(engine, inputs) {
        const times = [], values = [];
        for (const aggregate of [rows => engine.dailySnapshots(rows),
            rows => engine.latestWith(rows, ['callPremium', 'putPremium', 'totalCallOI', 'totalPutOI']),
            rows => engine.dailyValues(rows, 'atmIv')]) {
            const start = performance.now();
            values.push(inputs.map(aggregate));
            times.push(performance.now() - start);
        }
        return { times, total: times.reduce((a, b) => a + b, 0), values };
    }
    // JIT 예열은 별도 인스턴스·작은 입력으로만 한다. 각 실측은 빈 날짜 캐시로 시작한다.
    run(engineOf(), [tickers[0].slice(0, 96)]);
    run(engineOf(calendar, {}, fixedSource), [tickers[0].slice(0, 96)]);
    const fixed = [], cached = [];
    for (let trial = 0; trial < 3; trial++) {
        const oldEngine = engineOf(calendar, {}, fixedSource), newEngine = engineOf();
        let before, after;
        if (trial % 2) { after = run(newEngine, tickers); before = run(oldEngine, tickers); }
        else { before = run(oldEngine, tickers); after = run(newEngine, tickers); }
        assert.equal(JSON.stringify(after.values), JSON.stringify(before.values));
        fixed.push(before.total); cached.push(after.total);
        t.diagnostic(`trial ${trial + 1}: fixed=${before.total.toFixed(1)}ms cached=${after.total.toFixed(1)}ms ` +
            `dailySnapshots/latestWith/dailyValues=${after.times.map(ms => ms.toFixed(1)).join('/')}ms`);
    }
    const median = samples => [...samples].sort((a, b) => a - b)[1];
    const ratio = median(cached) / median(fixed);
    t.diagnostic(`3회 중앙값: fixed=${median(fixed).toFixed(1)}ms cached=${median(cached).toFixed(1)}ms ratio=${ratio.toFixed(3)}`);
    assert.ok(ratio <= 1.5, `고정 −4h 대비 ${ratio.toFixed(3)}배 (상한 1.5배)`);
});
