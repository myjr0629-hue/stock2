import { metric, nonnegative, positive } from './contract';
/** Existing EOD definition: positive contract increase × contract multiplier × STRIKE. Not option premium. */
export function optionNotional(input: { openingContracts?: number | null; strikePriceUsd?: number | null; contractMultiplier?: number | null }) {
    return metric({ id: 'option_notional/v1', kind: 'derived', unit: 'USD_notional', basis: 'opening_OI_times_strike',
        period: 'one_EOD_OI_change', denominator: 'none' }, input,
    { openingContracts: nonnegative(input.openingContracts) && Number.isInteger(input.openingContracts), strikePriceUsd: positive(input.strikePriceUsd),
        contractMultiplier: positive(input.contractMultiplier) },
    () => input.openingContracts! * input.strikePriceUsd! * input.contractMultiplier!);
}
