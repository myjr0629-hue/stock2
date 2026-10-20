import { clamp, finite, metric, nonnegative, percent, positive } from './contract';
export type SqueezeRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
export const squeezeRiskOf = (score: number | null): SqueezeRisk | null => score === null ? null
    : score >= 70 ? 'EXTREME' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';
export interface SqueezeInputs {
    netGex?: number | null;
    gammaConcentration?: number | null;
    nearestDte?: number | null;
    atmIvPct?: number | null;
    weeklyOiPutCallRatio?: number | null;
}
/** Structure's existing gamma squeeze model. A score, never an observed probability.
 * Inputs must belong to the same weekly chain edition; extraction must preserve missing fields. */
export function squeeze(input: SqueezeInputs) {
    return metric({ id: 'gamma_squeeze/v1', kind: 'score', unit: 'score_0_100', basis: 'weekly_chain_structure',
        period: 'nearest_weekly_expiry', denominator: '100_score_points' }, { ...input },
    { netGex: finite(input.netGex), gammaConcentration: percent(input.gammaConcentration),
        nearestDte: nonnegative(input.nearestDte) && Number.isInteger(input.nearestDte),
        atmIvPct: positive(input.atmIvPct) && input.atmIvPct < 1000, weeklyOiPutCallRatio: nonnegative(input.weeklyOiPutCallRatio) }, () => {
        const { netGex: g, gammaConcentration: c, nearestDte: d, atmIvPct: iv, weeklyOiPutCallRatio: pc } = input as Required<SqueezeInputs>;
        let score = g! < 0 ? Math.min(35, Math.round(Math.abs(g!) / 10_000_000))
            : Math.min(10, Math.round(g! / 100_000_000));
        score += c! >= 70 ? 20 : c! >= 50 ? 15 : c! >= 30 ? 8 : 0;
        score += d === 0 ? 20 : d === 1 ? 15 : d! <= 3 ? 10 : d! <= 5 ? 5 : 0;
        score += iv! >= 60 ? 15 : iv! >= 45 ? 10 : iv! >= 30 ? 5 : 0;
        score += pc! <= .4 || pc! >= 1.8 ? 10 : pc! <= .6 || pc! >= 1.5 ? 5 : 0;
        return clamp(score, 0, 100);
    });
}
