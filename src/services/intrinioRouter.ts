/**
 * Massive(Polygon) 엔드포인트 → Intrinio 라우팅 테이블
 *
 * massiveClient.fetchMassive() 가 이 모듈에 먼저 물어보고,
 * 처리 가능한 엔드포인트면 Intrinio 어댑터 결과를 Massive 응답 형태로 돌려준다.
 *
 * ⚠️ 뉴스(/v2/reference/news)는 **의도적으로 라우팅하지 않는다.**
 *    Massive 뉴스는 2026-09-23 해지 시점까지 그대로 사용 (대표 지시).
 *
 * 정본: .agent/INTRINIO_MIGRATION.md · INTRINIO_MIGRATION_WORKLOG.md
 */

import {
    hasIntrinioKey,
    getTickerSnapshot,
    getDailyAggregates,
    getOptionChainSnapshotIntrinio,
    getTechnicalIndicator,
    getTickerDetails,
    getFullMarketSnapshotIntrinio,
    getMoversIntrinio,
    getGroupedDailyIntrinio,
    getMarketStatusIntrinio,
    getOpenCloseIntrinio,
} from "./intrinioClient";

/** 라우팅하지 않고 Massive 로 그대로 보낼 엔드포인트 */
const MASSIVE_PASSTHROUGH = [
    "/v2/reference/news",   // 뉴스 — 9/23 까지 유지
];

export function shouldPassThroughToMassive(endpoint: string): boolean {
    return MASSIVE_PASSTHROUGH.some((p) => endpoint.startsWith(p));
}

/** endpoint 문자열에서 쿼리스트링 분리 */
function splitQuery(endpoint: string): { path: string; query: URLSearchParams } {
    const qIdx = endpoint.indexOf("?");
    if (qIdx === -1) return { path: endpoint, query: new URLSearchParams() };
    return {
        path: endpoint.slice(0, qIdx),
        query: new URLSearchParams(endpoint.slice(qIdx + 1)),
    };
}

/**
 * 처리 가능하면 결과를, 불가능하면 `undefined` 를 반환한다.
 * `undefined` 면 호출부가 기존 Massive 경로로 폴백한다.
 */
export async function routeToIntrinio(
    endpoint: string,
    params: Record<string, string> = {}
): Promise<any | undefined> {
    if (!hasIntrinioKey()) return undefined;
    if (shouldPassThroughToMassive(endpoint)) return undefined;

    const { path, query } = splitQuery(endpoint);
    const p = (k: string) => params[k] ?? query.get(k) ?? undefined;

    // ── 1) 개별 종목 스냅샷 ─────────────────────────────
    // /v2/snapshot/locale/us/markets/stocks/tickers/{TICKER}
    let m = path.match(/^\/v2\/snapshot\/locale\/us\/markets\/stocks\/tickers\/([^/]+)$/);
    if (m) return await getTickerSnapshot(m[1]);

    // ── 2) 상승/하락 상위 ───────────────────────────────
    m = path.match(/^\/v2\/snapshot\/locale\/us\/markets\/stocks\/(gainers|losers)$/);
    if (m) return await getMoversIntrinio(m[1] as "gainers" | "losers");

    // ── 3) 전체/다중 종목 스냅샷 ────────────────────────
    // /v2/snapshot/locale/us/markets/stocks/tickers  (+ ?tickers=A,B,C)
    if (/^\/v2\/snapshot\/locale\/us\/markets\/stocks\/tickers$/.test(path)) {
        const list = p("tickers");
        return await getFullMarketSnapshotIntrinio(
            list ? list.split(",").map((s) => s.trim()).filter(Boolean) : undefined
        );
    }

    // ── 4) 전 종목 일봉 (grouped) ───────────────────────
    m = path.match(/^\/v2\/aggs\/grouped\/locale\/us\/market\/stocks\/([\d-]+)$/);
    if (m) return await getGroupedDailyIntrinio(m[1]);

    // ── 5) 일봉/분봉 집계 ───────────────────────────────
    // /v2/aggs/ticker/{T}/range/{mult}/{span}/{from}/{to}
    m = path.match(/^\/v2\/aggs\/ticker\/([^/]+)\/range\/(\d+)\/(\w+)\/([^/]+)\/([^/]+)$/);
    if (m) {
        const [, ticker, , span, from, to] = m;
        // 일봉만 대응. 분봉은 Intrinio Startup 에 등가 상품이 없어 폴백.
        if (span !== "day") return undefined;
        const sort = (p("sort") as "asc" | "desc") || "asc";
        const limitRaw = p("limit");
        return await getDailyAggregates(ticker, from, to, {
            sort,
            limit: limitRaw ? Number(limitRaw) : undefined,
        });
    }

    // ── 6) 전일 봉 ──────────────────────────────────────
    m = path.match(/^\/v2\/aggs\/ticker\/([^/]+)\/prev$/);
    if (m) {
        const ticker = m[1];
        const to = new Date();
        const from = new Date(to.getTime() - 14 * 86400000);
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        const agg = await getDailyAggregates(ticker, iso(from), iso(to), { sort: "desc", limit: 1 });
        return { ...agg, resultsCount: agg.results.length, queryCount: agg.results.length };
    }

    // ── 7) 옵션 체인 스냅샷 ─────────────────────────────
    // /v3/snapshot/options/{UNDERLYING}
    m = path.match(/^\/v3\/snapshot\/options\/([^/]+)$/);
    if (m) {
        const expEq = p("expiration_date");
        const expGte = p("expiration_date.gte");
        const contractType = p("contract_type");
        const res = await getOptionChainSnapshotIntrinio(m[1], {
            expiration: expEq,
            maxExpirations: expGte ? 8 : 6,
        });
        if (contractType) {
            res.results = res.results.filter(
                (r: any) => r.details?.contract_type === contractType
            );
            res.count = res.results.length;
        }
        return res;
    }

    // ── 8) 기술지표 ─────────────────────────────────────
    // /v1/indicators/{ind}/{TICKER}
    m = path.match(/^\/v1\/indicators\/(\w+)\/([^/]+)$/);
    if (m) {
        return await getTechnicalIndicator(m[1], m[2], {
            window: p("window") || "",
            timespan: p("timespan") || "",
            limit: p("limit") || "",
        });
    }

    // ── 9) 티커 레퍼런스 ────────────────────────────────
    m = path.match(/^\/v3\/reference\/tickers\/([^/]+)$/);
    if (m) return await getTickerDetails(m[1]);

    // ── 10) 시장 상태 ───────────────────────────────────
    if (path === "/v1/marketstatus/now") return getMarketStatusIntrinio();
    if (path === "/v1/marketstatus/upcoming") return [];

    // ── 11) 특정일 시가/종가 ────────────────────────────
    m = path.match(/^\/v1\/open-close\/([^/]+)\/([\d-]+)$/);
    if (m) return await getOpenCloseIntrinio(m[1], m[2]);

    // 대응 없음 → 호출부가 Massive 로 폴백
    return undefined;
}

/**
 * Intrinio 로 **대체 불가능**한 엔드포인트.
 * Massive 해지(2026-09-23) 이후에는 영구히 빈 결과가 되므로,
 * 소비처에서 graceful degrade 되어야 한다.
 */
export const UNSUPPORTED_ENDPOINTS = [
    "/stocks/v1/short-interest",   // 공매도 잔고 — Enterprise 전용
    "/v3/reference/dividends",     // 배당 이력 — 미제공
    "/v1/related-companies",       // 연관 종목 — 미제공
    "/v3/trades",                  // 틱 체결 — 옵션 실시간 WS 로 대체 예정
    "/v3/quotes",                  // 틱 호가 — 동일
    "/v2/last/trade",              // 마지막 체결 — realtime 스냅샷으로 대체됨
];

export function isUnsupported(endpoint: string): boolean {
    return UNSUPPORTED_ENDPOINTS.some((p) => endpoint.startsWith(p));
}
