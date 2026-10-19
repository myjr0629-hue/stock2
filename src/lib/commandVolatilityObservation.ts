/** A failed poll carries no observation, including when the API returns HTTP 200. */
export function isCommandResponseUnavailable(data: any): boolean {
    return !data || data.error != null || data.success === false
        || (typeof data._source === 'string' && data._source.startsWith('unavailable'));
}

export interface CommandVolatilityObservation {
    ticker: string;
    data: { structure: any; volatility: any };
    sourceAsOf: string | null;
}

function sourceTime(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    if (value === '' || (typeof value === 'number' && (!Number.isFinite(value) || value <= 0))) return null;
    const time = new Date(value);
    if (!Number.isFinite(time.getTime())) return null;
    // A chain date has day precision; never invent an intraday observation time.
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : time.toISOString();
}

/** Keep structure and volatility from one edition. Explicit nulls in a successful
 * observation replace the previous edition; failed/irrelevant polls do not.
 * Never use response _asOf/timestamp or field _ts: the API refreshes those
 * without new inputs, including when rebuilding cards from DynamoDB snapshots.
 */
export function resolveCommandVolatilityObservation(
    ticker: string,
    incoming: any,
    previous: CommandVolatilityObservation | null = null,
): CommandVolatilityObservation | null {
    if (isCommandResponseUnavailable(incoming)
        || (incoming.structure === undefined && incoming.volatility === undefined)) {
        return previous?.ticker === ticker ? previous : null;
    }
    const structure = incoming.structure ?? null;
    const volatility = incoming.volatility ?? null;
    const sourceAsOf = [structure?.chainDate, structure?.asOf, structure?.levelsAsOf, volatility?.asOf]
        .map(sourceTime).find(time => time !== null) ?? null;
    return { ticker, data: { structure, volatility }, sourceAsOf };
}
