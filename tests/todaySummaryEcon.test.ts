import assert from 'node:assert/strict';
import { selectNextMajorEvent, releaseTimeLabel, untilLabel } from '../src/lib/todayPicks/summary';
import { checkEconLine } from '../src/lib/ai/econEventLine';
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
// AI 출구 가드
assert.equal(checkEconLine('{"ko":"새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다","en":"New homes started, a read on construction activity","ja":"新たに着工した住宅数で建設の勢いを測る指標です"}').ok, true);
assert.equal(checkEconLine('{"ko":"주택착공이 1.3M 으로 예상됩니다","en":"Starts will rise","ja":"増える見通しです"}').ok, false, '숫자·전망 금지');
assert.equal(checkEconLine('not json').ok, false);
console.log('오늘 요약(경제 지표) 시험 12개 통과');
