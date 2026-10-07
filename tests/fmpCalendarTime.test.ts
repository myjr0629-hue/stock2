/**
 * FMP 경제지표 캘린더(UTC) → ET — src/lib/fmpCalendarTime.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/fmpCalendarTime.test.ts
 * 출발점(2026-10-07 운영): 같은 캐시에서 Initial Jobless Claims 12:30(실제 08:30 ET) · CPI 12:30 · MBA 11:00(07:00 ET) · EIA 14:30(10:30 ET) · Beige Book 18:00(14:00 ET) · FOMC Minutes 18:00(14:00 ET).
 *   브리핑 en «The FOMC Minutes release at 18:00 ET» · ja «本日18:00 ETのFOMC議事録公開» (실제 14:00 ET).
 */
import assert from 'node:assert/strict';
import { fmpCalendarToET, calendarPromptLines } from '../src/lib/fmpCalendarTime';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

console.log('━━━ 1. UTC → ET (운영 실측 값) ━━━');
t('FOMC Minutes 10/7 18:00 UTC → 14:00 ET (EDT +4)', () => assert.deepEqual(fmpCalendarToET('2026-10-07', '18:00'), { date: '2026-10-07', time: '14:00' }));
t('Initial Jobless Claims 10/8 12:30 → 08:30 ET · MBA 11:00 → 07:00 · EIA 14:30 → 10:30 · Beige Book 18:00 → 14:00', () => {
  assert.equal(fmpCalendarToET('2026-10-08', '12:30')!.time, '08:30');
  assert.equal(fmpCalendarToET('2026-10-07', '11:00')!.time, '07:00');
  assert.equal(fmpCalendarToET('2026-10-07', '14:30')!.time, '10:30');
  assert.equal(fmpCalendarToET('2026-10-14', '18:00')!.time, '14:00');
});
t('겨울(EST +5): 2026-12-09 19:00 UTC → 14:00 ET · DST 경계 전후(11/1 06:00 UTC 전환)', () => {
  assert.deepEqual(fmpCalendarToET('2026-12-09', '19:00'), { date: '2026-12-09', time: '14:00' });
  assert.equal(fmpCalendarToET('2026-10-30', '12:30')!.time, '08:30');   // 아직 EDT
  assert.equal(fmpCalendarToET('2026-11-05', '13:30')!.time, '08:30');   // EST
});
t('ET 날짜가 달라지는 시각 — 10/8 02:00 UTC = 10/7 22:00 ET', () => assert.deepEqual(fmpCalendarToET('2026-10-08', '02:00'), { date: '2026-10-07', time: '22:00' }));
t('모양이 틀리면 null', () => {
  assert.equal(fmpCalendarToET('2026-10-07', ''), null);
  assert.equal(fmpCalendarToET('10/7/2026', '18:00'), null);
  assert.equal(fmpCalendarToET(undefined, undefined), null);
  assert.equal(fmpCalendarToET('2026-13-45', '18:00'), null);
});

console.log('━━━ 2. 브리핑 프롬프트 줄 ━━━');
const EVENTS = [
  { date: '2026-10-07', time: '11:00', event: 'MBA 30-Year Mortgage Rate (Oct/02)', impact: 'MEDIUM' },
  { date: '2026-10-07', time: '18:00', event: 'FOMC Minutes', impact: 'HIGH', estimate: null, previous: null },
  { date: '2026-10-08', time: '12:30', event: 'Initial Jobless Claims (Oct/03)', impact: 'HIGH', estimate: 225, previous: 218 },
  { date: '2026-10-08', time: '02:00', event: 'Late UTC event', impact: 'HIGH' },
];
t('오늘(ET 10/7) 고영향만 — FOMC Minutes 는 «14:00 ET» (예전엔 «18:00 ET»)', () => {
  assert.deepEqual(calendarPromptLines(EVENTS, '2026-10-07'), [
    '14:00 ET: FOMC Minutes (Est: N/A, Prev: N/A)',
    '22:00 ET: Late UTC event (Est: N/A, Prev: N/A)',
  ]);
});
t('내일(ET 10/8) — Jobless Claims 08:30 ET · 추정·이전값 표기 그대로', () => {
  assert.deepEqual(calendarPromptLines(EVENTS, '2026-10-08'), ['08:30 ET: Initial Jobless Claims (Oct/03) (Est: 225, Prev: 218)']);
});
t('ET 시각 순 정렬 · 최대 개수 · 배열이 아니면 빈 배열', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ date: '2026-10-07', time: `${String(18 - i).padStart(2, '0')}:00`, event: `E${i}`, impact: 'HIGH' }));
  const lines = calendarPromptLines(many, '2026-10-07', 5);
  assert.equal(lines.length, 5);
  assert.ok(lines[0].startsWith('07:00 ET'), lines[0]);   // 11:00 UTC = 07:00 ET 가 가장 이르다
  assert.deepEqual(calendarPromptLines(null, '2026-10-07'), []);
  assert.deepEqual(calendarPromptLines([null, {}], '2026-10-07'), []);
});

console.log(`\n통과 ${n}건`);
