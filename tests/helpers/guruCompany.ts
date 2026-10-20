/** Synthetic raw financial inputs. No network, environment or production data. */
import { FIELDS, type Company } from '../../src/lib/guruLens/types';

export function guruCompany(): Company {
    const c = {
        ticker: 'AAA', name: 'Fixture', sector: 'Industrials', cik: 1, reportedCik: 1,
        year: 2025, priceDate: '2026-10-16', price: 20, currency: 'USD', shares: 1e8,
        sharesDate: '2026-06-30', splitMultiplier: 1, splits: [], offHigh: -0.4,
        ret12m: 0.5, mom12_1: 0.3, beta: 0.8, issues: [],
    } as unknown as Company;
    FIELDS.forEach(f => { c[f] = {}; });
    for (let y = 2014; y <= 2025; y++) {
        const growth = 1.15 ** (y - 2025);
        const values = [3e8 * growth, 1e9 * growth, 3e9 * growth, 3 * growth,
            4e8 * growth, 1e8 * growth, 1e7, 0.1, 1e9 * growth, 1.6e9 * growth,
            1e8, 1e8, 4e9 * growth, 2e9 * growth, 2e9 * growth, 5e8 * growth,
            1e8 * growth, 2e8 * growth, 5e8 * growth];
        FIELDS.forEach((f, i) => { c[f][y] = values[i]; });
    }
    return c;
}
