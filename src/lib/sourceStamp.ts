// src/lib/sourceStamp.ts
// ============================================================================
// «값 + 원천 날짜/근거» 공용 스탬프 — 묶음 4(원천 날짜·상품·상태 전달, 2026-10-19 SESSION-MATRIX-CODEX.md)
//
// 왜: 값은 화면까지 가는데 «그 값이 어느 정규장(거래일)의 것인지·언제 관측됐는지·어떤 근거인지»가 중간에서 떨어졌다.
//   · 관심종목 «9/28 종가» 날짜를 원천이 아니라 «받은 시각 + 지금 달력»으로 다시 만들었다(W01) — 묵은 값에도 오늘 날짜가 붙었다.
//   · 가격 허브(WS) 틱은 «기준가에서 2% 안»이면 믿었다 — 틱의 나이(체결 시각)는 보지 않았다(오래된 틱이 가격이 비슷해 통과).
//   · 여러 행의 옵션 기준을 «가장 최근 시각 하나»로 대표했다(I04~I06) — 오래된 행까지 최신처럼 보였다.
//
// 규칙(이 파일 하나):
//   sourceSessionDate  값이 속한 미국 정규장 거래일 'YYYY-MM-DD'(ET). 모르면 null — 지금 달력으로 지어내지 않는다.
//   observedAt         원천이 그 값을 관측한 시각(체결·계산·적재 시각, ms). 모르면 null.
//   receivedAt         우리가 그 값을 받은 시각(ms) — 신선도 «참고»일 뿐, 원천 날짜를 대신하지 않는다.
//   basis              live = 지금 열린 세션의 관측값 · eod = 마지막으로 끝난 정규장의 확정 종가류
//                      last-session = 그보다 앞 세션의 값을 이어 보여 줌(지금 세션 값이 아님) · proxy = 대리값(다른 상품·추정·호가 중간값)
//                      missing = 값 없음
//   혼합 행은 «최대 날짜 하나»로 대표하지 않는다(summarizeStamps — 같을 때만 그 날짜, 다르면 mixed + 최소·최대).
//   가격 채택·응답 역전은 acceptQuote 로 거른다(가격·시각·세션·기준 종가 한 묶음).
//   오래된 WS 틱은 wsTickFresh 로 거른다(가격 근접성만으로 최신 판정하지 않는다).
//
// 순수 함수 — 시험 tests/sourceStamp.test.ts(무네트워크).
// ============================================================================

import { etDateOf, etMinutesOf, sessionCloseMinutes, isNonTradingDay } from '@/lib/marketCalendar';

export type SourceBasis = 'live' | 'eod' | 'last-session' | 'proxy' | 'missing';

export interface SourceStamp {
  sourceSessionDate: string | null;
  observedAt: number | null;
  receivedAt: number;
  basis: SourceBasis;
}

/** 가격·체결 시각·세션·등락 기준은 항상 함께 채택한다. */
export interface QuoteValue {
  price: number;
  changePct: number | null;
  session: 'pre' | 'reg' | 'post' | 'closed';
  previousClose: number | null;
  stamp: SourceStamp;
  source: 'rest' | 'ws';
  /** 체결 시각 없는 옛 허브 메시지에만 쓰는 가격 검증 기준 */
  referencePrice?: number | null;
  /** 시간외 표시의 기존 문구·상태도 채택된 값에 속한다. */
  label?: string;
  kind?: string | null;
}

/** 값의 유일한 채택 규칙. 수신 시각으로 오래된 체결을 새 체결로 만들지 않는다. */
export function acceptQuote(prev: QuoteValue | null | undefined, next: QuoteValue | null | undefined, now: number): QuoteValue | null {
  if (prev && (!Number.isFinite(prev.price) || prev.price <= 0 || prev.stamp.basis === 'missing')) prev = null;
  if (!next || !Number.isFinite(next.price) || next.price <= 0 || next.stamp.basis === 'missing') return prev ?? null;
  if (next.source === 'ws') {
    if (!wsTickFresh({ priceTime: next.stamp.observedAt, receivedAt: next.stamp.receivedAt }, next.session, now)) return prev ?? null;
    // 시각 없는 레거시 메시지는 원천 선후를 증명할 수 없어 기존 가격 문턱을 유지한다.
    if (!next.stamp.observedAt) {
      const ref = next.referencePrice;
      if (next.session !== 'reg' && !(ref && ref > 0)) return prev ?? null;
      if (ref && ref > 0 && Math.abs(next.price - ref) / ref > (next.session === 'reg' ? 0.02 : 0.0025)) return prev ?? null;
    }
  }
  if (prev) {
    const p = prev.stamp, n = next.stamp;
    if (p.sourceSessionDate && (!n.sourceSessionDate || n.sourceSessionDate < p.sourceSessionDate)) return prev;
    if (p.sourceSessionDate === n.sourceSessionDate) {
      if (p.observedAt && n.observedAt && n.observedAt < p.observedAt) return prev;
      // 같은 거래일의 확정 종가를 장중 틱으로 되돌리지 않는다.
      if (p.basis === 'eod' && n.basis === 'live' && prev.session === next.session && !n.observedAt) return prev;
    }
  }
  const base = next.previousClose;
  return base && base > 0 && (next.source === 'ws' || next.changePct == null || (prev && prev.session !== next.session)) ? { ...next, changePct: (next.price - base) / base * 100 } : next;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const BASES: ReadonlySet<string> = new Set(['live', 'eod', 'last-session', 'proxy', 'missing']);

/** 'YYYY-MM-DD' 인가(그 밖은 null) */
export function asSessionDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.slice(0, 10);
  return YMD.test(s) ? s : null;
}

/** 양의 유한 ms(초·나노초 단위도 받아 ms 로) — 아니면 null */
export function asEpochMs(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v)
    : typeof v === 'string' ? Date.parse(v)
    : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 1e17) return Math.round(n / 1e6);   // ns
  if (n > 1e14) return Math.round(n / 1e3);   // µs
  if (n < 1e11) return Math.round(n * 1e3);   // s
  return Math.round(n);
}

export function asBasis(v: unknown): SourceBasis | null {
  return typeof v === 'string' && BASES.has(v) ? (v as SourceBasis) : null;
}

/** 스탬프를 만든다 — 모양이 틀린 값은 null 로 떨군다(지어내지 않는다). basis 를 모르면 값 유무로: 날짜도 시각도 없으면 missing */
export function makeStamp(p: { sourceSessionDate?: unknown; observedAt?: unknown; receivedAt?: unknown; basis?: unknown }, nowMs: number = Date.now()): SourceStamp {
  const sourceSessionDate = asSessionDate(p.sourceSessionDate);
  const observedAt = asEpochMs(p.observedAt);
  const receivedAt = asEpochMs(p.receivedAt) ?? nowMs;
  const basis = asBasis(p.basis) ?? (sourceSessionDate || observedAt ? 'last-session' : 'missing');
  return { sourceSessionDate, observedAt, receivedAt, basis };
}

export const missingStamp = (receivedAt: number = Date.now()): SourceStamp => ({ sourceSessionDate: null, observedAt: null, receivedAt, basis: 'missing' });

/** 응답 한 행에 스탬프 필드가 있으면 읽는다(평평한 필드 또는 sourceStamp 객체). 하나도 없으면 null */
export function readStamp(row: unknown, fallbackReceivedAt: number = Date.now()): SourceStamp | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const nested = r.sourceStamp && typeof r.sourceStamp === 'object' ? (r.sourceStamp as Record<string, unknown>) : null;
  const src = nested ?? r;
  if (src.sourceSessionDate === undefined && src.observedAt === undefined && src.basis === undefined) return null;
  return makeStamp({ sourceSessionDate: src.sourceSessionDate, observedAt: src.observedAt, receivedAt: src.receivedAt ?? fallbackReceivedAt, basis: src.basis });
}

/**
 * 시세 한 종목의 «정규장 가격» 스탬프(/api/live/quotes · live/ticker 가 같이 쓴다).
 *   session        서버 세션('regular'·'pre'·'post'·'closed' 또는 'REG' 등)
 *   regularDate    가격(day.c)이 속한 정규장 날짜(벤더 _intrinio.regularDate · 벌크 _eodDate) — 모르면 null
 *   tradeMs        정규장 중 마지막 체결 시각(ms)
 *   priceBasis     벤더 가격 정의('trade'·'fair_value'·'nbbo_mid'·'eod_close' …)
 *   lastClosed     지금 기준 «마지막으로 끝난 정규장» 날짜(etLastClosedSessionDate) — eod 와 last-session 을 가른다
 */
export function regularPriceStamp(i: {
  session: string | null | undefined;
  regularDate: string | null | undefined;
  tradeMs: number | null | undefined;
  priceBasis?: string | null;
  hasPrice: boolean;
  lastClosed: string;
  nowMs: number;
}): SourceStamp {
  const s = String(i.session || '').toLowerCase();
  const regular = s === 'regular' || s === 'reg' || s === 'open';
  const today = etDateOf(i.nowMs);
  const tradeMs = asEpochMs(i.tradeMs);
  const regDate = asSessionDate(i.regularDate);
  if (!i.hasPrice) return { sourceSessionDate: regDate, observedAt: null, receivedAt: i.nowMs, basis: 'missing' };
  if (regular) {
    const pb = String(i.priceBasis || '');
    // 정규장 중 «오늘 체결»이면 live(벤더 'trade'·'fair_value' = 단일 거래소 체결) — 호가 중간값(quote_mid)은 proxy, 종가류(eod_close)는 그날의 값이 아니다
    if (pb === 'eod_close') {
      const d = regDate && regDate < today ? regDate : null;
      // 값은 있다 — 이전 세션 값(날짜를 모르면 null 로 둔다 · missing 으로 바꾸지 않는다)
      return { sourceSessionDate: d, observedAt: null, receivedAt: i.nowMs, basis: 'last-session' };
    }
    const tradeDay = tradeMs ? etDateOf(tradeMs) : null;
    if (tradeDay && tradeDay < today) return { sourceSessionDate: tradeDay, observedAt: tradeMs, receivedAt: i.nowMs, basis: 'last-session' };
    const proxy = pb === 'quote_mid' || pb === 'nbbo_mid' || pb === 'mid';
    return { sourceSessionDate: today, observedAt: tradeMs, receivedAt: i.nowMs, basis: proxy ? 'proxy' : 'live' };
  }
  // 프리·애프터·마감: 가격 = 정규장 종가(day.c). 그 날짜가 마지막 완료 정규장이면 eod, 더 앞이면 last-session
  if (!regDate) return { sourceSessionDate: null, observedAt: null, receivedAt: i.nowMs, basis: 'last-session' };
  // POST 의 day.c 는 «오늘» 정규장 종가 — 마지막 완료 정규장이 오늘이다(lastClosed 가 이미 오늘일 수도, 달력이 16:00 경계라 아닐 수도)
  const expected = s === 'post' ? today : i.lastClosed;
  return { sourceSessionDate: regDate, observedAt: null, receivedAt: i.nowMs, basis: regDate >= expected ? 'eod' : 'last-session' };
}

/**
 * /api/live/ticker 응답의 큰 가격(price) 스탬프 — 원천 날짜 = prices.regularDate(벤더) · 관측 시각 = 정규장 마지막 체결(priceTradeMs) · 근거 = 벤더 가격 정의(priceBasis).
 *   화면의 «시각» 표식은 display.asOfET(원천 체결·마감 시각)로 — 조회 시계(new Date())가 아니다(F01·C01·X02).
 */
export function tickerPayloadStamp(payload: any, lastClosed: string, nowMs: number = Date.now()): SourceStamp {
  const price = Number(payload?.display?.price ?? payload?.price);
  return regularPriceStamp({
    session: payload?.session,
    regularDate: payload?.prices?.regularDate ?? null,
    tradeMs: String(payload?.session || '').toUpperCase() === 'REG' ? (Number(payload?.prices?.priceTradeMs ?? payload?.priceTradeMs) || null) : null,
    priceBasis: payload?.prices?.priceBasis ?? payload?.priceBasis ?? null,
    hasPrice: Number.isFinite(price) && price > 0,
    lastClosed,
    nowMs,
  });
}

/** 두 스탬프 중 «원천이 더 새것» — 날짜 먼저, 같은 날이면 관측 시각, 그다음 받은 시각 */
export function compareStamps(a: SourceStamp, b: SourceStamp): number {
  const da = a.sourceSessionDate || '';
  const db = b.sourceSessionDate || '';
  if (da !== db) {
    if (!da) return -1;
    if (!db) return 1;
    return da < db ? -1 : 1;
  }
  const oa = a.observedAt ?? 0;
  const ob = b.observedAt ?? 0;
  if (oa && ob && oa !== ob) return oa < ob ? -1 : 1;
  return 0;
}

/** 이 기간 안의 «더 옛 원천» 응답은 이미 받은 새 원천을 덮지 못한다(세션 전환 중 응답 역전). 그보다 오래 붙잡지는 않는다 — 원천 정정이 영영 막히지 않게 */
export const REVERSAL_HOLD_MS = 10 * 60_000;

/**
 * 응답 역전 방지 — prev 를 이미 그렸고 next 가 새로 왔다. next 를 쓸지.
 *   · next 가 missing 이면 prev(값 있음)를 늘 남긴다 — 값 있는 직전본(제 날짜를 단 채)이 «—»보다 먼저다
 *   · next 의 원천 날짜가 prev 보다 앞이면 쓰지 않는다
 *   · 같은 날·둘 다 관측 시각이 있고 next 가 더 옛 관측이면(같은 근거끼리) 쓰지 않는다
 *   · eod(확정 종가)는 같은 날 live 를 늘 대신한다(마감 확정)
 */
export function preferNewer(prev: SourceStamp | null | undefined, next: SourceStamp, nowMs: number = Date.now()): boolean {
  if (!prev || prev.basis === 'missing') return true;
  // 값 없는 응답은 값 있는 직전본을 «절대» 지우지 않는다(대표 10/19 «라벨의 데이터가 비어 있으면 안 된다») —
  //   직전본은 제 원천 날짜를 달고 남는다(그 날짜가 지금 세션보다 앞이면 화면이 그 날짜로 말한다)
  if (next.basis === 'missing') return false;
  if (nowMs - prev.receivedAt > REVERSAL_HOLD_MS) return true;
  const dp = prev.sourceSessionDate;
  const dn = next.sourceSessionDate;
  if (dp && dn && dn < dp) return false;
  if (dp && !dn) return false;
  if (dp && dn && dn === dp) {
    if (next.basis === 'eod' && prev.basis !== 'eod') return true;
    if (prev.basis === 'eod' && next.basis === 'live') return false;
    if (prev.observedAt && next.observedAt && next.observedAt < prev.observedAt && prev.basis === next.basis) return false;
  }
  return true;
}

export interface StampSummary {
  /** 모든 행의 원천 날짜가 같을 때만 그 날짜 — 다르면 null(최대 날짜로 대표하지 않는다) */
  sourceSessionDate: string | null;
  minDate: string | null;
  maxDate: string | null;
  /** 날짜가 둘 이상 섞였다 */
  mixed: boolean;
  /** 가장 많은 행이 속한 날짜(동수면 더 앞 날짜 — 보수적으로) */
  modeDate: string | null;
  /** 날짜가 있는 행 수 · 날짜 없는 행 수 */
  dated: number;
  undated: number;
}

/** 여러 행의 스탬프(또는 날짜)를 요약 — 혼합을 숨기지 않는다 */
export function summarizeStamps(items: ReadonlyArray<SourceStamp | string | null | undefined>): StampSummary {
  const counts = new Map<string, number>();
  let undated = 0;
  for (const it of items) {
    const d = typeof it === 'string' ? asSessionDate(it) : it ? it.sourceSessionDate : null;
    if (!d) { undated += 1; continue; }
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  const dates = [...counts.keys()].sort();
  let modeDate: string | null = null;
  let best = 0;
  for (const d of dates) {
    const c = counts.get(d)!;
    if (c > best) { best = c; modeDate = d; }   // 오름차순이라 동수면 앞 날짜가 남는다
  }
  return {
    sourceSessionDate: dates.length === 1 ? dates[0] : null,
    minDate: dates[0] ?? null,
    maxDate: dates[dates.length - 1] ?? null,
    mixed: dates.length > 1,
    modeDate,
    dated: items.length - undated,
    undated,
  };
}

// ── 가격 허브(WS) 틱의 나이 ───────────────────────────────────────────────

/** 체결 시각을 모르는 틱은 받은 지 이만큼 지나면 «지금 값»으로 쓰지 않는다(시세 요청 값으로 돌아간다) */
export const WS_TICK_MAX_IDLE_MS = 10 * 60_000;

export interface WsTickTimes {
  /** 원천 체결 시각(ms) — 모르면 0/null */
  priceTime?: number | null;
  /** 브라우저가 받은 시각(ms) */
  receivedAt?: number | null;
}

/**
 * 이 틱이 «지금 세션의 최신 관측»일 수 있나 — 가격 근접성과 «별개로» 나이를 본다.
 *   · 체결 시각이 있으면: 오늘(ET)이어야 하고 지금 세션 구간 안이어야 한다(프리 04:00~ · 정규장 09:30~ · 애프터 정규장 마감~),
 *     시세 요청이 이미 더 늦은 체결을 봤으면(restObservedAt) 그 틱은 묵은 것이다.
 *   · 체결 시각과 상관없이: 받은 지 WS_TICK_MAX_IDLE_MS 넘은 틱은 쓰지 않는다(앱이 뒤로 갔다 온 뒤 메모리에 남은 틱).
 *   session 이 열린 세션이 아니면 false.
 */
export function wsTickFresh(tick: WsTickTimes | null | undefined, session: string | null | undefined, nowMs: number, restObservedAt?: number | null): boolean {
  if (!tick) return false;
  const s = String(session || '').toLowerCase();
  const kind = s === 'regular' || s === 'reg' || s === 'open' ? 'reg' : s === 'pre' ? 'pre' : s === 'post' ? 'post' : null;
  if (!kind) return false;
  // 받은 시각은 브라우저 ms 시계값만 믿는다(1e12 = 2001년 — 그보다 작으면 시각이 아니다).
  //   체결 시각이 오늘·세션 안이어도 «받은 지 오래된» 틱(앱이 뒤로 갔다 온 뒤 메모리에 남은 틱)은 지금 값이 아니다 — 체결 시각 유무와 상관없이 본다(관문 1차 P1)
  const ra = typeof tick.receivedAt === 'number' && Number.isFinite(tick.receivedAt) && tick.receivedAt > 1e12 ? tick.receivedAt : null;
  if (ra && nowMs - ra > WS_TICK_MAX_IDLE_MS) return false;
  const pt = asEpochMs(tick.priceTime);
  if (pt) {
    const today = etDateOf(nowMs);
    if (isNonTradingDay(today) || etDateOf(pt) !== today || pt > nowMs + 1_000) return false;
    const m = etMinutesOf(pt);
    const start = kind === 'pre' ? 240 : kind === 'reg' ? 570 : sessionCloseMinutes(today);
    const end = kind === 'pre' ? 570 : kind === 'reg' ? sessionCloseMinutes(today) : 1200;
    const closingSecond = pt % 60_000 < 1_000;
    if (m < start || m > end || (m === end && !(kind === 'reg' && closingSecond))) return false;
    if (kind === 'post' && m === start && closingSecond) return false;
    const ro = asEpochMs(restObservedAt);
    if (ro && pt + 1_000 < ro) return false;
    return true;
  }
  // 체결 시각도 받은 시각도 모르면 나이를 판정할 근거가 없다 → 예전 규칙(가격 기준)에 맡긴다(운영 틱은 늘 받은 시각이 있다)
  return true;
}

// ── 화면의 기존 «시각» 표식을 원천 시각으로 채운다(새 표식을 만들지 않는다) ─────────────────────

const ET_SHORT = (ms: number): string =>
  new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * Flow·Command 머리의 «M/D, HH:MM ET» 칸 — 예전엔 조회 시계(new Date())였다(F01·C01·X02: 일요일에 «10/19 08:40 ET»가 금요일 종가 옆에 섰다).
 *   ① 메인 가격이 정규장 종가(eod·last-session)이고 원천 날짜가 있으면 그날 정규장 마감 시각(조기 폐장 13:00 포함)
 *   ② 지금 세션 관측값(live·proxy)에 관측 시각이 있으면 그 시각
 *   ③ 서버가 준 원천 시각 asOfET('MM/DD/YYYY, HH:MM' — lib/quoteBasis priceAsOfET)
 *   ④ 아무 원천도 없으면 null — 호출자가 예전 표시(조회 시계)를 유지한다(칸을 비우지 않는다)
 *   같은 모양(«10/17, 16:00 ET»)이라 라벨은 그대로다.
 */
export function stampTimeLabelET(stamp: SourceStamp | null | undefined, asOfET: string | null | undefined): string | null {
  const d = stamp?.sourceSessionDate;
  // 지난 세션 «장중» 체결(관측 시각 있음 — 예: 전 거래일 11:00 체결)은 마감 시각이 아니라 그 체결 시각(관문 1차 P2)
  if (stamp && stamp.basis === 'last-session' && stamp.observedAt) return `${ET_SHORT(stamp.observedAt)} ET`;
  // 메인 가격이 정규장 종가(eod·관측 시각 없는 last-session)면 그날 정규장 마감 시각 — 시간외 체결 시각을 메인 가격 옆에 두지 않는다
  if (d && (stamp!.basis === 'eod' || stamp!.basis === 'last-session')) {
    const mins = sessionCloseMinutes(d);
    return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}, ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} ET`;
  }
  if (stamp && (stamp.basis === 'live' || stamp.basis === 'proxy') && stamp.observedAt) return `${ET_SHORT(stamp.observedAt)} ET`;
  const m = typeof asOfET === 'string' ? /^(\d{2})\/(\d{2})\/\d{4},\s*(\d{2}):(\d{2})/.exec(asOfET) : null;
  if (m) return `${Number(m[1])}/${Number(m[2])}, ${m[3] === '24' ? '00' : m[3]}:${m[4]} ET`;
  return null;
}
