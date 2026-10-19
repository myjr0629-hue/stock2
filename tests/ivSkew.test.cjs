// Offline: NODE_PATH=<installed node_modules> node --test tests/ivSkew.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function compile(source, imports = {}, globals = {}) {
    const exports = {};
    const js = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    vm.runInNewContext(js, { exports, ...globals, require(name) {
        if (name in imports) return imports[name];
        throw new Error(`Unmocked import: ${name}`);
    } });
    return exports;
}
const model = compile(read('src/lib/ivSkew.ts'));
const plain = x => JSON.parse(JSON.stringify(x));
const date = '2026-10-16', expiry = '2026-10-16';
const row = (strike, type, fields = {}) => ({
    strike, type, iv: type === 'call' ? 0.25 : 0.30, gamma: 0.01, oi: 100,
    expiration: expiry, sourceSessionDate: date, ...fields,
});
const normal = (fields = {}) => ({ ticker: 'TEST', sourceSessionDate: date, underlyingPrice: 100, underlyingPriceSessionDate: date,
    session: 'CLOSED', atmSlice: [row(95, 'call'), row(95, 'put'), row(105, 'call'), row(105, 'put')], ...fields });

// Exercise the actual API GET with all network and storage dependencies replaced.
function apiHarness() {
    const cache = new Map(), expires = new Map(), writes = [];
    const state = { mode: 'normal', date: '2026-10-19', closeDate: date, closePrice: 100, spot: 150, strikes: [95, 105], ivAt: (strike, type) => type === 'call' ? 0.25 : 0.30, failCache: false, now: Date.parse('2026-10-16T20:00:00Z') };
    const modules = {
        'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
        '@/services/timezoneUtils': { getETNow: () => ({ hour: 12, minute: 0, isWeekend: false, dateString: state.date, displayString: state.date }) },
        '@/services/holidayCache': { findWeeklyExpiration: async () => expiry },
        '@/lib/cache/redisSWR': { swrFetch: async (key, fn) => {
            assert.match(key, /^options-atm:source-v[12]:/);
            if (state.mode === 'swrThrow') throw new Error('cache failure');
            return { data: await fn(), _cache: 'miss' };
        } },
        '@/services/redisClient': {
            getFromCache: async key => { if (state.failCache) throw new Error('cache offline'); return state.now < (expires.get(key) ?? 0) ? cache.get(key) ?? null : null; },
            setInCache: async (key, value, ttl) => { writes.push({ key, value, ttl }); cache.set(key, value); expires.set(key, state.now + ttl * 1000); return true; },
        },
        '@/lib/ivSkew': model,
        '@/services/massiveClient': { CACHE_POLICY: { LIVE: 'live' }, fetchMassive: async url => {
            if (state.mode === 'total') throw new Error('offline fixture');
            if (url.includes('/stocks/')) return { ticker: { day: { c: state.spot }, prevDay: { c: 149 } } };
            if (url.includes('/v1/open-close/')) {
                assert.equal(url, `/v1/open-close/TEST/${date}`);
                return { from: state.closeDate, close: state.closePrice };
            }
            if (state.mode === 'chainsOffline') throw new Error('chain offline fixture');
            const type = url.includes('contract_type=call') ? 'call' : 'put';
            if (state.mode === 'oneSide' && type === 'put') throw new Error('partial fixture');
            const strikes = state.mode === 'oneStrike' ? [95] : state.strikes;
            return { results: strikes.map(strike => ({
                details: { strike_price: strike, contract_type: type, expiration_date: expiry },
                // Compatibility fields can be zero-filled or realtime; neither is the dated EOD observation.
                implied_volatility: 0.99, greeks: { gamma: 0.9 }, open_interest: 999,
                day: { close: 5 }, last_quote: { last_updated: Date.parse('2026-10-19T16:00:00Z') * 1e6 },
                _intrinio: { date, ...(state.mode === 'legacy' ? {} : { eod: {
                    iv: state.mode === 'zero' ? 0 : (state.mode === 'missing' || state.mode === 'middleMissing' && strike === 100) ? null : state.ivAt(strike, type),
                    gamma: state.mode === 'zero' ? 0 : state.mode === 'missing' ? null : 0.01,
                    oi: state.mode === 'zero' ? 0 : state.mode === 'missing' ? null : 100,
                    close: 5,
                } }) },
            })) };
        } },
    };
    const { GET } = compile(read('src/app/api/live/options/atm/route.ts'), modules);
    return { state, cache, writes, seed: snapshot => {
        const key = `options-atm:source-v1:last-good:${snapshot.ticker}`;
        cache.set(key, snapshot); expires.set(key, state.now + 30 * 24 * 3600 * 1000);
    }, call: async (ticker = 'TEST') => (await GET({ nextUrl: new URL(`https://fixture.invalid/?t=${ticker}`) })).body };
}

test('total failure, no history: no generated strikes or neutral/zero IV', async () => {
    const h = apiHarness(); h.state.mode = 'total';
    const result = await h.call();
    assert.equal(result.atmSlice.length, 0);
    assert.equal(model.selectIVSnapshot(result, null, 'TEST'), null);
    const summary = model.summarizeIV([]);
    for (const key of ['avgCallIV', 'avgPutIV', 'avgDelta', 'skewDir', 'maxIV', 'fearStrike', 'targetStrike', 'crossover']) assert.equal(summary[key], null);
    assert.equal(h.writes.length, 0);
});

test('normal source persists; total failure restores exact dated, expired chain after 84 hours', async () => {
    const h = apiHarness();
    const original = await h.call();
    assert.equal(original.session, 'CLOSED');
    assert.equal(original.sourceSessionDate, date);
    assert.equal(original.atmSlice[0].iv, 0.25, 'EOD IV, not overlaid realtime 0.99');
    assert.equal(h.writes.length, 1);
    assert.ok(h.writes[0].ttl > 84 * 3600);
    h.state.mode = 'total'; h.state.date = '2026-10-20'; h.state.now += 84 * 3600 * 1000;
    const restored = await h.call();
    assert.equal(restored.restored, true);
    assert.deepEqual(plain(restored.atmSlice), plain(original.atmSlice));
    assert.equal(restored.sourceSessionDate, date);
    assert.equal(restored.underlyingPrice, original.underlyingPrice);
    assert.equal(h.writes.length, 1, 'failed response cannot replace last good');
    h.state.mode = 'swrThrow';
    assert.equal((await h.call()).restored, true);
});

test('one strike restores previous whole snapshot; without history it stays empty', async () => {
    const h = apiHarness(); const original = await h.call();
    h.state.mode = 'oneStrike';
    assert.deepEqual(plain((await h.call()).atmSlice), plain(original.atmSlice));
    const fresh = apiHarness(); fresh.state.mode = 'oneStrike';
    assert.equal(model.selectIVSnapshot(await fresh.call(), null, 'TEST'), null);
});

test('partial fields stay null, do not enter normal storage or invent opposite side/skew', async () => {
    const h = apiHarness(); h.state.mode = 'missing';
    const missing = await h.call();
    assert.ok(missing.atmSlice.every(c => c.iv === null && c.oi === null && c.gamma === null));
    assert.equal(h.writes.length, 0);
    assert.equal(model.selectIVSnapshot(missing, null, 'TEST'), null);
    h.state.mode = 'oneSide';
    const partial = await h.call();
    const summary = model.summarizeIV(model.groupIVStrikes(partial.atmSlice));
    assert.equal(summary.avgCallIV, 25); assert.equal(summary.avgPutIV, null);
    assert.equal(summary.avgDelta, null); assert.equal(summary.skewDir, null);
    assert.ok(summary.strikeData.every(c => c.putIV === null && c.putOI === null && c.putGamma === null));
    assert.equal(h.writes.length, 0);
    const fields = model.groupIVStrikes([row(95, 'call', { oi: null, gamma: null }), row(105, 'call', { iv: null, oi: 0, gamma: 0 }), row(105, 'put')]);
    assert.equal(fields[0].callOI, null); assert.equal(fields[1].callOI, 0);
    assert.equal(fields[1].callGamma, 0); assert.equal(fields[1].callIV, null);
});

test('true IV/OI/gamma zero survives API, grouping, averages, summary and format', async () => {
    const h = apiHarness(); h.state.mode = 'zero';
    const result = await h.call();
    assert.ok(result.atmSlice.every(c => c.iv === 0 && c.oi === 0 && c.gamma === 0));
    assert.equal(h.writes.length, 1);
    const summary = model.summarizeIV(model.groupIVStrikes(result.atmSlice));
    assert.equal(summary.avgCallIV, 0); assert.equal(summary.avgPutIV, 0);
    assert.equal(summary.avgDelta, 0); assert.equal(summary.skewDir, 'BALANCED');
    assert.equal(model.ivText(0), '0.0%'); assert.equal(model.ivText(null), '—');
    assert.equal(model.deltaText(0), '0.0%');
});

test('legacy zero-filled upstream cache is not accepted as actual zero', async () => {
    const h = apiHarness(); h.state.mode = 'legacy';
    const result = await h.call();
    assert.ok(result.atmSlice.every(c => c.iv === null && c.gamma === null && c.oi === null));
    assert.equal(h.writes.length, 0);
});

test('missing/corrupt dates, mixed expiry/date, invalid numbers and other ticker cannot masquerade as normal', () => {
    const original = normal();
    for (const bad of [null, undefined, { ...original, ticker: 'OTHER' }, normal({ atmSlice: [null] }),
        normal({ atmSlice: original.atmSlice.map(c => ({ ...c, sourceSessionDate: null })) }),
        normal({ atmSlice: original.atmSlice.map((c, i) => ({ ...c, expiration: i ? expiry : '2026-10-23' })) }),
        normal({ atmSlice: original.atmSlice.map((c, i) => ({ ...c, sourceSessionDate: i ? date : '2026-10-15' })) }),
    ]) assert.equal(model.selectIVSnapshot(bad, null, 'TEST'), null);
    assert.equal(model.selectIVSnapshot(null, original, 'OTHER'), null);
    for (const x of [undefined, null, '', '0', NaN, Infinity, -1]) assert.equal(model.sourceNumber(x), null);
    assert.equal(model.sourceNumber(0), 0);
    for (const x of ['2026-02-30', '2026-13-01', '2026-10-16T20:00:00Z', '']) assert.equal(model.sourceDate(x), null);
    const newer = normal({ sourceSessionDate: '2026-10-19', atmSlice: original.atmSlice.map(c => ({ ...c, sourceSessionDate: '2026-10-19' })) });
    assert.equal(model.selectIVSnapshot(original, newer, 'TEST').sourceSessionDate, '2026-10-19');
});

test('observation date comes from vendor timestamp in ET, never current clock', () => {
    const ms = Date.parse('2026-10-17T00:30:00Z');
    for (const x of [ms / 1000, ms, ms * 1000, ms * 1e6, '2026-10-17T00:30:00Z']) {
        assert.equal(model.observationTime(x).sourceSessionDate, '2026-10-16');
    }
    assert.equal(model.observationTime(undefined).sourceSessionDate, null);
    assert.equal(model.observationTime('2026-10-16').sourceSessionDate, null);
});

function render(snapshot, props = {}, previous = null) {
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    let stateIndex = 0;
    const Component = compile(read('src/components/IVSkewCurve.tsx'), {
        react: { useMemo: fn => fn(), useCallback: fn => fn, useEffect: () => {}, useState: () => [stateIndex++ === 0 ? null : previous, () => {}] },
        'react/jsx-runtime': require('react/jsx-runtime'),
        swr: { __esModule: true, default: () => ({ data: snapshot }) },
        'next-intl': { useLocale: () => 'ko' },
        '@/lib/ivSkew': model,
        '@/lib/marketSession': { closeLabel: (d, locale) => {
            assert.equal(d, date); assert.equal(locale, 'ko'); return '10/16(금) 마감 기준';
        } },
    }).default;
    return renderToStaticMarkup(React.createElement(Component, { ticker: 'TEST', underlyingPrice: 999, expiration: '2099-01-01', ...props }));
}

test('actual component render: empty chart retains labels/slots with —, no neutral interpretation or synthetic numbers', () => {
    const html = render(undefined);
    for (const text of ['IV SKEW CURVE', 'CALL (C):', 'PUT (P):', 'IV 스큐 종합', '평균 편차', '개 행사가', '—']) assert.ok(html.includes(text), text);
    assert.ok(!html.includes('0.0%')); assert.ok(!html.includes('BALANCED'));
    assert.ok(!html.includes('방향성 포지션 부재'));
    assert.ok(!html.includes('EXP:')); assert.ok(!html.includes('dots-'));
    assert.equal((html.match(/<circle[^>]+cx=/g) ?? []).length, 2, 'only the 2 legend dots remain');
});

test('actual component render: zero dots/averages, source date and expired source expiry; no fresh parent expiry', () => {
    const snapshot = normal({ restored: true, atmSlice: normal().atmSlice.map(c => ({ ...c, iv: 0, gamma: 0, oi: 0 })) });
    const html = render(snapshot);
    assert.ok(html.includes('0.0%')); assert.ok(html.includes('10/16(금) 마감 기준'));
    assert.ok(html.includes(`EXP: ${expiry}`)); assert.ok(!html.includes('2099-01-01'));
    assert.ok((html.match(/<circle[^>]+cx=/g) ?? []).length === 6, '4 source dots plus 2 legend dots');
    assert.ok(html.includes('장마감')); assert.ok(!html.includes('실시간 본장'));
});

test('actual component render: HTTP failure uses previous ticker snapshot; switching ticker cannot bleed', () => {
    assert.ok(render(undefined, {}, normal()).includes('25.0%'));
    const html = render(undefined, { ticker: 'OTHER' }, normal());
    assert.ok(!html.includes('25.0%')); assert.ok(!html.includes(`EXP: ${expiry}`));
});

test('actual adapter keeps EOD null/zero before compatibility defaults and realtime overlay; existing fields preserved', async () => {
    const source = read('src/services/intrinioClient.ts');
    const ast = ts.createSourceFile('adapter.ts', source, ts.ScriptTarget.Latest, true);
    const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'getOptionChainSnapshotIntrinio');
    assert.ok(fn);
    const fixtures = [null, 0, 0.25].map((iv, i) => ({ option: { code: `X${i}`, strike: 100 + i, type: 'call', expiration: expiry },
        prices: { date, implied_volatility: iv, gamma: iv, open_interest: iv, close: iv } }));
    const { getOptionChainSnapshotIntrinio } = compile(fn.getText(ast), {}, {
        process: { env: { INTRINIO_REALTIME_GREEKS: '1' } },
        num: x => typeof x === 'number' && Number.isFinite(x) ? x : null,
        fetchChainPagesIntrinio: async () => ({ rows: fixtures, missing: false, truncated: false, keys: [], pages: 1 }),
        getRealtimeGreeksIntrinio: async () => ({ greeks: new Map([['X0', { implied_volatility: 0.9, gamma: 0.8 }]]) }),
        dateToMs: () => Date.parse(`${date}T20:00:00Z`),
    });
    const result = await getOptionChainSnapshotIntrinio('TEST', { expiration: expiry, underlyingPrice: 100 });
    assert.deepEqual(plain(result.results.map(c => c._intrinio.eod.iv)), [null, 0, 0.25]);
    assert.deepEqual(plain(result.results.map(c => c._intrinio.eod.gamma)), [null, 0, 0.25]);
    assert.equal(result.results[0].implied_volatility, 0.9, 'existing realtime consumer unchanged');
    assert.equal(result.results[0].greeks.gamma, 0.8);
    assert.equal(result.results[0]._intrinio.date, date);
});

function renderWeb(response, props = {}, liveIV = new Map()) {
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const Web = compile(read('src/components/IVSkewCurveWeb.tsx'), {
        react: { useMemo: fn => fn(), useCallback: fn => fn, useEffect: () => {},
            useRef: initial => ({ current: initial }),
            useState: initial => [initial instanceof Map ? liveIV : typeof initial === 'function' ? initial() : initial, () => {}] },
        'react/jsx-runtime': require('react/jsx-runtime'),
        swr: { __esModule: true, default: () => ({ data: response }) },
        'lucide-react': { TrendingUp: () => null },
        'next-intl': { useLocale: () => 'ko' },
        '@/lib/marketSession': { closeLabel: d => { assert.equal(d, date); return '10/16(금) 마감 기준'; } },
        '@/providers/WebSocketProvider': { useRealtimeData: () => ({ optionsQuotes: new Map(), connected: true }) },
    }).default;
    return renderToStaticMarkup(React.createElement(Web, { ticker: 'TEST', underlyingPrice: 150, ...props }));
}

test('desktop web consumer accepts source-only API normal/null/zero responses', async () => {
    for (const mode of ['normal', 'missing', 'zero', 'total']) {
        const h = apiHarness(); h.state.mode = mode;
        const html = renderWeb(await h.call());
        assert.ok(!html.includes('NaN') && !html.includes('Infinity'), mode);
        if (mode === 'normal') assert.ok(html.includes('25.0%'));
    }
});

test('regression 1: restored API chain renders its own expiry/date despite different parent expiry and quote', async () => {
    const h = apiHarness(); await h.call(); h.state.mode = 'total';
    const restored = await h.call();
    assert.equal(restored.restored, true);
    const html = renderWeb(restored, { expiration: '2026-10-23', underlyingPrice: 999 },
        new Map([[95, { callIV: 99, putIV: 99 }]]));
    assert.ok(html.includes(`EXP: ${expiry}`));
    assert.ok(!html.includes('2026-10-23'));
    assert.ok(html.includes('10/16(금) 마감 기준'));
    assert.ok(html.includes('25.0%'));
    assert.ok(!html.includes('99.0%'));
    assert.ok(!html.includes('>LIVE<'));
});

test('regression 2: both IVs missing at middle strike cannot overwrite complete last-good', async () => {
    const h = apiHarness(); h.state.strikes = [95, 100, 105];
    const complete = await h.call();
    h.state.mode = 'middleMissing';
    const partial = await h.call();
    assert.equal(partial.atmSlice.length, 6);
    assert.equal(model.groupIVStrikes(partial.atmSlice).length, 2, 'old grouping hid the missing center');
    assert.equal(model.isNormalIVSnapshot(partial), false);
    assert.equal(h.writes.length, 1);
    h.state.mode = 'total';
    const restored = await h.call();
    assert.equal(restored.restored, true);
    assert.deepEqual(plain(restored.atmSlice), plain(complete.atmSlice));
    assert.equal(restored.atmSlice.length, 6);
    // A duplicate missing row must not be hidden by the later valid row either.
    assert.equal(model.isNormalIVSnapshot(normal({ atmSlice: [row(95, 'call', { iv: null }), ...normal().atmSlice] })), false);
});

test('regression 3: historical ATM slice, marker and annotations use that chain date close', async () => {
    const h = apiHarness(); h.state.strikes = Array.from({ length: 17 }, (_, i) => 70 + i * 5);
    h.state.ivAt = (strike, type) => type === 'call' ? (strike === 120 ? 0.50 : 0.25) : (strike === 85 ? 0.60 : 0.30);
    const snapshot = await h.call();
    assert.equal(snapshot.underlyingPrice, 100);
    assert.equal(snapshot.underlyingPriceSessionDate, date);
    assert.equal(snapshot.sourceSessionDate, date);
    assert.deepEqual(plain(snapshot.atmSlice.slice(0, 4).map(c => [c.strike, c.type])),
        [[70, 'call'], [70, 'put'], [75, 'call'], [75, 'put']], 'home table keeps paired strike order');
    assert.equal(snapshot.atmSlice[0].strike, 70);
    assert.equal(snapshot.atmSlice.at(-1).strike, 140, 'slice centered at historical 100, not current 150');
    const grouped = model.groupIVStrikes(snapshot.atmSlice, snapshot.underlyingPrice);
    assert.deepEqual(plain(grouped.filter(c => c.isATM).map(c => c.strike)), [100]);
    const summary = model.summarizeIV(grouped);
    assert.equal(summary.fearStrike.strike, 85);
    assert.equal(summary.targetStrike.strike, 120);
    const html = render(snapshot, { underlyingPrice: 150 });
    assert.ok(html.includes('10/16(금) 마감 기준'));
    assert.ok(html.includes('>ATM</text>'));
    assert.ok(html.includes('▼공포라인') && html.includes('▲기대타겟'), 'annotations follow the historical ATM');
    const expectedX = 45 + (100 - 70) / (140 - 70) * 460;
    assert.ok(html.includes(`x1="${expectedX}"`), 'actual mobile ATM marker uses historical spot');
    const untrustedParent = normal({ underlyingPrice: 150, underlyingPriceSessionDate: '2026-10-19' });
    const parentHtml = render(snapshot, { atmSlice: untrustedParent.atmSlice, sourceSessionDate: date,
        underlyingPrice: 150, underlyingPriceSessionDate: '2026-10-19' });
    assert.ok(parentHtml.includes(`x1="${expectedX}"`), 'mismatched parent quote cannot bypass dated API');
    for (const invalid of [{ closePrice: null }, { closePrice: 0 }, { closeDate: '2026-10-19' }]) {
        const h2 = apiHarness(); const original = await h2.call();
        Object.assign(h2.state, invalid);
        const restored = await h2.call();
        assert.equal(restored.restored, true);
        assert.equal(restored.underlyingPrice, original.underlyingPrice);
        assert.equal(h2.writes.length, 1, 'bad historical close cannot overwrite complete snapshot');
        const fresh = apiHarness(); Object.assign(fresh.state, invalid);
        assert.equal((await fresh.call()).atmSlice.length, 0);
        assert.equal(fresh.writes.length, 0);
    }
});

test('existing last-good keeps source rows while legacy current-price basis is repaired or unavailable', async () => {
    for (const mode of ['chainsOffline', 'total']) {
        const h = apiHarness();
        const legacy = normal({ underlyingPrice: 150, underlyingPriceSessionDate: undefined });
        h.seed(legacy); h.state.mode = mode;
        const restored = await h.call();
        assert.equal(restored.restored, true);
        assert.deepEqual(plain(restored.atmSlice), plain(legacy.atmSlice));
        assert.equal(restored.sourceSessionDate, date);
        assert.equal(restored.underlyingPrice, mode === 'chainsOffline' ? 100 : null);
        assert.equal(restored.underlyingPriceSessionDate, mode === 'chainsOffline' ? date : null);
        assert.ok(renderWeb(restored, { atmSlice: legacy.atmSlice, underlyingPrice: 999,
            expiration: '2026-10-23' }).includes(`EXP: ${expiry}`));
    }
});
