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
