import { buildMarketIndexBasis } from '@/lib/marketIndexBasis';
import { getFromCache } from './redisClient';
import { YAHOO_CACHE_KEYS, type YahooQuote } from './yahooFinanceHub';
import { loadFuturesCashCloseReference } from './futuresCashClose';
import { tacticalSessionAt } from '@/lib/ai/tacticalIndexFacts';
import { isEquityFuturesOpen, lastClosedSessionDate } from '@/lib/marketSession';

/** 캐시 읽기만 한다. 공급사 호출·크론 기동·캐시 쓰기 없음. ^NDX 피드는 현재 없어 null. */
export async function loadMarketIndexBasis(nowMs = Date.now()) {
    const read = (key: string) => getFromCache<YahooQuote>(key).catch(() => null);
    const date = lastClosedSessionDate(nowMs);
    // 종가 이후 선물 기준은 장후·야간(선물 거래 중)에만 쓰인다 — 그 밖의 시간엔 읽지 않는다(읽기 비용 0 증가).
    const session = tacticalSessionAt(nowMs);
    const wantRef = (session === 'POST' || session === 'CLOSED') && isEquityFuturesOpen(nowMs);
    const ref = (symbol: 'NQ=F' | 'ES=F') => wantRef ? loadFuturesCashCloseReference(symbol, date, nowMs).catch(() => null) : Promise.resolve(null);
    const [nasdaq, spx, nq, es, nqRef, esRef] = await Promise.all([
        read(YAHOO_CACHE_KEYS.IDX_NASDAQ), read(YAHOO_CACHE_KEYS.IDX_SPX),
        read(YAHOO_CACHE_KEYS.NQ), read(YAHOO_CACHE_KEYS.SPX),
        ref('NQ=F'), ref('ES=F'),
    ]);
    return buildMarketIndexBasis({ nasdaq, spx, nq, es }, nowMs, { nq: nqRef, es: esRef });
}
