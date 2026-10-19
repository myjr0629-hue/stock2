/** Offline B5 regression: run with node --test tests/b5MetricDefinitions.test.cjs.
 * A closed module loader allows only local TypeScript and explicitly mocked I/O. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const NOW = Date.parse('2026-10-19T15:00:00Z');
const jsCache = new Map();
function harness(mocks = {}, extra = {}) {
    const modules = new Map();
    function load(file) {
        file = path.resolve(root, file);
        if (!file.endsWith('.ts')) file += '.ts';
        assert.ok(file.startsWith(path.join(root, 'src') + path.sep), 'local source only');
        if (modules.has(file)) return modules.get(file).exports;
        const mod = { exports: {} };
        modules.set(file, mod);
        if (!jsCache.has(file)) jsCache.set(file, ts.transpileModule(fs.readFileSync(file, 'utf8'), {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
        }).outputText);
        const requireClosed = id => {
            if (Object.hasOwn(mocks, id)) return mocks[id];
            if (id.startsWith('@/')) return load(path.join(root, 'src', id.slice(2)));
            if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id));
            throw new Error(`Unexpected external module: ${id}`);
        };
        class FixedDate extends Date {
            constructor(...args) { super(...(args.length ? args : [NOW])); }
            static now() { return NOW; }
        }
        vm.runInNewContext(jsCache.get(file), { exports: mod.exports, module: mod, require: requireClosed,
            Date: FixedDate, process: { env: {} }, AbortController, setTimeout, clearTimeout,
            console: { log() {}, warn() {}, error() {} },
            fetch: async () => { throw new Error('Unexpected network access'); }, ...extra,
        }, { filename: file });
        return mod.exports;
    }
    return load;
}
const load = harness();
const opi = load('src/lib/metrics/opi').opi;
const squeeze = load('src/lib/metrics/squeeze').squeeze;
const risk = load('src/lib/metrics/marketRisk').marketRisk;
const conviction = load('src/lib/metrics/conviction').conviction;
const alpha = load('src/lib/metrics/alpha').portfolioAlpha;
const pnl = load('src/lib/metrics/portfolioPnl').portfolioPnl;
const notional = load('src/lib/metrics/optionNotional').optionNotional;
const premium = load('src/lib/metrics/optionPremium').optionPremium;
const uoa = load('src/lib/metrics/uoa').uoa;
const whale = load('src/lib/metrics/whaleNetBet').whaleNetBet;
const proxy = load('src/lib/metrics/proxy');
const probability = load('src/lib/metrics/probability');
const regime = load('src/lib/metrics/volatilityRegime').computeVolatilityRegime;
const breadth = load('src/lib/metrics/indexBreadth').indexBreadth;
const plain = v => JSON.parse(JSON.stringify(v));
const fullRegime = { netGex: -100e6, gammaFlipLevel: 100, underlyingPrice: 102,
    squeezeScore: 40, squeezeRisk: 'HIGH', atmIv: 40, gammaConcentration: 60 };
const fullSqueeze = { netGex: -350e6, gammaConcentration: 70, nearestDte: 0, atmIvPct: 60, weeklyOiPutCallRatio: .4 };
const fullRisk = { futuresAvg: 0, cashAvg: 0, breadthPct: 50, fearGreed: 50, vixChangePct: 0 };
const fullConviction = { smaCross: 'NEUTRAL', vwapDistancePct: 0, oiPutCallRatio: 1, netGex: 0, netPremiumUsd: 0 };

test('all required score inputs: absent, null, non-finite and string are missing; real zero survives', () => {
    for (const [fn, full] of [[risk, fullRisk], [squeeze, fullSqueeze], [conviction, fullConviction]]) {
        assert.equal(fn(full).status, 'available');
        for (const key of Object.keys(full)) for (const bad of [undefined, null, NaN, Infinity, -Infinity, '0']) {
            const result = fn({ ...full, [key]: bad });
            assert.equal(result.value, null, `${fn.name}.${key}=${bad}`);
            assert.ok(result.coverage.missing.includes(key));
        }
    }
    assert.equal(risk({}).value, null);
    assert.equal(conviction({}).value, null);
    assert.equal(risk(fullRisk).value, 50, 'neutral is valid only with measured inputs');
    assert.equal(conviction(fullConviction).value, 50);
    assert.equal(squeeze(fullSqueeze).value, 100);
    assert.equal(conviction({ ...fullConviction, oiPutCallRatio: 0 }).value, 57);
});

test('OPI requires the stated 35-day OI basis, and is not a probability', () => {
    assert.equal(opi({ oiPutCallRatio: 1, basis: 'oi_all_expiries_35d' }).value, 50);
    assert.equal(opi({ oiPutCallRatio: 0, basis: 'oi_all_expiries_35d' }).value, 95);
    assert.equal(opi({ oiPutCallRatio: 1, basis: 'weekly_volume' }).value, null);
    assert.equal(opi({ oiPutCallRatio: 1 }).value, null);
    assert.equal(opi({}).kind, 'score');
    assert.equal(squeeze(fullSqueeze).kind, 'score');
});

test('regime rejects every partial input, including absent flip formerly earning 15 points', () => {
    assert.equal(regime({}).regimeScore, null);
    assert.equal(regime({}).flipDistance, null);
    for (const key of ['netGex', 'gammaFlipLevel', 'underlyingPrice', 'squeezeScore', 'atmIv', 'gammaConcentration']) {
        for (const value of [undefined, null, NaN, Infinity, '0']) {
            const result = regime({ ...fullRegime, [key]: value });
            assert.equal(result.regimeScore, null, key);
            assert.equal(result.regime, null, key);
        }
    }
    assert.equal(regime({ ...fullRegime, netGex: 0, squeezeScore: 0, gammaConcentration: 0 }).regimeScore, 22);
    assert.equal(regime(fullRegime).regimeScore, 58);
    assert.equal(regime(fullRegime).squeezeRisk, 'MEDIUM', 'status derives from score, not stale status');
    assert.equal(regime({ ...fullRegime, atmIv: 129.8 }).iv, 129.8);
    assert.deepEqual(plain(regime(fullRegime)), plain(regime({ ...fullRegime })), 'pure deterministic result');
});

test('regime complete-input arithmetic retains original thresholds before rounding', () => {
    const result = regime({ netGex: 0, gammaFlipLevel: 100, underlyingPrice: 120,
        squeezeScore: 98.4, atmIv: 20, gammaConcentration: 0 });
    assert.equal(result.regimeScore, 25);
    assert.equal(result.regime, 'CALM', '24.6 is CALM even when display rounds to 25');
});

test('notional, premium, call share and UOA keep units and denominators separate', () => {
    const n = notional({ openingContracts: 2, strikePriceUsd: 100, contractMultiplier: 100 });
    const p = premium({ callPremiumUsd: 400, putPremiumUsd: 100 });
    assert.equal(n.value, 20_000);
    assert.equal(n.unit, 'USD_notional');
    assert.equal(p.value.netUsd, 300);
    assert.equal(p.value.totalUsd, 500);
    assert.equal(p.value.callSharePct, 80);
    assert.equal(p.unit, 'USD_premium');
    assert.equal(premium({ callPremiumUsd: 0, putPremiumUsd: 0 }).value.callSharePct, null);
    assert.equal(premium({ callPremiumUsd: 100 }).value, null);
    assert.equal(notional({ openingContracts: 2, strikePriceUsd: 100 }).value, null);
    assert.equal(uoa({ volumeContracts: 100, openInterestContracts: 0 }).value, null);
    assert.equal(uoa({ volumeContracts: 0, openInterestContracts: 10 }).value, 0);
    assert.equal(uoa({ volumeContracts: 100, openInterestContracts: 10 }).value, 10);
});

test('whale equity notional never falls back to option premium; proxy is never an observed index', () => {
    assert.equal(whale({ netPremium: 100e6 }).value, null);
    assert.equal(whale({ netBuyUsd: 0, basis: 'option_premium', sourceSessionDate: '2026-10-16' }).value, null);
    assert.equal(whale({ netBuyUsd: 0, basis: 'equity_dark_pool_signed_notional', sourceSessionDate: '2026-10-16' }).value, 0);
    const p = proxy.spyIndexProxy(600);
    assert.equal(p.value, null);
    assert.equal(p.observedValue, null);
    assert.equal(p.proxyValue, 6000);
    assert.equal(p.status, 'proxy');
    assert.equal(p.proxy.multiplier, 10);
    assert.equal(proxy.spyIndexProxy(null).status, 'missing');
    assert.equal(proxy.ivPercent(1.298, 'decimal').value, 129.8);
    assert.equal(proxy.ivPercent(1.298, 'percent').value, 1.298);
});

test('portfolio P&L uses price difference, alpha uses complete value weights and preserves zero', () => {
    const result = pnl({ currentPriceUsd: 110, referenceCloseUsd: 100, averageCostUsd: 90, quantity: 1 });
    assert.equal(result.today.value, 10, 'old expression incorrectly returned 11');
    assert.equal(result.total.value, 20);
    assert.equal(pnl({ currentPriceUsd: 110, quantity: 1 }).today.value, null);
    assert.equal(pnl({ currentPriceUsd: 90, referenceCloseUsd: 100, quantity: 2 }).today.value, -20);
    assert.equal(alpha([{ alphaScore: 0, marketValue: 100 }, { alphaScore: 100, marketValue: 300 }]).value, 75);
    assert.equal(alpha([{ marketValue: 100 }, { alphaScore: 100, marketValue: 300 }]).value, null);
    assert.equal(alpha([{ alphaScore: 80, marketValue: 0 }]).value, null);
    assert.equal(alpha([]).value, null);
});

test('probability has trial evidence; changes use percentage points', () => {
    assert.equal(probability.observedProbability({ successes: 3, trials: 4, period: '2026-Q3' }).value, 75);
    assert.equal(probability.observedProbability({ successes: 3, trials: 0, period: '2026-Q3' }).value, null);
    const delta = probability.probabilityChange({ currentPct: 60, previousPct: 50, period: 'one_week' });
    assert.equal(delta.value, 10);
    assert.equal(delta.unit, 'percentage_point');
    assert.equal(probability.probabilityChange({ currentPct: 60, period: 'one_week' }).value, null);
});

const dates = Array.from({ length: 20 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
const closes = Array.from({ length: 20 }, (_, i) => i + 1);
test('SMA20 breadth requires twenty aligned closes and preserves the actual covered denominator', () => {
    const result = breadth(['A', 'B', 'C'], { dates, closes: { A: closes, B: [...closes].reverse(), C: closes.slice(0, 10) } });
    assert.equal(result.pctAbove20, .5);
    assert.equal(result.covered, 2);
    assert.equal(result.metric.denominator, 'covered_constituents');
    assert.equal(result.metric.coverage.minimum, .5);
    assert.equal(breadth(['A', 'B', 'C'], { dates, closes: { A: closes } }).pctAbove20, null);
    assert.equal(breadth(['A'], { dates: dates.slice(0, 10), closes: { A: closes.slice(0, 10) } }).pctAbove20, null);
    assert.equal(breadth(['A'], { dates, closes: { A: [...closes.slice(0, 19), null] } }).pctAbove20, null);
    assert.equal(breadth(['A'], { dates, closes: { A: Array(20).fill(10) } }).pctAbove20, 0);
});

test('index breadth service delegates the same history to the pure metric with no external I/O', async () => {
    const history = { dates, closes: { A: closes, B: [...closes].reverse() } };
    const isolated = harness({}, { fetch: async () => ({ ok: true, json: async () => ({ result: history }) }) });
    const actual = await isolated('src/services/indexBreadth').computeIndexBreadth(['A', 'B']);
    assert.deepEqual(plain(actual), plain(breadth(['A', 'B'], history)));
});

test('gamma shield marks SPY-derived price fields as proxy on fresh and memory-cache responses', async () => {
    const isolated = harness({
        '../structureService': { getStructureData: async ticker => ({ ...fullRegime, underlyingPrice: ticker === 'SPY' ? 600 : 500,
            levels: { callWall: 610, putFloor: 590 }, gammaFlipLevel: 595 }) },
        '@upstash/redis': { Redis: class { constructor() { throw new Error('Unexpected Redis access'); } } },
    });
    const engine = isolated('src/services/guardian/gammaShieldEngine');
    const fresh = await engine.calculateGammaShield();
    assert.equal(fresh.currentPrice, 6000, 'compatibility scalar retains existing scale');
    assert.equal(fresh.priceBasis.status, 'proxy');
    assert.equal(fresh.priceBasis.observedTarget, false);
    assert.equal(fresh.priceBasis.source, 'SPY');
    assert.equal((await engine.getGammaShield()).priceBasis.status, 'proxy');
});

test('dealer gamma uses shared rank and flip denominator; missing rank samples stay null', async () => {
    const points = Array.from({ length: 11 }, (_, i) => ({ date: dates[i], gex: -10 + i, price: 100 }));
    points[10].gex = -1;
    const isolated = harness({}, { fetch: async () => ({ ok: true, json: async () => ({ result: { points } }) }) });
    const result = await isolated('src/services/dealerGamma').getDealerGamma('SPY', 100, 103.04);
    assert.equal(result.samples, 10);
    assert.equal(result.percentile, 100);
    assert.equal(result.flipDistancePct, 3);
    assert.equal(result.unstable, true, 'spot denominator places 3.04/103.04 inside 3%');
    assert.equal(result.metrics.flipDistance.denominator, 'spot_price_USD');
    assert.equal((await isolated('src/services/dealerGamma').getDealerGamma('SPY', 100, 103.1)).unstable, false, '3.006% rounded to 3.0% must remain outside');
    points.splice(0, 1);
    assert.equal((await isolated('src/services/dealerGamma').getDealerGamma('SPY')).percentile, null);
});

test('Guardian AI percentile caller does not pass index proxy points as SPY share prices', () => {
    const source = fs.readFileSync(path.join(root, 'src/services/guardian/unifiedDataStream.ts'), 'utf8');
    const ast = ts.createSourceFile('unified.ts', source, ts.ScriptTarget.Latest, true);
    const calls = [];
    function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(ast) === 'getDealerGamma') calls.push(node);
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].arguments.length, 1, 'only percentile needed, no price/flip proxy inputs');
    assert.equal(calls[0].arguments[0].getText(ast), "'SPY'");
});

function routeHarness(structure, now = NOW) {
    const mocks = {
        'next/server': { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, json: async () => plain(body) }) } },
        '@/services/structureService': { getStructureData: async () => structure },
        '@/services/redisClient': { getFromCache: async () => null, setInCache: async () => true },
        '@/services/guardian/unifiedDataStream': { GuardianDataHub: { getGuardianSnapshot: async () => null } },
        '@/services/institutionalFlow': { getInstitutionalFlowSummary: async () => null },
        '@/services/indexBreadth': { getIndexBreadth: async () => null },
        '@/services/dealerGamma': { getDealerGamma: async () => null },
    };
    class RouteDate extends Date { static now() { return now; } }
    return harness(mocks, { Date: RouteDate });
}
test('both real GET routes return identical canonical metrics across PRE/REG/POST/holiday/weekend', async () => {
    const full = { ...fullRegime, ticker: 'SPY', options_status: 'OK', expiration: '2026-11-27', gammaFlipType: 'EXACT' };
    for (const time of ['2026-10-19T12:00:00Z', '2026-10-19T15:00:00Z', '2026-10-19T22:00:00Z',
        '2026-10-18T00:00:00Z', '2026-11-26T12:00:00Z']) {
        for (const structure of [full, { ...full, gammaFlipLevel: null }, { ...full, atmIv: null }, null]) {
            const isolated = routeHarness(structure, Date.parse(time));
            const req = { nextUrl: new URL('http://offline.test/api?t=SPY&locale=ko') };
            const direct = await (await isolated('src/app/api/live/volatility-regime/route').GET(req)).json();
            const premium = await (await isolated('src/app/api/live/premium-metrics/route').GET(req)).json();
            assert.equal(premium.success, true);
            assert.equal(direct.regimeScore, premium.volatilityRegime.score);
            assert.equal(direct.regime, premium.volatilityRegime.regime);
            if (structure) assert.deepEqual(direct.metric, premium.volatilityRegime.metric);
            if (structure === full) assert.equal(direct.regimeScore, 58);
            else assert.equal(direct.regimeScore, null);
        }
    }
});


// Execute the actual consumer expressions/route declarations, without mounting a browser
// or importing server I/O. Missing dependencies fail closed in the module harness above.
function ast(file) {
    return ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function findNode(file, predicate) {
    const source = ast(file);
    let found;
    function visit(n) { if (!found && predicate(n)) found = n; if (!found) ts.forEachChild(n, visit); }
    visit(source);
    assert.ok(found, `missing code in ${file}`);
    return { source, node: found };
}
function evaluate(code, context) {
    const js = ts.transpileModule(`const actual = ${code};`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    return vm.runInNewContext('(function() {' + js + '\nreturn actual;})()', context);
}
function variable(file, name, context) {
    const { source, node } = findNode(file, n => ts.isVariableDeclaration(n) && n.name.getText() === name);
    return evaluate(node.initializer.getText(source), context);
}
const unifiedRegime = load('src/lib/metrics/volatilityRegime').computeUnifiedVolatilityRegime;
const { resolveCommandVolatilityObservation, isCommandResponseUnavailable, formatObservationTime } = load('src/lib/commandVolatilityObservation');
const { selectObservation, compareSourceTime } = load('src/lib/metrics/observation');
const runMemo = fn => fn();
const desktopFile = 'src/components/LiveTickerDashboard.tsx';
function desktopObservation(u, extra = {}) {
    return variable(desktopFile, 'volatilityObservation', {
        React: { useMemo: runMemo }, resolveCommandVolatilityObservation,
        ticker: 'SPY', unifiedData: u, initialUnifiedData: null,
        lastVolatilityObservation: extra.structure ? resolveCommandVolatilityObservation('SPY', {
            structure: extra.structure, volatility: extra.volatilityData,
        }) : null, ...extra,
    });
}
const desktop = (u, extra = {}) => variable(desktopFile, 'effectiveVol', {
    React: { useMemo: runMemo }, computeUnifiedVolatilityRegime: unifiedRegime,
    volatilityObservation: desktopObservation(u, extra),
});

test('web keeps 58/LOADED after unified error or unavailable instead of treating failure as missing', () => {
    const previous = { structure: fullRegime, volatilityData: regime(fullRegime) };
    for (const failed of [{ error: 'Failed to fetch unified data' }, {
        _source: 'unavailable', _isPartial: true, structure: null, volatility: null, timestamp: NOW,
    }]) {
        const actual = desktop(failed, previous);
        assert.equal(actual.regimeScore, 58);
        assert.equal(actual.regime, 'LOADED');
    }
});

test('real web observation effect keeps the edition and source time through repeated failed polls', () => {
    const good = { structure: { ...fullRegime, levelsAsOf: NOW - 86400000 },
        volatility: regime(fullRegime), timestamp: NOW, _asOf: new Date(NOW).toISOString() };
    const { source, node } = findNode(desktopFile, n => ts.isCallExpression(n)
        && n.expression.getText() === 'useEffect' && n.arguments[0]?.getText().includes('setLastVolatilityObservation'));
    let state = null;
    for (const unifiedData of [good, { error: 'Failed to fetch unified data' }, null,
        { _source: 'unavailable', structure: null, volatility: null, timestamp: NOW + 999999 },
        { _source: 'unavailable', structure: { ...fullRegime, netGex: 0 }, volatility: regime({}) },
        { earnings: {} }]) {
        const observation = desktopObservation(unifiedData, { lastVolatilityObservation: state });
        assert.equal(unifiedRegime(observation.data).regimeScore, 58);
        assert.equal(observation.sourceAsOf, new Date(NOW - 86400000).toISOString());
        evaluate(node.getText(source), {
            ticker: 'SPY', unifiedData, initialUnifiedData: null, resolveCommandVolatilityObservation,
            useEffect: runMemo, setLastVolatilityObservation: update => { state = update(state); },
        });
        assert.deepEqual(plain(state), plain(observation));
    }
    const { source: cardSource, node: time } = findNode(desktopFile,
        n => ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'time');
    const text = time.children.find(n => ts.isJsxExpression(n) && n.expression).expression.getText(cardSource);
    const before = evaluate(text, { volatilityObservation: state, formatObservationTime });
    assert.match(before, /10\/18.*11:00.*ET/);
    const dateTime = time.openingElement.attributes.properties.find(n => n.name?.getText() === 'dateTime');
    assert.equal(evaluate(dateTime.initializer.expression.getText(cardSource), { volatilityObservation: state }), state.sourceAsOf);
});

test('shared rule: missing keeps the previous real edition with its own date; never mixes editions; later success recovers', () => {
    const dayAgo = new Date(NOW - 86400000).toISOString();
    const good = { structure: { ...fullRegime, levelsAsOf: NOW - 86400000 }, volatility: regime(fullRegime) };
    const previous = resolveCommandVolatilityObservation('SPY', good);
    assert.equal(previous.carried, false);
    for (const observation of [{ structure: null, volatility: null },
        { structure: { ...fullRegime, gammaConcentration: null, levelsAsOf: NOW } },
        { volatility: { iv: 40 } }]) {
        const kept = desktopObservation(observation, { lastVolatilityObservation: previous });
        // The whole previous edition (not single fields) with its own source date — no edition mixing.
        assert.deepEqual(plain(kept.data), plain(previous.data));
        assert.equal(kept.sourceAsOf, dayAgo);
        assert.equal(kept.carried, true);
        assert.equal(unifiedRegime(kept.data).regimeScore, 58);
        assert.equal(desktop({ _source: 'unavailable' }, { lastVolatilityObservation: kept }).regimeScore, 58);
        const back = desktopObservation({ structure: { ...fullRegime, levelsAsOf: NOW } }, { lastVolatilityObservation: kept });
        assert.equal(back.carried, false); assert.equal(back.sourceAsOf, new Date(NOW).toISOString());
    }
    // An undated previous real edition is still kept, but no date is invented for it.
    const undated = resolveCommandVolatilityObservation('SPY', { structure: fullRegime, volatility: regime(fullRegime) });
    assert.equal(undated.sourceAsOf, null);
    const keptUndated = desktopObservation({ structure: { ...fullRegime, gammaConcentration: null } }, { lastVolatilityObservation: undated });
    assert.equal(unifiedRegime(keptUndated.data).regimeScore, 58); assert.equal(keptUndated.sourceAsOf, null); assert.equal(keptUndated.carried, true);
    // Nothing real before: the missing edition stands (— is shown, never a default score).
    assert.equal(desktop({ structure: { ...fullRegime, gammaConcentration: null } }).regimeScore, null);
    // A measured zero is a value and replaces the previous edition.
    const zero = { structure: { ...fullRegime, netGex: 0, squeezeScore: 0, gammaConcentration: 0, levelsAsOf: NOW } };
    assert.equal(desktop(zero, { lastVolatilityObservation: previous }).regimeScore, 22);
    // An older edition arriving late (CDN/cache) never replaces a newer one, even when it has a value.
    const newer = resolveCommandVolatilityObservation('SPY', { structure: { ...fullRegime, netGex: -1e9, levelsAsOf: NOW } });
    const stale = desktopObservation(good, { lastVolatilityObservation: newer });
    assert.equal(stale.sourceAsOf, new Date(NOW).toISOString());
    assert.equal(unifiedRegime(stale.data).regimeScore, regime({ ...fullRegime, netGex: -1e9 }).regimeScore);
    assert.equal(desktop({ error: 'failed' }, { ticker: 'QQQ', lastVolatilityObservation: previous }).regimeScore, null);
    assert.equal(desktopObservation({ error: 'failed' }), null);
    assert.equal(desktop(null, { initialUnifiedData: good }).regimeScore, 58);
    assert.equal(resolveCommandVolatilityObservation('SPY', { structure: { ...fullRegime, _ts: NOW },
        volatility: { ...regime(fullRegime), _ts: NOW }, timestamp: NOW, _asOf: new Date(NOW).toISOString() }).sourceAsOf, null);
    assert.equal(resolveCommandVolatilityObservation('SPY', { structure: { ...fullRegime, chainDate: '2026-10-16' } }).sourceAsOf, '2026-10-16');
    assert.equal(resolveCommandVolatilityObservation('SPY', { structure: { ...fullRegime, chainDate: '2026-10-16', levelsAsOf: NOW } }).sourceAsOf, '2026-10-16');
    // Day precision orders only calendar days.
    assert.equal(compareSourceTime('2026-10-16', '2026-10-16T20:00:00.000Z'), 0);
    assert.equal(compareSourceTime('2026-10-15', '2026-10-16T20:00:00.000Z'), -1);
    assert.equal(compareSourceTime(null, '2026-10-16'), null);
    assert.equal(selectObservation(null, null, () => true), null);
});

test('app Command and AI snapshot use the same selected edition as web/mobile (failed poll, missing, carried date)', () => {
    const good = { structure: { ...fullRegime, levelsAsOf: NOW - 86400000 }, volatility: regime(fullRegime) };
    // Production fetch code: the ref update right after lastUnified.current = u.
    const { source, node } = findNode('src/app/[locale]/app-view/cmd/page.tsx', n => ts.isExpressionStatement(n)
        && n.getText().startsWith('lastVolObservation.current = resolveCommandVolatilityObservation('));
    const ref = { current: null };
    const step = u => evaluate(`(() => { ${node.getText(source)}; return lastVolObservation.current; })()`,
        { lastVolObservation: ref, resolveCommandVolatilityObservation, ticker: 'SPY', u });
    const app = obs => variable('src/app/[locale]/app-view/cmd/page.tsx', 'signalsData', {
        useMemo: runMemo, data: { ticker: 'SPY', unified: { error: 'x' }, price: 999, volatilityObservation: obs }, iv30Level: null,
        computeUnifiedVolatilityRegime: unifiedRegime, resolveCommandVolatilityObservation, tDashboard: s => s,
        ...load('src/lib/vwap'), ...load('src/lib/premiumFlow'), ...load('src/lib/commandConviction'),
    });
    const ai = obs => load('src/lib/ai/deepSnapshot').buildDeepSnapshot({
        ticker: 'SPY', price: 999, priceChange: 0, session: 'REG', unified: { error: 'x' }, volatilityData: obs?.data ?? null,
        rawTickerData: null, insider: null, technicals: null, creditSpread: null,
    }).volatility;
    for (const [u, carried] of [[good, false], [{ error: 'Failed' }, true], [{ _source: 'unavailable', structure: null }, true],
        [{ structure: { ...fullRegime, squeezeScore: null, levelsAsOf: NOW } }, true]]) {
        const obs = step(u);
        const web = desktop(u, { lastVolatilityObservation: obs });
        for (const actual of [app(obs), ai(obs), mobile(obs.data), web]) {
            assert.equal(actual.regimeScore, 58); assert.equal(actual.regime, 'LOADED');
        }
        assert.equal(app(obs).volCarriedAsOf, carried ? new Date(NOW - 86400000).toISOString() : null);
    }
    // Same ticker: the AI keeps its previous real regime (shared rule 3); a ticker with no history stays missing.
    assert.equal(ai(null).regimeScore, 58);
    assert.equal(load('src/lib/ai/deepSnapshot').buildDeepSnapshot({ ticker: 'NEVER', price: 999, priceChange: 0, session: 'REG',
        unified: { error: 'x' }, volatilityData: null, rawTickerData: null, insider: null, technicals: null, creditSpread: null }).volatility.regimeScore, null);
    assert.equal(app(null).regimeScore, null);
});

test('real unified HTTP fetcher ignores non-2xx bodies and accepts successful observations', async () => {
    const { source, node } = findNode(desktopFile, n => ts.isCallExpression(n)
        && n.expression.getText() === 'useSWR' && n.arguments[0]?.getText().includes('/api/command/unified'));
    const good = { structure: fullRegime, volatility: regime(fullRegime) };
    for (const status of [200, 500, 503]) {
        let parsed = false;
        const fetcher = evaluate(node.arguments[1].getText(source), {
            fetch: async () => ({ ok: status === 200, json: async () => { parsed = true; return good; } }),
        });
        assert.equal(await fetcher('http://offline.test'), status === 200 ? good : null);
        assert.equal(parsed, status === 200);
    }
    assert.equal(isCommandResponseUnavailable({ error: 'failed' }), true);
    assert.equal(isCommandResponseUnavailable({ _source: 'unavailable' }), true);
    assert.equal(isCommandResponseUnavailable(good), false);
});
const mobile = (u, volatilityData) => variable('src/components/intel/mobile/MobileCmdMetrics.tsx', 'effectiveVol', {
    useMemo: runMemo, unified: u, volatilityData, computeUnifiedVolatilityRegime: unifiedRegime,
});
const appSignals = u => variable('src/app/[locale]/app-view/cmd/page.tsx', 'signalsData', {
    useMemo: runMemo, data: { unified: u, price: 999 }, iv30Level: null,
    computeUnifiedVolatilityRegime: unifiedRegime, resolveCommandVolatilityObservation, tDashboard: s => s,
    ...load('src/lib/vwap'), ...load('src/lib/premiumFlow'), ...load('src/lib/commandConviction'),
});
// A fresh ticker per call: the AI material keeps per-ticker last-good values (shared rule 3), so
// independent cases must not inherit each other's history.
let aiSeq = 0;
const aiSnapshot = u => load('src/lib/ai/deepSnapshot').buildDeepSnapshot({
    ticker: `SPY${++aiSeq}`, price: 999, priceChange: 0, session: 'REG', unified: u,
    rawTickerData: null, insider: null, technicals: null, creditSpread: null,
});

test('real API/web/app/mobile/SSR/AI consumers: 58, partial inputs null, real zero retained', async () => {
    const full = { ...fullRegime, ticker: 'SPY', options_status: 'OK', expiration: '2026-11-27', gammaFlipType: 'EXACT' };
    for (const structure of [full, ...Object.keys(fullRegime).filter(k => k !== 'squeezeRisk').map(k => ({ ...full, [k]: null })),
        { ...full, netGex: 0, squeezeScore: 0, gammaConcentration: 0 }]) {
        const expected = regime(structure);
        const isolated = routeHarness(structure);
        const api = await (await isolated('src/app/api/live/volatility-regime/route').GET({ nextUrl: new URL('http://offline.test/?t=SPY') })).json();
        // An old cached score must never mask a missing input or override the current edition.
        const u = { structure, volatility: { ...api, regime: 'ERUPTING', regimeScore: 99 } };
        const ssr = variable('src/app/[locale]/ticker/CommandSSRCards.tsx', 'vol', { data: u, computeUnifiedVolatilityRegime: unifiedRegime });
        for (const actual of [api, desktop(u), mobile(u), appSignals(u), ssr, aiSnapshot(u).volatility]) {
            assert.equal(actual.regimeScore, expected.regimeScore);
            assert.equal(actual.regime, expected.regime);
        }
    }
    assert.equal(desktop({ structure: full, volatility: regime(full) }).regimeScore, 58);
    const empty = aiSnapshot(null).volatility;
    assert.equal(empty.regimeScore, null); assert.equal(empty.regime, null);
    const fallback = desktop(null, { structure: full, volatilityData: regime(full) });
    assert.equal(fallback.regimeScore, 58, 'web state fallback uses the same calculator');
    assert.equal(desktop({ structure: null, volatility: regime(full) }).regimeScore, 58, 'volatility-only cache keeps raw metric inputs');
});

test('legacy decimal IV, recovered percent IV and percent IV above 100 share the same units', () => {
    for (const iv of [40, 129.8]) {
        const s = { ...fullRegime, atmIv: undefined, atmIV: iv / 100 };
        assert.equal(unifiedRegime({ structure: s }).regimeScore, regime({ ...fullRegime, atmIv: iv }).regimeScore);
        assert.equal(unifiedRegime({ structure: { ...fullRegime, atmIv: null }, volatility: { iv } }).iv, iv);
    }
});

const commandFile = 'src/app/api/command/unified/route.ts';
function commandHarness({ data, tier = 'memory', dynamoIv = 40, liveIv = 40, overrides = {} } = {}) {
    const calls = [];
    const writes = [];
    const globals = {
        URL, Date, console: { log() {}, warn() {}, error() {} },
        computeUnifiedVolatilityRegime: unifiedRegime,
        // Bounded recovery timers are pending forever in this deterministic mock; the source resolves first.
        setTimeout: () => 0,
        require: id => {
            assert.equal(id, '@/lib/aws/unifiedCacheProvider');
            return { getUnifiedCache: async () => { calls.push('dynamo'); return { volatility: { iv: dynamoIv, regimeScore: 99 } }; } };
        },
        getVolatility: Symbol('volatility'),
        callInternalGet: async () => { calls.push('live'); return { iv: liveIv, regimeScore: 99 }; },
        isMarketHoursNow: () => true,
        overlayFundamentals: async x => x, overlayEarningsDate: async x => x, overlayStructureLevels: async x => x,
        normalizeShape: x => x, stripStaleInstitutional: x => x,
        NextResponse: { json: (body, options) => { calls.push('response'); return { body, ...options }; } },
        CACHE_KEY_PREFIX: 'command:', OVERVIEW_KEY_PREFIX: 'overview:', REFRESH_THRESHOLD_MS: 300000,
        memoryGet: key => key.startsWith('overview:') ? { overview: {} } : tier === 'memory' ? data : null,
        memorySet: (key, value) => writes.push([key, value]),
        getFromCache: async key => key.startsWith('overview:') ? { overview: {} } : data,
        getSmartTTL: () => 60,
        setInCache: async (key, value) => writes.push([key, value]),
        getBaseUrl: () => 'http://offline.test',
        enrichExpiration: async () => {}, injectAlphaBypass: async () => {}, injectEC2Institutional: async () => false,
        isFieldUsable: () => true, after: () => {},
        ...overrides,
    };
    for (const name of ['recoverVolatilityIv', 'jsonResponse', 'GET']) {
        const { source, node } = findNode(commandFile, n => ts.isFunctionDeclaration(n) && n.name?.text === name);
        const declaration = node.getText(source).replace(/^export /, '');
        globals[name] = evaluate(`(function() { ${declaration}; return ${name}; })()`, globals);
    }
    return { ...globals, calls, writes };
}

test('both real Command cache branches recover null/zero/undefined IV before first response and recalculate', async () => {
    for (const tier of ['memory', 'redis']) for (const iv of [null, 0, undefined]) for (const dynamoIv of [40, null]) {
        const data = { timestamp: Date.now(), structure: { ...fullRegime, atmIv: null },
            volatility: { ...regime(fullRegime), iv, regimeScore: 99 }, earnings: { nextEarningsDate: '2026-11-01' } };
        const h = commandHarness({ data, tier, dynamoIv });
        const result = await h.GET({ url: 'http://offline.test/api/command/unified?t=SPY' });
        assert.equal(result.status, 200);
        assert.equal(result.body._source, tier === 'memory' ? 'memory-lru' : 'cache');
        assert.equal(result.body.volatility.iv, 40);
        assert.equal(result.body.volatility.regimeScore, 58);
        assert.deepEqual(h.calls, dynamoIv ? ['dynamo', 'response'] : ['dynamo', 'live', 'response']);
        for (const [, value] of h.writes.filter(([key]) => key === 'v4:SPY')) assert.equal(value.volatility.regimeScore, 58);
    }
});

test('IV recovery failure keeps missing; valid IV performs no recovery I/O', async () => {
    const missing = { structure: { ...fullRegime, atmIv: null }, volatility: { ...regime(fullRegime), iv: null } };
    const h = commandHarness({ dynamoIv: null, liveIv: null });
    const out = await h.jsonResponse(await h.recoverVolatilityIv(missing, 'SPY', 'en', 'http://offline.test'));
    assert.equal(out.body.volatility.regimeScore, null); assert.equal(out.body.volatility.regime, null);
    assert.deepEqual(h.calls, ['dynamo', 'live', 'response']);
    const complete = { structure: fullRegime, volatility: regime(fullRegime) };
    const valid = commandHarness();
    assert.equal(await valid.recoverVolatilityIv(complete, 'SPY', 'en', 'http://offline.test'), complete);
    assert.deepEqual(valid.calls, []);
});

test('gate 3: latest option overlay beats cached metric.inputs; overlay null never revives the cached input', async () => {
    const { applyUnifiedOptionMetrics, optionMetrics } = load('src/lib/optionMetrics');
    const cachedCard = regime(fullRegime);          // metric.inputs: GEX -1e8, squeeze 40 → 58/LOADED
    assert.equal(cachedCard.regimeScore, 58);
    const cases = [
        [{ netGex: -1e9, squeezeScore: 80, squeezeRisk: 'EXTREME' }, regime({ ...fullRegime, netGex: -1e9, squeezeScore: 80 })],
        [{ netGex: null, squeezeScore: null }, { regimeScore: null, regime: null, gex: null, squeezeScore: null }],
        [{ netGex: 0, squeezeScore: 0, squeezeRisk: 'LOW' }, regime({ ...fullRegime, netGex: 0, squeezeScore: 0 })],
    ];
    for (const [latest, expected] of cases) {
        // Real exit overlay order: option metrics are applied, then jsonResponse recomputes.
        const h = commandHarness({ overrides: { overlayStructureLevels: async d => applyUnifiedOptionMetrics(d, optionMetrics(latest, null)) } });
        const body = (await h.jsonResponse({ volatility: { ...cachedCard } }, 200, 'SPY')).body;
        assert.equal(body.volatility.regimeScore, expected.regimeScore, JSON.stringify(latest));
        assert.equal(body.volatility.regime, expected.regime);
        assert.equal(body.volatility.gex, expected.gex);
        assert.equal(body.volatility.squeezeScore, expected.squeezeScore);
        // Every consumer computes from the same response and agrees.
        for (const actual of [desktop(body), mobile(body), appSignals(body), aiSnapshot(body).volatility]) {
            assert.equal(actual.regimeScore, expected.regimeScore);
        }
    }
    // Display rounding of the same observation keeps the unrounded cached input (no score drift).
    const fractional = regime({ ...fullRegime, squeezeScore: 41.6 });
    assert.equal(unifiedRegime({ volatility: fractional }).regimeScore, fractional.regimeScore);
    assert.equal(fractional.squeezeScore, 42);
});

test('105.10 spot / 100 flip: shared raw distance and all responses use spot denominator (4.9%)', async () => {
    const structure = { ...fullRegime, underlyingPrice: 105.10, options_status: 'OK', expiration: '2026-11-27', gammaFlipType: 'EXACT' };
    const shared = load('src/lib/metrics/percentile').flipDistance({ priceUsd: 105.10, flipLevelUsd: 100 });
    assert.ok(Math.abs(shared.value - 5.1 / 105.1 * 100) < 1e-12);
    assert.equal(shared.denominator, 'spot_price_USD');
    const levels = { maxPain: 100, callWall: 110, putFloor: 95, pinZone: null, gammaFlipLevel: 100,
        levelsExpiration: '2026-11-27', levelsChainDate: '2026-10-19', levelsSource: 'structure',
        gammaFlipType: 'EXACT', levelsSpot: 105.10 };
    const gated = load('src/lib/optionLevelGate').applyLevelsToUnified({ structure, volatility: regime(structure) }, levels);
    const h = commandHarness();
    const command = (await h.jsonResponse(gated)).body;
    const isolated = routeHarness(structure);
    const req = { nextUrl: new URL('http://offline.test/?t=SPY') };
    const api = await (await isolated('src/app/api/live/volatility-regime/route').GET(req)).json();
    for (const actual of [api, gated.volatility, command.volatility, desktop(command), mobile(command), appSignals(command)]) {
        assert.equal(actual.flipDistance, 4.9);
    }
    assert.equal(load('src/lib/metrics/percentile').flipDistance({ priceUsd: 0, flipLevelUsd: 100 }).value, null);
});


test('DecisionGate ignores missing regime scores and preserves measured zero', () => {
    const { source, node } = findNode('src/components/DecisionGate.tsx', n => ts.isIfStatement(n)
        && n.expression.getText().includes("typeof volatilityData?.regimeScore === 'number'"));
    for (const [score, count] of [[null, 0], [undefined, 0], [0, 1], [58, 0], [80, 1]]) {
        const signals = [];
        evaluate(`(() => { ${node.getText(source)}; return signals; })()`, {
            isREG: true, volatilityData: { regimeScore: score }, signals, ts: x => x,
        });
        assert.equal(signals.length, count);
    }
    for (const score of [null, undefined, 0, 58]) {
        const compression = variable('src/components/DecisionGate.tsx', 'isCompression', {
            volatilityData: { regimeScore: score }, callWall: 105, putFloor: 95, displayPrice: 100,
        });
        assert.equal(compression, score === 0);
    }
});


test('missing regime is not described as stable by web/app interpretation', () => {
    for (const locale of ['ko', 'en', 'ja']) {
        for (const badge of [undefined, null, '—', '--']) {
            const { source, node } = findNode('src/app/[locale]/app-view/cmd/page.tsx', n => ts.isVariableDeclaration(n)
                && n.name.getText() === 'getInsight' && n.initializer?.getText().includes("if (k.includes('VOL REGIME'))"));
            const insight = evaluate(node.initializer.getText(source), {
                iconKey: 'VOL REGIME', label: 'VOL REGIME', locale, badge,
            });
            assert.equal(insight(), '—');
        }
    }
    for (const regime of [null, 'CALM', 'COILING', 'LOADED', 'ERUPTING']) {
        const description = variable('src/components/LiveTickerDashboard.tsx', 'regimeDesc', { r: { regime }, td: x => x });
        assert.equal(description, regime === null ? '--' : { CALM: 'volStable', COILING: 'volCoiling', LOADED: 'volLoaded', ERUPTING: 'volErupting' }[regime]);
    }
});

test('AI gate 10191620 ①: a failed/pending structure never overrides the real 45/HIGH squeeze with 0/LOW', () => {
    const build = load('src/lib/ai/deepSnapshot').buildDeepSnapshot;
    const pending = { options_status: 'PENDING', squeezeScore: 0, squeezeRisk: 'LOW', netGex: null, gammaConcentration: 0,
        validation: { isValid: false, confidence: 'LOW', failures: ['incomplete_data'] } };
    for (const structure of [pending, { ...pending, options_status: 'OK' }, { ...pending, validation: undefined, options_status: 'NO_MARKET' }]) {
        const out = build({ ticker: `G3A${structure.options_status}${!!structure.validation}`, price: 100, priceChange: 0, session: 'REG',
            unified: { structure, volatility: { squeezeScore: 45, squeezeRisk: 'HIGH', asOf: '2026-10-19' } },
            rawTickerData: null, insider: null, technicals: null, creditSpread: null });
        assert.equal(out.structure.squeezeScore, 45); assert.equal(out.structure.squeezeRisk, 'HIGH');
        assert.equal(out.structure.gammaConcentration, null, 'placeholder 0 concentration is not an observation');
    }
    // The shared volatility calculation ignores the failed section the same way.
    assert.equal(unifiedRegime({ structure: pending, volatility: regime(fullRegime) }).regimeScore, 58);
});

test('AI gate 10191620 ②: unified squeeze producer never turns an absent SI into 0% / LOW', () => {
    const { source, node } = findNode(commandFile, n => ts.isBinaryExpression(n)
        && n.left.getText() === 'squeezeCard' && n.operatorToken.kind === ts.SyntaxKind.EqualsToken);
    const block = findNode(commandFile, n => ts.isIfStatement(n) && n.expression.getText().includes('snapAny.squeeze?.siPercent'));
    const card = snapAny => evaluate(`(() => { let squeezeCard = null; ${block.node.getText(block.source)}; return squeezeCard; })()`,
        { snapAny, ticker: 'SQZ', Date });
    assert.ok(node.getText(source).includes('siPercent'));
    const shortOnly = card({ shortVol: { percent: 41.2 } });
    assert.equal(shortOnly.siPercent, null); assert.equal(shortOnly.daysToCover, null);
    assert.equal(shortOnly.status, null); assert.equal(shortOnly.riskScore, null); assert.equal(shortOnly.shortVolPercent, 41.2);
    assert.equal(card({ squeeze: { siPercent: 12.5, daysToCover: 3 } }).siPercent, 12.5);
    const build = load('src/lib/ai/deepSnapshot').buildDeepSnapshot;
    const out = build({ ticker: 'G3B', price: 100, priceChange: 0, session: 'REG', unified: { squeeze: shortOnly },
        rawTickerData: null, insider: null, technicals: null, creditSpread: null });
    assert.equal(out.squeeze.siPercent, null);
    assert.notEqual(out.squeeze.status, 'LOW');
});

// ── Gate 10191711 (bundle 1) reproductions ───────────────────────────────────────────────
const conv = load('src/lib/commandConviction');
test('gate 10191711 ①: SSR VWAP 98 → live 102 → live VWAP missing keeps 102 (42), never re-observes the SSR', () => {
    const stockSsr = { symbol: 'TEST', price: 100, vwap: 98 };
    const ssr = { unified: { ticker: 'TEST' }, stock: stockSsr };
    let state = conv.webConvictionState('TEST', ssr, { quote: { ticker: 'TEST' }, stock: stockSsr, price: 100 });
    assert.equal(state.inputs.vwap, 98);
    state = conv.webConvictionState('TEST', ssr, { quote: { ticker: 'TEST', vwap: 102 }, stock: stockSsr, price: 100 }, state);
    assert.equal(conv.scoreCommandConviction(state.inputs).score, 42);
    for (let i = 0; i < 3; i++) {
        state = conv.webConvictionState('TEST', ssr, { quote: { ticker: 'TEST' }, stock: stockSsr, price: 100 }, state);
        assert.equal(state.inputs.vwap, 102); assert.equal(conv.scoreCommandConviction(state.inputs).score, 42);
    }
});
test('gate 10191711 ②: a newer overlay value equal to the cached value rounded (35.6 → 36) is the newer value', async () => {
    const { applyUnifiedOptionMetrics, optionMetrics } = load('src/lib/optionMetrics');
    const inputs = { netGex: -1e8, gammaFlipLevel: 100, underlyingPrice: 100.5, squeezeScore: 35.6, atmIv: 20, gammaConcentration: 60 };
    const cached = regime(inputs);
    assert.equal(cached.regime, 'COILING'); assert.equal(cached.squeezeScore, 36);
    const h = commandHarness({ overrides: { overlayStructureLevels: async d => applyUnifiedOptionMetrics(d, optionMetrics({ netGex: -1e8, squeezeScore: 36, squeezeRisk: 'MEDIUM' }, null)) } });
    const body = (await h.jsonResponse({ volatility: { ...cached } }, 200, 'SPY')).body;
    const expected = regime({ ...inputs, squeezeScore: 36 });
    assert.equal(expected.regimeScore, 50); assert.equal(expected.regime, 'LOADED');
    assert.equal(body.volatility.regimeScore, 50); assert.equal(body.volatility.regime, 'LOADED');
    for (const actual of [desktop(body), mobile(body), appSignals(body), aiSnapshot(body).volatility]) assert.equal(actual.regime, 'LOADED');
    // Without an overlay the unrounded cached input still wins over its own display rounding.
    assert.equal(unifiedRegime({ volatility: { ...cached } }).regime, 'COILING');
});
test('gate 10191711 ③: AI material — an older observation arriving later never wins; undated real values carry; carried regime keeps its date', () => {
    const build = load('src/lib/ai/deepSnapshot').buildDeepSnapshot;
    const ai = (ticker, unified, extra = {}) => build({ ticker, price: 100, priceChange: 0, session: 'REG', unified,
        rawTickerData: null, insider: null, technicals: null, creditSpread: null, ...extra });
    ai('G3C', { structure: { netGex: -1e6, chainDate: '2026-10-19' } });
    const late = ai('G3C', { structure: { netGex: 1e6, chainDate: '2026-10-16' } });
    assert.equal(late.structure.netGex, -1e6);
    ai('G3D', { structure: { netGex: 5e6 } });
    const carried = ai('G3D', { structure: { netGex: null } });
    assert.equal(carried.structure.netGex, 5e6, 'undated real value is still the previous real value');
    const edition = { structure: { ...fullRegime, levelsAsOf: NOW - 86400000 }, volatility: regime(fullRegime) };
    const obs = { ...resolveCommandVolatilityObservation('SPY', edition), carried: true };
    const out = ai('G3E', {}, { volatilityData: obs.data, volatilitySource: obs });
    assert.equal(out.volatility.regimeScore, 58);
    assert.deepEqual(plain(out.sources['volatility.regimeScore']), { asOf: new Date(NOW - 86400000).toISOString(), historical: true });
});
test('gate 10191711 ④: a PENDING / invalid structure never votes in conviction (web state, app, adapter)', () => {
    const pending = { options_status: 'PENDING', pcRatio: 0, netGex: null, validation: { isValid: false } };
    let state = conv.webConvictionState('TEST', { unified: null, stock: null },
        { unified: { ticker: 'TEST', structure: { netGex: -1e6, pcRatio: 1.5, chainDate: '2026-10-19' } }, price: 100 });
    assert.equal(conv.scoreCommandConviction(state.inputs).score, 38);
    state = conv.webConvictionState('TEST', { unified: null, stock: null }, { unified: { ticker: 'TEST', structure: pending }, price: 100 }, state);
    assert.equal(conv.scoreCommandConviction(state.inputs).score, 38);
    const adapter = load('src/lib/commandScores').commandScores({ price: 100, unified: { structure: pending } });
    assert.equal(adapter.cScore, null, 'no history: no fabricated 50');
    assert.equal(appSignals({ structure: pending }).convictionScore, null);
});
test('gate 10191711 ⑤: app — unified fails while price is normal: the previous GEX conviction (45) carries', () => {
    const page = 'src/app/[locale]/app-view/cmd/page.tsx';
    const { source, node } = findNode(page, n => ts.isBlock(n) && n.getText().includes('commandConvictionRaw(u, apiPriceOk ? price : null')
        && n.getText().trim().startsWith('{') && n.statements.length === 2);
    const ref = { current: undefined };
    const poll = (u, price = 100) => evaluate(`(() => { ${node.getText(source)}; return lastConviction.current; })()`, {
        u, price, apiPriceOk: price > 0, t: { vwap: null, flow: null }, ticker: 'TEST', lastConviction: ref,
        commandConvictionRaw: conv.commandConvictionRaw, retainConvictionInputs: conv.retainConvictionInputs, normalizeVwap: load('src/lib/vwap').normalizeVwap,
    });
    const app = snap => variable(page, 'signalsData', {
        useMemo: runMemo, data: { ticker: 'TEST', unified: { error: 'x' }, price: 100, convictionSnapshot: snap }, iv30Level: null,
        computeUnifiedVolatilityRegime: unifiedRegime, resolveCommandVolatilityObservation, tDashboard: s => s,
        ...load('src/lib/vwap'), ...load('src/lib/premiumFlow'), ...conv,
    });
    assert.equal(app(poll({ ticker: 'TEST', structure: { netGex: -1e6, chainDate: '2026-10-19' } })).convictionScore, 45);
    for (const failed of [{ error: 'Failed' }, { _source: 'unavailable' }, null, { structure: { options_status: 'PENDING', validation: { isValid: false }, pcRatio: 0 } }]) {
        const snap = poll(failed);
        assert.equal(snap.inputs.gex, -1e6); assert.equal(snap.sourceDates.gex, '2026-10-19');
        assert.equal(app(snap).convictionScore, 45);
    }
});
test('gate 10191711 ⑥: mobile web conviction has no default 50 — price only is missing; same score as web/app', () => {
    const file = 'src/components/intel/mobile/MobileCmdMetrics.tsx';
    const snapDecl = findNode(file, n => ts.isVariableDeclaration(n) && n.name.getText() === 'convictionSnapshot');
    const convDecl = findNode(file, n => ts.isVariableDeclaration(n) && n.name.getText() === 'conviction');
    const run = (unified, vwap = null) => {
        const ctx = { useMemo: runMemo, unified, q: { price: 100, netPremium: undefined }, vwap, vwapDate: undefined, ticker: 'TEST',
            convictionHistory: { current: new Map() }, ...conv };
        ctx.convictionSnapshot = evaluate(snapDecl.node.initializer.getText(snapDecl.source), ctx);
        return evaluate(convDecl.node.initializer.getText(convDecl.source), ctx);
    };
    const priceOnly = run(null);
    assert.equal(priceOnly.score, null); assert.equal(priceOnly.grade, '—'); assert.equal(priceOnly.label, '—');
    const full = { structure: { netGex: -1e6, pcRatio: 1.5 }, sma: { cross: 'GOLDEN' } };
    assert.equal(run(full, 98).score, appSignals(full).convictionScore === null ? null : run(full, 98).score);
    assert.equal(run(full).score, 53); // 50 +15 −7 −5
});

// ── Gate 10191734 reproductions ─────────────────────────────────────────────────────────
const appPage = 'src/app/[locale]/app-view/cmd/page.tsx';
function appPoller(ref) {
    const { source, node } = findNode(appPage, n => ts.isBlock(n) && n.getText().includes('commandConvictionRaw(u, apiPriceOk ? price : null')
        && n.getText().trim().startsWith('{') && n.statements.length === 2);
    return (u, t = { vwap: null, flow: null }, price = 100) => evaluate(`(() => { ${node.getText(source)}; return lastConviction.current; })()`, {
        u, price, apiPriceOk: price > 0, t, ticker: 'TEST', lastConviction: ref,
        commandConvictionRaw: conv.commandConvictionRaw, retainConvictionInputs: conv.retainConvictionInputs, normalizeVwap: load('src/lib/vwap').normalizeVwap,
    });
}
test('gate 10191734 ①: AI conviction (no caller inputs) uses the shared selection — late older GEX cannot flip 45→55', () => {
    const build = load('src/lib/ai/deepSnapshot').buildDeepSnapshot;
    const ai = unified => build({ ticker: 'G4A', price: 100, priceChange: 0, session: 'REG', unified, rawTickerData: null, insider: null, technicals: null, creditSpread: null });
    const first = ai({ structure: { netGex: -1e6, chainDate: '2026-10-19' } });
    assert.equal(first.conviction.score, 45);
    const late = ai({ structure: { netGex: 1e6, chainDate: '2026-10-16' } });
    assert.equal(late.structure.netGex, -1e6); assert.equal(late.conviction.score, 45);
    // Partial missing: AI equals the shared history computed by the card function.
    let hist = conv.retainConvictionInputs('G4B', conv.commandConvictionRaw({ structure: { netGex: -1e6, pcRatio: 0.5, chainDate: '2026-10-19' }, sma: { cross: 'GOLDEN' } }, 100, null, null).raw,
        conv.commandConvictionRaw({ structure: { netGex: -1e6, pcRatio: 0.5, chainDate: '2026-10-19' }, sma: { cross: 'GOLDEN' } }, 100, null, null).dates);
    const aiB = u => build({ ticker: 'G4B', price: 100, priceChange: 0, session: 'REG', unified: u, rawTickerData: null, insider: null, technicals: null, creditSpread: null });
    aiB({ structure: { netGex: -1e6, pcRatio: 0.5, chainDate: '2026-10-19' }, sma: { cross: 'GOLDEN' } });
    const partial = { structure: { netGex: -2e6, chainDate: '2026-10-20' } };
    hist = conv.retainConvictionInputs('G4B', conv.commandConvictionRaw(partial, 100, null, null).raw, conv.commandConvictionRaw(partial, 100, null, null).dates, hist);
    assert.equal(aiB(partial).conviction.score, conv.scoreCommandConviction(hist.inputs).score);
});
test('gate 10191734 ②: app keeps the VWAP source date — 102 (10/19) then 98 (10/16) stays 102 (42)', () => {
    const ref = { current: undefined };
    const poll = appPoller(ref);
    poll({ ticker: 'TEST' }, { vwap: 102, vwapDate: '2026-10-19', flow: null });
    const snap = poll({ ticker: 'TEST' }, { vwap: 98, vwapDate: '2026-10-16', flow: null });
    assert.equal(snap.inputs.vwap, 102); assert.equal(snap.sourceDates.vwap, '2026-10-19');
    assert.equal(conv.scoreCommandConviction(snap.inputs).score, 42);
});
test('gate 10191734 ③: app re-entry restores the cached input history, so a failed unified keeps 45 and 58', () => {
    const { source, node } = findNode(appPage, n => ts.isIfStatement(n) && n.expression.getText() === 'cacheFresh');
    const good = { ticker: 'TEST', structure: { ...fullRegime, netGex: -1e6 * 100, levelsAsOf: NOW - 86400000, chainDate: '2026-10-18' }, volatility: regime(fullRegime) };
    const volRef = { current: null }, convRef = { current: undefined };
    const volObs = resolveCommandVolatilityObservation('TEST', good);
    const convSnap = appPoller({ current: undefined })(good);
    const cachedEntry = { data: { ticker: 'TEST', volatilityObservation: volObs, convictionSnapshot: convSnap } };
    evaluate(`(() => { ${node.getText(source)} })()`, { cacheFresh: true, cachedEntry, ticker: 'TEST', setData() {}, setLoading() {},
        initialLoadRef: { current: true }, lastVolObservation: volRef, lastConviction: convRef });
    assert.equal(volRef.current, volObs); assert.equal(convRef.current, convSnap);
    const after = appPoller(convRef)({ error: 'Failed' });
    assert.equal(conv.scoreCommandConviction(after.inputs).score, 45);
    assert.equal(unifiedRegime(resolveCommandVolatilityObservation('TEST', { error: 'Failed' }, volRef.current).data).regimeScore, 58);
});
test('gate 10191734 ④: AI compares a date-only source as a day — same-day arrival wins (no invented midnight)', () => {
    const build = load('src/lib/ai/deepSnapshot').buildDeepSnapshot;
    const ai = unified => build({ ticker: 'G4D', price: 100, priceChange: 0, session: 'REG', unified, rawTickerData: null, insider: null, technicals: null, creditSpread: null });
    ai({ structure: { netGex: -1e6, asOf: '2026-10-19T15:00:00Z' } });
    assert.equal(ai({ structure: { netGex: 1e6, chainDate: '2026-10-19' } }).structure.netGex, 1e6);
    assert.equal(ai({ structure: { netGex: 3e6, chainDate: '2026-10-18' } }).structure.netGex, 1e6, 'an earlier day still loses');
});
test('gate 10191734 ⑤: a failed/pending structure cannot lend its date to the volatility edition', () => {
    const pending = { options_status: 'PENDING', validation: { isValid: false }, chainDate: '2026-10-20', squeezeScore: 0 };
    const obs = resolveCommandVolatilityObservation('SPY', { structure: pending, volatility: { ...regime(fullRegime), asOf: '2026-10-16' } });
    assert.equal(obs.sourceAsOf, '2026-10-16'); assert.equal(unifiedRegime(obs.data).regimeScore, 58);
    const newer = resolveCommandVolatilityObservation('SPY', { structure: { ...fullRegime, chainDate: '2026-10-19' } });
    const kept = resolveCommandVolatilityObservation('SPY', { structure: pending, volatility: { ...regime(fullRegime), squeezeScore: 10, asOf: '2026-10-16' } }, newer);
    assert.equal(kept.sourceAsOf, '2026-10-19'); assert.equal(kept.carried, true, 'the older 10/16 edition does not replace 10/19');
});
test('gate 10191734 ⑥: mobile web passes the selected edition source and shows the carried date on VOL REGIME', () => {
    const page = fs.readFileSync(path.join(root, 'src/components/intel/mobile/MobileCommandPage.tsx'), 'utf8');
    assert.match(page, /<MobileCmdMetrics [^>]*volatilitySource=\{volatilityObservation\}/);
    const metrics = fs.readFileSync(path.join(root, 'src/components/intel/mobile/MobileCmdMetrics.tsx'), 'utf8');
    assert.match(metrics, /volatilitySource\?\.carried && volatilitySource\.sourceAsOf \? ` · \$\{formatObservationTime\(volatilitySource\.sourceAsOf\)\}` : ''/);
    assert.equal(formatObservationTime('2026-10-16'), '2026-10-16');
});

// ── Gate 10191753 reproductions (fixed after the re-gate budget was used) ───────────────────
test('gate 10191753 ①: AI warm path selects the volatility edition — 10/19 58 then 10/16 0/CALM keeps 58', () => {
    const build = load('src/lib/ai/deepSnapshot').buildDeepSnapshot;
    const ai = unified => build({ ticker: 'G5A', price: 100, priceChange: 0, session: 'REG', unified, rawTickerData: null, insider: null, technicals: null, creditSpread: null });
    assert.equal(ai({ structure: { ...fullRegime, chainDate: '2026-10-19' } }).volatility.regimeScore, 58);
    const zero = { ...fullRegime, netGex: 1, squeezeScore: 0, atmIv: 20, gammaConcentration: 0, underlyingPrice: 200, chainDate: '2026-10-16' };
    assert.equal(regime(zero).regimeScore, 0);
    const late = ai({ structure: zero });
    assert.equal(late.volatility.regimeScore, 58); assert.equal(late.volatility.regime, 'LOADED');
});
test('gate 10191753 ②: conviction dates use the edition time (asOf) when chainDate is absent — no 45→55', () => {
    let st = conv.webConvictionState('TEST', { unified: null, stock: null }, { unified: { ticker: 'TEST', structure: { netGex: -1e6, asOf: '2026-10-19T20:00:00Z' } }, price: 100 });
    st = conv.webConvictionState('TEST', { unified: null, stock: null }, { unified: { ticker: 'TEST', structure: { netGex: 1e6, asOf: '2026-10-16T20:00:00Z' } }, price: 100 }, st);
    assert.equal(conv.scoreCommandConviction(st.inputs).score, 45);
    const raw = conv.commandConvictionRaw({ structure: { netGex: 1e6, asOf: '2026-10-16T20:00:00Z' } }, 100, null, null);
    assert.equal(raw.dates.gex, '2026-10-16T20:00:00Z');
    const build = load('src/lib/ai/deepSnapshot').buildDeepSnapshot;
    const ai = unified => build({ ticker: 'G5B', price: 100, priceChange: 0, session: 'REG', unified, rawTickerData: null, insider: null, technicals: null, creditSpread: null });
    ai({ structure: { netGex: -1e6, asOf: '2026-10-19T20:00:00Z' } });
    const out = ai({ structure: { netGex: 1e6, asOf: '2026-10-16T20:00:00Z' } });
    assert.equal(out.structure.netGex, -1e6); assert.equal(out.conviction.score, 45, 'AI GEX and AI conviction agree');
});
test('gate 10191753 ③④: mobile web — VWAP keeps its date (42 stays) and the history survives a tab remount', () => {
    const file = 'src/components/intel/mobile/MobileCmdMetrics.tsx';
    const snapDecl = findNode(file, n => ts.isVariableDeclaration(n) && n.name.getText() === 'convictionSnapshot');
    const history = new Map();
    const mount = (unified, vwap, vwapDate) => {
        const ctx = { useMemo: runMemo, unified, q: { price: 100, netPremium: undefined }, vwap, vwapDate, ticker: 'TEST',
            convictionHistory: { current: history }, ...conv };
        const snap = evaluate(snapDecl.node.initializer.getText(snapDecl.source), ctx);
        history.delete('TEST'); history.set('TEST', snap);   // the production effect
        return snap;
    };
    mount({ ticker: 'TEST' }, 102, '2026-10-19');
    const late = mount({ ticker: 'TEST' }, 98, '2026-10-16');
    assert.equal(late.inputs.vwap, 102); assert.equal(conv.scoreCommandConviction(late.inputs).score, 42);
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(src, /^const mobileConvictionHistory = new Map<string, ConvictionSnapshot>\(\);$/m, 'module-level history');
    assert.match(src, /const convictionHistory = useRef\(mobileConvictionHistory\);/);
    // Remount (tab switch): a fresh component reads the same module history; a failed poll keeps 45.
    history.clear();
    mount({ ticker: 'TEST', structure: { netGex: -1e6, chainDate: '2026-10-19' } }, null, null);
    const back = mount({ error: 'Failed' }, null, null);
    assert.equal(conv.scoreCommandConviction(back.inputs).score, 45);
    const page = fs.readFileSync(path.join(root, 'src/components/intel/mobile/MobileCommandPage.tsx'), 'utf8');
    assert.match(page, /vwapDate=\{metricVwapDate\}/);
});
test('gate 10191753 ⑤: a carried conviction shows its source date on the app and mobile cards', () => {
    const ref = { current: undefined };
    const poll = appPoller(ref);
    poll({ ticker: 'TEST', structure: { netGex: -1e6, chainDate: '2026-10-19' } });
    const snap = poll({ error: 'Failed' });
    assert.deepEqual(plain(snap.carriedFields), ['gex']);
    assert.equal(conv.carriedConvictionDate(snap), '2026-10-19');
    const app = variable(appPage, 'signalsData', {
        useMemo: runMemo, data: { ticker: 'TEST', unified: { error: 'x' }, price: 100, convictionSnapshot: snap }, iv30Level: null,
        computeUnifiedVolatilityRegime: unifiedRegime, resolveCommandVolatilityObservation, tDashboard: s => s,
        ...load('src/lib/vwap'), ...load('src/lib/premiumFlow'), ...conv,
    });
    assert.equal(app.convictionScore, 45); assert.equal(app.convictionCarriedAsOf, '2026-10-19');
    const fresh = poll({ ticker: 'TEST', structure: { netGex: -2e6, chainDate: '2026-10-20' } });
    assert.equal(conv.carriedConvictionDate(fresh), null);
    const appSrc = fs.readFileSync(path.join(root, appPage), 'utf8');
    assert.match(appSrc, /signalsData\.convictionCarriedAsOf \? <> · <time dateTime=\{signalsData\.convictionCarriedAsOf\}>/);
    const mob = fs.readFileSync(path.join(root, 'src/components/intel/mobile/MobileCmdMetrics.tsx'), 'utf8');
    assert.match(mob, /conviction\.score != null && convictionCarriedAsOf \? ` · \$\{formatObservationTime\(convictionCarriedAsOf\)\}` : ''/);
});
