import { finite, metric, percent, positive } from './contract';
import { squeezeRiskOf } from './squeeze';
import { flipDistance } from './percentile';

export interface RegimeInputs {
    netGex?: number | null;
    gammaFlipLevel?: number | null;
    underlyingPrice?: number | null;
    squeezeScore?: number | null;
    squeezeRisk?: string | null;
    /** Percentage units: 60 means 60%, including IV above 100%. */
    atmIv?: number | null;
    gammaConcentration?: number | null;
    gammaConcentrationLabel?: string | null;
}
type Regime = 'CALM' | 'COILING' | 'LOADED' | 'ERUPTING';

/** Shared API calculation. Missing flip is not zero distance and earns no proximity points. */
export function computeVolatilityRegime(input: RegimeInputs) {
    const netGex = finite(input.netGex) ? input.netGex : null;
    const flip = positive(input.gammaFlipLevel) ? input.gammaFlipLevel : null;
    const price = positive(input.underlyingPrice) ? input.underlyingPrice : null;
    const sq = percent(input.squeezeScore) ? input.squeezeScore : null;
    const iv = positive(input.atmIv) && input.atmIv < 1000 ? input.atmIv : null;
    const concentration = percent(input.gammaConcentration) ? input.gammaConcentration : null;
    const distance = flipDistance({ priceUsd: price, flipLevelUsd: flip }).value;
    let rawScore: number | null = null;
    const scoreMetric = metric({ id: 'volatility_regime/v1', kind: 'score', unit: 'score_0_100',
        basis: 'weekly_chain_structure', period: 'same_structure_edition', denominator: '100_score_points' },
    { netGex, gammaFlipLevel: flip, underlyingPrice: price, squeezeScore: sq, atmIv: iv, gammaConcentration: concentration },
    { netGex: netGex !== null, gammaFlipLevel: flip !== null, underlyingPrice: price !== null,
        squeezeScore: sq !== null, atmIv: iv !== null, gammaConcentration: concentration !== null }, () => {
        let score = netGex! < 0 ? Math.max(0, Math.min(30, Math.log10(Math.max(1, Math.abs(netGex!) / 1e6)) * 10)) : 0;
        score += sq! / 4;
        score += iv! > 50 ? 20 : iv! > 35 ? 12 : iv! > 25 ? 6 : 0;
        const dist = Math.abs(distance!);
        score += dist < 1 ? 15 : dist < 3 ? 10 : dist < 5 ? 5 : 0;
        score += concentration! >= 70 ? 10 : concentration! >= 50 ? 6 : concentration! >= 30 ? 3 : 0;
        rawScore = Math.min(100, score);
        return Math.round(rawScore);
    });
    const score = scoreMetric.value;
    const regime: Regime | null = score === null ? null : rawScore! >= 75 ? 'ERUPTING' : rawScore! >= 50 ? 'LOADED' : rawScore! >= 25 ? 'COILING' : 'CALM';
    return {
        regime, regimeScore: score, gex: netGex === null ? null : Math.round(netGex),
        gexLabel: netGex === null ? null : netGex < 0 ? 'SHORT' as const : 'LONG' as const,
        iv, flipDistance: distance === null ? null : Math.round(distance * 10) / 10,
        flipLevel: flip, isAboveFlip: distance === null ? null : distance > 0,
        squeezeScore: sq === null ? null : Math.round(sq), squeezeRisk: squeezeRiskOf(sq),
        gammaConcentration: concentration, gammaConcentrationLabel: concentration === null ? null : input.gammaConcentrationLabel ?? null,
        underlyingPrice: price, metric: scoreMetric,
        units: { gex: 'USD_gamma', iv: 'percent', flipDistance: 'percent_of_flip_level', flipLevel: 'USD_per_share',
            underlyingPrice: 'USD_per_share', gammaConcentration: 'percent_of_weekly_open_interest', squeezeScore: 'score_0_100' },
    };
}
export type VolatilityRegimeResult = ReturnType<typeof computeVolatilityRegime>;
