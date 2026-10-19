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
    assert.equal(result.unstable, false, 'rounding must not change <=3% decision');
    assert.equal(result.metrics.flipDistance.denominator, 'gamma_flip_level_USD');
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
