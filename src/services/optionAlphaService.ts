import { getAnalysisCacheForTickers } from '@/services/analysisCache';
import { readLastKnownAnalysis } from '@/services/lastKnownAlpha';
import { explainAlphaSnapshot } from '@/services/alphaEngine';
import { type OptionMetrics } from '@/lib/optionMetrics';

/** Prefer the published alphaSnapshot, retaining the response's own alpha on cache misses. */
export async function readOptionAlpha(tickers: string[], metrics: Map<string, OptionMetrics>, fallbacks?: Map<string, any>): Promise<Map<string, any>> {
    const analysis = await getAnalysisCacheForTickers(tickers).catch(() => ({} as Record<string, any>));
    // ★ [2026-10-24 알파 0점] 분석 캐시는 04~20 ET 엔 15분 지난 행을 버리고, 워치리스트 price·ssr 캐시 미스 경로는 알파를 안 싣는다
    //   → 둘 다 없으면 «마지막 분석 행»(XS 게시본 덮음 · 4일 이내)으로 — 인텔 fast·fast-all 덮기와 같은 출처(services/lastKnownAlpha).
    const cold = tickers.filter(t => !analysis[t]?.alphaSnapshot && !fallbacks?.get(t)?.alphaSnapshot);
    const last = cold.length ? await readLastKnownAnalysis(cold).catch(() => new Map<string, any>()) : new Map<string, any>();
    return new Map(tickers.map(t => {
        // A cold/missing analysis cache must not erase an alpha already computed for this response.
        const a = analysis[t]?.alphaSnapshot ? analysis[t]
            : fallbacks?.get(t)?.alphaSnapshot ? fallbacks.get(t)
            : last.get(String(t).toUpperCase()) ?? fallbacks?.get(t);
        const m = metrics.get(t);
        return [t, explainAlphaSnapshot(a?.alphaSnapshot, {
            gex: m?.gex ?? null, squeezeScore: m?.squeezeScore ?? null, pcr: m?.pcr ?? null,
            whaleIndex: a?.whaleIndex ?? null, darkPoolPct: a?.darkPoolPct ?? null,
            shortVolPct: a?.shortVolPct ?? null, relVol: a?.relVol ?? null,
        })];
    }));
}
