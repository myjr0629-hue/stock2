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
 * [출처]  EC2 수집기(scripts/intrinio-options-eod.js)가 적재한 `intrinio:options:eod`.
 *   장중 실시간이 아니라 **전일 마감 기준**이다 — 화면에 그렇게 표시해야 한다.
 *   [2026-10-03] 같은 판(벤더의 날짜 D 레코드)을 두 문으로 받는다 — 그날 저녁 종목별 EOD(source:"api")가 먼저,
 *   다음 날 02~03 ET 벌크(source:"bulk")가 확정. 묶음의 tickers 는 언제나 date 한 판이다(섞지 않는다).
 *   저녁 묶음에서 벤더가 아직 안 낸 종목은 stale 에 «그 종목이 잰 날짜»와 함께 따로 있다(아래 staleEntry).
 */
import { NextRequest, NextResponse } from "next/server";
import { etDateOf, optionExpiryJudge } from "@/lib/marketCalendar";

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
    const key = process.env.REDIS_PROXY_KEY || process.env.EC2_REDIS_PROXY_KEY || "";
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

// ★ 만기가 «이미 지난» 계약은 신규 포지션이 아니다 — 존재하지 않는다.
//   EOD 스냅샷은 «전일 마감» 기준이라, SPY 처럼 매일 만기가 있는 종목은
//   상위 미결제약정 증가가 사실상 전부 그날 만기(0DTE)다. 필터가 없으니
//   그 계약이 다음 날에도 「신규 하방 보험」으로 떠 있었다(2026-09-10 실측:
//   SPY 상위 OPENING 6건 전부 exp=2026-09-09).
//   ★ [2026-10-03] «지났다»의 경계 = 만기일 «정규장 마감»(16:00 ET · 조기 폐장일 13:00) — 공용 달력 규칙 하나(isOptionExpiredAt · 묶음은 optionExpiryJudge).
//   예전엔 «만기일 < 오늘(ET)»이라 오늘 만기를 자정까지 살려 뒀다. 묶음 D 는 D 장 마감 뒤에 나오므로 그 묶음의 D 만기 계약은
//   처음 뜰 때 이미 만기였는데, 미국 저녁(=한국 아침) 내내 신규 포지션에 섞였다가 ET 자정(한국 13:00)에 빠졌다
//   (10/2 묶음 실측: NVDA 칩 +39,278 → 자정 뒤 +13,986 · NKE 풋 +74,521 → 콜 +7,637 · SPY +21,684 → 0).
//   이제 같은 묶음의 숫자는 처음 뜰 때부터 다음 거래일 장 마감까지 시각에 따라 바뀌지 않는다.

/**
 * 프리뷰 전용 진단 — `?at=<ISO 시각 | epoch ms>` 로 «그 시각»의 만기 판정을 돌린다(같은 묶음을 한국 아침·오후로 대조).
 * 운영(VERCEL_ENV=production)에서는 무시한다. 쓰면 응답을 공유 캐시에 남기지 않는다(no-store) · simAt 으로 밝힌다.
 */
function simNowMs(sp: URLSearchParams): number | null {
    if (process.env.VERCEL_ENV === "production") return null;
    const raw = sp.get("at");
    if (!raw) return null;
    const ms = /^\d{12,14}$/.test(raw) ? Number(raw) : Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
}

type Opening = {
    contracts: number; notional: number; side: "call" | "put";
    callContracts: number; putContracts: number; callNotional: number; putNotional: number;
};
/** 한 종목의 «신규 포지션» 요약 — 미결제약정이 늘었고 만기가 남은 상위 계약만. 없으면 null */
function openingOf(v: any, isExpired: (exp: unknown) => boolean): Opening | null {
    let contracts = 0, notional = 0, callN = 0, putN = 0, callC = 0, putC = 0;
    for (const c of (v?.top || [])) {
        // 미결제약정이 «늘어난» 것만 신규 포지션이다
        if (!(c.d > 0)) continue;
        // 만기가 지난 계약(만기일 정규장 마감 뒤)은 더 이상 포지션이 아니다
        if (isExpired(c.e)) continue;
        const n = c.d * 100 * (c.k || 0);
        contracts += c.d; notional += n;
        if (c.t === "C") { callN += n; callC += c.d; } else { putN += n; putC += c.d; }
    }
    if (!(contracts > 0)) return null;
    return {
        contracts, notional, side: callN >= putN ? "call" : "put",
        callContracts: callC, putContracts: putC, callNotional: callN, putNotional: putN,
    };
}

/**
 * ★ [2026-10-03] 저녁(API) 묶음의 «지각 종목» — 벤더가 그 종목의 날짜 D 레코드를 아직 안 냈다.
 *   묶음의 tickers 는 전부 날짜 D 한 판이다(섞지 않는다). 지각 종목의 직전 값은 stale 에 «그 종목이 실제로 잰 날짜»와 함께 있다.
 *   여기서 꺼낼 때도 그 날짜를 그대로 싣는다 — 묶음 날짜(D)를 붙이지 않는다.
 */
function staleEntry(data: any, ticker: string): any | null {
    const s = data?.stale?.[ticker];
    return s && typeof s === "object" && typeof s.date === "string" ? s : null;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = (searchParams.get("t") || searchParams.get("ticker") || "").toUpperCase();
    if (!ticker && searchParams.get("all") !== "1") {
        return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
    }

    const data = await readOptions();
    // 만기 판정의 «지금» — 요청마다 한 번 읽어 모든 계약에 같은 시각을 쓴다(프리뷰 진단 ?at= 이면 그 시각)
    const simAt = simNowMs(searchParams);
    const nowMs = simAt ?? Date.now();
    const isExpired = optionExpiryJudge(nowMs);
    const okCache = simAt != null ? "no-store" : "public, s-maxage=600, stale-while-revalidate=3600";
    const simField = simAt != null ? { simAt: new Date(simAt).toISOString() } : {};

    // ── all=1 : 전 종목 «신규 포지션» 요약 (1콜) ────────────────────
    //   UC 큰손 레이더처럼 여러 종목을 한 번에 훑는 소비처를 위해서다.
    //   종목마다 호출하면 UC 의 호출 예산이 남아나지 않는다.
    if (searchParams.get("all") === "1") {
        if (!data) {
            return NextResponse.json(
                { available: false, reason: "options-eod-not-loaded", date: null, opening: {} },
                { status: 200, headers: { "Cache-Control": "no-store" } }
            );
        }
        // ★ [2026-09-29] 콜·풋을 «따로» 싣는다(추가 필드만 — 기존 contracts·notional·side 는 그대로: UC 큰손 레이더 등 무회귀).
        //   contracts 는 콜+풋 합계인데 «내 종목» 칩이 그것을 «신규 콜 +N계약»으로 적었다 — 한쪽 이름에 양쪽 합계.
        //   소비처는 우세한 쪽(side)의 callContracts/putContracts 를 쓴다.
        //   notional 은 ΔOI × 100 × 행사가(«행사가 기준 명목»)다 — 프리미엄(체결 대금)이 아니다. notionalBasis 로 밝힌다.
        //   집계 범위는 종목당 «주목할 상위 계약»(수집기 TOP_PER_TICKER)이지 전 계약 합계가 아니다.
        const opening: Record<string, Opening> = {};
        for (const [sym, v] of Object.entries<any>(data.tickers || {})) {
            const o = openingOf(v, isExpired);
            if (o) opening[sym] = o;
        }
        // ★ [2026-10-03] 지각 종목(저녁 묶음에서 벤더가 아직 날짜 D 를 안 낸 종목)은 opening 에 넣지 않는다 —
        //   opening 은 전부 위의 date 한 판이고, 소비처(내 종목 칩·UC 큰손)는 그 date 를 모든 종목에 붙인다.
        //   대신 openingStale 에 «그 종목이 실제로 잰 날짜»(date·prevDate)를 붙여 따로 싣는다(추가 필드 — 기존 소비처 무영향).
        const openingStale: Record<string, Opening & { date: string; prevDate: string | null }> = {};
        for (const sym of Object.keys(data.stale || {})) {
            if (data.tickers?.[sym]) continue;
            const s = staleEntry(data, sym);
            const o = s ? openingOf(s, isExpired) : null;
            if (s && o) openingStale[sym] = { ...o, date: s.date, prevDate: typeof s.prevDate === "string" ? s.prevDate : null };
        }
        return NextResponse.json(
            {
                available: true, date: data.date, prevDate: data.prevDate ?? null, basis: "EOD", notionalBasis: "strike", opening,
                // 어느 문으로 받은 판인가 — bulk(벤더 벌크 · 다음 날 02~03 ET) | api(종목별 EOD · 그날 저녁). 같은 판이다.
                source: data.source === "api" ? "api" : "bulk",
                ...(Object.keys(openingStale).length ? { openingStale } : {}),
                ...simField,
            },
            { headers: { "Cache-Control": okCache } }
        );
    }

    if (!data) {
        // 없는 것을 0 으로 만들지 않는다 — 화면이 «활동 없음»이라고 말하면 안 된다
        return NextResponse.json(
            { ticker, available: false, reason: "options-eod-not-loaded" },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    }

    // 지각 종목은 직전 값을 «그 종목이 잰 날짜»로 — 묶음 날짜를 붙이지 않는다(위 staleEntry)
    const sv = data.tickers[ticker] ? null : staleEntry(data, ticker);
    const v = data.tickers[ticker] || sv;
    if (!v) {
        return NextResponse.json(
            { ticker, available: false, reason: "ticker-not-in-universe", date: data.date },
            { status: 200, headers: { "Cache-Control": "public, s-maxage=600" } }
        );
    }
    const vDate = sv ? sv.date : data.date;
    const vPrevDate = sv ? (typeof sv.prevDate === "string" ? sv.prevDate : null) : (data.prevDate ?? null);

    const top: TopContract[] = Array.isArray(v.top) ? v.top : [];
    // 신규 진입 / 청산 / 단타 로 나눈다 — 이 구분이 이 API 의 존재 이유다
    const classify = (c: TopContract) => {
        if (c.d == null) return "UNKNOWN";       // 직전일 데이터가 없어 판단 불가
        if (c.d > 0) return "OPENING";           // 미결제약정 증가 = 새 포지션
        if (c.d < 0) return "CLOSING";           // 감소 = 청산
        return "INTRADAY";                        // 그대로 = 당일 사고팜
    };

    const today = etDateOf(nowMs);
    const contracts = top.map((c) => ({
        contract: c.c,
        type: c.t === "C" ? "call" : "put",
        strike: c.k,
        expiration: c.e,
        // 소비처가 «지난 만기»(만기일 정규장 마감 뒤)를 신규 포지션으로 그리지 않도록 실어 보낸다
        expired: isExpired(c.e),
        volume: c.v,
        openInterest: c.oi,
        oiChange: c.d,
        kind: classify(c),
        iv: c.iv || null,
        delta: c.dl || null,
        // 거래량이 미결제약정보다 크면 그날 회전이 심했다는 뜻
        volOverOi: c.oi > 0 ? Math.round((c.v / c.oi) * 100) / 100 : null,
    }));

    const opening = contracts.filter((c) => c.kind === "OPENING" && !c.expired);
    const netOiChange = contracts.reduce((s, c) => s + (c.oiChange ?? 0), 0);

    return NextResponse.json(
        {
            ticker,
            available: true,
            date: vDate,
            prevDate: vPrevDate,
            // 세션이 아니라 «전일 마감» 기준임을 명시 — 소비처가 라벨에 써야 한다
            basis: "EOD",
            etToday: today,
            // 이 종목만 묶음 날짜보다 한 판 늦다(벤더 지각) — date 가 그 종목이 실제로 잰 날짜다
            ...(sv ? { stale: true, bundleDate: data.date } : {}),
            summary: {
                callOI: v.callOI, putOI: v.putOI,
                callVol: v.callVol, putVol: v.putVol,
                pcrOI: v.pcrOI ?? null,
                pcrVol: v.pcrVol ?? null,
                contracts: v.contracts,
                // 딜러 감마 노출의 재료 (Σ gamma·OI·부호). 현물가는 소비처에서 곱한다
                gammaOI: v.gammaOI ?? null,
                openingCount: opening.length,
                netOiChange: vPrevDate ? netOiChange : null,
            },
            contracts,
            ...simField,
        },
        { headers: { "Cache-Control": okCache } }
    );
}
