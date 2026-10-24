/** Local destinations only. Native taps and ordinary web URLs share date validation. */
export const REPORT_OPEN_EVENT = 'signumhq:report-open';
export function reportDate(value: unknown): string | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const ms = Date.parse(`${value}T12:00:00Z`);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? value : null;
}

export function reportPushPath(type: unknown, locale: string, date?: unknown, web = false): string | null {
    const loc = ['ko', 'en', 'ja'].includes(locale) ? locale : 'en';
    if (type === 'morning') return `/${loc}/app-view/guardian?tab=overview&brief=1`;
    if (type !== 'closing') return null;
    const day = reportDate(date);
    return `/${loc}/${web ? 'intel' : 'app-view/intel'}?tab=report${day ? `&date=${day}` : ''}`;
}

export const crossBriefUrl = (date: unknown): string => {
    const day = reportDate(date);
    return `/api/intel/cross-sector-brief${day ? `?date=${day}` : ''}`;
};

/** A pathname match alone loses a report tab/date on cold launch. */
export function matchesReportTarget(pathname: string, search: string, target: string): boolean {
    const url = new URL(target, 'https://local.invalid');
    if (pathname !== url.pathname) return false;
    const current = new URLSearchParams(search);
    return [...url.searchParams].every(([key, value]) => current.get(key) === value);
}
