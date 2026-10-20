import { clamp, metric, nonnegative } from './contract';

/** OPI uses put OI / call OI over ALL expiries within 35 calendar days. Not volume PCR. */
export function opi(input: { oiPutCallRatio?: number | null; basis?: string | null }) {
    return metric({ id: 'opi/v1', kind: 'score', unit: 'score_0_100', basis: 'oi_all_expiries_35d',
        period: '35_calendar_days_expiry_scope', denominator: 'call_open_interest_contracts' }, input,
    { oiPutCallRatio: nonnegative(input.oiPutCallRatio), basis: input.basis === 'oi_all_expiries_35d' },
    () => clamp(Math.round(100 - input.oiPutCallRatio! * 50), 10, 95));
}
