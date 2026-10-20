const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const read = p => fs.readFileSync(require('node:path').join(__dirname, '..', p), 'utf8');
function compile(source, imports = {}, globals = {}) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText, { exports, ...globals, require: name => {
        if (name in imports) return imports[name];
        throw new Error(`Unmocked import: ${name}`);
    } });
    return exports;
}
const dates = compile(read('src/lib/ivSkew.ts'));
const iv = compile(read('src/lib/app/commandIv.ts'), { '@/lib/ivSkew': dates });
const source = read('src/app/[locale]/app-view/cmd/page.tsx');

// B5: signalsData also selects the VOL REGIME edition and conviction inputs — not under test here (IV only).
const b5Stubs = { resolveCommandVolatilityObservation: () => null, computeUnifiedVolatilityRegime: () => ({ regimeScore: null, regime: null }),
    scoreCommandConviction: () => null, convictionInputsOf: () => ({}), commandConvictionRaw: () => ({ raw: {} }), carriedConvictionDate: () => null };
function signals(data, batchIv, ticker) {
    const ast = ts.createSourceFile('cmd.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let calculation;
    function visit(n) {
        if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'signalsData') calculation = n.initializer.getText(ast);
        ts.forEachChild(n, visit);
    }
    visit(ast); assert.ok(calculation);
    return compile(`exports.signals = ${calculation};`, {}, { ...iv, ...b5Stubs, data, batchIv, ticker, iv30Level: null,
        locale: 'ko', tDashboard: x => x, useMemo: fn => fn(), normalizeVwap: () => null,
        gammaFlipDistancePct: () => null, vwapDistancePct: () => null, netPremiumOf: () => null }).signals;
}

// Execute the product effect, including its fetch/abort/state update behavior.
function harness(ticker = 'WTFC') {
    const ast = ts.createSourceFile('cmd.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let effect;
    function visit(n) {
        if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect' &&
            n.getText(ast).includes('/api/watchlist/batch?')) effect = n.arguments[0].getText(ast);
        ts.forEachChild(n, visit);
    }
    visit(ast); assert.ok(effect);
    let state = {}, body, ok = true, fail = false, cleanup, deferred = false, release;
    const h = { ticker, data: { ticker, unified: {} }, iv30Level: null, AbortController,
        ...iv, setBatchIv: next => { state = typeof next === 'function' ? next(state) : next; },
        fetch: async () => {
            if (fail) throw new Error('fixture outage');
            const responseBody = body;
            const response = { ok, json: async () => responseBody };
            return deferred ? new Promise(resolve => { release = () => resolve(response); }) : response;
        } };
    return {
        get state() { return state[h.ticker] ?? null; },
        get store() { return state; },
        get data() { return h.data; },
        set unified(v) { h.data = { ticker: h.ticker, unified: v }; },
        set ticker(v) { h.ticker = v; },
        async release() { release(); await new Promise(resolve => setImmediate(resolve)); },
        async respond(realtime, opts = {}) {
            cleanup?.(); ok = opts.ok !== false; fail = !!opts.fail;
            deferred = !!opts.defer;
            body = { results: realtime === undefined ? [] : [{ ticker: h.ticker, realtime }] };
            cleanup = compile(`exports.run = ${effect}`, {}, h).run();
            await new Promise(resolve => setImmediate(resolve));
            return state[h.ticker] ?? null;
        },
    };
}

test('gate REG + CLOSED: actual Command effect keeps 21 with its original source date after null', async () => {
    for (const session of ['REG', 'CLOSED']) {
        const h = harness();
        await h.respond({ iv: 21, ivSourceDate: '2026-10-16', session });
        assert.equal(h.state.iv, 21);
        assert.equal(h.state.sourceDate, '2026-10-16');
        await h.respond({ iv: null, ivSourceDate: '2026-10-19', session });
        assert.equal(h.state.iv, 21);
        assert.equal(h.state.sourceDate, '2026-10-16', 'missing response cannot redate the old value');
        assert.equal(h.state.restored, true);
    }
});

test('gate 2 REG + CLOSED: switching ticker before data arrives cannot relabel the old unified IV', async () => {
    for (const session of ['REG', 'CLOSED']) {
        const h = harness();
        h.unified = { structure: { atmIV: 0.21, ivSourceDate: '2026-10-16', chainDate: '2026-10-16' }, session };
        await h.respond(undefined);
        assert.equal(h.state.ticker, 'WTFC');
        h.ticker = 'FITB'; // data still belongs to WTFC during the next render/effect.
        await h.respond({ iv: null });
        assert.equal(h.state, null, 'WTFC must never be stored as FITB');
        assert.equal(signals(h.data, h.store, 'FITB').iv, null, 'stale IV is rejected in render, before effects; signal slots stay present');
        h.unified = {};
        await h.respond({ iv: null });
        assert.equal(h.state, null, 'FITB missing source must remain missing');
        await h.respond({ iv: 24, ivSourceDate: '2026-10-15', session });
        assert.equal(signals(h.data, h.store, 'FITB').iv, 24);
        h.ticker = 'WTFC';
        assert.equal(signals(h.data, h.store, 'WTFC').iv, 21, 'before WTFC data arrives, only its own stored IV is used');
        h.unified = {};
        await h.respond({ iv: null });
        assert.equal(h.state.iv, 21, 'returning to WTFC restores WTFC only');
        assert.equal(h.state.sourceDate, '2026-10-16');
        assert.equal(h.state.restored, true);
        h.ticker = 'FITB';
        h.unified = {};
        await h.respond({ iv: null });
        assert.equal(h.state.iv, 24);
        assert.equal(h.state.sourceDate, '2026-10-15');
        assert.equal(h.state.restored, true);
    }
});

test('gate 2: structure edition date cannot date a volatility IV copied by unified API', () => {
    const api = read('src/app/api/command/unified/route.ts');
    const ast = ts.createSourceFile('unified.ts', api, ts.ScriptTarget.Latest, true);
    let copy;
    function visit(n) {
        if (ts.isIfStatement(n) && n.expression.getText(ast) === 'finalData.structure && !finalData.structure.atmIV && finalData.volatility?.iv > 0') copy = n.getText(ast);
        ts.forEachChild(n, visit);
    }
    visit(ast); assert.ok(copy);
    const finalData = { structure: { chainDate: '2026-10-16' }, volatility: { iv: 21, ivSourceDate: '2026-10-16' } };
    compile(copy, {}, { finalData }); // actual producer copies the number without its provenance.
    assert.equal(finalData.structure.atmIV, 0.21);
    const gateAst = ts.createSourceFile('gate.ts', read('src/lib/optionLevelGate.ts'), ts.ScriptTarget.Latest, true);
    const overlay = gateAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'applyLevelsToUnified');
    assert.ok(overlay);
    const result = compile(`${overlay.getText(gateAst)}; exports.run = applyLevelsToUnified;`, {}, {
        STRUCTURE_PRODUCER: 'structureService', posOrNull: () => null, gammaFlipDistancePct: () => null, gammaFlipTypeOf: () => null,
        displayLevels: () => ({ levelsChainDate: '2026-10-19' }),
    }).run(finalData, {}); // actual unified exit overwrites the structure edition date.
    assert.equal(result.structure.chainDate, '2026-10-19');
    const selected = iv.commandUnifiedIv('WTFC', result);
    assert.equal(selected.iv, 21);
    assert.equal(selected.sourceDate, '2026-10-16', 'must select the volatility source date, not the overlaid structure date');
    assert.equal(iv.commandUnifiedIv('WTFC', { structure: result.structure, volatility: { iv: 21 } }), null);
    const displayed = signals({ ticker: 'WTFC', unified: result }, {}, 'WTFC');
    assert.equal(displayed.iv, 21); assert.ok(displayed.ivDateText.includes('2026-10-16'));
    assert.ok(!displayed.ivDateText.includes('2026-10-19'));
});

test('ticker switch aborts an in-flight batch; late response cannot populate either ticker', async () => {
    const h = harness();
    await h.respond({ iv: 21, ivSourceDate: '2026-10-16' }, { defer: true });
    h.ticker = 'FITB'; h.unified = {};
    await h.respond({ iv: 24, ivSourceDate: '2026-10-15' });
    await h.release();
    assert.equal(h.state.iv, 24);
    assert.equal(h.store.WTFC, undefined, 'aborted response is never saved');
    assert.equal(h.state.sourceDate, '2026-10-15');
});

test('explicit nested ticker mismatch and unrelated dates cannot provide IV provenance', () => {
    for (const wrong of [
        { ticker: 'WTFC', volatility: { iv: 21, ivSourceDate: '2026-10-16' } },
        { structure: { ticker: 'WTFC', atmIV: 0.21, ivSourceDate: '2026-10-16' } },
        { volatility: { ticker: 'WTFC', iv: 21, ivSourceDate: '2026-10-16' } },
        { structure: { atmIV: 0.21, chainDate: '2026-10-19', _ts: Date.now() }, timestamp: Date.now() },
    ]) assert.equal(iv.commandUnifiedIv('FITB', wrong), null);
    const actual = iv.commandUnifiedIv('FITB', { structure: { atmIV: 0.24, ivObservedAt: '2026-10-17T00:30:00Z', chainDate: '2026-10-19' } });
    assert.equal(actual.iv, 24); assert.equal(actual.sourceDate, '2026-10-16'); assert.equal(actual.dateKind, 'observation');
});

test('missing/undated/failed responses retain the exact date; recovery replaces value and date together', async () => {
    const h = harness();
    assert.equal(await h.respond({ iv: 21 }), null, 'undated first response is unusable');
    await h.respond({ iv: 21, ivSourceDate: '2026-10-16' });
    for (const [rt, options] of [
        [{ iv: 99 }, {}], [undefined, {}], [{ iv: 0 }, {}], [{ iv: NaN }, {}],
        [{ iv: 99, ivSourceDate: '2026-02-30' }, {}],
        [null, { ok: false }], [null, { fail: true }],
    ]) {
        await h.respond(rt, options);
        assert.equal(h.state.iv, 21);
        assert.equal(h.state.sourceDate, '2026-10-16');
        assert.equal(h.state.restored, true);
    }
    await h.respond({ iv: 24, ivSourceDate: '2026-10-19' });
    assert.equal(h.state.iv, 24); assert.equal(h.state.sourceDate, '2026-10-19');
    assert.equal(h.state.restored, false);
    h.ticker = 'FITB';
    assert.equal(await h.respond({ iv: null }), null, 'ticker switch cannot reuse WTFC');
});

test('unified fallback also requires its own date and survives a subsequent missing source', async () => {
    const h = harness();
    h.unified = { structure: { atmIV: 0.21, ivSourceDate: '2026-10-16', chainDate: '2026-10-19' } };
    await h.respond(undefined);
    assert.equal(h.state.iv, 21); assert.equal(h.state.sourceDate, '2026-10-16');
    h.unified = { structure: { atmIV: null, chainDate: '2026-10-19' } };
    await h.respond(undefined);
    assert.equal(h.state.iv, 21); assert.equal(h.state.sourceDate, '2026-10-16');
    assert.equal(h.state.restored, true);
    assert.equal(iv.commandUnifiedIv('WTFC', { volatility: { iv: 21, _ts: Date.now() }, _asOf: '2026-10-19' }), null);
});

test('GEX fallback transports the IV row date/time, never the flow/quote/response date', () => {
    const service = read('src/services/watchlistBatchService.ts');
    const ast = ts.createSourceFile('batch.ts', service, ts.ScriptTarget.Latest, true);
    let merge, fill;
    function visit(n) {
        if (ts.isReturnStatement(n) && n.expression?.getText(ast).includes('atmIvObservedAt: gx?.timestamp')) merge = n.expression.getText(ast);
        if (ts.isIfStatement(n) && n.expression.getText(ast).startsWith('rt.atmIv == null')) fill = n.getText(ast);
        ts.forEachChild(n, visit);
    }
    visit(ast); assert.ok(merge); assert.ok(fill);
    const mergeRows = compile(`exports.run = (gx, fl) => (${merge});`).run;
    const at = Date.parse('2026-10-16T20:01:00Z');
    const af = mergeRows({ atmIv: 21, timestamp: at }, { timestamp: Date.parse('2026-10-19T15:00:00Z') });
    const rt = { iv: null, price: 143 };
    compile(fill, {}, { rt, af, put: (k, v) => { if (v != null) rt[k] = v; } });
    const actual = iv.commandBatchIv('WTFC', { ticker: 'WTFC', realtime: rt });
    assert.equal(actual.iv, 21); assert.equal(actual.sourceDate, '2026-10-16');
    assert.equal(actual.dateKind, 'observation');
    assert.equal(iv.commandBatchIv('WTFC', { ticker: 'WTFC', realtime: { atmIv: 21,
        ...mergeRows(null, { timestamp: at }), } }), null, 'flow date cannot date IV');
    assert.equal(mergeRows({ timestamp: at }, { atmIv: 99 }).atmIv, null, 'GEX time cannot date a flow IV');
    const own = { atmIv: 24, atmIvSourceDate: '2026-10-15' };
    compile(fill, {}, { rt: own, af, put: () => assert.fail('must not overwrite existing ATM IV') });
    assert.equal(own.atmIvSourceDate, '2026-10-15');
});

test('actual IV card and derived premium line render the retained date in ko/en/ja', async () => {
    const h = harness();
    await h.respond({ iv: 21, ivSourceDate: '2026-10-16' });
    await h.respond({ iv: null });
    const ast = ts.createSourceFile('cmd.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let card, premium, calculation;
    function visit(n) {
        if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'signalsData') calculation = n.initializer.getText(ast);
        if (ts.isJsxAttribute(n) && n.name.getText(ast) === 'sub' && n.initializer?.getText(ast).includes('signalsData.ivDateText')) card = n.initializer.expression.getText(ast);
        if (ts.isJsxExpression(n) && n.expression?.getText(ast).startsWith('hasPrem && <>IV ')) premium = n.expression.getText(ast);
        ts.forEachChild(n, visit);
    }
    visit(ast); assert.ok(card); assert.ok(premium); assert.ok(calculation);
    const React = require('react'), render = require('react-dom/server').renderToStaticMarkup;
    for (const locale of ['ko', 'en', 'ja']) {
        const globals = { ...iv, ...b5Stubs, data: { ticker: 'WTFC', unified: {} }, batchIv: h.store, ticker: 'WTFC', iv30Level: null,
            locale, tDashboard: x => x, useMemo: fn => fn(), normalizeVwap: () => null,
            gammaFlipDistancePct: () => null, vwapDistancePct: () => null, netPremiumOf: () => null };
        const signalsData = compile(`exports.signals = ${calculation};`, {}, globals).signals;
        assert.equal(signalsData.iv, 21);
        const primary = compile(`exports.signals = ${calculation};`, {}, { ...globals, iv30Level: 25 }).signals;
        assert.equal(primary.iv, 25); assert.equal(primary.ivDateText, '', 'fallback date cannot label a different IV30 value');
        for (const expression of [card, premium]) {
            const el = compile(`exports.el = (${expression});`, { 'react/jsx-runtime': require('react/jsx-runtime') },
                { signalsData, locale, tDashboard: x => x, hasPrem: true, vp: { ivPct: 21, rvPct: 15 }, hint: '' }).el;
            const html = render(React.createElement(React.Fragment, null, el));
            assert.ok(html.includes('21')); assert.ok(html.includes('2026-10-16 ET'));
            assert.ok(!html.includes('2026-10-19'));
            assert.ok(html.includes(locale === 'ko' ? '직전 관측' : locale === 'ja' ? '直前観測' : 'Last observed'));
        }
    }
});
