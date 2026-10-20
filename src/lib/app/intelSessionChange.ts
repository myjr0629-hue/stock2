import { measuredOrNull } from './intelMissing';

type ChangeRow = {
    changePct?: number | null;
    changePctSourceDate?: string;
    missingFields?: readonly string[] | null;
};

/** 개별 칸의 보충값은 유지하되, 화면 기준 세션과 같은 날짜만 집계한다.
 * 보충 없는 실측은 기존 정규장 달력으로 정한 화면 세션에 속한다. */
export function sessionChangeOrNull(row: ChangeRow, sessionDate: string): number | null {
    return (row.changePctSourceDate ?? sessionDate) === sessionDate
        ? measuredOrNull(row, 'changePct') : null;
}

/** 기존 n/N 숫자 표기. 전부 집계되면 덧붙이지 않는다(0/N도 결측을 드러낸다). */
export function changeCoverage(count: number, total: number): string {
    return total > 0 && count < total ? ` ${count}/${total}` : '';
}

/** n/N 은 화면 글자로 덧붙이지 않는다(375폭 배치 변화 — 10/20 운영 검토). 같은 요소의 title 로만 둔다. */
export function coverageTitle(count: number, total: number): string | undefined {
    return changeCoverage(count, total).trim() || undefined;
}
