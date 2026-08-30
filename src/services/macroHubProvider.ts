// [S-48.4] MacroHub Provider (Massive API Native V2 + Synthetic Calibration)
// Pure Massive Implementation: QQQ(Trend), US10Y(Fed API)
// [V45.9] VIX and NQ from Yahoo Finance with rate limiting (1 call/min)
// Synthetic Multipliers applied to mimic Index Levels.

import { fetchMassive, CACHE_POLICY } from './massiveClient';
import { getCreditSpread } from "@/services/intrinioClient";
import { MarketStatusResult, getMarketStatusSSOT } from "./marketStatusProvider";
import { getUpcomingEvents } from './eventHubProvider';
import { getTreasuryYields, getInflationData } from './fedApiClient';
import { getYahooDataSSOT, YahooQuote } from './yahooFinanceHub';
import { getFromCache } from './redisClient';

export interface MacroFactor {
    level: number | null;
    chgPct?: number | null;
    chgAbs?: number | null;
    label: string;
    source: "MASSIVE" | "FRED" | "FAIL"; // Added FRED source
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
    };
    realYield?: {
        us10y: number;          // 10Y Nominal
        inflationExpectation: number; // Breakeven or TIPS-based
        realYield: number;       // 10Y - Inflation Expectation
        stance: 'TIGHT' | 'NEUTRAL' | 'LOOSE';
    };
}

const CACHE_TTL_MS = 60000; // 1 min cache (matches Yahoo rate limit)
let cache: { data: MacroSnapshot | null; expiry: number; fetchedAt: number } = { data: null, expiry: 0, fetchedAt: 0 };

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
                    source: "MASSIVE",
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
                source: "MASSIVE",
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

    return {
        level: quote.price,
        chgPct: quote.changePct,
        chgAbs: quote.change,
        label,
        source: quote.source === "DEFAULT" ? "FAIL" : "MASSIVE",
        status: quote.source !== "DEFAULT" ? "OK" : "UNAVAILABLE",
        symbolUsed,
        updatedAt: quote.updatedAt,
        marketTime: quote.marketTime,
        marketState: quote.marketState,
        exchangeTimezoneName: quote.exchangeTimezoneName,
        feedSource: quote.source,
        isStale: quote.isStale || quote.source === "DEFAULT",
        feedAgeSec,
        marketAgeSec
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
                source: "MASSIVE",
                status: "OK",
                symbolUsed: "FED:10Y"
            };
        }
    } catch (e) {
        console.error("[MacroHub] Fed Yield Fetch Failed", e);
    }
    return createFailFactor("US10Y", "FED");
}

// [V45.0] Yield Curve Data (2Y, 10Y for 2s10s Spread)
interface YieldCurveData {
    us2y: number;
    us10y: number;
    spread2s10s: number;
    trend: 'STEEPENING' | 'FLATTENING' | 'INVERTED' | 'NORMAL';
    /** 관측일(YYYY-MM-DD). 헤드라인 10Y 를 갈아끼울지 판단하는 근거다 */
    date?: string;
    source?: string;
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
            return { us2y: treasury.us2y, us10y: treasury.us10y, spread2s10s, trend, date: treasury.date, source: treasury.source };
        }
    } catch (e) {
        console.error("[MacroHub] Yield Curve Fetch Failed", e);
    }
    return null;
}

// [V45.0] Inflation Expectations (for Real Yield calculation)
interface RealYieldData {
    us10y: number;
    inflationExpectation: number;
    realYield: number;
    stance: 'TIGHT' | 'NEUTRAL' | 'LOOSE';
}

async function fetchRealYieldData(us10y: number): Promise<RealYieldData | null> {
    // [V7.0] Use real inflation expectations from FED API, fallback to 2.3%
    let inflationExpectation = 2.3; // Default fallback
    try {
        const inflationData = await getInflationData();
        if (inflationData.expectations !== null) {
            inflationExpectation = inflationData.expectations;
            console.log(`[MacroHub] Real Inflation Expectation from API: ${inflationExpectation}%`);
        }
    } catch (e) {
        console.warn('[MacroHub] Inflation API failed, using default 2.3%');
    }

    const realYield = us10y - inflationExpectation;

    // Determine stance
    let stance: 'TIGHT' | 'NEUTRAL' | 'LOOSE' = 'NEUTRAL';
    if (realYield > 1.5) stance = 'TIGHT';
    else if (realYield < 0) stance = 'LOOSE';

    console.log(`[MacroHub] RealYield: 10Y=${us10y.toFixed(2)}% - Exp=${inflationExpectation.toFixed(2)}% = ${realYield.toFixed(2)}% (${stance})`);
    return { us10y, inflationExpectation, realYield, stance };
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

export async function getMacroSnapshotSSOT(): Promise<MacroSnapshot> {
    const now = Date.now();
    if (cache.data && cache.expiry > now) {
        cache.data.ageSeconds = Math.floor((now - cache.fetchedAt) / 1000);
        return cache.data;
    }

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

    const liveUs10y = tnxIsNewer
        ? (us10y.level ?? yieldCurve?.us10y ?? null)
        : (yieldCurve?.us10y ?? us10y.level ?? null);

    // 헤드라인 지표도 정본에 맞춘다 — 화면마다 다른 10년물이 뜨면 안 된다
    const us10yUnified: MacroFactor = tnxIsNewer
        ? us10y
        : (yieldCurve
            ? { ...us10y, level: yieldCurve.us10y, label: "US 10Y",
                symbolUsed: yieldCurve.source === "US_TREASURY" ? "UST:10Y" : (us10y.symbolUsed || "FED:10Y"),
                source: (yieldCurve.source === "US_TREASURY" ? "MASSIVE" : us10y.source) as any }
            : us10y);

    // 스프레드는 곡선 «안에서» 만든다. 갈아끼운 10Y 를 섞지 않는다.
    const liveYieldCurve = yieldCurve ? { ...yieldCurve } : null;

    // 실질금리도 같은 10년물을 쓴다
    const realYield = await fetchRealYieldData(liveUs10y ?? 4.2);

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
        realYield: realYield ?? undefined,
        // [V3 PIPELINE] Safe Haven ETFs
        tltChangePct: tltFactor.chgPct ?? null,
        gldChangePct: gldFactor.chgPct ?? null,
        fearGreed: cnnFearGreed || undefined,
        creditSpread: creditSpread || undefined,
    };

    cache = { data: snapshot, expiry: now + CACHE_TTL_MS, fetchedAt: now };
    return snapshot;
}
