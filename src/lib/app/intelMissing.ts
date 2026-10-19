/**
 * 시세 한 줄의 «결측 표식»(missingFields) — 2026-10-19 무결성 3차 N2·N3 좁힌 수리 · 순수 함수(tests/intelZeroNarrow.test.ts)
 *
 * 왜: 생산자(/api/intel/fast · watchlist/batch · quoteFromBatchResult)는 못 잰 칸을 0 으로 채운다. 그 0 이 «실제 0»인지
 *   «결측을 채운 0»인지 구분이 없어 Intel 화면이 0 을 통째로 무시했다(최신 실제 0 → 이전 값으로 되돌림 · 섹터 평균에서 0 제외).
 *   값 모양(0)은 그대로 두고 «못 잰 칸 이름»만 덧붙인다 — 표식을 읽지 않는 기존 소비자는 예전과 같다.
 *
 * 판단 기준(결측):
 *   ① 응답 항목의 missingFields 에 그 칸 이름이 있다, 또는 ② 값이 숫자가 아니다(null·undefined·NaN), 또는 ③ 가격 칸이 0 이하.
 *   결측이면 Intel 화면 행은 null(«—»)이고 이전 행 값(스냅샷·직전 병합)으로 메우지 않는다. 평균에서도 뺀다.
 *   표식이 없는 유한수 0 은 «실제 0» — 그대로 쓰고 평균에도 넣는다.
 */
export type IntelMissingField = 'price' | 'changePct' | 'alphaScore' | 'netPremium' | 'squeezeScore';

type WithMissing = { missingFields?: readonly string[] | null } & Record<string, any>;

export function isFieldMissing(q: WithMissing | null | undefined, field: IntelMissingField): boolean {
    if (!q) return true;
    if (Array.isArray(q.missingFields) && q.missingFields.includes(field)) return true;
    const v = q[field];
    if (typeof v !== 'number' || !Number.isFinite(v)) return true;
    return field === 'price' && v <= 0;
}

/** 최신 시세의 그 칸 → 화면 값. 결측이면 null(이전 값으로 메우지 않는다), 실제 0 은 0 */
export function measuredOrNull(q: WithMissing | null | undefined, field: IntelMissingField): number | null {
    return isFieldMissing(q, field) ? null : (q as WithMissing)[field] as number;
}

/** 표식 목록에서 한 칸을 켜거나 끈다 — 빈 목록이면 undefined(필드 자체를 싣지 않는다) */
export function setMissingField<F extends string>(list: readonly F[] | null | undefined, field: F, missing: boolean): F[] | undefined {
    const next = (list || []).filter((f) => f !== field);
    if (missing) next.push(field);
    return next.length ? next : undefined;
}

/** 두 표식 목록이 같은가(순서 무시) — 값이 같아도 표식이 바뀌면 다시 그려야 한다 */
export function sameMissingFields(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean {
    const x = a || [];
    const y = b || [];
    return x.length === y.length && x.every((f) => y.includes(f));
}

/** 잰 값만의 평균 — 실제 0 포함, 결측(null·NaN) 제외. 잰 값이 하나도 없으면 null(«—») */
export function averageMeasured(values: ReadonlyArray<number | null | undefined>): number | null {
    const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
}

/** 메모 키용 짧은 지문 */
export function missingSignature(q: WithMissing | null | undefined): string {
    return Array.isArray(q?.missingFields) ? [...q!.missingFields].sort().join(',') : '';
}
