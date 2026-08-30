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

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = (searchParams.get("t") || searchParams.get("ticker") || "").toUpperCase().trim();
    const days = Math.max(7, Math.min(Number(searchParams.get("days")) || 90, 365));

    let trades = await getFromCache<any[]>(CONGRESS_CACHE_KEY).catch(() => null);
    if (!Array.isArray(trades) || !trades.length) {
        trades = await getCongressTrades();
        // 빈 결과를 캐시에 굳히지 않는다 — 「공시 없음」이 6시간 고착된다
        if (trades.length) setInCache(CONGRESS_CACHE_KEY, trades, TTL).catch(() => { });
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
            signals: signals.slice(0, 60),
            latestDisclosure: trades[0]?.disclosureDate ?? null,
            _note: "amounts are disclosed as ranges; midpoints are estimates",
        },
        { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=21600" } }
    );
}
