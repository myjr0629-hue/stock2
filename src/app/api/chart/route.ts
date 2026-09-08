import { NextResponse } from 'next/server';
import { getStockChartData, Range } from '@/services/stockApi';
import { getBuildId } from '@/services/buildIdSSOT'; // [S-56.4.6e]
import { getFromCache, setInCache } from '@/services/redisClient';

/**
 * 일봉에 «거래일»을 찍어 준다.
 *
 * ★ 일봉은 UTC 자정으로 온다: `2026-09-04T00:00:00.000Z`.
 *   클라이언트는 x축·툴팁을 만들 때 이걸 ET 로 변환하는데, UTC 자정을 ET 로
 *   옮기면 **전날 20:00** 이 된다. 그래서 일봉 차트의 날짜가 전부 하루씩
 *   밀려 표시되고 있었다(2026-09-04 봉이 «9/3» 로 보였다).
 *
 *   분봉·시간봉은 서버가 이미 `dateET`/`etDate` 를 실어 보내므로 문제가 없다.
 *   일봉도 같은 계약을 지키게 한다 — 클라이언트가 «시간대를 다시 계산»할 일이
 *   없어야 한다. 정규화는 응답 직전 한 곳에서 한다.
 */
function stampTradingDate(rows: any): any {
    if (!Array.isArray(rows)) return rows;
    const ET = 'America/New_York';
    const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const out = rows.map((r: any) => {
        if (!r || r.dateET) return r;                       // 1D 경로는 이미 실어 보낸다
        const iso = String(r.date ?? '');
        // ① 일봉 — UTC 자정 도장. 그 «날짜 자체»가 거래일이다(시간대 변환 금지).
        const daily = /^(\d{4}-\d{2}-\d{2})T00:00:00/.exec(iso);
        if (daily) return { ...r, etDate: daily[1], dateET: daily[1].slice(5).replace('-', '/') };
        // ② 시간봉·분봉 — ET 로 옮겨 «MM/DD HH:MM ET» (1D 경로와 같은 형식)
        const ms = Date.parse(iso);
        if (!Number.isFinite(ms)) return r;
        const d = new Date(ms);
        const p = timeFmt.formatToParts(d);
        const g = (k: string) => p.find((x) => x.type === k)?.value ?? '';
        return { ...r, etDate: dayFmt.format(d), dateET: `${g('month')}/${g('day')} ${g('hour')}:${g('minute')} ET` };
    });
    // sessionMaskDebug 같은 배열 부착 속성을 잃지 않는다
    for (const k of Object.keys(rows as object)) {
        if (!/^\d+$/.test(k) && k !== 'length') (out as any)[k] = (rows as any)[k];
    }
    return out;
}


// [FIX] force-dynamic — 차트는 시간/세션에 따라 결과가 달라지므로 CDN 정적 캐시 불가
// 이전 revalidate=30이 브라우저 디스크 캐시와 결합되어 Ctrl+Shift+R 없이는 구 데이터 표시되는 버그 유발
export const dynamic = 'force-dynamic';

// ══════════════════════════════════════════════════════════════
// ★★ [2026-09-04] CDN 엣지 캐시 — 「한국에서 미국까지」가 바닥이었다.
//
//   실측(서울→iad1): 297바이트짜리 /api/market/status 가 **0.66초**.
//   55KB 차트도 캐시 히트면 0.645초 — 즉 **우리 코드가 아니라 왕복 자체**가
//   바닥이다(TLS 핸드셰이크만 0.30초). 서버를 아무리 빠르게 해도 못 넘는다.
//
//   그런데 1D 차트는 `no-store, no-cache` 로 **CDN 캐시를 스스로 금지**하고
//   있었다. 이유는 주석대로 「revalidate=30 이 브라우저 디스크 캐시와 결합돼
//   Ctrl+Shift+R 없이는 구 데이터가 보이던 버그」 — 그건 **브라우저** 문제였는데
//   CDN 까지 같이 껐다.
//
//   둘을 분리한다:
//     max-age=0        → 브라우저는 매번 확인한다(그 버그가 안 돌아온다)
//     s-maxage=30      → CDN(서울 엣지)은 30초 동안 자기가 답한다
//     stale-while-revalidate → 만료돼도 즉시 주고 뒤에서 갱신
//   한국 사용자의 차트가 «미국 왕복 650ms» 에서 «엣지 응답» 으로 바뀐다.
// ══════════════════════════════════════════════════════════════
// ⚠️ `force-dynamic` 라우트에서는 Vercel 이 `Cache-Control` 의 **s-maxage 를 벗겨 낸다**
//   (실측: 보낸 건 `public, max-age=0, s-maxage=30, swr=120` 인데 응답엔 `public, max-age=0`
//    만 남고 x-vercel-cache 는 계속 MISS). 그래서 엣지 전용 헤더를 따로 쓴다 —
//   `Vercel-CDN-Cache-Control` 은 벗겨지지 않고, 브라우저엔 전달되지도 않는다.
const CHART_EDGE_CACHE = 'public, max-age=0, must-revalidate';
const CHART_CDN_CACHE = 'public, s-maxage=30, stale-while-revalidate=120';
const CHART_CDN_CACHE_LONG = 'public, s-maxage=120, stale-while-revalidate=600';
/** 브라우저용 + 엣지용을 함께 실어 보낸다. */
const chartHeaders = (isOneDay: boolean, sparse = false): Record<string, string> => sparse
    ? { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    : {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': CHART_EDGE_CACHE,
        'CDN-Cache-Control': isOneDay ? CHART_CDN_CACHE : CHART_CDN_CACHE_LONG,
        'Vercel-CDN-Cache-Control': isOneDay ? CHART_CDN_CACHE : CHART_CDN_CACHE_LONG,
    };


export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    /**
     * ★ range 는 «문 앞에서» 정규화한다.
     *
     * 예전엔 받은 값을 그대로 `range as Range` 로 넘겼다. `1D`(대문자)처럼
     * 목록에 없는 값이 오면 아래 계층이 기본 분기로 빠져 **5년치 일봉 1,254개**를
     * 돌려주고, 그게 `chart:v3:SYM:1D` 로 캐시까지 됐다.
     * 200 OK 에 데이터도 «있어서» 아무 검사에도 안 걸린다 — 조용히 틀리는 종류다.
     * (앱은 소문자로 보내서 지금까지 안 물렸을 뿐이다.)
     */
    const RANGES: Range[] = ['1d', '1w', '1m', '3m', '6m', '1y', 'ytd', 'max'];
    const rawRange = (searchParams.get('range') || '1d').trim().toLowerCase();
    const range: Range = (RANGES as string[]).includes(rawRange) ? (rawRange as Range) : '1d';

    if (!symbol) {
        return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    // ══════════════════════════════════════════════════════════════
    // ★★ [2026-09-04] 「차트만 늦다」 — 60초마다 누군가는 3초를 혼자 뒤집어썼다.
    //
    //   캐시 수명이 60초였고, 만료된 뒤 **처음 온 사람**이 벤더 왕복 전체를
    //   기다렸다. 실측: GOOGL 콜드 3.52s · OXY 1.45s (웜은 0.72~1.15s).
    //   그 «처음 온 사람»이 대표였다. 인기 종목은 트래픽이 데워 주지만
    //   OXY 같은 종목은 매번 그 사람이 된다.
    //
    //   → 신선도와 보관을 **분리한다.**
    //     · FRESH  60초 : 이 안이면 그냥 준다
    //     · 보관   10분 : 지났어도 **즉시 주고** 뒤에서 갱신한다(SWR)
    //   기다리는 사람이 없어진다. 최악이 3.5초에서 «옛 값 + 50ms» 가 된다.
    //
    //   ⚠️ 세션 전환(REG→POST)만은 예외다 — 그때는 봉의 «모양»이 달라지므로
    //     옛 것을 주면 틀린 그림이다. 그 경우에만 기다린다.
    // ══════════════════════════════════════════════════════════════
    const CHART_FRESH_MS = range === '1d' ? 60_000 : 600_000;
    const CHART_CACHE_TTL = range === '1d' ? 600 : 3600;   // 보관(초) — FRESH 보다 훨씬 길게
    // [2026-09-07] v1 → v2: 1D 응답에 «본장 봉»이 들어오게 고쳤다(그 전엔 PRE/POST 만).
    //   키를 안 올리면 옛 페이로드가 최대 10분 동안 200 OK 로 나가고,
    //   프로덕션 트래픽이 계속 그 값으로 덮어써서 «고쳤는데 그대로»가 된다.
    // v4 — 창 기준을 UTC→ET 로 바꾸고 세션 수로 자르므로 «내용»이 달라진다.
    //      키를 안 올리면 옛 페이로드가 200 OK 로 계속 나간다.
    const cacheKey = `chart:v5:${symbol}:${range}`;

    /** 백그라운드 갱신. 응답을 붙잡지 않는다. */
    const refreshInBackground = () => {
        (async () => {
            try {
                const fresh = await getStockChartData(symbol, range);
                if (fresh.length >= 5) {
                    await setInCache(cacheKey, {
                        data: fresh,
                        sessionMaskDebug: (fresh as any).sessionMaskDebug || null,
                        _builtAt: Date.now(),
                    }, CHART_CACHE_TTL);
                }
            } catch { /* 다음 요청이 다시 시도한다 */ }
        })();
    };
    try {
        const cached = await getFromCache<any>(cacheKey);
        if (cached) {
            // [SESSION-AWARE CACHE] For 1D charts, detect session transitions (e.g. REG→POST)
            // If the cached data was built during a different session, bypass cache and fetch fresh.
            // This ensures POST-market chart appears immediately when entering from REG session.
            if (range === '1d' && cached.sessionMaskDebug?.currentSession) {
                const { getETNow, getSessionType } = await import('@/services/timezoneUtils');
                const et = getETNow();
                // [FIX] Check holidays so chart API doesn't think it's POST on Memorial Day etc.
                const CHART_HOLIDAYS: Record<string, boolean> = {
                    '01-01': true, '01-19': true, '02-16': true, '04-03': true,
                    '05-25': true, '06-19': true, '07-03': true, '09-07': true,
                    '11-26': true, '12-25': true
                };
                const etDateKey = `${String(et.month).padStart(2,'0')}-${String(et.day).padStart(2,'0')}`;
                const isHoliday = !!CHART_HOLIDAYS[etDateKey];
                const liveSession = getSessionType(et.hour, et.minute, et.isWeekend, isHoliday);
                const cachedSession = cached.sessionMaskDebug.currentSession;

                if (liveSession !== 'CLOSED' && cachedSession !== liveSession) {
                    // Session mismatch — skip cache, fetch fresh from Polygon
                    console.log(`[Chart] Session mismatch for ${symbol}: cached=${cachedSession}, live=${liveSession} — bypassing cache`);
                    // Fall through to Polygon fetch below
                } else {
                    // Same session — serve from cache
                    const ageMs = Date.now() - Number(cached._builtAt || 0);
                    if (ageMs > CHART_FRESH_MS) refreshInBackground();   // 오래됐으면 뒤에서 갱신
                    const buildId = getBuildId();
                    return new Response(JSON.stringify({
                        data: stampTradingDate(cached.data),
                        meta: { buildId, timestampISO: new Date().toISOString(), sessionMaskDebug: cached.sessionMaskDebug, _cached: true, _ageMs: ageMs },
                        range, symbol, count: cached.data?.length || 0
                    }), {
                        status: 200,
                        headers: chartHeaders(range === '1d')
                    });
                }
            } else {
                // Non-1D range or no session info — always serve from cache
                const ageMs = Date.now() - Number(cached._builtAt || 0);
                if (ageMs > CHART_FRESH_MS) refreshInBackground();   // 오래됐으면 뒤에서 갱신
                const buildId = getBuildId();
                return new Response(JSON.stringify({
                    data: stampTradingDate(cached.data),
                    meta: { buildId, timestampISO: new Date().toISOString(), sessionMaskDebug: cached.sessionMaskDebug, _cached: true, _ageMs: ageMs },
                    range, symbol, count: cached.data?.length || 0
                }), {
                    status: 200,
                    headers: chartHeaders(range === '1d')
                });
            }
        }
    } catch { /* continue to Polygon */ }

    try {
        const data = stampTradingDate(await getStockChartData(symbol, range));

        // [SMART CACHE BYPASS] Check if data is sparse (e.g. < 5 points, usually just a synthetic anchor)
        const isSparseData = data.length < 5;

        // [S-53.5] Extract sessionMaskDebug from data if present
        const sessionMaskDebug = (data as any).sessionMaskDebug || null;
        const buildId = getBuildId();

        // [S-55.10a] Enforce SSOT: Overwrite sessionMaskDebug.buildId with API buildId
        if (sessionMaskDebug) {
            sessionMaskDebug.buildId = buildId;
        }

        // [AWS] Cache to ElastiCache ONLY if data is sufficient (Prevents 5-minute trap)
        if (!isSparseData) {
            try { await setInCache(cacheKey, { data, sessionMaskDebug, _builtAt: Date.now() }, CHART_CACHE_TTL); } catch { /* non-critical */ }
        }

        // [S-52.2.3] Inject build metadata for staleness detection
        const response = {
            data,
            meta: {
                buildId,
                timestampISO: new Date().toISOString(),
                sessionMaskDebug // [S-53.5] Chart session masking diagnostic
            },
            range,
            symbol,
            count: data.length
        };

        // [FIX] 1D 차트는 브라우저/CDN 캐시 금지 — 항상 신선한 데이터
        // 장기 차트(5D+)만 CDN 캐시 허용
        // 데이터가 빈약하면(합성 앵커 한두 점) 캐시하지 않는다 — 그걸 30초 굳히면
        // 모든 사용자가 빈 차트를 본다.
        const outHeaders = chartHeaders(range === '1d', isSparseData);

        return new Response(JSON.stringify(response), {
            status: 200,
            headers: outHeaders
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 });
    }
}

