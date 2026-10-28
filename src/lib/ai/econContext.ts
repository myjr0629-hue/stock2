/** Select releases after the next release, within 48 hours. */
export function nearbyEconomicEvents(events: unknown, next: { utcMs: number; event: string }): string[] {
  try { return (Array.isArray(events) ? events : []).flatMap((e: any) => {
    if (!e || (e.country != null && e.country !== 'US') || typeof e.event !== 'string' || !e.event.trim() ||
        typeof e.date !== 'string' || typeof e.time !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !/^\d{2}:\d{2}$/.test(e.time)) return [];
    const time = Date.parse(`${e.date}T${e.time}:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 16) !== `${e.date}T${e.time}` || time < next.utcMs || time > next.utcMs + 48 * 3600_000 ||
        (time === next.utcMs && e.event.trim() === next.event)) return [];
    return [{ e, time }];
  }).sort((a, b) => Number(b.e.impact === 'HIGH') - Number(a.e.impact === 'HIGH') || a.time - b.time)
    .slice(0, 6).sort((a, b) => a.time - b.time)
    .map(({ e }) => `${e.date} ${e.time} UTC ${e.event.trim()}`);
  } catch { return []; }
}
