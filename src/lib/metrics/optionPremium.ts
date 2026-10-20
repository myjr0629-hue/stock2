import { metric, nonnegative } from './contract';
/** Weekly volume × option closing price × 100 aggregation; not signed buyer/seller flow. */
export function optionPremium(input: { callPremiumUsd?: number | null; putPremiumUsd?: number | null }) {
    return metric({ id: 'option_premium/v1', kind: 'estimate', unit: 'USD_premium', basis: 'weekly_volume_times_close_times_100',
        period: 'one_source_session_weekly_expiry', denominator: 'call_plus_put_premium_USD' }, input,
    { callPremiumUsd: nonnegative(input.callPremiumUsd), putPremiumUsd: nonnegative(input.putPremiumUsd) }, () => {
        const call = input.callPremiumUsd!, put = input.putPremiumUsd!;
        const total = call + put;
        if (!Number.isFinite(total)) return null;
        return { netUsd: call - put, totalUsd: total, callSharePct: total > 0 ? call / total * 100 : null,
            callShareUnit: 'percent', callShareDenominator: 'call_plus_put_premium_USD' };
    });
}
