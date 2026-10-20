/**
 * origin/main 고정 사본과 현재 실제 구현을 동일 입력으로 실행한다. 외부 I/O 없음.
 * 허용: 이전 결과와 완전히 같음, 또는 독립적으로 정한 정답과 완전히 같음.
 * 정답은 모의 공급사 체결/공식 종가 또는 관문 재현값이며 운영 실측을 뜻하지 않는다.
 * 실행: ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/priceHardeningComparison.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import * as calendar from '../src/lib/marketCalendar';
const clock = require('../scripts/integrity/clock');
const fixtureDir = path.join(__dirname, 'fixtures/price-hardening-origin-main');
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'));
for (const [file, digest] of Object.entries(manifest.sha256)) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(fixtureDir, file))).digest('hex'), digest, file);
}
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const before = (name: string) => fs.readFileSync(path.join(fixtureDir, name + '.txt'), 'utf8');
const plain = (v: any) => JSON.parse(JSON.stringify(v));
const quiet = { log() {}, warn() {}, error() {} };
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
} }).outputText;
function load(source: string, dependencies: Record<string, any>, globals: Record<string, any> = {}) {
    const exports = {};
    const context = vm.createContext({ exports, module: { exports }, console: quiet, Date, URL, URLSearchParams,
        AbortController, AbortSignal, setTimeout, clearTimeout, crypto,
        process: { env: { INTRINIO_API_KEY: 'fixture-placeholder' } },
        require: (name: string) => {
            assert.ok(Object.hasOwn(dependencies, name), `격리되지 않은 의존성: ${name}`);
            return dependencies[name];
        }, ...globals });
    vm.runInContext(compile(source), context);
    return (context as any).module.exports;
}
const rows: Array<Record<string, any>> = [];
function compare(name: string, old: any, next: any, truth: any, mustKeep = false) {
    old = plain(old); next = plain(next); truth = plain(truth);
    const same = JSON.stringify(old) === JSON.stringify(next);
    if (mustKeep || same) assert.deepEqual(next, old, `${name}: 근거 부족 시 기존 동작 유지`);
    else assert.deepEqual(next, truth, `${name}: 값 변경은 독립 정답과 일치할 때만 허용`);
    rows.push({ scenario: name, origin: JSON.stringify(old), current: JSON.stringify(next),
        truth: JSON.stringify(truth), verdict: same ? 'same' : 'corrected' });
}
const sec = (date: string, time: string) => clock.etToMs(date, time) / 1000;
const point = (date: string, time: string, c: number | null) => ({ ts: sec(date, time), c });

async function indexTable() {
    const old = load(before('indexQuoteReconcile.ts'), { '@/lib/marketCalendar': calendar }).reconcileIndexQuote;
    const next = load(read('src/lib/indexQuoteReconcile.ts'), { '@/lib/marketCalendar': calendar }).reconcileIndexQuote;
    const base = { metaPrice: 51850.6, metaTimeSec: sec('2026-10-12', '16:00'), metaPrevClose: 51654.9,
        bars: [point('2026-10-13', '15:59', 51672.1484375)], regularEndSec: sec('2026-10-13', '16:00'),
        daily: [point('2026-10-09', '09:30', 51654.949), point('2026-10-12', '09:30', 51850.5508)] };
    const cases: Array<{ name: string; input: any; truth: [number, number]; keep?: boolean; fail?: boolean }> = [
        { name: 'meta 하루 묵음', input: base, truth: [51672.1484375, 51850.5508] },
        { name: '일봉 실패 DOW 반전', input: { ...base, daily: null }, truth: [51672.1484375, 51850.5508], keep: true, fail: true },
        { name: '직전 거래일 일봉 누락', input: { ...base, daily: base.daily.slice(0, 1) }, truth: [51672.1484375, 51850.5508], keep: true },
        { name: '일봉 빈 배열', input: { ...base, daily: [] }, truth: [51672.1484375, 51850.5508], keep: true },
        { name: '직전 거래일 종가 null', input: { ...base, daily: [base.daily[0], { ...base.daily[1], c: null }] }, truth: [51672.1484375, 51850.5508], keep: true },
        { name: '시각 누락', input: { ...base, metaTimeSec: null, daily: null }, truth: [51672.1484375, 51850.5508], keep: true },
        { name: '정규장 20분 묵음·일봉 실패', input: { ...base, metaPrice: 100.4, metaPrevClose: 100,
            metaTimeSec: sec('2026-10-13', '10:00'), bars: [point('2026-10-13', '10:20', 100.2)], daily: null }, truth: [100.2, 100], keep: true, fail: true },
        { name: '거의 보합·일봉 실패·호출자 폴백', input: { ...base, metaPrice: 100.002, metaPrevClose: 100,
            metaTimeSec: sec('2026-10-13', '16:00'), bars: [], daily: null }, truth: [100.002, 100], keep: true, fail: true },
        { name: '거의 보합·일봉 누락·호출자 폴백', input: { ...base, metaPrice: 100.002, metaPrevClose: 100,
            metaTimeSec: sec('2026-10-13', '16:00'), bars: [], daily: [point('2026-10-09', '09:30', 99.8)] }, truth: [100.002, 100], keep: true },
        { name: '휴장 뒤 일봉 역순·날짜 근거 있음', input: { ...base, metaPrice: 101, metaPrevClose: 98,
            metaTimeSec: sec('2026-09-08', '16:00'), bars: [], regularEndSec: sec('2026-09-08', '16:00'),
            daily: [point('2026-09-04', '09:30', 100), point('2026-09-03', '09:30', 99)] }, truth: [101, 100] },
    ];
    for (const [name, date, time, prior] of [
        ['정규장', '2026-10-13', '11:00', '2026-10-12'], ['프리', '2026-10-12', '16:00', '2026-10-09'],
        ['애프터', '2026-10-13', '16:00', '2026-10-12'], ['주말', '2026-10-09', '16:00', '2026-10-08'],
        ['휴장', '2026-11-25', '16:00', '2026-11-24'], ['반일장 11/27', '2026-11-27', '13:00', '2026-11-25'],
    ]) cases.push({ name, input: { metaPrice: 101, metaPrevClose: 100, metaTimeSec: sec(date, time),
        bars: [point(date, time, 101)], regularEndSec: sec(date, time), daily: [point(prior, '09:30', 100)] }, truth: [101, 100] });

    function caller(source: string, reconcile: any, input: any, failed = false) {
        const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
        const fn = ast.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === 'fetchOneQuote')!;
        const fetch = async (url: string) => {
            assert.equal(new URL(url).hostname, 'query1.finance.yahoo.com');
            const minute = url.includes('interval=1m');
            const series = minute ? input.bars : input.daily || [];
            return { ok: minute || !failed, json: async () => ({ chart: { result: [{
                meta: { regularMarketPrice: input.metaPrice, regularMarketTime: input.metaTimeSec,
                    previousClose: input.metaPrevClose, currentTradingPeriod: { regular: { end: input.regularEndSec } } },
                timestamp: series.map((b: any) => b.ts), indicators: { quote: [{ close: series.map((b: any) => b.c) }] },
            }] } }) };
        };
        return vm.runInNewContext(`${compile(fn.getText(ast).replace(/^export\s+/, ''))}; fetchOneQuote`, {
            fetch, reconcileIndexQuote: reconcile, REAL_INDEX_SYMBOLS: new Set(['^DJI', '^IXIC', '^GSPC']),
            AbortSignal, Date, console: quiet,
        });
    }
    const project = (r: any) => ({ price: r.price, prevClose: r.prevClose, marketTimeSec: r.marketTimeSec,
        priceFromBars: r.priceFromBars, prevFromDaily: r.prevFromDaily });
    for (const c of cases) {
        const a = old(c.input), b = next(c.input);
        compare(`지수/${c.name}`, project(a), project(b), { ...project(b), price: c.truth[0], prevClose: c.truth[1] }, c.keep);
        for (const symbol of ['^DJI', '^IXIC', '^GSPC']) {
            const a = await caller(before('route.ts'), old, c.input, c.fail)(symbol);
            const b = await caller(read('src/services/jobs/marketFeedJob.ts'), next, c.input, c.fail)(symbol);
            assert.ok(a && b, `${c.name} ${symbol}`);
            const pick = (q: any) => ({ price: q.price, prevClose: q.prevClose, changePct: q.changePct, marketTime: q.marketTime });
            compare(`호출자/${symbol}/${c.name}`, pick(a), pick(b), { price: c.truth[0], prevClose: c.truth[1],
                changePct: (c.truth[0] - c.truth[1]) / c.truth[1] * 100, marketTime: b.marketTime }, c.keep);
            if (c.name === '일봉 실패 DOW 반전') assert.ok(b.changePct < -0.34 && b.changePct > -0.35);
        }
    }
}

// 각 판본/시나리오는 별도 VM·시계·저장소. 여러 인스턴스만 같은 모의 저장소를 공유한다.
function sipHarness(source: string, date: string, time: string, tradeTime = '18:58:22') {
    let now = clock.etToMs(date, time), status = 200;
    const values = new Map<string, { value: any; until: number }>();
    const calls: string[] = [], queue: Array<() => Promise<any>> = [];
    const get = (key: string) => {
        const entry = values.get(key);
        if (entry && entry.until <= now) values.delete(key);
        return values.get(key)?.value ?? null;
    };
    const set = (key: string, value: any, ttl: number) => { values.set(key, { value, until: now + ttl * 1000 }); return true; };
    class ClockDate extends Date {
        constructor(...args: any[]) { if (!args.length) super(now); else super(args[0]); }
        static now() { return now; }
    }
    const iso = (time: string) => new Date(clock.etToMs(date, time)).toISOString();
    const def = { source: 'cboe_one_delayed', last_price: 222, last_time: iso(time < '09:30' ? '04:00:01' : '13:00:09'), last_size: 100,
        normal_market_hours_last_price: 221, normal_market_hours_last_time: iso('12:59:59'),
        eod_close_price: 220, eod_close_date: clock.prevTradingDay(date) };
    const dependencies = {
        './redisClient': { getFromCache: async (k: string) => get(k), setInCache: async (k: string, v: any, ttl: number) => set(k, v, ttl) },
        '@/lib/marketCalendar': calendar, 'next/server': { after: (fn: () => Promise<any>) => queue.push(fn) },
        '@/lib/intrinioWarmGate': { warmGateStore: { getStore: () => undefined } },
        '@/lib/intrinioBackground': { bgStore: { getStore: () => undefined } },
        '@/lib/intrinioCallMeter': { noteCall() {} }, '../../scripts/integrity/clock': clock,
        '@/lib/intrinioMeter': { note429() {}, upstashMeterStore: { setNxEx: async (k: string, v: any, ttl: number) => get(k) == null && set(k, v, ttl) },
            releaseMeterClaim: async (k: string, owner: string) => { if (get(k) === owner) values.delete(k); } },
    };
    const fetch = async (url: string) => {
        const u = new URL(url); assert.equal(u.hostname, 'api-v2.intrinio.com');
        u.searchParams.delete('api_key'); // 모의 자격값도 출력에 포함하지 않는다.
        const json = (data: any) => ({ status: 200, ok: true, json: async () => data });
        if (u.pathname.endsWith('/trades')) {
            calls.push(u.pathname);
            if (status !== 200) return { status, ok: false, json: async () => ({}) };
            const tradeMs = clock.etToMs(date, tradeTime);
            const inside = tradeMs >= clock.etToMs(date, u.searchParams.get('start_time'))
                && tradeMs <= clock.etToMs(date, u.searchParams.get('end_time'));
            return json({ source: 'utp_delayed', trades: inside ? [{ price: 222.5, size: 2, condition: '@ TI', timestamp: iso(tradeTime) }] : [] });
        }
        if (u.pathname.endsWith('/prices/realtime')) return json(u.searchParams.get('source') === 'equities_edge'
            ? { ...def, source: 'equities_edge', last_price: 223, last_time: new Date(now - 9000).toISOString() } : def);
        if (u.pathname.endsWith('/prices')) return json({ stock_prices: [{ date, close: 221 }, { date: clock.prevTradingDay(date), close: 220 }] });
        throw new Error(`허용하지 않은 모의 경로: ${u.pathname}`);
    };
    const fresh = () => load(source, dependencies, { Date: ClockDate, fetch });
    const flush = async () => { while (queue.length) await Promise.all(queue.splice(0).map(fn => fn())); };
    return { fresh, flush, get, calls, set, status: (s: number) => { status = s; },
        time: (t: string) => { now = clock.etToMs(date, t); }, advance: (ms: number) => { now += ms; } };
}
async function sipTable() {
    const close = load(read('src/services/extendedSessionClose.ts'), {
        'next/server': {}, './redisClient': {}, './intrinioClient': {}, '@/lib/marketCalendar': calendar,
    });
    assert.equal(close.isExtCloseFinal('2026-11-27', 'post', clock.etToMs('2026-11-27', '20:16:59')), false);
    assert.equal(close.isExtCloseFinal('2026-11-27', 'post', clock.etToMs('2026-11-27', '20:17:00')), true);
    const sources = [before('intrinioClient.ts'), read('src/services/intrinioClient.ts')];
    for (const [name, date, time, trade, truth] of [
        ['정규장', '2026-10-13', '11:00', '10:30', 223], ['프리', '2026-10-13', '08:00', '07:40', 222.5],
        ['애프터', '2026-10-13', '19:40', '18:58:22', 222.5], ['주말', '2026-10-10', '18:00', '17:00', 222],
        ['휴장', '2026-11-26', '16:30', '16:00:01', 222],
        ['반일장 11/27 13:30', '2026-11-27', '13:30', '13:05', 222.5],
        ['반일장 11/27 16:30·15:50 체결', '2026-11-27', '16:30', '15:50', 222.5],
        ['반일장 11/27 18:00·17시 이후 체결', '2026-11-27', '18:00', '17:30', 222.5],
    ] as Array<[string, string, string, string, number]>) {
        const out = [];
        for (const source of sources) {
            const h = sipHarness(source, date, time, trade), c = h.fresh();
            await c.getTickerSnapshot('PGR'); await h.flush();
            out.push((await c.getTickerSnapshot('PGR')).ticker.lastTrade.p); await h.flush();
        }
        compare(`SIP/${name}`, out[0], out[1], truth);
    }
    const boundary = [];
    for (const source of sources) {
        const h = sipHarness(source, '2026-11-27', '16:59', '16:30'), c = h.fresh(), prices = [];
        await c.getTickerSnapshot('PGR'); await h.flush();
        for (const time of ['16:59', '17:00', '17:01', '18:00', '20:16', '20:17']) {
            h.time(time);
            if (time === '20:16') h.set('ext:siplive:v1:POST:PGR:2026-11-27', { p: 222.5, t: '2026-11-27T21:30:00Z' }, 90);
            await c.getTickerSnapshot('PGR'); await h.flush();
            prices.push((await c.getTickerSnapshot('PGR')).ticker.lastTrade.p); await h.flush();
        }
        boundary.push(prices);
    }
    for (const [i, time] of ['16:59', '17:00', '17:01', '18:00', '20:16', '20:17'].entries()) {
        compare(`SIP/반일장 경계 ${time}`, boundary[0][i], boundary[1][i], 222.5);
    }
    for (const mode of ['budget', '429', 'concurrent']) {
        const out: number[][] = [];
        for (const [version, source] of sources.entries()) {
            const h = sipHarness(source, '2026-10-13', '19:40');
            const c = h.fresh();
            if (mode === 'budget') {
                for (let i = 0; i < 6; i++) { await c.getTickerSnapshot(`CAP${i}`); await h.flush(); }
                assert.equal(h.calls.length, 5);
                if (version === 1) {
                    assert.equal(h.get('ext:siplive:v1:POST:CAP5:2026-10-13'), null);
                    assert.equal(h.get('ext:siplive:v1:POST:CAP5:2026-10-13:claim'), null);
                }
                const prices = [];
                for (const elapsed of [11_000, 48_000, 2_000]) {
                    h.advance(elapsed); await c.getTickerSnapshot('CAP5'); await h.flush();
                    prices.push((await c.getTickerSnapshot('CAP5')).ticker.lastTrade.p); await h.flush();
                }
                out.push(prices);
            } else if (mode === '429') {
                h.status(429); await c.getTickerSnapshot('RATE'); await h.flush();
                if (version === 1) {
                    assert.equal(h.calls.length, 2);
                    assert.deepEqual(plain(h.get('ext:siplive:v1:POST:RATE:2026-10-13')), { none: true, failed: true });
                }
                h.advance(21_000); await c.getTickerSnapshot('RATE'); await h.flush();
                const failed = (await c.getTickerSnapshot('RATE')).ticker.lastTrade.p;
                h.status(200); h.advance(40_000); await c.getTickerSnapshot('RATE'); await h.flush();
                out.push([failed, (await c.getTickerSnapshot('RATE')).ticker.lastTrade.p]); await h.flush();
            } else {
                const clients = Array.from({ length: 8 }, h.fresh);
                await Promise.all(clients.map(c => c.getTickerSnapshot('PGR'))); await h.flush();
                if (version === 1) assert.equal(h.calls.length, 1);
                out.push(await Promise.all(clients.map(async c => (await c.getTickerSnapshot('PGR')).ticker.lastTrade.p))); await h.flush();
            }
        }
        compare(`SIP/${mode === 'budget' ? '6종목 예산·11/59/61초' : mode === '429' ? '429 실패·61초 회복' : '8인스턴스 동시 요청'}`,
            out[0], out[1], mode === 'budget' ? [222.5, 222.5, 222.5] : mode === '429' ? [222, 222.5] : Array(8).fill(222.5));
    }
}

function rulesTable() {
    assert.equal(read('scripts/integrity/rules.js'), before('rules.js'), '감시기는 origin/main 과 바이트 단위 동일');
    const old = load(before('rules.js'), { './clock': clock });
    const next = require('../scripts/integrity/rules');
    const daily = (values: Record<string, number>) => ({ ok: true, daily: Object.entries(values).map(([date, c]) => ({ date, c })), events: [] });
    for (const [symbol, time, base, price, previous, volume] of [
        ['AZZ', '19:32', 137.16, 136.71, 137.76, 128661], ['DOW', '20:05', 28.3, 28.51, 28.12, 1000],
    ] as Array<[string, string, number, number, number, number]>) {
        const now = clock.etToMs('2026-10-13', time), session = clock.sessionAt(now);
        const bar = (time: string, c: number, v: number) => ({ t: clock.etToMs('2026-10-13', time), o: c, h: c, l: c, c, v });
        const raw = { yd: daily({ '2026-10-12': previous, '2026-10-13': base }),
            y1m: { ok: true, bars: [bar('16:00', base, 1100), bar('16:04', price, volume)],
                meta: symbol === 'DOW' ? { regularMarketPrice: price, regularMarketTime: clock.etToMs('2026-10-13', '16:00:02') } : undefined } };
        const result = (rules: any) => rules.judgeFlowShown(now, session, rules.deriveRef(now, session, raw), symbol, 'screen:flow',
            { price, pct: (price - previous) / previous * 100 }, { skipExt: true }).filter((f: any) => f.code === 'CLOSE_PRICE' && f.sev === 'error').length;
        compare(`감시기/${symbol} ${time} CLOSE_PRICE`, result(old), result(next), 0);
        assert.equal(result(next), 0);
    }
}

(async () => {
    await indexTable(); await sipTable(); rulesTable();
    console.table(rows);
    console.log(`${rows.length} comparison rows passed`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
