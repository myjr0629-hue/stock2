// Offline contract regression. Never imports service implementations or reads .env files.
// node tests/tickerPayload.test.js [snapshot directory]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const routeFile = 'src/app/api/live/ticker/route.ts';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const current = read(routeFile);
// 10/19 저장 응답의 감사 기준을 고정한다. 최신 origin/main의 다른 gamma 계산과 과거 저장 응답을 섞지 않는다.
const baselineRef = 'd6c648194118fe0855bceb6b16a51fe208d021a5';
const original = execFileSync('git', ['show', `${baselineRef}:${routeFile}`], { cwd: root, encoding: 'utf8' });
const snapshotDir = process.argv[2] || '/Users/eunhoon/Documents/signum-work/2026-10-19/reg-snapshots';
const snapshots = fs.readdirSync(snapshotDir).filter(f => /^ticker-.*-2310\.json$/.test(f)).sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(snapshotDir, f), 'utf8')));
assert.equal(snapshots.length, 5, 'all five saved ticker responses are required');
const copy = x => structuredClone(x);
const json = x => JSON.parse(JSON.stringify(x));
const withoutChains = payload => {
    const out = copy(payload);
    delete out.flow.rawChain;
    delete out.flow.allExpiryChain;
    return out;
};
const RealDate = Date;
const NOW = RealDate.parse('2026-10-19T14:10:00Z');
global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
};
global.fetch = async () => { throw new Error('Unexpected network access'); };

const compiledCache = new Map();
function load(source, mocks, extra = '') {
    const module = { exports: {} };
    const requireMock = id => {
        assert.ok(Object.hasOwn(mocks, id), `Unmocked dependency: ${id}`);
        return mocks[id];
    };
    const compiled = compiledCache.get(source + extra) || ts.transpileModule(source + extra, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    compiledCache.set(source + extra, compiled);
    new Function('require', 'module', 'exports', compiled)(requireMock, module, module.exports);
    return module.exports;
}
const putCall = load(read('src/lib/putCall.ts'), {});
const vwap = load(read('src/lib/vwap.ts'), {});
const background = load(read('src/lib/intrinioBackground.ts'), { 'node:async_hooks': require('node:async_hooks') });
// 최신 수집 행 선택은 실제 순수 함수를 사용한다. 모듈의 날짜 함수는 이 경로에서 호출하지 않는다.
const optionsBasis = load(read('src/lib/app/intelOptionsBasis.ts'), {
    '@/lib/putCall': putCall, '@/lib/marketCalendar': {},
});

function harness(source, snapshot, mode = 'hit', skipAlpha = false) {
    const store = new Map();
    const calls = { responseKeys: [], lastGoodKeys: [], alphaChains: [], skewChains: [], sourceChains: 0 };
    const flow = snapshot.flow;
    const price = snapshot.price;
    const metrics = { pcr: flow.oiPcr, gex: flow.gex, squeezeScore: flow.squeezeScore };
    const levels = new Map([[snapshot.ticker, flow]]);
    const mocks = {
        '@/lib/app/intelOptionsBasis': optionsBasis,
        'next/server': { after: () => {} },
        '@/services/optionMetricsService': { readOptionMetrics: async () => new Map([[snapshot.ticker, metrics]]) },
        '@/services/oiNear35Fallback': { readOi35Fallback: async () => null, readLastGoodOi: async () => null },
        '@/services/optionAlphaService': { readOptionAlpha: async () => new Map([[snapshot.ticker, snapshot.alpha]]) },
        // 저장 응답의 옵션 수집 행이 유효한 경로를 재생한다. 대체 OI 자체는 별도 NB1 시험에서 검증한다.
        '@/lib/optionMetrics': { applyOptionMetrics: (target, m) => Object.assign(target, { netGex: m?.gex ?? null }), optionMetricsRowHasOi: () => true },
        '@/lib/vwap': vwap,
        '@/lib/intrinioBackground': background,
        '@/services/realtimeSessionVwap': { getRealtimeSessionVwap: async () => null, readRealtimeSessionVwap: async () => null },
        '@/lib/shortVolume': { shortVolFields: () => ({}) },
        '@/lib/sessionArchive': { lastCompletedSessionDate: () => '2026-10-16', readSessionArchive: async () => null, saveSessionArchive: async () => {} },
        '@/services/stockApi': { getStockChartData: async () => [], getRegularSessionMinuteBars: async () => [] },
        // 체인 응답 계약과 무관한 VWAP 잠금 경합 대기를 만들지 않는다(저장·공급사는 모두 대역).
        '@/lib/intrinioMeter': { upstashMeterStore: { setNxEx: async () => true } },
        '@/services/timezoneUtils': { getETNow: () => ({ hour: 10, minute: 10, dateString: '2026-10-19', isWeekend: false }), getSessionType: () => 'REG' },
        '@/services/marketDaySSOT': { isUSMarketHolidayET: () => false },
        '@/services/buildMeta': { getBuildMeta: () => snapshot.meta },
        '@/services/massiveClient': { CACHE_POLICY: { LIVE: 'live' }, fetchMassive: async url => {
            if (url.includes('/v2/snapshot/')) return { ticker: mode === 'stale' ? {} : {
                _intrinio: { prevClose: snapshot.prevClose, regularDate: '2026-10-19' },
                lastTrade: { p: price, t: NOW * 1e6 }, day: { c: price, v: 1000 }, prevDay: { c: snapshot.prevClose, v: 900 },
            } };
            if (url.includes('/v2/aggs/')) return { results: mode === 'stale' ? [] : [
                { c: snapshot.prevClose, v: 1000, t: RealDate.parse('2026-10-16T00:00:00Z') },
                { c: snapshot.prevClose - 1, v: 900, t: RealDate.parse('2026-10-15T00:00:00Z') },
            ] };
            if (url.includes('/v1/open-close/')) return { close: price };
            return {};
        } },
        '@/services/alphaEngine': {
            calculateAlphaScore: input => { calls.alphaChains.push(copy(input.rawChain)); return copy(snapshot.alpha); },
            calculateWhaleIndex: () => 50, computeRSI14: () => 50, computeImpliedMovePct: () => 2,
            computeIVSkew: chain => { calls.skewChains.push(copy(chain)); return 0.9; },
        },
        '@/services/xsScores': { ensureXsScores: async () => {} },
        '@/services/centralDataHub': { sanitizeMaxPain: x => x, CentralDataHub: {
            getMarketStatus: async () => ({ session: 'regular' }),
            _fetchOptionsChain: async () => { calls.sourceChains++; return copy(flow); },
        } },
        '@/services/structureService': {
            getStructureData: async () => ({ ...copy(flow), netGex: flow.gex, pcr: flow.oiPcr }),
            levelsFromStructure: x => x, displayLevels: x => x || {},
            prefetchLevelsWithKeys: (_tickers, keys) => {
                calls.responseKeys.push(...keys);
                return { extras: Promise.resolve(keys.map(k => mode === 'hit' ? copy(snapshot) : copy(store.get(k) ?? null))), finish: async () => levels };
            },
        },
        '@/lib/optionLevelGate': { gammaFlipTypeOf: () => flow.gammaFlipType ?? null },
        '@/services/macroHubProvider': { getMacroSnapshotSSOT: async () => ({}) },
        '@/services/redisClient': {
            getFromCache: async key => {
                // 체인 계약 비교는 같은 날짜의 VWAP 저장본이 준비된 조건에서 실행한다.
                // 결측·배경 갱신·날짜 경계는 tickerVwapColdCache에서 별도로 검증한다.
                if (key === `chart:v5:${snapshot.ticker}:1d` && vwap.normalizeVwap(snapshot.vwap) != null) {
                    return { data: [{ etDate: snapshot.vwapDate, session: 'REG', high: snapshot.vwap,
                        low: snapshot.vwap, close: snapshot.vwap, volume: 1 }], _builtAt: NOW };
                }
                if (key.startsWith('flow:ticker:lastgood:')) {
                    calls.lastGoodKeys.push(key);
                    return mode === 'stale' ? copy(snapshot) : copy(store.get(key) ?? null);
                }
                return null;
            },
            setInCache: async (key, value) => { store.set(key, json(value)); },
        },
        '@/services/extendedSessionClose': {
            getExtendedSessionCloseWithin: async () => ({ value: null }), isTradeInExtSession: () => false,
            keepSessionScopedFresh: x => x, peekExtendedSessionCloses: async () => new Map(),
            pickRegularPreClose: () => null, recallProvisionalPreCloses: async () => new Map(), rememberProvisionalPreClose: async () => {},
        },
        '@/lib/marketCalendar': { shownRegularSessionDate: () => '2026-10-19', etLastClosedSessionDate: () => '2026-10-16', etMinutesOf: () => 610,
            cashSessionPhaseAt: () => 'regular' },
        '@/lib/putCall': putCall,
        '@/lib/quoteBasis': { priceAsOfET: () => snapshot.timestampET },
        '@/services/realtimeMetricsService': { fetchRealtimeMetrics: async () => null },
        '@/services/intrinioClient': { lastIntrinioFailure: () => null },
        '@/services/darkPool': { getDarkPool: async () => null },
    };
    const route = load(source, mocks, source.includes('function tickerPayloadForResponse') ? '\nexport { tickerPayloadForResponse };' : '');
    return { calls, store, project: route.tickerPayloadForResponse, get: async query => {
        const url = new URL(`http://offline/api/live/ticker?t=${snapshot.ticker}${skipAlpha ? '&skip_alpha=1' : ''}${query}`);
        const response = await route.GET({ nextUrl: url, url: url.href, headers: new Headers() });
        assert.equal(response.status, 200);
        return { body: await response.json(), cache: response.headers.get('X-Cache') };
    } };
}

function nodes(source, file = 'test.tsx') {
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const out = [];
    const visit = n => { out.push(n); ts.forEachChild(n, visit); };
    visit(tree);
    return out;
}
function tickerUrl(file) {
    const source = read(file);
    const literals = nodes(source).filter(ts.isTemplateExpression).filter(n => n.getText().includes('/api/live/ticker?'));
    assert.equal(literals.length, 1, file);
    return new Function('ticker', 'baseUrl', `return ${literals[0].getText()}`)('SPY', 'http://offline');
}
const rows = [];
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
(async () => {
    const savedLog = console.log;
    // Route diagnostics are not test output; no vendor URL or environment values are printed.
    console.log = (...args) => { if (!String(args[0]).startsWith('[live/ticker]')) savedLog(...args); };
    for (const snapshot of snapshots) {
        await test(`${snapshot.ticker}: saved JSON differs only by the two chain fields; full is identical`, async () => {
            const h = harness(current, snapshot);
            const before = copy(snapshot);
            const slim = h.project(snapshot, true);
            assert.deepEqual(slim, withoutChains(snapshot));
            assert.deepEqual(h.project(snapshot, false), snapshot);
            assert.deepEqual(snapshot, before, 'projection must not mutate the cached full response');
            const bytes = Buffer.byteLength(JSON.stringify(snapshot));
            const after = Buffer.byteLength(JSON.stringify(slim));
            rows.push({ ticker: snapshot.ticker, before: bytes, default: after, full: bytes, reduction: `${((1 - after / bytes) * 100).toFixed(2)}%` });
        });
        for (const mode of ['hit', 'miss', 'stale']) for (const skipAlpha of [false, true]) {
            await test(`${snapshot.ticker}: actual GET ${mode} alpha=${!skipAlpha}, old/full/default/chain=0 parity`, async () => {
                const old = harness(original, snapshot, mode, skipAlpha);
                const full = harness(current, snapshot, mode, skipAlpha);
                const slim = harness(current, snapshot, mode, skipAlpha);
                const zero = harness(current, snapshot, mode, skipAlpha);
                // origin/main에도 요약 기본값이 병합됐으므로 같은 full 계약을 비교한다.
                const a = await old.get('&chain=full');
                const b = await full.get('&chain=full');
                const c = await slim.get('');
                const d = await zero.get('&chain=0');
                // L9 수리는 레거시 gamma를 구조 달러 GEX로 통일한다. 나머지 본문 계약은 그대로다.
                a.body.flow.gamma = a.body.flow.netGex ?? null;
                assert.equal(b.body.flow.gamma, a.body.flow.gamma);
                assert.deepEqual(b.body, a.body, 'full preserves the old GET result except the corrected gamma alias');
                assert.deepEqual(c.body, withoutChains(a.body), 'default may remove only the two chains after gamma correction');
                assert.deepEqual(d.body, c.body);
                assert.equal(c.cache, mode === 'hit' ? 'HIT' : 'MISS');
                assert.notEqual(full.calls.responseKeys[0], slim.calls.responseKeys[0]);
                if (mode !== 'hit') {
                    assert.notEqual(full.calls.lastGoodKeys[0], slim.calls.lastGoodKeys[0]);
                    assert.equal(slim.calls.sourceChains, 1, 'summary mode still fetches source chains');
                    assert.ok(slim.calls.skewChains.length > 0);
                    for (const chain of slim.calls.skewChains) assert.deepEqual(chain, snapshot.flow.rawChain);
                    if (!skipAlpha) {
                        assert.equal(slim.calls.alphaChains.length, 1);
                        assert.deepEqual(slim.calls.alphaChains[0], snapshot.flow.rawChain);
                    }
                }
            });
        }
    }
    const spy = snapshots.find(s => s.ticker === 'SPY');
    await test('four response/last-good cache shapes stay distinct through MISS → HIT', async () => {
        const keys = new Set(), lastGood = new Set();
        for (const skipAlpha of [false, true]) {
            const h = harness(current, spy, 'miss', skipAlpha);
            for (const query of ['', '&chain=full']) {
                const first = await h.get(query);
                const second = await h.get(query);
                assert.equal(first.cache, 'MISS'); assert.equal(second.cache, 'HIT');
                assert.equal(Object.hasOwn(second.body.flow, 'rawChain'), query !== '');
                assert.equal(Object.hasOwn(second.body.flow, 'allExpiryChain'), query !== '');
                keys.add(h.calls.responseKeys.at(-1)); lastGood.add(h.calls.lastGoodKeys.at(-1));
            }
        }
        assert.equal(keys.size, 4); assert.equal(lastGood.size, 4);
    });
    await test('actual hook cache isolates summary/full and skip_alpha; Flow consumers request full', async () => {
        let nextData, last;
        const hook = load(read('src/hooks/useFlowData.ts'), { swr: (key, fetcher, options) => {
            last = { key, options }; return { data: nextData };
        } });
        hook.useFlowData('SPY'); assert.ok(!last.key.includes('chain=full'));
        nextData = withoutChains(spy); hook.useFlowData('SPY'); nextData = undefined;
        hook.useFlowData('SPY', { chain: 'full' }); assert.equal(last.options.fallbackData, undefined);
        nextData = spy; hook.useFlowData('SPY', { chain: 'full' }); nextData = undefined;
        hook.useFlowData('SPY'); assert.deepEqual(last.options.fallbackData, withoutChains(spy));
        hook.useFlowData('SPY', { chain: 'full', skipAlpha: false }); assert.equal(last.options.fallbackData, undefined);
        for (const file of ['src/app/[locale]/flow/FlowPageClient.tsx', 'src/app/[locale]/flow/MobileFlowPage.tsx']) {
            const call = nodes(read(file)).find(n => ts.isCallExpression(n) && n.expression.getText() === 'useFlowData');
            const chain = call.arguments[1].properties.find(p => p.name?.getText() === 'chain');
            assert.equal(chain.initializer.text, 'full', file);
            hook.useFlowData('SPY', { chain: chain.initializer.text });
            const result = await harness(current, spy).get(new URL(last.key, 'http://offline').search.replace('?t=SPY', ''));
            assert.deepEqual(result.body.flow.rawChain, spy.flow.rawChain, file);
            assert.deepEqual(result.body.flow.allExpiryChain, spy.flow.allExpiryChain, file);
        }
    });
    await test('app STRIKE, Flow unified, dashboard chain/IV consumers receive the original chains', async () => {
        for (const file of ['src/app/[locale]/app-view/flow/page.tsx', 'src/app/api/flow/unified/route.ts', 'src/app/api/dashboard/unified/route.ts']) {
            const url = new URL(tickerUrl(file), 'http://offline');
            assert.equal(url.searchParams.get('chain'), 'full', file);
            const result = await harness(current, spy).get(url.search.replace('?t=SPY', ''));
            assert.deepEqual(result.body.flow.rawChain, spy.flow.rawChain, file);
            assert.deepEqual(result.body.flow.allExpiryChain, spy.flow.allExpiryChain, file);
        }
    });
    await test('CMD/FLOW consumers preserve network request order and arguments', async () => {
        const files = ['src/app/[locale]/app-view/cmd/page.tsx', 'src/app/[locale]/app-view/flow/page.tsx',
            'src/app/api/flow/unified/route.ts', 'src/app/api/dashboard/unified/route.ts',
            'src/app/[locale]/flow/FlowPageClient.tsx', 'src/app/[locale]/flow/MobileFlowPage.tsx'];
        for (const file of files) {
            const old = execFileSync('git', ['show', `origin/main:${file}`], { cwd: root, encoding: 'utf8' });
            const normalize = source => source.replace(/&chain=full/g, '').replace(/^        chain: 'full',\n/gm, '')
                // Alpha now decides availability from observed metrics, including partial/PENDING data.
                .replace(/^\s+optionsDataAvailable: data\.options_status === 'OK',\n/gm, '');
            // 계산·날짜 정책은 별도 회귀 시험에서 검증한다. 이 시험의 계약은 네트워크 요청 순서·인수다.
            const requests = source => nodes(source).filter(ts.isCallExpression)
                .filter(n => /fetch|callInternalGet/i.test(n.expression.getText()))
                .map(n => normalize(n.getText()));
            assert.deepEqual(requests(read(file)), requests(old), file);
        }
    });
    await test('chain diagnostic scripts only add chain=full to their requests (scripts are not executed)', async () => {
        for (const file of ['scripts/verify_flow_data.js', 'scripts/verify_pipeline.js', 'scripts/flow_perf_test.js',
            'scripts/trace_pipeline.js', 'scripts/simulate_weekly_squeeze.js', 'scripts/flow_payload_audit.js',
            'scripts/test_squeeze_weekly.js', 'scripts/verify_gamma_engine.js']) {
            const old = execFileSync('git', ['show', `origin/main:${file}`], { cwd: root, encoding: 'utf8' });
            assert.ok(read(file).includes('chain=full'), file);
            const normalize = source => source.replace(/\+'&chain=full'/g, '').replace(/&chain=full/g, '');
            assert.equal(normalize(read(file)), normalize(old), file);
        }
    });
    console.table(rows);
    console.log(`${passed} tests passed (offline; actual GET old/new, saved JSON, consumer URLs, cache isolation)`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { global.Date = RealDate; });
