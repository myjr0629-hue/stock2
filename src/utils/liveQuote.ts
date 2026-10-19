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

import { normalizeQuoteSession, oneNumberFromQuote, oneNumberTickPct } from '@/utils/calcPriceDisplay';
import { etDateOf, etMinutesOf, isNonTradingDay } from '@/lib/marketCalendar';
import { EXT_WS_MAX_DEVIATION } from '@/utils/extWsTrust';
import { readStamp, wsTickFresh, preferNewer, makeStamp, type SourceStamp } from '@/lib/sourceStamp';

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
 * 시세 응답 전의 세션 추정 — 공용 달력(휴장·주말)과 ET 시계로. useMarketStatus 의 첫 추정과 같은 경계(04:00·09:30·16:00·20:00).
 * 첫 시세가 오기 전(≈1초)에도 정규장이면 허브가 구독 즉시 보내는 최신값을 쓰게 한다(대시보드와 같은 속도) — 시세가 오면 서버 세션이 이긴다.
 */
export function clockSession(nowMs: number): LiveSession {
  if (isNonTradingDay(etDateOf(nowMs))) return 'closed';
  const m = etMinutesOf(nowMs);
  if (m >= 240 && m < 570) return 'pre';
  if (m >= 570 && m < 960) return 'reg';
  if (m >= 960 && m < 1200) return 'post';
  return 'closed';
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
  if (!tick || !(tick.price > 0)) return false;
  if (session !== 'reg' && session !== 'pre' && session !== 'post') return false;
  // 묵은 틱(wsTickFresh 탈락)은 어긋남으로 세지 않는다 — 어차피 쓰지 않으니 시세를 앞당길 이유가 없다(요청이 늘지 않는다)
  if (!wsTickFresh({ priceTime: tick.priceTime, receivedAt: tick.ts }, session, nowMs, rest?.observedAt ?? null)) return false;
  const ref = tickReference(rest, session);
  return ref > 0 && Math.abs(tick.price - ref) / ref > WS_MAX_DEVIATION;
}

/**
 * 가격 허브 틱을 쓸 수 있나. 세션이 열려 있을 때만(마감·휴장엔 허브가 굳은 마지막 체결만 준다 — useLivePrice 와 같은 규칙).
 *   프리·애프터는 시세 요청이 «그 세션 체결가»를 확인한 뒤에만 — 04:00 직후 허브의 마지막 체결은 어제 애프터였다(체결 시각 함정).
 *   기준(정규장 가격 · 시간외 체결가)에서 2% 넘게 벗어나면 믿지 않는다.
 */
export function wsTickUsable(rest: RestQuote | undefined, tick: WsTick | undefined, session: LiveSession | null, nowMs: number = Date.now()): boolean {
  if (!tick || !(tick.price > 0)) return false;
  if (session !== 'reg' && session !== 'pre' && session !== 'post') return false;
  // ★ [2026-10-19 묶음 4] 틱의 «나이»를 먼저 본다 — 어제·지난 세션 체결, 시세가 이미 더 늦은 체결을 본 틱, 체결 시각 없이 오래 남은 틱은 가격이 비슷해도 쓰지 않는다
  if (!wsTickFresh({ priceTime: tick.priceTime, receivedAt: tick.ts }, session, nowMs, rest?.observedAt ?? null)) return false;
  const ref = tickReference(rest, session);
  if (session !== 'reg' && !ref) return false;
  if (!ref) return true;                                    // 시세 요청 전(정규장) — 허브 값을 그대로
  // 프리·애프터는 허브도 서버와 같은 15분 지연이라 더 새롭지 않다 — 서버가 확인한 시간외 체결가와 0.25% 안일 때만(어제 값을 든 허브가 통과하지 않게 · 10/13 JPM)
  return Math.abs(tick.price - ref) / ref <= (session === 'reg' ? WS_MAX_DEVIATION : EXT_WS_MAX_DEVIATION);
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
  const useWs = opts.wsConnected && wsTickUsable(rest, tick, session, nowMs);
  if (useWs) {
    const pct = oneNumberTickPct(tick!.price, rest, session) ?? (session === 'reg' ? numOrNull(tick!.changePct) : null);
    const pt = typeof tick!.priceTime === 'number' && tick!.priceTime > 0 ? tick!.priceTime : null;
    return {
      price: tick!.price, changePct: pct, session, ext: session !== 'reg', live: true, at: tick!.ts,
      // 틱은 «지금 세션» 체결이다(wsTickFresh 통과) — 날짜는 체결 시각의 ET 날짜, 모르면 오늘(ET)
      stamp: makeStamp({ sourceSessionDate: etDateOf(pt ?? nowMs), observedAt: pt, receivedAt: tick!.ts, basis: 'live' }, nowMs),
    };
  }
  const one = oneNumberFromQuote(rest, session);
  if (!one) return null;
  return { price: one.price, changePct: one.changePct, session, ext: one.ext, live: false, at: opts.restAt ?? 0, stamp: restDisplayStamp(rest, one.ext, opts.restAt ?? nowMs) };
}

/**
 * 시세 요청 값의 스탬프 — 서버가 실은 정규장 스탬프를 쓰되, 시간외 체결가를 그리는 행(ext)은 그 시간외 날짜·체결 시각으로.
 *   서버가 스탬프를 안 실었으면(옛 응답) 날짜는 null — 화면이 예전처럼 달력으로 정한다(지어내지 않는다).
 */
export function restDisplayStamp(rest: RestQuote | undefined, ext: boolean, receivedAt: number): SourceStamp {
  const base = readStamp(rest, receivedAt) ?? makeStamp({ receivedAt, basis: rest ? 'last-session' : 'missing' });
  if (!ext) return { ...base, receivedAt };
  const extDate = typeof rest?.extendedDate === 'string' ? rest.extendedDate : null;
  const extTime = (rest as any)?.extendedTime;
  const live = (rest as any)?.extendedKind === 'live';
  return makeStamp({ sourceSessionDate: extDate, observedAt: extTime, receivedAt, basis: extDate ? (live ? 'live' : 'eod') : 'last-session' }, receivedAt);
}

/**
 * 응답 역전 방지 병합 — 새 응답의 종목별 값이 이미 그린 값보다 «원천이 옛것»이면(세션 전환 중 늦게 도착한 응답·다른 인스턴스의 묵은 캐시) 앞 값을 남긴다.
 *   값 없는 응답(오류 행)도 값 있는 앞 값을 지우지 않는다. 판정은 src/lib/sourceStamp.ts preferNewer 하나.
 */
export function mergeQuotesByStamp(
  prev: Record<string, RestQuote> | undefined,
  next: Record<string, RestQuote>,
  nowMs: number = Date.now(),
): { data: Record<string, RestQuote>; kept: string[] } {
  if (!prev) return { data: next, kept: [] };
  const out: Record<string, RestQuote> = { ...next };
  const kept: string[] = [];
  for (const [t, q] of Object.entries(next)) {
    const p = prev[t];
    if (!p) continue;
    const ps = readStamp(p, (p.receivedAt as number) || nowMs);
    const ns = readStamp(q, (q.receivedAt as number) || nowMs) ?? (pos(q?.price) ? null : makeStamp({ receivedAt: nowMs, basis: 'missing' }));
    if (!ps || !ns) continue;
    const pHas = pos(p.price) > 0;
    if (pHas && !preferNewer(ps, ns, nowMs)) { out[t] = p; kept.push(t); }
  }
  return { data: out, kept };
}
