// [S-48.4] MacroHub Provider (Massive API Native V2 + Synthetic Calibration)
// Pure Massive Implementation: QQQ(Trend), US10Y(Fed API)
// [V45.9] VIX and NQ from Yahoo Finance with rate limiting (1 call/min)
// Synthetic Multipliers applied to mimic Index Levels.

import { fetchMassive, CACHE_POLICY } from './massiveClient';
import { getCreditSpread, getEconomicSeries } from "@/services/intrinioClient";
import { MarketStatusResult, getMarketStatusSSOT } from "./marketStatusProvider";
import { getUpcomingEvents } from './eventHubProvider';
import { getTreasuryYields, getInflationData } from './fedApiClient';
import { getYahooDataSSOT, YahooQuote } from './yahooFinanceHub';
import { getFromCache, setInCache, setIfNewerAsOf, mgetLatestAsOf } from './redisClient';
import { changeFromPrev } from '@/lib/yieldChange';
import {
    carryMissingMacroFields, extractLastGood, mergeLastGood, macroSnapshotComplete,
    toCarryRecords, fromCarryRecords, MACRO_CARRY_BUNDLES, MACRO_CARRY_CAS_PREFIX,
    type MacroLastGood, type MacroCarryRecord,
} from '@/lib/macroSnapshotCarry';
import { fredCreditSpread, fredRealPair } from '@/lib/macroFredFallback';

export interface MacroFactor {
    level: number | null;
    chgPct?: number | null;
    chgAbs?: number | null;
    label: string;
    // [2026-09-07] 진짜 출처를 적는다. 예전엔 성공하면 무조건 "MASSIVE" 였는데
    //   ① 매스브는 2026-08-28 권한 상실로 이미 안 쓰고(전부 인트리니오로 라우팅)
    //   ② 이 화면 값의 실제 출처는 **야후 → Redis** 다.
    //   라벨이 거짓이면 «어디가 고장났나»를 응답만 보고는 못 찾는다.
    source: "YAHOO" | "INTRINIO" | "US_TREASURY" | "FRED" | "CNN" | "FAIL";
    status: "OK" | "UNAVAILABLE";
    symbolUsed: string;
    updatedAt?: string;
    marketTime?: string;
    marketState?: string;
    exchangeTimezoneName?: string;
    feedSource?: YahooQuote["source"];
    isStale?: boolean;
    feedAgeSec?: number;
    marketAgeSec?: number;
    /** 값이 마지막으로 실제로 바뀐 시각(ISO). 벤더 타임스탬프와 달리 조작 불가. */
    lastChangeAt?: string;
    /** 값이 굳어 있는 시간(초). undefined = 아직 모름 → 라이브로 취급하지 않는다. */
    frozenSec?: number;
}

export interface MacroSnapshot {
    asOfET: string;
    fetchedAtET: string;
    ageSeconds: number;
    marketStatus: MarketStatusResult;
    factors: {
        nasdaq100: MacroFactor;
        vix: MacroFactor;
        us10y: MacroFactor;
        dxy: MacroFactor;
        spx: MacroFactor;
        btc: MacroFactor;
        gold: MacroFactor;
        oil: MacroFactor;
        sox: MacroFactor;
        rut: MacroFactor;
    };
    fearGreed?: {
        score: number;
        rating: string;
        updatedAt: string;
    };
    /**
     * 하이일드 신용 스프레드 (BofA HY Master II OAS).
     * 기존 축이 전부 주식/금리라 신용시장이 빠져 있었다 — 위험 레짐의 독립 축.
     * 주가가 오르는데 스프레드가 벌어지면 신용시장이 그 상승을 확인해 주지 않는 것이다.
     */
    creditSpread?: {
        value: number;
        date: string;
        change20d: number | null;
        percentile: number | null;
        regime: 'TIGHTENING' | 'STABLE' | 'WIDENING';
    };
    // Legacy fields
    nq?: number;
    nqChangePercent?: number;
    vix?: number;
    us10y?: number;
    dxy?: number;
    // [V3 PIPELINE] Safe Haven ETF Changes
    tltChangePct?: number | null;   // TLT (20Y Bond) — rising = risk-off
    gldChangePct?: number | null;   // [V4.1] GLD (Gold) — rising = risk-off / safe haven
    // [V45.0] Advanced Macro Indicators
    yieldCurve?: {
        us2y: number;      // 2-Year Yield
        us10y: number;     // 10-Year Yield
        spread2s10s: number; // 10Y - 2Y (negative = inversion warning)
        trend: 'STEEPENING' | 'FLATTENING' | 'INVERTED' | 'NORMAL';
        /** 곡선 관측일(YYYY-MM-DD) — 런타임엔 이미 실려 있었다(YieldCurveData). «지금 시장» 10Y 날짜 꼬리표의 근거 */
        date?: string;
        source?: string;
    };
    realYield?: {
        us10y: number;          // 10Y Nominal
        inflationExpectation: number; // Breakeven or TIPS-based
        realYield: number;       // 10Y - Inflation Expectation
        stance: 'TIGHT' | 'NEUTRAL' | 'LOOSE';
        asOf?: string | null;    // 두 관측의 공통 날짜
        fromPair?: boolean;      // 같은 날짜 짝 폴백(관측일 표시)
    };
    /** 화면 게이지용 — 정시 계산이 없을 때 같은 날짜 짝 폴백까지 포함(관측일 asOf 동봉). 점수·AI 입력에는 쓰지 않는다 */
    realYieldObserved?: MacroSnapshot['realYield'];
}

const CACHE_TTL_MS = 60000; // 1 min cache (matches Yahoo rate limit)
let cache: { data: MacroSnapshot | null; expiry: number; fetchedAt: number } = { data: null, expiry: 0, fetchedAt: 0 };

// ============================================================================
// 공유 캐시 — 콜드 인스턴스가 상류를 다시 긁지 않게 한다.
// ----------------------------------------------------------------------------
// 왜 (2026-09-03 실측): /api/live/market 이 **297바이트 응답에 3.9초** 였다.
//   전송이 아니라 서버 작업이다. 위의 `cache` 는 «프로세스 메모리»라
//   람다 인스턴스마다 따로다 — 새 인스턴스는 매번 Yahoo·FED·수익률곡선·
//   CNN·신용스프레드를 다시 부른다. 그게 대표가 말한 «콜드스타트»의 정체다.
//
// 그래서 메모리 앞이 아니라 **뒤에** Redis 한 겹을 둔다:
//   메모리 신선 → 그대로
//   Redis 신선 → 메모리에 채우고 반환 (한 번의 Redis 읽기 ≈ 40ms)
//   Redis 낡음 → **그 값을 즉시 주고** 뒤에서 갱신한다 (사용자를 기다리게 하지 않는다)
//   아무것도 없음 → 상류 조회
//
// ⚠️ RETENTION 이 FRESH 보다 훨씬 길어야 «즉시 주고 뒤에서 갱신»이 성립한다.
//    둘이 같으면 낡은 값이 남지 않아 콜드 인스턴스가 다시 상류로 간다.
// [2026-09-07] v1 → v2: factors 에 lastChangeAt / frozenSec 이 추가됐다.
// 키를 안 올리면 옛 페이로드가 15분 동안 200 OK 로 나가고 새 필드가 조용히 빠진다
// → 소비자는 «frozenSec 없음 = 모름»으로 읽어 전부 DELAYED 로 보인다.
// [2026-09-29] v2 → v3: 곡선이 헤드라인일 때 us10y 변화량이 곡선 기준으로 바뀌었다(yieldCurve.prev*).
// 프리뷰·운영이 같은 Redis 를 쓰므로, 키가 같으면 옛 코드와 새 코드가 서로의 값을 덮어쓴다.
const MACRO_REDIS_KEY = 'macro:snapshot:v5';
const MACRO_FRESH_MS = 60_000;        // 이 안쪽이면 «신선»
const MACRO_RETENTION_SEC = 15 * 60;  // 낡아도 15분은 들고 있는다 (즉시 응답용)
let macroRefreshing = false;          // 배경 갱신 중복 방지

// ── 빈칸 잇기 보관본 (2026-10-22 장중 핫픽스 — lib/macroSnapshotCarry 머리말) ──
// 원천(Intrinio 경제계열·신용스프레드)이 실패한 재계산이 REAL·creditSpread 를 «지운 채» 저장·반환되던 구멍.
// 묶음별 마지막 정상 관측(값+원래 관측일)을 따로 보관하고, 빠진 묶음만 그 값으로 잇는다.
// 저장은 기존 관측일 CAS(setIfNewerAsOf) — 같은·옛 관측일은 덮지 않으므로 동시 저장이 보관본을 되돌리지 못한다.
const MACRO_CARRY_KEYS = MACRO_CARRY_BUNDLES.map(b => MACRO_CARRY_CAS_PREFIX + b);
const MACRO_LASTGOOD_TTL_SEC = 7 * 24 * 60 * 60;
const LASTGOOD_REREAD_MS = 30_000;    // 불완전 읽기마다 저장소를 두드리지 않게
const LASTGOOD_RETRY_MS = 60_000;     // 저장 실패한 묶음의 재시도 간격
let lastGoodMem: MacroLastGood = {};
let lastGoodReadAt = 0;
let lastGoodLoading: Promise<MacroLastGood> | null = null;
/** 저장소에 실제로 남긴(성공 응답) 관측일 — 실패한 묶음은 다음 기회에 다시 저장한다 */
const lastGoodPersisted: Partial<Record<string, string>> = {};
const lastGoodAttemptAt: Partial<Record<string, number>> = {};

async function loadLastGood(force = false): Promise<MacroLastGood> {
    // 동시 요청은 진행 중인 읽기를 함께 기다린다(먼저 온 요청만 보관본을 받는 일이 없게)
    if (lastGoodLoading) return lastGoodLoading;
    if (!force && Date.now() - lastGoodReadAt < LASTGOOD_REREAD_MS) return lastGoodMem;
    lastGoodLoading = (async () => {
        try {
            const recs = await mgetLatestAsOf<MacroCarryRecord>(MACRO_CARRY_KEYS);
            lastGoodMem = mergeLastGood(lastGoodMem, fromCarryRecords(recs));
        } catch { /* 보관본을 못 읽어도 응답은 나간다 */ }
        lastGoodReadAt = Date.now();
        return lastGoodMem;
    })().finally(() => { lastGoodLoading = null; });
    return lastGoodLoading;
}

/** 유효 묶음을 보관본에 반영. 저장소 쓰기는 관측일이 아직 저장되지 않은 묶음만(관측일 CAS — 같은·옛 날짜는 저장소가 거른다). 응답을 기다리게 하지 않는다. */
function rememberLastGood(snap: MacroSnapshot) {
    lastGoodMem = mergeLastGood(lastGoodMem, extractLastGood(snap));
    const now = Date.now();
    for (const rec of toCarryRecords(lastGoodMem)) {
        if (lastGoodPersisted[rec.bundle] === rec.asOf) continue;
        if (now - (lastGoodAttemptAt[rec.bundle] ?? 0) < LASTGOOD_RETRY_MS) continue;
        lastGoodAttemptAt[rec.bundle] = now;
        setIfNewerAsOf(MACRO_CARRY_CAS_PREFIX + rec.bundle, rec, MACRO_LASTGOOD_TTL_SEC)
            .then(ok => { if (ok) lastGoodPersisted[rec.bundle] = rec.asOf; })
            .catch(e => console.warn('[MacroHub] 보관본 저장 실패:', e?.message));
    }
}

/** 캐시에서 읽은 스냅샷이 불완전하면 보관본으로 빈 묶음만 잇는다(있는 필드·시각 필드는 그대로). */
async function repairFromLastGood(snap: MacroSnapshot): Promise<MacroSnapshot> {
    // 유효 묶음은 보관본에 반영(관측일이 새로울 때만 실제 저장) — 완전한 스냅샷은 그대로 돌려준다
    rememberLastGood(snap);
    if (macroSnapshotComplete(snap)) return snap;
    const lg = await loadLastGood();
    const { snapshot, carried } = carryMissingMacroFields(snap, lg, Date.now());
    if (carried.length) console.warn(`[MacroHub] 캐시 스냅샷 빈칸 잇기: ${carried.join(',')}`);
    return snapshot;
}

const SYMBOLS = {
    NDX_PROXY: "QQQ", // Massive uses QQQ for Trend Logic
    DXY_PROXY: "UUP",  // UUP (Bullish Dollar ETF) as proxy for DXY
    TLT: "TLT",         // [V3 PIPELINE] 20+ Year Treasury Bond ETF
    GLD: "GLD"           // [V4.1] Gold ETF for safe-haven flow detection
};

// Synthetic Multipliers
// [V45.7] VIX now comes from getVixSSOT() directly (Yahoo real-time)
const MULTIPLIERS = {
    NDX: 41.45,
    DXY: 3.63    // [2026-01-13] Re-calibrated: 99.01 / 27.28 = 3.63
};

async function fetchIndexSnapshot(ticker: string, label: string, multiplier: number = 1, marketStatus?: MarketStatusResult): Promise<MacroFactor> {
    // [V3 Upgrade] Use Polygon V3 Snapshot for real-time accuracy (Pre/Post market support)
    // V3 response: { results: [ { ticker, last_trade, min, day, updated } ] }
    try {
        const res = await fetchMassive(`/v3/snapshot?ticker.any_of=${ticker}`, {}, true, undefined, CACHE_POLICY.LIVE);
        const result = res?.results?.[0]; // Get first match

        if (result) {
            // Priority: Last Trade (Live) > Min (Bar) > Day (Close)
            // V3 'last_trade' updates during Extended Hours if trade occurs
            // [Fix V3 Parsing] Use 'session' object if available (Standard V3 Snapshot)
            const session = result.session;

            const rawLevel =
                session?.price ||
                session?.close ||
                result.last_trade?.p ||
                result.min?.c ||
                result.day?.c ||
                result.prev_day?.c;

            const rawChgAbs = session?.change || result.todaysChange || (result.day?.c - result.prev_day?.c) || 0;
            const rawChgPct = session?.change_percent || result.todaysChangePerc || (result.day?.change_percent) || 0;

            if (rawLevel) {
                return {
                    level: rawLevel * multiplier,
                    chgPct: rawChgPct,
                    chgAbs: rawChgAbs * multiplier,
                    label: label,
                    source: "INTRINIO",
                    status: "OK",
                    symbolUsed: ticker
                };
            }
        }
    } catch (e) {
        // V3 failed, fall back?
    }

    // 2. Fallback: Aggs (Previous Close) - Kept for safety
    try {
        const prevRes = await fetchMassive(`/v2/aggs/ticker/${ticker}/prev`, {}, true);
        if (prevRes?.results?.[0]) {
            const r = prevRes.results[0];
            return {
                level: r.c * multiplier,
                chgPct: 0,
                chgAbs: 0,
                label: label + " (Delayed)",
                source: "INTRINIO",
                status: "OK",
                symbolUsed: ticker
            };
        }
    } catch (e) {
        // Aggs failed
    }

    return createFailFactor(label, ticker);
}

function createFailFactor(label: string, symbolUsed: string): MacroFactor {
    return { level: null, chgPct: null, chgAbs: null, label, source: "FAIL", status: "UNAVAILABLE", symbolUsed };
}

function createYahooFactor(quote: YahooQuote, label: string, symbolUsed: string): MacroFactor {
    const updatedAtMs = quote.updatedAt ? new Date(quote.updatedAt).getTime() : NaN;
    const marketTimeMs = quote.marketTime ? new Date(quote.marketTime).getTime() : NaN;
    const feedAgeSec = Number.isFinite(updatedAtMs)
        ? Math.max(0, Math.floor((Date.now() - updatedAtMs) / 1000))
        : undefined;
    const marketAgeSec = Number.isFinite(marketTimeMs)
        ? Math.max(0, Math.floor((Date.now() - marketTimeMs) / 1000))
        : undefined;
    // [2026-09-07] marketAgeSec 은 «신선도»가 아니다. 야후는 선물 피드가 멈춘 채로
    // regularMarketTime 만 전진시킨다 → marketAgeSec 650초, isStale false, 화면 LIVE.
    // 실제로 값이 바뀐 시각(lastChangeAt)으로만 «움직이고 있는가»를 답할 수 있다.
    const lastChangeMs = quote.lastChangeAt ? new Date(quote.lastChangeAt).getTime() : NaN;
    const frozenSec = Number.isFinite(lastChangeMs)
        ? Math.max(0, Math.floor((Date.now() - lastChangeMs) / 1000))
        : undefined;

    return {
        level: quote.price,
        chgPct: quote.changePct,
        chgAbs: quote.change,
        label,
        source: quote.source === "DEFAULT" ? "FAIL" : "YAHOO",
        status: quote.source !== "DEFAULT" ? "OK" : "UNAVAILABLE",
        symbolUsed,
        updatedAt: quote.updatedAt,
        marketTime: quote.marketTime,
        marketState: quote.marketState,
        exchangeTimezoneName: quote.exchangeTimezoneName,
        feedSource: quote.source,
        isStale: quote.isStale || quote.source === "DEFAULT",
        feedAgeSec,
        marketAgeSec,
        lastChangeAt: quote.lastChangeAt,
        frozenSec
    };
}

// [Phase 41.3] Real Macro Intelligence (Fed Data)
// Using /fed/v1/treasury-yields
async function fetchFedYield(): Promise<MacroFactor> {
    try {
        // Fetch latest 2 records to calculate change
        const res = await fetchMassive('/fed/v1/treasury-yields', { limit: '2', sort: 'date', order: 'desc' }, true);
        const records = res?.results;

        if (records?.[0]?.yield_10_year) {
            const current = records[0].yield_10_year;
            const previous = records[1]?.yield_10_year ?? current;
            const chgAbs = current - previous;
            const chgPct = previous !== 0 ? (chgAbs / previous) * 100 : 0;

            return {
                level: current,
                chgPct: Math.round(chgPct * 100) / 100,
                chgAbs: Math.round(chgAbs * 1000) / 1000,
                label: "US 10Y (Fed)",
                source: "INTRINIO",
                status: "OK",
                symbolUsed: "FED:10Y",
                marketTime: records[0].date,
            };
        }
    } catch (e) {
        console.error("[MacroHub] Fed Yield Fetch Failed", e);
    }
    return createFailFactor("US10Y", "FED");
}

// [V45.0] Yield Curve Data (2Y, 10Y for 2s10s Spread)
export interface YieldCurveData {
    us2y: number;
    us10y: number;
    spread2s10s: number;
    trend: 'STEEPENING' | 'FLATTENING' | 'INVERTED' | 'NORMAL';
    /** 관측일(YYYY-MM-DD). 헤드라인 10Y 를 갈아끼울지 판단하는 근거다 */
    date?: string;
    source?: string;
    /** 같은 곡선의 직전 거래일 10Y — 헤드라인을 곡선으로 쓸 때 변화량도 여기서 만든다 */
    prevDate?: string;
    prevUs10y?: number;
}

async function fetchYieldCurveData(): Promise<YieldCurveData | null> {
    try {
        // [V45.0] Use getTreasuryYields() from fedApiClient (FRED -> Massive fallback)
        const treasury = await getTreasuryYields();

        if (treasury.us2y !== null && treasury.us10y !== null) {
            const spread2s10s = treasury.spread2s10s ?? (treasury.us10y - treasury.us2y);

            // Determine trend based on spread level
            let trend: 'STEEPENING' | 'FLATTENING' | 'INVERTED' | 'NORMAL' = 'NORMAL';
            if (spread2s10s < 0) {
                trend = 'INVERTED';
            } else if (spread2s10s < 0.25) {
                trend = 'FLATTENING';
            } else if (spread2s10s > 1.0) {
                trend = 'STEEPENING';
            }

            console.log(`[MacroHub] YieldCurve: 2Y=${treasury.us2y.toFixed(2)}%, 10Y=${treasury.us10y.toFixed(2)}%, Spread=${spread2s10s.toFixed(2)}% (${trend})`);
            return {
                us2y: treasury.us2y, us10y: treasury.us10y, spread2s10s, trend, date: treasury.date, source: treasury.source,
                ...(treasury.prev ? { prevDate: treasury.prev.date, prevUs10y: treasury.prev.us10y } : {}),
            };
        }
    } catch (e) {
        console.error("[MacroHub] Yield Curve Fetch Failed", e);
    }
    return null;
}

/**
 * 헤드라인 10Y 정본 — 순수 함수(tests/yieldChange.test.ts).
 * ^TNX 세션이 곡선(재무부)보다 새로울 때만 ^TNX 를 쓴다(장중엔 재무부가 아직 게시 전이다).
 *
 * 곡선을 쓸 때는 변화량도 같은 곡선의 직전 거래일 대비로 만든다 (2026-09-29).
 *   ⚠️ 예전엔 수준만 곡선으로 갈아끼우고 변화량은 ^TNX 것이 남았다. 9/28 마감 뒤 실측:
 *      재무부 9/25 5.17 → 9/28 5.24 = +7bp 인데 변화량은 ^TNX 의 +0.056(+1.08%) —
 *      「전일 5.184」라는 어느 원본에도 없는 값을 암시했다. 직전 행이 없을 때만 예전대로 둔다.
 */
export function unifyUs10y(tnx: MacroFactor, yieldCurve: YieldCurveData | null, tnxIsNewer: boolean): MacroFactor {
    if (tnxIsNewer || !yieldCurve) return tnx;
    const curveChange = changeFromPrev(yieldCurve.us10y, yieldCurve.prevUs10y);
    return {
        ...tnx, level: yieldCurve.us10y, ...(curveChange ?? {}), label: "US 10Y",
        symbolUsed: yieldCurve.source === "US_TREASURY" ? "UST:10Y" : (tnx.symbolUsed || "FED:10Y"),
        source: (yieldCurve.source === "US_TREASURY" ? "US_TREASURY" : tnx.source) as any,
    };
}

// [V45.0] Inflation Expectations (for Real Yield calculation)
interface RealYieldData {
    us10y: number;
    inflationExpectation: number;
    realYield: number;
    stance: 'TIGHT' | 'NEUTRAL' | 'LOOSE';
    /** 계산에 쓴 두 관측의 공통 날짜(YYYY-MM-DD) */
    asOf?: string | null;
    /** 같은 날짜 짝 폴백으로 계산했는가(화면은 이때 관측일을 함께 표시) */
    fromPair?: boolean;
}

/**
 * ★2026-10-19 (대표 «REAL 도 데이터가 없다 · 데이터를 비게 하지 마라»): 장중엔 명목 10Y 가 «오늘»이고
 * 기대인플레이션(T5YIE)은 하루 늦게 나와 날짜가 절대 같지 않았다 → REAL 이 장중 내내 «—».
 * 날짜가 다르면 버리지 않고, 기존 정의와 같은 두 계열(FRED DGS10·T5YIE — 기존 경로의 기대인플레이션도 5년 브레이크이븐)의
 * «같은 날짜» 최신 관측으로 계산한다
 * (지어내지 않는다 — 둘 다 그날 실측. 화면은 그 날짜의 값).
 */
async function realYieldFromSameDatePair(): Promise<RealYieldData | null> {
    try {
        const [dgs10, t5yie] = await Promise.all([
            getEconomicSeries("$DGS10", 10),
            getEconomicSeries("$T5YIE", 10),
        ]);
        const exp = new Map(t5yie.map((r) => [r.date, r.value]));
        const pair = dgs10.find((r) => exp.has(r.date) && Number.isFinite(r.value) && Number.isFinite(exp.get(r.date)!));
        if (!pair) return null;
        // 너무 옛 관측(10일 초과)은 «지금» 실질금리로 쓰지 않는다 — 관문 10192357(9/1 관측이 10/20 화면에 날짜 없이 뜸)
        const ageDays = (Date.now() - Date.parse(pair.date + 'T00:00:00Z')) / 86400000;
        if (!Number.isFinite(ageDays) || ageDays > 10) return null;
        const us10y = pair.value;
        const inflationExpectation = exp.get(pair.date)!;
        const realYield = us10y - inflationExpectation;
        let stance: 'TIGHT' | 'NEUTRAL' | 'LOOSE' = 'NEUTRAL';
        if (realYield > 1.5) stance = 'TIGHT';
        else if (realYield < 0) stance = 'LOOSE';
        return { us10y, inflationExpectation, realYield, stance, asOf: pair.date, fromPair: true };
    } catch {
        return null;
    }
}

async function fetchRealYieldData(us10y: number | null, nominalDate: string | null, nominalSource: MacroFactor['source']): Promise<RealYieldData | null> {
    const exact = await fetchRealYieldExact(us10y, nominalDate, nominalSource);
    if (exact) return exact;
    return realYieldFromSameDatePair();
}

async function fetchRealYieldExact(us10y: number | null, nominalDate: string | null, nominalSource: MacroFactor['source']): Promise<RealYieldData | null> {
    const validSources = ['YAHOO', 'INTRINIO', 'US_TREASURY', 'FRED'];
    if (us10y === null || !Number.isFinite(us10y) || !validSources.includes(nominalSource)
        || !nominalDate || !/^\d{4}-\d{2}-\d{2}$/.test(nominalDate)) return null;
    let inflationExpectation: number;
    try {
        const inflationData = await getInflationData();
        if (!validSources.includes(inflationData.source) || inflationData.expectations === null
            || !Number.isFinite(inflationData.expectations)
            || inflationData.expectationsDate !== nominalDate) return null;
        inflationExpectation = inflationData.expectations;
    } catch (e) {
        return null;
    }

    const realYield = us10y - inflationExpectation;

    // Determine stance
    let stance: 'TIGHT' | 'NEUTRAL' | 'LOOSE' = 'NEUTRAL';
    if (realYield > 1.5) stance = 'TIGHT';
    else if (realYield < 0) stance = 'LOOSE';

    console.log(`[MacroHub] RealYield: 10Y=${us10y.toFixed(2)}% - Exp=${inflationExpectation.toFixed(2)}% = ${realYield.toFixed(2)}% (${stance})`);
    return { us10y, inflationExpectation, realYield, stance, asOf: nominalDate };
}

/**
 * [Phase 23] Macro SSOT
 * Aggregates Indices (QQQ) + VIX (VIXY) + Bond Yields (Fed) to determine Market Regime
 */
export function determineRegime(vixLevel: number, us10yLevel: number, qqqTrend: number): "RISK_ON" | "NEUTRAL" | "RISK_OFF" | "DAY_TRADE_ONLY" {
    // 1. Panic Gate (Standard VIX Scale)
    // Now VIX is synthetically ~14 (Normal).
    // Risk Off Threshold: VIX > 30 (Panic)
    // Warning Threshold: VIX > 20
    if (vixLevel > 30) return "RISK_OFF";

    // 2. Rate Shock Gate (Fed Yield)
    if (us10yLevel > 4.5) return "DAY_TRADE_ONLY"; // High rates kill swings

    // 3. Trend Gate
    if (qqqTrend > 0) return "RISK_ON";

    return "NEUTRAL";
}

function triggerCronIfNeeded(yahooData: any) {
    const now = Date.now();
    let needsUpdate = false;

    // Trigger cron if any key quote is default or stale (>5 min)
    const quotes = [
        yahooData.nq, yahooData.vix, yahooData.spx, yahooData.btc, 
        yahooData.gold, yahooData.oil, yahooData.rut, yahooData.tnx
    ];

    for (const q of quotes) {
        if (!q || q.source === 'DEFAULT' || !q.updatedAt) {
            needsUpdate = true;
            break;
        }
        const updatedTime = new Date(q.updatedAt).getTime();
        if (now - updatedTime > 300_000) { // 5 minutes stale
            needsUpdate = true;
            break;
        }
    }

    if (needsUpdate) {
        console.log('[MacroHub] Redis macro cache is empty or stale. Triggering background market-feed cron...');
        try {
            const isDev = process.env.NODE_ENV === 'development';
            const baseUrl = isDev ? 'http://localhost:3000' : (process.env.NEXT_PUBLIC_APP_URL || 'https://signumhq.com');
            fetch(`${baseUrl}/api/cron/market-feed`, {
                headers: {
                    'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '',
                }
            }).catch(err => {
                console.warn('[MacroHub] Stale trigger failed:', err.message);
            });
        } catch (e) {
            // ignore
        }
    }
}

/**
 * 메모리 → Redis(신선) → Redis(낡음, 즉시 주고 뒤에서 갱신) → 상류.
 * 사용자를 상류 조회 때문에 기다리게 하지 않는 것이 목적이다.
 */
export async function getMacroSnapshotSSOT(): Promise<MacroSnapshot> {
    const now = Date.now();

    // 1) 프로세스 메모리 — 가장 빠르다
    if (cache.data && cache.expiry > now) {
        cache.data.ageSeconds = Math.floor((now - cache.fetchedAt) / 1000);
        const mem = cache.data;
        if (macroSnapshotComplete(mem)) return mem;
        const fixed = await repairFromLastGood(mem);
        if (fixed !== mem && cache.data === mem) cache = { ...cache, data: fixed };
        return fixed;
    }

    // 2) 공유 캐시 — 콜드 인스턴스가 상류를 다시 긁지 않게 한다
    try {
        const shared = await getFromCache<{ data: MacroSnapshot; at: number }>(MACRO_REDIS_KEY);
        if (shared?.data && typeof shared.at === 'number') {
            const age = now - shared.at;
            shared.data.ageSeconds = Math.floor(age / 1000);
            // 불완전 스냅샷(옛 코드·원천 실패가 저장한 것)은 빈 묶음만 보관본으로 잇는다
            shared.data = await repairFromLastGood(shared.data);
            cache = { data: shared.data, expiry: shared.at + MACRO_FRESH_MS, fetchedAt: shared.at };

            if (age < MACRO_FRESH_MS) return shared.data;

            // 낡았지만 **먼저 주고** 뒤에서 갱신한다. 기다리게 하지 않는다.
            if (!macroRefreshing) {
                macroRefreshing = true;
                fetchMacroSnapshotFresh()
                    .catch(e => console.warn('[MacroHub] 배경 갱신 실패:', e?.message))
                    .finally(() => { macroRefreshing = false; });
            }
            return shared.data;
        }
    } catch (e: any) {
        console.warn('[MacroHub] 공유 캐시 읽기 실패:', e?.message);
    }

    // 3) 아무것도 없다 — 상류를 기다린다
    return fetchMacroSnapshotFresh();
}

async function fetchMacroSnapshotFresh(): Promise<MacroSnapshot> {
    const now = Date.now();
    console.log('[MacroHub] Fetching Massive Macros (Pure)...');
    const marketStatus = await getMarketStatusSSOT();
    const fetchedAtET = new Date().toISOString();

    // Parallel Fetch with Multipliers + [V7.0] Advanced Indicators
    // [V7.0] VIX, NQ, and TNX (US10Y) from Yahoo (rate-limited: 1 call/min)
    const [yahooData, qqqFallback, fedYield, yieldCurve, cnnFearGreed, creditSpread] = await Promise.all([
        getYahooDataSSOT(), // Yahoo -> Cache -> Redis -> Default (rate-limited)
        fetchIndexSnapshot(SYMBOLS.NDX_PROXY, "NASDAQ 100", MULTIPLIERS.NDX, marketStatus), // QQQ fallback
        fetchFedYield(), // FED daily yield (fallback for TNX)
        fetchYieldCurveData(),
        getFromCache<{ score: number; rating: string; updatedAt: string }>('cnn:feargreed'),
        // 신용 스프레드 — 실패해도 나머지 매크로는 그대로 나가야 한다
        getCreditSpread().catch(() => null),
    ]);

    // Check and trigger background self-healing cron
    triggerCronIfNeeded(yahooData);

    // [V45.9] Use NQ=F from Yahoo, fallback to QQQ proxy
    const nqData = yahooData.nq;
    const qqq: MacroFactor = nqData.source !== "DEFAULT"
        ? createYahooFactor(nqData, "NASDAQ 100", "NQ=F")
        : qqqFallback; // Fallback to QQQ proxy if Yahoo fails completely

    // [V45.9] Convert VIX Yahoo data to MacroFactor format
    const vixData = yahooData.vix;
    const vixy: MacroFactor = createYahooFactor(vixData, "VIX", "^VIX");

    // S&P 500 from Yahoo ES=F (E-mini futures)
    const spxData = yahooData.spx;
    const spx: MacroFactor = createYahooFactor(spxData, "S&P 500", "ES=F");

    // Bitcoin from Yahoo BTC-USD
    const btcData = yahooData.btc;
    const btc: MacroFactor = createYahooFactor(btcData, "Bitcoin", "BTC-USD");

    // Gold from Yahoo GC=F
    const goldData = yahooData.gold;
    const gold: MacroFactor = createYahooFactor(goldData, "Gold", "GC=F");

    // Oil (WTI) from Yahoo CL=F
    const oilData = yahooData.oil;
    const oil: MacroFactor = createYahooFactor(oilData, "Oil", "CL=F");

    // SOX (Philadelphia Semiconductor Index) from Yahoo ^SOX
    const soxData = yahooData.sox;
    const sox: MacroFactor = createYahooFactor(soxData, "SOX", "^SOX");

    // Russell 2000 from Yahoo RTY=F (E-mini futures)
    const rutData = yahooData.rut;
    const rut: MacroFactor = createYahooFactor(rutData, "Russell 2K", "RTY=F");

    // [V7.0] US10Y: Yahoo ^TNX real-time, fallback to FED daily
    const tnxData = yahooData.tnx;
    const us10y: MacroFactor = tnxData.source !== "DEFAULT"
        ? createYahooFactor(tnxData, "US 10Y", "^TNX")
        : fedYield; // Fallback to FED daily if Yahoo fails

    // ── 10년물 정본 (2026-08-30 수정) ────────────────────────────────
    //   ⚠️ 예전엔 무조건 Yahoo ^TNX 를 헤드라인으로 쓰고, 그 값에서 **FRED 의
    //      2Y 를 빼서** 2s10s 를 만들었다. 두 값의 날짜가 달라서 스프레드가
    //      통째로 틀렸다: 화면 0.52 vs 실제(8/28) 4.73−4.34 = **0.39**.
    //
    //   지금은 곡선(미 재무부 원본)이 정본이다. Yahoo 는 **곡선보다 새로운
    //   세션일 때만** 헤드라인을 갈아끼운다(장중엔 재무부가 아직 게시 전이다).
    //   스프레드는 **언제나 같은 날짜**의 곡선에서 만든다.
    const curveDate = yieldCurve?.date || '';
    const tnxSessionDate = String((tnxData as any)?.marketTime || '').slice(0, 10);
    const tnxIsNewer = !!(tnxSessionDate && curveDate && tnxSessionDate > curveDate);

    // 헤드라인 지표도 정본에 맞춘다 — 화면마다 다른 10년물이 뜨면 안 된다
    const us10yUnified = unifyUs10y(us10y, yieldCurve, tnxIsNewer);

    // 스프레드는 곡선 «안에서» 만든다. 갈아끼운 10Y 를 섞지 않는다.
    const liveYieldCurve = yieldCurve ? { ...yieldCurve } : null;

    // 실질금리도 같은 10년물을 쓴다
    const nominalDate = !tnxIsNewer && yieldCurve ? yieldCurve.date : us10y.marketTime?.slice(0, 10);
    const nominalSource = !tnxIsNewer && yieldCurve ? yieldCurve.source : us10y.source;
    const realYield = await fetchRealYieldData(us10yUnified.level, nominalDate ?? null, (nominalSource ?? 'FAIL') as MacroFactor['source']);

    // [V3 PIPELINE] TLT (Safe Haven) + GLD
    const [tltFactor, gldFactor] = await Promise.all([
        fetchIndexSnapshot(SYMBOLS.TLT, "TLT (20Y Bond)", 1, marketStatus),
        fetchIndexSnapshot(SYMBOLS.GLD, "GLD (Gold)", 1, marketStatus)
    ]);

    // DXY: prefer the REAL ICE US Dollar Index from Yahoo (DX-Y.NYB, ~24/5) so the change
    // is present during FX hours. Fall back to the UUP-ETF proxy only when the Yahoo feed
    // is missing/default — never regress to a blank.
    let dxy: MacroFactor;
    const yahooDxy = yahooData.dxy;
    if (yahooDxy && yahooDxy.source !== "DEFAULT" && (yahooDxy.price || 0) > 0) {
        dxy = createYahooFactor(yahooDxy, "DOLLAR (DXY)", "DX-Y.NYB");
    } else {
        dxy = await fetchIndexSnapshot(SYMBOLS.DXY_PROXY, "DOLLAR (DXY)", MULTIPLIERS.DXY, marketStatus);
    }

    // Regime Logic: QQQ Price > SMA20
    // We need to fetch SMA20 for QQQ
    let regime = "Neutral";
    let qqqSma20 = 0;

    try {
        const smaRes = await fetchMassive(`/v1/indicators/sma/${SYMBOLS.NDX_PROXY}`, { timespan: 'day', window: '20', limit: '1' }, true);
        if (smaRes?.results?.values?.[0]) {
            // Note: SMA is RAW QQQ price. We compare RAW QQQ price vs RAW SMA.
            // But qqq variable is SCALED. We need to unscale or just use independent check.
            qqqSma20 = smaRes.results.values[0].value;

            // To be safe, we don't know the exact raw QQQ price unless we kept it.
            // But we know qqq.level = raw * 41.45
            // So raw = qqq.level / 41.45
            const rawPrice = (qqq.level || 0) / MULTIPLIERS.NDX;

            if (rawPrice > qqqSma20) {
                regime = "Bullish (QQQ > SMA20)";
            } else {
                regime = "Bearish (QQQ < SMA20)";
            }
            // Enrich label
            qqq.label = `NASDAQ 100 (Syn)`;
        }
    } catch (e) {
        // console.warn("[MacroHub] SMA fetch failed", e);
    }

    // Intrinio 경제계열이 실패했을 때만 FRED 원본의 같은 계열·같은 계산으로 만든다(lib/macroFredFallback 머리말).
    //   정상 경로(둘 다 받음)는 호출 0·결과 동일. FRED 짝은 fromPair 라 realYield(점수·AI 입력)에는 들어가지 않는다.
    const [creditSpreadOut, realPairFred] = await Promise.all([
        creditSpread ? Promise.resolve(creditSpread) : fredCreditSpread().catch(() => null),
        realYield ? Promise.resolve(null) : fredRealPair().catch(() => null),
    ]);

    const snapshot: MacroSnapshot = {
        asOfET: marketStatus.asOfET || fetchedAtET,
        fetchedAtET,
        ageSeconds: 0,
        marketStatus,
        // us10yUnified — 곡선과 «같은» 10년물. 화면마다 다른 값이 뜨지 않게 한다.
        factors: { nasdaq100: qqq, vix: vixy, us10y: us10yUnified, dxy, spx, btc, gold, oil, sox, rut },
        // Legacy fields
        nq: qqq.level ?? 0,
        nqChangePercent: qqq.chgPct ?? 0,
        vix: vixy.level ?? 0,
        // ★ 이 legacy 필드도 통일본을 쓴다 — 여기만 옛 값이면 «화면마다 다른
        //   10년물»이 그대로 남는다(실제로 /api/market/macro 가 이걸 내보낸다)
        us10y: us10yUnified.level ?? 0,
        dxy: dxy.level ?? 0,
        // [V7.0] Advanced Macro Indicators (live US10Y)
        yieldCurve: liveYieldCurve ?? undefined,
        // 같은 날짜 짝 폴백(fromPair)은 «화면 표시용»으로만 — 점수·AI 는 기존처럼 정시 계산값만 쓴다(관문 10200004)
        realYield: realYield && !realYield.fromPair ? realYield : undefined,
        realYieldObserved: realYield ?? realPairFred ?? undefined,
        // [V3 PIPELINE] Safe Haven ETFs
        tltChangePct: tltFactor.chgPct ?? null,
        gldChangePct: gldFactor.chgPct ?? null,
        fearGreed: cnnFearGreed || undefined,
        creditSpread: creditSpreadOut || undefined,
    };

    // 빈칸 잇기 — 원천에서 새로 받은 묶음은 보관하고, 빠진 묶음만 마지막 정상 관측(원래 관측일 그대로)으로 잇는다.
    //   상한(관측일 뒤 평일 3일)보다 오래된 보관값은 잇지 않는다. 다 들어온 정상 결과는 같은 객체 그대로 나간다.
    rememberLastGood(snapshot);
    let finalSnapshot = snapshot;
    if (!macroSnapshotComplete(snapshot)) {
        // 만료된 메모리 스냅샷의 정상 묶음도 후보로(보관본 저장 전 옛 코드가 만든 값)
        if (cache.data) rememberLastGood(cache.data);
        const lg = await loadLastGood(true);
        const r = carryMissingMacroFields(snapshot, lg, Date.now());
        finalSnapshot = r.snapshot;
        console.warn(`[MacroHub] 재계산 빈칸 — 이음: ${r.carried.join(',') || '없음'} · 못 이음: ${r.missing.join(',') || '없음'}`);
    }

    cache = { data: finalSnapshot, expiry: now + CACHE_TTL_MS, fetchedAt: now };
    // 공유 캐시에도 남긴다 — 다음 콜드 인스턴스가 상류를 다시 긁지 않도록.
    // 실패해도 응답에는 영향이 없어야 한다.
    setInCache(MACRO_REDIS_KEY, { data: finalSnapshot, at: now }, MACRO_RETENTION_SEC)
        .catch(e => console.warn('[MacroHub] 공유 캐시 저장 실패:', e?.message));
    return finalSnapshot;
}
