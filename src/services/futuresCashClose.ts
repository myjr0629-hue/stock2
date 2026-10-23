import { closerCashCloseReference, futuresCashCloseCandidate, futuresCashCloseKey, FUTURES_CASH_CLOSE_TTL,
    type FuturesCashCloseReference } from '@/lib/futuresCashClose';
import type { IndexQuoteInput } from '@/lib/marketIndexBasis';
import { getFromCache, setInCache } from './redisClient';

/** market-feed 기존 관측만 저장한다. 조회 경로에서는 호출하지 않는다. */
export async function captureFuturesCashClose(quote: IndexQuoteInput, nowMs = Date.now(),
    verifyRead?: (key: string) => Promise<{ ok: boolean; value: unknown }>): Promise<boolean> {
    const candidate = futuresCashCloseCandidate(quote, nowMs);
    if (!candidate) return true;
    const key = futuresCashCloseKey(candidate.symbol, candidate.sessionDate);
    const previous = await getFromCache<FuturesCashCloseReference>(key);
    const selected = closerCashCloseReference(previous, candidate);
    if (selected !== previous && !await setInCache(key, selected, FUTURES_CASH_CLOSE_TTL)) return false;
    if (!verifyRead) return true;
    const back = await verifyRead(key).catch(() => ({ ok: false, value: null }));
    const value = back.value as FuturesCashCloseReference | null;
    return back.ok && value?.symbol === selected.symbol && value?.sessionDate === selected.sessionDate
        && value?.asOf === selected.asOf && value?.price === selected.price;
}
