/** Compatibility entry point; arithmetic lives in the pure metric module. */
import { displayLevels, gammaFlipTypeOf, levelsFromStructure } from '../lib/optionLevelGate';
import { computeVolatilityRegime } from '../lib/metrics/volatilityRegime';
export { computeVolatilityRegime };
export type { RegimeInputs, VolatilityRegimeResult } from '../lib/metrics/volatilityRegime';

/** Both APIs gate the same structure edition BEFORE scoring. No cross-source enrichment. */
export function computeStructureVolatilityRegime(structure: any, nowMs: number) {
    const price = structure?.underlyingPrice ?? null;
    const lv = levelsFromStructure(structure);
    const d = displayLevels(lv, price, 'volatility-regime', nowMs);
    return computeVolatilityRegime({
        // 관문 10200719 ②: 같은 레벨 한 벌의 플립 판정(ALL_LONG/ALL_SHORT = 범위 밖도 유효 입력)을 두 API 에도 넘긴다.
        netGex: structure?.netGex, gammaFlipLevel: d.gammaFlipLevel, gammaFlipType: gammaFlipTypeOf(lv, d, price), underlyingPrice: price,
        squeezeScore: structure?.squeezeScore, atmIv: structure?.atmIv,
        gammaConcentration: structure?.gammaConcentration, gammaConcentrationLabel: structure?.gammaConcentrationLabel,
    });
}
