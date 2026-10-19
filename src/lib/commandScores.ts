import { normalizeVwap, vwapDistancePct } from './vwap';
import { computeUnifiedVolatilityRegime } from './metrics/volatilityRegime';
import { convictionInputsOf, scoreCommandConviction } from './commandConviction';

type ConvictionLabel = '—' | 'convStrong' | 'convBullish' | 'convSlightUp' | 'convNeutral'
    | 'convSlightDown' | 'convBearish' | 'convStrongDown';

/** Command screen and AI scores — an adapter only. Arithmetic lives in the shared definitions:
 *  volatility regime = lib/metrics/volatilityRegime (spot-denominator flip via lib/gammaFlipDistance),
 *  conviction = lib/commandConviction (N4 observation gate, netPremiumOf). No second formula here. */
export function commandScores(data: any) {
    const q = data || {};
    const structure = q.unified?.structure || {};
    const sma = q.unified?.sma || {};
    const finite = (value: unknown): number | null =>
        typeof value === 'number' && Number.isFinite(value) ? value : null;
    const positive = (value: unknown): number | null => {
        const n = finite(value);
        return n !== null && n > 0 ? n : null;
    };
    const regime = computeUnifiedVolatilityRegime(q.volatilityData !== undefined ? q.volatilityData : q.unified);
    const priceVal = positive(q.price);
    const vwapVal = normalizeVwap(data?.vwap);
    const vwapDiff = vwapDistancePct(priceVal, vwapVal);
    const conviction = scoreCommandConviction(convictionInputsOf({
        cross: sma.cross, price: priceVal, vwap: vwapVal,
        pcr: structure.pcRatio, gex: structure.netGex, flow: q.rawTickerData?.flow,
    }));
    return {
        netGex: finite(structure.netGex), fLevel: regime.flipLevel, fDist: regime.flipDistance,
        rs: regime.regimeScore, rg: regime.regime, vwapVal, vwapDiff,
        cScore: conviction?.score ?? null, cGrade: conviction?.grade ?? null,
        cLabel: (conviction?.labelKey ?? '—') as ConvictionLabel,
    };
}
