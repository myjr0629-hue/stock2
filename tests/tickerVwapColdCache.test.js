// 실제 라우트·분봉 함수를 실행하는 오프라인 회귀 시험. 환경파일·네트워크·운영 저장소 접근 없음.
// 실행: node --test tests/tickerVwapColdCache.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const routeFile = 'src/app/api/live/ticker/route.ts';
const current = read(routeFile);
const copy = x => structuredClone(x);
const json = x => JSON.parse(JSON.stringify(x));
const RealDate = Date;
let NOW = RealDate.parse('2026-10-21T02:00:00Z');
global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
};
const silent = { log() {}, warn() {}, error() {} };
const compiledCache = new Map();
function load(source, mocks, extra = '', runtime = {}) {
    const module = { exports: {} };
    const requireMock = id => {
        assert.ok(Object.hasOwn(mocks, id), `모형이 없는 의존성: ${id}`);
        return mocks[id];
    };
    const compiled = compiledCache.get(source + extra) || ts.transpileModule(source + extra, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    compiledCache.set(source + extra, compiled);
    new Function('require', 'module', 'exports', 'console', 'process', 'fetch', compiled)(requireMock, module, module.exports, silent, { env: runtime.env || {} }, runtime.fetch || (() => { throw Error('금지된 네트워크 접근'); }));
    return module.exports;
}

const background = load(read('src/lib/intrinioBackground.ts'), { 'node:async_hooks': require('node:async_hooks') });
const calendar = load(read('src/lib/marketCalendar.ts'), {});
const dailyRsi = load(read('src/lib/dailyRsi.ts'), { '@/lib/marketCalendar': calendar });
const extendedSession = load(read('src/services/extendedSessionClose.ts'), {
    'next/server': {}, './redisClient': {}, './intrinioClient': {}, '@/lib/marketCalendar': calendar,
});
const vwap = load(read('src/lib/vwap.ts'), {});
const putCall = load(read('src/lib/putCall.ts'), {});
const bars = date => [
    { etDate: date, session: 'REG', high: 240, low: 240, close: 240, volume: 100 },
    { etDate: date, session: 'REG', high: 242, low: 242, close: 242, volume: 300 },
];
const fixture = (ticker = 'IBM', date = '2026-10-20') => ({
    ticker, name: ticker, price: 242, prevClose: 239, vwap: 241.5, vwapDate: date, session: 'CLOSED',
    tsServer: NOW, meta: { build: '모형' }, timestampET: '모형 기준시각', alpha: { score: 50 },
    prices: { regularCloseToday: 242, prevRegularClose: 239, regularDate: date }, display: {},
    flow: { oiPcr: 1, gex: 100, squeezeScore: 50, rawChain: [], allExpiryChain: [], gammaFlipType: null },
});
function harness(source, snapshot, mode = 'miss', skipAlpha = false, opts = {}) {
    const store = opts.store || new Map();
    const locks = opts.locks || new Set();
    const io = { minutes: 0, realtime: 0, writes: [], archiveReads: [] };
    const deferred = [];
    const calls = { responseKeys: [], lastGoodKeys: [], cachedRows: [], alphaChains: [], alphaRsi: [], urls: [], skewChains: [], sourceChains: 0 };
    const flow = snapshot.flow;
    const price = snapshot.price;
    const metrics = { pcr: flow.oiPcr, gex: flow.gex, squeezeScore: flow.squeezeScore };
    const levels = new Map([[snapshot.ticker, flow]]);
    const mocks = {
        '@/lib/app/intelOptionsBasis': { latestCollectorGexRow: async () => null },
        'next/server': { after: fn => deferred.push(fn) },
        '@/services/optionMetricsService': { readOptionMetrics: async () => new Map([[snapshot.ticker, metrics]]) },
        '@/services/oiNear35Fallback': { readOi35Fallback: async () => null },
        '@/services/optionAlphaService': { readOptionAlpha: async () => new Map([[snapshot.ticker, snapshot.alpha]]) },
        '@/lib/optionMetrics': { applyOptionMetrics: (target, m) => Object.assign(target, { netGex: m?.gex ?? null }), optionMetricsRowHasOi: () => true },
        '@/lib/vwap': vwap,
        '@/lib/dailyRsi': dailyRsi,
        '@/lib/intrinioBackground': background,
        '@/services/realtimeSessionVwap': { readRealtimeSessionVwap: async (ticker, date) => store.get(`모형:실시간:${ticker}:${date}`) || null,
            getRealtimeSessionVwap: async (ticker, date, now = Date.now()) => {
                if (calendar.cashSessionPhaseAt(now) !== 'regular') return null;
                const cached = store.get(`모형:실시간:${ticker}:${date}`);
                if (cached) return cached;
                io.realtime++;
                const value = opts.realtimeProvider ? await opts.realtimeProvider() : (opts.realtime || null);
                if (value) store.set(`모형:실시간:${ticker}:${date}`, value);
                return value;
            },
        },
        '@/lib/shortVolume': { shortVolFields: () => ({}) },
        '@/lib/sessionArchive': { lastCompletedSessionDate: () => calendar.etLastClosedSessionDate(NOW), readSessionArchive: async (_kind, _ticker, q) => { io.archiveReads.push(q); return opts.archive || null; }, saveSessionArchive: async () => {} },
        '@/services/stockApi': { getStockChartData: async () => [], getRegularSessionMinuteBars: async (ticker, date) => { io.minutes++; return opts.provider ? opts.provider(ticker, date) : bars(date); } },
        '@/lib/intrinioMeter': { upstashMeterStore: { setNxEx: async (key, _value, ttl) => { assert.equal(ttl, 60); if (opts.lockError) throw Error('모형 잠금 장애'); if (locks.has(key)) return false; locks.add(key); return true; } } },
        '@/services/timezoneUtils': { getETNow: () => ({ dateString: calendar.etDateOf(NOW) }), getSessionType: () => opts.session === 'regular' ? 'REG' : (opts.session || 'closed').toUpperCase() },
        '@/services/marketDaySSOT': { isUSMarketHolidayET: () => false },
        '@/services/buildMeta': { getBuildMeta: () => snapshot.meta },
        '@/services/massiveClient': { CACHE_POLICY: { LIVE: 'live' }, fetchMassive: async url => {
            calls.urls.push(url);
            if (url.includes('/v2/snapshot/')) return { ticker: mode === 'stale' ? {} : {
                _intrinio: { prevClose: snapshot.prevClose, regularDate: '2026-10-19' },
                lastTrade: { p: price, t: NOW * 1e6 }, day: { c: price, v: 1000 }, prevDay: { c: snapshot.prevClose, v: 900 },
            } };
            if (url.includes('/v2/aggs/')) return { results: opts.dailyRows ?? (mode === 'stale' ? [] : [
                { c: snapshot.prevClose, v: 1000, t: RealDate.parse('2026-10-16T00:00:00Z') },
                { c: snapshot.prevClose - 1, v: 900, t: RealDate.parse('2026-10-15T00:00:00Z') },
            ]) };
            if (url.includes('/v1/open-close/')) return { close: price };
            return {};
        } },
        '@/services/alphaEngine': {
            calculateAlphaScore: input => { calls.alphaChains.push(copy(input.rawChain)); calls.alphaRsi.push(input.rsi14); return copy(snapshot.alpha); },
            calculateWhaleIndex: () => 50, computeRSI14: () => 50, computeImpliedMovePct: () => 2,
            computeIVSkew: chain => { calls.skewChains.push(copy(chain)); return 0.9; },
        },
        '@/services/xsScores': { ensureXsScores: async () => {} },
        '@/services/centralDataHub': { sanitizeMaxPain: x => x, CentralDataHub: {
            getMarketStatus: async () => ({ session: opts.session || 'closed' }),
            _fetchOptionsChain: async () => { calls.sourceChains++; return copy(flow); },
        } },
        '@/services/structureService': {
            getStructureData: async () => ({ ...copy(flow), netGex: flow.gex, pcr: flow.oiPcr }),
            levelsFromStructure: x => x, displayLevels: x => x || {},
            prefetchLevelsWithKeys: (_tickers, keys) => {
                calls.responseKeys.push(...keys);
                const rows = keys.map(k => mode === 'hit' ? copy(snapshot) : copy(store.get(k) ?? null));
                calls.cachedRows.push(...rows);
                return { extras: Promise.resolve(rows), finish: async () => levels };
            },
        },
        '@/lib/optionLevelGate': { gammaFlipTypeOf: () => flow.gammaFlipType ?? null },
        '@/services/macroHubProvider': { getMacroSnapshotSSOT: async () => ({}) },
        '@/services/redisClient': {
            getFromCache: async key => {
                if (key.startsWith('flow:ticker:lastgood:')) {
                    calls.lastGoodKeys.push(key);
                    return mode === 'stale' ? copy(snapshot) : copy(store.get(key) ?? null);
                }
                return copy(store.get(key) || null);
            },
            setInCache: async (key, value, ttl) => { io.writes.push({ key, ttl }); store.set(key, json(value)); },
        },
        '@/services/extendedSessionClose': {
            getExtendedSessionCloseWithin: async () => ({ value: null }), isTradeInExtSession: () => false,
            keepSessionScopedFresh: extendedSession.keepSessionScopedFresh, peekExtendedSessionCloses: async () => new Map(),
            pickRegularPreClose: () => null, recallProvisionalPreCloses: async () => new Map(), rememberProvisionalPreClose: async () => {},
        },
        '@/lib/marketCalendar': calendar,
        '@/lib/putCall': putCall,
        '@/lib/quoteBasis': { priceAsOfET: () => snapshot.timestampET },
        '@/services/realtimeMetricsService': { fetchRealtimeMetrics: async () => null },
        '@/services/intrinioClient': { lastIntrinioFailure: () => null },
        '@/services/darkPool': { getDarkPool: async () => null },
    };
    const route = load(source, mocks, '\nexport { tickerPayloadForResponse, dropStaleLiveVwap, mergeFreshOverStale };');
    return { calls, store, io, deferred, route, flushAfter: async () => {
        while (deferred.length) await Promise.all(deferred.splice(0).map(fn => fn()));
    }, project: route.tickerPayloadForResponse, get: async query => {
        const url = new URL(`http://offline/api/live/ticker?t=${snapshot.ticker}${skipAlpha ? '&skip_alpha=1' : ''}${query}`);
        const response = await route.GET({ nextUrl: url, url: url.href, headers: new Headers() });
        assert.equal(response.status, 200);
        const text = await response.text();
        return { text, body: JSON.parse(text), cache: response.headers.get('X-Cache') };
    } };
}

test('개장 직후 Intrinio 봉 0: 첫 요청 null·배경 보충 뒤 다음 요청 값·Intrinio 도착 즉시 우선', async () => {
    NOW = RealDate.parse('2026-10-21T13:31:10Z');
    const date = '2026-10-21';
    const h = harness(current, fixture('IBM', date), 'miss', false, {
        session: 'regular', provider: async () => [], realtime: { vwap: 250, date, bars: 2 },
    });
    const first = await h.get('&chain=0');
    assert.equal(first.body.vwap, null); assert.equal(first.body.vwapDate, null);
    assert.equal(h.io.minutes, 0); assert.equal(h.io.realtime, 0);
    await h.flushAfter();
    assert.equal(h.io.minutes, 1); assert.equal(h.io.realtime, 1);
    const recovered = await h.get('&chain=0');
    assert.equal(recovered.cache, 'HIT'); assert.equal(recovered.body.vwap, 250); assert.equal(recovered.body.vwapDate, date);
    h.store.set('chart:v5:IBM:1d', { data: bars(date), _builtAt: NOW });
    const next = await h.get('&chain=0');
    assert.equal(next.cache, 'HIT'); assert.equal(next.body.vwap, 241.5); assert.equal(next.body.vwapDate, date);
    assert.equal(h.io.realtime, 1, 'Intrinio가 있으면 보조 공급사를 부르지 않는다');
});

test('개장 직후 두 원천 없음: 전일 값 차단·null TTL 5초', async () => {
    NOW = RealDate.parse('2026-10-21T13:30:10Z');
    const h = harness(current, fixture('IBM', '2026-10-20'), 'hit', false, {
        session: 'regular', provider: async () => [],
    });
    const result = await h.get('&chain=0');
    assert.equal(result.body.vwap, null); assert.equal(result.body.vwapDate, null);
});

for (const [label, iso, date, session] of [
    ['장외 첫 요청', '2026-10-21T02:00:00Z', '2026-10-20', 'closed'],
    ['PRE', '2026-10-21T12:00:00Z', '2026-10-20', 'pre'],
    ['개장 직전', '2026-10-21T13:29:59Z', '2026-10-20', 'pre'],
    ['진행 중 세션', '2026-10-21T13:30:00Z', '2026-10-21', 'regular'],
    ['POST', '2026-10-21T20:01:00Z', '2026-10-21', 'post'],
    ['금요일 마감 뒤', '2026-10-23T20:01:00Z', '2026-10-23', 'post'],
    ['토요일', '2026-10-24T12:00:00Z', '2026-10-23', 'closed'],
    ['일요일', '2026-10-25T12:00:00Z', '2026-10-23', 'closed'],
    ['월요일 PRE', '2026-10-26T12:00:00Z', '2026-10-23', 'pre'],
    ['추수감사절 휴장', '2026-11-26T17:00:00Z', '2026-11-25', 'closed'],
    ['조기 폐장 뒤', '2026-11-27T18:01:00Z', '2026-11-27', 'post'],
]) {
    test(`IBM 모형 ${label}: 목표일·복구값 일치`, async () => {
        NOW = RealDate.parse(iso);
        const h = harness(current, fixture('IBM', date), 'miss', false, { session,
            provider: async (ticker, target) => {
                assert.equal(ticker, 'IBM'); assert.equal(target, date);
                return [...bars('2026-10-15'), ...bars(target), ...bars('2026-12-30')];
            },
        });
        const r = await h.get('&chain=0');
        assert.equal(r.cache, 'MISS');
        if (session === 'regular') {
            assert.equal(r.body.vwap, null); assert.equal(h.io.minutes, 0);
            await h.flushAfter();
            const next = await h.get('&chain=0');
            assert.equal(next.body.vwap, 241.5); assert.equal(next.body.vwapDate, date);
        } else {
            assert.equal(r.body.vwap, 241.5); assert.equal(r.body.vwapDate, date);
        }
        assert.equal(h.io.minutes, 1);
        assert.equal(h.store.has('chart:v5:IBM:1d'), false, '화면 차트는 덮지 않는다');
        assert.ok(h.io.writes.some(w => w.key.startsWith('flow:ticker:') && w.ttl === (session === 'regular' ? 5 : 60)));
    });
}

test('동시 20요청·서로 다른 인스턴스 2개: 분봉 1회·경합 응답 null·후속 요청 같은 값', async () => {
    NOW = RealDate.parse('2026-10-21T12:00:00Z');
    const store = new Map(), locks = new Set();
    const opts = { store, locks, session: 'pre', provider: async (_ticker, date) => {
        await new Promise(resolve => setTimeout(resolve, 40)); return bars(date);
    } };
    const a = harness(current, fixture(), 'miss', false, opts);
    const b = harness(current, fixture(), 'miss', false, opts);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).get('&chain=0')));
    assert.equal(a.io.minutes + b.io.minutes, 1);
    for (const r of results) {
        assert.ok(r.body.vwap === 241.5 || r.body.vwap === null);
        assert.equal(r.body.vwapDate, r.body.vwap == null ? null : '2026-10-20');
    }
    for (const h of [a, b]) {
        const next = await h.get('&chain=0');
        assert.equal(next.body.vwap, 241.5); assert.equal(next.body.vwapDate, '2026-10-20');
    }
});

test('빈 응답 TTL 5초·캐시 적중 중 차트 준비 완료: 즉시 같은 세션으로 복구', async () => {
    NOW = RealDate.parse('2026-10-21T12:00:00Z');
    const h = harness(current, fixture(), 'miss', false, { session: 'pre', provider: async () => [] });
    const first = await h.get('&chain=0');
    assert.equal(first.body.vwap, null); assert.equal(first.body.vwapDate, null);
    assert.ok(h.io.writes.some(w => w.key.startsWith('flow:ticker:nochain:') && w.ttl === 5));
    h.store.set('chart:v5:IBM:1d', { data: bars('2026-10-20'), _builtAt: NOW });
    const next = await h.get('&chain=0');
    assert.equal(next.cache, 'HIT'); assert.equal(next.body.vwap, 241.5); assert.equal(next.body.vwapDate, '2026-10-20');
    assert.equal(h.io.minutes, 1);
});

test('PRE 차트가 오늘 시간외 봉뿐이어도 직전 정규장 보관본을 읽는다', async () => {
    NOW = RealDate.parse('2026-10-21T12:00:00Z');
    const store = new Map([['chart:v5:IBM:1d', { data: bars('2026-10-21').map(r => ({ ...r, session: 'PRE' })), _builtAt: NOW }]]);
    const h = harness(current, fixture(), 'miss', false, { store, session: 'pre', archive: {
        value: { vwap: 241.5, date: '2026-10-20', bars: 390 }, stamp: { sourceSessionDate: '2026-10-20', observedAt: NOW },
    } });
    const r = await h.get('&chain=0');
    assert.equal(r.body.vwap, 241.5); assert.equal(r.body.vwapDate, '2026-10-20'); assert.equal(h.io.minutes, 0);
    assert.ok(h.io.archiveReads.every(q => q.fromDate === '2026-10-20' && q.lookback === 0));
});

test('다른 날짜 차트·보관본·마지막 정상본은 병합 후에도 차단', async () => {
    NOW = RealDate.parse('2026-10-21T12:00:00Z');
    const old = fixture('IBM', '2026-10-19'); old.vwap = 999;
    const h = harness(current, old, 'stale', false, { session: 'pre', provider: async () => [],
        store: new Map([['chart:v5:IBM:1d', { data: bars('2026-10-19'), _builtAt: NOW }]]),
        archive: { value: { vwap: 999, date: '2026-10-19', bars: 390 }, stamp: { sourceSessionDate: '2026-10-19' } },
    });
    const r = await h.get('&chain=0');
    assert.equal(r.body.vwap, null); assert.equal(r.body.vwapDate, null); assert.equal(h.io.minutes, 1);
    const paired = h.route.dropStaleLiveVwap(h.route.mergeFreshOverStale(old, { vwap: null, vwapDate: null }));
    assert.equal(paired.vwap, null); assert.equal(paired.vwapDate, null);
});

test('보관본 원천 날짜와 내부 날짜가 다르면 직접 조회로 복구', async () => {
    NOW = RealDate.parse('2026-10-21T12:00:00Z');
    const h = harness(current, fixture(), 'miss', false, { session: 'pre', archive: {
        value: { vwap: 999, date: '2026-10-19', bars: 390 }, stamp: { sourceSessionDate: '2026-10-20' },
    } });
    const r = await h.get('&chain=0');
    assert.equal(r.body.vwap, 241.5); assert.equal(r.body.vwapDate, '2026-10-20'); assert.equal(h.io.minutes, 1);
});

test('잠금 장애: 공급사 호출 0·빈 응답은 짧게 저장', async () => {
    NOW = RealDate.parse('2026-10-21T12:00:00Z');
    const h = harness(current, fixture(), 'miss', false, { lockError: true, session: 'pre' });
    const r = await h.get('&chain=0');
    assert.equal(r.body.vwap, null); assert.equal(h.io.minutes, 0);
    assert.ok(h.io.writes.some(w => w.ttl === 5));
});

test('직접 조회로 얻은 최신 분봉이 오래된 차트보다 우선한다', async () => {
    NOW = RealDate.parse('2026-10-21T15:00:00Z');
    const date = '2026-10-21';
    const store = new Map([
        ['chart:v5:IBM:1d', { data: bars(date).map(r => ({ ...r, high: 100, low: 100, close: 100 })), _builtAt: NOW - 300_000 }],
        [`vwap:minutes:IBM:${date}`, { data: bars(date), _builtAt: NOW }],
    ]);
    const h = harness(current, fixture('IBM', date), 'miss', false, { store, session: 'regular' });
    const r = await h.get('&chain=0');
    assert.equal(r.body.vwap, 241.5); assert.equal(h.io.minutes, 0);
});

test('워밍 종목 NVDA: 감마 별칭·H1 RSI 외 본문 동일', async () => {
    const before = execFileSync('git', ['show', '8415c9a2a11d83a1ea5a95e1706c1d577ea7a930:src/app/api/live/ticker/route.ts'], { cwd: root, encoding: 'utf8' });
    for (const [iso, date, session] of [
        ['2026-10-21T15:00:00Z', '2026-10-21', 'regular'],
        ['2026-10-21T12:00:00Z', '2026-10-20', 'pre'],
        ['2026-10-21T20:01:00Z', '2026-10-21', 'post'],
        ['2026-10-25T12:00:00Z', '2026-10-23', 'closed'],
    ]) for (const mode of ['hit', 'miss']) for (const skipAlpha of [false, true]) for (const query of ['&chain=0', '&chain=full']) {
        NOW = RealDate.parse(iso);
        const snapshot = fixture('NVDA', date); snapshot.session = session === 'regular' ? 'REG' : session.toUpperCase();
        const opts = () => ({ session, store: new Map([['chart:v5:NVDA:1d', { data: bars(date), _builtAt: NOW }]]) });
        const old = harness(before, snapshot, mode, skipAlpha, opts());
        const fresh = harness(current, snapshot, mode, skipAlpha, opts());
        const a = await old.get(query), b = await fresh.get(query);
        assert.equal(b.body.flow.gamma, b.body.flow.netGex ?? null, 'L9: structure dollar GEX alias');
        delete a.body.flow.gamma; delete b.body.flow.gamma;
        const withoutRsi = body => { const out = copy(body); delete out.display.rsi14; delete out.display.rsi14Date; return out; };
        assert.deepEqual(withoutRsi(b.body), withoutRsi(a.body), `${mode}/${skipAlpha}/${query}`);
        assert.equal(fresh.io.minutes, 0);
    }
});

test('기존 분봉 조회·세션 분류 재사용: PRE·주말·조기 폐장에도 지정일 조회 1회', async () => {
    const blocked = new Proxy({}, { get: () => () => { throw Error('금지된 서비스 호출'); } });
    for (const [iso, date, offset, close] of [
        ['2026-10-21T12:00:00Z', '2026-10-20', '-04:00', '16:00'],
        ['2026-10-25T12:00:00Z', '2026-10-23', '-04:00', '16:00'],
        ['2026-11-27T18:01:00Z', '2026-11-27', '-05:00', '13:00'],
    ]) {
        NOW = RealDate.parse(iso);
        const calls = [];
        const api = load(read('src/services/stockApi.ts'), {
            '@/lib/marketCalendar': calendar, './extendedSessionClose': blocked,
            '@/services/stockTypes': blocked, './weekendOptionsCache': blocked,
            './massiveClient': { fetchMassive: async url => {
                calls.push(url);
                const bar = (time, price) => ({ t: RealDate.parse(`${date}T${time}:00${offset}`), o: price, h: price, l: price, c: price, v: 100 });
                return { results: [bar('09:29', 900), bar('09:30', 240), bar('09:31', 242), bar(close, 900)] };
            } },
        });
        const rows = await api.getRegularSessionMinuteBars('IBM', date);
        assert.equal(calls.length, 1); assert.ok(calls[0].endsWith(`/1/minute/${date}/${date}`));
        assert.deepEqual({ ...vwap.sessionVwapFromBars(rows) }, { vwap: 241, date, bars: 2 });
    }
});

for (const [iso, date, oldDate, session] of [
    ['2026-10-21T12:00:00Z', '2026-10-20', '2026-10-19', 'pre'],
    ['2026-10-21T13:30:00Z', '2026-10-21', '2026-10-20', 'regular'],
]) test(`캐시 적중 날짜 경계 ${session}: 다른 날 차단·첫 응답 null·배경 보충 뒤 같은 세션 값`, async () => {
    NOW = RealDate.parse(iso);
    const cached = fixture('IBM', oldDate); cached.vwap = 999;
    const h = harness(current, cached, 'hit', false, { session });
    const r = await h.get('&chain=0');
    assert.equal(r.cache, 'HIT'); assert.equal(r.body.vwap, null); assert.equal(r.body.vwapDate, null);
    assert.equal(h.io.minutes, 0);
    await h.flushAfter();
    const next = await h.get('&chain=0');
    assert.equal(next.body.vwap, 241.5); assert.equal(next.body.vwapDate, date);
    assert.equal(h.io.minutes, 1);
});

async function promptly(work) {
    let timer;
    try {
        return await Promise.race([work, new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error('캐시 응답이 공급사·잠금을 기다림')), 500);
        })]);
    } finally { clearTimeout(timer); }
}

for (const skipAlpha of [false, true]) for (const query of ['&chain=0', '&chain=full']) {
    test(`관문 재현: Intrinio 빈 응답 뒤 60초 잠금 유지·FMP 저장본 HIT 즉시 (${skipAlpha}/${query})`, async () => {
        NOW = RealDate.parse('2026-10-21T13:31:10Z');
        const date = '2026-10-21';
        const h = harness(current, fixture('IBM', date), 'miss', skipAlpha, {
            session: 'regular', provider: async () => [], realtime: { vwap: 250, date, bars: 2 },
        });
        assert.equal((await h.get(query)).body.vwap, null);
        await h.flushAfter();
        const start = performance.now();
        const next = await promptly(h.get(query));
        console.log(`관문 HIT 모형 ${skipAlpha}/${query}: ${(performance.now() - start).toFixed(1)}ms`);
        assert.equal(next.cache, 'HIT'); assert.equal(next.body.vwap, 250); assert.equal(next.body.vwapDate, date);
        assert.equal(h.io.minutes, 1); assert.equal(h.io.realtime, 1, '응답 경로는 보조 공급사도 부르지 않는다');
    });
}

for (const source of ['Intrinio', 'FMP']) {
    test(`미완료 ${source} 배경 조회 중에도 첫·후속 HIT null 즉시, 완료 뒤 값`, async () => {
        NOW = RealDate.parse('2026-10-21T13:31:10Z');
        const date = '2026-10-21';
        let release, started;
        const wait = new Promise(resolve => { release = resolve; });
        const entered = new Promise(resolve => { started = resolve; });
        const h = harness(current, { ...fixture('IBM', date), vwap: null, vwapDate: null }, 'hit', false, {
            session: 'regular',
            provider: async () => { if (source === 'Intrinio') { started(); await wait; return bars(date); } return []; },
            realtimeProvider: async () => { started(); await wait; return { vwap: 250, date, bars: 2 }; },
        });
        const first = await promptly(h.get('&chain=0'));
        assert.equal(first.cache, 'HIT'); assert.equal(first.body.vwap, null);
        assert.equal(h.io.minutes, 0); assert.equal(h.io.realtime, 0);
        const backgroundWork = h.flushAfter();
        try {
            await promptly(entered);
            const next = await promptly(h.get('&chain=0'));
            assert.equal(next.cache, 'HIT'); assert.equal(next.body.vwap, null);
        } finally { release(); await backgroundWork; }
        const ready = await promptly(h.get('&chain=0'));
        assert.equal(ready.body.vwap, source === 'Intrinio' ? 241.5 : 250); assert.equal(ready.body.vwapDate, date);
        assert.equal(h.io.minutes, 1); assert.equal(h.io.realtime, source === 'FMP' ? 1 : 0);
    });
}

test('정규장 20요청·두 인스턴스: 응답 전 분봉 0회, 배경 공유 잠금 뒤 Intrinio 1회', async () => {
    NOW = RealDate.parse('2026-10-21T13:31:10Z');
    const date = '2026-10-21';
    const opts = { store: new Map(), locks: new Set(), session: 'regular' };
    const a = harness(current, fixture('IBM', date), 'hit', false, opts);
    const b = harness(current, fixture('IBM', date), 'hit', false, opts);
    const results = await promptly(Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).get('&chain=0'))));
    assert.ok(results.every(r => r.body.vwap === null)); assert.equal(a.io.minutes + b.io.minutes, 0);
    await Promise.all([a.flushAfter(), b.flushAfter()]);
    assert.equal(a.io.minutes + b.io.minutes, 1);
    for (const h of [a, b]) assert.equal((await h.get('&chain=0')).body.vwap, 241.5);
});

for (const swallow of [false, true]) {
    test(`실제 Intrinio→라우터→분봉 429: 1회 뒤 재시도·FMP 중단 (${swallow ? '오류 삼킴' : '오류 전파'})`, async () => {
        NOW = RealDate.parse('2026-10-21T13:31:10Z');
        const date = '2026-10-21';
        let http = 0, ctx;
        const client = load(read('src/services/intrinioClient.ts'), {
            './redisClient': { getFromCache: async () => null, setInCache: async () => true },
            '@/lib/economicSeries': {}, '@/lib/marketCalendar': calendar,
            'next/server': { after() {} }, '@/lib/intrinioWarmGate': { warmGateStore: { getStore: () => undefined } },
            '@/lib/intrinioMeter': { note429() {}, upstashMeterStore: {}, releaseMeterClaim: async () => {} },
            '../../scripts/integrity/clock': {}, '@/lib/intrinioBackground': background,
            '@/lib/intrinioCallMeter': { noteCall() {} },
        }, '', { env: { INTRINIO_API_KEY: '모형', INTRINIO_BASE_URL: 'https://intrinio.invalid', INTRINIO_MAX_ATTEMPTS: '2' },
            fetch: async url => {
                assert.equal(new URL(url).pathname, '/securities/IBM/prices/intervals'); http++;
                return { status: 429, ok: false };
            },
        });
        const router = load(read('src/services/intrinioRouter.ts'), {
            './intrinioClient': client, './fmpNewsAdapter': {}, '@/lib/marketCalendar': calendar,
        });
        const massive = load(read('src/services/massiveClient.ts'), { './intrinioRouter': router });
        const api = load(read('src/services/stockApi.ts'), {
            './massiveClient': massive, '@/lib/marketCalendar': calendar, './extendedSessionClose': {},
            '@/services/stockTypes': {}, './weekendOptionsCache': {},
        });
        const h = harness(current, fixture('IBM', date), 'hit', false, { session: 'regular',
            provider: async (ticker, date) => {
                ctx = background.bgStore.getStore();
                try { return await api.getRegularSessionMinuteBars(ticker, date); }
                catch (error) { if (!swallow) throw error; return []; }
            }, realtime: { vwap: 250, date, bars: 2 },
        });
        assert.equal((await promptly(h.get('&chain=0'))).body.vwap, null); assert.equal(http, 0);
        await h.flushAfter();
        assert.equal(ctx.noRetry429, true); assert.equal(ctx.tripOn429, true);
        assert.equal(ctx.tripped, true); assert.equal(ctx.saw429, 1);
        assert.equal(http, 1); assert.equal(h.io.realtime, 0);
    });
}


for (const [label, iso, date] of [
    ['감사 마감 뒤', '2026-10-23T01:20:00Z', '2026-10-22'],
    ['정규장 진행 중', '2026-10-23T15:00:00Z', '2026-10-22'],
    ['금요일 POST', '2026-10-23T20:01:00Z', '2026-10-23'],
    ['주말', '2026-10-24T12:00:00Z', '2026-10-23'],
    ['월요일 PRE', '2026-10-26T12:00:00Z', '2026-10-23'],
    ['조기 폐장', '2026-11-27T18:01:00Z', '2026-11-27'],
]) {
    test(`H1 실제 GET ${label}: Wilder·완료 세션·lite/full·캐시·호출 수`, async () => {
        NOW = RealDate.parse(iso);
        const end = RealDate.parse(`${date}T00:00:00Z`);
        const closes = Array.from({ length: 250 }, (_, i) => 100 + i * .03 + Math.sin(i * .7) * 5);
        const rows = closes.map((c, i) => ({ t: end - (249 - i) * 86400000, c, adjustedClose: c, v: 1000 }));
        // 시간외와 진행 중 봉은 가격이 달라도 RSI에 들어가면 안 된다.
        rows.push({ t: end + 86400000, c: 99999, v: 1000 });
        const expected = dailyRsi.dailyRsi14(rows, date);
        assert.ok(expected > 0 && expected < 100);
        for (const skip of [false, true]) for (const query of ['', '&chain=full']) {
            const h = harness(current, fixture('MSFT', date), 'miss', skip, { dailyRows: rows.slice().reverse() });
            const result = await h.get(query);
            assert.equal(result.body.display.rsi14, expected);
            assert.equal(result.body.display.rsi14Date, date);
            if (!skip) assert.deepEqual(h.calls.alphaRsi, [expected]);
            assert.equal(h.calls.urls.filter(u => u.includes('/range/1/day/')).length, 1);
            assert.equal(h.calls.urls.filter(u => u.includes('/indicators/rsi/')).length, 0);
            const count = h.calls.urls.length;
            const cached = await h.get(query);
            assert.equal(cached.cache, 'HIT');
            assert.equal(cached.body.display.rsi14, expected);
            assert.equal(h.calls.urls.length, count, '캐시 적중에 공급사 호출 없음');
        }
    });
}

test('H1 실제 GET 마감 직후 완료 세션 일봉 도착 전: 직전 거래일 RSI·실제 계산일·빈칸 없음', async () => {
    NOW = RealDate.parse('2026-10-23T20:30:00Z'); // 금 16:30 ET — 완료 세션은 10/23, 일봉은 10/22 까지만
    const prevDate = '2026-10-22';
    const end = RealDate.parse(`${prevDate}T00:00:00Z`);
    const closes = Array.from({ length: 250 }, (_, i) => 100 + i * .03 + Math.sin(i * .7) * 5);
    const rows = closes.map((c, i) => ({ t: end - (249 - i) * 86400000, c, adjustedClose: c, v: 1000 }));
    const expected = dailyRsi.dailyRsi14(rows, prevDate);
    assert.ok(expected > 0 && expected < 100);
    // 완료 세션 일봉이 있는데 조정 종가가 깨졌으면 직전 거래일로 되돌아가지 않는다.
    const broken = [...rows, { t: end + 86400000, c: 101, adjustedClose: null, v: 1000 }];
    for (const [dailyRows, rsi, date] of [[rows, expected, prevDate], [broken, null, '2026-10-23']]) {
        for (const skip of [false, true]) for (const query of ['', '&chain=full']) {
            const h = harness(current, fixture('MSFT', '2026-10-23'), 'miss', skip, { dailyRows: dailyRows.slice().reverse() });
            const result = await h.get(query);
            assert.equal(result.body.display.rsi14, rsi);
            assert.equal(result.body.display.rsi14Date, date);
            if (!skip) assert.deepEqual(h.calls.alphaRsi, [rsi]);
            const cached = await h.get(query);
            assert.equal(cached.cache, 'HIT');
            assert.equal(cached.body.display.rsi14, rsi, '직전 거래일 계산일 캐시를 적중에서 지우지 않는다');
        }
    }
});

test('H1 last-good 병합: 결측은 null, 실제 RSI 0은 0', async () => {
    NOW = RealDate.parse('2026-10-23T01:20:00Z');
    const date = '2026-10-22';
    const end = RealDate.parse(`${date}T00:00:00Z`);
    const stale = fixture('MSFT', date);
    stale.display = { rsi14: 88, rsi14Date: date };
    for (const rows of [[], Array.from({ length: 40 }, (_, i) => ({ t: end - (39-i)*86400000, c: 100-i, adjustedClose: 100-i }))]) {
        const store = new Map([['flow:ticker:lastgood:v5:lite-nochain:MSFT', copy(stale)]]);
        const h = harness(current, stale, 'miss', true, { store, dailyRows: rows });
        assert.equal((await h.get('')).body.display.rsi14, rows.length ? 0 : null);
        assert.ok(h.calls.lastGoodKeys.includes('flow:ticker:lastgood:v5:lite-nochain:MSFT'));
        assert.equal((await h.get('')).body.display.rsi14, rows.length ? 0 : null);
    }
});

test('P2 실제 GET 캐시: 오래된 표식만 null·무표식/0 보존·추가 공급사 호출 0', async () => {
    for (const [iso, date, expected] of [
        ['2026-10-22T19:59:59Z', '2026-10-21', 41.62],
        // 마감 직후 완료 세션 일봉 도착 전: 직전 거래일 계산은 새 계산과 같은 값이라 유지(빈칸 방지)
        ['2026-10-22T20:00:01Z', '2026-10-21', 41.62],
        ['2026-10-22T20:00:01Z', '2026-10-20', null],
        ['2026-11-27T17:59:59Z', '2026-11-25', 41.62],
        ['2026-11-27T18:00:01Z', '2026-11-25', 41.62],
        ['2026-11-27T18:00:01Z', '2026-11-24', null],
        ['2026-10-26T12:00:00Z', '2026-10-22', 41.62],
        ['2026-10-26T12:00:00Z', '2026-10-21', null],
        ['2026-10-24T12:00:00Z', '2026-10-23', 41.62],
        ['2026-11-26T21:01:00Z', '2026-11-25', 41.62],
        ['2026-10-22T20:00:01Z', undefined, 41.62],
    ]) for (const value of [41.62, 0, null]) for (const skip of [false, true]) for (const query of ['', '&chain=full']) {
        NOW = RealDate.parse(iso);
        const snapshot = fixture('MSFT', calendar.shownRegularSessionDate(NOW));
        snapshot.display = { rsi14: value, ...(date ? { rsi14Date: date } : {}) };
        const original = copy(snapshot);
        const store = new Map([['chart:v5:MSFT:1d', { data: bars(snapshot.vwapDate), _builtAt: NOW }]]);
        const h = harness(current, snapshot, 'hit', skip, { store });
        const result = await h.get(query);
        await h.flushAfter();
        assert.equal(result.cache, 'HIT');
        assert.equal(result.body.display.rsi14, expected === null ? null : value, iso);
        assert.equal(result.body.display.rsi14Date, date, '반환 시각으로 계산 날짜를 덮지 않는다');
        assert.equal(result.body.price, snapshot.price);
        assert.equal(h.calls.urls.length, 0, 'RSI 검사로 시세·일봉을 다시 조회하지 않는다');
        assert.equal(h.calls.sourceChains, 0);
        assert.equal(h.io.minutes + h.io.realtime, 0, '준비된 VWAP 저장본도 그대로 재사용한다');
        assert.deepEqual(h.calls.cachedRows[0], original, '라우트에 전달한 캐시 객체 원본 보존');
    }
});


test('P1 실제 GET 분할 조정: raw 종가로 계산하지 않음·조정 종가 결측은 null·lite/full', async () => {
    NOW = RealDate.parse('2026-10-23T01:20:00Z');
    const date = '2026-10-22';
    const end = RealDate.parse(`${date}T00:00:00Z`);
    const rows = Array.from({length:250}, (_,i) => {
        const adjustedClose = 100+i*.03+5*Math.sin(i*.7+2);
        return {t:end-(249-i)*86400000,c:adjustedClose*(i<235 ? 10 : 1),adjustedClose,v:1000};
    });
    const expected = dailyRsi.dailyRsi14(rows,date);
    assert.ok(Math.abs(expected - 54.38949017383266) < 1e-10);
    for (const skip of [false,true]) for (const query of ['', '&chain=full']) {
        for (const missing of [false,true]) {
            const dailyRows = copy(rows);
            if (missing) delete dailyRows[200].adjustedClose;
            const h = harness(current,fixture('MSFT',date),'miss',skip,{dailyRows});
            const result = await h.get(query);
            assert.equal(result.body.display.rsi14,missing ? null : expected);
            if (!skip) assert.deepEqual(h.calls.alphaRsi,[missing ? null : expected]);
            assert.equal(h.calls.urls.filter(u => u.includes('/range/1/day/')).length,1);
            assert.ok(h.calls.responseKeys.every(k => k.includes(':v6:')));
        }
    }
});


test('운영 v5 last-good: PRE regularCloseToday 복구·네 응답 모양·RSI만 새 계산값', async () => {
    NOW = RealDate.parse('2026-10-23T12:00:00Z');
    const date = '2026-10-22';
    const end = RealDate.parse(`${date}T00:00:00Z`);
    const rows = Array.from({length:40}, (_,i) => ({t:end-(39-i)*86400000,c:100-i,adjustedClose:100-i}));
    const before = execFileSync('git', ['show', 'origin/main:src/app/api/live/ticker/route.ts'], {cwd:root,encoding:'utf8'});
    for (const skip of [false,true]) for (const query of ['', '&chain=full']) for (const dailyRows of [[],rows]) {
        const stale = fixture('MSFT',date);
        stale.display = {rsi14:88}; // 운영 저장본에는 새 RSI 날짜가 없다.
        stale.prices.regularCloseToday = 242;
        const shape = skip ? (query ? 'lite-full' : 'lite-nochain') : (query ? 'full' : 'nochain');
        const key = `flow:ticker:lastgood:v5:${shape}:MSFT`;
        const original = copy(stale);
        const options = () => ({session:'pre',dailyRows:dailyRows.slice().reverse(),store:new Map([[key,copy(stale)]])});
        const old = harness(before,stale,'miss',skip,options());
        const h = harness(current,stale,'miss',skip,options());
        const a = await old.get(query), b = await h.get(query);
        assert.equal(a.body.prices.regularCloseToday,242,'운영 키에 있는 종가가 실제로 복구되는 재현');
        assert.deepEqual(b.body.prices,a.body.prices,'RSI 수리가 가격 객체를 바꾸지 않는다');
        assert.equal(b.body.session,'PRE');
        assert.equal(b.body.display.rsi14,dailyRows.length ? 0 : null,'구 RSI 88을 병합으로 되살리지 않는다');
        assert.deepEqual(h.calls.lastGoodKeys,[key]);
        assert.ok(h.io.writes.some(write => write.key === key));
        assert.ok(h.calls.responseKeys.every(key => key.includes(':v6:')));
        const count = h.calls.urls.length;
        const hit = await h.get(query);
        assert.equal(hit.cache,'HIT');
        assert.equal(hit.body.prices.regularCloseToday,242);
        assert.equal(hit.body.display.rsi14,dailyRows.length ? 0 : null);
        assert.equal(h.calls.urls.length,count,'적중 뒤 공급사 조회 없음');
        assert.deepEqual(stale,original,'입력 원본 보존');
    }
});
