import { metric, nonnegative, positive } from './contract';
/** Zero/missing OI cannot be replaced with one contract. */
export function uoa(input: { volumeContracts?: number | null; openInterestContracts?: number | null }) {
    return metric({ id: 'uoa/v1', kind: 'derived', unit: 'multiple', basis: 'contract_volume_over_open_interest',
        period: 'one_source_session_same_contract', denominator: 'open_interest_contracts' }, input,
    { volumeContracts: nonnegative(input.volumeContracts), openInterestContracts: positive(input.openInterestContracts) },
    () => input.volumeContracts! / input.openInterestContracts!);
}
