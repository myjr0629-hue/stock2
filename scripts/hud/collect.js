#!/usr/bin/env node
/* 관제 콘솔용 «느린 실측» 수집기 — 사이클마다 돌린다.
 *   node scripts/hud/collect.js [--clicks] [--redis] [--ads-file <path>] [--gate <문구>]
 * 인자가 없으면 --clicks --redis 를 한다. 측정한 것만 갱신하고 나머지는 이전 값을 보존한다.
 * 추측값을 넣지 않는다: 실패하면 그 항목을 비워 둔다(화면에 «미측정» 으로 나온다). */
'use strict';
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..'); const OUT = path.join(ROOT, '.agent', 'hud', 'metrics.json');
const A = process.argv.slice(2); const has = (f) => A.includes(f); const val = (f) => { const i = A.indexOf(f); return i >= 0 ? A[i + 1] : null; };
const want = { clicks: has('--clicks') || !A.length, redis: has('--redis') || !A.length };
const prev = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return {}; } })();
const out = Object.assign({}, prev, { at: new Date().toISOString() });

if (want.clicks) {
    try {
        const t = execSync('node scripts/mkt-clicks.js', { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
        const rows = [...t.matchAll(/^(\w+)\s+(\d+)\s+[\d/]+\s+(\d+)\s*$/gm)].map((m) => [m[1], +m[2], +m[3]]);
        const tot = t.match(/합계\s+(\d+)\s+\S*\s*(\d+)/);
        out.clicks = { total3: tot ? +tot[1] : null, total21: tot ? +tot[2] : null,
            top: rows.sort((a, b) => b[2] - a[2]).slice(0, 5).map(([k, , v]) => [k, v]), at: out.at };
    } catch (e) { console.error('clicks 실패:', String(e.message).slice(0, 80)); }
}
if (want.redis) {
    try {
        const t = execSync('node scripts/redis-upstash-info.js hud', { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
        const g = (k) => { const m = t.match(new RegExp('"' + k + '": *"?([\\d.]+)')); return m ? Number(m[1]) : null; };
        const w = g('total_writes_processed'), r = g('total_reads_processed');
        let rate = null;
        if (prev.redis && prev.redis.writes && prev.redis.at) {
            const mins = (Date.now() - new Date(prev.redis.at).getTime()) / 60000;
            if (mins > 4) rate = `쓰기 ${((w - prev.redis.writes) / mins).toFixed(0)} · 읽기 ${((r - prev.redis.reads) / mins).toFixed(0)}`;
        }
        out.redis = { writes: w, reads: r, member: (t.match(/"local_member": *"([^"]+)"/) || [])[1] || null, rate, at: out.at };
    } catch (e) { console.error('redis 실패:', String(e.message).slice(0, 80)); }
}
const af = val('--ads-file');
if (af) { try { const t = fs.readFileSync(af, 'utf8'); const m = t.match(/합계 \| (\$[\d.,]+) \| [^|]* \| [^|]* \| [^|]* \| ([\d,]+) \| (\d+) \| (\d+)/);
    if (m) out.ads = { spend: m[1], impr: m[2], taps: m[3], installs: m[4], at: out.at }; } catch (e) { console.error('ads 실패:', e.message.slice(0, 60)); } }
const gate = val('--gate'); if (gate) out.gate = gate;
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('metrics.json 갱신:', Object.keys(out).filter((k) => k !== 'at').join(', '));
