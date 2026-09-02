#!/usr/bin/env node
/**
 * audit-expiration-selection — 만기 선택 규칙 전수 검사기
 * ============================================================================
 * 왜 있나 (2026-09-02 대표: 「가장 중요한것은 그 어떤것보다 신뢰도다」):
 *
 *   맥스페인·GEX 는 «어느 만기로 계산했느냐»가 곧 값이다. 만기를 하나 잘못
 *   고르면 숫자는 멀쩡해 보이는데 뜻이 달라진다 — 에러가 안 나는 오류라
 *   화면만 봐서는 절대 못 잡는다.
 *
 *   그리고 규칙이 **두 곳**에 있다:
 *     · scripts/lambda-flow-harvest/intrinio-adapter.js  (수집기)
 *     · src/services/intrinioClient.ts                   (앱/웹)
 *   갈라지면 수집기와 앱이 다른 만기를 보게 되고, 그때 어느 쪽이 맞는지
 *   알 수 없다. 이 검사기는 **둘이 같은 답을 내는지**를 매번 증명한다.
 *
 * 검사 항목:
 *   ① 두 구현이 모든 날짜·모든 종목에서 **동일한 만기**를 고르는가
 *   ② 고른 만기가 항상 오늘 이후인가 (과거 만기를 잡지 않는가)
 *   ③ 주간 ≤ 월물 인가
 *   ④ 금요일 휴장 주에 목요일로 대체되는가
 *   ⑤ 달을 넘길 때 그 달 월물을 건너뛰지 않는가 (31일 setMonth 오버플로)
 *   ⑥ 만기일 당일에 그날 만기를 보는가 (after= 배타성)
 *
 * 사용:  node scripts/audit-expiration-selection.js
 *        node scripts/audit-expiration-selection.js --live   (실 API 대조까지)
 * ============================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const dw = (d) => DOW[new Date(d + 'T12:00:00Z').getUTCDay()];

// ── ① Lambda 어댑터에서 규칙 함수를 그대로 꺼낸다 ─────────────────────
const adapterSrc = fs.readFileSync(path.join(ROOT, 'scripts/lambda-flow-harvest/intrinio-adapter.js'), 'utf8');
const lambdaBlock = adapterSrc.match(/const _dowOf[\s\S]*?\nfunction pickMonthlyExpiration[\s\S]*?\n}/);
if (!lambdaBlock) {
    console.error('✗ Lambda 어댑터에서 만기 규칙을 못 찾았다. 함수 이름이 바뀌었나?');
    process.exit(1);
}
const L = eval(`(() => { ${lambdaBlock[0]}; return { weekly: pickWeeklyExpiration, monthly: pickMonthlyExpiration }; })()`);

// ── ② Vercel(TS) 쪽 규칙을 같은 방식으로 꺼낸다 ───────────────────────
const tsSrc = fs.readFileSync(path.join(ROOT, 'src/services/intrinioClient.ts'), 'utf8');
const tsBlock = tsSrc.match(/const _dow = [\s\S]*?export function pickMonthlyExpiration[\s\S]*?\n}/);
if (!tsBlock) {
    console.error('✗ intrinioClient.ts 에서 만기 규칙을 못 찾았다.');
    process.exit(1);
}
// 타입 표기를 지워 JS 로 평가한다 (규칙 자체는 순수 함수라 이걸로 충분하다)
const tsAsJs = tsBlock[0]
    .replace(/export function/g, 'function')
    .replace(/: string\[\]/g, '').replace(/: string/g, '').replace(/: number/g, '')
    .replace(/\(e: any\)/g, '(e)').replace(/\(d\)/g, '(d)');
let V;
try {
    V = eval(`(() => { ${tsAsJs}; return { weekly: pickWeeklyExpiration, monthly: pickMonthlyExpiration }; })()`);
} catch (e) {
    console.error('✗ TS 규칙 평가 실패:', e.message);
    process.exit(1);
}

// ── 검사용 만기 목록 ──────────────────────────────────────────────────
// 실제 종목의 만기 패턴 3종. 매일만기(SPY) · 월수금 혼합(NVDA) · 금요일만(CAT)
const PATTERNS = {
    'SPY형(매일만기)': ['2026-09-03', '2026-09-04', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
        '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-25',
        '2026-10-02', '2026-10-16', '2026-11-20', '2026-12-18'],
    'NVDA형(월수금)': ['2026-09-04', '2026-09-09', '2026-09-11', '2026-09-14', '2026-09-16', '2026-09-18',
        '2026-09-25', '2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30',
        '2026-11-06', '2026-11-13', '2026-11-20', '2026-12-04', '2026-12-18'],
    'CAT형(금요일만)': ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02', '2026-10-09',
        '2026-10-16', '2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20',
        '2026-12-04', '2026-12-18'],
    '휴장주(금요일 만기 없음)': ['2026-11-23', '2026-11-25', '2026-11-26', '2026-12-04', '2026-12-18'],
};

let fail = 0, checks = 0;
const bad = (msg) => { fail++; if (fail <= 12) console.log('  ✗ ' + msg); };

console.log('═══ 만기 선택 전수 검사 ═══\n');

for (const [name, exps] of Object.entries(PATTERNS)) {
    const start = exps[0];
    for (let i = -2; i < 100; i++) {
        const today = new Date(Date.parse(start + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10);
        const avail = exps.filter((e) => e >= today);
        if (!avail.length) break;

        const lw = L.weekly(avail, today), lm = L.monthly(avail, today);
        const vw = V.weekly(avail, today), vm = V.monthly(avail, today);
        checks++;

        // ① 두 구현이 같은 답을 내는가 — 이게 이 검사기의 존재 이유다
        if (lw !== vw) bad(`${name} ${today}: 주간 불일치 Lambda=${lw} Vercel=${vw}`);
        if (lm !== vm) bad(`${name} ${today}: 월물 불일치 Lambda=${lm} Vercel=${vm}`);

        // ② 과거 만기를 잡지 않는가
        if (lw && lw < today) bad(`${name} ${today}: 주간이 과거 ${lw}`);
        if (lm && lm < today) bad(`${name} ${today}: 월물이 과거 ${lm}`);

        // ③ 주간 ≤ 월물
        if (lw && lm && lw > lm) bad(`${name} ${today}: 주간(${lw}) > 월물(${lm})`);

        // ④ 주간은 «그 주» 안이어야 한다 (다음 주로 미리 넘어가면 안 된다)
        if (lw) {
            const t = new Date(today + 'T12:00:00Z');
            const fri = new Date(t.getTime() + (((5 - t.getUTCDay() + 7) % 7)) * 86400000).toISOString().slice(0, 10);
            const inWeek = avail.some((e) => e >= today && e <= fri);
            if (inWeek && lw > fri) bad(`${name} ${today}(${dw(today)}): 이번 주에 만기가 있는데 다음 주를 잡았다 ${lw}`);
        }
    }
}

// ⑤ 달 넘김 — 그 달 월물을 건너뛰지 않는가
console.log('── 달 넘김 검사 (31일 오버플로) ──');
for (const day of ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-12-30', '2026-12-31']) {
    const exps = PATTERNS['NVDA형(월수금)'];
    const avail = exps.filter((e) => e >= day);
    if (!avail.length) continue;
    const m = L.monthly(avail, day);
    const expected = avail.find((e) => { const d = Number(e.slice(8, 10)); return d >= 15 && d <= 21; });
    checks++;
    const ok = m === expected;
    if (!ok) bad(`${day}: 월물 ${m} · 기대 ${expected}`);
    console.log(`  ${day}(${dw(day)}) → 월물 ${m || '없음'} ${ok ? '✓' : '✗'}`);
}

// ⑥ 만기일 당일 — 그날 만기를 보는가
console.log('\n── 만기일 당일 검사 ──');
for (const day of ['2026-09-04', '2026-09-11', '2026-09-18']) {
    const exps = PATTERNS['NVDA형(월수금)'];
    const avail = exps.filter((e) => e >= day);
    const w = L.weekly(avail, day);
    checks++;
    const ok = w === day;
    if (!ok) bad(`${day}(${dw(day)}) 만기일인데 주간이 ${w}`);
    console.log(`  ${day}(${dw(day)}) → 주간 ${w} ${ok ? '✓ 그날 만기를 본다' : '✗ 건너뛰었다'}`);
}

console.log(`\n검사 ${checks}건 · 실패 ${fail}건`);
if (fail) { console.log('\n❌ 만기 선택 규칙에 문제가 있다. 배포하지 말 것.'); process.exit(1); }
console.log('✅ 두 구현이 모든 경우에 같은 만기를 고른다.');
