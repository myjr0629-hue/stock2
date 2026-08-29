/**
 * GET /api/flow/options-eod?t=NVDA
 *
 * 계약별 미결제약정 증감 기반 「이상 옵션 활동」.
 *
 * ══════════════════════════════════════════════════════════════════════
 * [기존 UOA 와 무엇이 다른가]
 *   지금 화면의 이상 활동은 **거래량**만 본다. 그런데 거래량은
 *   신규 진입인지 청산인지 구분하지 못한다. 실측(NVDA 8/28):
 *
 *     C $225 만기당일  거래 414,949  OI −14,067   ← 거래량 1위인데 청산
 *     C $200 2027-01   거래  22,552  OI +188,333  ← 거래량 4위인데 대형 신규
 *
 *   미결제약정 증감이 그 둘을 가른다. 여기서는 그것을 기준으로 정렬한다.
 *
 * [출처]  EC2 가 매일 03:30 ET 이후 벤더 벌크에서 적재한 `intrinio:options:eod`.
 *   장중 실시간이 아니라 **전일 마감 기준**이다 — 화면에 그렇게 표시해야 한다.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPT_KEY = "intrinio:options:eod";

/** 계약 코드에서 사람이 읽을 정보를 뽑는다 — 저장 시 이미 분해해 두었지만 방어적으로 */
type TopContract = {
    c: string; k: number; e: string; t: "C" | "P";
    v: number; oi: number; d: number | null; iv: number; dl: number;
};

async function readOptions(): Promise<any | null> {
    const proxy = process.env.EC2_REDIS_PROXY_URL || "http://52.23.98.13:8081";
    const key = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || "signum-redis-proxy-2026";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(`${proxy}/get?key=${encodeURIComponent(OPT_KEY)}`, {
            headers: { Authorization: `Bearer ${key}` },
            signal: controller.signal,
            cache: "no-store",
        });
        if (!res.ok) return null;
        const raw = await res.json();
        const val = typeof raw?.result === "string" ? JSON.parse(raw.result) : raw?.result;
        return val?.tickers ? val : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = (searchParams.get("t") || searchParams.get("ticker") || "").toUpperCase();
    if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

    const data = await readOptions();
    if (!data) {
        // 없는 것을 0 으로 만들지 않는다 — 화면이 «활동 없음»이라고 말하면 안 된다
        return NextResponse.json(
            { ticker, available: false, reason: "options-eod-not-loaded" },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    }

    const v = data.tickers[ticker];
    if (!v) {
        return NextResponse.json(
            { ticker, available: false, reason: "ticker-not-in-universe", date: data.date },
            { status: 200, headers: { "Cache-Control": "public, s-maxage=600" } }
        );
    }

    const top: TopContract[] = Array.isArray(v.top) ? v.top : [];
    // 신규 진입 / 청산 / 단타 로 나눈다 — 이 구분이 이 API 의 존재 이유다
    const classify = (c: TopContract) => {
        if (c.d == null) return "UNKNOWN";       // 직전일 데이터가 없어 판단 불가
        if (c.d > 0) return "OPENING";           // 미결제약정 증가 = 새 포지션
        if (c.d < 0) return "CLOSING";           // 감소 = 청산
        return "INTRADAY";                        // 그대로 = 당일 사고팜
    };

    const contracts = top.map((c) => ({
        contract: c.c,
        type: c.t === "C" ? "call" : "put",
        strike: c.k,
        expiration: c.e,
        volume: c.v,
        openInterest: c.oi,
        oiChange: c.d,
        kind: classify(c),
        iv: c.iv || null,
        delta: c.dl || null,
        // 거래량이 미결제약정보다 크면 그날 회전이 심했다는 뜻
        volOverOi: c.oi > 0 ? Math.round((c.v / c.oi) * 100) / 100 : null,
    }));

    const opening = contracts.filter((c) => c.kind === "OPENING");
    const netOiChange = contracts.reduce((s, c) => s + (c.oiChange ?? 0), 0);

    return NextResponse.json(
        {
            ticker,
            available: true,
            date: data.date,
            prevDate: data.prevDate ?? null,
            // 세션이 아니라 «전일 마감» 기준임을 명시 — 소비처가 라벨에 써야 한다
            basis: "EOD",
            summary: {
                callOI: v.callOI, putOI: v.putOI,
                callVol: v.callVol, putVol: v.putVol,
                pcrOI: v.pcrOI ?? null,
                pcrVol: v.pcrVol ?? null,
                contracts: v.contracts,
                // 딜러 감마 노출의 재료 (Σ gamma·OI·부호). 현물가는 소비처에서 곱한다
                gammaOI: v.gammaOI ?? null,
                openingCount: opening.length,
                netOiChange: data.prevDate ? netOiChange : null,
            },
            contracts,
        },
        { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
}
