import { NextRequest, NextResponse } from 'next/server';
import { getETNow } from '@/services/timezoneUtils';
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";

export const dynamic = 'force-dynamic';
export const revalidate = 0; // No caching for live data

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
    if (!t) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

    const ticker = t.toUpperCase();

    // [S-52.2.3] Use reliable timezone utility
    const et = getETNow();
    const etTime = et.hour + et.minute / 60;

    let session: "PRE" | "RTH" | "POST" | "CLOSED" = "CLOSED";
    if (!et.isWeekend) {
        if (etTime >= 4.0 && etTime < 9.5) session = "PRE";
        else if (etTime >= 9.5 && etTime < 16.0) session = "RTH";
        else if (etTime >= 16.0 && etTime < 20.0) session = "POST";
    }

    // 1. Get Underlying Price (Massive)
    // We can use the ticker snapshot for this.
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
            changePercent = ((underlyingPrice - prevClose) / prevClose) * 100;
        }
    }

    // 2. Fetch Options Chain (Massive v3 Snapshot)
    // Filter for today onwards
    const todayStr = et.dateString;
    // We fetch a batch to find nearest expiry
    // limit 250 is usually enough to cover the nearest expiry for most stocks unless it's SPY.
    const chainUrl = `/v3/snapshot/options/${ticker}?expiration_date.gte=${todayStr}&limit=250`;

    const chainRes = await fetchMassiveWithRetry(chainUrl, 3);

    if (!chainRes.success || !chainRes.data?.results) {
        return NextResponse.json({
            ticker, timestampET: et.displayString, session,
            underlyingPrice: underlyingPrice || null,
            atmSlice: [], options_status: "PENDING", sourceGrade: "C",
            debug: { apiStatus: 500, attempts: chainRes.attempts, latencyMs: 0, error: chainRes.error }
        });
    }

    const allContracts = chainRes.data.results;

    // 3. Find Nearest Expiration
    const expirations = Array.from(new Set(allContracts.map((c: any) => c.details?.expiration_date || c.expiration_date))).sort();
    const nearestExpiry = expirations[0];

    if (!nearestExpiry) {
        return NextResponse.json({
            ticker, timestampET: et.displayString, session,
            underlyingPrice, atmSlice: [], oiStatus: "PENDING", sourceGrade: "B",
            debug: { apiStatus: 200, info: "No expirations found" }
        });
    }

    // 4. Filter for Nearest Expiry & ATM
    // If we don't have underlyingPrice from snapshot (rare), try to infer from options? No, strict dependency.
    // If underlying is 0, we can't calculate ATM.
    if (underlyingPrice === 0) {
        // fallback: try to find a strike from the chain roughly in the middle? 
        // Unreliable. Return empty.
        return NextResponse.json({
            ticker, timestampET: et.displayString, session,
            underlyingPrice: null, atmSlice: [], oiStatus: "PENDING", sourceGrade: "C",
            debug: { apiStatus: 200, info: "Underlying price missing" }
        });
    }

    const expiryContracts = allContracts.filter((c: any) =>
        (c.details?.expiration_date === nearestExpiry || c.expiration_date === nearestExpiry)
    );

    // Sort by strike
    expiryContracts.sort((a: any, b: any) => {
        const sa = a.details?.strike_price || a.strike_price || 0;
        const sb = b.details?.strike_price || b.strike_price || 0;
        return sa - sb;
    });

    // Find center index
    let closestIndex = 0;
    let minDiff = Infinity;

    for (let i = 0; i < expiryContracts.length; i++) {
        const k = expiryContracts[i].details?.strike_price || expiryContracts[i].strike_price || 0;
        const diff = Math.abs(k - underlyingPrice);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = i;
        }
    }

    // Slice ±8 (approx 16-20 rows)
    const startIdx = Math.max(0, closestIndex - 8);
    const endIdx = Math.min(expiryContracts.length, closestIndex + 9);
    const sliceRaw = expiryContracts.slice(startIdx, endIdx);

    let nullOiCount = 0;

    const atmSlice = sliceRaw.map((c: any) => {
        const strike = c.details?.strike_price || c.strike_price || 0;
        const type = (c.details?.contract_type || c.contract_type || "call").toLowerCase();
        const last = c.day?.close || c.last_quote?.a || null; // close or ask
        // Greeks might be in c.greeks
        const iv = c.greeks?.implied_volatility || null;
        const gamma = c.greeks?.gamma || null;
        const oi = c.open_interest; // explicit field

        if (oi === undefined || oi === null) nullOiCount++;

        return {
            expiration: nearestExpiry,
            strike,
            type,
            last,
            iv,
            gamma,
            oi: (typeof oi === 'number') ? oi : null
        };
    });

    // OI Integrity Rule
    const totalRows = atmSlice.length;
    const validRows = totalRows - nullOiCount;
    const coveragePct = totalRows > 0 ? Math.round((validRows / totalRows) * 100) : 0;

    let status: 'OK' | 'PARTIAL' | 'PENDING' | 'ERROR' = 'PENDING';
    if (coveragePct >= 90) status = 'OK';
    else if (coveragePct >= 20) status = 'PARTIAL';
    else status = 'PENDING';

    const optionsStatus = {
        status,
        coveragePct,
        updatedAt: et.displayString,
        reasonKR: status === 'OK' ? undefined : `자체 커버리지 ${coveragePct}%`
    };

    return NextResponse.json({
        ticker,
        timestampET: et.displayString,
        session,
        underlyingPrice,
        prevClose,
        changePercent: Math.round(changePercent * 100) / 100, // Round to 2 decimal places
        atmSlice,
        optionsStatus,
        sourceGrade: "A",
        debug: {
            apiStatus: 200,
            pagesFetched: 1,
            contractsFetched: allContracts.length,
            attempts: chainRes.attempts,
            latencyMs: chainRes.latency
        }
    });
}
