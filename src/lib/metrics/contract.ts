/** Pure metric contract. Coverage counts validated source inputs, never defaults. */
export type MetricKind = 'score' | 'derived' | 'observed' | 'estimate' | 'observed_probability';
export interface MetricDefinition {
    id: string;
    kind: MetricKind;
    unit: string;
    basis: string;
    period: string;
    denominator: string;
}
export interface Metric<T = number> extends MetricDefinition {
    value: T | null;
    status: 'available' | 'missing' | 'proxy';
    coverage: { available: number; required: number; ratio: number; minimum: number; missing: string[] };
    inputs: Readonly<Record<string, unknown>>;
    reason: 'insufficient_coverage' | 'invalid_result' | null;
    proxy: { source: string; target: string; multiplier: number } | null;
}
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const positive = (v: unknown): v is number => finite(v) && v > 0;
export const nonnegative = (v: unknown): v is number => finite(v) && v >= 0;
export const percent = (v: unknown): v is number => nonnegative(v) && v <= 100;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** All named inputs are mandatory. A metric needing a looser rule must define it separately. */
export function metric<T>(definition: MetricDefinition, inputs: Record<string, unknown>,
    valid: Record<string, boolean>, calculate: () => T | null): Metric<T> {
    const names = Object.keys(valid);
    const missing = names.filter(k => !valid[k]);
    const required = names.length;
    const available = required - missing.length;
    const ready = required > 0 && missing.length === 0;
    const result = ready ? calculate() : null;
    const value = typeof result === 'number' && !Number.isFinite(result) ? null : result;
    return { ...definition, value, status: value === null ? 'missing' : 'available',
        coverage: { available, required, ratio: required ? available / required : 0, minimum: 1, missing },
        inputs: { ...inputs }, reason: !ready ? 'insufficient_coverage' : value === null ? 'invalid_result' : null,
        proxy: null };
}
