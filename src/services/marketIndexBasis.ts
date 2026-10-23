import { buildMarketIndexBasis } from '@/lib/marketIndexBasis';
import { getFromCache } from './redisClient';
import { YAHOO_CACHE_KEYS, type YahooQuote } from './yahooFinanceHub';
import { futuresCashCloseKey, type FuturesCashCloseReference } from '@/lib/futuresCashClose';
import { lastClosedSessionDate } from '@/lib/marketSession';

/** 캐시 읽기만 한다. 공급사 호출·크론 기동·캐시 쓰기 없음. ^NDX 피드는 현재 없어 null. */
export async function loadMarketIndexBasis(nowMs = Date.now()) {
    const read = (key: string) => getFromCache<YahooQuote>(key).catch(() => null);
    const date = lastClosedSessionDate(nowMs);
    const [nasdaq, spx, nq, es, nqRef, esRef] = await Promise.all([
        read(YAHOO_CACHE_KEYS.IDX_NASDAQ), read(YAHOO_CACHE_KEYS.IDX_SPX),
        read(YAHOO_CACHE_KEYS.NQ), read(YAHOO_CACHE_KEYS.SPX),
        getFromCache<FuturesCashCloseReference>(futuresCashCloseKey('NQ=F', date)).catch(() => null),
        getFromCache<FuturesCashCloseReference>(futuresCashCloseKey('ES=F', date)).catch(() => null),
    ]);
    return buildMarketIndexBasis({ nasdaq, spx, nq, es }, nowMs, { nq: nqRef, es: esRef });
}
