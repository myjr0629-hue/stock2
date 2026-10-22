const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let now = Date.parse('2026-10-21T12:00:00-04:00');
class Clock extends Date { static now() { return now; } }
const read = p => fs.readFileSync(require('node:path').join(__dirname, '..', p), 'utf8');
function compile(source, imports = {}, globals = {}) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText, { exports, Date: Clock, ...globals, require: name => {
        if (name in imports) return imports[name];
        throw new Error(`Unmocked import: ${name}`);
    } });
    return exports;
}
const dates = compile(read('src/lib/ivSkew.ts'));
const calendar = compile(read('src/lib/marketCalendar.ts'));
const rank = compile(read('src/lib/ivRank.ts'), { './marketCalendar': calendar, './ivSkew': dates });
const iv = compile(read('src/lib/app/commandIv.ts'), { '@/lib/ivSkew': dates, '@/lib/ivRank': rank });
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
    const mergeRows = compile(`exports.run = (gx, fl) => (${merge});`, {}, { ...iv, t: 'WTFC' }).run;
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
    const stale = mergeRows({ atmIv: 55, chainDate: '2026-08-28', timestamp: Date.parse('2026-08-28T20:00:00Z') }, { timestamp: now });
    assert.equal(stale.atmIv, null, '배치 생산자에서도 오래된 GEX IV를 차단한다');
    assert.equal(mergeRows({ atmIv: 55, chainDate: '2026-08-28', timestamp: now }, null).atmIv, null, '새 수집 시각으로 옛 IV를 구제하지 않는다');
    const fresh = { atmIv: 21, chainDate: '2026-10-16', timestamp: at };
    assert.equal(JSON.stringify(mergeRows(fresh, null)), JSON.stringify({ ...fresh, atmIvSourceDate: fresh.chainDate, atmIvObservedAt: at }), '정상 GEX 병합 응답 바이트 불변');
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

const basis = compile(read('src/lib/app/intelOptionsBasis.ts'), {
    '@/lib/putCall': compile(read('src/lib/putCall.ts')), '@/lib/marketCalendar': calendar,
});
const metrics = compile(read('src/lib/optionMetrics.ts'), { './app/intelOptionsBasis': basis, './ivSkew': dates });

test('IBM 모형: 8/28 GEX 대신 오늘 구조 IV와 그 고유 관측일을 함께 채택한다', () => {
    const latest = { atmIv: 31, ivSourceDate: '2026-10-21', ivObservedAt: '2026-10-21T15:00:00Z' };
    const data = { ticker: 'IBM', structure: { atmIV: .55, chainDate: '2026-08-28', ivSourceDate: '2026-08-28' },
        volatility: { iv: 55, ivSourceDate: '2026-08-28' } };
    metrics.applyUnifiedOptionMetrics(data, metrics.optionMetrics(latest, null, now), metrics.optionRegimeInputs(latest));
    const selected = iv.commandUnifiedIv('IBM', data);
    assert.equal(selected.iv, 31);
    assert.equal(selected.sourceDate, '2026-10-21');
    assert.equal(data.structure.chainDate, '2026-08-28', '다른 기준일을 IV 날짜로 보충하지 않는다');
    for (const section of [data.structure, data.volatility]) {
        assert.equal(section.ivSourceDate, latest.ivSourceDate);
        assert.equal(section.ivObservedAt, new Date(latest.ivObservedAt).toISOString());
    }
    assert.equal(iv.commandBatchIv('IBM', { ticker: 'IBM', realtime: { atmIv: 55,
        atmIvSourceDate: '2026-08-28', atmIvObservedAt: Date.parse('2026-08-28T20:00:00Z') } }), null);
    const displayed = signals({ ticker: 'IBM', unified: data }, {}, 'IBM');
    assert.equal(displayed.iv, 31); assert.match(displayed.ivDateText, /2026-10-21 ET/);
});

test('오래된 모든 대체 경로·보관값은 거절하고 기존 결측 표시 입력을 유지한다', async () => {
    const stale = { ticker: 'IBM', iv: 55, sourceDate: '2026-08-28', dateKind: 'observation', restored: false };
    const old = { structure: { atmIV: .55, ivSourceDate: stale.sourceDate },
        volatility: { iv: 55, ivObservedAt: '2026-08-28T20:00:00Z' } };
    assert.equal(iv.commandUnifiedIv('IBM', old), null);
    assert.equal(iv.commandBatchIv('IBM', { ticker: 'IBM', realtime: { iv: 55, ivSourceDate: stale.sourceDate } }), null);
    assert.equal(iv.retainCommandIv(stale, null, 'IBM'), null);
    const displayed = signals({ ticker: 'IBM', unified: old }, { IBM: stale }, 'IBM');
    assert.equal(displayed.iv, null); assert.equal(displayed.ivDateText, '');
    const h = harness('IBM');
    await h.respond({ iv: 31, ivSourceDate: '2026-10-21' });
    const savedNow = now;
    try {
        now = Date.parse('2026-10-29T17:00:00-04:00');
        await h.respond({ atmIv: 55, atmIvSourceDate: '2026-08-28' });
        assert.equal(h.state, null, '만료된 상태값도 삭제한다');
    } finally { now = savedNow; }
});

test('신선도 4거래일 경계: 주말·노동절·조기 폐장·ET 자정', () => {
    for (const [at, boundary, tooOld] of [
        ['2026-10-21T15:59:00-04:00', '2026-10-14', '2026-10-13'],
        ['2026-10-21T16:00:00-04:00', '2026-10-15', '2026-10-14'],
        ['2026-09-08T09:00:00-04:00', '2026-08-31', '2026-08-28'],
        ['2026-09-08T16:00:00-04:00', '2026-09-01', '2026-08-31'],
        ['2026-09-06T12:00:00-04:00', '2026-08-31', '2026-08-28'],
        ['2026-09-07T12:00:00-04:00', '2026-08-31', '2026-08-28'],
        ['2026-11-27T12:59:00-05:00', '2026-11-19', '2026-11-18'],
        ['2026-11-27T13:00:00-05:00', '2026-11-20', '2026-11-19'],
        ['2026-10-21T00:01:00-04:00', '2026-10-14', '2026-10-13'],
    ]) {
        const atMs = Date.parse(at);
        for (const [date, accepted] of [[boundary, true], [tooOld, false]]) {
            assert.equal(rank.isFreshIvObservation(date, atMs), accepted, `${at} / ${date}`);
            assert.equal(!!iv.commandUnifiedIv('IBM', { volatility: { iv: 31, ivSourceDate: date } }, atMs), accepted);
            assert.equal(!!iv.commandBatchIv('IBM', { ticker: 'IBM', realtime: { atmIv: 31, atmIvSourceDate: date } }, atMs), accepted);
        }
    }
    for (const invalid of [null, '2026-02-30', '2026-10-22']) assert.equal(rank.isFreshIvObservation(invalid, now), false);
    // IV30 랭크의 기존 4일(ms) 차단은 그대로다 — 대체 경로 규칙이 IV30 판정을 느슨하게 만들지 않는다.
    assert.equal(rank.IV_RANK_MAX_AGE_MS, 4 * 86_400_000);
    const last = Date.parse('2026-10-15T16:30:00-04:00');
    const history = [{ timestamp: last, iv30: 31, iv30Def: 'cm30-v1' }];
    assert.equal(rank.ivRankFromHistory(history, { nowMs: last + 4 * 86_400_000 + 1 }).reason, 'stale');
    assert.notEqual(rank.ivRankFromHistory(history, { nowMs: last + 3 * 86_400_000 }).reason, 'stale');
    assert.equal(iv.commandUnifiedIv('IBM', { structure: { atmIV: .55, ivSourceDate: '2026-08-28', ivObservedAt: '2026-10-21T15:00:00Z' },
        volatility: { iv: 31, ivSourceDate: '2026-10-21' } }).iv, 31, '새 수집 시각이 오래된 IV 원천 날짜를 구제하지 않는다');
});

test('더 오래된 새 응답은 신선한 보관 IV를 덮지 않는다', () => {
    const previous = iv.commandUnifiedIv('IBM', { volatility: { iv: 31, ivSourceDate: '2026-10-21' } });
    const next = iv.commandUnifiedIv('IBM', { volatility: { iv: 55, ivSourceDate: '2026-10-16' } });
    const selected = iv.retainCommandIv(previous, next, 'IBM');
    assert.equal(selected.iv, 31); assert.equal(selected.sourceDate, '2026-10-21');
});

test('3차 관문: 최신 보관 IV 31은 이전 unified IV 55 재응답 전후 실제 표시에도 유지된다', async () => {
    for (const section of ['structure', 'volatility']) {
        const h = harness('IBM');
        await h.respond({ iv: 31, ivSourceDate: '2026-10-21' });
        h.unified = { [section]: { atmIV: .55, iv: 55, ivSourceDate: '2026-10-16' } };
        const check = () => {
            const displayed = signals(h.data, h.store, 'IBM');
            assert.equal(displayed.iv, 31);
            assert.ok(displayed.ivDateText.includes('2026-10-21 ET'));
            assert.ok(!displayed.ivDateText.includes('2026-10-16'));
        };
        check(); // 새 응답의 effect 실행 전 렌더도 검증한다.
        await h.respond(undefined);
        assert.equal(h.state.iv, 31);
        check();
        h.unified = {};
        await h.respond(undefined);
        check();
    }
});

test('3차 관문: 같은 ET 날짜도 IV 고유 관측 시각 최신순으로 보관·표시한다', async () => {
    const h = harness('IBM');
    await h.respond({ iv: 31, ivObservedAt: '2026-10-21T15:30:00Z' });
    h.unified = { volatility: { iv: 55, ivObservedAt: '2026-10-21T15:00:00Z' } };
    assert.equal(signals(h.data, h.store, 'IBM').iv, 31);
    await h.respond(undefined);
    assert.equal(h.state.iv, 31);
    assert.equal(signals(h.data, h.store, 'IBM').iv, 31);
    h.unified = { volatility: { iv: 32, ivObservedAt: '2026-10-21T15:45:00Z' } };
    assert.equal(signals(h.data, h.store, 'IBM').iv, 32);
    await h.respond(undefined);
    assert.equal(h.state.iv, 32);
    h.unified = {};
    await h.respond({ iv: 55, ivObservedAt: '2026-10-21T15:00:00Z' });
    assert.equal(h.state.iv, 32);
    assert.equal(signals(h.data, h.store, 'IBM').iv, 32);
});

test('3차 관문: 최신값이 없으면 이전 IV와 그 날짜만 표시하고 만료·무날짜 값은 채택하지 않는다', () => {
    const data = { ticker: 'IBM', unified: { volatility: { iv: 55, ivSourceDate: '2026-10-16' } } };
    assert.equal(signals(data, {}, 'IBM').iv, 55);
    assert.ok(signals(data, {}, 'IBM').ivDateText.includes('2026-10-16 ET'));
    const expired = { IBM: { ticker: 'IBM', iv: 31, sourceDate: '2026-08-28', dateKind: 'session', restored: true } };
    assert.equal(signals(data, expired, 'IBM').iv, 55);
    data.unified = { volatility: { iv: 31, timestamp: now }, structure: { chainDate: '2026-10-21' } };
    assert.equal(signals(data, expired, 'IBM').iv, null);
    assert.equal(signals(data, expired, 'IBM').ivDateText, '');
});

test('3차 관문: unified·배치 내부 후보도 날짜와 고유 관측 시각으로 고른다', () => {
    const older = { iv: 55, ivSourceDate: '2026-10-16' };
    const newer = { iv: 31, ivSourceDate: '2026-10-21' };
    assert.equal(iv.commandUnifiedIv('IBM', { structure: { atmIV: .55, ...older }, volatility: newer }).iv, 31);
    assert.equal(iv.commandBatchIv('IBM', { ticker: 'IBM', realtime: { ...older, atmIv: 31, atmIvSourceDate: '2026-10-21' } }).iv, 31);
    const at = '2026-10-21T15:30:00Z', before = '2026-10-21T15:00:00Z';
    assert.equal(iv.commandUnifiedIv('IBM', { structure: { atmIV: .55, ivObservedAt: before },
        volatility: { iv: 31, ivObservedAt: at } }).iv, 31);
    assert.equal(iv.commandBatchIv('IBM', { ticker: 'IBM', realtime: { iv: 55, ivObservedAt: before,
        atmIv: 31, atmIvObservedAt: at } }).iv, 31);
    // 옛 IV 원천 날짜와 다른 날의 수집 시각을 최신 IV의 관측 시각으로 쓰지 않는다.
    assert.equal(iv.commandUnifiedIv('IBM', { structure: { atmIV: .55, ...older, ivObservedAt: at }, volatility: newer }).iv, 31);
});

test('IV를 옮길 때 옛 IV 날짜를 남기지 않고, 판본·레벨 날짜를 대신 쓰지 않는다', () => {
    const data = { structure: { atmIV: .55, ivSourceDate: '2026-10-21', ivObservedAt: '2026-10-21T15:00:00Z' },
        volatility: { iv: 55, ivSourceDate: '2026-10-21' } };
    const undated = { atmIv: 31, chainDate: '2026-10-21', timestamp: now, levelsAsOf: now };
    metrics.applyUnifiedOptionMetrics(data, null, metrics.optionRegimeInputs(undated));
    assert.equal(iv.commandUnifiedIv('IBM', data), null);
    assert.equal(data.structure.ivSourceDate, null); assert.equal(data.volatility.ivSourceDate, null);
    const observed = metrics.optionRegimeInputs({ atmIv: 31, ivObservedAt: '2026-10-22T00:30:00Z' });
    metrics.applyUnifiedOptionMetrics(data, null, observed);
    assert.equal(iv.commandUnifiedIv('IBM', data).sourceDate, '2026-10-21');
});

// 실제 계산 구간을 실행한다. 벤더·저장소 접근은 전부 합성 함수로 대체한다.
const structureSource = read('src/services/structureService.ts');
const start = structureSource.indexOf('        let atmIv: number | null = null;');
const end = structureSource.indexOf('        // ★★ [2026-09-29] 예상 변동', start);
assert.ok(start > 0 && end > start);
const calculateIv = compile(`exports.run = async (cleanContracts, targetExpiry, availableExpirations, fetchMassiveWithRetry, usedLambdaCache = false, chainDate = null) => {
    const underlyingPrice = 100, todayStr = '2026-10-21', ticker = 'IBM';
    ${structureSource.slice(start, end)}
    return { atmIv, ivSourceDate, ivObservedAt, ivExpiry };
};`, {}, { sourceDate: dates.sourceDate, observationTime: dates.observationTime, isFreshIvObservation: rank.isFreshIvObservation, console: { log() {} } }).run;
const contract = (type, date, iv = .31) => ({ k: 100, type, implied_volatility: iv, _intrinio: { date } });

test('구조 IV 고유 날짜: 다른 만기·날짜 없는 실시간·누락 다리·프로브 원천', async () => {
    const legs = [contract('call', '2026-10-21'), contract('put', '2026-10-21')];
    const noFetch = () => assert.fail('외부 호출 금지');
    assert.equal((await calculateIv(legs, '2026-10-23', [], noFetch)).ivSourceDate, '2026-10-21');
    assert.equal((await calculateIv([legs[0]], '2026-10-23', [], noFetch)).ivSourceDate, '2026-10-21');
    const undated = legs.map(c => ({ ...c, _rtGreeks: true }));
    assert.equal((await calculateIv(undated, '2026-10-23', [], noFetch)).ivSourceDate, null);
    const dated = undated.map(c => ({ ...c, ivObservedAt: '2026-10-21T15:00:00Z' }));
    assert.equal((await calculateIv(dated, '2026-10-23', [], noFetch)).ivObservedAt, '2026-10-21T15:00:00.000Z');
    const next = await calculateIv(legs, '2026-10-21', ['2026-10-21', '2026-10-23'], async () => ({ success: true, data: { results:
        legs.map(c => ({ ...c, _intrinio: { date: '2026-10-20' }, details: { strike_price: 100, contract_type: c.type } })) } }), true, '2026-10-21');
    assert.equal(next.ivExpiry, '2026-10-23'); assert.equal(next.ivSourceDate, '2026-10-20');
    const noDates = legs.map(({ _intrinio, ...c }) => c);
    assert.equal((await calculateIv(noDates, '2026-10-23', [], noFetch, true, '2026-10-20')).ivSourceDate, null);
    assert.equal((await calculateIv([legs[0], contract('put', '2026-10-20')], '2026-10-23', [], noFetch)).ivSourceDate, '2026-10-21');
});

// 실제 수집기·직접 경로의 변환 함수와 프로브 축약 함수를 연결한다.
function declaration(file, name) {
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    let found;
    function visit(n) {
        if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n.getText(ast);
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) found = `const ${n.getText(ast)};`;
        ts.forEachChild(n, visit);
    }
    visit(ast); assert.ok(found, name); return found;
}
const slimContract = compile(`${declaration('scripts/lambda-flow-harvest/index.js', 'slimContract')}; exports.run = slimContract;`).run;
async function adaptedChain(lambda, rtRows, eodDate = '2026-10-20', { revisitAt, legacyCache = false } = {}) {
    const file = lambda ? 'scripts/lambda-flow-harvest/intrinio-adapter.js' : 'src/services/intrinioClient.ts';
    const realtimeName = lambda ? 'getRealtimeGreeks' : 'getRealtimeGreeksIntrinio';
    const chainName = lambda ? 'getOptionChain' : 'getOptionChainSnapshotIntrinio';
    const rows = ['call', 'put'].map(type => ({ option: { code: type, type, strike: 100, expiration: '2026-10-23' },
        prices: { date: eodDate, implied_volatility: .24, open_interest: 10 } }));
    const pages = Array.isArray(rtRows[0]) ? rtRows : [rtRows];
    let calls = 0;
    const cache = new Map();
    const globals = { process: { env: {} }, URLSearchParams, AbortController, setTimeout, clearTimeout,
        INTRINIO_API_KEY: true, INTRINIO_KEY: true, INTRINIO_BASE: 'https://fixture.invalid',
        INTRINIO_MAX_ATTEMPTS: 1, MAX_ATTEMPTS: 1, VENDOR_CACHE_PREFIX: 'fixture:', _inflight: new Map(),
        vendorTtlSec: () => 60, _looksEmpty: () => false,
        bgStore: { getStore() {} }, warmGateStore: { getStore() {} },
        noteCall() {}, note429() {}, noteFail() {}, _acquire: async () => {}, _release() {}, rateGate: async () => {},
        getFromCache: async key => legacyCache ? { contracts: pages[0] } : cache.get(key),
        setInCache: async (key, data) => { cache.set(key, data); },
        fetch: async () => {
            const i = calls++;
            return { ok: true, status: 200, json: async () => ({ contracts: pages[i], next_page: i + 1 < pages.length ? String(i + 1) : null }) };
        }, num: x => typeof x === 'number' && Number.isFinite(x) ? x : null,
        dateToMs: d => Date.parse(d + 'T00:00:00Z'),
        fetchChainPagesIntrinio: async () => ({ rows, pages: 1, keys: ['chain'] }),
        cachedChain: async () => ({ chain: rows }), followChainPages: async (_s, _e, ch) => ch,
        chainDateOf: () => eodDate, console: { warn() {} } };
    const producer = compile(`${declaration(file, 'greekNumber')}\n${declaration(file, 'callIntrinio')}\n${declaration(file, realtimeName)}\n${declaration(file, chainName)}; exports.run = ${chainName};`, {}, globals).run;
    let result = await producer('IBM', { expiration: '2026-10-23', underlyingPrice: 100 });
    if (revisitAt) {
        now = Date.parse(revisitAt);
        result = await producer('IBM', { expiration: '2026-10-23', underlyingPrice: 100 });
        assert.equal(calls, pages.length, '공유 캐시 재사용은 벤더 재호출 없이 최초 관측 시각을 유지한다');
    }
    return result.results;
}
const rtRow = (type, value = .31) => ({ option: { code: type }, greeks: { implied_volatility: value, gamma: .02 } });
const noIvFetch = () => assert.fail('외부 호출 금지');
const calculateProbeIv = rows => calculateIv(rows.map(c => ({ ...c, k: c.details.strike_price, type: c.details.contract_type })),
    '2026-10-23', [], noIvFetch, true, '2026-10-20');

test('관문 P1: 10/21 실시간 IV 31은 실제 관측 시각을 축약 후에도 보존하고 10/20 OI 날짜로 바뀌지 않는다', async () => {
    for (const lambda of [true, false]) {
        const rows = await adaptedChain(lambda, [rtRow('call'), rtRow('put')]);
        const captured = new Date(now).toISOString();
        // 프로브 저장·구조 계산이 나중에 일어나도 IV를 받은 시각으로 남아야 한다.
        const savedNow = now;
        try {
            now += 86400000;
            for (const input of [rows, rows.map(slimContract)]) {
                const result = await calculateProbeIv(input);
                assert.equal(result.atmIv, 31);
                assert.equal(result.ivSourceDate, '2026-10-21');
                assert.equal(result.ivObservedAt, captured);
                const selected = iv.commandUnifiedIv('IBM', { structure: { atmIV: result.atmIv / 100, ...result } });
                assert.equal(selected.iv, 31); assert.equal(selected.sourceDate, '2026-10-21');
            }
        } finally { now = savedNow; }
    }
});

test('관문 P2: 제외된 8/28 다리가 신선한 콜·풋 IV와 그 날짜를 무효화하지 않는다', async () => {
    for (const type of ['call', 'put']) for (const staleIv of [.90, .40, .10]) {
        const opposite = type === 'call' ? 'put' : 'call';
        const fresh = { ...contract(type, '2026-10-20'), _rtGreeks: true, ivObservedAt: '2026-10-21T15:00:00Z' };
        const result = await calculateIv([fresh, contract(opposite, '2026-08-28', staleIv)], '2026-10-23', [], noIvFetch);
        assert.equal(result.atmIv, 31); assert.equal(result.ivSourceDate, '2026-10-21');
        assert.equal(result.ivObservedAt, '2026-10-21T15:00:00.000Z');
        const selected = iv.commandUnifiedIv('IBM', { structure: { atmIV: result.atmIv / 100, ...result } });
        assert.equal(selected.iv, 31); assert.equal(selected.sourceDate, '2026-10-21');
    }
});

test('동일 날짜 스프레드 방어도 실제 선택 다리의 시각만 보존한다', async () => {
    const rows = [
        { ...contract('call', null), ivObservedAt: '2026-10-21T15:00:00Z' },
        { ...contract('put', null, .90), ivObservedAt: '2026-10-21T15:01:00Z' },
    ];
    const result = await calculateIv(rows, '2026-10-23', [], noIvFetch);
    assert.equal(result.atmIv, 31); assert.equal(result.ivObservedAt, '2026-10-21T15:00:00.000Z');
});

test('계약별 실시간/EOD 혼합: IV 누락·실시간 감마만 존재·페이지 분할·원천 날짜 없는 옛 프로브', async () => {
    for (const lambda of [true, false]) {
        for (const rt of [[], [rtRow('call')], [rtRow('call', null), rtRow('put', null)], [[rtRow('call')], [rtRow('put')]]]) {
            const rows = (await adaptedChain(lambda, rt)).map(slimContract);
            const result = await calculateProbeIv(rows);
            const live = rt.flat().some(c => c.greeks.implied_volatility === .31);
            assert.equal(result.atmIv, live ? 31 : 24);
            assert.equal(result.ivSourceDate, live ? '2026-10-21' : '2026-10-20');
            assert.equal(result.ivObservedAt, live ? new Date(now).toISOString() : null);
        }
    }
    const legacy = ['call', 'put'].map(type => ({ details: { strike_price: 100, contract_type: type }, implied_volatility: .31 }));
    const unknown = await calculateProbeIv(legacy);
    assert.equal(unknown.ivSourceDate, null);
    assert.equal(iv.commandUnifiedIv('IBM', { structure: { atmIV: .31, ...unknown } }), null);
});

test('실시간 관측일은 ET 자정으로 구분하고 중복 계약 중 신선한 IV를 빠뜨리지 않는다', async () => {
    const savedNow = now;
    try {
        for (const [at, date] of [['2026-10-22T00:30:00Z', '2026-10-21'], ['2026-10-22T04:01:00Z', '2026-10-22']]) {
            now = Date.parse(at);
            for (const lambda of [true, false]) {
                const rows = (await adaptedChain(lambda, [rtRow('call'), rtRow('put')])).map(slimContract);
                const result = await calculateProbeIv(rows);
                assert.equal(result.atmIv, 31); assert.equal(result.ivSourceDate, date);
                assert.equal(result.ivObservedAt, new Date(now).toISOString());
            }
        }
    } finally { now = savedNow; }
    const result = await calculateIv([contract('call', '2026-08-28', .90), contract('call', '2026-10-21'),
        contract('put', '2026-08-28', .90)], '2026-10-23', [], noIvFetch);
    assert.equal(result.atmIv, 31); assert.equal(result.ivSourceDate, '2026-10-21');
    const stale = await calculateIv([contract('call', '2026-08-28')], '2026-10-23', [], noIvFetch);
    assert.equal(stale.atmIv, null); assert.equal(stale.ivSourceDate, null);
});

test('공유 벤더 캐시를 ET 자정 너머 다시 읽어도 IV의 최초 관측일·시각은 유지한다', async () => {
    const savedNow = now;
    try {
        now = Date.parse('2026-10-22T03:59:50Z');
        const rows = await adaptedChain(false, [rtRow('call'), rtRow('put')], '2026-10-20', { revisitAt: '2026-10-22T04:00:10Z' });
        const result = await calculateProbeIv(rows.map(slimContract));
        assert.equal(result.atmIv, 31); assert.equal(result.ivSourceDate, '2026-10-21');
        assert.equal(result.ivObservedAt, '2026-10-22T03:59:50.000Z');
        const legacy = await adaptedChain(false, [rtRow('call'), rtRow('put')], '2026-10-20', { legacyCache: true });
        const unknown = await calculateProbeIv(legacy.map(slimContract));
        assert.equal(unknown.atmIv, null); assert.equal(unknown.ivSourceDate, null);
    } finally { now = savedNow; }
});

test('NVDA·TSLA·AAPL 정상 합성 응답: 값·날짜·직렬화 바이트 불변', () => {
    for (const ticker of ['NVDA', 'TSLA', 'AAPL']) {
        const m = metrics.optionMetrics({ netGex: 1e8, squeezeScore: 20, squeezeRisk: 'MEDIUM' }, null, now);
        const structure = { netGex: 1e8, gex: 1e8, gexM: 100, pcr: null, pcRatio: null, gammaRegime: 'LONG_GAMMA',
            squeezeScore: 20, squeezeRisk: 'MEDIUM', pcrBasis: 'oi_all_expiries_35d', gammaConcentration: 12, gammaConcentrationLabel: 'LOOSE',
            atmIv: 31, atmIV: .31, ivSourceDate: '2026-10-21', ivObservedAt: null };
        const data = { ticker, structure, options: { pcr: null }, squeeze: { riskScore: 20, status: 'MEDIUM' }, volatility: {
            gex: 1e8, gexLabel: 'LONG', gammaRegime: 'LONG', pcr: null, squeezeScore: 20, squeezeRisk: 'MEDIUM',
            gammaConcentration: 12, gammaConcentrationLabel: 'LOOSE', iv: 31, ivSourceDate: '2026-10-21', ivObservedAt: null } };
        const before = JSON.stringify(data);
        metrics.applyUnifiedOptionMetrics(data, m, metrics.optionRegimeInputs(structure));
        assert.equal(JSON.stringify(data), before, ticker);
        assert.equal(JSON.stringify(iv.commandUnifiedIv(ticker, data)), JSON.stringify({ ticker, iv: 31, sourceDate: '2026-10-21', dateKind: 'session', restored: false }));
        assert.equal(JSON.stringify(iv.commandBatchIv(ticker, { ticker, realtime: { iv: 31, ivSourceDate: '2026-10-21' } })),
            JSON.stringify(iv.commandUnifiedIv(ticker, data)));
    }
});

test('누락 관측·누락 종목 입력은 날짜 접근 없이 결측으로 남는다', () => {
    assert.equal(iv.retainCommandIv(null, null, undefined), null);
    assert.equal(iv.retainCommandIv(null, null, 'IBM'), null);
});

test('4차: 두 다리의 관측 시각이 1초 달라도 최신 IV 41이 이전 보관 IV 31을 대체한다(표시·상태 모두)', async () => {
    const legs = [
        { ...contract('call', null, .40), ivObservedAt: '2026-10-21T15:30:00Z' },
        { ...contract('put', null, .42), ivObservedAt: '2026-10-21T15:30:01Z' },
    ];
    const result = await calculateIv(legs, '2026-10-23', [], noIvFetch);
    assert.equal(result.atmIv, 41); assert.equal(result.ivSourceDate, '2026-10-21');
    assert.equal(result.ivObservedAt, '2026-10-21T15:30:00.000Z', '가장 이른 다리 시각');
    const h = harness('IBM');
    await h.respond({ iv: 31, ivObservedAt: '2026-10-21T15:00:00Z' });
    assert.equal(h.state.iv, 31);
    h.unified = { structure: { atmIV: result.atmIv / 100, ...result } };
    assert.equal(signals(h.data, h.store, 'IBM').iv, 41);
    await h.respond(undefined);
    assert.equal(h.state.iv, 41);
    // 한 다리라도 시각이 없으면 시각은 비우고, 같은 날짜의 새 응답은 동률로 채택된다.
    const mixed = await calculateIv([legs[0], { ...contract('put', '2026-10-21', .42), _rtGreeks: false }], '2026-10-23', [], noIvFetch);
    assert.equal(mixed.ivObservedAt, null); assert.equal(mixed.ivSourceDate, '2026-10-21');
    const prev = iv.commandUnifiedIv('IBM', { volatility: { iv: 31, ivObservedAt: '2026-10-21T15:00:00Z' } });
    const next = iv.commandUnifiedIv('IBM', { structure: { atmIV: mixed.atmIv / 100, ...mixed } });
    assert.equal(iv.retainCommandIv(prev, next, 'IBM').iv, mixed.atmIv);
    // 더 이른 날짜는 시각이 없어도 밀린다.
    const older = iv.commandUnifiedIv('IBM', { volatility: { iv: 55, ivSourceDate: '2026-10-20' } });
    assert.equal(iv.retainCommandIv(prev, older, 'IBM').iv, 31);
});
