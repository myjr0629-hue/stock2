/** Replay at the scheduled UTC time, capped by the real clock. */
export function dryClock(date: string, real: Date): Date {
    const d = new Date(`${date}T22:04:00Z`);
    return Number.isFinite(d.getTime()) && d < real ? d : real;
}

export function replaySnapshotAllowed(at: Date, now: Date, date: string): boolean {
    return Number.isFinite(at.getTime()) && at <= now && at.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === date;
}
