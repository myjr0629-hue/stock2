/**
 * Flow(앱) 옵션 압박 지수(OPI) — 미결제약정 P/C 에서 만든다. 순수 함수(시험 tests/flowOpi.test.ts).
 *
 * 왜 (2026-10-20 NB1): /api/live/ticker 의 flow.oiPcr 가 null 이면 OPI 상태가 초기값 0 에 머물러 «0.0 · BEARISH» 가 그려지고,
 *   그 0 이 종합 점수(−12.5)·HIGH CONVICTION(opi ≤ 35)·스퀴즈/UOA/0DTE 의 부호(모두 «하방»)까지 끌고 갔다(10/19 장중 SPY).
 *   빈 문자열은 `"" * 50 = 0` 이라 P/C 0 → OPI 95(«강한 상방»)로 둔갑했다.
 *   → 결측은 null(측정 불가)이다. 실측 0(숫자 0)과 구분한다.
 */

/** 측정된 미결제약정 P/C — 유한한 숫자(0 이상)나 숫자 문자열만. 빈 문자열·공백·null·음수·NaN·무한대 = null(결측). 숫자 0 은 0. */
export function measuredOiPcr(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
    if (typeof v === 'string') {
        const s = v.trim();
        if (!s || !/^\d+(\.\d+)?$/.test(s)) return null;
        const n = Number(s);
        return Number.isFinite(n) && n >= 0 ? n : null;
    }
    return null;
}

/** OPI(0~100 눈금, 10~95 로 자름) — 식은 예전 그대로 round(100 − P/C × 50). P/C 결측이면 null. */
export function opiFromOiPcr(v: unknown): number | null {
    const p = measuredOiPcr(v);
    if (p == null) return null;
    return Math.max(10, Math.min(95, Math.round(100 - p * 50)));
}

/** 종합 점수의 OPI 몫(−25~+25). OPI 를 모르면 0 — 종합 점수는 나머지 실측 요인만으로 낸다. */
export function opiScoreOf(opi: number | null): number {
    if (opi == null) return 0;
    return (opi - 50) * 2 * 0.25;
}

/**
 * OPI 방향으로 부호를 받는 요인(스퀴즈·UOA·0DTE 핀) — 예전 식 그대로, OPI 를 모르면 0(방향을 지어내지 않는다).
 *   'squeeze': OPI > 50 이면 +, 아니면 − · 'uoa'·'zdte': OPI < 50 이면 −, 아니면 +
 */
export function opiSigned(opi: number | null, score: number, kind: 'squeeze' | 'uoa' | 'zdte'): number {
    if (opi == null) return 0;
    if (kind === 'squeeze') return (opi - 50) > 0 ? score : -score;
    return (opi - 50) < 0 ? -score : score;
}

/** 확신도 판정의 OPI 극단(≥68·≤35) — OPI 를 모르면 극단이 아니다 */
export function opiExtreme(opi: number | null): boolean {
    return opi != null && (opi >= 68 || opi <= 35);
}

/** 게이지 판정 단어(라벨 그대로) — 모르면 «—» */
export function opiGaugeStatus(opi: number | null): 'BULLISH' | 'NEUTRAL' | 'BEARISH' | '—' {
    if (opi == null) return '—';
    return opi >= 60 ? 'BULLISH' : opi >= 40 ? 'NEUTRAL' : 'BEARISH';
}

/**
 * 한 회차(30초 갱신)의 P/C 읽기 — round = 그 값을 받은 갱신 회차.
 * prev = «직전 정상 저장본»(오늘 합산이 결측으로 거부돼 어제 창 합산을 쓴 것 — basis oi_near_expiries_35d_chain_prev), oiDate = 그 OI 기준일.
 */
export type OiPcrReading = { pcr: number | null; round: number; tier?: number; prev?: boolean; oiDate?: string | null } | null | undefined;
export const OI_PCR_PREV_BASIS = 'oi_near_expiries_35d_chain_prev';
/**
 * 값의 근거 순위(작을수록 먼저) — 운영 결정(10/20) 순서 그대로: 수집 행(정본) 0 → 오늘 체인 합산 1 → 직전 정상 저장본 2 → EOD 35일 3.
 *   live/ticker 의 flow.oiPcrBasis 가 없으면 수집 행 값이다. 모르는 basis 는 맨 뒤(3).
 */
export function oiPcrTier(basis: unknown): number {
    if (basis == null || basis === 'oi_all_expiries_35d') return 0;
    if (basis === 'oi_near_expiries_35d_chain') return 1;
    if (basis === OI_PCR_PREV_BASIS) return 2;
    return 3;
}
/** 마지막 측정값을 «직전 값»으로 들고 있는 최대 회차 수(30초 × 20 ≈ 10분) — 그보다 옛 값은 지금 값처럼 쓰지 않는다 */
export const OI_PCR_KEEP_ROUNDS = 20;
/**
 * 같은 칸(flow·oi-pcr 각각)에 새 응답을 넣을 때 — 늦게 도착한 «이전 회차» 응답이 더 새 회차 값을 덮지 않는다(관문 10200508:
 *   1회차 시세 실패 → 2회차 재시도에서 3.07 → 4초 뒤 1회차 oi-pcr 0.73 도착이 덮어 OPI 10 → 64 로 뒤집혔다).
 */
export function newerReading<T extends { round: number }>(prev: T | null | undefined, next: T): T {
    return prev && prev.round > next.round ? prev : next;
}

/**
 * OPI 입력 고르기 — live/ticker(flow.oiPcr)와 /api/app/oi-pcr 의 «가장 최근 회차» 측정값. 같은 회차면 live/ticker 우선.
 *   예: 1회차 flow 0.73 → 2회차 flow 결측·oi-pcr 대체 3.07 이면 3.07(옛 0.73 이 새 대체값을 막지 않는다 — 관문 10200339 ①).
 *   두 쪽 다 그 회차에 결측이면 직전 측정값(최대 OI_PCR_KEEP_ROUNDS 회차) — 그보다 옛것이면 null.
 */
export function pickOiPcrReading(flow: OiPcrReading, all: OiPcrReading, currentRound: number): NonNullable<OiPcrReading> | null {
    const ok = (r: OiPcrReading) => (r && measuredOiPcr(r.pcr) != null && currentRound - r.round <= OI_PCR_KEEP_ROUNDS ? r : null);
    const f = ok(flow), a = ok(all);
    if (f && a) {
        // 근거 순위가 먼저(관문 10200520 ①·10200529: live/ticker 가 직전 저장본·EOD 를, oi-pcr 가 오늘 합산을 내면 오늘 합산) → 같은 순위면 더 새 회차 → 같으면 live/ticker
        const ft = f.tier ?? (f.prev ? 2 : 0), at = a.tier ?? (a.prev ? 2 : 0);
        if (ft !== at) return ft < at ? f : a;
        return a.round > f.round ? a : f;
    }
    return f ?? a ?? null;
}
export function pickOiPcr(flow: OiPcrReading, all: OiPcrReading, currentRound: number): number | null {
    const r = pickOiPcrReading(flow, all, currentRound);
    return r ? measuredOiPcr(r.pcr) : null;
}
