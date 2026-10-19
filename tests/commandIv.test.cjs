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
    let state = null, body, ok = true, fail = false, cleanup;
    const h = { ticker, data: { unified: {} }, iv30Level: null, AbortController,
        ...iv, setBatchIv: next => { state = typeof next === 'function' ? next(state) : next; },
        fetch: async () => {
            if (fail) throw new Error('fixture outage');
            return { ok, json: async () => body };
        } };
    return {
        get state() { return state; },
        set unified(v) { h.data = { unified: v }; },
        set ticker(v) { h.ticker = v; },
        async respond(realtime, opts = {}) {
            cleanup?.(); ok = opts.ok !== false; fail = !!opts.fail;
            body = { results: realtime === undefined ? [] : [{ ticker: h.ticker, realtime }] };
            cleanup = compile(`exports.run = ${effect}`, {}, h).run();
            await new Promise(resolve => setImmediate(resolve));
            return state;
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
    h.unified = { structure: { atmIV: 0.21, chainDate: '2026-10-16' } };
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
        const globals = { ...iv, data: { unified: {} }, batchIv: h.state, ticker: 'WTFC', iv30Level: null,
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
