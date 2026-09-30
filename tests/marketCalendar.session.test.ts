// marketCalendar — 선물 세션(CME 글로벡스)·«마지막으로 끝난 정규장» 경계 테스트
// 실행: npx ts-node -P tsconfig.tsnode.json tests/marketCalendar.session.test.ts
//
// 2026-09-26(토) 대시 지수 안내가 «지금 움직이는 건 선물뿐»이라고 했다(토요일엔 선물도 닫힘).
// 인텔 헤더는 장 마감 중 «9/25(금) 마감 기준»을 달력으로 말한다. 둘 다 이 함수들이 정본이다.
import {
    isCmeGlobexOpenAt, etLastClosedSessionDate, etWeekdayOf,
} from '../src/lib/marketCalendar';

let total = 0, pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail: string) {
    total++;
    if (cond) { pass++; }
    else { failures.push(name + ': ' + detail); console.log('  ❌ ' + name + ': ' + detail); }
}

// ET 벽시계 → epoch ms. 9월은 EDT(UTC-4), 12월은 EST(UTC-5).
const EDT = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h + 4, mi);
const EST = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h + 5, mi);

console.log('═══════════════════════════════════════════════════════════');
console.log('  marketCalendar 세션 경계 테스트');
console.log('═══════════════════════════════════════════════════════════');

console.log('━━━ 1. 지수 선물(equity) 주간 경계 ━━━');
const fut: Array<[string, number, boolean]> = [
    ['토 9/26 12:00 (보고된 날)', EDT(2026, 9, 26, 12), false],
    ['토 9/26 00:30 (자정 함정)', EDT(2026, 9, 26, 0, 30), false],
    ['금 9/25 00:30 (자정 함정)', EDT(2026, 9, 25, 0, 30), true],
    ['금 9/25 16:59', EDT(2026, 9, 25, 16, 59), true],
    ['금 9/25 17:00 주말 마감', EDT(2026, 9, 25, 17), false],
    ['금 9/25 19:00 (애프터 중)', EDT(2026, 9, 25, 19), false],
    ['일 9/27 03:58', EDT(2026, 9, 27, 3, 58), false],
    ['일 9/27 17:59', EDT(2026, 9, 27, 17, 59), false],
    ['일 9/27 18:00 재개장', EDT(2026, 9, 27, 18), true],
    ['화 9/29 10:00 정규장', EDT(2026, 9, 29, 10), true],
    ['화 9/29 16:59', EDT(2026, 9, 29, 16, 59), true],
    ['화 9/29 17:00 일일 휴식', EDT(2026, 9, 29, 17), false],
    ['화 9/29 17:59 일일 휴식', EDT(2026, 9, 29, 17, 59), false],
    ['화 9/29 18:00 재개', EDT(2026, 9, 29, 18), true],
    ['화 9/29 23:30 야간', EDT(2026, 9, 29, 23, 30), true],
    ['일 12/27 17:59 (EST)', EST(2026, 12, 27, 17, 59), false],
    ['일 12/27 18:00 (EST)', EST(2026, 12, 27, 18), true],
    ['화 12/29 17:30 (EST 휴식)', EST(2026, 12, 29, 17, 30), false],
];
for (const [name, ms, want] of fut) {
    const got = isCmeGlobexOpenAt(ms, 'equity');
    check(name, got === want, `got ${got}, want ${want}`);
}
console.log(`  ✅ ${fut.length}건`);

console.log('━━━ 2. 휴장일(노동절 9/7) — 13:00 정지 · 18:00 다음 세션 ━━━');
const hol: Array<[string, number, 'equity' | 'gold', boolean]> = [
    ['9/7 12:59 equity', EDT(2026, 9, 7, 12, 59), 'equity', true],
    ['9/7 13:00 equity', EDT(2026, 9, 7, 13), 'equity', false],
    ['9/7 13:30 gold', EDT(2026, 9, 7, 13, 30), 'gold', true],
    ['9/7 13:45 gold', EDT(2026, 9, 7, 13, 45), 'gold', false],
    ['9/7 18:00 equity', EDT(2026, 9, 7, 18), 'equity', true],
];
for (const [name, ms, kind, want] of hol) {
    const got = isCmeGlobexOpenAt(ms, kind); // 휴장 여부는 달력 기본값
    check(name, got === want, `got ${got}, want ${want}`);
}
// 호출자가 준 휴장 플래그가 달력보다 우선한다(대시는 서버의 isHoliday 를 넘긴다)
check('평일 12:00 + isHoliday=true → 13:00 전이라 열림', isCmeGlobexOpenAt(EDT(2026, 9, 29, 12), 'equity', true) === true, '');
check('평일 14:00 + isHoliday=true → 정지', isCmeGlobexOpenAt(EDT(2026, 9, 29, 14), 'equity', true) === false, '');
console.log(`  ✅ ${hol.length + 2}건`);

console.log('━━━ 3. 마지막으로 끝난 정규장 ━━━');
const last: Array<[string, number, string]> = [
    ['토 9/26 12:00', EDT(2026, 9, 26, 12), '2026-09-25'],
    ['토 9/26 00:30', EDT(2026, 9, 26, 0, 30), '2026-09-25'],
    ['일 9/27 03:58', EDT(2026, 9, 27, 3, 58), '2026-09-25'],
    ['금 9/25 15:59 (장중)', EDT(2026, 9, 25, 15, 59), '2026-09-24'],
    ['금 9/25 16:00 (마감)', EDT(2026, 9, 25, 16), '2026-09-25'],
    ['금 9/25 21:00', EDT(2026, 9, 25, 21), '2026-09-25'],
    ['월 9/28 03:00 (개장 전)', EDT(2026, 9, 28, 3), '2026-09-25'],
    ['월 9/7 12:00 (노동절)', EDT(2026, 9, 7, 12), '2026-09-04'],
    ['화 9/8 03:00 (휴장 다음 날 새벽)', EDT(2026, 9, 8, 3), '2026-09-04'],
    ['화 9/8 21:00 (휴장 다음 날 밤)', EDT(2026, 9, 8, 21), '2026-09-08'],
];
for (const [name, ms, want] of last) {
    const got = etLastClosedSessionDate(ms);
    check(name, got === want, `got ${got}, want ${want}`);
}
console.log(`  ✅ ${last.length}건`);

console.log('━━━ 4. ET 요일 ━━━');
check('토 00:30 ET = 6', etWeekdayOf(EDT(2026, 9, 26, 0, 30)) === 6, String(etWeekdayOf(EDT(2026, 9, 26, 0, 30))));
check('금 23:59 ET = 5', etWeekdayOf(EDT(2026, 9, 25, 23, 59)) === 5, String(etWeekdayOf(EDT(2026, 9, 25, 23, 59))));
console.log('  ✅ 2건');

console.log('═══════════════════════════════════════════════════════════');
console.log(`  세션 경계: ${pass}/${total} ${pass === total ? '✅ ALL PASS' : '❌ FAILURES'}`);
if (failures.length > 0) failures.forEach(f => console.log('  • ' + f));
console.log('═══════════════════════════════════════════════════════════');
if (failures.length > 0) process.exit(1);
