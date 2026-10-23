import { getAnalysisCacheForTickers } from '@/services/analysisCache';
import { calculateAlphaScore, explainAlphaSnapshot } from '@/services/alphaEngine';
import { type OptionMetrics } from '@/lib/optionMetrics';
import { mgetFromCache } from '@/services/redisClient';
import { ensureXsScores, xsSnapshotOverride } from '@/services/xsScores';
import { shownRegularSessionDate } from '@/lib/marketCalendar';
import { alphaRegularQuote, alphaSessionVwap, alphaMacroInputs } from '@/lib/alphaEvidence';

/** Prefer the published alphaSnapshot, retaining the response's own alpha on cache misses. */
export async function readOptionAlpha(tickers: string[], metrics: Map<string, OptionMetrics>, fallbacks?: Map<string, any>): Promise<Map<string, any>> {
    if (!tickers.length) return new Map();
    tickers = [...new Set(tickers.map(t => t.toUpperCase()))];
    const analysis = await getAnalysisCacheForTickers(tickers).catch(() => ({} as Record<string, any>));
    if (!Object.keys(analysis).length) await ensureXsScores();
    const now = Date.now(), date = shownRegularSessionDate(now);
    // Read stored inputs once for every consumer. No provider calls, refresh, or cache writes.
    const perTicker = tickers.flatMap(t => [`flow:ticker:v6:${t}`, `flow:ticker:nochain:v6:${t}`,
        `chart:v5:${t}:1d`, `vwap:minutes:${t}:${date}`]);
    const rows = await mgetFromCache<any>([...perTicker, 'macro:snapshot:v5', 'yahoo:vix', 'yahoo:vix3m',
        'flow:ticker:v6:QQQ', 'flow:ticker:nochain:v6:QQQ']).catch(() => []);
    const macro = alphaMacroInputs(rows[perTicker.length]?.data, rows[perTicker.length + 1], rows[perTicker.length + 2]);
    const qqq = rows.slice(perTicker.length + 3).map(q => alphaRegularQuote(q, now)).find(Boolean);
    if (macro.ndxChangePct === null && qqq) macro.ndxChangePct = qqq.changePct;
    return new Map(tickers.map((t, i) => {
        // A cold/missing analysis cache must not erase an alpha already computed for this response.
        const a = analysis[t]?.alphaSnapshot ? analysis[t] : fallbacks?.get(t);
        const m = metrics.get(t);
        const quotes = rows.slice(i * 4, i * 4 + 2).filter(q => alphaRegularQuote(q, now)
            && Number(q.tsServer) > 0 && Number(q.tsServer) <= now);
        quotes.sort((a, b) => Number(b.tsServer) - Number(a.tsServer));
        const quote = quotes[0];
        const savedQuote = a?.alphaQuote ?? fallbacks?.get(t)?.alphaQuote;
        const savedValid = savedQuote?.sessionDate === date
            && typeof savedQuote.price === 'number' && Number.isFinite(savedQuote.price) && savedQuote.price > 0
            && typeof savedQuote.prevClose === 'number' && Number.isFinite(savedQuote.prevClose) && savedQuote.prevClose > 0
            && typeof savedQuote.changePct === 'number' && Number.isFinite(savedQuote.changePct)
            && savedQuote.observedAt > 0 && savedQuote.observedAt <= now;
        const regular = alphaRegularQuote(quote, now) ?? (savedValid ? {
            price: savedQuote.price, prevClose: savedQuote.prevClose,
            changePct: (savedQuote.price - savedQuote.prevClose) / savedQuote.prevClose * 100, sessionDate: date,
        } : null);
        const vwap = alphaSessionVwap(quote, rows[i * 4 + 2], rows[i * 4 + 3], now)
            ?? (savedValid && typeof a?.vwap === 'number' && a.vwap > 0 ? a.vwap : null);
        const input = {
            gex: m?.gex ?? null, squeezeScore: m?.squeezeScore ?? null, pcr: m?.pcr ?? null,
            whaleIndex: a?.whaleIndex ?? null, darkPoolPct: a?.darkPoolPct ?? null,
            shortVolPct: a?.shortVolPct ?? null, relVol: a?.relVol ?? null,
        };
        let snapshot = a?.alphaSnapshot;
        if (snapshot && regular) {
            const result = calculateAlphaScore({ ticker: t, session: 'REG', ...regular, ...input, ...macro,
                vwap, rsi14: a?.rsi ?? null, return3D: a?.return3d ?? null,
                callWall: a?.callWall ?? null, putFloor: a?.putFloor ?? null,
                gammaFlipLevel: a?.gammaFlipLevel ?? null, atmIv: a?.iv ?? null,
                ivSkew: a?.ivSkew != null && Math.abs(a.ivSkew) <= 2 ? a.ivSkew : null,
                netFlow: a?.netPremium ?? null, blockTrades: null,
            });
            // XS owns the published score; V8 pillars are diagnostics, rebuilt from the regular session.
            snapshot = { ...snapshot, pillars: result.pillars, dataCompleteness: result.dataCompleteness,
                evidenceAsOf: new Date(Number(quote?.tsServer ?? savedQuote.observedAt)).toISOString(), evidenceSession: date,
                evidenceInputs: { ...regular, ...input, ...macro, vwap, blockTrades: null } };
        }
        return [t, explainAlphaSnapshot(snapshot ? xsSnapshotOverride(t, snapshot) : null, input)];
    }));
}
