import type { Company, Field, LensId } from './types';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Raw-input provenance, recorded before counts/flags can erase a missing value.
 * This describes the existing rules' inputs; it does not change their thresholds.
 * A failed row without complete inputs is «undetermined», never «did not pass».
 */
export function hasLensInputs(c: Company, id: LensId): boolean {
    const y = c.year;
    const has = (f: Field, year = y) => finite(c[f][year]);
    const range = (fields: Field[], from: number, to = y) =>
        Array.from({ length: to - from + 1 }, (_, i) => from + i)
            .every(year => fields.every(f => has(f, year)));
    const roeYears = Array.from({ length: 10 }, (_, i) => y - i)
        .filter(year => has('ni', year) && has('eq', year)).length;
    if (!finite(c.price) || c.price <= 0 || !finite(c.shares) || c.shares <= 0 ||
        !c.priceDate || !c.sharesDate || !(c.cik > 0) || c.cik !== c.reportedCik ||
        c.currency !== 'USD' || c.issues.length) return false;
    switch (id) {
        case 'moat_compounder':
            return roeYears >= 9 && range(['ni'], y - 9) &&
                (c.sector === 'Financials' || (has('ltd') && range(['ocf', 'capex'], y - 9)));
        case 'wonderful_fair':
            return roeYears >= 9 && has('ni') && has('rev') && (has('rev', y - 10) || has('rev', y - 9)) &&
                (has('gp') || has('oi')) && range(['eq', 'ltd', 'oi'], y - 3);
        case 'defensive_value':
            return range(['ni'], y - 11) && has('rev') && has('eq') && has('ltd') &&
                (c.sector === 'Utilities' || (has('ca') && has('cl'))) &&
                Array.from({ length: 12 }, (_, i) => y - i).every(year => has('divpaid', year) || has('dps', year));
        case 'garp':
            return [y, y - 3, y - 5].every(year => has('ni', year)) &&
                ['ltd', 'eq', 'divpaid'].every(f => has(f as Field));
        case 'quality_growth':
            return range(['rev'], y - 10) && [y, y - 3].every(year => has('oi', year) && has('wsh', year));
        case 'max_pessimism':
            return range(['ni'], y - 4) && finite(c.offHigh);
        case 'roc_ey':
            return (['oi', 'ca', 'cl', 'ppe', 'cash', 'ltd'] as Field[]).every(f => has(f));
        case 'financial_strength':
            return has('eq') && range(['assets'], y - 2) && has('ocf') &&
                range(['ni', 'ltd', 'ca', 'cl', 'wsh', 'gp', 'rev'], y - 1);
        case 'low_psr_momentum':
            return has('rev') && range(['eps'], y - 1) && finite(c.ret12m);
        case 'quality_multifactor': {
            const qualityParts = [has('gp') && has('assets'), has('ni') && has('eq'), has('ocf') && has('ni')];
            const leverage = (year: number) => has('assets', year) && (has('liab', year) || has('eq', year));
            return qualityParts.filter(Boolean).length >= 2 && finite(c.beta) && finite(c.mom12_1) &&
                leverage(y) && leverage(y - 1) && (['oi', 'da', 'ltd', 'cash'] as Field[]).every(f => has(f));
        }
    }
}
