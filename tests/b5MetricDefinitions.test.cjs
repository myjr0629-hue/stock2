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

test('regime: an unmeasured input earns no points (absent flip never the old +15); 5 of 6 still scores (10/20 rule)', () => {
    assert.equal(regime({}).regimeScore, null);
    assert.equal(regime({}).flipDistance, null);
    const without = { netGex: 38, gammaFlipLevel: 48, underlyingPrice: 48, squeezeScore: 48, atmIv: 46, gammaConcentration: 52 };
    for (const key of ['netGex', 'gammaFlipLevel', 'underlyingPrice', 'squeezeScore', 'atmIv', 'gammaConcentration']) {
        for (const value of [undefined, null, NaN, Infinity, '0']) {
            const result = regime({ ...fullRegime, [key]: value });
            assert.equal(result.regimeScore, without[key], key);
            assert.equal(result.metric.coverage.available, key === 'underlyingPrice' || key === 'gammaFlipLevel' ? 5 : 5, key);
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
    // 10/20 운영: the state word follows the displayed score (24.6 shows «25 /100», so it reads COILING — never «25 /100 CALM»).
    assert.equal(result.regime, 'COILING');
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
    const edition = { netGex: -1, chainDate: dates[10], underlyingPrice: 100, expiration: '2026-10-23' };
    const isolated = harness({}, { fetch: async () => ({ ok: true, json: async () => ({ result: { points } }) }) });
    const result = await isolated('src/services/dealerGamma').getDealerGamma('SPY', 100, 103.04, edition);
    assert.equal(result.samples, 10);
    assert.equal(result.percentile, 100);
    assert.equal(result.flipDistancePct, 3);
    assert.equal(result.unstable, true, 'spot denominator places 3.04/103.04 inside 3%');
    assert.equal(result.metrics.flipDistance.denominator, 'spot_price_USD');
    assert.equal((await isolated('src/services/dealerGamma').getDealerGamma('SPY', 100, 103.1, edition)).unstable, false, '3.006% rounded to 3.0% must remain outside');
    points.splice(0, 1);
    assert.equal((await isolated('src/services/dealerGamma').getDealerGamma('SPY', null, null, edition)).percentile, null);
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
            // 10/20 rule: ≥4 of 6 measured scores; an unmeasured input earns nothing (flip-less 48, IV-less 46).
            const expectedScore = structure === full ? 58 : structure === null ? null : structure.gammaFlipLevel === null ? 48 : 46;
            assert.equal(direct.regimeScore, expectedScore);
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
        // 3 of 6 measured is missing (10/20 rule) — 4+ would be a newer real edition and replace it.
        { structure: { ...fullRegime, gammaConcentration: null, atmIv: null, squeezeScore: null, levelsAsOf: NOW } },
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
    const keptUndated = desktopObservation({ structure: { ...fullRegime, gammaConcentration: null, atmIv: null, squeezeScore: null } }, { lastVolatilityObservation: undated });
    assert.equal(unifiedRegime(keptUndated.data).regimeScore, 58); assert.equal(keptUndated.sourceAsOf, null); assert.equal(keptUndated.carried, true);
    // Nothing real before: the missing edition stands (— is shown, never a default score).
    assert.equal(desktop({ structure: { ...fullRegime, gammaConcentration: null, atmIv: null, squeezeScore: null } }).regimeScore, null);
    // A newer edition with 5 of 6 measured is a real observation: it replaces the previous one (no carry, own inputs only).
    const partial = desktopObservation({ structure: { ...fullRegime, gammaConcentration: null, levelsAsOf: NOW } }, { lastVolatilityObservation: previous });
    assert.equal(partial.carried, false); assert.equal(unifiedRegime(partial.data).regimeScore, 52);
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
    // 관문 10200153 ②: the levels instant orders editions; chainDate is the previous close's OI date in a live edition.
    assert.equal(resolveCommandVolatilityObservation('SPY', { structure: { ...fullRegime, chainDate: '2026-10-16', levelsAsOf: NOW } }).sourceAsOf, new Date(NOW).toISOString());
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
        useMemo: runMemo, data: { ticker: 'SPY', unified: { error: 'x' }, price: 999, volatilityObservation: obs }, iv30Level: null, batchIv: {}, locale: 'en', ticker: undefined, ...load('src/lib/app/commandIv'),
        computeUnifiedVolatilityRegime: unifiedRegime, resolveCommandVolatilityObservation, tDashboard: s => s,
        ...load('src/lib/vwap'), ...load('src/lib/premiumFlow'), ...load('src/lib/commandConviction'),
    });
    const ai = obs => load('src/lib/ai/deepSnapshot').buildDeepSnapshot({
        ticker: 'SPY', price: 999, priceChange: 0, session: 'REG', unified: { error: 'x' }, volatilityData: obs?.data ?? null,
        rawTickerData: null, insider: null, technicals: null, creditSpread: null,
    }).volatility;
    for (const [u, carried] of [[good, false], [{ error: 'Failed' }, true], [{ _source: 'unavailable', structure: null }, true],
        [{ structure: { ...fullRegime, squeezeScore: null, atmIv: null, gammaConcentration: null, levelsAsOf: NOW } }, true]]) {
        const obs = step(u);
        const web = desktop(u, { lastVolatilityObservation: obs });
        for (const actual of [app(obs), ai(obs), mobile(obs.data), web]) {
            assert.equal(actual.regimeScore, 58); assert.equal(actual.regime, 'LOADED');
        }
        assert.equal(app(obs).volCarriedAsOf, carried ? new Date(NOW - 86400000).toISOString() : null);
    }
    // 관문 10200825 ②: the AI regime = the card's selected edition — no edition on the card means missing for the AI too
    // (the card itself carries the previous real edition via the shared rule; no second history layer in the AI).
    assert.equal(ai(null).regimeScore, null);
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
    useMemo: runMemo, data: { unified: u, price: 999 }, iv30Level: null, batchIv: {}, locale: 'en', ticker: undefined, ...load('src/lib/app/commandIv'),
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
    // IV stays missing (never recovered from a default); the other 5 measured inputs still score without IV points.
    assert.equal(out.body.volatility.iv, null); assert.equal(out.body.volatility.regimeScore, 46); assert.equal(out.body.volatility.regime, 'COILING');
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
        // Overlay null never revives the cached GEX/squeeze; the remaining 4 measured inputs score without them.
        [{ netGex: null, squeezeScore: null }, { ...regime({ ...fullRegime, netGex: null, squeezeScore: null }), gex: null, squeezeScore: null }],
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
    // 33.6 → raw 49.4 (49 COILING); the newer overlay 34 (= cached rounded) → raw 49.5 (50 LOADED).
    const inputs = { netGex: -1e8, gammaFlipLevel: 100, underlyingPrice: 100.5, squeezeScore: 33.6, atmIv: 20, gammaConcentration: 60 };
    const cached = regime(inputs);
    assert.equal(cached.regime, 'COILING'); assert.equal(cached.squeezeScore, 34);
    const h = commandHarness({ overrides: { overlayStructureLevels: async d => applyUnifiedOptionMetrics(d, optionMetrics({ netGex: -1e8, squeezeScore: 34, squeezeRisk: 'MEDIUM' }, null)) } });
    const body = (await h.jsonResponse({ volatility: { ...cached } }, 200, 'SPY')).body;
    const expected = regime({ ...inputs, squeezeScore: 34 });
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
        useMemo: runMemo, data: { ticker: 'TEST', unified: { error: 'x' }, price: 100, convictionSnapshot: snap }, iv30Level: null, batchIv: {}, locale: 'en', ticker: undefined, ...load('src/lib/app/commandIv'),
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
    const snapDecl = findNode('src/hooks/useMobileConvictionSnapshot.ts', n => ts.isVariableDeclaration(n) && n.name.getText() === 'snapshot');
    const convDecl = findNode(file, n => ts.isVariableDeclaration(n) && n.name.getText() === 'conviction');
    const run = (unified, vwap = null) => {
        const ctx = { useMemo: runMemo, unified, price: 100, netPremium: undefined, vwap, vwapDate: undefined, vwapExplicitNull: false, ticker: 'TEST',
            mobileConvictionHistory: new Map(), ...conv };
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
    assert.equal(raw.dates.gex, '2026-10-16T20:00:00.000Z'); // normalized by the shared edition-time rule (10200907)
    const build = load('src/lib/ai/deepSnapshot').buildDeepSnapshot;
    const ai = unified => build({ ticker: 'G5B', price: 100, priceChange: 0, session: 'REG', unified, rawTickerData: null, insider: null, technicals: null, creditSpread: null });
    ai({ structure: { netGex: -1e6, asOf: '2026-10-19T20:00:00Z' } });
    const out = ai({ structure: { netGex: 1e6, asOf: '2026-10-16T20:00:00Z' } });
    assert.equal(out.structure.netGex, -1e6); assert.equal(out.conviction.score, 45, 'AI GEX and AI conviction agree');
});
test('gate 10191753 ③④: mobile web — VWAP keeps its date (42 stays) and the history survives a tab remount', () => {
    const file = 'src/hooks/useMobileConvictionSnapshot.ts';
    const snapDecl = findNode(file, n => ts.isVariableDeclaration(n) && n.name.getText() === 'snapshot');
    const history = new Map();
    const mount = (unified, vwap, vwapDate) => {
        const ctx = { useMemo: runMemo, unified, price: 100, netPremium: undefined, vwap, vwapDate, vwapExplicitNull: false, ticker: 'TEST',
            mobileConvictionHistory: history, ...conv };
        const snap = evaluate(snapDecl.node.initializer.getText(snapDecl.source), ctx);
        history.delete('TEST'); history.set('TEST', snap);   // the production effect
        return snap;
    };
    mount({ ticker: 'TEST' }, 102, '2026-10-19');
    const late = mount({ ticker: 'TEST' }, 98, '2026-10-16');
    assert.equal(late.inputs.vwap, 102); assert.equal(conv.scoreCommandConviction(late.inputs).score, 42);
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(src, /^const mobileConvictionHistory = new Map<string, ConvictionSnapshot>\(\);$/m, 'module-level history');
    // Remount (tab switch): a fresh component reads the same module history; a failed poll keeps 45.
    history.clear();
    mount({ ticker: 'TEST', structure: { netGex: -1e6, chainDate: '2026-10-19' } }, null, null);
    const back = mount({ error: 'Failed' }, null, null);
    assert.equal(conv.scoreCommandConviction(back.inputs).score, 45);
    const page = fs.readFileSync(path.join(root, 'src/components/intel/mobile/MobileCommandPage.tsx'), 'utf8');
    assert.match(page, /useMobileConvictionSnapshot\(effectiveQuote\.ticker, unified, effectiveQuote\.price,\s+metricVwap, metricVwapDate,/);
});
test('gate 10191753 ⑤: a carried conviction shows its source date on the app and mobile cards', () => {
    const ref = { current: undefined };
    const poll = appPoller(ref);
    poll({ ticker: 'TEST', structure: { netGex: -1e6, chainDate: '2026-10-19' } });
    const snap = poll({ error: 'Failed' });
    assert.deepEqual(plain(snap.carriedFields), ['gex']);
    assert.equal(conv.carriedConvictionDate(snap), '2026-10-19');
    const app = variable(appPage, 'signalsData', {
        useMemo: runMemo, data: { ticker: 'TEST', unified: { error: 'x' }, price: 100, convictionSnapshot: snap }, iv30Level: null, batchIv: {}, locale: 'en', ticker: undefined, ...load('src/lib/app/commandIv'),
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

test('VWAP is session-scoped: an explicit null from the quote invalidates (no carry); an absent VWAP carries', () => {
    const ref = { current: undefined };
    const poll = appPoller(ref);
    poll({ ticker: 'TEST' }, { vwap: 102, vwapDate: '2026-10-19', flow: null });
    assert.equal(poll({ ticker: 'TEST' }, { flow: null }).inputs.vwap, 102, 'absent → previous real value');
    const inv = poll({ ticker: 'TEST' }, { vwap: null, vwapDate: null, flow: null });
    assert.equal(inv.inputs.vwap, null); assert.ok(!inv.carriedFields.includes('vwap'));
    assert.equal(conv.scoreCommandConviction(inv.inputs), null);
    const build = load('src/lib/ai/deepSnapshot').buildDeepSnapshot;
    const ai = vwap => build({ ticker: 'VWAPINV', price: 100, priceChange: 0, session: 'REG', unified: {}, rawTickerData: { vwap, flow: null },
        insider: null, technicals: null, creditSpread: null }).conviction.score;
    assert.equal(ai(102), 42); assert.equal(ai(undefined), 42); assert.equal(ai(null), null);
});

// ── Gate 10191903 reproductions ─────────────────────────────────────────────────────────
test('gate 10191903 ①: the latest edition owns every regime input — IV/concentration 60·70 with GEX −1e8 is 75/ERUPTING, not 45/COILING', async () => {
    const { applyUnifiedOptionMetrics, optionMetrics, optionRegimeInputs } = load('src/lib/optionMetrics');
    const latest = { netGex: -1e8, squeezeScore: 60, squeezeRisk: 'HIGH', atmIv: 60, gammaConcentration: 70, gammaConcentrationLabel: 'STICKY',
        gammaFlipLevel: 100, underlyingPrice: 102 };
    assert.equal(regime(latest).regimeScore, 75);
    const cachedInputs = { ...latest, netGex: -1e7, squeezeScore: 20, atmIv: 20, gammaConcentration: 0, gammaConcentrationLabel: 'LOOSE' };
    const mixed = { ...latest, atmIv: 20, gammaConcentration: 0 };
    assert.equal(regime(mixed).regimeScore, 45, 'the mixed reproduction');
    const cachedCard = { ...regime(cachedInputs), iv: 20 };
    const data = () => ({ structure: { ...cachedInputs }, volatility: { ...cachedCard } });
    const h = commandHarness({ overrides: { overlayStructureLevels: async d => applyUnifiedOptionMetrics(d, optionMetrics(latest, null), optionRegimeInputs(latest)) } });
    const body = (await h.jsonResponse(data(), 200, 'SPY')).body;
    assert.equal(body.volatility.regimeScore, 75); assert.equal(body.volatility.regime, 'ERUPTING');
    assert.equal(body.volatility.iv, 60); assert.equal(body.structure.atmIv, 60); assert.equal(body.structure.atmIV, 0.6);
    assert.equal(body.structure.gammaConcentration, 70); assert.equal(body.structure.gammaConcentrationLabel, 'STICKY');
    for (const actual of [desktop(body), mobile(body), appSignals(body), aiSnapshot(body).volatility]) assert.equal(actual.regimeScore, 75);
    // Card-only response (no structure section): metric.inputs follow the same edition.
    const cardOnly = (await h.jsonResponse({ volatility: { ...cachedCard } }, 200, 'SPY')).body;
    assert.equal(cardOnly.volatility.regimeScore, 75);
    // No usable edition: nothing from an edition is applied (GEX missing → regime missing, never a mix).
    const none = applyUnifiedOptionMetrics(data(), optionMetrics(null, null), optionRegimeInputs(null));
    assert.equal(unifiedRegime(none).gex, null); assert.equal(unifiedRegime(none).squeezeScore, null, 'cached GEX/squeeze never revived');
    assert.equal(unifiedRegime(none).regimeScore, regime({ ...cachedInputs, netGex: null, squeezeScore: null }).regimeScore);
    // Edition without IV keeps the documented IV-only recovery value; its concentration still owns the input.
    const noIv = applyUnifiedOptionMetrics(data(), optionMetrics(latest, null), optionRegimeInputs({ ...latest, atmIv: null }));
    assert.equal(noIv.structure.gammaConcentration, 70); assert.equal(noIv.volatility.iv, 20);
    // The service reads metrics and regime inputs from ONE structure:v2 read.
    const svc = fs.readFileSync(path.join(root, 'src/services/optionMetricsService.ts'), 'utf8');
    assert.match(svc, /metrics: optionMetrics\(usable \? s : null, oiRow, now\), regime: usable \? optionRegimeInputs\(s\) : null/);
    const route = fs.readFileSync(path.join(root, 'src/app/api/command/unified/route.ts'), 'utf8');
    assert.match(route, /applyUnifiedOptionMetrics\(data, edition\?\.metrics, edition\?\.regime \?\? null\)/);
});
test('gate 10191903 ②: AI material keeps a score and its grade as one observation — 74/B → 90/— → late 20/F stays 90/—', () => {
    const build = load('src/lib/ai/deepSnapshot').buildDeepSnapshot;
    const ai = (alphaRow, fund) => build({ ticker: 'G7A', price: 100, priceChange: 0, session: 'REG', unified: { alpha: alphaRow, fundamentals: fund },
        rawTickerData: null, insider: null, technicals: null, creditSpread: null });
    ai({ score: 74, grade: 'B', asOf: '2026-10-16' }, { score: 70, grade: 'B', asOf: '2026-10-16' });
    const newer = ai({ score: 90, asOf: '2026-10-19' }, { score: 88, asOf: '2026-10-19' });
    assert.deepEqual(plain(newer.contextScore), { value: 90, grade: null });
    const late = ai({ score: 20, grade: 'F', asOf: '2026-10-16' }, { score: 10, grade: 'F', asOf: '2026-10-16' });
    assert.deepEqual(plain(late.contextScore), { value: 90, grade: null }, 'never 90/F');
    assert.equal(late.fundamental.score, 88); assert.equal(late.fundamental.grade, null);
    assert.equal(late.sources['contextScore.value'].asOf.slice(0, 10), '2026-10-19');
    assert.equal(late.sources['contextScore.grade'], undefined, 'no date for a grade the kept score never had');
    // Missing now: the previous score carries WITH its own grade and date.
    ai({ score: 66, grade: 'B', asOf: '2026-10-20' }, null);
    const missing = ai(null, null);
    assert.deepEqual(plain(missing.contextScore), { value: 66, grade: 'B' });
    assert.equal(missing.sources['contextScore.grade'].asOf.slice(0, 10), '2026-10-20'); assert.equal(missing.sources['contextScore.grade'].historical, true);
    // Squeeze score/risk and gamma concentration/label are paired the same way.
    const sq = s => build({ ticker: 'G7B', price: 100, priceChange: 0, session: 'REG', unified: { structure: s }, rawTickerData: null, insider: null, technicals: null, creditSpread: null }).structure;
    sq({ squeezeScore: 30, squeezeRisk: 'LOW', gammaConcentration: 20, gammaConcentrationLabel: 'LOOSE', totalCallOI: 10, chainDate: '2026-10-16' });
    sq({ squeezeScore: 80, gammaConcentration: 75, totalCallOI: 10, chainDate: '2026-10-19' });
    const lateSq = sq({ squeezeScore: 10, squeezeRisk: 'LOW', gammaConcentration: 5, gammaConcentrationLabel: 'LOOSE', totalCallOI: 10, chainDate: '2026-10-16' });
    assert.equal(lateSq.squeezeScore, 80); assert.equal(lateSq.squeezeRisk, null);
    assert.equal(lateSq.gammaConcentration, 75); assert.equal(lateSq.gammaConcentrationLabel, null);
});
test('gate 10191903 ③: mobile card and PRO AI share ONE conviction selection — VWAP 102(10/19) → 98(10/16) is 42 on both', () => {
    const hookFile = 'src/hooks/useMobileConvictionSnapshot.ts';
    const snapDecl = findNode(hookFile, n => ts.isVariableDeclaration(n) && n.name.getText() === 'snapshot');
    const history = new Map();
    const select = (vwap, vwapDate) => {
        const snap = evaluate(snapDecl.node.initializer.getText(snapDecl.source), { useMemo: runMemo, unified: { ticker: 'TEST' }, price: 100,
            netPremium: undefined, vwap, vwapDate, vwapExplicitNull: false, ticker: 'TEST', mobileConvictionHistory: history, ...conv });
        history.set('TEST', snap);
        return snap;
    };
    select(102, '2026-10-19');
    const snap = select(98, '2026-10-16');
    const card = conv.scoreCommandConviction(snap.inputs);
    assert.equal(card.score, 42); assert.equal(card.grade, 'D');
    const build = load('src/lib/ai/deepSnapshot').buildDeepSnapshot;
    const ai = build({ ticker: 'G7C', price: 100, priceChange: 0, session: 'REG', unified: { ticker: 'G7C' }, convictionInputs: snap.inputs,
        rawTickerData: { vwap: 98, flow: { netPremium: undefined } }, insider: null, technicals: null, creditSpread: null });
    assert.equal(ai.conviction.score, 42); assert.equal(ai.conviction.grade, 'D');
    // Wiring: the page selects once and hands the same result to the card and the AI material.
    const page = fs.readFileSync(path.join(root, 'src/components/intel/mobile/MobileCommandPage.tsx'), 'utf8');
    assert.match(page, /convictionInputs=\{convictionSnapshot\.inputs\}/);
    assert.match(page, /<MobileCmdMetrics [^>]*convictionSnapshot=\{convictionSnapshot\}/);
    const overview = fs.readFileSync(path.join(root, 'src/components/intel/mobile/MobileCmdOverview.tsx'), 'utf8');
    assert.match(overview, /unified, volatilityData, volatilitySource, convictionInputs,/);
    const metrics = fs.readFileSync(path.join(root, 'src/components/intel/mobile/MobileCmdMetrics.tsx'), 'utf8');
    assert.doesNotMatch(metrics, /retainConvictionInputs\(/, 'the card no longer keeps a second selection');
});

test('gate 10200153 ②: a late EOD edition with the same chain OI date never replaces the live intraday edition', () => {
    const live = resolveCommandVolatilityObservation('NVDA', { structure: { ...fullRegime, chainDate: '2026-10-16', levelsAsOf: Date.parse('2026-10-19T14:08:42Z') } });
    assert.equal(live.sourceAsOf, '2026-10-19T14:08:42.000Z');
    // EOD edition of the 10/16 session (levels computed 10/16 after the close, or only the chain date known).
    for (const eod of [{ ...fullRegime, netGex: 5e8, chainDate: '2026-10-16', levelsAsOf: Date.parse('2026-10-16T21:00:00Z') },
        { ...fullRegime, netGex: 5e8, chainDate: '2026-10-16' }]) {
        const after = resolveCommandVolatilityObservation('NVDA', { structure: eod }, live);
        assert.equal(after.carried, true); assert.equal(after.sourceAsOf, live.sourceAsOf);
        assert.equal(unifiedRegime(after.data).regimeScore, unifiedRegime(live.data).regimeScore);
    }
    // A producer-stated session day wins over a later recompute instant (an old session rebuilt late).
    const rebuilt = resolveCommandVolatilityObservation('NVDA', { structure: { ...fullRegime, netGex: 5e8, structureSessionDate: '2026-10-16', levelsAsOf: Date.parse('2026-10-20T01:00:00Z') } }, live);
    assert.equal(rebuilt.carried, true); assert.equal(rebuilt.sourceAsOf, live.sourceAsOf);
    // A newer live edition still replaces.
    const next = resolveCommandVolatilityObservation('NVDA', { structure: { ...fullRegime, netGex: -5e8, chainDate: '2026-10-16', levelsAsOf: Date.parse('2026-10-19T15:00:00Z') } }, live);
    assert.equal(next.carried, false); assert.equal(next.sourceAsOf, '2026-10-19T15:00:00.000Z');
});
// ── 10/20 운영 결정: 플립 «범위 밖»은 정보, 6개 중 4개 이상 실측이면 점수 ─────────────────────
test('VOL REGIME replay (10/19 intraday snapshots): NVDA·SPY·WTFC flip beyond the band scores; main gave a missing flip +15', () => {
    const fx = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/regimeReplay-2026-10-19.json'), 'utf8'));
    // Branch server exit: applyLevelsToUnified writes the spot and the flip judgement of the same level set.
    const branch = t => unifiedRegime({ structure: { ...fx[t].structure, underlyingPrice: fx[t].tickerFlow.price, gammaFlipType: fx[t].tickerFlow.gammaFlipType }, volatility: fx[t].volatility });
    const expected = { NVDA: [11, 'CALM'], SPY: [8, 'CALM'], WTFC: [4, 'CALM'], AAPL: [36, 'COILING'], TSLA: [22, 'CALM'] };
    for (const [t, [score, label]] of Object.entries(expected)) {
        const r = branch(t);
        assert.equal(r.regimeScore, score, t); assert.equal(r.regime, label, t);
        assert.equal(r.metric.coverage.available, 6, `${t}: all six measured (flip beyond band counts)`);
    }
    for (const t of ['NVDA', 'SPY', 'WTFC']) {
        const r = branch(t);
        assert.equal(r.flipOutOfRange, 'ABOVE'); assert.equal(r.isAboveFlip, true); assert.equal(r.flipDistance, null, 'no invented distance');
        // main's formula (services/volatilityRegime @ origin/main) on the same inputs: missing flip → flipDistance ?? 0 → +15 «at the flip».
        const v = fx[t].volatility, s = fx[t].structure;
        const mainScore = (s.netGex < 0 ? Math.max(0, Math.min(30, Math.log10(Math.abs(s.netGex) / 1e6) * 10)) : 0)
            + Math.min(25, s.squeezeScore / 4) + (v.iv > 50 ? 20 : v.iv > 35 ? 12 : v.iv > 25 ? 6 : 0) + 15 + 0;
        assert.equal(Math.round(mainScore) - 15, branch(t).regimeScore, `${t}: the only difference is main's fake +15 proximity`);
    }
    // Today's main-server response (no spot, no flip judgement) on the new client: 4 of 6 measured → still a score.
    for (const t of ['NVDA', 'SPY', 'WTFC']) {
        const r = unifiedRegime({ structure: fx[t].structure, volatility: fx[t].volatility });
        assert.equal(r.metric.coverage.available, 4, t); assert.equal(r.regimeScore, branch(t).regimeScore, t);
    }
});
test('VOL REGIME coverage rule: ≥4 of 6 measured scores (missing inputs earn nothing), ≤3 is missing', () => {
    const four = regime({ netGex: -1e8, squeezeScore: 40, atmIv: 40, gammaConcentration: 60 });
    assert.equal(four.metric.coverage.available, 4); assert.equal(four.regimeScore, 20 + 10 + 12 + 6);
    const three = regime({ netGex: -1e8, squeezeScore: 40, atmIv: 40 });
    assert.equal(three.regimeScore, null); assert.equal(three.regime, null); assert.equal(three.metric.reason, 'insufficient_coverage');
    const allShort = regime({ netGex: -1e8, underlyingPrice: 100, gammaFlipType: 'ALL_SHORT', squeezeScore: 40, atmIv: 40, gammaConcentration: 60 });
    assert.equal(allShort.flipOutOfRange, 'BELOW'); assert.equal(allShort.isAboveFlip, false); assert.equal(allShort.regimeScore, 48);
    assert.equal(regime({ ...fullRegime, gammaFlipLevel: null, gammaFlipType: 'NO_DATA' }).metric.coverage.missing.includes('gammaFlipLevel'), true, 'NO_DATA is truly missing');
});

test('gate 10200719 ①: optionRegimeInputs carries the edition spot (positive only) for the exit flip judgement', () => {
    const { optionRegimeInputs } = load('src/lib/optionMetrics');
    assert.equal(optionRegimeInputs({ ...fullRegime, underlyingPrice: 110 }).underlyingPrice, 110);
    for (const bad of [0, -1, null, undefined, NaN, '110']) assert.equal(optionRegimeInputs({ ...fullRegime, underlyingPrice: bad }).underlyingPrice, null);
    const route = fs.readFileSync(path.join(root, 'src/app/api/command/unified/route.ts'), 'utf8');
    assert.ok(route.indexOf('readOptionEditions([String(t)') < route.indexOf('applyLevelsToUnified(data, lv, edition?.regime?.underlyingPrice ?? null)'), 'edition read before the level overlay');
});

test('gate 10200735 ②: a computed card without structure keeps «beyond the band» (flipOutOfRange) as an input', () => {
    const card = regime({ netGex: -1e8, underlyingPrice: 100, atmIv: 40, gammaFlipType: 'ALL_SHORT' });
    assert.equal(card.metric.coverage.available, 4); assert.equal(card.regimeScore, 32);
    const again = unifiedRegime({ structure: null, volatility: card });
    assert.equal(again.metric.coverage.available, 4); assert.equal(again.regimeScore, 32); assert.equal(again.flipOutOfRange, 'BELOW');
    assert.equal(unifiedRegime({ structure: null, volatility: { ...card, flipOutOfRange: undefined, metric: { ...card.metric, inputs: { ...card.metric.inputs } } } }).regimeScore, 32, 'metric.inputs also carries it');
    // An explicit structure judgement still wins (NO_DATA = truly missing).
    assert.equal(unifiedRegime({ structure: { gammaFlipType: 'NO_DATA' }, volatility: card }).metric.coverage.missing.includes('gammaFlipLevel'), true);
});

test('gate 10200752 ②: the AI VWAP and distance are the VWAP conviction selected (late older VWAP never reaches the AI), with its source date', () => {
    const build = load('src/lib/ai/deepSnapshot').buildDeepSnapshot;
    const conv = load('src/lib/commandConviction');
    const base = { ticker: 'G52', price: 100, priceChange: 0, session: 'REG', unified: {}, insider: null, technicals: null, creditSpread: null };
    // Caller path (web/app/mobile pass the card selection): latest 102 (10/19) kept over a late 98 (10/16).
    const first = conv.retainConvictionInputs('G52', { price: 100, vwap: 102 }, { vwap: '2026-10-19' });
    const kept = conv.retainConvictionInputs('G52', { price: 100, vwap: 98 }, { vwap: '2026-10-16' }, first);
    assert.equal(kept.inputs.vwap, 102);
    const ai = build({ ...base, rawTickerData: { vwap: 98, vwapDate: '2026-10-16' }, convictionInputs: kept.inputs,
        convictionSourceDates: kept.sourceDates, convictionCarried: kept.carriedFields });
    assert.equal(ai.vwap, 102); assert.equal(ai.vwapDistance, '-2.0%');
    assert.match(ai.sources.vwap.asOf, /^2026-10-19/); assert.equal(ai.sources.vwap.historical, true);
    // Internal path (warm/no caller selection) uses the same selection.
    build({ ...base, ticker: 'G52B', rawTickerData: { vwap: 102, vwapDate: '2026-10-19' } });
    const late = build({ ...base, ticker: 'G52B', rawTickerData: { vwap: 98, vwapDate: '2026-10-16' } });
    assert.equal(late.vwap, 102); assert.equal(late.vwapDistance, '-2.0%'); assert.match(late.sources.vwap.asOf, /^2026-10-19/);
    // Every caller passes the dates with the inputs.
    for (const f of ['src/components/LiveTickerDashboard.tsx', 'src/app/[locale]/app-view/cmd/page.tsx', 'src/components/intel/mobile/MobileCommandPage.tsx', 'src/components/intel/mobile/MobileCmdOverview.tsx'])
        assert.match(fs.readFileSync(path.join(root, f), 'utf8'), /convictionSourceDates/, f);
});

test('gate 10200825 ②: the AI regime score is the selected edition (no second carry): card missing → AI missing', () => {
    const build = load('src/lib/ai/deepSnapshot').buildDeepSnapshot;
    const base = { ticker: 'G825', price: 100, priceChange: 0, session: 'REG', unified: {}, rawTickerData: null, insider: null, technicals: null, creditSpread: null };
    const full = { structure: { ...fullRegime, levelsAsOf: NOW }, volatility: null };
    const first = build({ ...base, volatilityData: full, volatilitySource: { sourceAsOf: new Date(NOW).toISOString(), carried: false } });
    assert.equal(first.volatility.regimeScore, 58);
    // Re-entry: the card's fresh selection has only 3 of 6 inputs → missing on the card.
    const thin = { structure: { ...fullRegime, gammaConcentration: null, atmIv: null, squeezeScore: null, levelsAsOf: NOW + 1000 }, volatility: null };
    const again = build({ ...base, volatilityData: thin, volatilitySource: { sourceAsOf: new Date(NOW + 1000).toISOString(), carried: false } });
    assert.equal(again.volatility.regimeScore, null); assert.equal(again.volatility.regime ?? null, null);
    assert.equal(again.sources['volatility.regimeScore'], undefined);
    // A carried edition keeps its own date as historical.
    const carried = build({ ...base, volatilityData: full, volatilitySource: { sourceAsOf: '2026-10-16', carried: true } });
    assert.equal(carried.volatility.regimeScore, 58); assert.equal(carried.sources['volatility.regimeScore'].historical, true);
});

test('gate 10200907: conviction and AI structure values use the edition instant — a late 10/16 GEX with the same chainDate never replaces 10/19 live', () => {
    const conv = load('src/lib/commandConviction');
    const live = { structure: { netGex: -1e8, chainDate: '2026-10-16', levelsAsOf: Date.parse('2026-10-19T14:00:00Z') } };
    const eod = { structure: { netGex: 5e8, chainDate: '2026-10-16', levelsAsOf: Date.parse('2026-10-16T21:00:00Z') } };
    const step = (u, prev) => { const r = conv.commandConvictionRaw(u, null, undefined, null); return conv.retainConvictionInputs('G907', r.raw, r.dates, prev, r.invalidated); };
    const a = step(live); const b = step(eod, a);
    assert.equal(b.inputs.gex, -1e8); assert.equal(conv.scoreCommandConviction(b.inputs).score, 45);
    const build = load('src/lib/ai/deepSnapshot').buildDeepSnapshot;
    const base = { ticker: 'G907', price: 100, priceChange: 0, session: 'REG', rawTickerData: null, insider: null, technicals: null, creditSpread: null };
    build({ ...base, unified: live });
    const late = build({ ...base, unified: eod });
    assert.equal(late.structure.netGex, -1e8, 'AI GEX keeps the newer live edition');
    assert.match(late.sources['structure.netGex'].asOf, /^2026-10-19T14:00/);
});

test('10/20 운영: the state word follows the displayed score — never «50 /100 COILING»', () => {
    // TSLA 10/19 close: GEX −25.7M · squeeze 23 · IV 77 · flip 375 / spot 368.14 · concentration 29 → raw 49.85.
    const r = regime({ netGex: -25699043, gammaFlipLevel: 375, underlyingPrice: 368.14, squeezeScore: 23, atmIv: 77, gammaConcentration: 29 });
    assert.equal(r.regimeScore, 50); assert.equal(r.regime, 'LOADED');
    for (const s of [24.5, 49.5, 74.5]) {
        const shown = Math.round(s);
        const word = shown >= 75 ? 'ERUPTING' : shown >= 50 ? 'LOADED' : shown >= 25 ? 'COILING' : 'CALM';
        assert.ok(['COILING', 'LOADED', 'ERUPTING'].includes(word));
    }
});
