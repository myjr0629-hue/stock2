// ============================================================================
// 앱 Flow 화면 — «끝없는 스켈레톤·맨 빈칸» 대신 끝나는 상태  [2026-10-04]
//
// 발단(10/4 06시 홍보 회차): GLD «옵션 플로우» 화면을 찍는 도구가 39분을 기다렸다(스켈레톤 4·숫자 0).
//   ① 첫 응답(/api/live/ticker)에 시간 상한이 없었다 — 서버가 답을 못 만들면 스켈레톤이 끝없이 돈다
//      (실패하면 «데이터 재연결 중» 카드로 끝나지만, «안 오는» 응답은 아무도 끊지 않았다).
//   ② ETF 다수(GLD·IWM·XLF·ARKK — 10/4 실측)는 ±15% 안에 감마 전환이 없다(구조 gammaFlipType ALL_LONG,
//      검증 HIGH). 위 칸(LevelValue)은 «범위 밖»인데 아래 GEX 레짐 칸·감마 위치·OPI 감마 칸은 맨 «—»/«--»,
//      감마 위치는 플립이 없는데도 «감마 플립 아래»로 그렸다. 캡처 검수(GAMMA FLIP —)도 여기서 떨어졌다.
//   ③ IV 랭크는 signum-gex-history 이력(수집 Lambda GEX_TICKERS 100종목)에서만 나온다. 목록 밖 종목
//      (GLD·SLV·TLT·XLF·SMH·ARKK …)은 이력 0건(_source «dynamodb-insufficient»)이라 늘 «—» 였다 —
//      실패가 아니라 «이 종목은 제공되지 않음»이므로 그렇게 쓴다(시간 초과·오류는 그대로 «—»).
// ============================================================================

/** 첫 바이트(응답 헤더)까지의 상한. 계산 경로 실측 1~6초(10/4, ETF·개별 13종목) — 넉넉히 20초. */
export const FLOW_TICKER_TTFB_MS = 20_000;
/** 첫 응답이 실패·시간 초과일 때 30초 주기를 기다리지 않고 다시 부르는 횟수·간격. */
export const FLOW_QUICK_RETRIES = 2;
export const FLOW_QUICK_RETRY_MS = 3_000;

type Loc = 'ko' | 'en' | 'ja';
const locOf = (l?: string | null): Loc => (l === 'ko' || l === 'ja' ? l : 'en');

const NOT_PROVIDED: Record<Loc, string> = { ko: '미제공', en: 'N/A', ja: '未提供' };
const OUT_OF_RANGE: Record<Loc, string> = { ko: '범위 밖', en: 'Out of range', ja: '範囲外' };

/** «이 종목은 원천에 값이 없다» — 작은 칸 하나에 들어가는 글자. */
export function notProvidedText(locale?: string | null): string {
    return NOT_PROVIDED[locOf(locale)];
}

/**
 * /api/flow/iv-percentile 응답이 «이 종목은 IV 이력이 없다»인가.
 *   이력 부족(_source dynamodb-insufficient · dynamodb-insufficient-iv)만 참 — 실패·시간 초과(응답 없음)·오류는 거짓
 *   (그건 «미제공»이 아니라 «이번엔 못 받음»이다).
 */
export function ivHistoryUnavailable(resp: unknown): boolean {
    if (!resp || typeof resp !== 'object') return false;
    const r = resp as { percentile?: unknown; _source?: unknown };
    return r.percentile == null && typeof r._source === 'string' && r._source.startsWith('dynamodb-insufficient');
}

/**
 * 감마 플립 «값이 없는» 칸의 글자 — 위 칸(LevelValue)과 같은 판정(levelCellState)을 받는다.
 *   'outOfRange'(판본은 있는데 ±15% 안에 전환 없음) → «범위 밖» · 그 밖(판본 없음) → 화면이 쓰던 빈칸 글자.
 *   글자는 optionLevelGate 의 OUT_OF_RANGE_TEXT 와 같다(시험이 대조한다).
 */
export function gammaPlaceholder(state: 'value' | 'outOfRange' | 'none', locale: string | null | undefined, dash: string): string {
    return state === 'outOfRange' ? OUT_OF_RANGE[locOf(locale)] : dash;
}

/**
 * 첫 바이트까지 시간 상한이 있는 fetch. 상한 안에 헤더가 오면 타이머를 풀고 본문은 끝까지 받는다
 *   — 느린 휴대폰 망에서 큰 응답(GLD 415KB·QQQ 512KB)을 «받는 중»에 끊지 않는다. 서버가 답을 못 만드는 것만 끊는다.
 */
export async function fetchWithTtfbLimit(
    url: string,
    ms: number,
    init: RequestInit = {},
    fetchImpl: typeof fetch = fetch,
): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
        return await fetchImpl(url, { ...init, signal: ctl.signal });
    } finally {
        clearTimeout(timer);
    }
}

// ============================================================================
// 감마 레짐(롱/숏) — 플립이 «없을 때»도 맞게  [2026-10-04 후속]
//   GEX 레짐 미리보기·배지는 `현재가 >= 플립`으로만 롱/숏을 갈랐다. 플립이 없으면(0) 늘 참 → 늘 «LONG GAMMA».
//   ±15% 안 전 구간이 숏감마인 종목(ALL_SHORT)이면 정반대 문구다. /api/live/ticker 가 이제 판정 유형
//   flow.gammaFlipType(EXACT·ALL_LONG·ALL_SHORT·NO_DATA — 정의는 optionLevelGate.levelsAt)을 싣는다. 그것을 따른다.
// ============================================================================

export type GammaRegimeKind = 'long' | 'short' | 'unknown';

/** 플립이 있으면 현재가와 비교(위 = 롱), 없으면 판정 유형(ALL_LONG/ALL_SHORT). 그 밖(NO_DATA·응답 없음·가격 없음)은 unknown. */
export function gammaRegimeOf(price: number | null | undefined, flip: number | null | undefined, flipType: unknown): GammaRegimeKind {
    const f = Number(flip);
    const p = Number(price);
    if (Number.isFinite(f) && f > 0) {
        if (!(Number.isFinite(p) && p > 0)) return 'unknown';
        return p >= f ? 'long' : 'short';
    }
    if (flipType === 'ALL_LONG') return 'long';
    if (flipType === 'ALL_SHORT') return 'short';
    return 'unknown';
}

const NO_FLIP_REGIME: Record<Loc, { long: string; short: string }> = {
    ko: { long: 'LONG GAMMA (전 구간)', short: 'SHORT GAMMA (전 구간)' },
    en: { long: 'LONG GAMMA (NO FLIP)', short: 'SHORT GAMMA (NO FLIP)' },
    ja: { long: 'LONG GAMMA (全域)', short: 'SHORT GAMMA (全域)' },
};
const NO_FLIP_POSITION: Record<Loc, { long: string; short: string }> = {
    ko: { long: '전 구간 롱감마', short: '전 구간 숏감마' },
    en: { long: 'All long gamma', short: 'All short gamma' },
    ja: { long: '全域ロングガンマ', short: '全域ショートガンマ' },
};

/**
 * 플립이 없는 종목의 레짐 글자. kind 가 long/short 면 «전 구간» 문구, unknown 이면
 *   판정 유형 NO_DATA(감마 없음) → «미제공» · 그 밖(응답 없음) → dash.
 *   style 'regime' = 미리보기·배지(LONG GAMMA …) · 'position' = 감마 위치 칸(전 구간 롱감마 …).
 */
export function noFlipRegimeText(kind: GammaRegimeKind, flipType: unknown, locale: string | null | undefined, dash: string, style: 'regime' | 'position' = 'regime'): string {
    const loc = locOf(locale);
    if (kind === 'long' || kind === 'short') return (style === 'regime' ? NO_FLIP_REGIME : NO_FLIP_POSITION)[loc][kind];
    return flipType === 'NO_DATA' ? NOT_PROVIDED[loc] : dash;
}
