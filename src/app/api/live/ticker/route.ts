// [S-52.2.3] Live Ticker API - Force Dynamic + Build Metadata
// [PERF] Redis cache + payload slimming for Flow page optimization
import { NextRequest } from 'next/server';
import { getBuildMeta } from '@/services/buildMeta';
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";
import { calculateAlphaScore, calculateWhaleIndex, computeRSI14, computeImpliedMovePct, computeIVSkew, type AlphaSession } from '@/services/alphaEngine';
import { CentralDataHub } from "@/services/centralDataHub";
import { getStructureData } from "@/services/structureService"; // [SQUEEZE FIX]
import { getMacroSnapshotSSOT } from '@/services/macroHubProvider'; // [V3 PIPELINE]
import { getFromCache, setInCache } from '@/services/redisClient'; // [PERF] Redis caching

// [S-56.4.5c] Legacy URL building - these are used for direct fetch URLs
const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const MASSIVE_BASE_URL = process.env.MASSIVE_BASE_URL || "https://api.polygon.io";

// [S-52.2.3] Force dynamic rendering - no static optimization
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SessionType = "PRE" | "REG" | "POST" | "CLOSED";

async function fetchMassiveWithRetry(url: string, attempts = 3): Promise<any> {
    const start = Date.now();
    try {
        const data = await fetchMassive(url, {}, false, undefined, CACHE_POLICY.LIVE);
        return { data, latency: Date.now() - start, success: true };
    } catch (e) {
        return { data: null, latency: Date.now() - start, success: false, error: e };
    }
}

// [S-52.2.1] Helper: fraction to pct conversion
function fracToPct(frac: number | null): number | null {
    return frac !== null ? Math.round(frac * 10000) / 100 : null;  // 0.00144 -> 0.14
}

// [PERF] Slim option chain: keep only fields FlowRadar actually uses
function slimOptionChain(chain: any[], includeGreeksDetail: boolean = true): any[] {
    if (!chain || !Array.isArray(chain)) return [];
    return chain.map(opt => {
        const slim: any = {
            details: {
                strike_price: opt.details?.strike_price,
                contract_type: opt.details?.contract_type,
                expiration_date: opt.details?.expiration_date,
            },
            open_interest: opt.open_interest,
        };
        if (includeGreeksDetail) {
            // rawChain needs full greeks + day data
            slim.greeks = {
                delta: opt.greeks?.delta,
                gamma: opt.greeks?.gamma,
                implied_volatility: opt.greeks?.implied_volatility,
            };
            slim.day = {
                volume: opt.day?.volume,
                close: opt.day?.close,
                open_interest: opt.day?.open_interest,
            };
            slim.implied_volatility = opt.implied_volatility;
            if (opt.last_quote?.midpoint !== undefined) {
                slim.last_quote = { midpoint: opt.last_quote.midpoint };
            }
        } else {
            // allExpiryChain only needs gamma + OI for GEX calculation
            slim.greeks = {
                gamma: opt.greeks?.gamma,
            };
        }
        return slim;
    });
}

// [PERF] Redis cache key for ticker response
const TICKER_CACHE_TTL = 60; // 60 seconds
function tickerCacheKey(ticker: string): string {
    return `flow:ticker:${ticker}`;
}

export async function GET(req: NextRequest) {
    const t = req.nextUrl.searchParams.get('t');
    if (!t) {
        return new Response(JSON.stringify({ error: "Missing ticker" }), {
            status: 400,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }

    const ticker = t.toUpperCase();

    // [PERF] Check Redis cache first — returns in ~0.1s if cache hit
    try {
        const cached = await getFromCache<any>(tickerCacheKey(ticker));
        if (cached) {
            console.log(`[live/ticker] CACHE HIT for ${ticker}`);
            return new Response(JSON.stringify({ ...cached, _cached: true, _cachedAt: cached.tsServer }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store, max-age=0, must-revalidate',
                    'X-Cache': 'HIT'
                }
            });
        }
    } catch (e) {
        console.warn(`[live/ticker] Redis cache check failed for ${ticker}, proceeding without cache`);
    }

    const serverTs = Date.now();
    const seq = serverTs;

    // [S-52.2.3] Reliable ET timezone handling using Intl.DateTimeFormat
    const now = new Date();
    const etFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
        weekday: 'short'
    });
    const parts = etFormatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';

    const etYear = parseInt(getPart('year'));
    const etMonth = parseInt(getPart('month'));
    const etDay = parseInt(getPart('day'));
    const etHour = parseInt(getPart('hour')) || 0;
    const etMin = parseInt(getPart('minute')) || 0;
    const etWeekday = getPart('weekday');
    const isWeekend = etWeekday === 'Sat' || etWeekday === 'Sun';

    const todayStr = `${etYear}-${String(etMonth).padStart(2, '0')}-${String(etDay).padStart(2, '0')}`;

    // Calculate yesterday in ET (handle month/year boundaries)
    const todayET = new Date(Date.UTC(etYear, etMonth - 1, etDay, 12, 0, 0)); // noon UTC for safe date math
    const yesterdayET = new Date(todayET);
    yesterdayET.setUTCDate(yesterdayET.getUTCDate() - 1);
    const yesterdayStr = `${yesterdayET.getUTCFullYear()}-${String(yesterdayET.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterdayET.getUTCDate()).padStart(2, '0')}`;

    // 30 days ago for RSI14 calculation (need at least 15 data points)
    const thirtyDaysAgoET = new Date(todayET);
    thirtyDaysAgoET.setUTCDate(thirtyDaysAgoET.getUTCDate() - 30);
    const thirtyDaysAgoStr = `${thirtyDaysAgoET.getUTCFullYear()}-${String(thirtyDaysAgoET.getUTCMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgoET.getUTCDate()).padStart(2, '0')}`;

    // [SSOT] Use CentralDataHub/MarketStatusProvider for Session Logic (Handles Holidays/Weekends correctly)
    const marketStatus = await CentralDataHub.getMarketStatus();
    let session: SessionType = "CLOSED";
    const sRaw = marketStatus.session;
    if (sRaw === "pre") session = "PRE";
    else if (sRaw === "regular") session = "REG";
    else if (sRaw === "post") session = "POST";
    else session = "CLOSED";

    const etStr = `${etMonth}/${etDay}/${etYear}, ${etHour}:${String(etMin).padStart(2, '0')}`;

    // Fetch Core Data
    const snapshotUrl = `${MASSIVE_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${MASSIVE_API_KEY}`;
    // [S-52.2.3] Use proper date strings for agg API (not timestamps)
    const aggUrl = `${MASSIVE_BASE_URL}/v2/aggs/ticker/${ticker}/range/1/day/${thirtyDaysAgoStr}/${yesterdayStr}?adjusted=true&sort=desc&limit=20&apiKey=${MASSIVE_API_KEY}`;

    const [snapshotRes, aggRes, detailsRes] = await Promise.all([
        fetchMassiveWithRetry(snapshotUrl),
        fetchMassiveWithRetry(aggUrl),
        fetchMassiveWithRetry(`${MASSIVE_BASE_URL}/v3/reference/tickers/${ticker}?apiKey=${MASSIVE_API_KEY}`)
    ]);

    // Get company name from ticker details
    const companyName = detailsRes.data?.results?.name || ticker;

    // [Fix] Determine Last Trading Day from Aggregates to safely fetch OC (Open-Close)
    // This ensures we get Friday's Pre/Post data even on a Sunday.
    const historicalResults = aggRes.data?.results || [];
    let ocDateStr = todayStr;

    // Use the most recent trading day from history if available
    if (historicalResults.length > 0 && historicalResults[0].t) {
        // Simple formatter for the agg timestamp (which is UTC midnight usually, but safe for YYYY-MM-DD)
        const dateObj = new Date(historicalResults[0].t);
        // Polygon Agg timestamps are UTC. 
        // We need YYYY-MM-DD. 
        const y = dateObj.getUTCFullYear();
        const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getUTCDate()).padStart(2, '0');
        ocDateStr = `${y}-${m}-${d}`;
    } else {
        // Fallback logic if agg failed
        ocDateStr = yesterdayStr;
    }

    // [PERF] Phase 1 results - extract snapshot data immediately
    const S = snapshotRes.data?.ticker || {};

    // [S-52.3] BASELINE SOURCE TRACKING - Identify where prevClose comes from
    let prevRegularClose: number | null = null;
    let prevPrevRegularClose: number | null = null;
    let baselineSource: string = "UNKNOWN";

    if (historicalResults[0]?.c) {
        prevRegularClose = historicalResults[0].c;
        baselineSource = "prevAgg.c";
    } else if (S.prevDay?.c) {
        prevRegularClose = S.prevDay.c;
        baselineSource = "snapshot.prevDay.c";
    }

    if (historicalResults[1]?.c) {
        prevPrevRegularClose = historicalResults[1].c;
    }

    const liveLast = S.lastTrade?.p || S.min?.c || null;

    // [PERF] Phase 2: Parallelize OC, Flow, and Structure fetches (~2-3s saved)
    const flowPriceDetect = liveLast || S.day?.c || S.prevDay?.c || 0;

    const fetchOC = async () => {
        let oc = await fetchMassiveWithRetry(`${MASSIVE_BASE_URL}/v1/open-close/${ticker}/${todayStr}?apiKey=${MASSIVE_API_KEY}`);
        if (!oc.success || !oc.data?.preMarket) {
            if (ocDateStr !== todayStr) {
                oc = await fetchMassiveWithRetry(`${MASSIVE_BASE_URL}/v1/open-close/${ticker}/${ocDateStr}?apiKey=${MASSIVE_API_KEY}`);
            } else {
                oc = await fetchMassiveWithRetry(`${MASSIVE_BASE_URL}/v1/open-close/${ticker}/${yesterdayStr}?apiKey=${MASSIVE_API_KEY}`);
            }
        }
        return oc;
    };

    const fetchFlow = async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                return await CentralDataHub._fetchOptionsChain(ticker, flowPriceDetect);
            } catch (err: any) {
                if (attempt < 2) {
                    console.warn(`[live/ticker] fetchFlow attempt ${attempt + 1} failed for ${ticker}, retrying...`);
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                } else {
                    console.error(`[live/ticker] fetchFlow FINAL FAIL for ${ticker}:`, err.message);
                    return { dataSource: "NONE", rawChain: [], error: err.message };
                }
            }
        }
    };

    const fetchStructure = async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                return await getStructureData(ticker);
            } catch (err: any) {
                if (attempt < 2) {
                    console.warn(`[live/ticker] fetchStructure attempt ${attempt + 1} failed for ${ticker}, retrying...`);
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                } else {
                    console.error(`[live/ticker] fetchStructure FINAL FAIL for ${ticker}:`, err.message);
                    return { squeezeScore: null, squeezeRisk: null, atmIv: null, netGex: null, pcr: null, gammaFlipLevel: null, callWall: null, putFloor: null };
                }
            }
        }
    };

    // [V3 PIPELINE] Fetch realtime-metrics for darkPool/shortVol
    const fetchRealtimeMetrics = async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const baseUrl = new URL(req.url).origin;
                const res = await fetch(`${baseUrl}/api/flow/realtime-metrics?ticker=${ticker}`);
                if (res.ok) return await res.json();
                throw new Error(`HTTP ${res.status}`);
            } catch (err: any) {
                if (attempt < 2) {
                    console.warn(`[live/ticker] fetchRealtimeMetrics attempt ${attempt + 1} failed for ${ticker}, retrying...`);
                    await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
                } else {
                    console.error(`[live/ticker] fetchRealtimeMetrics FINAL FAIL for ${ticker}`);
                    return null;
                }
            }
        }
    };

    // [V3 PIPELINE] Fetch macro snapshot for regime data (NQ/VIX)
    const fetchMacro = async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                return await getMacroSnapshotSSOT();
            } catch (err: any) {
                if (attempt < 2) {
                    console.warn(`[live/ticker] fetchMacro attempt ${attempt + 1} failed, retrying...`);
                    await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
                } else {
                    console.error(`[live/ticker] fetchMacro FINAL FAIL:`, err.message);
                    return null;
                }
            }
        }
    };

    // [V3 PIPELINE] Fetch SMA20 for Momentum pillar
    const fetchSMA20 = async () => {
        try {
            const sma20Url = `${MASSIVE_BASE_URL}/v1/indicators/sma/${ticker}?timespan=day&adjusted=true&window=20&series_type=close&limit=1&apiKey=${MASSIVE_API_KEY}`;
            const res = await fetchMassiveWithRetry(sma20Url);
            return res.data?.results?.values?.[0]?.value ?? null;
        } catch {
            return null;
        }
    };

    const [ocRes, flowRes, structureResult, metricsData, macroData, sma20Value] = await Promise.all([
        fetchOC(),
        fetchFlow(),
        fetchStructure(),
        fetchRealtimeMetrics(),
        fetchMacro(),
        fetchSMA20()
    ]);

    // Phase 2 results - extract OC data and compute derived values
    const OC = ocRes.data || {};

    const hasMarketClosed = session === "POST" || session === "CLOSED";
    const regularCloseToday = hasMarketClosed ? (S.day?.c || OC.close || null) : null;

    const prePrice = (session === "PRE" ? liveLast : null)
        || OC.preMarket
        || S.preMarket?.p;

    const postPrice = (session === "POST" ? liveLast : null)
        || OC.afterHoursClose
        || S.afterHours?.p
        || OC.afterHours;

    // [SQUEEZE FIX] Get squeezeScore from structureService for unified display
    const squeezeScore: number | null = structureResult.squeezeScore ?? null;
    const squeezeRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' | null = structureResult.squeezeRisk ?? null;

    const flowData = { ...flowRes, squeezeScore, squeezeRisk };

    const warnings: string[] = [];

    // [S-52.2.1] Calculate changePct as FRACTION
    const changePctFrac_PRE = (prePrice !== null && prevRegularClose !== null && prevRegularClose !== 0)
        ? (prePrice - prevRegularClose) / prevRegularClose : null;

    const changePctFrac_REG = (liveLast !== null && prevRegularClose !== null && prevRegularClose !== 0)
        ? (liveLast - prevRegularClose) / prevRegularClose : null;

    const postBaseline = regularCloseToday || prevRegularClose;
    const changePctFrac_POST = (postPrice !== null && postBaseline !== null && postBaseline !== 0)
        ? (postPrice - postBaseline) / postBaseline : null;

    // [New] Calculate Previous Session Change (Yesterday vs Day Before)
    let prevChangePctFrac: number | null = null;
    if (prevRegularClose && prevPrevRegularClose && prevPrevRegularClose !== 0) {
        prevChangePctFrac = (prevRegularClose - prevPrevRegularClose) / prevPrevRegularClose;
    }

    // Build display values
    let activePrice: number | null = null;
    let baselinePrice: number | null = null;
    let changePctFrac: number | null = null;
    let baselineLabel = "";
    let priceLabel = "";

    switch (session) {
        case "PRE":
            activePrice = prePrice;
            baselinePrice = prevRegularClose;
            changePctFrac = changePctFrac_PRE;
            baselineLabel = "PRE vs Prev Close";
            priceLabel = "Pre-Market";
            break;
        case "REG":
            activePrice = liveLast;
            baselinePrice = prevRegularClose;
            changePctFrac = changePctFrac_REG;
            baselineLabel = "REG vs Prev Close";
            priceLabel = "Market";
            if (baselinePrice !== prevRegularClose) warnings.push("BASELINE_DRIFT_REG");
            break;
        case "POST":
            // [Phase 23.7] Updated: Prioritize Post-Market (After Hours) Price
            activePrice = postPrice || liveLast || regularCloseToday;
            baselinePrice = prevRegularClose;

            // Calculate Main Change (Reg vs PrevReg) OR (Post vs PrevReg)?
            // User wants "All Data Open". Let's show Post vs PrevReg (Total Change)
            if (activePrice && baselinePrice && baselinePrice !== 0) {
                changePctFrac = (activePrice - baselinePrice) / baselinePrice;
            } else {
                changePctFrac = null;
            }

            baselineLabel = "Today vs Prev Close (Inc. Post)";
            priceLabel = "After Hours";
            break;
        default: // CLOSED session
            // [Fix] Show Regular Close Logic (Intraday) because Post Market is separately displayed
            // Prioritize Regular Close > Post Price (if Reg missing) > Last Trade
            activePrice = regularCloseToday || postPrice || liveLast || prevRegularClose;
            baselinePrice = prevRegularClose; // Always use prevClose as baseline for main change%

            // Calculate change
            if (activePrice && baselinePrice && baselinePrice !== 0) {
                changePctFrac = (activePrice - baselinePrice) / baselinePrice;
            } else {
                changePctFrac = null;
            }

            baselineLabel = "Today vs Prev Close";
            priceLabel = "Last Price";

            // [Phase 24.0] Rollover Fix: If change is 0% (because date rolled over, so Today==Prev),
            // show PREVIOUS session's change instead (e.g. 12/29 Change).
            if ((changePctFrac === 0 || changePctFrac === null) && historicalResults.length >= 2) {
                // H[0] = 12/29 (Today for the user perspective logic), H[1] = 12/28 (Yesterday)
                const lastClose = historicalResults[0].c;
                const prevLastClose = historicalResults[1].c;
                if (lastClose && prevLastClose) {
                    changePctFrac = (lastClose - prevLastClose) / prevLastClose;
                    baselineLabel = "Prev Session Change"; // Informative label
                    // Keep activePrice as is (it's the correct Last Close)
                }
            }
            break;
    }

    // [S-52.2.1] Calculate Pct and Abs
    const changePctPct = fracToPct(changePctFrac);
    const changeAbs = activePrice !== null && baselinePrice !== null
        ? Math.round((activePrice - baselinePrice) * 100) / 100
        : null;

    // Invariant check
    let changePctFracComputed: number | null = null;
    if (activePrice !== null && baselinePrice !== null && baselinePrice !== 0) {
        changePctFracComputed = (activePrice - baselinePrice) / baselinePrice;
        if (changePctFrac !== null && Math.abs(changePctFrac - changePctFracComputed) > 1e-9) {
            warnings.push("MISMATCH_CALC");
        }
    }

    const calc = {
        activePrice,
        baselinePrice,
        numerator: changeAbs,
        denom: baselinePrice,
        changePctFracComputed,
        changePctFracDisplay: changePctFrac,
        changePctPctComputed: fracToPct(changePctFracComputed),
        changePctPctDisplay: changePctPct,
        match: changePctFrac === null ? null : (Math.abs((changePctFrac || 0) - (changePctFracComputed || 0)) < 1e-9)
    };

    // [P/C RATIO VOLUME] Pre-compute volume PCR (same as FlowRadar.tsx pcRatio)
    const _rc = (flowData as any)?.rawChain || [];
    let _cvol = 0, _pvol = 0;
    _rc.forEach((o: any) => {
        const v = o.day?.volume || 0;
        const ct = o.details?.contract_type;
        if (ct === 'call') _cvol += v;
        else if (ct === 'put') _pvol += v;
    });
    const _vpcr = (_cvol > 0 || _pvol > 0) ? (_pvol > 0 ? Math.round((_cvol / _pvol) * 100) / 100 : (_cvol > 0 ? 10 : 0)) : null;

    // [S-52.2.1] Full response with explicit Frac/Pct/Abs
    const response = {
        ticker,
        name: companyName,
        timestampET: etStr,
        session,
        tsServer: serverTs,
        seq,

        // Legacy compat (deprecated - use display.changePctPct for UI)
        price: activePrice,
        changePct: changePctFrac,  // DEPRECATED: fraction
        prevClose: prevRegularClose,
        vwap: S.day?.vw || S.prevDay?.vw || null,

        // [Fix] Include Options Flow Data in Response
        // [PERF] Slim rawChain (121KB→35KB) and allExpiryChain (2.89MB→~400KB)
        flow: {
            ...(flowData as any),
            rawChain: slimOptionChain((flowData as any)?.rawChain, true),
            allExpiryChain: slimOptionChain((flowData as any)?.allExpiryChain, false),
            gammaFlipLevel: (structureResult as any)?.gammaFlipLevel ?? null,
            oiPcr: (structureResult as any)?.pcr ?? null,  // [PCR] OI-based Put/Call Ratio from structureService
            volumePcr: _vpcr,
            volumePcrCallVol: _cvol > 0 ? _cvol : null,
            volumePcrPutVol: _pvol > 0 ? _pvol : null,
        },

        // [S-52.2.1] PRIMARY DISPLAY BLOCK
        display: {
            price: activePrice,
            changePctFrac,      // Fraction: -0.00144
            changePctPct,       // Percent: -0.14 (for UI display)
            changeAbs,          // Absolute: -0.69
            unit: "pct",        // UI hint: use changePctPct with %
            baselinePrice,
            baselineLabel,
            priceLabel,
            asOfET: etStr
        },

        // [S-52.2.1] All 3 sessions - both frac and pct
        changesFrac: {
            PRE: changePctFrac_PRE,
            REG: changePctFrac_REG,
            POST: changePctFrac_POST
        },
        changesPct: {
            PRE: fracToPct(changePctFrac_PRE),
            REG: fracToPct(changePctFrac_REG),
            POST: fracToPct(changePctFrac_POST)
        },

        // All prices
        prices: {
            prePrice,
            lastTrade: liveLast,
            postPrice,
            prevRegularClose,
            prevPrevRegularClose, // [New] Day BEFORE prevRegularClose (for intraday change)
            prevChangePct: fracToPct(prevChangePctFrac), // [New] Pct format (e.g. 1.25)
            regularCloseToday
        },

        extended: {
            prePrice,
            postPrice,
            preChangePct: changePctFrac_PRE,
            postChangePct: changePctFrac_POST
        },

        calc,
        warnings: warnings.length > 0 ? warnings : undefined,

        // [S-52.3] BASELINE SOURCE TRACING
        baseline: {
            value: prevRegularClose,
            source: baselineSource,
            dateET: yesterdayStr,
            aggDateRange: `${thirtyDaysAgoStr} to ${yesterdayStr}`
        },

        // [S-52.3] TIMEZONE DIAGNOSTICS
        tz: {
            nowISO: new Date().toISOString(),
            nowET: etStr,
            etParts: { year: etYear, month: etMonth, day: etDay, hour: etHour, min: etMin, weekday: etWeekday },
            processTZ: Intl.DateTimeFormat().resolvedOptions().timeZone,
            todayStr,
            yesterdayStr
        },

        sourceGrade: snapshotRes.success ? "A" : "C",

        // [V3.0] Alpha Engine V3 — Real-time absolute scoring
        // Uses already-fetched data: minimal additional API calls (metrics only)
        alpha: (() => {
            try {
                const sessionMap: Record<string, AlphaSession> = { PRE: 'PRE', REG: 'REG', POST: 'POST', CLOSED: 'CLOSED' };
                const alphaSession: AlphaSession = sessionMap[session] || 'CLOSED';
                // [V3.2] SESSION DATA RULE:
                // REG → 실시간 데이터 사용
                // NOT REG (PRE/POST/CLOSED) → 직전 정규장 데이터 사용
                // "장이 안 열렸을 때의 최신 데이터 = 직전 정규장 데이터"
                const isREG = alphaSession === 'REG';

                // changePct: REG → 실시간, NOT REG → 직전 정규장 변동률
                let changePctForAlpha = changePctPct ?? 0;
                if (!isREG && historicalResults.length >= 2) {
                    const lastClose = historicalResults[0].c;
                    const prevLastClose = historicalResults[1].c;
                    if (lastClose && prevLastClose) {
                        changePctForAlpha = ((lastClose - prevLastClose) / prevLastClose) * 100;
                    }
                }

                // relVol: REG → 실시간, NOT REG → 직전장 거래량 / 전전장 거래량
                let relVol: number | null = null;
                if (isREG) {
                    const dayVol = S.day?.v || 0;
                    const prevVol = S.prevDay?.v || 1;
                    relVol = dayVol > 0 ? dayVol / prevVol : null;
                } else if (historicalResults.length >= 2) {
                    const lastVol = historicalResults[0].v || 0;
                    const prevLastVol = historicalResults[1].v || 1;
                    relVol = lastVol > 0 ? lastVol / prevLastVol : null;
                }

                const structGex = (structureResult as any)?.netGex ?? null;
                const flowGex = (flowData as any)?.netGex ?? null;
                const effectiveGex = structGex ?? flowGex;
                const whaleIndex = calculateWhaleIndex(effectiveGex);

                // return3D: REG → activePrice vs 4일전, NOT REG → 직전장 종가 vs 4일전
                let return3D: number | null = null;
                if (isREG && activePrice && historicalResults.length >= 4 && historicalResults[3]?.c) {
                    return3D = ((activePrice - historicalResults[3].c) / historicalResults[3].c) * 100;
                } else if (!isREG && historicalResults.length >= 4 && historicalResults[0]?.c && historicalResults[3]?.c) {
                    return3D = ((historicalResults[0].c - historicalResults[3].c) / historicalResults[3].c) * 100;
                }

                // [V3 PIPELINE] Compute RSI14 from historical closes (sorted desc, need to reverse)
                const closesForRSI = historicalResults.slice().reverse().map((h: any) => h.c).filter(Boolean);
                const rsi14 = computeRSI14(closesForRSI);

                // [V3 PIPELINE] Compute Implied Move % from rawChain ATM straddle
                const alphaRawChain = (flowData as any)?.rawChain ?? [];
                const impliedMovePct = computeImpliedMovePct(alphaRawChain, activePrice || 0);

                // [V3 PIPELINE] Compute IV Skew (Put IV / Call IV at ATM)
                const ivSkew = computeIVSkew(alphaRawChain, activePrice || 0);

                const result = calculateAlphaScore({
                    ticker,
                    session: alphaSession,
                    price: activePrice || 0,
                    prevClose: prevRegularClose || 0,
                    changePct: changePctForAlpha,
                    vwap: S.day?.vw ?? null,
                    return3D,
                    rsi14,
                    sma20: sma20Value,  // [V3 PIPELINE] SMA20 from Polygon
                    // Structure data (from structureResult + flowData)
                    pcr: (structureResult as any)?.pcr ?? (flowData as any)?.pcr ?? null,
                    gex: effectiveGex,
                    callWall: (structureResult as any)?.levels?.callWall ?? (flowData as any)?.callWall ?? null,
                    putFloor: (structureResult as any)?.levels?.putFloor ?? (flowData as any)?.putFloor ?? null,
                    gammaFlipLevel: (structureResult as any)?.gammaFlipLevel ?? null,
                    rawChain: alphaRawChain,
                    squeezeScore: squeezeScore ?? null,
                    atmIv: (structureResult as any)?.atmIv ?? null,
                    ivSkew,  // [V3 PIPELINE] IV Skew
                    // Flow data (from metrics + calculated)
                    darkPoolPct: metricsData?.darkPool?.percent ?? null,
                    shortVolPct: metricsData?.shortVolume?.percent ?? null,
                    whaleIndex,
                    relVol,
                    blockTrades: metricsData?.blockTrade?.count ?? null,  // [V3 PIPELINE] Block Trades
                    netFlow: (flowData as any)?.netPremium ?? null,
                    // Regime data (from macro snapshot)
                    ndxChangePct: macroData?.nqChangePercent ?? null,
                    vixValue: macroData?.vix ?? null,
                    tltChangePct: macroData?.tltChangePct ?? null,  // [V3 PIPELINE] TLT Safe Haven
                    // Catalyst data
                    impliedMovePct,
                    optionsDataAvailable: !!(alphaRawChain.length),
                    // [V3.4] Pre-Market Validation
                    preMarketPrice: prePrice ?? null,
                    preMarketChangePct: changePctFrac_PRE !== null ? changePctFrac_PRE * 100 : null,
                });

                return {
                    score: result.score,
                    grade: result.grade,
                    action: result.action,
                    actionKR: result.actionKR,
                    whyKR: result.whyKR,
                    whyFactors: result.whyFactors,
                    triggerCodes: result.triggerCodes,
                    pillars: {
                        momentum: { score: result.pillars.momentum.score, max: result.pillars.momentum.max },
                        structure: { score: result.pillars.structure.score, max: result.pillars.structure.max },
                        flow: { score: result.pillars.flow.score, max: result.pillars.flow.max },
                        regime: { score: result.pillars.regime.score, max: result.pillars.regime.max },
                        catalyst: { score: result.pillars.catalyst.score, max: result.pillars.catalyst.max },
                    },
                    gatesApplied: result.gatesApplied,
                    sessionAdjusted: result.sessionAdjusted,
                    dataCompleteness: result.dataCompleteness,
                    engineVersion: result.engineVersion,
                    calculatedAt: result.calculatedAt,
                };
            } catch {
                return null;
            }
        })(),
        meta: getBuildMeta(req.headers),
        debug: {
            apiStatus: snapshotRes.success ? 200 : 500,
            latencyMs: snapshotRes.latency,
            histCount: historicalResults.length,
            hasMarketClosed,
            note: "S52.3: baseline tracing + tz diagnostics"
        }
    };

    // [PERF] Cache the slimmed response in Redis (60s TTL)
    // Non-blocking: don't wait for cache write to respond
    setInCache(tickerCacheKey(ticker), response, TICKER_CACHE_TTL).catch(e => {
        console.warn(`[live/ticker] Redis cache write failed for ${ticker}:`, e);
    });

    // [FIX] Persist pre/post prices separately — survives session transitions
    // Only write when we have valid values (avoid overwriting with null)
    const extPrices: Record<string, any> = {};
    if (prePrice && prePrice > 0) {
        extPrices.prePrice = prePrice;
        extPrices.preChangePct = changePctFrac_PRE !== null ? changePctFrac_PRE * 100 : 0;
    }
    if (postPrice && postPrice > 0) {
        extPrices.postPrice = postPrice;
        extPrices.postChangePct = changePctFrac_POST !== null ? changePctFrac_POST * 100 : 0;
    }
    if (Object.keys(extPrices).length > 0) {
        setInCache(`flow:extended:${ticker}`, extPrices, 86400).catch(() => { }); // 24h TTL
    }

    return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, max-age=0, must-revalidate',
            'X-Cache': 'MISS'
        }
    });
}
