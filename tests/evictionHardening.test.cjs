const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

test('snapshot rejects a partial bulk and fails closed on unreadable previous data', async () => {
    const source = fs.readFileSync('scripts/intrinio-eod-snapshot.js', 'utf8');
    const block = source.slice(source.indexOf('    if (rows.length < 3000)'), source.indexOf('    const up = rows.filter'));
    assert.ok(block.includes('previous.rows.length * 0.9'));
    const run = (count, result, ok = true) => vm.runInNewContext(`(async () => { ${block} })()`, {
        rows: { length: count }, PROXY: 'http://mock', SNAPSHOT_KEY: 'snapshot', PROXY_KEY: '',
        encodeURIComponent, httpRequest: async () => ({ ok, status: 500, json: () => result }),
    });
    await assert.rejects(run(6485, { result: JSON.stringify({ rows: Array(12588).fill(0) }) }), /90%/);
    await run(11330, { result: { rows: Array(12588).fill(0) } });
    await run(6485, { result: null });
    await assert.rejects(run(6485, {}, false), /조회 실패/);
    await assert.rejects(run(6485, {}), /응답 오류/);
    await assert.rejects(run(6485, { result: {} }), /확인 실패/);
    await assert.rejects(run(2999, { result: null }), /3000/);
});

test('economic cron checks authentication before fetching or writing', async () => {
    const source = fs.readFileSync('src/app/api/cron/economic-calendar/route.ts', 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    let fetches = 0, writes = 0;
    const mod = { exports: {} };
    const mocks = {
        '@/lib/fmpClient': { fmpFetch: async () => { fetches++; return { ok: true, json: async () => [] }; } },
        '@/services/redisClient': { setInCache: async () => { writes++; } },
        'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    };
    const env = { NODE_ENV: 'production', CRON_SECRET: 'test-secret', FMP_API_KEY: 'test-key' };
    vm.runInNewContext(code, { module: mod, exports: mod.exports, require: id => mocks[id], process: { env }, console, Date });
    const request = value => ({ headers: { get: () => value } });
    assert.equal((await mod.exports.GET(request(null))).status, 401);
    assert.equal((await mod.exports.GET(request('Bearer wrong'))).status, 401);
    assert.equal(fetches, 0); assert.equal(writes, 0);
    env.CRON_SECRET = '';
    assert.equal((await mod.exports.GET(request('Bearer test-secret'))).status, 401);
    env.CRON_SECRET = 'test-secret';
    assert.equal((await mod.exports.GET(request('Bearer test-secret'))).status, 200);
    assert.equal(fetches, 1); assert.equal(writes, 1);
});
