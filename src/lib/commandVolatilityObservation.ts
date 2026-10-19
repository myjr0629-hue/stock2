import { computeUnifiedVolatilityRegime } from '@/lib/metrics/volatilityRegime';
import { isFailedSection, observationTime, selectObservation, type SourceObservation } from '@/lib/metrics/observation';
/** A failed poll carries no observation, including when the API returns HTTP 200. */
export function isCommandResponseUnavailable(data: any): boolean {
    return !data || data.error != null || data.success === false
        || (typeof data._source === 'string' && data._source.startsWith('unavailable'));
}

export interface CommandVolatilityObservation extends SourceObservation {
    ticker: string;
    data: { structure: any; volatility: any };
}

/** Keep structure and volatility from one edition, chosen by the shared rule in
 * lib/metrics/observation.ts: failed polls are not observations, the newer source time
 * wins, and a missing score keeps the previous real edition with its own source date.
 * Never use response _asOf/timestamp or field _ts: the API refreshes those
 * without new inputs, including when rebuilding cards from DynamoDB snapshots.
 */
export function resolveCommandVolatilityObservation(
    ticker: string,
    incoming: any,
    previous: CommandVolatilityObservation | null = null,
): CommandVolatilityObservation | null {
    const prior = previous?.ticker === ticker ? previous : null;
    if (isCommandResponseUnavailable(incoming)
        || (incoming.structure === undefined && incoming.volatility === undefined)) {
        return selectObservation(prior, null, hasVolatilityScore);
    }
    const structure = incoming.structure ?? null;
    const volatility = incoming.volatility ?? null;
    // A failed/pending section is not an observation, so it cannot lend its date either (rule 1).
    const st = isFailedSection(structure) ? null : structure;
    const vo = isFailedSection(volatility) ? null : volatility;
    const sourceAsOf = [st?.chainDate, st?.asOf, st?.levelsAsOf, vo?.asOf]
        .map(observationTime).find(time => time !== null) ?? null;
    return selectObservation(prior, { ticker, data: { structure, volatility }, sourceAsOf, carried: false }, hasVolatilityScore);
}

function hasVolatilityScore(observation: CommandVolatilityObservation): boolean {
    return computeUnifiedVolatilityRegime(observation.data).regimeScore !== null;
}

/** Display form of a source time: date-only stays a date; instants show New York wall time. */
export function formatObservationTime(asOf: string): string {
    return asOf.length === 10 ? asOf
        : `${new Date(asOf).toLocaleString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })} ET`;
}
