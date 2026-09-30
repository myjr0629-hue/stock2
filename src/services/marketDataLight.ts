import { fetchMassive } from '@/services/massiveClient';
import { getETNow } from '@/services/timezoneUtils';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getExtendedSessionClose, isTradeInExtSession } from '@/services/extendedSessionClose';
import { isNonTradingDay, shownRegularSessionDate } from '@/lib/marketCalendar';

/**
 * 프리마켓 «종가» — 화면이 보여주는 정규장 날짜의 프리마켓 마지막 체결.
 *
 * ★ [2026-09-25] 체결 테이프 기준으로 바꿨다(services/extendedSessionClose.ts).
 *   예전 구현은 `/v2/aggs/ticker/{T}/range/1/minute/{epoch ms}/{epoch ms}` 로 04:00~09:29 창을
 *   물었는데, Intrinio 어댑터는 from/to 를 «날짜»로만 읽어 시간창을 버린다 → «오늘 최신 분봉»
 *   (정규장 가격)이 프리 종가로 나갔다. COST 9/25: 916.26(정규장) vs 진짜 887.53.
 *   그 값이 pm_true_close:{T}:{날짜} 에 24시간 앉아 있었다.
 * 프리마켓 진행 중·확정 전(09:47 ET 전)·실패는 null — 호출부는 null 이면 PRE CLOSE 를 그리지 않는다.
 */
export async function fetchTruePreMarket(symbol: string): Promise<number | null> {
    const r = await getExtendedSessionClose(symbol, shownRegularSessionDate(), 'pre').catch(() => null);
    return r?.price ?? null;
}

// [PERF] Core data fetcher — called by Polygon APIs
async function _fetchStockDataLight(symbol: string) {
    const to = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];

    const et = getETNow();
    const etTime = et.hour + et.minute / 60;

    let session: 'pre' | 'reg' | 'post' | 'closed' = 'reg';
    // 휴장일은 요일로 모른다 — 달력이 정본이다(시계로만 가르면 휴장일 낮이 «정규장»이 된다)
    if (!et.isWeekend && !isNonTradingDay(et.dateString)) {
        if (etTime >= 4 && etTime < 9.5) session = 'pre';
        else if (etTime >= 16 && etTime < 20) session = 'post';
        else if (etTime >= 9.5 && etTime < 16) session = 'reg';
        else session = 'closed'; // 20:00-04:00 ET → market fully closed
    } else {
        session = 'closed';
    }
    const shownDate = shownRegularSessionDate();

    const [snapRes, rsiRes, dailyAggs, truePmRes, postCloseRes] = await Promise.all([
        fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`),
        fetchMassive(`/v1/indicators/rsi/${symbol}`, { timespan: 'day', window: '14', limit: '1' }).catch(() => null),
        fetchMassive(`/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${to}`, { limit: '5000', adjust: 'true', sort: 'asc' }).catch(() => null),
        session === 'pre' ? Promise.resolve(null) : fetchTruePreMarket(symbol),  // 화면 날짜의 프리마켓 종가
        session === 'closed' ? getExtendedSessionClose(symbol, shownDate, 'post').catch(() => null) : Promise.resolve(null),
    ]);

    const t = snapRes?.ticker;
    if (!t) return null;

    const prevClose = t?.prevDay?.c || 0;
    const todayClose = t?.day?.c || prevClose;
    const latestPrice = t?.lastTrade?.p || t?.min?.c || t?.day?.c || t?.prevDay?.c || 0;

    const isExtended = session !== 'reg';
    const regChangePercent = t?.todaysChangePerc || (prevClose !== 0 ? ((todayClose - prevClose) / prevClose) * 100 : 0);

    const rsi = rsiRes?.results?.values?.[0]?.value ?? null;
    const dailyResults = (dailyAggs?.results || []).map((r: any) => ({ close: r.c, volume: r.v || 0 }));
    let return3d = 0;
    if (dailyResults.length >= 4) {
        const recentCandles = dailyResults.slice(-4);
        const price3dAgo = recentCandles[0].close;
        const currentClose = recentCandles[recentCandles.length - 1].close;
        return3d = ((currentClose - price3dAgo) / price3dAgo) * 100;
    }

    const sparkline = dailyResults.slice(-20).map((d: any) => d.close);

    // --- 시간외 값: «세션·날짜·체결 시각»으로 고른다 [2026-09-25] ---
    //   ⚠️ 예전 폴백 `t.preMarket?.p || t.prevDay?.c` 는 «전일 종가»를 PRE 가격으로 지어냈다
    //      (스냅샷 preMarket 은 숫자라 `.p` 는 늘 undefined → 곧장 전일 종가). 없으면 null 이다.
    //   ⚠️ 지연 피드(15분)는 04:0x 에 어제 애프터 체결을, 16:0x 에 정규장 체결을 «마지막 체결»로 준다.
    const lastTradeMs = Number(t?.lastTrade?.t) > 0 ? Math.round(Number(t.lastTrade.t) / 1e6) : 0;
    let prePriceToStore: number | null = null;
    if (session === 'pre') {
        prePriceToStore = isTradeInExtSession(lastTradeMs, et.dateString, 'pre') ? (t?.lastTrade?.p || null) : null;
    } else {
        prePriceToStore = truePmRes;   // 화면 날짜의 프리마켓 종가(확정 뒤에만)
    }
    let postPriceToStore: number | null = null;
    if (session === 'post') {
        postPriceToStore = isTradeInExtSession(lastTradeMs, et.dateString, 'post') ? (t?.lastTrade?.p || null) : null;
    } else if (session === 'closed') {
        postPriceToStore = postCloseRes?.price
            ?? (isTradeInExtSession(lastTradeMs, shownDate, 'post') ? (t?.lastTrade?.p || null) : null);
    }
    // PRE·REG: 오늘 애프터는 아직 없다 → null (어제 애프터를 오늘 화면에 쓰지 않는다)

    return {
        symbol,
        price: latestPrice,
        todayClose: todayClose > 0 ? todayClose : null, // [FIX] regular session close (day.c) — separate from latestPrice which may be POST trade
        changePercent: isExtended ? (prevClose !== 0 ? ((latestPrice - prevClose) / prevClose) * 100 : 0) : regChangePercent,
        volume: t?.day?.v,
        prevClose,
        prevDayVolume: t?.prevDay?.v || 0,
        session,
        extended: {
            prePrice: prePriceToStore && prePriceToStore > 0 ? prePriceToStore : null,
            postPrice: postPriceToStore && postPriceToStore > 0 ? postPriceToStore : null,
        },
        rsi,
        return3d,
        vwap: t?.day?.vw,
        sparkline,
        dailyResults,
    };
}

// [PERF] Redis SWR-cached wrapper — SSR hits cache first (~50ms), avoids 4 Polygon calls (~800ms)
// v2 = 시간외 값을 세션·날짜로 고른다(2026-09-25). 프리뷰·운영이 같은 Redis 를 쓰므로 옛 코드가 쓴 값과 섞이지 않게 올린다.
const STOCK_LIGHT_CACHE_PREFIX = 'cache:stockLight:v2:';
const STOCK_LIGHT_TTL_REG = 30;    // 30s during market hours (fresh data)
const STOCK_LIGHT_TTL_EXT = 120;   // 2min during extended/closed (lower API pressure)

export async function getStockDataLight(symbol: string) {
    const cacheKey = `${STOCK_LIGHT_CACHE_PREFIX}${symbol}`;

    // 1. Try cache first (0ms vs 800ms)
    try {
        const cached = await getFromCache<any>(cacheKey);
        if (cached && cached.price > 0) {
            // SWR: Return cached data instantly, trigger background refresh
            const age = Date.now() - (cached._cachedAt || 0);
            const ttlMs = (cached.session === 'reg' ? STOCK_LIGHT_TTL_REG : STOCK_LIGHT_TTL_EXT) * 1000;
            if (age > ttlMs) {
                // Stale → background refresh (fire and forget)
                _fetchStockDataLight(symbol).then(fresh => {
                    if (fresh) setInCache(cacheKey, { ...fresh, _cachedAt: Date.now() }, STOCK_LIGHT_TTL_EXT * 2).catch(() => { });
                }).catch(() => { });
            }
            return cached;
        }
    } catch { }

    // 2. Cache miss: fetch fresh (first load only)
    const fresh = await _fetchStockDataLight(symbol);
    if (fresh) {
        const ttl = fresh.session === 'reg' ? STOCK_LIGHT_TTL_REG : STOCK_LIGHT_TTL_EXT;
        await setInCache(cacheKey, { ...fresh, _cachedAt: Date.now() }, ttl * 2).catch(() => { });
    }
    return fresh;
}
