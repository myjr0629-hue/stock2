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

import { getNewsFromFmp, hasFmpKey } from "./fmpNewsAdapter";
import {
    hasIntrinioKey,
    getTickerSnapshot,
    getDailyAggregates,
    getIntradayAggregates,
    getOptionChainSnapshotIntrinio,
    getTechnicalIndicator,
    getTickerDetails,
    getFullMarketSnapshotIntrinio,
    getMoversIntrinio,
    getGroupedDailyIntrinio,
    getMarketStatusIntrinio,
    getOpenCloseIntrinio,
    getDividendsIntrinio,
    getSplitsIntrinio,
} from "./intrinioClient";

/**
 * 라우팅하지 않고 Massive 로 그대로 보낼 엔드포인트
 *
 * ⚠️ 2026-08-29: 뉴스도 **FMP 로 이관**했다. Massive 는 9/23 해지되고,
 *    3사 실측 비교에서 FMP 가 대안으로 확정됐다(Intrinio 는 종목 연결이 부정확).
 *    정본: .agent/INTRINIO_API_SURVEY.md §1-2
 *    되돌리려면 NEWS_SOURCE=massive 로 설정한다.
 */
const MASSIVE_PASSTHROUGH: string[] = [];

/** 뉴스 소스 — 기본 FMP, `NEWS_SOURCE=massive` 로 되돌릴 수 있다 */
function newsSource(): "fmp" | "massive" {
    return process.env.NEWS_SOURCE === "massive" ? "massive" : "fmp";
}

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
    if (shouldPassThroughToMassive(endpoint)) return undefined;

    const { path, query } = splitQuery(endpoint);
    const p = (k: string) => params[k] ?? query.get(k) ?? undefined;

    // ── 0) 뉴스 → FMP ───────────────────────────────────
    // 뉴스는 Intrinio 가 아니라 FMP 로 간다(실측 비교 결과).
    // Intrinio 키와 무관하므로 hasIntrinioKey() 검사보다 앞에 둔다.
    if (path === "/v2/reference/news") {
        if (newsSource() === "massive" || !hasFmpKey()) return undefined;
        const res = await getNewsFromFmp({
            ticker: p("ticker"),
            limit: Number(p("limit")) || 20,
            since: p("published_utc.gte"),
        });
        // FMP 가 실패하면 undefined → 호출부가 Massive 로 폴백(9/23 까지 안전망)
        return res && res.results?.length ? res : undefined;
    }

    if (!hasIntrinioKey()) return undefined;

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
        const [, ticker, multRaw, span, from, to] = m;
        const sort = (p("sort") as "asc" | "desc") || "asc";
        const limitRaw = p("limit");
        const limit = limitRaw ? Number(limitRaw) : undefined;

        if (span === "day") {
            return await getDailyAggregates(ticker, from, to, { sort, limit });
        }

        // 분봉/시간봉 — securities/{t}/prices/intervals
        // ⚠️ 이 분기를 빼면 1D 차트가 죽는다(2026-08-29 실제 발생).
        //    Massive 로 폴백해봐야 403 이므로 반드시 여기서 처리해야 한다.
        const intraday = await getIntradayAggregates(
            ticker, Number(multRaw), span, from, to, { sort, limit }
        );
        if (intraday !== undefined) return intraday;

        // 지원하지 않는 시간단위(초봉 등) — 빈 결과로 안전하게 종료
        return { ticker, queryCount: 0, resultsCount: 0, results: [], status: "OK" };
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

    // ── 9-b) 배당 이력 ──────────────────────────────────
    // `securities/{t}/dividends` 는 404 지만 `prices/adjustments` 에 배당이 있다.
    // 이걸 못 찾아서 배당 화면이 전 필드 null 로 죽어 있었다(2026-08-29 실측).
    if (path === "/v3/reference/dividends") {
        const t = p("ticker");
        if (!t) return { status: "OK", count: 0, results: [] };
        const lim = Number(p("limit")) || 16;
        return await getDividendsIntrinio(t, lim);
    }

    // ── 9-c) 주식 분할 ──────────────────────────────────
    if (path === "/v3/reference/splits") {
        const t = p("ticker");
        if (!t) return { status: "OK", count: 0, results: [] };
        return await getSplitsIntrinio(t, Number(p("limit")) || 10);
    }

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
    "/v1/related-companies",       // 연관 종목 — 미제공
    "/v3/trades",                  // 틱 체결 — 옵션 실시간 WS 로 대체 예정
    "/v3/quotes",                  // 틱 호가 — 동일
    "/v2/last/trade",              // 마지막 체결 — realtime 스냅샷으로 대체됨
];

export function isUnsupported(endpoint: string): boolean {
    return UNSUPPORTED_ENDPOINTS.some((p) => endpoint.startsWith(p));
}
