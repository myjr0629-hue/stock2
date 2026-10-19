import type { IntelQuote } from '../../hooks/useIntelSharedData';
import { isFieldMissing, measuredOrNull, setMissingField } from './intelMissing';

export interface SnapshotChange {
    changePct: number;
    sourceDate: string;
}

/** 날짜 없는 옛 행이나 결측을 채운 0은 마감 실측값으로 취급하지 않는다. */
export function snapshotChangesFromResponse(data: any): Record<string, SnapshotChange> {
    const sourceDate = data?.snapshot_date;
    if (!data?.success || typeof sourceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)
        || !Array.isArray(data.snapshot?.tickers)) return {};
    const out: Record<string, SnapshotChange> = {};
    for (const row of data.snapshot.tickers) {
        if (!row || typeof row !== 'object') continue;
        const changePct = measuredOrNull({ ...row, changePct: row.change_pct ?? row.changePct }, 'changePct');
        if (typeof row.ticker === 'string' && changePct != null) out[row.ticker] = { changePct, sourceDate };
    }
    return out;
}

/**
 * fast·batch·폴링 병합 결과가 결측일 때만, 화면 정규장과 같은 거래일의 마감값을 쓴다.
 * 원본 시세 상태는 건드리지 않는다. 다음 실측(실제 0 포함)이 오면 보충값은 즉시 사라진다.
 */
export function fillSnapshotChanges(
    quotes: IntelQuote[], snapshots: Record<string, SnapshotChange>, sessionDate: string,
): IntelQuote[] {
    return quotes.map(q => {
        const close = snapshots[q.ticker];
        if (!isFieldMissing(q, 'changePct') || close?.sourceDate !== sessionDate || !Number.isFinite(close.changePct)) return q;
        return {
            ...q,
            changePct: close.changePct,
            missingFields: setMissingField(q.missingFields, 'changePct', false),
            changePctSourceDate: close.sourceDate,
        };
    });
}
