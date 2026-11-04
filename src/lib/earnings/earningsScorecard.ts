// Redis 기록만 집계한다. 가격 계산·기록 쓰기·벤더 호출은 하지 않는다.
import {
  expectedEligible, isReactionFinal, MAX_PLAUSIBLE_MOVE_PCT, movedBeyondExpected,
  atmReceiptExpectedPct, parseRecord, reactionSessions, type ReportHour,
} from './earningsActuals';

export function isScorecardWeek(week: string | null): week is string {
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return false;
  const d = new Date(`${week}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === week && d.getUTCDay() === 1;
}

export function scorecardWeekEnd(week: string): string {
  const d = new Date(`${week}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

export interface ScorecardRow {
  ticker: string;
  date: string;
  hour: ReportHour;
  expectedPct: number;
  actualPct: number;
  beyond: boolean;
  check: 'fmp' | 'intrinio_only';
  basis: {
    expectedSession: string;
    expectedExpiry: string | null;
    expectedSource: 'page' | 'eod-chain';
    expectedCapturedAt: string;
    baseDate: string;
    reactDate: string;
    actualCalculatedAt: string;
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 기록 하나가 채점표의 «완전한 쌍»인가 — 맞으면 그 행(과 기록의 마지막 쓰기 시각), 아니면 null.
 * 채점표(aggregateScorecard)와 실적 결과 알림(lib/signals/earningsResult)이 같은 기준으로 고르도록 이 함수 하나만 쓴다.
 * 결측·미확정·시점/세션 불일치는 null, 진짜 실제 0%는 포함. 주(week) 범위·중복 제거는 호출자 몫.
 */
export function scorecardPairOf(raw: unknown, nowMs = Date.now()): { row: ScorecardRow; dataAt: number } | null {
  const r = parseRecord(raw);
  if (!r || !r.expected || !r.actual) return null;
  const e = r.expected, a = r.actual;
  const expectedPct = atmReceiptExpectedPct(e);
  if (expectedPct == null) return null;
  const sessions = reactionSessions(r.date, r.hour);
  if (!expectedEligible(r, e.session) || !sessions || a.baseDate !== sessions.base || a.reactDate !== sessions.react
    || !isReactionFinal(a.reactDate, nowMs) || Math.abs(a.pct) > MAX_PLAUSIBLE_MOVE_PCT
    || !(e.capturedAt > 0 && e.capturedAt <= nowMs && a.at > 0 && a.at <= nowMs)) return null;
  return {
    dataAt: Math.max(e.capturedAt, a.at, r.at > 0 && r.at <= nowMs ? r.at : 0),
    row: {
      ticker: r.ticker, date: r.date, hour: r.hour, expectedPct, actualPct: a.pct,
      beyond: movedBeyondExpected(a.pct, expectedPct), check: a.check === 'fmp' ? 'fmp' : 'intrinio_only',
      basis: {
        expectedSession: e.session, expectedExpiry: e.expiry, expectedSource: e.src,
        expectedCapturedAt: new Date(e.capturedAt).toISOString(), baseDate: a.baseDate, reactDate: a.reactDate,
        actualCalculatedAt: new Date(a.at).toISOString(),
      },
    },
  };
}

/** 순수 집계. 결측·미확정·시점/세션 불일치는 제외, 진짜 실제 0%는 포함(행 기준은 scorecardPairOf 하나). */
export function aggregateScorecard(week: string, records: readonly unknown[], nowMs = Date.now()) {
  const end = scorecardWeekEnd(week);
  const rows: ScorecardRow[] = [];
  const seen = new Set<string>();
  let dataAt: number | null = null;
  for (const raw of records) {
    const pair = scorecardPairOf(raw, nowMs);
    if (!pair || pair.row.date < week || pair.row.date > end) continue;
    const key = `${pair.row.ticker}|${pair.row.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dataAt = Math.max(dataAt ?? 0, pair.dataAt);
    rows.push(pair.row);
  }
  rows.sort((a, b) => a.date.localeCompare(b.date)
    || (a.hour === 'bmo' ? 0 : 1) - (b.hour === 'bmo' ? 0 : 1) || a.ticker.localeCompare(b.ticker));
  // 최대 이탈 = |실제| − 예상의 양수 %p. 동률은 위 행 순서(날짜·장전·티커)를 따른다.
  let biggestSurprise: (ScorecardRow & { excessPctPoints: number }) | null = null;
  for (const row of rows) {
    const excess = Math.round((Math.abs(row.actualPct) - row.expectedPct) * 1e4) / 1e4;
    if (row.beyond && (!biggestSurprise || excess > biggestSurprise.excessPctPoints)) {
      biggestSurprise = { ...row, excessPctPoints: excess };
    }
  }
  const beyondCount = rows.filter((r) => r.beyond).length;
  return {
    v: 1 as const, week, weekEnd: end, timezone: 'America/New_York' as const,
    asOf: new Date(nowMs).toISOString(), dataAsOf: dataAt == null ? null : new Date(dataAt).toISOString(),
    source: {
      universe: 'CONFIRMED_EARNINGS', records: 'earnings:actuals:v1:{TICKER}:{date}',
      expected: 'Pre-announcement session ATM straddle / spot, through option expiry',
      actual: 'Intrinio daily regular-session close-to-close reaction',
      check: { fmp: 'Both closes matched FMP within stored tolerance', intrinio_only: 'No independent FMP confirmation' },
    },
    notes: [
      'Only stored, complete pairs from the confirmed announcement list are included; missing records are omitted.',
      'BMO: previous trading close to announcement-day close. AMC: announcement-day close to next trading close.',
      'Expected range is through option expiry; actual reaction is one session. These horizons differ.',
      'Equality is within range. Biggest surprise is the largest positive |actualPct| - expectedPct in percentage points.',
      'Implied move reflects market pricing, not a forecast.',
      'Empty results can mean missing, expired (120-day retention), or unavailable Redis records; not zero movement.',
    ],
    rows,
    summary: { n: rows.length, withinCount: rows.length - beyondCount, beyondCount,
      medianAbsActual: median(rows.map((r) => Math.abs(r.actualPct))),
      medianExpected: median(rows.map((r) => r.expectedPct)), biggestSurprise },
  };
}

export type EarningsScorecard = ReturnType<typeof aggregateScorecard>;
