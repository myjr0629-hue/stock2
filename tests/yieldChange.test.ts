// 금리 변화량 단위 — bp · 수준과 같은 원본의 변화량
// 실행: npx ts-node -P tsconfig.tsnode.json tests/yieldChange.test.ts
//
// 2026-09-29 07:3x KST(9/28 18:3x ET) /ja/app-view/dash 매크로 «US 10Y 5.24% +1.08»(초록).
// +1.08 은 수익률의 상대 %(chgPct)였고 단위가 없어 «+1.08%p»로 읽혔다. 같은 날 재무부 원본은
// 9/25 5.17 → 9/28 5.24 = +7bp. 게다가 변화량은 야후 ^TNX(+0.056)라 수준(재무부)과 출처가 달랐다.
import { yieldChangeBp, fmtBp, changeFromPrev } from '../src/lib/yieldChange';

let total = 0, pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
    total++;
    if (cond) pass++;
    else { failures.push(`${name}: ${detail}`); console.log(`  ❌ ${name}: ${detail}`); }
}

// ── 재무부 CSV 원문 두 줄 (daily_treasury_yield_curve 2026, 9/29 08:3x KST 내려받음) ──
const HEADER = 'Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"';
const ROWS = [
    '09/28/2026,4.04,4.14,4.20,4.28,4.33,4.41,4.59,4.92,5.01,5.06,5.15,5.24,5.60,5.56',
    '09/25/2026,4.04,4.14,4.20,4.24,4.32,4.33,4.50,4.81,4.94,4.98,5.06,5.17,5.54,5.49',
];
const cols = HEADER.split(',').map((h) => h.replace(/"/g, ''));
const col = (row: string, name: string) => Number(row.split(',')[cols.indexOf(name)]);
const y10 = col(ROWS[0], '10 Yr'), y10prev = col(ROWS[1], '10 Yr');
const y2 = col(ROWS[0], '2 Yr');

console.log('━━━ 1. 수준과 같은 곡선에서 만든 변화량 ━━━');
const cc = changeFromPrev(y10, y10prev);
check('재무부 5.17→5.24 chgAbs', cc?.chgAbs === 0.07, JSON.stringify(cc));
check('재무부 상대 % (참고용)', cc?.chgPct === 1.354, JSON.stringify(cc));
check('bp = +7', yieldChangeBp(cc) === 7, String(yieldChangeBp(cc)));
check('화면 문구 «+7bp»', fmtBp(yieldChangeBp(cc)) === '+7bp', fmtBp(yieldChangeBp(cc)));
// 화면이 암시하는 전일 값(수준 − 변화)이 원본의 전일 값과 같아야 한다
check('암시된 전일 = 5.17', Math.abs((y10 - (cc?.chgAbs ?? NaN)) - y10prev) < 1e-9, String(y10 - (cc?.chgAbs ?? NaN)));
// 예전(섞인 출처): 수준 5.24 + ^TNX 변화 0.056 → 암시된 전일 5.184 — 재무부 어디에도 없다
check('섞인 출처는 5.17 을 못 맞춘다(회귀 기준)', Math.abs((5.24 - 0.056) - y10prev) > 0.01, '');

console.log('━━━ 2. 없는 값은 «모름» ━━━');
check('prev 없음 → null', changeFromPrev(5.24, null) === null);
check('prev 0 → null', changeFromPrev(5.24, 0) === null);
check('level 없음 → null', changeFromPrev(null, 5.17) === null);
check('factor 없음 → null', yieldChangeBp(null) === null);
check('둘 다 null → null', yieldChangeBp({ level: 5.24, chgAbs: null, chgPct: null }) === null);
check('fmtBp(null) → —', fmtBp(null) === '—');
check('fmtBp(NaN) → —', fmtBp(NaN) === '—');

console.log('━━━ 3. 야후 ^TNX (장중 경로) ━━━');
// 운영 /api/market/macro 9/28 23:27Z 실측: chgAbs 0.056, chgPct 1.080246913580248
check('chgAbs 0.056 → +6bp', yieldChangeBp({ level: 5.24, chgAbs: 0.056, chgPct: 1.080246913580248 }) === 6);
check('chgAbs 가 우선(chgPct 무시)', yieldChangeBp({ level: 5.24, chgAbs: 0.07, chgPct: 99 }) === 7);
check('chgAbs 없으면 chgPct 에서 되돌림', yieldChangeBp({ level: 5.24, chgPct: 1.080246913580248 }) === 6,
    String(yieldChangeBp({ level: 5.24, chgPct: 1.080246913580248 })));
check('하락도 같은 규칙', yieldChangeBp({ chgAbs: -0.031 }) === -3);

console.log('━━━ 4. 보합·반올림 ━━━');
check('0 은 «0bp»(보합은 사실)', fmtBp(0) === '0bp', fmtBp(0));
check('-0.4bp → «0bp»(«-0bp» 아님)', fmtBp(yieldChangeBp({ chgAbs: -0.004 })) === '0bp', fmtBp(yieldChangeBp({ chgAbs: -0.004 })));
check('음수 부호', fmtBp(-3) === '-3bp');

console.log('━━━ 5. 2s10s 카드(금리차 수준도 bp) ━━━');
const spread = Math.round((y10 - y2) * 100) / 100;   // fedApiClient 와 같은 반올림
check('9/28 2s10s = 0.32', spread === 0.32, String(spread));
check('«+32bp»', fmtBp(spread * 100) === '+32bp', fmtBp(spread * 100));
check('역전 «-45bp»', fmtBp(-0.45 * 100) === '-45bp', fmtBp(-0.45 * 100));

console.log();
console.log(`결과: ${pass}/${total} 통과`);
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
