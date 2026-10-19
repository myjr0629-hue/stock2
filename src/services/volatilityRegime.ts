/** Compatibility entry point; arithmetic lives in the pure metric module. */
import { displayLevels, levelsFromStructure } from '../lib/optionLevelGate';
import { computeVolatilityRegime } from '../lib/metrics/volatilityRegime';
export { computeVolatilityRegime };
export type { RegimeInputs, VolatilityRegimeResult } from '../lib/metrics/volatilityRegime';

/** Both APIs gate the same structure edition BEFORE scoring. No cross-source enrichment. */
export function computeStructureVolatilityRegime(structure: any, nowMs: number) {
    const price = structure?.underlyingPrice ?? null;
    const flip = displayLevels(levelsFromStructure(structure), price, 'volatility-regime', nowMs).gammaFlipLevel;
    return computeVolatilityRegime({
        netGex: structure?.netGex, gammaFlipLevel: flip, underlyingPrice: price,
        squeezeScore: structure?.squeezeScore, atmIv: structure?.atmIv,
        gammaConcentration: structure?.gammaConcentration, gammaConcentrationLabel: structure?.gammaConcentrationLabel,
    });
}
