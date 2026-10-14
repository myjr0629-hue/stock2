'use strict';
const fs = require('fs');
const path = require('path');

const MAX_RUN_BYTES = 200 * 1024 * 1024;
const MAX_RUN_AGE_MS = 3 * 86400e3;

// runs 아래 모든 파일(임시 파일·하위 폴더 포함)의 논리 바이트 합계.
// 심볼릭 링크는 대상에 접근하지 않고 링크 자체만 계산·삭제한다.
function pruneRuns(dir, { now = Date.now(), maxBytes = MAX_RUN_BYTES, maxAgeMs = MAX_RUN_AGE_MS } = {}) {
    const files = [];
    const scan = (p) => {
        const stat = fs.lstatSync(p);
        if (stat.isDirectory()) {
            for (const name of fs.readdirSync(p)) scan(path.join(p, name));
        } else files.push({ path: p, size: stat.size, mtimeMs: stat.mtimeMs });
    };
    // 잘못된 runs 경로가 외부 폴더를 가리키면 정리하지 않는다.
    if (!fs.lstatSync(dir).isDirectory()) throw new Error('runs must be a directory');
    scan(dir);
    files.sort((a, b) => a.mtimeMs - b.mtimeMs || a.path.localeCompare(b.path));
    let bytes = files.reduce((sum, f) => sum + f.size, 0), removed = 0, failed = 0;
    for (const f of files) {
        if (now - f.mtimeMs <= maxAgeMs && bytes <= maxBytes) continue;
        try { fs.unlinkSync(f.path); bytes -= f.size; removed++; }
        catch { failed++; } // 하나가 실패해도 나머지 오래된 파일의 정리는 계속한다.
    }
    return { bytes, removed, failed, overLimit: bytes > maxBytes };
}

module.exports = { pruneRuns, MAX_RUN_BYTES, MAX_RUN_AGE_MS };
