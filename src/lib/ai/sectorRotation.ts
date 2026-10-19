import { isSourceDate, pickFreshest } from '../sourceFreshness';

/** Numeric rotation contract shared by generation, legacy-cache repair and display. No alpha/leader text is a sector return. */
export interface RotationRow {
  sector: string;
  change?: string;
  changePct?: number | null;
  changeDate?: string;
  avgAlpha?: number | null;
  reason: { ko: string; en: string; ja: string };
}
export interface SectorMeasurement {
  sector: string;
  sectorId?: string;
  changePct: number | null;
  changeDate?: string;
  avgAlpha?: number | null;
}
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const key = (s: string) => s.split('(')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
export function sectorMeanChange(tickers: any[]): number | null {
  const values = tickers.map(t => t.change_pct).filter(finite);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
export function rotationPct(row: RotationRow): number | null {
  if (finite(row.changePct)) return row.changePct;
  // Legacy change strings may be alpha even when they look like plain percentages.
  // Only the explicit numeric contract (or snapshot repair) is a sector return.
  return null;
}
export const formatRotationPct = (pct: number | null | undefined): string =>
  finite(pct) ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '—';
export const rotationBarWidth = (pct: number | null | undefined): number => finite(pct) ? Math.min(100, Math.abs(pct) * 11) : 0;

/** Every previously shown rotation (state, storage, …) as one history; normalize picks the newest per sector. */
export function rotationHistory(...briefs: Array<{ sectorRotation?: any } | null | undefined>): { sectorRotation: { winners: RotationRow[]; losers: RotationRow[] } } {
  const rows = briefs.flatMap(b => [...(b?.sectorRotation?.winners || []), ...(b?.sectorRotation?.losers || [])]) as RotationRow[];
  return { sectorRotation: { winners: rows, losers: [] } };
}

/**
 * Ground=true: producer must use snapshot measurements even when the model invents a numeric field.
 * Every candidate (snapshot measurements, the incoming row, the previously shown row) competes by source
 * date through the single ordering in lib/sourceFreshness — a newer value is never replaced by an older one.
 * Value, date, alpha and reason are taken from the adopted candidate as one bundle.
 */
export function normalizeSectorRotation<T extends { sectorRotation?: any }>(structured: T, measurements: SectorMeasurement[] = [], previous?: { sectorRotation?: any }, ground = false): T {
  if (!structured.sectorRotation) return structured;
  const sr = structured.sectorRotation;
  const old = [...(previous?.sectorRotation?.winners || []), ...(previous?.sectorRotation?.losers || [])] as RotationRow[];
  const normalize = (row: RotationRow): RotationRow => {
    const same = (s?: string) => typeof s === 'string' && key(s) === key(row.sector);
    const measured = measurements.filter(m => (same(m.sector) || same(m.sectorId)) && finite(m.changePct));
    type Candidate = { pct: number; date?: string; alpha: number | null; reason?: RotationRow['reason'] };
    const candidates: Candidate[] = [
      ...measured.map(m => ({ pct: m.changePct as number, date: m.changeDate, alpha: m.avgAlpha ?? null })),
      ...(!ground && rotationPct(row) != null ? [{ pct: row.changePct as number, date: row.changeDate, alpha: row.avgAlpha ?? null }] : []),
      ...old.filter(r => same(r.sector) && rotationPct(r) != null)
        .map(r => ({ pct: r.changePct as number, date: r.changeDate, alpha: r.avgAlpha ?? null, reason: r.reason })),
    ];
    const adopted = pickFreshest(candidates, c => c.date);
    if (!adopted) return { ...row, changePct: null, change: formatRotationPct(null), changeDate: undefined, avgAlpha: null };
    return { ...row, changePct: adopted.pct, change: formatRotationPct(adopted.pct),
      changeDate: isSourceDate(adopted.date) ? adopted.date : undefined,
      avgAlpha: finite(adopted.alpha) ? adopted.alpha : null,
      reason: adopted.reason || row.reason };
  };
  return { ...structured, sectorRotation: { ...sr,
    winners: (sr.winners || []).map(normalize), losers: (sr.losers || []).map(normalize) } };
}
