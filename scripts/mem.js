#!/usr/bin/env node
/* 내 기록을 «한 명령»으로 찾는다 — 티켓·확장·판단 전에 반드시 먼저 (verification.md §6)
 *   node scripts/mem.js <검색어> [검색어2 …]
 * 뒤지는 곳: OUTREACH-LOG · .agent/*.md · 마케팅 문서 · QUEUE · 발행원장 · 메모리 파일
 * 왜: 2026-09-18 에 같은 판단을 두 번 했다(t191 — 전날 «실험은 유의성 불가»라 적어 두고 다시 티켓).
 */
'use strict';
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const MEM = path.join(process.env.HOME, '.claude/projects/-Users-eunhoon-Documents-Project-recipt/memory');
const q = process.argv.slice(2);
if (!q.length) { console.log('사용: node scripts/mem.js <검색어> …'); process.exit(1); }
const pat = q.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const areas = [
    ['마케팅 로그', ['.agent/marketing/OUTREACH-LOG.md']],
    ['플레이북·교리', ['.agent/marketing/ENGINE.md', '.agent/marketing/RUNBOOK.md', '.agent/marketing/PLATFORM-PLAYBOOK.md']],
    ['보고서(.agent)', fs.readdirSync(path.join(ROOT, '.agent')).filter((f) => f.endsWith('.md')).map((f) => '.agent/' + f)],
    ['상태판·계획', ['.agent/STATE.md', '.agent/HARNESS-PLAN-2026-09-18.md']],
];
let hits = 0;
for (const [name, files] of areas) {
    const real = files.filter((f) => fs.existsSync(path.join(ROOT, f)));
    if (!real.length) continue;
    let out = '';
    try { out = execSync(`grep -n -i -E ${JSON.stringify(pat)} ${real.map((f) => JSON.stringify(f)).join(' ')} | head -8`, { cwd: ROOT, encoding: 'utf8' }); } catch { out = ''; }
    if (out.trim()) { console.log(`\n── ${name}`); for (const l of out.trim().split('\n')) { hits++; console.log('  ' + l.replace(/^\.agent\/(marketing\/)?/, '').slice(0, 220)); } }
}
// 티켓
try {
    const Q = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/QUEUE.json'), 'utf8'));
    const arr = Array.isArray(Q) ? Q : (Q.tickets || Q.items || []);
    const re = new RegExp(pat, 'i');
    const t = arr.filter((x) => re.test(JSON.stringify(x)));
    if (t.length) { console.log('\n── 티켓'); for (const x of t.slice(0, 8)) { hits++; console.log(`  ${x.id} [${x.state}] ${String(x.title).slice(0, 150)}`); } }
} catch {}
// 발행 원장
try {
    const L = JSON.parse(fs.readFileSync(path.join(ROOT, '.agent/marketing/PUBLISH-LEDGER.json'), 'utf8'));
    const arr = Array.isArray(L) ? L : (L.entries || []);
    const re = new RegExp(pat, 'i');
    const t = arr.filter((x) => re.test(x.ch + ' ' + (x.url || '')));
    if (t.length) { console.log('\n── 발행 원장 ' + t.length + '건'); for (const x of t.slice(-5)) { hits++; console.log(`  ${x.kst} ${x.ch} ${String(x.url || '').slice(0, 90)}`); } }
} catch {}
// 메모리
try {
    const out = execSync(`grep -rn -i -E ${JSON.stringify(pat)} ${JSON.stringify(MEM)} --include=*.md | head -8`, { encoding: 'utf8' });
    if (out.trim()) { console.log('\n── 메모리'); for (const l of out.trim().split('\n')) { hits++; console.log('  ' + l.replace(MEM + '/', '').slice(0, 200)); } }
} catch {}
console.log(hits ? `\n총 ${hits}건 — 이 기록을 읽고 나서 판단한다.` : '\n기록 없음 — 새 판단이다(끝나면 반드시 기록할 것).');
