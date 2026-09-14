/**
 * 실물경제 지표 — 고용·물가·정책금리·소비심리.
 *
 * /api/market/macro 는 «가격»만 준다(NQ·SPX·VIX·US10Y·DXY…).
 * 여기는 가격 피드가 절대 주지 않는 축이다.
 *
 * 캐시: 이 계열들은 월간·분기간이다. 매 요청마다 7콜을 벤더에 던질 이유가 없다.
 *   메모리 캐시 6시간 + stale-while-error(벤더가 죽어도 마지막 정상값을 준다).
 *   TTL 을 갱신주기로 착각하지 않는다 — 나이는 «시간»이 아니라 asOf 로 판단한다.
 */
import { NextResponse } from "next/server";
import { getMacroEconomy, type MacroEconomy } from "@/services/macroEconomy";

export const dynamic = "force-dynamic";

const TTL_MS = 6 * 60 * 60 * 1000;

let cache: { at: number; data: MacroEconomy } | null = null;

export async function GET() {
    const now = Date.now();
    if (cache && now - cache.at < TTL_MS && cache.data.metrics.length > 0) {
        return NextResponse.json({
            ...cache.data,
            cached: true,
            cacheAgeSec: Math.round((now - cache.at) / 1000),
        });
    }

    try {
        const data = await getMacroEconomy();
        // 한 계열도 못 받았으면 «성공»이라 하지 않는다. 빈 껍데기를 캐시하면
        // 6시간 동안 화면이 비어 있게 된다.
        if (data.metrics.length === 0) {
            if (cache) {
                return NextResponse.json({
                    ...cache.data, cached: true, degraded: true,
                    cacheAgeSec: Math.round((now - cache.at) / 1000),
                });
            }
            return NextResponse.json({ metrics: [], newestAsOf: null, missing: 7, degraded: true }, { status: 503 });
        }
        cache = { at: now, data };
        return NextResponse.json({ ...data, cached: false, cacheAgeSec: 0 });
    } catch {
        if (cache) {
            return NextResponse.json({
                ...cache.data, cached: true, degraded: true,
                cacheAgeSec: Math.round((now - cache.at) / 1000),
            });
        }
        return NextResponse.json({ error: "economy_unavailable" }, { status: 503 });
    }
}
