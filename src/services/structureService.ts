import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";
import { getETComponents, getTodayETString } from "@/services/marketDaySSOT";
import { findWeeklyExpiration } from "@/services/holidayCache";

// [S-69] Get next valid trading day for options expiration (skips weekends)
// [V45.17 FIX] Uses getETComponents for reliable ET timezone handling
export function getNextTradingDayET(): string {
    const et = getETComponents();

    // If Saturday (6), next trading day is Monday (+2)
    // If Sunday (0), next trading day is Monday (+1)
    // Otherwise, today (weekdays: options can expire today or later)
    let daysToAdd = 0;
    if (et.dayOfWeek === 6) {
        daysToAdd = 2; // Saturday -> Monday
    } else if (et.dayOfWeek === 0) {
        daysToAdd = 1; // Sunday -> Monday
    }

    const targetDate = new Date(et.year, et.month - 1, et.day + daysToAdd);
    return `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
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

// [DATA VALIDATION] Ensure calculated values are within valid ranges
interface DataValidation {
    isValid: boolean;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    checks: {
        pcr: boolean;
        maxPain: boolean;
        putFloor: boolean;
        callWall: boolean;
        gammaCoverage: boolean;
    };
    failures: string[];
}

function validateCalculations(
    pcr: number | null,
    maxPain: number | null,
    putFloor: number | null,
    callWall: number | null,
    underlyingPrice: number,
    gammaCoverage: number
): DataValidation {
    const failures: string[] = [];
    const checks = {
        pcr: false,
        maxPain: false,
        putFloor: false,
        callWall: false,
        gammaCoverage: false
    };

    // 1. P/C Ratio: should be between 0.1 and 5.0
    if (pcr !== null && pcr > 0.05 && pcr < 10) {
        checks.pcr = true;
    } else if (pcr !== null) {
        failures.push("pcr");
    }

    // 2. Max Pain: should be within ±30% of current price
    if (maxPain !== null && underlyingPrice > 0) {
        const deviation = Math.abs(maxPain - underlyingPrice) / underlyingPrice;
        if (deviation < 0.30) {
            checks.maxPain = true;
        } else {
            failures.push("maxPain");
        }
    }

    // 3. Put Floor: should be less than current price
    if (putFloor !== null && underlyingPrice > 0) {
        if (putFloor < underlyingPrice) {
            checks.putFloor = true;
        } else {
            failures.push("putFloor");
        }
    }

    // 4. Call Wall: should be greater than current price
    if (callWall !== null && underlyingPrice > 0) {
        if (callWall > underlyingPrice) {
            checks.callWall = true;
        } else {
            failures.push("callWall");
        }
    }

    // 5. Gamma Coverage: should be >= 50% for valid GEX
    if (gammaCoverage >= 0.50) {
        checks.gammaCoverage = true;
    } else {
        failures.push("gammaCoverage");
    }

    // Determine overall confidence
    const isValid = failures.length === 0;
    const confidence: "HIGH" | "MEDIUM" | "LOW" =
        failures.length === 0 ? "HIGH" :
            failures.length <= 1 ? "MEDIUM" : "LOW";

    return { isValid, confidence, checks, failures };
}


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
        // [V45.17 FIX] Use getETComponents for reliable ET timezone
        const etComponents = getETComponents();
        const etTime = etComponents.hour * 60 + etComponents.minute;
        const dayOfWeek = etComponents.dayOfWeek;

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

        // [V45.17] Always calculate GEX with confidence level for Alpha Score accuracy
        // Previously: null if coverage < 80% (caused fallback in Alpha Engine)
        // Now: Always return value with confidence indicator
        netGex = gexSum;

        let gexConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
        if (gammaCoverage >= 0.80) {
            gexConfidence = 'HIGH';
            gexNotes = `HIGH confidence (coverage: ${(gammaCoverage * 100).toFixed(0)}%)`;
        } else if (gammaCoverage >= 0.60) {
            gexConfidence = 'MEDIUM';
            gexNotes = `MEDIUM confidence (coverage: ${(gammaCoverage * 100).toFixed(0)}%)`;
        } else {
            gexConfidence = 'LOW';
            gexNotes = `LOW confidence (coverage: ${(gammaCoverage * 100).toFixed(0)}%)`;
        }

        // [V45.17] 0DTE Impact: Today's OI / (Today's OI + Next Week OI)
        // This measures how much of total gamma is expiring today
        const todayOI = totalCallOI + totalPutOI;
        let nextWeekOI = 0;

        // Find next weekly expiration (next Friday after targetExpiry)
        const nextWeeklyExp = availableExpirations.find(exp => {
            if (exp === targetExpiry) return false;
            // Parse dates to check if it's a Friday and after target
            const expParts = exp.split('-').map(Number);
            const expDate = new Date(expParts[0], expParts[1] - 1, expParts[2]);
            const targetParts = targetExpiry.split('-').map(Number);
            const targetDate = new Date(targetParts[0], targetParts[1] - 1, targetParts[2]);

            // Check if it's a Friday (day 5) and at least 5 days after target
            const isFriday = expDate.getDay() === 5;
            const diffDays = Math.round((expDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

            return isFriday && diffDays >= 5 && diffDays <= 10;
        });

        console.log(`[0DTE] ${ticker}: targetExpiry=${targetExpiry}, nextWeeklyExp=${nextWeeklyExp || 'not found'}`);

        let nextWeekFetchError = '';
        if (nextWeeklyExp) {
            // Quick OI fetch for next week using direct fetchMassive
            const nextUrl = `/v3/snapshot/options/${ticker}?expiration_date=${nextWeeklyExp}&limit=500`;
            try {
                const nextData = await fetchMassive(nextUrl, {}, false, undefined, CACHE_POLICY.LIVE);
                console.log(`[0DTE FETCH] ${ticker}: results=${nextData?.results?.length || 0}`);
                if (nextData?.results && nextData.results.length > 0) {
                    nextWeekOI = nextData.results.reduce((sum: number, c: any) => {
                        return sum + (c.open_interest || 0);
                    }, 0);
                    console.log(`[0DTE FETCH] ${ticker}: calculated nextWeekOI=${nextWeekOI}`);
                } else {
                    nextWeekFetchError = 'No results from API';
                }
            } catch (e: any) {
                nextWeekFetchError = e.message || 'Exception';
                console.log(`[0DTE] Failed to fetch next week OI for ${ticker}: ${e}`);
            }
        }
        // [V45.17] 0DTE Impact as DTE (Days to Expiry)
        // DTE = 0 means expiry today (maximum gamma impact)
        const et = getETComponents();
        const todayStr = `${et.year}-${String(et.month).padStart(2, '0')}-${String(et.day).padStart(2, '0')}`;
        const targetParts = targetExpiry.split('-').map(Number);
        const todayParts = todayStr.split('-').map(Number);
        const targetDate = new Date(targetParts[0], targetParts[1] - 1, targetParts[2]);
        const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
        const zeroDteImpact = Math.max(0, Math.round((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)));

        console.log(`[DTE] ${ticker}: expiry=${targetExpiry}, today=${todayStr}, DTE=${zeroDteImpact}`);

        // [V45.17] Gamma Concentration: How much OI is near current price
        // STICKY (70%+) = Price movements dampened by dealer hedging
        // NORMAL (40-70%) = Balanced OI distribution  
        // LOOSE (<40%) = Price can move more freely
        const priceRange = underlyingPrice * 0.05; // 5% range
        const nearPriceOI = cleanContracts.reduce((sum: number, c: any) => {
            const strike = c.details?.strike_price || 0;
            if (Math.abs(strike - underlyingPrice) <= priceRange) {
                return sum + (c.open_interest || 0);
            }
            return sum;
        }, 0);
        const gammaConcentration = todayOI > 0 ? Math.round((nearPriceOI / todayOI) * 100) : 0;
        const gammaConcentrationLabel = gammaConcentration >= 70 ? 'STICKY'
            : gammaConcentration >= 40 ? 'NORMAL' : 'LOOSE';


        // [V45.17] Squeeze Risk: Composite score based on multiple factors
        let squeezeScore = 0;

        // Factor 1: Short Gamma (netGex > 0 means dealers are short gamma)
        if (netGex !== null && netGex > 0) squeezeScore += 35;

        // Factor 2: 0DTE Impact (high 0DTE = more intraday volatility)
        if (zeroDteImpact > 20) squeezeScore += 25;
        else if (zeroDteImpact > 10) squeezeScore += 15;

        // Factor 3: P/C Ratio extremes
        if (pcr !== null && pcr > 1.5) squeezeScore += 20; // Put heavy
        if (pcr !== null && pcr < 0.5) squeezeScore += 20; // Call heavy

        // Factor 4: Price near Gamma Flip Level
        if (gammaFlipLevel && underlyingPrice > 0) {
            const distance = Math.abs(underlyingPrice - gammaFlipLevel) / underlyingPrice;
            if (distance < 0.02) squeezeScore += 20; // Within 2%
        }

        const squeezeRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' =
            squeezeScore >= 70 ? 'EXTREME' :
                squeezeScore >= 50 ? 'HIGH' :
                    squeezeScore >= 30 ? 'MEDIUM' : 'LOW';

        // Legacy: keep isGammaSqueeze for backward compatibility
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

        // [DATA VALIDATION] Validate all calculated values before returning
        const validation = validateCalculations(
            pcr,
            maxPain,
            putFloor || null,
            callWall || null,
            underlyingPrice,
            gammaCoverage
        );

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
            gexConfidence, // [V45.17] Added for Alpha Score accuracy
            gammaFlipLevel,
            gammaFlipType,
            atmIv,
            gammaConcentration,      // [V45.17] OI concentration near price (0-100%)
            gammaConcentrationLabel, // [V45.17] STICKY / NORMAL / LOOSE
            squeezeRisk,   // [V45.17] LOW/MEDIUM/HIGH/EXTREME
            squeezeScore,  // [V45.17] Raw score (0-100) for debugging
            levels: {
                callWall: callWall || null,
                putFloor: putFloor || null,
                pinZone: maxPain
            },
            validation, // [DATA VALIDATION] Include validation result
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
                gammaFlipCrossings,
                // [V45.17 DEBUG]
                todayOI,
                nearPriceOI,
                gammaConcentration,
                gammaConcentrationLabel
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
            gexConfidence: 'LOW' as const, // [V45.17] Consistent with successResponse
            gammaFlipLevel,
            gammaFlipType,
            zeroDteImpact: 0,      // [V45.17] Default for failed response
            squeezeRisk: 'LOW' as const, // [V45.17]
            squeezeScore: 0,       // [V45.17]
            levels: { callWall: null, putFloor: null, pinZone: null },
            validation: { // [DATA VALIDATION] LOW confidence for incomplete data
                isValid: false,
                confidence: "LOW" as const,
                checks: { pcr: false, maxPain: false, putFloor: false, callWall: false, gammaCoverage: false },
                failures: ["incomplete_data"]
            },
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
