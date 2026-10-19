import { compareSourceDate, isSourceDate, pickFreshest } from '../sourceFreshness';

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
    // A row's own numeric value, date and reason were written together; a snapshot only fills a row that has
    // no value (legacy/missing), so a snapshot can never pair its number with another value's reason.
    const measured = ground || rotationPct(row) == null
      ? measurements.filter(m => (same(m.sector) || same(m.sectorId)) && finite(m.changePct)) : [];
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

/** Per-sector newest rows from every source (first wins a tie). This — not the displayed list — is what is remembered. */
export function compactRotationHistory(...briefs: Array<{ sectorRotation?: any } | null | undefined>): { sectorRotation: { winners: RotationRow[]; losers: RotationRow[] } } {
  const bySector = new Map<string, RotationRow>();
  for (const r of rotationHistory(...briefs).sectorRotation.winners) {
    if (!r || typeof r.sector !== 'string' || rotationPct(r) == null) continue;
    const cur = bySector.get(key(r.sector));
    if (!cur || compareSourceDate(r.changeDate, cur.changeDate) > 0) bySector.set(key(r.sector), r);
  }
  return { sectorRotation: { winners: [...bySector.values()].slice(0, 64), losers: [] } };
}

export const ROTATION_MEMORY_KEY = 'signum:rotation:v2';
type RotationStore = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const browserStore = (): RotationStore | null => { try { return (globalThis as any).localStorage ?? null; } catch { return null; } };

/**
 * Client exit (app Intel + web brief): normalize an incoming brief against every remembered row — in-memory,
 * storage and what is on screen — then remember the per-sector newest rows. A response that omits a sector
 * therefore cannot erase that sector's newer value before an older response arrives.
 */
export function rememberRotation<T extends { sectorRotation?: any }>(incoming: T, memory: { current: any }, shown?: { sectorRotation?: any } | null, store: RotationStore | null = browserStore()): T {
  let saved = null;
  try { saved = JSON.parse(store?.getItem(ROTATION_MEMORY_KEY) || 'null'); } catch { /* storage unavailable */ }
  const history = rotationHistory(memory.current, shown, saved);
  const next = normalizeSectorRotation(incoming, [], history);
  memory.current = compactRotationHistory(next, history);
  try { store?.setItem(ROTATION_MEMORY_KEY, JSON.stringify(memory.current)); } catch { /* storage unavailable */ }
  return next;
}
