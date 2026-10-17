'use strict';
// Offline tick -> runOnce integration; all files stay in a disposable directory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const clock = require('./clock');
const targets = require('./source-parity-target');
const target = targets.resolve({ base: 'https://preview.example.test', hub: 'wss://preview-hub.example.test' });
const at = clock.etToMs('2026-10-15', '11:03:00');
const watchFile = path.join(__dirname, 'watch.js');
const source = fs.readFileSync(watchFile, 'utf8');

for (const kind of ['fresh', 'legacy', 'changed', 'matching']) {
    test(`tick runs once per slot with ${kind} state and runs again next slot`, async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'signum-watch-scheduling-'));
        const stateFile = path.join(root, 'state.json');
        const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
        let now = at, rounds = 0, appReads = 0, earningsReads = 0;
        const previous = {
            lastSlot: Math.floor((at / 1000 - 120) / 900) - 1,
            earn: { key: '2026-10-15am', list: ['OLD_ONLY'] },
            daily: { OLD_ONLY: { ok: true } }, cls: { OLD_ONLY: 'old' },
            pending: { 'OLD_WARNING|OLD_ONLY|app|price': { n: 1, at: at - 900000 } },
            rot: 24,
            ...(kind === 'legacy' ? {} : { target: kind === 'matching' ? target : targets.resolve() }),
        };
        if (kind !== 'fresh') fs.writeFileSync(stateFile, JSON.stringify(previous));
        const refs = {
            sleep: async () => {}, setDeadline() {},
            getJson: async () => { earningsReads++; return { ok: false }; },
            fetchYahoo1m: async () => ({ ok: true, bars: [{ t: now, c: 100, h: 100, l: 100, o: 100, v: 1 }] }),
            fetchYahooDaily: async () => ({ ok: true, daily: [{ date: '2026-10-14', c: 100 }], events: [] }),
            fetchNasdaqInfo: async () => ({ ok: false }), fetchNasdaqExt: async () => ({ ok: false }),
        };
        const overrides = {
            './refs': refs,
            './source-parity': { ...require('./source-parity'), monitor: async ({ symbols, target: actual }) => {
                assert.deepEqual(actual, target); rounds++;
                return { target, calls: symbols.length, skipped: false, findings: [] };
            } },
            './screenprobe': { probe: async () => ({ ok: true, flow: {}, intel: { rows: [] } }) },
            tls: { connect: () => { throw new Error('offline TLS'); } },
            child_process: { spawnSync: () => ({ status: 0 }), execFileSync: () => assert.fail('no subprocesses') },
        };
        const context = vm.createContext({
            module: { exports: {} }, __filename: watchFile,
            require: (id) => overrides[id] || require(id),
            process: { env: { INTEGRITY_DIR: root, INTEGRITY_BASE: target.base, INTEGRITY_HUB: target.hub }, pid: process.pid },
            Date: class extends Date { static now() { return now; } }, URL, AbortSignal, console,
            setTimeout: (fn) => { queueMicrotask(fn); return 0; },
            WebSocket: class {
                constructor() { queueMicrotask(() => { this.onopen(); this.onclose(); }); }
                send() {} close() {}
            },
            fetch: async (url) => {
                const u = new URL(url); assert.equal(u.origin, target.base); appReads++;
                const data = Object.fromEntries((u.searchParams.get('symbols') || '').split(',').map((s) => [s, { price: 100, previousClose: 100, changePercent: 0, session: 'regular' }]));
                const body = u.pathname === '/api/live/quotes' ? { data, session: 'regular' }
                    : u.pathname === '/api/live/ticker' ? { session: 'REG', display: { price: 100, changePctPct: 0 }, prices: { prevRegularClose: 100 } }
                        : u.pathname === '/api/watchlist/batch' ? { results: [] } : {};
                return { ok: true, status: 200, text: async () => JSON.stringify(body) };
            },
        });
        try {
            // Expose the real private CLI entry point only inside this test VM.
            vm.runInContext(source + '\nmodule.exports.tick = tick;', context, { filename: watchFile });
            const watch = context.module.exports;
            await watch.tick();
            assert.equal(rounds, 1);
            assert.equal(fs.existsSync(path.join(root, 'run.lock')), false);
            const readsAfterRound = appReads;
            now += 60000;
            await watch.tick();
            assert.equal(rounds, 1, 'a finished round must not collect sources twice in the same slot');
            assert.equal(appReads, readsAfterRound, 'duplicate tick must not query the app');
            assert.equal(fs.readFileSync(path.join(root, 'history.jsonl'), 'utf8').trim().split('\n').length, 1);
            const state = read('state.json');
            assert.equal(state.lastSlot, watch.slotOf(now));
            assert.deepEqual(state.target, target);
            if (kind === 'matching') {
                assert.equal(earningsReads, 0);
                assert.ok(state.pending['OLD_WARNING|OLD_ONLY|app|price']);
                assert.equal(state.daily.OLD_ONLY.ok, true);
                assert.equal(state.cls.OLD_ONLY, 'old');
            } else {
                assert.equal(earningsReads, 1);
                assert.ok(!state.earn.list.includes('OLD_ONLY'));
                assert.ok(!state.daily.OLD_ONLY && !state.cls.OLD_ONLY);
                assert.ok(!state.pending['OLD_WARNING|OLD_ONLY|app|price']);
            }
            now = at + 900000;
            await watch.tick();
            assert.equal(rounds, 2, 'next slot must still run');
            assert.ok(appReads > readsAfterRound);
            assert.equal(read('state.json').lastSlot, watch.slotOf(now));
            assert.equal(fs.readFileSync(path.join(root, 'history.jsonl'), 'utf8').trim().split('\n').length, 2);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
}
