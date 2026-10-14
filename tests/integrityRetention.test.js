'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pruneRuns, MAX_RUN_BYTES, MAX_RUN_AGE_MS } = require('../scripts/integrity/retention');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'signum-retention-'));
const now = Date.now();
let count = 0;
function test(name, fn) {
    const dir = path.join(root, String(count));
    fs.mkdirSync(dir);
    fn(dir); count++; console.log(`  ✓ ${name}`);
}
function file(dir, name, bytes, age = 0) {
    const p = path.join(dir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.alloc(bytes));
    fs.utimesSync(p, new Date(now - age), new Date(now - age));
    return p;
}
try {
    test('3일이 지난 파일만 지우고 상한 이하의 최근 파일은 유지', (dir) => {
        const old = file(dir, 'old.json', 10, MAX_RUN_AGE_MS + 1000);
        const recent = file(dir, 'recent.json', 10);
        assert.deepEqual(pruneRuns(dir, { now }), { bytes: 10, removed: 1, failed: 0, overLimit: false });
        assert.ok(!fs.existsSync(old)); assert.ok(fs.existsSync(recent));
    });
    test('하위 폴더·임시 파일까지 합산하고 오래된 순으로 상한까지 삭제', (dir) => {
        const old = file(dir, 'z-old.json', 40, 3000);
        const middle = file(dir, 'nested/middle.tmp', 40, 2000);
        const latest = file(dir, 'a-latest.json', 50, 1000);
        assert.deepEqual(pruneRuns(dir, { now, maxBytes: 80 }), { bytes: 50, removed: 2, failed: 0, overLimit: false });
        assert.ok(!fs.existsSync(old)); assert.ok(!fs.existsSync(middle)); assert.ok(fs.existsSync(latest));
    });
    test('200MiB 기본 상한: 최신 단일 파일도 초과하면 제거(희소 파일)', (dir) => {
        const p = file(dir, 'large.json', 0);
        fs.truncateSync(p, MAX_RUN_BYTES);
        assert.equal(pruneRuns(dir, { now }).removed, 0);
        fs.truncateSync(p, MAX_RUN_BYTES + 1);
        assert.deepEqual(pruneRuns(dir, { now }), { bytes: 0, removed: 1, failed: 0, overLimit: false });
    });
    test('심볼릭 링크를 따라 외부 파일을 삭제하지 않는다', (dir) => {
        const outside = file(root, 'outside/keep.json', 100);
        fs.symlinkSync(path.dirname(outside), path.join(dir, 'linked'));
        assert.equal(pruneRuns(dir, { now, maxBytes: 0 }).bytes, 0);
        assert.ok(fs.existsSync(outside));
    });
    test('삭제 실패를 보고하면서 다음 파일 정리를 계속한다', (dir) => {
        const blocked = file(dir, 'old.json', 50, 2000);
        const other = file(dir, 'new.json', 50, 1000);
        const unlink = fs.unlinkSync;
        try {
            fs.unlinkSync = (p) => { if (p === blocked) throw new Error('synthetic failure'); unlink(p); };
            assert.deepEqual(pruneRuns(dir, { now, maxBytes: 40 }), { bytes: 50, removed: 1, failed: 1, overLimit: true });
            assert.ok(fs.existsSync(blocked)); assert.ok(!fs.existsSync(other));
        } finally { fs.unlinkSync = unlink; }
    });
    console.log(`integrityRetention: ${count} passed`);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
