/**
 * 대시보드 카드에 보일 «상위 2개» — 순수 함수(의존 없음 → 클라이언트 번들에 서버 라이브러리가 딸려 오지 않는다). 시험: tests/todayPicks.test.ts
 *
 * 기준(대표 10/13): 선별 점수 상위 2개, 가능하면 종류가 겹치지 않게. 문서의 항목 순서가 곧 우선순위다(assemble 이 «발표가 오늘·내일인 실적 → 고래 → 실적 → 다크풀 → 감마»로,
 * 같은 종류 안에서는 점수 순으로 세워 저장한다 — 푸시 1번 줄도 같은 첫 항목이다). 그래서 1번은 그대로, 2번은 «1번과 종류가 다른 가장 앞 항목»(없으면 그냥 2번째).
 * 예: [실적, 고래, 고래, 다크풀, 감마] → 실적 + 고래 · [고래, 고래, 다크풀] → 고래 + 다크풀.
 */
export function cardItems<T extends { kind: string }>(items: readonly T[], n = 2): T[] {
    if (n <= 0 || !items.length) return [];
    const out: T[] = [items[0]];
    for (const it of items.slice(1)) {
        if (out.length >= n) break;
        if (!out.some((x) => x.kind === it.kind)) out.push(it);
    }
    // 종류가 다른 항목이 모자라면 앞에서부터 채운다
    for (const it of items.slice(1)) {
        if (out.length >= n) break;
        if (!out.includes(it)) out.push(it);
    }
    return out;
}
