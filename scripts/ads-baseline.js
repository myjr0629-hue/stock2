#!/usr/bin/env node
/**
 * 광고 기준선 적재·추세.  애플 광고 콘솔은 셰도우DOM 이라 JS 스크레이핑이 안 된다 —
 * 수치는 ego lite 스크린샷으로 «눈으로» 읽어 넣는다. 이 스크립트가 하는 일은
 * (1) 넣은 값의 산술 검증  (2) 직전 기록 대비 추세 출력  두 가지다.
 */
const fs = require('fs');
const P = __dirname + '/../.agent/marketing/ADS-BASELINE.json';
const d = JSON.parse(fs.readFileSync(P, 'utf8'));
const cmd = process.argv[2] || 'show';
const last = d.records[d.records.length - 1];

const perDay = (r) => (r.spend / 7);
const f = (n, p = 2) => Number(n).toFixed(p);

if (cmd === 'add') {
    // node scripts/ads-baseline.js add '<JSON 레코드>'
    const rec = JSON.parse(process.argv[3]);
    const sum = rec.campaigns.reduce((a, c) => ({
        spend: a.spend + c.spend, impr: a.impr + c.impr, taps: a.taps + c.taps, installs: a.installs + c.installs,
    }), { spend: 0, impr: 0, taps: 0, installs: 0 });
    const drift = Math.abs(sum.spend - rec.total.spend);
    if (drift > 0.05) { console.error(`✗ 합계 불일치: 캠페인 합 $${f(sum.spend)} vs 입력 합계 $${f(rec.total.spend)} — 잘못 읽었다.`); process.exit(1); }
    if (sum.installs !== rec.total.installs) { console.error(`✗ 설치수 불일치: ${sum.installs} vs ${rec.total.installs}`); process.exit(1); }
    d.records.push(rec);
    fs.writeFileSync(P, JSON.stringify(d, null, 2) + '\n');
    console.log('✓ 적재 — 산술 검증 통과');
    process.exit(0);
}

// show — 마지막 기록 + 직전 대비
console.log(`\n■ ${last.at} · ${last.window}\n`);
for (const c of last.campaigns) {
    const util = c.budget ? (perDay(c) / c.budget) * 100 : 0;
    const flag = c.state !== 'running' ? '⏸' : util < 50 ? '⚠︎' : '  ';
    console.log(`${flag} ${c.name.padEnd(20)} $${f(c.spend).padStart(7)}  일 $${f(perDay(c))}/일 (예산 $${c.budget} · 소진 ${f(util, 0)}%)  노출 ${String(c.impr).padStart(6)}  탭 ${String(c.taps).padStart(3)}  설치 ${c.installs}`);
}
const t = last.total;
console.log(`\n  합계  $${f(t.spend)} · 노출 ${t.impr} · 탭 ${t.taps} · 설치 ${t.installs} · CPA $${f(t.cpa)}`);
const run = last.campaigns.filter((c) => c.state === 'running');
const dayRun = run.reduce((a, c) => a + perDay(c), 0);
const budRun = run.reduce((a, c) => a + c.budget, 0);
console.log(`  돌아가는 것만: $${f(dayRun)}/일 (예산 $${budRun}/일 · 소진 ${f((dayRun / budRun) * 100, 0)}%)`);
if (dayRun / budRun < 0.5) console.log(`  ⚠︎ 예산의 절반도 못 쓴다 — 노출이 안 나온다. 예산이 아니라 «검색어» 문제다.`);

if (d.records.length > 1) {
    const prev = d.records[d.records.length - 2];
    const dl = (a, b) => (b - a >= 0 ? '+' : '') + f(b - a);
    console.log(`\n  직전(${prev.at}) 대비 — 지출 ${dl(prev.total.spend, t.spend)} · 노출 ${b_(prev.total.impr, t.impr)} · 설치 ${b_(prev.total.installs, t.installs)}`);
}
function b_(a, b) { return (b - a >= 0 ? '+' : '') + (b - a); }
console.log('');
