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

// ── ⑦ 실 응답 검사 (--live) ─────────────────────────────────────────────
//
// ★ 2026-09-13: 위 ①~⑥ 은 전부 통과하는데 «운영 응답»은 죽은 만기를 줬다.
//   XLF·XLE·XLK·SLV 가 2026-09-11(전 금요일) 체인으로 응답했고
//   options_status=OK · gexConfidence=HIGH 였다.
//
//   왜 못 잡았나 — 이 검사기는 «규칙 함수»를 검사한다. 그런데 버그는 규칙이
//   아니라 **캐시가 규칙을 건너뛴 것**이었다(72h TTL 람다 스냅샷이 주말을
//   넘기며 만기가 죽었는데 신선도 _ts 만 보고 통과). 계산기를 아무리 검사해도
//   계산기를 안 쓰는 경로는 안 잡힌다.
//
//   그래서 «규칙»이 아니라 «나가는 값»을 본다. 이건 배포된 것만 검사할 수 있다.
async function auditLive() {
    const BASE = process.env.AUDIT_BASE || 'https://www.signumhq.com';
    // 섹터·상품 ETF 를 반드시 포함한다 — 이번에 터진 게 정확히 거기다.
    const BASKET = ['SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLE', 'XLK', 'XLV', 'GLD', 'SLV',
                    'NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMD', 'META'];
    // «오늘 이후»의 기준 = 다음 거래일 (토·일이면 월요일)
    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const d = new Date(nowET);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    const floor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    console.log(`\n── 실 응답 검사 (${BASE}) · 기준일 ${floor} 이상 ──`);
    let liveFail = 0;
    for (const t of BASKET) {
        let j;
        try {
            const r = await fetch(`${BASE}/api/live/options/structure?t=${t}`, { signal: AbortSignal.timeout(60000) });
            j = await r.json();
        } catch (e) {
            console.log(`  ${t.padEnd(6)} ✗ 호출 실패: ${e.message}`);
            liveFail++; continue;
        }
        const exp = j.expiration || '';
        const stale = exp && exp < floor;
        const listStale = (j.availableExpirations || []).filter((x) => x < floor);
        // 라벨과 데이터가 어긋나는지도 같이 본다 — «OK 인데 값이 없다»
        const labelLies = j.options_status === 'OK' && (j.netGex == null || j.maxPain == null || !(j.underlyingPrice > 0));

        if (stale) {
            liveFail++;
            console.log(`  ${t.padEnd(6)} ✗ 죽은 만기 ${exp} (기준 ${floor}) · status=${j.options_status} conf=${j.gexConfidence}`);
        } else if (listStale.length) {
            liveFail++;
            console.log(`  ${t.padEnd(6)} ✗ 선택은 ${exp} 로 맞지만 «선택지»에 지난 만기가 남아 있다 → ${JSON.stringify(listStale)}`);
        } else if (labelLies) {
            liveFail++;
            console.log(`  ${t.padEnd(6)} ✗ status=OK 인데 값이 없다 (netGex=${j.netGex} maxPain=${j.maxPain} spot=${j.underlyingPrice})`);
        } else {
            console.log(`  ${t.padEnd(6)} ✓ ${exp} · maxPain=${j.maxPain} netGex=${j.netGex == null ? 'null' : Math.round(j.netGex / 1e6) + 'M'}`);
        }
    }
    return liveFail;
}

(async () => {
    let liveFail = 0;
    if (process.argv.includes('--live')) liveFail = await auditLive();

    console.log(`\n검사 ${checks}건 · 실패 ${fail}건` + (process.argv.includes('--live') ? ` · 실응답 실패 ${liveFail}건` : ''));
    if (fail) { console.log('\n❌ 만기 선택 규칙에 문제가 있다. 배포하지 말 것.'); process.exit(1); }
    if (liveFail) { console.log('\n❌ 규칙은 맞지만 «실제로 나가는 값»이 틀렸다. 캐시 경로를 의심할 것.'); process.exit(1); }
    console.log('✅ 두 구현이 모든 경우에 같은 만기를 고른다.' + (process.argv.includes('--live') ? ' 실 응답도 살아 있는 만기만 준다.' : ''));
})();
