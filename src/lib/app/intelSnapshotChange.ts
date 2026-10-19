import type { IntelQuote } from '../../hooks/useIntelSharedData';
import { isFieldMissing, measuredOrNull, setMissingField } from './intelMissing';
import { prevTradingDate } from '../marketCalendar';

export interface SnapshotChange {
    price: number;
    changePct: number;
    sourceDate: string;
}

/** 저장 키의 명시적 null·결측 표식을 대체 키의 숫자로 되살리지 않는다. */
export function snapshotChangeOrNull(row: any): number | null {
    if (!row || typeof row !== 'object') return null;
    const rawChange = Object.prototype.hasOwnProperty.call(row, 'change_pct') ? row.change_pct : row.changePct;
    return measuredOrNull({ ...row, changePct: rawChange }, 'changePct');
}

/** 날짜 없는 옛 행이나 결측을 채운 0은 마감 실측값으로 취급하지 않는다. */
export function snapshotChangesFromResponse(data: any): Record<string, SnapshotChange> {
    const sourceDate = data?.snapshot_date;
    if (!data?.success || typeof sourceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)
        || !Array.isArray(data.snapshot?.tickers)) return {};
    const out: Record<string, SnapshotChange> = {};
    for (const row of data.snapshot.tickers) {
        if (!row || typeof row !== 'object') continue;
        const changePct = snapshotChangeOrNull(row);
        const rawPrice = Object.prototype.hasOwnProperty.call(row, 'close_price') ? row.close_price : row.price;
        const price = measuredOrNull({ ...row, price: rawPrice }, 'price');
        if (typeof row.ticker === 'string' && price != null && changePct != null) out[row.ticker] = { price, changePct, sourceDate };
    }
    return out;
}

/**
 * fast·batch·폴링 병합 결과가 결측일 때만 마감 가격·등락·날짜를 한 쌍으로 쓴다.
 * 같은 거래일이 우선이며, 장외에서만 직전 정규장 실측 쌍을 허용한다.
 * 원본 시세 상태는 건드리지 않는다. 다음 실측(실제 0 포함)이 오면 보충값은 즉시 사라진다.
 */
export function fillSnapshotChanges(
    quotes: IntelQuote[], snapshots: Record<string, SnapshotChange>, sessionDate: string,
): IntelQuote[] {
    const previousDate = prevTradingDate(sessionDate);
    return quotes.map(q => {
        const close = snapshots[q.ticker];
        const previousClose = ['PRE', 'POST', 'CLOSED'].includes(q.session) && close?.sourceDate === previousDate;
        if (!isFieldMissing(q, 'changePct') || !close || (close.sourceDate !== sessionDate && !previousClose)
            || !Number.isFinite(close.price) || close.price <= 0 || !Number.isFinite(close.changePct)) return q;
        return {
            ...q,
            price: close.price,
            changePct: close.changePct,
            regularCloseToday: close.sourceDate === sessionDate ? close.price : null,
            missingFields: setMissingField(setMissingField(q.missingFields, 'price', false), 'changePct', false),
            changePctSourceDate: close.sourceDate,
        };
    });
}
