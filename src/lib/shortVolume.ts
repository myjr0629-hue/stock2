// [2026-10-19 D11] 공매도 칸 한 곳 — live/ticker 출구가 쓴다(라우트 파일은 라우트 외 내보내기를 못 한다).
/**
 * 공매도 칸(shortVolPct·shortVol·shortTotalVol) — 벤더 값이 있으면 그대로, 없으면 FINRA 적재본(darkPoolShortPct 와 같은 보고).
 * shortVol = 보고 수량 × 비중(적재본은 비중과 전체 수량만 싣는다 — 같은 보고의 두 값이라 곱은 원래 공매도 수량이다).
 */
export function shortVolFields(vendor: { percent?: unknown; volume?: unknown } | null | undefined, vendorTotal: unknown,
    finra: { shortPct?: unknown; volume?: unknown; date?: unknown } | null | undefined) {
    const pos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
    const vp = pos(vendor?.percent);
    if (vp != null) return { shortVolPct: vp, shortVol: pos(vendor?.volume), shortTotalVol: pos(vendorTotal), shortVolSource: 'vendor' as const, shortVolDate: null };
    const fp = pos(finra?.shortPct), fv = pos(finra?.volume);
    if (fp != null && fp <= 100) {
        return {
            shortVolPct: fp,
            shortVol: fv != null && fv > 0 ? Math.round((fv * fp) / 100) : null,
            shortTotalVol: fv != null && fv > 0 ? fv : pos(vendorTotal),
            shortVolSource: 'FINRA' as const,
            shortVolDate: typeof finra?.date === 'string' ? finra.date : null,
        };
    }
    return { shortVolPct: null, shortVol: null, shortTotalVol: pos(vendorTotal), shortVolSource: null, shortVolDate: null };
}
