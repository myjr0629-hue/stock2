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
import { phaseOf, toLoc, type Loc, type Phase } from '@/lib/earningsWeek';
import { etDateOf } from '@/lib/marketCalendar';

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
  /** 종목 → 가장 가까운 발표(오늘 이후) */
  next: Record<string, EpCalendarRow>;
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

/** 캘린더 행들 → 종목별 가장 가까운 발표(오늘 ET 이후, 이 페이지 종목만) */
export function nextByTicker(rows: readonly any[], nowMs: number = Date.now()): Record<string, EpCalendarRow> {
  const today = etDateOf(nowMs);
  const out: Record<string, EpCalendarRow> = {};
  for (const r of rows || []) {
    const t = String(r?.ticker || '').toUpperCase();
    const d = String(r?.date || '').slice(0, 10);
    if (!TICKER_SET.has(t) || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < today) continue;
    if (out[t] && out[t].date <= d) continue;
    out[t] = {
      ticker: t, date: d, hour: r.hour === 'bmo' || r.hour === 'amc' ? r.hour : '',
      ...(typeof r.etTime === 'string' && /^\d{2}:\d{2}$/.test(r.etTime) ? { etTime: r.etTime } : {}),
      ...(r.dateStatus === 'confirmed' || r.dateStatus === 'est' ? { dateStatus: r.dateStatus } : {}),
    };
  }
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
  next: (EpCalendarRow & { phase: Phase }) | null;
  implied: EpImplied | null;
  /** 완성된 채점(최근 것 먼저) */
  history: ScorecardRow[];
  /** 색인할 만한가 — 예상 변동폭 또는 채점이 하나라도 있다 */
  indexable: boolean;
  calendarOk: boolean;
}

export function buildEarningsPageView(ticker: string, snap: EarningsPageSnapshot, nowMs: number = Date.now()): EarningsPageView {
  const n = snap.next[ticker] ?? null;
  const next = n ? { ...n, phase: phaseOf(n.date, n.hour, nowMs) } : null;
  let implied: EpImplied | null = null;
  if (n) {
    const v = impliedForRow(n, { v: 1, at: snap.packAt ?? 0, day: snap.packDay ?? '', cells: snap.cells }, nowMs);
    if (v) {
      // 칸의 값은 이벤트 분리값이 있으면 그 값이다 — 정의를 값과 함께 넘긴다(tickerEarningsIntent.readIntent 와 같다)
      const split = typeof v.eventMovePct === 'number' && Number.isFinite(v.eventMovePct) && v.eventMovePct > 0;
      implied = { pct: split ? v.eventMovePct! : v.pct, basis: split ? 'event-split' : 'straddle', expiry: v.expiry ?? null, session: v.session ?? null, quote: v.basis ?? null };
    }
  }
  const seen = new Set<string>();
  const history: ScorecardRow[] = [];
  for (const raw of snap.records[ticker] ?? []) {
    const row = scorecardPairOf(raw, nowMs)?.row;
    if (!row || row.ticker !== ticker || seen.has(row.date)) continue;
    seen.add(row.date);
    history.push(row);
  }
  history.sort((a, b) => b.date.localeCompare(a.date));
  return { ticker, next, implied, history, indexable: Boolean(implied) || history.length > 0, calendarOk: snap.calendarOk };
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
  nextNone: string;
  nextUnknown: string;
  when: (d: { date: string; hour: string; etTime?: string }) => string;
  statusConfirmed: string;
  statusEst: string;
  /** 회사 공지 전 날짜 뒤에 붙는 표식(제목·설명·FAQ) */
  estTag: string;
  phaseDone: string;
  moveT: string;
  moveValue: (d: { name: string; pct: string }) => string;
  moveBasis: (d: { expiry: string | null; session: string | null; quote: 'live' | 'eod' | null }) => string;
  moveMethod: Record<'event-split' | 'straddle', string>;
  moveNone: string;
  histT: string;
  histNone: string;
  histSummary: (d: { n: number; beyond: number }) => string;
  col: { date: string; expected: string; actual: string; result: string };
  within: string;
  outside: string;
  histBasis: (r: ScorecardRow) => string;
  histHorizon: string;
  readT: string;
  read: Array<[string, string]>;
  faqT: string;
  faq: (d: { name: string; ticker: string; calendarOk: boolean; nextDate: string | null; pct: string | null; method: string | null; last: ScorecardRow | null }) => Array<[string, string]>;
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
  metaTitle: (d: { name: string; pct: string | null; date: string | null; graded: string | null }) => string;
  metaDesc: (d: { name: string; ticker: string; pct: string | null; date: string | null; last: ScorecardRow | null }) => string;
  // 허브
  hubTitle: string;
  hubH1: string;
  hubLead: string;
  hubUpcomingT: string;
  hubGradedT: string;
  hubAllT: string;
  hubEmpty: string;
  hubMetaDesc: string;
  hubCta: string;
}

const hourKo = (h: string, t?: string) => (t ? `뉴욕 ${t}` : h === 'bmo' ? '장 시작 전' : h === 'amc' ? '장 마감 후' : '시각 미정');
const hourJa = (h: string, t?: string) => (t ? `NY ${t}` : h === 'bmo' ? '寄り付き前' : h === 'amc' ? '引け後' : '時刻未定');
const hourEn = (h: string, t?: string) => (t ? `${t} ET` : h === 'bmo' ? 'before the open' : h === 'amc' ? 'after the close' : 'time not set');

const KO: EpCopy = {
  kicker: '미국 주식 실적 · 예상 vs 실제',
  h1: (n) => `${n} 실적: 예상 변동폭 vs 실제`,
  lead: (n) => `${n} 주가가 실적 발표 전후로 얼마나 움직일지 옵션 시장이 가격에 반영한 폭(예상 변동폭)과, 발표 뒤 실제 정규장 종가 변동을 나란히 기록합니다.`,
  nextT: '다음 실적 발표',
  nextNone: '실적 캘린더에 앞으로 120일 안의 발표 일정이 아직 없습니다.',
  nextUnknown: '실적 캘린더를 지금 읽지 못했습니다. 잠시 뒤 다시 확인해 주세요.',
  when: ({ date, hour, etTime }) => `${longDate(date, 'ko')} · ${hourKo(hour, etTime)}`,
  statusConfirmed: '회사 공지 일정',
  statusEst: '예정일(회사 공지 전)',
  estTag: '(예정)',
  phaseDone: '발표가 끝났습니다. 실제 변동은 발표 반응 정규장이 마감된 뒤 채점합니다.',
  moveT: '발표 전 예상 변동폭(옵션 가격 기준)',
  moveValue: ({ name, pct }) => `옵션 가격에 반영된 ${name} 주가의 실적 예상 변동폭은 ${pct}입니다.`,
  moveBasis: ({ expiry, session, quote }) => [expiry ? `${md(expiry, 'ko')} 만기` : '', session ? `${md(session, 'ko')} ${quote === 'live' ? '장중 ' : quote === 'eod' ? '마감 ' : ''}호가 기준` : ''].filter(Boolean).join(' · '),
  moveMethod: {
    'event-split': '발표 후 첫 만기 ATM 옵션의 분산에서 직전 만기로 잡은 평상시 날짜분을 빼, 실적 발표 자체에 반영된 변동폭만 분리한 값입니다.',
    straddle: '발표 후 첫 만기의 ATM 콜·풋 가격을 더한 스트래들을 주가로 나눈 값입니다. 만기까지의 범위라 발표 다음 하루 변동과는 기간이 다릅니다.',
  },
  moveNone: '아직 표시할 옵션 예상 변동폭이 없습니다. 발표가 가까워져 발표 직후 만기의 옵션 가격이 잡히면 이 자리에 표시합니다.',
  histT: '지난 실적 채점: 예상 vs 실제',
  histNone: '아직 완성된 채점 기록이 없습니다. 발표 전 예상과 발표 뒤 정규장 종가가 모두 기록되면 채점합니다.',
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
  faq: ({ name, calendarOk, nextDate, pct, method, last }) => [
    [`${name} 다음 실적 발표일은 언제인가요?`, nextDate ? `실적 캘린더 기준 다음 발표는 ${nextDate}입니다.` : calendarOk ? '실적 캘린더에 아직 다음 발표 일정이 없습니다.' : '실적 캘린더를 지금 읽지 못했습니다. 잠시 뒤 다시 확인해 주세요.'],
    [`${name} 실적 예상 변동폭은 얼마인가요?`, pct ? `옵션 가격에 반영된 예상 변동폭은 ${pct}입니다.${method ? ` ${method}` : ''}` : '아직 표시할 옵션 예상 변동폭이 없습니다. 발표가 가까워지면 표시합니다.'],
    [`지난 실적 때 ${name} 주가는 예상만큼 움직였나요?`, last ? `${longDate(last.date, 'ko')} 발표 때 발표 전 예상은 ${expectedText(last.expectedPct)}, 실제 정규장 종가 변동은 ${actualText(last.actualPct, last.expectedPct)}로 ${last.beyond ? '예상 범위를 벗어났습니다' : '예상 범위 안이었습니다'}.` : '아직 완성된 채점 기록이 없습니다.'],
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
  metaTitle: ({ name, pct, date, graded }) => (pct && date ? `${name} 실적 예상 변동폭 ${pct} · ${date} 발표 | SIGNUM HQ`
    : graded ? `${name} 실적 예상 변동폭 vs 실제 · ${graded} 채점 | SIGNUM HQ`
    : `${name} 실적 예상 변동폭 vs 실제 | SIGNUM HQ`),
  metaDesc: ({ name, pct, date, last }) => [
    date ? `${name} 다음 실적 발표 ${date}.` : '',
    pct ? `옵션 가격 기준 예상 변동폭 ${pct}.` : '',
    last ? `지난 발표(${md(last.date, 'ko')}) 예상 ${expectedText(last.expectedPct)} → 실제 ${actualText(last.actualPct, last.expectedPct)}, ${last.beyond ? '범위 밖' : '범위 안'}.` : '',
    '발표 전 옵션 예상과 발표 뒤 실제 종가 변동을 나란히 기록합니다.',
  ].filter(Boolean).join(' '),
  hubTitle: '미국 주식 종목별 실적 채점표 — 예상 변동폭 vs 실제 | SIGNUM HQ',
  hubH1: '종목별 실적 채점표',
  hubLead: '미국 주식이 실적 발표 때 옵션이 반영한 예상 변동폭만큼 움직였는지 종목별로 기록합니다. 다가오는 발표의 예상 변동폭과 최근 채점 결과를 모았습니다.',
  hubUpcomingT: '다가오는 발표 · 예상 변동폭',
  hubGradedT: '최근 채점 · 예상 vs 실제',
  hubAllT: '전체 종목',
  hubEmpty: '지금 표시할 기록이 없습니다.',
  hubCta: '내 종목 실적 알림·옵션 흐름은 SIGNUM HQ 앱에서',
  hubMetaDesc: '미국 주식 실적 발표 전 옵션 예상 변동폭과 발표 뒤 실제 종가 변동을 종목별로 채점합니다. 범위 안·밖 결과와 다음 발표 일정.',
};

const JA: EpCopy = {
  kicker: '米国株の決算 · 予想と実際',
  h1: (n) => `${n} 決算：予想変動幅と実際`,
  lead: (n) => `${n}の株価が決算発表の前後でどれだけ動くとオプション市場が価格に織り込んだか(予想変動幅)と、発表後の実際の通常取引終値の変動を並べて記録します。`,
  nextT: '次回の決算発表',
  nextNone: '決算カレンダーに今後120日以内の発表予定はまだありません。',
  nextUnknown: '決算カレンダーを現在読み込めません。しばらくしてから再度ご確認ください。',
  when: ({ date, hour, etTime }) => `${longDate(date, 'ja')}・${hourJa(hour, etTime)}`,
  statusConfirmed: '企業告知の日程',
  statusEst: '予定日(企業告知前)',
  estTag: '(予定)',
  phaseDone: '発表は終了しました。実際の変動は反応日の通常取引終了後に採点します。',
  moveT: '発表前の予想変動幅(オプション価格基準)',
  moveValue: ({ name, pct }) => `オプション価格に織り込まれた${name}株価の決算予想変動幅は${pct}です。`,
  moveBasis: ({ expiry, session, quote }) => [expiry ? `${md(expiry, 'ja')}満期` : '', session ? `${md(session, 'ja')}${quote === 'live' ? 'ザラ場' : quote === 'eod' ? '引け' : ''}気配基準` : ''].filter(Boolean).join('・'),
  moveMethod: {
    'event-split': '発表後最初の満期のATMオプションの分散から、直前の満期で見積もった平常日分を差し引き、決算発表そのものに織り込まれた変動幅だけを分離した値です。',
    straddle: '発表後最初の満期のATMコールとプットの価格を合計したストラドルを株価で割った値です。満期までの範囲のため、発表翌日1日の変動とは期間が異なります。',
  },
  moveNone: '表示できるオプション予想変動幅はまだありません。発表が近づき、発表直後の満期のオプション価格が取れるとここに表示します。',
  histT: '過去の決算採点：予想と実際',
  histNone: '完成した採点記録はまだありません。発表前の予想と発表後の通常取引終値が両方記録されると採点します。',
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
  faq: ({ name, calendarOk, nextDate, pct, method, last }) => [
    [`${name}の次回決算発表日はいつですか？`, nextDate ? `決算カレンダーでは次回の発表は${nextDate}です。` : calendarOk ? '決算カレンダーに次回の発表予定はまだありません。' : '決算カレンダーを現在読み込めません。しばらくしてから再度ご確認ください。'],
    [`${name}の決算予想変動幅は？`, pct ? `オプション価格に織り込まれた予想変動幅は${pct}です。${method ?? ''}` : '表示できるオプション予想変動幅はまだありません。発表が近づくと表示します。'],
    [`前回の決算で${name}の株価は予想どおり動きましたか？`, last ? `${longDate(last.date, 'ja')}の発表では、発表前の予想が${expectedText(last.expectedPct)}、実際の通常取引終値の変動が${actualText(last.actualPct, last.expectedPct)}で、${last.beyond ? '予想範囲を超えました' : '予想範囲内でした'}。` : '完成した採点記録はまだありません。'],
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
  metaTitle: ({ name, pct, date, graded }) => (pct && date ? `${name} 決算 予想変動幅${pct}・${date}発表 | SIGNUM HQ`
    : graded ? `${name} 決算 予想変動幅と実際・${graded}採点 | SIGNUM HQ`
    : `${name} 決算 予想変動幅と実際 | SIGNUM HQ`),
  metaDesc: ({ name, pct, date, last }) => [
    date ? `${name}の次回決算発表は${date}。` : '',
    pct ? `オプション価格基準の予想変動幅は${pct}。` : '',
    last ? `前回(${md(last.date, 'ja')})は予想${expectedText(last.expectedPct)} → 実際${actualText(last.actualPct, last.expectedPct)}で${last.beyond ? '範囲外' : '範囲内'}。` : '',
    '発表前のオプション予想と発表後の実際の終値変動を並べて記録します。',
  ].filter(Boolean).join(''),
  hubTitle: '米国株 銘柄別 決算採点表 — 予想変動幅と実際 | SIGNUM HQ',
  hubH1: '銘柄別 決算採点表',
  hubLead: '米国株が決算発表でオプションの予想変動幅どおりに動いたかを銘柄ごとに記録します。今後の発表の予想変動幅と最近の採点結果をまとめました。',
  hubUpcomingT: '今後の発表・予想変動幅',
  hubGradedT: '最近の採点・予想と実際',
  hubAllT: '全銘柄',
  hubEmpty: '現在表示できる記録はありません。',
  hubCta: '保有銘柄の決算アラート・オプションフローはSIGNUM HQアプリで',
  hubMetaDesc: '米国株の決算発表前のオプション予想変動幅と発表後の実際の終値変動を銘柄別に採点。範囲内・範囲外の結果と次回発表日。',
};

const EN: EpCopy = {
  kicker: 'US stock earnings · Expected vs actual',
  h1: (n) => `${n} Earnings: Expected Move vs Actual`,
  lead: (n) => `How far the options market priced ${n} stock to move around earnings (the expected move), recorded next to the actual regular-session closing move after the report.`,
  nextT: 'Next earnings report',
  nextNone: 'No report date in the earnings calendar for the next 120 days yet.',
  nextUnknown: 'The earnings calendar could not be read right now. Please check back shortly.',
  when: ({ date, hour, etTime }) => `${longDate(date, 'en')} · ${hourEn(hour, etTime)}`,
  statusConfirmed: 'Company-announced date',
  statusEst: 'Expected date (not yet announced by the company)',
  estTag: ' (est.)',
  phaseDone: 'The report is out. The actual move is graded after the reaction session closes.',
  moveT: 'Pre-earnings expected move (from options prices)',
  moveValue: ({ name, pct }) => `Options prices imply an earnings move of ${pct} for ${name} stock.`,
  moveBasis: ({ expiry, session, quote }) => [expiry ? `${md(expiry, 'en')} expiry` : '', session ? `${md(session, 'en')} ${quote === 'live' ? 'live ' : quote === 'eod' ? 'closing ' : ''}quotes` : ''].filter(Boolean).join(' · '),
  moveMethod: {
    'event-split': 'It subtracts the ordinary-day variance implied by the prior expiry from the at-the-money variance of the first expiry after the report, isolating the move priced for the earnings event itself.',
    straddle: 'It is the at-the-money call plus put for the first expiry after the report, divided by the stock price. That range runs to expiry, so its horizon differs from the one-day reaction.',
  },
  moveNone: 'No options-implied move to show yet. It appears here once options for the first expiry after the report are priced.',
  histT: 'Past earnings scorecard: expected vs actual',
  histNone: 'No complete scorecard record yet. A report is graded once both the pre-report expected move and the post-report regular-session closes are recorded.',
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
  faq: ({ name, calendarOk, nextDate, pct, method, last }) => [
    [`When is ${name}’s next earnings report?`, nextDate ? `The earnings calendar lists the next report on ${nextDate}.` : calendarOk ? 'The earnings calendar has no next report date yet.' : 'The earnings calendar could not be read right now. Please check back shortly.'],
    [`What is ${name}’s earnings expected move?`, pct ? `Options prices imply an expected move of ${pct}.${method ? ` ${method}` : ''}` : 'No options-implied move to show yet; it appears as the report approaches.'],
    [`Did ${name} stock move as much as expected last earnings?`, last ? `For the ${longDate(last.date, 'en')} report, the pre-report expected move was ${expectedText(last.expectedPct)} and the actual regular-session closing move was ${actualText(last.actualPct, last.expectedPct)}, ${last.beyond ? 'outside the expected range' : 'within the expected range'}.` : 'No complete scorecard record yet.'],
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
  metaTitle: ({ name, pct, date, graded }) => (pct && date ? `${name} Earnings Expected Move ${pct} · Reports ${date} | SIGNUM HQ`
    : graded ? `${name} Earnings Expected Move vs Actual · ${graded} Graded | SIGNUM HQ`
    : `${name} Earnings Expected Move vs Actual | SIGNUM HQ`),
  metaDesc: ({ name, pct, date, last }) => [
    date ? `${name} reports earnings next on ${date}.` : '',
    pct ? `Options imply a ${pct} move.` : '',
    last ? `Last report (${md(last.date, 'en')}): expected ${expectedText(last.expectedPct)}, actual ${actualText(last.actualPct, last.expectedPct)} — ${last.beyond ? 'outside' : 'within'} the range.` : '',
    'Pre-report options pricing next to the actual closing move, report by report.',
  ].filter(Boolean).join(' '),
  hubTitle: 'US Stock Earnings Scorecard — Expected Move vs Actual by Ticker | SIGNUM HQ',
  hubH1: 'Earnings scorecard by stock',
  hubLead: 'Did US stocks move as much as options priced around earnings? Upcoming expected moves and the latest graded reports, ticker by ticker.',
  hubUpcomingT: 'Upcoming reports · expected move',
  hubGradedT: 'Recently graded · expected vs actual',
  hubAllT: 'All tickers',
  hubEmpty: 'Nothing to show right now.',
  hubCta: 'Get earnings alerts and options flow for your stocks in the SIGNUM HQ app',
  hubMetaDesc: 'Pre-earnings options expected move vs the actual closing move for US stocks, graded by ticker — within/outside results and next report dates.',
};

export const EP_COPY: Record<Loc, EpCopy> = { ko: KO, ja: JA, en: EN };
export { toLoc };

/** 스마트링크 — from 태그는 storeRedirect.normalizeFrom 규칙(소문자·밑줄·24자) 안 */
export const earningsAppHref = (ticker: string, loc: Loc): string => `/app?from=seo_${ticker.toLowerCase()}&l=${loc}`;
export const earningsPath = (loc: Loc, ticker?: string): string => (ticker ? `/${loc}/earnings/${ticker}` : `/${loc}/earnings`);
