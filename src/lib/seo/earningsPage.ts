// ============================================================================
// /[locale]/earnings/[symbol] — 종목별 «실적 예상 변동폭 vs 실제» 공개 페이지 (2026-11-12)
//
// 왜: «AAPL earnings expected move»·«애플 실적 예상 변동폭»·«アップル 決算 予想変動幅» 검색을 잡아 웹 → 앱 설치로 잇는다.
//   /flow/[ticker] 는 실적 주간에만 제목을 바꾸고(lib/seo/tickerEarningsIntent) 지난 분기 채점을 한 줄로만 보인다.
//   /receipts/earnings 는 «주» 단위 표다. 종목 하나의 «다음 발표 + 옵션 예상 + 지난 채점»을 한 장에 모은 주소가 없었다.
//
// 지키는 것:
//   · 값을 만들지 않는다 — 일정은 실적 캘린더 저장본(회사 공지 덮기 포함), 예상 변동폭은 실적 묶음 칸(earnings:implied:v1)을
//     impliedForRow 로(실적 캘린더·실적 주간과 같은 문), 채점은 scorecardPairOf(채점표·영수증과 같은 판정) 그대로.
//   · 새 공급사 호출 0 · AI 생성 0 · Redis 쓰기 0 — 읽기는 services/earningsPageService 한 곳(묶음 공유 메모).
//   · 문장의 주어는 미국 주식(주가), 옵션은 근거. 방향 예측·매수/매도 권유 없음.
//   · 데이터(예상 변동폭 또는 완성된 채점)가 하나도 없는 종목은 noindex — 얇은 페이지를 색인에 내지 않는다(사이트맵도 같은 문).
// 순수 함수만 둔다(서버·시험 공용). 비밀값 금지 — 이 저장소는 공개다.
// ============================================================================

import { CONFIRMED_EARNINGS } from '@/lib/earningsConfirmed';
import { EARNINGS_COMPANIES } from '@/lib/earnings/earningsCompanies';
import { COMPANY_NAMES } from '@/lib/seo/earningsTicker';
import { impliedForRow, type ImpliedCell } from '@/lib/earnings/earningsImplied';
import { scorecardPairOf, type ScorecardRow } from '@/lib/earnings/earningsScorecard';
import { addDaysYmd, etWallToMs, kstOf, phaseOf, toLoc, type Loc, type Phase } from '@/lib/earningsWeek';
import { etDateOf, sessionCloseMinutes } from '@/lib/marketCalendar';

export const EP_LOCALES: readonly Loc[] = ['ko', 'en', 'ja'];
const SYMBOL_RE = /^[A-Z]{1,5}$/;

/** 페이지가 있는 종목 — 실적 캘린더 유니버스의 회사 신원표 ∪ 회사 공지 목록(채점 기록이 쓰이는 곳). 점 들어간 클래스주는 제외(미들웨어 matcher 가 점 경로를 건너뛴다). */
export const EARNINGS_PAGE_TICKERS: readonly string[] = Array.from(new Set([
  ...Object.keys(EARNINGS_COMPANIES),
  ...CONFIRMED_EARNINGS.map((c) => c.ticker.toUpperCase()),
])).filter((t) => SYMBOL_RE.test(t) && t !== 'NULL').sort();
const TICKER_SET = new Set(EARNINGS_PAGE_TICKERS);

export const isEarningsPageTicker = (t: string): boolean => SYMBOL_RE.test(t) && TICKER_SET.has(t);

export function companyNames(ticker: string): { en: string; ko: string; ja: string } | null {
  const c = EARNINGS_COMPANIES[ticker];
  if (c) return { en: c.en, ko: c.ko, ja: c.ja };
  return COMPANY_NAMES[ticker] ?? null;
}

/** «애플(AAPL)» · «Apple (AAPL)» · 이름이 티커와 같거나 없으면 티커만 */
export function nameWithTicker(ticker: string, loc: Loc): string {
  const n = companyNames(ticker)?.[loc];
  if (!n || n.toUpperCase() === ticker) return ticker;
  return loc === 'en' ? `${n} (${ticker})` : `${n}(${ticker})`;
}

// ── 저장본 묶음(서비스가 채운다) ────────────────────────────────────────────

/** 실적 캘린더 한 행 중 이 페이지가 쓰는 칸만 */
export interface EpCalendarRow {
  ticker: string;
  date: string;
  hour: string;
  etTime?: string;
  dateStatus?: string;
}

export interface EarningsPageSnapshot {
  /** 묶음을 읽은 시각(ms) */
  at: number;
  /** 캘린더 저장본을 읽었는가(못 읽었으면 «다음 발표»를 모른다 — 0건과 다르다) */
  calendarOk: boolean;
  calendarAt: string | null;
  /** 종목 → 오늘(ET) 이후 발표들(날짜순, 최대 3) — 오늘 발표가 끝나면 화면 시점에 그다음 행을 고른다 */
  next: Record<string, EpCalendarRow[]>;
  /** 실적 묶음 칸(위 행들의 키만) */
  cells: Record<string, ImpliedCell>;
  packAt: number | null;
  packDay: string | null;
  recordsOk: boolean;
  /** 종목 → 채점 기록 원본(검사는 화면 시점에 scorecardPairOf 로) */
  records: Record<string, unknown[]>;
}

export const emptySnapshot = (at = Date.now()): EarningsPageSnapshot => ({
  at, calendarOk: false, calendarAt: null, next: {}, cells: {}, packAt: null, packDay: null, recordsOk: false, records: {},
});

/** 채점 기록 키를 만들 «지난 회사 공지» 목록 — 오늘(ET) 이전·장전/장후가 공지된 것만(채점표와 같은 조건) */
export function pastConfirmedEntries(nowMs: number = Date.now()): Array<{ ticker: string; date: string; hour: 'bmo' | 'amc' }> {
  const today = etDateOf(nowMs);
  const seen = new Set<string>();
  const out: Array<{ ticker: string; date: string; hour: 'bmo' | 'amc' }> = [];
  for (const c of CONFIRMED_EARNINGS) {
    const t = c.ticker.toUpperCase();
    if (!(c.hour === 'bmo' || c.hour === 'amc') || !(c.date <= today) || !TICKER_SET.has(t)) continue;
    const k = `${t}|${c.date}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ticker: t, date: c.date, hour: c.hour });
  }
  return out;
}

/**
 * 발표 시각(ET 'HH:MM')은 회사 공지(CONFIRMED_EARNINGS)의 같은 (종목, 날짜) 시각만 쓴다.
 * 캘린더 행의 etTime 은 공급사 값이라 회사 공지 덮기로 날짜가 바뀌어도 옛 날짜의 시각이 남을 수 있다(관문 11/13) → 쓰지 않는다.
 */
const CONFIRMED_TIME = new Map<string, string>(CONFIRMED_EARNINGS
  .filter((c) => typeof c.etTime === 'string' && /^\d{2}:\d{2}$/.test(c.etTime))
  .map((c) => [`${c.ticker.toUpperCase()}|${c.date}`, c.etTime as string]));

function epRow(r: any, t: string, d: string): EpCalendarRow {
  const hour = r.hour === 'bmo' || r.hour === 'amc' ? r.hour : '';
  const etTime = r.dateStatus === 'confirmed' ? CONFIRMED_TIME.get(`${t}|${d}`) : undefined;
  return {
    ticker: t, date: d, hour,
    ...(etTime ? { etTime } : {}),
    ...(r.dateStatus === 'confirmed' || r.dateStatus === 'est' ? { dateStatus: r.dateStatus } : {}),
  };
}

/** 캘린더 행들 → 종목별 [from, to) 날짜 발표들(날짜순·날짜 중복 제거, 이 페이지 종목만) */
function rowsByTicker(rows: readonly any[], from: string, to: string | null): Record<string, EpCalendarRow[]> {
  const out: Record<string, EpCalendarRow[]> = {};
  for (const r of rows || []) {
    const t = String(r?.ticker || '').toUpperCase();
    const d = String(r?.date || '').slice(0, 10);
    if (!TICKER_SET.has(t) || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < from || (to != null && d >= to)) continue;
    if (out[t]?.some((x) => x.date === d)) continue;
    (out[t] ||= []).push(epRow(r, t, d));
  }
  for (const t of Object.keys(out)) out[t] = out[t].sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/**
 * 이번 주 월요일(ET)~어제 발표 — 허브 «이번 주» 목록 전용. 실적 캘린더 저장본은 «오늘부터»라 지난 날이 없으므로
 * 회사 공지 목록(CONFIRMED_EARNINGS, 저장소 안 정적 자료 · 읽기 0)에서만 고른다. 화면 모델·사이트맵 판정에는 쓰지 않는다.
 */
export function recentConfirmedThisWeek(nowMs: number = Date.now()): EpCalendarRow[] {
  const today = etDateOf(nowMs);
  const from = weekWindows(nowMs).thisWeek[0];
  const rows = CONFIRMED_EARNINGS.filter((c) => c.date >= from && c.date < today).map((c) => ({ ...c, ticker: c.ticker.toUpperCase(), dateStatus: 'confirmed' }));
  return Object.values(rowsByTicker(rows, from, today)).flat();
}

/** 캘린더 행들 → 종목별 오늘(ET) 이후 발표들(날짜순·날짜 중복 제거·최대 3, 이 페이지 종목만) */
export function nextByTicker(rows: readonly any[], nowMs: number = Date.now()): Record<string, EpCalendarRow[]> {
  const out = rowsByTicker(rows, etDateOf(nowMs), null);
  for (const t of Object.keys(out)) out[t] = out[t].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  return out;
}

// ── 화면 모델 ────────────────────────────────────────────────────────────────

export interface EpImplied {
  pct: number;
  /** 'event-split' 실적 이벤트 분리값 · 'straddle' 발표 후 첫 만기 ATM 스트래들 ÷ 주가 */
  basis: 'event-split' | 'straddle';
  expiry: string | null;
  session: string | null;
  quote: 'live' | 'eod' | null;
}

export interface EarningsPageView {
  ticker: string;
  /** 오늘(ET) 이후 가장 가까운 발표. phase 'done' = 오늘 발표가 이미 나왔다(«발표됨 · 결과 집계 중» — 이 날짜를 «다음 발표»로 부르지 않는다) */
  next: (EpCalendarRow & { phase: Phase }) | null;
  /** next 가 오늘 나온 발표일 때 그다음 일정(없으면 null) */
  following: EpCalendarRow | null;
  /** next 가 앞으로의 발표면 지금 값, 오늘 나온 발표면 «발표 전» 마지막 값(같은 칸·같은 검사를 발표 직전 시각으로) */
  implied: EpImplied | null;
  /** 완성된 채점(최근 것 먼저) */
  history: ScorecardRow[];
  /** 색인할 만한가 — 예상 변동폭 또는 채점이 하나라도 있다 */
  indexable: boolean;
  calendarOk: boolean;
  /** 채점 기록을 전부 읽었는가 — 아니면 «기록 없음»이라 말하지 않고 일부만으로 집계하지 않는다 */
  recordsOk: boolean;
  /** 예상 변동폭을 판별할 수 있는가(묶음 + 발표 행을 찾을 캘린더 둘 다 읽음) — 아니면 «아직 없음»이 아니라 «읽지 못함» */
  packOk: boolean;
}

/**
 * 발표가 «나온» 시각(ms) — 회사가 공지한 정확한 시각이 있으면 그 시각(예 NVDA 16:20 ET), 없으면 phaseOf 의 경계(장전 09:30 · 장후 18:00 ET).
 * 시각 미정('')이면 null(그날 끝까지 «오늘»).
 */
export function releaseMsOf(r: { date: string; hour: string; etTime?: string }): number | null {
  const exact = r.etTime ? etWallToMs(r.date, r.etTime) : null;
  if (exact != null) return exact;
  if (r.hour === 'bmo') return etWallToMs(r.date, '09:30');
  if (r.hour === 'amc') return etWallToMs(r.date, '18:00');
  return null;
}

/** 이 페이지의 발표 단계 — phaseOf 에 «공지된 정확한 시각이 지났으면 그때부터 발표됨»을 더한다(장후 16:20 공지면 18:00 까지 기다리지 않는다). 시각 미공지면 phaseOf 그대로. */
export function epPhaseOf(r: { date: string; hour: string; etTime?: string }, nowMs: number = Date.now()): Phase {
  const p = phaseOf(r.date, r.hour, nowMs);
  return p === 'today' && releasedByExactTime(r, nowMs) ? 'done' : p;
}

export function buildEarningsPageView(ticker: string, snap: EarningsPageSnapshot, nowMs: number = Date.now()): EarningsPageView {
  const seen = new Set<string>();
  const history: ScorecardRow[] = [];
  for (const raw of snap.recordsOk ? snap.records[ticker] ?? [] : []) {
    const row = scorecardPairOf(raw, nowMs)?.row;
    if (!row || row.ticker !== ticker || seen.has(row.date)) continue;
    seen.add(row.date);
    history.push(row);
  }
  history.sort((a, b) => b.date.localeCompare(a.date));

  // 오늘(ET) 이전 행은 버린다 — 자정 직후 재사용된 메모 묶음(5분, 읽기 실패 땐 최대 15분)의 어제 행이 «다음 실적 발표»로 나오지 않게(허브와 같은 규칙)
  const today = etDateOf(nowMs);
  let rows = (snap.next[ticker] ?? []).filter((r) => r.date >= today);
  // 오늘 경계가 지난 발표 중 «발표됨 · 결과 집계 중»으로 부를 수 없는 것은 그다음 일정으로 넘긴다:
  //   · 회사 공지 전 예정일 — 실제로 발표했는지 모른다(연기·추정 오류) → «발표됨»이라 단정하지 않는다(관문 11140830 ②)
  //   · 이미 채점됨(장전 발표의 당일 채점) — 집계 중이 아니다
  if (rows[0] && epPhaseOf(rows[0], nowMs) === 'done' && (rows[0].dateStatus !== 'confirmed' || seen.has(rows[0].date))) rows = rows.slice(1);
  // 가장 가까운 발표 — 오늘 발표가 이미 나왔으면 그 발표(«발표됨 · 결과 집계 중»)를 보이고 그다음 일정은 following 으로
  const n = rows[0] ?? null;
  const phase = n ? epPhaseOf(n, nowMs) : null;
  const next = n && phase ? { ...n, phase } : null;
  const following = phase === 'done' ? rows[1] ?? null : null;
  let implied: EpImplied | null = null;
  if (n) {
    // 나온 발표는 «발표 직전» 시각으로 같은 칸·같은 검사(impliedForRow)를 한다 — 값은 만들지 않고 발표 전 마지막 값을 «발표 전 예상»으로만 보인다
    const rel = phase === 'done' ? releaseMsOf(n) : null;
    const at = rel != null ? Math.min(nowMs, rel - 1) : nowMs;
    const v = impliedForRow(n, { v: 1, at: snap.packAt ?? 0, day: snap.packDay ?? '', cells: snap.cells }, at);
    // 나온 발표엔 «발표 전 호가»로 잡힌 값만 — 장후 발표는 발표일 정규장(옵션은 16:15 ET 마감)까지, 그 밖(장전·장중 공지 시각)은 전 거래일까지.
    //   장전 발표일 장중에 다시 만든 묶음(발표 뒤 호가)을 «발표 전 예상»이라 부르지 않는다.
    const preReport = phase !== 'done' || (typeof v?.session === 'string' && (n.hour === 'amc' ? v.session <= n.date : v.session < n.date));
    if (v && preReport) {
      // 칸의 값은 이벤트 분리값이 있으면 그 값이다 — 정의를 값과 함께 넘긴다(tickerEarningsIntent.readIntent 와 같다)
      const split = typeof v.eventMovePct === 'number' && Number.isFinite(v.eventMovePct) && v.eventMovePct > 0;
      implied = { pct: split ? v.eventMovePct! : v.pct, basis: split ? 'event-split' : 'straddle', expiry: v.expiry ?? null, session: v.session ?? null, quote: v.basis ?? null };
    }
  }
  return { ticker, next, following, implied, history, indexable: Boolean(implied) || history.length > 0, calendarOk: snap.calendarOk, recordsOk: snap.recordsOk, packOk: snap.packAt != null && snap.calendarOk };
}

/** 사이트맵·허브용 — 색인할 종목 목록(페이지 메타와 같은 판정) */
export function indexableTickers(snap: EarningsPageSnapshot, nowMs: number = Date.now()): string[] {
  return EARNINGS_PAGE_TICKERS.filter((t) => buildEarningsPageView(t, snap, nowMs).indexable);
}

// ── 표기 ─────────────────────────────────────────────────────────────────────

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD: Record<Loc, string[]> = {
  ko: ['일', '월', '화', '수', '목', '금', '토'], ja: ['日', '月', '火', '水', '木', '金', '土'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const ymdOk = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
const wdOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
/** 11/13 · Nov 13 */
export const md = (ymd: string, loc: Loc): string => (loc === 'en' ? `${MON[Number(ymd.slice(5, 7)) - 1]} ${Number(ymd.slice(8, 10))}` : `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`);
/** 2026년 11월 13일(금) · 2026年11月13日(金) · Fri, Nov 13, 2026 */
export function longDate(ymd: string, loc: Loc): string {
  const y = ymd.slice(0, 4), m = Number(ymd.slice(5, 7)), d = Number(ymd.slice(8, 10)), w = WD[loc][wdOf(ymd)];
  if (loc === 'ko') return `${y}년 ${m}월 ${d}일(${w})`;
  if (loc === 'ja') return `${y}年${m}月${d}日(${w})`;
  return `${w}, ${MON[m - 1]} ${d}, ${y}`;
}
export const expectedText = (pct: number): string => `±${pct.toFixed(1)}%`;
/** 11월 17일 · 11月17日 · Nov 17 — 제목·설명용(한국어·일본어 검색어 «11월 17일»과 맞춘다) */
export const mdName = (ymd: string, loc: Loc): string => {
  const m = Number(ymd.slice(5, 7)), d = Number(ymd.slice(8, 10));
  return loc === 'ko' ? `${m}월 ${d}일` : loc === 'ja' ? `${m}月${d}日` : `${MON[m - 1]} ${d}`;
};

/**
 * 발표 시각의 한국·일본 현지 표기(KST = JST = UTC+9) — 공지 시각이 있으면 그 분까지, 없으면 장전/장후 경계
 * (장후 = 그날 정규장 마감(보통 16:00, 조기 폐장일 13:00) 이후, 장전 = 뉴욕 09:30 이전, 서머타임 자동). 시각 미정·영어면 null. 값을 만들지 않는다.
 */
export const closeEtOf = (ymd: string): string => `${String(Math.floor(sessionCloseMinutes(ymd) / 60)).padStart(2, '0')}:00`;
/** 공지된 정확한 발표 시각이 이미 지났는가(시각 미공지면 false) */
export const releasedByExactTime = (r: { date: string; etTime?: string }, nowMs: number = Date.now()): boolean => {
  const ms = r.etTime ? etWallToMs(r.date, r.etTime) : null;
  return ms != null && nowMs >= ms;
};
export function localWhenText(r: { date: string; hour: string; etTime?: string }, loc: Loc): string | null {
  if (loc === 'en') return null;
  const exact = r.etTime ? etWallToMs(r.date, r.etTime) : null;
  const edge = exact != null ? exact : r.hour === 'amc' ? etWallToMs(r.date, closeEtOf(r.date)) : r.hour === 'bmo' ? etWallToMs(r.date, '09:30') : null;
  if (edge == null) return null;
  const k = kstOf(edge);
  const day = `${mdName(k.date, loc)}(${WD[loc][k.weekday]})`;
  const time = loc === 'ja' ? k.time.replace(/^0/, '') : k.time;
  const tail = exact != null ? '' : r.hour === 'amc' ? (loc === 'ko' ? ' 이후' : '以降') : (loc === 'ko' ? ' 이전' : '以前');
  return loc === 'ko' ? `한국 시간 ${day} ${time}${tail}` : `日本時間 ${day} ${time}${tail}`;
}

/** 허브 «이번 주·다음 주» — 오늘(ET)이 든 주(월~일), 그다음 월~일 */
export function weekWindows(nowMs: number = Date.now()): { thisWeek: [string, string]; nextWeek: [string, string] } {
  const today = etDateOf(nowMs);
  const wd = new Date(`${today}T12:00:00Z`).getUTCDay();
  const sun = addDaysYmd(today, wd === 0 ? 0 : 7 - wd);
  return { thisWeek: [addDaysYmd(sun, -6), sun], nextWeek: [addDaysYmd(sun, 1), addDaysYmd(sun, 7)] };
}
/** 실제 등락 — 기본 소수 1자리, 예상 경계 0.05%p 안이면 반올림 착시를 막으려 4자리까지(영수증 페이지와 같은 이유) */
export function actualText(pct: number, expectedPct?: number): string {
  const sign = pct === 0 ? '' : pct < 0 ? '−' : '+';
  const near = typeof expectedPct === 'number' && Math.abs(Math.abs(pct) - expectedPct) < 0.05;
  const body = near ? Math.abs(pct).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0') : Math.abs(pct).toFixed(1);
  return `${sign}${body}%`;
}

export interface EpCopy {
  kicker: string;
  h1: (name: string) => string;
  lead: (name: string) => string;
  nextT: string;
  /** 오늘 발표가 이미 나왔을 때 카드 제목(«다음 발표»라 부르지 않는다) */
  reportedT: string;
  /** 나온 발표 카드 아래 그다음 일정 한 줄 */
  followingLine: (when: string) => string;
  nextNone: string;
  nextUnknown: string;
  when: (d: { date: string; hour: string; etTime?: string }) => string;
  statusConfirmed: string;
  statusEst: string;
  /** 회사 공지 전 날짜 뒤에 붙는 표식(제목·설명·FAQ) */
  estTag: string;
  phaseDone: string;
  moveT: string;
  moveValue: (d: { name: string; pct: string; released?: boolean }) => string;
  moveBasis: (d: { expiry: string | null; session: string | null; quote: 'live' | 'eod' | null }) => string;
  moveMethod: Record<'event-split' | 'straddle', string>;
  moveNone: string;
  moveUnknown: string;
  histT: string;
  histNone: string;
  histUnknown: string;
  histSummary: (d: { n: number; beyond: number }) => string;
  col: { date: string; expected: string; actual: string; result: string };
  within: string;
  outside: string;
  histBasis: (r: ScorecardRow) => string;
  histHorizon: string;
  readT: string;
  read: Array<[string, string]>;
  faqT: string;
  /** 발표 시각 한 문장(뉴욕 기준 + 한국·일본 시간) — 시각을 모르면 null */
  timeLine: (r: { date: string; hour: string; etTime?: string }) => string | null;
  /** reportedDate = 오늘 이미 나온 발표(«발표됨 · 결과 집계 중») · followingDate = 그다음 일정 — 이때 nextDate 는 null */
  faq: (d: { name: string; ticker: string; calendarOk: boolean; recordsOk: boolean; packOk: boolean; nextDate: string | null; timeLine: string | null; pct: string | null; method: string | null; last: ScorecardRow | null; reportedDate?: string | null; followingDate?: string | null }) => Array<[string, string]>;
  cta: (name: string) => string;
  ctaSub: string;
  moreT: string;
  moreFlow: (ticker: string) => string;
  moreWeek: string;
  moreReceipts: string;
  moreLearn: string;
  moreHub: string;
  asOf: (d: { at: string }) => string;
  disc: string;
  /** reported = 오늘 이미 나온 발표 날짜(이때 date 는 null, pct 는 발표 전 값) */
  metaTitle: (d: { name: string; pct: string | null; date: string | null; graded: string | null; reported?: string | null }) => string;
  metaDesc: (d: { name: string; ticker: string; pct: string | null; date: string | null; local: string | null; last: ScorecardRow | null; reported?: string | null }) => string;
  // 허브
  hubTitle: string;
  hubH1: string;
  hubLead: string;
  hubUpcomingT: string;
  hubGradedT: string;
  hubAllT: string;
  hubEmpty: string;
  hubMetaDesc: string;
  /** 허브 설명 앞머리 — 이번 주·다음 주 발표 종목 몇 개 */
  hubSoonDesc: (items: string[]) => string;
  hubThisWeekT: string;
  hubNextWeekT: string;
  hubWeekEmpty: string;
  /** 이번 주 지난 날은 회사 공지 일정만 싣는다는 안내 */
  hubWeekPastNote: string;
  hubCta: string;
}

const hourKo = (h: string, t?: string) => (t ? `뉴욕 ${t}` : h === 'bmo' ? '장 시작 전' : h === 'amc' ? '장 마감 후' : '시각 미정');
const hourJa = (h: string, t?: string) => (t ? `NY ${t}` : h === 'bmo' ? '寄り付き前' : h === 'amc' ? '引け後' : '時刻未定');
const hourEn = (h: string, t?: string) => (t ? `${t} ET` : h === 'bmo' ? 'before the open' : h === 'amc' ? 'after the close' : 'time not set');

const KO: EpCopy = {
  kicker: '미국 주식 실적 · 예상 vs 실제',
  h1: (n) => `${n} 실적 발표일·예상 변동폭 vs 실제`,
  lead: (n) => `${n} 다음 실적 발표일(한국 시간 포함)과, 주가가 실적 발표 전후로 얼마나 움직일지 옵션 시장이 가격에 반영한 폭(예상 변동폭), 발표 뒤 실제 정규장 종가 변동을 나란히 기록합니다.`,
  nextT: '다음 실적 발표',
  reportedT: '최근 실적 발표',
  followingLine: (w) => `다음 발표: ${w}`,
  nextNone: '실적 캘린더에 앞으로 120일 안의 발표 일정이 아직 없습니다.',
  nextUnknown: '실적 캘린더를 지금 읽지 못했습니다. 잠시 뒤 다시 확인해 주세요.',
  when: ({ date, hour, etTime }) => `${longDate(date, 'ko')} · ${hourKo(hour, etTime)}`,
  statusConfirmed: '회사 공지 일정',
  statusEst: '예정일(회사 공지 전)',
  estTag: '(예정)',
  phaseDone: '발표됨 · 결과 집계 중 — 실제 변동은 발표 반응 정규장이 마감된 뒤 채점합니다.',
  moveT: '발표 전 예상 변동폭(옵션 가격 기준)',
  moveValue: ({ name, pct, released }) => (released ? `발표 전 옵션 가격에 반영된 ${name} 주가의 실적 예상 변동폭은 ${pct}였습니다.` : `옵션 가격에 반영된 ${name} 주가의 실적 예상 변동폭은 ${pct}입니다.`),
  moveBasis: ({ expiry, session, quote }) => [expiry ? `${md(expiry, 'ko')} 만기` : '', session ? `${md(session, 'ko')} ${quote === 'live' ? '장중 ' : quote === 'eod' ? '마감 ' : ''}호가 기준` : ''].filter(Boolean).join(' · '),
  moveMethod: {
    'event-split': '발표 후 첫 만기 ATM 옵션의 분산에서 직전 만기로 잡은 평상시 날짜분을 빼, 실적 발표 자체에 반영된 변동폭만 분리한 값입니다.',
    straddle: '발표 후 첫 만기의 ATM 콜·풋 가격을 더한 스트래들을 주가로 나눈 값입니다. 만기까지의 범위라 발표 다음 하루 변동과는 기간이 다릅니다.',
  },
  moveNone: '아직 표시할 옵션 예상 변동폭이 없습니다. 발표가 가까워져 발표 직후 만기의 옵션 가격이 잡히면 이 자리에 표시합니다.',
  moveUnknown: '옵션 예상 변동폭 자료를 지금 읽지 못했습니다. 잠시 뒤 다시 확인해 주세요.',
  histT: '지난 실적 채점: 예상 vs 실제',
  histNone: '아직 완성된 채점 기록이 없습니다. 발표 전 예상과 발표 뒤 정규장 종가가 모두 기록되면 채점합니다.',
  histUnknown: '채점 기록을 지금 읽지 못했습니다. 잠시 뒤 다시 확인해 주세요.',
  histSummary: ({ n, beyond }) => `기록 ${n}회 중 실제 변동이 예상 범위를 벗어난 경우 ${beyond}회`,
  col: { date: '발표일', expected: '발표 전 예상', actual: '실제 종가 변동', result: '결과' },
  within: '범위 안',
  outside: '범위 밖',
  histBasis: (r) => `예상: ${md(r.basis.expectedSession, 'ko')} 정규장 마감 무렵 ATM 스트래들${r.basis.expectedExpiry ? `(${md(r.basis.expectedExpiry, 'ko')} 만기)` : ''} · 실제: ${md(r.basis.baseDate, 'ko')} 종가 → ${md(r.basis.reactDate, 'ko')} 종가${r.check === 'fmp' ? ' · 두 공급사 종가 일치' : ''}`,
  histHorizon: '예상은 옵션 만기까지의 범위, 실제는 발표 반응 하루의 종가 변동이라 기간이 다릅니다. 같으면 범위 안으로 봅니다.',
  readT: '이 숫자 읽는 법',
  read: [
    ['예상 변동폭', '옵션 시장이 발표 전후 주가 움직임의 «크기»를 가격에 매긴 값입니다. 방향(오를지 내릴지)은 담겨 있지 않습니다.'],
    ['실제 변동', '장 시작 전 발표는 전 거래일 종가 → 발표일 종가, 장 마감 후 발표는 발표일 종가 → 다음 거래일 종가의 등락률입니다. 시간외 가격은 쓰지 않습니다.'],
    ['범위 안 · 범위 밖', '실제 등락의 절댓값이 발표 전 예상보다 크면 «범위 밖», 같거나 작으면 «범위 안»입니다. 범위 밖이 잦은 종목은 옵션 시장이 실적 반응을 작게 본 일이 많았다는 뜻일 뿐, 다음 결과를 알려 주지는 않습니다.'],
  ],
  faqT: '자주 묻는 질문',
  timeLine: ({ date, hour, etTime }) => {
    const local = localWhenText({ date, hour, etTime }, 'ko');
    if (!local) return null;
    return `발표 시각은 ${etTime ? `뉴욕 ${etTime}` : `뉴욕 기준 ${hourKo(hour)}`}, ${local}입니다.`;
  },
  faq: ({ name, calendarOk, recordsOk, packOk, nextDate, timeLine, pct, method, last, reportedDate, followingDate }) => [
    [`${name} 실적 발표일은 언제인가요?`, reportedDate ? `가장 최근 실적은 ${reportedDate}에 발표됐습니다(결과 집계 중).${followingDate ? ` 실적 캘린더 기준 다음 실적 발표일은 ${followingDate}입니다.` : ''}`
      : nextDate ? `실적 캘린더 기준 다음 실적 발표일은 ${nextDate}입니다.${timeLine ? ` ${timeLine}` : ''}` : calendarOk ? '실적 캘린더에 아직 다음 발표 일정이 없습니다.' : '실적 캘린더를 지금 읽지 못했습니다. 잠시 뒤 다시 확인해 주세요.'],
    ...(nextDate && timeLine ? [[`${name} 실적 발표 시간은 한국 시간으로 몇 시인가요?`, timeLine] as [string, string]] : []),
    [`${name} 실적 예상 변동폭은 얼마인가요?`, pct ? `${reportedDate ? `발표 전 옵션 가격에 반영된 예상 변동폭은 ${pct}였습니다.` : `옵션 가격에 반영된 예상 변동폭은 ${pct}입니다.`}${method ? ` ${method}` : ''}` : packOk ? '아직 표시할 옵션 예상 변동폭이 없습니다. 발표가 가까워지면 표시합니다.' : '옵션 예상 변동폭 자료를 지금 읽지 못했습니다.'],
    [`${name} 예상 변동폭은 주가가 오른다는 뜻인가요, 내린다는 뜻인가요?`, `어느 쪽도 아닙니다. 예상 변동폭은 옵션 시장이 실적 발표 전후 움직임의 «크기»에 매긴 값이라 방향은 담겨 있지 않습니다.${pct ? ` ${pct}는 위아래 어느 쪽이든 그 정도 폭의 움직임이 옵션 가격에 반영돼 ${reportedDate ? '있었다는' : '있다는'} 뜻입니다.` : ''}`],
    [`지난 실적 때 ${name} 주가는 예상만큼 움직였나요?`, last ? `${longDate(last.date, 'ko')} 발표 때 발표 전 예상은 ${expectedText(last.expectedPct)}, 실제 정규장 종가 변동은 ${actualText(last.actualPct, last.expectedPct)}로 ${last.beyond ? '예상 범위를 벗어났습니다' : '예상 범위 안이었습니다'}.` : recordsOk ? '아직 완성된 채점 기록이 없습니다.' : '채점 기록을 지금 읽지 못했습니다.'],
  ],
  cta: (n) => `${n} 실적 알림·옵션 흐름은 SIGNUM HQ 앱에서`,
  ctaSub: 'iOS · Android 무료 설치',
  moreT: '함께 보기',
  moreFlow: (t) => `${t} 옵션·다크풀 흐름`,
  moreWeek: '이번 주 실적 발표 일정',
  moreReceipts: '주간 실적 검증 영수증',
  moreLearn: '예상 변동폭이란?',
  moreHub: '종목별 실적 채점표',
  asOf: ({ at }) => `저장본 읽은 시각 ${at} (UTC)`,
  disc: '정보 제공·교육 목적입니다. 투자 자문이나 매수·매도 권유가 아니며, 정확성이나 결과를 보장하지 않습니다.',
  metaTitle: ({ name, pct, date, graded, reported }) => (reported ? `${name} ${reported} 실적 발표됨 · 결과 집계 중${pct ? ` · 발표 전 예상 ${pct}` : ''} | SIGNUM HQ`
    : pct && date ? `${name} 실적 발표일 ${date} · 예상 변동폭 ${pct} | SIGNUM HQ`
    : date ? `${name} 실적 발표일 ${date} · 예상 변동폭 vs 실제 | SIGNUM HQ`
    : graded ? `${name} 실적 예상 변동폭 vs 실제 · ${graded} 채점 | SIGNUM HQ`
    : `${name} 실적 발표일·예상 변동폭 vs 실제 | SIGNUM HQ`),
  metaDesc: ({ name, pct, date, local, last, reported }) => [
    reported ? `${name} 실적은 ${reported}${local ? `(${local})` : ''} 발표됐고 결과 집계 중입니다.` : date ? `${name} 실적 발표일은 ${date}${local ? `, ${local}` : ''}.` : '',
    pct ? `${reported ? '발표 전 ' : ''}옵션 가격에 반영된 실적 예상 변동폭 ${pct}.` : '',
    last ? `지난 발표(${md(last.date, 'ko')}) 예상 ${expectedText(last.expectedPct)} → 실제 ${actualText(last.actualPct, last.expectedPct)}, ${last.beyond ? '범위 밖' : '범위 안'}.` : '',
    '발표 전 옵션 예상과 발표 뒤 실제 종가 변동을 나란히 기록합니다.',
  ].filter(Boolean).join(' '),
  hubTitle: '미국 주식 실적 발표일·예상 변동폭 — 종목별 실적 채점표 | SIGNUM HQ',
  hubH1: '미국 주식 실적 발표일·예상 변동폭 채점표',
  hubLead: '이번 주·다음 주 미국 주식 실적 발표 일정(한국 시간 포함)과, 실적 발표 때 옵션이 반영한 예상 변동폭만큼 주가가 움직였는지 종목별로 기록합니다.',
  hubUpcomingT: '다가오는 발표 · 예상 변동폭',
  hubGradedT: '최근 채점 · 예상 vs 실제',
  hubAllT: '전체 종목',
  hubEmpty: '지금 표시할 기록이 없습니다.',
  hubCta: '내 종목 실적 알림·옵션 흐름은 SIGNUM HQ 앱에서',
  hubMetaDesc: '미국 주식 실적 발표 전 옵션 예상 변동폭과 발표 뒤 실제 종가 변동을 종목별로 채점합니다. 범위 안·밖 결과와 다음 발표 일정.',
  hubSoonDesc: (items) => `이번 주·다음 주 실적 발표: ${items.join(' · ')}.`,
  hubThisWeekT: '이번 주 실적 발표 종목',
  hubNextWeekT: '다음 주 실적 발표 종목',
  hubWeekEmpty: '실적 캘린더에 이 기간 발표 일정이 없습니다.',
  hubWeekPastNote: '이번 주 지난 날짜는 회사가 공지한 발표 일정만 표시합니다.',
};

const JA: EpCopy = {
  kicker: '米国株の決算 · 予想と実際',
  h1: (n) => `${n} 決算発表日・予想変動幅と実際`,
  lead: (n) => `${n}の次回決算発表日(日本時間つき)と、株価が決算発表の前後でどれだけ動くとオプション市場が価格に織り込んだか(予想変動幅)、発表後の実際の通常取引終値の変動を並べて記録します。`,
  nextT: '次回の決算発表',
  reportedT: '直近の決算発表',
  followingLine: (w) => `次回の発表：${w}`,
  nextNone: '決算カレンダーに今後120日以内の発表予定はまだありません。',
  nextUnknown: '決算カレンダーを現在読み込めません。しばらくしてから再度ご確認ください。',
  when: ({ date, hour, etTime }) => `${longDate(date, 'ja')}・${hourJa(hour, etTime)}`,
  statusConfirmed: '企業告知の日程',
  statusEst: '予定日(企業告知前)',
  estTag: '(予定)',
  phaseDone: '発表済み・結果集計中 — 実際の変動は反応日の通常取引終了後に採点します。',
  moveT: '発表前の予想変動幅(オプション価格基準)',
  moveValue: ({ name, pct, released }) => (released ? `発表前のオプション価格に織り込まれた${name}株価の決算予想変動幅は${pct}でした。` : `オプション価格に織り込まれた${name}株価の決算予想変動幅は${pct}です。`),
  moveBasis: ({ expiry, session, quote }) => [expiry ? `${md(expiry, 'ja')}満期` : '', session ? `${md(session, 'ja')}${quote === 'live' ? 'ザラ場' : quote === 'eod' ? '引け' : ''}気配基準` : ''].filter(Boolean).join('・'),
  moveMethod: {
    'event-split': '発表後最初の満期のATMオプションの分散から、直前の満期で見積もった平常日分を差し引き、決算発表そのものに織り込まれた変動幅だけを分離した値です。',
    straddle: '発表後最初の満期のATMコールとプットの価格を合計したストラドルを株価で割った値です。満期までの範囲のため、発表翌日1日の変動とは期間が異なります。',
  },
  moveNone: '表示できるオプション予想変動幅はまだありません。発表が近づき、発表直後の満期のオプション価格が取れるとここに表示します。',
  moveUnknown: 'オプション予想変動幅のデータを現在読み込めません。しばらくしてから再度ご確認ください。',
  histT: '過去の決算採点：予想と実際',
  histNone: '完成した採点記録はまだありません。発表前の予想と発表後の通常取引終値が両方記録されると採点します。',
  histUnknown: '採点記録を現在読み込めません。しばらくしてから再度ご確認ください。',
  histSummary: ({ n, beyond }) => `記録${n}回のうち、実際の変動が予想範囲を超えたのは${beyond}回`,
  col: { date: '発表日', expected: '発表前の予想', actual: '実際の終値変動', result: '結果' },
  within: '範囲内',
  outside: '範囲外',
  histBasis: (r) => `予想：${md(r.basis.expectedSession, 'ja')}通常取引終盤のATMストラドル${r.basis.expectedExpiry ? `(${md(r.basis.expectedExpiry, 'ja')}満期)` : ''}・実際：${md(r.basis.baseDate, 'ja')}終値 → ${md(r.basis.reactDate, 'ja')}終値${r.check === 'fmp' ? '・2社の終値が一致' : ''}`,
  histHorizon: '予想はオプション満期までの範囲、実際は発表反応1日の終値変動のため期間が異なります。同じ値は範囲内とみなします。',
  readT: '数値の読み方',
  read: [
    ['予想変動幅', 'オプション市場が決算前後の株価の動きの「大きさ」に付けた値です。方向(上がるか下がるか)は含みません。'],
    ['実際の変動', '寄り付き前の発表は前営業日終値 → 発表日終値、引け後の発表は発表日終値 → 翌営業日終値の騰落率です。時間外価格は使いません。'],
    ['範囲内・範囲外', '符号を除いた実際の騰落率が発表前の予想より大きければ「範囲外」、同じか小さければ「範囲内」です。範囲外が多い銘柄は、オプション市場が決算反応を小さく見積もったことが多かったというだけで、次の結果を示すものではありません。'],
  ],
  faqT: 'よくある質問',
  timeLine: ({ date, hour, etTime }) => {
    const local = localWhenText({ date, hour, etTime }, 'ja');
    if (!local) return null;
    return `発表時刻は${etTime ? `NY ${etTime}` : `NY基準で${hourJa(hour)}`}、${local}です。`;
  },
  faq: ({ name, calendarOk, recordsOk, packOk, nextDate, timeLine, pct, method, last, reportedDate, followingDate }) => [
    [`${name}の決算発表日はいつですか？`, reportedDate ? `直近の決算は${reportedDate}に発表されました(結果集計中)。${followingDate ? `決算カレンダーでは次回の決算発表日は${followingDate}です。` : ''}`
      : nextDate ? `決算カレンダーでは次回の決算発表日は${nextDate}です。${timeLine ?? ''}` : calendarOk ? '決算カレンダーに次回の発表予定はまだありません。' : '決算カレンダーを現在読み込めません。しばらくしてから再度ご確認ください。'],
    ...(nextDate && timeLine ? [[`${name}の決算発表は日本時間で何時ですか？`, timeLine] as [string, string]] : []),
    [`${name}の決算予想変動幅は？`, pct ? `${reportedDate ? `発表前のオプション価格に織り込まれた予想変動幅は${pct}でした。` : `オプション価格に織り込まれた予想変動幅は${pct}です。`}${method ?? ''}` : packOk ? '表示できるオプション予想変動幅はまだありません。発表が近づくと表示します。' : 'オプション予想変動幅のデータを現在読み込めません。'],
    [`${name}の予想変動幅は株価が上がる・下がるという意味ですか？`, `どちらでもありません。予想変動幅はオプション市場が決算前後の値動きの「大きさ」に付けた値で、方向は含みません。${pct ? `${pct}は、上下どちらでもその程度の値動きがオプション価格に織り込まれて${reportedDate ? 'いた' : 'いる'}という意味です。` : ''}`],
    [`前回の決算で${name}の株価は予想どおり動きましたか？`, last ? `${longDate(last.date, 'ja')}の発表では、発表前の予想が${expectedText(last.expectedPct)}、実際の通常取引終値の変動が${actualText(last.actualPct, last.expectedPct)}で、${last.beyond ? '予想範囲を超えました' : '予想範囲内でした'}。` : recordsOk ? '完成した採点記録はまだありません。' : '採点記録を現在読み込めません。'],
  ],
  cta: (n) => `${n}の決算アラート・オプションフローはSIGNUM HQアプリで`,
  ctaSub: 'iOS · Android 無料インストール',
  moreT: 'あわせて見る',
  moreFlow: (t) => `${t} オプション・ダークプールの流れ`,
  moreWeek: '今週の決算発表予定',
  moreReceipts: '週間決算検証レシート',
  moreLearn: '予想変動幅とは？',
  moreHub: '銘柄別 決算採点表',
  asOf: ({ at }) => `保存データの読み込み時刻 ${at}(UTC)`,
  disc: '情報提供・教育目的です。投資助言や売買の推奨ではなく、正確性や結果を保証するものではありません。',
  metaTitle: ({ name, pct, date, graded, reported }) => (reported ? `${name} ${reported}決算発表済み・結果集計中${pct ? `・発表前の予想変動幅${pct}` : ''} | SIGNUM HQ`
    : pct && date ? `${name} 決算発表日 ${date}・予想変動幅${pct} | SIGNUM HQ`
    : date ? `${name} 決算発表日 ${date}・予想変動幅と実際 | SIGNUM HQ`
    : graded ? `${name} 決算 予想変動幅と実際・${graded}採点 | SIGNUM HQ`
    : `${name} 決算発表日・予想変動幅と実際 | SIGNUM HQ`),
  metaDesc: ({ name, pct, date, local, last, reported }) => [
    reported ? `${name}の決算は${reported}${local ? `(${local})` : ''}に発表され、結果集計中です。` : date ? `${name}の決算発表日は${date}${local ? `、${local}` : ''}。` : '',
    pct ? `${reported ? '発表前の' : ''}オプション価格基準の予想変動幅は${pct}。` : '',
    last ? `前回(${md(last.date, 'ja')})は予想${expectedText(last.expectedPct)} → 実際${actualText(last.actualPct, last.expectedPct)}で${last.beyond ? '範囲外' : '範囲内'}。` : '',
    '発表前のオプション予想と発表後の実際の終値変動を並べて記録します。',
  ].filter(Boolean).join(''),
  hubTitle: '米国株 決算発表日・予想変動幅 — 銘柄別 決算採点表 | SIGNUM HQ',
  hubH1: '米国株 決算発表日・予想変動幅 採点表',
  hubLead: '今週・来週の米国株の決算発表予定(日本時間つき)と、決算発表でオプションの予想変動幅どおりに株価が動いたかを銘柄ごとに記録します。',
  hubUpcomingT: '今後の発表・予想変動幅',
  hubGradedT: '最近の採点・予想と実際',
  hubAllT: '全銘柄',
  hubEmpty: '現在表示できる記録はありません。',
  hubCta: '保有銘柄の決算アラート・オプションフローはSIGNUM HQアプリで',
  hubMetaDesc: '米国株の決算発表前のオプション予想変動幅と発表後の実際の終値変動を銘柄別に採点。範囲内・範囲外の結果と次回発表日。',
  hubSoonDesc: (items) => `今週・来週の決算発表：${items.join('・')}。`,
  hubThisWeekT: '今週の決算発表銘柄',
  hubNextWeekT: '来週の決算発表銘柄',
  hubWeekEmpty: '決算カレンダーにこの期間の発表予定はありません。',
  hubWeekPastNote: '今週の過ぎた日付は、企業が告知した発表日程のみ表示します。',
};

const EN: EpCopy = {
  kicker: 'US stock earnings · Expected vs actual',
  h1: (n) => `${n} Earnings Date, Expected Move vs Actual`,
  lead: (n) => `How far the options market priced ${n} stock to move around earnings (the expected move), recorded next to the actual regular-session closing move after the report.`,
  nextT: 'Next earnings report',
  reportedT: 'Latest earnings report',
  followingLine: (w) => `Next report: ${w}`,
  nextNone: 'No report date in the earnings calendar for the next 120 days yet.',
  nextUnknown: 'The earnings calendar could not be read right now. Please check back shortly.',
  when: ({ date, hour, etTime }) => `${longDate(date, 'en')} · ${hourEn(hour, etTime)}`,
  statusConfirmed: 'Company-announced date',
  statusEst: 'Expected date (not yet announced by the company)',
  estTag: ' (est.)',
  phaseDone: 'Reported · results being tallied — the actual move is graded after the reaction session closes.',
  moveT: 'Pre-earnings expected move (from options prices)',
  moveValue: ({ name, pct, released }) => (released ? `Before the report, options prices implied an earnings move of ${pct} for ${name} stock.` : `Options prices imply an earnings move of ${pct} for ${name} stock.`),
  moveBasis: ({ expiry, session, quote }) => [expiry ? `${md(expiry, 'en')} expiry` : '', session ? `${md(session, 'en')} ${quote === 'live' ? 'live ' : quote === 'eod' ? 'closing ' : ''}quotes` : ''].filter(Boolean).join(' · '),
  moveMethod: {
    'event-split': 'It subtracts the ordinary-day variance implied by the prior expiry from the at-the-money variance of the first expiry after the report, isolating the move priced for the earnings event itself.',
    straddle: 'It is the at-the-money call plus put for the first expiry after the report, divided by the stock price. That range runs to expiry, so its horizon differs from the one-day reaction.',
  },
  moveNone: 'No options-implied move to show yet. It appears here once options for the first expiry after the report are priced.',
  moveUnknown: 'The options-implied move data could not be read right now. Please check back shortly.',
  histT: 'Past earnings scorecard: expected vs actual',
  histNone: 'No complete scorecard record yet. A report is graded once both the pre-report expected move and the post-report regular-session closes are recorded.',
  histUnknown: 'The scorecard records could not be read right now. Please check back shortly.',
  histSummary: ({ n, beyond }) => `${beyond} of ${n} recorded report${n === 1 ? '' : 's'} moved outside the expected range`,
  col: { date: 'Report date', expected: 'Expected before', actual: 'Actual close-to-close', result: 'Result' },
  within: 'Within range',
  outside: 'Outside range',
  histBasis: (r) => `Expected: ATM straddle near the ${md(r.basis.expectedSession, 'en')} regular close${r.basis.expectedExpiry ? ` (${md(r.basis.expectedExpiry, 'en')} expiry)` : ''} · Actual: ${md(r.basis.baseDate, 'en')} close → ${md(r.basis.reactDate, 'en')} close${r.check === 'fmp' ? ' · closes matched across two data vendors' : ''}`,
  histHorizon: 'The expected range runs to option expiry; the actual figure is one reaction session. An equal move counts as within range.',
  readT: 'How to read these numbers',
  read: [
    ['Expected move', 'The size the options market priced for the stock’s move around the report. It carries no direction.'],
    ['Actual move', 'Before-the-open reports: prior close → report-day close. After-the-close reports: report-day close → next session close. Extended-hours prices are not used.'],
    ['Within · outside range', 'If the absolute actual move is larger than the pre-report expected move, it is outside the range; equal or smaller is within. Frequent misses only mean options often priced a smaller reaction — they do not tell you the next result.'],
  ],
  faqT: 'Frequently asked questions',
  timeLine: ({ date, hour, etTime }) => (etTime ? `The report is scheduled for ${etTime} ET.`
    : hour === 'amc' ? `The report is scheduled after the close (after ${Number(closeEtOf(date).slice(0, 2)) - 12}:00 p.m. ET).`
    : hour === 'bmo' ? 'The report is scheduled before the open (before 9:30 a.m. ET).' : null),
  faq: ({ name, calendarOk, recordsOk, packOk, nextDate, timeLine, pct, method, last, reportedDate, followingDate }) => [
    [`When is ${name}’s next earnings date?`, reportedDate ? `The latest report came out on ${reportedDate}; results are being tallied.${followingDate ? ` The earnings calendar lists the next report on ${followingDate}.` : ''}`
      : nextDate ? `The earnings calendar lists the next report on ${nextDate}.${timeLine ? ` ${timeLine}` : ''}` : calendarOk ? 'The earnings calendar has no next report date yet.' : 'The earnings calendar could not be read right now. Please check back shortly.'],
    [`What is ${name}’s earnings expected move?`, pct ? `${reportedDate ? `Before the report, options prices implied an expected move of ${pct}.` : `Options prices imply an expected move of ${pct}.`}${method ? ` ${method}` : ''}` : packOk ? 'No options-implied move to show yet; it appears as the report approaches.' : 'The options-implied move data could not be read right now.'],
    [`Does ${name}’s expected move mean the stock will go up or down?`, `Neither. The expected move is the size the options market priced for the move around the report; it carries no direction.${pct ? ` ${pct} means a move of about that size in either direction ${reportedDate ? 'was' : 'is'} priced into options.` : ''}`],
    [`Did ${name} stock move as much as expected last earnings?`, last ? `For the ${longDate(last.date, 'en')} report, the pre-report expected move was ${expectedText(last.expectedPct)} and the actual regular-session closing move was ${actualText(last.actualPct, last.expectedPct)}, ${last.beyond ? 'outside the expected range' : 'within the expected range'}.` : recordsOk ? 'No complete scorecard record yet.' : 'The scorecard records could not be read right now.'],
  ],
  cta: (n) => `Get ${n} earnings alerts and options flow in the SIGNUM HQ app`,
  ctaSub: 'Free on iOS · Android',
  moreT: 'See also',
  moreFlow: (t) => `${t} options & dark pool flow`,
  moreWeek: 'This week’s earnings calendar',
  moreReceipts: 'Weekly earnings receipts',
  moreLearn: 'What is the expected move?',
  moreHub: 'Earnings scorecard by stock',
  asOf: ({ at }) => `Stored data read at ${at} UTC`,
  disc: 'Information and education only. Not investment advice or a recommendation to buy or sell, and no guarantee of accuracy or results.',
  metaTitle: ({ name, pct, date, graded, reported }) => (reported ? `${name} Earnings Reported ${reported} · Results Being Tallied${pct ? ` · Pre-Report Expected Move ${pct}` : ''} | SIGNUM HQ`
    : pct && date ? `${name} Earnings Date ${date} · Expected Move ${pct} | SIGNUM HQ`
    : date ? `${name} Earnings Date ${date} · Expected Move vs Actual | SIGNUM HQ`
    : graded ? `${name} Earnings Expected Move vs Actual · ${graded} Graded | SIGNUM HQ`
    : `${name} Earnings Date, Expected Move vs Actual | SIGNUM HQ`),
  metaDesc: ({ name, pct, date, last, reported }) => [
    reported ? `${name} reported earnings on ${reported}; results are being tallied.` : date ? `${name} reports earnings next on ${date}.` : '',
    pct ? (reported ? `Before the report, options implied a ${pct} move.` : `Options imply a ${pct} move.`) : '',
    last ? `Last report (${md(last.date, 'en')}): expected ${expectedText(last.expectedPct)}, actual ${actualText(last.actualPct, last.expectedPct)} — ${last.beyond ? 'outside' : 'within'} the range.` : '',
    'Pre-report options pricing next to the actual closing move, report by report.',
  ].filter(Boolean).join(' '),
  hubTitle: 'US Earnings Dates & Expected Moves — Scorecard by Ticker | SIGNUM HQ',
  hubH1: 'US earnings dates, expected moves & scorecard',
  hubLead: 'Did US stocks move as much as options priced around earnings? Upcoming expected moves and the latest graded reports, ticker by ticker.',
  hubUpcomingT: 'Upcoming reports · expected move',
  hubGradedT: 'Recently graded · expected vs actual',
  hubAllT: 'All tickers',
  hubEmpty: 'Nothing to show right now.',
  hubCta: 'Get earnings alerts and options flow for your stocks in the SIGNUM HQ app',
  hubMetaDesc: 'Pre-earnings options expected move vs the actual closing move for US stocks, graded by ticker — within/outside results and next report dates.',
  hubSoonDesc: (items) => `Reporting this week & next: ${items.join(' · ')}.`,
  hubThisWeekT: 'Reporting this week',
  hubNextWeekT: 'Reporting next week',
  hubWeekEmpty: 'No report dates in the earnings calendar for this period.',
  hubWeekPastNote: 'Earlier days this week show company-announced report dates only.',
};

export const EP_COPY: Record<Loc, EpCopy> = { ko: KO, ja: JA, en: EN };
export { toLoc };

/** 스마트링크 — from 태그는 storeRedirect.normalizeFrom 규칙(소문자·밑줄·24자) 안 */
export const earningsAppHref = (ticker: string, loc: Loc): string => `/app?from=seo_${ticker.toLowerCase()}&l=${loc}`;
export const earningsPath = (loc: Loc, ticker?: string): string => (ticker ? `/${loc}/earnings/${ticker}` : `/${loc}/earnings`);
