/** Phase 1 only: server-owned facts, model-owned references. No network/storage side effects. */
export const FACT_SCHEMA_VERSION = 1 as const;
export const FACT_RENDERER_VERSION = 1 as const;
export type FactLocale = 'ko' | 'en' | 'ja';
export interface FactScope { itemId: string; targetId: string; snapshotId: string }
export interface FactSource {
    id: string;
    version: string;
    kind: 'structured' | 'reviewed_article';
    observedAt: string;
    /** Source's actual session/event date, never inferred from generation time. */
    basisDate: string;
    timeZone: 'America/New_York';
}
export interface FactBase {
    factId: string;
    scope: FactScope;
    source: FactSource;
    status: 'available';
}
export const INDEX_INSTRUMENTS = {
    spx_spot: { index: 'SPX', market: 'spot', symbol: 'SPX' },
    spx_futures: { index: 'SPX', market: 'futures', symbol: 'ES=F' },
    composite_spot: { index: 'IXIC', market: 'spot', symbol: 'I:COMP' },
    ndx_spot: { index: 'NDX', market: 'spot', symbol: 'NDX' },
    ndx_futures: { index: 'NDX', market: 'futures', symbol: 'NQ=F' },
    vix_spot: { index: 'VIX', market: 'spot', symbol: 'VIX' },
} as const;
export type IndexInstrument = keyof typeof INDEX_INSTRUMENTS;
export interface IndexObservationFact extends FactBase {
    kind: 'index'; instrument: IndexInstrument;
    timing: 'intraday' | 'close' | 'article';
    level: number; levelUnit: 'index_points'; change: number; changeUnit: 'percent';
}
export interface PositionFact extends FactBase {
    kind: 'position'; ticker: string; sessionDate: string;
    contracts: number; contractsUnit: 'contracts'; notional: number; notionalUnit: 'USD'; side: 'call' | 'put';
}
export interface CalendarFact extends FactBase {
    kind: 'calendar'; ticker: string; eventId: string; event: 'earnings' | 'expiry'; eventDate: string;
}
export interface RatioFact extends FactBase {
    kind: 'ratio'; ticker: string; value: number;
    /** These are different quantities, even when their numeric values coincide. */
    basis: 'volume_call_over_put' | 'oi_put_over_call'; unit: 'ratio';
}
export type Fact = IndexObservationFact | PositionFact | CalendarFact | RatioFact;
export interface FactBundle { schemaVersion: typeof FACT_SCHEMA_VERSION; scope: FactScope; facts: Fact[] }
export type FactTemplate = 'index_observation' | 'position_session' | 'calendar_event' | 'option_ratio';
export interface FactBlock { templateId: FactTemplate; factId: string }
/** Explanation text is server-authored/reviewed, never supplied by a model. */
export interface ExplanationBlock { templateId: 'explanation'; explanationId: string }
export type SentenceBlock = FactBlock | ExplanationBlock;
export interface FactPlan { schemaVersion: typeof FACT_SCHEMA_VERSION; itemId: string; blocks: SentenceBlock[] }
export interface TrustedExplanation {
    explanationId: string; scope: FactScope;
    text: Record<FactLocale, string>;
    /** All premises must remain available in the same frozen snapshot. */
    requires: string[];
}
export interface FactSnapshot {
    schemaVersion: typeof FACT_SCHEMA_VERSION;
    rendererVersion: typeof FACT_RENDERER_VERSION;
    bundle: FactBundle; plan: FactPlan; explanations: TrustedExplanation[];
}
