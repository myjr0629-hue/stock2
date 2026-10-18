/** Offline regression: session-aware VWAP merge and the real route's cache-write block. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { mergeFreshOverStale } from '../src/lib/mergeFreshOverStale';

const friday = '2026-10-16';
const monday = '2026-10-19';
const payload = (iso: string, vwap: number | null, session = 'REG') => ({
    ticker: 'NVDA', tsServer: Date.parse(iso), session, vwap, price: 220, prevClose: 210,
    prices: { lastTrade: 220, prevRegularClose: 210 }, display: { price: 220 },
});
const cachedFriday = payload('2026-10-16T19:00:00Z', 216.1831);
const weekend = payload('2026-10-18T01:55:00Z', null, 'CLOSED');
const mondayOpen = payload('2026-10-19T14:00:00Z', null);

test('weekend null retains Friday VWAP and its Friday date (NVDA/AAPL)', () => {
    for (const value of [216.1831, 343.8167]) {
        const merged = mergeFreshOverStale({ ...cachedFriday, vwap: value }, weekend);
        assert.equal(merged.vwap, value);
        assert.equal(merged.vwapSessionDate, friday);
        assert.equal(merged.tsServer, weekend.tsServer);
        assert.equal(merged.session, 'CLOSED');
    }
});
test('Monday regular session null clears Friday VWAP and its date', () => {
    const merged = mergeFreshOverStale(cachedFriday, mondayOpen);
    assert.equal(merged.vwap, null);
    assert.equal(merged.vwapSessionDate, null);
});
test('same-session null retains the measured VWAP', () => {
    const merged = mergeFreshOverStale(cachedFriday, payload('2026-10-16T19:30:00Z', null));
    assert.equal(merged.vwap, 216.1831);
    assert.equal(merged.vwapSessionDate, friday);
});
test('a fresh measured value replaces cached VWAP, including across sessions', () => {
    const merged = mergeFreshOverStale(cachedFriday, { ...mondayOpen, vwap: 222.5 });
    assert.equal(merged.vwap, 222.5);
    assert.equal(merged.vwapSessionDate, monday);
});
test('a null-contaminated cache recovers on the next measured value', () => {
    for (const stale of [{ ...cachedFriday, vwap: null }, { ...weekend, vwapSessionDate: null }]) {
        const merged = mergeFreshOverStale(stale, { ...weekend, vwap: 216.1831 });
        assert.equal(merged.vwap, 216.1831);
        assert.equal(merged.vwapSessionDate, friday);
    }
});
test('holiday and the following premarket retain the last regular-session value', () => {
    const stale = payload('2026-09-04T19:00:00Z', 100);
    for (const iso of ['2026-09-07T16:00:00Z', '2026-09-08T13:29:59Z']) {
        const merged = mergeFreshOverStale(stale, payload(iso, null, 'CLOSED'));
        assert.equal(merged.vwap, 100);
        assert.equal(merged.vwapSessionDate, '2026-09-04');
    }
    assert.equal(mergeFreshOverStale(stale, payload('2026-09-08T13:30:00Z', null)).vwap, null);
});
test('premarket-to-regular boundary is 09:30 ET, including EST', () => {
    for (const [stale, before, open] of [
        [cachedFriday, '2026-10-19T13:29:59Z', '2026-10-19T13:30:00Z'],
        [payload('2026-12-24T18:00:00Z', 100), '2026-12-28T14:29:59Z', '2026-12-28T14:30:00Z'],
    ] as const) {
        assert.equal(mergeFreshOverStale(stale, payload(before, null, 'PRE')).vwap, stale.vwap);
        assert.equal(mergeFreshOverStale(stale, payload(open, null)).vwap, null);
    }
});
test('repeated merges cannot relabel Friday VWAP as a Monday value', () => {
    let stale = mergeFreshOverStale(cachedFriday, weekend);
    stale = mergeFreshOverStale(stale, payload('2026-10-19T13:29:00Z', null, 'PRE'));
    assert.equal(stale.vwapSessionDate, friday);
    stale = mergeFreshOverStale(stale, mondayOpen);
    assert.equal(stale.vwap, null);
    stale = mergeFreshOverStale(stale, payload('2026-10-19T15:00:00Z', null));
    assert.equal(stale.vwap, null);
});
test('explicit VWAP date takes precedence over a refreshed cache timestamp', () => {
    const stale = { ...cachedFriday, tsServer: mondayOpen.tsServer, vwapSessionDate: friday };
    assert.equal(mergeFreshOverStale(stale, mondayOpen).vwap, null);
});
test('missing/unusable dates never reuse a cached VWAP; new values can still recover', () => {
    for (const tsServer of [undefined, null, 0, NaN, Infinity, '2026-10-16']) {
        assert.equal(mergeFreshOverStale({ ...cachedFriday, tsServer }, weekend).vwap, null);
        assert.equal(mergeFreshOverStale(cachedFriday, { ...weekend, tsServer }).vwap, null);
    }
    assert.equal(mergeFreshOverStale({ ...cachedFriday, vwapSessionDate: null }, weekend).vwap, null);
    assert.equal(mergeFreshOverStale({}, { ...weekend, vwap: 222 }).vwap, 222);
});
test('omitted VWAP is also limited to the same session; invalid prices are never VWAP', () => {
    const { vwap: _, ...sameSession } = weekend;
    const { vwap: __, ...nextSession } = mondayOpen;
    assert.equal(mergeFreshOverStale(cachedFriday, sameSession).vwap, 216.1831);
    assert.equal(mergeFreshOverStale(cachedFriday, nextSession).vwap, null);
    for (const vwap of [0, -1, NaN, Infinity, '100']) {
        assert.equal(mergeFreshOverStale({ ...cachedFriday, vwap }, weekend).vwap, null);
        assert.equal(mergeFreshOverStale(cachedFriday, { ...mondayOpen, vwap }).vwap, null);
    }
});
test('other partial fields retain existing behavior and inputs are not mutated', () => {
    const stale = { ...cachedFriday, iv: 0.3, flow: { gex: 5, label: 'x' }, rows: [1] };
    const fresh = { ...weekend, price: 0, iv: null, flow: { gex: 0, label: null }, rows: [] };
    const before = structuredClone([stale, fresh]);
    const merged = mergeFreshOverStale(stale, fresh);
    assert.equal(merged.price, 220);
    assert.equal(merged.iv, 0.3);
    assert.deepEqual(merged.flow, stale.flow);
    assert.deepEqual(merged.rows, [1]);
    assert.deepEqual([stale, fresh], before);
    const noCache = mergeFreshOverStale(null, { ...weekend, flow: { gex: null }, quote: null, rows: [] });
    assert.equal(noCache.vwap, null);
    assert.equal(noCache.vwapSessionDate, null);
    assert.equal(noCache.quote, null);
    assert.deepEqual(noCache.rows, []);
    assert.deepEqual(noCache.flow, { gex: null });
});

// Execute production statements with an in-memory cache. No vendor, Redis, or environment access.
const routeFile = 'src/app/api/live/ticker/route.ts';
const route = fs.readFileSync(routeFile, 'utf8');
function source(file: string, predicate: (n: ts.Node) => boolean): string {
    const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    let found = '';
    const visit = (n: ts.Node) => { if (predicate(n)) found = n.getText(ast); ts.forEachChild(n, visit); };
    visit(ast);
    assert.ok(found, `missing production region: ${file}`);
    return found;
}
const fn = (name: string) => source(routeFile, n => ts.isFunctionDeclaration(n) && n.name?.text === name);
const decl = (file: string, name: string) => source(file, n => ts.isVariableDeclaration(n) && n.name.getText() === name);
const extFile = 'src/services/extendedSessionClose.ts';
const extFn = source(extFile, n => ts.isFunctionDeclaration(n) && n.name?.text === 'keepSessionScopedFresh');
const blockStart = route.indexOf('    const freshVerdict =');
const blockEnd = route.indexOf('    // ★ [2026-09-25] 예전엔', blockStart);
assert.ok(blockStart > 0 && blockEnd > blockStart);
const code = ts.transpileModule(`
    ${fn('isUsableTickerCache')}
    ${fn('lastGoodKey')}
    ${fn('tickerCacheKey')}
    const ${decl(routeFile, 'LAST_GOOD_PREFIX')};
    const ${decl(routeFile, 'LAST_GOOD_TTL')};
    const ${decl(routeFile, 'TICKER_CACHE_TTL')};
    const ${decl(extFile, 'SESSION_SCOPED')};
    ${extFn.replace('export ', '')}
    (async () => {
        const ${decl(routeFile, 'cacheKey')};
        ${route.slice(blockStart, blockEnd)}
        return { finalPayload, cacheKey, goodKey: lastGoodKey(ticker, skipAlpha, noChain) };
    })();
`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

async function routeWrite(stale: any, response: any, skipAlpha = false, noChain = false) {
    const writes = new Map<string, any>();
    const result = await vm.runInNewContext(code, {
        response, ticker: 'NVDA', skipAlpha, noChain, mergeFreshOverStale, Date,
        extPending: [], console: { warn() {} },
        getFromCache: async () => stale,
        setInCache: async (key: string, value: any, ttl: number) => {
            writes.set(key, { value: structuredClone(value), ttl });
        },
    });
    assert.equal(writes.size, 2);
    assert.equal(writes.get(result.cacheKey).ttl, 60);
    assert.equal(writes.get(result.goodKey).ttl, 12 * 3600);
    for (const key of [result.cacheKey, result.goodKey]) {
        assert.equal(writes.get(key).value.vwap, result.finalPayload.vwap);
        assert.equal(writes.get(key).value.vwapSessionDate, result.finalPayload.vwapSessionDate);
    }
    return result.finalPayload;
}
test('route full/nochain/lite cache writes retain Friday, clear Monday, then recover null caches', async () => {
    for (const [skipAlpha, noChain] of [[false, false], [false, true], [true, false], [true, true]]) {
        let saved = await routeWrite(cachedFriday, weekend, skipAlpha, noChain);
        assert.equal(saved.vwap, 216.1831);
        assert.equal(saved.vwapSessionDate, friday);
        saved = await routeWrite(saved, mondayOpen, skipAlpha, noChain);
        assert.equal(saved.vwap, null);
        assert.equal(saved.vwapSessionDate, null);
        saved = await routeWrite(saved, { ...mondayOpen, vwap: 222.5 }, skipAlpha, noChain);
        assert.equal(saved.vwap, 222.5);
        assert.equal(saved.vwapSessionDate, monday);
    }
});
test('route with no usable cache stamps the new VWAP date and preserves explicit null', async () => {
    for (const stale of [null, { vwap: 100 }, { ...cachedFriday, price: 0, prices: {} }]) {
        const saved = await routeWrite(stale, { ...mondayOpen, vwap: 222.5 });
        assert.equal(saved.vwap, 222.5);
        assert.equal(saved.vwapSessionDate, monday);
        const missing = await routeWrite(stale, { ...mondayOpen, quote: null });
        assert.equal(missing.vwap, null);
        assert.equal(missing.quote, null);
    }
});
