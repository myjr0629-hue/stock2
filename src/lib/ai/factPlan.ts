import {
    FACT_SCHEMA_VERSION, type Fact, type FactBundle, type FactPlan, type FactScope,
    type SentenceBlock, type TrustedExplanation,
} from './factContract';
import { sameFactScope, validFact, validFactScope } from './factAdapters';

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
const reference = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200 && v.trim() === v;

/** JSON.parse alone silently accepts duplicate properties. Check every object before accepting a plan/snapshot. */
export function parseFactJSON(raw: string): unknown {
    if (raw.length > 262144) throw new Error('fact_json_too_large');
    const value: unknown = JSON.parse(raw);
    let at = 0;
    const ws = () => { while (/\s/.test(raw[at] || '') && at < raw.length) at++; };
    const string = (): string => {
        const start = at++;
        while (at < raw.length) {
            const c = raw[at++];
            if (c === '\\') at++;
            else if (c === '"') return JSON.parse(raw.slice(start, at));
        }
        throw new Error('fact_json_string');
    };
    const walk = (depth: number): void => {
        if (depth > 32) throw new Error('fact_json_depth');
        ws();
        if (raw[at] === '{') {
            at++; ws(); const keys = new Set<string>();
            if (raw[at] === '}') { at++; return; }
            while (at < raw.length) {
                ws(); const key = string();
                if (keys.has(key)) throw new Error('fact_json_duplicate_key');
                keys.add(key); ws(); at++; walk(depth + 1); ws();
                if (raw[at++] === '}') return;
            }
        } else if (raw[at] === '[') {
            at++; ws();
            if (raw[at] === ']') { at++; return; }
            while (at < raw.length) { walk(depth + 1); ws(); if (raw[at++] === ']') return; }
        } else if (raw[at] === '"') { string(); }
        else { while (at < raw.length && !/[\s,}\]]/.test(raw[at])) at++; }
    };
    walk(0);
    return value;
}

export interface FactPlanIssue { block: number | null; code: string }
export type ResolvedSentence = { block: SentenceBlock; fact?: Fact; explanation?: TrustedExplanation };
export interface FactPlanValidation {
    plan: FactPlan | null; sentences: ResolvedSentence[]; issues: FactPlanIssue[];
}
function planShape(v: unknown): v is FactPlan {
    if (!record(v) || !exact(v, ['schemaVersion', 'itemId', 'blocks']) || v.schemaVersion !== FACT_SCHEMA_VERSION
        || !reference(v.itemId) || !Array.isArray(v.blocks) || v.blocks.length > 64) return false;
    const seen = new Set<string>();
    return v.blocks.every(b => {
        if (!record(b)) return false;
        const explanation = b.templateId === 'explanation';
        if (!exact(b, explanation ? ['templateId', 'explanationId'] : ['templateId', 'factId'])) return false;
        if (typeof b.templateId !== 'string' || !['explanation', 'index_observation', 'position_session', 'calendar_event', 'option_ratio'].includes(b.templateId)) return false;
        const ref = explanation ? b.explanationId : b.factId;
        if (!reference(ref)) return false;
        const key = `${b.templateId}:${ref}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
    });
}
const expectedKind = { index_observation: 'index', position_session: 'position', calendar_event: 'calendar', option_ratio: 'ratio' } as const;
function explanationShape(v: unknown, scope: FactScope): v is TrustedExplanation {
    if (!record(v) || !reference(v.explanationId) || !validFactScope(v.scope) || !sameFactScope(v.scope, scope)
        || !record(v.text) || !exact(v.text, ['ko', 'en', 'ja'])
        || !['ko', 'en', 'ja'].every(l => typeof (v.text as Record<string, unknown>)[l] === 'string'
            && String((v.text as Record<string, unknown>)[l]).trim().length > 0)
        || !Array.isArray(v.requires) || !v.requires.every(reference)) return false;
    return new Set(v.requires).size === v.requires.length;
}

/** Unknown/missing facts remove only their sentence; invalid wire shape rejects the plan. No regeneration. */
export function validateFactPlan(input: unknown, bundleInput: unknown, explanations: readonly unknown[] = []): FactPlanValidation {
    const fail = (code: string): FactPlanValidation => ({ plan: null, sentences: [], issues: [{ block: null, code }] });
    let plan: unknown = input;
    if (typeof input === 'string') { try { plan = parseFactJSON(input); } catch { return fail('invalid_json'); } }
    if (!planShape(plan)) return fail('invalid_plan');
    if (!record(bundleInput) || bundleInput.schemaVersion !== FACT_SCHEMA_VERSION
        || !validFactScope(bundleInput.scope) || !Array.isArray(bundleInput.facts) || bundleInput.facts.length > 256) return fail('invalid_bundle');
    if (!Array.isArray(explanations) || explanations.length > 64) return fail('invalid_explanations');
    const bundle = bundleInput as unknown as FactBundle;
    if (plan.itemId !== bundle.scope.itemId) return fail('item_scope');
    const facts = new Map<string, Fact>();
    const ids = new Set<string>();
    // Ambiguous IDs invalidate the bundle, even if one of their values is invalid.
    for (const f of bundle.facts) {
        if (record(f) && typeof f.factId === 'string') {
            if (ids.has(f.factId)) return fail('duplicate_fact');
            ids.add(f.factId);
        }
        if (validFact(f) && sameFactScope(f.scope, bundle.scope)) facts.set(f.factId, f);
    }
    const catalog = new Map<string, TrustedExplanation>();
    const explanationIds = new Set<string>();
    for (const e of explanations) {
        if (record(e) && typeof e.explanationId === 'string') {
            if (explanationIds.has(e.explanationId)) return fail('duplicate_explanation');
            explanationIds.add(e.explanationId);
        }
        if (explanationShape(e, bundle.scope)) catalog.set(e.explanationId, e);
    }
    const sentences: ResolvedSentence[] = [], issues: FactPlanIssue[] = [];
    plan.blocks.forEach((block, i) => {
        if (block.templateId === 'explanation') {
            const e = catalog.get(block.explanationId);
            if (!e || !e.requires.every(id => facts.has(id))) { issues.push({ block: i, code: 'explanation_unavailable' }); return; }
            sentences.push({ block, explanation: e });
        } else {
            const fact = facts.get(block.factId);
            if (!fact) { issues.push({ block: i, code: 'fact_unavailable' }); return; }
            if (fact.kind !== expectedKind[block.templateId]) { issues.push({ block: i, code: 'template_type' }); return; }
            sentences.push({ block, fact });
        }
    });
    return { plan, sentences, issues };
}
