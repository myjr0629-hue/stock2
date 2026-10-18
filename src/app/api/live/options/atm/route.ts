import { NextRequest, NextResponse } from 'next/server';
import { getETNow } from '@/services/timezoneUtils';
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";
import { findWeeklyExpiration } from "@/services/holidayCache";
import { swrFetch } from '@/lib/cache/redisSWR';
import { getFromCache, setInCache } from '@/services/redisClient';
import { sourceNumber, sourceDate, observationTime, isNormalIVSnapshot, selectIVSnapshot, type AtmSnapshot } from '@/lib/ivSkew';

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

    const lastGoodKey = `options-atm:source-v1:last-good:${ticker}`;
    const previous = await getFromCache<AtmSnapshot>(lastGoodKey).catch(() => null);
    const load = () => swrFetch(
        `options-atm:source-v1:${ticker}`,
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

            const atmSlice = sliceRaw.map((c: any) => {
                const strike = c.details?.strike_price ?? c.strike_price;
                const type = (c.details?.contract_type ?? c.contract_type ?? '').toLowerCase();
                const eod = c._intrinio?.eod;
                // Older compatibility snapshots cannot distinguish a missing IV from a real zero.
                // Use only preserved vendor fields for Intrinio; never relabel realtime IV as EOD.
                const last = c._intrinio ? sourceNumber(eod?.close) : sourceNumber(c.day?.close) ?? sourceNumber(c.last_quote?.a);
                const iv = c._intrinio ? sourceNumber(eod?.iv) : sourceNumber(c.implied_volatility) ?? sourceNumber(c.greeks?.implied_volatility);
                const gamma = c._intrinio ? sourceNumber(eod?.gamma) : sourceNumber(c.greeks?.gamma);
                const oi = c._intrinio ? sourceNumber(eod?.oi) : sourceNumber(c.open_interest);
                const observed = observationTime(c._intrinio ? null : c.last_updated ?? c.day?.last_updated ?? c.last_quote?.last_updated ?? c.last_trade?.sip_timestamp);
                const sourceSessionDate = sourceDate(c._intrinio?.date) ?? observed.sourceSessionDate;
                return { expiration: nearestExpiry, strike, type, last, iv, gamma, oi,
                    ...observed, sourceSessionDate };
            }).filter((c: any) => sourceNumber(c.strike) !== null && c.strike > 0 && ['call', 'put'].includes(c.type));
            const dates = new Set(atmSlice.map((c: any) => c.sourceSessionDate));
            const sourceSessionDate = dates.size === 1 ? atmSlice[0]?.sourceSessionDate ?? null : null;

            const totalRows = atmSlice.length;
            const validRows = atmSlice.filter((c: any) => c.oi !== null).length;
            const coveragePct = totalRows > 0 ? Math.round((validRows / totalRows) * 100) : 0;

            let status: 'OK' | 'PARTIAL' | 'PENDING' | 'ERROR' = 'PENDING';
            if (coveragePct >= 90) status = 'OK';
            else if (coveragePct >= 20) status = 'PARTIAL';
            else status = 'PENDING';

            return {
                ticker,
                timestampET: et.displayString,
                session: sliceRaw.every((c: any) => c._intrinio) || (sourceSessionDate && sourceSessionDate < et.dateString) ? 'CLOSED' : session,
                underlyingPrice,
                prevClose,
                changePercent: Math.round(changePercent * 100) / 100,
                atmSlice,
                sourceSessionDate,
                optionsStatus: { status, coveragePct, updatedAt: et.displayString, reasonKR: status === 'OK' ? undefined : `자체 커버리지 ${coveragePct}%` },
                sourceGrade: "A",
                debug: { apiStatus: 200, pagesFetched: 2, contractsFetched: allContracts.length, attempts: (callChainRes.attempts || 1) + (putChainRes.attempts || 1), latencyMs: Math.max(callChainRes.latency || 0, putChainRes.latency || 0) }
            };
        },
        { ttlSeconds: 30, keyPrefix: 'swr' }
    );

    let result;
    try {
        result = await load();
    } catch {
        result = { data: { ticker, atmSlice: [], underlyingPrice: null, sourceSessionDate: null }, _cache: 'miss' as const };
    }
    const current = result.data;
    const selected = selectIVSnapshot(current, previous, ticker);
    // Keep a separate, versioned normal snapshot across weekends/holidays and SWR expiry.
    // Partial/error responses must never overwrite it. All values retain their source date.
    if (isNormalIVSnapshot(current) && selected && !selected.restored) {
        await setInCache(lastGoodKey, current, 30 * 24 * 60 * 60).catch(() => false);
    }
    return NextResponse.json({ ...(selected ?? current), _cache: result._cache });
}
