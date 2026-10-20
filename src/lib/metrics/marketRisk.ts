import { clamp, finite, metric, percent } from './contract';
export interface MarketRiskInputs {
    futuresAvg?: number | null;
    cashAvg?: number | null;
    breadthPct?: number | null;
    fearGreed?: number | null;
    vixChangePct?: number | null;
}
/** Preserve the existing capped weights; require all five measured inputs. Higher = risk-on. */
export function marketRisk(input: MarketRiskInputs) {
    return metric({ id: 'market_risk/v1', kind: 'score', unit: 'score_0_100',
        basis: 'futures_cash_breadth_fear_greed_vix', period: 'same_source_session', denominator: '100_score_points' },
    { ...input }, { futuresAvg: finite(input.futuresAvg), cashAvg: finite(input.cashAvg),
        breadthPct: percent(input.breadthPct), fearGreed: percent(input.fearGreed), vixChangePct: finite(input.vixChangePct) },
    () => clamp(50 + clamp(input.futuresAvg! * 7, -15, 15) + clamp(input.cashAvg! * 4, -15, 15)
        + clamp((input.breadthPct! - 50) * .35, -15, 15) + clamp((input.fearGreed! - 50) * .25, -10, 10)
        - Math.min(15, Math.max(0, input.vixChangePct!) * 2.5), 0, 100));
}
