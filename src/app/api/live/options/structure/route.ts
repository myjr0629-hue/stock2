import { NextRequest, NextResponse } from "next/server";
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";
import { getETNow, getETDayOfWeek, toYYYYMMDD_ET } from "@/services/marketDaySSOT";
import { findWeeklyExpiration } from "@/services/holidayCache";

export const revalidate = 0; // Force dynamic (User Request)

// [S-69] Get next valid trading day for options expiration (skips weekends)
function getNextTradingDayET(): string {
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

async function fetchMassiveWithRetry(url: string, attempts = 3): Promise<any> {
    const start = Date.now();
    try {
        const data = await fetchMassive(url, {}, false, undefined, CACHE_POLICY.LIVE);
        return { data, latency: Date.now() - start, success: true, attempts: 1 };
    } catch (e: any) {
        return { success: false, error: e.message, attempts: attempts };
    }
}

export async function GET(req: NextRequest) {
    const t = req.nextUrl.searchParams.get('t');
    const requestedExp = req.nextUrl.searchParams.get('exp');

    if (!t) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

    const ticker = t.toUpperCase();

    // 1. Get Underlying Price
    const spotUrl = `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`;
    const spotRes = await fetchMassiveWithRetry(spotUrl, 2);

    let underlyingPrice = 0;
    let prevClose = 0;
    let changePercent = 0;

    if (spotRes.success && spotRes.data?.ticker) {
        const T = spotRes.data.ticker;
        underlyingPrice = T.lastTrade?.p || T.min?.c || T.day?.c || T.prevDay?.c || 0;
        prevClose = T.prevDay?.c || 0;

        // Calculate change percent
        if (prevClose > 0 && underlyingPrice > 0) {
            changePercent = Math.round(((underlyingPrice - prevClose) / prevClose) * 10000) / 100;
        }
    }

    // 2. [S-71] Two-Phase Fetch: First get expirations, then fetch exact weekly expiration
    // Phase 1: Get available expirations using reference API (more reliable than snapshot)
    // [S-76] The snapshot API has limit issues - 250 contracts may all be from same expiration
    const todayStr = getNextTradingDayET();

    let availableExpirations: string[] = [];
    let targetExpiry: string = '';

    // Try reference API first (gives unique contracts per expiration)
    // [S-76] Increase limit to 1000 - TSLA has 100+ contracts for single expiration
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

    // Ultimate fallback if all probes failed
    if (!targetExpiry) {
        targetExpiry = requestedExp || todayStr;
    }

    // Phase 2: Fetch EXACT expiration (no filtering, full data for accurate Max Pain)
    const exactUrl = `/v3/snapshot/options/${ticker}?expiration_date=${targetExpiry}&limit=250`;

    let allContracts: any[] = [];
    let pagesFetched = 0;
    let latencyTotal = 0;
    let attemptsTotal = 0;
    let chainUrl = exactUrl;

    try {
        while (chainUrl && pagesFetched < 4) {
            const res = await fetchMassiveWithRetry(chainUrl, 3);
            attemptsTotal += res.attempts || 1;
            latencyTotal += res.latency || 0;

            if (!res.success || !res.data?.results) break;

            allContracts = allContracts.concat(res.data.results);
            pagesFetched++;

            // No 500 limit - fetch all contracts for the expiration
            chainUrl = res.data.next_url || '';
        }
    } catch (e) {
        console.log(`[OPTIONS] Fetch error for ${ticker}:`, e);
    }

    if (allContracts.length === 0) {
        return NextResponse.json({
            ticker, expiration: targetExpiry, underlyingPrice, options_status: "PENDING",
            structure: { strikes: [], callsOI: [], putsOI: [] },
            maxPain: null, netGex: null, sourceGrade: "C",
            availableExpirations,
            debug: { apiStatus: 404, pagesFetched, contractsFetched: 0 }
        });
    }

    // [S-71] Use ALL contracts for accurate Max Pain calculation (no ±25% filter)
    const contracts = allContracts;
    const relevantContracts = contracts; // No filter - use full data

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
            // Accumulate total OI for PCR calculation
            if (type === 'call') totalCallOI += oi;
            else totalPutOI += oi;
        }

        const val = (typeof oi === 'number') ? oi : null;
        if (type === 'call') callsMap.set(k, (callsMap.get(k) || 0) + (val || 0));
        else putsMap.set(k, (putsMap.get(k) || 0) + (val || 0));
    });

    // Calculate PCR (Put/Call Ratio)
    const pcr = totalCallOI > 0 ? Math.round((totalPutOI / totalCallOI) * 100) / 100 : null;

    const totalStatsContracts = relevantContracts.length;
    let options_status: "OK" | "PENDING" | "FAILED" = (totalStatsContracts > 0 && (nullOiCount / totalStatsContracts) < 0.20) ? "OK" : "PENDING";

    // If requested exp has ZERO contracts, it's PENDING/Unavailable
    if (totalStatsContracts === 0) options_status = "PENDING";

    const sortedStrikes = Array.from(strikesSet).sort((a, b) => a - b);
    const callsOI = sortedStrikes.map(k => callsMap.get(k) ?? null);
    const putsOI = sortedStrikes.map(k => putsMap.get(k) ?? null);

    // 6. Metrics (Only if OK)
    let maxPain: number | null = null;
    let netGex: number | null = null;
    let gammaCoverage = 0;
    let contractsUsedForGex = 0;
    let gexNotes = "";

    // [V7.1] [S-73] Gamma Flip Level - Find closest zero crossing to current price
    // OLD: Found first crossing from lowest strike (returned edge cases like $95)
    // NEW: Find ALL crossings, then pick the one closest to current price
    let gammaFlipLevel: number | null = null;

    if (cleanContracts.length > 0 && underlyingPrice > 0) {
        const gexByStrike = new Map<number, number>();
        let gammaDataCount = 0;

        cleanContracts.forEach(c => {
            const g = c.greeks?.gamma;
            if (typeof g === 'number' && isFinite(g) && g !== 0) {
                const dir = c.type === 'call' ? 1 : -1;
                const gex = g * c.oi * 100 * dir;
                gexByStrike.set(c.k, (gexByStrike.get(c.k) || 0) + gex);
                gammaDataCount++;
            }
        });

        if (gammaDataCount > 0) {
            const strikesWithGex = Array.from(gexByStrike.entries())
                .sort((a, b) => a[0] - b[0]);

            // Collect ALL zero crossings
            let cumulativeGex = 0;
            const crossings: number[] = [];

            for (let i = 0; i < strikesWithGex.length; i++) {
                const [strike, gexAtStrike] = strikesWithGex[i];
                const prevGex = cumulativeGex;
                cumulativeGex += gexAtStrike;

                if (i > 0) {
                    // Detect any zero crossing
                    if ((prevGex < 0 && cumulativeGex >= 0) || (prevGex > 0 && cumulativeGex <= 0)) {
                        crossings.push(strike);
                    }
                }
            }

            // [S-73] Pick the crossing CLOSEST to current price
            if (crossings.length > 0) {
                gammaFlipLevel = crossings.reduce((closest, strike) =>
                    Math.abs(strike - underlyingPrice) < Math.abs(closest - underlyingPrice) ? strike : closest
                );
            }
            console.log(`[S-73] ${ticker}: GammaFlip = $${gammaFlipLevel} (closest to $${underlyingPrice}) from ${crossings.length} crossings: [${crossings.join(', ')}]`);
        }
    }

    if (options_status === "OK" && cleanContracts.length > 0 && underlyingPrice > 0) {
        // Max Pain (LOGIC UNCHANGED)
        let minLoss = Infinity;
        let painStrike = 0;
        const distinctStrikes = Array.from(new Set(cleanContracts.map(c => c.k))).sort((a, b) => a - b);

        distinctStrikes.forEach(testStrike => {
            let loss = 0;
            cleanContracts.forEach(c => {
                if (c.type === 'call' && testStrike > c.k) {
                    loss += (testStrike - c.k) * c.oi;
                } else if (c.type === 'put' && testStrike < c.k) {
                    loss += (c.k - testStrike) * c.oi;
                }
            });
            if (loss < minLoss) {
                minLoss = loss;
                painStrike = testStrike;
            }
        });
        maxPain = painStrike;

        // Net GEX HARDENING
        let gexSum = 0;
        let gammaCount = 0;
        contractsUsedForGex = cleanContracts.length;

        // Key Levels Calculations
        let maxCallOi = -1;
        let callWall = 0;
        let maxPutOi = -1;
        let putFloor = 0;

        cleanContracts.forEach(c => {
            const g = c.greeks?.gamma;
            if (typeof g === 'number' && isFinite(g)) {
                const dir = c.type === 'call' ? 1 : -1;
                gexSum += (g * c.oi * 100 * dir);
                gammaCount++;
            }

            // Track Walls - [FIX] Filter by current price for meaningful levels
            // callWall = highest OI call ABOVE current price but within +20% (resistance)
            // putFloor = highest OI put BELOW current price but within -20% (support)
            // Strikes beyond ±20% are typically hedge/insurance positions, not tactical levels
            const maxResist = underlyingPrice * 1.20;  // +20% ceiling
            const minSupport = underlyingPrice * 0.80; // -20% floor

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

        // [V7.1] gammaFlipLevel is now calculated BEFORE this block (lines 152-198)
        // Removed duplicate calculation here

        if (gammaCoverage >= 0.80) {
            netGex = gexSum;
            gexNotes = "Calculation successful";
        } else {
            netGex = null;
            gexNotes = `netGex null: gammaCoverage (${(gammaCoverage * 100).toFixed(1)}%) < 80%`;
        }

        // Gamma Squeeze Detection (PowerEngine logic)
        const isGammaSqueeze = netGex !== null && netGex > 50000000 &&
            callWall > 0 && underlyingPrice >= callWall * 0.98 &&
            pcr !== null && pcr < 0.6;

        // [S-76] ATM IV Calculation - Find option closest to current price
        let atmIv: number | null = null;
        if (underlyingPrice > 0 && cleanContracts.length > 0) {
            // Find ATM strike (closest to current price)
            const atmStrike = sortedStrikes.reduce((closest, strike) =>
                Math.abs(strike - underlyingPrice) < Math.abs(closest - underlyingPrice) ? strike : closest
            );

            // Get ATM call's IV (prefer call over put for ATM)
            const atmContract = cleanContracts.find(c => c.k === atmStrike && c.type === 'call')
                || cleanContracts.find(c => c.k === atmStrike && c.type === 'put');

            // Polygon IV can be in different places
            const rawIv = atmContract?.greeks?.implied_volatility
                || atmContract?.implied_volatility
                || atmContract?.iv;

            if (typeof rawIv === 'number' && rawIv > 0) {
                atmIv = rawIv > 1 ? Math.round(rawIv) : Math.round(rawIv * 100);
            }
        }

        return NextResponse.json({
            ticker,
            expiration: targetExpiry,
            availableExpirations,
            underlyingPrice: underlyingPrice || null,
            changePercent,
            pcr,
            isGammaSqueeze,
            options_status,
            structure: { strikes: sortedStrikes, callsOI, putsOI },
            maxPain,
            netGex,
            gammaFlipLevel,
            atmIv, // [S-76] ATM Implied Volatility
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
                multiplierUsed: 100,
                netGexUnit: "shares",
                gexFormula: "sum(call gamma*oi*mult) - sum(put gamma*oi*mult)",
                notes: gexNotes
            }
        });
    } else {
        gexNotes = totalStatsContracts === 0
            ? `netGex null: target expiration ${targetExpiry} not found or no contracts`
            : (options_status === "PENDING" ? "netGex null: options_status is PENDING" : "netGex null: insufficient data");

        return NextResponse.json({
            ticker,
            expiration: targetExpiry,
            availableExpirations,
            underlyingPrice: underlyingPrice || null,
            changePercent,
            pcr,
            isGammaSqueeze: false,
            options_status,
            structure: { strikes: sortedStrikes, callsOI, putsOI },
            maxPain: null,
            netGex: null,
            gammaFlipLevel,  // [V7.1] Always include Gamma Flip
            levels: { callWall: null, putFloor: null, pinZone: null },
            sourceGrade: "B",
            debug: {
                apiStatus: 200,
                pagesFetched,
                contractsFetched: allContracts.length,
                notes: gexNotes
            }
        });
    }
}
