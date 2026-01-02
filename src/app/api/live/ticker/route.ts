// [S-52.2.3] Live Ticker API - Force Dynamic + Build Metadata
import { NextRequest } from 'next/server';
import { getBuildMeta } from '@/services/buildMeta';
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";
import { CentralDataHub } from "@/services/centralDataHub";

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

function getSessionType(etHour: number, etMin: number, isWeekend: boolean, etMonth: number, etDay: number): SessionType {
    // [Fix] Holiday Logic (New Year's Day)
    if (etMonth === 1 && etDay === 1) return "CLOSED";

    if (isWeekend) return "CLOSED";
    const etTime = etHour + etMin / 60;
    if (etTime >= 4.0 && etTime < 9.5) return "PRE";
    else if (etTime >= 9.5 && etTime < 16.0) return "REG";
    else if (etTime >= 16.0 && etTime < 20.0) return "POST";
    else return "CLOSED";
}

// [S-52.2.1] Helper: fraction to pct conversion
function fracToPct(frac: number | null): number | null {
    return frac !== null ? Math.round(frac * 10000) / 100 : null;  // 0.00144 -> 0.14
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

    // 14 days ago for historical range
    const twoWeeksAgoET = new Date(todayET);
    twoWeeksAgoET.setUTCDate(twoWeeksAgoET.getUTCDate() - 14);
    const twoWeeksAgoStr = `${twoWeeksAgoET.getUTCFullYear()}-${String(twoWeeksAgoET.getUTCMonth() + 1).padStart(2, '0')}-${String(twoWeeksAgoET.getUTCDate()).padStart(2, '0')}`;

    const session: SessionType = getSessionType(etHour, etMin, isWeekend, etMonth, etDay);

    const etStr = `${etMonth}/${etDay}/${etYear}, ${etHour}:${String(etMin).padStart(2, '0')}`;

    // Fetch Core Data
    const snapshotUrl = `${MASSIVE_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${MASSIVE_API_KEY}`;
    // [S-52.2.3] Use proper date strings for agg API (not timestamps)
    const aggUrl = `${MASSIVE_BASE_URL}/v2/aggs/ticker/${ticker}/range/1/day/${twoWeeksAgoStr}/${yesterdayStr}?adjusted=true&sort=desc&limit=5&apiKey=${MASSIVE_API_KEY}`;

    const [snapshotRes, aggRes] = await Promise.all([
        fetchMassiveWithRetry(snapshotUrl),
        fetchMassiveWithRetry(aggUrl)
    ]);

    let ocRes = await fetchMassiveWithRetry(`${MASSIVE_BASE_URL}/v1/open-close/${ticker}/${todayStr}?apiKey=${MASSIVE_API_KEY}`);
    if (!ocRes.success || !ocRes.data?.preMarket) {
        ocRes = await fetchMassiveWithRetry(`${MASSIVE_BASE_URL}/v1/open-close/${ticker}/${yesterdayStr}?apiKey=${MASSIVE_API_KEY}`);
    }


    const S = snapshotRes.data?.ticker || {};
    const OC = ocRes.data || {};
    const historicalResults = aggRes.data?.results || [];

    // [S-52.3] BASELINE SOURCE TRACKING - Identify where prevClose comes from
    let prevRegularClose: number | null = null;
    let prevPrevRegularClose: number | null = null; // [New] Day BEFORE prevRegularClose
    let baselineSource: string = "UNKNOWN";

    if (historicalResults[0]?.c) {
        prevRegularClose = historicalResults[0].c;
        baselineSource = "prevAgg.c";
    } else if (S.prevDay?.c) {
        prevRegularClose = S.prevDay.c;
        baselineSource = "snapshot.prevDay.c";
    }

    // [New] Get the close from 2 days ago (for intraday change calculation)
    if (historicalResults[1]?.c) {
        prevPrevRegularClose = historicalResults[1].c;
    }

    const hasMarketClosed = session === "POST" || session === "CLOSED";
    const regularCloseToday = hasMarketClosed ? (S.day?.c || OC.close || null) : null;

    const liveLast = S.lastTrade?.p || S.min?.c || null;

    // [Fix] Pre-Market: Prioritize REAL-TIME liveLast during PRE session
    // Fallback to OC.preMarket (static daily snapshot) only if liveLast unavailable
    const prePrice = (session === "PRE" ? liveLast : null)
        || OC.preMarket
        || S.preMarket?.p;

    // [Fix] Post-Market: Prioritize REAL-TIME liveLast during POST session
    const postPrice = (session === "POST" ? liveLast : null)
        || OC.afterHoursClose
        || S.afterHours?.p
        || OC.afterHours;

    // [Fix] Fetch Options Flow Data using CentralDataHub
    const flowPriceDetect = liveLast || S.day?.c || S.prevDay?.c || 0;
    const flowRes = await CentralDataHub._fetchOptionsChain(ticker, flowPriceDetect).catch(err => ({
        dataSource: "NONE",
        rawChain: [],
        error: err.message
    }));
    const flowData = flowRes; // Defines flowData for use in response

    const warnings: string[] = [];

    // [S-52.2.1] Calculate changePct as FRACTION
    const changePctFrac_PRE = (prePrice !== null && prevRegularClose !== null && prevRegularClose !== 0)
        ? (prePrice - prevRegularClose) / prevRegularClose : null;

    const changePctFrac_REG = (liveLast !== null && prevRegularClose !== null && prevRegularClose !== 0)
        ? (liveLast - prevRegularClose) / prevRegularClose : null;

    const postBaseline = regularCloseToday || prevRegularClose;
    const changePctFrac_POST = (postPrice !== null && postBaseline !== null && postBaseline !== 0)
        ? (postPrice - postBaseline) / postBaseline : null;

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

    // [S-52.2.1] Full response with explicit Frac/Pct/Abs
    const response = {
        ticker,
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
        flow: flowData,

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
            aggDateRange: `${twoWeeksAgoStr} to ${yesterdayStr}`
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
        meta: getBuildMeta(req.headers),
        debug: {
            apiStatus: snapshotRes.success ? 200 : 500,
            latencyMs: snapshotRes.latency,
            histCount: historicalResults.length,
            hasMarketClosed,
            note: "S52.3: baseline tracing + tz diagnostics"
        }
    };

    return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, max-age=0, must-revalidate'
        }
    });
}
