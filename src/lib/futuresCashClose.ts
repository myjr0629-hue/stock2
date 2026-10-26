import { isNonTradingDay, sessionCloseMinutes } from './marketCalendar';
import { etClock, etWallTimeToMs } from './marketSession';
import type { IndexQuoteInput } from './marketIndexBasis';

export type CashCloseFuturesSymbol = 'NQ=F' | 'ES=F';
export interface FuturesCashCloseReference {
    symbol: CashCloseFuturesSymbol;
    sessionDate: string;
    price: number;
    /** 실제 선물 체결 시각. 마감 정각이나 수집 시각으로 바꾸지 않는다. */
    asOf: string;
}
export const FUTURES_CASH_CLOSE_TTL = 24 * 60 * 60;
export const futuresCashCloseKey = (symbol: CashCloseFuturesSymbol, date: string) =>
    `yahoo:cash-close:${symbol === 'NQ=F' ? 'nq' : 'es'}:${date}`;

/** 캐시와 Tactical 양쪽에서 실제 관측과 마감 간 3분 경계를 재검사한다. */
export function isCashCloseReferenceAt(asOf: string | null | undefined, date: string): boolean {
    const at = asOf ? Date.parse(asOf) : NaN;
    return Number.isFinite(at) && !isNonTradingDay(date) && etClock(at).date === date
        && Math.abs(at - etWallTimeToMs(date, sessionCloseMinutes(date))) <= 3 * 60_000;
}

export function validFuturesCashCloseReference(ref: FuturesCashCloseReference | null | undefined,
    symbol: string, date: string): ref is FuturesCashCloseReference {
    return !!ref && ref.symbol === symbol && ref.sessionDate === date
        && typeof ref.price === 'number' && Number.isFinite(ref.price) && ref.price > 0
        && isCashCloseReferenceAt(ref.asOf, date);
}

/**
 * 야후 CME 선물(NQ=F·ES=F)은 약 10분 지연 피드다 — regularMarketTime 은 실제 체결 시각이고, 그 체결이 우리 수집기에
 * 보이는 것은 약 10분 뒤다(10/26 실측: 17:00 ET 휴장 뒤에도 값이 17:10 ET 까지 바뀌었고 마지막 체결 시각은 16:59:59 ET).
 * 그래서 «체결 시각이 수집 시점 3분 이내»를 요구하면 마감 부근 체결은 영원히 후보가 되지 못한다(10/26 첫 실전 기준 0건).
 * 관측 나이 상한은 지연 10분 + 수집 주기·여유 5분. 신선함(정체 피드 거절)은 lastChangeAt 20분 조건이 따로 지킨다.
 */
export const CASH_CLOSE_OBSERVATION_MAX_AGE_MS = 15 * 60_000;

/** 공급사 추가 호출 없이 매분 관측 중 마감 직전/정각/직후 분만 후보로 쓴다. */
export function futuresCashCloseCandidate(quote: IndexQuoteInput, nowMs: number): FuturesCashCloseReference | null {
    if (quote.symbol !== 'NQ=F' && quote.symbol !== 'ES=F') return null;
    const at = quote.marketTime ? Date.parse(quote.marketTime) : NaN;
    const changedAt = quote.lastChangeAt ? Date.parse(quote.lastChangeAt) : NaN;
    if (!Number.isFinite(at) || at > nowMs || nowMs - at > CASH_CLOSE_OBSERVATION_MAX_AGE_MS
        || !Number.isFinite(changedAt) || changedAt > nowMs || nowMs - changedAt > 20 * 60_000
        || quote.source === 'DEFAULT' || typeof quote.price !== 'number' || !Number.isFinite(quote.price) || quote.price <= 0) return null;
    const c = etClock(at);
    if (!isCashCloseReferenceAt(quote.marketTime, c.date) || Math.abs(c.minutes - sessionCloseMinutes(c.date)) > 1) return null;
    return { symbol: quote.symbol, sessionDate: c.date, price: quote.price, asOf: new Date(at).toISOString() };
}

/** 동률이면 먼저 관측된 값을 유지한다. 장후 가격으로 기준을 따라 움직이지 않는다. */
export function closerCashCloseReference(previous: FuturesCashCloseReference | null, next: FuturesCashCloseReference): FuturesCashCloseReference {
    if (!validFuturesCashCloseReference(previous, next.symbol, next.sessionDate)) return next;
    const close = etWallTimeToMs(next.sessionDate, sessionCloseMinutes(next.sessionDate));
    const delta = Math.abs(Date.parse(next.asOf) - close) - Math.abs(Date.parse(previous.asOf) - close);
    return delta < 0 || (delta === 0 && next.asOf < previous.asOf) ? next : previous;
}
