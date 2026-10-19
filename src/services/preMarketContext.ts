/** 기존 market-feed·뉴스 펄스 캐시를 읽는다. 재생성·외부 쓰기·AI 호출 없음. */
import { mgetFromCache } from '@/services/redisClient';
import { buildBackdrop, type RawQuote } from '@/lib/marketBackdrop';
import { etClock, lastClosedSessionDate } from '@/lib/marketSession';
import { generationSession, sessionQuote, type PreMarketContext, type SessionQuote } from '@/lib/ai/preMarketContext';
import { publicBase } from '@/lib/net/publicBase';

export async function readPreMarketContext(now: number, quotes: SessionQuote[] = []): Promise<PreMarketContext> {
    // marketBackdropLoader·guardian/news-digest와 동일한 캐시. 모듈의 공급사 초기화는 하지 않는다.
    const [nq, es, digest] = await mgetFromCache<any>(['yahoo:nq', 'yahoo:spx', 'guardian:news:digest:v2'])
        .catch(() => [null, null, null]);
    const raw = (q: any): RawQuote | null => q && q.source !== 'DEFAULT' ? q : null;
    const backdrop = buildBackdrop({ nowMs: now, nq: raw(nq), es: raw(es), nasdaq: null, dow: null, spx: null, us10y: null });
    const news = (Array.isArray(digest?.items) ? digest.items : [])
        .filter((n: any) => typeof n?.headline === 'string' && typeof n?.publishedAt === 'string'
            && now - Date.parse(n.publishedAt) >= 0 && now - Date.parse(n.publishedAt) <= 24 * 3600_000)
        .slice(0, 5).map((n: any) => ({ headline: n.headline.slice(0, 240), publishedAt: n.publishedAt }));
    return { date: etClock(now).date, session: generationSession(now), lastRegularDate: lastClosedSessionDate(now), quotes, futures: backdrop.futures, news };
}

/** 선별된 최대 5종목만 기존 시세 API로 읽는다. 실패해도 EOD 재료는 보존한다. */
export async function readPickPreQuotes(tickers: string[], now: number): Promise<SessionQuote[]> {
    try {
        const res = await fetch(`${publicBase()}/api/live/quotes?symbols=${tickers.join(',')}`, {
            cache: 'no-store', signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return [];
        const body = await res.json();
        if (!body?.data || Array.isArray(body.data)) return [];
        return tickers.filter(t => body.data[t]).map(t => sessionQuote(t, body.data[t], String(body.session), now));
    } catch { return []; }
}
