import type { IntelQuote } from '../../hooks/useIntelSharedData';
import { isFieldMissing, measuredOrNull, setMissingField } from './intelMissing';

export interface SnapshotScore {
    alphaScore: number;
    grade?: string;
    sourceDate: string;
}

/** 저장된 null·결측 표식이 우선이다. 요약 평균을 개별 종목 점수로 복제하지 않는다. */
export function snapshotScoreOrNull(row: any): number | null {
    if (!row || typeof row !== 'object') return null;
    const raw = Object.prototype.hasOwnProperty.call(row, 'alpha_score') ? row.alpha_score
        : Object.prototype.hasOwnProperty.call(row, 'alphaScore') ? row.alphaScore : row.score;
    return measuredOrNull({ ...row, alphaScore: raw }, 'alphaScore');
}

export function snapshotScoresFromResponse(data: any): Record<string, SnapshotScore> {
    const sourceDate = data?.snapshot_date;
    if (!data?.success || typeof sourceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)
        || !Array.isArray(data.snapshot?.tickers)) return {};
    const out: Record<string, SnapshotScore> = {};
    for (const row of data.snapshot.tickers) {
        const alphaScore = snapshotScoreOrNull(row);
        if (typeof row?.ticker !== 'string' || alphaScore == null) continue;
        out[row.ticker] = { alphaScore, sourceDate, ...(typeof row.grade === 'string' && row.grade ? { grade: row.grade } : {}) };
    }
    return out;
}

/** 표시층 전용: 최신 실측(0 포함) 우선, 같은 거래일의 마감 실측만 보충한다. */
export function fillSnapshotScores(
    quotes: IntelQuote[], snapshots: Record<string, SnapshotScore>, sessionDate: string,
): IntelQuote[] {
    return quotes.map(q => {
        const close = snapshots[q.ticker];
        if (!isFieldMissing(q, 'alphaScore') || close?.sourceDate !== sessionDate || !Number.isFinite(close.alphaScore)) return q;
        return {
            ...q,
            alphaScore: close.alphaScore,
            grade: close.grade || '',
            missingFields: setMissingField(q.missingFields, 'alphaScore', false),
            alphaScoreSourceDate: close.sourceDate,
        };
    });
}
