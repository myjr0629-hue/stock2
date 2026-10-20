import { finite, metric } from './contract';
/** Signed equity dark-pool notional. Option call/put premium is a different metric and cannot fill it. */
export function whaleNetBet(input: { netBuyUsd?: number | null; basis?: string | null; sourceSessionDate?: string | null }) {
    return metric({ id: 'whale_net_bet/v1', kind: 'estimate', unit: 'USD_notional', basis: 'equity_dark_pool_signed_notional',
        period: input.sourceSessionDate ?? 'unknown', denominator: 'one_source_session' }, input,
    { netBuyUsd: finite(input.netBuyUsd), basis: input.basis === 'equity_dark_pool_signed_notional',
        sourceSessionDate: /^\d{4}-\d{2}-\d{2}$/.test(input.sourceSessionDate ?? '') }, () => input.netBuyUsd!);
}
