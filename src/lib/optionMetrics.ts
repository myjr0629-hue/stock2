/** Display option metrics: structure:v2 GEX/squeeze + 35-day all-expiry OI put/call.
 * Never fill a missing measurement from analysis or a different expiry scope.
 */
import { oiPcrAllExpiries, isFreshOptionsRow, optionsSessionDate } from './app/intelOptionsBasis';
import { asSessionDate } from './sourceStamp';
/** 'YYYY-MM-DD' 세션 → 그날 안의 한 시각(ms, 16:00Z = ET 11~12시) — 세션 날짜만 실어 나르는 용도(etTradingDateOf 가 그 날을 돌려준다) */
const sessionDayMs = (d: string): number => Date.parse(`${d}T16:00:00Z`);
export type OptionMetrics = ReturnType<typeof optionMetrics>;
const finite = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
export function optionMetrics(structure: any, oiRow: any, now = Date.now()) {
    const gex = finite(structure?.netGex);
    const score = finite(structure?.squeezeScore);
    const timestamp = Number(oiRow?.timestamp);
    const pcr = oiPcrAllExpiries(isFreshOptionsRow(timestamp, now) ? oiRow : null);
    // ★ [2026-10-19 묶음 4 · 밤 검토 3] GEX(구조 캐시 체인 날짜)와 P/C(수집 OI 행 시각)는 원천 날짜가 다르다 — 각자의 날짜를 따로 싣고,
    //   공용 «M/D 마감 기준»(optionsAsOf)은 둘 중 «앞 날짜»로 말한다(10/15 GEX 에 10/16 OI 행 날짜가 붙어 «10/16 마감 기준»으로 보였다).
    const gexSessionDate = gex === null ? null : asSessionDate(structure?.chainDate);
    const pcrSessionDate = pcr === null ? null : optionsSessionDate(timestamp);
    const gexAsOf = gexSessionDate ? sessionDayMs(gexSessionDate) : null;
    const pcrAsOf = pcr === null ? null : timestamp;
    const mixed = !!(gexSessionDate && pcrSessionDate && gexSessionDate !== pcrSessionDate);
    const optionsAsOf = pcrAsOf != null && gexAsOf != null
        ? (mixed ? (gexSessionDate! < pcrSessionDate! ? gexAsOf : pcrAsOf) : pcrAsOf)
        : (pcrAsOf ?? gexAsOf);
    return {
        gex, netGex: gex, gexM: gex === null ? null : gex / 1e6,
        gammaRegime: gex === null ? null : gex > 0 ? 'LONG' : gex < 0 ? 'SHORT' : 'NEUTRAL',
        squeezeScore: score,
        squeezeRisk: score === null ? null : structure?.squeezeRisk ?? null,
        pcr,
        optionsAsOf,
        gexSessionDate, pcrSessionDate, optionsAsOfMixed: mixed,
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
