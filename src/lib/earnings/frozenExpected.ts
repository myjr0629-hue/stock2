// ============================================================================
// «발표 전 예상 변동폭» 고정값 — 순수 규칙 (2026-11-18)
//
// 왜: NVDA 11/17 장후 발표. 같은 «발표 전 예상»이 시각마다 달랐다 — 장 마감 뒤 캘린더 ±8.6%(16:4x ET) · 발표 알림 ±8.4%(15:4x ET 마감 전 뜨기 고정)
//   · 앱 화면 ±8.2%(17:30 ET, 마감 호가 다시 읽기) · 다음 날엔 채점표(마감 관측 기록)의 또 다른 값. 화면들이 «계속 다시 만드는 묶음 칸»
//   (earnings:implied:v1)을 발표 뒤까지 읽었고, 발표 알림이 이미 고정한 값을 아무 화면도 읽지 않았다.
//
// 규칙: 그 발표의 «기준 세션»(장후 = 발표일 · 장전 = 직전 거래일) 정규장 마감 시각(고정 시각)이 지나면 모든 화면이 같은 고정값 하나를 보인다.
//   고정 전에는 지금처럼 실시간 값. 고정값의 우선순위(서비스 services/frozenExpectedService 가 읽는다):
//     ① 고정 기록 earnings:expected:frozen:v1:{T}:{D} — 발표 알림 뜨기·고정(src flash)이나 마감 직전 묶음 칸(src pack)을 한 번 적어 둔 것
//     ② 발표 알림의 고정 이벤트·뜨기 값(Upstash push:sig:flash:ev/exp — 수명 3~5일) — ①이 없거나 pack 일 때
//     ③ 실적 반응 기록(earnings:actuals)의 expected — 기준 세션 마감 관측
//     ④ 묶음 칸 중 «발표 전 세션» 값만(발표 뒤 호가는 절대 아님) — 적어 두지 않는다(표시 전용)
//   ①②③이 없고 ④도 발표 전이라 단정할 수 없으면 값 없음(지어내지 않는다).
// 이 파일은 네트워크·캐시 없이 입력만으로 답한다(시험: tests/frozenExpected.test.ts).
// ============================================================================

import { etWallToMs } from '@/lib/earningsWeek';
import { etDateOf, sessionCloseMinutes } from '@/lib/marketCalendar';
import { parseRecord, reactionSessions } from './earningsActuals';
import { expiryMethod, type EarningsMoveMethod } from './eventMove';
import { impliedRowKey, type ImpliedCell, type ImpliedPack, type RowImplied } from './earningsImplied';

export const FROZEN_EXPECTED_PREFIX = 'earnings:expected:frozen:v1';
export const frozenExpectedKey = (ticker: string, date: string): string => `${FROZEN_EXPECTED_PREFIX}:${String(ticker).toUpperCase()}:${String(date).slice(0, 10)}`;
/**
 * 마감 직전 묶음 칸(src pack) 전용 키 — 알림 값(위 키)과 따로 둔다. 같은 키에 «없으면 쓰기»를 하면 읽기와 쓰기 사이에
 *   알림 크론이 적은 값을 덮을 수 있다(관문 11180824 ③). 읽기 우선순위: 알림 키 > Upstash 알림 > 이 키 > 실적 반응 기록 > 묶음 예비.
 */
export const FROZEN_PACK_PREFIX = 'earnings:expected:frozen-pack:v1';
export const frozenPackKey = (ticker: string, date: string): string => `${FROZEN_PACK_PREFIX}:${String(ticker).toUpperCase()}:${String(date).slice(0, 10)}`;
/** 고정 기록 수명 — 종목 페이지 채점 이력(기록은 TTL 없음)을 덮을 만큼 */
export const FROZEN_EXPECTED_TTL_SEC = 400 * 86400;
/** 마감 직전 묶음 칸을 고정값으로 적어 둘 때 그 묶음이 마감 전 이 시간 안에 만들어졌어야 한다 */
export const PACK_FREEZE_MAX_AGE_MS = 2 * 3600_000;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export type FrozenHour = 'amc' | 'bmo';
export interface FrozenEvent { ticker: string; date: string; hour?: string | null; etTime?: string | null }

export interface FrozenExpected {
  v: 1;
  ticker: string;
  date: string;
  hour: FrozenHour;
  /** 예상 변동폭(%, 소수 1자리) — 발표 알림·발표 전 캘린더와 같은 정의(impliedMovePct) */
  pct: number;
  expiry: string | null;
  /** 값의 세션(ET) — 기준 세션 이하 */
  session: string;
  basis: 'live' | 'eod' | null;
  method?: EarningsMoveMethod | null;
  /** flash = 발표 알림이 뜬/고정한 값 · pack = 마감 직전 묶음 칸 · actuals = 실적 반응 기록의 마감 관측 */
  src: 'flash' | 'pack' | 'actuals';
  /** 값이 관측된(뜬) 시각(ms) */
  capturedAt: number;
  /** 발표 알림이 «보낸» 숫자(고정 이벤트)에서 온 값 — 이것이 있으면 Upstash 를 다시 보지 않는다. 뜨기 값만이면 없음(뒤에 고정 이벤트로 올린다). */
  fixed?: true;
}

const hourOf = (h: string | null | undefined): FrozenHour | null => (h === 'amc' || h === 'bmo' ? h : null);

/** 고정 시각(ms) — 기준 세션 정규장 마감(조기 폐장 13:00 포함). 시각 미정·휴장일 발표는 null(고정하지 않는다 — 지금 규칙 그대로). */
export function freezeMsOf(date: string, hour: string | null | undefined): number | null {
  const h = hourOf(hour);
  if (!h || !YMD.test(String(date))) return null;
  const rs = reactionSessions(date, h);
  if (!rs) return null;
  return etWallToMs(rs.base, hhmm(sessionCloseMinutes(rs.base)));
}

/** 지금 고정값을 써야 하나 */
export function isFrozenTime(e: FrozenEvent, nowMs: number): boolean {
  const f = freezeMsOf(e.date, e.hour);
  return f != null && nowMs >= f;
}

export function baseSessionOfEvent(date: string, hour: string | null | undefined): string | null {
  const h = hourOf(hour);
  return h ? reactionSessions(date, h)?.base ?? null : null;
}

/** 만기 규칙 — 발표 «뒤» 첫 만기(장후는 발표일 만기 제외 · 장전은 발표일 만기 포함) */
function expiryOk(hour: FrozenHour, date: string, expiry: string | null | undefined): boolean {
  if (expiry == null) return true;
  if (!YMD.test(expiry)) return false;
  return hour === 'bmo' ? expiry >= date : expiry > date;
}

/** 저장본 → 고정값(모양·이벤트·세션·만기가 틀리면 null) */
export function parseFrozenExpected(raw: unknown, e: FrozenEvent): FrozenExpected | null {
  const s = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!s || typeof s !== 'object') return null;
  const x = s as Record<string, unknown>;
  const h = hourOf(e.hour);
  if (!h || x.v !== 1 || x.ticker !== String(e.ticker).toUpperCase() || x.date !== e.date || x.hour !== h) return null;
  if (x.src !== 'flash' && x.src !== 'pack' && x.src !== 'actuals') return null;
  return checkFrozen({
    v: 1, ticker: x.ticker as string, date: x.date as string, hour: h, pct: x.pct as number,
    expiry: typeof x.expiry === 'string' ? x.expiry : null, session: x.session as string,
    basis: x.basis === 'live' || x.basis === 'eod' ? x.basis : null,
    ...(x.method === 'weekly' || x.method === 'monthly' || x.method === 'event-split' ? { method: x.method } : {}),
    src: x.src, capturedAt: x.capturedAt as number, ...(x.fixed === true ? { fixed: true as const } : {}),
  });
}

/** 고정값 검사 — 양수 % · 세션 ≤ 기준 세션 · 발표 뒤 첫 만기 규칙 · 관측 시각 */
export function checkFrozen(f: FrozenExpected | null | undefined): FrozenExpected | null {
  if (!f || !(fin(f.pct) && f.pct > 0 && f.pct < 100) || !YMD.test(String(f.session)) || !fin(f.capturedAt) || f.capturedAt <= 0) return null;
  const base = baseSessionOfEvent(f.date, f.hour);
  if (!base || f.session > base || !expiryOk(f.hour, f.date, f.expiry)) return null;
  return f;
}

/** 실적 반응 기록의 expected → 고정값(기준 세션 마감 관측일 때만) */
export function frozenFromActuals(e: FrozenEvent, raw: unknown): FrozenExpected | null {
  const h = hourOf(e.hour);
  const r = parseRecord(raw);
  if (!h || !r || r.ticker !== String(e.ticker).toUpperCase() || r.date !== e.date || r.hour !== h || !r.expected) return null;
  const x = r.expected;
  if (x.session !== baseSessionOfEvent(e.date, h)) return null;
  return checkFrozen({
    v: 1, ticker: r.ticker, date: r.date, hour: h, pct: x.pct, expiry: x.expiry, session: x.session, basis: x.basis,
    ...(x.method !== undefined ? { method: x.method } : {}), src: 'actuals', capturedAt: x.capturedAt,
  });
}

/**
 * 마감 «직전» 묶음의 칸 → 고정값(src pack). 고정 시각 뒤 첫 묶음 갱신이 직전 묶음(고정 시각 전 2시간 안에 만든 것)을 넘겨 부른다.
 *   첫 만기 표식(f = e)·만기 규칙·값 세션 ≤ 기준 세션인 칸만.
 */
export function frozenFromPrevPack(e: FrozenEvent, prev: ImpliedPack | null | undefined): FrozenExpected | null {
  const h = hourOf(e.hour);
  const freeze = freezeMsOf(e.date, e.hour);
  if (!h || freeze == null || !prev || prev.v !== 1 || !prev.cells || !fin(prev.at)) return null;
  if (!(prev.at < freeze && freeze - prev.at <= PACK_FREEZE_MAX_AGE_MS)) return null;
  const c = prev.cells[impliedRowKey(e.ticker, e.date)];
  if (!c || !(fin(c.p) && c.p > 0) || !c.e || c.f !== c.e || !c.s) return null;
  if (c.e < etDateOf(prev.at)) return null;
  return checkFrozen({
    v: 1, ticker: String(e.ticker).toUpperCase(), date: e.date, hour: h, pct: c.p, expiry: c.e, session: c.s, basis: c.b ?? null,
    ...(c.method ? { method: c.method } : {}), src: 'pack', capturedAt: prev.at,
  });
}

/** 공지된 발표 시각이 그날 옵션 거래 끝(정규장 마감 + 15분) 이후인가 — 그러면 그날 호가는 전부 발표 전이다(종목 페이지와 같은 규칙). */
export function optionsClosedBeforeRelease(date: string, etTime: string | null | undefined): boolean {
  const close = etWallToMs(date, hhmm(sessionCloseMinutes(date)));
  const exact = etTime && /^\d{2}:\d{2}$/.test(etTime) ? etWallToMs(date, etTime) : null;
  return close != null && exact != null && exact >= close + 15 * 60_000;
}

/**
 * 표시 전용 마지막 예비 — 지금 묶음 칸이 «발표 전 세션»의 값일 때만(적어 두지 않는다).
 *   장전: 값 세션 < 발표일. 장후: 값 세션 < 발표일, 또는 발표일 세션이면서 ⓐ 공지 시각이 옵션 거래 끝 뒤(그날 호가 전부 발표 전)거나
 *   ⓑ 이 칸을 고정 시각(마감) 전에 만든 묶음에서 새로 읽은 값(이어 쓴 칸 k 아님). 그 밖은 null — 발표 뒤 값은 내지 않는다.
 */
export function frozenFromPackFallback(e: FrozenEvent, pack: ImpliedPack | null | undefined): FrozenExpected | null {
  const h = hourOf(e.hour);
  if (!h || !pack || pack.v !== 1 || !pack.cells) return null;
  const c: ImpliedCell | undefined = pack.cells[impliedRowKey(e.ticker, e.date)];
  if (!c || !(fin(c.p) && c.p > 0) || !c.e || c.f !== c.e || !c.s || !YMD.test(c.s)) return null;
  const freeze = freezeMsOf(e.date, h);
  const pre = c.s < e.date || (h === 'amc' && c.s === e.date
    && (optionsClosedBeforeRelease(e.date, e.etTime) || (c.k !== 1 && freeze != null && fin(pack.at) && pack.at < freeze)));
  if (!pre) return null;
  return checkFrozen({
    v: 1, ticker: String(e.ticker).toUpperCase(), date: e.date, hour: h, pct: c.p, expiry: c.e, session: c.s, basis: c.b ?? null,
    ...(c.method ? { method: c.method } : {}), src: 'pack', capturedAt: fin(pack.at) && pack.at > 0 ? pack.at : 1,
  });
}

/** 묶음 칸이 확인한 «발표 뒤 첫 만기»(f) — 값의 세션과 무관한 그 발표의 성질. 만기 규칙에 맞을 때만. */
export function packFirstExpiry(e: FrozenEvent, pack: ImpliedPack | null | undefined): string | null {
  const h = hourOf(e.hour);
  const c = h && pack && pack.v === 1 && pack.cells ? pack.cells[impliedRowKey(e.ticker, e.date)] : undefined;
  return h && c && typeof c.f === 'string' && YMD.test(c.f) && expiryOk(h, e.date, c.f) ? c.f : null;
}

/** 고정값 → 화면 칸(앱 캘린더 행 implied 와 같은 모양 + frozen 표식) */
export function rowImpliedFromFrozen(f: FrozenExpected): RowImplied & { frozen: true } {
  return {
    pct: f.pct, expiry: f.expiry ?? '', basis: f.basis, session: f.session,
    ...(f.method ? { method: f.method } : {}),
    ...(f.method === 'event-split' ? { eventMovePct: f.pct } : {}),
    frozen: true,
  };
}

/**
 * 채점용 실적 반응 기록에 고정값을 입힌다(원본은 건드리지 않고 사본).
 *   같은 정의일 때만 — 기록의 정의가 주간·월간 ATM(분리값 아님)이고 고정값도 분리값이 아니며, 세션·만기가 같은 때.
 *   (event-split 기록의 채점은 ATM 기준을 그대로 쓴다 — earningsActuals.atmReceiptExpectedPct)
 *   기록에 expected 가 아예 없으면(마감 관측 실패) 고정값으로 expected 를 만든다(만기를 알 때만 · 정의 = 만기 분류).
 */
/**
 * 고정값이 «ATM 스트래들 정의»임이 확실한가 — 정의가 주간·월간으로 적혀 있거나, 정의 표식이 없어도 만기가 주간(분리값은 월간 만기에서만 생긴다).
 *   정의를 모르는 월간 만기 값은 분리값일 수 있어 ATM 으로 쓰지 않는다(관문 11180824 ①).
 */
export function frozenIsAtm(f: FrozenExpected): boolean {
  if (f.method === 'weekly' || f.method === 'monthly') return true;
  if (f.method === 'event-split') return false;
  if (!!f.expiry && expiryMethod(f.expiry) === 'weekly') return true;
  // 발표 알림이 기준 세션 «마감 전»(15:30~16:00 ET)에 뜬 값 — 분리값은 마감 관측(EOD 체인)에서만 생기므로(eventMove.splitMonthlyEvent: basis eod)
  //   마감 전 관측은 ATM 스트래들 정의다(11/18 DIS: 알림 ±6.3 이 정의 표식 없이 적혀 채점표가 마감 관측 ±6.6 을 그대로 썼다).
  const freeze = freezeMsOf(f.date, f.hour);
  return f.src === 'flash' && freeze != null && fin(f.capturedAt) && f.capturedAt < freeze;
}

export function applyFrozenToRecord(raw: unknown, f: FrozenExpected | null | undefined): unknown {
  const r = parseRecord(raw);
  if (!r || !f || r.ticker !== f.ticker || r.date !== f.date || r.hour !== f.hour || !frozenIsAtm(f)) return raw;
  const src = raw as Record<string, any>;
  const e = r.expected;
  if (!e) {
    if (!f.expiry) return raw;
    return { ...src, expected: { pct: f.pct, method: f.method === 'weekly' || f.method === 'monthly' ? f.method : expiryMethod(f.expiry), straddlePct: f.pct, expiry: f.expiry, session: f.session, basis: f.basis,
      strike: null, straddle: null, spot: null, capturedAt: f.capturedAt, src: 'page', frozen: f.src } };
  }
  if (e.method !== 'weekly' && e.method !== 'monthly') return raw;
  // 같은 정의만 — 고정값 정의가 적혀 있으면 기록과 같아야 한다(월간 ATM 기록을 다른 정의 값으로 덮지 않는다)
  if (f.method && f.method !== e.method) return raw;
  if (e.session !== f.session || (f.expiry && e.expiry && f.expiry !== e.expiry)) return raw;
  if (e.pct === f.pct && (e.straddlePct === undefined || e.straddlePct === f.pct)) return raw;
  return { ...src, expected: { ...src.expected, pct: f.pct, straddlePct: f.pct, capturedAt: f.capturedAt, frozen: f.src } };
}
