// ============================================================================
// 검색 표면의 «이 사본을 현재값이라고 말해도 되나» 판정 — 순수 함수(시험: tests/seoFreshness.test.ts).
//
// 나이를 «시간»이 아니라 «거래일»로 잰다. 시간으로 재면 주말·휴장에 멀쩡한 금요일 값까지
// 버리고(월요일 아침 60시간), 반대로 긴 창을 잡으면 열흘 전 사본도 통과한다.
// 기준일(session)은 원천 FINRA 원본의 날짜 = 가장 최근에 끝난 세션이다.
// ============================================================================

/** 뉴욕 날짜(YYYY-MM-DD) — 거래일과 견주려면 UTC 날짜가 아니라 뉴욕 날짜여야 한다 */
export function etDate(iso: string | null | undefined): string | null {
    const ms = Date.parse(iso || '');
    if (!Number.isFinite(ms)) return null;
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

export const mmdd = (ymd: string | null | undefined): string | null => (ymd ? ymd.slice(5).replace('-', '/') : null);

export type FreshnessInput = {
    /** 사본(UC 페이로드)이 만들어진 시각 */
    generatedAt: string | null | undefined;
    /** 사본의 해석이 딛고 선 다크풀 날짜(payload.money.darkPoolDate) */
    payloadDpDate: string | null | undefined;
    /** 원천을 읽었는가 — false 면 기준일을 모르므로 시간으로만 판단한다 */
    sourceRead: boolean;
    /** 원천의 기준일(가장 최근 세션). sourceRead=false 면 무시 */
    session: string | null;
    /** 이 종목의 현재 다크풀 날짜(원천에 행이 없으면 null) */
    rowDate: string | null;
    now?: number;
};

export type Freshness = {
    /** 사본의 옵션 레벨(가격·맥스페인·벽·풋콜·스퀴즈)을 «현재값»으로 말해도 되는가 */
    levelsFresh: boolean;
    /** 사본의 해석이 지금 보여 주는 다크풀과 같은 날짜 위에서 쓰였는가 */
    basisMatch: boolean;
    /** AI 해석·괴리 표시를 보여 줘도 되는가 = 둘 다 */
    proseFresh: boolean;
    /** 낡은 사본에 붙일 기준일(MM/DD, 사본이 만들어진 뉴욕 날짜) — 신선하면 null */
    levelsAsOf: string | null;
};

/** 원천을 못 읽었을 때만 쓰는 시간 상한 */
export const FALLBACK_MAX_AGE_MS = 36 * 3600 * 1000;

export function seoFreshness(i: FreshnessInput): Freshness {
    const now = i.now ?? Date.now();
    const genMs = Date.parse(i.generatedAt || '');
    const genDay = etDate(i.generatedAt);
    const levelsFresh = i.sourceRead && i.session
        ? !!genDay && genDay >= i.session
        : Number.isFinite(genMs) && now - genMs >= 0 && now - genMs < FALLBACK_MAX_AGE_MS;
    // 원천을 못 읽었으면 비교할 대상이 없다 → 시간 판단(levelsFresh)에 맡긴다
    const basisMatch = i.sourceRead ? (i.payloadDpDate ?? null) === (i.rowDate ?? null) : true;
    return {
        levelsFresh,
        basisMatch,
        proseFresh: levelsFresh && basisMatch,
        levelsAsOf: levelsFresh ? null : mmdd(genDay),
    };
}
