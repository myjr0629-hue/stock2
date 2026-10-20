// Offline only: node --test tests/logoPolicy.test.cjs. No env files or sockets.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');

function loadTs(file, overrides = {}) {
    const filename = path.join(root, file);
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const mod = { exports: {} };
    const req = name => {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        throw new Error(`Unmocked import: ${name}`);
    };
    vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename })(req, mod, mod.exports);
    return mod.exports;
}
const policy = loadTs('src/lib/logoPolicy.ts');
// Fixed valid white 100x100 PNG, exactly 328B. Synthetic fixture, NOT a captured
// Parqet response; reproduces its measured size and blank image semantics.
const blank = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAAAAABVicqIAAAAPUlEQVR4nO3NAQkAAAwDoPUvvbU4HLSA6YFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUTyPxkx2OsrwSn2FgAAAMZ0RVh0Zml4dHVyZQAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgwzyqpAAAAABJRU5ErkJggg==', 'base64');
const normal = fs.readFileSync(path.join(root, 'public/logos/vercel.png'));
const image = (bytes = normal, contentType = 'image/png') => new Response(bytes, {
    headers: { 'content-type': contentType },
});
function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}
function fixture(fetcher = async () => image(), queueTimeoutMs = 8000) {
    const store = new Map(), writes = [], reads = [], calls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        calls.push(url);
        return fetcher(url, init);
    };
    const route = loadTs('src/app/api/logo/[ticker]/route.ts', {
        '@/services/redisClient': {
            getFromCache: async key => { reads.push(key); return store.get(key); },
            setInCache: async (key, value, ttl) => { store.set(key, value); writes.push({ key, value, ttl }); },
        },
        '@/lib/net/publicBase': { publicBase: () => 'https://public.invalid' },
        '@/lib/logoPolicy': {
            ...policy,
            createLogoLoader: () => policy.createLogoLoader(4, queueTimeoutMs),
        },
    });
    return {
        store, writes, reads, calls,
        get: ticker => route.GET({ url: 'https://protected.invalid/api/logo/' + ticker }, { params: Promise.resolve({ ticker }) }),
        restore: () => { global.fetch = originalFetch; },
    };
}

test('fixed 328B blank PNG rejected; normal PNG accepted; 368B and threshold boundaries', async () => {
    assert.equal(blank.length, 328);
    const meta = await sharp(blank).metadata();
    assert.deepEqual([meta.width, meta.height], [100, 100]);
    const stats = await sharp(blank).stats();
    assert.ok(stats.channels.every(c => c.min === 255 && c.max === 255));
    assert.equal(policy.isUsableLogo(blank, 'image/png'), false);
    assert.equal(policy.isUsableLogo(Buffer.concat([blank, Buffer.alloc(40)]), 'image/png'), false);
    assert.equal(policy.isUsableLogo(Buffer.alloc(599), 'image/png'), false);
    assert.equal(policy.isUsableLogo(Buffer.alloc(600), 'image/png'), true);
    assert.equal(policy.isUsableLogo(normal, 'image/png'), true);
    assert.ok((await sharp(normal).stats()).channels.some(c => c.min < c.max));
    assert.equal(policy.isUsableLogo(normal, 'text/html'), false);
    assert.equal(policy.isUsableLogo(Buffer.alloc(100), 'image/svg+xml', true), true);
    assert.equal(policy.isUsableLogo(Buffer.alloc(100), 'image/svg+xml'), false);
});

test('SYF blank Parqet -> FMP, new key ignores old cached blank, real logo TTL 24h', async t => {
    const f = fixture(async url => image(url.includes('parqet') ? blank : normal));
    t.after(f.restore);
    f.store.set('logo:v4:SYF', { buffer: blank.toString('base64'), contentType: 'image/png' });
    const response = await f.get('syf');
    assert.deepEqual(f.calls, [
        'https://assets.parqet.com/logos/symbol/SYF?format=png',
        'https://financialmodelingprep.com/image-stock/SYF.png',
    ]);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), normal);
    assert.equal(f.writes[0].key, 'logo:v5:SYF');
    assert.equal(f.writes[0].ttl, 86400);
    assert.equal(f.writes[0].value.fallback, false);
    assert.equal(response.headers.get('X-Cache'), 'MISS');
    assert.match(response.headers.get('Cache-Control'), /s-maxage=86400/);
    const hit = await f.get('SYF');
    assert.equal(hit.headers.get('X-Cache'), 'HIT');
    assert.equal(f.calls.length, 2);
    assert.deepEqual(Buffer.from(await hit.arrayBuffer()), normal);
});

test('both providers blank -> original initial chip, Redis AND CDN 10min including HIT', async t => {
    const f = fixture(async () => image(blank));
    t.after(f.restore);
    for (const cache of ['GEN', 'HIT']) {
        const response = await f.get('SYF');
        assert.equal(response.headers.get('X-Cache'), cache);
        assert.equal(response.headers.get('Cache-Control'), 'public, max-age=600, s-maxage=600');
        assert.match(response.headers.get('Content-Type'), /image\/svg\+xml/);
        assert.match(await response.text(), />SYF<\/text>/);
    }
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].ttl, 600);
    assert.equal(f.writes[0].value.fallback, true);
    assert.equal(f.calls.length, 2);
});

test('NVDA/MU normal Parqet PNGs skip FMP (offline fixture)', async t => {
    const f = fixture();
    t.after(f.restore);
    for (const symbol of ['NVDA', 'MU']) {
        assert.deepEqual(Buffer.from(await (await f.get(symbol)).arrayBuffer()), normal);
    }
    assert.equal(f.calls.length, 2);
    assert.ok(f.calls.every(url => url.includes('parqet')));
});

test('curated small SVG preserved, HTML rejected, SPCX override and FORCE_INITIAL preserved', async t => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="red"/></svg>');
    let html = false;
    const f = fixture(async url => url.startsWith('https://public.invalid/logos/')
        ? image(html ? normal : svg, html ? 'text/html' : 'image/svg+xml')
        : image());
    t.after(f.restore);
    assert.deepEqual(Buffer.from(await (await f.get('AMZN')).arrayBuffer()), svg);
    assert.equal(f.calls.length, 1);
    f.store.clear();
    html = true;
    await f.get('AMZN');
    assert.equal(f.calls.length, 3, 'HTML curated response must fall through to Parqet');
    await f.get('SPCX');
    assert.equal(f.calls.at(-1), 'https://financialmodelingprep.com/image-stock/SPCX.png');
    const before = f.calls.length;
    assert.match(await (await f.get('SOXL')).text(), />SOXL<\/text>/);
    assert.equal(f.calls.length, before);
    assert.equal((await f.get('---')).status, 400);
});

test('provider errors/HTTP failures fall through; fallback retries after cache expiry', async t => {
    let recovered = false;
    const f = fixture(async url => {
        if (recovered) return image();
        if (url.includes('parqet')) throw new Error('offline timeout');
        return new Response(null, { status: 503 });
    });
    t.after(f.restore);
    await f.get('SYF');
    assert.equal(f.writes[0].ttl, 600);
    // Model Redis expiry, without advancing wall clock or writing production data.
    f.store.clear();
    recovered = true;
    await f.get('SYF');
    assert.equal(f.writes[1].ttl, 86400);
    assert.equal(f.writes[1].value.fallback, false);
});

test('cold burst capped at four; same-ticker requests share fetch, cache write, separate response bodies', async t => {
    const gate = deferred(), fourStarted = deferred();
    let active = 0, peak = 0, started = 0;
    const f = fixture(async () => {
        active++; peak = Math.max(peak, active);
        if (++started === 4) fourStarted.resolve();
        await gate.promise;
        active--;
        return image();
    });
    t.after(f.restore);
    const requests = [...Array.from({ length: 12 }, (_, i) => f.get('T' + i)), f.get('T0'), f.get('T0')];
    await fourStarted.promise;
    assert.equal(f.calls.length, 4);
    gate.resolve();
    const responses = await Promise.all(requests);
    assert.equal(peak, 4);
    assert.equal(f.calls.length, 12);
    assert.equal(f.writes.length, 12);
    for (const response of responses) assert.deepEqual(Buffer.from(await response.arrayBuffer()), normal);
});

test('queue timeout emits no-store chip, no provider call/cache write; slots recover', async t => {
    const gate = deferred(), fourStarted = deferred();
    let started = 0;
    const f = fixture(async () => {
        if (++started === 4) fourStarted.resolve();
        await gate.promise;
        return image();
    }, 15);
    t.after(f.restore);
    const busy = ['AA', 'BB', 'CC', 'DD'].map(f.get);
    await fourStarted.promise;
    const response = await f.get('WAIT');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(await response.text(), />WAIT<\/text>/);
    assert.equal(f.calls.length, 4);
    assert.equal(f.writes.length, 0);
    gate.resolve();
    await Promise.all(busy);
    await f.get('WAIT');
    assert.equal(f.writes.length, 5);
    assert.equal(f.writes.at(-1).ttl, 86400);
});

test('loader releases slots and removes shared failed promises after exceptions', async () => {
    const load = policy.createLogoLoader(1, 100);
    await assert.rejects(load('A', async () => { throw new Error('offline failure'); }));
    assert.equal(await load('A', async () => 1), 1);
    assert.equal(await load('B', async () => 2), 2);
});

test('client edits change only logo query version; labels/styles/layout unchanged', () => {
    const { execFileSync } = require('node:child_process');
    for (const file of [
        'src/components/app/AppTickerLogo.tsx',
        'src/app/[locale]/app-view/flow/page.tsx',
        'src/app/[locale]/app-view/cmd/page.tsx',
        'src/lib/app/widgetBridge.ts',
    ]) {
        const previous = execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, encoding: 'utf8' });
        const current = fs.readFileSync(path.join(root, file), 'utf8');
        assert.equal(current, previous.replaceAll('?v=3', '?v=4'));
    }
});
