import { metric, nonnegative, percent } from './contract';
export interface AlphaHolding { alphaScore?: number | null; marketValue?: number | null }
/** Portfolio alpha = market-value-weighted mean, with complete positive exposure coverage.
 * This is aggregation of engine scores, not the individual V8/XS scoring engine. */
export function portfolioAlpha(holdings: readonly AlphaHolding[]) {
    const valid: Record<string, boolean> = { holdings: holdings.length > 0 };
    holdings.forEach((h, i) => {
        valid[`holdings[${i}].marketValue`] = nonnegative(h.marketValue);
        valid[`holdings[${i}].alphaScore`] = h.marketValue === 0 || percent(h.alphaScore);
    });
    return metric({ id: 'portfolio_alpha/v1', kind: 'score', unit: 'score_0_100', basis: 'market_value_weighted_alpha',
        period: 'same_valuation_snapshot', denominator: 'total_market_value_USD' },
    { holdings: holdings.map(h => ({ ...h })) }, valid, () => {
        const total = holdings.reduce((sum, h) => sum + h.marketValue!, 0);
        return total > 0 ? holdings.reduce((sum, h) => sum + (h.marketValue! > 0 ? h.alphaScore! * h.marketValue! : 0), 0) / total : null;
    });
}
