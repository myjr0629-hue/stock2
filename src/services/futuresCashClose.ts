import { closerCashCloseReference, futuresCashCloseCandidate, futuresCashCloseKey, FUTURES_CASH_CLOSE_TTL,
    validFuturesCashCloseReference, type FuturesCashCloseReference } from '@/lib/futuresCashClose';
import type { IndexQuoteInput } from '@/lib/marketIndexBasis';
import { setFuturesCashCloseIfCloser } from './redisClient';
import { etWallTimeToMs } from '@/lib/marketSession';
import { sessionCloseMinutes } from '@/lib/marketCalendar';

/** market-feed 기존 관측만 저장한다. 조회 경로에서는 호출하지 않는다. */
export async function captureFuturesCashClose(quote: IndexQuoteInput, nowMs = Date.now(),
    verifyRead?: (key: string) => Promise<{ ok: boolean; value: unknown }>): Promise<boolean> {
    const candidate = futuresCashCloseCandidate(quote, nowMs);
    if (!candidate) return true;
    const key = futuresCashCloseKey(candidate.symbol, candidate.sessionDate);
    const closeAt = new Date(etWallTimeToMs(candidate.sessionDate, sessionCloseMinutes(candidate.sessionDate))).toISOString();
    if (!await setFuturesCashCloseIfCloser(key, candidate, closeAt, FUTURES_CASH_CLOSE_TTL)) return false;
    if (!verifyRead) return true;
    const back = await verifyRead(key).catch(() => ({ ok: false, value: null }));
    const value = back.value as FuturesCashCloseReference | null;
    // 다른 수집자가 더 좋은 기준을 저장했어도 성공이다. 같은 체결은 최초 가격을 유지한다.
    return back.ok && validFuturesCashCloseReference(value, candidate.symbol, candidate.sessionDate)
        && closerCashCloseReference(value, candidate) === value;
}
