// Offline: TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' node -r ts-node/register/transpile-only --test tests/atomicArchiveSave.test.ts
// Optional real Lua test: install redis-server locally; uses only a temporary Unix socket, never a configured Redis URL.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Redis from 'ioredis';
import type { Redis as UpstashRedis } from '@upstash/redis';
import {
    atomicArchiveSave, ATOMIC_ARCHIVE_SAVE_LUA,
    type AtomicArchiveStore, type ArchiveWatchConnection,
} from '../src/lib/atomicArchiveSave';

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    return { promise, resolve };
}

/** Protocol mock only: WATCH records a version; EXEC compares it. No archive ordering logic here. */
class MemoryRedis {
    value: string | null = null;
    version = 0;
    writes = 0;
    reads: (string | null)[] = [];
    connections = 0;
    closed = 0;
    now = 0;
    expiresAt: number | null = null;
    readGate?: () => Promise<void>;
    beforeExec?: (raw: string) => Promise<void>;
    afterExec?: () => void;
    failExec = false;
    alwaysConflict = false;
    failUnwatch = false;
    execs = 0;

    seed(value: unknown) { this.value = JSON.stringify(value); this.version++; }
    store(): AtomicArchiveStore {
        return { connectWatch: async () => this.connect() };
    }
    connect(): ArchiveWatchConnection {
        this.connections++;
        let watched = -1;
        return {
            watch: async () => { watched = this.version; },
            get: async () => {
                const raw = this.value;
                this.reads.push(raw);
                await this.readGate?.();
                return raw;
            },
            unwatch: async () => { if (this.failUnwatch) throw new Error('offline cleanup failure'); },
            disconnect: () => { this.closed++; },
            multi: () => ({ set: (_key, raw, _mode, ttl) => ({ exec: async () => {
                this.execs++;
                await this.beforeExec?.(raw);
                if (this.alwaysConflict || watched !== this.version) return null;
                if (this.failExec) return [[new Error('offline write failure'), null]];
                this.value = raw;
                this.version++;
                this.writes++;
                this.expiresAt = this.now + ttl * 1000;
                this.afterExec?.();
                return [[null, 'OK']];
            } }) }),
        };
    }
}

test('two instances read the same old value; latest commits before slow older request', async () => {
    const db = new MemoryRedis();
    db.seed({ sourceTime: 100, value: 'initial' });
    const initial = db.value;
    const bothRead = deferred(), committed = deferred();
    let reads = 0;
    db.readGate = async () => { if (++reads === 2) bothRead.resolve(); await bothRead.promise; };
    db.beforeExec = async raw => { if (JSON.parse(raw).sourceTime === 200) await committed.promise; };
    db.afterExec = committed.resolve;
    assert.deepEqual(await Promise.all([
        atomicArchiveSave(db.store(), 'archive', { sourceTime: 300, value: 'latest' }, 60),
        atomicArchiveSave(db.store(), 'archive', { sourceTime: 200, value: 'older' }, 60),
    ]), ['written', 'skip-older']);
    assert.deepEqual(db.reads.slice(0, 2), [initial, initial]);
    assert.equal(JSON.parse(db.value!).value, 'latest');
    assert.equal(db.writes, 1);
    assert.equal(db.connections, 2);
    assert.equal(db.closed, 2);
});

for (const correctionFirst of [true, false]) {
    test(`same-source correction survives concurrent normal value (correction first=${correctionFirst})`, async () => {
        const db = new MemoryRedis();
        db.seed({ sourceTime: 100, price: 90 });
        const bothRead = deferred(), firstCommitted = deferred();
        let reads = 0;
        db.readGate = async () => { if (++reads === 2) bothRead.resolve(); await bothRead.promise; };
        db.beforeExec = async raw => {
            if ((JSON.parse(raw).correction === true) !== correctionFirst) await firstCommitted.promise;
        };
        db.afterExec = firstCommitted.resolve;
        const outcomes = await Promise.all([
            atomicArchiveSave(db.store(), 'archive', { sourceTime: 200, price: 110, correction: true }, 60),
            atomicArchiveSave(db.store(), 'archive', { sourceTime: 200, price: 100 }, 60),
        ]);
        assert.equal(outcomes[0], 'written');
        assert.equal(outcomes[1], correctionFirst ? 'skip-correction' : 'written');
        assert.deepEqual(JSON.parse(db.value!), { sourceTime: 200, price: 110, correction: true });
        assert.equal(db.closed, 2);
    });
}

test('identical source from concurrent instances performs exactly one write', async () => {
    const db = new MemoryRedis();
    const outcomes = await Promise.all(Array.from({ length: 2 }, () =>
        atomicArchiveSave(db.store(), 'archive', { sessionDate: '2026-10-16', observedAt: 200, value: 0 }, 60)));
    assert.deepEqual(outcomes.sort(), ['skip-same', 'written']);
    assert.equal(db.writes, 1);
    assert.equal(JSON.parse(db.value!).value, 0);
});

test('session date precedes observedAt; time precedes correction', async () => {
    const db = new MemoryRedis();
    db.seed({ sessionDate: '2026-10-16', observedAt: 200, correction: true });
    assert.equal(await atomicArchiveSave(db.store(), 'archive', { sessionDate: '2026-10-15', observedAt: 999, correction: true }, 60), 'skip-older');
    assert.equal(await atomicArchiveSave(db.store(), 'archive', { sessionDate: '2026-10-16', observedAt: 199, correction: true }, 60), 'skip-older');
    assert.equal(await atomicArchiveSave(db.store(), 'archive', { sessionDate: '2026-10-16', observedAt: 201 }, 60), 'written');
    assert.equal(await atomicArchiveSave(db.store(), 'archive', { sessionDate: '2026-10-19', observedAt: 1 }, 60), 'written');
});

test('same flag ties skip; later source can replace a corrected record; skipped saves preserve TTL', async () => {
    const db = new MemoryRedis();
    const store = db.store();
    assert.equal(await atomicArchiveSave(store, 'archive', { sourceTime: 100, correction: true }, 60), 'written');
    db.now = 1000;
    assert.equal(await atomicArchiveSave(store, 'archive', { sourceTime: 100, correction: true }, 500), 'skip-same');
    assert.equal(await atomicArchiveSave(store, 'archive', { sourceTime: 100, correction: false }, 500), 'skip-correction');
    assert.equal(await atomicArchiveSave(store, 'archive', { sourceTime: 99, correction: true }, 500), 'skip-older');
    assert.equal(db.expiresAt, 60000);
    assert.equal(db.writes, 1);
    assert.equal(await atomicArchiveSave(store, 'archive', { sourceTime: 101 }, 60), 'written');
    assert.equal(db.expiresAt, 61000);
});

test('EVAL gets one key, exact JSON and EX TTL; WATCH is not used on success', async () => {
    let calls = 0;
    const payload = { sourceTime: 100, value: { label: '한글 😀', zero: 0 }, correction: true };
    const store: AtomicArchiveStore = {
        eval: async (script, keys, args) => {
            calls++;
            assert.equal(script, ATOMIC_ARCHIVE_SAVE_LUA);
            assert.deepEqual(keys, ['archive']);
            assert.deepEqual(args, [JSON.stringify(payload), 60]);
            return 'written';
        },
        connectWatch: async () => { throw new Error('unexpected WATCH'); },
    };
    assert.equal(await atomicArchiveSave(store, 'archive', payload, 60), 'written');
    assert.equal(calls, 1);
});

for (const message of ["ERR unknown command 'EVAL', with args beginning with:", 'ERR EVAL is not supported', 'unsupported command: EVAL']) {
    test(`explicit EVAL unsupported falls back to WATCH: ${message}`, async () => {
        const db = new MemoryRedis();
        const store = { ...db.store(), eval: async () => { throw new Error(message); } };
        assert.equal(await atomicArchiveSave(store, 'archive', { sourceTime: 1 }, 60), 'written');
        assert.equal(db.writes, 1);
    });
}

for (const message of ['timeout', 'NOPERM no permissions to run EVAL', 'ERR invalid JSON', 'ERR Error running script: unknown command eval']) {
    test(`ambiguous/ACL/script failures do not fall back: ${message}`, async () => {
        const db = new MemoryRedis();
        const store = { ...db.store(), eval: async () => { throw new Error(message); } };
        await assert.rejects(atomicArchiveSave(store, 'archive', { sourceTime: 1 }, 60));
        assert.equal(db.connections, 0);
        assert.equal(db.writes, 0);
    });
}

test('missing atomic primitives and invalid EVAL responses fail explicitly', async () => {
    await assert.rejects(atomicArchiveSave({}, 'archive', { sourceTime: 1 }, 60), /atomic operations unavailable/);
    const db = new MemoryRedis();
    for (const reply of ['OK', 'Aborted', null, 1]) {
        await assert.rejects(atomicArchiveSave({ ...db.store(), eval: async () => reply }, 'archive', { sourceTime: 1 }, 60), /invalid response/);
    }
    assert.equal(db.connections, 0);
});

test('invalid incoming data is rejected before any storage call', async () => {
    const db = new MemoryRedis();
    const invalid = [null, [], {}, { sourceTime: null }, { sourceTime: '100' }, { sourceTime: NaN },
        { sourceTime: Infinity }, { sourceTime: -1 }, { sourceTime: 1.5 }, { sourceTime: Number.MAX_SAFE_INTEGER + 1 },
        { sourceTime: 1, correction: 'true' }, { sourceTime: 1, sessionDate: '2026-10-16' },
        { sessionDate: '2026-02-29', observedAt: 1 }, { sessionDate: '2026-02-30', observedAt: 1 },
        { sessionDate: '0000-01-01', observedAt: 1 }, { sessionDate: '2026-13-01', observedAt: 1 },
        { sessionDate: '2026-10-16', observedAt: null },
        { sourceTime: 1, toJSON: () => ({ sourceTime: null }) }];
    for (const value of invalid) await assert.rejects(atomicArchiveSave(db.store(), 'archive', value as any, 60));
    for (const ttl of [0, -1, 0.5, NaN, Infinity, 2_147_483_648]) {
        await assert.rejects(atomicArchiveSave(db.store(), 'archive', { sourceTime: 1 }, ttl));
    }
    await assert.rejects(atomicArchiveSave(db.store(), '', { sourceTime: 1 }, 60));
    assert.equal(db.connections, 0);
});

test('corrupt or mismatched existing metadata is retained and connection discarded', async () => {
    const db = new MemoryRedis();
    for (const raw of ['broken JSON', 'null', '[]', '{"value":1}', '{"sourceTime":null}', '{"sessionDate":"2026-10-16","observedAt":1}']) {
        db.value = raw;
        await assert.rejects(atomicArchiveSave(db.store(), 'archive', { sourceTime: 200 }, 60));
        assert.equal(db.value, raw);
    }
    assert.equal(db.writes, 0);
    assert.equal(db.closed, db.connections);
});

test('bounded contention and failed transactions do not report success', async () => {
    const db = new MemoryRedis();
    db.alwaysConflict = true;
    await assert.rejects(atomicArchiveSave(db.store(), 'archive', { sourceTime: 1 }, 60), /contention limit/);
    assert.equal(db.execs, 8);
    db.alwaysConflict = false;
    db.failExec = true;
    await assert.rejects(atomicArchiveSave(db.store(), 'archive', { sourceTime: 1 }, 60), /transaction failed/);
    assert.equal(db.closed, 2);
    assert.equal(db.writes, 0);
});

test('cleanup failure does not mask a committed result', async () => {
    const db = new MemoryRedis();
    db.failUnwatch = true;
    assert.equal(await atomicArchiveSave(db.store(), 'archive', { sourceTime: 1 }, 60), 'written');
    assert.equal(db.closed, 1);
});

// Compile-only interoperability checks; no configured client or environment is accessed.
function upstashAdapter(client: UpstashRedis): AtomicArchiveStore {
    return { eval: (script, keys, args) => client.eval(script, keys, args) };
}
function ioredisAdapter(client: Redis): AtomicArchiveStore {
    return {
        eval: (script, keys, args) => client.eval(script, keys.length, ...keys, ...args),
        connectWatch: async () => {
            const connection = client.duplicate({ lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0 });
            try { await connection.connect(); return connection; }
            catch (error) { connection.disconnect(); throw error; }
        },
    };
}
void upstashAdapter;

const hasRedis = spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status === 0;
test('real Redis: Lua ordering, correction, TTL, invalid records and WATCH fallback', { skip: !hasRedis }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'atomic-archive-'));
    const socket = join(dir, 'redis.sock');
    const server = spawn('redis-server', ['--port', '0', '--unixsocket', socket, '--save', '', '--appendonly', 'no', '--dir', dir], { stdio: 'ignore' });
    const client = new Redis(socket, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null });
    client.on('error', () => {});
    try {
        for (let i = 0; i < 100; i++) {
            try { await client.connect(); break; }
            catch { if (i === 99) throw new Error('local Redis did not start'); await new Promise(r => setTimeout(r, 20)); }
        }
        const store = ioredisAdapter(client);
        await client.set('archive', JSON.stringify({ sourceTime: 100, value: 'initial' }));
        const [firstRead, secondRead] = await Promise.all([client.get('archive'), client.get('archive')]);
        assert.equal(firstRead, secondRead);
        // Delay the older EVAL until the newer EVAL commits, reproducing stale caller snapshots.
        const latest = deferred();
        const older = atomicArchiveSave({ eval: async (...args) => { await latest.promise; return store.eval!(...args); } }, 'archive', { sourceTime: 200 }, 60);
        assert.equal(await atomicArchiveSave(store, 'archive', { sourceTime: 300 }, 60), 'written');
        latest.resolve();
        assert.equal(await older, 'skip-older');
        assert.equal(await atomicArchiveSave(store, 'archive', { sourceTime: 300, correction: true }, 60), 'written');
        assert.equal(await atomicArchiveSave(store, 'archive', { sourceTime: 300 }, 500), 'skip-correction');
        assert.equal(await atomicArchiveSave(store, 'archive', { sourceTime: 300, correction: true }, 500), 'skip-same');
        assert.ok((await client.ttl('archive')) <= 60);
        assert.deepEqual(JSON.parse((await client.get('archive'))!), { sourceTime: 300, correction: true });
        await client.set('archive', '{"sourceTime":null}');
        await assert.rejects(atomicArchiveSave(store, 'archive', { sourceTime: 400 }, 60));
        assert.equal(await client.get('archive'), '{"sourceTime":null}');
        await client.del('archive');
        const fallback = { ...store, eval: async () => { throw new Error("ERR unknown command 'EVAL'"); } };
        const results = await Promise.all(Array.from({ length: 2 }, () => atomicArchiveSave(fallback, 'archive', { sessionDate: '2026-10-16', observedAt: 100 }, 60)));
        assert.deepEqual(results.sort(), ['skip-same', 'written']);
    } finally {
        client.disconnect();
        server.kill('SIGTERM');
        await new Promise<void>(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', () => resolve()); });
        await rm(dir, { recursive: true, force: true });
    }
});
