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
/** Structure wins when available. Otherwise derive SI risk from measurements,
 * never from a cached score/status or an absent measurement treated as zero.
 */
export function shortSqueezeMetrics(squeeze: any, metrics?: OptionMetrics | null) {
    if (metrics?.squeezeScore != null && metrics.squeezeRisk != null) {
        return { riskScore: metrics.squeezeScore, status: shortSqueezeStatus(metrics.squeezeRisk) };
    }
    const missing = { riskScore: null, status: null };
    if (squeeze?.unavailable) return missing;
    const si = finite(squeeze?.siPercent), dtc = finite(squeeze?.daysToCover);
    const change = finite(squeeze?.siChange), volume = finite(squeeze?.shortVolPercent);
    if ([si, dtc, change, volume].every(v => v === null)) return missing;
    // Preserve the existing FINRA card's SI/DTC/change/short-volume weights.
    let score = si === null ? 0 : si >= 20 ? 40 : si >= 10 ? 25 : si >= 5 ? 10 : 0;
    score += dtc === null ? 0 : dtc >= 5 ? 25 : dtc >= 3 ? 15 : dtc >= 2 ? 8 : 0;
    score += change === null ? 0 : change > 5 ? 15 : change > 0 ? 8 : 0;
    score += volume === null ? 0 : volume >= 50 ? 20 : volume >= 40 ? 10 : volume >= 30 ? 5 : 0;
    const riskScore = Math.min(100, score);
    const status = riskScore >= 70 ? 'CRITICAL' : riskScore >= 45 ? 'HIGH' : riskScore >= 20 ? 'MEDIUM' : 'LOW';
    return { riskScore, status };
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
    if (data.squeeze) Object.assign(data.squeeze, shortSqueezeMetrics(data.squeeze, m));
    if (data.volatility) Object.assign(data.volatility, {
        gex: m.gex, gexLabel: m.gammaRegime, gammaRegime: m.gammaRegime,
        pcr: m.pcr, squeezeScore: m.squeezeScore, squeezeRisk: m.squeezeRisk,
    });
    return data;
}
