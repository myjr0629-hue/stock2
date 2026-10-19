import { normalizeSectorRotation, rotationPct, sectorMeanChange, type RotationRow, type SectorMeasurement } from './sectorRotation';

export interface RotationSnapshot {
  sector_id: string;
  snapshot_date: string;
  data_json: any;
}

/** One batch read per report date/TTL, including empty results and concurrent GETs. No persistent writes. */
export function createRotationRepair(
  labels: Record<string, string>,
  load: (date: string) => Promise<RotationSnapshot[]>,
  now = Date.now,
) {
  const cache = new Map<string, { expires: number; pending: Promise<SectorMeasurement[]> }>();
  return async (payload: Record<string, any>) => {
    const sr = payload.structured?.sectorRotation;
    if (!sr) return payload;
    const rows: RotationRow[] = [...(sr.winners || []), ...(sr.losers || [])];
    let measurements: SectorMeasurement[] = payload.sectorMeasurements || [];
    if (rows.some(row => rotationPct(row) == null) && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
      let entry = cache.get(payload.date);
      if (!entry || entry.expires <= now()) {
        const previous = entry?.pending;
        const date = payload.date;
        const pending = (async () => {
          const snapshots = await load(date).catch(() => []);
          const prior = previous ? await previous : [];
          return Object.entries(labels).map(([id, sector]) => {
            const candidates = snapshots.filter(s => s.sector_id === id && s.snapshot_date <= date)
              .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
            const snap = candidates.find(s => sectorMeanChange(s.data_json?.tickers || []) != null);
            const remembered = prior.find(m => m.sectorId === id);
            // Keep the last good dated measurement when a refresh is empty or older.
            if (remembered && (!snap || (remembered.changeDate || '') > snap.snapshot_date)) return remembered;
            return { sector, sectorId: id, changePct: snap ? sectorMeanChange(snap.data_json?.tickers || []) : null,
              changeDate: snap?.snapshot_date, avgAlpha: snap?.data_json?.sector_summary?.avg_alpha ?? null };
          });
        })();
        entry = { expires: now() + 60_000, pending };
        cache.set(date, entry);
        if (cache.size > 16) cache.delete(cache.keys().next().value!);
      }
      // Embedded, dated measurements also survive a temporary snapshot miss.
      const recovered = await entry.pending;
      measurements = [...measurements.filter(m => typeof m.changePct === 'number' && Number.isFinite(m.changePct)),
        ...recovered];
    }
    return { ...payload, structured: normalizeSectorRotation(payload.structured, measurements) };
  };
}
