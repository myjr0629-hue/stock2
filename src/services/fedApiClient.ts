// [P1] FED API Client - Treasury Yields, Inflation Data
// [V4.3] Added direct FRED API integration for Treasury yields
// Uses Massive API /fed/v1/* endpoints as fallback

import { fetchMassive } from "./massiveClient";
import { getTreasuryCurveOfficial } from '@/services/intrinioClient';

const FED_CACHE_TTL = 60 * 30; // 30 minutes
const FRED_API_KEY = process.env.FRED_API_KEY || "";
const FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations";

export interface TreasuryYields {
    date: string;
    us2y: number | null;
    us5y: number | null;
    us10y: number | null;
    us30y: number | null;
    spread2s10s: number | null;
    /**
     * 같은 원본의 «직전 거래일» 10Y. 변화량은 수준과 같은 곡선에서 만든다(2026-09-29).
     * 재무부 원본·FRED(2026-10-06부터 관측 5개를 받는다) 경로에서 채운다 — 벤더 폴백은 한 행만 받아서 모른다(null).
     */
    prev?: { date: string; us10y: number } | null;
    source: "US_TREASURY" | "FRED" | "INTRINIO" | "FAIL";
    updatedAt: string;
}

export interface InflationData {
    date: string;
    cpi: number | null;
    cpiYoY: number | null;
    pce: number | null;
    pceYoY: number | null;
    expectations: number | null;
    source: "US_TREASURY" | "FRED" | "INTRINIO" | "FAIL";
    updatedAt: string;
}

export interface VixData {
    date: string;
    vix: number | null;
    source: "FRED" | "PROXY" | "FAIL";
    updatedAt: string;
}

export interface FedSnapshot {
    treasury: TreasuryYields;
    inflation: InflationData;
    vix: VixData;
    asOfET: string;
}

// [V4.3] Direct FRED API fetch helper
async function fetchFredSeries(seriesId: string, limit: number = 1): Promise<number | null> {
    if (!FRED_API_KEY) return null;

    try {
        const url = `${FRED_BASE_URL}?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
        const res = await fetch(url, { next: { revalidate: 1800 } }); // 30min cache

        if (!res.ok) {
            console.warn(`[FRED] ${seriesId} fetch failed: ${res.status}`);
            return null;
        }

        const data = await res.json();
        const obs = data?.observations?.[0];
        if (obs && obs.value !== ".") {
            return parseFloat(obs.value);
        }
        return null;
    } catch (e) {
        console.error(`[FRED] ${seriesId} error:`, e);
        return null;
    }
}

export interface FredObs { date: string; value: number }

/** FRED 관측값 여러 개(최신순) — «날짜와 함께». 결측(«.»)은 뺀다. */
async function fetchFredObservations(seriesId: string, limit: number): Promise<FredObs[]> {
    if (!FRED_API_KEY) return [];
    try {
        const url = `${FRED_BASE_URL}?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
        const res = await fetch(url, { next: { revalidate: 1800 } }); // 30min cache
        if (!res.ok) {
            console.warn(`[FRED] ${seriesId} fetch failed: ${res.status}`);
            return [];
        }
        const data = await res.json();
        const obs: any[] = Array.isArray(data?.observations) ? data.observations : [];
        return obs
            .filter((o) => o && o.value !== "." && Number.isFinite(parseFloat(o.value)) && /^\d{4}-\d{2}-\d{2}$/.test(String(o.date)))
            .map((o) => ({ date: String(o.date), value: parseFloat(o.value) }));
    } catch (e) {
        console.error(`[FRED] ${seriesId} error:`, e);
        return [];
    }
}

/**
 * FRED 계열들 → «한 날짜»의 곡선 행 (순수 함수 — tests/spread2s10sSession.test.ts).
 * 2Y·10Y 가 둘 다 있는 가장 최근 날짜를 고른다 — 계열마다 최신일이 다를 수 있다(8/30 0.52 = 날짜 섞인 스프레드).
 * 2Y 가 한 날짜도 겹치지 않으면 10Y 만(2Y·스프레드 null). 직전 10Y(같은 계열의 바로 앞 관측)도 준다.
 */
export function pickFredTreasuryRow(s: { y2: FredObs[]; y5?: FredObs[]; y10: FredObs[]; y30?: FredObs[] }): {
    date: string; us2y: number | null; us5y: number | null; us10y: number; us30y: number | null;
    prev: { date: string; us10y: number } | null;
} | null {
    const tens = [...s.y10].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!tens.length) return null;
    const two = new Map(s.y2.map((o) => [o.date, o.value] as [string, number]));
    const hit = tens.findIndex((o) => two.has(o.date));
    const i = hit >= 0 ? hit : 0;
    const d = tens[i].date;
    const at = (arr?: FredObs[]) => arr?.find((o) => o.date === d)?.value ?? null;
    const p = tens[i + 1];
    return {
        date: d,
        us2y: hit >= 0 ? (two.get(d) as number) : null,
        us5y: at(s.y5),
        us10y: tens[i].value,
        us30y: at(s.y30),
        prev: p && p.value > 0 ? { date: p.date, us10y: p.value } : null,
    };
}

// Fetch Treasury Yields — 미 재무부 원본 → FRED → 벤더 어댑터
export async function getTreasuryYields(): Promise<TreasuryYields> {
    const now = new Date().toISOString();
    const failResult: TreasuryYields = {
        date: now.split('T')[0],
        us2y: null,
        us5y: null,
        us10y: null,
        us30y: null,
        spread2s10s: null,
        source: "FAIL",
        updatedAt: now
    };

    // ── ① 미 재무부 «원본»이 정본이다 (2026-08-30) ────────────────────
    //   FRED 는 재무부 par yield 를 받아 게시하므로 한 단계 늦다. 실측:
    //     재무부 8/28  2Y 4.34 · 10Y 4.73 · 2s10s 0.39   ← 마지막 거래일
    //     FRED 경유    2Y 4.20 · 10Y 4.67 · 2s10s 0.47   ← 하루 낡음
    //   화면에는 0.52 가 떠 있었다 — 10Y 는 Yahoo(8/28), 2Y 는 FRED(8/27) 로
    //   **날짜를 섞어** 만든 값이었다. 스프레드는 반드시 같은 날짜여야 한다.
    try {
        const official = await getTreasuryCurveOfficial();
        const r = official?.[0];
        if (r && typeof r.yield_10_year === "number") {
            const us2y = r.yield_2_year ?? null;
            const us10y = r.yield_10_year;
            const p = official?.[1];                // 최신순 — [1] 이 직전 거래일
            return {
                date: r.date,                       // ★ 관측일 그대로. 오늘 날짜를 찍지 않는다
                us2y,
                us5y: r.yield_5_year ?? null,
                us10y,
                us30y: r.yield_30_year ?? null,
                spread2s10s: us2y !== null ? Math.round((us10y - us2y) * 100) / 100 : null,
                prev: p && typeof p.yield_10_year === "number" && p.yield_10_year > 0 && String(p.date) < String(r.date)
                    ? { date: String(p.date), us10y: p.yield_10_year }
                    : null,
                source: "US_TREASURY",
                updatedAt: now,
            };
        }
    } catch { /* 폴백으로 넘어간다 */ }

    // ── ② FRED 직접 (키가 있을 때) ────────────────────────────────────
    if (FRED_API_KEY) {
        try {
            console.log("[FedAPI] Fetching Treasury from FRED...");
            const [y2, y5, y10, y30] = await Promise.all(
                ["DGS2", "DGS5", "DGS10", "DGS30"].map((id) => fetchFredObservations(id, 5))
            );
            const row = pickFredTreasuryRow({ y2, y5, y10, y30 });

            if (row) {
                console.log(`[FedAPI] FRED Treasury OK: 10Y=${row.us10y}% 2Y=${row.us2y}% (${row.date})`);
                return {
                    // ★ 관측일을 그대로 단다 (2026-10-06).
                    //   예전엔 날짜를 몰라 ''(그 전엔 «오늘 날짜»)였다. 매크로 허브는 날짜 없는 곡선을
                    //   «^TNX 보다 새롭지 않다»로 읽어 이 10Y 를 헤드라인에 올렸다 — 10/5 16:05 ET 운영
                    //   /api/market/macro 가 FRED 10/1 의 5.24 를 ^TNX 의 +3bp 와 붙여 만들었다(실제 10/5 5.31).
                    date: row.date,
                    us2y: row.us2y,
                    us5y: row.us5y,
                    us10y: row.us10y,
                    us30y: row.us30y,
                    // 같은 날짜의 2Y·10Y 로만(pickFredTreasuryRow) — 반올림도 재무부 경로와 같게
                    spread2s10s: row.us2y !== null ? Math.round((row.us10y - row.us2y) * 100) / 100 : null,
                    prev: row.prev,
                    source: "FRED",
                    updatedAt: now
                };
            }
        } catch (e) {
            console.warn("[FedAPI] FRED Treasury failed, fallback to Massive:", e);
        }
    }

    // Fallback: Massive API
    try {
        const data = await fetchMassive("/fed/v1/treasury-yields", {
            limit: "1",
            sort: "date.desc"
        }, true);

        if (data && data.results && data.results.length > 0) {
            const latest = data.results[0];
            const us2y = latest.yield_2_year ?? null;
            const us10y = latest.yield_10_year ?? null;

            return {
                date: latest.date || now.split('T')[0],
                us2y,
                us5y: latest.yield_5_year ?? null,
                us10y,
                us30y: latest.yield_30_year ?? null,
                spread2s10s: (us2y !== null && us10y !== null) ? us10y - us2y : null,
                source: "INTRINIO",
                updatedAt: now
            };
        }

        return failResult;
    } catch (e) {
        console.error("[FedAPI] Treasury fetch error:", e);
        return failResult;
    }
}

// Fetch Inflation Data from Massive FED API
export async function getInflationData(): Promise<InflationData> {
    const now = new Date().toISOString();
    const failResult: InflationData = {
        date: now.split('T')[0],
        cpi: null,
        cpiYoY: null,
        pce: null,
        pceYoY: null,
        expectations: null,
        source: "FAIL",
        updatedAt: now
    };

    try {
        // Parallel fetch inflation and expectations
        const [inflationRes, expectationsRes] = await Promise.all([
            fetchMassive("/fed/v1/inflation", {}, true).catch(() => null),
            fetchMassive("/fed/v1/inflation-expectations", {}, true).catch(() => null)
        ]);

        const cpi = inflationRes?.cpi ?? null;
        const cpiYoY = inflationRes?.cpiYoY ?? null;
        const pce = inflationRes?.pce ?? null;
        const pceYoY = inflationRes?.pceYoY ?? null;
        const expectations = expectationsRes?.expected ?? null;

        // If we got any data, consider it a partial success
        if (cpi !== null || pce !== null || expectations !== null) {
            return {
                date: inflationRes?.date || now.split('T')[0],
                cpi,
                cpiYoY,
                pce,
                pceYoY,
                expectations,
                source: "INTRINIO",
                updatedAt: now
            };
        }

        return failResult;
    } catch (e) {
        console.error("[FedAPI] Inflation fetch error:", e);
        return failResult;
    }
}

// [V4.4] Get VIX from FRED (VIXCLS series) - Daily Close
export async function getVixFromFred(): Promise<VixData> {
    const now = new Date().toISOString();
    const failResult: VixData = {
        date: now.split('T')[0],
        vix: null,
        source: "FAIL",
        updatedAt: now
    };

    // Try FRED API first (VIXCLS = CBOE Volatility Index)
    if (FRED_API_KEY) {
        try {
            console.log("[FedAPI] Fetching VIX from FRED (VIXCLS)...");
            const vix = await fetchFredSeries("VIXCLS");

            if (vix !== null) {
                console.log(`[FedAPI] FRED VIX OK: ${vix}`);
                return {
                    date: now.split('T')[0],
                    vix,
                    source: "FRED",
                    updatedAt: now
                };
            }
        } catch (e) {
            console.warn("[FedAPI] FRED VIX failed:", e);
        }
    }

    // Fallback: Return fail (macroHubProvider will use proxy calculation)
    console.log("[FedAPI] VIX fallback to PROXY calculation");
    return { ...failResult, source: "PROXY" };
}

// ============================================================
// [V45.7] VIX SSOT - Single Source of Truth with Multi-Tier Fallback
// ============================================================
// Priority: 1) Yahoo Finance (Real-time) → 2) In-Memory Cache → 3) Redis Cache → 4) FRED → 5) Default
// [V45.8] "Last Known Good" Pattern with Redis persistence for serverless
// ============================================================

import { getFromCache, setInCache, CACHE_KEYS } from './redisClient';

export interface VixSSOT {
    vix: number;
    prevClose: number;
    change: number;
    changePct: number;
    source: "YAHOO" | "CACHE" | "REDIS" | "FRED" | "DEFAULT";
    updatedAt: string;
    isStale: boolean; // True if data is from cache/fallback
}

// In-memory cache for fast access within same process
let vixCache: { data: VixSSOT | null } = { data: null };

/**
 * [V8.0] Get VIX from Redis ONLY (no Yahoo direct calls)
 * Priority: 1) In-Memory Cache → 2) Redis → 3) FRED → 4) Default
 */
export async function getVixSSOT(): Promise<VixSSOT> {
    // 1. Use in-memory cache if available
    if (vixCache.data) {
        return { ...vixCache.data, source: "CACHE", isStale: false };
    }

    // 2. Try Redis cache
    try {
        const redisVix = await getFromCache<VixSSOT>(CACHE_KEYS.VIX_LAST_KNOWN_GOOD);
        if (redisVix && redisVix.vix) {
            console.log(`[VIX] Redis: ${redisVix.vix.toFixed(2)}`);
            vixCache = { data: redisVix };
            return { ...redisVix, source: "REDIS", isStale: false };
        }
    } catch (e) {
        console.warn("[VIX] Redis cache failed:", e);
    }

    // 3. Fallback: FRED (Daily Close)
    console.log("[VIX] No Redis data, trying FRED...");
    try {
        const fredVix = await getVixFromFred();
        if (fredVix.vix !== null) {
            const result: VixSSOT = {
                vix: fredVix.vix,
                prevClose: fredVix.vix,
                change: 0,
                changePct: 0,
                source: "FRED",
                updatedAt: fredVix.updatedAt,
                isStale: true
            };
            vixCache = { data: result };
            setInCache(CACHE_KEYS.VIX_LAST_KNOWN_GOOD, result).catch(() => { });
            return result;
        }
    } catch (e) {
        console.warn("[VIX] FRED fallback failed:", e);
    }

    // 4. Emergency Default
    console.warn("[VIX] All sources failed, using default 15");
    return {
        vix: 15,
        prevClose: 15,
        change: 0,
        changePct: 0,
        source: "DEFAULT",
        updatedAt: new Date().toISOString(),
        isStale: true
    };
}

// Get complete FED snapshot
export async function getFedSnapshot(): Promise<FedSnapshot> {
    const [treasury, inflation, vix] = await Promise.all([
        getTreasuryYields(),
        getInflationData(),
        getVixFromFred()
    ]);

    return {
        treasury,
        inflation,
        vix,
        asOfET: new Date().toLocaleString('en-US', {
            timeZone: 'America/New_York',
            dateStyle: 'short',
            timeStyle: 'short'
        })
    };
}
