/**
 * GET /api/live/technicals?t=NVDA
 *
 * ATR · ADX(+DI/−DI) · OBV · 볼린저 + 합성 지표(변동성 프리미엄).
 * Massive 에 없던 것들이라 이관을 계기로 새로 붙였다.
 *
 * 캐시: 6시간. EOD 기반 지표라 거래일마다 한 번 변한다.
 *       (종목당 4콜이므로 캐시가 없으면 한도를 갉아먹는다)
 */
import { NextRequest, NextResponse } from "next/server";
import { getFromCache, setInCache } from "@/services/redisClient";
import { getAdvancedTechnicals } from "@/services/advancedTechnicals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL = 6 * 3600;

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = (searchParams.get("t") || searchParams.get("ticker") || "").toUpperCase();
    if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

    const price = Number(searchParams.get("price")) || null;
    const iv = Number(searchParams.get("iv")) || null;

    // 캐시 키에 price/iv 를 넣지 않는다 — 그러면 캐시가 사실상 안 걸린다.
    // 대신 그 둘에 의존하는 파생값만 응답 시점에 다시 계산한다.
    // 캐시 키 버전 — 응답 «형태»가 바뀌면 올린다.
    // v1 은 ATR 을 가격 없이 계산해 null 로 굳혀 놨었다(6시간). 키를 안 올리면
    // 고친 코드가 배포돼도 화면은 옛 응답을 계속 본다.
    const key = `tech:adv:v2:${ticker}`;
    try {
        const cached = await getFromCache<any>(key);
        if (cached) {
            return NextResponse.json({ ...cached, _cache: "hit" }, {
                headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=21600" },
            });
        }
    } catch { /* 캐시 실패는 치명적이지 않다 */ }

    try {
        const data = await getAdvancedTechnicals(ticker, price, iv);
        // 부분 실패라도 받은 것은 저장한다. 단 전부 비었으면 캐시하지 않는다
        // (빈 응답을 6시간 굳히면 «데이터 없음»이 고착된다)
        const hasAny = !!(data.atr || data.adx || data.obv || data.bb);
        if (hasAny) setInCache(key, data, TTL).catch(() => { });

        return NextResponse.json({ ...data, _cache: "miss" }, {
            headers: {
                "Cache-Control": hasAny
                    ? "public, s-maxage=1800, stale-while-revalidate=21600"
                    : "no-store",
            },
        });
    } catch (e: any) {
        return NextResponse.json(
            { ticker, error: "technicals-failed", reason: String(e?.message || e).slice(0, 120) },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    }
}
