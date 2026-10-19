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

/** Ground=true: producer must use snapshot measurements even when the model invents a numeric field. */
export function normalizeSectorRotation<T extends { sectorRotation?: any }>(structured: T, measurements: SectorMeasurement[] = [], previous?: T, ground = false): T {
  if (!structured.sectorRotation) return structured;
  const sr = structured.sectorRotation;
  const old = [...(previous?.sectorRotation?.winners || []), ...(previous?.sectorRotation?.losers || [])] as RotationRow[];
  const normalize = (row: RotationRow): RotationRow => {
    const measured = measurements.find(m => key(m.sector) === key(row.sector) || (m.sectorId && key(m.sectorId) === key(row.sector)));
    const prior = old.find(r => key(r.sector) === key(row.sector) && rotationPct(r) != null);
    const adopted = measured && finite(measured.changePct) ? measured
      : !ground && rotationPct(row) != null ? row : prior;
    const value = adopted ? rotationPct(adopted as RotationRow) : null;
    return { ...row, changePct: value, change: formatRotationPct(value),
      changeDate: value != null ? adopted?.changeDate : undefined,
      avgAlpha: measured?.avgAlpha ?? row.avgAlpha ?? null };
  };
  return { ...structured, sectorRotation: { ...sr,
    winners: (sr.winners || []).map(normalize), losers: (sr.losers || []).map(normalize) } };
}
