import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache, setInCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic';

// ⚠️ 2026-09-05: 여기 `getSpark(up)` 이 **방향별 고정 배열 2개**를 돌려주고 있었다.
//    상승 종목은 전부 같은 우상향 지그재그, 하락 종목은 전부 같은 우하향 —
//    화면(dash TOP MOVERS)에는 «오늘의 흐름»처럼 보였지만 소스에 박아 둔 숫자였다.
//    폴백이 아니라 **정규 경로**가 상수였다는 점이 더 나쁘다.
//    실측 일중 히스토리는 `/api/chart?symbol=X&range=1d`(종목당 1콜)로 받을 수 있으나
//    무버 목록은 최대 20종목이라 비용 판단이 따로 필요하다. 그때까지는 선을 그리지
//    않는다 — 없는 것을 지어내지 않는다. (소비처 dash/page.tsx 가 spark 없으면 미렌더)

const toNumber = (value: any): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const getSnapshotPrice = (t: any): number => {
    return toNumber(t.day?.c) || toNumber(t.lastTrade?.p) || toNumber(t.min?.c) || toNumber(t.prevDay?.c);
};

const getRegularChangePercent = (t: any): number => {
    const prevClose = toNumber(t.prevDay?.c);
    const dayClose = toNumber(t.day?.c);

    // [FIX 2026-07-31] `!== prevClose` 두 조건 제거 — 보합(0.00%)은 결측이 아니다.
    // 정확히 보합인 종목이 이 두 분기를 다 빠져나가 `todaysChangePerc`로 떨어졌는데,
    // 그 값은 시간외를 포함해 **보합 종목을 0이 아닌 등락률로 둔갑**시켰다.
    // 이 함수는 WIM 퀴즈 로스터도 먹이므로 잘못된 등락률이 그대로 문제로 나간다.
    if (dayClose > 0 && prevClose > 0) {
        return ((dayClose - prevClose) / prevClose) * 100;
    }

    // 여기부터는 day 바가 아직 없을 때(장 초반·결측)의 폴백이다.
    const liveLast = toNumber(t.lastTrade?.p) || toNumber(t.min?.c);
    if (liveLast > 0 && prevClose > 0) {
        return ((liveLast - prevClose) / prevClose) * 100;
    }

    return toNumber(t.todaysChangePerc);
};

const isCommonTickerSymbol = (ticker: string): boolean => {
    const likelyWarrantOrUnit = ticker.length === 5 && /[WRU]$/.test(ticker);

    return (
        ticker !== 'ZVZZT' &&
        /^[A-Z]{1,5}$/.test(ticker) &&
        !likelyWarrantOrUnit
    );
};

const isTradableCommonStock = (t: any): boolean => {
    const ticker = String(t?.ticker || '');
    const price = getSnapshotPrice(t);
    const volume = toNumber(t.day?.v) || toNumber(t.prevDay?.v);

    return (
        isCommonTickerSymbol(ticker) &&
        price >= 1 &&
        volume >= 10000
    );
};

function hasMoverSet(data: any): boolean {
    return Boolean(
        data &&
        Array.isArray(data.value) &&
        Array.isArray(data.gainers) &&
        Array.isArray(data.losers) &&
        data.value.length > 0 &&
        data.gainers.length > 0 &&
        data.losers.length > 0
    );
}

const mapTicker = (t: any) => {
  const price = getSnapshotPrice(t);
  const changePercent = getRegularChangePercent(t);
  const volume = toNumber(t.day?.v) || toNumber(t.prevDay?.v);
  const value = volume * price;
  return {
    ticker: t.ticker,
    price,
    changePercent,
    volume,
    value,
    up: changePercent >= 0,
    spark: null,   // 실측 일중 히스토리 연결 전까지 null (위 주석 참조)
  };
};

const byTradingValue = (a: any, b: any) => b.value - a.value;
const byGainers = (a: any, b: any) => b.changePercent - a.changePercent || byTradingValue(a, b);
const byLosers = (a: any, b: any) => a.changePercent - b.changePercent || byTradingValue(a, b);

const formatDateKey = (date: Date): string => {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const getCurrentETDate = (): Date => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());

    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day)));
};

async function fetchRecentGroupedUniverse(): Promise<any[]> {
    const base = getCurrentETDate();
    const sessions: Array<{ date: string; results: any[] }> = [];

    for (let offset = 0; offset < 12 && sessions.length < 2; offset += 1) {
        const date = new Date(base);
        date.setUTCDate(base.getUTCDate() - offset);
        const day = date.getUTCDay();
        if (day === 0 || day === 6) continue;

        const dateStr = formatDateKey(date);
        try {
            const grouped = await fetchMassive(`/v2/aggs/grouped/locale/us/market/stocks/${dateStr}`, {}, true);
            const results = Array.isArray(grouped?.results) ? grouped.results : [];
            if (results.length > 100) {
                sessions.push({ date: dateStr, results });
            }
        } catch (err: any) {
            console.warn(`[Movers API] grouped fallback failed for ${dateStr}:`, err?.message || err);
        }
    }

    if (sessions.length < 2) return [];

    const latest = sessions[0].results;
    const previousCloseByTicker = new Map<string, number>();
    sessions[1].results.forEach((r: any) => {
        if (r?.T && toNumber(r.c) > 0) {
            previousCloseByTicker.set(r.T, toNumber(r.c));
        }
    });

    return latest
        .filter((r: any) => isCommonTickerSymbol(String(r?.T || '')))
        .map((r: any) => {
            const ticker = String(r.T);
            const price = toNumber(r.c);
            const prevClose = previousCloseByTicker.get(ticker) || 0;
            const volume = toNumber(r.v);
            const changePercent = price > 0 && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
            const value = price * volume;

            return {
                ticker,
                price,
                changePercent,
                volume,
                value,
                up: changePercent >= 0,
                spark: null,   // 실측 일중 히스토리 연결 전까지 null (위 주석 참조)
            };
        })
        .filter((m: any) => m.price >= 1 && m.volume >= 10000 && m.value > 0);
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    try {
        // We will try to fetch the cache of all movers.
        const cacheKey = 'market:movers:all:v4';
        const lastGoodKey = 'market:movers:last_good:v4';
        let cachedData = await getFromCache<any>(cacheKey);

        if (!hasMoverSet(cachedData)) {
            // Fetch everything concurrently from Polygon/Massive Client
            // Use cache for full tickers list to avoid massive payloads too frequently, but fresh snapshots for movers
            const [gainersRes, losersRes, tickersRes] = await Promise.all([
                fetchMassive('/v2/snapshot/locale/us/markets/stocks/gainers', {}, false).catch(() => null),
                fetchMassive('/v2/snapshot/locale/us/markets/stocks/losers', {}, false).catch(() => null),
                fetchMassive('/v2/snapshot/locale/us/markets/stocks/tickers', {}, true).catch(() => null)
            ]);

            const rawGainers = gainersRes?.tickers || [];
            const rawLosers = losersRes?.tickers || [];
            const rawTickers = tickersRes?.tickers || [];

            const universe = rawTickers
                .filter(isTradableCommonStock)
                .map(mapTicker)
                .filter((m: any) => m.price > 0 && m.value > 0);

            const hasSnapshotChange = universe.some((m: any) => Math.abs(m.changePercent) >= 0.0001);
            const groupedUniverse = hasSnapshotChange ? [] : await fetchRecentGroupedUniverse();
            const rankingUniverse = groupedUniverse.length > 0 ? groupedUniverse : universe;

            const sourceGainers = rawGainers
                .filter(isTradableCommonStock)
                .map(mapTicker)
                .filter((m: any) => m.changePercent > 0)
                .sort(byGainers);

            const sourceLosers = rawLosers
                .filter(isTradableCommonStock)
                .map(mapTicker)
                .filter((m: any) => m.changePercent < 0)
                .sort(byLosers);

            // Process Trading Value Movers (from full tickers list)
            const value = rankingUniverse
                .slice()
                .sort(byTradingValue)
                .slice(0, 30);

            // The dedicated /gainers /losers snapshots return only ~20 rows each, and
            // isTradableCommonStock trims warrants/units/low-liquidity names down to well
            // under 20 (seen live: 17 gainers, 8 losers). Top up from the full universe
            // (deduped by ticker) so each list reliably fills the requested Top-20 — and
            // this also covers holidays/closed sessions where the dedicated endpoints are empty.
            const topUp = (curated: any[], pool: any[], cmp: (a: any, b: any) => number) => {
                const seen = new Set(curated.map((m: any) => m.ticker));
                const extra = pool.filter((m: any) => !seen.has(m.ticker));
                return [...curated, ...extra].sort(cmp).slice(0, 30);
            };
            const gainers = topUp(sourceGainers, rankingUniverse.filter((m: any) => m.changePercent > 0), byGainers);
            const losers = topUp(sourceLosers, rankingUniverse.filter((m: any) => m.changePercent < 0), byLosers);

            cachedData = { gainers, losers, value, ts: Date.now() };

            if (hasMoverSet(cachedData)) {
                // Cache in Redis for 60 seconds (with jitter applied inside setInCache)
                await setInCache(cacheKey, cachedData, 60);
                // Preserve last regular valid snapshot for weekends/holidays/offline data windows.
                await setInCache(lastGoodKey, cachedData, 7 * 24 * 60 * 60);
            } else {
                const lastGood = await getFromCache<any>(lastGoodKey);
                if (hasMoverSet(lastGood)) {
                    cachedData = lastGood;
                }
            }
        }

        if (type === 'value') {
            return NextResponse.json({ movers: cachedData.value.slice(0, limit) });
        } else if (type === 'gainers') {
            return NextResponse.json({ movers: cachedData.gainers.slice(0, limit) });
        } else if (type === 'losers') {
            return NextResponse.json({ movers: cachedData.losers.slice(0, limit) });
        } else {
            // Return all three arrays
            return NextResponse.json({
                value: cachedData.value.slice(0, limit),
                gainers: cachedData.gainers.slice(0, limit),
                losers: cachedData.losers.slice(0, limit),
                ts: cachedData.ts
            });
        }
    } catch (err: any) {
        console.error('[Movers API Error]:', err);
        return NextResponse.json({ error: 'Failed to fetch movers data' }, { status: 500 });
    }
}
