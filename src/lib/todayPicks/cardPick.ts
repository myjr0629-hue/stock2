/**
 * 대시보드 카드에 보일 «상위 2개» — 순수 함수(의존 없음 → 클라이언트 번들에 서버 라이브러리가 딸려 오지 않는다). 시험: tests/todayPicks.test.ts · tests/todayPicksBroad.test.ts
 *
 * 기준(대표 10/13): 선별 점수 상위 2개, 가능하면 종류가 겹치지 않게. 문서의 항목 순서가 곧 우선순위다(푸시 1번 줄도 같은 첫 항목이다).
 * 그래서 1번은 그대로, 2번은 «1번과 종류가 다른 가장 앞 항목»(없으면 그냥 2번째).
 * 예: [실적, 고래, 고래, 다크풀, 감마] → 실적 + 고래 · [무버, 무버, 실적, 고래] → 무버 + 실적 · [고래, 고래, 다크풀] → 고래 하나.
 *
 * 11/18(대표 «특정한 사용자(옵션·맥스페인·다크풀)한테만 알리려 하지 마»): 일반 항목(큰 폭 등락·실적 등 — 옵션 계열이 아닌 것)이
 * 둘 이상이면 카드 2개는 일반 항목에서만 고른다(옵션 계열 0개). 일반 항목이 하나 이하면 옵션 계열은 최대 1개(문서 순서 그대로).
 */
const OPTIONS_FAMILY = new Set(['whale', 'darkpool', 'gamma']);
export const isOptionsKind = (kind: string): boolean => OPTIONS_FAMILY.has(kind);

function pickDiverse<T extends { kind: string }>(items: readonly T[], n: number): T[] {
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

/** broad = 넓힌 선별 문서(sel 'broad1')일 때만 새 규칙 — 옛 저장본·끄기 스위치 문서는 예전 규칙 그대로(관문 11/18) */
export function cardItems<T extends { kind: string }>(items: readonly T[], n = 2, broad = false): T[] {
    if (n <= 0 || !items.length) return [];
    if (!broad) return pickDiverse(items, n);
    const general = items.filter((x) => !isOptionsKind(x.kind));
    if (general.length >= 2) return pickDiverse(general, n);
    // 일반 항목이 하나 이하 — 옵션 계열은 최대 1개(문서 순서 유지)
    const firstOpt = items.find((x) => isOptionsKind(x.kind));
    return items.filter((x) => x === general[0] || x === firstOpt).slice(0, n);
}
