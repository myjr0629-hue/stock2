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
    const state = { failOptions: false, failSnapshots: false, failLevels: false, emptyLevels: false, noLevels: false, dpRowMissing: false,
        failDarkPool: false, failLiquidity: false, darkPoolPct: 40, liquidityScore: 80 };
    const tickers = ['AAPL', 'NVDA', 'SPY'];
    let oiRowPatch = row => row;
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
                return oiRowPatch({ timestamp: clock - 3600_000, pcr: 0.81, totalCallOI: 100, totalPutOI: 81,
                    gex: 1e7, netPremium: 5e5, maxPain: 100, callWall: 110, putFloor: 90, squeezeScore: 30 }); },
            getLatestFlow: async () => { count.dynamo++; return { netPremium: 5e5 }; },
        },
        '@/lib/aws/unifiedCacheProvider': { getUnifiedCache: async () => { count.dynamo++; return unified ? { structure: copy(structure) } : null; } },
        '@/services/structureService': {
            getStructureData: async () => copy(structure),
            prefetchLevelsForExit: (asked, opts) => async () => { if (state.failLevels) throw new Error('합성 레벨 실패');
                // 관문 10211116: 레벨 저장소 읽기만 실패 → 예외 없이 빈 Map(실제 peekStructureLevelsCore 와 같이 onReadFailure 를 알린다)
                if (state.emptyLevels) { opts?.onReadFailure?.(); return new Map(); }
                // Redis 장애가 null[] 로 옴 = 판본 미도착(실제 peekStructureLevelsCore onSeen false)
                if (state.levelsNullRead) { asked.forEach(t => opts?.onSeen?.(t, false)); return new Map(); }
                asked.forEach(t => opts?.onSeen?.(t, true));
                if (state.noLevels) return new Map();   // 판본은 옴, 레벨 없음(NO_MARKET 등) = 정당한 빈 값
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
            if (state.failLiquidity || state.failLiquidityFor === _ticker) { options?.onReadFailure?.(); return { liquidityScore: null, spreadPct: null }; }
            if (state.liqNullFor === _ticker) return { liquidityScore: null, spreadPct: null };   // 읽기 성공·행 없음 = 정당한 null
            return { liquidityScore: state.liquidityScore, spreadPct: 0.1 };
        } },
        '@/services/darkPool': { getDarkPoolBatch: async asked => state.failDarkPool ? {}
            : Object.fromEntries(asked.map(t => [t, { pct: state.darkPoolPct, source: 'FINRA' }])),
            getDarkPoolBatchChecked: async asked => state.failDarkPool ? { ok: false, reason: 'error' }
                : { ok: true, map: state.dpRowMissing ? {} : Object.fromEntries(asked.map(t => [t, { pct: state.darkPoolPct, source: 'FINRA' }])) } },
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
    return { load, compute, makeCache, cacheModule, count, state, store, jobs, structure, setOiRow: fn => { oiRowPatch = fn; },
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
    // 관문 10210914·10211116 재현 + 근본 설계(필드 묶음 병합) 검증
    // 옵션 원천 실패 때 기존 AWS 보충 분기가 atmIv 시각 키를 null 로 싣는다(값 아님, 기존 동작) — 값 비교에서만 뺀다.
    const norm = v => { const c = copy(v); for (const r of (c.results ?? [c])) for (const k of ['atmIvSourceDate', 'atmIvObservedAt'])
        if (r?.realtime && r.realtime[k] === null) delete r.realtime[k];
        // 합성 OI 행 시각은 시계를 따라 움직인다 — 옵션 원천이 살아 있는 경우의 새 시각은 정상. 옵션 실패는 아래에서 시각을 따로 확인.
        for (const r of (c.results ?? [c])) if (r?.realtime) delete r.realtime.optionsAsOf; return c; };
    for (const [failure, expectHeld] of [['failOptions', ['gex', 'squeeze', 'pcr']], ['failLevels', ['levels']],
        ['emptyLevels', ['levels']], ['failDarkPool', ['darkPool']], ['failLiquidity', ['liquidity']]]) {
        await test(`${failure}: 원천 실패 결측은 직전 값·원천 시각 유지(응답·메모리·Redis·빈 인스턴스), 5초 뒤 배경 재계산, 복구 뒤 새 값`, async () => {
            startAt(); const h = harness(), get = h.makeCache();
            const first = await get(['AAPL'], 'price', timing());
            const key = h.cacheModule().watchlistBatchKey('AAPL', 'price');
            const firstAt = h.store.get(key).at;
            clock += 15_000; h.state[failure] = true;
            await get(['AAPL'], 'price', timing()); await h.drain();   // 만료 → 배경 계산(실패 주입)
            const saved = h.store.get(key);
            assert.deepEqual(norm(saved.result), norm(first.results[0]), '실패 계산이 값을 비우거나 바꾸면 안 됨');
            assert.deepEqual(Object.keys(saved.held).sort(), [...expectHeld].sort(), '유지 묶음 기록');
            if (failure === 'failOptions') assert.equal(saved.result.realtime.optionsAsOf, first.results[0].realtime.optionsAsOf, 'P/C 유지값은 원래 행 시각');
            for (const g of expectHeld) assert.equal(saved.held[g], firstAt, '유지값의 시각 = 처음 계산된 시각');
            assert.equal(saved.at, clock, '병합본은 저장(장애가 정상본 갱신을 영구히 막지 않음)');
            const t1 = timing();
            assert.deepEqual(norm(await get(['AAPL'], 'price', t1)), norm(first), '메모리 적중 = 직전 값');
            assert.equal(t1.stale, 0);
            const cold = h.makeCache();
            assert.deepEqual(norm(await cold(['AAPL'], 'price', timing())), norm(first), '빈 인스턴스 Redis 복원도 같은 값');
            // 5초 뒤 유지 묶음 재계산 예약(원천 아직 실패 → 계속 유지, 시각 그대로)
            clock += 5_000; const t2 = timing();
            await get(['AAPL'], 'price', t2); assert.equal(t2.stale, 1, '유지 묶음은 짧은 뒤 배경 재계산'); await h.drain();
            assert.deepEqual(norm(h.store.get(key).result), norm(first.results[0]));
            for (const g of expectHeld) assert.equal(h.store.get(key).held[g], firstAt, '연속 유지에도 원래 시각');
            // 복구
            h.state[failure] = false;
            if (failure === 'failDarkPool') h.state.darkPoolPct = 45;
            if (failure === 'failLiquidity') h.state.liquidityScore = 85;
            clock += 5_000; await get(['AAPL'], 'price', timing()); await h.drain();
            const recovered = await get(['AAPL'], 'price', timing());
            assert.equal(h.store.get(key).held, undefined, '복구 뒤 유지 표식 없음');
            if (failure === 'failDarkPool') assert.equal(recovered.results[0].realtime.darkPoolPct, 45);
            if (failure === 'failLiquidity') assert.equal(recovered.results[0].realtime.liquidityScore, 85);
            if (failure !== 'failDarkPool' && failure !== 'failLiquidity') {
                // 복구 뒤 새 원천 행(합성 행 시각 = 시계 − 1시간)이 새 시각으로 들어온다 = 유지값이 아니라 새 값
                assert.equal(recovered.results[0].realtime.optionsAsOf, clock - 3600_000 - (clock - h.store.get(key).at));
                assert.deepEqual(norm(recovered.results[0]), norm(first.results[0]));
            }
        });
    }
    await test('관문 10210914: FINRA 실패 시 다크풀 40 유지·고래지수 65 유지(66 아님)', async () => {
        startAt(); const h = harness(), get = h.makeCache();
        const first = await get(['AAPL'], 'price', timing());
        assert.equal(first.results[0].realtime.whaleIndex, 65);
        clock += 60_001; h.state.failDarkPool = true;   // 상한 넘김 → 동기 계산 응답도 병합본
        const t = timing(), r = await get(['AAPL'], 'price', t);
        assert.equal(t.sync, 1);
        assert.equal(r.results[0].realtime.darkPoolPct, 40);
        assert.equal(r.results[0].realtime.darkPoolSource, 'FINRA');
        assert.equal(r.results[0].realtime.whaleIndex, 65);
    });
    await test('관문 10211255: 구조 판본 만기·NO_MARKET·OI 계산 불가로 정당하게 빈 GEX·스퀴즈·P/C 는 유지하지 않음', async () => {
        for (const scenario of ['만기', 'NO_MARKET', 'OI 계산 불가']) {
            startAt(scenario === '만기' ? '2026-10-23T15:59:50-04:00' : undefined);
            const h = harness(), get = h.makeCache();
            const first = (await get(['AAPL'], 'price', timing())).results[0].realtime;
            assert.equal(first.gex, 1e7); assert.equal(first.pcr, 0.81);
            if (scenario === '만기') clock = originalDate.parse('2026-10-23T16:00:00-04:00');
            else clock += 60_001;
            if (scenario === 'NO_MARKET') h.structure.options_status = 'NO_MARKET';
            if (scenario === 'OI 계산 불가') h.setOiRow(row => ({ ...row, totalCallOI: 0, totalPutOI: 100, pcr: null }));
            const rt = (await get(['AAPL'], 'price', timing())).results[0].realtime;
            if (scenario === 'OI 계산 불가') { assert.equal(rt.pcr, null, 'P/C 정당한 null'); assert.equal(rt.optionsAsOf, null); assert.equal(rt.gex, 1e7); }
            else { assert.equal(rt.gex, null, `${scenario}: GEX 정당한 null`); assert.equal(rt.squeezeScore, null); }
        }
    });
    await test('관문 최신: 레벨 판본 없음(읽기 성공)·FINRA 행 없음(조회 성공)은 정당한 null — 유지하지 않음', async () => {
        for (const [flag, field] of [['noLevels', 'callWall'], ['dpRowMissing', 'darkPoolPct']]) {
            startAt(); const h = harness(), get = h.makeCache();
            await get(['AAPL'], 'price', timing());
            clock += 60_001; h.state[flag] = true;
            const rt = (await get(['AAPL'], 'price', timing())).results[0].realtime;
            assert.equal(rt[field] ?? null, null, `${flag}: ${field} null 그대로`);
            assert.equal([...h.store.values()][0].held, undefined);
        }
    });
    await test('관문 3차: 다른 종목의 유동성 실패가 이 종목의 정당한 결측을 덮지 않음·GEX 만기 하한 롤 뒤 유지 안 함·Redis null[] 레벨은 유지', async () => {
        // ① AAPL 은 읽기 성공·행 없음(정당한 null), NVDA 만 읽기 실패
        startAt(); let h = harness(), get = h.makeCache();
        await get(['AAPL', 'NVDA'], 'price', timing());
        clock += 60_001; h.state.liqNullFor = 'AAPL'; h.state.failLiquidityFor = 'NVDA';
        let r = await get(['AAPL', 'NVDA'], 'price', timing());
        assert.equal(r.results[0].realtime.liquidityScore, null, 'AAPL 정당한 null 그대로');
        assert.equal(r.results[1].realtime.liquidityScore, 80, 'NVDA 못 읽음 → 직전 값 유지');
        // ② 10/23 15:59:50 저장 → 16:00 만기 하한 롤 + 구조 미도착 → GEX·스퀴즈 유지 안 함(레벨은 판본 만기로 유지 안 함)
        startAt('2026-10-23T15:59:50-04:00'); h = harness(); get = h.makeCache();
        await get(['AAPL'], 'price', timing());
        clock = originalDate.parse('2026-10-23T16:00:00-04:00'); h.state.failOptions = true;
        r = await get(['AAPL'], 'price', timing());
        assert.equal(r.results[0].realtime.gex, null); assert.equal(r.results[0].realtime.squeezeScore, null);
        // ③ Redis 가 장애를 null[] 로 줌(구조 판본 미도착, 레벨 읽기 콜백 없음) → 레벨 유지
        startAt(); h = harness(); get = h.makeCache();
        await get(['AAPL'], 'price', timing());
        clock += 60_001; h.state.levelsNullRead = true;   // 옵션 선조회는 성공, 레벨 읽기만 null[]
        r = await get(['AAPL'], 'price', timing());
        assert.equal(r.results[0].realtime.callWall, 110, '레벨 읽기 판본 미도착 → 레벨 유지');
        assert.ok([...h.store.values()][0].held.levels);
    });
    await test('시세 실패(가격 결측)는 정상본 교체 없음', async () => {
        startAt(); const h = harness(), get = h.makeCache();
        const first = await get(['AAPL'], 'price', timing()); const saved = JSON.stringify([...h.store]);
        clock += 15_000; h.state.failSnapshots = true;
        await get(['AAPL'], 'price', timing()); await h.drain();
        assert.equal(JSON.stringify([...h.store]), saved);
        assert.deepEqual(await get(['AAPL'], 'price', timing()), first);
        h.state.failSnapshots = false; await get(['AAPL'], 'price', timing()); await h.drain();
        assert.notEqual(JSON.stringify([...h.store]), saved);
    });
    await test('원천 미도착 증거 없는 결측(정당한 null)은 유지하지 않고 새 계산 그대로 저장', async () => {
        const cases = [
            [r => r.realtime.darkPoolPct = null, r => assert.equal(r.realtime.darkPoolPct, null), []],
            [r => { delete r.realtime.liquidityScore; }, r => assert.equal(r.realtime.liquidityScore, undefined), []],
            [r => r.realtime.whaleIndex = null, r => assert.equal(r.realtime.whaleIndex, null), []],
            [r => r.realtime.liquidityScore = 0, r => assert.equal(r.realtime.liquidityScore, 0), []],
            [r => r.realtime.sparkline = [], r => assert.deepEqual(r.realtime.sparkline, []), []],
            [r => r.realtime.ivSkew = null, r => assert.equal(r.realtime.ivSkew, null), []],
            [r => r.realtime.return3d = null, r => assert.equal(r.realtime.return3d, null), []],
            [r => r.realtime.callWall = null, r => assert.equal(r.realtime.callWall, null), []],
            [r => r.alphaSnapshot.whyFactors = [], r => assert.deepEqual(r.alphaSnapshot.whyFactors, []), []],
            [r => r.alphaSnapshot.capturedAt = '', r => assert.equal(r.alphaSnapshot.capturedAt, ''), []],
            [r => r.alphaSnapshot = {}, r => assert.deepEqual(r.alphaSnapshot, {}), []],
            [r => r.alphaSnapshot = null, r => assert.equal(r.alphaSnapshot, null), []],
        ];
        for (const [lose, verify, heldGroups] of cases) {
            startAt(); const h = harness(); let partial = false;
            const get = h.makeCache({ compute: async (...args) => {
                const payload = await h.compute(...args);
                if (partial) lose(payload.results[0]);
                return payload;
            } });
            await get(['AAPL'], 'price', timing()); const saved = JSON.stringify([...h.store]);
            clock += 15_000; partial = true;
            await get(['AAPL'], 'price', timing()); await h.drain();
            assert.notEqual(JSON.stringify([...h.store]), saved);
            const stored = [...h.store.values()][0];
            assert.deepEqual(Object.keys(stored.held ?? {}).sort(), heldGroups);
            const before = copy(h.count), updated = await get(['AAPL'], 'price', timing());
            assert.deepEqual(h.count, before, '새 정상본의 메모리 적중은 원천을 다시 읽지 않음');
            assert.deepEqual(updated.results[0], stored.result);
            verify(updated.results[0]);
        }
    });
    for (const scenario of ['PRE→정규장', 'changePct 복구']) {
        await test(`${scenario}: 후속 정상 계산 3/3 저장, 메모리·빈 인스턴스 Redis 적중`, async () => {
            for (const cold of [false, true]) {
                startAt(scenario === 'PRE→정규장' ? '2026-10-20T09:29:59-04:00' : undefined);
                const h = harness(); let recovered = false, complete;
                const dependencies = { compute: async (...args) => {
                    complete ??= await h.compute(...args);
                    const payload = copy(complete), rt = payload.results[0].realtime;
                    if (scenario === 'PRE→정규장') {
                        rt.extendedPrice = recovered ? null : 101;
                        rt.extendedChange = recovered ? null : 1;
                        rt.extendedChangePct = recovered ? null : 1;
                        rt.session = recovered ? 'regular' : 'pre';
                    } else {
                        rt.changePct = recovered ? 2 : null;
                        rt.missingFields = recovered ? [] : ['changePct'];
                    }
                    assert.equal(args[2].failed, false);
                    return payload;
                } };
                let get = h.makeCache(dependencies);
                await get(['AAPL'], 'price', timing());
                const key = h.cacheModule().watchlistBatchKey('AAPL', 'price');
                const initialWrites = h.count.writes;
                recovered = true;
                for (let i = 0; i < 3; i++) {
                    clock = i === 0 && scenario === 'PRE→정규장'
                        ? originalDate.parse('2026-10-20T09:30:00-04:00') : clock + 60_001;
                    if (cold) get = h.makeCache(dependencies);
                    const t = timing(), response = await get(['AAPL'], 'price', t);
                    assert.equal(t.sync, 1, '세션 경계·상한 뒤 정상 계산');
                    assert.equal(h.count.writes, initialWrites + i + 1, '정상 저장 3/3');
                    assert.equal(h.store.get(key).at, clock);
                    assert.deepEqual(response.results[0], h.store.get(key).result);
                    if (scenario === 'PRE→정규장') assert.equal(response.results[0].realtime.extendedPrice, null);
                    else {
                        assert.equal(response.results[0].realtime.changePct, 2);
                        assert.deepEqual(response.results[0].realtime.missingFields, []);
                    }
                    const before = copy(h.count), hit = timing();
                    assert.deepEqual(await get(['AAPL'], 'price', hit), response);
                    assert.equal(hit.memory, 1); assert.equal(hit.sync, 0); assert.deepEqual(h.count, before);
                    const redisHit = timing();
                    assert.deepEqual(await h.makeCache(dependencies)(['AAPL'], 'price', redisHit), response);
                    assert.equal(redisHit.redis, 1); assert.equal(redisHit.sync, 0);
                    assert.equal(h.count.compute, before.compute);
                    assert.equal(h.jobs.length, 0);
                }
            }
        });
    }
    await test('상한·세션 경계 뒤: 30분 안 유지(원래 원천 시각), 30분 넘으면 새 계산(빈 값) 그대로, 옛 시각 재발급 없음', async () => {
        for (const [nextTime, held] of [['2026-10-20T12:01:01-04:00', true], ['2026-10-20T16:00:00-04:00', false]]) {
            for (const cold of [false, true]) {
                startAt(); const h = harness(); let partial = false, complete;
                const dependencies = { compute: async (...args) => {
                    complete ??= await h.compute(...args);
                    const payload = copy(complete);
                    payload.results[0].realtime.optionsAsOf = clock - 3600_000;
                    payload.results[0].realtime.darkPoolDate = '2026-10-19';
                    if (partial) {
                        Object.assign(payload.results[0].realtime, { darkPoolPct: null, darkPoolVol: null, darkPoolDate: null, darkPoolSource: null });
                        args[2].failed = true; args[2].missed = { AAPL: { darkPool: true } };
                    }
                    return payload;
                } };
                let get = h.makeCache(dependencies);
                await get(['AAPL'], 'price', timing());
                const firstAt = [...h.store.values()][0].at;
                clock = originalDate.parse(nextTime); partial = true;
                if (cold) get = h.makeCache(dependencies);
                const t = timing(), response = await get(['AAPL'], 'price', t);
                assert.equal(t.sync, 1);
                const rt = response.results[0].realtime, stored = [...h.store.values()][0];
                assert.equal(stored.at, clock, '병합본 저장');
                if (held) {
                    assert.equal(rt.darkPoolPct, 40); assert.equal(rt.darkPoolDate, '2026-10-19', '원천 날짜 그대로');
                    assert.equal(stored.held.darkPool, firstAt);
                } else {
                    assert.equal(rt.darkPoolPct, null, '유지 상한 넘은 과거 값 응답 금지');
                    assert.equal(rt.darkPoolDate, null);
                    assert.equal(stored.held, undefined);
                }
            }
        }
    });
    await test('병합 규칙 단위: 원천 미도착 증거가 있을 때만 유지·재검사(만기·정의 위반·신선도)·파생값·알파 설명 동등성', () => {
        const h = harness(); const { mergeHeldFields, HOLD_MAX_MS } = h.load('src/services/watchlistBatchMerge.ts');
        const now = originalDate.parse('2026-10-20T12:00:00-04:00');
        const base = () => ({ ticker: 'AAPL', alphaSnapshot: { score: 70, action: 'WATCH', capturedAt: 'x', whyKR: 'GEX안전지대' }, realtime: {
            price: 100, session: 'reg', extendedPrice: 101, extendedChangePct: 1, changePct: 2, ivSkew: 1.1, return3d: 3.09,
            maxPain: 100, callWall: 110, putFloor: 90, gammaFlipLevel: 95, levelsSource: 'structure', levelsExpiration: '2026-10-23',
            levelsAsOf: now - 60_000, levelsRefPrice: 100, maxPainDist: 0, wallRangePct: 20,
            pcr: 0.8, optionsAsOf: now - 3600_000, pcrBasis: 'oi_all_expiries_35d', squeezeScore: 30, squeezeRisk: 'LOW',
            gex: 1e7, darkPoolPct: 40, netPremium: 5e5, blockTrades: null, whaleIndex: 65, liquidityScore: 80, spreadPct: 0.1 } });
        const prev = { at: now - 15_000, result: base() };
        const run = (mutate, ev) => { const next = { at: now, result: base() }; mutate(next.result.realtime, next.result); mergeHeldFields(prev, next, now, ev); return next; };
        const noLv = rt => { rt.maxPain = rt.callWall = rt.putFloor = rt.gammaFlipLevel = null; rt.levelsSource = null; rt.levelsAsOf = null; rt.levelsExpiration = null; };
        const all = { structure: false, oiRow: false, missed: { darkPool: true, liquidity: true, levels: true } };
        // 세션 표시·분석 캐시 유래값은 증거가 있어도 유지 대상 아님
        let n = run(rt => { rt.extendedPrice = null; rt.changePct = null; rt.ivSkew = null; rt.return3d = null; }, all);
        assert.equal(n.result.realtime.extendedPrice, null); assert.equal(n.result.realtime.ivSkew, null); assert.equal(n.result.realtime.return3d, null); assert.equal(n.held, undefined);
        // 원천 읽음(증거 없음) → 레벨·다크풀·GEX·P/C null 그대로(NO_MARKET·FINRA 행 없음·OI 계산 불가)
        n = run(rt => { noLv(rt); rt.darkPoolPct = null; rt.gex = null; rt.pcr = null; }, { structure: true, oiRow: true, missed: {} });
        assert.equal(n.result.realtime.callWall, null); assert.equal(n.result.realtime.darkPoolPct, null); assert.equal(n.result.realtime.gex, null); assert.equal(n.result.realtime.pcr, null); assert.equal(n.held, undefined);
        // 증거 자체가 없으면(undefined) 유지 안 함
        n = run(rt => { rt.darkPoolPct = null; }, undefined); assert.equal(n.result.realtime.darkPoolPct, null);
        // 레벨 저장소 못 읽음 → 직전 레벨·시각 유지, 거리·폭은 새 가격으로
        n = run(rt => { noLv(rt); rt.price = 104; }, { missed: { levels: true } });
        assert.equal(n.result.realtime.callWall, 110); assert.equal(n.result.realtime.levelsAsOf, now - 60_000);
        assert.equal(n.result.realtime.maxPainDist, Number((((100 - 104) / 104) * 100).toFixed(2)));
        assert.deepEqual(Object.keys(n.held), ['levels']);
        // 새 가격 기준 정의 위반(콜월 110 ≤ 가격) → 유지 안 함
        n = run(rt => { noLv(rt); rt.price = 115; }, { missed: { levels: true } }); assert.equal(n.result.realtime.callWall, null);
        // 직전 판본 만기 지남 → 유지 안 함
        const expPrev = { at: now - 15_000, result: base() }; expPrev.result.realtime.levelsExpiration = '2026-10-19';
        n = { at: now, result: base() }; noLv(n.result.realtime); mergeHeldFields(expPrev, n, now, { missed: { levels: true } }); assert.equal(n.result.realtime.callWall, null);
        // P/C 행 못 읽음이어도 직전 행이 신선도 상한 초과면 유지 안 함
        const stalePrev = { at: now - 15_000, result: base() }; stalePrev.result.realtime.optionsAsOf = now - 10 * 86400_000;
        n = { at: now, result: base() }; n.result.realtime.pcr = null; mergeHeldFields(stalePrev, n, now, { oiRow: false }); assert.equal(n.result.realtime.pcr, null);
        // 유지 상한 30분
        const old = { at: now - HOLD_MAX_MS - 1, result: base() };
        n = { at: now, result: base() }; n.result.realtime.darkPoolPct = null; mergeHeldFields(old, n, now, { missed: { darkPool: true } }); assert.equal(n.result.realtime.darkPoolPct, null);
        // 다크풀 못 읽음 → 유지·고래지수 재계산·입력 동일 + 같은 판본이면 직전 설명
        n = run((rt, r) => { rt.darkPoolPct = null; rt.whaleIndex = 1; r.alphaSnapshot = { score: 70, action: 'WATCH', capturedAt: 'x', whyKR: '일부 신호' }; }, { missed: { darkPool: true } });
        assert.equal(n.result.realtime.darkPoolPct, 40); assert.notEqual(n.result.realtime.whaleIndex, 1); assert.equal(n.result.alphaSnapshot.whyKR, 'GEX안전지대');
        // NO_MARKET(GEX 정당한 null) + 다크풀 못 읽음 → 다크풀만 유지, 설명은 새 계산 그대로(관문: «GEX안전지대» 잔존 금지)
        n = run((rt, r) => { rt.darkPoolPct = null; rt.gex = null; r.alphaSnapshot = { score: 70, action: 'WATCH', capturedAt: 'x', whyKR: '일부 신호' }; }, { structure: true, missed: { darkPool: true } });
        assert.equal(n.result.realtime.darkPoolPct, 40); assert.equal(n.result.realtime.gex, null); assert.equal(n.result.alphaSnapshot.whyKR, '일부 신호');
        // 같은 판본이어도 고래지수 입력(순프리미엄)이 바뀌면 설명은 새 계산 그대로(관문 4차: 65→35 인데 «기관매집» 복원 금지)
        n = run((rt, r) => { rt.darkPoolPct = null; rt.netPremium = -5e5; r.alphaSnapshot = { score: 70, action: 'WATCH', capturedAt: 'x', whyKR: '기관분배' }; }, { missed: { darkPool: true } });
        assert.equal(n.result.realtime.darkPoolPct, 40); assert.equal(n.result.alphaSnapshot.whyKR, '기관분배');
        // 판본이 바뀌었으면(score·capturedAt) 설명도 새 것
        n = run((rt, r) => { rt.darkPoolPct = null; r.alphaSnapshot = { score: 71, action: 'WATCH', capturedAt: 'y', whyKR: '새 판본' }; }, { missed: { darkPool: true } });
        assert.equal(n.result.alphaSnapshot.whyKR, '새 판본');
    });
    await test('API 원천 실패 관측: FINRA·유동성 예외 없는 실패가 failed 설정, 냉기 실패 판본은 5초 뒤 재계산', async () => {
        for (const failure of ['failDarkPool', 'failLiquidity']) {
            startAt(); const h = harness(); h.state[failure] = true;
            const t = timing(); await h.makeCache()(['AAPL'], 'price', t);
            assert.equal(t.failed, true);
            const key = h.cacheModule().watchlistBatchKey('AAPL', 'price');
            assert.equal(h.store.get(key).retry, true, '냉기 실패 판본은 재시도 표식');
            h.state[failure] = false; clock += 5_000;
            const t2 = timing(); await h.makeCache()(['AAPL'], 'price', t2); await h.drain();
            assert.equal(t2.stale, 1, '5초 뒤 배경 재계산');
            assert.equal(h.store.get(key).retry, undefined);
            assert.equal(h.store.get(key).result.realtime[failure === 'failDarkPool' ? 'darkPoolPct' : 'liquidityScore'], failure === 'failDarkPool' ? 40 : 80);
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
