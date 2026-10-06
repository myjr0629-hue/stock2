/**
 * 금리의 «변화»는 bp 로 말한다 (2026-09-29).
 *
 * ⚠️ 매크로 피드의 chgPct 는 «수익률 자체의 상대 %»다 — 5.184% → 5.24% 는 chgPct 1.08.
 *    대시보드가 이걸 단위 없이 «+1.08» 로 그렸고, 독자는 «+1.08%p»(하루 108bp — 있을 수
 *    없는 급등)로 읽었다. 같은 날 재무부 원본은 5.17 → 5.24, +7bp 였다.
 *    수익률 옆의 «+1.08%» 도 같은 오독을 부른다. 업계 관행은 절대 변화의 bp 다.
 *
 * 순수 함수 — 클라이언트 화면과 서버(AI 입력 문구) 양쪽에서 쓴다.
 */

export interface YieldFactorLike {
    level?: number | null;
    /** 절대 변화(%p). 0.07 = 7bp */
    chgAbs?: number | null;
    /** 수익률의 상대 %. chgAbs 가 없을 때만 되돌려 쓴다 */
    chgPct?: number | null;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 전일 대비 변화(정수 bp). 모르면 null — 0 은 «보합»이라는 사실이다. */
export function yieldChangeBp(f: YieldFactorLike | null | undefined): number | null {
    if (!f) return null;
    if (finite(f.chgAbs)) return Math.round(f.chgAbs * 100);
    // chgAbs 가 없으면 chgPct 에서 되돌린다: 전일 = 수준 / (1 + pct/100)
    if (finite(f.level) && finite(f.chgPct) && f.chgPct > -100) {
        return Math.round((f.level - f.level / (1 + f.chgPct / 100)) * 100);
    }
    return null;
}

/**
 * 같은 원본의 두 관측값(오늘·직전 거래일)으로 만든 변화량.
 * 수준과 변화량은 한 원본에서 나와야 한다 — 수준은 재무부, 변화량은 야후 ^TNX 로 섞으면
 * 화면이 암시하는 «전일 값»(수준 − 변화)이 어느 원본에도 없는 수가 된다.
 */
export function changeFromPrev(level: number | null | undefined, prev: number | null | undefined): { chgAbs: number; chgPct: number } | null {
    if (!finite(level) || !finite(prev) || prev <= 0) return null;
    const abs = level - prev;
    return {
        chgAbs: Math.round(abs * 1000) / 1000,
        chgPct: Math.round((abs / prev) * 1_000_000) / 10_000,
    };
}

/** «+7bp» · «-3bp» · «0bp». 모르면 «—». */
export function fmtBp(bp: number | null | undefined): string {
    if (!finite(bp)) return '—';
    const r = Math.round(bp);
    return `${r > 0 ? '+' : ''}${r}bp`;
}

/**
 * 2s10s 는 «화면의 10Y 와 같은 세션»인지와 함께 다룬다 (2026-10-06).
 *
 * ⚠️ 10/5(월) 16:15 ET 앱 대시보드 실측: «US 10Y 5.31% +3bp» 옆에 «2s10s +45bp».
 *    10Y 는 야후 ^TNX 10/5 종가(5.311 — 10/2 종가 5.277 대비 +3bp), 2s10s 는 재무부 곡선의
 *    10/2 행(5.28 − 4.83 = 45bp)이었다. 재무부 10/5 행은 5.31 − 4.84 = **47bp**.
 *    곡선은 하루 한 번(≈16:00 ET) 게시되고 ^TNX 는 장중에 움직인다 — 게시 전(장중 내내 +
 *    마감 직후)엔 두 숫자의 세션이 다를 수밖에 없다. 같은 세션의 실시간 2년물 원천은 없다
 *    (야후 2YY=F 는 9월물 4.42 에 멈춰 있다 — 10/6 확인).
 *
 * 규칙: 스프레드는 언제나 «한 곡선 행» 안에서 만든다(10Y·2Y 같은 날 — 8/30 0.52 사고).
 *       그 행의 날짜가 화면 10Y 의 세션과 다르면 숨기지 않고 그 날짜를 단다(칸 유지 + 시각 표식).
 */
export interface CurveRowLike {
    us2y?: number | null;
    us10y?: number | null;
    spread2s10s?: number | null;
    /** 곡선 관측일 YYYY-MM-DD */
    date?: string | null;
}

export interface SpreadPairing {
    /** 같은 행의 10Y − 2Y, 정수 bp. 모르면 null */
    bp: number | null;
    /** 곡선 관측일 = 화면 10Y 의 세션일 */
    sameSession: boolean;
    /** 세션이 다르거나 10Y 세션을 모를 때의 곡선 관측일 — 화면이 «10/2»로 단다. 같으면 null */
    asOf: string | null;
}

/** 같은 행의 10Y − 2Y → 정수 bp. 두 수준이 있으면 그것으로(재무부 원본은 소수 둘째 자리), 없으면 행의 spread2s10s. */
export function curveSpreadBp(row: CurveRowLike | null | undefined): number | null {
    if (!row) return null;
    if (finite(row.us10y) && finite(row.us2y)) return Math.round((row.us10y - row.us2y) * 100);
    if (finite(row.spread2s10s)) return Math.round(row.spread2s10s * 100);
    return null;
}

/**
 * @param headlineSessionDate 화면에 그린 10Y 의 세션일(YYYY-MM-DD) — 곡선이 헤드라인이면 곡선 날짜,
 *   ^TNX 면 그 체결 시각의 ET 날짜. 모르면 null → «같은 세션»이라고 말하지 않는다(날짜를 단다).
 */
export function pairSpreadWith10y(row: CurveRowLike | null | undefined, headlineSessionDate: string | null | undefined): SpreadPairing {
    const bp = curveSpreadBp(row);
    const date = row?.date || null;
    const sameSession = !!(date && headlineSessionDate && date === headlineSessionDate);
    return { bp, sameSession, asOf: sameSession ? null : date };
}

/**
 * 방금 받은 곡선(fresh)과 직전에 쓰던 곡선(prev) 중 관측일이 더 새로운 쪽. 같으면 fresh.
 * 날짜 없는 곡선은 날짜 있는 곡선을 못 이긴다.
 *
 * ⚠️ 10/5 마감 뒤 운영 로그: 곡선 원천이 요청마다 갈렸다(FMP 10/5 · EC2 Redis 10/2 · FRED 10/1).
 *    FMP 가 10/5 를 준 16:10 ET 뒤에도 19:44 ET 까지 10/2·10/1 곡선으로 다시 만든 스냅숏이 섞여
 *    2s10s 가 45·46·47bp 를 오갔다. 한 번 본 새 곡선을 낡은 원천이 덮지 못하게 한다.
 * @param notAfter prev 가 이 날짜(ET 오늘)보다 «미래»면 믿지 않는다 — 한 번 이기면 계속 이기므로.
 */
export function fresherCurve<T extends { date?: string | null }>(fresh: T | null | undefined, prev: T | null | undefined, notAfter?: string): T | null {
    const p = prev && (!notAfter || !prev.date || prev.date <= notAfter) ? prev : null;
    if (!fresh) return p;
    if (!p) return fresh;
    return (p.date || '') > (fresh.date || '') ? p : fresh;
}
