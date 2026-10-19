// src/lib/priceAcceptance.ts
// ============================================================================
// 가격 채택 규칙 «하나» — 세션 판정·소켓/서버 가격 채택·기준 종가·확정 종가 보호·조기 폐장 마감 시각.
//
// 왜(2026-10-19): fix/b1a-fake-index · fix/session-min · fix/b4-source-stamp 세 브랜치가 같은 뿌리로 관문을 15회 넘게 보류됐다.
//   · 가격·체결 시각·거래일·기준 종가가 따로 전달·갱신됐다(가격은 새 체결인데 날짜는 옛 체결 · PRE 기준이 목요일 종가).
//   · 체결 시각이 없으면 «가격이 0.25%/2% 안이면 최신»으로 봤다(금요일 소켓 99.8 이 월요일 PRE 실제 0% 를 덮었다).
//   · 확정 종가 보호가 «관측 시각 없음»에 묶여, 시각 있는 옛 장중 REST 가 종가 110 을 105 로 되돌렸다.
//   · PRE/POST 등락 기준과 정규장 일간 기준을 한 필드(previousClose)로 다시 계산했다(POST→REG 전환 +2.55%).
//   · 조기 폐장(13:00 ET) 세션·완료일·마감 시각이 서로 다른 함수에서 따로 정해졌다(UC «16:00 에 마감»).
//   설계서: ~/Documents/signum-work/codex/out/price-acceptance-spec-2.md(②계약 ③채택 순서 ④세션×입력 ⑤완료일)
//
// 규칙(이 파일이 정본 — 다른 곳은 이 함수를 부르거나 이 결과를 투영만 한다):
//   세션        marketCalendar 하나(휴장·주말·조기 폐장 13:00). 한 계산 안의 nowMs 는 한 번만 정한다.
//   채택 순서   ① 값이 틀린 후보(비유한·0 이하) 거부 → ② 날짜·체결 시각 모순·미래 체결 거부
//               → ③ 그 칸(정규장·PRE·POST) 시간 밖 체결 거부(직전 실제 값이 있을 때) · 소켓은 «지금 세션·오늘·수신 10분 안»만
//               → ④ 같은 정규장 날짜의 확정 종가는 장중 값으로 되돌리지 않는다(경과 시간·관측 시각과 무관)
//               → ⑤ 같은 권위의 정정(revision)은 더 높은 순번만 → ⑥ 원천 날짜가 더 옛것이면 거부
//               → ⑦ 같은 날 두 체결 시각을 비교할 수 있으면 더 최신 → ⑧ 비교할 수 없으면 서버 후보
//               (소켓은 «서버가 받은 시각보다 늦은 체결»일 때만 서버 값을 대신한다 — 가격 근접성은 최신의 증거가 아니다)
//   기준 종가   정규장·PRE 등락 = 직전 완료 정규장 종가 C(P(D)) · POST 등락 = 그날 정규장 종가 C(D). 기준이 없으면 null(0 을 지어내지 않는다).
//   마감·주말·휴장 = 직전 정규장 실제 값과 그 날짜를 그대로(재스탬프하지 않는다).
// 순수 함수 — 시험 tests/priceAcceptance*.test.ts(무네트워크).
// ============================================================================

import {
  etDateOf, etMinutesOf, isNonTradingDay, prevTradingDate, sessionCloseMinutes,
  usEquitySessionAt, etLastCompletedSessionDate, EARLY_CLOSE_DATES,
} from '@/lib/marketCalendar';

export type Phase = 'PRE' | 'REG' | 'POST' | 'CLOSED';
export type PriceLane = 'regular' | 'pre' | 'post';

export interface SessionContext {
  evaluatedAt: number;
  phase: Phase;
  /** ET 달력 날짜(지금) */
  etDate: string;
  /** ET 자정 기준 분(지금) */
  etMinutes: number;
  tradingDay: boolean;
  earlyClose: boolean;
  regularOpenAt: number | null;
  regularCloseAt: number | null;
  /** 정규장 마감 시각(ET 분) — 평소 960 · 조기 폐장 780. 거래일이 아니면 null */
  regularCloseMinutes: number | null;
  /** 조기 폐장 반영 «마지막으로 끝난 정규장»(13:00 폐장일 13:00 이후 = 오늘) */
  lastCompletedRegularDate: string;
  /** 오늘(또는 지금 속한 날) 바로 앞 거래일 */
  previousTradingDate: string;
  /** 다음 경계(04:00·09:30·마감·20:00·자정) — 캐시가 경계를 넘어 세션을 붙잡지 않게 */
  nextBoundaryAt: number;
}

const MIN = 60_000;

// ET 날짜·분은 분 단위로만 바뀐다 — 목록 100종목 × 렌더마다 toLocaleString 을 반복하지 않게 «분» 열쇠로 기억한다(값은 같다).
const etMemo = new Map<number, { date: string; minutes: number }>();
function etOf(ms: number): { date: string; minutes: number } {
  const key = Math.floor(ms / MIN);
  let v = etMemo.get(key);
  if (!v) {
    if (etMemo.size > 2048) etMemo.clear();
    v = { date: etDateOf(ms), minutes: etMinutesOf(ms) };
    etMemo.set(key, v);
  }
  return v;
}
const ctxMemo = new Map<number, Omit<SessionContext, 'evaluatedAt'>>();

/** ET 날짜 + ET 분 → epoch ms(그날의 ET 오프셋으로) */
function etWallToMs(date: string, minutes: number, hintMs: number): number {
  // 같은 날 정오 기준 오프셋(서머타임 전환일 새벽 2시 경계 밖이면 충분 — 경계 시각은 전부 04:00 이후)
  const [y, m, d] = date.split('-').map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  // ET = UTC−4(EDT) 또는 UTC−5(EST). 두 후보 중 etDateOf/etMinutesOf 가 일치하는 쪽
  for (const off of [4, 5]) {
    const ms = utcGuess + off * 60 * MIN;
    if (etDateOf(ms) === date && etMinutesOf(ms) === minutes) return ms;
  }
  return hintMs;
}

/**
 * 지금 시각의 세션 문맥 — marketCalendar 하나로(조기 폐장·휴장·주말 포함).
 *   경계는 전부 «분» 단위라 같은 분 안에서는 문맥이 같다 — 분 열쇠로 기억하고 evaluatedAt 만 이번 nowMs 로 바꾼다
 *   (캐시가 경계를 넘어 세션을 붙잡지 않는다 — 열쇠가 분이므로 경계 분이 바뀌면 새로 계산된다 · 설계서 T34).
 */
export function marketSessionAt(nowMs: number): SessionContext {
  const key = Math.floor(nowMs / MIN);
  let base = ctxMemo.get(key);
  if (!base) {
    if (ctxMemo.size > 512) ctxMemo.clear();
    const { date: etDate, minutes } = etOf(nowMs);
    const tradingDay = !isNonTradingDay(etDate);
    const s = usEquitySessionAt(nowMs);
    const phase: Phase = s === 'pre' ? 'PRE' : s === 'regular' ? 'REG' : s === 'post' ? 'POST' : 'CLOSED';
    const closeMin = tradingDay ? sessionCloseMinutes(etDate) : null;
    const bounds = tradingDay ? [240, 570, closeMin as number, 1200, 1440] : [1440];
    const nextMin = bounds.find((b) => b > minutes) ?? 1440;
    base = {
      phase,
      etDate,
      etMinutes: minutes,
      tradingDay,
      earlyClose: tradingDay && EARLY_CLOSE_DATES.has(etDate),
      regularOpenAt: tradingDay ? etWallToMs(etDate, 570, nowMs) : null,
      regularCloseAt: tradingDay && closeMin != null ? etWallToMs(etDate, closeMin, nowMs) : null,
      regularCloseMinutes: closeMin,
      lastCompletedRegularDate: etLastCompletedSessionDate(nowMs),
      previousTradingDate: prevTradingDate(etDate),
      nextBoundaryAt: key * MIN + (nextMin - minutes) * MIN,
    };
    ctxMemo.set(key, base);
  }
  return { ...base, evaluatedAt: nowMs };
}

/** 'HH:MM' — 그날 정규장 마감(조기 폐장 13:00) */
export function regularCloseHHMM(date: string): string {
  const m = sessionCloseMinutes(date);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ── 관측 계약 ──────────────────────────────────────────────────────────────

export interface PriceObservation {
  lane: PriceLane;
  /** 값이 속한 정규장(또는 그 시간외 세션) ET 날짜 — 모르면 null(지금 달력으로 지어내지 않는다) */
  sourceSessionDate: string | null;
  price: number;
  /** 실제 체결 시각(epoch ms) — 모르면 null */
  tradeTime: number | null;
  /** 우리가 받은 시각 — 체결 시각 대용 금지(서버 관측의 «상한»으로만 쓴다) */
  receivedAt: number;
  basis: 'trade' | 'official-close' | 'quote-mid';
  origin: 'server' | 'ws';
  finality: 'provisional' | 'confirmed';
  revision?: { authority: string; order: number } | null;
}

export interface AcceptDecision { accepted: boolean; reason: string }

/** 소켓 틱을 받은 지 이만큼 지나면 «지금 값»이 아니다(앱이 뒤로 갔다 온 뒤 메모리에 남은 틱) — 수신 상태 정책(체결 시각 지연과 별개) */
export const WS_RECEIVE_IDLE_MS = 10 * MIN;

const finitePos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * 그 칸의 체결 시간 창 안인가(체결 시각의 ET 날짜 기준).
 *   PRE 04:00~09:30 · 정규장 09:30~마감(마감 첫 1초 체결은 정규장 마감 체결) · POST 마감~20:00(마감 첫 1초는 POST 아님).
 */
export function tradeInLaneWindow(lane: PriceLane, tradeTime: number): boolean {
  const { date: d, minutes: m } = etOf(tradeTime);
  if (isNonTradingDay(d)) return false;
  const close = sessionCloseMinutes(d);
  const closingSecond = tradeTime % MIN < 1_000;
  if (lane === 'pre') return m >= 240 && m < 570;
  if (lane === 'regular') return (m >= 570 && m < close) || (m === close && closingSecond);
  return (m > close || (m === close && !closingSecond)) && m < 1200;
}

/** 소켓 후보가 «지금 세션의 오늘 체결·최근 수신»인가 */
export function wsObservationLive(o: PriceObservation, ctx: SessionContext): AcceptDecision {
  // 마감·주말·휴장엔 허브가 굳은 마지막 체결만 준다 — 서버가 확인한 직전 정규장 값과 날짜를 그대로 둔다
  if (ctx.phase === 'CLOSED') return { accepted: false, reason: 'ws-market-closed' };
  if (ctx.evaluatedAt - o.receivedAt > WS_RECEIVE_IDLE_MS && o.receivedAt > 1e12) return { accepted: false, reason: 'ws-receive-idle' };
  if (!o.tradeTime) return { accepted: false, reason: 'ws-no-trade-time' };
  if (etOf(o.tradeTime).date !== ctx.etDate || !ctx.tradingDay) return { accepted: false, reason: 'ws-not-today' };
  if (!tradeInLaneWindow(o.lane, o.tradeTime)) return { accepted: false, reason: 'ws-out-of-lane' };
  return { accepted: true, reason: 'ws-live' };
}

/**
 * 한 칸(lane)의 채택 — prev(이미 그린 값)와 next(새 후보) 중 무엇을 쓸지.
 *   prev·next 는 같은 lane 이어야 한다(다르면 next 를 그 lane 후보로 보지 않는다).
 *   소켓 후보의 «세션 일치»는 호출자가 지금 세션 lane 으로 만든다(wsObservationLive 가 시간 창을 본다).
 */
export function acceptObservation(
  prev: PriceObservation | null | undefined,
  next: PriceObservation | null | undefined,
  ctx: SessionContext,
): { value: PriceObservation | null; decision: AcceptDecision } {
  const keep = (reason: string) => ({ value: prev ?? null, decision: { accepted: false, reason } });
  const take = (reason: string) => ({ value: next as PriceObservation, decision: { accepted: true, reason } });
  if (prev && !finitePos(prev.price)) prev = null;
  // ① 값이 틀린 후보
  if (!next || !finitePos(next.price)) return keep('invalid');
  if (prev && prev.lane !== next.lane) return keep('lane-mismatch');
  // ② 모순·미래
  if (next.tradeTime && next.tradeTime > ctx.evaluatedAt + 1_000) return keep('future-trade');
  if (next.tradeTime && next.sourceSessionDate && next.basis === 'trade' && etOf(next.tradeTime).date !== next.sourceSessionDate) return keep('date-time-contradiction');
  // ③ 칸 시간 밖 · 소켓 신선도
  if (next.origin === 'ws') {
    const live = wsObservationLive(next, ctx);
    if (!live.accepted) return keep(live.reason);
  } else if (next.tradeTime && !tradeInLaneWindow(next.lane, next.tradeTime) && prev) {
    // 벌크 «정규장 가격» 자리의 마감 뒤 호가 중간값 등 — 직전 실제 정규장 값을 남긴다(값이 없으면 받아서 칸을 비우지 않는다)
    return keep('out-of-lane');
  }
  if (!prev) {
    return take(next.origin === 'ws' ? 'ws-no-server' : 'first');
  }
  const dp = prev.sourceSessionDate, dn = next.sourceSessionDate;
  // ④ 확정 종가 보호
  if (prev.finality === 'confirmed' && next.finality !== 'confirmed' && dp && (dn === dp || !dn)) return keep('confirmed-close-locked');
  // ⑤ 정정
  if (prev.revision && next.revision && prev.revision.authority === next.revision.authority && dp === dn) {
    return next.revision.order > prev.revision.order ? take('revision') : keep('stale-revision');
  }
  // ⑥ 원천 날짜
  if (dp && dn && dn < dp) return keep('older-session');
  if (dp && !dn) return keep('undated-after-dated');
  if (dp && dn && dn > dp) return take('newer-session');
  // ⑦ 같은 날 — 두 체결 시각 비교
  if (prev.tradeTime && next.tradeTime) {
    if (next.tradeTime > prev.tradeTime) return take('newer-trade');
    if (next.tradeTime < prev.tradeTime) return keep('older-trade');
    // 같은 체결 시각: 서버 우선 · 서버끼리 다른 값은 기존 유지(충돌)
    if (next.origin === 'server' && prev.origin === 'ws') return take('same-time-server');
    if (next.origin === 'ws' && prev.origin === 'server') return keep('same-time-server-kept');
    if (next.price !== prev.price && next.finality !== 'confirmed') return keep('same-time-conflict');
    return take('same-time-same');
  }
  // ⑧ 비교 불가
  if (next.origin === 'ws') {
    // 서버 관측은 «받은 시각»보다 늦을 수 없다 — 그보다 늦은 소켓 체결만 서버 값을 대신한다
    if (prev.origin === 'server' && !prev.tradeTime && next.tradeTime && next.tradeTime >= prev.receivedAt) return take('ws-after-server-receipt');
    return keep('incomparable-server-kept');
  }
  return take('server');
}

// ── 기준 종가 ────────────────────────────────────────────────────────────

/** 등락(%) — 기준이 없으면 null(실제 0% 와 결측을 구분한다) */
export function changePctFrom(price: number | null | undefined, base: number | null | undefined): number | null {
  if (!finitePos(price) || !finitePos(base)) return null;
  return ((price - base) / base) * 100;
}

const normSession = (s: unknown): 'pre' | 'reg' | 'post' | 'closed' | null => {
  const u = String(s ?? '').toUpperCase();
  if (!u) return null;
  if (u === 'PRE' || u === 'PRE_MARKET' || u === 'PREMARKET' || u === 'PRE-MARKET' || u === 'PRE_CLOSE') return 'pre';
  if (u === 'REG' || u === 'REGULAR' || u === 'OPEN' || u === 'RTH' || u === 'MARKET' || u === 'LIVE') return 'reg';
  if (u === 'POST' || u === 'POST_MARKET' || u === 'POSTMARKET' || u === 'POST-MARKET' || u === 'AFTER' || u === 'AFTERHOURS' || u === 'EXTENDED-HOURS') return 'post';
  if (u === 'CLOSED' || u === 'CLOSE') return 'closed';
  return null;
};

export interface QuoteRowLike {
  price?: number | null;
  previousClose?: number | null;
  prevClose?: number | null;
  session?: string | null;
  /** 이 행 price 가 속한 정규장 날짜(서버 스탬프) */
  sourceSessionDate?: string | null;
}

/**
 * 시세 한 행에서 «지금 정규장·PRE 등락의 기준» = 직전 완료 정규장 종가 C(P(D)) 를 꺼낸다(D = 지금 보여 주는 정규장 날짜).
 *   시세 계약: PRE·CLOSED(개장 전) 행의 price = 마지막 완료 정규장 종가, previousClose = 그 한 세션 앞 ·
 *            REG 행의 previousClose = 전 거래일 종가 · POST·CLOSED(마감 뒤) 행의 price = 오늘 종가, previousClose = 전 거래일 종가.
 *   한 필드(previousClose)를 세션과 상관없이 기준으로 쓰면 월요일 PRE 의 기준이 목요일 종가가 됐다(+2.04% — 관문 B1-10191713).
 *   행의 원천 날짜를 알면 날짜로, 모르면 행의 세션으로 고른다. 어느 쪽도 맞지 않으면 null(지어내지 않는다).
 */
export function regularBaselineFromRow(row: QuoteRowLike | null | undefined, ctx: SessionContext): number | null {
  if (!row) return null;
  const price = finitePos(row.price) ? row.price : null;
  const prev = finitePos(row.previousClose) ? row.previousClose : finitePos(row.prevClose) ? row.prevClose : null;
  const rs = normSession(row.session);
  // 지금 보여 주는 정규장 날짜 D — 정규장·POST·마감 뒤는 오늘, 개장 전·주말·휴장은 직전 거래일
  const shownD = ctx.tradingDay && (ctx.phase === 'REG' || ctx.phase === 'POST' || (ctx.phase === 'CLOSED' && ctx.etMinutes >= 570))
    ? ctx.etDate : ctx.lastCompletedRegularDate;
  // 기준 = C(P(D)) — PRE 는 D 자체가 아직 열리지 않았으므로 «마지막 완료 정규장»(= D 의 직전) 종가
  const baseDate = ctx.phase === 'PRE' ? ctx.lastCompletedRegularDate : prevTradingDate(shownD);
  const rd = typeof row.sourceSessionDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.sourceSessionDate) ? row.sourceSessionDate.slice(0, 10) : null;
  if (rd && rs !== 'reg') {
    // 행 price 는 rd 의 정규장 종가(또는 그날 값) · previousClose 는 rd 직전 거래일 종가
    if (rd === baseDate) return price;
    if (prevTradingDate(rd) === baseDate) return prev;
    return null;
  }
  if (rd && rs === 'reg') {
    // 정규장 행 — price 는 rd 의 장중 값(확정 종가 아님) · previousClose 는 rd 직전 종가
    if (prevTradingDate(rd) === baseDate) return prev;
    return null;
  }
  // 날짜를 모르는 행 — 세션으로
  if (rs === 'pre') return ctx.phase === 'PRE' || ctx.phase === 'REG' ? price : prev;
  if (rs === 'closed') {
    // 개장 전(자정~04:00) CLOSED 행의 price 는 마지막 완료 정규장 종가 · 마감 뒤(20:00~) 행의 price 는 오늘 종가
    return ctx.phase === 'PRE' || ctx.phase === 'REG' ? price : prev;
  }
  if (rs === 'post') return ctx.phase === 'PRE' || ctx.phase === 'REG' ? price : prev;
  return prev;
}

/**
 * 시세 한 행 «자기 세션» 기준의 C(P(D)) — 행이 막 받은 응답이라 세션이 지금과 같을 때(초기 진입 SSR·폴링 응답).
 *   PRE 행 = price(마지막 완료 정규장 종가) · 그 밖(REG·POST·CLOSED) = previousClose. 세션을 모르면 previousClose.
 *   세션이 바뀐 뒤 남긴 행(결측·역전 대신 보존)은 regularBaselineFromRow(지금 세션 문맥)를 쓴다.
 */
export function ownSessionBaseline(row: QuoteRowLike | null | undefined): number | null {
  if (!row) return null;
  const price = finitePos(row.price) ? row.price : null;
  const prev = finitePos(row.previousClose) ? row.previousClose : finitePos(row.prevClose) ? row.prevClose : null;
  return normSession(row.session) === 'pre' ? price : prev;
}

/**
 * 시간외 칸 채택(서버가 확인한 시간외 체결 + 소켓 틱) — 소켓은 «서버 체결과 같은 날·같은 시간외 칸(PRE 04:00~09:30 · POST 마감~20:00)의 더 새 체결»일 때만.
 *   서버 시각을 모르면 소켓 가격이 같을 때만(같은 관측) 소켓을 쓴다 — 근접성(0.25%)은 최신의 증거가 아니다(관문 B1-10191534).
 *   정규장 체결(09:30:02 110)이 남은 PRE 칸에 앉지 않는다(관문 price-acceptance-10191930 P2) · 받은 지 10분 넘은 틱은 쓰지 않는다.
 *   서버가 시간외 체결을 확인하지 않았으면(serverExt 0) 칸을 비운 채 둔다(소켓의 어제 애프터 값을 오늘 PRE 로 쓰지 않는다).
 */
export function pickExtObservation(
  wsPrice: number | null | undefined,
  serverExt: number | null | undefined,
  timing?: { wsTimeMs?: number | null; serverTime?: string | number | null; wsReceivedAt?: number | null; nowMs?: number },
): { price: number; fromWs: boolean } {
  const s = Number(serverExt);
  if (!(s > 0)) return { price: 0, fromWs: false };
  const w = Number(wsPrice);
  if (!(w > 0)) return { price: s, fromWs: false };
  const ra = Number(timing?.wsReceivedAt);
  const now = timing?.nowMs ?? Date.now();
  if (Number.isFinite(ra) && ra > 1e12 && now - ra > WS_RECEIVE_IDLE_MS) return { price: s, fromWs: false };
  const st = timing?.serverTime;
  const serverMs = typeof st === 'number' ? st : typeof st === 'string' ? Date.parse(st) : NaN;
  const wsMs = Number(timing?.wsTimeMs);
  if (Number.isFinite(serverMs) && serverMs > 0) {
    if (!(Number.isFinite(wsMs) && wsMs > serverMs)) return { price: s, fromWs: false };
    // 서버 체결이 속한 시간외 칸·날짜와 같은 칸·날짜의 체결만(정규장 체결을 PRE 로 쓰지 않는다)
    const lane: PriceLane | null = tradeInLaneWindow('pre', serverMs) ? 'pre' : tradeInLaneWindow('post', serverMs) ? 'post' : null;
    if (lane && (!tradeInLaneWindow(lane, wsMs) || etOf(wsMs).date !== etOf(serverMs).date)) return { price: s, fromWs: false };
    return { price: w, fromWs: true };
  }
  return w === s ? { price: w, fromWs: true } : { price: s, fromWs: false };
}

/**
 * 서버 행의 «정규장 가격» 자리를 정규장 값으로 써도 되나 — 서버가 정규장 시간 밖 관측(벌크 경로의 마감 뒤 호가 중간값)이라고
 *   스탬프를 달았으면(basis proxy · 관측 시각이 정규장 창 밖) 정규장 종가로 잠그지 않는다(설계서 T35 · 관문 10191930 P1).
 *   호출자는 직전 실제 정규장 값이 있으면 그것을 남기고, 없으면 칸을 비우지 않게 받은 값을 쓴다.
 */
export function serverRegularPriceUsable(row: { basis?: unknown; observedAt?: unknown } | null | undefined): boolean {
  if (!row || row.basis !== 'proxy') return true;
  const t = Number(row.observedAt);
  return !(Number.isFinite(t) && t > 0 && !tradeInLaneWindow('regular', t));
}
