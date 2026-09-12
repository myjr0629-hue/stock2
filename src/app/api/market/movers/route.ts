import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';
import { getFromCache, setInCache } from '@/services/redisClient';
import { applySplitGuard } from '@/services/splitGuard';

export const dynamic = 'force-dynamic';

// ⚠️ 2026-09-05: 여기 `getSpark(up)` 이 **방향별 고정 배열 2개**를 돌려주고 있었다.
//    상승 종목은 전부 같은 우상향 지그재그, 하락 종목은 전부 같은 우하향 —
//    화면(dash TOP MOVERS)에는 «오늘의 흐름»처럼 보였지만 소스에 박아 둔 숫자였다.
//    폴백이 아니라 **정규 경로**가 상수였다는 점이 더 나쁘다.
//    실측 일중 히스토리는 `/api/chart?symbol=X&range=1d`(종목당 1콜)로 받을 수 있으나
//    무버 목록은 최대 20종목이라 비용 판단이 따로 필요하다. 그때까지는 선을 그리지
//    않는다 — 없는 것을 지어내지 않는다. (소비처 dash/page.tsx 가 spark 없으면 미렌더)


// ══════════════════════════════════════════════════════════════════════
// ★ [2026-09-09] 마감 후에는 «정규장 종가»가 정본이다.
//
//   실측(2026-09-08 23:30 ET) — 같은 순간, 같은 종목인데 화면마다 달랐다:
//     /api/live/quotes    NVDA 225.73 (-2.01%)  SPY 765.96  AMD 505.74
//     /api/market/movers  NVDA 225.26 (-2.22%)  SPY 765.40  AMD 505.61
//
//   원인은 벤더 스냅샷의 `day.c` 다. 종목에 따라 시간외 체결로 갱신되는데,
//   TSLA 는 갱신되지 않아 값이 같았다 — **일부만 틀려서** 눈에 안 띄었다.
//   getRegularChangePercent 가 todaysChangePerc 를 피한 것도 같은 이유인데,
//   정작 그 함수가 믿고 쓰는 day.c 자체가 오염돼 있었다.
//
//   전 종목 EOD 스냅샷에는 그 세션의 «확정 정규장 종가»가 있다(12,512종목).
//   그 날짜가 지금 표시 중인 세션과 같을 때만 덮어쓴다 — 장중에는 EOD 가
//   전일치라 날짜가 안 맞아 자연히 적용되지 않는다.
// ══════════════════════════════════════════════════════════════════════
const EOD_SNAPSHOT_KEY = 'intrinio:eod:snapshot';
type EodCloses = { date: string; rows: Map<string, { c: number; chgPct: number; v: number }> };
let _eodCache: { at: number; data: EodCloses | null } | null = null;

async function readEodCloses(): Promise<EodCloses | null> {
    if (_eodCache && Date.now() - _eodCache.at < 5 * 60_000) return _eodCache.data;
    let data: EodCloses | null = null;
    try {
        const proxy = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
        const auth = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || 'signum-redis-proxy-2026';
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        try {
            const res = await fetch(`${proxy}/get?key=${encodeURIComponent(EOD_SNAPSHOT_KEY)}`, {
                headers: { Authorization: `Bearer ${auth}` }, signal: ctrl.signal, cache: 'no-store',
            });
            if (res.ok) {
                const raw = await res.json();
                const v = typeof raw?.result === 'string' ? JSON.parse(raw.result) : (raw?.result ?? raw?.value);
                if (v?.date && Array.isArray(v.rows)) {
                    const rows = new Map<string, { c: number; chgPct: number; v: number }>();
                    // 행 모양: [ticker, o, h, l, c, v, chg, chgPct]
                    for (const r of v.rows) {
                        const t = String(r?.[0] || '').toUpperCase();
                        const c = Number(r?.[4]);
                        if (t && Number.isFinite(c) && c > 0) rows.set(t, { c, chgPct: Number(r?.[7]) || 0, v: Number(r?.[5]) || 0 });
                    }
                    data = { date: String(v.date), rows };
                }
            }
        } finally { clearTimeout(timer); }
    } catch { data = null; }
    _eodCache = { at: Date.now(), data };
    return data;
}

/**
 * 지금 정규장이 «열려 있는가» (평일 09:30~16:00 ET).
 *
 * 날짜를 맞춰 비교하려다 주말·휴장·자정 넘김에서 계속 어긋났다.
 * 물어야 할 것은 «오늘이 며칠인가»가 아니라 «지금 값이 살아 움직이는가»다.
 *   · 열려 있다  → EOD 는 직전 세션이다. 덮으면 안 된다.
 *   · 닫혀 있다  → EOD 가 곧 «마지막으로 끝난 세션»이다. 그것이 정본이다.
 */
function isRegularSessionOpen(): boolean {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return false;
    const m = d.getHours() * 60 + d.getMinutes();
    return m >= 9 * 60 + 30 && m < 16 * 60;
}

/**
 * 정규장이 닫혀 있으면 «마지막으로 끝난 세션»으로 목록을 다시 만든다.
 *
 * 덮어쓰기만으로는 부족했다. 자정(ET)을 넘기면 벤더 스냅샷이 새 세션으로
 * 리셋되어 **유니버스 자체가 얇아진다** — 실측 2026-09-09 00:45 ET: 상위 20이
 * 10으로 줄고 NVDA·SPY·TSLA·AAPL 이 통째로 빠졌으며, 그 자리를 시간외에만
 * 움직인 잡주(ZCSH·LHSW)가 채웠다. **없는 종목은 덮을 수도 없다.**
 * 게다가 거래량이 새 세션 것이라 거래대금 순위가 무너지고(META 1,562,715 vs
 * 실제 18,909,714), 그 목록을 먹는 WIM 로스터가 「오늘은 데이터가 없어요」가 됐다.
 *
 * EOD 스냅샷에는 그 세션 «전체»(12,512종목)의 종가·거래량·등락률이 있다.
 * 닫혀 있는 동안은 그걸로 목록을 만든다 — 새벽 몇 시에 열어도 같은 답이 나온다.
 */
/**
 * 마지막으로 «끝난» 정규장 세션 날짜 (ET, YYYY-MM-DD).
 *
 * ★ 2026-09-12 대표 지적: 마켓 무버의 등락률이 틀렸다.
 *   실측 — 화면 SPY $757.83 / −0.60%, MU $977.41 / −4.90%.
 *   외부 대조 실제값 — SPY 764.29(+0.85%), MU 975.26(−0.22%).
 *   화면에 찍힌 값은 «직전 세션(9/10)의 종가»였고 등락률은 그보다 한 세션 더 전 기준이었다.
 *   MU 상세 화면은 정상($975.26 / −0.22%)이었다 — 그 화면은 이 덮어쓰기를 안 타기 때문이다.
 *
 *   범인은 아래 applyRegularClose 의 전제였다:
 *     「닫혀 있다 → EOD 가 곧 마지막으로 끝난 세션이다」
 *   그런데 **벌크 EOD 는 T+1 이다**(scripts/finra-offexchange.js 주석에 이미 적혀 있었다).
 *   마감 직후에는 EOD 가 «전날치»라, 그대로 덮으면 화면이 한 세션 통째로 밀린다.
 *
 * 휴장일은 판별하지 않는다. 판별 못 해 날짜가 어긋나면 «덮지 않는» 쪽으로 실패하므로
 * 안전하다 — 틀린 숫자를 보여주느니 살아 있는(적을 수도 있는) 값을 그대로 둔다.
 */
function lastCompletedSessionDateET(): string {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const d = new Date(now);
    const minutes = now.getHours() * 60 + now.getMinutes();
    const dow = now.getDay();
    const finishedToday = dow >= 1 && dow <= 5 && minutes >= 16 * 60;
    if (!finishedToday) d.setDate(d.getDate() - 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 진단용 — 마지막 판정 결과를 응답 meta 에 실어 «조용히 틀리는» 것을 막는다. */
let _lastEodVerdict: { eodDate: string | null; expected: string; applied: boolean } | null = null;

const CLOSED_MIN_UNIVERSE = 200;        // 이보다 얇으면 EOD 를 믿지 않는다
const CLOSED_MIN_VALUE = 10_000_000;    // 등락 순위에서 잡주를 걸러내는 최소 거래대금

async function applyRegularClose<T extends Record<string, any[]>>(lists: T): Promise<T> {
    if (isRegularSessionOpen()) return lists;   // 장중엔 EOD 가 직전 세션이다 — 덮지 않는다
    const eod = await readEodCloses();
    const expected = lastCompletedSessionDateET();
    if (!eod) { _lastEodVerdict = { eodDate: null, expected, applied: false }; return lists; }

    // ★ 날짜 게이트 — EOD 가 «마지막으로 끝난 세션»이 아니면 절대 덮지 않는다.
    //   벌크 EOD 는 T+1 이라 마감 직후엔 한 세션 뒤처져 있다. 그대로 덮으면
    //   직전 세션 종가가 «현재가»로, 그보다 한 세션 전 등락률이 «오늘 등락률»로 나간다.
    if (eod.date !== expected) {
        _lastEodVerdict = { eodDate: eod.date, expected, applied: false };
        return lists;
    }
    _lastEodVerdict = { eodDate: eod.date, expected, applied: true };

    const rows: any[] = [];
    for (const [t, e] of eod.rows) {
        if (!isCommonTickerSymbol(t)) continue;
        if (!(e.c >= 1) || !(e.v >= 10000)) continue;
        const denom = 1 + e.chgPct / 100;
        rows.push({
            ticker: t,
            price: e.c,
            prevClose: denom !== 0 ? e.c / denom : e.c,
            changePercent: e.chgPct,
            volume: e.v,
            value: e.v * e.c,
            up: e.chgPct >= 0,
            spark: null,
            regularCloseFrom: eod.date,
        });
    }
    if (rows.length < CLOSED_MIN_UNIVERSE) return lists;   // 못 믿을 만큼 얇다 — 원래 것을 둔다

    const liquid = rows.filter((r) => r.value >= CLOSED_MIN_VALUE);
    return {
        value: [...rows].sort(byTradingValue).slice(0, 30),
        gainers: liquid.filter((r) => r.changePercent > 0).sort(byGainers).slice(0, 30),
        losers: liquid.filter((r) => r.changePercent < 0).sort(byLosers).slice(0, 30),
    } as unknown as T;
}

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
    // 기준선을 응답에 실어 둔다 — 없으면 분할 보정이 등락률에서 «유도»해야 한다.
    prevClose: toNumber(t.prevDay?.c),
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

        // ⚠️ 응답 «직전»에 정규화한다 — 캐시가 옛 모양을 들고 있기 때문이다.
        //    getSpark() 를 지워도 last_good:v4 에 7일짜리 사본이 남아 있어
        //    주말/휴장에는 지어낸 상수 배열([5,6,5.5,...])이 그대로 200 OK 로 나갔다.
        //    키를 올리면 주말엔 무버가 통째로 빈다 → 읽는 쪽에서 털어낸다.
        // ⚠️ 역분할 미반영 걸러내기 — 정규화와 «같은 자리»에서 한다.
        //    가격은 분할 후인데 기준선이 분할 전이면 +2051% 같은 숫자가 200 OK 로 나간다
        //    (2026-09-09 실측: GTBP·LRHC·IGR). 벤더 분할 이력으로 확인해 보정하고,
        //    확인 안 되면 목록에서 뺀다. 의심 종목이 없는 날은 조회 0건이라 비용이 없다.
        const originalTs = cachedData?.ts ?? Date.now();
        // 정규장 종가 우선 — 시간외가 섞인 day.c 를 바로잡는다(분할 보정보다 먼저).
        const regular = await applyRegularClose({
            value: cachedData?.value ?? [],
            gainers: cachedData?.gainers ?? [],
            losers: cachedData?.losers ?? [],
        });
        const guarded = await applySplitGuard(regular);
        // ts 는 «자료가 만들어진 시각»이다. 보정 때문에 지금 시각으로 바뀌면
        // 화면이 오래된 자료를 방금 것으로 오해한다.
        // 보정으로 등락률 부호가 바뀔 수 있다(역분할 종목은 대개 실제로는 소폭 하락이다).
        // 목록 «소속»은 등락률로 정해지므로 보정 뒤에 다시 거르고 정렬해야 한다 —
        // 안 하면 「상승 목록에 하락 종목」이 남는다(실측 2026-09-09).
        cachedData = {
            value: guarded.value,   // 거래대금 정렬이라 등락률 보정과 무관
            gainers: (guarded.gainers ?? []).filter((m: any) => m.changePercent > 0).sort(byGainers),
            losers: (guarded.losers ?? []).filter((m: any) => m.changePercent < 0).sort(byLosers),
            ts: originalTs,
        };

        const strip = (rows: any[]) =>
            (Array.isArray(rows) ? rows : []).slice(0, limit).map((m: any) =>
                m && m.spark ? { ...m, spark: null } : m
            );

        if (type === 'value') {
            return NextResponse.json({ movers: strip(cachedData.value) });
        } else if (type === 'gainers') {
            return NextResponse.json({ movers: strip(cachedData.gainers) });
        } else if (type === 'losers') {
            return NextResponse.json({ movers: strip(cachedData.losers) });
        } else {
            // Return all three arrays
            return NextResponse.json({
                value: strip(cachedData.value),
                gainers: strip(cachedData.gainers),
                losers: strip(cachedData.losers),
                ts: cachedData.ts,
                // ★ 진단을 응답에 싣는다 — 「조용히 한 세션 밀림」을 다음엔 바로 잡아낸다.
                //   applied=false 면 EOD 가 아직 T+1 지연이라 live 값을 그대로 쓰고 있다는 뜻.
                eod: _lastEodVerdict,
            });
        }
    } catch (err: any) {
        console.error('[Movers API Error]:', err);
        return NextResponse.json({ error: 'Failed to fetch movers data' }, { status: 500 });
    }
}
