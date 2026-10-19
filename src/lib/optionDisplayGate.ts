import { etDateOf, etMinutesOf, isNonTradingDay, optionExpiryJudge, prevTradingDate, sessionCloseMinutes } from './marketCalendar';

/** Keep the original expiry until after this gate; MM/DD display strings lose the year. */
export function optionRowExpiry(row: any): string | null {
    const explicit = row?.details?.expiration_date ?? row?.expiration ?? row?.expiry ?? row?.expirationDate;
    if (typeof explicit === 'string' && /^\d{4}-\d{2}-\d{2}/.test(explicit)) return explicit;
    const occ = /(?:O:)?[A-Z.]+(\d{2})(\d{2})(\d{2})[CP]\d{8}$/.exec(row?.contract ?? row?.contractTicker ?? row?.details?.ticker ?? row?.ticker ?? '');
    return occ ? `20${occ[1]}-${occ[2]}-${occ[3]}` : typeof explicit === 'string' ? explicit : null;
}

/** Every contract list uses the calendar boundary, including cached expired:false rows. */
export function activeOptionRows<T>(rows: readonly T[], nowMs = Date.now()): T[] {
    const expired = optionExpiryJudge(nowMs);
    return rows.filter(row => (row as any)?.expired !== true && !expired(optionRowExpiry(row)));
}

/** STRIKE history only: never feed expired session volumes back into live position/sample gates. */
export function strikeVolumeSource(rows: readonly any[], chainDate: unknown, nowMs = Date.now()): { rows: any[]; date: string | null } {
    const date = typeof chainDate === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(chainDate)
        && Number.isFinite(Date.parse(chainDate.slice(0, 10)))
        && new Date(chainDate.slice(0, 10)).toISOString().slice(0, 10) === chainDate.slice(0, 10)
        ? chainDate.slice(0, 10) : null;
    const observed = rows.filter(row => Number.isFinite(row?.details?.strike_price)
        && (row?.details?.contract_type === 'call' || row?.details?.contract_type === 'put')
        && typeof row?.day?.volume === 'number' && Number.isFinite(row.day.volume) && row.day.volume >= 0);
    const active = activeOptionRows(observed, nowMs);
    if (active.length) return { rows: active, date };

    const today = etDateOf(nowMs);
    const closedDate = isNonTradingDay(today) || etMinutesOf(nowMs) < sessionCloseMinutes(today) ? prevTradingDate(today) : today;
    if (date !== closedDate) return { rows: [], date: null };
    // At 12:00 UTC it is before both regular and early ET closes, in either DST season.
    const expiredAtSession = optionExpiryJudge(Date.parse(`${date}T12:00:00Z`));
    const historical = observed.filter(row => /^\d{4}-\d{2}-\d{2}$/.test(optionRowExpiry(row) ?? '') && !expiredAtSession(optionRowExpiry(row)));
    return { rows: historical, date: historical.length ? date : null };
}

const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function optionSampleReady(callVolume: unknown, putVolume: unknown, oiPcr: unknown): boolean {
    return nonnegative(callVolume) && nonnegative(putVolume)
        && callVolume + putVolume >= 100 && nonnegative(oiPcr);
}

/** Whole nearest-expiry chain, independent of chart strike range or Volume/OI mode.
 * Callers pass active rows; later expiries cannot pad the weekly sample or P/C.
 */
export function optionChainVolumes(rows: readonly any[]): { call: number | null; put: number | null; callPct: number | null } {
    const missing = { call: null, put: null, callPct: null };
    const expiries = rows.map(optionRowExpiry).filter((e): e is string => typeof e === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e)).sort();
    if (!expiries.length) return missing;
    let calls = 0, puts = 0, observed = false;
    for (const row of rows) {
        if (optionRowExpiry(row) !== expiries[0]) continue;
        const type = row?.details?.contract_type;
        if (type !== 'call' && type !== 'put') continue;
        const volume = row?.day?.volume;
        if (!nonnegative(volume)) return missing;
        observed = true;
        if (type === 'call') calls += volume;
        else puts += volume;
    }
    if (!observed) return missing;
    return { call: calls, put: puts, callPct: calls + puts > 0 ? Math.round(calls / (calls + puts) * 1000) / 10 : null };
}

/** The nearest live expiry supplies the weekly sample; later expiries cannot pad it. */
export function optionChainSampleReady(rows: readonly any[], oiPcr: unknown): boolean {
    const volumes = optionChainVolumes(rows);
    return optionSampleReady(volumes.call, volumes.put, oiPcr);
}

/** Preserve the existing OPI calculation, but never calculate a score from missing inputs. */
export function displayOpi(callVolume: unknown, putVolume: unknown, oiPcr: unknown): number | null {
    return optionSampleReady(callVolume, putVolume, oiPcr)
        ? Math.max(10, Math.min(95, Math.round(100 - (oiPcr as number) * 50))) : null;
}

export type OptionDirection = 'bullish' | 'bearish' | 'neutral';
/** Two directly observed opposing inputs invalidate a directional conclusion. */
export function optionConclusion(direction: OptionDirection, pcRatio: unknown, netPremium: unknown): OptionDirection {
    if (!nonnegative(pcRatio) || typeof netPremium !== 'number' || !Number.isFinite(netPremium)) return direction;
    if (direction === 'bullish' && pcRatio > 1 && netPremium < 0) return 'neutral';
    if (direction === 'bearish' && pcRatio < 1 && netPremium > 0) return 'neutral';
    return direction;
}

/** Standard monthly = third Friday, moved to the preceding session on a holiday. */
export function optionExpiryKind(expiration: unknown): 'monthly' | 'weekly' | null {
    if (typeof expiration !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expiration)) return null;
    const [year, month, day] = expiration.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.toISOString().slice(0, 10) !== expiration) return null;
    const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const thirdFriday = 1 + (5 - firstDow + 7) % 7 + 14;
    const nominal = `${expiration.slice(0, 7)}-${thirdFriday}`;
    const monthly = isNonTradingDay(nominal) ? prevTradingDate(nominal) : nominal;
    return expiration === monthly ? 'monthly' : 'weekly';
}

/** Read bid/ask themselves: a stale or absent supplied spread must not bypass the gate. */
export function displayQuote(quote: { bid?: unknown; ask?: unknown } | null | undefined, session: string) {
    const bid = quote?.bid, ask = quote?.ask;
    if (!nonnegative(bid) || bid === 0 || !nonnegative(ask) || ask < bid) return null;
    const spreadPct = (ask - bid) / ((ask + bid) / 2) * 100;
    if (session.toUpperCase() !== 'REG' && spreadPct > 5) return null;
    return { bid, ask, spreadPct };
}
