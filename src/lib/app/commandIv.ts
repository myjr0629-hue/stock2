import { observationTime, sourceDate } from '@/lib/ivSkew';
import { isFreshIvObservation } from '@/lib/ivRank';

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
    observedAt?: string;
    dateKind: 'session' | 'observation';
    restored: boolean;
};

/** Value and its own provenance are indivisible. Quote/cache/response dates cannot date IV. */
function datedIv(ticker: string, value: unknown, date: unknown, observedAt: unknown, nowMs: number): CommandIvObservation | null {
    const iv = commandIvLevel(null, null, null, value);
    const session = sourceDate(date);
    const observation = observationTime(observedAt);
    const dateOfIv = session ?? observation.sourceSessionDate;
    if (iv === null || !isFreshIvObservation(dateOfIv, nowMs)) return null;
    return { ticker, iv, sourceDate: dateOfIv!, dateKind: session ? 'session' : 'observation', restored: false,
        // 다른 원천 날짜의 수집 시각으로 IV가 새로워지지 않게 한다.
        ...(observation.observedAt && observation.sourceSessionDate === dateOfIv ? { observedAt: observation.observedAt } : {}) };
}

// IV 날짜가 우선이다. 같은 날짜는 양쪽 모두 고유 관측 시각이 있을 때만 시각으로 비교하고,
// 한쪽이라도 시각이 없으면 동률(0)로 본다 — 시각이 없다는 이유로 같은 날짜의 새 응답이 밀리지 않는다.
function compareIv(a: CommandIvObservation, b: CommandIvObservation): number {
    const byDate = a.sourceDate.localeCompare(b.sourceDate);
    if (byDate || !a.observedAt || !b.observedAt) return byDate;
    return Date.parse(a.observedAt) - Date.parse(b.observedAt) || 0;
}

function latestIv(first: CommandIvObservation | null, second: CommandIvObservation | null): CommandIvObservation | null {
    return first && second ? (compareIv(first, second) >= 0 ? first : second) : first ?? second;
}

export function commandBatchIv(ticker: string, row: any, nowMs = Date.now()): CommandIvObservation | null {
    if (row?.ticker !== ticker) return null;
    const rt = row.realtime;
    return latestIv(datedIv(ticker, rt?.iv, rt?.ivSourceDate, rt?.ivObservedAt, nowMs),
        datedIv(ticker, rt?.atmIv, rt?.atmIvSourceDate, rt?.atmIvObservedAt, nowMs));
}

export function commandUnifiedIv(ticker: string, unified: any, nowMs = Date.now()): CommandIvObservation | null {
    if (unified?.ticker && unified.ticker !== ticker) return null;
    const st = unified?.structure, vol = unified?.volatility;
    // chainDate is overwritten by the option-level edition at the unified API exit.
    // It cannot date atmIV (which may have been copied from volatility.iv).
    return latestIv(
        st?.ticker && st.ticker !== ticker ? null
            : datedIv(ticker, commandIvLevel(null, st?.atmIV, null, null), st?.ivSourceDate, st?.ivObservedAt, nowMs),
        vol?.ticker && vol.ticker !== ticker ? null
            : datedIv(ticker, vol?.iv, vol?.ivSourceDate, vol?.ivObservedAt, nowMs));
}

/** A missing/undated response retains only a dated observation for this ticker. */
export function retainCommandIv(previous: CommandIvObservation | null, next: CommandIvObservation | null, ticker: string, nowMs = Date.now()): CommandIvObservation | null {
    const old = previous && previous.ticker === ticker && isFreshIvObservation(previous.sourceDate, nowMs) ? previous : null;
    if (next && next.ticker === ticker && isFreshIvObservation(next.sourceDate, nowMs)
        && (!old || compareIv(next, old) >= 0)) return next;
    return old ? { ...old, restored: true } : null;
}

export function commandIvDateText(value: CommandIvObservation | null, locale: string): string {
    if (!value) return '';
    const prior = value.restored ? (locale === 'ko' ? '직전 관측 · ' : locale === 'ja' ? '直前観測 · ' : 'Last observed · ') : '';
    const kind = value.dateKind === 'observation' ? (locale === 'ko' ? '관측 ' : locale === 'ja' ? '観測 ' : 'Observed ') : '';
    return ` · ${prior}${kind}${value.sourceDate} ET`;
}
