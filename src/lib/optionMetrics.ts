/** Display option metrics: structure:v2 GEX/squeeze + 35-day all-expiry OI put/call.
 * Never fill a missing measurement from analysis or a different expiry scope.
 */
import { oiPcrAllExpiries, isFreshOptionsRow } from './app/intelOptionsBasis';
export type OptionMetrics = ReturnType<typeof optionMetrics>;
const finite = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
export function optionMetrics(structure: any, oiRow: any, now = Date.now()) {
    const gex = finite(structure?.netGex);
    const score = finite(structure?.squeezeScore);
    const timestamp = Number(oiRow?.timestamp);
    const pcr = oiPcrAllExpiries(isFreshOptionsRow(timestamp, now) ? oiRow : null);
    return {
        gex, netGex: gex, gexM: gex === null ? null : gex / 1e6,
        gammaRegime: gex === null ? null : gex > 0 ? 'LONG' : gex < 0 ? 'SHORT' : 'NEUTRAL',
        squeezeScore: score,
        squeezeRisk: score === null ? null : structure?.squeezeRisk ?? null,
        pcr,
        optionsAsOf: pcr === null ? null : timestamp,
        pcrBasis: 'oi_all_expiries_35d', gexBasis: 'structure_v2',
    };
}
/** Short-interest cards use CRITICAL; structure/volatility cards use EXTREME. */
export function shortSqueezeStatus(risk: string | null | undefined): string | null {
    return risk === 'EXTREME' ? 'CRITICAL' : risk ?? null;
}
export function applyOptionMetrics(target: any, metrics?: OptionMetrics | null) {
    if (target && typeof target === 'object') Object.assign(target, metrics ?? optionMetrics(null, null));
    return target;
}
export function applyUnifiedOptionMetrics(data: any, metrics?: OptionMetrics | null) {
    if (!data || typeof data !== 'object') return data;
    const m = metrics ?? optionMetrics(null, null);
    if (data.structure) Object.assign(data.structure, {
        netGex: m.gex, gex: m.gex, gexM: m.gexM, pcr: m.pcr, pcRatio: m.pcr,
        gammaRegime: m.gammaRegime === 'LONG' ? 'LONG_GAMMA' : m.gammaRegime === 'SHORT' ? 'SHORT_GAMMA' : m.gammaRegime,
        squeezeScore: m.squeezeScore, squeezeRisk: m.squeezeRisk, pcrBasis: m.pcrBasis,
    });
    if (data.options) data.options.pcr = m.pcr;
    if (data.squeeze) Object.assign(data.squeeze, { riskScore: m.squeezeScore, status: shortSqueezeStatus(m.squeezeRisk) });
    if (data.volatility) Object.assign(data.volatility, {
        gex: m.gex, gexLabel: m.gammaRegime, gammaRegime: m.gammaRegime,
        pcr: m.pcr, squeezeScore: m.squeezeScore, squeezeRisk: m.squeezeRisk,
    });
    return data;
}
