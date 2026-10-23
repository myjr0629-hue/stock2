// 감사 H2·M8 (2026-10-24) — 같은 종목의 알파 점수·등급·근거 입력이 화면마다 같은가. 메모리 저장소만, 외부 I/O 없음.
//   H2: 섹터 인텔 최신 스냅샷(GET)이 내 종목·종목·cmd 와 같은 출구(readOptionAlpha + XS)의 점수·등급을 쓴다.
//   M8: 워치리스트 배치의 매크로 입력(NDX·VIX·금리)이 종목 화면(live/ticker)과 같은 값으로 엔진에 들어간다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
const forbidden = () => { throw Error('External I/O forbidden'); };

const store = new Map(), modules = new Map();
let analysis = {}, analysisThrows = false, exitThrows = false;
const mocks = {
    '@/services/redisClient': {
        getFromCache: async k => store.get(k) ?? null,
        mgetFromCache: async keys => keys.map(k => store.get(k) ?? null),
        setInCache: forbidden,
    },
    // 실제 analysisCache 와 같은 규칙: 읽을 때 XS 로 점수·등급을 덮는다(applyXs).
    '@/services/analysisCache': { getAnalysisCacheForTickers: async tickers => {
        if (analysisThrows) throw Error('redis down');
        const xs = load('src/services/xsScores.ts');
        await xs.ensureXsScores();
        return Object.fromEntries(tickers.filter(t => analysis[t]).map(t => [t,
            { ...analysis[t], alphaSnapshot: xs.xsSnapshotOverride(t, analysis[t].alphaSnapshot) }]));
    } },
};
function evaluate(file, source, extra = {}) {
    const exports = {};
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(code, { exports, module: { exports }, process: { env: {} }, console: { ...console, warn() {} },
        fetch: forbidden, setTimeout, Date, ...extra,
        require(id) {
            if (mocks[id]) return mocks[id];
            if (id.startsWith('@/')) return load(`src/${id.slice(2)}.ts`);
            assert.ok(id.startsWith('.'), `Unmocked import ${id}`);
            return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), id)) + '.ts');
        },
    }, { filename: file });
    return exports;
}
function load(file) {
    if (!modules.has(file)) modules.set(file, evaluate(file, read(file)));
    return modules.get(file);
}
function functions(file, names) {
    const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    return names.map(name => {
        const fn = sf.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
        assert.ok(fn, name); return fn.getText(sf).replace(/^export /, '');
    }).join('\n');
}

// XS 게시본(22:10Z) — 150개 이상이어야 xsScores 가 받아들인다.
const scores = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`T${i}`, i % 101]));
Object.assign(scores, { ARM: 36.6, MSFT: 24.8, NVDA: 72.5, ZERO: 0 });
store.set('cache:xs:scores', { date: '2026-10-22', scores });

// 마감 크론(21:00Z)이 저장한 스냅샷 — 전날 XS 기준 점수(감사 실측 값).
const stored = () => ({
    meta: { snapshot_timestamp: '2026-10-22T21:00:32Z' },
    tickers: [
        { ticker: 'ARM', alpha_score: 7.5, grade: 'F', verdict: 'HOLD', analysis_kr: 'ARM 저장 문구', gex: -1, pcr: 0.9 },
        { ticker: 'MSFT', alpha_score: 48.2, grade: 'C', verdict: 'HOLD', analysis_kr: 'MSFT 저장 문구', gex: 2, pcr: 1.1 },
        { ticker: 'NOXS', alpha_score: 55, grade: 'B', verdict: 'HOLD', analysis_kr: 'XS 밖', gex: 3, pcr: 1 },
        { ticker: 'GAP', alpha_score: null, grade: null, verdict: 'HOLD', analysis_kr: '못 잼', gex: 4, pcr: 1 },
        { ticker: 'ZERO', alpha_score: 12, grade: 'F', verdict: 'HOLD', analysis_kr: '0점', gex: 5, pcr: 1 },
    ],
    sector_summary: { avg_alpha: 30.7, avg_pcr: 1, dominant_regime: 'LONG' },
});
// ARM 은 분석 캐시(하베스트)가 있다 — 근거 문구는 V8, 점수·등급은 XS.
analysis.ARM = { alphaSnapshot: { score: 41, grade: 'C', action: 'HOLD', capturedAt: '2026-10-22T23:00:00Z',
    pillars: { momentum: 10, structure: 8, flow: 9, regime: 7, catalyst: 5 } }, darkPoolPct: 40, shortVolPct: 41 };

const service = load('src/services/optionAlphaService.ts');
const xs = load('src/services/xsScores.ts');
const route = 'src/app/api/intel/snapshot/route.ts';
const overlay = evaluate(route, functions(route, ['nz', 'overlayCurrentAlpha']) + '\nexports.overlayCurrentAlpha = overlayCurrentAlpha;', {
    readOptionAlpha: (...a) => { if (exitThrows) throw Error('exit down'); return service.readOptionAlpha(...a); },
    ensureXsScores: () => xs.ensureXsScores(),
    xsSnapshotOverride: (t, s) => xs.xsSnapshotOverride(t, s),
}).overlayCurrentAlpha;

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('H2: 최신 스냅샷 점수·등급 = 내 종목·종목·cmd 공통 출구(readOptionAlpha) 값', async () => {
    const out = await overlay(stored());
    const shared = await service.readOptionAlpha(['ARM'], new Map());   // 워치리스트·포트폴리오·live/ticker·command/unified 가 쓰는 출구
    const arm = out.tickers.find(t => t.ticker === 'ARM');
    assert.equal(arm.alpha_score, shared.get('ARM').score);
    assert.equal(arm.grade, shared.get('ARM').grade);
    assert.deepEqual([arm.alpha_score, arm.grade], [36.6, 'D']);
});

test('H2: 분석 캐시가 없는 XS 종목은 같은 XS 게시본으로(0점도 측정값), XS 밖은 저장값, 못 잰 null 은 그대로', async () => {
    const out = await overlay(stored());
    const by = Object.fromEntries(out.tickers.map(t => [t.ticker, t]));
    assert.deepEqual([by.MSFT.alpha_score, by.MSFT.grade], [24.8, 'F']);
    assert.deepEqual([by.ZERO.alpha_score, by.ZERO.grade], [0, 'F']);
    assert.deepEqual([by.NOXS.alpha_score, by.NOXS.grade], [55, 'B']);
    assert.deepEqual([by.GAP.alpha_score, by.GAP.grade], [null, null]);
});

test('H2: 점수·등급·평균 외 칸(판정·문구·옵션 구조)은 저장본 그대로, 평균은 측정된 것만', async () => {
    const before = stored();
    const out = await overlay(before);
    const strip = r => { const { alpha_score, grade, ...rest } = r; return rest; };
    assert.deepEqual(out.tickers.map(strip), before.tickers.map(strip));
    assert.deepEqual(out.meta, before.meta);
    const measured = [36.6, 24.8, 55, 0];
    assert.equal(out.sector_summary.avg_alpha, Math.round(measured.reduce((a, b) => a + b) / measured.length * 10) / 10);
    assert.equal(out.sector_summary.avg_pcr, before.sector_summary.avg_pcr);
    assert.equal(before.tickers[0].alpha_score, 7.5, '입력 객체를 바꾸지 않는다');
});

test('H2: 분석 캐시 읽기 실패 → 같은 XS 게시본 덮기만 · 출구 자체 실패 → 저장본 그대로(화면을 비우지 않는다)', async () => {
    analysisThrows = true;
    try {
        const out = await overlay(stored());
        const arm = out.tickers.find(t => t.ticker === 'ARM');
        assert.deepEqual([arm.alpha_score, arm.grade], [36.6, 'D']);
    } finally { analysisThrows = false; }
    exitThrows = true;
    try {
        const before = stored();
        assert.deepEqual(plain(await overlay(before)), plain(before));
    } finally { exitThrows = false; }
    assert.deepEqual(plain(await overlay({ tickers: [] })), { tickers: [] });
    assert.equal(await overlay(null), null);
});

test('H2: 덮기는 최신 조회 두 경로(REDIS·DB)에만, date 지정(과거 기록)은 저장본', () => {
    const src = read(route);
    assert.match(src, /overlayAiHeadline\(date \? s1\.data : await overlayCurrentAlpha\(s1\.data\), sector\)/);
    assert.match(src, /overlayAiHeadline\(date \? s2\.data : await overlayCurrentAlpha\(s2\.data\), sector\)/);
    assert.equal((src.match(/overlayCurrentAlpha\(/g) || []).length, 3);
});

// ── M8: 워치리스트 매크로 입력 ──
const wlFile = 'src/services/watchlistBatchService.ts';
const tickerFile = 'src/app/api/live/ticker/route.ts';
const macroSample = (stance) => ({ nqChangePercent: -0.06, vix: 19.03, factors: { vix: { chgPct: 14.09 } },
    tltChangePct: 0.4, gldChangePct: -0.2, dxy: 98.7, realYield: { stance } });
function buildWatchlistMacro(macro) {
    const src = read(wlFile);
    const start = src.indexOf('const stance = macro.realYield');
    const end = src.indexOf('};', src.indexOf('macroData = {', start)) + 2;
    assert.ok(start > 0 && end > start, '매크로 조립부');
    const ctx = { macro, macroData: null };
    vm.runInNewContext(ts.transpile(src.slice(start, end).replace('const stance', 'var stance')), ctx);
    return ctx.macroData;
}
// calculateAlphaScore 호출 안에서 macroData 를 읽는 속성들을 그대로 떼어 평가한다.
function macroInputs(file, macroData) {
    const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    const calls = [];
    (function walk(n) {
        if (ts.isCallExpression(n) && n.expression.getText(sf) === 'calculateAlphaScore' && ts.isObjectLiteralExpression(n.arguments[0])) {
            const props = n.arguments[0].properties.filter(p => ts.isPropertyAssignment(p) && p.initializer.getText(sf).includes('macroData'));
            if (props.length) calls.push(Object.fromEntries(props.map(p => [p.name.getText(sf),
                vm.runInNewContext(ts.transpile(`(${p.initializer.getText(sf)})`), { macroData })])));
        }
        ts.forEachChild(n, walk);
    })(sf);
    return calls;
}

test('M8: 워치리스트 엔진 입력(NDX·VIX·VIX 등락·TLT·GLD·DXY·금리) = 종목 화면 입력, 호출 4곳 모두', () => {
    for (const stance of ['LOOSE', 'TIGHT', 'NEUTRAL', null]) {
        const raw = macroSample(stance);
        const [ref] = macroInputs(tickerFile, raw);
        assert.ok(ref && ref.ndxChangePct === -0.06 && ref.vixValue === 19.03);
        const wl = macroInputs(wlFile, buildWatchlistMacro(raw));
        assert.equal(wl.length, 4);
        for (const call of wl) for (const [k, v] of Object.entries(call)) {
            if (k in ref) assert.equal(v, ref[k], `${k} (${stance})`);
        }
        const full = wl.filter(c => 'realYieldStance' in c);
        assert.equal(full.length, 3);
        for (const c of full) assert.equal(c.realYieldStance, stance === 'LOOSE' ? 'EASY' : stance);
    }
});

test('M8: 실제 엔진 — 완화 금리는 «금리 EASY» +1, NDX·VIX 는 «데이터 없음»이 아니다', () => {
    const engine = load('src/services/alphaEngine.ts');
    const [first] = macroInputs(wlFile, buildWatchlistMacro(macroSample('LOOSE')));
    const r = engine.calculateAlphaScore({ ticker: 'T999', session: 'REG', price: 100, prevClose: 99, changePct: 1, ...first });
    const factors = Object.values(r.pillars).flatMap(p => p.factors || []);
    const yieldF = factors.find(f => f.name === 'realYield');
    assert.deepEqual([yieldF.value, yieldF.detail], [1, '금리 EASY']);
    const ndx = factors.find(f => f.name === 'ndxTrend');
    assert.ok(ndx && !/데이터 없음/.test(ndx.detail), ndx?.detail);
    assert.ok(!factors.some(f => /^VIX/.test(f.detail || '') && /추정/.test(f.detail)), 'VIX 추정');
});

(async () => {
    let failed = 0;
    for (const [name, fn] of tests) {
        try { await fn(); console.log(`ok - ${name}`); }
        catch (e) { failed++; console.error(`not ok - ${name}\n  ${e.stack || e}`); }
    }
    console.log(`${tests.length - failed}/${tests.length} 통과`);
    process.exitCode = failed ? 1 : 0;
})();
