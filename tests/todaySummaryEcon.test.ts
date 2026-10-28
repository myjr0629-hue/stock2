import assert from 'node:assert/strict';
import { selectNextMajorEvent, releaseTimeLabel, untilLabel } from '../src/lib/todayPicks/summary';
import { fmpCalendarToET } from '../src/lib/fmpCalendarTime';

const now = Date.parse('2026-10-17T23:15:00Z'); // 10/18 08:15 KST
const events = [
  { date: '2026-10-19', time: '14:00', country: 'US', impact: 'MEDIUM', event: 'NAHB Housing Market Index (Oct)' },
  { date: '2026-10-20', time: '12:30', country: 'US', impact: 'HIGH', event: 'Building Permits (Sep)', estimate: 1.35, unit: 'M' },
  { date: '2026-10-20', time: '12:30', country: 'US', impact: 'HIGH', event: 'Housing Starts (Sep)', estimate: 1.3, unit: 'M' },
  { date: '2026-10-29', time: '12:30', country: 'US', impact: 'HIGH', event: 'GDP Growth Rate QoQ Adv (Q3)' },
  { date: '2026-10-16', time: '12:30', country: 'US', impact: 'HIGH', event: 'Old release' },
];
const n = selectNextMajorEvent(events, now)!;
assert.equal(n.utcMs, Date.parse('2026-10-20T12:30:00Z'), '가장 가까운 HIGH(중간 지표·지난 지표·7일 밖 제외)');
assert.equal(n.alsoCount, 1, '같은 시각 HIGH 1건 더');
assert.equal(n.etTime, '08:30', 'UTC 12:30 = 08:30 ET(EDT)');
assert.equal(releaseTimeLabel(n.utcMs, 'ko'), '10/20(화) 21:30 KST', '한국 시각');
assert.equal(releaseTimeLabel(n.utcMs, 'en'), '10/20(Tue) 08:30 ET', '뉴욕 시각');
assert.equal(untilLabel(n.utcMs, now, 'ko'), '3일 후');
assert.equal(selectNextMajorEvent([], now), null);
assert.equal(selectNextMajorEvent(events.slice(0, 1), now), null, 'HIGH 없으면 숨김');
// 경제 캘린더 위젯 수리 근거: 캐시 UTC → ET
assert.deepEqual(fmpCalendarToET('2026-10-20', '12:30'), { date: '2026-10-20', time: '08:30' });
// 위젯 시각: 시점(UTC) 기준 표시 — 자정 넘김·서머타임 경계
const fmt = (ms: number, zone: string) => new Intl.DateTimeFormat('en-US', { timeZone: zone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
assert.equal(fmt(Date.parse('2026-10-20T02:00:00Z'), 'Asia/Seoul'), '10/20, 11:00', 'UTC 02:00 → 10/20 11:00 KST(하루 밀림 없음)');
assert.equal(fmt(Date.parse('2026-11-05T13:30:00Z'), 'Asia/Seoul'), '11/05, 22:30', '서머타임 해제 뒤 13:30 UTC → 22:30 KST');
assert.equal(releaseTimeLabel(Date.parse('2026-11-05T13:30:00Z'), 'en'), '11/5(Thu) 08:30 ET', 'EST 08:30');
console.log('오늘 요약(경제 지표) 선택·시각 시험 통과');
