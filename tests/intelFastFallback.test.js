// 실제 라우트·분석 만료 판정·구조 계산을 메모리 I/O로 격리한다. 외부 호출·운영 쓰기 금지.
// 실행: node tests/intelFastFallback.test.js [--baseline: 수정 전 HEAD로 결함 재현]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const realTimer = setTimeout;
const watchdog = realTimer(() => { console.error('시험 시간 초과'); process.exit(1); }, 15000);
global.setTimeout = (...args) => { const timer = realTimer(...args); timer.unref(); return timer; };
let network = 0;
global.fetch = async () => { network++; throw new Error('외부 호출 금지'); };
let now = Date.parse('2026-10-20T17:00:00-04:00'); // 조사 시각: KST 10/21 06시
Date.now = () => now;
const tickers = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'];
const mem = new Map();
let keysRead = [], writes = 0, snapshotCalls = 0, warmCalls = 0, tripped = false, holdRead = null;
let bgAfter = [];
const response = body => ({ ok: true, json: async () => body, clone: () => response(body) });
const noop = async () => {};
const mocks = {
    'next/server': { NextResponse: { json: response }, NextRequest: Request, after: fn => bgAfter.push(fn) },
    '@/services/redisClient': {
        getFromCache: async k => { keysRead.push(k); return mem.get(k) ?? null; },
        mgetFromCache: async keys => {
            keysRead.push(...keys);
            if (holdRead && keys.some(k => k.startsWith('structure:'))) await holdRead;
            return keys.map(k => mem.get(k) ?? null);
        },
        setInCache: async () => { writes++; return true; },
    },
    '@/services/xsScores': { ensureXsScores: noop, xsSnapshotOverride: (_, x) => x },
    '@/services/darkPool': { getDarkPoolBatch: async () => ({}) },
    '@/services/eodSnapshot': { readEodCloses: async () => null },
    '@/services/structureService': {
        structureV2Key: t => `structure:v2:${t}`, structureLastGoodKey: t => `structure:lastgood:${t}`,
        levelsForExit: async () => new Map(), applyLevelsToRealtime: () => {},
    },
    '@/services/optionMetricsService': { readOptionMetrics: async () => new Map() },
    '@/lib/optionMetrics': { applyOptionMetrics: () => {} },
    '@/services/massiveClient': { CACHE_POLICY: { LIVE: 'live' }, fetchMassive: async () => {
        snapshotCalls++;
        if (tripped) BG.bgStore.getStore().tripped = true; // 앞선 공급사 실패가 같은 갱신 흐름의 관문을 닫은 상황
        return { tickers: tickers.map(ticker => ({ ticker, day: { c: 100, v: 10 }, prevDay: { c: 99 }, todaysChangePerc: 1 })) };
    } },
    '@/services/centralDataHub': { CentralDataHub: { getMarketStatus: async () => ({ session: 'post' }) } },
    '@/services/lastSession': { reconstructLastSession: async () => ({}) },
    '@/services/intrinioClient': { sessionAwareLiquidity: async () => ({}) },
    '@/services/alphaEngine': { calculateWhaleIndex: () => 50 },
    '@/app/api/live/ticker/route': { GET: async () => {
        warmCalls++;
        return response({ alpha: null, flow: { netPremium: 10, ivSkew: 0.1 }, display: { rsi14: 45 } });
    } },
    '@/lib/aws/dynamoDataProvider': { getLatestGex: async () => null, getLatestFlow: async () => null },
    '@/lib/app/intelOptionsBasis': { latestCollectorGexRow: async () => null, latestOptionsAsOf: () => null,
        oiPcrAllExpiries: () => null, gexFromRow: () => null, isFreshOptionsRow: () => false },
    '@/services/extendedSessionClose': {}, // POST 흐름은 이 모듈을 호출하지 않는다.
    '@/lib/cache/staleLock': { tryBackgroundLock: async () => false, releaseBackgroundLock: noop, ageSec: ms => ms / 1000 },
    '@/lib/intrinioCallMeter': { noteEvent: () => {}, flushCallMeterNow: noop },
    '@/lib/intelFastGovernor': { governorOff: async () => true, decideBackground: async () => ({ run: true }) },
};
const modules = new Map();
function load(file) {
    file = path.resolve(root, file);
    if (modules.has(file)) return modules.get(file).exports;
    const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); modules.set(file, m);
    m.require = id => {
        if (mocks[id]) return mocks[id];
        if (id.startsWith('@/')) return load('src/' + id.slice(2) + '.ts');
        if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id) + '.ts');
        if (id.startsWith('node:')) return require(id);
        throw new Error('격리하지 않은 의존성: ' + id);
    };
    const rel = path.relative(root, file);
    const original = baseline && ['src/app/api/intel/fast/route.ts', 'src/services/impliedMoveService.ts'].includes(rel);
    const source = original ? execFileSync('git', ['show', 'HEAD:' + rel], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(file, 'utf8');
    m._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file);
    return m.exports;
}
const route = load('src/app/api/intel/fast/route.ts');
const helper = load('src/services/intelFastFallback.ts');
const IMS = load('src/services/impliedMoveService.ts');
const AC = load('src/services/analysisCache.ts');
const BG = load('src/lib/intrinioBackground.ts');
const IM = load('src/lib/impliedMove.ts');
const expiry = '2026-10-23', session = '2026-10-20';
const move = () => ({ def: IM.IMPLIED_MOVE_DEF, pct: 4, expiry, straddle: 4, strike: 100, spot: 100,
    callPrice: 2, putPrice: 2, basis: 'eod', asOf: null, chainDate: session, session });
const analysis = () => ({ ticker: 'AAPL', timestamp: now - 1000, alphaSnapshot: { score: 55, grade: 'B' }, rsi: 45, netPremium: 10, ivSkew: 0.1, ...IM.impliedMoveFields(move()) });
const tickerRow = (score = 66) => ({ tsServer: now - 1000, alpha: { score, grade: 'B', calculatedAt: new Date(now - 1000).toISOString() }, display: { rsi14: 45 }, flow: { netPremium: 10, ivSkew: 0.1 } });
const structure = (im = move()) => ({ timestamp: now - 1000, data: { expiration: expiry, chainDate: session, options_status: 'OK', underlyingPrice: 100, impliedMove: im } });
const probe = (exp = expiry, day = session) => ({ weeklyExpiry: exp, chainDate: day, greeksSource: 'eod',
    exactResults: ['call', 'put'].map(contract_type => ({ details: { contract_type, expiration_date: exp, strike_price: 100 }, last_quote: { midpoint: 2 } })) });
function seed() {
    now = Date.parse('2026-10-20T17:00:00-04:00');
    mem.clear(); keysRead = []; writes = snapshotCalls = warmCalls = network = 0; bgAfter = []; tripped = false; holdRead = null;
    for (const t of tickers) mem.set('cache:analysis:' + t, analysis());
}
async function get(app = false) {
    const ctx = BG.newBgCtx('격리 시험'); ctx.tripped = tripped;
    const res = await BG.runWithBg(ctx, () => route.GET(new Request(`https://local.test/api/intel/fast?sector=m7${app ? '&app=1' : ''}`)));
    const body = await res.json(); assert.equal(body.success, true);
    return body;
}
const row = (body, ticker) => body.data.find(q => q.ticker === ticker);
let passes = 0, fails = 0;
async function test(name, run) {
    seed();
    try { await run(); assert.equal(network, 0); passes++; console.log('통과: ' + name); }
    catch (e) { fails++; console.error('실패: ' + name + ': ' + e.message); }
}
(async () => {
    await test('v2 키만 읽을 때 결측이던 v6 full·nochain 점수 복구 (웹·앱)', async () => {
        for (const app of [false, true]) {
            mem.delete('cache:analysis:AMZN'); mem.delete('cache:analysis:GOOGL');
            mem.set('flow:ticker:v6:AMZN', tickerRow(66)); mem.set('flow:ticker:nochain:v6:GOOGL', tickerRow(77));
            const body = await get(app);
            assert.equal(row(body, 'AMZN').alphaScore, 66); assert.equal(row(body, 'GOOGL').alphaScore, 77);
            assert.ok(!row(body, 'AMZN').missingFields?.includes('alphaScore'));
        }
    });
    await test('17시 ET 15분 초과 분석·누락 분석도 저장 구조로 예상 변동 복구 (웹·앱)', async () => {
        mem.set('cache:analysis:AMZN', { ...analysis(), timestamp: now - 16 * 60000 }); mem.delete('cache:analysis:GOOGL');
        for (const t of ['AMZN', 'GOOGL']) mem.set('structure:v2:' + t, structure());
        const raw = structuredClone(mem.get('cache:analysis:AMZN'));
        assert.equal((await AC.getAnalysisCacheForTickers(tickers)).AMZN, undefined, '분석 만료는 유지');
        for (const app of [false, true]) {
            const body = await get(app);
            for (const t of ['AMZN', 'GOOGL']) assert.equal(row(body, t).impliedMovePct, 4);
        }
        assert.deepEqual(mem.get('cache:analysis:AMZN'), raw);
    });
    await test('명시적 null 구조는 Intel에서만 같은 만기·세션 체인으로 재계산', async () => {
        mem.delete('cache:analysis:AMZN'); mem.set('structure:v2:AMZN', structure(null)); mem.set('polygon:snapshot:probe:AMZN', probe());
        assert.equal(await IMS.impliedMoveOfStructure('AMZN', structure(null).data), null, '기존 단건 동작 보존');
        assert.equal((await IMS.readImpliedMoveRows([{ ticker: 'AMZN' }]))[0].impliedMovePct, null, '기존 묶음 동작 보존');
        assert.equal(row(await get(), 'AMZN').impliedMovePct, 4);
    });
    if (baseline) return;
    await test('현재 키에 점수 없으면 nochain, 그 뒤에만 v2; 실측 0 유지', async () => {
        mem.set('flow:ticker:v6:AMZN', { ...tickerRow(), alpha: null }); mem.set('flow:ticker:nochain:v6:AMZN', tickerRow(0));
        mem.set('flow:ticker:v2:AMZN', tickerRow(99));
        assert.equal((await helper.readIntelTickerCache('AMZN')).alpha.score, 0);
        mem.delete('flow:ticker:nochain:v6:AMZN'); assert.equal((await helper.readIntelTickerCache('AMZN')).alpha.score, 99);
        mem.delete('flow:ticker:v6:AMZN'); assert.equal((await helper.readIntelTickerCache('AMZN')).alpha.score, 99);
        assert.equal(writes, 0);
    });
    await test('다른 거래일 점수·정의 없는 폭·다른 세션·다른 만기 체인 제외', async () => {
        const old = tickerRow(); old.alpha.calculatedAt = '2026-10-19T21:00:00Z';
        mem.set('flow:ticker:v2:AMZN', old); assert.equal((await helper.readIntelTickerCache('AMZN')).alpha, null);
        mem.delete('cache:analysis:AMZN'); mem.set('structure:v2:AMZN', structure({ ...move(), def: 'wall-range' }));
        mem.set('polygon:snapshot:probe:AMZN', probe());
        assert.equal((await helper.readIntelImpliedMoves(['AMZN'], {})).AMZN, undefined);
        mem.set('structure:v2:AMZN', structure(null));
        mem.set('polygon:snapshot:probe:AMZN', probe(expiry, '2026-10-19'));
        assert.equal((await helper.readIntelImpliedMoves(['AMZN'], {})).AMZN, undefined);
        mem.set('polygon:snapshot:probe:AMZN', probe('2026-10-30'));
        assert.equal((await helper.readIntelImpliedMoves(['AMZN'], {})).AMZN, undefined);
        mem.set('structure:v2:AMZN', structure({ ...move(), chainDate: '2026-10-19', session: '2026-10-19' }));
        assert.equal((await helper.readIntelImpliedMoves(['AMZN'], {})).AMZN, undefined);
    });
    await test('정상 종목 값·메타데이터 무변경, 보충 읽기·공급사 호출·쓰기 0', async () => {
        const entries = Object.fromEntries(tickers.map(t => [t, analysis()]));
        const copy = structuredClone(entries);
        const filled = await helper.readIntelImpliedMoves(tickers, entries);
        for (const t of tickers) assert.deepEqual(filled[t], IM.readImpliedMoveFields(entries[t]));
        assert.deepEqual(entries, copy); assert.deepEqual(keysRead, []); assert.equal(writes, 0);
        const body = await get();
        for (const t of tickers) { assert.equal(row(body, t).alphaScore, 55); assert.equal(row(body, t).impliedMovePct, 4); }
        assert.equal(warmCalls, 0); assert.equal(snapshotCalls, 1);
    });
    await test('skip_alpha 데우기가 현재 캐시 점수를 null로 덮지 않음', async () => {
        mem.delete('cache:analysis:AMZN'); mem.set('flow:ticker:v6:AMZN', { ...tickerRow(66), flow: {} });
        const body = await get(); assert.equal(warmCalls, 1); assert.equal(row(body, 'AMZN').alphaScore, 66);
    });
    await test('전 종목 결측에도 기존 데우기 상한 유지·429 관문 닫히면 0', async () => {
        for (const t of tickers) { mem.delete('cache:analysis:' + t); mem.set('structure:v2:' + t, structure(null)); mem.set('polygon:snapshot:probe:' + t, probe()); }
        await get(); assert.equal(warmCalls, tickers.length); assert.ok(warmCalls <= 12); assert.equal(snapshotCalls, 1);
        warmCalls = 0; tripped = true; await get(); assert.equal(warmCalls, 0);
        writes = 0; warmCalls = snapshotCalls = 0;
        const fills = await helper.readIntelImpliedMoves(tickers, {});
        assert.equal(Object.keys(fills).length, 7); assert.equal(writes, 0); assert.equal(warmCalls + snapshotCalls, 0);
    });
    await test('응답 캐시 뒤 갱신의 기존 잠금을 얻지 못하면 계산·공급사 호출 0', async () => {
        const C = load('src/lib/cache/intelFastCache.ts');
        mem.set(C.intelFastKey('m7'), { at: now - 30000, phase: C.etPhase(now).key, body: { success: true, data: [{ ticker: 'AMZN', alphaScore: 66 }], meta: {} } });
        await get(); assert.equal(snapshotCalls, 0);
        await bgAfter[0](); assert.equal(snapshotCalls + warmCalls, 0);
    });
    await test('700ms 종료 뒤 맵 변경·체인 추가 조회 없음', async () => {
        let release; holdRead = new Promise(resolve => { release = resolve; });
        mem.set('structure:v2:AMZN', structure(null)); mem.set('polygon:snapshot:probe:AMZN', probe());
        const began = performance.now(); const result = await helper.readIntelImpliedMoves(['AMZN'], {});
        assert.ok(performance.now() - began < 1100); assert.deepEqual(result, {});
        now += 701; release(); await new Promise(resolve => realTimer(resolve, 20));
        assert.deepEqual(result, {}); assert.ok(!keysRead.includes('polygon:snapshot:probe:AMZN')); assert.equal(writes, 0);
    });
})().finally(() => {
    clearTimeout(watchdog); console.log(`총 ${passes}건 통과 · ${fails}건 실패${baseline ? ' (수정 전 재현)' : ''}`);
    if (fails) process.exitCode = 1;
}).catch(e => { console.error(e); process.exitCode = 1; });
