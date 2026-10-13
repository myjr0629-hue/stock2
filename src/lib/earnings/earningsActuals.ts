// ============================================================================
// 실적 발표의 «실제 반응» vs «옵션이 반영한 예상 변동폭» — 순수 규칙 (2026-10-14)
//
// 왜: /[locale]/earnings-week 는 발표 전에 «옵션이 반영한 예상 변동폭»을 보여 주고, 발표가 끝나면 그 칸을 «—» 로 비웠다
//   (발표 뒤의 옵션 값은 더 이상 그 발표의 값이 아니기 때문). 그러면 독자는 «그래서 예상보다 얼마나 움직였나»를 못 본다.
//   이 파일은 그 답을 만드는 규칙만 둔다 — 네트워크·캐시 없이 입력만으로 답한다(시험: tests/earningsActuals.test.ts).
//
// 정의(대표 10/14) — 기준은 «정규장 종가»다. 시간외 가격은 쓰지 않는다.
//   · 장전(bmo) 발표: 전일 종가 → 발표일 종가
//   · 장후(amc) 발표: 발표일 종가 → 다음 거래일 종가
//   · 시각 미공지('')는 어느 쪽인지 알 수 없어 계산하지 않는다(지어내지 않는다).
//
// 예상 변동폭 = 발표 «직전 마지막 정규장»에 화면이 보여 준 값(lib/impliedMove.ts 의 한 정의 — ATM 스트래들 ÷ 현물):
//   · 장전: 발표일 «전» 세션(세션 < 발표일) · 장후: 발표일 마감까지(세션 ≤ 발표일).
//   · 세션이 이 범위를 벗어난 값(발표 뒤에 계산된 값)은 «그때 보여 준 값»이 아니므로 저장하지 않는다.
//   · 발표가 끝나면(phase done) 더 이상 덮어쓰지 않는다 — 마지막 발표 전 값이 그대로 남는다.
// ============================================================================

import { isNonTradingDay, prevTradingDate, sessionCloseMinutes } from '../marketCalendar';
import { addDaysYmd, etWallToMs } from '../earningsWeek';

export const ACTUALS_KEY_PREFIX = 'earnings:actuals:v1';
/** 기록 보관(초) — 120일. 한 종목·한 발표당 약 0.5KB. */
export const ACTUALS_TTL_SEC = 120 * 24 * 3600;
/** 정규장 마감 뒤 이만큼(분)이 지나야 일봉을 «확정»으로 본다 — 마감 직후의 임시 봉을 쓰지 않는다. */
export const BAR_FINAL_GRACE_MIN = 30;
/** 두 공급사 종가가 이만큼(비율) 이내로 같아야 «대조 일치» — 평소엔 센트까지 같다(10/13 실측 12/12). */
export const VENDOR_TOLERANCE = 0.001;
/** 한 번의 발표 반응으로 이보다 큰 등락(%)은 액면분할 등 오염으로 보고 저장하지 않는다. */
export const MAX_PLAUSIBLE_MOVE_PCT = 50;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type ReportHour = 'amc' | 'bmo';

export const actualsKey = (ticker: string, date: string): string => `${ACTUALS_KEY_PREFIX}:${String(ticker).toUpperCase()}:${date}`;

/** 발표 «전» 마지막 정규장에 화면이 보여 준 예상 변동폭 */
export interface ExpectedSnap {
  /** impliedMovePct (%, 소수 1자리 — lib/impliedMove 정의값 그대로) */
  pct: number;
  /** 만기 YYYY-MM-DD */
  expiry: string | null;
  /** 값의 세션(ET YYYY-MM-DD) */
  session: string;
  /** 'eod' 그 세션 마감 호가 · 'live' 장중 실시간 호가 */
  basis: 'live' | 'eod' | null;
  strike: number | null;
  straddle: number | null;
  spot: number | null;
  /** 저장한 시각(ms) */
  capturedAt: number;
  /** 'page' 화면이 읽는 저장본(구조 사본)에서 · 'eod-chain' 같은 세션의 공급사 EOD 체인을 같은 정의로 다시 계산(보강) */
  src: 'page' | 'eod-chain';
}

/** 발표 반응 — 종가 대 종가 */
export interface ActualMove {
  /** (반응일 종가 ÷ 기준일 종가 − 1) × 100, 소수 4자리 */
  pct: number;
  baseDate: string;
  baseClose: number;
  reactDate: string;
  reactClose: number;
  /** 값의 출처 */
  src: 'intrinio-daily';
  /** 'fmp' = 독립 공급사(FMP) 종가와 두 날짜 모두 일치 · null = 대조할 수 없었다(Intrinio 단독) */
  check: 'fmp' | null;
  /** 계산 시각(ms) */
  at: number;
}

export interface ActualsRecord {
  v: 1;
  ticker: string;
  date: string;
  hour: ReportHour;
  expected: ExpectedSnap | null;
  actual: ActualMove | null;
  /** 마지막 변경 시각(ms) */
  at: number;
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** 저장본 → 기록(모양이 틀리면 null) — 읽는 쪽은 모양을 믿지 않는다. */
export function parseRecord(raw: unknown): ActualsRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  if (r.v !== 1 || typeof r.ticker !== 'string' || !YMD.test(String(r.date)) || (r.hour !== 'amc' && r.hour !== 'bmo')) return null;
  let expected: ExpectedSnap | null = null;
  const e = r.expected;
  if (e && typeof e === 'object' && finite(e.pct) && e.pct > 0 && typeof e.session === 'string' && YMD.test(e.session)) {
    expected = {
      pct: e.pct,
      expiry: typeof e.expiry === 'string' && YMD.test(e.expiry) ? e.expiry : null,
      session: e.session,
      basis: e.basis === 'live' || e.basis === 'eod' ? e.basis : null,
      strike: finite(e.strike) ? e.strike : null,
      straddle: finite(e.straddle) ? e.straddle : null,
      spot: finite(e.spot) ? e.spot : null,
      capturedAt: finite(e.capturedAt) ? e.capturedAt : 0,
      src: e.src === 'eod-chain' ? 'eod-chain' : 'page',
    };
  }
  let actual: ActualMove | null = null;
  const a = r.actual;
  if (a && typeof a === 'object' && finite(a.pct) && YMD.test(String(a.baseDate)) && YMD.test(String(a.reactDate)) && finite(a.baseClose) && a.baseClose > 0 && finite(a.reactClose) && a.reactClose > 0) {
    actual = {
      pct: a.pct, baseDate: a.baseDate, baseClose: a.baseClose, reactDate: a.reactDate, reactClose: a.reactClose,
      src: 'intrinio-daily', check: a.check === 'fmp' ? 'fmp' : null, at: finite(a.at) ? a.at : 0,
    };
  }
  return { v: 1, ticker: r.ticker.toUpperCase(), date: r.date, hour: r.hour, expected, actual, at: finite(r.at) ? r.at : 0 };
}

// ── 날짜 규칙 ────────────────────────────────────────────────────────────────

/** 다음 거래일 (주말·휴장을 건너뛴다) */
export function nextTradingDate(ymd: string): string {
  let s = addDaysYmd(ymd, 1);
  for (let i = 0; i < 10 && isNonTradingDay(s); i++) s = addDaysYmd(s, 1);
  return s;
}

export interface ReactionSessions {
  /** 기준 종가의 세션 */
  base: string;
  /** 반응 종가의 세션 */
  react: string;
}

/**
 * 발표 반응을 재는 두 세션. 장전 = (발표일 직전 거래일 → 발표일) · 장후 = (발표일 → 다음 거래일).
 * 시각 미공지('')·발표일이 거래일이 아님·날짜 모양 오류는 null — 계산하지 않는다.
 */
export function reactionSessions(date: string, hour: string): ReactionSessions | null {
  if (!YMD.test(date) || isNonTradingDay(date)) return null;
  if (hour === 'bmo') return { base: prevTradingDate(date), react: date };
  if (hour === 'amc') return { base: date, react: nextTradingDate(date) };
  return null;
}

/** 반응일 일봉이 «확정»되는 시각(ms) — 정규장 마감(16:00 ET · 조기 폐장 13:00) + 30분 */
export function reactionFinalAt(react: string): number | null {
  const m = sessionCloseMinutes(react) + BAR_FINAL_GRACE_MIN;
  const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return etWallToMs(react, hhmm);
}

export function isReactionFinal(react: string, nowMs: number): boolean {
  const at = reactionFinalAt(react);
  return at != null && nowMs >= at;
}

/**
 * 그 세션의 예상 변동폭을 «발표 전에 보여 준 값»으로 저장해도 되는가.
 *   장전: 세션 < 발표일 · 장후: 세션 ≤ 발표일. 세션을 모르면 false(지어내지 않는다).
 */
export function expectedEligible(c: { date: string; hour: string }, session: string | null | undefined): boolean {
  if (!session || !YMD.test(session) || !YMD.test(c.date)) return false;
  if (c.hour === 'amc') return session <= c.date;
  if (c.hour === 'bmo') return session < c.date;
  return false;
}

// ── 숫자 ─────────────────────────────────────────────────────────────────────

/** 종가 → 등락률(%) 소수 4자리. 입력이 양수가 아니면 null. */
export function pctChange(baseClose: number, reactClose: number): number | null {
  if (!(finite(baseClose) && baseClose > 0 && finite(reactClose) && reactClose > 0)) return null;
  return Math.round((reactClose / baseClose - 1) * 1e6) / 1e4;
}

/** «−5.7%» · «+1.2%» · «0.0%» — 소수 1자리 반올림(절댓값 기준 half-up), 음수는 U+2212. */
export function signedPctText(pct: number | null | undefined): string {
  if (!finite(pct)) return '—';
  const a = Math.round(Math.abs(pct) * 10 + 1e-9) / 10;
  if (a === 0) return '0.0%';
  return `${pct < 0 ? '−' : '+'}${a.toFixed(1)}%`;
}

/** «±3.6%» — 예상 변동폭(부호 없는 크기) */
export function expectedPctText(pct: number | null | undefined): string {
  return finite(pct) && pct > 0 ? `±${pct.toFixed(1)}%` : '—';
}

/** 두 공급사 종가가 허용 오차 안에서 같은가 */
export function closesAgree(a: number, b: number, tol: number = VENDOR_TOLERANCE): boolean {
  return finite(a) && finite(b) && a > 0 && b > 0 && Math.abs(a - b) / a <= tol;
}

/** 새 예상값이 저장본과 «같은 값»인가(같으면 다시 쓰지 않는다 — 쓰기 절약) */
export function sameExpected(a: ExpectedSnap | null, b: Pick<ExpectedSnap, 'pct' | 'expiry' | 'session' | 'basis'>): boolean {
  return !!a && a.pct === b.pct && a.expiry === b.expiry && a.session === b.session && a.basis === b.basis;
}

/** 실제 |변동| 이 예상보다 컸는가 — 같은 날 비교가 아니다(예상은 만기까지, 실제는 하루). 글머리 요약에만 쓴다. */
export function movedBeyondExpected(actualPct: number, expectedPct: number): boolean {
  return finite(actualPct) && finite(expectedPct) && Math.abs(actualPct) > expectedPct;
}
