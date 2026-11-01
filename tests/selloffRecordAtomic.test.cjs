// Offline transport + indivisible-command model of SELLOFF_RECORD_LUA. No live Redis or Lua runtime.
// Run: node --test tests/selloffRecordAtomic.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const KEY = 'selloff:record:v1:2026-10-30';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

// JS model of the Lua script — the same rule, executed without an await between GET and SET.
function store() {
    const values = new Map(), writes = [];
    const slot = n => (n === 'NASDAQ' || n === 'NASDAQ 100' ? 'NQ' : n);
    const newer = (c, p) => typeof c.at !== 'string' ? false : typeof p.at !== 'string' ? true
        : c.at !== p.at ? c.at > p.at : c.pct === p.pct ? false
        : typeof c.rv === 'string' && typeof p.rv === 'string' && c.rv !== p.rv ? c.rv > p.rv
        : typeof c.rx === 'string' && (typeof p.rx !== 'string' || c.rx > p.rx);
    return { values, writes, eval(script, keys, [raw, ttl]) {
        assert.match(script, /local raw = redis.call\('GET', KEYS\[1\]\)/);
        assert.match(script, /return c\.at > p\.at/);
        assert.match(script, /if c\.pct == p\.pct then return false end/);
        assert.match(script, /c\.rv ~= p\.rv then return c\.rv > p\.rv end/);
        assert.match(script, /redis.call\('SET', KEYS\[1\], cjson.encode/);
        assert.equal(keys.length, 1);
        const incoming = JSON.parse(raw), prev = values.get(keys[0]);
        const merged = new Map();
        if (prev && prev.date === incoming.date && Array.isArray(prev.chips)) for (const c of prev.chips) merged.set(slot(c.name), c);
        let changed = false;
        for (const c of incoming.chips) {
            const p = merged.get(slot(c.name));
            if (!p || newer(c, p)) { merged.set(slot(c.name), c); changed = true; }
        }
        if (!changed) return 0;
        const chips = ['S&P 500', 'NQ', 'SOX', 'VIX'].flatMap(s => merged.has(s) ? [merged.get(s)] : []);
        const next = { date: incoming.date, chips };
        values.set(keys[0], next); writes.push({ ttl, value: next }); return 1;
    } };
}

function fixture() {
    const f = { up: store(), beforeEval: async () => {}, fail: false };
    let R;
    class Upstash {
        async get(key) { if (f.fail) throw new Error('offline failure'); return f.up.values.get(key) ?? null; }
        async eval(script, keys, args) {
            assert.equal(script, R.SELLOFF_RECORD_LUA);
            if (f.fail) throw new Error('offline failure');
            await f.beforeEval(JSON.parse(args[0]));
            return f.up.eval(script, keys, args);
        }
    }
    const fetch = async () => { throw new Error('no network in this test'); };
    const source = fs.readFileSync(path.join(root, 'src/services/redisClient.ts'), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const mod = { exports: {} };
    const req = name => name === '@upstash/redis' ? { Redis: Upstash } : require(name);
    // Synthetic offline configuration only; the real process environment is not read.
    const env = { UPSTASH_REDIS_REST_URL: 'http://localhost', UPSTASH_REDIS_REST_TOKEN: 'public-offline-fixture' };
    new Function('require', 'module', 'exports', 'fetch', 'process', js)(req, mod, mod.exports, fetch, { env });
    R = mod.exports;
    return Object.assign(f, { R });
}
const rec = (chips) => ({ date: '2026-10-30', chips });

test('older observation that finishes last cannot revert a newer one (concurrent instances)', async () => {
    const f = fixture();
    const stale = rec([{ name: 'VIX', pct: 12.9, at: '2026-10-30T20:15:01.000Z' }]);
    const fresh = rec([{ name: 'VIX', pct: 3, at: '2026-10-30T21:30:00.000Z' }]);
    const hold = deferred();
    f.beforeEval = async (v) => { if (v.chips[0].pct === 12.9) await hold.promise; };   // 낡은 쪽이 늦게 도착
    const a = f.R.mergeSelloffRecordAtomic(KEY, stale, 604800);
    const b = await f.R.mergeSelloffRecordAtomic(KEY, fresh, 604800);
    hold.resolve();
    assert.equal(b, 1);
    assert.equal(await a, 0);
    assert.deepEqual(f.up.values.get(KEY).chips, fresh.chips);
});

test('slots merge independently; Nasdaq composite and NDX share a slot; newer wins', async () => {
    const f = fixture();
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'S&P 500', pct: -1.82, at: '2026-10-30T20:47:43.000Z' }, { name: 'NASDAQ', pct: -2.86, at: '2026-10-30T21:16:01.000Z' }]), 604800), 1);
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'SOX', pct: -7.2, at: '2026-10-30T21:16:01.000Z' }]), 604800), 1);
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'SOX', pct: -7.2, at: '2026-10-30T21:16:01.000Z' }]), 604800), 0); // 같으면 쓰지 않음
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'NASDAQ 100', pct: -2.5, at: '2026-10-30T21:20:00.000Z' }]), 604800), 1);
    assert.deepEqual(f.up.values.get(KEY).chips.map(c => [c.name, c.pct]), [['S&P 500', -1.82], ['NASDAQ 100', -2.5], ['SOX', -7.2]]);
});

test('strict read separates failure from miss; invalid writes are refused before the store', async () => {
    const f = fixture();
    assert.deepEqual(await f.R.getSelloffRecordStrict(KEY), { ok: true, value: null });
    f.fail = true;
    assert.deepEqual(await f.R.getSelloffRecordStrict(KEY), { ok: false, value: null });
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'VIX', pct: 3, at: '2026-10-30T21:30:00.000Z' }]), 604800), null);
    f.fail = false;
    assert.equal(await f.R.mergeSelloffRecordAtomic('other:key', rec([{ name: 'VIX', pct: 3 }]), 604800), null);
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, { date: '2026-10-29', chips: [{ name: 'VIX', pct: 3 }] }, 604800), null); // 키·날짜 불일치
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'VIX', pct: 3, at: '2026-10-30 21:30' }]), 604800), null); // 비정규 시각
    assert.equal(f.up.writes.length, 0);
});

test('script text stays a single GET→compare→SET (no app-side merge)', () => {
    const source = fs.readFileSync(path.join(root, 'src/services/redisClient.ts'), 'utf8');
    const lua = source.match(/export const SELLOFF_RECORD_LUA = `([\s\S]*?)`;/)[1];
    assert.equal((lua.match(/redis\.call\('GET'/g) || []).length, 1);
    assert.equal((lua.match(/redis\.call\('SET'/g) || []).length, 1);
    assert.ok(lua.indexOf("redis.call('GET'") < lua.indexOf('newer(c, p)') && lua.indexOf('newer(c, p)') < lua.indexOf("redis.call('SET'"));
});

test('same-timestamp close correction: later receipt wins, identical value never rewrites (gate 11020332)', async () => {
    const f = fixture();
    const at = '2026-10-30T20:15:01.000Z';
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'VIX', pct: 12, at, rx: '2026-10-30T20:20:00.000Z' }]), 604800), 1);
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'VIX', pct: 12, at, rx: '2026-10-30T20:40:00.000Z' }]), 604800), 0); // 같은 값
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'VIX', pct: 3, at, rx: '2026-10-30T20:30:00.000Z' }]), 604800), 1);  // 정정
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'VIX', pct: 12, at, rx: '2026-10-30T20:25:00.000Z' }]), 604800), 0); // 정정 전에 받은 낡은 사본
    assert.deepEqual(f.up.values.get(KEY).chips.map(c => c.pct), [3]);
    // Lua 규칙과 lib 규칙이 같다
    const lib = fs.readFileSync(path.join(root, 'src/lib/selloffBriefing.ts'), 'utf8');
    assert.match(lib, /if \(a\.rv && b\.rv && a\.rv !== b\.rv\) return a\.rv > b\.rv;/);
});

test('delayed stale copy cannot win over a newer identical receipt when the feed revision stamp is present (gate 11020334)', async () => {
    const f = fixture();
    const at = '2026-10-30T20:15:01.000Z';
    const v12 = '2026-10-30T20:16:00.000Z';                 // +12 이 원천에서 처음 정해진 시각
    const v3 = '2026-10-30T20:25:00.000Z';                  // +3 정정 시각(원천)
    // 정정 뒤 다시 +12 로 재정정된 경우(rv 전진) — 순서 그대로 따른다
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'VIX', pct: 12, at, rv: v12, rx: '2026-10-30T20:10:00.000Z' }]), 604800), 1);
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'VIX', pct: 12, at, rv: v12, rx: '2026-10-30T20:40:00.000Z' }]), 604800), 0); // 같은 값의 사본
    // 늦게 도착한 20:30 수신본 +3 이라도 원천 rv(20:25)가 +12 의 rv(20:16)보다 늦으면 진짜 정정 → 채택
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'VIX', pct: 3, at, rv: v3, rx: '2026-10-30T20:30:00.000Z' }]), 604800), 1);
    // 반대로 정정 전 사본(rv 이전)은 수신이 늦어도 못 이긴다
    assert.equal(await f.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'VIX', pct: 12, at, rv: v12, rx: '2026-10-30T21:00:00.000Z' }]), 604800), 0);
    assert.deepEqual(f.up.values.get(KEY).chips.map(c => c.pct), [3]);
    // gate 11020334 그대로: +12(rv 20:16) 20:10·20:40 수신 뒤 지연 도착한 낡은 +3(rv 20:05 — +12 이전 값) → 거절
    const g = fixture();
    await g.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'VIX', pct: 12, at, rv: v12, rx: '2026-10-30T20:10:00.000Z' }]), 604800);
    await g.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'VIX', pct: 12, at, rv: v12, rx: '2026-10-30T20:40:00.000Z' }]), 604800);
    assert.equal(await g.R.mergeSelloffRecordAtomic(KEY, rec([{ name: 'VIX', pct: 3, at, rv: '2026-10-30T20:05:00.000Z', rx: '2026-10-30T20:30:00.000Z' }]), 604800), 0);
    assert.deepEqual(g.up.values.get(KEY).chips.map(c => c.pct), [12]);
});
