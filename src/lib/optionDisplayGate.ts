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

/**
 * A list that belongs to one recorded session (e.g. the public «new positions» board for 10/15) is judged
 * at that session, not at the reader's clock: contracts live during the session stay, so the table matches
 * the session totals. Without a valid, non-future session date it falls back to the live boundary.
 */
export function sessionOptionRows<T>(rows: readonly T[], sessionDate: unknown, nowMs = Date.now()): T[] {
    const date = validChainDate(sessionDate);
    if (!date || date > etDateOf(nowMs)) return activeOptionRows(rows, nowMs);
    // 12:00 UTC is before both regular and early ET closes, in either DST season.
    const expiredAtSession = optionExpiryJudge(Date.parse(`${date}T12:00:00Z`));
    return rows.filter(row => (row as any)?.expired !== true && !expiredAtSession(optionRowExpiry(row)));
}

/** Session (ET date) whose close the screen last saw: today after the close, else the previous session. */
function lastClosedSession(nowMs: number): string {
    const today = etDateOf(nowMs);
    return isNonTradingDay(today) || etMinutesOf(nowMs) < sessionCloseMinutes(today) ? prevTradingDate(today) : today;
}

function validChainDate(chainDate: unknown): string | null {
    return typeof chainDate === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(chainDate)
        && Number.isFinite(Date.parse(chainDate.slice(0, 10)))
        && new Date(chainDate.slice(0, 10)).toISOString().slice(0, 10) === chainDate.slice(0, 10)
        ? chainDate.slice(0, 10) : null;
}

const observedVolumeRow = (row: any) => Number.isFinite(row?.details?.strike_price)
    && (row?.details?.contract_type === 'call' || row?.details?.contract_type === 'put')
    && typeof row?.day?.volume === 'number' && Number.isFinite(row.day.volume) && row.day.volume >= 0;

/**
 * The real list of the session that just closed, tagged with its source date — never synthesized.
 * Only rows that were live during that session and only when the chain itself is dated that session.
 */
export function previousSessionOptionRows(rows: readonly any[], chainDate: unknown, nowMs = Date.now()): { rows: any[]; date: string | null } {
    const date = validChainDate(chainDate);
    if (!date || date !== lastClosedSession(nowMs)) return { rows: [], date: null };
    // At 12:00 UTC it is before both regular and early ET closes, in either DST season.
    const expiredAtSession = optionExpiryJudge(Date.parse(`${date}T12:00:00Z`));
    const historical = rows.filter(row => observedVolumeRow(row)
        && /^\d{4}-\d{2}-\d{2}$/.test(optionRowExpiry(row) ?? '') && !expiredAtSession(optionRowExpiry(row)));
    return { rows: historical, date: historical.length ? date : null };
}

/**
 * STRIKE history only: never feed expired session volumes back into live position/sample gates.
 * `date` is set only when the rows are the previous session's archive (the label then carries it).
 */
export function strikeVolumeSource(rows: readonly any[], chainDate: unknown, nowMs = Date.now()): { rows: any[]; date: string | null; archived: boolean } {
    const active = activeOptionRows(rows.filter(observedVolumeRow), nowMs);
    if (active.length) return { rows: active, date: null, archived: false };
    const archive = previousSessionOptionRows(rows, chainDate, nowMs);
    return { rows: archive.rows, date: archive.date, archived: archive.rows.length > 0 };
}

/** Rows of the nearest expiry only (the weekly sample), from rows already filtered to live contracts. */
export function nearestExpiryRows<T>(rows: readonly T[]): T[] {
    const expiries = rows.map(optionRowExpiry).filter((e): e is string => typeof e === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e)).sort();
    return expiries.length ? rows.filter(row => optionRowExpiry(row) === expiries[0]) : [];
}

/**
 * One view of the nearest-expiry chain for a screen that must keep its cards when the expiry filter empties it.
 * 1) live rows; 2) the previous session's real list (archived — display only, gates see nothing);
 * 3) the nearest live expiry from the all-expiry chain. Never synthesized.
 * `gateRows` is what sample / conclusion gates may read: live rows only.
 */
export function optionChainView(rawRows: readonly any[], allRows: readonly any[], chainDate: unknown, nowMs = Date.now()): { rows: any[]; gateRows: any[]; date: string | null; archived: boolean; fallback: boolean } {
    const active = activeOptionRows<any>(rawRows, nowMs);
    if (active.length || rawRows.length === 0) return { rows: active, gateRows: active, date: null, archived: false, fallback: false };
    const archive = previousSessionOptionRows(rawRows, chainDate, nowMs);
    if (archive.rows.length) return { rows: archive.rows, gateRows: [], date: archive.date, archived: true, fallback: true };
    // A substitute expiry is display only too: the response's net premium belongs to the original expiry,
    // so P/C and premium would come from different expiries — gates read nothing and show «—».
    const next = nearestExpiryRows(activeOptionRows<any>(allRows, nowMs));
    return { rows: next, gateRows: [], date: null, archived: false, fallback: next.length > 0 };
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

/**
 * App and web share this check. Inputs are whole same-expiry totals (optionChainVolumes), not a chart range.
 * P/C = put ÷ call; with call volume 0 (or volumes unknown) P/C is undefined, so no directional conclusion stands.
 */
export function optionConclusionFromVolumes(direction: OptionDirection, callVolume: unknown, putVolume: unknown, netPremium: unknown): OptionDirection {
    return optionConclusionCheck(direction, callVolume, putVolume, netPremium).direction;
}

/**
 * Gate for the conclusion cell and the AI request (app and web).
 * ok=false when P/C is undefined (call 0 or volumes unknown) — even for an originally neutral conclusion —
 * or when observed P/C and net premium both oppose the direction. Caller then shows the existing mixed state and blocks AI.
 */
export function optionConclusionCheck(direction: OptionDirection, callVolume: unknown, putVolume: unknown, netPremium: unknown): { direction: OptionDirection; ok: boolean } {
    if (!nonnegative(callVolume) || !nonnegative(putVolume) || callVolume === 0) return { direction: 'neutral', ok: false };
    const checked = optionConclusion(direction, putVolume / callVolume, netPremium);
    return { direction: checked, ok: checked === direction };
}

/** Read bid/ask themselves: a stale or absent supplied spread must not bypass the gate. */
export function displayQuote(quote: { bid?: unknown; ask?: unknown } | null | undefined, session: string) {
    const bid = quote?.bid, ask = quote?.ask;
    if (!nonnegative(bid) || bid === 0 || !nonnegative(ask) || ask < bid) return null;
    const spreadPct = (ask - bid) / ((ask + bid) / 2) * 100;
    if (session.toUpperCase() !== 'REG' && spreadPct > 5) return null;
    return { bid, ask, spreadPct };
}
