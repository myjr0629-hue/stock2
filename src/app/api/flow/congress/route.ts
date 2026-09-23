/**
 * GET /api/flow/congress            — 종목별 신호 (netMid 절대값 순)
 * GET /api/flow/congress?t=NVDA     — 그 종목의 개별 거래 내역
 *
 * 의회 거래 공시 = 다크풀·공매도잔고를 잃은 자리를 메우는 「스마트머니」 축.
 * 근거·한계는 src/services/congressTrades.ts 주석 참조.
 */
import { NextRequest, NextResponse } from "next/server";
import { getFromCache, setInCache } from "@/services/redisClient";
import { getCongressTrades, foldByTicker, CONGRESS_CACHE_KEY } from "@/services/congressTrades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 공시는 하루 단위로 갱신된다 — 6시간이면 충분하고 호출 예산도 아낀다
const TTL = 6 * 3600;
const LASTGOOD_KEY = CONGRESS_CACHE_KEY + ":lastgood";
const LASTGOOD_TTL = 7 * 86400;
const FAIL_KEY = CONGRESS_CACHE_KEY + ":fail";
const FAIL_TTL = 600;

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = (searchParams.get("t") || searchParams.get("ticker") || "").toUpperCase().trim();
    const days = Math.max(7, Math.min(Number(searchParams.get("days")) || 90, 365));

    // ★2026-09-23 22:4x 실측(운영 로그): FMP 가 429(호출 한도 초과)를 돌려주자 이 라우트는 «no-data» 를 냈다.
    //   빈 결과를 캐시하지 않는 규칙 때문에 «사용자가 카드를 열 때마다» FMP 를 다시 두드려 한도 초과를 키웠다
    //   (memory: intrinio-quota-broke-the-user-path 와 같은 종류). 두 가지를 더한다:
    //   ① 마지막 정상본(7일)을 따로 두고, 원천이 비면 그것을 «stale» 표시와 함께 준다 — 공시는 하루 단위라 몇 시간 늦어도 뜻이 같다
    //   ② 원천 실패를 10분간 기억해 그동안은 FMP 를 다시 부르지 않는다(사용자 경로가 벤더 한도를 태우지 않게)
    let stale = false;
    let trades = await getFromCache<any[]>(CONGRESS_CACHE_KEY).catch(() => null);
    if (!Array.isArray(trades) || !trades.length) {
        const recentlyFailed = await getFromCache<number>(FAIL_KEY).catch(() => null);
        trades = recentlyFailed ? [] : await getCongressTrades();
        if (trades.length) {
            // 빈 결과를 캐시에 굳히지 않는다 — 「공시 없음」이 6시간 고착된다
            setInCache(CONGRESS_CACHE_KEY, trades, TTL).catch(() => { });
            setInCache(LASTGOOD_KEY, trades, LASTGOOD_TTL).catch(() => { });
        } else {
            if (!recentlyFailed) setInCache(FAIL_KEY, Date.now(), FAIL_TTL).catch(() => { });
            const last = await getFromCache<any[]>(LASTGOOD_KEY).catch(() => null);
            if (Array.isArray(last) && last.length) { trades = last; stale = true; }
        }
    }

    if (!trades.length) {
        return NextResponse.json(
            { available: false, reason: "no-data", trades: [], signals: [] },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    }

    if (ticker) {
        const rows = trades.filter((t: any) => t.ticker === ticker);
        const signal = foldByTicker(rows as any, days)[0] ?? null;
        return NextResponse.json(
            {
                available: true,
                ticker,
                // 없으면 «없다»고 말한다. 0건과 «조회 실패»는 다르다.
                hasActivity: rows.length > 0,
                ...(stale ? { stale: true } : {}),
                signal,
                trades: rows.slice(0, 40),
                _note: "amounts are disclosed as ranges; midpoints are estimates",
            },
            { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=21600" } }
        );
    }

    const signals = foldByTicker(trades as any, days);
    return NextResponse.json(
        {
            available: true,
            days,
            count: signals.length,
            ...(stale ? { stale: true } : {}),
            signals: signals.slice(0, 60),
            latestDisclosure: trades[0]?.disclosureDate ?? null,
            _note: "amounts are disclosed as ranges; midpoints are estimates",
        },
        { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=21600" } }
    );
}
