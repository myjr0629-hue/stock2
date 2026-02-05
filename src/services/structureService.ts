import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";
import { getETNow, getETDayOfWeek, toYYYYMMDD_ET } from "@/services/marketDaySSOT";
import { findWeeklyExpiration } from "@/services/holidayCache";

// [S-69] Get next valid trading day for options expiration (skips weekends)
export function getNextTradingDayET(): string {
    const nowET = getETNow();
    const dow = getETDayOfWeek(nowET);

    // If Saturday, next trading day is Monday (+2)
    // If Sunday, next trading day is Monday (+1)
    // Otherwise, today or next weekday
    const result = new Date(nowET);

    if (dow === 6) {
        // Saturday -> Monday
        result.setDate(result.getDate() + 2);
    } else if (dow === 0) {
        // Sunday -> Monday
        result.setDate(result.getDate() + 1);
    }
    // Weekdays: use today (options can expire today or later)

    return toYYYYMMDD_ET(result);
}

async function fetchMassiveWithRetry(url: string, maxAttempts = 3): Promise<any> {
    const start = Date.now();
    let lastError: string = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const data = await fetchMassive(url, {}, false, undefined, CACHE_POLICY.LIVE);
            return { data, latency: Date.now() - start, success: true, attempts: attempt };
        } catch (e: any) {
            lastError = e.message;
            console.log(`[RETRY] Attempt ${attempt}/${maxAttempts} failed for ${url.slice(0, 60)}...: ${e.message}`);
            if (attempt < maxAttempts) {
                // Exponential backoff: 200ms, 400ms, 800ms...
                await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, attempt - 1)));
            }
        }
    }
    return { success: false, error: lastError, attempts: maxAttempts };
}

// [DATA CONSISTENCY] Cache for 60 seconds to ensure stable values
interface CachedResult {
    data: any;
    timestamp: number;
}
const structureCache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function getStructureData(ticker: string, requestedExp?: string | null) {
    const cacheKey = `${ticker}:${requestedExp || 'auto'}`;

    // [DATA CONSISTENCY] Check cache first
    const cached = structureCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        console.log(`[CACHE HIT] ${ticker}: returning cached data (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
        return { ...cached.data, cached: true };
    }

    const spotUrl = `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`;
    const spotRes = await fetchMassiveWithRetry(spotUrl, 2);

    let underlyingPrice = 0;
    let prevClose = 0;
    let changePercent = 0;
    // [S-78] Extended session data for Command-style display
    let extended: { postPrice?: number; postChangePct?: number; prePrice?: number; preChangePct?: number } | null = null;
    let session: 'PRE' | 'REG' | 'POST' | 'CLOSED' = 'CLOSED';

    // [DEBUG] Log spot fetch result
    console.log(`[STRUCTURE DEBUG] ${ticker}: spotRes.success=${spotRes.success}, hasData=${!!spotRes.data}, hasTicker=${!!spotRes.data?.ticker}`);

    if (spotRes.success && spotRes.data?.ticker) {
        const T = spotRes.data.ticker;
        underlyingPrice = T.lastTrade?.p || T.min?.c || T.day?.c || T.prevDay?.c || 0;
        prevClose = T.prevDay?.c || 0;

        // [DEBUG] Log price extraction
        console.log(`[STRUCTURE DEBUG] ${ticker}: underlyingPrice=${underlyingPrice}, lastTrade.p=${T.lastTrade?.p}, min.c=${T.min?.c}, day.c=${T.day?.c}, prevDay.c=${T.prevDay?.c}`);

        // Calculate change percent
        if (prevClose > 0 && underlyingPrice > 0) {
            changePercent = Math.round(((underlyingPrice - prevClose) / prevClose) * 10000) / 100;
        }

        // [S-78] Session detection and extended price extraction
        const etNow = getETNow();
        const etHour = etNow.getHours();
        const etMinute = etNow.getMinutes();
        const etTime = etHour * 60 + etMinute;
        const dayOfWeek = getETDayOfWeek();

        // Weekend = CLOSED
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            session = 'CLOSED';
        } else if (etTime >= 240 && etTime < 570) {
            session = 'PRE';
        } else if (etTime >= 570 && etTime < 960) {
            session = 'REG';
        } else if (etTime >= 960 && etTime < 1200) {
            session = 'POST';
        } else {
            session = 'CLOSED';
        }

        // Extract extended hours prices from Polygon snapshot
        // Post-market: After regular close, show post price
        // Pre-market: Before regular open, show pre price
        const dayClose = T.day?.c || 0; // Regular session close
        const lastTradePrice = T.lastTrade?.p || 0;

        // If we have a trade after regular hours, that's extended
        if (session === 'POST' || session === 'CLOSED') {
            // Post-market: lastTrade might be post-close price
            if (lastTradePrice > 0 && dayClose > 0 && lastTradePrice !== dayClose) {
                const postChangePct = (lastTradePrice - dayClose) / dayClose;
                extended = {
                    postPrice: lastTradePrice,
                    postChangePct: postChangePct
                };
            }
        } else if (session === 'PRE') {
            // Pre-market: lastTrade is pre-open price
            if (lastTradePrice > 0 && prevClose > 0) {
                const preChangePct = (lastTradePrice - prevClose) / prevClose;
                extended = {
                    prePrice: lastTradePrice,
                    preChangePct: preChangePct
                };
            }
        }
    } else {
        console.error(`[STRUCTURE DEBUG] ${ticker}: SPOT FETCH FAILED! Error: ${spotRes.error || 'unknown'}`);
    }

    // 2. [S-71] Two-Phase Fetch: First get expirations, then fetch exact weekly expiration
    const todayStr = getNextTradingDayET();

    let availableExpirations: string[] = [];
    let targetExpiry: string = '';

    const refUrl = `/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date.gte=${todayStr}&order=asc&limit=1000`;

    try {
        const refRes = await fetchMassiveWithRetry(refUrl, 2);
        if (refRes.success && refRes.data?.results) {
            const exps = Array.from(new Set(
                refRes.data.results.map((c: any) => c.expiration_date)
            )).filter(Boolean).sort() as string[];

            console.log(`[OPTIONS] ${ticker} reference expirations:`, exps.slice(0, 8).join(', '));

            if (exps.length > 0) {
                availableExpirations = exps.slice(0, 10);

                if (requestedExp && exps.includes(requestedExp)) {
                    targetExpiry = requestedExp;
                } else {
                    targetExpiry = await findWeeklyExpiration(exps);
                }
                console.log(`[OPTIONS] ${ticker} target expiry: ${targetExpiry}`);
            }
        }
    } catch (e) {
        console.error(`[OPTIONS] Reference API failed for ${ticker}:`, e);
    }

    // Fallback to snapshot API if reference failed
    if (!targetExpiry) {
        const probeUrl = `/v3/snapshot/options/${ticker}?expiration_date.gte=${todayStr}&limit=250&sort=expiration_date&order=asc`;
        try {
            const probeRes = await fetchMassiveWithRetry(probeUrl, 2);
            if (probeRes.success && probeRes.data?.results) {
                const exps = Array.from(new Set(
                    probeRes.data.results.map((c: any) => c.details?.expiration_date || c.expiration_date)
                )).filter(Boolean).sort() as string[];
                availableExpirations = exps.slice(0, 10);

                if (requestedExp && exps.includes(requestedExp)) {
                    targetExpiry = requestedExp;
                } else {
                    targetExpiry = await findWeeklyExpiration(exps);
                }
            }
        } catch (e) {
            console.error(`[OPTIONS] Snapshot probe failed for ${ticker}:`, e);
        }
    }

    // Ultimate fallback
    if (!targetExpiry) {
        targetExpiry = requestedExp || todayStr;
    }

    // Phase 2: Fetch EXACT expiration
    const exactUrl = `/v3/snapshot/options/${ticker}?expiration_date=${targetExpiry}&limit=250`;

    let allContracts: any[] = [];
    let pagesFetched = 0;
    let latencyTotal = 0;
    let attemptsTotal = 0;
    let chainUrl = exactUrl;

    try {
        // [DATA INTEGRITY] Fetch up to 10 pages
        while (chainUrl && pagesFetched < 10) {
            const res = await fetchMassiveWithRetry(chainUrl, 3);
            attemptsTotal += res.attempts || 1;
            latencyTotal += res.latency || 0;

            if (!res.success || !res.data?.results) break;

            allContracts = allContracts.concat(res.data.results);
            pagesFetched++;

            chainUrl = res.data.next_url || '';
        }
    } catch (e) {
        console.log(`[OPTIONS] Fetch error for ${ticker}:`, e);
    }

    if (allContracts.length === 0) {
        return {
            ticker, expiration: targetExpiry, underlyingPrice, options_status: "PENDING",
            structure: { strikes: [], callsOI: [], putsOI: [] },
            maxPain: null, netGex: null, sourceGrade: "C",
            availableExpirations,
            debug: { apiStatus: 404, pagesFetched, contractsFetched: 0 }
        };
    }

    const relevantContracts = allContracts;

    // 5. Structure & Integrity
    let nullOiCount = 0;
    const strikesSet = new Set<number>();
    const callsMap = new Map<number, number | null>();
    const putsMap = new Map<number, number | null>();
    const cleanContracts: any[] = [];
    let totalCallOI = 0;
    let totalPutOI = 0;

    relevantContracts.forEach((c: any) => {
        const k = c.details?.strike_price || c.strike_price || 0;
        const type = (c.details?.contract_type || c.contract_type || "call").toLowerCase();
        const oi = c.open_interest;

        strikesSet.add(k);

        if (oi === undefined || oi === null) {
            nullOiCount++;
        } else {
            cleanContracts.push({ ...c, k, type, oi });
            if (type === 'call') totalCallOI += oi;
            else totalPutOI += oi;
        }

        const val = (typeof oi === 'number') ? oi : null;
        if (type === 'call') callsMap.set(k, (callsMap.get(k) || 0) + (val || 0));
        else putsMap.set(k, (putsMap.get(k) || 0) + (val || 0));
    });

    const pcr = totalCallOI > 0 ? Math.round((totalPutOI / totalCallOI) * 100) / 100 : null;
    const totalStatsContracts = relevantContracts.length;
    let options_status: "OK" | "PENDING" | "FAILED" = (totalStatsContracts > 0 && (nullOiCount / totalStatsContracts) < 0.20) ? "OK" : "PENDING";

    if (totalStatsContracts === 0) options_status = "PENDING";

    const sortedStrikes = Array.from(strikesSet).sort((a, b) => a - b);
    const callsOI = sortedStrikes.map(k => callsMap.get(k) ?? null);
    const putsOI = sortedStrikes.map(k => putsMap.get(k) ?? null);

    // 6. Metrics
    let maxPain: number | null = null;
    let netGex: number | null = null;
    let gammaCoverage = 0;
    let contractsUsedForGex = 0;
    let gexNotes = "";

    let gammaFlipLevel: number | null = null;
    let gammaFlipType: 'EXACT' | 'MULTI_EXP' | 'NEAR_ZERO' | 'ALL_LONG' | 'ALL_SHORT' | 'NO_DATA' = 'NO_DATA';
    let gammaFlipCrossings: number[] = [];

    const ATM_RANGE = 0.15;
    const atmMin = underlyingPrice * (1 - ATM_RANGE);
    const atmMax = underlyingPrice * (1 + ATM_RANGE);

    if (cleanContracts.length > 0 && underlyingPrice > 0) {
        const gexByStrike = new Map<number, number>();
        let gammaDataCount = 0;

        cleanContracts.forEach(c => {
            const g = c.greeks?.gamma;
            if (typeof g === 'number' && isFinite(g) && g !== 0) {
                const dir = c.type === 'call' ? -1 : 1;
                const gex = g * c.oi * 100 * dir;
                gexByStrike.set(c.k, (gexByStrike.get(c.k) || 0) + gex);
                gammaDataCount++;
            }
        });

        if (gammaDataCount > 0) {
            const strikesWithGex = Array.from(gexByStrike.entries()).sort((a, b) => a[0] - b[0]);
            let cumulativeGex = 0;
            const allCrossings: number[] = [];
            const atmNearZero: { strike: number; absGex: number }[] = [];
            let finalCumulativeGex = 0;

            for (let i = 0; i < strikesWithGex.length; i++) {
                const [strike, gexAtStrike] = strikesWithGex[i];
                const prevGex = cumulativeGex;
                cumulativeGex += gexAtStrike;
                finalCumulativeGex = cumulativeGex;

                if (i > 0) {
                    if ((prevGex < 0 && cumulativeGex >= 0) || (prevGex > 0 && cumulativeGex <= 0)) {
                        allCrossings.push(strike);
                    }
                }
                if (strike >= atmMin && strike <= atmMax) {
                    atmNearZero.push({ strike, absGex: Math.abs(cumulativeGex) });
                }
            }

            gammaFlipCrossings = [...allCrossings];

            const atmCrossings = allCrossings.filter(s => s >= atmMin && s <= atmMax);
            if (atmCrossings.length > 0) {
                gammaFlipLevel = atmCrossings.reduce((closest, strike) =>
                    Math.abs(strike - underlyingPrice) < Math.abs(closest - underlyingPrice) ? strike : closest
                );
                gammaFlipType = 'EXACT';
                console.log(`[S-120] ${ticker}: EXACT - GammaFlip = $${gammaFlipLevel} from weekly expiry`);
            } else {
                if (atmNearZero.length > 0) {
                    atmNearZero.sort((a, b) => a.absGex - b.absGex);
                    gammaFlipLevel = atmNearZero[0].strike;
                    gammaFlipType = 'NEAR_ZERO';
                    console.log(`[S-120] ${ticker}: NEAR_ZERO - GammaFlip = ~$${gammaFlipLevel}`);
                } else {
                    gammaFlipLevel = null;
                    gammaFlipType = finalCumulativeGex > 0 ? 'ALL_LONG' : 'ALL_SHORT';
                    console.log(`[S-120] ${ticker}: ${gammaFlipType} - No flip in weekly expiry`);
                }
            }
        }
    }

    if (options_status === "OK" && cleanContracts.length > 0 && underlyingPrice > 0) {
        let minLoss = Infinity;
        let painStrike = 0;
        const distinctStrikes = Array.from(new Set(cleanContracts.map(c => c.k))).sort((a, b) => a - b);

        distinctStrikes.forEach(testStrike => {
            let loss = 0;
            cleanContracts.forEach(c => {
                if (c.type === 'call' && testStrike > c.k) loss += (testStrike - c.k) * c.oi;
                else if (c.type === 'put' && testStrike < c.k) loss += (c.k - testStrike) * c.oi;
            });
            if (loss < minLoss) {
                minLoss = loss;
                painStrike = testStrike;
            }
        });
        maxPain = painStrike;

        let gexSum = 0;
        let gammaCount = 0;
        contractsUsedForGex = cleanContracts.length;
        let maxCallOi = -1;
        let callWall = 0;
        let maxPutOi = -1;
        let putFloor = 0;

        cleanContracts.forEach(c => {
            const g = c.greeks?.gamma;
            if (typeof g === 'number' && isFinite(g)) {
                const dir = c.type === 'call' ? -1 : 1;
                gexSum += (g * c.oi * 100 * dir * underlyingPrice);
                gammaCount++;
            }
            const maxResist = underlyingPrice * 1.20;
            const minSupport = underlyingPrice * 0.80;
            if (c.type === 'call' && c.k > underlyingPrice && c.k <= maxResist && c.oi > maxCallOi) {
                maxCallOi = c.oi;
                callWall = c.k;
            }
            if (c.type === 'put' && c.k < underlyingPrice && c.k >= minSupport && c.oi > maxPutOi) {
                maxPutOi = c.oi;
                putFloor = c.k;
            }
        });

        gammaCoverage = contractsUsedForGex > 0 ? gammaCount / contractsUsedForGex : 0;
        if (gammaCoverage >= 0.80) {
            netGex = gexSum;
            gexNotes = `Calculation successful (coverage: ${(gammaCoverage * 100).toFixed(0)}%)`;
        } else {
            netGex = null;
            gexNotes = `Insufficient data (coverage: ${(gammaCoverage * 100).toFixed(0)}% < 80%)`;
        }

        const isGammaSqueeze = netGex !== null && netGex > 50000000 &&
            callWall > 0 && underlyingPrice >= callWall * 0.98 &&
            pcr !== null && pcr < 0.6;

        let atmIv: number | null = null;
        if (underlyingPrice > 0 && cleanContracts.length > 0) {
            const atmStrike = sortedStrikes.reduce((closest, strike) =>
                Math.abs(strike - underlyingPrice) < Math.abs(closest - underlyingPrice) ? strike : closest
            );
            const atmContract = cleanContracts.find(c => c.k === atmStrike && c.type === 'call')
                || cleanContracts.find(c => c.k === atmStrike && c.type === 'put');
            const rawIv = atmContract?.greeks?.implied_volatility || atmContract?.implied_volatility || atmContract?.iv;
            if (typeof rawIv === 'number' && rawIv > 0) {
                atmIv = rawIv > 1 ? Math.round(rawIv) : Math.round(rawIv * 100);
            }
        }

        const successResponse = {
            ticker,
            expiration: targetExpiry,
            availableExpirations,
            underlyingPrice: underlyingPrice || null,
            prevClose: prevClose || null,
            changePercent,
            extended,
            session,
            pcr,
            isGammaSqueeze,
            options_status,
            structure: { strikes: sortedStrikes, callsOI, putsOI },
            maxPain,
            netGex,
            gammaFlipLevel,
            gammaFlipType,
            atmIv,
            levels: {
                callWall: callWall || null,
                putFloor: putFloor || null,
                pinZone: maxPain
            },
            sourceGrade: totalStatsContracts > 0 ? "A" : "B",
            debug: {
                apiStatus: 200,
                pagesFetched,
                contractsFetched: allContracts.length,
                attempts: attemptsTotal,
                latencyMs: latencyTotal,
                gammaCoverage,
                contractsUsedForGex,
                rawGexSum: gexSum,
                multiplierUsed: 100,
                netGexUnit: "shares",
                gexFormula: "sum(call gamma*oi*mult) - sum(put gamma*oi*mult)",
                notes: gexNotes,
                gammaFlipCrossings
            }
        };

        structureCache.set(cacheKey, { data: successResponse, timestamp: Date.now() });
        return successResponse;
    } else {
        gexNotes = totalStatsContracts === 0
            ? `netGex null: target expiration ${targetExpiry} not found or no contracts`
            : (options_status === "PENDING" ? "netGex null: options_status is PENDING" : "netGex null: insufficient data");

        const failResponse = {
            ticker,
            expiration: targetExpiry,
            availableExpirations,
            underlyingPrice: underlyingPrice || null,
            prevClose: prevClose || null,
            changePercent,
            extended,
            session,
            pcr,
            isGammaSqueeze: false,
            options_status,
            structure: { strikes: sortedStrikes, callsOI, putsOI },
            maxPain: null,
            netGex: null,
            gammaFlipLevel,
            gammaFlipType,
            levels: { callWall: null, putFloor: null, pinZone: null },
            sourceGrade: "B",
            debug: {
                apiStatus: 200,
                pagesFetched,
                contractsFetched: allContracts.length,
                notes: gexNotes
            }
        };
        return failResponse;
    }
}
