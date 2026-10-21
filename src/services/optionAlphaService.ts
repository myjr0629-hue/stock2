import { getAnalysisCacheForTickers } from '@/services/analysisCache';
import { explainAlphaSnapshot } from '@/services/alphaEngine';
import { type OptionMetrics } from '@/lib/optionMetrics';

/** Prefer the published alphaSnapshot, retaining the response's own alpha on cache misses. */
export async function readOptionAlpha(tickers: string[], metrics: Map<string, OptionMetrics>, fallbacks?: Map<string, any>, availableAnalysis?: Record<string, any>): Promise<Map<string, any>> {
    // 배치는 본 처리에서 확보한 같은 판본을 재사용한다. 다른 호출자의 조회 동작은 유지한다.
    const analysis = availableAnalysis ?? await getAnalysisCacheForTickers(tickers).catch(() => ({} as Record<string, any>));
    return new Map(tickers.map(t => {
        // A cold/missing analysis cache must not erase an alpha already computed for this response.
        const a = analysis[t]?.alphaSnapshot ? analysis[t] : fallbacks?.get(t);
        const m = metrics.get(t);
        return [t, explainAlphaSnapshot(a?.alphaSnapshot, {
            gex: m?.gex ?? null, squeezeScore: m?.squeezeScore ?? null, pcr: m?.pcr ?? null,
            whaleIndex: a?.whaleIndex ?? null, darkPoolPct: a?.darkPoolPct ?? null,
            shortVolPct: a?.shortVolPct ?? null, relVol: a?.relVol ?? null,
        })];
    }));
}
