import { normalizeVwap, vwapDistancePct } from './vwap';
import { computeUnifiedVolatilityRegime } from './metrics/volatilityRegime';
import { commandConvictionRaw, convictionInputsOf, scoreCommandConviction } from './commandConviction';
import { isFailedSection } from './metrics/observation';

type ConvictionLabel = '—' | 'convStrong' | 'convBullish' | 'convSlightUp' | 'convNeutral'
    | 'convSlightDown' | 'convBearish' | 'convStrongDown';

/** Command screen and AI scores — an adapter only. Arithmetic lives in the shared definitions:
 *  volatility regime = lib/metrics/volatilityRegime (spot-denominator flip via lib/gammaFlipDistance),
 *  conviction = lib/commandConviction (N4 observation gate, netPremiumOf). No second formula here. */
export function commandScores(data: any) {
    const q = data || {};
    const structure = isFailedSection(q.unified?.structure) ? {} : q.unified?.structure || {};
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
    // A caller that keeps the shared input history (app/web card) passes its selected inputs,
    // so the AI's conviction is the card's conviction; otherwise this poll only, failed sections excluded.
    const conviction = scoreCommandConviction(q.convictionInputs
        ?? convictionInputsOf(commandConvictionRaw(q.unified, priceVal, vwapVal, q.rawTickerData?.flow).raw),
        q.convictionSourceDates ?? { vwap: q.rawTickerData?.vwapDate ?? q.vwapDate });
    return {
        netGex: finite(structure.netGex), fLevel: regime.flipLevel, fDist: regime.flipDistance,
        rs: regime.regimeScore, rg: regime.regime, vwapVal, vwapDiff,
        cScore: conviction?.score ?? null, cGrade: conviction?.grade ?? null,
        cLabel: (conviction?.labelKey ?? '—') as ConvictionLabel,
    };
}
