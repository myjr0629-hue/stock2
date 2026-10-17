/** Daily changes are percentage points: -1.76 means -1.76%, not -0.0176. */
export interface MarketRiskInputs {
  futuresAvg?: number | null;
  cashAvg?: number | null;
  breadthPct?: number | null;
  fearGreed?: number | null;
  vixChangePct?: number | null;
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bounded(value: number, cap: number): number {
  return Math.max(-cap, Math.min(cap, value));
}

/**
 * Market-state score; missing inputs contribute zero around the neutral 50.
 * Keep the original sensitivities, but cap each factor's contribution so one
 * daily move cannot dominate. VIX increases cost at most 15 points; decreases
 * retain the original zero penalty (no additional risk-on reward).
 */
export function calculateMarketRiskScore(input: MarketRiskInputs): number {
  const score = 50
    + bounded(finiteOr(input.futuresAvg, 0) * 7, 15)
    + bounded(finiteOr(input.cashAvg, 0) * 4, 15)
    + bounded((finiteOr(input.breadthPct, 50) - 50) * 0.35, 15)
    + bounded((finiteOr(input.fearGreed, 50) - 50) * 0.25, 10)
    - Math.min(15, Math.max(0, finiteOr(input.vixChangePct, 0)) * 2.5);
  return Math.max(0, Math.min(100, score));
}
