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

/** 공급사 추가 호출 없이 매분 관측 중 마감 직전/정각/직후 분만 후보로 쓴다. */
export function futuresCashCloseCandidate(quote: IndexQuoteInput, nowMs: number): FuturesCashCloseReference | null {
    if (quote.symbol !== 'NQ=F' && quote.symbol !== 'ES=F') return null;
    const at = quote.marketTime ? Date.parse(quote.marketTime) : NaN;
    const changedAt = quote.lastChangeAt ? Date.parse(quote.lastChangeAt) : NaN;
    if (!Number.isFinite(at) || at > nowMs || nowMs - at > 3 * 60_000
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
