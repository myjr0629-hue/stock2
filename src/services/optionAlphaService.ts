import { getAnalysisCacheForTickers } from '@/services/analysisCache';
import { explainAlphaSnapshot } from '@/services/alphaEngine';
import { type OptionMetrics } from '@/lib/optionMetrics';

/** Same published alphaSnapshot for batch, live/ticker and Command, including cache hits. */
export async function readOptionAlpha(tickers: string[], metrics: Map<string, OptionMetrics>): Promise<Map<string, any>> {
    const analysis = await getAnalysisCacheForTickers(tickers).catch(() => ({} as Record<string, any>));
    return new Map(tickers.map(t => {
        const a = analysis[t];
        const m = metrics.get(t);
        return [t, explainAlphaSnapshot(a?.alphaSnapshot, {
            gex: m?.gex ?? null, squeezeScore: m?.squeezeScore ?? null, pcr: m?.pcr ?? null,
            whaleIndex: a?.whaleIndex ?? null, darkPoolPct: a?.darkPoolPct ?? null,
            shortVolPct: a?.shortVolPct ?? null, relVol: a?.relVol ?? null,
        })];
    }));
}
