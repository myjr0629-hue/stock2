/** Canonical structure:v2 projection. Historic harvest calculations are never fallbacks. */
import { finite } from './market';
export function structureSkew(chain: any[], price: number): number | null {
    if (!Array.isArray(chain) || !finite(price) || price <= 0) return null;
    const calls: number[] = [], puts: number[] = [];
    for (const c of chain) {
        const strike = c.details?.strike_price ?? c.strike_price;
        const iv = c.implied_volatility;
        const side = c.details?.contract_type ?? c.contract_type;
        if (!finite(strike) || !finite(iv) || iv <= 0 || Math.abs(strike - price) > price * .03) continue;
        if (side === 'call') calls.push(iv);
        if (side === 'put') puts.push(iv);
    }
    if (!calls.length || !puts.length) return null;
    const avg = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
    return Math.round(avg(puts) / avg(calls) * 100) / 100;
}
export function structureFields(s: any) {
    const num = (v: unknown) => finite(v) ? v : null;
    const gex = num(s?.netGex);
    return { gex, netGex: gex, gexM: gex === null ? null : gex / 1e6,
        gammaRegime: gex === null ? null : gex > 0 ? 'LONG' : gex < 0 ? 'SHORT' : 'NEUTRAL',
        squeezeScore: gex === null ? null : num(s?.squeezeScore),
        squeezeRisk: gex === null ? null : s?.squeezeRisk ?? null,
        atmIv: num(s?.atmIv), ivSkew: num(s?.ivSkew),
        structureChainDate: s?.chainDate ?? null, structureSessionDate: s?.structureSessionDate ?? null, gexBasis: 'structure_v2',
        ivBasis: 'structure_atm_expiry', ivSkewBasis: 'structure_weekly_atm_put_over_call' };
}

/** Normalize the structural sign, never infer it from spot/flip or volatility labels. */
export function gammaRegimeName(value: unknown): string {
    if (value === 'LONG' || value === 'LONG_GAMMA' || value === 'POSITIVE') return 'LONG_GAMMA';
    if (value === 'SHORT' || value === 'SHORT_GAMMA' || value === 'NEGATIVE') return 'SHORT_GAMMA';
    return value === 'NEUTRAL' ? 'NEUTRAL' : 'UNKNOWN';
}
