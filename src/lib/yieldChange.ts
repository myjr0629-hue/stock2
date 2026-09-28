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
