import { finite, metric, positive } from './contract';
/** Inclusive empirical rank of a current observation against prior observations only. */
export function percentile(input: { current?: number | null; history: readonly number[]; minimumSamples: number; period: string; basis: string }) {
    const historyValid = input.history.every(finite);
    const enough = historyValid && Number.isInteger(input.minimumSamples) && input.minimumSamples > 0
        && input.history.length >= input.minimumSamples;
    return metric({ id: 'empirical_percentile/v1', kind: 'derived', unit: 'percentile_0_100', basis: input.basis,
        period: input.period, denominator: 'prior_valid_observation_count' }, { ...input, history: [...input.history] },
    { current: finite(input.current), history: enough },
    () => Math.round(input.history.filter(v => v <= input.current!).length / input.history.length * 100));
}

export function flipDistance(input: { priceUsd?: number | null; flipLevelUsd?: number | null }) {
    return metric({ id: 'flip_distance/v1', kind: 'derived', unit: 'percent', basis: 'price_minus_flip_over_flip',
        period: 'same_structure_edition', denominator: 'gamma_flip_level_USD' }, input,
    { priceUsd: positive(input.priceUsd), flipLevelUsd: positive(input.flipLevelUsd) },
    () => (input.priceUsd! - input.flipLevelUsd!) / input.flipLevelUsd! * 100);
}
