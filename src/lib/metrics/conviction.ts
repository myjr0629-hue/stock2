import { clamp, finite, metric, nonnegative } from './contract';
/** Existing CMD directional conviction model; its neutral baseline requires five measured inputs. */
export function conviction(input: { smaCross?: string | null; vwapDistancePct?: number | null;
    oiPutCallRatio?: number | null; netGex?: number | null; netPremiumUsd?: number | null }) {
    return metric({ id: 'conviction/v1', kind: 'score', unit: 'score_0_100', basis: 'directional_alignment',
        period: 'same_source_session', denominator: '100_score_points' }, input,
    { smaCross: ['GOLDEN', 'DEAD', 'NEUTRAL'].includes(input.smaCross ?? ''), vwapDistancePct: finite(input.vwapDistancePct),
        oiPutCallRatio: nonnegative(input.oiPutCallRatio), netGex: finite(input.netGex), netPremiumUsd: finite(input.netPremiumUsd) }, () => {
        let score = 50;
        score += input.smaCross === 'GOLDEN' ? 15 : input.smaCross === 'DEAD' ? -15 : 0;
        score += input.vwapDistancePct! > 1 ? 8 : input.vwapDistancePct! < -1 ? -8 : 0;
        score += input.oiPutCallRatio! < .7 ? 7 : input.oiPutCallRatio! > 1.2 ? -7 : 0;
        score += input.netGex! > 0 ? 5 : input.netGex! < 0 ? -5 : 0;
        score += input.netPremiumUsd! > 500_000 ? 5 : input.netPremiumUsd! < -500_000 ? -5 : 0;
        return clamp(score, 0, 100);
    });
}
