/** 종목 라우트: 새 응답을 마지막 정상본 위에 덮는다(값이 비면 옛 값 유지). route.ts 에서 분리(10/18, 시험 가능하게). */
/** null 이 «모름»이 아니라 «이번 원천에 값이 없다»는 확정인 필드 — 옛 캐시 값으로 되살리지 않는다(10/18 밤 검토: vwap 95 가 null 을 덮어 괴리율 +15.79%) */
const NULL_IS_AUTHORITATIVE = new Set(['vwap']);
export function mergeFreshOverStale(stale: any, fresh: any): any {
    const out: any = { ...stale };
    for (const [k, v] of Object.entries(fresh || {})) {
        if (v === null && NULL_IS_AUTHORITATIVE.has(k)) { out[k] = null; continue; }
        if (v === null || v === undefined) continue;
        if (Array.isArray(v)) { if (v.length) out[k] = v; continue; }
        if (typeof v === 'object') {
            const inner: any = { ...(stale?.[k] || {}) };
            for (const [k2, v2] of Object.entries(v as any)) {
                if (v2 === null && NULL_IS_AUTHORITATIVE.has(k2)) { inner[k2] = null; continue; }
                if (v2 === null || v2 === undefined) continue;
                if (typeof v2 === 'number' && v2 === 0 && inner[k2]) continue; // 0 은 «없음»일 때가 많다
                inner[k2] = v2;
            }
            out[k] = inner;
            continue;
        }
        if (typeof v === 'number' && v === 0 && stale?.[k]) continue;
        out[k] = v;
    }
    return out;
}
