// src/app/api/ticker/overview/route.ts
// S-56.4.5c: SSOT Ticker Overview API Endpoint with Diagnostics

import { NextRequest, NextResponse } from "next/server";
import { getTickerOverview } from "@/services/tickerOverview";

// [S-56.4.5c] Force Node.js runtime and dynamic rendering for production parity
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker")?.toUpperCase();
    const range = searchParams.get("range") || "1d";
    const extended = searchParams.get("extended") === "true";
    const includeHistory = searchParams.get("history") !== "false";
    const includeNews = searchParams.get("news") !== "false";

    if (!ticker) {
        return NextResponse.json(
            { error: "ticker parameter required", example: "/api/ticker/overview?ticker=NVDA" },
            { status: 400 }
        );
    }

    const startTime = Date.now();

    try {
        const overview = await getTickerOverview(ticker, {
            range,
            extended,
            includeHistory,
            includeNews
        });

        // [S-56.4.5b] Always include diagnostics and use no-store for live data
        return NextResponse.json({
            ...overview,
            _debug: {
                latencyMs: Date.now() - startTime,
                endpoint: "/api/ticker/overview",
                cachePolicy: "no-store"
            }
        }, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "Pragma": "no-cache"
            }
        });
    } catch (e: any) {
        console.error(`[API] /api/ticker/overview error for ${ticker}:`, e.message);

        // Return error with diagnostics structure
        return NextResponse.json(
            {
                error: "Failed to fetch ticker overview",
                message: e.message,
                ticker,
                meta: {
                    buildId: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "local",
                    env: process.env.NODE_ENV,
                    fetchedAt: new Date().toISOString()
                },
                diagnostics: {
                    buildId: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "local",
                    source: "MASSIVE",
                    price: { ok: false, code: e.code || "UNKNOWN", reasonKR: e.reasonKR || e.message },
                    chart: { ok: false, code: e.code || "UNKNOWN", reasonKR: "가격 조회 실패로 차트 불가" },
                    vwap: { ok: false, code: e.code || "UNKNOWN", reasonKR: "가격 조회 실패로 VWAP 불가" },
                    session: { ok: false, code: e.code || "UNKNOWN", reasonKR: "세션 정보 불가" },
                    options: { ok: false, code: e.code || "UNKNOWN", reasonKR: "옵션 조회 불가" },
                    news: { ok: false, code: e.code || "UNKNOWN", reasonKR: "뉴스 조회 불가" }
                }
            },
            {
                status: 500,
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate"
                }
            }
        );
    }
}
