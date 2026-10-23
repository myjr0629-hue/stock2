// Guardian default / supplied edition vs the real common option-metrics reader. Offline only.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const compiled = new Map();

function harness(iso, patch = {}) {
    let now = Date.parse(iso);
    const edition = { options_status: 'OK', expiration: '2026-10-23', chainDate: '2026-10-22',
        netGex: 400297625, underlyingPrice: 763.96, ...patch };
    const points = Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, gex: -6017528 }));
    const reads = [];
    let afterRead = () => {};
    class ClockDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const mocks = {
        '@/services/redisClient': { mgetFromCache: async keys => {
            assert.deepEqual(Array.from(keys), ['structure:v2:SPY']);
            return [{ data: edition }];
        } },
        '@/lib/aws/dynamoDataProvider': { getLatestGex: async () => null, getGexHistory: async () => [] },
    };
    const modules = new Map();
    function load(relative) {
        const file = path.resolve(root, relative.endsWith('.ts') ? relative : relative + '.ts');
        assert.ok(file.startsWith(path.join(root, 'src') + path.sep));
        if (modules.has(file)) return modules.get(file).exports;
        const mod = { exports: {} };
        modules.set(file, mod);
        if (!compiled.has(file)) compiled.set(file, ts.transpileModule(fs.readFileSync(file, 'utf8'), {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
        }).outputText);
        vm.runInNewContext(compiled.get(file), {
            exports: mod.exports, module: mod, Date: ClockDate, process: { env: {} }, AbortController,
            setTimeout, clearTimeout,
            fetch: async url => {
                const parsed = new URL(url);
                assert.equal(parsed.pathname, '/get', 'read-only Redis proxy, no supplier requests');
                const key = parsed.searchParams.get('key');
                assert.ok(['structure:v2:SPY', 'intrinio:gex:bf:SPY'].includes(key));
                reads.push(key);
                afterRead();
                return { ok: true, json: async () => ({ result: key.startsWith('structure:') ? { data: edition } : { points } }) };
            },
            require: id => {
                if (Object.hasOwn(mocks, id)) return mocks[id];
                if (id.startsWith('@/')) return load('src/' + id.slice(2));
                if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id));
                throw new Error('Unexpected external dependency: ' + id);
            },
        }, { filename: file });
        return mod.exports;
    }
    return { load, edition, reads, points,
        advanceOnRead: iso => { afterRead = () => { now = Date.parse(iso); }; } };
}

for (const [iso, expiration, alive] of [
    ['2026-10-23T15:59:59-04:00', '2026-10-23', true],
    ['2026-10-23T16:00:00-04:00', '2026-10-23', false],
    ['2026-10-23T16:10:00-04:00', '2026-10-23', false],
    ['2026-10-23T20:01:00-04:00', '2026-10-23', false], // UTC is already Saturday
    ['2026-10-24T12:00:00-04:00', '2026-10-23', false],
    ['2026-10-25T12:00:00-04:00', '2026-10-23', false],
    ['2026-10-26T08:00:00-04:00', '2026-10-23', false],
    ['2026-10-23T16:10:00-04:00', '2026-10-30', true],
    ['2026-11-27T12:59:59-05:00', '2026-11-27', true],
    ['2026-11-27T13:00:00-05:00', '2026-11-27', false],
    ['2026-11-27T13:10:00-05:00', '2026-12-04', true],
    ['2026-11-26T12:00:00-05:00', '2026-11-25', false],
    ['2026-11-26T12:00:00-05:00', '2026-11-27', true],
    ['2026-11-02T08:00:00-05:00', '2026-10-30', false], // after DST change
]) test(`${iso} / ${expiration}: Guardian and supplied edition match common GEX eligibility`, async () => {
    const h = harness(iso, { expiration });
    const get = h.load('src/services/dealerGamma').getDealerGamma;
    const common = (await h.load('src/services/optionMetricsService').readOptionMetrics(['SPY'])).get('SPY');
    const guardian = await get('SPY');
    assert.equal(guardian?.gex ?? null, common.gex);
    assert.equal(common.gex, alive ? h.edition.netGex : null);
    assert.equal(guardian?.percentile ?? null, alive ? 100 : null);
    assert.equal(guardian?.date ?? null, alive ? '2026-10-22' : null);
    const supplied = await get('SPY', undefined, undefined, h.edition);
    assert.equal(JSON.stringify(supplied), JSON.stringify(guardian));
    assert.equal(h.reads.filter(key => key === 'structure:v2:SPY').length, 1, 'supplied edition adds no structure read');
    assert.equal(h.reads.filter(key => key === 'intrinio:gex:bf:SPY').length, 2, 'one historical read per call');
});

test('unknown expiry / NO_MARKET / explicitly missing edition cannot use a historical current value', async () => {
    for (const patch of [{ expiration: null }, { expiration: undefined }, { options_status: 'NO_MARKET' }]) {
        const h = harness('2026-10-23T15:59:00-04:00', patch);
        const get = h.load('src/services/dealerGamma').getDealerGamma;
        assert.equal(await get('SPY'), null);
        assert.equal(await get('SPY', null, null, h.edition), null);
    }
    const h = harness('2026-10-23T15:59:00-04:00');
    assert.equal(await h.load('src/services/dealerGamma').getDealerGamma('SPY', null, null, null), null);
    assert.ok(!h.reads.includes('structure:v2:SPY'));
});

test('expiry is checked after Redis I/O crosses the closing boundary', async () => {
    const h = harness('2026-10-23T15:59:59-04:00');
    h.advanceOnRead('2026-10-23T16:00:00-04:00');
    assert.equal(await h.load('src/services/dealerGamma').getDealerGamma('SPY'), null);
});

test('unexpired observed zero survives; missing history keeps GEX and null percentile', async () => {
    const h = harness('2026-10-23T16:10:00-04:00', { expiration: '2026-10-30', netGex: 0 });
    h.points.length = 0;
    const result = await h.load('src/services/dealerGamma').getDealerGamma('SPY');
    assert.equal(result.gex, 0);
    assert.equal(result.percentile, null);
    assert.equal(result.samples, 0);
});
