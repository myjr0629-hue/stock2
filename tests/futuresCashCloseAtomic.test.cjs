// Offline transport + indivisible-command model. No live Redis or Lua runtime.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const key = 'yahoo:cash-close:nq:2026-10-22';
const closeAt = '2026-10-22T20:00:00.000Z';
const close = Date.parse(closeAt);
const record = (delta = 0, price = 20020) => ({ symbol: 'NQ=F', sessionDate: '2026-10-22',
    asOf: new Date(close + delta).toISOString(), price });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function store() {
    const values = new Map(), writes = [];
    return { values, writes, eval(script, keys, [raw, ttl, target]) {
        // Atomic-command model, without an await between GET and SET.
        assert.match(script, /local raw = redis.call\('GET', KEYS\[1\]\)/);
        assert.match(script, /oldDistance < newDistance/);
        assert.match(script, /previous.asOf <= incoming.asOf/);
        assert.match(script, /redis.call\('SET', KEYS\[1\], ARGV\[1\], 'EX', ARGV\[2\]\)/);
        assert.equal(keys.length, 1);
        const next = JSON.parse(raw), previous = values.get(keys[0]);
        const targetMs = Date.parse(next.sessionDate + 'T00:00:00.000Z') + Number(target);
        const oldAt = Date.parse(previous?.asOf), nextAt = Date.parse(next.asOf);
        if (previous && previous.symbol === next.symbol && previous.sessionDate === next.sessionDate
            && typeof previous.price === 'number' && Number.isFinite(previous.price) && previous.price > 0
            && Number.isFinite(oldAt) && new Date(oldAt).toISOString() === previous.asOf
            && previous.asOf.slice(0, 10) === next.sessionDate && Math.abs(oldAt - targetMs) <= 180000
            && (Math.abs(oldAt - targetMs) < Math.abs(nextAt - targetMs)
                || (Math.abs(oldAt - targetMs) === Math.abs(nextAt - targetMs) && previous.asOf <= next.asOf))) return 0;
        values.set(keys[0], next); writes.push({ key: keys[0], ttl, value: next }); return 1;
    } };
}

function fixture() {
    const f = { ec: store(), up: store(), calls: [], mode: 'supported', upFail: false,
        beforeEval: async () => {} };
    let R;
    class Upstash {
        async eval(script, keys, args) {
            assert.equal(script, R.FUTURES_CASH_CLOSE_LUA);
            f.calls.push('up:EVAL');
            if (f.upFail) throw new Error('offline failure');
            await f.beforeEval('up', JSON.parse(args[0]));
            return f.up.eval(script, keys, args);
        }
    }
    const fetch = async (input, init) => {
        const url = new URL(input);
        assert.equal(url.origin, 'http://localhost', 'no live network');
        f.calls.push(url.pathname);
        assert.equal(url.pathname, '/set-futures-cash-close', 'never use unconditional SET');
        if (f.mode !== 'supported') return new Response('{}', { status: f.mode === 'old' ? 404 : 503 });
        const { key, value, ttl, closeAt } = JSON.parse(init.body);
        await f.beforeEval('ec', value);
        return new Response(JSON.stringify({ result: f.ec.eval(R.FUTURES_CASH_CLOSE_LUA,
            [key], [JSON.stringify(value), ttl, Date.parse(closeAt) % 86400000]) }));
    };
    const source = fs.readFileSync(path.join(root, 'src/services/redisClient.ts'), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const mod = { exports: {} };
    const req = name => name === '@upstash/redis' ? { Redis: Upstash } : require(name);
    const env = { EC2_REDIS_PROXY_URL: 'http://localhost', UPSTASH_REDIS_REST_URL: 'http://localhost' };
    // Synthetic test configuration only; neither files nor the actual process environment are read.
    env.EC2_REDIS_PROXY_KEY = env.UPSTASH_REDIS_REST_TOKEN = 'public-offline-fixture';
    new Function('require', 'module', 'exports', 'fetch', 'process', js)(req, mod, mod.exports, fetch, { env });
    R = mod.exports;
    return Object.assign(f, { R, save: (value, ttl = 86400, storageKey = key, target = closeAt) =>
        R.setFuturesCashCloseIfCloser(storageKey, value, target, ttl) });
}

for (const mode of ['supported', 'old', 'down']) {
    test(`slower 15:59:30 cannot replace 16:00 (proxy=${mode})`, async () => {
        const f = fixture(); f.mode = mode;
        const arrived = deferred(), release = deferred();
        f.beforeEval = async (_backend, value) => {
            if (value.asOf === record(-30000).asOf) { arrived.resolve(); await release.promise; }
        };
        const slow = f.save(record(-30000, 20000));
        await arrived.promise;
        assert.equal(await f.save(record()), true);
        release.resolve(); assert.equal(await slow, true);
        assert.equal(f.up.values.get(key).price, 20020);
        if (mode === 'supported') {
            assert.equal(f.ec.values.get(key).price, 20020);
            assert.equal(f.ec.writes.length, 1);
        } else assert.equal(f.ec.writes.length, 0);
        assert.equal(f.up.writes.length, 1);
        assert.equal((20020 / f.up.values.get(key).price - 1) * 100, 0);
    });
}

test('out-of-order replication and independent writer modules preserve the closest reference', async () => {
    const f = fixture(), other = fixture();
    other.ec = f.ec; other.up = f.up; // shared stores, independent client state
    const arrived = deferred(), release = deferred();
    f.beforeEval = async (backend, value) => {
        if (backend === 'up' && value.asOf === record(-30000).asOf) { arrived.resolve(); await release.promise; }
    };
    const slow = f.save(record(-30000, 20000));
    await arrived.promise;
    await other.save(record());
    release.resolve(); await slow;
    assert.equal(f.ec.values.get(key).price, 20020);
    assert.equal(f.up.values.get(key).price, 20020);
});

test('tie chooses earlier observation; same trade preserves price and TTL', async () => {
    const f = fixture();
    await f.save(record(15000, 20030));
    await f.save(record(-15000, 20010));
    await f.save(record(15000, 20050));
    await f.save(record(-15000, 20999));
    await f.save(record(-60000));
    for (const db of [f.ec, f.up]) {
        assert.equal(db.values.get(key).price, 20010);
        assert.equal(db.writes.length, 2);
        assert.ok(db.writes.every(w => w.ttl >= 77760 && w.ttl <= 95040));
    }
});

test('atomic transport supports both futures, early close and DST on either side', async () => {
    const f = fixture();
    for (const [day, target] of [
        ['2026-03-06', '2026-03-06T21:00:00.000Z'],
        ['2026-03-09', '2026-03-09T20:00:00.000Z'],
        ['2026-10-30', '2026-10-30T20:00:00.000Z'],
        ['2026-11-02', '2026-11-02T21:00:00.000Z'],
        ['2026-11-27', '2026-11-27T18:00:00.000Z'],
        ['2026-07-02', '2026-07-02T17:00:00.000Z'],
    ]) {
        for (const symbol of ['NQ=F', 'ES=F']) {
            const k = `yahoo:cash-close:${symbol === 'NQ=F' ? 'nq' : 'es'}:${day}`;
            const v = delta => ({ symbol, sessionDate: day, price: 20020,
                asOf: new Date(Date.parse(target) + delta).toISOString() });
            assert.equal(await f.save(v(-30000), 86400, k, target), true);
            assert.equal(await f.save(v(0), 86400, k, target), true);
            assert.equal(await f.save(v(30000), 86400, k, target), true);
            for (const db of [f.ec, f.up]) assert.equal(db.values.get(k).asOf, target);
        }
    }
});

test('each store replaces invalid references and no-op primary still repairs fallback', async () => {
    const f = fixture();
    const invalid = [null, 'bad JSON', { ...record(), symbol: 'ES=F' }, { ...record(), sessionDate: '2026-10-21' },
        record(180001), record(-180001), record(0, 0), record(0, Infinity), { ...record(), asOf: '2026-10-22T19:59:60.000Z' }];
    for (const previous of invalid) {
        f.ec.values.set(key, previous); f.up.values.set(key, previous);
        assert.equal(await f.save(record()), true);
        assert.equal(f.ec.values.get(key).price, 20020);
        assert.equal(f.up.values.get(key).price, 20020);
    }
    f.up.values.set(key, record(-60000, 20000));
    const before = f.ec.writes.length;
    await f.save(record());
    assert.equal(f.ec.writes.length, before);
    assert.equal(f.up.values.get(key).price, 20020);
});

test('failure returns false only when neither atomic store succeeds', async () => {
    const f = fixture(); f.upFail = true;
    assert.equal(await f.save(record()), true);
    f.mode = 'old';
    assert.equal(await f.save(record()), false);
    f.mode = 'down';
    assert.equal(await f.save(record()), false);
});

test('invalid records, target, keys and TTLs never reach storage', async () => {
    const f = fixture();
    for (const value of [null, record(180001), record(0, NaN), record(0, 0), { ...record(), asOf: 'bad' },
        { ...record(), asOf: '2026-10-22T19:59:60.000Z' }, { ...record(), symbol: 'ES=F' }]) {
        assert.equal(await f.save(value), false);
    }
    for (const ttl of [0, -1, 1.5, 2147483648]) assert.equal(await f.save(record(), ttl), false);
    assert.equal(await f.save(record(), 60, 'trade:fixture'), false);
    assert.equal(await f.save(record(), 60, key, '2026-10-22T20:01:00.000Z'), false);
    assert.equal(f.calls.length, 0);
});

test('proxy runs the identical fixed Lua and restricts key/record/TTL before EVAL', async () => {
    const f = fixture();
    const source = fs.readFileSync(path.join(root, 'scripts/ec2-redis-proxy.js'), 'utf8');
    assert.equal(source.match(/const FUTURES_CASH_CLOSE_LUA = `([\s\S]*?)`;/)[1], f.R.FUTURES_CASH_CLOSE_LUA);
    let handler;
    const db = store();
    const req = name => {
        if (name === 'http') return { createServer: fn => { handler = fn; return { listen() {} }; } };
        if (name === 'fs') return { readFileSync() { throw new Error('environment file read blocked'); } };
        if (name === 'ioredis') return class {
            on() {}
            eval(script, count, key, ...args) { assert.equal(count, 1); return db.eval(script, [key], args); }
        };
        return require(name);
    };
    vm.runInNewContext(source, { require: req, __dirname: '/offline', Buffer, URL,
        process: { env: { REDIS_PROXY_KEY: 'public-offline-fixture' }, exit() { throw new Error('unexpected exit'); } },
        console: { log() {}, warn() {}, error() {} } });
    async function request(body) {
        const req = { url: '/set-futures-cash-close', method: 'POST',
            headers: { authorization: 'Bearer public-offline-fixture', host: 'localhost' },
            socket: { remoteAddress: '192.0.2.1' },
            async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } };
        const out = {};
        await handler(req, { setHeader() {}, writeHead(status) { out.status = status; }, end(body) { out.body = JSON.parse(body); } });
        return out;
    }
    const good = { key, value: record(), closeAt, ttl: 86400 };
    for (const body of [{ ...good, key: 'trade:fixture' }, { ...good, value: null },
        { ...good, value: record(180001) }, { ...good, value: record(0, 0) },
        { ...good, value: { ...record(), symbol: 'ES=F' } },
        { ...good, closeAt: '2026-10-22T20:01:00.000Z' }, { ...good, ttl: 0 }]) {
        assert.equal((await request(body)).status, 400);
    }
    assert.equal(db.writes.length, 0);
    assert.equal((await request(good)).body.result, 1);
    assert.equal((await request({ ...good, value: record(-30000, 20000) })).body.result, 0);
    assert.equal((await request({ ...good, value: record(0, 20999) })).body.result, 0);
    assert.equal(db.values.get(key).price, 20020);
    assert.equal(db.writes.length, 1);
});
