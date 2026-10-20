import assert from 'node:assert/strict';
import { aggregateScorecard, isScorecardWeek } from '../src/lib/earnings/earningsScorecard';
import { NOW, record } from './earningsScorecardFixture';

let n = 0;
function test(name: string, fn: () => void) { fn(); n++; console.log(`✓ ${name}`); }
const aggregate = (records: unknown[], now = NOW) => aggregateScorecard('2026-10-12', records, now);

test('실제 날짜인 ET 월요일만 허용', () => {
  for (const s of ['2026-10-12', '2026-11-02', '2024-12-30']) assert.equal(isScorecardWeek(s), true);
  for (const s of [null, '', '2026-10-13', '2026-02-30', '2026-13-01', '2026-1-12', '2026-10-12T00:00:00Z']) {
    assert.equal(isScorecardWeek(s), false, String(s));
  }
});
test('결측 제외, 실제 0%는 포함, 빈 중앙값은 null', () => {
  const valid = record('ZERO', 3, 0);
  const data = aggregate([null, {}, { ...record('NOEXPECTED'), expected: null }, { ...record('NOACTUAL'), actual: null }, valid]);
  assert.deepEqual(data.rows.map((r) => r.ticker), ['ZERO']);
  assert.deepEqual(data.summary, { n: 1, withinCount: 1, beyondCount: 0, medianAbsActual: 0, medianExpected: 3, biggestSurprise: null });
  const empty = aggregate([]);
  assert.deepEqual(empty.summary, { n: 0, withinCount: 0, beyondCount: 0, medianAbsActual: null, medianExpected: null, biggestSurprise: null });
  assert.equal(empty.dataAsOf, null);
});
test('양·음 경계는 범위 내, 바로 바깥은 초과', () => {
  const data = aggregate([record('EQPOS', 3, 3), record('EQNEG', 3, -3), record('OUTPOS', 3, 3.0001), record('OUTNEG', 3, -3.0001)]);
  assert.equal(data.summary.withinCount, 2);
  assert.equal(data.summary.beyondCount, 2);
  assert.deepEqual(data.rows.map((r) => [r.ticker, r.beyond]), [['EQNEG', false], ['EQPOS', false], ['OUTNEG', true], ['OUTPOS', true]]);
});
test('대조 표식, 짝·홀 중앙값, 최대 이탈은 절대크기 초과 %p', () => {
  const data = aggregate([record('A', 2, -7), record('B', 8, 9, null), record('C', 4, -1)]);
  assert.equal(data.rows[0].check, 'fmp');
  assert.equal(data.rows[1].check, 'intrinio_only');
  assert.equal(data.summary.medianAbsActual, 7);
  assert.equal(data.summary.medianExpected, 4);
  assert.equal(data.summary.biggestSurprise?.ticker, 'A');
  assert.equal(data.summary.biggestSurprise?.excessPctPoints, 5);
  assert.equal(aggregate([record('A', 2, -2), record('B', 4, 8)]).summary.medianAbsActual, 5);
  assert.equal(aggregate([record('A', 2, -2), record('B', 4, 8)]).summary.medianExpected, 3);
});
test('같은 초과폭 동률은 날짜·장전·티커 순, 중복 기록 제외', () => {
  const data = aggregate([record('B', 2, 2.2), record('A', 1, 1.2), record('A', 1, 1.2)]);
  assert.equal(data.summary.n, 2);
  assert.equal(data.summary.biggestSurprise?.ticker, 'A');
});
test('주 밖·발표 뒤 예상 세션·잘못된 반응 세션·이상값 제외', () => {
  const badExpected = record('LATE'); badExpected.expected!.session = '2026-10-13';
  const badReact = record('BADREACT'); badReact.actual!.reactDate = '2026-10-14';
  const badTime = record('BADTIME'); badTime.actual!.at = 0;
  const badCapture = record('FUTURE'); badCapture.expected!.capturedAt = NOW + 1;
  const data = aggregate([record('PAST', 2, 3, 'fmp', '2026-10-09'), record('NEXT', 2, 3, 'fmp', '2026-10-19'),
    badExpected, badReact, badTime, badCapture, record('INF', Infinity), record('NAN', 2, NaN), record('BIG', 2, 50.0001), record('VALID')]);
  assert.deepEqual(data.rows.map((r) => r.ticker), ['VALID']);
});
test('금요일 장후 발표는 다음 주 월요일 반응 확정 뒤 원래 주에 포함', () => {
  const friday = record('FRIDAY', 3, -4, null, '2026-10-16', 'amc');
  friday.actual!.at = Date.parse('2026-10-19T16:30:00-04:00');
  assert.equal(aggregate([friday], Date.parse('2026-10-19T16:29:59-04:00')).summary.n, 0);
  assert.equal(aggregate([friday], Date.parse('2026-10-19T16:30:00-04:00')).summary.n, 1);
  assert.equal(aggregate([friday]).rows[0].basis.reactDate, '2026-10-19');
});
test('기준일과 출처·서로 다른 측정 기간 명시', () => {
  const data = aggregate([record()]);
  assert.equal(data.weekEnd, '2026-10-18');
  assert.equal(data.asOf, new Date(NOW).toISOString());
  assert.equal(data.rows[0].basis.baseDate, '2026-10-12');
  assert.equal(data.rows[0].basis.reactDate, '2026-10-13');
  assert.match(data.source.actual, /Intrinio/);
  assert.ok(data.notes.some((s) => /horizons differ/.test(s)));
});
console.log(`${n} aggregation tests passed`);
