/** A complete observation, including source time. Receipt time cannot date a quote. */
export interface IndexCloseQuote {
    price: number;
    changePct: number;
    updatedAt: string;
    marketTime: string;
    sourceSessionDate: string;
}

export function indexCloseSnapshot(value: any): IndexCloseQuote | null {
    if (!value || value.source === 'DEFAULT' || value.error
        || typeof value.price !== 'number' || !Number.isFinite(value.price) || value.price <= 0
        || typeof value.changePct !== 'number' || !Number.isFinite(value.changePct)
        || typeof value.marketTime !== 'string' || !Number.isFinite(Date.parse(value.marketTime))) return null;
    const sourceSessionDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(value.marketTime));
    return {
        price: value.price, changePct: value.changePct,
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : value.marketTime,
        marketTime: value.marketTime, sourceSessionDate,
    };
}

export const indexLastGoodKey = (key: string) => `${key}:last-good:v1`;

export function resolveIndexClose(current: unknown, previous: unknown): IndexCloseQuote | null {
    const next = indexCloseSnapshot(current);
    const last = indexCloseSnapshot(previous);
    if (!next) return last;
    if (last && Date.parse(last.marketTime) > Date.parse(next.marketTime)) return last;
    return next;
}
