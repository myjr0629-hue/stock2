/** Public SEC values are unscaled USD / shares / USD-per-share. Missing is null. */
export type Series = Record<number, number | null>;
export const FIELDS = [
    'ni',
    'eq',
    'rev',
    'eps',
    'ocf',
    'capex',
    'divpaid',
    'dps',
    'oi',
    'gp',
    'da',
    'wsh',
    'assets',
    'liab',
    'ca',
    'cl',
    'ltd',
    'cash',
    'ppe',
] as const;
export type Field = (typeof FIELDS)[number];
export interface Company extends Record<Field, Series> {
    ticker: string;
    name: string;
    sector: string;
    cik: number;
    reportedCik: number;
    year: number;
    priceDate: string;
    price: number;
    currency: string;
    shares: number | null;
    sharesDate: string | null;
    splitMultiplier: number;
    splits: Array<{ date: string; ratio: number }>;
    offHigh: number | null;
    ret12m: number | null;
    mom12_1: number | null;
    beta: number | null;
    issues: string[];
}
export const LENS_IDS = [
    'moat_compounder',
    'wonderful_fair',
    'defensive_value',
    'garp',
    'quality_growth',
    'max_pessimism',
    'roc_ey',
    'financial_strength',
    'low_psr_momentum',
    'quality_multifactor',
] as const;
export type LensId = (typeof LENS_IDS)[number];
export interface LensDefinition {
    id: LensId;
    name: string;
    category: 'value' | 'factor';
    source: { book: string; chapter: string | null };
    interpretation: string;
    sort: string;
}
export interface Check {
    id: string;
    passed: boolean;
    value: number | null;
    rule: string;
    reason: string;
}
export interface Evaluation {
    ticker: string;
    passed: boolean;
    score: number | null;
    checks: Check[];
    reason: string;
}
export interface LensResult {
    definition: LensDefinition;
    passCount: number;
    rows: Evaluation[];
}
export interface Snapshot {
    version: 1;
    date: string;
    generatedAt: string;
    /** Oldest completed price session across this calculation. Publication ordering basis. */
    asOf: string;
    financialYear: number;
    universeCount: number;
    companies: Record<string, { cik: number; reportedCik: number; priceDate: string }>;
    lenses: Record<LensId, LensResult>;
    calls: { sec: number; prices: number; paid: number };
}
