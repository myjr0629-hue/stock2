#!/usr/bin/env node
'use strict';
// Read-only counts only. --used mutates the ledger and must never be invoked here.
// Never retain or print allocator stdout/stderr: allocation modes can contain codes.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const S = require('./sources');

const empty = () => ({ distributed: null, confirmedUsed: null, remaining: null, today: null, total: null });
const count = (s) => Number(s.replace(/,/g, ''));
function parseCounts(text, platform) {
    const out = empty();
    if (platform === 'ios') {
        const m = /^배포\(장부\)\s+([\d,]+)장\s*·\s*오늘\s+([\d,]+)장\s*·\s*댓글로 사용 확인\s+([\d,]+)장\s*·\s*남은\s+([\d,]+)장\s*\/\s*([\d,]+)\s*$/m.exec(text);
        if (m) [out.distributed, out.today, out.confirmedUsed, out.remaining, out.total] = m.slice(1).map(count);
    } else if (platform === 'android') {
        const m = /^안드로이드 게시용 남은\s+([\d,]+)장\s*·\s*오늘\(\d{4}-\d{2}-\d{2}\) 배분\s+([\d,]+)장\s*·\s*서버 풀\s+[\d,]+장\(건드리지 않음\)\s*$/m.exec(text);
        // This allocator does not report cumulative distribution or confirmed use.
        if (m) [out.remaining, out.today] = m.slice(1).map(count);
    }
    return out;
}

function collect({ dir = path.join(S.DIRS.work, 'redeem'), execute = execFileSync, now = Date.now() } = {}) {
    const platforms = {};
    for (const [platform, script] of [['ios', 'alloc-onetime.py'], ['android', 'alloc-play-onetime.py']]) {
        let counts = empty(), error = null;
        try {
            const text = execute('python3', [path.join(dir, script), '--count'], {
                encoding: 'utf8', timeout: 15000, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
            });
            counts = parseCounts(text, platform);
            if (counts.remaining === null) error = 'unrecognized_output';
        } catch { error = 'count_failed'; }
        const missing = Object.keys(counts).filter((key) => counts[key] === null);
        platforms[platform] = { state: error ? 'pending' : missing.length ? 'partial' : 'ok', source: script + ' --count', ...counts, missing, error };
    }
    const total = Object.fromEntries(Object.keys(empty()).map((key) => [key,
        Object.values(platforms).every((p) => p[key] !== null) ? Object.values(platforms).reduce((sum, p) => sum + p[key], 0) : null,
    ]));
    return { schemaVersion: 1, readAt: new Date(now).toISOString(), basis: 'ledger_comment_confirmation', platforms, total };
}

function main() {
    const result = collect();
    const file = S.DIRS.redeemSummary, tmp = file + '.tmp' + process.pid;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(result, null, 2) + '\n');
    fs.renameSync(tmp, file);
    console.log(JSON.stringify(result));
    if (Object.values(result.platforms).some((p) => p.error)) process.exitCode = 1;
}

module.exports = { parseCounts, collect };
if (require.main === module) {
    try { main(); } catch { console.error('Redeem summary write failed'); process.exitCode = 1; }
}
