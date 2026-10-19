/** Date recovery is a value comparison against the same weekly EOD source, never a calendar inference. */
export function optionDate(value: unknown): string | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function observations(chain: any[]) {
    return chain.map(c => [c.details?.expiration_date, c.details?.contract_type,
        c.details?.strike_price, c.day?.volume ?? 0, c.day?.close ?? c.details?.close_price ?? 0])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

/** Accept a dated copy only if every displayed premium/volume input agrees.
 * chain=0 omits contracts, so require all independent totals and the contributing contract count.
 * Do not attach dates to calculated OI-based fallback premiums or empty samples.
 */
export function matchingOptionDate(flow: any, chain: any[], date: unknown): string | null {
    const valid = optionDate(date);
    if (!valid || !flow || !chain.length || flow.dataSource === 'CALCULATED') return null;
    if (!chain.every(c => c.details?.expiration_date === flow.weeklyExpiration)) return null;
    let callPremium = 0, putPremium = 0, calls = 0, puts = 0, count = 0;
    for (const c of chain) {
        const type = c.details?.contract_type;
        const vol = c.day?.volume ?? 0;
        const close = c.day?.close || c.details?.close_price || 0;
        if (!['call', 'put'].includes(type) || !Number.isFinite(vol) || vol < 0 || !Number.isFinite(close) || close < 0) return null;
        if (type === 'call') calls += vol;
        else puts += vol;
        if (vol > 0 && close > 0) {
            count++;
            if (type === 'call') callPremium += vol * close * 100;
            else putPremium += vol * close * 100;
        }
    }
    // Same multiplication and summation order as CentralDataHub. A tiny roundoff
    // tolerance permits a differently ordered copy, never rounded display values.
    const equal = (a: unknown, b: number) => typeof a === 'number' && Number.isFinite(a)
        && Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-12);
    if (!count || flow.optionsCount !== chain.length || flow.contractsProcessed !== count
        || !equal(flow.callPremium, callPremium) || !equal(flow.putPremium, putPremium)
        || !equal(flow.totalPremium, callPremium + putPremium) || !equal(flow.netPremium, callPremium - putPremium)
        || flow.volumePcrCallVol !== calls || flow.volumePcrPutVol !== puts) return null;
    if (Array.isArray(flow.rawChain) && flow.rawChain.length
        && JSON.stringify(observations(flow.rawChain)) !== JSON.stringify(observations(chain))) return null;
    return valid;
}

/** Intrinio's EOD rows carry the date alongside close and volume. Realtime overlays are excluded. */
export function datedEodChain(response: any): { chain: any[]; date: string } | null {
    if (!Array.isArray(response?.chain) || !response.chain.length || response.next_page || response._truncated) return null;
    const dates = response.chain.map((r: any) => optionDate(r.prices?.date));
    if (!dates[0] || dates.some((d: string | null) => d !== dates[0])) return null;
    const chain = response.chain.map((r: any) => ({
        details: { expiration_date: r.option?.expiration, contract_type: String(r.option?.type).toLowerCase(), strike_price: r.option?.strike },
        day: { volume: r.prices?.volume ?? 0, close: r.prices?.close ?? 0 },
    }));
    return { chain, date: dates[0] };
}
