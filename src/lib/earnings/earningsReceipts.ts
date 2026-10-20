// 공개 영수증 전용 규칙. 기존 scorecard의 응답·집계 규칙은 변경하지 않는다.
import type { ConfirmedEarnings } from '../earningsConfirmed';
import { addDaysYmd, etWallToMs, selectWeekEntries, weekdayOfYmd } from '../earningsWeek';
import { etDateOf, sessionCloseMinutes } from '../marketCalendar';
import { isScorecardWeek, scorecardWeekEnd } from './earningsScorecard';
import {
  expectedEligible, isReactionFinal, MAX_PLAUSIBLE_MOVE_PCT, movedBeyondExpected,
  parseRecord, pctChange, reactionFinalAt, reactionSessions,
  type ActualMove, type ExpectedSnap,
} from './earningsActuals';

export type ReceiptIssue = 'unavailable' | 'no_schedule' | 'no_record' | 'invalid_record' | 'unknown_hour'
  | 'no_expected' | 'invalid_expected' | 'no_actual' | 'pending_actual' | 'invalid_actual';
export type ReceiptProvenance = 'pre' | 'backfilled' | 'unverified' | 'missing';
export interface ReceiptRow {
  ticker: string;
  date: string;
  hour: ConfirmedEarnings['hour'];
  etTime: string | null;
  sourceUrl: string;
  expected: ExpectedSnap | null;
  actual: ActualMove | null;
  provenance: ReceiptProvenance;
  beyond: boolean | null;
  issues: ReceiptIssue[];
}

/** 주말에도 지난 주로 이동하지 않는 ET 달력 주. 기본은 직전 완료 주. */
export function receiptCurrentWeek(nowMs = Date.now()): string {
  const today = etDateOf(nowMs);
  return addDaysYmd(today, -((weekdayOfYmd(today) + 6) % 7));
}
export function resolveReceiptWeek(value: unknown, nowMs = Date.now()): string {
  return typeof value === 'string' && isScorecardWeek(value) ? value : addDaysYmd(receiptCurrentWeek(nowMs), -7);
}
/** 빈 주도 선택 가능. 120일 보관 창의 최근 18주 + 직접 요청한 유효한 주. */
export function receiptWeeks(selected: string, nowMs = Date.now()): string[] {
  return [...new Set([selected, ...Array.from({ length: 18 }, (_, i) => addDaysYmd(receiptCurrentWeek(nowMs), -i * 7))])]
    .sort().reverse();
}

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
const validStamp = (ms: number, now: number) => ms > 0 && ms <= now && Number.isFinite(new Date(ms).getTime());

/** 시각 미공지: BMO는 발표일 00:00 ET 이전, AMC는 정규장 마감 이전만 사전으로 인정.
 * 실제 발표 시각이 없으므로 그 뒤 저장된 page 값은 확인 불가. EOD 복원은 항상 보강.
 */
function provenance(c: ConfirmedEarnings, e: ExpectedSnap): ReceiptProvenance {
  if (e.src === 'eod-chain') return 'backfilled';
  const exact = c.etTime ? etWallToMs(c.date, c.etTime) : null;
  const close = sessionCloseMinutes(c.date);
  const cutoff = exact ?? etWallToMs(c.date, c.hour === 'bmo' ? '00:00'
    : `${String(Math.floor(close / 60)).padStart(2, '0')}:${String(close % 60).padStart(2, '0')}`);
  if (cutoff != null && e.capturedAt < cutoff) return 'pre';
  // 정확한 발표시각 이후 또는 다음 ET 날짜에 저장된 것은 사후로 확인 가능.
  if ((exact != null && e.capturedAt >= exact) || etDateOf(e.capturedAt) > c.date) return 'backfilled';
  return 'unverified';
}

/** 확정 일정의 모든 행을 유지한다. 입력 values는 일정과 같은 순서(MGET)다. */
export function buildEarningsReceipts(week: string, list: readonly ConfirmedEarnings[], values: readonly unknown[], nowMs = Date.now(), unavailable = false) {
  const entries = selectWeekEntries(list, week, scorecardWeekEnd(week));
  const rows: ReceiptRow[] = entries.map((c, i) => {
    const issues: ReceiptIssue[] = [];
    const row: ReceiptRow = { ticker: c.ticker, date: c.date, hour: c.hour,
      etTime: c.etTime && etWallToMs(c.date, c.etTime) != null ? c.etTime : null,
      sourceUrl: c.sourceUrl, expected: null, actual: null, provenance: 'missing', beyond: null, issues };
    if (unavailable) { issues.push('unavailable'); return row; }
    const raw = values[i];
    const r = parseRecord(raw);
    if (!c.hour) { issues.push('unknown_hour'); return row; }
    if (!r) { issues.push(raw == null ? 'no_record' : 'invalid_record'); return row; }
    if (r.ticker !== c.ticker.toUpperCase() || r.date !== c.date || r.hour !== c.hour) {
      issues.push('invalid_record'); return row;
    }
    const e = r.expected;
    // 원본 출처가 없는 기록을 parseRecord의 기본값(page)만으로 사전이라 부르지 않는다.
    const rawExpected = (raw as { expected?: { src?: unknown } }).expected;
    if (!e) issues.push('no_expected');
    else if (!expectedEligible(c, e.session) || !validDate(e.session) || !validDate(e.expiry)
      || e.expiry < c.date || e.expiry < e.session || !validStamp(e.capturedAt, nowMs)
      || e.capturedAt < (etWallToMs(e.session, '00:00') ?? Infinity)
      || (rawExpected?.src !== 'page' && rawExpected?.src !== 'eod-chain')) issues.push('invalid_expected');
    else { row.expected = e; row.provenance = provenance(c, e); }
    const sessions = reactionSessions(c.date, c.hour);
    const a = r.actual;
    const rawActual = (raw as { actual?: { src?: unknown } }).actual;
    if (!sessions) issues.push('invalid_actual');
    else if (!isReactionFinal(sessions.react, nowMs)) issues.push('pending_actual');
    else if (!a) issues.push('no_actual');
    else if (rawActual?.src !== 'intrinio-daily' || a.baseDate !== sessions.base || a.reactDate !== sessions.react
      || !validStamp(a.at, nowMs) || a.at < (reactionFinalAt(sessions.react) ?? Infinity)
      || Math.abs(a.pct) > MAX_PLAUSIBLE_MOVE_PCT
      || Math.abs((pctChange(a.baseClose, a.reactClose) ?? Infinity) - a.pct) > 0.00011) issues.push('invalid_actual');
    else row.actual = a;
    if (row.expected && row.actual) row.beyond = movedBeyondExpected(row.actual.pct, row.expected.pct);
    return row;
  });
  const pre = rows.filter((r) => r.provenance === 'pre' && r.beyond != null);
  return {
    week, weekEnd: scorecardWeekEnd(week), asOf: new Date(nowMs).toISOString(), rows,
    emptyReason: rows.length ? null : 'no_schedule' as ReceiptIssue,
    summary: {
      total: rows.length, pre: pre.length,
      within: pre.filter((r) => !r.beyond).length, outside: pre.filter((r) => r.beyond).length,
      backfilled: rows.filter((r) => r.provenance === 'backfilled').length,
      unverified: rows.filter((r) => r.provenance === 'unverified').length,
      missing: rows.filter((r) => r.beyond == null).length,
    },
  };
}
export type EarningsReceipts = ReturnType<typeof buildEarningsReceipts>;
