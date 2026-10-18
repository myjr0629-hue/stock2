type EconomicObservation = { date: string; value: number };

/** Calendar periods must not move when missing observations are filtered out. */
export function observationMonthsAgo(
    rows: readonly EconomicObservation[], date: string | undefined, months: number,
): EconomicObservation | null {
    if (!date || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date)) return null;
    const target = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1 - months, 1))
        .toISOString().slice(0, 7);
    return rows.find(row => row.date.slice(0, 7) === target && Number.isFinite(row.value)) ?? null;
}
