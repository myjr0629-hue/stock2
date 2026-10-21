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
function load(source, mocks, extra = '') {
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
    new Function('require', 'module', 'exports', 'console', 'process', 'fetch', compiled)(requireMock, module, module.exports, silent, { env: {} }, () => { throw Error('금지된 네트워크 접근'); });
    return module.exports;
}

const calendar = load(read('src/lib/marketCalendar.ts'), {});
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
    const calls = { responseKeys: [], lastGoodKeys: [], alphaChains: [], skewChains: [], sourceChains: 0 };
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
        '@/lib/optionMetrics': { applyOptionMetrics: target => target, optionMetricsRowHasOi: () => true },
        '@/lib/vwap': vwap,
        '@/services/realtimeSessionVwap': { getRealtimeSessionVwap: async (_ticker, date, now) => {
            io.realtime++;
            return calendar.cashSessionPhaseAt(now) === 'regular' ? (opts.realtime || null) : null;
        } },
        '@/lib/shortVolume': { shortVolFields: () => ({}) },
        '@/lib/sessionArchive': { lastCompletedSessionDate: () => calendar.etLastClosedSessionDate(NOW), readSessionArchive: async (_kind, _ticker, q) => { io.archiveReads.push(q); return opts.archive || null; }, saveSessionArchive: async () => {} },
        '@/services/stockApi': { getStockChartData: async () => [], getRegularSessionMinuteBars: async (ticker, date) => { io.minutes++; return opts.provider ? opts.provider(ticker, date) : bars(date); } },
        '@/lib/intrinioMeter': { upstashMeterStore: { setNxEx: async (key, _value, ttl) => { assert.equal(ttl, 60); if (opts.lockError) throw Error('모형 잠금 장애'); if (locks.has(key)) return false; locks.add(key); return true; } } },
        '@/services/timezoneUtils': { getETNow: () => ({ dateString: calendar.etDateOf(NOW) }), getSessionType: () => opts.session === 'regular' ? 'REG' : (opts.session || 'closed').toUpperCase() },
        '@/services/marketDaySSOT': { isUSMarketHolidayET: () => false },
        '@/services/buildMeta': { getBuildMeta: () => snapshot.meta },
        '@/services/massiveClient': { CACHE_POLICY: { LIVE: 'live' }, fetchMassive: async url => {
            if (url.includes('/v2/snapshot/')) return { ticker: mode === 'stale' ? {} : {
                _intrinio: { prevClose: snapshot.prevClose, regularDate: '2026-10-19' },
                lastTrade: { p: price, t: NOW * 1e6 }, day: { c: price, v: 1000 }, prevDay: { c: snapshot.prevClose, v: 900 },
            } };
            if (url.includes('/v2/aggs/')) return { results: mode === 'stale' ? [] : [
                { c: snapshot.prevClose, v: 1000, t: RealDate.parse('2026-10-16T00:00:00Z') },
                { c: snapshot.prevClose - 1, v: 900, t: RealDate.parse('2026-10-15T00:00:00Z') },
            ] };
            if (url.includes('/v1/open-close/')) return { close: price };
            return {};
        } },
        '@/services/alphaEngine': {
            calculateAlphaScore: input => { calls.alphaChains.push(copy(input.rawChain)); return copy(snapshot.alpha); },
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
                return { extras: Promise.resolve(keys.map(k => mode === 'hit' ? copy(snapshot) : copy(store.get(k) ?? null))), finish: async () => levels };
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
            keepSessionScopedFresh: x => x, peekExtendedSessionCloses: async () => new Map(),
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
    return { calls, store, io, deferred, route, project: route.tickerPayloadForResponse, get: async query => {
        const url = new URL(`http://offline/api/live/ticker?t=${snapshot.ticker}${skipAlpha ? '&skip_alpha=1' : ''}${query}`);
        const response = await route.GET({ nextUrl: url, url: url.href, headers: new Headers() });
        assert.equal(response.status, 200);
        const text = await response.text();
        return { text, body: JSON.parse(text), cache: response.headers.get('X-Cache') };
    } };
}

test('개장 직후 Intrinio 봉 0: 실시간 당일 누적값·날짜, 이어서 Intrinio 도착 즉시 우선', async () => {
    NOW = RealDate.parse('2026-10-21T13:31:10Z');
    const date = '2026-10-21';
    const h = harness(current, fixture('IBM', date), 'miss', false, {
        session: 'regular', provider: async () => [], realtime: { vwap: 250, date, bars: 2 },
    });
    const first = await h.get('&chain=0');
    assert.equal(first.body.vwap, 250); assert.equal(first.body.vwapDate, date);
    assert.equal(h.io.minutes, 1); assert.equal(h.io.realtime, 1);
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
    test(`IBM 모형 ${label}: 첫 응답 값·목표일 일치`, async () => {
        NOW = RealDate.parse(iso);
        const h = harness(current, fixture('IBM', date), 'miss', false, { session,
            provider: async (ticker, target) => {
                assert.equal(ticker, 'IBM'); assert.equal(target, date);
                return [...bars('2026-10-15'), ...bars(target), ...bars('2026-12-30')];
            },
        });
        const r = await h.get('&chain=0');
        assert.equal(r.cache, 'MISS');
        assert.equal(r.body.vwap, 241.5); assert.equal(r.body.vwapDate, date);
        assert.equal(h.io.minutes, 1);
        assert.equal(h.store.has('chart:v5:IBM:1d'), false, '화면 차트는 덮지 않는다');
        assert.ok(h.io.writes.some(w => w.key.startsWith('flow:ticker:') && w.ttl === 60));
    });
}

test('동시 20요청·서로 다른 인스턴스 2개: 공급사 분봉 조회 합계 1회, 모두 같은 값', async () => {
    NOW = RealDate.parse('2026-10-21T12:00:00Z');
    const store = new Map(), locks = new Set();
    const opts = { store, locks, session: 'pre', provider: async (_ticker, date) => {
        await new Promise(resolve => setTimeout(resolve, 40)); return bars(date);
    } };
    const a = harness(current, fixture(), 'miss', false, opts);
    const b = harness(current, fixture(), 'miss', false, opts);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).get('&chain=0')));
    assert.equal(a.io.minutes + b.io.minutes, 1);
    for (const r of results) { assert.equal(r.body.vwap, 241.5); assert.equal(r.body.vwapDate, '2026-10-20'); }
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

test('워밍 종목 NVDA: 캐시 적중·새 계산, 네 응답 모양의 본문 바이트가 수정 전과 동일', async () => {
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
        assert.equal(b.text, a.text, `${mode}/${skipAlpha}/${query}`);
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
]) test(`캐시 적중 날짜 경계 ${session}: 다른 날 VWAP를 같은 세션 자료로 교체`, async () => {
    NOW = RealDate.parse(iso);
    const cached = fixture('IBM', oldDate); cached.vwap = 999;
    const h = harness(current, cached, 'hit', false, { session });
    const r = await h.get('&chain=0');
    assert.equal(r.cache, 'HIT'); assert.equal(r.body.vwap, 241.5); assert.equal(r.body.vwapDate, date);
    assert.equal(h.io.minutes, 1);
});
