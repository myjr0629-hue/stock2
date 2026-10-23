import { getAnalysisCacheForTickers } from '@/services/analysisCache';
import { explainAlphaSnapshot } from '@/services/alphaEngine';
import { type OptionMetrics } from '@/lib/optionMetrics';

/** Prefer the published alphaSnapshot, retaining the response's own alpha on cache misses. */
export async function readOptionAlpha(tickers: string[], metrics: Map<string, OptionMetrics>, fallbacks?: Map<string, any>): Promise<Map<string, any>> {
    const analysis = await getAnalysisCacheForTickers(tickers).catch(() => ({} as Record<string, any>));
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
