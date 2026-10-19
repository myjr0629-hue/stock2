/** Source-only ATM chain contract. Null is missing; zero is an observation. */
export interface AtmContract {
    strike: number;
    type: 'call' | 'put';
    iv: number | null;
    gamma: number | null;
    oi: number | null;
    expiration?: string;
    sourceSessionDate?: string | null;
    observedAt?: string | null;
}

export interface AtmSnapshot {
    ticker: string;
    atmSlice: AtmContract[];
    /** Current quote (home/other consumers). Never the ATM basis of a historical chain. */
    underlyingPrice?: number | null;
    /** Close of the chain's own source session; ATM is resolved only against this. */
    atmBasisPrice?: number | null;
    atmBasisSessionDate?: string | null;
    sourceSessionDate?: string | null;
    session?: string;
    restored?: boolean;
    completeIVChain?: boolean;
}

export interface StrikeIV {
    strike: number;
    callIV: number | null;
    putIV: number | null;
    callOI: number | null;
    putOI: number | null;
    callGamma: number | null;
    putGamma: number | null;
    isATM: boolean;
}

export const sourceNumber = (x: unknown): number | null =>
    typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;

export function sourceDate(x: unknown): string | null {
    if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return null;
    const date = new Date(`${x}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === x ? x : null;
}

/** Provider timestamps only. Never substitute response/clock time for observation time. */
export function observationTime(x: unknown): { observedAt: string | null; sourceSessionDate: string | null } {
    let ms: number = NaN;
    if (typeof x === 'number' && Number.isFinite(x) && x > 0) {
        ms = x > 1e17 ? x / 1e6 : x > 1e14 ? x / 1e3 : x > 1e11 ? x : x * 1000;
    } else if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(x)) {
        ms = Date.parse(x);
    }
    const date = new Date(ms);
    if (!Number.isFinite(ms) || !Number.isFinite(date.getTime())) return { observedAt: null, sourceSessionDate: null };
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const part = (name: string) => parts.find(p => p.type === name)?.value;
    return { observedAt: date.toISOString(), sourceSessionDate: `${part('year')}-${part('month')}-${part('day')}` };
}

export function groupIVStrikes(contracts: AtmContract[], spot: number | null = null): StrikeIV[] {
    const groups = new Map<number, StrikeIV>();
    for (const c of contracts) {
        if (!c || sourceNumber(c.strike) === null || c.strike <= 0 || !['call', 'put'].includes(c.type)) continue;
        const row = groups.get(c.strike) ?? {
            strike: c.strike, callIV: null, putIV: null, callOI: null, putOI: null,
            callGamma: null, putGamma: null,
            isATM: spot !== null && spot > 0 && Math.abs(c.strike - spot) <= spot * 0.015,
        };
        // IV comes in decimal units. Do not invent the missing opposite side.
        const iv = sourceNumber(c.iv);
        // A missing duplicate must not erase an already observed IV contract.
        if (iv === null && row[c.type === 'call' ? 'callIV' : 'putIV'] !== null) continue;
        row[c.type === 'call' ? 'callIV' : 'putIV'] = iv === null ? null : iv * 100;
        row[c.type === 'call' ? 'callOI' : 'putOI'] = sourceNumber(c.oi);
        row[c.type === 'call' ? 'callGamma' : 'putGamma'] = sourceNumber(c.gamma);
        groups.set(c.strike, row);
    }
    return [...groups.values()].sort((a, b) => a.strike - b.strike)
        .filter(d => d.callIV !== null || d.putIV !== null);
}

/** Most frequent valid date (ties: latest). A missing/corrupt row cannot decide it. */
export function dominantDate(values: unknown[]): string | null {
    const counts = new Map<string, number>();
    for (const v of values) { const d = sourceDate(v); if (d) counts.set(d, (counts.get(d) ?? 0) + 1); }
    let best: string | null = null, n = 0;
    for (const [d, c] of counts) if (c > n || (c === n && best !== null && d > best)) { best = d; n = c; }
    return best;
}

/**
 * Row-level dating: one observed date and expiry per snapshot (receipt time/expiry is not a
 * source date). Rows without that date/expiry or with an invalid strike/type are excluded
 * individually; every remaining valid row is kept. Excluding any row marks the chain incomplete.
 */
export function datedSnapshot(snapshot: AtmSnapshot | null | undefined, ticker: string): AtmSnapshot | null {
    if (!snapshot || snapshot.ticker !== ticker || !Array.isArray(snapshot.atmSlice)) return null;
    const rows = snapshot.atmSlice;
    const date = sourceDate(snapshot.sourceSessionDate) ?? dominantDate(rows.map(c => c?.sourceSessionDate));
    const expiry = dominantDate(rows.map(c => c?.expiration));
    if (!date || !expiry) return null;
    const kept = rows.filter(c => !!c && sourceNumber(c.strike) !== null && c.strike > 0 &&
        (c.type === 'call' || c.type === 'put') && sourceDate(c.sourceSessionDate) === date && c.expiration === expiry);
    if (!kept.length) return null;
    return { ...snapshot, sourceSessionDate: date, atmSlice: kept,
        ...(kept.length < rows.length ? { completeIVChain: false } : {}) };
}

export function isNormalIVSnapshot(snapshot: AtmSnapshot | null | undefined): snapshot is AtmSnapshot {
    if (!snapshot || snapshot.completeIVChain === false) return false;
    // Judge every original row: a dropped (undated/other-date/other-expiry) row, a missing IV,
    // or a strike that grouping would discard means the chain is partial and cannot become last-good.
    const dated = datedSnapshot(snapshot, snapshot.ticker);
    if (!dated || dated.atmSlice.length !== snapshot.atmSlice.length) return false;
    if (snapshot.atmSlice.some(c => sourceNumber(c.iv) === null)) return false;
    const rows = groupIVStrikes(snapshot.atmSlice);
    return rows.length >= 2 && rows.every(d => d.callIV !== null && d.putIV !== null);
}

/** Whole-snapshot recovery: no merging fields, strikes, expiries, tickers or dates. */
export function selectIVSnapshot(current: AtmSnapshot | null | undefined, previous: AtmSnapshot | null | undefined, ticker: string): AtmSnapshot | null {
    const fresh = datedSnapshot(current, ticker);
    const old = datedSnapshot(previous, ticker);
    const usable = fresh && groupIVStrikes(fresh.atmSlice).length > 0;
    const oldNormal = !!old && isNormalIVSnapshot(old);
    // A newer session wins even if partial (its valid rows are shown). For the same session a
    // complete chain beats a partial one: the partial response cannot shrink what is displayed.
    if (usable && (!oldNormal || fresh.sourceSessionDate! > old!.sourceSessionDate! ||
        (fresh.sourceSessionDate === old!.sourceSessionDate && isNormalIVSnapshot(fresh)))) return fresh;
    if (oldNormal) return { ...old!, restored: true };
    return usable ? fresh : null;
}

export function summarizeIV(data: StrikeIV[]) {
    const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    const calls = data.flatMap(d => d.callIV === null ? [] : [d.callIV]);
    const puts = data.flatMap(d => d.putIV === null ? [] : [d.putIV]);
    const pairs = data.filter(d => d.callIV !== null && d.putIV !== null);
    const spread = mean(pairs.map(d => d.putIV! - d.callIV!));
    const skewDir = spread === null ? null : spread > 2 ? 'PUT RICH' as const : spread < -2 ? 'CALL RICH' as const : 'BALANCED' as const;
    let fearStrike: StrikeIV | null = null, targetStrike: StrikeIV | null = null, crossover: StrikeIV | null = null;
    const atm = data.findIndex(d => d.isATM);
    let fearSlope = 2.5, targetSlope = 1.5;
    for (let i = 1; i < data.length; i++) {
        const a = data[i - 1], b = data[i];
        if (i < atm && a.putIV !== null && b.putIV !== null && a.putIV - b.putIV > fearSlope) {
            fearSlope = a.putIV - b.putIV; fearStrike = a;
        }
        if (atm >= 0 && i > atm + 1 && a.callIV !== null && b.callIV !== null && b.callIV - a.callIV > targetSlope) {
            targetSlope = b.callIV - a.callIV; targetStrike = b;
        }
        if (!crossover && a.callIV !== null && a.putIV !== null && b.callIV !== null && b.putIV !== null) {
            const prev = a.putIV - a.callIV, next = b.putIV - b.callIV;
            if (prev * next < 0) crossover = Math.abs(next) < Math.abs(prev) ? b : a;
        }
    }
    return { strikeData: data, avgCallIV: mean(calls), avgPutIV: mean(puts), avgDelta: spread, skewDir,
        maxIV: calls.length + puts.length ? Math.max(...calls, ...puts) : null, fearStrike, targetStrike, crossover };
}

export const ivText = (x: number | null) => x === null ? '—' : `${x.toFixed(1)}%`;
export const deltaText = (x: number | null) => x === null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`;
