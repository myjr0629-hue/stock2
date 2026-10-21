// 오프라인 전용: node tests/watchlistBatchFast.test.js
// 외부 I/O와 .env 읽기 없음. 원본 df149853d의 고정 입력 응답을 바이트 단위로 비교한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const fixtureFile = path.join(__dirname, 'fixtures/watchlistBatchBefore.json');
const baseline = 'df149853d0574ee5209ea8e02cd23eb0710f1bd5';
const generate = process.argv.includes('--기준선-생성');
const originalDate = Date;
let clock = Date.parse('2026-10-20T12:00:00-04:00');
global.Date = class extends originalDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
};
global.fetch = async () => { throw new Error('외부 네트워크 호출 금지'); };
const originalTimeout = global.setTimeout;
global.setTimeout = (...args) => { const timer = originalTimeout(...args); timer.unref(); return timer; };
const watchdog = originalTimeout(() => { console.error('시험 시간 상한 초과'); process.exit(1); }, 25_000);
const copy = value => structuredClone(value);

function harness({ cached = true, session = 'regular', unified = true, old = false } = {}) {
    const modules = new Map(), store = new Map(), jobs = [];
    const count = { redis: 0, dynamo: 0, analysis: 0, compute: 0, vendor: 0, writes: 0 };
    const state = { failOptions: false, failSnapshots: false, failLevels: false,
        failDarkPool: false, failLiquidity: false, darkPoolPct: 40, liquidityScore: 80 };
    const tickers = ['AAPL', 'NVDA', 'SPY'];
    const analysis = Object.fromEntries(tickers.filter(() => cached).map(t => [t, {
        ticker: t, timestamp: clock - 60_000, gex: -5e6, pcr: 1.5, squeezeScore: 10,
        maxPain: 100, callWall: 110, putFloor: 90, netPremium: 5e5, whaleIndex: 66,
        sparkline: [97, 98, 99, 100], rsi: 52, return3d: 2, relVol: 1.2, ivSkew: 0.1,
        darkPoolPct: 40, shortVolPct: 30,
        alphaSnapshot: { score: 70, grade: 'B', action: 'WATCH', actionKR: '관심 등록', capturedAt: '2026-10-19T20:00:00Z' },
    }]));
    const structure = { expiration: '2026-10-23', options_status: 'OK', netGex: 1e7,
        squeezeScore: 30, squeezeRisk: 'LOW', netPremium: 5e5, pcr: 0.8,
        underlyingPrice: 100, maxPain: 100, callWall: 110, putFloor: 90,
        levels: { maxPain: 100, callWall: 110, putFloor: 90 }, atmIv: 30 };
    const snapshots = tickers.map(ticker => ({ ticker, day: { c: 100, v: 5000, vw: 99 },
        prevDay: { c: 98, v: 4000 }, min: { c: 100 }, lastTrade: { p: 100, t: clock * 1e6 },
        todaysChange: 2, todaysChangePerc: 100 * 2 / 98 }));
    const mocks = {
        'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) }, after: work => jobs.push(work) },
        '@/services/redisClient': {
            getFromCache: async key => { count.redis++; return key.startsWith('cache:analysis:') ? copy(analysis[key.slice(15)] ?? null) : null; },
            mgetFromCache: async keys => {
                count.redis++;
                if (keys[0]?.startsWith('cache:analysis:')) count.analysis++;
                return keys.map(key => key.startsWith('structure:v2:')
                    ? (state.failOptions ? null : { data: copy(structure) })
                    : key.startsWith('cache:analysis:') ? copy(analysis[key.slice(15)] ?? null) : copy(store.get(key) ?? null));
            },
            setInCache: async (key, value) => { count.redis++; count.writes++;
                if (key.startsWith('cache:analysis:')) analysis[key.slice(15)] = copy(value);
                else store.set(key, copy(value)); return true; },
        },
        '@/lib/aws/dynamoDataProvider': {
            getLatestGex: async () => { count.dynamo++; if (state.failOptions) throw new Error('합성 조회 실패');
                return { timestamp: clock - 3600_000, pcr: 0.81, totalCallOI: 100, totalPutOI: 81,
                    gex: 1e7, netPremium: 5e5, maxPain: 100, callWall: 110, putFloor: 90, squeezeScore: 30 }; },
            getLatestFlow: async () => { count.dynamo++; return { netPremium: 5e5 }; },
        },
        '@/lib/aws/unifiedCacheProvider': { getUnifiedCache: async () => { count.dynamo++; return unified ? { structure: copy(structure) } : null; } },
        '@/services/structureService': {
            getStructureData: async () => copy(structure),
            prefetchLevelsForExit: asked => async () => { if (state.failLevels) throw new Error('합성 레벨 실패');
                return new Map(asked.map(t => [t, copy(structure.levels)])); },
            applyLevelsToRealtime: (rt, levels) => { if (rt) Object.assign(rt, levels ?? { maxPain: null, callWall: null, putFloor: null }); },
        },
        '@/services/massiveClient': { fetchMassive: async url => { count.vendor++;
            if (state.failSnapshots) throw new Error('합성 시세 실패');
            if (url.endsWith('/tickers')) return { tickers: copy(snapshots) };
            if (url.includes('/tickers/')) return { ticker: copy(snapshots[0]) };
            if (url.includes('/aggs/')) return { results: [97, 98, 99, 100].map(c => ({ c, v: 5000 })) };
            return { results: { values: [{ value: 52, histogram: 0.1 }] } };
        } },
        '@/services/stockApi': { getOptionsData: async () => ({ rawContracts: [] }) },
        '@/services/marketStatusProvider': { getMarketStatusSSOT: async () => ({ session }) },
        '@/services/timezoneUtils': { getETNow: () => ({ hour: session === 'regular' ? 12 : 21, minute: 0, isWeekend: false, dateString: '2026-10-20' }) },
        '@/services/macroHubProvider': { getMacroSnapshotSSOT: async () => ({}) },
        '@/services/realtimeMetricsService': { fetchTradeData: async () => null, fetchShortVolumeData: async () => null },
        '@/services/extendedSessionClose': { peekExtendedSessionClosesAndWarm: async asked => ({ values: asked.map(() => null), warm: null }),
            isTradeInExtSession: () => false, runAfterResponse: () => {} },
        '@/services/impliedMoveService': { peekStoredStructure: async () => null, impliedMoveOfStructure: async () => null },
        '@/lib/aws/historyMiddleware': { recordAlphaDaily: () => {} },
        '@/services/intrinioClient': { sessionAwareLiquidity: async (_ticker, _bid, _ask, options) => {
            if (state.failLiquidity) { options?.onReadFailure?.(); return { liquidityScore: null, spreadPct: null }; }
            return { liquidityScore: state.liquidityScore, spreadPct: 0.1 };
        } },
        '@/services/darkPool': { getDarkPoolBatch: async asked => state.failDarkPool ? {}
            : Object.fromEntries(asked.map(t => [t, { pct: state.darkPoolPct, source: 'FINRA' }])),
            getDarkPoolBatchChecked: async asked => state.failDarkPool ? { ok: false, reason: 'error' }
                : { ok: true, map: Object.fromEntries(asked.map(t => [t, { pct: state.darkPoolPct, source: 'FINRA' }])) } },
        '@/services/xsScores': { xsOverride: x => x, xsSnapshotOverride: (_, x) => x, ensureXsScores: async () => {} },
    };
    function load(relative) {
        const filename = path.join(root, relative);
        if (modules.has(filename)) return modules.get(filename).exports;
        const m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
        modules.set(filename, m);
        m.require = id => {
            const alias = id.startsWith('.') ? '@/'+path.relative(path.join(root, 'src'), path.resolve(path.dirname(filename), id)) : id;
            if (mocks[alias]) return mocks[alias];
            if (alias.startsWith('@/')) return load('src/'+alias.slice(2)+'.ts');
            return require(id);
        };
        const baselineFiles = ['src/services/watchlistBatchService.ts', 'src/services/optionAlphaService.ts', 'src/services/optionMetricsService.ts'];
        const source = old && baselineFiles.includes(relative)
            ? execFileSync('git', ['show', `${baseline}:${relative}`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(filename, 'utf8');
        m._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
        return m.exports;
    }
    const compute = async (...args) => { count.compute++; const service = load('src/services/watchlistBatchService.ts');
        return (service.processWatchlistBatchForApi ?? service.processWatchlistBatch)(...args); };
    const cacheModule = () => load('src/services/watchlistBatchCache.ts');
    const makeCache = (overrides = {}) => cacheModule().createWatchlistBatchCache({ read: mocks['@/services/redisClient'].mgetFromCache,
        write: mocks['@/services/redisClient'].setInCache, compute, after: mocks['next/server'].after, now: () => clock, ...overrides });
    return { load, compute, makeCache, cacheModule, count, state, store, jobs,
        drain: async () => { while (jobs.length) await Promise.all(jobs.splice(0).map(fn => fn())); } };
}

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`통과 ${passed}: ${name}`); };
const timing = () => ({ options: 0, main: 0, alpha: 0, fill: 0, json: 0, memory: 0, redis: 0, stale: 0, sync: 0, refresh: 0, analysisHit: 0, heal: 0, awsFill: 0, failed: false });
const startAt = iso => { clock = originalDate.parse(iso ?? '2026-10-20T12:00:00-04:00'); };
const request = (h, query = 'tickers=AAPL,NVDA&mode=price') => h.load('src/app/api/watchlist/batch/route.ts').GET(new Request(`http://offline.test/api/watchlist/batch?${query}`));

(async () => {
    const snapshots = {};
    for (const session of ['regular', 'closed']) for (const cached of [true, false]) for (const mode of ['price', 'price-dp', 'ssr', 'full']) {
        const name = `${session === 'regular' ? '장중' : '장외'}-${cached ? '분석적중' : '분석결측'}-${mode}`;
        startAt(session === 'regular' ? undefined : '2026-10-20T21:00:00-04:00');
        const h = harness({ cached, session, old: generate });
        snapshots[name] = JSON.stringify(await h.compute(['AAPL', 'NVDA'], mode, timing()));
        assert.equal(h.count.analysis, generate ? 2 : 1, '알파 분석 재조회 수');
    }
    for (const session of ['regular', 'closed']) {
        startAt(session === 'regular' ? undefined : '2026-10-20T21:00:00-04:00');
        const h = harness({ cached: false, session, unified: false, old: generate });
        snapshots[`${session === 'regular' ? '장중' : '장외'}-전체계산-full`] = JSON.stringify(await h.compute(['AAPL'], 'full', timing()));
        assert.equal(h.count.analysis, generate ? 2 : 1);
    }
    if (generate) {
        fs.mkdirSync(path.dirname(fixtureFile), { recursive: true });
        fs.writeFileSync(fixtureFile, JSON.stringify({ 기준커밋: baseline, 응답문자열: snapshots }, null, 2)+'\n');
        console.log(`기준선 생성: ${Object.keys(snapshots).length}개`); return;
    }
    await test('원본 응답 18개: 네 모드·장중/장외·분석 적중/결측·전체 계산의 JSON 바이트 동일, 분석 조회 2→1', () => {
        const before = JSON.parse(fs.readFileSync(fixtureFile, 'utf8')).응답문자열;
        assert.deepEqual(Object.keys(snapshots), Object.keys(before));
        for (const [name, body] of Object.entries(snapshots)) {
            let i = 0; while (i < body.length && body[i] === before[name][i]) i++;
            assert.ok(body === before[name], `${name}: ${i}번째 문자부터 불일치. 현재 ${body.slice(i, i + 100)} / 원본 ${before[name].slice(i, i + 100)}`);
        }
    });
    await test('실제 라우트: 냉기/메모리/Redis 본문 동일, 헤더만 추가, 메모리 적중 Redis·DynamoDB·시세 호출 0', async () => {
        startAt(); const h = harness();
        const firstResponse = await request(h), first = await firstResponse.text();
        const before = copy(h.count), second = await request(h);
        assert.equal(await second.text(), first); assert.deepEqual(h.count, before);
        for (const name of ['options', 'main', 'alpha', 'fill', 'json']) assert.match(firstResponse.headers.get('server-timing'), new RegExp(`batch_${name};dur=\\d+\\.\\d+`));
        assert.match(second.headers.get('server-timing'), /memory=2 redis=0 stale=0 sync=0/);
        const cold = h.makeCache(), detail = timing();
        assert.equal(JSON.stringify(await cold(['AAPL', 'NVDA'], 'price', detail)), first);
        assert.equal(h.count.compute, before.compute); assert.equal(detail.redis, 2);
    });
    await test('실제 라우트: 만료된 정상본을 먼저 반환, 동시 10요청의 배경 갱신 1회', async () => {
        startAt(); const h = harness(); const first = await (await request(h)).text();
        const before = copy(h.count); clock += 15_000;
        const responses = await Promise.all(Array.from({ length: 10 }, () => request(h)));
        for (const response of responses) assert.equal(await response.text(), first);
        assert.deepEqual(h.count, before); assert.equal(h.jobs.length, 1);
        await h.drain(); assert.equal(h.count.dynamo - before.dynamo, 2);
    });
    await test('겹친 종목 목록·다른 순서·다른 모드·동시 냉기 요청 합치기', async () => {
        startAt(); const h = harness(), get = h.makeCache();
        const all = await Promise.all(Array.from({ length: 10 }, (_, i) => get(i % 2 ? ['NVDA', 'AAPL'] : ['AAPL', 'SPY'], 'price', timing())));
        assert.equal(h.count.dynamo, 3); assert.equal(h.count.compute, 2);
        assert.deepEqual(all[1].results.map(r => r.ticker), ['NVDA', 'AAPL']);
        await get(['AAPL'], 'ssr', timing()); assert.equal(h.count.dynamo, 4);
        clock += 15_000;
        await Promise.all([get(['SPY', 'AAPL'], 'price', timing()), get(['AAPL', 'NVDA'], 'price', timing())]);
        const before = h.count.dynamo; await h.drain(); assert.equal(h.count.dynamo - before, 3);
    });
    await test('신선도 상한: 장중 60초·장외 10분까지 정상본, 1ms 초과는 동기 계산', async () => {
        for (const [iso, cap, session] of [[undefined, 60_000, 'regular'], ['2026-10-20T21:00:00-04:00', 600_000, 'closed']]) {
            startAt(iso); const h = harness({ session }), get = h.makeCache();
            const first = await get(['AAPL'], 'price', timing()), before = h.count.compute;
            clock += cap; assert.deepEqual(await get(['AAPL'], 'price', timing()), first); assert.equal(h.count.compute, before);
            clock++; const t = timing(); await get(['AAPL'], 'price', t);
            assert.equal(h.count.compute, before + 1); assert.equal(t.sync, 1);
            await h.drain(); assert.equal(h.count.compute, before + 1, '상한 요청이 예약 작업을 직접 실행해도 재실행 없음');
        }
    });
    await test('옵션/시세/레벨 실패 때 메모리·Redis 정상본과 원천 시각 유지, 실패 해소 뒤 갱신', async () => {
        for (const failure of ['failOptions', 'failSnapshots', 'failLevels']) {
            startAt(); const h = harness(), get = h.makeCache();
            const first = await get(['AAPL'], 'price', timing()), saved = JSON.stringify([...h.store]);
            const sourceTime = first.results[0].realtime.optionsAsOf;
            clock += 15_000; h.state[failure] = true;
            await get(['AAPL'], 'price', timing()); await h.drain();
            assert.equal(JSON.stringify([...h.store]), saved);
            assert.deepEqual(await get(['AAPL'], 'price', timing()), first);
            assert.equal(first.results[0].realtime.optionsAsOf, sourceTime);
            h.state[failure] = false; await h.drain();
            assert.notEqual(JSON.stringify([...h.store]), saved);
        }
    });
    for (const [failure, field, restored] of [['failDarkPool', 'darkPoolPct', 45], ['failLiquidity', 'liquidityScore', 85]]) {
        await test(`${failure}: 예외 없는 원천 결측에도 메모리·Redis 값과 시각 보존, 복구 뒤 정상 갱신`, async () => {
            startAt(); const h = harness(), get = h.makeCache();
            const first = await get(['AAPL'], 'price', timing());
            const key = h.cacheModule().watchlistBatchKey('AAPL', 'price');
            const saved = JSON.stringify(h.store.get(key));
            assert.equal(first.results[0].realtime[field], failure === 'failDarkPool' ? 40 : 80);
            clock += 15_000; h.state[failure] = true;
            assert.deepEqual(await get(['AAPL'], 'price', timing()), first); await h.drain();
            assert.equal(JSON.stringify(h.store.get(key)), saved, '실패가 Redis 정상본을 덮으면 안 됨');
            assert.deepEqual(await get(['AAPL'], 'price', timing()), first, '실패가 메모리 정상본을 덮으면 안 됨');
            const cold = h.makeCache();
            assert.deepEqual(await cold(['AAPL'], 'price', timing()), first, '빈 인스턴스도 같은 원천 시각의 정상본 복원');
            h.state[failure] = false; h.state[field] = restored; await h.drain();
            const recovered = await get(['AAPL'], 'price', timing());
            assert.equal(recovered.results[0].realtime[field], restored);
            assert.equal(h.store.get(key).at, clock);
            assert.notEqual(JSON.stringify(h.store.get(key)), saved);
        });
    }
    await test('실패 신호 없이 생긴 필드 결측·빈 값도 교체 거부, 0과 정상 복구는 갱신 허용', async () => {
        const losses = [
            r => r.realtime.darkPoolPct = null,
            r => r.realtime.liquidityScore = undefined,
            r => r.realtime.sparkline = [],
            r => r.alphaSnapshot.whyFactors = [],
            r => r.alphaSnapshot.capturedAt = '',
            r => r.alphaSnapshot = {},
        ];
        for (const lose of losses) {
            startAt(); const h = harness(); let partial = false;
            const get = h.makeCache({ compute: async (...args) => {
                const payload = await h.compute(...args);
                if (partial) lose(payload.results[0]);
                assert.equal(args[2].failed, false, '실패 신호와 별개인 완결성 검사');
                return payload;
            } });
            const first = await get(['AAPL'], 'price', timing()), saved = JSON.stringify([...h.store]);
            clock += 15_000; partial = true;
            await get(['AAPL'], 'price', timing()); await h.drain();
            assert.equal(JSON.stringify([...h.store]), saved);
            assert.deepEqual(await get(['AAPL'], 'price', timing()), first);
            partial = false; h.state.liquidityScore = 0; await h.drain();
            assert.equal((await get(['AAPL'], 'price', timing())).results[0].realtime.liquidityScore, 0);
        }
    });
    await test('상한·세션 경계 뒤에도 메모리/Redis 직전 정상본으로 완결성 비교, 옛 시각 재발급 없음', async () => {
        for (const nextTime of ['2026-10-20T12:01:01-04:00', '2026-10-20T16:00:00-04:00']) {
            for (const cold of [false, true]) {
                startAt(); const h = harness(); let partial = false, complete;
                const dependencies = { compute: async (...args) => {
                    // 세션 이동과 별개로 모든 원천이 완결된 판본을 공급해 캐시 정책만 검증한다.
                    complete ??= await h.compute(...args);
                    const payload = copy(complete);
                    payload.results[0].realtime.optionsAsOf = clock - 3600_000;
                    if (partial) payload.results[0].realtime.darkPoolPct = null;
                    return payload;
                } };
                let get = h.makeCache(dependencies);
                await get(['AAPL'], 'price', timing()); const saved = JSON.stringify([...h.store]);
                clock = originalDate.parse(nextTime); partial = true;
                if (cold) get = h.makeCache(dependencies);
                const t = timing(), response = await get(['AAPL'], 'price', t);
                assert.equal(t.sync, 1);
                assert.equal(response.results[0].realtime.darkPoolPct, null, '상한 초과 과거 정상본 응답 금지');
                assert.equal(JSON.stringify([...h.store]), saved, '직전 정상본은 비교·보존만');
                partial = false; await get(['AAPL'], 'price', timing());
                assert.notEqual(JSON.stringify([...h.store]), saved);
            }
        }
    });
    await test('API 원천 실패 관측: FINRA·유동성 예외 없는 실패가 failed 설정', async () => {
        for (const failure of ['failDarkPool', 'failLiquidity']) {
            startAt(); const h = harness(); h.state[failure] = true;
            const t = timing(); await h.makeCache()(['AAPL'], 'price', t);
            assert.equal(t.failed, true);
            assert.equal(h.store.size, 0, '냉기에서도 원천 실패를 정상본으로 저장하지 않음');
        }
    });
    await test('세션 경계·조기폐장·휴장·서머타임: TTL 안이어도 세션 변경은 동기 계산', async () => {
        const pairs = [
            ['2026-10-20T03:59:59-04:00', '2026-10-20T04:00:00-04:00'],
            ['2026-10-20T09:29:59-04:00', '2026-10-20T09:30:00-04:00'],
            ['2026-10-20T15:59:59-04:00', '2026-10-20T16:00:00-04:00'],
            ['2026-10-20T19:59:59-04:00', '2026-10-20T20:00:00-04:00'],
            ['2026-11-27T12:59:59-05:00', '2026-11-27T13:00:00-05:00'],
        ];
        for (const [from, to] of pairs) {
            startAt(from); const h = harness(), get = h.makeCache();
            await get(['AAPL'], 'price', timing()); clock = originalDate.parse(to);
            const t = timing(); await get(['AAPL'], 'price', t); assert.equal(t.sync, 1); assert.equal(h.count.compute, 2);
        }
        const { watchlistBatchWindow: window } = harness().cacheModule();
        assert.equal(window(originalDate.parse('2026-11-26T12:00:00-05:00')).maxAge, 600_000);
        assert.equal(window(originalDate.parse('2026-10-24T12:00:00-04:00')).maxAge, 600_000);
        assert.equal(window(originalDate.parse('2026-11-02T09:30:00-05:00')).maxAge, 60_000);
    });
    await test('저장본 변조·미래시각·다른 종목/모드/세션·상한 초과는 동기 계산', async () => {
        for (const mutate of [e => e.at = clock + 1, e => e.at -= 60_001, e => e.ticker = 'SPY', e => e.mode = 'full',
            e => e.scope = '과거세션', e => e.result.error = '합성 오류', e => e.result.realtime.price = 0]) {
            startAt(); const h = harness(); await h.makeCache()(['AAPL'], 'price', timing());
            const key = h.cacheModule().watchlistBatchKey('AAPL', 'price'); mutate(h.store.get(key));
            const before = h.count.compute; await h.makeCache()(['AAPL'], 'price', timing()); assert.equal(h.count.compute, before + 1);
        }
    });
    await test('소비자가 결과를 바꿔도 정상본 불변, 입력 검증·기존 Cache-Control 유지', async () => {
        startAt(); const h = harness(), get = h.makeCache();
        const first = await get(['AAPL'], 'price', timing()); first.results[0].realtime.price = 1;
        assert.equal((await get(['AAPL'], 'price', timing())).results[0].realtime.price, 100);
        assert.equal((await request(h, '')).status, 400);
        assert.equal((await request(h, 'tickers=,,')).status, 400);
        assert.equal((await request(h, 'tickers='+Array(51).fill('AAPL').join(','))).status, 400);
        const response = await request(h, 'tickers= aapl ,nvda&mode=invalid');
        assert.equal(response.headers.get('cache-control'), 'private, max-age=5, stale-while-revalidate=25');
        assert.equal(response.status, 200);
    });
    await test('계산 예외·오류 행·Redis 쓰기 실패가 기존 정상본을 지우지 않고 재시도 가능', async () => {
        for (const failure of ['예외', '오류행', '쓰기']) {
            startAt(); const h = harness(); let fail = false;
            const get = h.makeCache({
                compute: async (...args) => {
                    if (fail && failure === '예외') throw new Error('합성 계산 예외');
                    const payload = await h.compute(...args);
                    if (fail && failure === '오류행') payload.results[0] = { ticker: 'AAPL', error: '합성 오류' };
                    return payload;
                },
                write: async (key, value) => { if (fail && failure === '쓰기') throw new Error('합성 쓰기 실패');
                    h.store.set(key, copy(value)); return true; },
            });
            const first = await get(['AAPL'], 'price', timing()), stored = JSON.stringify([...h.store]);
            clock += 15_000; fail = true; await get(['AAPL'], 'price', timing()); await h.drain();
            assert.equal(JSON.stringify([...h.store]), stored);
            if (failure !== '쓰기') assert.deepEqual(await get(['AAPL'], 'price', timing()), first);
            fail = false; clock += 15_000; await get(['AAPL'], 'price', timing()); await h.drain();
            assert.notEqual(JSON.stringify([...h.store]), stored);
        }
    });
    await test('상한 초과 계산 실패 시 과거 정상본을 응답하지 않고 저장본만 유지', async () => {
        startAt(); const h = harness(); let fail = false;
        const get = h.makeCache({ compute: async (...args) => {
            if (fail) throw new Error('합성 계산 실패'); return h.compute(...args);
        } });
        await get(['AAPL'], 'price', timing()); const saved = JSON.stringify([...h.store]);
        clock += 60_001; fail = true;
        await assert.rejects(get(['AAPL'], 'price', timing()), /합성 계산 실패/);
        assert.equal(JSON.stringify([...h.store]), saved);
        fail = false; const t = timing(); await get(['AAPL'], 'price', t); assert.equal(t.sync, 1);
    });
    await test('느린 계산은 정상본 수명을 늘리지 않으며 다른 종목 대기 중 상한을 넘은 적중본도 동기 계산', async () => {
        startAt(); const h = harness(); let slow = false;
        const get = h.makeCache({ compute: async (...args) => { if (slow) clock += 60_001; return h.compute(...args); } });
        slow = true; await get(['AAPL'], 'price', timing()); assert.equal(h.store.size, 0);
        slow = false; await get(['AAPL'], 'price', timing()); assert.equal(h.store.size, 1);
        clock += 59_999;
        const get2 = h.makeCache({ compute: async (...args) => { clock += 2; return h.compute(...args); } });
        const t = timing(); await get2(['AAPL', 'NVDA'], 'price', t);
        assert.equal(t.sync, 2, 'NVDA 동기 계산을 기다린 AAPL도 상한 초과라 동기 계산');
        await h.drain();
    });
    await test('배치 API 외 SSR·AI 재료 진입점과 알파 공유 호출자는 기존 분석 재조회 동작 유지', async () => {
        startAt(); const h = harness();
        await h.load('src/services/watchlistBatchService.ts').processWatchlistBatch(['AAPL'], 'price');
        assert.equal(h.count.analysis, 2);
        await h.load('src/services/optionAlphaService.ts').readOptionAlpha(['AAPL'], new Map());
        assert.equal(h.count.analysis, 3);
    });
    console.log(`총 ${passed}개 시험 통과. 운영 I/O 0회.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(watchdog); global.Date = originalDate; global.setTimeout = originalTimeout; });
