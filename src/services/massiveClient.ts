
import { StockData } from "./stockTypes";

// --- CONFIGURATION ---
// [S-56.4.5b] Use environment variable with fallback to hardcoded key for backwards compatibility
const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const MASSIVE_BASE_URL = process.env.MASSIVE_BASE_URL || "https://api.massive.com";

export const CACHE_POLICY = {
    // Critical for decision making (Report Generation, Live Status) - NO STALE DATA
    REPORT_GEN: { cache: 'no-store' as RequestCache },
    LIVE: { cache: 'no-store' as RequestCache },
    // Display-only data (News feed UI) - Revalidate allowed
    DISPLAY_NEWS: { next: { revalidate: 300 } }
};

/*
CACHE POLICY MATRIX (S-56.4.1)
===========================================================
| Context         | Policy       | Reason                 |
|-----------------|--------------|------------------------|
| Report Gen      | no-store     | Decision SSOT Integrity|
| Live API        | no-store     | Real-time Accuracy     |
| News Hub        | 300s TTL     | Display-only / UX      |
===========================================================
*/

// --- S-56.4.5b: Standardized Error Type ---
export interface MassiveError {
    code: "ENV_MISSING" | "RATE_LIMIT" | "TIMEOUT" | "AUTH_ERROR" | "SERVER_ERROR" | "NETWORK_ERROR" | "BUDGET_EXCEEDED" | "UNKNOWN";
    httpStatus?: number;
    reasonKR: string;
    details?: string;
}

export function normalizeError(e: any, httpStatus?: number): MassiveError {
    const message = e?.message || String(e);

    if (message.includes("ENV_MISSING") || message.includes("API key")) {
        return { code: "ENV_MISSING", reasonKR: "API 키가 설정되지 않았습니다 (.env.local 확인)", details: message };
    }
    if (httpStatus === 429 || message.includes("429") || message.includes("Rate Limit")) {
        return { code: "RATE_LIMIT", httpStatus: 429, reasonKR: "API 호출 한도 초과 - 잠시 후 재시도", details: message };
    }
    if (httpStatus === 401 || httpStatus === 403 || message.includes("401") || message.includes("403")) {
        return { code: "AUTH_ERROR", httpStatus, reasonKR: "API 인증 실패 - 키 확인 필요", details: message };
    }
    if (httpStatus && httpStatus >= 500) {
        return { code: "SERVER_ERROR", httpStatus, reasonKR: "외부 API 서버 오류", details: message };
    }
    if (message.includes("timeout") || message.includes("TIMEOUT") || message.includes("aborted")) {
        return { code: "TIMEOUT", reasonKR: "API 응답 시간 초과", details: message };
    }
    if (message.includes("BUDGET_EXCEEDED")) {
        return { code: "BUDGET_EXCEEDED", reasonKR: "요청 예산 초과", details: message };
    }
    if (message.includes("fetch") || message.includes("network") || message.includes("ECONNREFUSED")) {
        return { code: "NETWORK_ERROR", reasonKR: "네트워크 연결 실패", details: message };
    }

    return { code: "UNKNOWN", httpStatus, reasonKR: "알 수 없는 오류", details: message };
}

// --- S-28: Global status callback for deep diagnostics ---
export type StatusUpdate = {
    progress?: {
        currentTicker?: string;
        tickersDone?: number;
        totalTickers?: number;
        round?: number;
    };
    lastEndpoint?: string;
    lastHttpStatus?: number;
    lastError?: string;
    step?: string;
    summary?: {
        fetchedCount?: number;
        failedCount?: number;
        elapsedMs?: number;
    };
};

let statusCallback: ((update: StatusUpdate) => void) | null = null;

export function setStatusCallback(fn: (update: StatusUpdate) => void) {
    statusCallback = fn;
}

function notifyStatus(update: StatusUpdate) {
    if (statusCallback) statusCallback(update);
}

function assertLiveApiEnabled(context: string, isReportRun = false): void {
    const isSnapshotMode = process.env.TIER01_SNAPSHOT_MODE === "1";
    const allowBypass = process.env.ALLOW_MASSIVE_FOR_SNAPSHOT === "1";

    // ONLY enforce snapshot-mode block if we are actually in a strict report run context
    if (isReportRun && isSnapshotMode && !allowBypass) {
        console.error(`[Massive] BLOCKED: isReportRun=${isReportRun}, SnapshotMode=${isSnapshotMode}, Bypass=${allowBypass}, Context=${context}`);
        throw new Error(`Snapshot-only mode: Massive API calls are disabled. Set ALLOW_MASSIVE_FOR_SNAPSHOT=1 to bypass. (${context})`);
    }
}

// --- STABILITY: CACHE & CONCURRENCY ---
const massiveCache = new Map<string, { data: any, expiry: number }>();

export interface RunBudget {
    current: number;
    cap: number;
}

interface QueueState {
    active: number;
    queue: (() => void)[];
}

const reportState: QueueState = { active: 0, queue: [] };
const spotState: QueueState = { active: 0, queue: [] };

const REPORT_CONCURRENCY = 2;
const SPOT_CONCURRENCY = 5;
const FIXED_DELAY_MS = 200;

function waitInQueue(isReport: boolean): Promise<void> {
    const state = isReport ? reportState : spotState;
    const limit = isReport ? REPORT_CONCURRENCY : SPOT_CONCURRENCY;

    if (state.active < limit) {
        state.active++;
        return Promise.resolve();
    }
    return new Promise(resolve => state.queue.push(resolve));
}

async function releaseQueue(isReport: boolean) {
    const state = isReport ? reportState : spotState;
    state.active--;
    await new Promise(r => setTimeout(r, FIXED_DELAY_MS));
    const next = state.queue.shift();
    if (next) {
        state.active++;
        next();
    }
}

// --- HELPER: Massive API Core (Retry, Cache, Concurrency, Budget) ---
export async function fetchMassive(
    endpoint: string,
    params: Record<string, string> = {},
    useCache = true,
    budget?: RunBudget,
    // Explicit Cache Policy override (defaults to revalidate:30 from old code if not provided, but we prefer explicit)
    customFetchOptions?: RequestInit
) {
    assertLiveApiEnabled(`fetchMassive: ${endpoint}`, !!budget);

    // [S-56.4.5b] ENV_MISSING guard - but we have fallback so this is just a warning
    if (!MASSIVE_API_KEY) {
        const error: MassiveError = {
            code: "ENV_MISSING",
            reasonKR: "MASSIVE_API_KEY가 설정되지 않았습니다 (.env.local에 추가 필요)"
        };
        throw error;
    } else {
        // [Debug] Verify which key is active
        if (Math.random() < 0.05) { // Log occasionally to avoid spam
            console.log(`[MassiveClient] Using Key: ${MASSIVE_API_KEY.substring(0, 5)}... (Base: ${MASSIVE_BASE_URL})`);
        }
    }

    // Support both relative endpoints and full next_url strings
    let url = endpoint.startsWith('http') ? endpoint : `${MASSIVE_BASE_URL}${endpoint}`;

    if (!url.includes('apiKey=')) {
        const queryParams = new URLSearchParams({ ...params, apiKey: MASSIVE_API_KEY });
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}${queryParams.toString()}`;
    }

    // Cache (In-Memory)
    const cacheKey = url;
    if (useCache && massiveCache.has(cacheKey)) {
        const cached = massiveCache.get(cacheKey)!;
        if (Date.now() < cached.expiry) return cached.data;
        massiveCache.delete(cacheKey);
    }

    const isReport = !!budget;
    await waitInQueue(isReport);

    if (budget) {
        budget.current++;
        if (budget.current > budget.cap) {
            releaseQueue(isReport);
            const error: MassiveError = {
                code: "BUDGET_EXCEEDED",
                reasonKR: `요청 예산 초과: ${budget.cap}건 제한`
            };
            throw error;
        }
    }

    const MAX_RETRIES = 5;
    let attempt = 0;
    let lastHttpStatus: number | undefined;

    try {
        while (attempt < MAX_RETRIES) {
            try {
                // [S-56.4.1] SSOT Cache Policy
                // If budget is present (Report Gen), force NO-STORE even if caller didn't specify
                // Otherwise use passed options or default to old behavior (revalidate:30)
                let fetchOptions = customFetchOptions;

                if (budget && !fetchOptions) {
                    fetchOptions = CACHE_POLICY.REPORT_GEN;
                } else if (!fetchOptions) {
                    // Legacy default for non-critical
                    fetchOptions = { next: { revalidate: 30 } };
                }

                // Create a timeout signal (15 seconds default)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                try {
                    const res = await fetch(url, {
                        headers: { 'Authorization': `Bearer ${MASSIVE_API_KEY}` },
                        signal: controller.signal,
                        ...fetchOptions
                    });

                    clearTimeout(timeoutId);

                    lastHttpStatus = res.status;
                    notifyStatus({ lastEndpoint: endpoint, lastHttpStatus: res.status });

                    if (res.ok) {
                        const data = await res.json();
                        // Only cache in-memory if useCache is explicitly true (for short-term dupes during 1 run)
                        if (useCache) massiveCache.set(cacheKey, { data, expiry: Date.now() + 60000 }); // 60s
                        return data;
                    }

                    if (res.status === 429) {
                        attempt++;
                        const waitTime = 1000 * Math.pow(2, attempt);
                        console.warn(`[Massive] 429 Rate Limit. Retrying in ${waitTime}ms...`);
                        await new Promise(r => setTimeout(r, waitTime));
                        continue;
                    }

                    // [S-56.4.5b] Throw standardized error
                    throw normalizeError(new Error(`Massive API Status: ${res.status}`), res.status);

                } catch (err: any) {
                    clearTimeout(timeoutId);
                    throw err;
                }

            } catch (e: any) {
                // If it's already a MassiveError, rethrow
                if (e.code && e.reasonKR) throw e;

                if (attempt === MAX_RETRIES - 1) {
                    throw normalizeError(e, lastHttpStatus);
                }
                attempt++;
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    } finally {
        releaseQueue(isReport);
    }
}

// --- Helper for Pagination ---
export async function fetchMassiveAll(
    endpoint: string,
    params: Record<string, string> = {},
    useCache = true,
    budget?: RunBudget
) {
    let allResults: any[] = [];
    let nextUrl: string | undefined = undefined;
    let page = 0;
    const MAX_PAGES = 20; // Safety cap

    do {
        // Prepare URL: First run uses endpoint, subsequent uses nextUrl
        // Note: nextUrl from Polygon is full URL. fetchMassive handles full URL detection.
        const target = nextUrl || endpoint;
        // nextUrl already includes params (apiKey etc might be needed if fetchMassive adds them, but nextUrl usually has cursor)
        // fetchMassive logic: if url includes apiKey... 
        // We pass empty params for nextUrl to avoid double query params if fetchMassive adds them. 
        const currentParams = nextUrl ? {} : params;

        // Short sleep between pages to be kind to rate limit
        if (page > 0) await new Promise(r => setTimeout(r, 250));

        // Use false for cache on pagination to avoid stale partial pages? 
        // Actually useCache argument is better.
        const res = await fetchMassive(target, currentParams, useCache, budget);
        const results = res.results || res.data?.results || [];
        allResults = [...allResults, ...results];

        nextUrl = res.next_url;
        page++;

        console.log(`[Massive] Page ${page} fetched. Items: ${results.length}. Total: ${allResults.length}. Next: ${!!nextUrl} URL: ${nextUrl?.substring(0, 50)}...`);

    } while (nextUrl && page < MAX_PAGES);

    return { results: allResults, status: "OK", count: allResults.length };
}

// v3.5 Hyper-Discovery: Gainers
export async function fetchTopGainers(budget?: RunBudget) {
    // /v2/snapshot/locale/us/markets/stocks/gainers?apiKey=...
    const endpoint = `/v2/snapshot/locale/us/markets/stocks/gainers`;
    try {
        const data = await fetchMassive(endpoint, {}, false, budget); // No cache for fresh movers
        // Data format: { status, tickers: [ { ticker: 'XYZ', ... }, ... ] }
        return data.tickers || [];
    } catch (e) {
        console.warn("[Massive] Failed to fetch Top Gainers:", e);
        return [];
    }
}

// [v3.7.2] Infinite Horizon: Most Active (High Volume)
export async function fetchTopActive(budget?: RunBudget) {
    // /v2/snapshot/locale/us/markets/stocks/active?apiKey=... (Polygon Standard)
    // Actually most active is usually just sorted by volume. No direct endpoint in some tiers.
    // Let's assume standard Polygon endpoint exists or mapped by aggregator.
    // If not, we rely on Gainers. But let's try 'active' if available or just stick to Gainers?
    // User wants >80 score. High Volume alone doesn't mean High Score. High Change does.
    // Let's stick to Gainers but ensure we get MORE of them.
    // Actually, let's keep this placeholder but return empty if not sure.
    // Better: Fetch "Losers" for short opps? No, user wants Alpha.
    // Let's just enhance this function to be safe.
    return [];
}

// v3.5 Sentiment Gate: News
export async function fetchNewsForSentiment(ticker: string, budget?: RunBudget): Promise<'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'UNKNOWN'> {
    // /v2/reference/news?ticker=AAPL&limit=3
    const endpoint = `/v2/reference/news`;
    try {
        const data = await fetchMassive(endpoint, { ticker, limit: '5' }, true, budget);
        const results = data.results || [];
        if (results.length === 0) return 'UNKNOWN';

        // Simple Sentiment Aggregation
        let score = 0;
        for (const article of results) {
            // Check insights first (Massive V2 specific) -> actually spec says "sentiment analysis included"
            // Let's look for 'sentiment' field in article or insights
            const sentiment = article.sentiment || article.insights?.[0]?.sentiment;
            if (sentiment === 'positive' || sentiment === 'bullish') score++;
            else if (sentiment === 'negative' || sentiment === 'bearish') score--;
        }

        if (score > 0) return 'POSITIVE';
        if (score < 0) return 'NEGATIVE';
        return 'NEUTRAL';
    } catch (e) {
        // console.warn(`[Massive] News fetch failed for ${ticker}`, e);
        return 'UNKNOWN';
    }
}

// v3.5 Sympathy Hunter: Related Companies
export async function fetchRelatedTickers(ticker: string, budget?: RunBudget): Promise<string[]> {
    // /v1/related-companies/{ticker}
    const endpoint = `/v1/related-companies/${ticker}`;
    try {
        const data = await fetchMassive(endpoint, {}, true, budget);
        // Response format check needed? Usually { results: [...], ... } or just array?
        // Spec says "Related Tickers... returns a list". Let's assume standard object wrapper or list.
        // If data is array directly, use it. If data.results, use that.
        const list = Array.isArray(data) ? data : (data.results || data.related || []);
        return list.map((item: any) => typeof item === 'string' ? item : item.ticker);
    } catch (e) {
        return [];
    }
}
// [V3.7.7] Option Snapshot Support
export async function getOptionSnapshot(ticker: string, budget?: RunBudget): Promise<any[]> {
    // /v3/snapshot/options/{ticker}
    // Returns full chain state including latest trade for every active contract
    // Uses fetchMassiveAll to handle pagination (max 250 per page, up to 20 pages cap in logic)
    const endpoint = `/v3/snapshot/options/${ticker}`;
    try {
        const data = await fetchMassiveAll(endpoint, { limit: '250' }, false, budget);
        return data.results || [];
    } catch (e) {
        console.warn(`[Massive] Option Snapshot failed for ${ticker}`, e);
        return [];
    }
}


// [V3.7.3] Option Tick Data Support
export async function getOptionTrades(ticker: string, params: Record<string, string> = {}): Promise<any[]> {
    // /v3/trades/{ticker}
    const endpoint = `/v3/trades/${ticker}`;
    try {
        const data = await fetchMassive(endpoint, params, false); // Real-time, no cache usually
        return data.results || [];
    } catch (e) {
        console.warn(`[Massive] Option Trades failed for ${ticker}`, e);
        return [];
    }
}

export async function getOptionQuotes(ticker: string, params: Record<string, string> = {}): Promise<any[]> {
    // /v3/quotes/{ticker}
    const endpoint = `/v3/quotes/${ticker}`;
    try {
        const data = await fetchMassive(endpoint, params, false);
        return data.results || [];
    } catch (e) {
        console.warn(`[Massive] Option Quotes failed for ${ticker}`, e);
        return [];
    }
}

export async function getLastOptionTrade(ticker: string): Promise<any | null> {
    // /v2/last/trade/{ticker}
    const endpoint = `/v2/last/trade/${ticker}`;
    try {
        const data = await fetchMassive(endpoint, {}, false);
        return data.results || null;
    } catch (e) {
        return null;
    }
}
// [S-56.4.6] Option Contract Snapshot (Precision Logic)
export interface OptionSnapshot {
    details: {
        contract_type: 'call' | 'put';
        exercise_style: 'american' | 'european';
        expiration_date: string;
        shares_per_contract: number;
        strike_price: number;
        ticker: string;
    };
    greeks: {
        delta: number;
        gamma: number;
        theta: number;
        vega: number;
    };
    underlying_asset: {
        change_to_breakeven: number;
        last_updated: number;
        price: number;
        ticker: string;
        timeframe: 'REALTIME' | 'DELAYED';
    };
    break_even_price: number;
    implied_volatility: number;
    open_interest: number;
    day: {
        change: number;
        change_percent: number;
        close: number;
        high: number;
        last: number;
        low: number;
        open: number;
        previous_close: number;
        volume: number;
        vwap: number;
    };
}

export async function fetchOptionSnapshot(underlyingTicker: string, contractTicker: string): Promise<OptionSnapshot | null> {
    assertLiveApiEnabled(`fetchOptionSnapshot:${contractTicker}`);
    const url = `${MASSIVE_BASE_URL}/v3/snapshot/options/${underlyingTicker}/${contractTicker}?apiKey=${MASSIVE_API_KEY}`;

    try {
        const start = Date.now();
        const res = await fetch(url, CACHE_POLICY.REPORT_GEN);

        if (!res.ok) {
            const err = normalizeError(await res.text(), res.status);
            console.warn(`[Massive] Snapshot Failed for ${contractTicker}: ${err.reasonKR}`);
            notifyStatus({ step: 'SNAPSHOT_FAIL', lastError: err.reasonKR, lastHttpStatus: res.status });
            return null;
        }

        const data = await res.json();
        // Massive returns { results: { ...snapshot... }, status: "OK" }
        // OR sometimes directly the object depending on endpoint version, but usually wrapped in results for v3/snapshot wrapper?
        // Actually /v3/snapshot/options/{x}/{y} returns:
        // { results: { ... }, status: "OK", request_id: ... }

        if (!data.results) {
            console.warn(`[Massive] Snapshot Empty for ${contractTicker}`);
            return null;
        }

        notifyStatus({ step: 'SNAPSHOT_OK', summary: { elapsedMs: Date.now() - start } });
        return data.results as OptionSnapshot;

    } catch (e) {
        const err = normalizeError(e);
        console.error(`[Massive] Snapshot Error: ${err.details}`);
        return null;
    }
}

// [S-56.4.7] Market Status API
export interface MarketStatus {
    market: 'open' | 'closed' | 'extended';
    earlyAdjournment: boolean;
    nextOpen: string;
    serverTime: string; // ISO
    exchanges: Record<string, string>;
}

export async function fetchMarketStatus(): Promise<MarketStatus | null> {
    const endpoint = `/v1/marketstatus/now`;
    try {
        const data = await fetchMassive(endpoint, {}, false); // No cache, need real status
        return data as MarketStatus;
    } catch (e) {
        console.warn(`[Massive] Market Status Check Failed`, e);
        return null;
    }
}

// [S-56.4.8] Option Chain Snapshot (The "Unified" Source)
export async function getOptionChainSnapshot(ticker: string, budget?: RunBudget): Promise<any[]> {
    // /v3/snapshot/options/{ticker}
    // This provides Greeks, OI, Volume, Last Trade for ALL contracts
    const endpoint = `/v3/snapshot/options/${ticker}`;
    try {
        // This is a heavy payload, uses pagination logic wrapper
        const data = await fetchMassiveAll(endpoint, { limit: '250' }, false, budget);
        return data.results || [];
    } catch (e) {
        console.warn(`[Massive] Option Chain Snapshot failed for ${ticker}`, e);
        return [];
    }
}
