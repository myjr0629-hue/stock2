import { metric, nonnegative, percent, positive } from './contract';
/** Observed frequency requires actual numerator AND denominator, never a heuristic score. */
export function observedProbability(input: { successes?: number | null; trials?: number | null; period: string }) {
    return metric({ id: 'observed_probability/v1', kind: 'observed_probability', unit: 'percent', basis: 'observed_event_frequency',
        period: input.period, denominator: 'observed_trials' }, input,
    { successes: nonnegative(input.successes) && Number.isInteger(input.successes),
        trials: positive(input.trials) && Number.isInteger(input.trials) && input.successes! <= input.trials,
        period: input.period.trim().length > 0 }, () => input.successes! / input.trials! * 100);
}
/** Two probabilities in percent units: 60% - 50% = 10 percentage points. */
export function probabilityChange(input: { currentPct?: number | null; previousPct?: number | null; period: string }) {
    return metric({ id: 'probability_change/v1', kind: 'derived', unit: 'percentage_point', basis: 'same_event_probability_difference',
        period: input.period, denominator: '100_percent_per_observation' }, input,
    { currentPct: percent(input.currentPct), previousPct: percent(input.previousPct), period: input.period.trim().length > 0 },
    () => input.currentPct! - input.previousPct!);
}
