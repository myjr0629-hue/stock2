import { finite, metric, nonnegative, positive } from './contract';
/** Price and reference close must be the SAME session pair; do not infer close from a rounded percentage. */
export function portfolioPnl(input: { currentPriceUsd?: number | null; referenceCloseUsd?: number | null;
    averageCostUsd?: number | null; quantity?: number | null }) {
    const source = { ...input };
    const quantityValid = nonnegative(input.quantity);
    const priceValid = positive(input.currentPriceUsd);
    const today = metric({ id: 'portfolio_today_pnl/v1', kind: 'derived', unit: 'USD', basis: 'session_price_minus_reference_close_times_quantity',
        period: 'one_valuation_session', denominator: 'none' }, source,
    { currentPriceUsd: priceValid, referenceCloseUsd: positive(input.referenceCloseUsd), quantity: quantityValid },
    () => (input.currentPriceUsd! - input.referenceCloseUsd!) * input.quantity!);
    const total = metric({ id: 'portfolio_total_pnl/v1', kind: 'derived', unit: 'USD', basis: 'current_value_minus_cost_basis',
        period: 'holding_period', denominator: 'none' }, source,
    { currentPriceUsd: priceValid, averageCostUsd: nonnegative(input.averageCostUsd), quantity: quantityValid },
    () => (input.currentPriceUsd! - input.averageCostUsd!) * input.quantity!);
    const totalPct = metric({ id: 'portfolio_total_return/v1', kind: 'derived', unit: 'percent', basis: 'total_pnl_over_cost_basis',
        period: 'holding_period', denominator: 'cost_basis_USD' }, source,
    { total: finite(total.value), costBasis: positive(input.averageCostUsd) && positive(input.quantity) },
    () => total.value! / (input.averageCostUsd! * input.quantity!) * 100);
    return { today, total, totalPct };
}
