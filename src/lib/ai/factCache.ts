/** Pure serialization adapter only. Existing cache keys, TTLs, retries and generators are untouched. */
import { FACT_RENDERER_VERSION, FACT_SCHEMA_VERSION } from './factContract';
import { parseFactJSON, validateFactPlan } from './factPlan';
import { renderFactPlan, type FactRenderResult } from './factRender';

/** A readable envelope can still contain unavailable facts. Keep stored contents unknown until exit validation. */
export interface ReadableFactSnapshot {
    schemaVersion: typeof FACT_SCHEMA_VERSION; rendererVersion: typeof FACT_RENDERER_VERSION;
    plan: unknown; bundle: unknown; explanations: unknown[];
}
export type FactSnapshotRead = { status: 'ready'; snapshot: ReadableFactSnapshot }
    | { status: 'legacy' | 'invalid' | 'unsupported_version' };

/** Caller must read the server-owned snapshot field, never the model's output object. */
export function readFactSnapshot(input: unknown): FactSnapshotRead {
    let value = input;
    if (typeof value === 'string') { try { value = parseFactJSON(value); } catch { return { status: 'invalid' }; } }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'legacy' };
    const v = value as Record<string, unknown>;
    if (!Object.hasOwn(v, 'schemaVersion')) return { status: 'legacy' };
    if (v.schemaVersion !== FACT_SCHEMA_VERSION || v.rendererVersion !== FACT_RENDERER_VERSION) return { status: 'unsupported_version' };
    // Detach the accepted snapshot from mutable caller data, just as a storage round trip would.
    try {
        const copy = JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
        if (!Array.isArray(copy.explanations) || !validateFactPlan(copy.plan, copy.bundle, copy.explanations).plan) return { status: 'invalid' };
        return { status: 'ready', snapshot: {
            schemaVersion: FACT_SCHEMA_VERSION, rendererVersion: FACT_RENDERER_VERSION,
            plan: copy.plan, bundle: copy.bundle, explanations: copy.explanations,
        } };
    } catch { return { status: 'invalid' }; }
}

/** Frozen snapshot only: no latest-price substitution, AI call, retry or storage write. */
export function renderFactSnapshot(input: unknown, locale: unknown): { status: FactSnapshotRead['status']; rendered?: FactRenderResult } {
    const read = readFactSnapshot(input);
    if (read.status !== 'ready') return { status: read.status };
    const s = read.snapshot;
    return { status: 'ready', rendered: renderFactPlan(s.plan, s.bundle, locale, s.explanations) };
}
