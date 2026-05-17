import { NextRequest, NextResponse } from 'next/server';
import { getETNow } from '@/services/timezoneUtils';
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";
import { findWeeklyExpiration } from "@/services/holidayCache";
import { swrFetch } from '@/lib/cache/redisSWR';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

    const result = await swrFetch(
        `options-atm:${ticker}`,
        async () => {
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
            const spotUrl = `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`;
            const spotRes = await fetchMassiveWithRetry(spotUrl, 2);

            let underlyingPrice = 0;
            let prevClose = 0;
            let changePercent = 0;

            if (spotRes.success && spotRes.data?.ticker) {
                const T = spotRes.data.ticker;
                underlyingPrice = T.lastTrade?.p || T.min?.c || T.day?.c || T.prevDay?.c || 0;
                prevClose = T.prevDay?.c || 0;
                if (prevClose > 0 && underlyingPrice > 0) {
                    changePercent = ((underlyingPrice - prevClose) / prevClose) * 100;
                }
            }

            // 2. Fetch Options Chain — Call + Put separately
            // [FIX] Add strike_price filter for wide-chain tickers (TSLA, AMZN, etc.)
            // Without filter, limit=250 fills from lowest strikes ($50+) and never reaches ATM ($400+)
            const todayStr = et.dateString;
            const strikeLo = underlyingPrice > 0 ? Math.floor(underlyingPrice * 0.80) : 0;
            const strikeHi = underlyingPrice > 0 ? Math.ceil(underlyingPrice * 1.20) : 99999;
            const strikeFilter = underlyingPrice > 0
                ? `&strike_price.gte=${strikeLo}&strike_price.lte=${strikeHi}`
                : '';
            const [callChainRes, putChainRes] = await Promise.all([
                fetchMassiveWithRetry(`/v3/snapshot/options/${ticker}?expiration_date.gte=${todayStr}&contract_type=call&limit=250${strikeFilter}`, 3),
                fetchMassiveWithRetry(`/v3/snapshot/options/${ticker}?expiration_date.gte=${todayStr}&contract_type=put&limit=250${strikeFilter}`, 3),
            ]);

            const callContracts = callChainRes.success && callChainRes.data?.results ? callChainRes.data.results : [];
            const putContracts = putChainRes.success && putChainRes.data?.results ? putChainRes.data.results : [];

            if (callContracts.length === 0 && putContracts.length === 0) {
                return {
                    ticker, timestampET: et.displayString, session,
                    underlyingPrice: underlyingPrice || null,
                    atmSlice: [], options_status: "PENDING", sourceGrade: "C",
                    debug: { apiStatus: 500, attempts: (callChainRes.attempts || 0) + (putChainRes.attempts || 0), latencyMs: 0, error: callChainRes.error || putChainRes.error }
                };
            }

            const allContracts = [...callContracts, ...putContracts];

            // 3. [S-70] Find Weekly Expiration (Friday, or Thursday if holiday)
            const expirations = Array.from(new Set(allContracts.map((c: any) => c.details?.expiration_date || c.expiration_date))).sort() as string[];
            const nearestExpiry = await findWeeklyExpiration(expirations);

            if (!nearestExpiry) {
                return {
                    ticker, timestampET: et.displayString, session,
                    underlyingPrice, atmSlice: [], oiStatus: "PENDING", sourceGrade: "B",
                    debug: { apiStatus: 200, info: "No expirations found" }
                };
            }

            // 4. Filter for Nearest Expiry & ATM
            if (underlyingPrice === 0) {
                return {
                    ticker, timestampET: et.displayString, session,
                    underlyingPrice: null, atmSlice: [], oiStatus: "PENDING", sourceGrade: "C",
                    debug: { apiStatus: 200, info: "Underlying price missing" }
                };
            }

            const expiryContracts = allContracts.filter((c: any) =>
                (c.details?.expiration_date === nearestExpiry || c.expiration_date === nearestExpiry)
            );

            // Group contracts by strike price (each strike has call + put)
            const byStrike: Record<number, any[]> = {};
            for (const c of expiryContracts) {
                const k = c.details?.strike_price || c.strike_price || 0;
                if (!byStrike[k]) byStrike[k] = [];
                byStrike[k].push(c);
            }

            // Get sorted unique strikes
            const strikes = Object.keys(byStrike).map(Number).sort((a, b) => a - b);

            // Find ATM strike (closest to underlying price)
            let atmIdx = 0;
            let minDiff = Infinity;
            for (let i = 0; i < strikes.length; i++) {
                const diff = Math.abs(strikes[i] - underlyingPrice);
                if (diff < minDiff) { minDiff = diff; atmIdx = i; }
            }

            // Take ±8 strikes around ATM (each strike includes both call + put)
            const startIdx = Math.max(0, atmIdx - 8);
            const endIdx = Math.min(strikes.length, atmIdx + 9);
            const selectedStrikes = strikes.slice(startIdx, endIdx);

            // Flatten back to individual contracts (call + put per strike)
            const sliceRaw = selectedStrikes.flatMap(k => byStrike[k]);

            let nullOiCount = 0;

            // Days to expiration for IV approximation
            const expDate = new Date(nearestExpiry + 'T16:00:00-05:00');
            const nowDate = new Date();
            const dte = Math.max(1, Math.ceil((expDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24)));
            const T = dte / 365;

            // Simplified Black-Scholes IV approximation (Brenner-Subrahmanyam + Newton-Raphson)
            function approxIV(optionPrice: number, spot: number, strike: number, isCall: boolean): number | null {
                if (!optionPrice || optionPrice <= 0 || spot <= 0 || strike <= 0) return null;

                // Intrinsic value check
                const intrinsic = isCall ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
                const timeValue = optionPrice - intrinsic;
                if (timeValue <= 0) return null;

                // Brenner-Subrahmanyam initial guess: σ ≈ price * √(2π) / (S * √T)
                const sqrtT = Math.sqrt(T);
                let sigma = (timeValue * Math.sqrt(2 * Math.PI)) / (spot * sqrtT);
                sigma = Math.max(0.05, Math.min(sigma, 5.0));

                // CDF approximation
                const cdf = (x: number) => {
                    const t = 1 / (1 + 0.2316419 * Math.abs(x));
                    const d = 0.3989422804014327 * Math.exp(-0.5 * x * x);
                    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
                    return x > 0 ? 1 - p : p;
                };

                // Newton-Raphson iterations (max 15)
                for (let i = 0; i < 15; i++) {
                    const d1 = (Math.log(spot / strike) + (0.5 * sigma * sigma) * T) / (sigma * sqrtT);
                    const d2 = d1 - sigma * sqrtT;
                    const bsPrice = isCall
                        ? spot * cdf(d1) - strike * cdf(d2)
                        : strike * cdf(-d2) - spot * cdf(-d1);

                    const vega = spot * sqrtT * 0.3989422804014327 * Math.exp(-0.5 * d1 * d1);
                    if (vega < 1e-12) break;

                    const diff = bsPrice - optionPrice;
                    sigma = sigma - diff / vega;
                    sigma = Math.max(0.01, Math.min(sigma, 10.0));

                    if (Math.abs(diff) < 0.001) break;
                }

                return (sigma > 0.01 && sigma < 5.0) ? sigma : null;
            }

            const atmSlice = sliceRaw.map((c: any) => {
                const strike = c.details?.strike_price || c.strike_price || 0;
                const type = (c.details?.contract_type || c.contract_type || "call").toLowerCase();
                const last = c.day?.close || c.last_quote?.a || null;
                let iv = c.implied_volatility || c.greeks?.implied_volatility || null;
                const gamma = c.greeks?.gamma || null;
                const oi = c.open_interest;
                if (oi === undefined || oi === null) nullOiCount++;

                // Fallback: compute IV from option price when Polygon returns null on both fields
                if (!iv && last && last > 0 && underlyingPrice > 0) {
                    iv = approxIV(last, underlyingPrice, strike, type === 'call');
                }

                return { expiration: nearestExpiry, strike, type, last, iv, gamma, oi: (typeof oi === 'number') ? oi : null };
            });

            const totalRows = atmSlice.length;
            const validRows = totalRows - nullOiCount;
            const coveragePct = totalRows > 0 ? Math.round((validRows / totalRows) * 100) : 0;

            let status: 'OK' | 'PARTIAL' | 'PENDING' | 'ERROR' = 'PENDING';
            if (coveragePct >= 90) status = 'OK';
            else if (coveragePct >= 20) status = 'PARTIAL';
            else status = 'PENDING';

            return {
                ticker,
                timestampET: et.displayString,
                session,
                underlyingPrice,
                prevClose,
                changePercent: Math.round(changePercent * 100) / 100,
                atmSlice,
                optionsStatus: { status, coveragePct, updatedAt: et.displayString, reasonKR: status === 'OK' ? undefined : `자체 커버리지 ${coveragePct}%` },
                sourceGrade: "A",
                debug: { apiStatus: 200, pagesFetched: 2, contractsFetched: allContracts.length, attempts: (callChainRes.attempts || 1) + (putChainRes.attempts || 1), latencyMs: Math.max(callChainRes.latency || 0, putChainRes.latency || 0) }
            };
        },
        { ttlSeconds: 30, keyPrefix: 'swr' }
    );

    return NextResponse.json({ ...result.data, _cache: result._cache });
}
