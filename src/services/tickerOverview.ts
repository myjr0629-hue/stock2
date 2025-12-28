// src/services/tickerOverview.ts
// S-56.4.6: SSOT Ticker Overview Service with Market-Day SSOT
// Single source of truth for all ticker page data

import { fetchMassive, CACHE_POLICY, normalizeError } from "./massiveClient";
import {
    getETNow,
    getLastTradingDayET,
    determineSessionInfo,
    calculateRSI,
    calculate3DReturn,
    toYYYYMMDD_ET
} from "./marketDaySSOT";
import { getBuildId, getEnvType } from "./buildIdSSOT";

// --- Types ---
export interface TickerOverviewMeta {
    buildId: string;
    env: "production" | "development" | "local";
    fetchedAt: string;
}

export interface TickerPriceData {
    last: number | null;
    changePct: number | null;
    changeAbs: number | null;
    vwap: number | null;
    vwapReasonKR?: string;
    session: "REG" | "PRE" | "POST" | "CLOSED";
    sessionReasonKR?: string;
    asOfET?: string;
    updatedAtISO: string;
    high?: number;
    low?: number;
    open?: number;
    prevClose?: number;
    // [S-56.4.6] Extended session data
    afterHoursLast?: number;
    preMarketLast?: number;
}

export interface TickerIndicators {
    rsi14: number | null;
    rsiReasonKR?: string;
    return3D: number | null;
    return3DReasonKR?: string;
    dataSource: "INTRADAY" | "DAILY" | "NONE";
}

export interface TickerOptionsData {
    status: "OK" | "PARTIAL" | "PENDING" | "ERROR";
    coveragePct: number;
    gammaExposure: number | null;
    gammaExposureReasonKR?: string;
    pcr: number | null;
    callWall: number | null;
    putFloor: number | null;
    pinZone: number | null;
    updatedAtISO: string;
    reasonKR?: string;
}

export interface TickerNewsItem {
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    sentiment?: "positive" | "negative" | "neutral";
}

export interface TickerNewsData {
    items: TickerNewsItem[];
    updatedAtISO: string;
}

// [S-56.4.6] Enhanced diagnostics
export interface SubCallDiagnostic {
    ok: boolean;
    code?: string;
    reasonKR?: string;
    updatedAtISO?: string;
    value?: number;
    points?: number;
    items?: number;
    badge?: "PRE" | "POST" | "REG" | "CLOSED";
    coveragePct?: number;
    state?: string;
    anchorDate?: string;
    dataSource?: string;
}

export interface TickerDiagnostics {
    buildId: string;
    source: "MASSIVE";
    anchorDate: string;
    isWeekend: boolean;
    price: SubCallDiagnostic;
    chart: SubCallDiagnostic;
    vwap: SubCallDiagnostic;
    session: SubCallDiagnostic;
    options: SubCallDiagnostic;
    news: SubCallDiagnostic;
    indicators: SubCallDiagnostic;
}

export interface TickerOverview {
    ticker: string;
    name: string | null;
    meta: TickerOverviewMeta;
    price: TickerPriceData;
    indicators: TickerIndicators;
    options: TickerOptionsData;
    news: TickerNewsData;
    history?: { date: string; close: number }[];
    diagnostics: TickerDiagnostics;
}

export interface TickerOverviewOptions {
    range?: string;
    extended?: boolean;
    includeHistory?: boolean;
    includeNews?: boolean;
}

// --- Helper Functions ---
function extractErrorInfo(e: any): { code: string; reasonKR: string } {
    if (e && typeof e === "object" && e.code && e.reasonKR) {
        return { code: e.code, reasonKR: e.reasonKR };
    }
    const normalized = normalizeError(e);
    return { code: normalized.code, reasonKR: normalized.reasonKR };
}

// --- Main SSOT Function ---
export async function getTickerOverview(
    ticker: string,
    opts: TickerOverviewOptions = {}
): Promise<TickerOverview> {
    const { range = "1d", extended = false, includeHistory = true, includeNews = true } = opts;
    const tickerUpper = ticker.toUpperCase();
    const fetchedAt = new Date().toISOString();
    const buildId = getBuildId();

    // [S-56.4.6] Market Day SSOT
    const nowET = getETNow();
    const sessionInfo = determineSessionInfo(nowET);
    const anchorDate = sessionInfo.lastTradingDay;

    // Initialize diagnostics
    const diagnostics: TickerDiagnostics = {
        buildId,
        source: "MASSIVE",
        anchorDate,
        isWeekend: sessionInfo.isWeekend,
        price: { ok: false },
        chart: { ok: false },
        vwap: { ok: false },
        session: { ok: false },
        options: { ok: false },
        news: { ok: false },
        indicators: { ok: false }
    };

    // Initialize result structure
    const result: TickerOverview = {
        ticker: tickerUpper,
        name: null,
        meta: {
            buildId,
            env: getEnvType(),
            fetchedAt
        },
        price: {
            last: null,
            changePct: null,
            changeAbs: null,
            vwap: null,
            session: sessionInfo.badge,
            sessionReasonKR: sessionInfo.reasonKR,
            asOfET: sessionInfo.asOfET,
            updatedAtISO: fetchedAt
        },
        indicators: {
            rsi14: null,
            return3D: null,
            dataSource: "NONE"
        },
        options: {
            status: "PENDING",
            coveragePct: 0,
            gammaExposure: null,
            pcr: null,
            callWall: null,
            putFloor: null,
            pinZone: null,
            updatedAtISO: fetchedAt,
            reasonKR: "옵션 데이터 수집 대기 중"
        },
        news: {
            items: [],
            updatedAtISO: fetchedAt
        },
        diagnostics
    };

    // Session diagnostic
    diagnostics.session = {
        ok: true,
        badge: sessionInfo.badge,
        reasonKR: sessionInfo.reasonKR,
        updatedAtISO: sessionInfo.asOfET
    };

    // --- 1. Fetch Price Snapshot ---
    try {
        const snapshot = await fetchMassive(
            `/v2/snapshot/locale/us/markets/stocks/tickers/${tickerUpper}`,
            {},
            false,
            undefined,
            CACHE_POLICY.LIVE
        );

        const tick = snapshot?.ticker;
        if (tick) {
            const day = tick.day || {};
            const prevDay = tick.prevDay || {};
            const lastTrade = tick.lastTrade || {};

            // Price
            result.price.last = lastTrade.p || day.c || prevDay.c || null;
            result.price.open = day.o || prevDay.o || null;
            result.price.high = day.h || prevDay.h || null;
            result.price.low = day.l || prevDay.l || null;
            result.price.prevClose = prevDay.c || null;

            // Change calculation
            if (result.price.last && result.price.prevClose) {
                result.price.changeAbs = result.price.last - result.price.prevClose;
                result.price.changePct = (result.price.changeAbs / result.price.prevClose) * 100;
            }

            // Extended hours data (if available)
            if (tick.preMarket?.p) result.price.preMarketLast = tick.preMarket.p;
            if (tick.afterHours?.p) result.price.afterHoursLast = tick.afterHours.p;

            diagnostics.price = {
                ok: result.price.last !== null,
                updatedAtISO: tick.updated ? new Date(tick.updated / 1000000).toISOString() : fetchedAt
            };
            if (!result.price.last) {
                diagnostics.price.code = "NO_DATA";
                diagnostics.price.reasonKR = "가격 데이터 없음 (스냅샷 비어있음)";
            }

            // VWAP
            if (day.vw && day.vw > 0) {
                result.price.vwap = day.vw;
                diagnostics.vwap = { ok: true, value: day.vw, updatedAtISO: fetchedAt };
            } else if (prevDay.vw && prevDay.vw > 0) {
                result.price.vwap = prevDay.vw;
                result.price.vwapReasonKR = "전일 VWAP (당일 거래량 부족)";
                diagnostics.vwap = { ok: true, value: prevDay.vw, reasonKR: result.price.vwapReasonKR, updatedAtISO: fetchedAt };
            } else {
                result.price.vwap = null;
                result.price.vwapReasonKR = "VWAP 불가: 거래량 데이터 없음";
                diagnostics.vwap = { ok: false, code: "NO_VOLUME", reasonKR: result.price.vwapReasonKR };
            }

            result.price.updatedAtISO = tick.updated ? new Date(tick.updated / 1000000).toISOString() : fetchedAt;
        } else {
            diagnostics.price = { ok: false, code: "EMPTY_RESPONSE", reasonKR: "스냅샷 응답이 비어있습니다" };
            diagnostics.vwap = { ok: false, code: "NO_SNAPSHOT", reasonKR: "스냅샷 없음으로 VWAP 계산 불가" };
        }
    } catch (e: any) {
        const errInfo = extractErrorInfo(e);
        console.error(`[tickerOverview] Price fetch error for ${tickerUpper}:`, errInfo);
        diagnostics.price = { ok: false, code: errInfo.code, reasonKR: errInfo.reasonKR };
        diagnostics.vwap = { ok: false, code: errInfo.code, reasonKR: `가격 조회 실패로 VWAP 불가: ${errInfo.reasonKR}` };
        result.price.vwapReasonKR = diagnostics.vwap.reasonKR;
    }

    // --- 2. Fetch Company Info ---
    try {
        const info = await fetchMassive(
            `/v3/reference/tickers/${tickerUpper}`,
            {},
            true,
            undefined,
            { next: { revalidate: 86400 } }
        );
        result.name = info?.results?.name || null;
    } catch (e) {
        // Non-blocking
    }

    // --- 3. Fetch Options ---
    try {
        const optionsUrl = `/v3/snapshot/options/${tickerUpper}`;
        const optData = await fetchMassive(optionsUrl, { limit: "100" }, false, undefined, CACHE_POLICY.LIVE);

        if (optData?.results?.length > 0) {
            const contracts = optData.results;
            let totalCallOI = 0;
            let totalPutOI = 0;
            let hasOI = false;

            contracts.forEach((c: any) => {
                const oi = c.open_interest || 0;
                if (oi > 0) hasOI = true;
                if (c.details?.contract_type === "call") totalCallOI += oi;
                else if (c.details?.contract_type === "put") totalPutOI += oi;
            });

            result.options.pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : null;
            result.options.coveragePct = hasOI ? 100 : 50;
            result.options.status = hasOI ? "OK" : "PARTIAL";
            result.options.updatedAtISO = new Date().toISOString();
            if (!hasOI) result.options.reasonKR = "OI 데이터 미수신 - PCR/Gamma 불확실";

            diagnostics.options = {
                ok: true,
                state: result.options.status,
                coveragePct: result.options.coveragePct,
                updatedAtISO: result.options.updatedAtISO,
                reasonKR: result.options.reasonKR
            };
        } else {
            result.options.status = "PENDING";
            result.options.reasonKR = "옵션 스냅샷 응답이 비어있음";
            diagnostics.options = { ok: false, code: "EMPTY_RESPONSE", reasonKR: result.options.reasonKR, state: "PENDING" };
        }
    } catch (e: any) {
        const errInfo = extractErrorInfo(e);
        result.options.status = "ERROR";
        result.options.reasonKR = `옵션 조회 오류: ${errInfo.reasonKR}`;
        diagnostics.options = { ok: false, code: errInfo.code, reasonKR: result.options.reasonKR, state: "ERROR" };
    }

    // --- 4. Fetch History + Indicators (with fallback) ---
    if (includeHistory) {
        let intradayCloses: number[] = [];
        let dailyCloses: number[] = [];
        let chartSource: "INTRADAY" | "DAILY" | "NONE" = "NONE";

        // 4a. Try intraday first
        try {
            const multiplier = range === "1d" ? 5 : range === "5d" ? 30 : 1;
            const timespan = range === "1d" || range === "5d" ? "minute" : "day";

            // Use anchorDate for trading day accuracy
            const fromDate = anchorDate;
            const toDate = anchorDate;

            const aggs = await fetchMassive(
                `/v2/aggs/ticker/${tickerUpper}/range/${multiplier}/${timespan}/${fromDate}/${toDate}`,
                { adjusted: "true", sort: "asc", limit: "5000" },
                true,
                undefined,
                { next: { revalidate: 60 } }
            );

            if (aggs?.results?.length > 0) {
                result.history = aggs.results.map((r: any) => ({
                    date: new Date(r.t).toISOString(),
                    close: r.c
                }));
                intradayCloses = aggs.results.map((r: any) => r.c);
                chartSource = "INTRADAY";

                const history = result.history ?? [];
                diagnostics.chart = {
                    ok: history.length > 0,
                    points: history.length,
                    updatedAtISO: new Date().toISOString(),
                    anchorDate,
                    dataSource: "INTRADAY"
                };
                if (history.length === 0) {
                    diagnostics.chart.ok = false;
                    diagnostics.chart.reasonKR = "차트 데이터 없음 (길이 0)";
                }
            } else {
                diagnostics.chart = {
                    ok: false,
                    code: "EMPTY_RESPONSE",
                    reasonKR: `인트라데이 차트 없음 (${anchorDate}, 비거래일 가능)`,
                    points: 0,
                    anchorDate,
                    dataSource: "INTRADAY"
                };
            }
        } catch (e: any) {
            const errInfo = extractErrorInfo(e);
            diagnostics.chart = {
                ok: false,
                code: errInfo.code,
                reasonKR: `인트라데이 차트 조회 실패: ${errInfo.reasonKR}`,
                points: 0,
                anchorDate
            };
        }

        // 4b. Daily fallback for indicators (RSI/3D)
        if (intradayCloses.length < 15) {
            try {
                // Fetch last 30 daily bars for RSI(14) + 3D return
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 35);
                const from = toYYYYMMDD_ET(thirtyDaysAgo);
                const to = anchorDate;

                const dailyAggs = await fetchMassive(
                    `/v2/aggs/ticker/${tickerUpper}/range/1/day/${from}/${to}`,
                    { adjusted: "true", sort: "asc", limit: "50" },
                    true,
                    undefined,
                    { next: { revalidate: 300 } }
                );

                if (dailyAggs?.results?.length > 0) {
                    dailyCloses = dailyAggs.results.map((r: any) => r.c);
                    chartSource = chartSource === "NONE" ? "DAILY" : chartSource;

                    // If no intraday chart, use daily as fallback
                    if (!result.history || result.history.length === 0) {
                        result.history = dailyAggs.results.map((r: any) => ({
                            date: new Date(r.t).toISOString(),
                            close: r.c
                        }));

                        const history = result.history ?? [];
                        diagnostics.chart = {
                            ok: history.length > 0,
                            points: history.length,
                            reasonKR: history.length > 0 ? "일봉 데이터 사용 (인트라데이 없음)" : "데이터 없음",
                            updatedAtISO: new Date().toISOString(),
                            anchorDate,
                            dataSource: "DAILY"
                        };
                    }
                }
            } catch (e) {
                // Non-critical, indicators will just be N/A
            }
        }

        // 4c. Calculate indicators
        const closesForIndicators = intradayCloses.length >= 15 ? intradayCloses : dailyCloses;
        result.indicators.dataSource = chartSource;

        if (closesForIndicators.length >= 15) {
            const rsi = calculateRSI(closesForIndicators);
            if (rsi !== null) {
                result.indicators.rsi14 = Math.round(rsi * 10) / 10;
            } else {
                result.indicators.rsiReasonKR = "데이터 부족 (15개 미만)";
            }

            const ret3d = calculate3DReturn(closesForIndicators);
            if (ret3d !== null) {
                result.indicators.return3D = Math.round(ret3d * 100) / 100;
            } else {
                result.indicators.return3DReasonKR = "데이터 부족 (4개 미만)";
            }

            diagnostics.indicators = {
                ok: result.indicators.rsi14 !== null || result.indicators.return3D !== null,
                dataSource: chartSource,
                updatedAtISO: new Date().toISOString()
            };
        } else {
            result.indicators.rsiReasonKR = `데이터 부족 (${closesForIndicators.length}개, 15개 필요)`;
            result.indicators.return3DReasonKR = `데이터 부족 (${closesForIndicators.length}개)`;
            diagnostics.indicators = {
                ok: false,
                code: "INSUFFICIENT_DATA",
                reasonKR: `지표 계산 불가 - 데이터 ${closesForIndicators.length}개`,
                dataSource: chartSource
            };
        }
    }

    // --- 5. Fetch News ---
    if (includeNews) {
        try {
            const newsData = await fetchMassive(
                `/v2/reference/news`,
                { ticker: tickerUpper, limit: "10", order: "desc", sort: "published_utc" },
                true,
                undefined,
                CACHE_POLICY.DISPLAY_NEWS
            );

            if (newsData?.results?.length > 0) {
                result.news.items = newsData.results.map((n: any) => ({
                    title: n.title,
                    url: n.article_url,
                    source: n.publisher?.name || "Unknown",
                    publishedAt: n.published_utc,
                    sentiment: n.insights?.[0]?.sentiment || "neutral"
                }));
                result.news.updatedAtISO = new Date().toISOString();
                diagnostics.news = { ok: true, items: result.news.items.length, updatedAtISO: result.news.updatedAtISO };
            } else {
                diagnostics.news = { ok: false, code: "EMPTY_RESPONSE", reasonKR: "뉴스 데이터 없음", items: 0 };
            }
        } catch (e: any) {
            const errInfo = extractErrorInfo(e);
            diagnostics.news = { ok: false, code: errInfo.code, reasonKR: `뉴스 조회 실패: ${errInfo.reasonKR}`, items: 0 };
        }
    }

    return result;
}

// --- API Route Helper ---
export async function getTickerOverviewForAPI(ticker: string, opts?: TickerOverviewOptions) {
    return getTickerOverview(ticker, opts);
}
