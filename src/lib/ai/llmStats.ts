/**
 * 호출 기록(llm:calls:{시각}) 집계 — «변경 전/후» 비교용 지표를 한 번에 낸다 (순수 함수).
 * 지표: 응답 시간 p50·p95, 오류·전환 비율, 가드 통과율, 출력 길이, 호출당 토큰·비용.
 */
import type { CallRecord } from '@/lib/ai/llmLadder';

export interface ProviderStats {
    n: number;
    p50Ms: number | null;
    p95Ms: number | null;
    avgMs: number | null;
    avgInTok: number | null;
    avgOutTok: number | null;
    avgChars: number | null;
    avgCostUsd: number | null;
    totalCostUsd: number;
    totalCreditUsd: number;
    /** 가드가 있는 응답 중 통과 비율(없으면 null) */
    guardPass: number | null;
    guardN: number;
}

export interface PurposeStats {
    purpose: string;
    n: number;
    /** 예외 없이 사용자에게 답이 간 비율 */
    okRate: number;
    /** 첫 단에서 끝나지 않고 다음 단으로 «넘어간» 호출 비율 */
    transitionRate: number;
    /** 전환 사유 집계 — 예: {'a55:rate': 3, 'b55i:access': 12} */
    reasons: Record<string, number>;
    byProvider: Record<string, ProviderStats>;
}

const nearestRank = (sorted: number[], p: number): number | null => {
    if (!sorted.length) return null;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[idx];
};
const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (x: number | null): number | null => (x == null ? null : Math.round(x * 10) / 10);
const r6 = (x: number | null): number | null => (x == null ? null : Math.round(x * 1e6) / 1e6);

export function summarizeCalls(records: CallRecord[]): PurposeStats[] {
    const byPurpose = new Map<string, CallRecord[]>();
    for (const r of records) {
        if (!r || typeof r.p !== 'string') continue;
        (byPurpose.get(r.p) || byPurpose.set(r.p, []).get(r.p)!).push(r);
    }
    const out: PurposeStats[] = [];
    for (const [purpose, rs] of byPurpose) {
        const reasons: Record<string, number> = {};
        let transitions = 0, oks = 0;
        for (const r of rs) {
            if (r.ok) oks++;
            const steps = String(r.tr || '').split(',').filter(Boolean);
            // 마지막 단계(응답한 단) 앞에 실패 기록이 있으면 «전환»
            if (steps.length > 1) {
                transitions++;
                for (const s of steps.slice(0, -1)) reasons[s] = (reasons[s] || 0) + 1;
            }
        }
        const byProvider: Record<string, ProviderStats> = {};
        const groups = new Map<string, CallRecord[]>();
        for (const r of rs) (groups.get(r.v) || groups.set(r.v, []).get(r.v)!).push(r);
        for (const [v, g] of groups) {
            const lat = g.map((x) => x.ms).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
            const gs = g.filter((x) => x.g === 0 || x.g === 1);
            byProvider[v] = {
                n: g.length,
                p50Ms: nearestRank(lat, 0.5), p95Ms: nearestRank(lat, 0.95), avgMs: r1(avg(lat)),
                avgInTok: r1(avg(g.map((x) => x.i).filter((x): x is number => typeof x === 'number'))),
                avgOutTok: r1(avg(g.map((x) => x.o).filter((x): x is number => typeof x === 'number'))),
                avgChars: r1(avg(g.map((x) => x.ch))),
                avgCostUsd: r6(avg(g.map((x) => x.c))),
                totalCostUsd: r6(g.reduce((a, x) => a + (x.c || 0), 0)) ?? 0,
                totalCreditUsd: r6(g.reduce((a, x) => a + (x.ca || 0), 0)) ?? 0,
                guardPass: gs.length ? Math.round((gs.filter((x) => x.g === 1).length / gs.length) * 1000) / 1000 : null,
                guardN: gs.length,
            };
        }
        out.push({
            purpose, n: rs.length,
            okRate: Math.round((oks / rs.length) * 1000) / 1000,
            transitionRate: Math.round((transitions / rs.length) * 1000) / 1000,
            reasons, byProvider,
        });
    }
    return out.sort((a, b) => b.n - a.n);
}
