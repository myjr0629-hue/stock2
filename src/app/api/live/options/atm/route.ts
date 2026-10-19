import { NextRequest, NextResponse } from 'next/server';
import { getETNow } from '@/services/timezoneUtils';
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";
import { findWeeklyExpiration } from "@/services/holidayCache";
import { swrFetch } from '@/lib/cache/redisSWR';
import { getFromCache, setInCache } from '@/services/redisClient';
import { sourceNumber, sourceDate, observationTime, dominantDate, datedSnapshot, isNormalIVSnapshot, selectIVSnapshot, type AtmSnapshot } from '@/lib/ivSkew';

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

const DAY = 24 * 60 * 60;
// A historical close never changes: keep it 30 days. A failed/empty/wrong-date lookup is
// remembered for 10 minutes so outages back off instead of re-querying on every request.
const CLOSE_OK_TTL = 30 * DAY, CLOSE_FAIL_TTL = 10 * 60;

/**
 * Close of the chain's own source session (the only valid ATM basis for an EOD chain).
 * Order: previous complete snapshot of the same session → cached close → one vendor lookup.
 */
async function sessionClose(ticker: string, date: string, previous: AtmSnapshot | null): Promise<number | null> {
    const prevPrice = sourceNumber(previous?.atmBasisPrice);
    if (previous && previous.ticker === ticker && sourceDate(previous.sourceSessionDate) === date &&
        previous.atmBasisSessionDate === date && prevPrice !== null && prevPrice > 0) return prevPrice;
    const key = `options-atm:close-v1:${ticker}:${date}`;
    const cached = await getFromCache<{ price: number | null }>(key).catch(() => null);
    if (cached && typeof cached === 'object' && 'price' in cached) {
        const price = sourceNumber(cached.price);
        return price !== null && price > 0 ? price : null; // null = recent failure (backoff)
    }
    const close = await fetchMassiveWithRetry(`/v1/open-close/${ticker}/${date}`, 1);
    const raw = close.success && sourceDate(close.data?.from) === date ? sourceNumber(close.data?.close) : null;
    const price = raw !== null && raw > 0 ? raw : null;
    await setInCache(key, { price }, price !== null ? CLOSE_OK_TTL : CLOSE_FAIL_TTL).catch(() => false);
    return price;
}

/** Vendor-declared incompleteness for the selected expiry (or an unknown partial cause). */
function vendorIncomplete(res: any, expiry: string): boolean {
    if (!res?.success) return true;
    const d = res.data ?? {};
    if (d.vendorFailed === true) return true;
    const truncated = Array.isArray(d.expirationsTruncated) ? d.expirationsTruncated : null;
    const missing = Array.isArray(d.expirationsMissing) ? d.expirationsMissing : null;
    if (truncated?.includes(expiry) || missing?.includes(expiry)) return true;
    return d.partial === true && !truncated && !missing;
}

export async function GET(req: NextRequest) {
    const t = req.nextUrl.searchParams.get('t');
    if (!t) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

    const ticker = t.toUpperCase();

    // Separate, versioned last complete chain (survives weekends/holidays and SWR expiry).
    const lastGoodKey = `options-atm:source-v2:last-good:${ticker}`;
    const previous = await getFromCache<AtmSnapshot>(lastGoodKey).catch(() => null);
    const load = () => swrFetch(
        // Exclude old SWR responses (different price/ATM-basis contract).
        `options-atm:source-v4:${ticker}`,
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
            const expiryOf = (c: any) => sourceDate(c.details?.expiration_date ?? c.expiration_date);
            // A contract without a valid expiry cannot be assigned to any expiry: the chain is
            // then incomplete (it may be a row of the selected expiry), never silently complete.
            const expiryMissing = allContracts.some((c: any) => expiryOf(c) === null);
            const expirations = Array.from(new Set(allContracts.map(expiryOf).filter((e): e is string => e !== null))).sort();
            const nearestExpiry = await findWeeklyExpiration(expirations);

            if (!nearestExpiry) {
                return {
                    ticker, timestampET: et.displayString, session,
                    underlyingPrice, atmSlice: [], oiStatus: "PENDING", sourceGrade: "B",
                    debug: { apiStatus: 200, info: "No expirations found" }
                };
            }

            // 4. Normalize the full expiry before selecting ATM. Its source date
            // determines the price basis, not today's snapshot/receipt time.
            const expiryContracts = allContracts.filter((c: any) =>
                (c.details?.expiration_date === nearestExpiry || c.expiration_date === nearestExpiry)
            );

            const normalized = expiryContracts.map((c: any) => {
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
            });
            // Judge completeness on all original rows of the expiry (before display filtering or
            // ATM slicing) and on the vendor's own partial/truncated markers for that expiry.
            const completeIVChain = !expiryMissing && !vendorIncomplete(callChainRes, nearestExpiry) &&
                !vendorIncomplete(putChainRes, nearestExpiry) &&
                isNormalIVSnapshot({ ticker, atmSlice: normalized });
            const sourceSessionDate = dominantDate(normalized.map((c: any) => c.sourceSessionDate));
            // Row-level: a row without that source date (or with a bad strike/type) is excluded alone.
            const validContracts = normalized.filter((c: any) => sourceNumber(c.strike) !== null && c.strike > 0 &&
                ['call', 'put'].includes(c.type) && sourceSessionDate !== null && c.sourceSessionDate === sourceSessionDate);
            const historical = expiryContracts.every((c: any) => c._intrinio) ||
                (!!sourceSessionDate && sourceSessionDate < et.dateString);
            // ATM basis = that session's close for an EOD chain; never today's quote.
            let atmBasisPrice: number | null = null;
            if (sourceSessionDate) {
                if (historical) atmBasisPrice = await sessionClose(ticker, sourceSessionDate, previous);
                else if (sourceSessionDate === et.dateString && underlyingPrice > 0) atmBasisPrice = underlyingPrice;
            }
            const strikes = [...new Set<number>(validContracts.map((c: any) => c.strike))].sort((a, b) => a - b);
            let atmIdx = 0;
            for (let i = 1; i < strikes.length; i++) {
                if (atmBasisPrice !== null && Math.abs(strikes[i] - atmBasisPrice) < Math.abs(strikes[atmIdx] - atmBasisPrice)) atmIdx = i;
            }
            // Without a dated basis, retain every observed strike and leave ATM unresolved.
            const selectedStrikes = atmBasisPrice !== null ? strikes.slice(Math.max(0, atmIdx - 8), atmIdx + 9) : strikes;
            const byStrike: Record<number, typeof normalized> = {};
            for (const c of validContracts) (byStrike[c.strike] ??= []).push(c);
            const atmSlice = selectedStrikes.flatMap(strike => byStrike[strike]);

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
                session: historical ? 'CLOSED' : session,
                // Current quote, same meaning as before (home drawer etc.). Not the ATM basis.
                underlyingPrice: underlyingPrice > 0 ? underlyingPrice : null,
                prevClose,
                changePercent: Math.round(changePercent * 100) / 100,
                atmBasisPrice,
                atmBasisSessionDate: atmBasisPrice !== null ? sourceSessionDate : null,
                completeIVChain,
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
    const current = result.data as AtmSnapshot & Record<string, any>;
    const selected = selectIVSnapshot(current, previous, ticker);
    // Only a complete chain (all original rows + no vendor partial marker) may become last-good.
    // A same-session chain that lost its basis cannot replace one that has it.
    // An identical same-session copy is not rewritten on every revalidation.
    const prevNormal = isNormalIVSnapshot(previous) && previous.ticker === ticker;
    const sameSession = prevNormal && previous!.sourceSessionDate === current.sourceSessionDate;
    const changed = !sameSession || current.atmBasisPrice !== previous!.atmBasisPrice ||
        JSON.stringify(current.atmSlice) !== JSON.stringify(previous!.atmSlice);
    const losesBasis = sameSession && previous!.atmBasisPrice != null && current.atmBasisPrice == null;
    if (isNormalIVSnapshot(current) && selected && !selected.restored && changed && !losesBasis) {
        await setInCache(lastGoodKey, current, 30 * DAY).catch(() => false);
    }
    // Undated rows are never emitted (home table included): no source date, no row.
    const body = selected ?? datedSnapshot(current, ticker) ?? { ...current, atmSlice: [] };
    // Quote fields always describe now; a restored chain never carries its old quote to the home screen.
    return NextResponse.json({ ...body, underlyingPrice: current.underlyingPrice ?? null,
        prevClose: current.prevClose ?? null, changePercent: current.changePercent ?? null, _cache: result._cache });
}
