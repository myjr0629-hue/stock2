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
assert.equal(checkEconLine('{"ko":"새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다","en":"Counts new homes started, a read on construction activity","ja":"新たに着工した住宅数で建設の勢いを測る指標です"}').ok, true);
assert.equal(checkEconLine('{"ko":"주택착공이 1.3M 으로 예상됩니다","en":"Starts will rise","ja":"増える見通しです"}').ok, false, '숫자·전망 금지');
assert.equal(checkEconLine('not json').ok, false);
// 관문 10/18 재현: 예측 문장은 거절
for (const bad of ['{"ko":"이 지표로 주가가 오를 것입니다","en":"New homes started, a read on activity","ja":"新たに着工した住宅数で建設の勢いを測る指標です"}',
  '{"ko":"새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다","en":"Stocks are going to rise on this release","ja":"新たに着工した住宅数で建設の勢いを測る指標です"}',
  '{"ko":"새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다","en":"New homes started, a read on activity","ja":"株価は上昇するでしょう"}']) assert.equal(checkEconLine(bad).ok, false, '예측 문장 거절');
// 위젯 시각: 시점(UTC) 기준 표시 — 자정 넘김·서머타임 경계
const fmt = (ms: number, zone: string) => new Intl.DateTimeFormat('en-US', { timeZone: zone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
assert.equal(fmt(Date.parse('2026-10-20T02:00:00Z'), 'Asia/Seoul'), '10/20, 11:00', 'UTC 02:00 → 10/20 11:00 KST(하루 밀림 없음)');
assert.equal(fmt(Date.parse('2026-11-05T13:30:00Z'), 'Asia/Seoul'), '11/05, 22:30', '서머타임 해제 뒤 13:30 UTC → 22:30 KST');
assert.equal(releaseTimeLabel(Date.parse('2026-11-05T13:30:00Z'), 'en'), '11/5(Thu) 08:30 ET', 'EST 08:30');
for (const bad of ['{"ko":"발표 뒤 금리가 하락할 가능성이 큽니다","en":"New homes started, a read on activity","ja":"新たに着工した住宅数で建設の勢いを測る指標です"}',
  '{"ko":"새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다","en":"Bond prices are set to rise after this release","ja":"新たに着工した住宅数で建設の勢いを測る指標です"}',
  '{"ko":"새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다","en":"New homes started, a read on activity","ja":"発表後に債券価格が上がるかもしれません"}']) assert.equal(checkEconLine(bad).ok, false, '금리·채권 예측문 거절');
assert.equal(checkEconLine('{"ko":"소비자 물가의 변화를 재서 금리 판단에 쓰이는 지표입니다","en":"Measures how fast consumer prices change, a key rate input","ja":"消費者物価の変化を測り、金利判断に使われる指標です"}').ok, true, 'CPI 정의는 통과');
for (const bad of ['{"ko":"내일 금리가 낮아집니다","en":"Measures construction activity","ja":"新たに着工した住宅数で建設の勢いを測る指標です"}',
  '{"ko":"새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다","en":"Interest rates are heading lower tomorrow","ja":"新たに着工した住宅数で建設の勢いを測る指標です"}',
  '{"ko":"새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다","en":"Measures construction activity","ja":"明日の金利は低下します"}',
  '{"ko":"새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다","en":"Tracks rates heading lower","ja":"新たに着工した住宅数で建設の勢いを測る指標です"}']) assert.equal(checkEconLine(bad).ok, false, '시점·방향 문장 거절');
for (const bad of ['{"ko":"다음 달 금리가 급락하는 흐름을 보여주는 지표입니다","en":"Measures construction activity","ja":"新たに着工した住宅数で建設の勢いを測る指標です"}',
  '{"ko":"새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다","en":"Tracks construction activity; rates decrease next month.","ja":"新たに着工した住宅数で建設の勢いを測る指標です"}',
  '{"ko":"새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다","en":"Measures construction activity","ja":"来月の金利急落を示す指標です"}']) assert.equal(checkEconLine(bad).ok, false, '정의 모양 안의 시점·방향 거절');
assert.equal(checkEconLine('{"ko":"새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다","en":"Measures construction activity. Rates tumble","ja":"新たに着工した住宅数で建設の勢いを測る指標です"}').ok, false, '둘째 문장 덧붙이기 거절');
assert.equal(checkEconLine('{"ko":"새로 착공한 주택 수로 건설 경기를 가늠하는 지표입니다.","en":"Counts new homes started, a read on construction activity.","ja":"新たに着工した住宅数で、建設の勢いを測る指標です。"}').ok, true, '끝 마침표 하나는 허용');
console.log('오늘 요약(경제 지표) 시험 32개 통과');
