import { NextRequest, NextResponse } from "next/server";
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";

export const revalidate = 0; // Force dynamic (User Request)

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
    if (spotRes.success && spotRes.data?.ticker) {
        const T = spotRes.data.ticker;
        underlyingPrice = T.lastTrade?.p || T.min?.c || T.day?.c || T.prevDay?.c || 0;
    }

    // 2. Fetch Options Chain (Pagination)
    // Sort by expiration date to get nearest first
    const todayStr = new Date().toISOString().split('T')[0];
    let chainUrl = `/v3/snapshot/options/${ticker}?expiration_date.gte=${todayStr}&sort=expiration_date&order=asc&limit=250`;

    let allContracts: any[] = [];
    let pagesFetched = 0;
    let latencyTotal = 0;
    let attemptsTotal = 0;
    const MAX_PAGES = 4; // Safety limit

    // We only strictly NEED one expiration. 
    // If we rely on sorting, the first page usually contains the nearest expiry contracts.
    // However, if there are MANY strikes, they might span multiple pages? 
    // Polygon v3 snapshot sorts by ticker usually if not specified.
    // Specifying sort=expiration_date should clump them.

    try {
        while (chainUrl && pagesFetched < MAX_PAGES) {
            const res = await fetchMassiveWithRetry(chainUrl, 3);
            attemptsTotal += res.attempts || 1;
            latencyTotal += res.latency || 0;

            if (!res.success || !res.data?.results) break;

            allContracts = allContracts.concat(res.data.results);
            pagesFetched++;

            // Check if we have enough contracts for the target expiry?
            // If we have a requested expiry, check if we covered it? 
            // Simplifying: Fetch a few pages to "widen" the net, but stop if we have plenty.
            if (allContracts.length > 500) break;

            chainUrl = res.data.next_url || '';
        }
    } catch (e) {
        // partial data is better than none
    }

    if (allContracts.length === 0) {
        return NextResponse.json({
            ticker, expiration: "-", underlyingPrice, options_status: "PENDING",
            structure: { strikes: [], callsOI: [], putsOI: [] },
            maxPain: null, netGex: null, sourceGrade: "C",
            debug: { apiStatus: 404, pagesFetched, contractsFetched: 0 }
        });
    }

    // 3. Select Expiration & Build Available List
    const allExps = Array.from(new Set(allContracts.map((c: any) => c.details?.expiration_date || c.expiration_date))).sort();
    const availableExpirations = allExps.slice(0, 10); // Top 10 earliest

    // Nearest by default, or requested if valid
    let targetExpiry = allExps[0];
    let forcesRequested = false;
    if (requestedExp && allExps.includes(requestedExp)) {
        targetExpiry = requestedExp;
        forcesRequested = true;
    } else if (requestedExp) {
        // requested but not found in the snapshot we have
        targetExpiry = requestedExp;
        forcesRequested = true;
    }

    // 4. Filter Contracts for Target Expiry
    const contracts = allContracts.filter((c: any) =>
        targetExpiry === (c.details?.expiration_date || c.expiration_date)
    );

    // Filter by strike range (approx ±25% to capture structures better)
    const relevantContracts = underlyingPrice > 0
        ? contracts.filter((c: any) => {
            const k = c.details?.strike_price || c.strike_price || 0;
            return k >= underlyingPrice * 0.75 && k <= underlyingPrice * 1.25;
        })
        : contracts;

    // 5. Structure & Integrity
    let nullOiCount = 0;
    const strikesSet = new Set<number>();
    const callsMap = new Map<number, number | null>();
    const putsMap = new Map<number, number | null>();
    const cleanContracts: any[] = [];

    relevantContracts.forEach((c: any) => {
        const k = c.details?.strike_price || c.strike_price || 0;
        const type = (c.details?.contract_type || c.contract_type || "call").toLowerCase();
        const oi = c.open_interest;

        strikesSet.add(k);

        if (oi === undefined || oi === null) {
            nullOiCount++;
        } else {
            cleanContracts.push({ ...c, k, type, oi });
        }

        const val = (typeof oi === 'number') ? oi : null;
        if (type === 'call') callsMap.set(k, (callsMap.get(k) || 0) + (val || 0));
        else putsMap.set(k, (putsMap.get(k) || 0) + (val || 0));
    });

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

            // Track Walls
            if (c.type === 'call' && c.oi > maxCallOi) {
                maxCallOi = c.oi;
                callWall = c.k;
            }
            if (c.type === 'put' && c.oi > maxPutOi) {
                maxPutOi = c.oi;
                putFloor = c.k;
            }
        });

        gammaCoverage = contractsUsedForGex > 0 ? gammaCount / contractsUsedForGex : 0;

        if (gammaCoverage >= 0.80) {
            netGex = gexSum;
            gexNotes = "Calculation successful";
        } else {
            netGex = null;
            gexNotes = `netGex null: gammaCoverage (${(gammaCoverage * 100).toFixed(1)}%) < 80%`;
        }

        return NextResponse.json({
            ticker,
            expiration: targetExpiry,
            availableExpirations,
            underlyingPrice: underlyingPrice || null,
            options_status,
            structure: { strikes: sortedStrikes, callsOI, putsOI },
            maxPain,
            netGex,
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
            options_status,
            structure: { strikes: sortedStrikes, callsOI, putsOI },
            maxPain: null,
            netGex: null,
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
