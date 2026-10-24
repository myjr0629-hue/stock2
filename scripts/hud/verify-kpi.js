#!/usr/bin/env node
'use strict';
// Offline fixtures only: no browser, real allocators, network, or operational files.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const S = require('./sources');
const R = require('./redeem-summary');
const names = ['Active Subscriptions', 'Active Trials', 'MRR', 'New Customers', 'Revenue'];
const apple = '배포(장부) 1,120장 · 오늘 10장 · 댓글로 사용 확인 7장 · 남은 880장 / 2,000\n  묶음 만료 2026-12-31: 남은 880장 / 2,000';
const play = '안드로이드 게시용 남은 50장 · 오늘(2026-10-17) 배분 2장 · 서버 풀 300장(건드리지 않음)';
const at = Date.parse('2026-10-17T01:00:00Z');
const temporary = (t) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-kpi-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };

class Element {
    constructor(text = '', children = [], hidden = false) { this.text = text; this.children = children; this.hidden = hidden; children.forEach((c) => { c.parentElement = this; }); }
    get innerText() { return [this.text, ...this.children.map((c) => c.innerText)].filter(Boolean).join('\n'); }
    getClientRects() { return this.hidden || this.parentElement?.getClientRects().length === 0 ? [] : [{}]; }
    contains(other) { return this === other || this.children.some((c) => c.contains(other)); }
    descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
const card = (label, value, change = '12.5%') => new Element('', [new Element('', [new Element(label)]), new Element(value), new Element(change)]);
async function readDom(cards, pathname = '/projects/example/overview') {
    const { readOverviewDocument } = await import('./rc-auto.mjs');
    const body = new Element('', cards);
    return JSON.parse(JSON.stringify(vm.runInNewContext('(' + readOverviewDocument.toString() + ')()', {
        document: { body, querySelectorAll: () => body.descendants() }, location: { pathname },
    })));
}

test('Overview preserves the observed reporting period without inventing a default', async () => {
    const observed = await readDom([new Element('Last 28 days'), card('New Customers', '214')]);
    assert.equal(observed.period, 'Last 28 days');
    assert.equal((await readDom([card('New Customers', '214')])).period, null);
});

test('Overview reads tolerant labels, zero, currency, and compact numbers', async () => {
    const j = await readDom([card('ACTIVE  SUBSCRIPTION?', '1,234'), card('Active\nTrial', '0'), card('Monthly Recurring Revenue', 'US$ 1.25K'), card('New Customer', '23'), card('Revenue (USD)', '$45.67')]);
    assert.deepEqual(names.map((name) => j.metrics[name].value), [1234, 0, 1250, 23, 45.67]);
    assert.equal(j.metrics['MRR'].label, 'Monthly Recurring Revenue');
    assert.equal(j.metrics.Revenue.display, '$45.67');
    assert.deepEqual(j.missing, []);
});

test('Overview never borrows values from adjacent cards or percentages', async () => {
    const hidden = card('Active Trials', '99'); hidden.hidden = true;
    const j = await readDom([card('Active Subscriptions', '—'), card('Revenue', '$8.50'), hidden, card('New Customers', 'Loading...')]);
    assert.equal(j.metrics['Active Subscriptions'].value, null);
    assert.equal(j.metrics['Active Trials'].value, null);
    assert.equal(j.metrics['New Customers'].value, null);
    assert.equal(j.metrics.Revenue.value, 8.5);
    assert.equal(j.missing.length, 4);
    assert.equal((await readDom([], '/login')).signin, true);
    assert.equal((await readDom([card('Revenue', '-$5.20')])).metrics.Revenue.value, -5.2);
});

test('Reader never touches space 0 and stops when its own HUD space is user-controlled or unavailable', async (t) => {
    const originalLog = console.log;
    const output = [];
    console.log = (...args) => output.push(args.join(' '));
    t.after(() => { console.log = originalLog; delete global.listTaskSpaces; delete global.claimTaskSpace; delete global.takeOverTaskSpace; delete global.taskSpace; });
    global.listTaskSpaces = async () => [{ id: 0, ownership: 'agentDelegatedToUser' }];
    global.claimTaskSpace = () => assert.fail('Must not claim any space');
    global.takeOverTaskSpace = () => assert.fail('Must not take over any space');
    const asked = [];
    for (const [i, impl] of [
        [0, async (name) => { asked.push(name); return { spaceId: 9, ownership: 'agentDelegatedToUser' }; }],
        [1, async (name) => { asked.push(name); throw new Error('EGO_TASK_SPACE_NAME_IN_USE'); }],
    ]) {
        global.taskSpace = impl;
        await import(pathToFileURL(path.join(__dirname, 'rc-auto.mjs')).href + '?busy=' + i);
    }
    assert.deepEqual(output, ['SPACE_BUSY', 'SPACE_BUSY']);
    assert.equal(asked.every((name) => /^hud-reader/.test(name)), true);
});

test('Reader runs in its own HUD space even when space 0 is user-controlled, and preserves the Overview and chart sequence', async (t) => {
    const originalLog = console.log, originalTimeout = global.setTimeout, calls = [], output = [];
    console.log = (...args) => output.push(args.join(' '));
    global.setTimeout = (callback) => { callback(); return 0; };
    t.after(() => { console.log = originalLog; global.setTimeout = originalTimeout; delete global.listTaskSpaces; delete global.claimTaskSpace; delete global.takeOverTaskSpace; delete global.taskSpace; });
    const page = {
        current: '',
        async goto(url) { this.current = url; calls.push(['goto', url]); },
        async url() { return this.current; },
        async evaluate(fn) {
            if (fn.name === 'readOverviewDocument') return { metrics: {}, missing: [], signin: false };
            return { dates: Array(8).fill('date'), rows: Array(3).fill(Array(8).fill('0')), labels: ['Total', 'iOS', 'Android', 'New Trials'], signin: false };
        },
        async close() { calls.push(['close']); },
    };
    global.listTaskSpaces = async () => [{ id: 0, ownership: 'agentDelegatedToUser' }];
    global.claimTaskSpace = async () => assert.fail('Must not claim any space');
    global.takeOverTaskSpace = async () => assert.fail('Must not take over any space');
    global.taskSpace = async (name, opts) => { calls.push(['space', name, opts && opts.profileId]); return { spaceId: 18, ownership: 'agent', newPage: async () => page }; };
    await import(pathToFileURL(path.join(__dirname, 'rc-auto.mjs')).href + '?success');
    assert.deepEqual(calls.slice(0, 1), [['space', 'hud-reader', 'Profile 1']]);
    const navigations = calls.filter(([kind]) => kind === 'goto').map(([, url]) => url);
    assert.equal(navigations.length, 4);
    assert.match(navigations[0], /\/overview$/);
    assert.match(navigations[1], /customers_new_v3/);
    assert.match(navigations[2], /segment=platform/);
    assert.match(navigations[3], /trials_new_v3/);
    assert.equal(calls.filter(([kind]) => kind === 'close').length, 1);
    assert.equal(output.some((line) => line.startsWith('RC_OVERVIEW ')), true);
    assert.equal(output.some((line) => line.startsWith('플랫폼별(ok):')), true);
    assert.equal(output.some((line) => line.startsWith('신규체험(ok):')), true);
});

test('Reader resumes an existing HUD space by id (no profileId) and skips a user-controlled one', async (t) => {
    const originalLog = console.log, originalTimeout = global.setTimeout, calls = [];
    console.log = () => {};
    global.setTimeout = (callback) => { callback(); return 0; };
    t.after(() => { console.log = originalLog; global.setTimeout = originalTimeout; delete global.listTaskSpaces; delete global.claimTaskSpace; delete global.takeOverTaskSpace; delete global.taskSpace; });
    const page = { async goto() {}, async url() { return ''; }, async evaluate() { return { metrics: {}, missing: [], signin: true, dates: [], rows: [], labels: [] }; }, async close() { calls.push(['close']); } };
    global.listTaskSpaces = async () => [{ id: 0, name: 'mkt', ownership: 'agentDelegatedToUser' }, { id: 18, name: 'hud-reader', ownership: 'agentDelegatedToUser' }, { id: 19, name: 'hud-reader-2', ownership: 'agent' }];
    global.claimTaskSpace = async () => assert.fail('Must not claim any space');
    global.takeOverTaskSpace = async () => assert.fail('Must not take over any space');
    global.taskSpace = async (...args) => { calls.push(['space', ...args]); return { spaceId: 19, ownership: 'agent', newPage: async () => page }; };
    await import(pathToFileURL(path.join(__dirname, 'rc-auto.mjs')).href + '?resume');
    assert.deepEqual(calls[0], ['space', 19]);
});

test('Redeem uses only read-only count commands and keeps unreported totals null', () => {
    const calls = [];
    const result = R.collect({ dir: '/fixture/redeem', now: at, execute: (command, args) => {
        calls.push([command, args]);
        return args[0].endsWith('/alloc-onetime.py') ? apple : play;
    } });
    assert.deepEqual(calls, [['python3', ['/fixture/redeem/alloc-onetime.py', '--count']], ['python3', ['/fixture/redeem/alloc-play-onetime.py', '--count']]]);
    assert.equal(result.platforms.ios.distributed, 1120);
    assert.equal(result.platforms.ios.confirmedUsed, 7);
    assert.equal(result.platforms.android.remaining, 50);
    assert.equal(result.platforms.android.distributed, null);
    assert.equal(result.platforms.android.confirmedUsed, null);
    assert.equal(result.total.distributed, null);
    assert.equal(result.total.confirmedUsed, null);
    assert.equal(result.total.remaining, 930);
    assert.equal(result.total.today, 12);
});

test('Redeem discards unrecognized output and exception details', () => {
    const result = R.collect({ execute: (_, args) => {
        if (args[0].endsWith('/alloc-onetime.py')) throw new Error('PRIVATE_SENTINEL');
        return 'PRIVATE_SENTINEL';
    } });
    assert.equal(result.platforms.ios.error, 'count_failed');
    assert.equal(result.platforms.android.error, 'unrecognized_output');
    assert.equal(result.total.remaining, null);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
});

test('KPI loaders preserve pending, partial, zero, timestamps, and freshness', (t) => {
    const work = temporary(t), file = path.join(work, '2026-10-17/report/rc-overview.json');
    const redeemFile = path.join(work, 'redeem-summary.json');
    assert.equal(S.loadRcOverview({ work, file: null }).msg, '판독 대기');
    assert.equal(S.loadRedeemSummary({ file: redeemFile }).msg, '판독 대기');
    const metrics = Object.fromEntries(names.map((name) => [name, { label: name, value: 0, display: '0' }]));
    write(file, { schemaVersion: 1, readAt: new Date(at).toISOString(), metrics, trialToPaidConversion: 99 });
    const overview = S.loadRcOverview({ work, file: null, now: at + 1000 });
    assert.equal(overview.state, 'ok');
    assert.equal(overview.readAt, at);
    assert.equal(overview.ageMs, 1000);
    assert.equal(overview.stale, false);
    assert.equal(overview.trialToPaidConversion, null);
    assert.equal(S.loadRcOverview({ file, now: at + 41 * 60e3 }).stale, true);
    metrics['Active Trials'].value = null;
    metrics.Revenue.value = -5.2;
    write(file, { schemaVersion: 1, readAt: new Date(at).toISOString(), metrics });
    assert.equal(S.loadRcOverview({ file }).state, 'partial');
    assert.equal(S.loadRcOverview({ file }).metrics.Revenue.value, -5.2);
    // A malformed newest file must not silently fall back to an older healthy file.
    write(path.join(work, '2026-10-18/report/rc-overview.json'), '{}');
    assert.equal(S.loadRcOverview({ work, file: null }).state, 'pending');
    write(file, '{broken');
    assert.equal(S.loadRcOverview({ file }).state, 'pending');
    write(file, 'null');
    assert.equal(S.loadRcOverview({ file }).state, 'pending');
    const result = R.collect({ now: at, execute: (_, args) => args[0].endsWith('/alloc-onetime.py') ? apple : play });
    write(redeemFile, result);
    const redeem = S.loadRedeemSummary({ file: redeemFile, now: at });
    assert.equal(redeem.state, 'partial');
    assert.equal(redeem.total.confirmedUsed, null);
    assert.equal(redeem.platforms.ios.confirmedUsed, 7);
    assert.equal(redeem.stale, false);
    assert.equal(S.loadRedeemSummary({ file: redeemFile, now: at + 25 * 3600e3 }).stale, true);
    write(redeemFile, 'null');
    assert.equal(S.loadRedeemSummary({ file: redeemFile }).state, 'pending');
});

test('Refresh saves Overview even when retaining a previous platform log', (t) => {
    const root = temporary(t), work = path.join(root, 'work'), io = path.join(root, 'io');
    const runner = path.join(root, 'runner.sh'), fixture = path.join(root, 'fixture.mjs'), outputFile = path.join(root, 'output.txt');
    write(runner, 'exec "$HUD_TEST_NODE" "$HUD_TEST_RUNNER" "$1"\n');
    write(fixture, `import fs from 'node:fs';\nif (!fs.readFileSync(process.argv[2], 'utf8').includes('readOverviewDocument')) process.exit(9);\nconsole.log(fs.readFileSync(process.env.HUD_TEST_OUTPUT, 'utf8'));\n`);
    const readAt = Date.now(), iso = new Date(readAt).toISOString();
    const dates = Array.from({ length: 8 }, (_, i) => {
        const d = new Date(readAt - (7 - i) * 86400e3);
        return d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) + ' ' + String(d.getUTCDate()).padStart(2, '0') + " '" + String(d.getUTCFullYear()).slice(2);
    });
    const chart = { labels: ['New Customers'], dates, rows: [dates.map(() => '1')] };
    const report = path.join(work, S.kstDay(readAt), 'report'), logFile = path.join(report, 'rc.log');
    const previous = '읽음: ' + iso + '\n플랫폼별(ok): preserved fixture\n';
    write(logFile, previous);
    const overview = { schemaVersion: 1, readAt: iso, metrics: Object.fromEntries(names.map((name) => [name, { label: name, value: 0, display: '0' }])) };
    const run = (out) => {
        write(outputFile, out);
        return execFileSync(process.execPath, [path.join(__dirname, 'refresh.js'), 'run', 'rc'], { encoding: 'utf8', timeout: 10000,
            env: { ...process.env, HUD_WORK: work, HUD_EGO_IO: io, HUD_REFRESH_STATE: path.join(io, 'state.json'), HUD_EGO_RUN: runner,
                HUD_RC_SCRIPT: path.join(__dirname, 'rc-auto.mjs'), HUD_TEST_NODE: process.execPath, HUD_TEST_RUNNER: fixture, HUD_TEST_OUTPUT: outputFile } });
    };
    run('읽음: ' + iso + '\n전체: ' + JSON.stringify(chart) + '\nRC_OVERVIEW ' + JSON.stringify(overview));
    assert.equal(fs.readFileSync(logFile, 'utf8'), previous);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(report, 'rc-overview.json'), 'utf8')), overview);
    // Invalid timestamps fall back safely; chart rejection must not block Overview.
    try { run('읽음: invalid\nRC_OVERVIEW ' + JSON.stringify(overview)); } catch (e) { assert.equal(e.status, 1); }
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(report, 'rc-overview.json'), 'utf8')), overview);
    assert.equal(fs.readFileSync(logFile, 'utf8'), previous);
    // Authentication failures must never overwrite the last observed cards.
    try { run('SIGNIN\nRC_OVERVIEW ' + JSON.stringify({ ...overview, signin: true, metrics: {} })); } catch (e) { assert.equal(e.status, 1); }
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(report, 'rc-overview.json'), 'utf8')), overview);
});

test('Redeem CLI writes JSON using fake Python counts only', (t) => {
    const root = temporary(t), bin = path.join(root, 'bin'), file = path.join(root, 'summary.json');
    const fake = path.join(root, 'python.mjs');
    write(path.join(bin, 'python3'), '#!/bin/sh\nexec "$HUD_TEST_NODE" "$HUD_TEST_PYTHON" "$@"\n');
    fs.chmodSync(path.join(bin, 'python3'), 0o700);
    write(fake, `if (process.argv.length !== 4 || process.argv[3] !== '--count') process.exit(8);\nconsole.log(process.argv[2].endsWith('/alloc-onetime.py') ? ${JSON.stringify(apple)} : ${JSON.stringify(play)});\n`);
    const out = execFileSync(process.execPath, [path.join(__dirname, 'redeem-summary.js')], { encoding: 'utf8', timeout: 10000,
        env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, HUD_WORK: root, HUD_REDEEM_SUMMARY: file,
            HUD_TEST_NODE: process.execPath, HUD_TEST_PYTHON: fake } });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), JSON.parse(out));
    assert.equal(S.loadRedeemSummary({ file }).total.remaining, 930);
});
