// H2 / M8: production read boundaries + real XS override and V8 diagnostics, memory storage only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
const now = Date.parse('2026-10-23T01:30:00Z');
class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
const store = new Map(), modules = new Map();
const forbidden = () => { throw Error('External I/O forbidden'); };
let analysis = {}, reads = 0;
const mocks = {
    '@/services/redisClient': {
        getFromCache: async k => store.get(k) ?? null,
        mgetFromCache: async keys => { reads++; return keys.map(k => store.get(k) ?? null); },
        setInCache: forbidden,
    },
    '@/services/analysisCache': { getAnalysisCacheForTickers: async tickers => {
        await load('src/services/xsScores.ts').ensureXsScores();
        return Object.fromEntries(tickers.filter(t => analysis[t]).map(t => [t, analysis[t]]));
    } },
};
function evaluate(file, source, deps = {}) {
    const exports = {};
    const code = ts.transpileModule(source, { compilerOptions: {
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
    } }).outputText;
    vm.runInNewContext(code, { exports, Date: Clock, process: { env: {} }, console,
        fetch: forbidden, setTimeout: forbidden, ...deps,
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
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    return names.map(name => {
        const fn = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
        assert.ok(fn, name); return fn.getText(source).replace(/^export /, '');
    }).join('\n');
}
const scores = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`T${i}`, i % 101]));
Object.assign(scores, { NVDA: 72.5, MSFT: 24.8, TSLA: 90.4, ARM: 36.6, ZERO: 0 });
store.set('cache:xs:scores', { date: '2026-10-22', scores });
store.set('macro:snapshot:v5', { data: { factors: { nasdaq100: { symbolUsed: 'NQ=F', chgPct: -0.06 } }, vix: 19.03 } });
store.set('yahoo:vix', { price: 19.03, changePct: 14.09 });
const quote = (close = 212.21, prev = 221.97) => ({ tsServer: now - 60000,
    prices: { regularDate: '2026-10-22', regularCloseToday: close, prevRegularClose: prev },
    // Deliberately conflicting extended / fraction inputs from the audit.
    price: 211.8, changePct: -0.002, display: { price: 211.8, changePctPct: -0.2 },
    vwap: 213.659, vwapDate: '2026-10-22',
});
store.set('flow:ticker:v6:NVDA', quote());
store.set('flow:ticker:v6:QQQ', quote(704.47, 725.21));
analysis.NVDA = { alphaSnapshot: { score: 86, grade: 'S', action: 'HOLD', capturedAt: '2026-10-22T23:00:00Z',
    pillars: { momentum: { factors: [{ name: 'priceChange', detail: '-0.2%' }] } } },
    rsi: 39.1, return3d: -3, relVol: 1.2, darkPoolPct: 39.5, shortVolPct: 41.5, vwap: null };
const metrics = new Map([['NVDA', { gex: 25650000, pcr: 0.84, squeezeScore: 25 }]]);
const service = load('src/services/optionAlphaService.ts');
const fallback = new Map(['NVDA', 'MSFT', 'TSLA', 'ARM', 'ZERO'].map(t => [t, {
    alphaSnapshot: { score: 7.5, grade: 'F', capturedAt: '2026-10-22T21:00:00Z' },
}]));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('H2: published XS score / grade / score date agree across stored snapshot and current analysis, including zero', async () => {
    const rows = await service.readOptionAlpha([...fallback.keys()], metrics, fallback);
    const apply = load('src/lib/publishedAlpha.ts').applyPublishedAlpha;
    for (const t of fallback.keys()) {
        const a = rows.get(t), q = apply({ missingFields: ['alphaScore', 'pcr'] }, a);
        assert.equal(q.alphaScore, scores[t]); assert.equal(q.grade, a.grade);
        assert.equal(q.alphaCapturedAt, a.capturedAt); assert.equal(q.alphaScoreAsOf, '2026-10-22');
        assert.deepEqual(plain(q.missingFields), ['pcr']);
    }
    assert.equal(rows.get('ZERO').grade, 'F');
    assert.equal(rows.get('MSFT').grade, 'F'); assert.equal(rows.get('NVDA').grade, 'A');
    assert.equal(fallback.get('ARM').alphaSnapshot.score, 7.5, 'storage remains unchanged');
    const universe = Array.from({ length: 70 }, (_, i) => `T${i}`);
    const sectorRows = await service.readOptionAlpha(universe, new Map(), new Map(universe.map(t => [t, {
        alphaSnapshot: { score: 1, grade: 'F', capturedAt: '2026-10-22T21:00:00Z' },
    }])));
    universe.forEach(t => { assert.equal(sectorRows.get(t).score, scores[t]); assert.equal(sectorRows.get(t).scoreAsOf, '2026-10-22'); });
});
test('H2: latest snapshot overlays Redis and DB reads; explicit historical date never reads current alpha', async () => {
    const data = { meta: { snapshot_timestamp: '2026-10-22T21:00:00Z' },
        tickers: [...fallback.keys()].map(ticker => ({ ticker, alpha_score: 7.5, grade: 'F', close_price: 100, change_pct: -2 })),
        sector_summary: { avg_alpha: 7.5 } };
    let cached = true, alphaReads = 0;
    const source = functions('src/app/api/intel/snapshot/route.ts', ['nz', 'sanitizeStoredSnapshot', 'overlayPublishedAlpha', 'GET']);
    const route = evaluate('snapshot-test.ts', source + '\nexports.GET = GET;', {
        Request, URL, NextResponse: { json: x => x }, SECTOR_ID_ALIASES: {},
        getFromCache: async () => cached ? { data_json: data, snapshot_date: '2026-10-22' } : null,
        setInCache: async () => {}, getLatestSnapshot: async () => ({ data_json: data, snapshot_date: '2026-10-22' }),
        getSnapshotByDate: async () => ({ data_json: data, snapshot_date: '2026-10-22' }),
        overlayAiHeadline: async x => x,
        readOptionAlpha: (...args) => { alphaReads++; return service.readOptionAlpha(...args); },
    });
    for (const hit of [true, false]) {
        cached = hit;
        const body = await route.GET(new Request('http://offline.test/api/intel/snapshot?sector=m7'));
        assert.equal(body.source, hit ? 'REDIS' : 'DB');
        body.snapshot.tickers.forEach(t => { assert.equal(t.alpha_score, scores[t.ticker]); assert.equal(t.alpha_score_as_of, '2026-10-22'); });
        assert.equal(body.snapshot.tickers[0].change_pct, -2);
    }
    const count = alphaReads;
    const old = await route.GET(new Request('http://offline.test/api/intel/snapshot?sector=m7&date=2026-10-22'));
    assert.equal(old.snapshot.tickers[0].alpha_score, 7.5); assert.equal(alphaReads, count);
    assert.equal(data.tickers[0].alpha_score, 7.5);
});
test('H2: a newly published XS edition replaces a warm worker immediately', async () => {
    const xs = load('src/services/xsScores.ts');
    store.set('cache:xs:scores', { date: '2026-10-23', scores: { ...scores, NVDA: 80 } });
    await xs.ensureXsScores();
    const next = xs.xsSnapshotOverride('NVDA', { score: 72.5 });
    assert.equal(next.score, 80); assert.equal(next.scoreAsOf, '2026-10-23');
    store.set('cache:xs:scores', { date: '2026-10-22', scores });
    await xs.ensureXsScores();
});
test('M8: actual engine factors use regular percentage, FINRA DP/SV, VIX, cash QQQ and same-session VWAP', async () => {
    const a = (await service.readOptionAlpha(['NVDA'], metrics, fallback)).get('NVDA');
    const factors = Object.values(a.pillars).flatMap(p => p.factors);
    assert.equal(factors.find(f => f.name === 'priceChange').detail, '-4.4%');
    const details = factors.map(f => f.detail).join('|');
    for (const wrong of ['Dark Pool 데이터 없음', 'SV 데이터 없음', 'NDX 데이터 없음', 'VIX 추정', 'VWAP 없음']) assert.ok(!details.includes(wrong), details);
    assert.equal(a.evidenceInputs.darkPoolPct, 39.5); assert.equal(a.evidenceInputs.shortVolPct, 41.5);
    assert.equal(a.evidenceInputs.vwap, 213.659); assert.equal(a.evidenceInputs.vixValue, 19.03);
    assert.ok(a.evidenceInputs.ndxChangePct < -2.8); assert.equal(a.evidenceInputs.blockTrades, null);
    assert.equal(a.evidenceSession, '2026-10-22'); assert.equal(a.evidenceAsOf, new Date(now - 60000).toISOString());
    assert.equal(a.score, 72.5); assert.equal(a.action, 'HOLD');
});
test('M8: measured zero is preserved; missing quote/VWAP/FINRA never becomes a measured zero', async () => {
    const helper = load('src/lib/alphaEvidence.ts');
    assert.equal(helper.alphaRegularQuote({ ...quote(), prices: { ...quote().prices, regularDate: '2026-10-21' } }), null);
    assert.equal(helper.alphaRegularQuote({ ...quote(), prices: { ...quote().prices, prevRegularClose: null } }), null);
    assert.equal(helper.alphaRegularQuote(quote(100, 100)).changePct, 0);
    const regNow = Date.parse('2026-10-22T15:00:00Z');
    const live = { ...quote(100, 100), session: 'REG', tsServer: regNow - 60000,
        prices: { ...quote(100, 100).prices, regularCloseToday: null }, display: { price: 101 } };
    assert.equal(helper.alphaRegularQuote(live, regNow).changePct, 1);
    assert.equal(helper.alphaRegularQuote({ ...live, tsServer: regNow - 16 * 60000 }, regNow), null);
    assert.equal(helper.alphaSessionVwap({ vwap: 200, vwapDate: '2026-10-21' }, null, null), null);
    assert.equal(helper.alphaMacroInputs({ factors: { nasdaq100: { symbolUsed: 'NQ=F', chgPct: 0 } } }, null, null).ndxChangePct, null);
    const bar = { session: 'REG', etDate: '2026-10-22', high: 102, low: 98, close: 100, volume: 10 };
    assert.equal(helper.alphaSessionVwap(null, { data: [bar] }, null), 100);
    const saved = analysis.NVDA;
    analysis.NVDA = { ...saved, darkPoolPct: null, shortVolPct: null };
    const a = (await service.readOptionAlpha(['NVDA'], metrics, fallback)).get('NVDA');
    assert.equal(a.evidenceInputs.darkPoolPct, null); assert.equal(a.evidenceInputs.shortVolPct, null);
    analysis.NVDA = saved;
});
test('gate 1: recalculation retains validated implied move 7.9% and its three evidence points', async () => {
    const saved = analysis.NVDA;
    const valid = { impliedMovePct: 7.9, impliedMoveDef: 'atm-straddle-mid/1', impliedMoveExpiry: '2026-10-23',
        impliedMoveBasis: 'eod', impliedMoveSession: '2026-10-22' };
    const factor = a => Object.values(a.pillars).flatMap(p => p.factors).find(f => f.name === 'impliedMove');
    try {
        for (const [fields, expected] of [
            [valid, 7.9], [{ ...valid, impliedMovePct: null }, null],
            [{ ...valid, impliedMoveDef: null }, null], [{ ...valid, impliedMoveExpiry: '2026-10-21' }, null],
            [{ ...valid, impliedMovePct: NaN }, null],
        ]) {
            analysis.NVDA = { ...saved, ...fields };
            const a = (await service.readOptionAlpha(['NVDA'], metrics)).get('NVDA');
            assert.equal(a.evidenceInputs.impliedMovePct, expected);
            assert.equal(factor(a).detail, expected === null ? 'Implied Move 없음' : 'Implied Move ±7.9%');
            assert.equal(factor(a).value, expected === null ? 0 : 3);
            assert.equal(a.score, 72.5); assert.equal(a.action, 'HOLD');
        }
        analysis.NVDA = { ...saved, impliedMovePct: null };
        const a = (await service.readOptionAlpha(['NVDA'], metrics,
            new Map([['NVDA', { ...fallback.get('NVDA'), ...valid }]]))).get('NVDA');
        assert.equal(a.evidenceInputs.impliedMovePct, 7.9);
        assert.equal(factor(a).value, 3, 'current response supplies a valid move when cache lacks it');
    } finally { analysis.NVDA = saved; }
});
test('gate 2: newest valid regular quote wins across analysis, current batch and ticker storage', async () => {
    const saved = analysis.NVDA, live = store.get('flow:ticker:v6:NVDA');
    const pair = (price, observedAt, extra = {}) => ({ price, prevClose: 100, changePct: price - 100,
        sessionDate: '2026-10-22', observedAt, ...extra });
    try {
        for (const [cached, batch, ticker, price, observedAt, vwap] of [
            [pair(100, now - 600000), pair(120, now - 1000), null, 120, now - 1000, 119],
            [pair(120, now - 1000), pair(100, now - 600000), null, 120, now - 1000, 99],
            [pair(100, now - 600000), pair(120, now - 1000, { sessionDate: '2026-10-21' }), null, 100, now - 600000, 99],
            [pair(100, now - 600000), pair(120, now + 1000), null, 100, now - 600000, 99],
            [pair(100, now - 600000, { price: null }), pair(120, now - 1000), null, 120, now - 1000, 119],
            [pair(100, now - 600000), pair(120, now - 1000, { observedAt: 'invalid' }), null, 100, now - 600000, 99],
            [pair(100, now - 600000), pair(120, now - 1000), quote(110, 100), 120, now - 1000, 119],
            [pair(100, now - 600000), pair(120, now - 120000), quote(110, 100), 110, now - 60000, 213.659],
        ]) {
            analysis.NVDA = { ...saved, alphaQuote: cached, vwap: 99 };
            if (ticker) store.set('flow:ticker:v6:NVDA', ticker); else store.delete('flow:ticker:v6:NVDA');
            const inputs = new Map([['NVDA', { ...fallback.get('NVDA'), alphaQuote: batch, vwap: 119 }]]);
            const a = (await service.readOptionAlpha(['NVDA'], metrics, inputs)).get('NVDA');
            assert.equal(a.evidenceInputs.price, price);
            assert.equal(a.evidenceInputs.changePct, price - 100);
            assert.equal(a.evidenceInputs.vwap, vwap, 'VWAP fallback belongs to the selected quote owner');
            assert.equal(a.evidenceAsOf, new Date(observedAt).toISOString());
            assert.equal(a.pillars.momentum.factors.find(f => f.name === 'priceChange').detail,
                `${price >= 100 ? '+' : ''}${(price - 100).toFixed(1)}%`);
            assert.equal(a.score, 72.5); assert.equal(a.action, 'HOLD');
            assert.equal(cached.price, analysis.NVDA.alphaQuote.price, 'stored input remains unchanged');
        }
    } finally { analysis.NVDA = saved; store.set('flow:ticker:v6:NVDA', live); }
});
test('gate r3-1: real watchlist snapshot retains F&G, MACD and extended evidence through cold and warm exits', async () => {
    const file = 'src/services/watchlistBatchService.ts';
    const tree = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    let inputs, snapshot;
    (function visit(n) {
        if (ts.isVariableDeclaration(n) && n.name.getText(tree) === 'evidenceInputs'
            && n.initializer?.getText(tree).includes('stockData')) inputs = n.initializer.getText(tree);
        if (ts.isVariableDeclaration(n) && n.name.getText(tree) === 'fullObj') {
            snapshot = n.initializer.properties.find(p => p.name?.getText(tree) === 'alphaSnapshot').initializer.getText(tree);
        }
        ts.forEachChild(n, visit);
    })(tree);
    assert.ok(inputs); assert.ok(snapshot);
    const engine = load('src/services/alphaEngine.ts');
    const saved = analysis.NVDA;
    const factors = a => Object.values(a.pillars).flatMap(p => p.factors);
    try {
        for (const [fg, macd, pm] of [[20, 0.8, 2], [0, 0, 0], [null, null, null], [NaN, NaN, NaN]]) {
            const carried = evaluate('watchlist-inputs.ts', `exports.value = ${inputs};`, {
                fearGreedScore: fg, stockData: { macdHistogram: macd, extendedChangePct: pm },
            }).value;
            const valid = Object.fromEntries(Object.entries(carried).map(([k, v]) => [k, Number.isFinite(v) ? v : null]));
            const original = engine.calculateAlphaScore({ ticker: 'NVDA', session: 'POST',
                ...load('src/lib/alphaEvidence.ts').alphaRegularQuote(quote()), ...valid });
            const produced = evaluate('watchlist-snapshot.ts', `exports.value = ${snapshot};`, {
                ...original, alphaResult: original, confidence: original.dataCompleteness,
                triggers: original.triggerCodes, evidenceInputs: carried, regularDate: '2026-10-22',
            }).value;
            const current = new Map([['NVDA', { ...saved, alphaSnapshot: produced }]]);
            for (const mode of ['cold', 'warm', 'older-cache']) {
                analysis = mode === 'cold' ? {} : { NVDA: mode === 'warm' ? current.get('NVDA') : saved };
                const a = (await service.readOptionAlpha(['NVDA'], metrics, mode === 'warm' ? undefined : current)).get('NVDA');
                for (const name of ['fearGreed', 'macdCross', 'preMarketValidation']) {
                    assert.deepEqual(plain(factors(a).find(f => f.name === name) ?? null),
                        plain(factors(original).find(f => f.name === name) ?? null), `${name}: ${mode}`);
                }
                assert.equal(a.evidenceInputs.fearGreedScore, valid.fearGreedScore);
                assert.equal(a.evidenceInputs.macdHistogram, valid.macdHistogram);
                assert.equal(a.evidenceInputs.preMarketChangePct, valid.preMarketChangePct);
                if (fg === 20) {
                    assert.equal(factors(a).find(f => f.name === 'fearGreed').detail, 'F&G 20');
                    assert.equal(factors(a).find(f => f.name === 'macdCross').value, 3);
                    assert.equal(factors(a).find(f => f.name === 'preMarketValidation').value, -3);
                }
                assert.equal(a.score, 72.5); assert.equal(a.action, produced.action);
                assert.equal(produced.evidenceInputs.macdHistogram, macd, 'response is not mutated');
            }
        }
        analysis = { NVDA: { ...saved, alphaSnapshot: { ...saved.alphaSnapshot,
            evidenceSession: '2026-10-21', evidenceInputs: { fearGreedScore: 20, macdHistogram: 0.8, preMarketChangePct: 2 } } } };
        const a = (await service.readOptionAlpha(['NVDA'], metrics)).get('NVDA');
        for (const key of ['fearGreedScore', 'macdHistogram', 'preMarketChangePct']) assert.equal(a.evidenceInputs[key], null);
    } finally { analysis = { NVDA: saved }; }
});
test('gate r3-1: live ticker and portfolio snapshot mappers carry their original supplemental inputs', async () => {
    for (const file of ['src/app/api/live/ticker/route.ts', 'src/services/portfolioBatchService.ts']) {
        const tree = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
        let snapshot;
        (function visit(n) {
            if (ts.isObjectLiteralExpression(n) && n.properties.some(p => p.name?.getText(tree) === 'evidenceInputs')) snapshot = n.getText(tree);
            ts.forEachChild(n, visit);
        })(tree);
        assert.ok(snapshot, file);
        const original = load('src/services/alphaEngine.ts').calculateAlphaScore({ ticker: 'NVDA', session: 'PRE',
            price: 100, prevClose: 110, changePct: -9, preMarketChangePct: 2, fearGreedScore: 20, macdHistogram: 0.8 });
        const produced = evaluate('supplemental-snapshot.ts', `exports.value = ${snapshot};`, {
            ...original, result: original, alphaResult: original, triggers: [], confidence: 50,
            fgCacheData: { score: 20 }, macdData: { histogram: 0.8 }, changePctFrac_PRE: 0.02,
            stockData: { extendedChangePct: 2 }, shownRegularSessionDate: () => '2026-10-22',
        }).value;
        const a = (await service.readOptionAlpha(['NVDA'], metrics, new Map([['NVDA', { alphaSnapshot: produced }]]))).get('NVDA');
        assert.equal(a.evidenceInputs.preMarketChangePct, 2, file);
        assert.equal(a.pillars.momentum.factors.find(f => f.name === 'preMarketValidation').value, -3);
        if (file.includes('live/ticker')) {
            assert.equal(a.evidenceInputs.fearGreedScore, 20);
            assert.equal(a.evidenceInputs.macdHistogram, 0.8);
        }
    }
});
test('gate r3-2: actual Yahoo defaults and failed macro factors cannot become observed VIX', async () => {
    const helper = load('src/lib/alphaEvidence.ts');
    const defaults = evaluate('yahoo-default.ts', functions('src/services/yahooFinanceHub.ts', ['getDefaultQuote'])
        + '\nexports.run = getDefaultQuote;', { console: { warn() {} } });
    const factor = evaluate('macro-factor.ts', functions('src/services/macroHubProvider.ts', ['createYahooFactor'])
        + '\nexports.run = createYahooFactor;');
    const vix = defaults.run('^VIX', 15), vix3m = defaults.run('^VIX3M', 18);
    const failed = factor.run(vix, 'VIX', '^VIX');
    assert.equal(failed.status, 'UNAVAILABLE'); assert.equal(failed.source, 'FAIL');
    const savedMacro = store.get('macro:snapshot:v5'), savedVix = store.get('yahoo:vix'), saved3m = store.get('yahoo:vix3m');
    try {
        for (const f of [failed, { ...failed, source: 'YAHOO' }, { ...failed, status: 'OK' },
            { level: 15, chgPct: 0 }, null]) {
            const macro = { vix: 15, factors: { vix: f } };
            for (const y of [null, vix, { ...vix, source: 'REDIS', status: 'UNAVAILABLE' }]) {
                const input = helper.alphaMacroInputs(macro, y, vix3m);
                assert.equal(input.vixValue, null); assert.equal(input.vixChangePct, null); assert.equal(input.vix3mValue, null);
                store.set('macro:snapshot:v5', { data: macro }); store.set('yahoo:vix', y); store.set('yahoo:vix3m', vix3m);
                const a = (await service.readOptionAlpha(['NVDA'], metrics)).get('NVDA');
                assert.equal(a.evidenceInputs.vixValue, null); assert.equal(a.evidenceInputs.vixChangePct, null);
                const f = a.pillars.regime.factors.find(f => f.name === 'vixLevel');
                assert.notEqual(f.detail, 'VIX 15.0'); assert.notEqual(f.value, 4);
            }
        }
        const measured = { ...failed, source: 'YAHOO', status: 'OK', level: 19.03, chgPct: 0 };
        const macro = { vix: 15, factors: { vix: measured }, fearGreed: { score: 20 } };
        const fromMacro = helper.alphaMacroInputs(macro, vix, null);
        assert.equal(fromMacro.vixValue, 19.03); assert.equal(fromMacro.vixChangePct, 0); assert.equal(fromMacro.fearGreedScore, 20);
        const fromYahoo = helper.alphaMacroInputs({ factors: { vix: failed } }, { price: 22, changePct: 0 }, { price: 24 });
        assert.equal(fromYahoo.vixValue, 22); assert.equal(fromYahoo.vixChangePct, 0); assert.equal(fromYahoo.vix3mValue, 24);
        assert.equal(helper.alphaMacroInputs(macro, { price: 22 }, null).vixChangePct, null, 'do not mix changes from another observation');
        for (const price of [null, NaN, Infinity, 0, -1]) {
            assert.equal(helper.alphaMacroInputs(null, { price, changePct: 0 }, { price }).vixValue, null);
        }
    } finally {
        store.set('macro:snapshot:v5', savedMacro); store.set('yahoo:vix', savedVix);
        if (saved3m === undefined) store.delete('yahoo:vix3m'); else store.set('yahoo:vix3m', saved3m);
    }
});
test('M8: analysis FINRA overlay feeds short volume from the same real report as ticker', async () => {
    mocks['@/services/darkPool'] = { getDarkPoolBatch: async () => ({ NVDA: { pct: 39.5, shortPct: 41.5, date: '2026-10-22' } }) };
    const source = functions('src/services/analysisCache.ts', ['overlayLiveDarkPool']);
    const overlay = evaluate('analysis-overlay.ts', source + '\nexports.run = overlayLiveDarkPool;');
    const rows = { NVDA: { darkPoolPct: null, shortVolPct: null } };
    await overlay.run(rows);
    assert.equal(rows.NVDA.darkPoolPct, 39.5); assert.equal(rows.NVDA.shortVolPct, 41.5);
});
test('M8: pre-fix analysis cache without a price uses the already fetched batch snapshot and cached minute VWAP', async () => {
    const old = store.get('flow:ticker:v6:NVDA'); store.delete('flow:ticker:v6:NVDA');
    store.set('chart:v5:NVDA:1d', { data: [{ session: 'REG', etDate: '2026-10-22', high: 214, low: 212, close: 213, volume: 10 }] });
    const file = 'src/services/watchlistBatchService.ts';
    const tree = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    let loop;
    (function visit(n) { if (ts.isForOfStatement(n) && n.getText(tree).includes('alphaQuotes.set')) loop = n.getText(tree); ts.forEachChild(n, visit); })(tree);
    assert.ok(loop);
    const alphaQuotes = new Map();
    evaluate('batch-snapshot.ts', loop, { alphaQuotes, regularDate: '2026-10-22', startTime: now - 2000,
        snapshotData: { tickers: [{ ticker: 'NVDA', day: { c: 212.21 }, prevDay: { c: 221.97 }, _intrinio: { regularDate: '2026-10-22' } }] } });
    const inputs = new Map([['NVDA', { ...fallback.get('NVDA'), alphaQuote: alphaQuotes.get('NVDA') }]]);
    const a = (await service.readOptionAlpha(['NVDA'], metrics, inputs)).get('NVDA');
    assert.equal(a.pillars.momentum.factors.find(f => f.name === 'priceChange').detail, '-4.4%');
    assert.equal(a.evidenceInputs.vwap, 213);
    assert.equal(a.evidenceAsOf, new Date(now - 2000).toISOString());
    const wrapper = evaluate('batch-boundary.ts', functions(file, ['processWatchlistBatch']) + '\nexports.run = processWatchlistBatch;', {
        readOptionMetrics: async () => metrics,
        processWatchlistBatchCore: async (_t, _mode, _metrics, out) => {
            out.set('NVDA', alphaQuotes.get('NVDA'));
            return { results: [{ ticker: 'NVDA', alphaSnapshot: fallback.get('NVDA').alphaSnapshot, realtime: { vwap: null } }] };
        },
        readOptionAlpha: service.readOptionAlpha, applyOptionMetrics: Object.assign,
        calculateWhaleIndex: () => 50, stampOptionMoveFields: () => {}, shownRegularSessionDate: () => '2026-10-22',
    });
    assert.equal((await wrapper.run(['NVDA'], 'price')).results[0].realtime.vwap, 213);
    store.set('flow:ticker:v6:NVDA', old); store.delete('chart:v5:NVDA:1d');
});
test('M8: real stock-data mapper keeps POST regular return separate from extended return', async () => {
    const source = functions('src/services/watchlistBatchService.ts', ['getStockDataLight']);
    let providerCalls = 0;
    const run = evaluate('mapper-test.ts', source + '\nexports.run = getStockDataLight;', {
        selectVwap: load('src/lib/vwap.ts').selectVwap,
        fetchMassive: async url => { providerCalls++; return url.includes('/snapshot/') ? { ticker: {
            day: { c: 212.21, v: 100 }, prevDay: { c: 221.97 }, lastTrade: { p: 211.8 },
        } } : null; },
        isNonTradingDay: () => false, isTradeInExtSession: () => true,
    });
    mocks['@/services/timezoneUtils'] = { getETNow: () => ({ hour: 18, minute: 0, isWeekend: false, dateString: '2026-10-22' }) };
    const result = await run.run('NVDA');
    assert.equal(result.price, 212.21); assert.ok(Math.abs(result.changePercent + 4.397) < 0.001);
    assert.ok(result.extendedChangePct === null || Math.abs(result.extendedChangePct) < 1);
    assert.equal(providerCalls, 4, 'existing snapshot/RSI/daily/MACD calls only');
});
test('H2: fast and fast-all actual output boundaries use the same publication', async () => {
    const apply = load('src/lib/publishedAlpha.ts').applyPublishedAlpha;
    const source = functions('src/app/api/intel/fast/route.ts', ['metricsResponse']);
    const common = { readOptionMetrics: async () => metrics, readOptionAlpha: service.readOptionAlpha,
        applyOptionMetrics: Object.assign, applyPublishedAlpha: apply, latestOptionsAsOf: () => null,
        NextResponse: { json: x => x } };
    const fast = evaluate('fast-test.ts', source + '\nexports.run = metricsResponse;', common);
    const row = { ticker: 'NVDA', alphaScore: 86, grade: 'S' };
    assert.equal((await fast.run({ data: [row], meta: {} })).data[0].alphaScore, 72.5);
    assert.equal(row.alphaScore, 86);
    const missing = (await fast.run({ data: [{ ticker: 'UNLISTED', alphaScore: 0, missingFields: ['alphaScore'] }], meta: {} })).data[0];
    assert.equal(missing.alphaScore, null); assert.ok(missing.missingFields.includes('alphaScore'));
    const file = 'src/app/api/intel/fast-all/route.ts';
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    const body = ast.statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText(ast)).join('\n');
    const all = evaluate('fast-all-test.ts', body, { ...common, URL,
        INTEL_FAST_SECTORS: ['m7'], etPhase: () => ({ key: 'same', open: false }),
        intelFastWindow: () => ({ fresh: 300000, maxStale: 86400000 }),
        intelFastKey: () => 'sector', usableEnvelope: () => ({ age: 0 }), ageSec: () => 0,
        mgetFromCache: async () => [{ body: { data: [{ ...row }], meta: {} } }],
    });
    assert.equal((await all.GET(new Request('http://offline.test/api/intel/fast-all'))).sectors.m7.data[0].alphaScore, 72.5);
});
(async () => {
    for (const [name, fn] of tests) { await fn(); console.log(`PASS ${name}`); }
    console.log(`${tests.length} regressions passed; storage reads ${reads}; provider calls/writes 0`);
})().catch(e => { console.error(e); process.exitCode = 1; });
