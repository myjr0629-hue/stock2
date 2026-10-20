import assert from 'node:assert/strict';
import type { ConfirmedEarnings } from '../src/lib/earningsConfirmed';
import { buildEarningsReceipts, receiptCurrentWeek, receiptWeeks, resolveReceiptWeek } from '../src/lib/earnings/earningsReceipts';
import { NOW, record } from './earningsScorecardFixture';

let n = 0;
function test(name: string, fn: () => void) { fn(); n++; console.log(`✓ ${name}`); }
export const schedule = (ticker = 'JPM', extra: Partial<ConfirmedEarnings> = {}): ConfirmedEarnings => ({
  ticker, date: '2026-10-13', hour: 'bmo', sourceKind: 'company-pr', sourceUrl: 'https://example.com/ir',
  announcedOn: '2026-10-01', verifiedAt: '2026-10-01T12:00:00Z', quote: '확정 일정 시험', ...extra,
});
const build = (records: unknown[], entries = records.map((_, i) => schedule(`T${i}`)), now = NOW, fail = false) =>
  buildEarningsReceipts('2026-10-12', entries, records, now, fail);
const one = (raw: unknown, extra: Partial<ConfirmedEarnings> = {}) => build([raw], [schedule('JPM', extra)]).rows[0];

test('기본은 직전 완료 주, 주말·ET 자정·연도 경계·잘못된 쿼리', () => {
  assert.equal(resolveReceiptWeek(undefined, NOW), '2026-10-12');
  assert.equal(resolveReceiptWeek('2026-10-13', NOW), '2026-10-12');
  assert.equal(resolveReceiptWeek(['2026-10-05'], NOW), '2026-10-12');
  assert.equal(resolveReceiptWeek('2026-10-05', NOW), '2026-10-05');
  assert.equal(receiptCurrentWeek(Date.parse('2026-10-19T00:30:00Z')), '2026-10-12');
  assert.equal(receiptCurrentWeek(Date.parse('2026-10-18T12:00:00-04:00')), '2026-10-12');
  assert.equal(resolveReceiptWeek(null, Date.parse('2026-01-05T12:00:00-05:00')), '2025-12-29');
  assert.ok(receiptWeeks('2025-01-06', NOW).includes('2025-01-06'));
  assert.equal(receiptWeeks('2026-10-12', NOW).length, 18);
});
test('데이터 주: 사전 기록과 진짜 0%, 등호는 범위 안', () => {
  // MGET 순서는 정렬한 일정 순서이므로 서비스가 같은 selectWeekEntries를 사용한다.
  const ordered = build([record('C', 3, 3.0001), record('JNJ', 3, -3), record('JPM', 3, 0)],
    [schedule('JPM'), schedule('JNJ'), schedule('C')]);
  assert.equal(ordered.rows.length, 3);
  assert.deepEqual(ordered.summary, { total: 3, pre: 3, within: 2, outside: 1, backfilled: 0, unverified: 0, missing: 0 });
  assert.equal(ordered.rows[2].actual?.pct, 0);
  assert.equal(ordered.rows[1].beyond, false);
});
test('결측 주도 확정 일정 전체 유지, 빈 일정 이유는 별도', () => {
  const data = build([null, null], [schedule('C'), schedule('JPM')]);
  assert.equal(data.rows.length, 2); assert.equal(data.summary.missing, 2);
  assert.equal(data.rows[0].beyond, null); assert.deepEqual(data.rows[0].issues, ['no_record']);
  assert.equal(buildEarningsReceipts('2026-01-05', [], [], NOW).emptyReason, 'no_schedule');
});
test('EOD 복원과 발표 후 page 기록을 사후 보강으로 분리, 사전 집계 제외', () => {
  const r = record();
  const eod = one({ ...r, expected: { ...r.expected!, src: 'eod-chain' } });
  assert.equal(eod.provenance, 'backfilled'); assert.equal(eod.beyond, false);
  const late = { ...r, expected: { ...r.expected!, capturedAt: Date.parse('2026-10-14T12:00:00Z') } };
  assert.equal(one(late).provenance, 'backfilled');
  const data = build([late], [schedule()]); assert.equal(data.summary.pre, 0); assert.equal(data.summary.backfilled, 1);
});
test('정확한 발표시각 경계, 통화시각을 발표시각으로 사용하지 않음', () => {
  const r = record();
  const capture = (time: string) => ({ ...r, expected: { ...r.expected!, capturedAt: Date.parse(`2026-10-13T${time}:00-04:00`) } });
  assert.equal(one(capture('06:59'), { etTime: '07:00' }).provenance, 'pre');
  assert.equal(one(capture('07:00'), { etTime: '07:00' }).provenance, 'backfilled');
  assert.equal(one(capture('07:00'), { callEtTime: '08:00' }).provenance, 'unverified');
});
test('시각 미공지 장전·장후는 보수적으로 구분, 조기폐장·겨울 ET 반영', () => {
  const r = record();
  assert.equal(one({ ...r, expected: { ...r.expected!, capturedAt: Date.parse('2026-10-13T08:00:00-04:00') } }).provenance, 'unverified');
  const amc = record('JPM', 3, 1, 'fmp', '2026-11-27', 'amc');
  amc.expected!.expiry = '2026-12-04';
  amc.expected!.capturedAt = Date.parse('2026-11-27T12:59:00-05:00');
  const now = Date.parse('2026-12-02T12:00:00Z');
  const row = (capturedAt: number) => buildEarningsReceipts('2026-11-23', [schedule('JPM', { date: '2026-11-27', hour: 'amc' })],
    [{ ...amc, expected: { ...amc.expected!, capturedAt } }], now).rows[0];
  assert.equal(row(amc.expected!.capturedAt).provenance, 'pre');
  assert.equal(row(Date.parse('2026-11-27T13:00:00-05:00')).provenance, 'unverified');
});
test('시각 미공지·오염·키 불일치 행 유지', () => {
  assert.deepEqual(one(record(), { hour: '' }).issues, ['unknown_hour']);
  for (const raw of [{}, record('OTHER'), { ...record(), hour: 'amc' }]) {
    assert.deepEqual(one(raw).issues, ['invalid_record']);
  }
});
test('예상만 결측이어도 실제 가격과 기간 유지', () => {
  const r = one({ ...record(), expected: null });
  assert.equal(r.expected, null); assert.equal(r.actual?.baseClose, 100);
  assert.equal(r.beyond, null); assert.deepEqual(r.issues, ['no_expected']);
});
test('잘못된 세션·만기·출처·관측시각은 사전 기록으로 인정하지 않음', () => {
  for (const override of [{ session: '2026-10-13' }, { expiry: null }, { expiry: '2026-02-30' },
    { expiry: '2026-10-09' }, { capturedAt: 0 }, { capturedAt: NOW + 1 }, { capturedAt: 1 }, { src: 'unknown' }]) {
    const r = record();
    assert.equal(one({ ...r, expected: { ...r.expected!, ...override } }).expected, null, JSON.stringify(override));
  }
});
test('가격과 변동률 불일치·임시 가격·계산시각 오염은 비교 제외', () => {
  for (const override of [{ src: 'unknown' }, { pct: 10 }, { baseClose: 0 }, { reactDate: '2026-10-14' }, { at: 1 }, { at: NOW + 1 }]) {
    const r = record(); assert.equal(one({ ...r, actual: { ...r.actual!, ...override } }).actual, null);
  }
  const data = build([record()], [schedule()], Date.parse('2026-10-13T15:00:00-04:00'));
  assert.deepEqual(data.rows[0].issues, ['pending_actual']);
});
test('읽기 장애는 숫자를 만들지 않고 모든 행에 이유를 남김', () => {
  const data = build([], [schedule()], NOW, true);
  assert.equal(data.rows.length, 1); assert.equal(data.rows[0].beyond, null);
  assert.deepEqual(data.rows[0].issues, ['unavailable']); assert.equal(data.summary.pre, 0);
});
console.log(`${n}개 영수증 규칙 시험 통과`);
