import {
    FACT_SCHEMA_VERSION, INDEX_INSTRUMENTS,
    type Fact, type FactBase, type FactBundle, type FactScope, type FactSource,
    type IndexInstrument, type IndexObservationFact, type PositionFact, type CalendarFact, type RatioFact,
} from './factContract';
import { callOverPut } from '../putCall';

export const finiteFactNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown): v is number => finiteFactNumber(v) && v > 0;
const nonnegative = (v: unknown): v is number => finiteFactNumber(v) && v >= 0;
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200 && v.trim() === v;
const ticker = (v: unknown): v is string => typeof v === 'string' && /^[A-Z][A-Z0-9.\-]{0,14}$/.test(v);
export const validFactDate = (v: unknown): v is string => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const ms = Date.parse(`${v}T12:00:00Z`);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === v;
};
export function sameFactScope(a: FactScope, b: FactScope): boolean {
    return a.itemId === b.itemId && a.targetId === b.targetId && a.snapshotId === b.snapshotId;
}
export function validFactScope(v: unknown): v is FactScope {
    if (!v || typeof v !== 'object') return false;
    const s = v as FactScope;
    return id(s.itemId) && id(s.targetId) && id(s.snapshotId);
}
export function validFactSource(v: unknown): v is FactSource {
    if (!v || typeof v !== 'object') return false;
    const s = v as FactSource;
    return id(s.id) && id(s.version) && (s.kind === 'structured' || s.kind === 'reviewed_article')
        && typeof s.observedAt === 'string'
        && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(s.observedAt)
        && validFactDate(s.observedAt.slice(0, 10)) && Number.isFinite(Date.parse(s.observedAt))
        && validFactDate(s.basisDate) && s.timeZone === 'America/New_York';
}
/** Rechecked at every render, including deserialized snapshots. Strings are never promoted to facts. */
export function validFact(v: unknown): v is Fact {
    if (!v || typeof v !== 'object') return false;
    const f = v as Fact;
    if (!id(f.factId) || !validFactScope(f.scope) || !validFactSource(f.source) || f.status !== 'available') return false;
    switch (f.kind) {
        case 'index': return typeof f.instrument === 'string' && Object.hasOwn(INDEX_INSTRUMENTS, f.instrument)
            && ['intraday', 'close', 'article'].includes(f.timing)
            && (f.timing !== 'article' || f.source.kind === 'reviewed_article')
            && positive(f.level) && finiteFactNumber(f.change) && f.change >= -100
            && f.levelUnit === 'index_points' && f.changeUnit === 'percent';
        case 'position': return ticker(f.ticker) && f.ticker === f.scope.targetId
            && validFactDate(f.sessionDate) && f.sessionDate === f.source.basisDate
            && Number.isSafeInteger(f.contracts) && f.contracts > 0 && positive(f.notional)
            && f.contractsUnit === 'contracts' && f.notionalUnit === 'USD' && ['call', 'put'].includes(f.side);
        case 'calendar': return ticker(f.ticker) && f.ticker === f.scope.targetId && id(f.eventId)
            && ['earnings', 'expiry'].includes(f.event) && validFactDate(f.eventDate) && f.eventDate === f.source.basisDate;
        case 'ratio': return ticker(f.ticker) && f.ticker === f.scope.targetId && nonnegative(f.value)
            && ['volume_call_over_put', 'oi_put_over_call'].includes(f.basis) && f.unit === 'ratio';
        default: return false;
    }
}

export type FactMeta = Pick<FactBase, 'factId' | 'scope' | 'source'>;
/** Caller supplies a structured observation with explicit instrument/time; no article regex extraction. */
export function indexFact(meta: FactMeta, value: {
    instrument: IndexInstrument; timing: IndexObservationFact['timing']; level: number | null; changePct: number | null;
}): IndexObservationFact | null {
    const f = { ...meta, status: 'available' as const, kind: 'index' as const, instrument: value.instrument,
        timing: value.timing, level: value.level, levelUnit: 'index_points' as const, change: value.changePct, changeUnit: 'percent' as const };
    return validFact(f) ? f as IndexObservationFact : null;
}
/** Use side-specific opening aggregates and the actual session, never the total or dominant side. */
export function ucPositionFact(meta: FactMeta, ticker: string, money: {
    optionsDate?: string | null;
    callContracts?: number | null; putContracts?: number | null;
    callNotional?: number | null; putNotional?: number | null;
}, side: PositionFact['side']): PositionFact | null {
    const f = { ...meta, status: 'available' as const, kind: 'position' as const, ticker,
        sessionDate: money.optionsDate, contracts: side === 'call' ? money.callContracts : money.putContracts, contractsUnit: 'contracts' as const,
        notional: side === 'call' ? money.callNotional : money.putNotional, notionalUnit: 'USD' as const, side };
    return validFact(f) ? f as PositionFact : null;
}
export function calendarFact(meta: FactMeta, value: Pick<CalendarFact, 'ticker' | 'eventId' | 'event' | 'eventDate'>): CalendarFact | null {
    const f = { ...meta, ...value, status: 'available' as const, kind: 'calendar' as const };
    return validFact(f) ? f : null;
}
/** C/P uses raw volumes and the shared definition; never trust a legacy ratio's zero-denominator sentinel. OI stays P/C. */
export function ucRatioFact(meta: FactMeta, ticker: string, basis: RatioFact['basis'], money: {
    volumePcrCallVol?: number | null; volumePcrPutVol?: number | null; oiPcr?: number | null;
}): RatioFact | null {
    const value = basis === 'volume_call_over_put' ? callOverPut(money.volumePcrCallVol, money.volumePcrPutVol) : money.oiPcr;
    const f = { ...meta, status: 'available' as const, kind: 'ratio' as const, ticker, basis, value, unit: 'ratio' as const };
    return validFact(f) ? f as RatioFact : null;
}
export function factBundle(scope: FactScope, facts: Array<Fact | null>): FactBundle {
    return { schemaVersion: FACT_SCHEMA_VERSION, scope: { ...scope }, facts: facts.filter((f): f is Fact => f !== null) };
}
