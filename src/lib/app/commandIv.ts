import { observationTime, sourceDate } from '@/lib/ivSkew';

/** Display IV level only. An ATM fallback never becomes IV30, a rank, or a skew curve. */
export function commandIvLevel(iv30: unknown, atmDecimal: unknown, volatilityPercent: unknown, batchPercent: unknown): number | null {
    const positive = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
    const value = positive(iv30) ? iv30 : positive(atmDecimal) ? atmDecimal * 100
        : positive(volatilityPercent) ? volatilityPercent : positive(batchPercent) ? batchPercent : null;
    return value === null ? null : Math.round(value * 100) / 100;
}
export type CommandIvObservation = {
    ticker: string;
    iv: number;
    sourceDate: string;
    dateKind: 'session' | 'observation';
    restored: boolean;
};

/** Value and its own provenance are indivisible. Quote/cache/response dates cannot date IV. */
function datedIv(ticker: string, value: unknown, date: unknown, observedAt?: unknown): CommandIvObservation | null {
    const iv = commandIvLevel(null, null, null, value);
    const session = sourceDate(date);
    const observation = observationTime(observedAt).sourceSessionDate;
    if (iv === null || (!session && !observation)) return null;
    return { ticker, iv, sourceDate: (session ?? observation)!, dateKind: session ? 'session' : 'observation', restored: false };
}

export function commandBatchIv(ticker: string, row: any): CommandIvObservation | null {
    if (row?.ticker !== ticker) return null;
    const rt = row.realtime;
    return datedIv(ticker, rt?.iv, rt?.ivSourceDate, rt?.ivObservedAt)
        ?? datedIv(ticker, rt?.atmIv, rt?.atmIvSourceDate, rt?.atmIvObservedAt);
}

export function commandUnifiedIv(ticker: string, unified: any): CommandIvObservation | null {
    const st = unified?.structure, vol = unified?.volatility;
    return datedIv(ticker, commandIvLevel(null, st?.atmIV, null, null), st?.ivSourceDate ?? st?.chainDate, st?.ivObservedAt)
        ?? datedIv(ticker, vol?.iv, vol?.ivSourceDate, vol?.ivObservedAt);
}

/** A missing/undated response retains only a dated observation for this ticker. */
export function retainCommandIv(previous: CommandIvObservation | null, next: CommandIvObservation | null, ticker: string): CommandIvObservation | null {
    if (next?.ticker === ticker) return next;
    return previous?.ticker === ticker ? { ...previous, restored: true } : null;
}

export function commandIvDateText(value: CommandIvObservation | null, locale: string): string {
    if (!value) return '';
    const prior = value.restored ? (locale === 'ko' ? '직전 관측 · ' : locale === 'ja' ? '直前観測 · ' : 'Last observed · ') : '';
    const kind = value.dateKind === 'observation' ? (locale === 'ko' ? '관측 ' : locale === 'ja' ? '観測 ' : 'Observed ') : '';
    return ` · ${prior}${kind}${value.sourceDate} ET`;
}
