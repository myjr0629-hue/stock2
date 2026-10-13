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

// ============================================================================
// 검색 표면 «최근가» — 순수 함수(시험: tests/seoPrice.test.ts)
//
// 사고(10/13): 웹 /flow/NVDA 가 마감 뒤(월요일 22:00 ET)에 «최근가 $229.28 … 맥스페인보다 4.2% 위»라고 말했다. 실제 월요일 종가는 $226.32,
//   $229.28 은 금요일 종가였다. 페이로드(UC 사본)는 월요일 09:35 ET(정규장 5분 차)에 만들어졌고, 옵션 레벨의 «판본 게이트»(levelsFresh =
//   만든 날의 거래일이 최신 세션 이상)는 통과했지만 가격은 «만든 순간의 값»이라 12시간 뒤에도 같은 값이 «최근가»로 남았다.
//   레벨은 월요일 EOD 체인인데 가격은 월요일 아침 값 — 같은 문장 안에서 두 시각이 섞였다.
// 규칙: «최근가» = 마지막으로 끝난 정규장의 종가(레벨의 체인 날짜와 같은 세션).
//   ① 이미 적재된 EOD 행(벌크 + 세션종가 병합 — API 콜 0)의 날짜가 그 세션이면 그 종가
//   ② 아니면 사본이 그 세션 정규장 마감(16:00 ET) «뒤»에 만들어졌을 때만 사본의 가격
//   ③ 아니면 null — 틀린 숫자를 말하느니 숫자 없이 말한다(페이지는 price 가 null 인 문장 경로가 이미 있다)
// ============================================================================

/** ET 달력 날짜의 h:m 시각(ms) — 일광절약을 Intl 로 맞춘다 */
export function etAtMs(ymd: string, h: number, m = 0): number | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
    const guess = Date.parse(`${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
    let ms = guess;
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    for (let i = 0; i < 2; i++) {
        const p: Record<string, string> = {};
        for (const x of fmt.formatToParts(new Date(ms))) p[x.type] = x.value;
        const wall = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
        ms += guess - wall;
    }
    return ms;
}
/** ET 달력 날짜의 16:00(정규장 마감) 시각(ms) */
export const etCloseMs = (ymd: string): number | null => etAtMs(ymd, 16, 0);

export type SeoPriceInput = {
    /** UC 사본의 가격(만든 순간의 값) */
    payloadPrice: number | null | undefined;
    /** 사본이 만들어진 시각 */
    generatedAt: string | null | undefined;
    /** 지금 «마지막으로 끝난» 정규장 날짜(marketCalendar.etLastClosedSessionDate) */
    lastClosed: string;
    /** 적재된 EOD 행(없으면 null) */
    eod: { date: string; close: number } | null | undefined;
    /** 지금(ms) — 정규장 중 «방금 만든 사본»의 가격을 살리는 데 쓴다. 생략하면 Date.now() */
    now?: number;
    /** 지금이 정규장 중인가(거래일 09:30~16:00 ET) */
    regularNow?: boolean;
};

/** 정규장 중 사본의 가격을 «지금가»로 받아들이는 최대 나이 */
export const SEO_LIVE_MAX_AGE_MS = 30 * 60 * 1000;

export function seoPrice(i: SeoPriceInput): number | null {
    const p = Number(i.payloadPrice);
    const payloadOk = Number.isFinite(p) && p > 0;
    const gen = Date.parse(i.generatedAt || '');
    const now = i.now ?? Date.now();
    // 정규장 중에 방금(30분 안) 만든 사본의 가격은 지금가다 — 전일 종가로 덮지 않는다
    if (payloadOk && i.regularNow && Number.isFinite(gen) && gen <= now + 60e3 && now - gen <= SEO_LIVE_MAX_AGE_MS) return p;
    if (i.eod && i.eod.date === i.lastClosed && Number.isFinite(i.eod.close) && i.eod.close > 0) return i.eod.close;
    if (!payloadOk) return null;
    const close = etCloseMs(i.lastClosed);
    return Number.isFinite(gen) && close != null && gen >= close ? p : null;
}
