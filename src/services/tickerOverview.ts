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

import { CentralDataHub } from "./centralDataHub";
import { fetchStockNews } from "./newsHubProvider";

// --- Types ---
export interface TickerOverviewMeta {
    buildId: string;
    env: "production" | "development" | "local";
    fetchedAt: string;
}

export interface TickerPriceData {
    last: number | null;
    volume?: number; // [Phase 25]
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
    todayClose?: number; // [Phase 23]
    afterHoursLast?: number;
    preMarketLast?: number;
    priceSource?: "OFFICIAL_CLOSE" | "LIVE_SNAPSHOT" | "POST_CLOSE" | "PRE_OPEN"; // [Phase 25.1]
}

export interface TickerIndicators {
    rsi14: number | null;
    rsiReasonKR?: string;
    return3D: number | null;
    return3DReasonKR?: string;
    dataSource: "INTRADAY" | "DAILY" | "NONE";
}

export interface TickerOptionsData {
    status: "OK" | "PARTIAL" | "PENDING" | "ERROR" | "NO_OPTIONS";
    coveragePct: number;
    gammaExposure: number | null;
    gammaExposureReasonKR?: string;
    pcr: number | null;
    callWall: number | null;
    putFloor: number | null;
    pinZone: number | null;
    maxPain?: number | null; // [Phase 42.1] Real Max Pain
    updatedAtISO: string;
    reasonKR?: string;
    // [Phase 42] Expose Raw Chain & Flow Metrics for FlowRadar/Sniper
    rawChain?: any[];
    netPremium?: number;
    callPremium?: number;
    putPremium?: number;
    optionsCount?: number;
}

export interface TickerNewsItem {
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    sentiment?: "positive" | "negative" | "neutral";
    summaryKR?: string;
    isRumor?: boolean;
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
    includeOptions?: boolean;
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
    const { range = "1d", extended = false, includeHistory = true, includeNews = true, includeOptions = true } = opts;
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

    // Session diagnostic (Synchronous)
    diagnostics.session = {
        ok: true,
        badge: sessionInfo.badge,
        reasonKR: sessionInfo.reasonKR,
        updatedAtISO: sessionInfo.asOfET
    };

    // --- Parallel Execution Blocks ---

    // 1. Price Data Task
    const priceTask = async () => {
        try {
            const unified = await CentralDataHub.getUnifiedData(tickerUpper);
            const S = unified.snapshot || {};
            const day = S.day || {};
            const prevDay = S.prevDay || {};

            // Price Mapping
            result.price.last = unified.price;
            result.price.changePct = unified.changePct;
            result.price.changeAbs = (unified.price && unified.prevClose) ? unified.price - unified.prevClose : null;
            result.price.prevClose = unified.prevClose;
            result.price.open = day.o || prevDay.o || null; // Fallback to prev
            result.price.high = day.h || prevDay.h || null;
            result.price.low = day.l || prevDay.l || null;
            result.price.volume = unified.volume;
            result.price.priceSource = unified.priceSource;

            // Session Source Mapping
            if (unified.priceSource === "OFFICIAL_CLOSE") {
                result.price.session = "CLOSED";
                result.price.sessionReasonKR = "정규장 마감 (공식 종가)";
            } else if (unified.priceSource === "POST_CLOSE") {
                result.price.session = "POST";
                result.price.sessionReasonKR = "시간외 거래 (Post-Market)";
            } else if (unified.priceSource === "PRE_OPEN") {
                result.price.session = "PRE";
                result.price.sessionReasonKR = "장전 거래 (Pre-Market)";
            } else {
                result.price.session = "REG";
                result.price.sessionReasonKR = "정규장 진행 중";
            }

            // VWAP
            if (day.vw && day.vw > 0) {
                result.price.vwap = day.vw;
                diagnostics.vwap = { ok: true, value: day.vw, updatedAtISO: fetchedAt };
            } else {
                result.price.vwap = null; // Basic fallback
                diagnostics.vwap = { ok: false, code: "NO_VWAP_YET", reasonKR: "당일 거래량 부족" };
            }

            // Extended Hours
            if (S.preMarket?.p) result.price.preMarketLast = S.preMarket.p;
            else if (unified.session === "PRE") result.price.preMarketLast = unified.price;

            if (S.afterHours?.p) result.price.afterHoursLast = S.afterHours.p;
            else if (unified.session === "POST") result.price.afterHoursLast = unified.price;

            diagnostics.price = {
                ok: unified.price > 0,
                updatedAtISO: fetchedAt,
                dataSource: "CentralDataHub"
            };

            if (!diagnostics.price.ok) {
                diagnostics.price.code = "PRICE_ZERO";
                diagnostics.price.reasonKR = unified.error || "가격 데이터 응답 0 (Hub)";
            }

            // Options from CentralDataHub (Basic Flow)
            if (unified.flow) {
                if (unified.flow.rawChain && unified.flow.rawChain.length > 0) {
                    result.options.rawChain = unified.flow.rawChain;
                    result.options.netPremium = unified.flow.netPremium;
                    result.options.callPremium = unified.flow.callPremium;
                    result.options.putPremium = unified.flow.putPremium;
                    result.options.optionsCount = unified.flow.optionsCount;

                    // Structure from SSOT
                    result.options.callWall = unified.flow.callWall || null;
                    result.options.putFloor = unified.flow.putFloor || null;
                    result.options.pinZone = unified.flow.pinZone || null;
                    result.options.maxPain = unified.flow.maxPain || null;

                    // Pre-fill status if we have chain
                    result.options.status = "OK";
                    result.options.coveragePct = 100;
                }
            }

        } catch (e: any) {
            console.error(`[tickerOverview] CentralDataHub Error for ${tickerUpper}:`, e);
            diagnostics.price = { ok: false, code: "HUB_ERROR", reasonKR: "데이터 허브 연동 실패" };
        }
    };

    // 2. Company Info Task
    const infoTask = async () => {
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
    };

    // 3. Options Snapshot Task
    const optionsTask = async () => {
        if (!includeOptions) return;
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
                result.options.status = "NO_OPTIONS" as any;
                result.options.reasonKR = "옵션 스냅샷 응답이 비어있음 (NO_OPTIONS)";
                diagnostics.options = { ok: true, code: "NO_OPTIONS", reasonKR: result.options.reasonKR, state: "NO_OPTIONS" };
            }
        } catch (e: any) {
            const errInfo = extractErrorInfo(e);
            result.options.status = "ERROR";
            result.options.reasonKR = `옵션 조회 오류: ${errInfo.reasonKR}`;
            diagnostics.options = { ok: false, code: errInfo.code, reasonKR: result.options.reasonKR, state: "ERROR" };
        }
    };

    // 4. History + Indicators Task
    const historyTask = async () => {
        if (!includeHistory) return;

        let intradayCloses: number[] = [];
        let dailyCloses: number[] = [];
        let chartSource: "INTRADAY" | "DAILY" | "NONE" = "NONE";

        // 4a. Try intraday first
        try {
            const multiplier = range === "1d" ? 5 : range === "5d" ? 30 : 1;
            const timespan = range === "1d" || range === "5d" ? "minute" : "day";
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

        // 4b. Daily History (for Indicators + Fallback)
        try {
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

                // Fallback for chart if intraday failed
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
            // Non-critical
        }

        // 4c. Calculate Indicators
        const closesForIndicators = dailyCloses;
        result.indicators.dataSource = "DAILY";

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
    };

    // 5. News Task
    const newsTask = async () => {
        if (!includeNews) return;
        try {
            const enrichedNews = await fetchStockNews([tickerUpper], 10);
            if (enrichedNews.length > 0) {
                result.news.items = enrichedNews.map(n => ({
                    title: n.headline,
                    url: n.link || "",
                    source: n.source,
                    publishedAt: n.publishedAt,
                    sentiment: n.sentiment,
                    summaryKR: n.summaryKR,
                    isRumor: (n.summaryKR || "").includes("[루머")
                }));
                result.news.updatedAtISO = new Date().toISOString();
                diagnostics.news = { ok: true, items: result.news.items.length, updatedAtISO: result.news.updatedAtISO };
            } else {
                diagnostics.news = { ok: false, code: "EMPTY_RESPONSE", reasonKR: "뉴스 데이터 없음", items: 0 };
            }
        } catch (e: any) {
            console.error("News Fetch Error:", e);
            diagnostics.news = { ok: false, code: "FETCH_ERROR", reasonKR: "뉴스 조회 실패 (NewsHub)", items: 0 };
        }
    };

    // --- Execute All Tasks concurrently ---
    await Promise.all([
        priceTask(),
        infoTask(),
        optionsTask(),
        historyTask(),
        newsTask()
    ]);

    return result;
}

// --- API Route Helper ---
export async function getTickerOverviewForAPI(ticker: string, opts?: TickerOverviewOptions) {
    return getTickerOverview(ticker, opts);
}
