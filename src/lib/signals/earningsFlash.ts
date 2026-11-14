// ============================================================================
// «실적 발표 직후» 알림(earnings_flash, 2026-11-14) — 내 종목이 실적을 발표하면 첫 판정 가능한 회차에 한 번:
//   «⚡ NVDA 실적 발표 · 옵션 예상 ±x% · 시간외 y% (잠정 · 범위 안/밖)»
//
// 기존 «실적 결과 알림»(earningsResult.ts — 다음 날 종가 대 종가 확정 반응, 전용 스위치 기본 dry)과 다른 것:
//   이것은 «발표 직후의 잠정 반응»이다. 장후(amc) = 발표일 정규장 종가 → 시간외 체결(Intrinio · 15분 지연 피드 · FMP 쓰지 않음),
//   장전(bmo) = 직전 정규장 종가 → 발표일 정규장 첫 30분 뒤(10:00 ET 이후 체결). 숫자는 처음 판정한 회차의 값으로 «고정»한다
//   (이벤트 ID = 종목+발표일 · 늦게 받는 기기도 같은 숫자).
//
// 예상 ±x% = 발표 «전» 마지막 정규장의 옵션 반영 변동폭 — 이 단계가 기준 세션 마감 전 30분(15:30~16:00 ET) 회차에 스스로 떠 둔다
//   (capture — 실적 D-1 알림·실적 캘린더와 같은 읽기 readImpliedMoveRows · 저장본만, 공급사 호출 0). 떠 둔 값이 없으면 실적 반응 기록
//   (earnings:actuals 의 expected — 기준 세션 EOD 관측)을 쓴다. 둘 다 없으면 보내지 않는다(지어내지 않는다).
//
// 규칙(기존 «내 종목 이상 신호»와 같은 것): 기기 = 푸시 토큰 레코드의 내 종목 · 마스터 알림·«내 종목 신호» 설정·시스템 권한(deviceFromRecord) ·
//   기기 언어 · 조용한 시간(현지 23~07시는 소리 없이) · 모닝/마감 푸시 겹침 금지 창(inPushBlackout).
// 따로 두는 것: 하루 상한·장부·쿨다운·모드·잠금 키는 전부 push:sig:flash:* — 무료 신호(push:sig:cap 등)를 읽지도 쓰지도 않는다.
// 중복 0 우선: 기기×종목×발표일 장부를 «보내기 전에» 원자적으로(SET NX) 잡고, 한 번 시도한 발송은 결과와 무관하게 다시 보내지 않는다.
// 문구: 숫자·사실(범위 안/밖)만 — 방향 예측·평가 없음. 탭 = 그 종목 Command(/app-view/cmd?t=…, 실적 캘린더 행과 같은 경로).
// 순수 흐름(의존성 주입) — 운영 배선은 services/earningsFlashService.ts · 시험 tests/earningsFlash.test.ts
// ============================================================================
import { etDateOf, etMinutesOf, sessionCloseMinutes, prevTradingDate, isNonTradingDay } from '@/lib/marketCalendar';
import { etWallToMs } from '@/lib/earningsWeek';
import { parseRecord, signedPctText } from '@/lib/earnings/earningsActuals';
import { RECEIPT_COPY } from '@/lib/earnings/earningsReceiptsCopy';
import type { ConfirmedEarnings } from '@/lib/earningsConfirmed';
import { deviceFromRecord, inPushBlackout, inQuietHours, SIG_KEYS } from './plan';
import { SIG_ICON } from './copy';
import type { Loc, SignalDevice } from './types';
import type { SendItem, SendOutcome, SigKv, SigMode, SigSender, SigStore } from './run';

// ── 설정 ─────────────────────────────────────────────────────────────────────
export const FLASH_CFG = {
  /** 이 알림만의 기기 하루 상한(ET 날짜) — 무료 신호 상한(push:sig:cap)과 따로 */
  deviceDailyCap: 3,
  /** 한 회차에 한 기기에 보내는 최대 수 */
  perRunPerDevice: 2,
  /** 기기×종목×발표일 장부 수명 */
  sentTtlSec: 30 * 86400,
  /** 같은 기기·같은 종목 재발송 금지 창(발표일이 고쳐져도 5일 안엔 다시 안 보낸다) */
  cooldownSec: 5 * 86400,
  /** 떠 둔 예상값·고정한 이벤트 값의 수명 */
  expTtlSec: 5 * 86400,
  evTtlSec: 3 * 86400,
  /** 발표 시각 뒤 이만큼 지난 체결부터 «발표 뒤 가격»으로 본다(시간외 지연 피드 — 발표 직전 체결을 반응으로 오인하지 않게) */
  postReleaseLagMs: 10 * 60_000,
  /** 장후: 시간외 거래가 끝나는 20:00 ET 전까지만 판정한다 */
  amcEndEt: '20:00',
  /** 장전: 정규장 첫 30분 뒤(10:00 ET)부터 11:30 ET 까지 */
  bmoStartEt: '10:00',
  bmoEndEt: '11:30',
  /** 예상값 뜨기 — 기준 세션 마감 전 이 시간(분)부터 마감까지 */
  captureLeadMin: 30,
  /** 떠 둘 관측이 이보다 오래됐으면 «지금 화면 값»이 아니다 */
  captureMaxAgeMs: 90 * 60_000,
  /**
   * 한 회차에 시세를 새로 읽는 종목 수(공급사 호출 상한) · 종목당 최대 실호출 · 하루 실호출 상한.
   * getTickerSnapshot 한 번 = 기본 실시간(재시도 포함 ≤2) + 일봉(≤2) + 정규장 실시간 덧입힘 또는 시간외 SIP 잇기(≤2) = 최대 6(관문 11140728 #3)
   */
  maxQuotesPerRun: 6,
  vendorCallsPerQuote: 6,
  vendorPerDay: 400,
  /** 한 회차에 예상값을 뜨는 종목 수(저장본 읽기 상한 — 구조 판본이 종목당 수십 KB) */
  maxCapturesPerRun: 12,
  /**
   * 뜨기 실패 종목의 «마지막 시도» 대기(관문 밤 검토 11/15) — 이 안에 시도했던(못 뜬) 발표는 다음 회차에 아직 시도 안 한 발표 뒤로 간다.
   * 회차 간격(15분)보다 길어야 바로 앞 회차 실패가 다음 회차 선두를 다시 차지하지 않는다 · 자리가 남으면 그대로 재시도한다(버리지 않음)
   */
  captureRetryBackoffMs: 20 * 60_000,
  /** 마지막 시도 기록 수명(짧게 — 뜨기 창은 마감 전 30분) */
  captureTryTtlSec: 6 * 3600,
  /** 이 안에 결과가 나오는 발표는 뜨기 순서에서 먼저(같은 대기 구간 안에서) */
  captureImminentMs: 24 * 3600_000,
  /** 한 번의 발표 반응으로 이보다 큰 등락(%)은 틱 오류로 본다 */
  maxPlausibleMovePct: 50,
} as const;

export const FLASH_KEYS = {
  /** 'off' | 'dry' | 'live' — 없으면 live(EARNINGS_FLASH_MODE 가 우선). 무료 신호 스위치(push:sig:mode)의 off 도 따른다 */
  mode: 'push:sig:flash:mode',
  lock: 'push:sig:flash:lock',
  exp: (t: string, d: string) => `push:sig:flash:exp:${t}:${d}`,
  /** 예상값 뜨기 마지막 시도 시각(못 뜬 발표만 · TTL captureTryTtlSec) — 실패 종목이 회차마다 선두를 차지하지 않게 */
  capTry: (t: string, d: string) => `push:sig:flash:try:${t}:${d}`,
  ev: (t: string, d: string) => `push:sig:flash:ev:${t}:${d}`,
  sent: (dev: string, t: string, d: string) => `push:sig:flash:s:${dev}:${t}:${d}`,
  cool: (dev: string, t: string) => `push:sig:flash:c:${dev}:${t}`,
  cap: (etDate: string, dev: string) => `push:sig:flash:cap:${etDate}:${dev}`,
  vendorDay: (etDate: string) => `push:sig:flash:vd:${etDate}`,
} as const;

export const FLASH_KV = {
  last: 'wlsig:flash:last',
  stats: (etDate: string) => `push:stats:flash:${etDate}`,
} as const;

export const FLASH_EVENT = 'earnings_flash';
/** 퍼널 출처 — 실적 D-1 과 같은 닫힌 목록 값(funnelSchema 추가 없이) */
export const FLASH_FUNNEL_SRC = 'push_sig_earn';

// ── 모양 ─────────────────────────────────────────────────────────────────────
export type FlashHour = 'amc' | 'bmo';
export interface FlashEntry {
  ticker: string; date: string; hour: FlashHour;
  /** 공지된 결과 공개 시각(ET) */
  etTime: string | null;
  /** 공지된 실적 통화 시각(ET) — 결과 공개 시각이 없을 때 «이 시각엔 이미 발표됐다»는 보수적 하한으로만 쓴다(통화는 결과 공개 뒤에 열린다) */
  callEtTime?: string | null;
}

/** 떠 둔 예상값 */
export interface ExpectedSnap { pct: number; expiry: string | null; session: string; asOf: number; capturedAt: number; src: 'snap' | 'actuals' }

/** 읽은 시세(공급사 스냅숏에서 필요한 것만) */
export interface FlashQuote {
  session: string;
  /** 「본장」 날짜(ET) — 그 값이 어느 정규장 것인지 */
  regularDate: string;
  regularClose: number | null;
  prevClose: number | null;
  regularTradeMs: number | null;
  extendedPrice: number | null;
  extendedTradeMs: number | null;
  /** 실시간을 못 받아 «마지막 정상값»으로 답했는가 */
  stale: boolean;
}

/** 고정한 이벤트 값 — 처음 판정한 회차의 숫자. 늦게 받는 기기도 이 숫자 */
export interface FlashEvent {
  v: 1; ticker: string; date: string; hour: FlashHour;
  expectedPct: number; expectedSrc: ExpectedSnap['src'];
  movePct: number; base: number; price: number; priceAtMs: number; decidedAt: number;
}

// ── 순수 규칙 ─────────────────────────────────────────────────────────────────
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function flashEntries(list: readonly ConfirmedEarnings[]): FlashEntry[] {
  const seen = new Set<string>();
  const out: FlashEntry[] = [];
  for (const c of list) {
    if ((c.hour !== 'amc' && c.hour !== 'bmo') || !YMD.test(c.date)) continue;
    const ticker = c.ticker.toUpperCase();
    const k = `${ticker}|${c.date}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const hm = (v: string | undefined) => (v && /^\d{2}:\d{2}$/.test(v) ? v : null);
    out.push({ ticker, date: c.date, hour: c.hour, etTime: hm(c.etTime), callEtTime: hm(c.callEtTime) });
  }
  return out;
}

/** 예상값의 기준 세션 — 장후 = 발표일 · 장전 = 직전 거래일 */
export function baseSessionOf(e: FlashEntry): string {
  return e.hour === 'amc' ? e.date : prevTradingDate(e.date);
}

/**
 * 장후 «이 시각엔 결과가 이미 나와 있다»(ms) — 공지된 결과 공개 시각, 없으면 공지된 통화 시각(결과 공개 뒤에 열린다 — 보수적 하한).
 * 둘 다 모르면 null — 판정하지 않는다(마감 시각으로 가정하면 16:30 발표 종목의 발표 «전» 체결을 반응으로 보낼 수 있다, 관문 11140728 #1).
 * 정규장 마감 전 시각이 적혀 있으면(장후가 아니다) 마감 시각으로 올린다.
 */
export function amcReleaseMs(e: FlashEntry): number | null {
  if (e.hour !== 'amc' || isNonTradingDay(e.date)) return null;
  const at = e.etTime ?? e.callEtTime ?? null;
  if (!at) return null;
  const close = etWallToMs(e.date, hhmm(sessionCloseMinutes(e.date)));
  const r = etWallToMs(e.date, at);
  if (r == null || close == null) return null;
  return Math.max(r, close);
}

/** 예상값을 «발표 전»으로 받는 마지막 시각 — 장후는 결과 공개 시각을 모르면 정규장 마감(뜨기 창은 어차피 마감 전) */
function amcSnapDeadline(e: FlashEntry): number | null {
  if (e.hour !== 'amc' || isNonTradingDay(e.date)) return null;
  const close = etWallToMs(e.date, hhmm(sessionCloseMinutes(e.date)));
  if (close == null) return null;
  const r = e.etTime ? etWallToMs(e.date, e.etTime) : null;
  return r != null ? Math.min(Math.max(r, close), close + 4 * 3600_000) : close;
}

/** 결과가 나오는 (대략의) 시각 — 뜨기 순서의 «발표 임박» 판단용(판정에는 쓰지 않는다) · 장후 시각 미공지는 null(판정 불가) */
export function releaseApproxMs(e: FlashEntry): number | null {
  if (e.hour === 'amc') return amcReleaseMs(e);
  return isNonTradingDay(e.date) ? null : etWallToMs(e.date, e.etTime ?? '09:30');
}

/**
 * 한 회차에 뜰 발표 고르기(상한 maxCapturesPerRun) — 순서:
 *   ① 24시간 안 발표(오늘 장후·다음 거래일 장전 — 예비 예상값이 늦게 생겨 뜨기가 사실상 유일한 원천)
 *      ⓐ 아직 못 떴고 최근(captureRetryBackoffMs) 시도하지 않은 것 → ⓑ 최근 시도했다 못 뜬 것(시도 오래된 순 재시도)
 *   ② 그 밖의 발표(주말 건너 장전 등) — 같은 ⓐ → ⓑ
 *   ③ 지금 목록으로는 판정 창이 없는 발표(장후 결과·통화 시각 미공지 — 시각이 채워질 때를 위해 남는 자리에서만, 관문 11150355)
 *   ④ 이미 떠 둔 발표(남는 자리에서 새 값으로 갱신)
 *   같은 칸 안: 담은 기기 많은 순 → 오래 전 시도 먼저 → 발표 이른 순 → 종목명.
 * exp·tried 는 capAll 과 같은 순서의 저장값(없으면 null). 앞 12개가 계속 실패해도 13번째 이후가 다음 회차에 들어가고(밤 검토 11/15),
 * 임박 발표의 마지막 회차 재시도가 먼 발표에 밀리지 않는다(관문 11150352).
 */
export function pickCaptures(capAll: readonly FlashEntry[], exp: readonly unknown[], tried: readonly unknown[], holders: ReadonlyMap<string, number>, now: number): FlashEntry[] {
  const rows = capAll.map((e, i) => {
    const tRaw = Number(tried[i]);
    const lastTry = Number.isFinite(tRaw) && tRaw > 0 && tRaw <= now + 60_000 ? tRaw : 0;
    const rel = releaseApproxMs(e);
    return {
      e, have: exp[i] != null, lastTry, judgeable: flashWindow(e) != null,
      backoff: lastTry > 0 && now - lastTry < FLASH_CFG.captureRetryBackoffMs,
      imminent: rel != null && rel - now <= FLASH_CFG.captureImminentMs ? 0 : 1,
      rel: rel ?? Number.MAX_SAFE_INTEGER, h: holders.get(e.ticker) ?? 0,
    };
  });
  type R = (typeof rows)[number];
  const tie = (a: R, b: R) => b.h - a.h || a.lastTry - b.lastTry || a.rel - b.rel || a.e.ticker.localeCompare(b.e.ticker);
  const band = (r: R) => (r.have ? 6 : (r.judgeable ? r.imminent * 2 : 4) + (r.backoff ? 1 : 0));
  const sorted = [...rows].sort((a, b) => band(a) - band(b) || (a.backoff && b.backoff && !a.have ? a.lastTry - b.lastTry : 0) || tie(a, b));
  return sorted.slice(0, FLASH_CFG.maxCapturesPerRun).map((r) => r.e);
}

/** 판정 창 [시작, 끝) — 이 안의 회차만 시세를 본다 */
export function flashWindow(e: FlashEntry): { from: number; to: number; minTradeMs: number } | null {
  if (isNonTradingDay(e.date)) return null;
  if (e.hour === 'amc') {
    const r = amcReleaseMs(e);
    const end = etWallToMs(e.date, FLASH_CFG.amcEndEt);
    if (r == null || end == null) return null;
    const minTradeMs = r + FLASH_CFG.postReleaseLagMs;
    return { from: minTradeMs, to: end, minTradeMs };
  }
  const from = etWallToMs(e.date, FLASH_CFG.bmoStartEt), to = etWallToMs(e.date, FLASH_CFG.bmoEndEt);
  // 반일장(13:00 마감)이어도 11:30 은 정규장 안이다
  if (from == null || to == null) return null;
  return { from, to, minTradeMs: from };
}

/** 지금 판정 창 안인 발표 */
export function dueEntries(entries: readonly FlashEntry[], now: number): FlashEntry[] {
  return entries.filter((e) => { const w = flashWindow(e); return !!w && now >= w.from && now < w.to; });
}

/** 지금 예상값을 떠 둘 발표 — 기준 세션이 오늘이고 마감 전 30분 안 · 장후는 발표 전 */
export function captureEntries(entries: readonly FlashEntry[], now: number): FlashEntry[] {
  const today = etDateOf(now);
  if (isNonTradingDay(today)) return [];
  const m = etMinutesOf(now), close = sessionCloseMinutes(today);
  if (m < close - FLASH_CFG.captureLeadMin || m >= close) return [];
  return entries.filter((e) => {
    if (baseSessionOf(e) !== today) return false;
    if (e.hour === 'amc') { const r = amcSnapDeadline(e); if (r == null || now >= r) return false; }
    return true;
  });
}

/** 만기 규칙 — 발표 «뒤» 첫 만기(장후는 발표일 만기 제외 · 장전은 발표일 만기 포함) */
function expiryOk(e: FlashEntry, expiry: string | null | undefined): boolean {
  if (!expiry || !YMD.test(expiry)) return false;
  return e.hour === 'bmo' ? expiry >= e.date : expiry > e.date;
}

export interface ImpliedRowLike { impliedMovePct: number | null; expiry: string | null; asOf: number | null; session: string | null; basis: string | null }

/** 화면 읽기(readImpliedMoveRows)의 한 줄 → 떠 둘 값(아니면 이유) */
export function snapFromImplied(e: FlashEntry, row: ImpliedRowLike | null | undefined, now: number): { ok: true; snap: ExpectedSnap } | { ok: false; reason: string } {
  if (!row || !(fin(row.impliedMovePct) && row.impliedMovePct > 0)) return { ok: false, reason: 'no_implied' };
  if (row.session !== baseSessionOf(e)) return { ok: false, reason: `session_${row.session ?? 'none'}` };
  if (row.basis !== 'live' && row.basis !== 'eod') return { ok: false, reason: `basis_${row.basis ?? 'none'}` };
  if (!expiryOk(e, row.expiry)) return { ok: false, reason: `expiry_${row.expiry ?? 'none'}` };
  if (!fin(row.asOf) || row.asOf > now + 60_000 || now - row.asOf > FLASH_CFG.captureMaxAgeMs) return { ok: false, reason: 'stale_implied' };
  return { ok: true, snap: { pct: Math.round(row.impliedMovePct * 10) / 10, expiry: row.expiry, session: row.session!, asOf: row.asOf, capturedAt: now, src: 'snap' } };
}

/** 저장된 떠 둔 값이 이 발표의 «발표 전» 값인가 */
export function snapUsable(e: FlashEntry, raw: unknown): ExpectedSnap | null {
  const s = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!s || typeof s !== 'object') return null;
  const x = s as Record<string, unknown>;
  if (!(fin(x.pct) && x.pct > 0) || x.session !== baseSessionOf(e) || !fin(x.asOf) || !fin(x.capturedAt)) return null;
  if (!expiryOk(e, x.expiry as string | null)) return null;
  // 장후는 발표 전에 뜬 값만(관측·뜬 시각 모두)
  const r = amcSnapDeadline(e);
  if (e.hour === 'amc' && (r == null || x.asOf >= r || x.capturedAt >= r)) return null;
  // 장전은 기준 세션(전 거래일) 마감 뒤에 뜬 값이 아니어야 한다(뜨기 창이 마감 전)
  if (e.hour === 'bmo') {
    const close = etWallToMs(baseSessionOf(e), hhmm(sessionCloseMinutes(baseSessionOf(e))));
    if (close == null || x.capturedAt >= close + 60_000) return null;
  }
  return { pct: x.pct, expiry: x.expiry as string, session: x.session as string, asOf: x.asOf, capturedAt: x.capturedAt, src: 'snap' };
}

/**
 * 실적 반응 기록(earnings:actuals)의 expected — 기준 세션 EOD 관측. 숫자는 그 기록의 pct 그대로 — 뜨기 값과 같은 정의
 * (둘 다 impliedRowOf 의 impliedMovePct = 이벤트 분리값 우선 · 실적 D-1 알림·캘린더 표시와 같다, 관문 11140728 #2).
 * 영수증·채점표의 ATM 값(atmReceiptExpectedPct)으로 바꾸지 않는다 — 뜨기 성공 여부에 따라 예상 폭·범위 판정이 달라지지 않게.
 */
export function snapFromActuals(e: FlashEntry, raw: unknown): ExpectedSnap | null {
  const r = parseRecord(raw);
  if (!r || r.ticker !== e.ticker || r.date !== e.date || r.hour !== e.hour || !r.expected) return null;
  const x = r.expected;
  if (x.session !== baseSessionOf(e) || x.basis !== 'eod' || !expiryOk(e, x.expiry)) return null;
  if (!(fin(x.pct) && x.pct > 0)) return null;
  const pct = Math.round(x.pct * 10) / 10;
  return { pct, expiry: x.expiry, session: x.session, asOf: x.capturedAt, capturedAt: x.capturedAt, src: 'actuals' };
}

/** 시세 → 발표 뒤 잠정 반응(아니면 이유) */
export function judgeMove(e: FlashEntry, q: FlashQuote | null, now: number): { ok: true; pct: number; base: number; price: number; atMs: number } | { ok: false; reason: string } {
  if (!q) return { ok: false, reason: 'no_quote' };
  if (q.stale) return { ok: false, reason: 'quote_stale' };
  const w = flashWindow(e);
  if (!w) return { ok: false, reason: 'no_window' };
  if (q.regularDate !== e.date) return { ok: false, reason: `regular_${q.regularDate || 'none'}` };
  let base: number | null, price: number | null, at: number | null;
  if (e.hour === 'amc') {
    // 반일장(13:00 마감)은 17:00 ET 에 시세 세션이 CLOSED 로 바뀐다 — 창(20:00 ET 까지)·체결 시각 검사가 따로 있으므로 CLOSED 도 받는다(관문 11140731 #2)
    if (q.session !== 'POST' && q.session !== 'CLOSED') return { ok: false, reason: `session_${q.session}` };
    base = q.regularClose; price = q.extendedPrice; at = q.extendedTradeMs;
  } else {
    if (q.session !== 'REG') return { ok: false, reason: `session_${q.session}` };
    base = q.prevClose; price = q.regularClose; at = q.regularTradeMs;
  }
  if (!(fin(base) && base > 0 && fin(price) && price > 0)) return { ok: false, reason: 'no_price' };
  if (!fin(at) || at < w.minTradeMs) return { ok: false, reason: 'no_trade_after_release' };
  if (at > now + 60_000) return { ok: false, reason: 'future_trade' };
  const pct = Math.round((price / base - 1) * 1e6) / 1e4;
  if (Math.abs(pct) > FLASH_CFG.maxPlausibleMovePct) return { ok: false, reason: 'implausible' };
  return { ok: true, pct, base, price, atMs: at };
}

const posNum = (v: unknown): number | null => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };
const toMs = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** getTickerSnapshot 응답 → 판정에 필요한 것만 */
export function quoteFromSnapshot(snap: any): FlashQuote | null {
  const t = snap?.ticker;
  const i = t?._intrinio;
  if (snap?.status !== 'OK' || !t || !i) return null;
  const lastNs = Number(t?.lastTrade?.t);
  const lastMs = Number.isFinite(lastNs) && lastNs > 0 ? Math.round(lastNs / 1e6) : null;
  return {
    session: String(i.session || ''),
    regularDate: String(i.regularDate || ''),
    regularClose: posNum(i.regularClose),
    prevClose: posNum(i.prevClose),
    regularTradeMs: toMs(i.regularLastTime),
    extendedPrice: i.hasExtendedTrade ? posNum(i.extendedPrice) : null,
    // 시간외 체결이 있을 때 마지막 체결 시각 = 그 시간외 체결의 시각(lastTrade.t)
    extendedTradeMs: i.hasExtendedTrade ? lastMs : null,
    stale: t._rtStale === true,
  };
}

/** 화면에 보이는 소수 1자리로 «범위 밖»을 정한다(보이는 숫자끼리 모순이 없게) */
export function flashBeyond(expectedPct: number, movePct: number): boolean {
  return Math.round(Math.abs(movePct) * 10 + 1e-9) > Math.round(expectedPct * 10 + 1e-9);
}

/** 문구 — 숫자·사실만(방향 예측·평가 없음) */
export function flashCopy(ev: Pick<FlashEvent, 'ticker' | 'hour' | 'expectedPct' | 'movePct'>, loc: Loc): { title: string; body: string } {
  const exp = `±${ev.expectedPct.toFixed(1)}%`;
  const mv = signedPctText(ev.movePct);
  const beyond = flashBeyond(ev.expectedPct, ev.movePct);
  const range = beyond ? RECEIPT_COPY[loc].outside : RECEIPT_COPY[loc].within;
  if (loc === 'ko') {
    return { title: `${SIG_ICON} ${ev.ticker} 실적 발표`, body: `옵션 예상 ${exp} · ${ev.hour === 'amc' ? '시간외' : '장 초반'} ${mv} (잠정 · ${range})` };
  }
  if (loc === 'ja') {
    return { title: `${SIG_ICON} ${ev.ticker} 決算発表`, body: `想定変動幅 ${exp} · ${ev.hour === 'amc' ? '時間外' : '寄り付き後'} ${mv}（暫定・${range}）` };
  }
  return { title: `${SIG_ICON} ${ev.ticker} earnings out`, body: `Implied ${exp} · ${ev.hour === 'amc' ? 'after hours' : 'early trading'} ${mv} (provisional · ${range.toLowerCase()})` };
}

/** 탭 목적지 — 그 종목 Command(실적 캘린더 행과 같은 경로 · lib/app/signalTap 닫힌 목록) */
export function flashPath(ticker: string): string {
  return `/app-view/cmd?t=${ticker}`;
}

export function parseFlashEvent(raw: unknown): FlashEvent | null {
  const s = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!s || typeof s !== 'object') return null;
  const x = s as Record<string, unknown>;
  if (x.v !== 1 || typeof x.ticker !== 'string' || !YMD.test(String(x.date)) || (x.hour !== 'amc' && x.hour !== 'bmo')) return null;
  if (!(fin(x.expectedPct) && x.expectedPct > 0) || !fin(x.movePct) || !fin(x.base) || !fin(x.price) || !fin(x.priceAtMs) || !fin(x.decidedAt)) return null;
  return {
    v: 1, ticker: x.ticker, date: x.date as string, hour: x.hour, expectedPct: x.expectedPct, expectedSrc: x.expectedSrc === 'actuals' ? 'actuals' : 'snap',
    movePct: x.movePct, base: x.base, price: x.price, priceAtMs: x.priceAtMs, decidedAt: x.decidedAt,
  };
}

/** 모드 — 환경 off > Redis off > 무료 신호 스위치 off(비상 끄기) > 환경·Redis dry/live > 기본 live */
export function resolveFlashMode(env: SigMode | null | undefined, own: unknown, sigEnv: SigMode | null | undefined, sig: unknown): SigMode {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
  if (env === 'off' || s(own) === 'off' || sigEnv === 'off' || s(sig) === 'off') return 'off';
  if (env === 'dry' || env === 'live') return env;
  if (s(own) === 'dry' || s(own) === 'live') return s(own) as SigMode;
  return 'live';
}

export function flashEnvMode(env: Record<string, string | undefined> = process.env): SigMode | null {
  const v = (env.EARNINGS_FLASH_MODE || '').trim().toLowerCase();
  return v === 'off' || v === 'dry' || v === 'live' ? v : null;
}

// ── 실행기 ───────────────────────────────────────────────────────────────────
export interface FlashReaders {
  /** 화면과 같은 읽기(저장본만) — 종목별 옵션 반영 변동폭 */
  implied(entries: FlashEntry[], today: string): Promise<Map<string, ImpliedRowLike>>;
  /** earnings:actuals 기록 원본(키: «티커|발표일») */
  actuals(entries: FlashEntry[]): Promise<Map<string, unknown>>;
  /** 공급사 시세(Intrinio) — 실패는 null */
  quote(ticker: string, deadlineMs: number): Promise<FlashQuote | null>;
}
/** 하루 공급사 호출 원자 예약 — 잡은 수를 돌려준다 */
export type FlashReserve = (key: string, n: number, cap: number) => Promise<number>;

export interface FlashDeps {
  store: SigStore;
  kv: SigKv;
  readers: FlashReaders;
  sender: SigSender | null;
  reserve: FlashReserve | null;
  log?: (m: string) => void;
}
export interface FlashOpts {
  now: number;
  kind: 'cron' | 'preview';
  list: readonly ConfirmedEarnings[];
  envMode?: SigMode | null;
  signalEnvMode?: SigMode | null;
  /** 미리보기 — 가짜 기기 하나(실제 기기에 아직 종목이 없을 때 표본용) · only 면 실제 기기는 읽지 않는다 */
  sim?: { tickers: string[]; locale?: Loc; platform?: 'ios' | 'android'; tz?: string | null; only?: boolean } | null;
  /** 공급사 호출 마감(ms, Date.now 기준) */
  quoteDeadlineMs?: number;
  /** 시세 1회의 최대 실호출 수 — 운영 재시도 설정(INTRINIO_MAX_ATTEMPTS)에서 계산해 넘긴다(기본값보다 작게는 못 줄인다) */
  vendorCallsPerQuote?: number;
}
export interface FlashReport {
  status: 'off' | 'blackout' | 'locked' | 'idle' | 'no-devices' | 'ok';
  mode: SigMode;
  kind: FlashOpts['kind'];
  at: string;
  etDate: string;
  captured: string[];
  due: string[];
  events: Array<{ id: string; expected: number | null; move: number | null; frozen: boolean; reason?: string; recipients: number }>;
  vendor: { quotes: number; granted: number };
  devices: number;
  skipped: Array<{ key: string; reason: string }>;
  samples: Array<{ id: string; ko: { title: string; body: string }; en: { title: string; body: string }; ja: { title: string; body: string } }>;
  sent?: { items: number; ok: number; fail: number; dead: number; claimLost: number };
}

async function loadDevices(store: SigStore): Promise<SignalDevice[]> {
  const tokens = (await store.smembers('push:token_list')) || [];
  const out: SignalDevice[] = [];
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    const recs = await store.mget(chunk.map((t) => `push:tokens:${t}`));
    chunk.forEach((t, j) => { const d = deviceFromRecord(t, recs?.[j]); if (d) out.push(d); });
  }
  return out;
}

const idOf = (e: { ticker: string; date: string }) => `${e.ticker}|${e.date}`;

export async function runEarningsFlash(deps: FlashDeps, o: FlashOpts): Promise<FlashReport> {
  const { store, kv, readers } = deps;
  const log = deps.log ?? ((m: string) => console.log(m));
  const now = o.now;
  const preview = o.kind === 'preview';
  const etDate = etDateOf(now);
  const report: FlashReport = {
    status: 'ok', mode: resolveFlashMode(o.envMode, null, o.signalEnvMode, null), kind: o.kind, at: new Date(now).toISOString(), etDate,
    captured: [], due: [], events: [], vendor: { quotes: 0, granted: 0 }, devices: 0, skipped: [], samples: [],
  };
  // 할 일이 없는 회차(대부분)는 확인 목록(코드 안 상수)만 보고 끝난다 — 저장소·공급사 호출 0
  const entries = flashEntries(o.list);
  const toCapture = captureEntries(entries, now);
  const due = dueEntries(entries, now);
  report.due = due.map(idOf);
  if (!toCapture.length && !due.length) return { ...report, status: 'idle' };
  if (due.length && !toCapture.length && inPushBlackout(now)) return { ...report, status: 'blackout' };

  const [own, sig] = await Promise.all([store.get(FLASH_KEYS.mode).catch(() => null), store.get(SIG_KEYS.mode).catch(() => null)]);
  const mode = report.mode = resolveFlashMode(o.envMode, own, o.signalEnvMode, sig);
  if (mode === 'off') return { ...report, status: 'off' };
  const live = !preview && mode === 'live';

  let locked = false;
  if (!preview) {
    locked = await store.setNx(FLASH_KEYS.lock, String(now), 120).catch(() => false);
    if (!locked) return { ...report, status: 'locked' };
  }
  try {
    let devices: SignalDevice[] = o.sim?.only ? [] : await loadDevices(store);
    if (o.sim) devices = [...devices, { token: 'SIMULATED', dev: 'sim000000000', platform: o.sim.platform ?? 'ios', locale: o.sim.locale ?? 'ko', tickers: o.sim.tickers, tz: o.sim.tz ?? 'Asia/Seoul' }];
    report.devices = devices.length;
    const holders = new Map<string, number>();
    for (const d of devices) for (const t of d.tickers) holders.set(t, (holders.get(t) ?? 0) + 1);
    const byHolders = (a: FlashEntry, b: FlashEntry) => (holders.get(b.ticker) ?? 0) - (holders.get(a.ticker) ?? 0) || a.ticker.localeCompare(b.ticker);

    // ① 예상값 뜨기 — 기준 세션 마감 전 30분(종목을 담은 기기가 있는 발표만 · 저장본 읽기만)
    // 아직 못 뜬 발표부터(관문 11140731-3 #1) · 최근 시도했다 못 뜬 발표는 아직 시도 안 한 발표 뒤로(앞 12개가 계속 실패해도
    // 13번째 이후가 굶지 않게, 밤 검토 11/15) · 같은 구간 안에선 24시간 안 발표 먼저 — 떠 둔 키·시도 키 mget 1회(12종목 넘을 때만)
    const capAll = toCapture.filter((e) => holders.has(e.ticker)).sort(byHolders);
    const over = capAll.length > FLASH_CFG.maxCapturesPerRun;
    const got = over
      ? await store.mget([...capAll.map((e) => FLASH_KEYS.exp(e.ticker, e.date)), ...capAll.map((e) => FLASH_KEYS.capTry(e.ticker, e.date))]).catch(() => null)
      : null;
    const have = got ? got.slice(0, capAll.length) : capAll.map(() => null);
    const tried = got ? got.slice(capAll.length) : capAll.map(() => null);
    const cap = over ? pickCaptures(capAll, have, tried, holders, now) : capAll;
    if (cap.length) {
      const rows = await readers.implied(cap, etDate).catch(() => new Map<string, ImpliedRowLike>());
      for (const e of cap) {
        const r = snapFromImplied(e, rows.get(e.ticker), now);
        if (!r.ok) {
          report.skipped.push({ key: idOf(e), reason: `capture:${r.reason}` });
          if (!preview) await store.set(FLASH_KEYS.capTry(e.ticker, e.date), String(now), FLASH_CFG.captureTryTtlSec).catch(() => {});
          continue;
        }
        if (!preview) await store.set(FLASH_KEYS.exp(e.ticker, e.date), JSON.stringify(r.snap), FLASH_CFG.expTtlSec).catch(() => {});
        report.captured.push(`${idOf(e)}:${r.snap.pct}`);
      }
    }
    if (!due.length) return report;
    if (inPushBlackout(now)) { report.status = 'blackout'; return report; }

    // ② 판정 — 종목을 담은 기기가 있는 발표만 · 이미 고정된 값은 그대로(공급사 호출 0)
    const held = due.filter((e) => holders.has(e.ticker)).sort(byHolders);
    if (!held.length) { report.status = 'no-devices'; return report; }
    const frozenRaw = await store.mget(held.map((e) => FLASH_KEYS.ev(e.ticker, e.date))).catch(() => null);
    if (!frozenRaw) { report.skipped.push({ key: '*', reason: 'store_unavailable' }); return report; }
    const events = new Map<string, FlashEvent>();
    const open: FlashEntry[] = [];
    held.forEach((e, i) => {
      const f = parseFlashEvent(frozenRaw[i]);
      if (f && f.ticker === e.ticker && f.date === e.date && f.hour === e.hour) events.set(idOf(e), f); else open.push(e);
    });
    if (open.length) {
      const [snaps, acts] = await Promise.all([
        store.mget(open.map((e) => FLASH_KEYS.exp(e.ticker, e.date))).catch(() => open.map(() => null)),
        readers.actuals(open).catch(() => new Map<string, unknown>()),
      ]);
      const withExp: Array<{ e: FlashEntry; exp: ExpectedSnap }> = [];
      open.forEach((e, i) => {
        const exp = snapUsable(e, snaps[i]) ?? snapFromActuals(e, acts.get(idOf(e)));
        if (!exp) { report.events.push({ id: idOf(e), expected: null, move: null, frozen: false, reason: 'no_expected', recipients: 0 }); return; }
        withExp.push({ e, exp });
      });
      // 공급사 호출 — 회차 상한 · 하루 상한(원자 예약, 예약 못 하면 부르지 않는다) · 미리보기는 부르지 않는다(시세 함수가 캐시를 쓰고 계량 밖이 된다, 관문 11140731 #3)
      // 시작 위치를 15분 회차마다 돌린다 — 앞 종목 시세가 계속 무효여도 뒤 종목이 차례를 얻게(관문 11140731 #4)
      const rot = withExp.length ? Math.floor(now / 900_000) % withExp.length : 0;
      const ring = [...withExp.slice(rot), ...withExp.slice(0, rot)];
      const want = preview ? [] : ring.slice(0, FLASH_CFG.maxQuotesPerRun);
      let granted = want.length;
      const perQuote = Math.max(FLASH_CFG.vendorCallsPerQuote, Math.floor(o.vendorCallsPerQuote ?? 0));
      if (!preview && want.length) {
        const calls = deps.reserve ? await deps.reserve(FLASH_KEYS.vendorDay(etDate), want.length * perQuote, FLASH_CFG.vendorPerDay).catch(() => 0) : 0;
        granted = Math.floor(calls / perQuote);
      }
      report.vendor.granted = granted;
      const deadline = o.quoteDeadlineMs ?? Date.now() + 20_000;
      const todo = want.slice(0, granted);
      for (const x of ring.slice(todo.length)) report.events.push({ id: idOf(x.e), expected: x.exp.pct, move: null, frozen: false, reason: preview ? 'preview_no_quote' : 'quote_cap', recipients: 0 });
      const quotes = await Promise.all(todo.map((x) => readers.quote(x.e.ticker, deadline).catch(() => null)));
      report.vendor.quotes = todo.length;
      for (let i = 0; i < todo.length; i++) {
        const { e, exp } = todo[i];
        const j = judgeMove(e, quotes[i], now);
        if (!j.ok) { report.events.push({ id: idOf(e), expected: exp.pct, move: null, frozen: false, reason: j.reason, recipients: 0 }); continue; }
        const ev: FlashEvent = { v: 1, ticker: e.ticker, date: e.date, hour: e.hour, expectedPct: exp.pct, expectedSrc: exp.src, movePct: j.pct, base: j.base, price: j.price, priceAtMs: j.atMs, decidedAt: now };
        if (live) {
          // 고정 — 먼저 적은 회차의 값이 이긴다(경합이면 그 값을 다시 읽어 쓴다 · 못 읽으면 이번 회차는 보내지 않는다)
          const won = await store.setNx(FLASH_KEYS.ev(e.ticker, e.date), JSON.stringify(ev), FLASH_CFG.evTtlSec).catch(() => false);
          if (!won) {
            const again = parseFlashEvent(await store.get(FLASH_KEYS.ev(e.ticker, e.date)).catch(() => null));
            if (!again) { report.events.push({ id: idOf(e), expected: exp.pct, move: j.pct, frozen: false, reason: 'freeze_failed', recipients: 0 }); continue; }
            events.set(idOf(e), again);
            continue;
          }
          log(`[Cron/EarningsFlash] 고정 ${idOf(e)} 예상 ±${exp.pct}%(${exp.src}) · ${e.hour === 'amc' ? '시간외' : '장 초반'} ${j.pct}% @ ${new Date(j.atMs).toISOString()}`);
        }
        events.set(idOf(e), ev);
      }
    }
    for (const ev of events.values()) report.samples.push({ id: idOf(ev), ko: flashCopy(ev, 'ko'), en: flashCopy(ev, 'en'), ja: flashCopy(ev, 'ja') });
    if (!events.size) return report;

    // ③ 기기별 — 장부·쿨다운 읽기 → 선택(하루·회차 상한) → 장부 «먼저» 잡기 → 보내기
    const evList = Array.from(events.values()).sort((a, b) => (holders.get(b.ticker) ?? 0) - (holders.get(a.ticker) ?? 0) || a.ticker.localeCompare(b.ticker));
    const pairs: Array<{ d: SignalDevice; ev: FlashEvent }> = [];
    for (const d of devices) for (const ev of evList) if (d.tickers.includes(ev.ticker)) pairs.push({ d, ev });
    const recipients = new Map<string, number>();
    const sentKeys = pairs.map((p) => FLASH_KEYS.sent(p.d.dev, p.ev.ticker, p.ev.date));
    const coolKeys = pairs.map((p) => FLASH_KEYS.cool(p.d.dev, p.ev.ticker));
    const seen = new Set<string>();
    for (let i = 0; i < pairs.length; i += 200) {
      const part = [...sentKeys.slice(i, i + 200), ...coolKeys.slice(i, i + 200)];
      const vals = await store.mget(part).catch(() => null);
      if (!vals) { part.forEach((k) => seen.add(k)); continue; }   // 읽기 실패 = 보낸 것으로 본다(중복 0 우선)
      part.forEach((k, j) => { if (vals[j] != null) seen.add(k); });
    }
    const capKeys = Array.from(new Set(pairs.map((p) => FLASH_KEYS.cap(etDate, p.d.dev))));
    const capVals = capKeys.length ? await store.mget(capKeys).catch(() => capKeys.map(() => FLASH_CFG.deviceDailyCap)) : [];
    const used = new Map(capKeys.map((k, i) => [k, Number(capVals[i]) || 0] as const));
    const perRun = new Map<string, number>();
    const picks: Array<{ d: SignalDevice; ev: FlashEvent }> = [];
    pairs.forEach((p, i) => {
      if (seen.has(sentKeys[i]) || seen.has(coolKeys[i])) { report.skipped.push({ key: `${p.d.dev}|${idOf(p.ev)}`, reason: 'sent' }); return; }
      const ck = FLASH_KEYS.cap(etDate, p.d.dev);
      const n = perRun.get(p.d.dev) ?? 0;
      if ((used.get(ck) ?? 0) + n >= FLASH_CFG.deviceDailyCap) { report.skipped.push({ key: `${p.d.dev}|${idOf(p.ev)}`, reason: 'cap' }); return; }
      if (n >= FLASH_CFG.perRunPerDevice) { report.skipped.push({ key: `${p.d.dev}|${idOf(p.ev)}`, reason: 'run-limit' }); return; }
      perRun.set(p.d.dev, n + 1);
      picks.push(p);
      recipients.set(idOf(p.ev), (recipients.get(idOf(p.ev)) ?? 0) + 1);
    });
    for (const ev of evList) report.events.push({ id: idOf(ev), expected: ev.expectedPct, move: ev.movePct, frozen: live, recipients: recipients.get(idOf(ev)) ?? 0 });

    if (!live || !picks.length) return report;
    if (!deps.sender) { report.skipped.push({ key: '*', reason: 'no_sender' }); return report; }
    const claimed: Array<{ p: { d: SignalDevice; ev: FlashEvent }; item: SendItem }> = [];
    let claimLost = 0;
    for (const p of picks) {
      if (p.d.token === 'SIMULATED') continue;
      const sk = FLASH_KEYS.sent(p.d.dev, p.ev.ticker, p.ev.date);
      const capKey = FLASH_KEYS.cap(etDate, p.d.dev);
      if (!(await store.setNx(sk, String(now), FLASH_CFG.sentTtlSec).catch(() => false))) { claimLost++; continue; }
      const n = await store.incr(capKey, 36 * 3600).catch(() => null);
      if (n == null || n > FLASH_CFG.deviceDailyCap) {
        // 상한 초과·확인 불가 — 장부·상한을 돌려준다(이번엔 보내지 않는다)
        if (n != null) await store.decr(capKey).catch(() => 0);
        await store.del([sk]).catch(() => {});
        claimLost++;
        continue;
      }
      await store.set(FLASH_KEYS.cool(p.d.dev, p.ev.ticker), String(now), FLASH_CFG.cooldownSec).catch(() => {});
      const copy = flashCopy(p.ev, p.d.locale);
      claimed.push({
        p,
        item: {
          id: `${p.d.dev}|${idOf(p.ev)}`, token: p.d.token, platform: p.d.platform, ...copy, quiet: inQuietHours(p.d.tz, now), thread: `sig-${p.ev.ticker}`,
          data: { type: 'wl_signal', path: flashPath(p.ev.ticker), ev: FLASH_EVENT, t: p.ev.ticker, src: FLASH_FUNNEL_SRC, locale: p.d.locale },
        },
      });
    }
    const outcomes = claimed.length ? await deps.sender.send(claimed.map((c) => c.item)).catch(() => new Map<string, SendOutcome>()) : new Map<string, SendOutcome>();
    let ok = 0, fail = 0, dead = 0;
    const deadTokens = new Set<string>();
    for (const c of claimed) {
      const out = outcomes.get(c.item.id);
      // 한 번 시도한 발송은 결과와 무관하게 장부를 둔다 — 'fail' 에는 «닿았으나 응답을 못 받음»도 섞여 있어 다시 보내면 중복이 될 수 있다
      if (out === 'ok') ok++;
      else if (out === 'dead') { dead++; deadTokens.add(c.p.d.token); }
      else fail++;
    }
    if (deadTokens.size) {
      const list = Array.from(deadTokens);
      await store.srem('push:token_list', list).catch(() => {});
      await store.del(list.map((t) => `push:tokens:${t}`)).catch(() => {});
    }
    report.sent = { items: claimed.length, ok, fail, dead, claimLost };
    await writeStats(kv, etDate, now, claimed, outcomes).catch(() => {});
    return report;
  } finally {
    if (!preview) await kv.set(FLASH_KV.last, summaryOf(report), 3 * 86400).catch(() => {});
    if (locked) await store.del([FLASH_KEYS.lock]).catch(() => {});
  }
}

function summaryOf(r: FlashReport): unknown {
  return { at: r.at, mode: r.mode, status: r.status, captured: r.captured, due: r.due, events: r.events.slice(0, 40), vendor: r.vendor, devices: r.devices, sent: r.sent ?? null, skipped: r.skipped.filter((s) => s.reason !== 'sent').slice(0, 20) };
}

interface FlashStats { day: string; runs: number; sent: number; fail: number; dead: number; byLocale: Record<string, number>; log: Array<{ at: string; id: string; devices: number; sent: number }> }

async function writeStats(kv: SigKv, etDate: string, now: number, claimed: Array<{ p: { d: SignalDevice; ev: FlashEvent }; item: SendItem }>, outcomes: Map<string, SendOutcome>): Promise<void> {
  if (!claimed.length) return;
  const prev = await kv.get<FlashStats>(FLASH_KV.stats(etDate)).catch(() => null);
  const doc: FlashStats = prev && prev.day === etDate ? prev : { day: etDate, runs: 0, sent: 0, fail: 0, dead: 0, byLocale: {}, log: [] };
  doc.runs++;
  const per = new Map<string, { devices: number; sent: number }>();
  for (const c of claimed) {
    const out = outcomes.get(c.item.id);
    const row = per.get(idOf(c.p.ev)) ?? { devices: 0, sent: 0 };
    row.devices++;
    if (out === 'ok') { doc.sent++; row.sent++; doc.byLocale[c.p.d.locale] = (doc.byLocale[c.p.d.locale] ?? 0) + 1; } else if (out === 'dead') doc.dead++; else doc.fail++;
    per.set(idOf(c.p.ev), row);
  }
  for (const [id, row] of per) doc.log.push({ at: new Date(now).toISOString(), id, ...row });
  doc.log = doc.log.slice(-60);
  await kv.set(FLASH_KV.stats(etDate), doc, 60 * 86400);
}
