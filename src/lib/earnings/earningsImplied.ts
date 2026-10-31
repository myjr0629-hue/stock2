// ============================================================================
// 앱 실적 캘린더의 «옵션 반영 변동폭» 칸 — 순수 규칙 (2026-10-12)
//
// 값은 새로 계산하지 않는다. 웹 /earnings-week 와 같은 문(services/impliedMoveService.readImpliedMoveRows —
//   lib/impliedMove.ts 정의 «ATM 스트래들 ÷ 현물», 발표 뒤 첫 만기: amc·시각 미정은 발표일 «다음», bmo 는 당일부터)으로
//   묶어 둔 «작은 묶음»(services/earningsImpliedService)을 행에 붙이기만 한다.
// 이 파일은 네트워크·캐시 없이 입력만으로 답한다(시험: tests/earningsImplied.test.ts).
//
// 표시 규칙(웹 lib/earningsWeekView.viewRow 와 같다):
//   · 발표가 끝난 행(phase done)은 숫자를 지운다 — 그 발표의 값이 더 이상 아니다.
//   · 만기가 지난 값은 쓰지 않는다.
//   · 값이 없으면 null — 화면은 «—».
// ============================================================================

import { phaseOf, COPY, toLoc } from '@/lib/earningsWeek';
import { etDateOf } from '@/lib/marketCalendar';
import type { ImpliedTiming } from '@/services/impliedMoveService';
import type { EarningsMoveMethod } from '@/lib/earnings/eventMove';

export const EARNINGS_IMPLIED_KEY = 'earnings:implied:v1';

/**
 * 발표 뒤 첫 만기의 «마감 관측»(services/earningsMonthlyProbe — 공급사 EOD 마감 호가 mark ÷ 공식 종가) 저장 키.
 * 쓰는 곳(earningsMonthlyProbe)과 읽는 곳(impliedMoveService 의 일반 경로 [T26])이 같은 키를 쓰게 여기 한 곳에 둔다.
 */
export const EARNINGS_OBSERVATION_PREFIX = 'earnings:event-probe:v3';
export const earningsObservationKey = (ticker: string, after: string, sameDay: boolean): string =>
  `${EARNINGS_OBSERVATION_PREFIX}:${String(ticker).toUpperCase()}:${after}:${sameDay ? 'same' : 'next'}`;

/** 묶음 한 칸 — 짧은 이름(묶음이 164행 × 몇 필드라 작게) */
export interface ImpliedCell {
  method?: EarningsMoveMethod | null;
  eventMovePct?: number | null;
  /** impliedMovePct (%, 소수 1자리로 반올림된 정의값) */
  p: number | null;
  /** 만기 YYYY-MM-DD */
  e: string | null;
  /** 'live' 장중 실시간 중간값 · 'eod' 그 세션 마감 중간값 */
  b: 'live' | 'eod' | null;
  /** 값의 세션(ET YYYY-MM-DD) */
  s: string | null;
  /** 값이 없을 때 이유 */
  r: string | null;
  /** 1 = 이번 읽기에서 저장본이 비어(no_snapshot) 직전 묶음의 값을 그대로 둔 칸 — 값의 세션(s)이 기준 글에 그대로 보인다 */
  k?: 1;
  /** [10/31] 이 칸을 만들 때 알던 «발표 직후 첫 만기». 값(e)은 늘 이 만기다 — 병합은 같은 첫 만기 값만 이어 쓴다. 옛 칸엔 없다. */
  f?: string;
}

export interface ImpliedPack {
  v: 1;
  /** 만든 시각(ms) */
  at: number;
  /** 만들 때의 ET 날짜 */
  day: string;
  cells: Record<string, ImpliedCell>;
}

/** 행 키 — «티커|발표일» (실적 브리프와 같은 모양) */
export const impliedRowKey = (ticker: string, date: string): string => `${String(ticker).toUpperCase()}|${String(date).slice(0, 10)}`;

/** 캘린더 행의 발표 시각 → 예상 변동 만기 고르기 규칙(웹 earningsWeekService.timingOf 와 같다) */
export const timingOfHour = (hour: string | null | undefined): ImpliedTiming => (hour === 'bmo' ? 'bmo' : hour === 'amc' ? 'amc' : 'unknown');

/** 화면에 붙는 값 */
export interface RowImplied {
  method?: EarningsMoveMethod | null;
  eventMovePct?: number | null;
  pct: number;
  expiry: string;
  basis: 'live' | 'eod' | null;
  session: string | null;
}

/** 서버 묶음·앱 정상본 복원 공용 검사. 현재 ET 만기·발표 상태로 다시 판단한다. */
export function validateRowImplied(
  row: { date: string; hour?: string | null },
  implied: RowImplied | null | undefined,
  nowMs: number = Date.now(),
): RowImplied | null {
  if (!implied || !(typeof implied.pct === 'number' && Number.isFinite(implied.pct) && implied.pct > 0)
    || typeof implied.expiry !== 'string' || !implied.expiry) return null;
  if (implied.expiry < etDateOf(nowMs)) return null;
  const sameDay = timingOfHour(row.hour) === 'bmo';
  if (sameDay ? implied.expiry < row.date : implied.expiry <= row.date) return null;
  if (phaseOf(row.date, row.hour || '', nowMs) === 'done') return null;
  return implied;
}

/** 한 행의 칸 → 화면 값(없으면 null). 발표 완료·만기 지남·값 없음은 null. */
export function impliedForRow(
  row: { ticker: string; date: string; hour?: string | null },
  pack: ImpliedPack | null | undefined,
  nowMs: number = Date.now(),
): RowImplied | null {
  if (!pack || pack.v !== 1 || !pack.cells) return null;
  const c = pack.cells[impliedRowKey(row.ticker, row.date)];
  if (!c) return null;
  // [10/31] 첫 만기 표식(f = e)이 있는 칸만 — 표식 이전 코드가 만든 칸(뒤 월물 대체였을 수 있다)은 내지 않는다(관문 10311145 ②).
  //   그런 묶음은 impliedPackStale 이 바로 다시 만들게 한다.
  if (!c.f || c.f !== c.e) return null;
  return validateRowImplied(row, {
    pct: c.p!, expiry: c.e!, basis: c.b ?? null, session: c.s ?? null,
    ...(c.method ? { method: c.method } : {}),
    ...(c.eventMovePct != null ? { eventMovePct: c.eventMovePct } : {}),
  }, nowMs);
}

/** 행 배열에 implied 를 붙인다(원본은 건드리지 않는다). 붙은 개수도 돌려준다. */
export function attachImplied<R extends { ticker: string; date: string; hour?: string | null }>(
  rows: R[],
  pack: ImpliedPack | null | undefined,
  nowMs: number = Date.now(),
): { rows: Array<R & { implied: RowImplied | null }>; count: number } {
  let count = 0;
  const out = rows.map((r) => {
    const implied = impliedForRow(r, pack, nowMs);
    if (implied) count++;
    return { ...r, implied };
  });
  return { rows: out, count };
}

/**
 * 새로 만든(병합한) 묶음을 저장할까 — 값이 있는 칸이 있으면 저장(기존 규칙). 값이 없어도 «발표 직후 첫 만기»를 확인한 칸(f)이 있고
 *   직전 묶음을 읽어 병합했다면(prevMerged) 저장한다 — 더 이른 첫 만기 확인으로 직전 뒤 만기 값을 거절한 결과가 옛 묶음에 밀리지 않게.
 *   직전 묶음을 못 읽었으면 값 없는 묶음으로 덮지 않는다(다른 행의 확인된 값 보존 — 관문 10311215 ②). 읽기 실패뿐이면 저장하지 않는다.
 */
export function impliedPackWorthSaving(pack: ImpliedPack, prevMerged: boolean): boolean {
  const cells = Object.values(pack?.cells || {});
  return cells.some((c) => c?.p != null) || (prevMerged && cells.some((c) => typeof c?.f === 'string'));
}

/** 묶음이 «다시 만들 때가 됐나» — 장중(뉴욕 09:30~16:00 평일)은 5분, 그 밖은 60분, 날짜가 바뀌면 바로. */
export function impliedPackStale(pack: ImpliedPack | null | undefined, nowMs: number = Date.now()): boolean {
  if (!pack || pack.v !== 1 || !(pack.at > 0)) return true;
  // [10/31] 첫 만기 표식(f) 이전 코드가 만든 묶음은 바로 다시 만든다 — 옛 칸이 표시에 오래 남지 않게(배포 직후 한 번).
  const cells = pack.cells && typeof pack.cells === 'object' ? Object.values(pack.cells) : [];
  if (cells.some((c) => c?.p != null) && !cells.some((c) => typeof c?.f === 'string')) return true;
  if (pack.day !== etDateOf(nowMs)) return true;
  const age = nowMs - pack.at;
  return age > (isRegularHoursET(nowMs) ? 5 * 60_000 : 60 * 60_000);
}

const ET_HM = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit' });
/** 평일 뉴욕 09:30~16:00(휴장일은 따지지 않는다 — 갱신 주기만 정한다) */
export function isRegularHoursET(nowMs: number = Date.now()): boolean {
  const p = ET_HM.formatToParts(new Date(nowMs));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const wd = g('weekday');
  if (wd === 'Sat' || wd === 'Sun') return false;
  const m = Number(g('hour')) * 60 + Number(g('minute'));
  return m >= 9 * 60 + 30 && m < 16 * 60;
}

// ── 화면 글자 ────────────────────────────────────────────────────────────────

/** 칸 이름 — 대표 지시 라벨(웹 earnings-week 영어 문구 «options-implied move»와 같은 말) */
export const IMPLIED_LABEL: Record<'ko' | 'en' | 'ja', string> = {
  ko: '옵션 반영 변동폭',
  ja: 'オプション織り込み変動幅',
  en: 'Options-implied move',
};

/** «±4.2%» — 웹 pctText 와 같은 모양(소수 1자리) */
export const impliedPctText = (pct: number | null | undefined): string => (Number(pct) > 0 ? `±${Number(pct).toFixed(1)}%` : '—');

const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;

/** 보조 글 — «10/16 만기 · 10/9 세션» (웹 COPY.expiryTag · sessionTag 그대로) */
export function impliedBasisText(v: RowImplied | null, locale: string): string | null {
  if (!v) return null;
  const c = COPY[toLoc(locale)];
  const parts = [c.expiryTag(md(v.expiry))];
  if (v.session && /^\d{4}-\d{2}-\d{2}$/.test(v.session)) parts.push(c.sessionTag(md(v.session)));
  return parts.join(' · ');
}

/** A partial cache's missing expiry/straddle does not invalidate an observed, dated value for this event. */
const CARRY_REASONS = new Set(['no_snapshot', 'read_failed', 'no_expiry_after', 'no_straddle']);
/** 직전 값을 이어 쓸 수 있는 최대 나이(값의 세션 기준, 달력 일) */
export const IMPLIED_CARRY_MAX_DAYS = 5;

/**
 * 새 묶음 + 직전 묶음 → 합친 묶음.
 * 장중에는 구조 사본이 요청 때만 다시 계산돼(짧은 수명) 조용한 종목의 저장본이 비는 때가 있다 — 그때 «—»로 비우지 않고
 * 직전 값을 그 세션 꼬리표와 함께 둔다(대표 원칙: 가리지 말고 칸 유지 + 시각 표식). 만기가 지났거나 5일 넘은 값은 잇지 않는다.
 */
export function mergeImpliedPacks(next: ImpliedPack, prev: ImpliedPack | null | undefined, nowMs: number = Date.now(), rows: Array<{ ticker: string; date: string; hour?: string | null }> = []): ImpliedPack {
  if (!prev || prev.v !== 1 || !prev.cells) return next;
  const today = etDateOf(nowMs);
  const cells: Record<string, ImpliedCell> = { ...next.cells };
  const events = new Map(rows.map(row => [impliedRowKey(row.ticker, row.date), row]));
  for (const [key, c] of Object.entries(next.cells)) {
    if (c.p != null || !CARRY_REASONS.has(String(c.r))) continue;
    const old = prev.cells[key];
    if (!old || !(typeof old.p === 'number' && old.p > 0) || !old.e || old.e < today) continue;
    // [10/31] 잇는 값은 «발표 직후 첫 만기»로 확인된 값뿐: 이번 읽기가 첫 만기를 알면 그 만기의 값만,
    //   모르면(시간 초과로 못 읽은 read_failed 등) 직전 칸이 첫 만기 표식(f = e)을 가진 값만 — 확인된 값은 갱신 실패로 지우지 않고,
    //   표식 없는 옛 칸(뒤 월물 대체였을 수 있다)은 잇지 않는다(관문 10311136 ②).
    if (c.f ? old.e !== c.f : old.f !== old.e) continue;
    const eventDate = key.split('|')[1];
    // Unknown timing is conservative; only the current BMO row permits equality.
    const event = events.get(key) ?? { date: eventDate };
    if (!eventDate || !validateRowImplied(event, { pct: old.p, expiry: old.e, basis: old.b, session: old.s }, nowMs)) continue;
    const ageDays = old.s && /^\d{4}-\d{2}-\d{2}$/.test(old.s) ? (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${old.s}T00:00:00Z`)) / 86400e3 : Infinity;
    if (!(ageDays >= 0 && ageDays <= IMPLIED_CARRY_MAX_DAYS)) continue;
    cells[key] = { p: old.p, e: old.e, b: old.b, s: old.s, r: null, k: 1, ...(old.f ? { f: old.f } : c.f ? { f: c.f } : {}), ...(old.method ? { method: old.method } : {}),
      ...(old.eventMovePct != null ? { eventMovePct: old.eventMovePct } : {}) };
  }
  return { ...next, cells };
}

/**
 * [10/31] Money Map 행의 implied 칸 — 키 없음 = «모름»(앱이 직전 확인값을 잇는다) · null = 서버가 «첫 만기 값 없음»으로 정함.
 *   묶음을 못 읽었거나, 묶음에 그 행 칸이 없거나, 첫 만기 표식(f) 없는 옛 칸이면 «모름» — 앱의 확인값을 null 로 지우지 않는다(관문 10311229 A).
 *   first = 그 값이 «발표 직후 첫 만기»로 정해진 칸의 값이라는 표식(앱 복원 검사용).
 */
export function moneyMapImpliedField(r: { ticker: string; date: string; hour?: string | null }, pack: any, now?: number): { implied?: (ReturnType<typeof impliedForRow> & { first: string }) | null } {
    if (!(pack && pack.v === 1 && pack.cells)) return {};
    const cell = pack.cells[impliedRowKey(r.ticker, r.date)];
    if (!cell?.f) return {};
    const v = impliedForRow(r as any, pack, now);
    return { implied: v ? { ...v, first: v.expiry } as any : null };
}
