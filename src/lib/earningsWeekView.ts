// ============================================================================
// 실적 주간 페이지의 «표시용 변환» — 숫자·날짜를 글자로 (순수 함수, 시험 대상: tests/earningsWeek.test.ts)
// 페이지(서버 컴포넌트)와 OG 이미지가 같은 함수를 쓴다 — 화면과 공유 카드의 숫자가 갈라지지 않게.
// ============================================================================
import {
  COPY, biggestMove, hourText, kstOf, mdw, pctText, phaseOf, releaseWhen, type Copy, type Loc, type Phase,
} from './earningsWeek';
import type { EarningsWeekData, EarningsWeekRow } from '@/services/earningsWeekService';
import { expectedPctText, isReactionFinal, reactionSessions, signedPctText } from './earnings/earningsActuals';

const num = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);

/** $332.99 — 기준가(소수 2자리) */
export function fmtPrice(n: number | null | undefined): string | null {
  const v = num(n);
  return v == null ? null : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
/** $335 · $52.5 · $1,055 — 행사가 레벨(필요한 자리만) */
export function fmtLevel(n: number | null | undefined): string | null {
  const v = num(n);
  return v == null ? null : `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;

/** 발표가 끝난 행의 «실제 vs 발표 전 옵션 예상» (2026-10-14) */
export interface ActualView {
  /** '−5.7%' */
  value: string;
  /** '실제 −5.7%' */
  headline: string;
  /** 'vs 옵션 예상 ±3.6%' — 발표 전 예상 기록이 없으면 null */
  vs: string | null;
  /** 출처·기준 시각 줄 */
  src: string;
}

export interface RowView {
  ticker: string;
  phase: Phase;
  etLine: string;
  kstLine: string | null;
  moveText: string | null;
  moveTag: string | null;
  priceText: string | null;
  maxPain: string | null;
  callWall: string | null;
  putFloor: string | null;
  /** 값이 비는 까닭이 «아직 자료가 없음»인가 */
  noData: boolean;
  /** 발표 완료 + 실제 반응이 계산됨 */
  actual: ActualView | null;
  /** 발표 완료 + 반응일 정규장이 아직 안 끝남 → «10/14(수) 정규장 마감 뒤 표시» */
  actualPending: string | null;
}

export function viewRow(r: EarningsWeekRow, loc: Loc, data: Pick<EarningsWeekData, 'dataSession'>, nowMs: number = Date.now()): RowView {
  const c = COPY[loc];
  const phase = phaseOf(r.date, r.hour, nowMs);
  const w = releaseWhen({ date: r.date, hour: r.hour, etTime: r.etTime ?? undefined });
  const etLine = `${mdw(r.date, loc)} ${w.etTime ? `${w.etTime} ET` : hourText(r.hour, c)}`;
  let kstLine: string | null = null;
  if (w.kstDate) {
    const part = w.kstTime ?? (w.kstApprox === 'evening' ? c.kstEvening : w.kstApprox === 'dawn' ? c.kstDawn : '');
    kstLine = `${c.kstLabel} ${mdw(w.kstDate, loc)} ${part}`.trim();
  }
  // 발표가 끝났으면 «예상 변동»은 더 이상 그 발표의 값이 아니다 — 숫자를 지우고 칩("발표 완료")이 대신한다. 레벨은 지금 값이라 그대로.
  const showMove = phase !== 'done' && r.impliedMovePct != null;
  let moveTag: string | null = null;
  if (showMove) {
    moveTag = r.impliedExpiry ? c.expiryTag(md(r.impliedExpiry)) : null;
    if (r.impliedSession && data.dataSession && r.impliedSession !== data.dataSession) {
      moveTag = `${moveTag ? `${moveTag} · ` : ''}${c.sessionTag(md(r.impliedSession))}`;
    }
  }
  const maxPain = fmtLevel(r.maxPain), callWall = fmtLevel(r.callWall), putFloor = fmtLevel(r.putFloor);
  // 발표가 끝난 행 — 숫자를 지우는 대신 «실제 반응 vs 발표 전 옵션 예상»(크론이 저장한 기록)을 보인다.
  let actual: ActualView | null = null;
  let actualPending: string | null = null;
  if (phase === 'done') {
    const a = r.actual;
    if (a) {
      const e = r.expectedAtReport;
      const value = signedPctText(a.pct);
      const closes = c.actual.closes({
        base: mdw(a.baseDate, loc), baseClose: fmtPrice(a.baseClose) ?? '—',
        react: mdw(a.reactDate, loc), reactClose: fmtPrice(a.reactClose) ?? '—',
        fmp: a.check === 'fmp',
      });
      const implied = e ? c.actual.implied({ day: mdw(e.session, loc), expiry: e.expiry ? md(e.expiry) : null, live: e.basis === 'live' }) : null;
      actual = { value, headline: `${c.actual.word} ${value}`, vs: e ? c.actual.vs(expectedPctText(e.pct)) : null, src: implied ? `${closes} · ${implied}` : closes };
    } else if (!r.calendarOnly) {
      // [T40] 캘린더 전용 행은 영수증 크론 대상이 아니라 기록이 생기지 않는다 — «마감 뒤 표시» 안내를 달지 않는다(값 없음 = 기존 빈칸).
      const rs = reactionSessions(r.date, r.hour);
      if (rs && !isReactionFinal(rs.react, nowMs)) actualPending = c.actual.pending({ md: mdw(rs.react, loc) });
    }
  }
  return {
    ticker: r.ticker, phase, etLine, kstLine,
    moveText: showMove ? pctText(r.impliedMovePct) : null,
    moveTag,
    priceText: fmtPrice(r.spot),
    maxPain, callWall, putFloor,
    noData: phase !== 'done' && r.impliedMovePct == null && !maxPain && !callWall && !putFloor,
    actual,
    actualPending,
  };
}

/** 맨 위 한 줄 — «이번 주 가장 큰 예상 변동: TSM ±4.3% (10/15 장전)». 자료가 없으면 null. */
export function topLineOf(data: EarningsWeekData, loc: Loc, nowMs: number = Date.now()): string | null {
  const c = COPY[loc];
  const top = biggestMove(data.rows.map((r) => ({ ticker: r.ticker, date: r.date, hour: r.hour, phase: phaseOf(r.date, r.hour, nowMs), impliedMovePct: r.impliedMovePct })));
  if (!top) return null;
  const row = data.rows.find((r) => r.ticker === top.ticker)!;
  const when = `${md(top.date)} ${row.etTime ? `${row.etTime} ET` : hourText(top.hour, c)}`;
  return c.topLine({ ticker: top.ticker, pct: pctText(top.impliedMovePct), when });
}

export function countsOf(data: EarningsWeekData, nowMs: number = Date.now()): { n: number; done: number; left: number } {
  const n = data.rows.length;
  const done = data.rows.filter((r) => phaseOf(r.date, r.hour, nowMs) === 'done').length;
  return { n, done, left: n - done };
}

/** '10/10(토) 00:07' (ET) · '10/10(토) 13:07' (KST) */
export function stampET(ms: number, loc: Loc): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${mdw(`${g('year')}-${g('month')}-${g('day')}`, loc)} ${g('hour')}:${g('minute')}`;
}
export function stampKST(ms: number, loc: Loc): string {
  const k = kstOf(ms);
  return `${mdw(k.date, loc)} ${k.time}`;
}

/** 기준 시각 줄 — 마감 호가면 «뉴욕 10/9(금) 마감 호가», 장중이면 «장중 실시간 호가», 계산 시각은 뉴욕·한국 함께. 모르면 null. */
export function asOfLineOf(data: EarningsWeekData, loc: Loc): string | null {
  const c: Copy = COPY[loc];
  if (!data.dataBasis) return null;
  const what = data.dataBasis === 'live' ? c.asOfLive : data.dataSession ? c.asOfClose({ day: mdw(data.dataSession, loc) }) : c.asOfLive;
  return data.dataAt ? `${what} · ${c.asOfAt({ ny: stampET(data.dataAt, loc), kst: stampKST(data.dataAt, loc) })}` : what;
}

/** 공유 문구용 짧은 요약 — «TSM ±4.3% (10/15 장전)» 형태가 아니라 topLine 의 본문(접두 «이번 주 가장 큰 예상 변동: » 포함) */
export function shareTopOf(data: EarningsWeekData, loc: Loc, nowMs: number = Date.now()): string | null {
  return topLineOf(data, loc, nowMs);
}
