// Offline only: node --test tests/macroLastGoodCas.test.cjs
// Transport/atomic-command model; does not claim to execute Lua in a real Redis.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const prefix = 'macro:economy:lastgood:v2:';
const legacy = 'macro:economy:lastgood:v1:';
const key = prefix + 'fedFunds';
const metric = (asOf, value = 4, name = 'fedFunds') => ({ key: name, value, asOf });
const data = (...metrics) => ({ metrics });
function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}
function loadTs(file, overrides = {}) {
    const filename = path.join(root, file);
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    const mod = { exports: {} };
    const req = name => {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (name.startsWith('.')) return loadTs(path.relative(root, path.resolve(path.dirname(filename), name)) + '.ts', overrides);
        return require(name);
    };
    vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename })(req, mod, mod.exports);
    return mod.exports;
}
function store(clock = { now: 0 }) {
    const values = new Map();
    const writes = [];
    const expires = new Map();
    const renewals = [];
    const get = key => {
        if (expires.has(key) && expires.get(key) <= clock.now) {
            values.delete(key);
            expires.delete(key);
        }
        return values.get(key);
    };
    return {
        values, writes, expires, renewals, get,
        eval(script, keys, args) {
            assert.equal(keys.length, 1);
            assert.match(script, /redis.call\('GET', KEYS\[1\]\)/);
            assert.match(script, /previous.asOf >= incoming.asOf/);
            assert.match(script, /redis.call\('SET', KEYS\[1\], ARGV\[1\], 'EX', ARGV\[2\]\)/);
            const [raw, ttl] = args;
            const incoming = JSON.parse(raw), previous = get(keys[0]);
            // Model one indivisible Redis EVAL, without any await between read and write.
            if (previous && typeof previous.value === 'number' && typeof previous.asOf === 'string'
                && previous.asOf >= incoming.asOf) {
                // Recognize the fixed Lua's equal-date EXPIRE branch; old Lua never renews.
                if (previous.asOf === incoming.asOf && /if previous.asOf == incoming.asOf then\s+redis.call\('EXPIRE', KEYS\[1\], ARGV\[2\]\)\s+end/.test(script)) {
                    expires.set(keys[0], clock.now + Number(ttl) * 1000);
                    renewals.push({ key: keys[0], ttl });
                }
                return 0;
            }
            values.set(keys[0], incoming);
            expires.set(keys[0], clock.now + Number(ttl) * 1000);
            writes.push({ key: keys[0], ttl, value: incoming });
            return 1;
        },
    };
}
function fixture(previous) {
    const clock = previous?.clock ?? { now: 0 };
    const ec = previous?.ec ?? store(clock), up = previous?.up ?? store(clock);
    const calls = [];
    const f = { ec, up, clock, calls, mode: 'supported', upFail: false, beforeEval: async () => {} };
    process.env.EC2_REDIS_PROXY_URL = 'http://ec2.test';
    process.env.EC2_REDIS_PROXY_KEY = 'public-offline-fixture';
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'public-offline-fixture';
    global.fetch = async (input, init = {}) => {
        const url = new URL(String(input));
        const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
        if (url.origin === 'http://ec2.test') {
            calls.push(url.pathname);
            if (url.pathname === '/set-if-newer') {
                if (f.mode !== 'supported') return reply({ error: 'offline fixture' }, f.mode === 'old' ? 404 : 503);
                const { key, value, ttl } = JSON.parse(init.body);
                await f.beforeEval('ec', value);
                return reply({ result: ec.eval(R.ASOF_CAS_LUA, [key], [JSON.stringify(value), ttl]) });
            }
            if (url.pathname === '/mget') {
                if (f.mode === 'down') return reply({}, 503);
                return reply({ results: url.searchParams.get('keys').split(',').map(k => ec.get(k) ?? null) });
            }
            throw new Error('unexpected EC command');
        }
        assert.equal(url.origin, 'https://upstash.test', 'no live network');
        if (f.upFail) return reply({ error: 'offline fixture' }, 503);
        const body = JSON.parse(init.body);
        const commands = Array.isArray(body[0]) ? body : [body];
        const headers = new Headers(init.headers);
        const encode = value => value == null ? null : headers.get('upstash-encoding') === 'base64'
            ? Buffer.from(JSON.stringify(value)).toString('base64') : JSON.stringify(value);
        const results = [];
        for (const c of commands) {
            const op = String(c[0]).toUpperCase();
            calls.push('up:' + op);
            if (op === 'EVAL') {
                assert.equal(c[1], R.ASOF_CAS_LUA);
                assert.equal(c[2], 1);
                await f.beforeEval('up', JSON.parse(c[4]));
                results.push({ result: up.eval(c[1], [c[3]], c.slice(4)) });
            } else if (op === 'MGET') {
                results.push({ result: c.slice(1).map(k => encode(up.get(k))) });
            } else throw new Error('unexpected Upstash command: ' + op);
        }
        return reply(url.pathname.endsWith('/pipeline') ? results : results[0]);
    };
    const R = loadTs('src/services/redisClient.ts');
    const persistence = loadTs('src/lib/macroLastGoodStore.ts', { '@/services/redisClient': R });
    return Object.assign(f, { R, ...persistence });
}

test('legacy separate recheck + SET reproduces 10/20 -> 10/19', async () => {
    let current = metric('2026-10-18');
    const snapshot = current;
    const recheck = current;
    const delayed = deferred();
    const slow = (async () => { assert.equal(recheck, snapshot); await delayed.promise; current = metric('2026-10-19'); })();
    current = metric('2026-10-20');
    delayed.resolve(); await slow;
    assert.equal(current.asOf, '2026-10-19');
});

for (const mode of ['supported', 'old', 'down']) {
    test(`same old snapshots; delayed 10/19 cannot replace 10/20 (proxy=${mode})`, async () => {
        const f = fixture(); f.mode = mode;
        f.ec.values.set(legacy + 'fedFunds', metric('2026-10-18'));
        f.up.values.set(legacy + 'fedFunds', metric('2026-10-18'));
        const [prevA, prevB] = await Promise.all([f.readLastGood(), f.readLastGood()]);
        assert.equal(prevA.fedFunds.asOf, '2026-10-18');
        assert.deepEqual(prevA, prevB);
        const arrived = deferred(), release = deferred();
        f.beforeEval = async (_backend, value) => {
            if (value.asOf === '2026-10-19') { arrived.resolve(); await release.promise; }
        };
        const slow = f.saveLastGood(prevB, data(metric('2026-10-19', 3)));
        await arrived.promise;
        await f.saveLastGood(prevA, data(metric('2026-10-20', 5)));
        release.resolve(); await slow;
        assert.equal(f.up.values.get(key).asOf, '2026-10-20');
        assert.equal(f.up.writes.length, 1);
        if (mode === 'supported') {
            assert.equal(f.ec.values.get(key).asOf, '2026-10-20');
            assert.equal(f.ec.writes.length, 1);
        } else assert.equal(f.ec.writes.length, 0);
        assert.equal((await f.readLastGood()).fedFunds.asOf, '2026-10-20');
        assert.ok(!f.calls.includes('/set'), 'never use unconditional proxy SET');
    });
}

test('out-of-order Upstash replication also rejects the older date', async () => {
    const f = fixture();
    const arrived = deferred(), release = deferred();
    f.beforeEval = async (backend, value) => {
        if (backend === 'up' && value.asOf === '2026-10-19') { arrived.resolve(); await release.promise; }
    };
    const slow = f.saveLastGood(null, data(metric('2026-10-19')));
    await arrived.promise;
    await f.saveLastGood(null, data(metric('2026-10-20')));
    release.resolve(); await slow;
    assert.equal(f.ec.values.get(key).asOf, '2026-10-20');
    assert.equal(f.up.values.get(key).asOf, '2026-10-20');
});

test('equal date renews only TTL; older date renews nothing; zero survives; newer date advances', async t => {
    t.mock.method(Math, 'random', () => 0.5);
    const f = fixture();
    assert.equal(await f.R.setIfNewerAsOf(key, metric('2026-10-20', 0), 60), true);
    f.clock.now = 30_000;
    assert.equal(await f.R.setIfNewerAsOf(key, metric('2026-10-20', 99), 600), true);
    for (const db of [f.ec, f.up]) {
        assert.equal(db.renewals.length, 1);
        assert.equal(db.expires.get(key), 630_000);
    }
    f.clock.now = 40_000;
    assert.equal(await f.R.setIfNewerAsOf(key, metric('2026-10-19', 3), 600), true);
    for (const db of [f.ec, f.up]) {
        assert.equal(db.writes.length, 1);
        assert.ok(db.writes[0].ttl >= 54 && db.writes[0].ttl <= 66);
        assert.equal(db.values.get(key).value, 0);
        assert.equal(db.renewals.length, 1);
        assert.equal(db.expires.get(key), 630_000);
    }
    f.clock.now = 61_000; // Survives the original expiry.
    assert.equal((await f.readLastGood()).fedFunds.value, 0);
    await f.R.setIfNewerAsOf(key, metric('2026-10-21', 2), 60);
    assert.equal(f.up.values.get(key).asOf, '2026-10-21');
});

for (const mode of ['supported', 'old', 'down']) {
    test(`GDP received again on day 29 survives day 31 cold-start vendor failure (proxy=${mode})`, async t => {
        t.mock.method(Math, 'random', () => 0.5);
        const day = 24 * 60 * 60 * 1000;
        const f = fixture(); f.mode = mode;
        const { fillFromLastGood, METRIC_ORDER } = loadTs('src/lib/macroLastGood.ts');
        const gdp = { ...METRIC_ORDER.find(m => m.key === 'gdpQoQ'), ...metric('2026-07-01', 3.8, 'gdpQoQ') };
        const gdpKey = prefix + 'gdpQoQ';
        const stores = mode === 'supported' ? [f.ec, f.up] : [f.up];
        await f.saveLastGood(null, data(gdp));
        for (const db of stores) assert.equal(db.expires.get(gdpKey), 30 * day);

        f.clock.now = 29 * day;
        await f.saveLastGood(await f.readLastGood(), data(gdp));
        for (const db of stores) assert.equal(db.expires.get(gdpKey), 59 * day);

        f.clock.now = 31 * day;
        const cold = fixture(f); cold.mode = mode; // Fresh module state; only Redis survives.
        const lastGood = await cold.readLastGood();
        const raw = data({ ...gdp, asOf: null, value: null }, metric('2026-10-20', 4));
        const filled = fillFromLastGood(raw, lastGood);
        assert.equal(filled.data.metrics.length, 7);
        assert.equal(filled.filled, 1);
        assert.deepEqual(filled.data.metrics.find(m => m.key === 'gdpQoQ'), gdp);
        await cold.saveLastGood(lastGood, raw);
        for (const db of stores) {
            assert.equal(db.writes.filter(w => w.key === gdpKey).length, 1);
            assert.equal(db.renewals.filter(w => w.key === gdpKey).length, 1);
            assert.equal(db.expires.get(gdpKey), 59 * day, 'vendor failure cannot refresh a carried value');
        }

        f.clock.now = 59 * day;
        const expired = fillFromLastGood(raw, await cold.readLastGood());
        assert.equal(expired.data.metrics.find(m => m.key === 'gdpQoQ').value, null);
    });
}

test('invalid/undated observations and invalid keys/TTLs never touch storage', async () => {
    const f = fixture();
    for (const value of [null, metric(null), metric('2026-02-30'), metric('2026-10-20', NaN), metric('2026-10-20', null)]) {
        assert.equal(await f.R.setIfNewerAsOf(key, value, 60), false);
    }
    for (const ttl of [0, -1, 1.5, 2147483648]) assert.equal(await f.R.setIfNewerAsOf(key, metric('2026-10-20'), ttl), false);
    assert.equal(await f.R.setIfNewerAsOf('trade:fixture', metric('2026-10-20'), 60), false);
    await f.saveLastGood(null, data(metric(null), metric('2026-10-20', null)));
    assert.equal(f.calls.length, 0);
});

test('recovery and legacy writers cannot mask the newer fallback v2; reads pick max both ways', async () => {
    const f = fixture(); f.mode = 'old';
    f.ec.values.set(legacy + 'fedFunds', metric('2026-10-18'));
    await f.saveLastGood(null, data(metric('2026-10-20', 5)));
    f.mode = 'supported';
    f.ec.values.set(legacy + 'fedFunds', metric('2026-10-19', 3));
    assert.equal((await f.readLastGood()).fedFunds.asOf, '2026-10-20');
    f.ec.values.set(key, metric('2026-10-21', 6));
    assert.equal((await f.readLastGood()).fedFunds.asOf, '2026-10-21');
    f.upFail = true;
    assert.equal((await f.readLastGood()).fedFunds.asOf, '2026-10-21');
});

test('migrate a newer/equal legacy snapshot through CAS; metrics stay independent', async () => {
    const f = fixture();
    const prev = { fedFunds: metric('2026-10-20', 5) };
    await f.saveLastGood(prev, data(metric('2026-10-19'), metric('2026-09-01', 3, 'cpiYoY')));
    assert.equal(f.up.values.get(key).asOf, '2026-10-20');
    assert.equal(f.up.values.get(prefix + 'cpiYoY').value, 3);
    await f.saveLastGood(prev, data(metric('2026-10-20', 9)));
    assert.equal(f.up.values.get(key).value, 5);
});

test('total storage failure reports false; vendor response persistence remains best effort', async () => {
    const f = fixture(); f.mode = 'down'; f.upFail = true;
    assert.equal(await f.R.setIfNewerAsOf(key, metric('2026-10-20'), 60), false);
    await assert.doesNotReject(f.saveLastGood(null, data(metric('2026-10-20'))));
    assert.equal(f.ec.writes.length + f.up.writes.length, 0);
});

test('proxy uses the identical fixed Lua; endpoint validation excludes arbitrary keys/scripts', async () => {
    const f = fixture();
    const source = fs.readFileSync(path.join(root, 'scripts/ec2-redis-proxy.js'), 'utf8');
    assert.equal(source.match(/const ASOF_CAS_LUA = `([\s\S]*?)`;/)[1], f.R.ASOF_CAS_LUA);
    let handler;
    const proxyDb = store();
    const fakeRequire = name => {
        if (name === 'http') return { createServer: fn => { handler = fn; return { listen() {} }; } };
        if (name === 'fs') return { readFileSync() { throw new Error('env file reads disabled in test'); } };
        if (name === 'ioredis') return class {
            on() {}
            eval(script, count, key, ...args) { assert.equal(count, 1); return proxyDb.eval(script, [key], args); }
        };
        return require(name);
    };
    vm.runInNewContext(source, {
        require: fakeRequire, __dirname: '/offline-fixture', Buffer, URL,
        process: { env: { REDIS_PROXY_KEY: 'public-offline-fixture' }, exit() { throw new Error('unexpected exit'); } },
        console: { log() {}, warn() {}, error() {} },
    });
    async function request(body) {
        const req = {
            url: '/set-if-newer', method: 'POST',
            headers: { authorization: 'Bearer public-offline-fixture', host: 'fixture' },
            socket: { remoteAddress: '192.0.2.1' },
            async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); },
        };
        const out = {};
        const res = { setHeader() {}, writeHead(status) { out.status = status; }, end(body) { out.body = JSON.parse(body); } };
        await handler(req, res); return out;
    }
    for (const body of [
        { key: 'trade:fixture', value: metric('2026-10-20'), ttl: 60 },
        { key, value: metric(null), ttl: 60 },
        { key, value: metric('2026-02-30'), ttl: 60 },
        { key, value: metric('2026-10-20'), ttl: 0 },
    ]) assert.equal((await request(body)).status, 400);
    assert.equal(proxyDb.writes.length, 0);
    assert.equal((await request({ key, value: metric('2026-10-20'), ttl: 60 })).body.result, 1);
    assert.equal((await request({ key, value: metric('2026-10-19'), ttl: 600 })).body.result, 0);
    assert.equal((await request({ key, value: metric('2026-10-20'), ttl: 600 })).body.result, 0);
    assert.equal(proxyDb.writes.length, 1);
    assert.equal(proxyDb.renewals.length, 1);
    assert.equal(proxyDb.expires.get(key), 600_000);
});
