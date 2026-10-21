// 실제 라우트·분석 만료 판정·구조 계산을 메모리 I/O로 격리한다. 외부 호출·운영 쓰기 금지.
// 실행: node tests/intelFastFallback.test.js [--baseline: 1차 결함 / --gate2: 2차 관문 4조건 재현]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const previousGate = process.argv.includes('--gate2');
const baselineRef = previousGate ? '8732ea270' : '201c6e85ba88bd5a78ff7bf2dcacc739dc8d9a57';
const realTimer = setTimeout;
const watchdog = realTimer(() => { console.error('시험 시간 초과'); process.exit(1); }, 15000);
global.setTimeout = (...args) => { const timer = realTimer(...args); timer.unref(); return timer; };
let network = 0;
global.fetch = async () => { network++; throw new Error('외부 호출 금지'); };
let now = Date.parse('2026-10-20T17:00:00-04:00'); // 조사 시각: KST 10/21 06시
Date.now = () => now;
const tickers = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'];
const mem = new Map();
let keysRead = [], writes = 0, snapshotCalls = 0, warmCalls = 0, tripped = false, holdRead = null, eod = null;
let bgAfter = [], snapshotOverride = {}, marketSession = 'post';
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
    '@/services/eodSnapshot': { readEodCloses: async () => eod },
    '@/services/structureService': {
        structureV2Key: t => `structure:v2:${t}`, structureLastGoodKey: t => `structure:lastgood:${t}`,
        levelsForExit: async () => new Map(), applyLevelsToRealtime: () => {},
    },
    '@/services/optionMetricsService': { readOptionMetrics: async () => new Map() },
    '@/lib/optionMetrics': { applyOptionMetrics: () => {} },
    '@/services/massiveClient': { CACHE_POLICY: { LIVE: 'live' }, fetchMassive: async () => {
        snapshotCalls++;
        if (tripped) BG.bgStore.getStore().tripped = true; // 앞선 공급사 실패가 같은 갱신 흐름의 관문을 닫은 상황
        return { tickers: tickers.map(ticker => ({ ticker, day: { c: 100, v: 10 }, prevDay: { c: 99 }, todaysChangePerc: 1,
            _intrinio: { regularDate: '2026-10-20' }, ...snapshotOverride[ticker] })) };
    } },
    '@/services/centralDataHub': { CentralDataHub: { getMarketStatus: async () => ({ session: marketSession }) } },
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
    '@/services/extendedSessionClose': {
        peekExtendedSessionClosesAndWarm: async ts => ({ values: ts.map(() => null) }),
        isTradeInExtSession: () => false, pickRegularPreClose: () => null,
    },
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
    const original = (baseline || previousGate) && ['src/app/api/intel/fast/route.ts', 'src/services/impliedMoveService.ts', 'src/services/intelFastFallback.ts'].includes(rel);
    const source = original ? execFileSync('git', ['show', baselineRef + ':' + rel], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(file, 'utf8');
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
const closingProbe = () => ({ ...probe(), exactResults: [100, 104].flatMap(strike_price => ['call', 'put'].map(contract_type => ({
    details: { contract_type, expiration_date: expiry, strike_price }, last_quote: { midpoint: strike_price === 100 ? 3 : 2 },
}))) });
function seed() {
    now = Date.parse('2026-10-20T17:00:00-04:00');
    mem.clear(); keysRead = []; writes = snapshotCalls = warmCalls = network = 0; bgAfter = []; tripped = false; holdRead = null; eod = null;
    snapshotOverride = {}; marketSession = 'post';
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
    if (previousGate && !name.startsWith('2차 관문 재현:')) return;
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
    await test('관문 재현: 분석 누락·명시적 null·저장 가격 100에서도 같은 세션 종가 104의 ATM으로 3.8% (웹·앱)', async () => {
        mem.delete('cache:analysis:AMZN');
        const stored = structure(null), before = structuredClone(stored);
        mem.set('structure:v2:AMZN', stored); mem.set('polygon:snapshot:probe:AMZN', closingProbe());
        eod = { date: session, rows: new Map([['AMZN', { c: 104 }]]) };
        const retry = await IMS.impliedMoveOfStructure('AMZN', stored.data, null, { retryNull: true });
        assert.equal(retry?.pct, 3.8);
        assert.deepEqual([retry.spot, retry.strike, retry.straddle, retry.expiry, retry.session], [104, 104, 4, expiry, session]);
        const normal = await IMS.impliedMoveOfStructure('AMZN', { ...stored.data, impliedMove: { ...move(), pct: 6, straddle: 6, callPrice: 3, putPrice: 3 } });
        assert.deepEqual(retry, normal, '정상 경로와 값·ATM·메타데이터가 같다');
        assert.equal(snapshotCalls + warmCalls + writes, 0, '보충 자체는 공급사 호출·쓰기 0');
        for (const app of [false, true]) {
            const body = await get(app);
            assert.equal(row(body, 'AMZN').impliedMovePct, 3.8);
            for (const t of tickers.filter(t => t !== 'AMZN')) {
                assert.equal(row(body, t).impliedMovePct, 4); assert.equal(row(body, t).alphaScore, 55);
            }
        }
        assert.deepEqual(stored, before, '저장 구조 불변');
        assert.equal(snapshotCalls, 2); assert.equal(warmCalls, 2);
        assert.equal(writes, 2, '웹·앱 각각 기존 응답 캐시 저장 1회만');
    });
    if (baseline) return;
    for (const regular of [true, false]) for (const app of [false, true]) {
        await test(`2차 관문 재현: ${regular ? '정규장' : '장후'} × ${app ? '앱' : '웹'} · 전일 벌크 EOD에서도 3.8%`, async () => {
            now = Date.parse(`2026-10-20T${regular ? '13' : '17'}:00:00-04:00`);
            marketSession = regular ? 'regular' : 'post';
            mem.delete('cache:analysis:AMZN');
            const stored = structure(null), before = structuredClone(stored);
            mem.set('structure:v2:AMZN', stored); mem.set('polygon:snapshot:probe:AMZN', closingProbe());
            // 정규장에는 lastTrade, 장후에는 같은 세션 day.c. 시간외 체결 110은 분모가 아니다.
            snapshotOverride.AMZN = { day: { c: regular ? 100 : 104, v: 10 },
                lastTrade: { p: regular ? 104 : 110, t: now * 1e6 } };
            eod = { date: '2026-10-19', rows: new Map([['AMZN', { c: 100 }]]) };
            const body = await get(app);
            assert.equal(row(body, 'AMZN').impliedMovePct, 3.8);
            assert.equal(row(body, 'AMZN').impliedMoveSession, session);
            assert.deepEqual(stored, before);
            assert.equal(snapshotCalls, 1); assert.equal(warmCalls, 1); assert.equal(writes, 1, '기존 호출·응답 저장만');
        });
    }
    await test('원천 시각·정규장 날짜 미확정/전일/미래 가격은 저장 가격으로 메우지 않는다 (웹·앱)', async () => {
        mem.delete('cache:analysis:AMZN'); mem.set('structure:v2:AMZN', structure(null));
        mem.set('polygon:snapshot:probe:AMZN', closingProbe());
        eod = { date: '2026-10-19', rows: new Map([['AMZN', { c: 104 }]]) };
        for (const regular of [true, false]) {
            now = Date.parse(`2026-10-20T${regular ? '13' : '17'}:00:00-04:00`);
            marketSession = regular ? 'regular' : 'post';
            for (const app of [false, true]) for (const date of [undefined, '2026-10-19', '2026-10-21']) {
                snapshotOverride.AMZN = { day: { c: 104 }, _intrinio: { regularDate: date }, prevDay: { c: 104 },
                    updated: now * 1e6, lastTrade: { p: 104, t: (now - 86400000) * 1e6 }, min: { c: 104, t: now + 60000 } };
                assert.equal(row(await get(app), 'AMZN').impliedMovePct, null);
            }
        }
    });
    await test('정규장 가격 우선순위: 같은 세션 체결 → 분봉 → 일봉, 전일 체결은 제외', async () => {
        now = Date.parse('2026-10-20T13:00:00-04:00');
        mem.set('structure:v2:AMZN', structure(null)); mem.set('polygon:snapshot:probe:AMZN', closingProbe());
        const day = { c: 104 }, _intrinio = { regularDate: session };
        for (const sn of [
            { lastTrade: { p: 104, t: now * 1e6 }, min: { c: 100, t: now }, day: { c: 100 }, _intrinio },
            { lastTrade: { p: 100, t: (now - 86400000) * 1e6 }, min: { c: 104, t: now }, day: { c: 100 }, _intrinio },
            { day, _intrinio },
        ]) {
            const f = await helper.readIntelImpliedMoves(['AMZN'], {}, { AMZN: sn });
            assert.equal(f.AMZN?.impliedMovePct, 3.8);
        }
        assert.equal(snapshotCalls + warmCalls + writes, 0);
    });
    await test('스냅샷 누락은 같은 세션 EOD로만 보충, 체인 세션도 일치해야 한다', async () => {
        mem.set('structure:v2:AMZN', structure(null)); mem.set('polygon:snapshot:probe:AMZN', closingProbe());
        eod = { date: session, rows: new Map([['AMZN', { c: 104 }]]) };
        assert.equal((await helper.readIntelImpliedMoves(['AMZN'], {})).AMZN?.impliedMovePct, 3.8);
        mem.set('polygon:snapshot:probe:AMZN', { ...closingProbe(), chainDate: '2026-10-19' });
        assert.equal((await helper.readIntelImpliedMoves(['AMZN'], {})).AMZN, undefined);
        eod = null;
        assert.equal((await helper.readIntelImpliedMoves(['AMZN'], {})).AMZN, undefined);
        assert.equal(snapshotCalls + warmCalls + writes, 0);
    });
    await test('종가가 없으면 주입 현재가 우선·같은 세션 기준 가격 미확정이면 null', async () => {
        mem.set('polygon:snapshot:probe:AMZN', closingProbe());
        now = Date.parse('2026-10-20T13:00:00-04:00');
        eod = { date: session, rows: new Map([['AMZN', { c: 110 }]]) };
        const current = await IMS.impliedMoveOfStructure('AMZN', structure(null).data, 104, { retryNull: true });
        assert.deepEqual([current?.pct, current?.strike, current?.spot], [3.8, 104, 104]);
        now = Date.parse('2026-10-20T17:00:00-04:00');
        for (const close of [null, 0, -1, NaN, Infinity]) {
            eod = { date: session, rows: new Map([['AMZN', { c: close }]]) };
            const fallback = await IMS.impliedMoveOfStructure('AMZN', structure(null).data, null, { retryNull: true });
            assert.equal(fallback, null, '유효하지 않은 종가를 저장 가격 100으로 메우지 않는다');
        }
        eod = { date: '2026-10-19', rows: new Map([['AMZN', { c: 104 }]]) };
        assert.equal(await IMS.impliedMoveOfStructure('AMZN', structure(null).data, null, { retryNull: true }), null, '다른 기준일 종가·저장 가격 제외');
        assert.equal(snapshotCalls + warmCalls + writes, 0);
    });
    await test('저장 가격도 없으면 같은 세션 종가만 사용·기준 가격 미확정은 null', async () => {
        mem.set('polygon:snapshot:probe:AMZN', closingProbe());
        for (const underlyingPrice of [undefined, null, 0, -1, NaN, Infinity]) {
            const st = { ...structure(null).data, underlyingPrice };
            eod = { date: session, rows: new Map([['AMZN', { c: 104 }]]) };
            assert.equal((await IMS.impliedMoveOfStructure('AMZN', st, null, { retryNull: true }))?.pct, 3.8);
            for (const unavailable of [null, { date: '2026-10-19', rows: new Map([['AMZN', { c: 104 }]]) }]) {
                eod = unavailable;
                assert.equal(await IMS.impliedMoveOfStructure('AMZN', st, null, { retryNull: true }), null);
            }
        }
        assert.equal(snapshotCalls + warmCalls + writes, 0);
    });
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
        const snapshots = Object.fromEntries(tickers.map(t => [t, { day: { c: 100 }, _intrinio: { regularDate: session } }]));
        const fills = await helper.readIntelImpliedMoves(tickers, {}, snapshots);
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
    clearTimeout(watchdog); console.log(`총 ${passes}건 통과 · ${fails}건 실패${baseline || previousGate ? ' (수정 전 재현)' : ''}`);
    if (fails) process.exitCode = 1;
}).catch(e => { console.error(e); process.exitCode = 1; });
