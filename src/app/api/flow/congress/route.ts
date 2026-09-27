/**
 * GET /api/flow/congress            — 종목별 신호 (netMid 절대값 순)
 * GET /api/flow/congress?t=NVDA     — 그 종목의 창 안 매수·매도 내역 (신호가 센 바로 그 행들)
 *
 *   &days=90      창(일, 7~365) — 매매일 기준
 *   &limit=N      돌려줄 개수(1~1000). 기본: 목록 60종목 · 종목 상세 40행(앱 화면 기본값 그대로)
 *
 * 응답의 total(자르기 전 개수)·returned(받은 개수)·complete 로 «전부 받았는지»를 판단한다.
 * complete = 원천을 창 시작까지 빠짐없이 받았고(coverage) + limit 으로 잘리지 않았다.
 *
 * 의회 거래 공시 = 다크풀·공매도잔고를 잃은 자리를 메우는 「스마트머니」 축.
 * 근거·한계는 src/services/congressTrades.ts 주석 참조.
 */
import { NextRequest, NextResponse } from "next/server";
import { getFromCache, setInCache } from "@/services/redisClient";
import {
    getCongressTrades, foldByTicker, inWindow, windowStart, coversWindow,
    CONGRESS_CACHE_KEY, CONGRESS_WINDOW_DAYS,
    type CongressFetch,
} from "@/services/congressTrades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 캐시가 빈 순간엔 원천을 페이지 넘겨 받는다(원당 최대 12쪽·전체 30초 시한)
export const maxDuration = 60;

// 공시는 하루 단위로 갱신된다 — 6시간이면 충분하고 호출 예산도 아낀다
const TTL = 6 * 3600;
// 창을 다 못 덮은 수집(페이지 상한·429·시한)은 30분만 두고 다시 시도한다
const PARTIAL_TTL = 30 * 60;
const LASTGOOD_KEY = CONGRESS_CACHE_KEY + ":lastgood";
const LASTGOOD_TTL = 7 * 86400;
const FAIL_KEY = CONGRESS_CACHE_KEY + ":fail";
const FAIL_TTL = 600;

const DEFAULT_SIGNALS = 60;
const DEFAULT_ROWS = 40;
const MAX_LIMIT = 1000;

function parseLimit(v: string | null, def: number): number {
    const n = Math.floor(Number(v));
    return v && Number.isFinite(n) && n > 0 ? Math.min(n, MAX_LIMIT) : def;
}

const usable = (x: any): x is CongressFetch =>
    !!x && Array.isArray(x.trades) && x.trades.length > 0 && !!x.coverage;

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = (searchParams.get("t") || searchParams.get("ticker") || "").toUpperCase().trim();
    const days = Math.max(7, Math.min(Number(searchParams.get("days")) || CONGRESS_WINDOW_DAYS, 365));
    const limit = parseLimit(searchParams.get("limit"), ticker ? DEFAULT_ROWS : DEFAULT_SIGNALS);

    // ★2026-09-23 22:4x 실측(운영 로그): FMP 가 429(호출 한도 초과)를 돌려주자 이 라우트는 «no-data» 를 냈다.
    //   빈 결과를 캐시하지 않는 규칙 때문에 «사용자가 카드를 열 때마다» FMP 를 다시 두드려 한도 초과를 키웠다
    //   (memory: intrinio-quota-broke-the-user-path 와 같은 종류). 두 가지를 더한다:
    //   ① 마지막 정상본(7일)을 따로 두고, 원천이 비면 그것을 «stale» 표시와 함께 준다 — 공시는 하루 단위라 몇 시간 늦어도 뜻이 같다
    //   ② 원천 실패를 10분간 기억해 그동안은 FMP 를 다시 부르지 않는다(사용자 경로가 벤더 한도를 태우지 않게)
    // ★2026-09-27 원천을 페이지 넘겨 받는다(수집 1회 = 원당 최대 12호출). 캐시가 빈 때만 돈다(6시간에 한 번).
    let stale = false;
    let data = await getFromCache<CongressFetch>(CONGRESS_CACHE_KEY).catch(() => null);
    if (!usable(data)) {
        const recentlyFailed = await getFromCache<number>(FAIL_KEY).catch(() => null);
        const fetched = recentlyFailed ? null : await getCongressTrades();
        if (usable(fetched)) {
            data = fetched;
            // 빈 결과를 캐시에 굳히지 않는다 — 「공시 없음」이 6시간 고착된다
            setInCache(CONGRESS_CACHE_KEY, fetched, fetched.coverage.complete ? TTL : PARTIAL_TTL).catch(() => { });
            // 마지막 정상본은 «창을 다 덮은» 수집만 덮어쓴다 — 부분 수집이 완전본을 밀어내지 않게
            const keep = fetched.coverage.complete ? null : await getFromCache<CongressFetch>(LASTGOOD_KEY).catch(() => null);
            if (!usable(keep)) setInCache(LASTGOOD_KEY, fetched, LASTGOOD_TTL).catch(() => { });
        } else {
            if (!recentlyFailed) setInCache(FAIL_KEY, Date.now(), FAIL_TTL).catch(() => { });
            const last = await getFromCache<CongressFetch>(LASTGOOD_KEY).catch(() => null);
            if (usable(last)) { data = last; stale = true; }
        }
    }

    if (!usable(data)) {
        return NextResponse.json(
            { available: false, reason: "no-data", trades: [], signals: [] },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    }

    const { trades, coverage } = data;
    const cut = windowStart(days);
    // 마지막 정상본(stale)은 그 뒤 공시가 빠져 있다 — 창을 덮었어도 «전부»라고 하지 않는다
    const covered = coversWindow(coverage, days) && !stale;

    if (ticker) {
        // 신호(foldByTicker)와 같은 규칙으로 거른 행 — 그래서 total = 매수 + 매도 가 늘 맞는다
        const rows = trades.filter((t) => t.ticker === ticker && inWindow(t, cut));
        const signal = foldByTicker(rows, days)[0] ?? null;
        const out = rows.slice(0, limit);
        return NextResponse.json(
            {
                available: true,
                ticker,
                days,
                windowFrom: cut,
                // 없으면 «없다»고 말한다. 0건과 «조회 실패»는 다르다.
                hasActivity: rows.length > 0,
                ...(stale ? { stale: true } : {}),
                signal,
                total: rows.length,
                returned: out.length,
                truncated: out.length < rows.length,
                complete: covered && out.length === rows.length,
                coverage,
                trades: out,
                _note: "amounts are disclosed as ranges; midpoints are estimates",
            },
            { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=21600" } }
        );
    }

    const signals = foldByTicker(trades, days);
    const out = signals.slice(0, limit);
    return NextResponse.json(
        {
            available: true,
            days,
            windowFrom: cut,
            // count = 창 안에 공시가 있는 종목 수(자르기 전). total 은 같은 값의 명시적 이름.
            count: signals.length,
            total: signals.length,
            returned: out.length,
            truncated: out.length < signals.length,
            complete: covered && out.length === signals.length,
            coverage,
            ...(stale ? { stale: true } : {}),
            signals: out,
            latestDisclosure: trades[0]?.disclosureDate ?? null,
            _note: "amounts are disclosed as ranges; midpoints are estimates",
        },
        { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=21600" } }
    );
}
