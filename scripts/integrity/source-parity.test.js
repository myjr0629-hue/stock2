'use strict';
// Offline only: node scripts/integrity/source-parity.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const clock = require('./clock');
const parity = require('./source-parity');
const worker = require('./source-parity-worker');
const targets = require('./source-parity-target');
const TARGET = targets.resolve();
const PREVIEW = targets.resolve({ base: 'https://preview.example.test', hub: 'wss://preview-hub.example.test:8443/stream' });
const AT = clock.etToMs('2026-10-15', '11:00:00');
let n = 0;
async function test(name, fn) {
    if (process.argv[2] && !name.includes(process.argv[2])) return;
    await fn(); n++; console.log(`  ✓ ${name}`);
}
function snapshot(symbols = ['TEST'], { app = 100, hub = 100, source = 100, appTime = AT, sourceTime = AT } = {}) {
    return { at: AT, target: TARGET, live: true, rows: Object.fromEntries(symbols.map((s) => [s, {
        app: { p: app, last_time: appTime }, hub: { p: hub, t: AT }, source: { p: source, t: sourceTime }, started: AT, ended: AT + 1000,
    }])) };
}
const errors = (r) => r.findings.filter((f) => f.sev === 'error');
async function replay(first, second, extra = {}) {
    let calls = 0, elapsed = 0;
    const result = await parity.monitor({ symbols: ['TEST'], now: () => AT + elapsed,
        sleep: async (ms) => { assert.equal(ms, 20000); elapsed += ms; },
        collect: async () => { calls++; return calls === 1 ? first : second; }, ...extra });
    return { result, calls, elapsed };
}

(async () => {
    await test('target validation rejects production/preview mixing and unsafe endpoint data', async () => {
        assert.deepEqual(targets.resolve(), TARGET);
        assert.equal(targets.resolve({ base: PREVIEW.base }), null);
        assert.equal(targets.resolve({ hub: PREVIEW.hub }), null);
        assert.equal(targets.resolve({ base: 'https://signumhq.com', hub: PREVIEW.hub }), null);
        for (const base of ['invalid', 'file:///tmp/app', 'https://preview.example.test?private=value', 'https://preview.example.test/#value', 'https://user:value@preview.example.test']) {
            assert.equal(targets.resolve({ ...PREVIEW, base }), null);
        }
        assert.equal(targets.resolve({ ...PREVIEW, source: 'https://other.example.test' }), null);
        assert.equal(targets.resolve({ ...PREVIEW, feed: 'delayed' }), null);
        assert.equal(targets.hubHttp(PREVIEW), 'https://preview-hub.example.test:8443/last');
        const local = targets.resolve({ base: 'http://localhost:3000/', hub: 'ws://localhost:8080/stream' });
        assert.equal(local.base, 'http://localhost:3000');
        assert.equal(targets.hubHttp(local), 'http://localhost:8080/last');
        const invalid = await parity.monitor({ symbols: ['TEST'], target: null, now: () => AT, collect: async () => { assert.fail('must not collect mixed targets'); } });
        assert.equal(invalid.calls, 0); assert.equal(invalid.findings[0].code, 'SOURCE_PARITY_ENVIRONMENT');
        const rejected = await worker.run({ symbols: ['TEST'], target: { ...TARGET, base: PREVIEW.base } }, {
            clock, getKey: () => assert.fail('must not read key'), read: () => assert.fail('must not read endpoints'),
        });
        assert.deepEqual(rejected, { environmentMismatch: true });
    });
    await test('missing or mismatched app/hub/source provenance cannot produce parity judgments', async () => {
        for (const target of [undefined, PREVIEW, { ...TARGET, base: PREVIEW.base }, { ...TARGET, hub: PREVIEW.hub }, { ...TARGET, source: PREVIEW.base }, { ...TARGET, feed: 'delayed' }]) {
            const s = { ...snapshot(['TEST'], { app: 101 }), target };
            const { result, calls } = await replay(s, s);
            assert.equal(calls, 1); assert.equal(errors(result).length, 0);
            assert.deepEqual(result.initial, { environmentMismatch: true });
            assert.equal(result.findings[0].code, 'SOURCE_PARITY_ENVIRONMENT');
        }
        const changed = { ...snapshot(['TEST'], { app: 101 }), target: PREVIEW };
        const { result } = await replay(snapshot(['TEST'], { app: 101 }), changed);
        assert.equal(errors(result).length, 0);
        assert.ok(result.findings.some((f) => f.code === 'UNCONFIRMED_SOURCE_PARITY'));
        assert.ok(result.findings.some((f) => f.code === 'SOURCE_PARITY_ENVIRONMENT'));
    });
    await test('preview target reaches initial and confirmation reads without production fallback', async () => {
        const seen = [];
        const result = await parity.monitor({ symbols: ['TEST'], target: PREVIEW, now: () => AT, sleep: async () => {},
            collect: async (symbols, target) => {
                seen.push(target); assert.deepEqual(target, PREVIEW); assert.ok(Object.isFrozen(target));
                return { ...snapshot(symbols, { app: 101 }), target };
            } });
        assert.equal(seen.length, 2); assert.equal(seen[0], seen[1]);
        assert.equal(errors(result).length, 1); assert.equal(result.calls, 2);
        assert.deepEqual(result.target, PREVIEW);
    });
    await test('worker selects configured app and hub while retaining the independent vendor feed', async () => {
        for (const target of [TARGET, PREVIEW, targets.resolve({ base: 'http://localhost:3000', hub: 'ws://localhost:8080' })]) {
            const urls = [];
            const result = await worker.run({ symbols: ['TEST'], target }, { clock, now: () => AT, getKey: () => 'synthetic', read: async (url) => {
                const u = new URL(url); urls.push(u);
                const body = u.pathname === '/last' ? { live: true, ticks: { TEST: { p: 100, trade: AT } } }
                    : u.pathname === '/api/live/quotes' ? { data: { TEST: { price: 100, last_time: new Date(AT).toISOString() } } }
                        : { source: target.feed, last_price: 100, last_time: new Date(AT).toISOString() };
                return { body, ended: AT + 1000 };
            } });
            assert.equal(urls[0].origin, new URL(target.base).origin);
            assert.equal(urls[1].origin, new URL(targets.hubHttp(target)).origin);
            assert.equal(urls[2].origin, target.source); assert.equal(urls[2].searchParams.get('source'), target.feed);
            assert.deepEqual(parity.judge(parity.sanitize(result, ['TEST'], target), ['TEST'], target), []);
        }
    });
    await test('REG only: pre/post/holiday/weekend/early close do not collect', async () => {
        for (const [day, hms] of [['2026-10-15', '09:29:59'], ['2026-10-15', '16:00:00'], ['2026-11-26', '11:00:00'], ['2026-10-17', '11:00:00'], ['2026-11-27', '13:00:00']]) {
            const result = await parity.monitor({ symbols: ['TEST'], now: () => clock.etToMs(day, hms), collect: () => { throw new Error('must not collect'); } });
            assert.equal(result.skipped, true); assert.equal(result.calls, 0);
        }
    });
    await test('0.10% inclusive passes; above threshold on both doors confirms after 20s', async () => {
        for (const price of [100, 100.1, 99.9]) assert.equal(parity.judge(snapshot(['TEST'], { app: price, hub: price }), ['TEST']).length, 0);
        for (const price of [100.1001, 99.8999]) {
            const s = snapshot(['TEST'], { app: price, hub: price });
            const { result, calls, elapsed } = await replay(s, s);
            assert.equal(calls, 2); assert.equal(elapsed, 20000); assert.equal(result.calls, 2);
            assert.deepEqual(errors(result).map((f) => [f.code, f.door]), [['SOURCE_PARITY', 'app'], ['SOURCE_PARITY', 'hub']]);
            assert.ok(errors(result).every((f) => f.confirmed && f.sourceTime === AT && f.appTime === AT));
        }
    });
    await test('STALE_APP uses conveyed source last_time with a strict 60s boundary', async () => {
        assert.equal(parity.judge(snapshot(['TEST'], { appTime: AT - 60000 }), ['TEST']).length, 0);
        const s = snapshot(['TEST'], { appTime: AT - 60001 });
        const { result } = await replay(s, s);
        assert.deepEqual(errors(result).map((f) => f.code), ['STALE_APP']);
        const q = snapshot(); q.rows.TEST.app.last_time = null; q.rows.TEST.app.t = AT - 120000; q.rows.TEST.app.lastUpdate = AT;
        assert.equal(parity.judge(q, ['TEST'])[0].code, 'SOURCE_PARITY_APP_TIME');
    });
    await test('transient, failed confirmation, and new second-only mismatch are not confirmed errors', async () => {
        const bad = snapshot(['TEST'], { app: 101 });
        const cleared = await replay(bad, snapshot());
        assert.equal(errors(cleared.result).length, 0);
        assert.ok(cleared.result.findings.some((f) => f.code === 'TRANSIENT_SOURCE_PARITY'));
        for (const s of [{ failure: true }, { ...snapshot(), rows: {} }, (() => { const s = snapshot(); s.rows.TEST.app = null; return s; })()]) {
            const { result } = await replay(bad, s);
            assert.equal(errors(result).length, 0);
            assert.ok(result.findings.some((f) => f.code === 'UNCONFIRMED_SOURCE_PARITY'));
        }
        const { result } = await replay(bad, snapshot(['TEST'], { hub: 102 }));
        assert.equal(errors(result).length, 0);
        const missingTime = snapshot(['TEST'], { appTime: null });
        const clearedWithoutTime = await replay(bad, missingTime);
        assert.ok(clearedWithoutTime.result.findings.some((f) => f.code === 'TRANSIENT_SOURCE_PARITY'));
        const stale = snapshot(['TEST'], { appTime: AT - 60001 });
        const staleWithoutTime = await replay(stale, missingTime);
        assert.ok(staleWithoutTime.result.findings.some((f) => f.code === 'UNCONFIRMED_STALE_APP'));
        assert.equal(errors(staleWithoutTime.result).length, 0);
    });
    await test('all 41 symbols confirm both doors within the 82-call round cap', async () => {
        const symbols = Array.from({ length: 41 }, (_, i) => `S${i}`), s = snapshot(symbols, { app: 101, hub: 102, appTime: null });
        let calls = 0, waits = 0;
        const batches = [];
        const result = await parity.monitor({ symbols, now: () => AT,
            collect: async (list) => { batches.push(list); calls += list.length; return s; },
            sleep: async (ms) => { assert.equal(ms, 20000); waits++; } });
        assert.deepEqual(batches, [symbols, symbols]); assert.equal(waits, 1);
        assert.equal(calls, 82); assert.equal(result.calls, 82); assert.equal(result.maxCalls, 82);
        assert.equal(errors(result).length, 82); assert.ok(errors(result).every((f) => f.confirmed));
        assert.ok(errors(result).filter((f) => f.door === 'app').every((f) => f.appTime === null));
        const tooMany = await parity.monitor({ symbols: [...symbols, 'EXTRA'], now: () => AT, collect: () => { throw new Error('invalid list'); } });
        assert.equal(tooMany.calls, 0);
    });
    await test('confirmation reserves only unique affected symbols and charges failed attempts', async () => {
        const symbols = Array.from({ length: 41 }, (_, i) => `S${i}`), initial = snapshot(symbols);
        initial.rows.S0.app.p = 101; initial.rows.S0.hub.p = 102; initial.rows.S1.hub.p = 102;
        let batches = [];
        const collect = async (list) => { batches.push(list); if (batches.length === 1) return initial; throw new Error('private failure'); };
        const result = await parity.monitor({ symbols, now: () => AT, collect, sleep: async () => {} });
        assert.deepEqual(batches, [symbols, ['S0', 'S1']]); assert.equal(result.calls, 43);
        assert.equal(errors(result).length, 0);
        assert.equal(result.findings.filter((f) => f.code === 'UNCONFIRMED_SOURCE_PARITY').length, 3);
        assert.equal(result.findings.filter((f) => f.code === 'SOURCE_UNAVAILABLE').length, 2);
        assert.ok(!JSON.stringify(result).includes('private failure'));
        batches = [];
        const failed = await parity.monitor({ symbols, now: () => AT, collect: async (list) => {
            batches.push(list); if (batches.length === 1) return snapshot(symbols, { app: 101, hub: 102 });
            return { failure: true };
        }, sleep: async () => {} });
        assert.equal(batches.length, 2); assert.equal(failed.calls, 82);
        assert.equal(errors(failed).length, 0);
        assert.equal(failed.findings.filter((f) => f.code === 'SOURCE_UNAVAILABLE').length, 41);
    });
    await test('no-confirm never emits unconfirmed price errors; failed reads charge budget', async () => {
        const { result, calls } = await replay(snapshot(['TEST'], { app: 101 }), null, { noConfirm: true });
        assert.equal(calls, 1); assert.equal(errors(result).length, 0);
        const failed = await parity.monitor({ symbols: ['TEST'], now: () => AT, collect: async () => { throw new Error('private details must not escape'); } });
        assert.equal(failed.calls, 1); assert.ok(!JSON.stringify(failed).includes('private details'));
    });
    await test('missing source, wrong session, >2s window, and fallback hub cannot pass as parity', async () => {
        assert.equal(parity.judge({ target: TARGET, rows: {} }, ['TEST'])[0].code, 'SOURCE_UNAVAILABLE');
        const slow = snapshot(); slow.rows.TEST.ended = AT + 2001;
        assert.equal(parity.judge(slow, ['TEST'])[0].code, 'SOURCE_PARITY_WINDOW');
        const exact = snapshot(); exact.rows.TEST.ended = AT + 2000;
        assert.equal(parity.judge(exact, ['TEST']).length, 0);
        const missing = snapshot(); missing.rows.TEST.source = null;
        assert.equal(parity.judge(missing, ['TEST'])[0].code, 'SOURCE_UNAVAILABLE');
        const fallback = snapshot(); fallback.live = false;
        assert.equal(parity.judge(fallback, ['TEST'])[0].door, 'hub');
        const boundary = snapshot(); boundary.rows.TEST.ended = clock.etToMs('2026-10-15', '16:00:00');
        assert.equal(parity.judge(boundary, ['TEST'])[0].code, 'SOURCE_PARITY_WINDOW');
    });
    await test('EC2 worker dispatches 41 source + 2 app + 1 hub concurrently in one 2s window', async () => {
        const symbols = Array.from({ length: 41 }, (_, i) => `S${i}`), pending = [], urls = [];
        const task = worker.run({ symbols, target: TARGET }, { clock, now: () => AT, getKey: () => 'synthetic', read: (url, deadline) => {
            assert.equal(deadline, AT + 2000); urls.push(new URL(url));
            return new Promise((resolve) => pending.push(() => {
                const u = new URL(url); let body;
                if (u.hostname === 'api-v2.intrinio.com') body = { source: 'equities_edge', last_price: 100, last_time: new Date(AT).toISOString(), ignored: 'discard' };
                else if (u.pathname === '/last') body = { live: true, ticks: Object.fromEntries(symbols.map((s) => [s, { p: 100, trade: AT }])) };
                else body = { data: Object.fromEntries(symbols.map((s) => [s, { price: 100, lastUpdate: AT }])) };
                resolve({ body, ended: AT + 1500 });
            }));
        } });
        assert.equal(pending.length, 44); pending.forEach((finish) => finish());
        const result = parity.sanitize(await task, symbols);
        assert.equal(Object.keys(result.rows).length, 41);
        const findings = parity.judge(result, symbols);
        assert.equal(findings.length, 41); assert.ok(findings.every((f) => f.code === 'SOURCE_PARITY_APP_TIME' && f.sev === 'warn'));
        assert.ok(Object.values(result.rows).every((r) => r.app.last_time === null && !('t' in r.app)));

        assert.equal(urls.filter((u) => u.hostname === 'api-v2.intrinio.com' && u.searchParams.get('source') === 'equities_edge').length, 41);
        assert.deepEqual(urls.filter((u) => u.pathname === '/api/live/quotes').map((u) => u.searchParams.get('symbols').split(',').length), [30, 11]);
        assert.ok(!JSON.stringify(result).includes('synthetic')); assert.ok(!JSON.stringify(result).includes('discard'));
    });
    await test('REG dispatch boundary: key lookup crossing normal or early close sends no requests', async () => {
        const symbols = Array.from({ length: 41 }, (_, i) => `S${i}`);
        for (const [day, hms] of [['2026-10-15', '16:00:00'], ['2026-11-27', '13:00:00']]) {
            const close = clock.etToMs(day, hms);
            for (const delay of [500, 1000]) {
                let current = close - 500;
                const reads = [];
                const result = await worker.run({ symbols, target: TARGET }, { clock, now: () => current,
                    getKey: () => { current += delay; return 'synthetic'; },
                    read: async (url) => { reads.push(new URL(url)); return { body: null, ended: current }; } });
                assert.equal(reads.filter((u) => u.origin === TARGET.source).length, 0, 'no source dispatch at/after REG close');
                assert.equal(reads.length, 0, 'no app/hub dispatch after key lookup crosses close');
                assert.deepEqual(result, { sessionAborted: true });
            }
            const outside = await worker.run({ symbols, target: TARGET }, { clock, now: () => close,
                getKey: () => assert.fail('must not read key outside REG'), read: () => assert.fail('must not dispatch outside REG') });
            assert.deepEqual(outside, { sessionAborted: true });
        }
    });
    await test('REG dispatch boundary: every app batch, hub and source request rechecks the session', async () => {
        const symbols = Array.from({ length: 41 }, (_, i) => `S${i}`);
        for (const [day, hms] of [['2026-10-15', '16:00:00'], ['2026-11-27', '13:00:00']]) {
            const close = clock.etToMs(day, hms);
            // Exercise each possible boundary between the 44 concurrent dispatches.
            for (let stopAfter = 1; stopAfter < 44; stopAfter++) {
                let current = close - 500, reads = 0, outside = 0;
                const result = await worker.run({ symbols, target: TARGET }, { clock, now: () => current, getKey: () => 'synthetic',
                    read: async () => {
                        if (current >= close) outside++;
                        const ended = current;
                        if (++reads === stopAfter) current = close;
                        return { body: null, ended };
                    } });
                assert.equal(outside, 0, `no post-close dispatch after request ${stopAfter}`);
                assert.equal(reads, stopAfter);
                assert.deepEqual(result, { sessionAborted: true }, 'discard partial round rather than return rows');
            }
        }
    });
    await test('REG dispatch boundary: aborted initial and confirmation rounds never judge partial prices', async () => {
        const partial = { ...snapshot(['TEST'], { app: 101, hub: 102, appTime: AT - 60001 }), sessionAborted: true };
        const aborted = { sessionAborted: true };
        assert.deepEqual(parity.sanitize(partial, ['TEST']), aborted);
        assert.deepEqual(parity.judge(partial, ['TEST']).map((f) => [f.code, f.sev]), [['SOURCE_PARITY_SESSION_ABORTED', 'warn']]);
        const initial = await replay(partial, snapshot());
        assert.equal(initial.calls, 1); assert.equal(errors(initial.result).length, 0);
        assert.deepEqual(initial.result.initial, aborted);
        assert.match(initial.result.findings[0].msg, /장외 중단/);
        const confirmed = await replay(snapshot(['TEST'], { app: 101 }), partial);
        assert.equal(confirmed.calls, 2); assert.equal(errors(confirmed.result).length, 0);
        assert.deepEqual(confirmed.result.confirmation, aborted);
        assert.ok(confirmed.result.findings.some((f) => f.code === 'UNCONFIRMED_SOURCE_PARITY'));
        assert.ok(!confirmed.result.findings.some((f) => f.code.startsWith('TRANSIENT_')));
        assert.ok(confirmed.result.findings.some((f) => f.code === 'SOURCE_PARITY_SESSION_ABORTED'));
    });
    await test('fresh lastUpdate cannot hide stale conveyed last_time; absent last_time stays unverified', async () => {
        async function wire(appFields, sourceTime) {
            return parity.sanitize(await worker.run({ symbols: ['TEST'], target: TARGET }, { clock, now: () => AT, getKey: () => 'synthetic', read: async (url) => {
                const u = new URL(url);
                const body = u.pathname === '/last' ? { live: true, ticks: { TEST: { p: 100, trade: AT } } }
                    : u.pathname === '/api/live/quotes' ? { data: { TEST: { price: 100, lastUpdate: AT, ...appFields } } }
                        : { source: 'equities_edge', last_price: 100, last_time: new Date(sourceTime).toISOString() };
                return { body, ended: AT + 1000 };
            } }), ['TEST']);
        }
        const s = await wire({ last_time: new Date(AT - 60001).toISOString() }, AT);
        assert.equal(s.rows.TEST.app.last_time, AT - 60001);
        const stale = await replay(s, s);
        assert.deepEqual(errors(stale.result).map((f) => f.code), ['STALE_APP']);
        for (const sourceTime of [AT, AT - 120000]) {
            const missing = await wire({}, sourceTime);
            const { result, calls } = await replay(missing, missing);
            assert.equal(calls, 1); assert.equal(errors(result).length, 0);
            assert.equal(result.findings[0].code, 'SOURCE_PARITY_APP_TIME');
            assert.equal(result.findings[0].appTime, null); assert.equal(result.findings[0].sourceTime, sourceTime);
            assert.equal(result.findings[0].sev, 'warn');
        }
        const legacy = snapshot(); delete legacy.rows.TEST.app.last_time;
        legacy.rows.TEST.app.t = AT - 120000; legacy.rows.TEST.app.lastUpdate = AT;
        const clean = parity.sanitize(legacy, ['TEST']);
        assert.deepEqual(clean.rows.TEST.app, { p: 100, last_time: null });
        assert.equal(parity.judge(clean, ['TEST'])[0].code, 'SOURCE_PARITY_APP_TIME');
    });
    await test('worker fails closed without remote environment key and rejects delayed source', async () => {
        const result = await worker.run({ symbols: ['TEST'], target: TARGET }, { clock, now: () => AT, getKey: () => null, read: () => { throw new Error('no key'); } });
        assert.deepEqual(result, { failure: true });
        const delayed = await worker.run({ symbols: ['TEST'], target: TARGET }, { clock, now: () => AT, getKey: () => 'synthetic', read: async () => ({ ended: AT + 100, body: { source: 'cboe_one_delayed', last_price: 100, last_time: new Date(AT).toISOString() } }) });
        assert.equal(delayed.rows.TEST.source, null);
    });
    await test('SSM bridge suppresses dotenv, ships valid public code, and allowlists returned data', async () => {
        const filename = require.resolve('../ec2-ssm'), prior = require.cache[filename], oldEnvFile = process.env.ENV_FILE;
        const vm = require('node:vm');
        try {
            process.env.ENV_FILE = '/dev/null';
            require.cache[filename] = { id: filename, filename, loaded: true, exports: { run: async ([command], opts) => {
                assert.equal(opts.timeout, 15);
                const encoded = /Buffer.from\("([A-Za-z0-9+/=]+)","base64"\)/.exec(command)[1];
                const program = Buffer.from(encoded, 'base64').toString();
                new vm.Script(program);
                assert.ok(!program.includes('dotenv')); assert.ok(!program.includes('readFileSync'));
                const s = snapshot(); s.untrusted = 'discard'; s.rows.TEST.app.untrusted = 'discard';
                return { status: 'Success', stdout: JSON.stringify(s), stderr: 'discard' };
            } } };
            const result = await parity.collectRemote(['TEST']);
            assert.ok(!JSON.stringify(result).includes('discard'));
            assert.equal(result.rows.TEST.app.p, 100); assert.equal(process.env.ENV_FILE, '/dev/null');
        } finally {
            if (prior) require.cache[filename] = prior; else delete require.cache[filename];
            if (oldEnvFile === undefined) delete process.env.ENV_FILE; else process.env.ENV_FILE = oldEnvFile;
        }
    });
    await test('SSM payload executes the configured preview worker offline and rejects wrong returned targets', async () => {
        const filename = require.resolve('../ec2-ssm'), prior = require.cache[filename];
        const vm = require('node:vm'), { EventEmitter } = require('node:events');
        const urls = [];
        let mismatch = false, crossClose = false;
        try {
            require.cache[filename] = { id: filename, filename, loaded: true, exports: { run: async ([command]) => {
                const encoded = /Buffer.from\("([A-Za-z0-9+/=]+)","base64"\)/.exec(command)[1];
                const program = Buffer.from(encoded, 'base64').toString();
                const close = clock.etToMs('2026-10-15', '16:00:00');
                let stdout = '', current = crossClose ? close - 500 : AT;
                const transport = { get: (url, options, onResponse) => {
                    const u = new URL(url); urls.push(u);
                    if (crossClose) current = close;
                    const req = new EventEmitter(); req.destroy = () => {};
                    queueMicrotask(() => {
                        const res = new EventEmitter(); res.statusCode = 200; onResponse(res);
                        const body = u.pathname === '/last' ? { live: true, ticks: { TEST: { p: 100, trade: AT } } }
                            : u.pathname === '/api/live/quotes' ? { data: { TEST: { price: 100, last_time: new Date(AT).toISOString() } } }
                                : { source: 'equities_edge', last_price: 100, last_time: new Date(AT).toISOString() };
                        res.emit('data', Buffer.from(JSON.stringify(body))); res.emit('end');
                    });
                    return req;
                } };
                await vm.runInNewContext(program, { URL, Buffer, Date: class extends Date { static now() { return current; } }, setTimeout, clearTimeout,
                    process: { env: { INTRINIO_API_KEY: 'synthetic' }, stdout: { write: (s) => { stdout += s; } } },
                    require: (id) => {
                        if (['node:http', 'node:https'].includes(id)) return transport;
                        if (id === 'node:child_process') return { execFileSync: () => assert.fail('must not access PM2') };
                        assert.fail('SSM payload must be self contained');
                    } });
                const result = JSON.parse(stdout);
                if (mismatch) result.target = TARGET;
                return { status: 'Success', stdout: JSON.stringify(result) };
            } } };
            const result = await parity.collectRemote(['TEST'], PREVIEW);
            assert.deepEqual(result.target, PREVIEW); assert.deepEqual(parity.judge(result, ['TEST'], PREVIEW), []);
            assert.deepEqual(urls.map((u) => u.origin), [PREVIEW.base, 'https://preview-hub.example.test:8443', PREVIEW.source]);
            assert.ok(!JSON.stringify(result).includes('synthetic'));
            mismatch = true;
            assert.deepEqual(await parity.collectRemote(['TEST'], PREVIEW), { environmentMismatch: true });
            mismatch = false; crossClose = true; urls.length = 0;
            assert.deepEqual(await parity.collectRemote(['TEST'], PREVIEW), { sessionAborted: true });
            assert.deepEqual(urls.map((u) => u.origin), [PREVIEW.base], 'SSM worker stops before hub/source dispatch');
        } finally {
            if (prior) require.cache[filename] = prior; else delete require.cache[filename];
        }
    });
    await test('REG closes before confirmation: no post-market source reads', async () => {
        let clockCalls = 0;
        const { result, calls } = await replay(snapshot(['TEST'], { app: 101 }), null, { now: () => ++clockCalls === 1 ? AT : clock.etToMs('2026-10-15', '16:00:00') });
        assert.equal(calls, 1); assert.equal(errors(result).length, 0);
        assert.ok(result.findings.some((f) => f.code === 'UNCONFIRMED_SOURCE_PARITY'));
    });
    await test('watch integration preserves latest line/schema, timestamps, evidence, and unconfirmed warnings', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'signum-source-parity-'));
        let servedSymbols = ['TEST'];
        const oldDir = process.env.INTEGRITY_DIR, oldFetch = globalThis.fetch, oldNow = Date.now, oldMonitor = parity.monitor;
        const oldBase = process.env.INTEGRITY_BASE, oldHub = process.env.INTEGRITY_HUB;
        const tls = require('node:tls'), oldTls = tls.connect, oldWS = globalThis.WebSocket, oldTimer = globalThis.setTimeout;
        const refs = require('./refs'), originals = { ...refs };
        let expectedTarget = TARGET, appReads = 0;
        try {
            process.env.INTEGRITY_DIR = root;
            delete process.env.INTEGRITY_BASE; delete process.env.INTEGRITY_HUB;
            Date.now = () => AT;
            refs.sleep = async () => {};
            refs.setDeadline = () => {};
            refs.getJson = refs.fetchNasdaqInfo = refs.fetchNasdaqExt = async () => ({ ok: false });
            refs.fetchYahoo1m = async () => ({ ok: true, bars: [{ t: AT, c: 100, h: 100, l: 100, o: 100, v: 1 }] });
            refs.fetchYahooDaily = async () => ({ ok: true, daily: [{ date: '2026-10-14', c: 100, h: 100, l: 100, o: 100, v: 1 }], events: [] });
            globalThis.fetch = async (url, options) => {
                const u = new URL(url);
                assert.equal(u.origin, expectedTarget.base); assert.equal(options.redirect, 'error'); appReads++;
                const body = u.pathname === '/api/live/quotes' ? { session: 'regular', data: Object.fromEntries(servedSymbols.map((sym) => [sym, { price: 100, previousClose: 100, changePercent: 0, session: 'regular', lastUpdate: AT }])) }
                    : u.pathname === '/api/live/ticker' ? { session: 'REG', display: { price: 100, changePctPct: 0 }, prices: { prevRegularClose: 100 }, flow: { maxPain: 100, callWall: 110, putFloor: 90, gammaFlipLevel: 100, levelsChainDate: '2026-10-14', levelsExpiration: '2026-10-16', levelsSpot: 100, levelsAsOf: AT } }
                        : u.pathname === '/api/watchlist/batch' ? { results: [] } : u.pathname === '/api/dashboard/unified' ? { tickers: {} } : {};
                return { ok: true, status: 200, text: async () => JSON.stringify(body) };
            };
            const s = snapshot(['TEST'], { app: 101, hub: 101 });
            s.rows.TEST.hub.t = AT - 500;
            const confirmed = (await replay(s, s)).result;
            parity.monitor = async () => confirmed;
            delete require.cache[require.resolve('./watch')];
            const watch = require('./watch');
            const opts = { symbols: ['TEST'], noConfirm: true, noHub: true, noBig: true, noNotify: true, probe: false, quiet: true };
            const result = await watch.runOnce(opts), latest = JSON.parse(fs.readFileSync(path.join(root, 'latest.json')));
            assert.match(latest.line, /^데이터 무결성: 정상 \d+ \/ 오류/); assert.equal(latest.version, 1);
            const f = latest.errorList.find((f) => f.code === 'SOURCE_PARITY');
            assert.equal(f.sourceTime, AT); assert.equal(f.appTime, AT); assert.equal(f.app, 101); assert.equal(f.ref, 100); assert.equal(f.confirmed, true);
            assert.equal(latest.doors.sourceParity.maxCalls, 82); assert.equal(result.sum.doors.sourceParity.calls, 2);
            const hubFinding = latest.errorList.find((f) => f.code === 'SOURCE_PARITY' && f.door === 'hub');
            assert.equal(hubFinding.appTime, AT - 500);
            assert.equal(latest.errorList.filter((f) => f.code === 'SOURCE_PARITY').length, 2);
            const run = JSON.parse(fs.readFileSync(path.join(root, 'runs', fs.readdirSync(path.join(root, 'runs'))[0])));
            assert.deepEqual(run.evidence.sourceParity.initial, s);
            parity.monitor = async () => ({ calls: 41, findings: [{ sev: 'warn', code: 'UNCONFIRMED_SOURCE_PARITY', sym: 'TEST', door: 'app', field: 'price', msg: 'unconfirmed' }] });
            for (const offset of [120000, 240000]) {
                Date.now = () => AT + offset;
                const r = await watch.runOnce(opts);
                assert.equal(r.findings.find((f) => f.code === 'UNCONFIRMED_SOURCE_PARITY').sev, 'warn');
            }
            servedSymbols = Array.from({ length: 41 }, (_, i) => `S${i}`);
            parity.monitor = (options) => oldMonitor({ ...options, collect: async () => { throw new Error('private failure'); }, now: Date.now });
            for (const offset of [360000, 480000]) {
                Date.now = () => AT + offset;
                const r = await watch.runOnce({ ...opts, symbols: servedSymbols });
                const latestFailure = JSON.parse(fs.readFileSync(path.join(root, 'latest.json')));
                assert.equal(r.sum.ok, 0); assert.equal(r.sum.errors, 0); assert.equal(r.sum.warns, 41);
                assert.match(r.sum.line, /^데이터 무결성: 정상 0 \/ 오류 0 · 지연 0 · 경고 41 ·/);
                assert.equal(latestFailure.warns, 41);
                assert.equal(r.findings.filter((f) => f.code === 'SOURCE_UNAVAILABLE' && f.sev === 'warn').length, 41);
                assert.ok(latestFailure.warnList.every((f) => f.code === 'SOURCE_UNAVAILABLE' && f.sym));
                assert.equal(r.sum.doors.sourceParity.calls, 41);
                assert.ok(!JSON.stringify(r).includes('private failure'));
                const state = JSON.parse(fs.readFileSync(path.join(root, 'state.json')));
                assert.ok(!Object.keys(state.pending).some((k) => k.startsWith('SOURCE_UNAVAILABLE|')));
            }
            parity.monitor = (options) => oldMonitor({ ...options, collect: async () => ({ sessionAborted: true }), now: Date.now });
            for (const offset of [500000, 540000]) {
                Date.now = () => AT + offset;
                const r = await watch.runOnce({ ...opts, symbols: servedSymbols });
                assert.equal(r.sum.ok, 0); assert.equal(r.sum.errors, 0); assert.equal(r.sum.warns, 41);
                const latestAborted = JSON.parse(fs.readFileSync(path.join(root, 'latest.json')));
                assert.ok(latestAborted.warnList.every((f) => f.code === 'SOURCE_PARITY_SESSION_ABORTED' && f.sev === 'warn' && /장외 중단/.test(f.msg)));
                const savedRun = JSON.parse(fs.readFileSync(path.join(root, 'runs', `${new Date(r.sum.at).toISOString().replace(/[:.]/g, '-')}.json`)));
                assert.deepEqual(savedRun.evidence.sourceParity.initial, { sessionAborted: true });
                const state = JSON.parse(fs.readFileSync(path.join(root, 'state.json')));
                assert.ok(!Object.keys(state.pending).some((k) => k.startsWith('SOURCE_PARITY_SESSION_ABORTED|')));
            }
            // Reuse the loaded watch: target settings must apply at round start.
            servedSymbols = ['TEST']; expectedTarget = PREVIEW;
            process.env.INTEGRITY_BASE = PREVIEW.base; process.env.INTEGRITY_HUB = PREVIEW.hub;
            let wsReads = 0, tlsReads = 0, monitorReads = 0;
            globalThis.setTimeout = (fn) => { queueMicrotask(fn); return 0; };
            globalThis.WebSocket = class {
                constructor(url) {
                    assert.equal(url, PREVIEW.hub); wsReads++;
                    queueMicrotask(() => { this.onopen(); this.onmessage({ data: JSON.stringify({ type: 'prices', ticker: 'TEST', price: 100, changePct: 0 }) }); this.onclose(); });
                }
                send() {}
                close() {}
            };
            tls.connect = (options, connected) => {
                assert.equal(options.host, new URL(PREVIEW.hub).hostname); assert.equal(options.port, 8443); tlsReads++;
                const socket = { on() {}, end() {}, getPeerCertificate: () => ({ valid_to: new Date(AT + 90 * 86400000).toUTCString() }) };
                queueMicrotask(connected); return socket;
            };
            parity.monitor = (options) => {
                monitorReads++; assert.deepEqual(options.target, expectedTarget);
                return oldMonitor({ ...options, now: Date.now, collect: async (symbols, target) => ({ ...snapshot(symbols), target }) });
            };
            Date.now = () => AT + 600000;
            const previewRound = await watch.runOnce({ ...opts, noHub: false });
            assert.deepEqual(previewRound.sum.target, PREVIEW); assert.equal(monitorReads, 1);
            assert.equal(wsReads, 1); assert.equal(tlsReads, 1);
            assert.equal(previewRound.sum.errors, 0);
            const state = JSON.parse(fs.readFileSync(path.join(root, 'state.json')));
            assert.deepEqual(state.target, PREVIEW);

            // A mixed configuration produces only warnings, without any query.
            for (const offset of [720000, 840000]) {
                process.env.INTEGRITY_HUB = TARGET.hub;
                const before = appReads;
                Date.now = () => AT + offset;
                const mixed = await watch.runOnce(opts);
                assert.equal(appReads, before); assert.equal(monitorReads, 1);
                assert.equal(mixed.sum.ok, 0); assert.equal(mixed.sum.errors, 0); assert.equal(mixed.sum.warns, 1);
                assert.ok(mixed.findings.every((f) => f.code === 'SOURCE_PARITY_ENVIRONMENT' && f.sev === 'warn'));
                assert.equal(mixed.sum.doors.sourceParity.calls, 0);
                assert.deepEqual(mixed.sum.doors.quotes, { ok: false, ms: 0, calls: 0, session: null });
                assert.deepEqual(mixed.sum.doors.ticker, { n: 0, fails: 0, stale: 0, ms: 0 });
                assert.equal(mixed.sum.newErrors, 0);
            }
            // Explicit run options override environment settings for every path.
            expectedTarget = TARGET;
            Date.now = () => AT + 960000;
            const override = await watch.runOnce({ ...opts, base: TARGET.base, hub: TARGET.hub });
            assert.deepEqual(override.sum.target, TARGET); assert.equal(monitorReads, 2);
        } finally {
            parity.monitor = oldMonitor; Object.assign(refs, originals); globalThis.fetch = oldFetch; Date.now = oldNow;
            tls.connect = oldTls; globalThis.WebSocket = oldWS; globalThis.setTimeout = oldTimer;
            if (oldBase === undefined) delete process.env.INTEGRITY_BASE; else process.env.INTEGRITY_BASE = oldBase;
            if (oldHub === undefined) delete process.env.INTEGRITY_HUB; else process.env.INTEGRITY_HUB = oldHub;
            if (oldDir === undefined) delete process.env.INTEGRITY_DIR; else process.env.INTEGRITY_DIR = oldDir;
            delete require.cache[require.resolve('./watch')];
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
    console.log(`sourceParity: ${n} passed (offline)`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
