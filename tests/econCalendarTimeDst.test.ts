/**
 * 경제 캘린더 시각 — 서머타임 종료(2026-11-01) 뒤 «다음 이벤트» 칩 · 공급자 EDT 잔존 행 보정.
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/econCalendarTimeDst.test.ts
 * 출발점(2026-11-06 23:16 KST 대표 캡처): «다음 이벤트: NOW Participation Rate (Oct)» — 22:30 KST 에 이미 발표된 지표.
 *   같은 캐시: CFTC speculative net positions 19:30Z(공식 15:30 ET = 20:30Z) · WASDE 16:00Z(공식 12:00 ET = 17:00Z).
 */
import assert from 'node:assert/strict';
import { pickNextEconEvent, NOW_WINDOW_MS } from '../src/lib/econCalendarNext';
import { etWallToUtcMs, officialUtcTime, normalizeEconCalendarTimes } from '../src/lib/econCalendarOfficialTime';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const Z = (s: string) => Date.parse(s);
const kst = (ms: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);

// 11/6 운영 캐시(UTC) 일부 — 위젯과 같은 방식으로 dateObj 를 만들고 «최근 1시간» 필터를 그대로 적용한다.
const LIVE = [
  ['2026-11-06', '13:30', 'Participation Rate (Oct)'],
  ['2026-11-06', '13:30', 'Non Farm Payrolls (Oct)'],
  ['2026-11-06', '14:10', 'Fed Musalem Speech'],
  ['2026-11-06', '15:00', 'Michigan Consumer Sentiment (Nov)'],
  ['2026-11-06', '17:15', 'Fed Bowman Speech'],
  ['2026-11-06', '19:30', 'CFTC S&P 500 speculative net positions'],
];
function widgetList(nowMs: number) {
  return normalizeEconCalendarTimes(LIVE.map(([date, time, event]) => ({ date, time, event })))
    .map((e) => ({ ...e, dateObj: new Date(Z(`${e.date}T${e.time}:00Z`)) }))
    .filter((e) => e.dateObj.getTime() > nowMs - 3600_000)
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
}

console.log('━━━ 1. «다음 이벤트» 칩 ━━━');
t('11/6 23:16 KST(14:16Z): 목록엔 22:30 발표분이 남아도 칩 = 00:00 KST Michigan(미래 첫 이벤트)', () => {
  const now = Z('2026-11-06T14:16:00Z');
  const list = widgetList(now);
  assert.equal(list[0].event, 'Participation Rate (Oct)');        // 목록은 실제치 표시용으로 남는다(옛 칩이 이걸 «NOW»로 보였다)
  const next = pickNextEconEvent(list, now)!;
  assert.equal(next.event, 'Michigan Consumer Sentiment (Nov)');
  assert.equal(kst(next.dateObj.getTime()), '00:00');               // 10:00 ET = 00:00 KST(EST)
  assert.ok(next.dateObj.getTime() >= now);
});
t('발표 직후 5분 안에서만 그 이벤트가 칩(NOW) — 14:13Z 는 Musalem, 14:16Z 는 다음', () => {
  assert.equal(pickNextEconEvent(widgetList(Z('2026-11-06T14:13:00Z')), Z('2026-11-06T14:13:00Z'))!.event, 'Fed Musalem Speech');
  assert.equal(pickNextEconEvent(widgetList(Z('2026-11-06T14:15:00Z')), Z('2026-11-06T14:15:00Z'))!.event, 'Fed Musalem Speech');
  assert.equal(pickNextEconEvent(widgetList(Z('2026-11-06T14:15:01Z')), Z('2026-11-06T14:15:01Z'))!.event, 'Michigan Consumer Sentiment (Nov)');
  assert.equal(NOW_WINDOW_MS, 300_000);
});
t('22:30 KST 정각 = 고용지표가 칩 · 22:36 KST 이면 넘어간다', () => {
  assert.equal(pickNextEconEvent(widgetList(Z('2026-11-06T13:30:00Z')), Z('2026-11-06T13:30:00Z'))!.event, 'Participation Rate (Oct)');
  assert.equal(pickNextEconEvent(widgetList(Z('2026-11-06T13:36:00Z')), Z('2026-11-06T13:36:00Z'))!.event, 'Fed Musalem Speech');
});
t('보정된 CFTC 는 05:30 KST(20:30Z) — 04:45 KST 에도 아직 «다음»', () => {
  const now = Z('2026-11-06T19:45:00Z');
  const next = pickNextEconEvent(widgetList(now), now)!;
  assert.equal(next.event, 'CFTC S&P 500 speculative net positions');
  assert.equal(next.dateObj.toISOString(), '2026-11-06T20:30:00.000Z');
  assert.equal(kst(next.dateObj.getTime()), '05:30');
});
t('미래 이벤트가 없으면 칩 없음', () => assert.equal(pickNextEconEvent(widgetList(Z('2026-11-06T21:00:00Z')), Z('2026-11-06T21:00:00Z')), undefined));

console.log('━━━ 2. ET 벽시계 → UTC (IANA, 고정 오프셋 없음) ━━━');
t('서머타임 종료 경계 2026-11-01: 10/31 12:00 ET = 16:00Z · 11/1 12:00 ET = 17:00Z · 11/2 08:30 ET = 13:30Z', () => {
  assert.equal(new Date(etWallToUtcMs('2026-10-31', '12:00')!).toISOString(), '2026-10-31T16:00:00.000Z');
  assert.equal(new Date(etWallToUtcMs('2026-11-01', '12:00')!).toISOString(), '2026-11-01T17:00:00.000Z');
  assert.equal(new Date(etWallToUtcMs('2026-11-02', '08:30')!).toISOString(), '2026-11-02T13:30:00.000Z');
});
t('서머타임 시작 경계 2027-03-14: 3/13 15:30 ET = 20:30Z · 3/14 15:30 ET = 19:30Z · 3/14 02:30 ET 는 없는 시각(null)', () => {
  assert.equal(new Date(etWallToUtcMs('2027-03-13', '15:30')!).toISOString(), '2027-03-13T20:30:00.000Z');
  assert.equal(new Date(etWallToUtcMs('2027-03-14', '15:30')!).toISOString(), '2027-03-14T19:30:00.000Z');
  assert.equal(etWallToUtcMs('2027-03-14', '02:30'), null);
});

console.log('━━━ 3. 공급자 EDT 잔존 행 보정(정확히 ±1시간일 때만) ━━━');
t('CFTC 11/6 19:30Z → 20:30Z(15:30 EST) · WASDE 11/10 16:00Z → 17:00Z(12:00 EST)', () => {
  assert.deepEqual(officialUtcTime('CFTC Crude Oil speculative net positions', '2026-11-06', '19:30'), { date: '2026-11-06', time: '20:30' });
  assert.deepEqual(officialUtcTime('CFTC Gold Speculative net positions', '2026-11-06', '19:30'), { date: '2026-11-06', time: '20:30' });
  assert.deepEqual(officialUtcTime('WASDE Report', '2026-11-10', '16:00'), { date: '2026-11-10', time: '17:00' });
});
t('이미 맞는 행은 그대로 — EST 고용 13:30Z · Michigan 15:00Z · MBA 12:00Z · API 21:30Z · FOMC Minutes 19:00Z · EDT 기간 CFTC 10/30 19:30Z', () => {
  for (const [ev, d, tm] of [['Non Farm Payrolls (Oct)', '2026-11-06', '13:30'], ['Michigan Consumer Sentiment (Nov)', '2026-11-06', '15:00'],
    ['MBA 30-Year Mortgage Rate (Nov/06)', '2026-11-11', '12:00'], ['API Crude Oil Stock Change (Nov/06)', '2026-11-10', '21:30'],
    ['FOMC Minutes', '2026-11-18', '19:00'], ['CFTC S&P 500 speculative net positions', '2026-10-30', '19:30'], ['Initial Jobless Claims (Nov/07)', '2026-11-12', '13:30']]) {
    assert.deepEqual(officialUtcTime(ev, d, tm), { date: d, time: tm }, ev);
  }
});
t('휴일 연기·표에 없는 행은 건드리지 않는다 — EIA 11/12 17:00Z(공식 12:00 ET, Veterans Day) · Fed 연설', () => {
  assert.deepEqual(officialUtcTime('EIA Crude Oil Stocks Change (Nov/06)', '2026-11-12', '17:00'), { date: '2026-11-12', time: '17:00' });
  assert.deepEqual(officialUtcTime('Fed Williams Speech', '2026-11-12', '23:30'), { date: '2026-11-12', time: '23:30' });
});
t('±1시간이 아니면 그대로(특별 일정) — CFTC 18:00Z', () => assert.deepEqual(officialUtcTime('CFTC S&P 500 speculative net positions', '2026-11-06', '18:00'), { date: '2026-11-06', time: '18:00' }));
t('서머타임 시작 뒤 반대 방향(EST 잔존) — 2027-03-19 CFTC 20:30Z → 19:30Z(15:30 EDT)', () =>
  assert.deepEqual(officialUtcTime('CFTC S&P 500 speculative net positions', '2027-03-19', '20:30'), { date: '2027-03-19', time: '19:30' }));
t('배열 보정 뒤 시각 순 재정렬 · 다른 필드 유지 · 멱등', () => {
  const rows = [
    { date: '2026-11-06', time: '19:30', event: 'CFTC S&P 500 speculative net positions', impact: 'MEDIUM', actual: 1 },
    { date: '2026-11-06', time: '20:00', event: 'Something Else', impact: 'MEDIUM', actual: null },
  ];
  const out = normalizeEconCalendarTimes(rows);
  assert.deepEqual(out.map((r) => `${r.time} ${r.event}`), ['20:00 Something Else', '20:30 CFTC S&P 500 speculative net positions']);
  assert.equal(out[1].actual, 1);
  assert.deepEqual(normalizeEconCalendarTimes(out), out);
  assert.equal(rows[0].time, '19:30'); // 입력은 바꾸지 않는다
});

console.log(`\n${n} passed`);
