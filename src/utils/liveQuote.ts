// src/utils/liveQuote.ts
// ============================================================================
// 여러 종목 «한 숫자» 실시간 가격 — 공용 층(순수 함수). src/hooks/useLiveQuotes 가 쓴다.
//
// 원천은 다른 화면과 같다(새 가격 경로를 만들지 않는다):
//   · 실시간  wss://ws.signumhq.com 가격 허브(WebSocketProvider — 대시보드 «지수 LIVE»·cmd·movers·flow 가 쓰는 그 연결)
//   · 예비    /api/live/quotes?symbols=…  (대시보드가 이미 쓰는 여러 종목 시세 요청)
//   · 숫자 계산은 calcPriceDisplay.ts 의 공용 «한 숫자»(oneNumberFromQuote·oneNumberTickPct) — 대시보드 «지수» ETF·섹터와 같은 함수다.
//
// «한 숫자» 규칙 — 행 하나에 가격 하나·등락 하나만 그리는 화면(대시보드 카드·목록)용(원천과 상관없이 같은 기준):
//   정규장    실시간 가격 · 전일 종가 대비
//   프리·애프터  그 세션의 체결가(시간외 체결이 있을 때만) · 직전 정규장 종가 대비(가격 허브·대시보드 «지수 LIVE»와 같은 기준)
//              시간외 체결이 아직 없으면 직전 정규장 종가·그 등락(지어내지 않는다)
//   마감·휴장   마지막 정규장 종가 · 그 등락
//   POST 배지(시간외를 «따로» 그리는 Command)는 오늘 정규장 종가 대비 — 이름표가 다르면 계산이 다르다(calcPriceDisplay 주석)
// ============================================================================

import { normalizeQuoteSession, oneNumberFromQuote } from '@/utils/calcPriceDisplay';
import { etDateOf, usEquitySessionAt } from '@/lib/marketCalendar';
import { calcPriceDisplay, type PriceDisplayInput, type PriceDisplayResult } from '@/utils/calcPriceDisplay';
import { readStamp, wsTickFresh, acceptQuote, asEpochMs, makeStamp, type QuoteValue, type SourceStamp } from '@/lib/sourceStamp';
import { marketSessionAt, regularBaselineFromRow } from '@/lib/priceAcceptance';

/** /api/live/quotes 한 종목 */
export interface RestQuote {
  price?: number | null;
  previousClose?: number | null;
  prevClose?: number | null;
  changePercent?: number | null;
  extendedPrice?: number | null;
  extendedChangePercent?: number | null;
  extendedLabel?: string | null;
  session?: string | null;
  error?: string | null;
  /** 시간외 값의 날짜(그 세션의 ET 날짜) */
  extendedDate?: string | null;
  extendedTime?: string | null;
  extendedKind?: string | null;
  /** 결측·역전 응답 대신 남긴 행은 새로운 REST 검증 기준이 아니다. */
  preserved?: boolean;
  // ★ 묶음 4 원천 스탬프(/api/live/quotes 가 싣는다 — src/lib/sourceStamp.ts)
  sourceSessionDate?: string | null;
  observedAt?: number | null;
  receivedAt?: number | null;
  basis?: string | null;
}

/** 가격 허브 한 틱(WebSocketProvider PriceUpdate) */
export interface WsTick {
  price: number; changePct: number;
  /** 브라우저가 받은 시각(ms) */
  ts: number;
  /** 원천 체결 시각(ms) — 모르면 0. 이 값으로 «오래된 틱»을 거른다(가격 근접성만으로 최신 판정하지 않는다) */
  priceTime?: number;
}

export type LiveSession = 'pre' | 'reg' | 'post' | 'closed';

export interface LiveDisplay {
  /** 그릴 가격(없으면 null — «—») */
  price: number | null;
  /** 그릴 등락(모르면 null — «0.00%»를 지어내지 않는다) */
  changePct: number | null;
  /** 이 숫자의 세션 */
  session: LiveSession | null;
  /** 시간외 체결가를 그리고 있다(프리·애프터) — 가격 기준 라벨이 «프리마켓·애프터마켓»이 된다 */
  ext: boolean;
  /** 이 숫자가 가격 허브 틱이다(아니면 시세 요청 값) */
  live: boolean;
  /** 이 숫자를 받은 시각(ms) */
  at: number;
  /** ★ 묶음 4 — 이 숫자의 원천 날짜·관측 시각·근거(값과 함께 화면까지 간다) */
  stamp: SourceStamp;
}

/**
 * 한 요청에 담는 종목 수 — 30개 이하일 때만 서버가 종목별 실시간 스냅샷으로 받는다(intrinioClient DIRECT_SNAPSHOT_MAX).
 * 31개부터는 벌크 경로(NBBO 중간값 캐시 5분 · 전일 종가 T+1)라 장중에도 최대 5분 묵은 값이 섰다(A4).
 */
export const LIVE_QUOTES_CHUNK = 30;
/** 한 목록이 구독하는 종목 상한(PRO 100 — MAX_ITEMS) */
export const LIVE_QUOTES_MAX = 100;
/** 가격 허브 값이 시세 요청 기준에서 이만큼 넘게 벗어나면 믿지 않는다(2026-08-29: 허브가 어제 값을 뱉었다 — useLivePrice 와 같은 문턱) */
export const WS_MAX_DEVIATION = 0.02;
/** 예비 요청 간격 — 가격 허브가 붙어 있으면(값은 틱으로 온다 · 확인만) 60초 · 끊겼으면 30초 · 장이 닫혀 있으면 5분 */
export const QUOTES_POLL_WS_MS = 60_000;
export const QUOTES_POLL_FALLBACK_MS = 30_000;
export const QUOTES_POLL_CLOSED_MS = 5 * 60_000;

/** 서버·허브 세션 이름을 하나로(공용 normalizeQuoteSession) */
export const normLiveSession = (s: string | null | undefined): LiveSession | null => normalizeQuoteSession(s);

/**
 * 시세 응답 전의 세션 추정 — 공용 달력(marketCalendar.usEquitySessionAt — 휴장·주말·조기 폐장 13:00)으로.
 * useMarketStatus 의 첫 추정과 같은 경계(04:00·09:30·정규장 마감·20:00).
 * 첫 시세가 오기 전(≈1초)에도 정규장이면 허브가 구독 즉시 보내는 최신값을 쓰게 한다(대시보드와 같은 속도) — 시세가 오면 서버 세션이 이긴다.
 */
export function clockSession(nowMs: number): LiveSession {
  const s = usEquitySessionAt(nowMs);
  return s === 'regular' ? 'reg' : s;
}

export function chunkTickers(tickers: readonly string[], size = LIVE_QUOTES_CHUNK): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < tickers.length; i += size) out.push(tickers.slice(i, i + size));
  return out;
}

/**
 * 다음 예비 요청까지(ms). 한 사람이 1분에 묻는 종목 수를 60개 이하로 묶는다 —
 * 묶음(30)마다 서버가 종목별 벤더 스냅샷을 부르므로 PRO 100종목을 30초마다 물으면 벤더 한도(2,000/분)에 몇 명 만에 닿는다(E2).
 *   간격 = max(기본, 묶음 수 × 30초) — 30종목 30초 · 60종목 60초 · 100종목 120초(허브 끊김 기준)
 */
export function liveQuotesRefreshMs(count: number, wsConnected: boolean, session: LiveSession | null): number {
  if (session === 'closed') return QUOTES_POLL_CLOSED_MS;
  const base = wsConnected ? QUOTES_POLL_WS_MS : QUOTES_POLL_FALLBACK_MS;
  return Math.max(base, Math.ceil(Math.max(1, count) / LIVE_QUOTES_CHUNK) * 30_000);
}

/** 여러 종목 시세 — 30개씩 나눠 동시에. 받은 묶음은 쓰고, 전부 실패하면 던진다(SWR 이 error 로 알린다) */
export async function fetchLiveQuotes(
  tickers: readonly string[],
  fetchImpl: (url: string) => Promise<{ ok: boolean; status?: number; json: () => Promise<any> }> = (u) => fetch(u, { cache: 'no-store' }),
): Promise<{ data: Record<string, RestQuote>; asked: string[]; session: LiveSession | null; at: number; failed: number; total: number }> {
  const chunks = chunkTickers(tickers);
  const res = await Promise.all(chunks.map(async (c) => {
    try {
      const r = await fetchImpl(`/api/live/quotes?symbols=${encodeURIComponent(c.join(','))}`);
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.data && typeof j.data === 'object' ? j : null;
    } catch { return null; }
  }));
  const data: Record<string, RestQuote> = {};
  let session: LiveSession | null = null;
  let failed = 0;
  for (const j of res) {
    if (!j) { failed += 1; continue; }
    session = session ?? normLiveSession(j.session);
    for (const [t, q] of Object.entries<any>(j.data)) if (q && typeof q === 'object') data[t.toUpperCase()] = q;
  }
  if (chunks.length && failed === chunks.length) throw new Error('live-quotes-failed');
  return { data, asked: [...tickers], session, at: Date.now(), failed, total: chunks.length };
}

const pos = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** 틱을 견줄 시세 기준 — 정규장은 시세 가격(없으면 전일 종가) · 프리·애프터는 시세가 확인한 그 세션 체결가(없으면 0 = 아직 확인 전) */
function tickReference(rest: RestQuote | undefined, session: LiveSession | null): number {
  return session === 'reg'
    ? pos(rest?.price) || pos(rest?.previousClose) || pos(rest?.prevClose)
    : pos(rest?.extendedPrice);
}

/**
 * 허브 틱이 시세 기준에서 2% 넘게 «실제로» 벗어났다(기준이 있는데 어긋남) — 급등락 종목의 정상 틱일 수 있으니
 * 시세를 한 번 앞당겨 기준을 새로 잡게 한다(useLiveQuotes). «프리·애프터 체결 확인 전»(기준 없음)은 어긋남이 아니다.
 */
export function tickMismatch(rest: RestQuote | undefined, tick: WsTick | undefined, session: LiveSession | null, nowMs: number = Date.now()): boolean {
  if (rest?.preserved || !tick || !(tick.price > 0)) return false;
  if (session !== 'reg' && session !== 'pre' && session !== 'post') return false;
  // 묵은 틱(wsTickFresh 탈락)은 어긋남으로 세지 않는다 — 어차피 쓰지 않으니 시세를 앞당길 이유가 없다(요청이 늘지 않는다)
  if (!wsTickFresh({ priceTime: tick.priceTime, receivedAt: tick.ts }, session, nowMs, rest?.observedAt ?? null)) return false;
  if (wsTickUsable(rest, tick, session, nowMs)) return false;
  const ref = tickReference(rest, session);
  return ref > 0 && Math.abs(tick.price - ref) / ref > WS_MAX_DEVIATION;
}

/**
 * 가격 허브 틱을 쓸 수 있나. 세션이 열려 있을 때만(마감·휴장엔 허브가 굳은 마지막 체결만 준다 — useLivePrice 와 같은 규칙).
 *   프리·애프터는 시세 요청이 «그 세션 체결가»를 확인한 뒤에만 — 04:00 직후 허브의 마지막 체결은 어제 애프터였다(체결 시각 함정).
 *   체결 시각이 있으면 선후를 비교한다. 시각 없는 레거시 메시지만 기존 가격 문턱으로 검증한다.
 */
export function wsTickUsable(rest: RestQuote | undefined, tick: WsTick | undefined, session: LiveSession | null, nowMs: number = Date.now()): boolean {
  if (!session || !tick) return false;
  const base = restQuoteValue(rest, session !== 'reg' && session !== 'closed', nowMs);
  const next = wsQuoteValue(tick, session, rest, nowMs);
  return acceptQuote(base, next, nowMs)?.source === 'ws';
}

/** REST 원본을 가격 묶음으로 변환한다. 채택 판단은 acceptQuote. */
export function restQuoteValue(rest: RestQuote | undefined, ext: boolean, receivedAt: number): QuoteValue | null {
  if (!rest || rest.error) return null;
  const session = ext ? normLiveSession(rest.extendedLabel ?? rest.session) : 'reg';
  if (!session) return null;
  return {
    price: ext ? pos(rest.extendedPrice) : pos(rest.price),
    changePct: numOrNull(ext ? rest.extendedChangePercent : rest.changePercent),
    session, previousClose: pos(ext ? rest.price : (rest.previousClose ?? rest.prevClose)) || null,
    stamp: restDisplayStamp(rest, ext, receivedAt), source: 'rest',
    label: ext ? rest.extendedLabel ?? undefined : undefined, kind: ext ? rest.extendedKind : undefined,
  };
}

function wsQuoteValue(tick: WsTick, session: LiveSession, rest: RestQuote | undefined, nowMs: number): QuoteValue {
  const pt = asEpochMs(tick.priceTime);
  // 기준 종가는 공용 규칙 하나(priceAcceptance.regularBaselineFromRow) — 정규장·PRE = 직전 완료 정규장 종가 C(P(D)) · POST = 그날 정규장 종가.
  //   PRE/CLOSED/POST 행의 price 는 그 행 날짜의 정규장 종가다. 그 행의 previousClose(한 거래일 더 전)를 새 REG 체결의 분모로 옮기지 않는다
  //   (금요일 POST 행 종가 100·전일 98 을 월요일 REG 100.5 의 기준으로 쓰면 +2.55% — 관문 B4-10191403 P1).
  //   결측·역전 대신 남긴 행(_carriedFrom)은 mergeQuotesByStamp 가 이미 같은 규칙으로 기준을 옮겨 두었다.
  //   «한 숫자»(목록·카드)는 세션과 상관없이 C(P(D)) 대비다(애프터도 직전 정규장 종가 대비 — 허브 등락과 같은 기준 · 파일 머리 주석).
  //   POST 배지(오늘 종가 대비)는 stampedPriceDisplay 가 시간외 묶음에 따로 기준을 준다.
  const carried = (rest as any)?._carriedFrom != null;
  const base = carried ? pos(rest?.previousClose ?? rest?.prevClose) : regularBaselineFromRow(rest, marketSessionAt(nowMs));
  return {
    price: tick.price, changePct: session === 'reg' ? numOrNull(tick.changePct) : null,
    session, previousClose: pos(base) || null,
    stamp: { ...makeStamp({ sourceSessionDate: etDateOf(pt ?? nowMs), observedAt: pt, basis: 'live' }, nowMs), receivedAt: tick.ts },
    source: 'ws', referencePrice: tickReference(rest, session), label: session.toUpperCase(), kind: 'live',
  };
}

/**
 * 한 종목의 «한 숫자» — 시세 요청 값 위에 가격 허브 틱을 얹는다. 계산은 공용 oneNumber*(대시보드 «지수»·섹터와 같은 함수·같은 기준).
 *   틱을 쓸 수 있으면(wsTickUsable) 그 틱이 지금 세션의 체결이다 — 등락은 시세의 «직전 정규장 종가» 대비(모르면 정규장만 허브 등락)
 *   아니면 시세 한 종목의 한 숫자(oneNumberFromQuote). rest 가 없고 틱도 쓸 수 없으면 null(뼈대로 기다린다).
 */
export function liveDisplay(
  rest: RestQuote | undefined,
  tick: WsTick | undefined,
  opts: { wsConnected: boolean; session?: string | null; restAt?: number; nowMs?: number },
): LiveDisplay | null {
  const session = normLiveSession(rest?.session ?? opts.session);
  const nowMs = opts.nowMs ?? Date.now();
  const base = restQuoteValue(rest, session === 'pre' || session === 'post', opts.restAt ?? nowMs);
  const selected = opts.wsConnected && tick && session ? acceptQuote(base, wsQuoteValue(tick, session, rest, nowMs), nowMs) : base;
  if (selected?.source === 'ws') {
    return { price: selected.price, changePct: selected.changePct, session, ext: session !== 'reg', live: true,
      at: selected.stamp.receivedAt, stamp: selected.stamp };
  }
  // 세션 전환 중 결측·옛 원천 응답 대신 남긴 직전 행(mergeQuotesByStamp)은 틱이 없으면 «원래 세션»의 숫자로 그린다 — 지난 종가에 0.00% 를 지어내지 않는다
  const carried = (rest as any)?._carriedFrom != null;
  const one = carried
    ? oneNumberFromQuote({ ...rest, ...((rest as any)._carriedBase ?? {}) } as RestQuote, normLiveSession((rest as any)._carriedFrom))
    : oneNumberFromQuote(rest, session);
  if (!one) return null;
  return { price: one.price, changePct: one.changePct, session, ext: one.ext, live: false, at: opts.restAt ?? 0, stamp: restDisplayStamp(rest, one.ext, opts.restAt ?? nowMs) };
}

/**
 * 시세 요청 값의 스탬프 — 서버가 실은 정규장 스탬프를 쓰되, 시간외 체결가를 그리는 행(ext)은 그 시간외 날짜·체결 시각으로.
 *   서버가 스탬프를 안 실었으면(옛 응답) 날짜는 null — 화면이 예전처럼 달력으로 정한다(지어내지 않는다).
 */
export function restDisplayStamp(rest: RestQuote | undefined, ext: boolean, receivedAt: number): SourceStamp {
  const base = readStamp(rest, receivedAt) ?? makeStamp({ receivedAt, basis: rest && pos(rest.price) ? 'last-session' : 'missing' });
  if (!ext) return { ...base, receivedAt };
  const extDate = typeof rest?.extendedDate === 'string' ? rest.extendedDate : null;
  const extTime = rest?.extendedTime;
  const live = rest?.extendedKind === 'live';
  return makeStamp({ sourceSessionDate: extDate, observedAt: extTime, receivedAt, basis: extDate ? (live ? 'live' : 'eod') : 'last-session' }, receivedAt);
}

/**
 * 응답 역전 방지 병합 — 새 응답의 종목별 값이 이미 그린 값보다 «원천이 옛것»이면(세션 전환 중 늦게 도착한 응답·다른 인스턴스의 묵은 캐시) 앞 값을 남긴다.
 *   · 값 없는 응답(오류 행)·물었는데 응답에서 빠진 종목(한 묶음 실패)도 값 있는 앞 값을 지우지 않는다 — 앞 값은 제 원천 날짜를 단 채 남는다.
 *     이때 세션은 «지금 응답»의 것으로 바꾼다(프리 행을 개장 뒤에도 프리로 들고 있으면 신선한 정규장 틱까지 거부된다 — 관문 1차 P1).
 *   · 시간외 값은 따로 본다 — 같은 날 시간외 체결 시각이 더 옛 응답이면 시간외 칸만 앞 값을 남긴다(PRE 08:25 $102 뒤 08:20 $101 역전 방지).
 *   판정은 src/lib/sourceStamp.ts acceptQuote 하나.
 */
const EXT_KEYS = ['extendedPrice', 'extendedChangePercent', 'extendedChange', 'extendedLabel', 'extendedDate', 'extendedKind', 'extendedTime', 'extendedBasis', 'extendedSource'] as const;
export function mergeQuotesByStamp(
  prev: Record<string, RestQuote> | undefined,
  next: Record<string, RestQuote>,
  nowMs: number = Date.now(),
  opts: { asked?: readonly string[]; session?: string | null } = {},
): { data: Record<string, RestQuote>; kept: string[] } {
  if (!prev) return { data: next, kept: [] };
  const out: Record<string, RestQuote> = { ...next };
  const kept: string[] = [];
  // 앞 값을 남길 때 세션은 «지금 응답»의 것(서버가 요청 시각에 정한 시장 상태)으로 — 세션이 바뀌었으면 앞 세션의 시간외 칸은 버린다
  //   (정규장 $110·PRE CLOSE $102 행을 애프터 전환 뒤 남기면서 시간외 칸까지 남기면 «$102 · 애프터»가 됐다 — 관문 2차 P1)
  const keepPrev = (t: string, p: RestQuote, sessionNow: string | null | undefined) => {
    const now = normLiveSession(sessionNow);
    if (!now || now === normLiveSession(p.session)) { out[t] = { ...p, preserved: true }; kept.push(t); return; }
    const row: any = { ...p, preserved: true, session: sessionNow, _carriedFrom: p.session ?? null };
    for (const k of EXT_KEYS) row[k] = k === 'extendedPrice' || k === 'extendedChangePercent' || k === 'extendedChange' ? 0 : null;
    // 정규장이 열리면 기준은 직전 완료 정규장 종가 C(P(D)) — PRE·CLOSED·«전 거래일 POST» 행의 price 가 그 값이다
    //   (관문 3차 P1: 목요일 종가 98 기준 +2.55% · B4-10191403 P1: 금요일 POST 행에서 같은 오류). 규칙은 priceAcceptance 하나.
    // PRE 도 같다 — 보존한 전날 CLOSED·POST 행의 previousClose(전전 거래일)를 새 PRE 체결의 분모로 쓰지 않는다(관문 10192131 P2)
    if (now === 'reg' || now === 'pre') {
      const rolled = regularBaselineFromRow(p, marketSessionAt(nowMs));
      row._carriedBase = { previousClose: p.previousClose ?? null, prevClose: p.prevClose ?? null };
      row.previousClose = rolled;
      row.prevClose = rolled;
    }
    out[t] = row;
    kept.push(t);
  };
  // 물었는데 응답에 없는 종목(묶음 실패) — 앞 값을 남긴다
  for (const t of opts.asked ?? []) {
    const p = prev[t];
    if (!(t in next) && p && pos(p.price) > 0) keepPrev(t, p, opts.session ?? null);
  }
  for (const [t, q] of Object.entries(next)) {
    const p = prev[t];
    if (!p) continue;
    const pHas = pos(p.price) > 0;
    if (!pHas) continue;
    const qMissing = !pos(q?.price) || !!q?.error;
    if (qMissing) { keepPrev(t, p, q?.session ?? opts.session ?? null); continue; }
    const candidate = restQuoteValue(q, false, q.receivedAt ?? nowMs);
    const regular = acceptQuote(restQuoteValue(p, false, p.receivedAt ?? nowMs), candidate, nowMs);
    if (candidate && regular?.stamp !== candidate.stamp) { keepPrev(t, p, q?.session ?? opts.session ?? null); continue; }
    const oldExt = restQuoteValue(p, true, p.receivedAt ?? nowMs);
    const newExt = restQuoteValue(q, true, q.receivedAt ?? nowMs);
    const ext = acceptQuote(oldExt, newExt, nowMs);
    if (oldExt && newExt && oldExt.session === newExt.session && ext?.stamp === oldExt.stamp) {
      const merged: RestQuote = { ...q };
      for (const k of EXT_KEYS) (merged as any)[k] = (p as any)[k];
      out[t] = merged;
      kept.push(t);
    }
  }
  return { data: out, kept };
}


/** Flow·CMD의 기존 표시 계산에 채택된 가격 묶음을 전달한다. 라벨 계산은 기존 함수를 쓴다. */
export function stampedPriceDisplay(
  input: PriceDisplayInput,
  sources: { rest?: RestQuote; tick?: WsTick; connected: boolean; stamp?: SourceStamp | null },
  nowMs: number,
): PriceDisplayResult & { quote: QuoteValue | null } {
  const session = normLiveSession(input.session) ?? 'closed';
  const fallback = calcPriceDisplay(input);
  const tickerQuote: QuoteValue = {
    price: fallback.displayPrice, changePct: fallback.displayChangePct, session: 'reg',
    previousClose: pos(input.prevClose) || null,
    stamp: sources.stamp ?? makeStamp({ basis: 'last-session', receivedAt: nowMs }), source: 'rest',
  };
  const rest = sources.rest;
  let quote = acceptQuote(tickerQuote, restQuoteValue(rest, false, rest?.receivedAt ?? nowMs), nowMs);
  if (session === 'reg' && sources.connected && sources.tick) {
    const next = wsQuoteValue(sources.tick, session, rest, nowMs);
    next.previousClose = next.previousClose || pos(input.prevRegularClose) || pos(input.prevClose) || null;
    next.referencePrice = quote?.price;
    quote = acceptQuote(quote, next, nowMs);
  }
  // 시간외도 별도 가격 묶음이다. 정규장 큰 가격의 체결 시각을 덮지 않는다.
  const extSession = normLiveSession(fallback.activeExtType === 'PRE_CLOSE' ? 'pre' : fallback.activeExtType);
  const extFields = input.extended as (PriceDisplayInput['extended'] & { preDate?: string; postDate?: string; postTime?: string; postKind?: string });
  const extTime = extSession === 'post' ? extFields?.postTime : extFields?.preTime;
  const tickerExt = extSession && fallback.activeExtPrice > 0 ? {
    price: fallback.activeExtPrice, changePct: fallback.activeExtPct, session: extSession,
    previousClose: quote?.price ?? null, source: 'rest' as const,
    label: fallback.activeExtLabel, kind: extSession === 'post' ? extFields?.postKind : extFields?.preKind,
    stamp: makeStamp({ observedAt: extTime,
      sourceSessionDate: (extSession === 'post' ? extFields?.postDate : extFields?.preDate) ?? (asEpochMs(extTime) ? etDateOf(asEpochMs(extTime)!) : null),
      basis: 'last-session', receivedAt: nowMs }),
  } : null;
  let ext = acceptQuote(tickerExt, restQuoteValue(rest, true, rest?.receivedAt ?? nowMs), nowMs);
  if ((session === 'pre' || session === 'post') && sources.connected && sources.tick) {
    const next = wsQuoteValue(sources.tick, session, rest, nowMs);
    next.previousClose = quote?.price ?? null;
    next.referencePrice = ext?.price;
    ext = acceptQuote(ext, next, nowMs);
  }
  const overlayExt = ext?.stamp !== tickerExt?.stamp ? ext : null;
  const result = calcPriceDisplay({ ...input,
    livePrice: quote?.price, liveChangePct: quote?.changePct,
    prevRegularClose: session === 'pre' ? quote?.price : (session === 'reg' ? quote?.previousClose : input.prevRegularClose),
    regularCloseToday: session === 'post' || session === 'closed' ? quote?.price : input.regularCloseToday,
    liveExtPrice: overlayExt?.price, liveExtChangePct: overlayExt?.changePct,
    liveExtLabel: overlayExt?.label ? (session === 'closed' && !overlayExt.label.includes('CLOSED') ? `${overlayExt.label} (CLOSED)` : overlayExt.label) : undefined,
    liveExtKind: overlayExt?.kind,
    liveExtTime: overlayExt?.stamp.observedAt ? new Date(overlayExt.stamp.observedAt).toISOString() : null,
  });
  return { ...result, displayPrice: quote?.price ?? result.displayPrice,
    displayChangePct: quote?.changePct ?? result.displayChangePct, quote };
}
