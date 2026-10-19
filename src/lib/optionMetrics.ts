import { structureFields } from './defs/optionStructure';
/** Display option metrics: structure:v2 GEX/squeeze + 35-day all-expiry OI put/call.
 * Never fill a missing measurement from analysis or a different expiry scope.
 */
import { oiPcrAllExpiries, isFreshOptionsRow } from './app/intelOptionsBasis';
export type OptionMetrics = ReturnType<typeof optionMetrics>;
const finite = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
export function optionMetrics(structure: any, oiRow: any, now = Date.now()) {
    const fields = structureFields(structure);
    const timestamp = Number(oiRow?.timestamp);
    const pcr = oiPcrAllExpiries(isFreshOptionsRow(timestamp, now) ? oiRow : null);
    return {
        ...fields,
        pcr,
        optionsAsOf: pcr === null ? null : timestamp,
        pcrBasis: 'oi_all_expiries_35d',
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
/** The rest of the VOL REGIME inputs from the SAME structure:v2 edition as optionMetrics (gate 10191903 #1).
 * null = no usable edition. IV is percent (60 = 60%); a missing edition value stays null. */
export function optionRegimeInputs(structure: any) {
    if (!structure || typeof structure !== 'object') return null;
    const iv = finite(structure.atmIv);
    const concentration = finite(structure.gammaConcentration);
    const label = typeof structure.gammaConcentrationLabel === 'string' && structure.gammaConcentrationLabel.trim() ? structure.gammaConcentrationLabel : null;
    return {
        atmIv: iv !== null && iv > 0 && iv < 1000 ? iv : null,
        gammaConcentration: concentration !== null && concentration >= 0 && concentration <= 100 ? concentration : null,
        gammaConcentrationLabel: concentration !== null ? label : null,
    };
}
export type OptionRegimeInputs = ReturnType<typeof optionRegimeInputs>;
export function applyUnifiedOptionMetrics(data: any, metrics?: OptionMetrics | null, regime?: OptionRegimeInputs) {
    if (!data || typeof data !== 'object') return data;
    const m = metrics ?? optionMetrics(null, null);
    if (data.structure) Object.assign(data.structure, {
        netGex: m.gex, gex: m.gex, gexM: m.gexM, pcr: m.pcr, pcRatio: m.pcr,
        gammaRegime: m.gammaRegime === 'LONG' ? 'LONG_GAMMA' : m.gammaRegime === 'SHORT' ? 'SHORT_GAMMA' : m.gammaRegime,
        squeezeScore: m.squeezeScore, squeezeRisk: m.squeezeRisk, pcrBasis: m.pcrBasis,
        gexBasis: m.gexBasis, atmIv: m.atmIv, ivSkew: m.ivSkew, structureChainDate: m.structureChainDate, structureSessionDate: m.structureSessionDate,
    });
    if (data.options) data.options.pcr = m.pcr;
    if (data.squeeze) Object.assign(data.squeeze, shortSqueezeMetrics(data.squeeze, m));
    if (data.volatility) {
        Object.assign(data.volatility, {
            gex: m.gex, gexLabel: m.gammaRegime, gammaRegime: m.gammaRegime,
            pcr: m.pcr, squeezeScore: m.squeezeScore, squeezeRisk: m.squeezeRisk,
        });
        // The card's cached calculation inputs must describe the same (newer) observation.
        const inputs = data.volatility.metric?.inputs;
        if (inputs && typeof inputs === 'object') {
            data.volatility.metric = { ...data.volatility.metric, inputs: { ...inputs, netGex: m.gex, squeezeScore: m.squeezeScore } };
        }
    }
    // One edition owns every regime input: when the latest edition's GEX/squeeze are applied, its IV and
    // gamma concentration replace the cached ones too (a cached 20%/0% never scores against a newer GEX).
    // IV missing from the edition keeps the documented IV-only recovery value (recoverVolatilityIv).
    if (regime) {
        const conc = { gammaConcentration: regime.gammaConcentration, gammaConcentrationLabel: regime.gammaConcentrationLabel };
        const iv = regime.atmIv !== null ? { atmIv: regime.atmIv, atmIV: regime.atmIv / 100 } : {};
        if (data.structure) Object.assign(data.structure, conc, iv);
        if (data.volatility) {
            Object.assign(data.volatility, conc, regime.atmIv !== null ? { iv: regime.atmIv } : {});
            const inputs = data.volatility.metric?.inputs;
            if (inputs && typeof inputs === 'object') {
                data.volatility.metric = { ...data.volatility.metric, inputs: { ...inputs, gammaConcentration: regime.gammaConcentration,
                    ...(regime.atmIv !== null ? { atmIv: regime.atmIv } : {}) } };
            }
        }
    }
    return data;
}
