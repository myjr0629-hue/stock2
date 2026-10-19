/**
 * One input-selection rule for every door (unified API, web, app, AI snapshot).
 *
 *   1. A failed poll (error object, success:false, `_source: unavailable*`, no body) is NOT an observation.
 *   2. Between two observations, the one whose SOURCE time is newer wins. An older edition
 *      arriving late (cache, CDN) never replaces a newer one. Response `_ts`/`timestamp` are
 *      not source times — the API refreshes them without new inputs.
 *   3. A newer observation that is missing (metric null) keeps the previous REAL value together
 *      with that value's own source date (`carried: true`; the date is null only when the source
 *      never gave one — a date is never invented). A missing value never lends its date to anything.
 *   4. A measured 0 is a value, not a missing input (callers judge with finite checks, never truthiness).
 */
export interface SourceObservation {
    sourceAsOf: string | null;
    carried?: boolean;
}

/** Normalize a source time. Date-only strings keep day precision (never invent an intraday time). */
export function observationTime(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    if (value === '' || (typeof value === 'number' && (!Number.isFinite(value) || value <= 0))) return null;
    const time = new Date(value);
    if (!Number.isFinite(time.getTime())) return null;
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : time.toISOString();
}

/** >0: a is newer, <0: a is older, 0: same or not orderable at the shared precision, null: a time is unknown. */
export function compareSourceTime(a: string | null, b: string | null): number | null {
    if (!a || !b) return null;
    if (a.length === 10 || b.length === 10) {
        // Day precision on either side: only the calendar day can be ordered.
        const da = a.slice(0, 10), db = b.slice(0, 10);
        return da === db ? 0 : da > db ? 1 : -1;
    }
    return Math.sign(Date.parse(a) - Date.parse(b));
}

/** Apply rules 2–3. `incoming === null` means rule 1 already rejected the poll. */
export function selectObservation<T extends SourceObservation>(
    previous: T | null,
    incoming: T | null,
    hasValue: (observation: T) => boolean,
): T | null {
    const keep = (o: T): T => (o.carried ? o : { ...o, carried: true });
    if (!incoming) return previous ? keep(previous) : null;
    if (!previous) return incoming;
    const order = compareSourceTime(incoming.sourceAsOf, previous.sourceAsOf);
    if (order !== null && order < 0) return keep(previous);
    if (!hasValue(incoming) && hasValue(previous)) return keep(previous);
    return incoming;
}

/** Per-field form of the same rule, for inputs observed independently (e.g. Command conviction).
 * `incoming === undefined` = no observation this time (failed or not delivered);
 * `incoming.value === null` = observed missing. */
export interface DatedValue<T> {
    value: T | null;
    asOf: string | null;
}
export function selectValue<T>(previous: DatedValue<T> | null | undefined, incoming: DatedValue<T> | undefined): DatedValue<T> {
    const prev = previous && previous.value !== null ? previous : null;
    if (!incoming) return prev ?? { value: null, asOf: null };
    const picked = selectObservation(
        prev ? { sourceAsOf: prev.asOf, value: prev.value } : null,
        { sourceAsOf: incoming.value === null ? null : incoming.asOf, value: incoming.value },
        o => o.value !== null,
    );
    return { value: picked?.value ?? null, asOf: picked?.value == null ? null : picked.sourceAsOf };
}
