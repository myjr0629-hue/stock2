import { finite, metric, percent, positive } from './contract';
import { squeezeRiskOf } from './squeeze';
import { flipDistance } from './percentile';
import { isFailedSection } from './observation';

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

/** Shared API, web, app and AI calculation. Missing flip is not zero distance and earns no proximity points. */
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
        units: { gex: 'USD_gamma', iv: 'percent', flipDistance: 'percent_of_spot_price', flipLevel: 'USD_per_share',
            underlyingPrice: 'USD_per_share', gammaConcentration: 'percent_of_weekly_open_interest', squeezeScore: 'score_0_100' },
    };
}
export type VolatilityRegimeResult = ReturnType<typeof computeVolatilityRegime>;

/** Resolve Command's legacy field names before using the same pure calculation.
 * Structure inputs (including explicit null) own the current edition. Only IV has
 * an explicit recovery path: atmIv is percent, legacy atmIV is decimal, iv is percent.
 * Never score a live display price against another edition's cached structure.
 *
 * Volatility card precedence (newest first): the card's own fields — later exit overlays
 * (latest structure:v2 option metrics, structure levels) rewrite these, including explicit
 * null for a missing measurement — then the cached `metric.inputs` of the last calculation.
 * Cached inputs are used only when the card field is absent, or when the card field is the
 * same observation rounded for display (gex/squeezeScore), so a stale cached input can never
 * replace a newer overlay value or revive a value the newer edition reports missing.
 */
export function computeUnifiedVolatilityRegime(data: { structure?: any; volatility?: any } | null | undefined) {
    // A failed/pending section is not an observation (shared rule 1): its 0/LOW placeholders never score.
    const s = isFailedSection(data?.structure) ? {} : data?.structure ?? {};
    const v = isFailedSection(data?.volatility) ? {} : data?.volatility ?? {};
    const inputs = v.metric?.inputs ?? {};
    const source = (key: string, legacy: string = key) => {
        if (s[key] !== undefined) return s[key];
        const card = v[legacy];
        const cached = inputs[key];
        if (card === undefined) return cached;
        if (finite(card) && finite(cached) && (cached === card || Math.round(cached) === card)) return cached;
        return card;
    };
    const validIv = (iv: unknown): iv is number => positive(iv) && iv < 1000;
    const decimalIv = positive(s.atmIV) ? s.atmIV * 100 : null;
    const iv = validIv(s.atmIv) ? s.atmIv : validIv(decimalIv) ? decimalIv : v.iv;
    return computeVolatilityRegime({
        netGex: source('netGex', 'gex'), gammaFlipLevel: source('gammaFlipLevel', 'flipLevel'),
        underlyingPrice: source('underlyingPrice'), squeezeScore: source('squeezeScore'), atmIv: iv,
        gammaConcentration: source('gammaConcentration'), gammaConcentrationLabel: source('gammaConcentrationLabel'),
    });
}
