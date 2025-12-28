
import { StockData } from "./stockTypes";

// --- CONFIGURATION ---
// [S-56.4.5b] Use environment variable with fallback to hardcoded key for backwards compatibility
const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const MASSIVE_BASE_URL = process.env.MASSIVE_BASE_URL || "https://api.polygon.io";

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

                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${MASSIVE_API_KEY}` },
                    ...fetchOptions
                });

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
